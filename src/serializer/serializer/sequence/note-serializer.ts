/**
 * sequence 序列化器 — Note 序列化
 *
 * 单一职责：将 SequenceNoteInfo[] 序列化为 Mermaid Note 代码
 *
 * 输出格式:
 *   - "Note left of A: note text\n"
 *   - "Note right of B: note text\n"
 *   - "Note over A: note text\n"
 *   - "Note over A,B: note text\n"（B4.1: 多参与者用逗号连接）
 *
 * B4.1 P3-4 修复：
 *   - participantId（单值）→ participantIds.join(',')（多参与者逗号连接）
 *   - 单参与者时 participantIds 长度为 1，输出 `Note over A: text`
 *   - 多参与者时输出 `Note over A,B,C: text`
 */

import type { SequenceNoteInfo } from '../../types.js';

/** Note 位置 → 关键字 */
const PLACEMENT_KEYWORD: Record<SequenceNoteInfo['position'], string> = {
  left: 'left of',
  right: 'right of',
  over: 'over',
};

/**
 * 序列化 Note 列表
 *
 * @param notes - Note 信息列表
 * @param indent - 缩进（用于块内 Note）
 * @returns 序列化后的代码行数组
 */
export function serializeNotes(
  notes: SequenceNoteInfo[],
  indent = '',
): string[] {
  const lines: string[] = [];

  for (const note of notes) {
    const placement = PLACEMENT_KEYWORD[note.position];
    const label = note.label;
    // B4.1 P3-4: 多参与者用逗号连接（participantIds 数组，单参与者时长度为 1）
    const participants = note.participantIds.join(',');
    lines.push(`${indent}Note ${placement} ${participants}: ${label}`);
  }

  if (notes.length > 0) {
    lines.push('');
  }

  return lines;
}

/**
 * 序列化单个 Note（供 sequence-serializer 按时间顺序插入时使用）
 *
 * @param note - Note 信息
 * @param indent - 缩进
 * @returns 序列化后的单行代码
 */
export function serializeNote(note: SequenceNoteInfo, indent = ''): string {
  const placement = PLACEMENT_KEYWORD[note.position];
  const label = note.label;
  // B4.1 P3-4: 多参与者用逗号连接
  const participants = note.participantIds.join(',');
  return `${indent}Note ${placement} ${participants}: ${label}`;
}
