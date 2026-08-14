/**
 * Mermaid 面板共享 store — 启动按钮与浮动面板共用同一实例。
 *
 * 状态结构（单一真相源，多标签）：
 * - views：标签页列表，每个标签独立持有画布、代码与视口
 * - activeViewId：当前活动标签
 * - canvas/code/viewport 的写入始终作用于活动标签
 * - seenBlockKeys：已标记"已读"的对话代码块键（启动按钮角标用）
 *
 * 整个状态通过 persist 机制自动写入 localStorage，面板关闭/页面刷新后自动恢复。
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import { createEmptyCanvasState } from '@mermaid2aichat/serializer'
import type { CanvasState, Viewport } from '@mermaid2aichat/serializer'

/** 一个标签页（本地视图）。 */
export interface MermaidView {
  /** 视图唯一 id。 */
  id: string
  /** 显示标题。 */
  title: string
  /** 画布状态。 */
  canvas: CanvasState
  /** 序列化后的 Mermaid 代码。 */
  code: string
  /** 画布视口。 */
  viewport: Viewport | null
  /** 导入来源的对话代码块键（从对话导入时记录，用于「已导入」标记）。 */
  sourceBlockKey?: string
}

/** 面板状态（整值 JSON 持久化）。 */
export interface MermaidPanelState {
  /** 面板是否打开。 */
  open: boolean
  /** 面板是否最大化（页面内全屏）。 */
  maximized: boolean
  /** 编辑器暗色模式（独立于 DSH 主题，仅作用于面板内）。 */
  darkMode: boolean
  /** 标签页列表（至少一个）。 */
  views: MermaidView[]
  /** 活动标签 id。 */
  activeViewId: string
  /** 已读对话代码块键（角标去重）。 */
  seenBlockKeys: string[]
}

/** 写操作全集（组件只能通过这些 action 修改状态）。 */
export type MermaidPanelActions = {
  toggleOpen: (draft: MermaidPanelState) => void
  setOpen: (draft: MermaidPanelState, open: boolean) => void
  setMaximized: (draft: MermaidPanelState, maximized: boolean) => void
  setDarkMode: (draft: MermaidPanelState, dark: boolean) => void
  /** 新建视图并切换为活动的初始化参数（缺省时创建空白 flowchart 视图）。 */
  addView: (draft: MermaidPanelState, init?: MermaidViewInit) => void
  /** 关闭视图；最后一个视图关闭时替换为空白视图。 */
  closeView: (draft: MermaidPanelState, id: string) => void
  switchView: (draft: MermaidPanelState, id: string) => void
  renameView: (draft: MermaidPanelState, id: string, title: string) => void
  reorderViews: (draft: MermaidPanelState, orderedIds: string[]) => void
  /** 写入活动视图的画布。 */
  setCanvas: (draft: MermaidPanelState, canvas: CanvasState) => void
  /** 写入活动视图的代码。 */
  setCode: (draft: MermaidPanelState, code: string) => void
  /** 写入活动视图的视口。 */
  setViewport: (draft: MermaidPanelState, viewport: Viewport) => void
  /** 标记对话代码块已读（角标去重，保留最近 200 条）。 */
  markBlocksSeen: (draft: MermaidPanelState, keys: string[]) => void
}

/** 新建视图的初始化参数（未提供的字段取默认值）。 */
export interface MermaidViewInit {
  title?: string
  canvas?: CanvasState
  code?: string
  viewport?: Viewport | null
  sourceBlockKey?: string
}

/** 生成视图 id（面板内唯一即可）。 */
function newViewId(): string {
  return `mview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 新建空白 flowchart 视图。 */
function emptyView(init?: MermaidViewInit): MermaidView {
  return {
    id: newViewId(),
    title: init?.title ?? '新建视图',
    canvas: init?.canvas ?? createEmptyCanvasState('flowchart'),
    code: init?.code ?? '',
    viewport: init?.viewport ?? null,
    ...(init?.sourceBlockKey !== undefined ? { sourceBlockKey: init.sourceBlockKey } : {}),
  }
}

/** 活动视图下标（防御：activeViewId 失效时回退到第一个）。 */
function activeIndex(state: MermaidPanelState): number {
  const index = state.views.findIndex((v) => v.id === state.activeViewId)
  return index === -1 ? 0 : index
}

/** 创建共享 store 句柄（在 apply 中构造一次，注册给两个槽位）。 */
export function createMermaidPanelStore(): EngineStoreHandle<MermaidPanelState, MermaidPanelActions> {
  return defineStore<MermaidPanelState, MermaidPanelActions>({
    init: () => {
      const first = emptyView()
      return {
        open: false,
        maximized: false,
        darkMode: false,
        views: [first],
        activeViewId: first.id,
        seenBlockKeys: [],
      }
    },
    persist: 'mermaid2aichat.dsh.v2',
    actions: {
      toggleOpen: (d) => { d.open = !d.open },
      setOpen: (d, open) => { d.open = open },
      setMaximized: (d, maximized) => { d.maximized = maximized },
      setDarkMode: (d, dark) => { d.darkMode = dark },
      addView: (d, init) => {
        const next = emptyView(init)
        d.views.push(next)
        d.activeViewId = next.id
      },
      closeView: (d, id) => {
        const index = d.views.findIndex((v) => v.id === id)
        if (index === -1) return
        d.views.splice(index, 1)
        if (d.views.length === 0) {
          const next = emptyView()
          d.views.push(next)
          d.activeViewId = next.id
          return
        }
        if (d.activeViewId === id) {
          d.activeViewId = d.views[Math.min(index, d.views.length - 1)].id
        }
      },
      switchView: (d, id) => {
        if (d.views.some((v) => v.id === id)) d.activeViewId = id
      },
      renameView: (d, id, title) => {
        const view = d.views.find((v) => v.id === id)
        if (view !== undefined && title.trim() !== '') view.title = title.trim()
      },
      reorderViews: (d, orderedIds) => {
        const byId = new Map(d.views.map((v) => [v.id, v]))
        const next = orderedIds.map((id) => byId.get(id)).filter((v): v is MermaidView => v !== undefined)
        if (next.length !== d.views.length) return
        d.views = next
      },
      setCanvas: (d, canvas) => {
        d.views[activeIndex(d)].canvas = canvas
      },
      setCode: (d, code) => {
        d.views[activeIndex(d)].code = code
      },
      setViewport: (d, viewport) => {
        d.views[activeIndex(d)].viewport = viewport
      },
      markBlocksSeen: (d, keys) => {
        const next = new Set([...d.seenBlockKeys, ...keys])
        d.seenBlockKeys = [...next].slice(-200)
      },
    },
  })
}

/** 组件侧 bake 后的 actions 面。 */
export type MermaidPanelBakedActions = {
  toggleOpen: () => void
  setOpen: (open: boolean) => void
  setMaximized: (maximized: boolean) => void
  setDarkMode: (dark: boolean) => void
  addView: (init?: MermaidViewInit) => void
  closeView: (id: string) => void
  switchView: (id: string) => void
  renameView: (id: string, title: string) => void
  reorderViews: (orderedIds: string[]) => void
  setCanvas: (canvas: CanvasState) => void
  setCode: (code: string) => void
  setViewport: (viewport: Viewport) => void
  markBlocksSeen: (keys: string[]) => void
}
