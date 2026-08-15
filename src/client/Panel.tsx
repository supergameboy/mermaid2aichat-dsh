/**
 * Mermaid 反向编辑器浮动面板 — 注册在 shell.overlay 槽位（框架级浮层）。
 *
 * 可关闭的右侧面板，支持：
 * - 会话隔离：自动跟随当前会话，标签页按会话分别存储与切换
 * - 多标签（新建/切换/关闭/重命名/排序），每标签独立画布与代码
 * - 页面内全屏（maximized，覆盖整个页面，非浏览器全屏）
 * - 从对话导入：扫描当前会话中的 ```mermaid 代码块（AI 消息/用户消息/工具结果），
 *   一键导入为新标签；AI 通过 mermaid_load 工具产生的块自动导入
 * - 发送到对话：把活动标签的 Mermaid 代码块送回当前会话（双向传输闭环）
 *
 * 数据流（无服务端，DSH 直接通信）：
 * - 画布编辑 → onCanvasChange(payload) → 写入当前会话的活动标签（state.ts）
 * - state 整值持久化到 localStorage，面板重开自动恢复
 * - 对话代码块源（blocks.ts）响应式更新，工具块自动导入、消息块提示手动导入
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

export interface MermaidPanelProps {
  /** 面板状态选择器 hook（apply 注入的 hooks 仓）。 */
  useMermaid: <S>(sel: (s: MermaidAppState) => S, eq?: (a: S, b: S) => boolean) => S
  /** 面板写动作（apply 注入，全部会话寻址）。 */
  mermaidActions: MermaidActions
  /** 全局会话快照 hook（框架标准座）。 */
  useSessions: <S>(sel: (s: DshSessionsSnapshot) => S, eq?: (a: S, b: S) => boolean) => S
  /** 对话代码块选择器 hook（apply 注入的 hooks 仓）。 */
  useBlocks: <S>(sel: (blocks: readonly MermaidBlockView[]) => S, eq?: (a: S, b: S) => boolean) => S
  /** 把 Mermaid 代码发送到指定会话（apply 注入）。 */
  sendToChat: (code: string, sessionId: string) => Promise<void>
  /** 手动重扫对话代码块（面板挂载时触发，兜底会话绑定时序）。 */
  rescanBlocks: () => void
  /** 打开右侧 details 列给编辑器让位（聊天区自动缩宽）。 */
  layoutOpen: () => void
  /** 关闭右侧 details 列。 */
  layoutClose: () => void
}

export function MermaidPanel({
  useMermaid,
  mermaidActions,
  useSessions,
  useBlocks,
  sendToChat,
  rescanBlocks,
  layoutOpen,
  layoutClose,
}: MermaidPanelProps) {
  const open = useMermaid((s) => s.open)
  const maximized = useMermaid((s) => s.maximized)
  const darkMode = useMermaid((s) => s.darkMode)
  const sessions = useMermaid((s) => s.sessions)
  const seenBlockKeys = useMermaid((s) => s.seenBlockKeys)

  // 当前会话 id（编辑器自动跟随）
  const sessionId = useSessions((s) => s.current)

  const blocks = useBlocks((b) => b)

  const [pendingSwitch, setPendingSwitch] = useState<DiagramType | null>(null)
  const [sending, setSending] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // 右侧 details 列的实测宽度（编辑器停靠其上，随列宽同步）
  const [columnWidth, setColumnWidth] = useState<number | null>(null)

  // 挂载时重扫：应用 UI 稳定后会话 binding 必然可用（补 boot 时序竞态），
  // 让启动前已有的 mermaid_load 调用（仍在消息窗口内）也能被导入。
  useEffect(() => {
    rescanBlocks()
    const delayed = setTimeout(rescanBlocks, 2000)
    return () => { clearTimeout(delayed) }
  }, [rescanBlocks])

  // 停靠布局：观测 details 列宽度并同步编辑器宽度。
  // 结构锚点：shell 浮层容器（data-shell-overlay）的父节点是 AppFrame，
  // 其子节点顺序为 [sidebar, center, details, overlay]。
  useEffect(() => {
    const overlayLayer = document.querySelector('[data-shell-overlay]')
    const frame = overlayLayer?.parentElement ?? null
    const detailsCol = frame !== null && frame.children.length >= 4 ? frame.children[2] : null
    if (detailsCol === null) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      setColumnWidth(width ?? 0)
    })
    observer.observe(detailsCol)
    return () => { observer.disconnect() }
  }, [])

  // 让位控制：编辑器打开时保持 details 列打开（用户/会话切换关闭它时重新打开），
  // 关闭编辑器时只在"打开→关闭"跳变上收起列（不打扰用户手动打开的详情）。
  const openRef = useRef(open)
  useEffect(() => {
    const wasOpen = openRef.current
    openRef.current = open
    if (open && !wasOpen) {
      layoutOpen()
    } else if (!open && wasOpen) {
      layoutClose()
    }
  }, [open, layoutOpen, layoutClose])
  // 编辑器打开期间，details 列被外部关闭（会话切换/详情×按钮）时重新打开。
  useEffect(() => {
    if (!open) return
    if (columnWidth !== null && columnWidth < 8) layoutOpen()
  }, [open, columnWidth, layoutOpen])

  // 当前会话的标签集合（未物化时用占位）
  const sessionViews: MermaidSessionViews = sessionId !== undefined && sessions[sessionId] !== undefined
    ? sessions[sessionId]
    : PLACEHOLDER_SESSION
  const activeView: MermaidView = sessionViews.views.find((v) => v.id === sessionViews.activeViewId)
    ?? sessionViews.views[0]
    ?? PLACEHOLDER_VIEW
  const sid = sessionId ?? ''

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

  const importedKeys = new Set(sessionViews.views.map((v) => v.sourceBlockKey).filter((k): k is string => k !== undefined))
  const unseenCount = freshKeys.length

  const panelClass = [
    css.panel,
    darkMode ? 'dark' : '',
    maximized ? css.maximized : '',
  ].filter(Boolean).join(' ')

  // 宽度停靠 details 列：列宽未观测到时用契约默认值，最大化时铺满页面
  const panelWidth = maximized ? '100vw' : `${columnWidth ?? 360}px`

  return (
    <div className={panelClass} data-mermaid-panel style={{ width: panelWidth }}>
      {/* 调整宽度把手：指针穿透到 DSH details 列的拖拽把手（8px 命中条），
          拖动即调整编辑器宽度与聊天区让位宽度 */}
      {!maximized && <div className={css.resizeStrip} aria-hidden="true" />}
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
          onClick={() => { mermaidActions.setMaximized(!maximized) }}
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
          darkMode={darkMode}
          onDarkModeToggle={() => { mermaidActions.setDarkMode(!darkMode) }}
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
