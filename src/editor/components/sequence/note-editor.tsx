/**
 * NoteEditor — 时序图注释属性编辑面板
 *
 * 单一职责：编辑注释的关联参与者列表、位置、文本、附着消息索引
 *
 * B4.2 补全：
 *   - participantIds 多选下拉（支持 `Note over A,B` 多参与者；原 participantId 单选已废弃）
 *   - messageIndex 可调下拉（基于 messages 列表选择附着位置）
 *   - 删除冗余 noteIndex prop（注释索引由父组件管理，编辑器不需要）
 */
import { memo } from 'react';
import type {
  SequenceNoteInfo,
  SequenceParticipant,
  SequenceMessage,
} from '@mermaid2aichat/serializer';

export interface NoteEditorProps {
  /** 当前编辑的注释信息 */
  note: SequenceNoteInfo;
  /** 可用的参与者列表 */
  participants: SequenceParticipant[];
  /** 全部消息列表（用于 messageIndex 下拉选择） */
  messages: SequenceMessage[];
  /** 更新回调 */
  onUpdate: (data: Partial<SequenceNoteInfo>) => void;
}

/** 注释位置选项 */
const NOTE_POSITION_OPTIONS: { value: 'left' | 'right' | 'over'; label: string }[] = [
  { value: 'left', label: 'Left of' },
  { value: 'right', label: 'Right of' },
  { value: 'over', label: 'Over' },
];

/** 注释编辑面板组件 */
export const NoteEditor = memo(function NoteEditor({
  note,
  participants,
  messages,
  onUpdate,
}: NoteEditorProps) {
  /** 切换参与者多选 */
  const handleToggleParticipant = (participantId: string) => {
    const current = note.participantIds;
    const next = current.includes(participantId)
      ? current.filter((id) => id !== participantId)
      : [...current, participantId];
    onUpdate({ participantIds: next });
  };

  return (
    <div className="panel-content">
      {/* 关联参与者（多选，支持 Note over A,B） */}
      <div className="panel-label">
        关联参与者
        <div className="panel-checkbox-group" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
          {participants.map((p) => (
            <label key={p.id} className="panel-checkbox-row">
              <input
                type="checkbox"
                checked={note.participantIds.includes(p.id)}
                onChange={() => handleToggleParticipant(p.id)}
              />
              {p.label}
            </label>
          ))}
          {participants.length === 0 && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
              无可用参与者
            </span>
          )}
        </div>
      </div>

      {/* 位置 */}
      <label className="panel-label">
        位置
        <select
          className="panel-select"
          value={note.position}
          onChange={(e) =>
            onUpdate({ position: e.target.value as 'left' | 'right' | 'over' })
          }
        >
          {NOTE_POSITION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 注释文本 */}
      <label className="panel-label">
        注释文本
        <textarea
          className="panel-input"
          rows={3}
          value={note.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </label>

      {/* 附着消息索引（基于 messages 列表下拉选择） */}
      <label className="panel-label">
        附着消息位置
        <select
          className="panel-select"
          value={note.messageIndex}
          onChange={(e) => onUpdate({ messageIndex: Number(e.target.value) })}
        >
          <option value={0}>消息之前（开头）</option>
          {messages.map((msg, index) => (
            <option key={msg.id} value={index + 1}>
              第 {index + 1} 条消息后：{msg.from} → {msg.to}{msg.label ? ` (${msg.label})` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="panel-info">
        <span className="info-label">消息索引:</span>
        <span className="info-value">{note.messageIndex}</span>
      </div>
    </div>
  );
});
