/**
 * Mermaid 面板共享 store — 启动器按钮与浮动面板共用同一实例。
 *
 * 状态结构（单一真相源）：
 * - canvas：当前画布（类型切换 / sequence 编辑时整体更新；graph 同类型编辑时
 *   保持旧值，画布内部 state 独立演进，避免同步回环）
 * - code：序列化后的 Mermaid 代码（任何编辑后更新，发送到对话时读取）
 * - viewport：画布视口（平移/缩放）
 *
 * 整个状态通过 persist 机制自动写入 localStorage，面板关闭/页面刷新后自动恢复。
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import { createEmptyCanvasState } from '@mermaid2aichat/serializer'
import type { CanvasState, Viewport } from '@mermaid2aichat/serializer'

/** 面板状态（整值 JSON 持久化）。 */
export interface MermaidPanelState {
  /** 面板是否打开。 */
  open: boolean
  /** 编辑器暗色模式（独立于 DSH 主题，仅作用于面板内）。 */
  darkMode: boolean
  /** 当前画布状态。 */
  canvas: CanvasState
  /** 序列化后的 Mermaid 代码。 */
  code: string
  /** 画布视口。 */
  viewport: Viewport | null
}

/** 写操作全集（组件只能通过这些 action 修改状态）。 */
export type MermaidPanelActions = {
  toggleOpen: (draft: MermaidPanelState) => void
  setOpen: (draft: MermaidPanelState, open: boolean) => void
  setDarkMode: (draft: MermaidPanelState, dark: boolean) => void
  setCanvas: (draft: MermaidPanelState, canvas: CanvasState) => void
  setCode: (draft: MermaidPanelState, code: string) => void
  setViewport: (draft: MermaidPanelState, viewport: Viewport) => void
}

/** 创建共享 store 句柄（在 apply 中构造一次，注册给两个槽位）。 */
export function createMermaidPanelStore(): EngineStoreHandle<MermaidPanelState, MermaidPanelActions> {
  return defineStore<MermaidPanelState, MermaidPanelActions>({
    init: () => ({
      open: false,
      darkMode: false,
      canvas: createEmptyCanvasState('flowchart'),
      code: '',
      viewport: null,
    }),
    persist: 'mermaid2aichat.dsh.v1',
    actions: {
      toggleOpen: (d) => { d.open = !d.open },
      setOpen: (d, open) => { d.open = open },
      setDarkMode: (d, dark) => { d.darkMode = dark },
      setCanvas: (d, canvas) => { d.canvas = canvas },
      setCode: (d, code) => { d.code = code },
      setViewport: (d, viewport) => { d.viewport = viewport },
    },
  })
}

/** 组件侧 bake 后的 actions 面。 */
export type MermaidPanelBakedActions = {
  toggleOpen: () => void
  setOpen: (open: boolean) => void
  setDarkMode: (dark: boolean) => void
  setCanvas: (canvas: CanvasState) => void
  setCode: (code: string) => void
  setViewport: (viewport: Viewport) => void
}
