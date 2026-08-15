/**
 * Mermaid 反向编辑器面板 — 单内核双形态：
 * - 停靠：portal 渲染进布局控制器追加的网格列（编辑器就是右列，
 *   聊天区自动缩宽、把手拖宽，不依赖 details 槽位与布局服务）
 * - 浮层：页面内全屏（100vw）或列尚未挂载时的兜底
 *
 * 编辑器内核支持：
 * - 会话隔离（标签页按会话存储）
 * - 多标签（新建/切换/关闭/重命名/排序），每标签独立画布与代码
 * - 响应式紧凑模式（窄宽度自动隐藏左右侧面板，只显示画布）
 * - 从对话导入（含 mermaid_load 工具块自动导入 + 面板自动打开）
 * - 发送到对话（SessionFace.prompt，双向传输闭环）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import type { MermaidActions, MermaidAppState, MermaidSessionViews, MermaidView } from './state.js'
import css from './Panel.module.css'

/** 图表类型中文标签。 */
const DIAGRAM_TYPE_LABELS: Record<string, string> = {
  flowchart: '流程图',
  sequenceDiagram: '时序图',
  classDiagram: '类图',
  erDiagram: 'ER图',
}

/** 会话尚无任何标签时的占位（写入动作会物化真实标签）。 */
const PLACEHOLDER_VIEW: MermaidView = {
  id: 'default',
  title: '新建视图',
  canvas: createEmptyCanvasState('flowchart'),
  code: '',
  viewport: null,
}
const PLACEHOLDER_SESSION: MermaidSessionViews = { views: [PLACEHOLDER_VIEW], activeViewId: 'default' }

/** 紧凑模式自动生效的宽度阈值（默认列宽 480 时面板实测 479，阈值须低于它）。 */
const COMPACT_WIDTH = 420

interface MermaidPanelProps {
  /** 面板状态选择器 hook（apply 注入的 hooks 仓）。 */
  useMermaid: <S>(sel: (s: MermaidAppState) => S, eq?: (a: S, b: S) => boolean) => S
  /** 面板写动作（apply 注入，全部会话寻址）。 */
  mermaidActions: MermaidActions
  /** 对话代码块选择器 hook（apply 注入的 hooks 仓）。 */
  useBlocks: <S>(sel: (blocks: readonly MermaidBlockView[]) => S, eq?: (a: S, b: S) => boolean) => S
  /** 把 Mermaid 代码发送到指定会话（apply 注入）。 */
  sendToChat: (code: string, sessionId: string) => Promise<void>
  /** 手动重扫对话代码块（apply 注入）。 */
  rescanBlocks: () => void
  /** 当前会话 id（空串 = 空白会话）。 */
  sessionId: string
  /** 浮层形态：固定定位覆盖页面；停靠形态填满网格列。 */
  floating: boolean
}

export function MermaidPanel({
  useMermaid,
  mermaidActions,
  useBlocks,
  sendToChat,
  rescanBlocks,
  sessionId,
  floating,
}: MermaidPanelProps) {
  const open = useMermaid((s) => s.open)
  const maximized = useMermaid((s) => s.maximized)
  const darkMode = useMermaid((s) => s.darkMode)
  const compact = useMermaid((s) => s.compact)
  const sessions = useMermaid((s) => s.sessions)
  const seenBlockKeys = useMermaid((s) => s.seenBlockKeys)

  const blocks = useBlocks((b) => b)

  const [pendingSwitch, setPendingSwitch] = useState<DiagramType | null>(null)
  const [sending, setSending] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // 面板自身实测宽度（响应式紧凑模式；停靠时即列宽）
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelWidth, setPanelWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = panelRef.current
    if (el === null) return
    const observer = new ResizeObserver((entries) => {
      setPanelWidth(entries[0]?.contentRect.width ?? 0)
    })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [])
  const effectiveCompact = compact || (panelWidth !== null && panelWidth > 0 && panelWidth < COMPACT_WIDTH)

  // 挂载时重扫：应用 UI 稳定后会话 binding 必然可用（补 boot 时序竞态），
  // 让启动前已有的 mermaid_load 调用（仍在消息窗口内）也能被导入。
  useEffect(() => {
    rescanBlocks()
    const delayed = setTimeout(rescanBlocks, 2000)
    return () => { clearTimeout(delayed) }
  }, [rescanBlocks])

  // 当前会话的标签集合（未物化时用占位）
  const sid = sessionId
  const sessionViews: MermaidSessionViews = sid !== '' && sessions[sid] !== undefined
    ? sessions[sid]
    : PLACEHOLDER_SESSION
  const activeView: MermaidView = sessionViews.views.find((v) => v.id === sessionViews.activeViewId)
    ?? sessionViews.views[0]
    ?? PLACEHOLDER_VIEW

  // 新代码块提示与自动导入：AI 工具块直接导入为新标签，其余提示手动导入
  const freshKeys = useMemo(
    () => blocks.filter((b) => !seenBlockKeys.includes(b.key)).map((b) => b.key),
    [blocks, seenBlockKeys],
  )
  const freshKeyStamp = freshKeys.join('|')
  useEffect(() => {
    if (freshKeys.length === 0) return
    const fresh = blocks.filter((b) => freshKeys.includes(b.key))
    const toolBlocks = fresh.filter((b) => b.fromTool === true)
    let toolImported = 0
    for (const block of toolBlocks) {
      // 幂等：同一来源块只导入一次（partial 流与最终消息可能重复触发）
      const already = sessions[sid]?.views.some((v) => v.sourceBlockKey === block.key)
      if (already) continue
      const parsed = parseMermaid(block.code)
      const canvas: CanvasState = parsed.success ? parsed.canvas : createEmptyCanvasState('flowchart')
      mermaidActions.addView(sid, {
        title: `AI 工具 · ${DIAGRAM_TYPE_LABELS[canvas.diagramType] ?? canvas.diagramType}`,
        canvas,
        code: block.code,
        sourceBlockKey: block.key,
        fromTool: true,
      })
      toolImported += 1
    }
    if (toolImported > 0) {
      // 工具导入自动打开面板：AI 送图时直接展示新标签
      mermaidActions.setOpen(true)
      showToast(`AI 已通过工具导入 ${toolImported} 段 Mermaid 代码`, 'success')
    }
    const manualBlocks = fresh.filter((b) => b.fromTool !== true)
    if (manualBlocks.length > 0 && open) {
      showToast(`发现 ${manualBlocks.length} 段新的 Mermaid 代码，点击「从对话导入」查看`, 'info')
    }
    mermaidActions.markBlocksSeen(freshKeys)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshKeyStamp, sid, open])

  // 画布变更统一出口：当前会话的活动标签整体更新画布与代码。
  const handleCanvasChange = useCallback(
    (payload: CanvasChangePayload) => {
      mermaidActions.setCanvas(sid, payload.fullState)
      mermaidActions.setCode(sid, payload.mermaid)
    },
    [mermaidActions, sid],
  )

  const handleViewportChange = useCallback(
    (vp: Viewport) => { mermaidActions.setViewport(sid, vp) },
    [mermaidActions, sid],
  )

  // 类型切换确认 → 清空当前标签画布并切换到新类型
  const handleSwitchConfirm = useCallback(() => {
    if (pendingSwitch === null) return
    mermaidActions.setCanvas(sid, createEmptyCanvasState(pendingSwitch))
    mermaidActions.setCode(sid, '')
    setPendingSwitch(null)
  }, [mermaidActions, sid, pendingSwitch])

  // 从对话导入：解析代码块，新建标签并切换
  const handleImport = useCallback((block: MermaidBlockView) => {
    const parsed = parseMermaid(block.code)
    const canvas: CanvasState = parsed.success ? parsed.canvas : createEmptyCanvasState('flowchart')
    mermaidActions.addView(sid, {
      title: `来自对话 · ${DIAGRAM_TYPE_LABELS[canvas.diagramType] ?? canvas.diagramType}`,
      canvas,
      code: block.code,
      sourceBlockKey: block.key,
    })
    setImportOpen(false)
  }, [mermaidActions, sid])

  // 发送活动标签代码块到当前会话
  const handleSend = useCallback(async () => {
    if (sid === '' || sending || activeView.code.trim() === '') return
    setSending(true)
    try {
      await sendToChat(activeView.code, sid)
      showToast('已发送到对话', 'success')
    } catch (err) {
      showToast(`发送失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setSending(false)
    }
  }, [sid, sending, activeView.code, sendToChat])

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

  const importedKeys = new Set(sessionViews.views.map((v) => v.sourceBlockKey).filter((k): k is string => k !== undefined))
  const unseenCount = freshKeys.length

  const panelClass = [
    css.panel,
    darkMode ? 'dark' : '',
    floating ? css.floating : '',
    maximized ? css.maximized : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={panelRef}
      className={panelClass}
      data-mermaid-panel
      data-compact={effectiveCompact || undefined}
    >
      <header className={css.header}>
        <span className={css.logo} title="mermaid2aichat-dsh">M2A</span>
        <span className={css.title}>mermaid2aichat-dsh</span>
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
          className={css.iconBtn}
          onClick={() => { mermaidActions.setDarkMode(!darkMode) }}
          title={darkMode ? '切换到亮色模式' : '切换到暗色模式'}
        >
          {darkMode ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          )}
        </button>
        <button
          type="button"
          className={css.actionGhost}
          onClick={() => { mermaidActions.setCompact(!compact) }}
          title={compact ? '展开左右侧面板' : '紧凑模式：隐藏左右侧面板，只显示画布'}
        >
          {compact ? '▤ 展开' : '▥ 紧凑'}
        </button>
        <button
          type="button"
          className={css.actionGhost}
          onClick={() => { mermaidActions.setMaximized(!maximized) }}
          title={maximized ? '退出页面内全屏' : '页面内全屏'}
        >
          {maximized ? '⧉ 还原' : '⧉ 全屏'}
        </button>
        <button
          type="button"
          className={css.action}
          disabled={sid === '' || sending || activeView.code.trim() === ''}
          title={sid === '' ? '请先打开一个会话' : '把 Mermaid 代码发送到当前对话'}
          onClick={() => { void handleSend() }}
        >
          {sending ? '发送中…' : '发送到对话'}
        </button>
        <button
          type="button"
          className={css.close}
          title="关闭面板"
          onClick={() => { mermaidActions.setOpen(false) }}
        >
          ×
        </button>
      </header>

      <PluginTabBar
        views={sessionViews.views}
        activeViewId={activeView.id}
        onSwitchView={(id) => { mermaidActions.switchView(sid, id) }}
        onCreateView={() => { mermaidActions.addView(sid) }}
        onCloseView={(id) => { mermaidActions.closeView(sid, id) }}
        onRenameView={(id, title) => { mermaidActions.renameView(sid, id, title) }}
        onReorderViews={(ids) => { mermaidActions.reorderViews(sid, ids) }}
      />

      <div className={css.body}>
        <Canvas
          key={`${sid}:${activeView.id}`}
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

type MermaidEditorEntryProps = Omit<MermaidPanelProps, 'sessionId' | 'floating'> & {
  useSessions: <S>(sel: (s: DshSessionsSnapshot) => S, eq?: (a: S, b: S) => boolean) => S
  getColumn: () => HTMLElement | null
  subscribeColumn: (fn: () => void) => () => void
}

/**
 * 唯一入口：闭 → 空；全屏 → 浮层；开 → portal 进网格列（列未就绪时浮层兜底）。
 * 始终跟随当前会话，会话切换即标签页隔离切换。
 */
export function MermaidEditorEntry(props: MermaidEditorEntryProps) {
  const { useSessions, getColumn, subscribeColumn, ...panelProps } = props
  const open = props.useMermaid((s) => s.open)
  const maximized = props.useMermaid((s) => s.maximized)
  const current = useSessions((s) => s.current)
  const sessionId = current ?? ''

  // 网格列就绪跟踪：帧挂载成功后从浮层兜底切换到 portal
  const [column, setColumn] = useState<HTMLElement | null>(getColumn)
  useEffect(() => subscribeColumn(() => { setColumn(getColumn()) }), [subscribeColumn, getColumn])

  if (!open) return null
  if (maximized) {
    return <MermaidPanel {...panelProps} sessionId={sessionId} floating={true} />
  }
  if (column !== null) {
    return createPortal(
      <MermaidPanel {...panelProps} sessionId={sessionId} floating={false} />,
      column,
    )
  }
  return <MermaidPanel {...panelProps} sessionId={sessionId} floating={true} />
}
