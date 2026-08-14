/**
 * BoxFrame — 时序图 Box 分组框（围绕一组参与者）
 *
 * 单一职责：在参与者组周围渲染带名称和背景色的矩形框
 *
 * B3.3 改造（v9）：
 *   - props 从固定坐标（leftX/rightX/lastMessageY）改为 layout prop（BoxLayoutItem）+ bottomY
 *   - x = layout.bounds.x
 *   - y = layout.bounds.y - BOX_LABEL_HEIGHT（标签条在框上方）
 *   - width = layout.bounds.width
 *   - height = bottomY - layout.bounds.y（延伸到生命线底部）
 *   - box.name 用于标签文本
 *   - box.color 用于框颜色
 *   - 删除原 PARTICIPANT_TOP_Y/PARTICIPANT_HEIGHT/BOX_PADDING 常量依赖
 */
import { memo } from 'react';
import type { SequenceBoxInfo } from '@mermaid2aichat/serializer';
import type { BoxLayoutItem } from './sequence-layout.js';
import { BOX_LABEL_HEIGHT } from './layout-constants.js';

interface BoxFrameProps {
  /** Box 信息（业务数据源，含 id/name/color/actorKeys） */
  box: SequenceBoxInfo;
  /** Box 在 sequenceBoxes 数组中的索引 */
  boxIndex: number;
  /** Box 布局项（来自 layout.boxLayouts[i]，含 bounds） */
  layout: BoxLayoutItem;
  /** 框底部 Y 坐标（来自 layout.bounds.stopy，覆盖到生命线底部） */
  bottomY: number;
  /** 是否被选中 */
  selected: boolean;
  /** 点击选中回调 */
  onSelect: (boxIndex: number) => void;
  /** B4.3：右键菜单回调（undefined 时不响应右键） */
  onContextMenu?: (event: React.MouseEvent) => void;
}

/** Box 框组件 */
export const BoxFrame = memo(function BoxFrame({
  box,
  boxIndex,
  layout,
  bottomY,
  selected,
  onSelect,
  onContextMenu,
}: BoxFrameProps) {
  const x = layout.bounds.x;
  const y = layout.bounds.y - BOX_LABEL_HEIGHT;
  const width = layout.bounds.width;
  const height = bottomY - layout.bounds.y;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(boxIndex);
  };

  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={handleClick}
      onContextMenu={onContextMenu}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: box.color || 'var(--seq-box-default-fill)',
          stroke: selected ? 'var(--seq-box-selected-stroke)' : 'var(--seq-box-default-stroke)',
        }}
        strokeWidth={selected ? 2 : 1}
        strokeDasharray="4,2"
        rx={4}
        ry={4}
      />
      {/* 顶部标签条 */}
      <rect
        x={x}
        y={y}
        width={Math.max(box.name.length * 8 + 16, 50)}
        height={BOX_LABEL_HEIGHT}
        style={{ fill: box.color || 'var(--seq-box-label-fill)' }}
        rx={2}
        ry={2}
      />
      <text
        x={x + 8}
        y={y + BOX_LABEL_HEIGHT / 2}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
        style={{ fill: 'var(--seq-box-label-text)' }}
      >
        {box.name}
      </text>
    </g>
  );
});
