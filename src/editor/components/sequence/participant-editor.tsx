/**
 * ParticipantEditor — 时序图参与者属性编辑面板
 *
 * 单一职责：编辑参与者名称、类型、所属 Box、wrap、links、properties
 *
 * B4.2 补全：
 *   - 新增 wrap checkbox（SequenceParticipant.wrap）
 *   - box 归属改用 onUpdateBoxAssignment 回调（单一数据源：box.actorKeys）
 *     不再通过 onUpdate({ boxId }) 直接更新 participant.boxId
 *   - links/properties 从 JSON textarea 改为结构化键值对编辑器
 *
 * 设计偏差（B2 修订记录）：
 *   - 设计文档使用 MermaidNode，实际使用 SequenceParticipant（单一数据源）
 *   - 设计文档提到的 alias 独立字段实际由 label 承担
 *     （当 label !== id 时序列化为 `participant id as label`）
 */
import { memo } from 'react';
import type {
  SequenceParticipant,
  SequenceBoxInfo,
  SequenceActorType,
} from '@mermaid2aichat/serializer';

export interface ParticipantEditorProps {
  /** 当前编辑的参与者 */
  participant: SequenceParticipant;
  /** 可用的 Box 列表 */
  boxes: SequenceBoxInfo[];
  /** 更新参与者字段回调（不含 box 归属） */
  onUpdate: (data: Partial<SequenceParticipant>) => void;
  /** 切换 box 归属（单一数据源：更新对应 box.actorKeys） */
  onUpdateBoxAssignment: (boxId: string | null) => void;
}

/** 参与者类型选项（覆盖 8 种 SequenceActorType，对齐 mermaid 官方语法） */
const ACTOR_TYPE_OPTIONS: { value: SequenceActorType; label: string }[] = [
  { value: 'participant', label: 'Participant' },
  { value: 'actor', label: 'Actor' },
  { value: 'boundary', label: 'Boundary' },
  { value: 'collections', label: 'Collections' },
  { value: 'control', label: 'Control' },
  { value: 'database', label: 'Database' },
  { value: 'entity', label: 'Entity' },
  { value: 'queue', label: 'Queue' },
];

/** 从 boxes 反查参与者所属 box id（基于 box.actorKeys 单一数据源） */
function findBoxIdByActor(boxes: SequenceBoxInfo[], actorId: string): string | null {
  for (const box of boxes) {
    if (box.actorKeys.includes(actorId)) return box.id;
  }
  return null;
}

/** 将 Record<string, unknown> 转为可编辑的键值对数组 */
function toEntries(record: Record<string, unknown> | undefined): Array<{ key: string; value: string }> {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

/** 将键值对数组转回 Record<string, unknown> */
function fromEntries(entries: Array<{ key: string; value: string }>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const { key, value } of entries) {
    if (key.trim() === '') continue;
    result[key] = value;
  }
  return result;
}

/** 结构化键值对编辑器 */
interface KeyValueEditorProps {
  label: string;
  entries: Array<{ key: string; value: string }>;
  onChange: (entries: Array<{ key: string; value: string }>) => void;
}

function KeyValueEditor({ label, entries, onChange }: KeyValueEditorProps) {
  const handleUpdate = (index: number, field: 'key' | 'value', newValue: string) => {
    const next = entries.map((entry, i) =>
      i === index ? { ...entry, [field]: newValue } : entry,
    );
    onChange(next);
  };

  const handleAdd = () => {
    onChange([...entries, { key: '', value: '' }]);
  };

  const handleRemove = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className="panel-label">
      {label}
      <div className="panel-kv-list" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
        {entries.map((entry, index) => (
          <div key={index} className="panel-kv-row" style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <input
              className="panel-input"
              type="text"
              placeholder="键"
              value={entry.key}
              onChange={(e) => handleUpdate(index, 'key', e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              className="panel-input"
              type="text"
              placeholder="值"
              value={entry.value}
              onChange={(e) => handleUpdate(index, 'value', e.target.value)}
              style={{ flex: 2 }}
            />
            <button
              type="button"
              className="panel-button"
              onClick={() => handleRemove(index)}
              aria-label={`删除 ${label} 第 ${index + 1} 项`}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="panel-button" onClick={handleAdd}>
          + 添加
        </button>
      </div>
    </div>
  );
}

/** 参与者编辑面板组件 */
export const ParticipantEditor = memo(function ParticipantEditor({
  participant,
  boxes,
  onUpdate,
  onUpdateBoxAssignment,
}: ParticipantEditorProps) {
  const linksEntries = toEntries(participant.links);
  const propertiesEntries = toEntries(participant.properties);
  // 基于 box.actorKeys 单一数据源反查当前 box 归属
  const currentBoxId = findBoxIdByActor(boxes, participant.id);

  return (
    <div className="panel-content">
      {/* 名称（label 字段；当 label !== id 时序列化为 `participant id as label`） */}
      <label className="panel-label">
        名称
        <input
          className="panel-input"
          type="text"
          value={participant.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </label>

      {/* 参与者类型（8 种） */}
      <label className="panel-label">
        类型
        <select
          className="panel-select"
          value={participant.actorType}
          onChange={(e) =>
            onUpdate({ actorType: e.target.value as SequenceActorType })
          }
        >
          {ACTOR_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 自动换行（participant 级别，区别于 box.wrap） */}
      <label className="panel-label panel-checkbox-row">
        <input
          type="checkbox"
          checked={participant.wrap === true}
          onChange={(e) => onUpdate({ wrap: e.target.checked })}
        />
        自动换行
      </label>

      {/* 所属 Box（基于 box.actorKeys 单一数据源反查，切换时触发 onUpdateBoxAssignment） */}
      <label className="panel-label">
        所属 Box
        <select
          className="panel-select"
          value={currentBoxId ?? ''}
          onChange={(e) =>
            onUpdateBoxAssignment(e.target.value === '' ? null : e.target.value)
          }
        >
          <option value="">（无）</option>
          {boxes.map((box) => (
            <option key={box.id} value={box.id}>
              {box.name}
            </option>
          ))}
        </select>
      </label>

      {/* Links 结构化键值对编辑器 */}
      <KeyValueEditor
        label="Links"
        entries={linksEntries}
        onChange={(next) => onUpdate({ links: fromEntries(next) })}
      />

      {/* Properties 结构化键值对编辑器 */}
      <KeyValueEditor
        label="Properties"
        entries={propertiesEntries}
        onChange={(next) => onUpdate({ properties: fromEntries(next) })}
      />

      <div className="panel-info">
        <span className="info-label">ID:</span>
        <span className="info-value">{participant.id}</span>
      </div>
    </div>
  );
});
