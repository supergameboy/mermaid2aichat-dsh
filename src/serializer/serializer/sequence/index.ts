/**
 * sequence 序列化器入口
 *
 * 统一导出 sequence 序列化相关的公共 API
 */

export { serializeSequence } from './sequence-serializer.js';
export { serializeParticipants } from './participant-serializer.js';
export { serializeMessage } from './message-serializer.js';
export { serializeNotes, serializeNote } from './note-serializer.js';
export {
  serializeBlockStart,
  serializeBlockEnd,
  serializeBlockMidBranch,
  serializeBlockMidBranches,
  hasBlockMid,
} from './block-serializer.js';
