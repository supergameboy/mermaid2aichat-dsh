/**
 * 侧边栏底部启动按钮 — 打开/关闭 Mermaid 反向编辑器面板。
 * 未读的对话 Mermaid 代码块以角标数量显示在按钮上。
 */
import type { MermaidBlockView } from './blocks.js'
import type { MermaidPanelBakedActions, MermaidPanelState } from './store.js'
import css from './Launcher.module.css'

export interface MermaidLauncherProps {
  /** 侧边栏是否展开（owner 参数，来自 sidebar.footer.action 槽位）。 */
  wide?: boolean
  /** store 读接口（框架注入）。 */
  useStore: <S>(sel: (s: MermaidPanelState) => S, eq?: (a: S, b: S) => boolean) => S
  /** store 写接口（框架注入）。 */
  actions: MermaidPanelBakedActions
  /** 对话代码块选择器 hook（apply 注入的 hooks 仓）。 */
  useBlocks: <S>(sel: (blocks: readonly MermaidBlockView[]) => S, eq?: (a: S, b: S) => boolean) => S
}

export function MermaidLauncher({ wide = true, useStore, actions, useBlocks }: MermaidLauncherProps) {
  const open = useStore((s) => s.open)
  const seenBlockKeys = useStore((s) => s.seenBlockKeys)
  const blocks = useBlocks((b) => b)
  const unseen = blocks.filter((b) => !seenBlockKeys.includes(b.key)).length

  return (
    <button
      type="button"
      className={css.launcher}
      data-active={open || undefined}
      title={open ? '关闭 Mermaid 反向编辑器' : '打开 Mermaid 反向编辑器'}
      onClick={() => { actions.toggleOpen() }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="5" cy="6" r="2.2" />
        <circle cx="19" cy="6" r="2.2" />
        <circle cx="12" cy="18" r="2.2" />
        <path d="M7 6.5 L17 6.5" />
        <path d="M6.6 8 L10.8 16.2" />
        <path d="M17.4 8 L13.2 16.2" />
      </svg>
      {wide && <span className={css.label}>Mermaid 编辑器</span>}
      {unseen > 0 && <span className={css.badge}>{unseen > 9 ? '9+' : unseen}</span>}
    </button>
  )
}
