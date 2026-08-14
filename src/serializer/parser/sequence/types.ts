/**
 * Sequence 专用 AST 层类型定义
 *
 * 单一职责：定义 SequenceDB 内部使用的 Actor/Message/Note/Box/AddMessageParams 类型
 * 来源：移植自官方 mermaid packages/mermaid/src/diagrams/sequence/types.ts
 *
 * 注意：
 * - 核心类型（SequenceArrowType / SequenceBlockType / SequenceParticipantInfo / SequenceBlockInfo / SequenceNoteInfo）
 *   已在 M0 `packages/serializer/src/types.ts` 中统一定义，本文件不重新定义
 * - 本文件仅定义 sequence 解析器内部使用的 AST 层数据结构
 */

/** Sequence Box（参与者分组） */
export interface Box {
  name: string;
  wrap: boolean;
  fill: string;
  actorKeys: string[];
}

/** Sequence Actor（参与者） */
export interface Actor {
  box?: Box;
  name: string;
  description: string;
  wrap: boolean;
  prevActor?: string;
  nextActor?: string;
  links: Record<string, unknown>;
  properties: Record<string, unknown>;
  actorCnt: number | null;
  rectData: unknown;
  type: string;
  /**
   * 是否为显式声明（`participant`/`actor` 语句）vs 消息派生
   *
   * - true: 用户显式写了 `participant X` / `actor X` / `create participant X`
   * - false: 从消息引用派生（`X->>Y: msg` 中 X/Y 未显式声明）
   * - undefined: 兼容旧数据（mapCanvasStateToAst 默认为 true，UI 创建视为显式）
   *
   * 判别信号：addActor 第 4 参数 type（= jison obj.draw）
   *   - 定义（'participant'/'actor'/...）→ 显式声明 → true
   *   - undefined → 消息派生 → false
   *
   * 序列化层（serializeParticipants）跳过 explicitlyDeclared === false 的 actor
   */
  explicitlyDeclared?: boolean;
}

/** Sequence Message（消息/信号）
 *
 * B4.1 扩展：
 *   - 新增 `create?: boolean`：create 修饰符（消息触发 target 参与者创建）
 *   - 新增 `destroy?: boolean`：destroy 修饰符（消息触发 target 参与者销毁）
 *   - 新增 `color?: string`：rect 块专用颜色（独立字段，不再复用 message 字段）
 */
export interface Message {
  id: number;
  from?: string;
  to?: string;
  message: string | { start: number; step: number; visible: boolean };
  wrap: boolean;
  answer?: unknown;
  type?: number;
  activate?: boolean;
  /** `-` 简写停用信号（对应 jison activeEnd，actor = msg.from 即 SOURCE）
   *  官方 jison sequenceDiagram.jison:338 `actor signaltype '-' actor text2 → activeEnd actor: $1.actor`
   *  `-` 停用 SOURCE（消息发送方），与 `+` 激活 TARGET（消息接收方）对称
   *  forward mapping (sequence-parser.ts) 将 ACTIVE_END 标记到最近 edge.data.deactivate=true
   *  reverse mapping (sequence-ast-mapper.ts) 从 edge.data.deactivate 派生 msg.deactivate
   *  渲染层 processMessages 调用 bounds.endActivation({ from: msg.from }) */
  deactivate?: boolean;
  placement?: string;
  centralConnection?: number;
  /** B4.1 新增：create 修饰符（消息触发 target 参与者创建） */
  create?: boolean;
  /** B4.1 新增：destroy 修饰符（消息触发 target 参与者销毁） */
  destroy?: boolean;
  /** B4.1 新增：rect 块专用颜色（rectStart 信号时存储，mapBlockToMetadata 派生到 block.color） */
  color?: string;
  /** 独立 activate 语句的 actor 列表（`activate X` 语法，从 SequenceMessage.activateActors 映射） */
  activateActors?: string[];
  /** 独立 deactivate 语句的 actor 列表（`deactivate X` 语法，从 SequenceMessage.deactivateActors 映射） */
  deactivateActors?: string[];
}

/** Sequence addMessage 参数 */
export interface AddMessageParams {
  from: string;
  to: string;
  msg: string;
  signalType: number;
  type: string;
  activate: boolean;
}

/** Sequence Note（注释）
 *
 * B4.1 P3-4 修复：统一存储到 `participantIds` 数组
 *   - 无论单参与者还是多参与者，统一存储到 `participantIds` 数组
 *   - 单参与者时长度为 1，多参与者时长度为 N
 *   - 不再使用 `actor: { actor: string }` 单参与者字段，消除双数据表示
 */
export interface Note {
  /** 关联参与者 ID 列表（B4.1 P3-4 修复：统一数组存储，单参与者时长度为 1） */
  participantIds: string[];
  placement: Message['placement'];
  message: string;
  wrap: boolean;
}
