/**
 * Sequence Diagram AST 类型定义
 *
 * 单一职责：定义 SequenceDB.getData() 返回的 AST 结构
 * 来源：对齐官方 mermaid packages/mermaid/src/diagrams/sequence/sequenceDb.ts 的 getData() 返回值
 *
 * 注意：
 * - 核心类型（SequenceArrowType / SequenceBlockType / SequenceParticipantInfo / SequenceBlockInfo / SequenceNoteInfo）
 *   已在 M0 `packages/serializer/src/types.ts` 中统一定义，本文件不重新定义
 * - 本文件仅定义 sequence 解析器内部使用的 AST 层数据结构
 * - Actor/Message/Note/Box/AddMessageParams 从 parser/sequence/types.ts 引用
 */
import type { Actor, Box, Message, Note } from '../parser/sequence/types.js';

/** Sequence 解析后的 AST（SequenceDB.getData() 返回结构） */
export interface SequenceAST {
  /** 参与者映射（id → Actor） */
  actors: Map<string, Actor>;
  /** 消息列表（含信号/块标记/Note 标记，按时间顺序） */
  messages: Message[];
  /** Note 列表 */
  notes: Note[];
  /** Box 分组列表 */
  boxes: Box[];
  /** 创建的参与者（id → 创建时的消息索引） */
  createdActors: Map<string, number>;
  /** 销毁的参与者（id → 销毁时的消息索引） */
  destroyedActors: Map<string, number>;
  /** 是否启用自动编号 */
  sequenceNumbersEnabled: boolean;
  /** Accessibility 标题 */
  accTitle: string | undefined;
  /** Accessibility 描述 */
  accDescr: string | undefined;
}

/** Sequence 信号类型（消息/注释/块结构的语义分类） */
export type SequenceSignalType = 'message' | 'note' | 'block';
