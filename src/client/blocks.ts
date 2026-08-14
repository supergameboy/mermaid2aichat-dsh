/**
 * 对话 Mermaid 代码块源 — AI→编辑器通道的读取端。
 *
 * 一个裸可观测源（getSnapshot + subscribe），跟随当前会话：
 * - 订阅 ctx.sessions.list，跟踪 current 会话切换
 * - 订阅当前会话的 ConversationSnapshot，扫描已完成消息中的 ```mermaid 代码块
 * - 代码块集合变化时发布新快照（内容不变时引用不变）
 *
 * 经注册 inject 的 hooks 仓交给渲染层，组件侧成为 useBlocks() 选择器钩子。
 */

/** 一个从对话中提取的 Mermaid 代码块（纯 JSON 数据）。 */
export interface MermaidBlockView {
  /** 稳定键：消息 seq + 消息内出现次序。 */
  key: string
  /** 来源消息 seq。 */
  seq: number
  /** 消息时间（Unix 毫秒）。 */
  time: number
  /** 首行预览（去 ``` 行，截断 60 字符）。 */
  preview: string
  /** 完整代码（不含围栏）。 */
  code: string
  /** 是否来自 AI 的 mermaid_load 工具调用（这类块会被面板自动导入）。 */
  fromTool?: boolean
}

/** 最小面：会话列表快照。 */
interface SessionListSnapshot {
  current?: string
}

/** 最小面：助手消息块。 */
interface AssistantBlock {
  kind: string
  text?: string
  /** 工具调用块：工具名与原始参数字符串。 */
  name?: string
  argsRaw?: string
}

/** 最小面：非助手消息的内容块（user/steering/context 共形）。 */
interface ContentBlock {
  type: string
  text?: string
}

/** 最小面：对话节点。 */
interface ConversationNode {
  kind: string
  seq: number
  time: number
  blocks?: readonly AssistantBlock[]
  content?: readonly ContentBlock[]
}

/** 最小面：会话快照。 */
interface ConversationSnapshot {
  nodes: readonly ConversationNode[]
  /** 进行中的助手输出（工具调用块在调用发生时即可见）。 */
  partial?: { turn: number; blocks?: readonly AssistantBlock[] } | null
}

/** 最小面：会话绑定。 */
interface SessionBinding {
  session: {
    getSnapshot(): ConversationSnapshot
    subscribe(fn: () => void): () => void
  }
}

/** 最小面：会话服务。 */
interface SessionsFace {
  list: {
    getSnapshot(): SessionListSnapshot
    subscribe(fn: () => void): () => void
  }
  binding(id: string): SessionBinding | undefined
}

const EMPTY: readonly MermaidBlockView[] = []

/** 从文本中提取全部 ```mermaid 围栏代码块（保持出现顺序）。 */
export function extractMermaidBlocks(text: string): { code: string; preview: string }[] {
  const out: { code: string; preview: string }[] = []
  const fence = /```mermaid\s*\r?\n([\s\S]*?)```/g
  let match = fence.exec(text)
  while (match !== null) {
    const code = match[1].replace(/\s+$/, '')
    const first = code.split('\n').find((line) => line.trim() !== '') ?? ''
    out.push({ code, preview: first.length > 60 ? `${first.slice(0, 57)}…` : first })
    match = fence.exec(text)
  }
  return out
}

/**
 * 扫描快照中的全部代码块。覆盖：
 * - 助手/用户/steering/context 消息中的 ```mermaid 围栏（键 = seq:index）
 * - mermaid_load 工具调用块（含进行中的 partial 流）：读取调用参数里的 code，
 *   键 = tool:hash(code)——partial 与最终消息里的同一调用按内容去重，标记 fromTool
 */
export function scanBlocks(snapshot: ConversationSnapshot): MermaidBlockView[] {
  const out: MermaidBlockView[] = []
  const seenToolKeys = new Set<string>()
  const pushToolBlock = (block: AssistantBlock, seq: number, time: number): void => {
    const args = parseToolArgs(block.argsRaw)
    if (args.code === undefined) return
    const found = extractMermaidBlocks(`\`\`\`mermaid\n${args.code}\n\`\`\``)[0]
    if (found === undefined) return
    const key = `tool:${hashCode(found.code)}`
    if (seenToolKeys.has(key)) return
    seenToolKeys.add(key)
    out.push({ key, seq, time, preview: found.preview, code: found.code, fromTool: true })
  }
  for (const node of snapshot.nodes) {
    let index = 0
    if (node.kind === 'assistant') {
      for (const block of node.blocks ?? []) {
        if (block.kind === 'tool-call' && block.name === 'mermaid_load') {
          pushToolBlock(block, node.seq, node.time)
          continue
        }
        if (block.kind !== 'text' || block.text === undefined) continue
        for (const found of extractMermaidBlocks(block.text)) {
          out.push({
            key: `${node.seq}:${index}`,
            seq: node.seq,
            time: node.time,
            preview: found.preview,
            code: found.code,
          })
          index += 1
        }
      }
      continue
    }
    if (node.kind === 'user' || node.kind === 'steering' || node.kind === 'context') {
      for (const block of node.content ?? []) {
        if (block.type !== 'text' || block.text === undefined) continue
        for (const found of extractMermaidBlocks(block.text)) {
          out.push({
            key: `${node.seq}:${index}`,
            seq: node.seq,
            time: node.time,
            preview: found.preview,
            code: found.code,
          })
          index += 1
        }
      }
    }
  }
  // 进行中的助手输出：工具调用块在调用发生时即可见（seq 用 0 占位，键按内容去重）
  for (const block of snapshot.partial?.blocks ?? []) {
    if (block.kind === 'tool-call' && block.name === 'mermaid_load') {
      pushToolBlock(block, 0, Date.now())
    }
  }
  return out
}

/** 内容哈希（djb2，用于工具块跨 partial/最终消息去重）。 */
function hashCode(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

/** 解析工具调用参数字符串（容忍非 JSON / 缺 code 字段）。 */
function parseToolArgs(raw: string | undefined): { code?: string } {
  if (raw === undefined) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed !== null && typeof parsed === 'object' && typeof (parsed as { code?: unknown }).code === 'string') {
      return { code: (parsed as { code: string }).code }
    }
  } catch {
    // 非 JSON 参数无法提取，按无代码处理。
  }
  return {}
}

/** 键列表相同 ⟺ 集合未变（内容不可变）。 */
function sameKeys(a: readonly MermaidBlockView[], b: readonly MermaidBlockView[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].key !== b[i].key) return false
  }
  return true
}

/**
 * 创建对话代码块源。
 * @param sessions - 会话服务（apply 闭包内读取）。
 * @returns 裸可观测源；随 fiber 生命周期由 apply 负责 dispose。
 */
export function createMermaidBlocksSource(sessions: SessionsFace): {
  source: { getSnapshot(): readonly MermaidBlockView[]; subscribe(fn: () => void): () => void }
  dispose: () => void
} {
  let blocks: readonly MermaidBlockView[] = EMPTY
  const listeners = new Set<() => void>()
  let sessionId: string | undefined
  let unsubSession: (() => void) | undefined
  let unsubList: (() => void) | undefined

  const publishIfChanged = (next: MermaidBlockView[]): void => {
    if (sameKeys(blocks, next)) return
    blocks = next
    for (const fn of [...listeners]) fn()
  }

  const rescanSession = (): void => {
    if (sessionId === undefined) {
      publishIfChanged([])
      return
    }
    // binding 可能在会话被 UI 打开后才存在：未订阅时每次重扫都重试绑定。
    if (unsubSession === undefined) {
      const binding = sessions.binding(sessionId)
      if (binding !== undefined) {
        unsubSession = binding.session.subscribe(rescanSession)
      }
    }
    const binding = sessions.binding(sessionId)
    if (binding === undefined) {
      publishIfChanged([])
      return
    }
    publishIfChanged(scanBlocks(binding.session.getSnapshot()))
  }

  const rescanAll = (): void => {
    const nextId = sessions.list.getSnapshot().current
    if (nextId !== sessionId) {
      sessionId = nextId
      unsubSession?.()
      unsubSession = undefined
    }
    rescanSession()
  }

  unsubList = sessions.list.subscribe(rescanAll)
  rescanAll()

  return {
    source: {
      getSnapshot: () => blocks,
      subscribe: (fn: () => void): (() => void) => {
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
    },
    dispose: () => {
      unsubList?.()
      unsubSession?.()
      listeners.clear()
    },
  }
}
