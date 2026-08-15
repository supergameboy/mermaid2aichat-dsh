/**
 * Mermaid 反向编辑器 — DSH 浏览器插件（client 半边）。
 *
 * 注册两个界面贡献 + 一个输入触发源 + 一个 DOM 布局控制器：
 * - sidebar.footer.action：启动按钮（打开/关闭面板，未读代码块角标）
 * - shell.overlay：编辑器面板入口（闭 → 空；全屏 → 浮层；开 → portal 进网格列）
 * - inputTriggers：'/' 触发源「mermaid」——在输入框引用当前会话的标签页，
 *   选中后把该标签的 Mermaid 代码块插入草稿
 * - layout.ts 控制器：不修改 dsh 源码，向 shell 网格追加编辑器列并镜像其
 *   行内 grid-template-columns，聊天区自动让位，自绘把手可拖宽
 *
 * 状态层（state.ts）是自研可观测源：面板/按钮/触发源/代码块自动导入共享
 * 同一实例；标签页按会话隔离，整值持久化到 localStorage。
 * AI 通过宿主工具 mermaid_load 产生的代码块经对话扫描通道被自动导入。
 */
import type { Context } from '@deepseek-ai/cordis'
import { createMermaidBlocksSource } from './blocks.js'
import { createMermaidState } from './state.js'
import { createEditorLayout } from './layout.js'
import { MermaidLauncher } from './Launcher.js'
import { MermaidEditorEntry } from './Panel.js'

/** 插件名（诊断用）。 */
export const name = 'mermaid2aichat-dsh'

/** 硬依赖：槽位服务、会话服务与输入触发服务均由 web 组合提供。 */
export const inject = ['slots', 'sessions', 'inputTriggers']

/** 输入触发源的最小面（ui-input-trigger 提供）。 */
interface InputTriggerCandidate {
  readonly name: string
  readonly description?: string
}
interface InputTriggerSession {
  readonly sessionId: string
}
interface InputTriggerPick {
  readonly candidate: InputTriggerCandidate
  readonly session: InputTriggerSession
}
interface InputTriggerSourceContract {
  trigger: string
  name: string
  order?: number
  candidates(session: InputTriggerSession, req: { query: string; signal: AbortSignal }): Promise<readonly InputTriggerCandidate[]>
  onPick(pick: InputTriggerPick): { text: string } | undefined
}
interface InputTriggersService {
  registerSource(source: InputTriggerSourceContract): () => void
}

export function apply(ctx: Context): void {
  const mermaid = createMermaidState()
  const blocks = createMermaidBlocksSource(ctx.sessions)

  ctx.effect(() => () => {
    blocks.dispose()
    mermaid.dispose()
  }, 'mermaid2aichat-dsh: state sources')

  // 布局控制器：向 shell 网格追加编辑器列，零 dsh 源码改动
  const layout = createEditorLayout({
    getState: () => {
      const s = mermaid.source.getSnapshot()
      return { open: s.open, maximized: s.maximized, width: s.width }
    },
    subscribe: (fn) => mermaid.source.subscribe(fn),
    onWidthCommit: (width) => { mermaid.actions.setWidth(width) },
  })
  ctx.effect(() => {
    layout.mount()
    return () => { layout.dispose() }
  }, 'mermaid2aichat-dsh: editor layout controller')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    {
      name: 'sidebar.footer.action',
      id: 'mermaid-launcher',
      inject: () => ({
        hooks: { blocks: blocks.source, mermaid: mermaid.source },
        mermaidActions: mermaid.actions,
      }),
    },
    MermaidLauncher,
  ))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'mermaid-panel',
      inject: () => ({
        hooks: { blocks: blocks.source, mermaid: mermaid.source },
        mermaidActions: mermaid.actions,
        rescanBlocks: blocks.rescan,
        // 布局控制器句柄：portal 挂载点 + 列就绪通知
        getColumn: layout.getColumn,
        subscribeColumn: layout.subscribeColumn,
        sendToChat: async (code: string, sessionId: string): Promise<void> => {
          // 直接走 SessionFace.prompt（ConversationController.send 的内部路径），
          // 避免 scope 寻址属性代理在 scope fiber 上抛 inject 守卫错误。
          const binding = ctx.sessions.binding(sessionId)
          if (binding === undefined) throw new Error('未找到会话，无法发送')
          const result = await binding.session.prompt(
            [{ type: 'text', text: `\`\`\`mermaid\n${code}\n\`\`\`` }],
            'queue',
          )
          if (!result.ok) throw new Error(`发送失败：${result.error.code}: ${result.error.message}`)
        },
      }),
    },
    MermaidEditorEntry,
  ))

  // 输入框引用：'/' 触发源「mermaid」，列出当前会话的标签页，选中插入代码块
  const mermaidTrigger: InputTriggerSourceContract = {
    trigger: '/',
    name: 'mermaid',
    order: 30,
    async candidates(session, req) {
      const state = mermaid.source.getSnapshot()
      const sessionViews = state.sessions[session.sessionId]
      if (sessionViews === undefined) return []
      const query = req.query.toLowerCase()
      return sessionViews.views
        .filter((v) => v.title.toLowerCase().includes(query))
        .map((v) => ({
          name: v.title,
          description: v.id === sessionViews.activeViewId ? '当前标签' : '',
        }))
    },
    onPick(pick) {
      const state = mermaid.source.getSnapshot()
      const sessionViews = state.sessions[pick.session.sessionId]
      const view = sessionViews?.views.find((v) => v.title === pick.candidate.name)
      if (view === undefined) return undefined
      return { text: `\`\`\`mermaid\n${view.code}\n\`\`\` ` }
    },
  }
  ctx.effect(
    () => ctx.inputTriggers.registerSource(mermaidTrigger),
    'mermaid2aichat-dsh: input trigger source',
  )
}
