/**
 * BoxEditor — 时序图 Box 分组属性编辑面板
 *
 * 单一职责：编辑 Box 名称、颜色（rgba）、包含的参与者、wrap
 *
 * B4.2 补全：
 *   - color 统一 rgba 格式输出（对齐 mermaid box 语法 `box rgba(r,g,b,a) Name`）
 *     * color picker 选择 RGB + alpha 滑块控制透明度
 *     * 文本输入框允许直接编辑 rgba 字符串
 *   - 新增 wrap checkbox（box 级自动换行，区别于 participant.wrap）
 *   - 删除冗余 boxIndex prop
 *
 * 单一数据源（B4 决策2）：
 *   - actorKeys 是 box 归属的单一数据源
 *   - participant.sequenceBoxName 已废弃，不再同步
 *   - 勾选/取消勾选参与者只需更新当前 box.actorKeys
 *     父组件负责从其他 box.actorKeys 移除（避免一个参与者属于多个 box）
 */
import { memo } from 'react';
import type {
  SequenceBoxInfo,
  SequenceParticipant,
} from '@mermaid2aichat/serializer';

export interface BoxEditorProps {
  /** 当前编辑的 Box 信息 */
  box: SequenceBoxInfo;
  /** 可用的参与者列表 */
  participants: SequenceParticipant[];
  /** 更新回调 */
  onUpdate: (data: Partial<SequenceBoxInfo>) => void;
}

/** Box 编辑面板组件 */
export const BoxEditor = memo(function BoxEditor({
  box,
  participants,
  onUpdate,
}: BoxEditorProps) {
  /** 切换参与者多选（仅更新当前 box.actorKeys，父组件负责从其他 box 移除） */
  const toggleActor = (actorId: string) => {
    const current = box.actorKeys;
    const next = current.includes(actorId)
      ? current.filter((k) => k !== actorId)
      : [...current, actorId];
    onUpdate({ actorKeys: next });
  };

  /** 从 rgba 字符串解析 RGB 与 alpha */
  const parsed = parseRgba(box.color);

  /** color picker 选择 RGB（保留原 alpha） */
  const handleColorPick = (hex: string) => {
    const { r, g, b } = parseHex(hex);
    onUpdate({ color: `rgba(${r},${g},${b},${parsed.a})` });
  };

  /** alpha 滑块调整透明度（保留原 RGB） */
  const handleAlphaChange = (alpha: number) => {
    onUpdate({ color: `rgba(${parsed.r},${parsed.g},${parsed.b},${alpha.toFixed(2)})` });
  };

  return (
    <div className="panel-content">
      {/* 名称 */}
      <label className="panel-label">
        名称
        <input
          className="panel-input"
          type="text"
          value={box.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      </label>

      {/* 颜色（统一 rgba 格式，对齐 mermaid box 语法） */}
      <div className="panel-label">
        颜色
        <div className="panel-color-row" style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center', marginTop: 'var(--space-1)' }}>
          <input
            className="panel-color"
            type="color"
            value={rgbToHex(parsed.r, parsed.g, parsed.b)}
            onChange={(e) => handleColorPick(e.target.value)}
            aria-label="选择颜色"
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={parsed.a}
            onChange={(e) => handleAlphaChange(Number(e.target.value))}
            aria-label="透明度"
            style={{ width: 80 }}
          />
          <input
            className="panel-input"
            type="text"
            value={box.color}
            placeholder="rgba(255,0,0,0.2)"
            onChange={(e) => onUpdate({ color: e.target.value })}
            style={{ flex: 1, fontFamily: 'Consolas, Monaco, monospace', fontSize: 12 }}
          />
        </div>
      </div>

      {/* 自动换行（box 级别，区别于 participant.wrap） */}
      <label className="panel-label panel-checkbox-row">
        <input
          type="checkbox"
          checked={box.wrap === true}
          onChange={(e) => onUpdate({ wrap: e.target.checked })}
        />
        自动换行
      </label>

      {/* 参与者多选（单一数据源：box.actorKeys） */}
      <div className="panel-label">
        包含参与者
        <div className="panel-checkbox-group" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
          {participants.map((p) => (
            <label key={p.id} className="panel-checkbox-row">
              <input
                type="checkbox"
                checked={box.actorKeys.includes(p.id)}
                onChange={() => toggleActor(p.id)}
              />
              {p.label}
            </label>
          ))}
          {participants.length === 0 && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>无可用参与者</span>
          )}
        </div>
      </div>

      <div className="panel-info">
        <span className="info-label">ID:</span>
        <span className="info-value">{box.id}</span>
      </div>
    </div>
  );
});

/** rgba 字符串解析为 RGB 与 alpha */
function parseRgba(color: string): { r: number; g: number; b: number; a: number } {
  const match = color.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (match) {
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] !== undefined ? Number(match[4]) : 1,
    };
  }
  // hex 格式
  const hexMatch = color.match(/^#([0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const { r, g, b } = parseHex(color);
    return { r, g, b, a: 1 };
  }
  // 默认值
  return { r: 24, g: 144, b: 255, a: 0.2 };
}

/** #rrggbb 转 RGB */
function parseHex(hex: string): { r: number; g: number; b: number } {
  const match = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(match[1].slice(0, 2), 16),
    g: parseInt(match[1].slice(2, 4), 16),
    b: parseInt(match[1].slice(4, 6), 16),
  };
}

/** RGB 转 #rrggbb */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex2 = (v: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(v)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}
