/**
 * Mermaid 反向编辑器 — DSH 浏览器插件（client 半边）。
 *
 * 注册两个界面贡献：
 * - sidebar.footer.action：启动按钮（打开/关闭面板）
 * - shell.overlay：右侧可关闭的浮动编辑器面板
 *
 * 两者共享同一个 store 句柄（同一 root scope 下框架按句柄复用实例），
 * 面板状态（含画布与代码）整值持久化到 localStorage。
 * 「发送到对话」通过 ctx.sessions.scope(id).conversation.send 直接与会话通信，
 * 不需要任何 MCP/server。
 */
import type { Context } from '@deepseek-ai/cordis'
import { createMermaidPanelStore } from './store.js'
import { MermaidLauncher } from './Launcher.js'
import { MermaidPanel } from './Panel.js'

/** 插件名（诊断用）。 */
export const name = 'mermaid2aichat-dsh'

/** 硬依赖：槽位服务与会话服务均由 web 组合提供。 */
export const inject = ['slots', 'sessions']

export function apply(ctx: Context): void {
  const handle = createMermaidPanelStore()

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    { name: 'sidebar.footer.action', store: handle },
    MermaidLauncher,
  ))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      store: handle,
      inject: () => ({
        sendToChat: async (code: string, sessionId: string): Promise<void> => {
          const scope = ctx.sessions.scope(sessionId)
          if (scope === undefined) throw new Error('未找到会话，无法发送')
          await scope.conversation.send(`\`\`\`mermaid\n${code}\n\`\`\``)
        },
      }),
    },
    MermaidPanel,
  ))
}
