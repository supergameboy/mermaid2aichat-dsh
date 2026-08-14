/**
 * Mermaid 反向编辑器 — DSH 浏览器插件（client 半边）。
 *
 * 注册两个界面贡献：
 * - sidebar.footer.action：启动按钮（打开/关闭面板，未读代码块角标）
 * - shell.overlay：右侧可关闭的浮动编辑器面板（多标签 + 页面内全屏 + 对话导入）
 *
 * 两者共享同一个 store 句柄（同一 root scope 下框架按句柄复用实例），
 * 面板状态（含全部标签）整值持久化到 localStorage。
 * 对话代码块源（blocks.ts）经 inject 的 hooks 仓绑定为 useBlocks，
 * 跟随当前会话的 ConversationSnapshot 响应式更新 —— AI 产出的 mermaid
 * 代码进入编辑器不需要任何 MCP/server。
 */
import type { Context } from '@deepseek-ai/cordis'
import { createMermaidBlocksSource } from './blocks.js'
import { createMermaidPanelStore } from './store.js'
import { MermaidLauncher } from './Launcher.js'
import { MermaidPanel } from './Panel.js'

/** 插件名（诊断用）。 */
export const name = 'mermaid2aichat-dsh'

/** 硬依赖：槽位服务与会话服务均由 web 组合提供。 */
export const inject = ['slots', 'sessions']

export function apply(ctx: Context): void {
  const handle = createMermaidPanelStore()
  const blocks = createMermaidBlocksSource(ctx.sessions)

  ctx.effect(() => blocks.dispose, 'mermaid2aichat-dsh: conversation blocks source')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    {
      name: 'sidebar.footer.action',
      id: 'mermaid-launcher',
      store: handle,
      inject: () => ({ hooks: { blocks: blocks.source } }),
    },
    MermaidLauncher,
  ))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'mermaid-panel',
      store: handle,
      inject: () => ({
        hooks: { blocks: blocks.source },
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
