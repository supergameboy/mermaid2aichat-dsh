/**
 * NoteRow — 时序图注释（Note left of / right of / over）
 *
 * 单一职责：在指定参与者的生命线左/右/上方渲染黄色注释框
 *
 * B3.3 改造（v9）：
 *   - props 从固定坐标（participantX/overParticipantX）改为 layout prop（NoteLayoutItem）+ participantLayout prop
 *   - y = layout.bounds.y（注释 Y 坐标，来自 layout，严格按设计文档 v9 渲染逻辑）
 *   - P3-3 修复：删除 overParticipantX prop（SequenceNoteInfo 仅支持单参与者，B4.x 扩展时再添加）
 *   - noteX 计算：
 *     * position='left'：participantLayout.x - NOTE_WIDTH - 8
 *     * position='right'：participantLayout.x + participantLayout.width + 8
 *     * position='over'：participantLayout.centerX - NOTE_WIDTH / 2
 *   - 删除原 getMessageY 常量依赖（已被 layout.bounds.y 取代）
 *   - 保留原 truncateLabel helper 函数
 */
import { memo } from 'react';
import type { SequenceNoteInfo } from '@mermaid2aichat/serializer';
import type { ActorLayout, NoteLayoutItem } from './sequence-layout.js';
import { NOTE_WIDTH, NOTE_HEIGHT } from './layout-constants.js';

interface NoteRowProps {
  /** 注释信息（业务数据源，含 participantId/position/label/messageIndex） */
  note: SequenceNoteInfo;
  /** 注释在 notes 数组中的索引 */
  noteIndex: number;
  /** 注释布局项（来自 layout.noteLayouts[i]，含 bounds） */
  layout: NoteLayoutItem;
  /** 关联参与者布局（含 centerX/x/width） */
  participantLayout: ActorLayout;
  /** 是否被选中 */
  selected: boolean;
  /** 点击选中回调（传递 noteIndex） */
  onSelect: (noteIndex: number) => void;
  /** B4.3：右键菜单回调（undefined 时不响应右键） */
  onContextMenu?: (event: React.MouseEvent) => void;
  /** B4.4：排序拖拽 mousedown 回调（纵向重排发起，undefined 时不渲染 grip） */
  onReorderStart?: (
    noteIndex: number,
    currentMessageIndex: number,
    clientX: number,
    clientY: number,
  ) => void;
}

/** B4.4：grip 6 个圆点相对中心的偏移（2 列 × 3 行，与 message-row 一致） */
const GRIP_DOTS: ReadonlyArray<readonly [number, number]> = [
  [-3, -4],
  [-3, 0],
  [-3, 4],
  [3, -4],
  [3, 0],
  [3, 4],
];

/** 注释组件 */
export const NoteRow = memo(function NoteRow({
  note,
  noteIndex,
  layout,
  participantLayout,
  selected,
  onSelect,
  onContextMenu,
  onReorderStart,
}: NoteRowProps) {
  // y 严格按设计文档 v9：y = layout.bounds.y（注释 Y 坐标，来自 layout）
  const y = layout.bounds.y;

  // 计算 X 坐标：left/right 在参与者侧，over 在参与者上方居中
  let noteX: number;
  if (note.position === 'left') {
    noteX = participantLayout.x - NOTE_WIDTH - 8;
  } else if (note.position === 'right') {
    noteX = participantLayout.x + participantLayout.width + 8;
  } else {
    // over：单参与者居中
    noteX = participantLayout.centerX - NOTE_WIDTH / 2;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(noteIndex);
  };

  // B4.4：grip 位置 — Note 框中点左侧 12 SVG 单位（与 participant grip 风格一致）
  const gripX = noteX - 12;
  const gripY = y + NOTE_HEIGHT / 2;
  const gripFill = selected ? 'var(--seq-grip-selected-fill)' : 'var(--seq-grip-fill)';
  const showGrip = onReorderStart !== undefined;

  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={handleClick}
      onContextMenu={onContextMenu}
    >
      <rect
        x={noteX}
        y={y}
        width={NOTE_WIDTH}
        height={NOTE_HEIGHT}
        rx={2}
        ry={2}
        style={{
          fill: 'var(--seq-note-fill)',
          stroke: selected ? 'var(--seq-note-selected-stroke)' : 'var(--seq-note-stroke)',
        }}
        strokeWidth={selected ? 2 : 1}
      />
      {/* 折角效果 */}
      <path
        d={`M ${noteX + NOTE_WIDTH - 8} ${y} L ${noteX + NOTE_WIDTH} ${y + 8} L ${noteX + NOTE_WIDTH - 8} ${y + 8} Z`}
        style={{
          fill: 'var(--seq-note-fold-fill)',
          stroke: selected ? 'var(--seq-note-selected-stroke)' : 'var(--seq-note-stroke)',
        }}
        strokeWidth={1}
      />
      <text
        x={noteX + NOTE_WIDTH / 2}
        y={y + NOTE_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        style={{ fill: 'var(--seq-note-text)' }}
      >
        {truncateLabel(note.label, 12)}
      </text>
      {/* B4.4：排序 grip 手柄（⋮⋮ 图标，仅 onReorderStart 提供时渲染） */}
      {showGrip && (
        <g
          style={{ cursor: 'ns-resize' }}
          onMouseDown={(e) => {
            e.stopPropagation(); // 阻止冒泡到父 <g> 的 onClick
            onReorderStart(noteIndex, note.messageIndex, e.clientX, e.clientY);
          }}
        >
          {/* 不可见命中区域 */}
          <rect x={gripX - 8} y={gripY - 8} width={16} height={16} fill="transparent" />
          {/* 可见的 6 个圆点 */}
          {GRIP_DOTS.map(([dx, dy], i) => (
            <circle key={i} cx={gripX + dx} cy={gripY + dy} r={1.5} style={{ fill: gripFill }} />
          ))}
        </g>
      )}
    </g>
  );
});

/** 截断过长标签 */
function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + '…';
}
