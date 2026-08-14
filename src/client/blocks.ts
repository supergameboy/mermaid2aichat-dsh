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
}

/** 最小面：会话列表快照。 */
interface SessionListSnapshot {
  current?: string
}

/** 最小面：助手消息块。 */
interface AssistantBlock {
  kind: string
  text?: string
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

/** 扫描快照中的全部代码块（键 = seq:index）。覆盖助手与用户/上下文消息。 */
function scanBlocks(snapshot: ConversationSnapshot): MermaidBlockView[] {
  const out: MermaidBlockView[] = []
  for (const node of snapshot.nodes) {
    let index = 0
    if (node.kind === 'assistant') {
      for (const block of node.blocks ?? []) {
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
  return out
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
