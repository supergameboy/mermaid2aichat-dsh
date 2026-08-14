/**
 * BlockEditor — 时序图块结构属性编辑面板
 *
 * 单一职责：编辑块类型、标签/颜色、起止消息范围、中间分支列表
 *
 * B4.2 补全：
 *   - 移除 autonumber 选项（autonumber 是 metadata 级开关，非块类型）
 *   - rect 类型时隐藏 label 输入，改用 color picker（独立 color 字段）
 *   - 新增 midBranches 子分支列表编辑器（增删改）
 *     * alt → else, par/par-over → and, critical → option
 *     * opt/loop/break/rect 无 midBranches
 *   - start/endMessage 改为下拉（基于 messages 列表选择）
 *   - 删除冗余 blockIndex prop
 */
import { memo } from 'react';
import type {
  SequenceBlockInfo,
  SequenceBlockType,
  SequenceBlockMidBranch,
  SequenceMessage,
} from '@mermaid2aichat/serializer';

export interface BlockEditorProps {
  /** 当前编辑的块信息 */
  block: SequenceBlockInfo;
  /** 全部消息列表（用于 start/endMessage 下拉选择） */
  messages: SequenceMessage[];
  /** 更新回调 */
  onUpdate: (data: Partial<SequenceBlockInfo>) => void;
}

/** 块类型选项（8 种，移除 autonumber） */
const BLOCK_TYPE_OPTIONS: { value: SequenceBlockType; label: string }[] = [
  { value: 'alt', label: 'alt (条件分支)' },
  { value: 'opt', label: 'opt (可选)' },
  { value: 'loop', label: 'loop (循环)' },
  { value: 'par', label: 'par (并行)' },
  { value: 'par-over', label: 'par_over (并行覆盖)' },
  { value: 'critical', label: 'critical (关键)' },
  { value: 'break', label: 'break (中断)' },
  { value: 'rect', label: 'rect (矩形)' },
];

/** 根据父块类型限定 midBranches 分支类型 */
function getMidBranchType(parentType: SequenceBlockType): SequenceBlockMidBranch['type'] | null {
  switch (parentType) {
    case 'alt': return 'else';
    case 'par':
    case 'par-over': return 'and';
    case 'critical': return 'option';
    default: return null; // opt/loop/break/rect 无 midBranches
  }
}

/** 块编辑面板组件 */
export const BlockEditor = memo(function BlockEditor({
  block,
  messages,
  onUpdate,
}: BlockEditorProps) {
  const isRect = block.type === 'rect';
  const midBranchType = getMidBranchType(block.type);
  const canHaveMidBranches = midBranchType !== null;

  /** 更新单个 midBranch 字段 */
  const handleUpdateMidBranch = (index: number, data: Partial<SequenceBlockMidBranch>) => {
    const next = block.midBranches.map((branch, i) =>
      i === index ? { ...branch, ...data } : branch,
    );
    onUpdate({ midBranches: next });
  };

  /** 添加 midBranch（自动设置 type） */
  const handleAddMidBranch = () => {
    if (!midBranchType) return;
    const newBranch: SequenceBlockMidBranch = {
      type: midBranchType,
      label: '',
      startMessage: block.startMessage,
      endMessage: block.endMessage,
    };
    onUpdate({ midBranches: [...block.midBranches, newBranch] });
  };

  /** 删除 midBranch */
  const handleRemoveMidBranch = (index: number) => {
    const next = block.midBranches.filter((_, i) => i !== index);
    onUpdate({ midBranches: next });
  };

  /** 切换块类型时清理 midBranches（若新类型不支持） */
  const handleTypeChange = (newType: SequenceBlockType) => {
    const newMidBranchType = getMidBranchType(newType);
    if (newMidBranchType === null) {
      // 新类型不支持 midBranches，清空并切换 label/color
      if (newType === 'rect') {
        onUpdate({ type: newType, midBranches: [], color: block.color ?? 'rgb(200,200,200)' });
      } else {
        onUpdate({ type: newType, midBranches: [] });
      }
      return;
    }
    // 新类型支持 midBranches，更新所有分支的 type
    const updatedMidBranches = block.midBranches.map((b) => ({ ...b, type: newMidBranchType }));
    onUpdate({ type: newType, midBranches: updatedMidBranches });
  };

  /** 更新 startMessage 并校验 < endMessage */
  const handleStartMessageChange = (newStart: number) => {
    if (newStart >= block.endMessage) {
      // 自动调整 endMessage 保持 > startMessage
      onUpdate({ startMessage: newStart, endMessage: newStart + 1 });
    } else {
      onUpdate({ startMessage: newStart });
    }
  };

  /** 更新 endMessage 并校验 > startMessage */
  const handleEndMessageChange = (newEnd: number) => {
    if (newEnd <= block.startMessage) {
      // 自动调整 startMessage 保持 < endMessage
      onUpdate({ endMessage: newEnd, startMessage: Math.max(0, newEnd - 1) });
    } else {
      onUpdate({ endMessage: newEnd });
    }
  };

  return (
    <div className="panel-content">
      {/* 块类型（8 种，移除 autonumber） */}
      <label className="panel-label">
        类型
        <select
          className="panel-select"
          value={block.type}
          onChange={(e) => handleTypeChange(e.target.value as SequenceBlockType)}
        >
          {BLOCK_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 标签（rect 类型时隐藏，改用 color） */}
      {!isRect && (
        <label className="panel-label">
          标签
          <input
            className="panel-input"
            type="text"
            value={block.label ?? ''}
            placeholder="（可选标签）"
            onChange={(e) => onUpdate({ label: e.target.value })}
          />
        </label>
      )}

      {/* 颜色（仅 rect 类型显示，使用独立 color 字段） */}
      {isRect && (
        <label className="panel-label panel-color-row">
          颜色
          <input
            className="panel-color"
            type="color"
            value={normalizeColorToHex(block.color)}
            onChange={(e) => onUpdate({ color: hexToRgb(e.target.value) })}
          />
          <input
            className="panel-input"
            type="text"
            value={block.color ?? ''}
            placeholder="rgb(255,0,0)"
            onChange={(e) => onUpdate({ color: e.target.value })}
            style={{ flex: 1, fontFamily: 'Consolas, Monaco, monospace', fontSize: 12 }}
          />
        </label>
      )}

      {/* 起始消息索引 */}
      <label className="panel-label">
        起始消息
        <select
          className="panel-select"
          value={block.startMessage}
          onChange={(e) => handleStartMessageChange(Number(e.target.value))}
        >
          {messages.map((msg, index) => (
            <option key={msg.id} value={index}>
              第 {index + 1} 条：{msg.from} → {msg.to}{msg.label ? ` (${msg.label})` : ''}
            </option>
          ))}
        </select>
      </label>

      {/* 结束消息索引（不含，需 > startMessage） */}
      <label className="panel-label">
        结束消息（不含）
        <select
          className="panel-select"
          value={block.endMessage}
          onChange={(e) => handleEndMessageChange(Number(e.target.value))}
        >
          {messages.map((msg, index) => (
            <option key={msg.id} value={index + 1}>
              第 {index + 1} 条之后
            </option>
          ))}
          <option value={messages.length}>末尾（所有消息后）</option>
        </select>
      </label>

      {/* midBranches 子分支列表编辑器（仅 alt/par/par-over/critical 支持） */}
      {canHaveMidBranches && (
        <div className="panel-label">
          中间分支（{midBranchType}）
          <div className="panel-midbranches" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
            {block.midBranches.map((branch, index) => (
              <div key={index} className="panel-midbranch" style={{ border: '1px solid var(--color-border)', padding: 'var(--space-1)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-xs)' }}>{branch.type}</span>
                  <button
                    type="button"
                    className="panel-button"
                    onClick={() => handleRemoveMidBranch(index)}
                    aria-label={`删除分支 ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
                <label className="panel-label">
                  标签
                  <input
                    className="panel-input"
                    type="text"
                    value={branch.label}
                    onChange={(e) => handleUpdateMidBranch(index, { label: e.target.value })}
                  />
                </label>
                <label className="panel-label">
                  起始消息
                  <select
                    className="panel-select"
                    value={branch.startMessage}
                    onChange={(e) => handleUpdateMidBranch(index, { startMessage: Number(e.target.value) })}
                  >
                    {messages.map((msg, msgIndex) => (
                      <option key={msg.id} value={msgIndex}>
                        第 {msgIndex + 1} 条：{msg.from} → {msg.to}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="panel-label">
                  结束消息（不含）
                  <select
                    className="panel-select"
                    value={branch.endMessage}
                    onChange={(e) => handleUpdateMidBranch(index, { endMessage: Number(e.target.value) })}
                  >
                    {messages.map((msg, msgIndex) => (
                      <option key={msg.id} value={msgIndex + 1}>
                        第 {msgIndex + 1} 条之后
                      </option>
                    ))}
                    <option value={messages.length}>末尾</option>
                  </select>
                </label>
              </div>
            ))}
            <button type="button" className="panel-button" onClick={handleAddMidBranch}>
              + 添加 {midBranchType} 分支
            </button>
          </div>
        </div>
      )}

      <div className="panel-info">
        <span className="info-label">起始消息:</span>
        <span className="info-value">{block.startMessage}</span>
      </div>
      <div className="panel-info">
        <span className="info-label">结束消息:</span>
        <span className="info-value">{block.endMessage}</span>
      </div>
    </div>
  );
});

/** 将 rgb()/rgba()/#hex 颜色规范化为 #rrggbb 用于 input[type=color] */
function normalizeColorToHex(color: string | undefined): string {
  if (!color) return '#cccccc';
  // #rrggbb 直接返回
  const hexMatch = color.match(/^#([0-9a-fA-F]{6})$/);
  if (hexMatch) return color;
  // rgb(r,g,b) 或 rgba(r,g,b,a)
  const rgbMatch = color.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return '#cccccc';
}

/** 将 0-255 数值转为两位 hex */
function toHex(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, '0');
}

/** 将 #rrggbb 转为 rgb(r,g,b) 格式（对齐 mermaid rect 语法） */
function hexToRgb(hex: string): string {
  const match = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return 'rgb(0,0,0)';
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  return `rgb(${r},${g},${b})`;
}
