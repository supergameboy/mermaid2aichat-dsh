/**
 * Mermaid 反向编辑器浮动面板 — 注册在 shell.overlay 槽位（框架级浮层）。
 *
 * 可关闭的右侧面板，支持：
 * - 多标签（新建/切换/关闭/重命名/排序），每标签独立画布与代码
 * - 页面内全屏（maximized，覆盖整个页面，非浏览器全屏）
 * - 从对话导入：扫描当前会话中 AI 产出的 ```mermaid 代码块，一键导入为新标签
 * - 发送到对话：把活动标签的 Mermaid 代码块送回当前会话（双向传输闭环）
 *
 * 数据流（无服务端，DSH 直接通信）：
 * - 画布编辑 → onCanvasChange(payload) → 写入活动标签（store）
 * - store 整值持久化到 localStorage，面板重开自动恢复
 * - 对话代码块源（blocks.ts）是响应式可观测源，新块到达时提示用户导入
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas } from '../editor/index.js'
import { TypeSwitchDialog, ToastContainer } from '../editor/index.js'
import { showToast } from '../editor/components/toast.js'
import type { CanvasChangePayload } from '../editor/index.js'
import { createEmptyCanvasState, isGraphCanvasState, parseMermaid } from '@mermaid2aichat/serializer'
import type {
  CanvasState,
  DiagramType,
  FlowchartDirection,
  GraphMetadata,
  MermaidEdge,
  MermaidNode,
  Viewport,
} from '@mermaid2aichat/serializer'
import { PluginTabBar } from './PluginTabBar.js'
import type { MermaidBlockView } from './blocks.js'
import type { MermaidPanelBakedActions, MermaidPanelState, MermaidView } from './store.js'
import css from './Panel.module.css'

/** 图表类型中文标签。 */
const DIAGRAM_TYPE_LABELS: Record<string, string> = {
  flowchart: '流程图',
  sequenceDiagram: '时序图',
  classDiagram: '类图',
  erDiagram: 'ER图',
}

export interface MermaidPanelProps {
  /** store 读接口（框架注入）。 */
  useStore: <S>(sel: (s: MermaidPanelState) => S, eq?: (a: S, b: S) => boolean) => S
  /** store 写接口（框架注入）。 */
  actions: MermaidPanelBakedActions
  /** 全局会话快照 hook（框架标准座）。 */
  useSessions: <S>(sel: (s: DshSessionsSnapshot) => S, eq?: (a: S, b: S) => boolean) => S
  /** 对话代码块选择器 hook（apply 注入的 hooks 仓）。 */
  useBlocks: <S>(sel: (blocks: readonly MermaidBlockView[]) => S, eq?: (a: S, b: S) => boolean) => S
  /** 把 Mermaid 代码发送到指定会话（apply 注入）。 */
  sendToChat: (code: string, sessionId: string) => Promise<void>
}

export function MermaidPanel({ useStore, actions, useSessions, useBlocks, sendToChat }: MermaidPanelProps) {
  const open = useStore((s) => s.open)
  const maximized = useStore((s) => s.maximized)
  const darkMode = useStore((s) => s.darkMode)
  const views = useStore((s) => s.views)
  const activeViewId = useStore((s) => s.activeViewId)
  const seenBlockKeys = useStore((s) => s.seenBlockKeys)

  // 当前会话 id（存在即可发送——发送本身就是给空白会话的第一条消息）
  const sessionId = useSessions((s) => s.current)

  const blocks = useBlocks((b) => b)

  const [pendingSwitch, setPendingSwitch] = useState<DiagramType | null>(null)
  const [sending, setSending] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const activeView: MermaidView = views.find((v) => v.id === activeViewId) ?? views[0]

  // 新代码块提示：面板打开时，未读块弹 toast 并标记已读
  const freshKeys = useMemo(
    () => blocks.filter((b) => !seenBlockKeys.includes(b.key)).map((b) => b.key),
    [blocks, seenBlockKeys],
  )
  const freshKeyStamp = freshKeys.join('|')
  useEffect(() => {
    if (!open || freshKeys.length === 0) return
    showToast(`发现 ${freshKeys.length} 段新的 Mermaid 代码，点击「从对话导入」查看`, 'info')
    actions.markBlocksSeen(freshKeys)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshKeyStamp, open])

  // 画布变更统一出口：活动标签整体更新画布与代码。
  // 与旧服务端回声设计不同，本地 store 是唯一真相源：图结构编辑也必须写回
  // fullState（否则切换标签/重开面板后画布内容丢失）。回写值与内部 state
  // 相同，不会引起视觉回环。
  const handleCanvasChange = useCallback(
    (payload: CanvasChangePayload) => {
      actions.setCanvas(payload.fullState)
      actions.setCode(payload.mermaid)
    },
    [actions],
  )

  const handleViewportChange = useCallback(
    (vp: Viewport) => { actions.setViewport(vp) },
    [actions],
  )

  // 类型切换确认 → 清空当前标签画布并切换到新类型
  const handleSwitchConfirm = useCallback(() => {
    if (pendingSwitch === null) return
    actions.setCanvas(createEmptyCanvasState(pendingSwitch))
    actions.setCode('')
    setPendingSwitch(null)
  }, [actions, pendingSwitch])

  // 从对话导入：解析代码块，新建标签并切换
  const handleImport = useCallback((block: MermaidBlockView) => {
    const parsed = parseMermaid(block.code)
    const canvas: CanvasState = parsed.success ? parsed.canvas : createEmptyCanvasState('flowchart')
    actions.addView({
      title: `来自对话 · ${DIAGRAM_TYPE_LABELS[canvas.diagramType] ?? canvas.diagramType}`,
      canvas,
      code: block.code,
      sourceBlockKey: block.key,
    })
    setImportOpen(false)
  }, [actions])

  // 发送活动标签代码块到当前会话
  const handleSend = useCallback(async () => {
    if (sessionId === undefined || sending || activeView.code.trim() === '') return
    setSending(true)
    try {
      await sendToChat(activeView.code, sessionId)
      showToast('已发送到对话', 'success')
    } catch (err) {
      showToast(`发送失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setSending(false)
    }
  }, [sessionId, sending, activeView.code, sendToChat])

  // 从 CanvasState 派生图结构字段
  const derived = useMemo((): {
    nodes: MermaidNode[]
    edges: MermaidEdge[]
    direction: FlowchartDirection
    metadata: GraphMetadata | undefined
  } => {
    if (isGraphCanvasState(activeView.canvas)) {
      return {
        nodes: activeView.canvas.nodes,
        edges: activeView.canvas.edges,
        direction: activeView.canvas.direction ?? 'TB',
        metadata: activeView.canvas.metadata,
      }
    }
    return { nodes: [], edges: [], direction: 'TB', metadata: undefined }
  }, [activeView.canvas])

  if (!open) return null

  const importedKeys = new Set(views.map((v) => v.sourceBlockKey).filter((k): k is string => k !== undefined))
  const unseenCount = freshKeys.length

  const panelClass = [
    css.panel,
    darkMode ? 'dark' : '',
    maximized ? css.maximized : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={panelClass} data-mermaid-panel>
      <header className={css.header}>
        <span className={css.logo} title="Mermaid 反向编辑器">M2A</span>
        <span className={css.title}>Mermaid 反向编辑器</span>
        <span className={css.badge}>
          {DIAGRAM_TYPE_LABELS[activeView.canvas.diagramType] ?? activeView.canvas.diagramType}
        </span>
        <div className={css.spacer} />
        {blocks.length > 0 && (
          <div className={css.importWrap}>
            <button
              type="button"
              className={css.actionGhost}
              onClick={() => { setImportOpen((o) => !o) }}
              title="把对话中的 Mermaid 代码导入编辑器"
            >
              从对话导入{unseenCount > 0 ? ` (${unseenCount})` : ''}
            </button>
            {importOpen && (
              <div className={css.dropdown}>
                <div className={css.dropdownTitle}>对话中的 Mermaid 代码</div>
                {blocks.map((block) => {
                  const imported = importedKeys.has(block.key)
                  return (
                    <div key={block.key} className={css.dropdownItem}>
                      <div className={css.dropdownPreview} title={block.code}>
                        {block.preview}
                      </div>
                      <button
                        type="button"
                        className={css.importBtn}
                        disabled={imported}
                        onClick={() => { handleImport(block) }}
                      >
                        {imported ? '已导入' : '导入'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className={css.actionGhost}
          onClick={() => { actions.setMaximized(!maximized) }}
          title={maximized ? '退出页面内全屏' : '页面内全屏'}
        >
          {maximized ? '⧉ 还原' : '⧉ 全屏'}
        </button>
        <button
          type="button"
          className={css.action}
          disabled={sessionId === undefined || sending || activeView.code.trim() === ''}
          title={sessionId === undefined ? '请先打开一个会话' : '把 Mermaid 代码发送到当前对话'}
          onClick={() => { void handleSend() }}
        >
          {sending ? '发送中…' : '发送到对话'}
        </button>
        <button
          type="button"
          className={css.close}
          title="关闭面板"
          onClick={() => { actions.setOpen(false) }}
        >
          ×
        </button>
      </header>

      <PluginTabBar
        views={views}
        activeViewId={activeView.id}
        onSwitchView={(id) => { actions.switchView(id) }}
        onCreateView={() => { actions.addView() }}
        onCloseView={(id) => { actions.closeView(id) }}
        onRenameView={(id, title) => { actions.renameView(id, title) }}
        onReorderViews={(ids) => { actions.reorderViews(ids) }}
      />

      <div className={css.body}>
        <Canvas
          key={activeView.id}
          syncCanvas={activeView.canvas}
          syncNodes={derived.nodes}
          syncEdges={derived.edges}
          syncDirection={derived.direction}
          syncViewport={activeView.viewport}
          syncMetadata={derived.metadata}
          onCanvasChange={handleCanvasChange}
          onDirectionChange={() => { /* 方向由画布内部管理 */ }}
          onViewportChange={handleViewportChange}
          onDiagramTypeChange={(t) => { setPendingSwitch(t) }}
          darkMode={darkMode}
          onDarkModeToggle={() => { actions.setDarkMode(!darkMode) }}
        />
        {pendingSwitch !== null && (
          <TypeSwitchDialog
            currentType={activeView.canvas.diagramType}
            newType={pendingSwitch}
            onConfirm={handleSwitchConfirm}
            onCancel={() => { setPendingSwitch(null) }}
          />
        )}
        <ToastContainer />
      </div>
    </div>
  )
}
