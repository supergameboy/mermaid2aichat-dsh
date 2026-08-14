/**
 * Mermaid 面板状态层 — 会话隔离的单一真相源。
 *
 * 自研可观测源（getSnapshot + subscribe）替代 DSH store 引擎：
 * - apply 层代码（输入触发源、代码块源）与组件共用同一实例，可随时读快照
 * - 标签页按会话隔离：state.sessions[sessionId] 独立持有 views/activeViewId
 * - 整值 JSON 持久化到 localStorage（键 mermaid2aichat.dsh.v3），启动时恢复
 *
 * 不可变更新 + 引用交换发布（快照引用在内容不变时保持稳定）。
 */
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
  /** 导入来源的对话代码块键（「已导入」标记用）。 */
  sourceBlockKey?: string
  /** 是否来自 AI 工具调用（mermaid_load）自动导入。 */
  fromTool?: boolean
}

/** 一个会话的标签页集合。 */
export interface MermaidSessionViews {
  views: MermaidView[]
  activeViewId: string
}

/** 面板全局状态。 */
export interface MermaidAppState {
  open: boolean
  maximized: boolean
  darkMode: boolean
  /** 按会话 id 隔离的标签页。 */
  sessions: Record<string, MermaidSessionViews>
  seenBlockKeys: string[]
}

const PERSIST_KEY = 'mermaid2aichat.dsh.v3'

function newViewId(): string {
  return `mview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function emptyView(): MermaidView {
  return {
    id: newViewId(),
    title: '新建视图',
    canvas: createEmptyCanvasState('flowchart'),
    code: '',
    viewport: null,
  }
}

function freshState(): MermaidAppState {
  return {
    open: false,
    maximized: false,
    darkMode: false,
    sessions: {},
    seenBlockKeys: [],
  }
}

/** 恢复持久化状态（容忍损坏/缺失字段，回退新状态）。 */
function hydrate(): MermaidAppState {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(PERSIST_KEY)
    if (raw === null) return freshState()
    const parsed = JSON.parse(raw) as Partial<MermaidAppState>
    const base = freshState()
    if (typeof parsed.open === 'boolean') base.open = parsed.open
    if (typeof parsed.maximized === 'boolean') base.maximized = parsed.maximized
    if (typeof parsed.darkMode === 'boolean') base.darkMode = parsed.darkMode
    if (parsed.sessions !== null && typeof parsed.sessions === 'object' && !Array.isArray(parsed.sessions)) {
      base.sessions = parsed.sessions as Record<string, MermaidSessionViews>
    }
    if (Array.isArray(parsed.seenBlockKeys)) base.seenBlockKeys = parsed.seenBlockKeys
    return base
  } catch {
    return freshState()
  }
}

/** 写操作全集（全部会话寻址）。 */
export interface MermaidActions {
  toggleOpen(): void
  setOpen(open: boolean): void
  setMaximized(maximized: boolean): void
  setDarkMode(dark: boolean): void
  /** 在指定会话新建标签并切换为活动（init 缺省为空白 flowchart 视图）。 */
  addView(sessionId: string, init?: MermaidViewInit): void
  closeView(sessionId: string, id: string): void
  switchView(sessionId: string, id: string): void
  renameView(sessionId: string, id: string, title: string): void
  reorderViews(sessionId: string, orderedIds: string[]): void
  setCanvas(sessionId: string, canvas: CanvasState): void
  setCode(sessionId: string, code: string): void
  setViewport(sessionId: string, viewport: Viewport): void
  markBlocksSeen(keys: string[]): void
}

export interface MermaidViewInit {
  title?: string
  canvas?: CanvasState
  code?: string
  viewport?: Viewport | null
  sourceBlockKey?: string
  fromTool?: boolean
}

/** 会话标签集合的不可变更新辅助：缺失的会话先物化一个空白标签，再交给 fn。 */
function updateSession(
  state: MermaidAppState,
  sessionId: string,
  fn: (session: MermaidSessionViews) => MermaidSessionViews,
): MermaidAppState {
  const current = state.sessions[sessionId]
  const base = current !== undefined
    ? current
    : (() => { const v = emptyView(); return { views: [v], activeViewId: v.id } })()
  let next = fn(base)
  if (next.views.length > 0 && !next.views.some((v) => v.id === next.activeViewId)) {
    next = { ...next, activeViewId: next.views[0].id }
  }
  return { ...state, sessions: { ...state.sessions, [sessionId]: next } }
}

/**
 * 创建面板状态：返回共享可观测源 + 全部写动作 + 销毁函数。
 * 每个动作先不可变更新，再引用交换发布，最后整值持久化。
 */
export function createMermaidState(): {
  source: { getSnapshot(): MermaidAppState; subscribe(fn: () => void): () => void }
  actions: MermaidActions
  dispose: () => void
} {
  let state = hydrate()
  const listeners = new Set<() => void>()

  const commit = (next: MermaidAppState): void => {
    if (next === state) return
    state = next
    for (const fn of [...listeners]) fn()
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(PERSIST_KEY, JSON.stringify(state))
    } catch {
      // 存储失败（配额/隐私模式）只禁用持久化，不影响内存状态。
    }
  }

  const actions: MermaidActions = {
    toggleOpen: () => { commit({ ...state, open: !state.open }) },
    setOpen: (open) => { commit({ ...state, open }) },
    setMaximized: (maximized) => { commit({ ...state, maximized }) },
    setDarkMode: (darkMode) => { commit({ ...state, darkMode }) },
    addView: (sessionId, init) => {
      commit(updateSession(state, sessionId, (session) => {
        const view: MermaidView = {
          id: newViewId(),
          title: init?.title ?? '新建视图',
          canvas: init?.canvas ?? createEmptyCanvasState('flowchart'),
          code: init?.code ?? '',
          viewport: init?.viewport ?? null,
          ...(init?.sourceBlockKey !== undefined ? { sourceBlockKey: init.sourceBlockKey } : {}),
          ...(init?.fromTool === true ? { fromTool: true } : {}),
        }
        return { views: [...session.views, view], activeViewId: view.id }
      }))
    },
    closeView: (sessionId, id) => {
      commit(updateSession(state, sessionId, (session) => {
        const index = session.views.findIndex((v) => v.id === id)
        if (index === -1) return session
        const views = session.views.filter((v) => v.id !== id)
        if (views.length === 0) {
          const fresh = emptyView()
          return { views: [fresh], activeViewId: fresh.id }
        }
        const activeViewId = session.activeViewId === id
          ? views[Math.min(index, views.length - 1)].id
          : session.activeViewId
        return { views, activeViewId }
      }))
    },
    switchView: (sessionId, id) => {
      commit(updateSession(state, sessionId, (session) =>
        session.views.some((v) => v.id === id) ? { ...session, activeViewId: id } : session))
    },
    renameView: (sessionId, id, title) => {
      const trimmed = title.trim()
      if (trimmed === '') return
      commit(updateSession(state, sessionId, (session) => ({
        ...session,
        views: session.views.map((v) => (v.id === id ? { ...v, title: trimmed } : v)),
      })))
    },
    reorderViews: (sessionId, orderedIds) => {
      commit(updateSession(state, sessionId, (session) => {
        const byId = new Map(session.views.map((v) => [v.id, v]))
        const views = orderedIds.map((id) => byId.get(id)).filter((v): v is MermaidView => v !== undefined)
        if (views.length !== session.views.length) return session
        return { ...session, views }
      }))
    },
    setCanvas: (sessionId, canvas) => {
      commit(updateSession(state, sessionId, (session) => ({
        ...session,
        views: session.views.map((v) => (v.id === session.activeViewId ? { ...v, canvas } : v)),
      })))
    },
    setCode: (sessionId, code) => {
      commit(updateSession(state, sessionId, (session) => ({
        ...session,
        views: session.views.map((v) => (v.id === session.activeViewId ? { ...v, code } : v)),
      })))
    },
    setViewport: (sessionId, viewport) => {
      commit(updateSession(state, sessionId, (session) => ({
        ...session,
        views: session.views.map((v) => (v.id === session.activeViewId ? { ...v, viewport } : v)),
      })))
    },
    markBlocksSeen: (keys) => {
      if (keys.length === 0) return
      const next = [...new Set([...state.seenBlockKeys, ...keys])].slice(-200)
      commit({ ...state, seenBlockKeys: next })
    },
  }

  return {
    source: {
      getSnapshot: () => state,
      subscribe: (fn: () => void): (() => void) => {
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
    },
    actions,
    dispose: () => { listeners.clear() },
  }
}
