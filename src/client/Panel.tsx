/**
 * Mermaid 反向编辑器浮动面板 — 注册在 shell.overlay 槽位（框架级浮层）。
 *
 * 可关闭的右侧面板：顶栏（类型徽标 / 发送到对话 / 关闭），主体承载编辑器
 * Canvas（工具栏 + 节点库 + 画布 + 属性面板 + 代码编辑器全部内置于 Canvas）。
 *
 * 数据流（无服务端，DSH 直接通信）：
 * - 画布编辑 → onCanvasChange(payload) → 写入共享 store（canvas/code）
 * - store 整值持久化到 localStorage，面板重开自动恢复
 * - 「发送到对话」把 Mermaid 代码块经 ctx.sessions.scope(id).conversation.send 送入当前会话
 */
import { useCallback, useMemo, useState } from 'react'
import { Canvas } from '../editor/index.js'
import { TypeSwitchDialog, ToastContainer } from '../editor/index.js'
import type { CanvasChangePayload } from '../editor/index.js'
import { createEmptyCanvasState, isGraphCanvasState } from '@mermaid2aichat/serializer'
import type {
  CanvasState,
  DiagramType,
  FlowchartDirection,
  GraphMetadata,
  MermaidEdge,
  MermaidNode,
  Viewport,
} from '@mermaid2aichat/serializer'
import type { MermaidPanelBakedActions, MermaidPanelState } from './store.js'
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
  /** 把 Mermaid 代码发送到指定会话（apply 注入）。 */
  sendToChat: (code: string, sessionId: string) => Promise<void>
}

export function MermaidPanel({ useStore, actions, useSessions, sendToChat }: MermaidPanelProps) {
  const open = useStore((s) => s.open)
  const darkMode = useStore((s) => s.darkMode)
  const canvas = useStore((s) => s.canvas)
  const code = useStore((s) => s.code)
  const viewport = useStore((s) => s.viewport)

  // 当前会话 id（blank 会话视为无会话）
  const sessionId = useSessions((s) => {
    const current = s.current
    return current !== undefined && s.byId[current]?.blank === false ? current : undefined
  })

  const [pendingSwitch, setPendingSwitch] = useState<DiagramType | null>(null)
  const [sending, setSending] = useState(false)

  // 画布变更统一出口：类型切换 / sequence 编辑整体更新 canvas；
  // graph 同类型编辑只更新 code（画布内部 state 独立演进，避免同步回环）。
  const handleCanvasChange = useCallback(
    (payload: CanvasChangePayload) => {
      const isTypeSwitch = payload.fullState.diagramType !== canvas.diagramType
      if (isTypeSwitch || payload.snapshot === undefined) {
        actions.setCanvas(payload.fullState)
      }
      actions.setCode(payload.mermaid)
    },
    [actions, canvas.diagramType],
  )

  const handleViewportChange = useCallback(
    (vp: Viewport) => { actions.setViewport(vp) },
    [actions],
  )

  // 类型切换确认 → 清空画布并切换到新类型
  const handleSwitchConfirm = useCallback(() => {
    if (pendingSwitch === null) return
    actions.setCanvas(createEmptyCanvasState(pendingSwitch))
    actions.setCode('')
    setPendingSwitch(null)
  }, [actions, pendingSwitch])

  // 发送 Mermaid 代码块到当前会话
  const handleSend = useCallback(async () => {
    if (sessionId === undefined || sending || code.trim() === '') return
    setSending(true)
    try {
      await sendToChat(code, sessionId)
    } finally {
      setSending(false)
    }
  }, [sessionId, sending, code, sendToChat])

  // 从 CanvasState 派生图结构字段
  const derived = useMemo((): {
    nodes: MermaidNode[]
    edges: MermaidEdge[]
    direction: FlowchartDirection
    metadata: GraphMetadata | undefined
  } => {
    if (isGraphCanvasState(canvas)) {
      return {
        nodes: canvas.nodes,
        edges: canvas.edges,
        direction: canvas.direction ?? 'TB',
        metadata: canvas.metadata,
      }
    }
    return { nodes: [], edges: [], direction: 'TB', metadata: undefined }
  }, [canvas])

  if (!open) return null

  return (
    <div className={darkMode ? `${css.panel} dark` : css.panel} data-mermaid-panel>
      <header className={css.header}>
        <span className={css.logo} title="Mermaid 反向编辑器">M2A</span>
        <span className={css.title}>Mermaid 反向编辑器</span>
        <span className={css.badge}>
          {DIAGRAM_TYPE_LABELS[canvas.diagramType] ?? canvas.diagramType}
        </span>
        <div className={css.spacer} />
        <button
          type="button"
          className={css.action}
          disabled={sessionId === undefined || sending || code.trim() === ''}
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
      <div className={css.body}>
        <Canvas
          syncCanvas={canvas}
          syncNodes={derived.nodes}
          syncEdges={derived.edges}
          syncDirection={derived.direction}
          syncViewport={viewport}
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
            currentType={canvas.diagramType}
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
