/**
 * DeepSeek Harness 运行时面声明（最小契约）— 仅类型，运行时不 import。
 *
 * 本插件是 out-of-tree 包：构建期不依赖 @deepseek-ai/* 的发布产物，
 * 这里按实际使用面声明宿主在运行时通过模块表/ctx 提供的接口。
 */

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 槽位服务（web-react 提供）。 */
    slots: DshSlots
    /** 会话服务（dsh-client-runtime 提供）。 */
    sessions: DshSessions
    /** 会话作用域对话服务（ui-conversation 提供）。 */
    conversation: DshConversation
    /** 严格读取可选服务。 */
    get(name: string): unknown
    /** 注册随 fiber 销毁的副作用。 */
    effect(fn: () => unknown, label?: string): void
  }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  export interface StoreSpec<T, A> {
    init: () => T
    /** 持久化键（localStorage 整值 JSON，自动恢复/写入）。 */
    persist?: string
    actions: A
  }
  export interface EngineStoreHandle<T, A> {
    readonly spec: StoreSpec<T, A>
    create(scopeKey?: string): unknown
  }
  export function defineStore<T, A extends Record<string, (draft: T, ...args: any[]) => void>>(
    spec: StoreSpec<T, A>,
  ): EngineStoreHandle<T, A>
}

/** 槽位注册选项（最小面）。 */
interface DshSlotRegisterOptions {
  name: string
  /** 声明的子槽位表（本插件不声明子槽位）。 */
  children?: Record<string, unknown>
  /** 共享 store 句柄（同一 scope 下多次注册共享同一实例）。 */
  store?: unknown
  /** 注入工厂：把 apply 闭包中的数据/回调交给组件。 */
  inject?: (actions: unknown) => Record<string, unknown>
  key?: string
  id?: string
}

interface DshSlots {
  /** 等待槽位声明后注册，声明消失时自动移除。 */
  inject(name: string, callback: () => unknown): void
  register(options: DshSlotRegisterOptions, component: unknown): () => void
}

/** 会话 id（opaque 字符串）。 */
type DshSessionId = string

interface DshSessionScope {
  conversation: DshConversation
}

/** 可观测快照（getSnapshot + subscribe）。 */
interface DshObservable<T> {
  getSnapshot(): T
  subscribe(fn: () => void): () => void
}

/** 会话列表快照的最小面。 */
interface DshSessionListState {
  current?: DshSessionId
}

/** 对话快照的最小面（仅取消息节点与助手文本块）。 */
interface DshConversationNode {
  kind: string
  seq: number
  time: number
  blocks?: readonly { kind: string; text?: string }[]
}

interface DshConversationSnapshot {
  nodes: readonly DshConversationNode[]
}

interface DshSessionBinding {
  session: DshObservable<DshConversationSnapshot>
}

interface DshSessions {
  /** 会话列表（useSessions 的标准源）。 */
  list: DshObservable<DshSessionListState>
  /** 取会话绑定（未列出/未挂载的会话返回 undefined）。 */
  binding(id: DshSessionId): DshSessionBinding | undefined
  /** 取会话作用域上下文（无该会话时返回 undefined）。 */
  scope(id: DshSessionId): DshSessionScope | undefined
}

interface DshConversation {
  /** 向调用方作用域会话发送一条提示（进入队列）。 */
  send(text: string): Promise<void>
}

/** useSessions 全局快照的最小面。 */
interface DshSessionsSnapshot {
  current?: DshSessionId
  byId: Record<string, { blank: boolean }>
}
