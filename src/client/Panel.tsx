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
}

export function MermaidPanel({ useMermaid, mermaidActions, useSessions, useBlocks, sendToChat }: MermaidPanelProps) {
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
    for (const block of toolBlocks) {
      const parsed = parseMermaid(block.code)
      const canvas: CanvasState = parsed.success ? parsed.canvas : createEmptyCanvasState('flowchart')
      mermaidActions.addView(sid, {
        title: `AI 工具 · ${DIAGRAM_TYPE_LABELS[canvas.diagramType] ?? canvas.diagramType}`,
        canvas,
        code: block.code,
        sourceBlockKey: block.key,
        fromTool: true,
      })
    }
    if (toolBlocks.length > 0) {
      showToast(`AI 已通过工具导入 ${toolBlocks.length} 段 Mermaid 代码`, 'success')
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
