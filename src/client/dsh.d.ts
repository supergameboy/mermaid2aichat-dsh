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
    /** 输入触发源注册（ui-input-trigger 提供）。 */
    inputTriggers: DshInputTriggers
    /** 严格读取可选服务。 */
    get(name: string): unknown
    /** 注册副作用：fn 立即执行，其返回值为销毁器（随 fiber 清理）。 */
    effect(fn: () => unknown, label?: string): void
  }
}

/** 输入触发源注册面的最小契约。 */
interface DshInputTriggers {
  registerSource(source: unknown): () => void
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

/** prompt 结果的最小面（判别联合）。 */
type DshPromptResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } }

interface DshSessionBinding {
  session: DshObservable<DshConversationSnapshot> & {
    /** 向会话发送提示（'queue' 追加一个轮次）。 */
    prompt(content: readonly { type: string; text: string }[], mode: 'queue' | 'steer'): Promise<DshPromptResult>
  }
}

interface DshSessions {
  /** 会话列表（useSessions 的标准源）。 */
  list: DshObservable<DshSessionListState>
  /** 取会话绑定（未列出/未挂载的会话返回 undefined）。 */
  binding(id: DshSessionId): DshSessionBinding | undefined
}

/** useSessions 全局快照的最小面。 */
interface DshSessionsSnapshot {
  current?: DshSessionId
  byId: Record<string, { blank: boolean }>
}
