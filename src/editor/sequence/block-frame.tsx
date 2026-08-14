/**
 * BlockFrame — 时序图块结构框（alt/opt/loop/par/critical/break/rect）
 *
 * 单一职责：在消息组周围渲染彩色矩形框，含左上角标签和中间分支标签
 *
 * B3.3 改造（v9）：
 *   - props 从固定坐标（type/label/startMessage/endMessage/lastSequence/leftX/rightX）改为 block + loopModel
 *   - block.type 用于决定颜色（替代原 type prop）
 *   - block.label 用于标签文本（替代原 label prop）
 *   - loopModel 提供 startx/stopx/starty/stopy（含 number | undefined 收敛）
 *   - section 分支标签：遍历 loopModel.sections[] + loopModel.sectionTitles[]
 *   - 渲染逻辑：
 *     * x = loopModel.startx ?? 0
 *     * y = loopModel.starty - BLOCK_LABEL_HEIGHT
 *     * width = (loopModel.stopx ?? 0) - (loopModel.startx ?? 0)
 *     * height = (loopModel.stopy ?? 0) - loopModel.starty
 *   - 嵌套缩进：depth * 6
 *   - 删除原 BLOCK_PADDING/getMessageY 常量依赖
 *   - 保留原 BLOCK_COLORS 映射
 */
import { memo } from 'react';
import type { SequenceBlockInfo, SequenceBlockType } from '@mermaid2aichat/serializer';
import type { LoopModel } from './sequence-bounds.js';
import { BLOCK_LABEL_HEIGHT } from './layout-constants.js';

interface BlockFrameProps {
  /** 块信息（业务数据源，含 type/label/startMessage/endMessage） */
  block: SequenceBlockInfo;
  /** 块在 blocks 数组中的索引 */
  blockIndex: number;
  /** 循环模型（来自 layout.models.loops[i]，含 startx/stopx/starty/stopy/sections/title） */
  loopModel: LoopModel;
  /** 嵌套深度（从 layout.models.loops 派生，0=顶层） */
  depth: number;
  /** 是否被选中 */
  selected: boolean;
  /** 点击选中回调 */
  onSelect: (blockIndex: number) => void;
  /** B4.3：右键菜单回调（undefined 时不响应右键） */
  onContextMenu?: (event: React.MouseEvent) => void;
  /** B4.4：边缘 resize mousedown 回调（undefined 时不渲染 resize handle） */
  onResizeStart?: (
    blockIndex: number,
    edge: 'top' | 'bottom',
    originalStart: number,
    originalEnd: number,
    clientX: number,
    clientY: number,
  ) => void;
}

/** 块类型 → 颜色映射 */
const BLOCK_COLORS: Record<SequenceBlockType, { fill: string; stroke: string; label: string }> = {
  alt:        { fill: 'var(--seq-block-alt-fill)',        stroke: 'var(--seq-block-alt-stroke)',        label: 'alt' },
  opt:        { fill: 'var(--seq-block-opt-fill)',        stroke: 'var(--seq-block-opt-stroke)',        label: 'opt' },
  loop:       { fill: 'var(--seq-block-loop-fill)',       stroke: 'var(--seq-block-loop-stroke)',       label: 'loop' },
  par:        { fill: 'var(--seq-block-par-fill)',        stroke: 'var(--seq-block-par-stroke)',        label: 'par' },
  'par-over': { fill: 'var(--seq-block-par-fill)',        stroke: 'var(--seq-block-par-stroke)',        label: 'par_over' },
  critical:   { fill: 'var(--seq-block-critical-fill)',   stroke: 'var(--seq-block-critical-stroke)',   label: 'critical' },
  break:      { fill: 'var(--seq-block-critical-fill)',   stroke: 'var(--seq-block-critical-stroke)',   label: 'break' },
  rect:       { fill: 'var(--seq-block-rect-fill)',       stroke: 'var(--seq-block-rect-stroke)',       label: 'rect' },
};

/** 块结构框组件 */
export const BlockFrame = memo(function BlockFrame({
  block,
  blockIndex,
  loopModel,
  depth,
  selected,
  onSelect,
  onContextMenu,
  onResizeStart,
}: BlockFrameProps) {
  const color = BLOCK_COLORS[block.type] ?? BLOCK_COLORS.alt;

  // LoopModel.startx/stopx/stopy 类型为 number | undefined，渲染层统一 ?? 0 收敛
  // 与 SequenceCanvas 顶部 bottomY = layout.bounds.stopy ?? 0 策略一致
  // 空块/未布局场景下 SVG 矩形退化为 0 尺寸，不抛错以保留块标签渲染
  const startX = loopModel.startx ?? 0;
  const stopX = loopModel.stopx ?? 0;
  const stopY = loopModel.stopy ?? 0;
  // starty 类型为 number（初始化为 verticalPos），无 undefined 风险
  const startY = loopModel.starty;

  const x = startX;
  const y = startY - BLOCK_LABEL_HEIGHT;
  const width = stopX - startX;
  // 修复：rect 从 y（标签条顶部）开始绘制，需要延伸到 stopY（最后一条消息底部）
  //   原实现 height = stopY - startY，导致 rect 底部 = y + height = stopY - BLOCK_LABEL_HEIGHT，
  //   比 stopY 少了 BLOCK_LABEL_HEIGHT（22px），block 框没有完整包围消息区域
  //   修正：height = stopY - startY + BLOCK_LABEL_HEIGHT，使 rect 底部 = stopY
  const height = stopY - startY + BLOCK_LABEL_HEIGHT;

  // 嵌套缩进
  const indent = depth * 6;
  const rectX = x - indent;
  const rectW = width + indent * 2;

  const label = block.label;
  const displayLabel = label ? `${color.label}: ${label}` : color.label;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(blockIndex);
  };

  // B4.4：resize handle 位置（顶部边缘和底部边缘各一个）
  // 顶部 handle 在 y 位置（标签条上沿），底部 handle 在 y + height 位置
  // handle 宽度同 rectW，高度 6 SVG 单位（足够拖拽但不过分占用空间）
  const showResizeHandles = onResizeStart !== undefined;
  const handleHeight = 6;
  const topHandleY = y;
  const bottomHandleY = y + height - handleHeight;

  /** B4.4：通用 resize handle mousedown 处理器 */
  const createResizeMousedown = (edge: 'top' | 'bottom') => (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡到父 <g> 的 onClick
    if (onResizeStart === undefined) return;
    onResizeStart(
      blockIndex,
      edge,
      block.startMessage,
      block.endMessage,
      e.clientX,
      e.clientY,
    );
  };

  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={handleClick}
      onContextMenu={onContextMenu}
    >
      <rect
        x={rectX}
        y={y}
        width={rectW}
        height={height}
        style={{ fill: color.fill, stroke: selected ? 'var(--seq-block-selected-stroke)' : color.stroke }}
        strokeWidth={selected ? 2 : 1}
        rx={2}
        ry={2}
      />
      {/* 左上角标签条 */}
      <rect
        x={rectX}
        y={y}
        width={Math.max(displayLabel.length * 7 + 16, 60)}
        height={BLOCK_LABEL_HEIGHT}
        style={{ fill: color.stroke }}
        rx={2}
        ry={2}
      />
      <text
        x={rectX + 8}
        y={y + BLOCK_LABEL_HEIGHT / 2}
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
        style={{ fill: 'var(--seq-block-label-text)' }}
      >
        {displayLabel}
      </text>
      {/* 中间分支标签（alt else / par and / critical option） */}
      {loopModel.sections.map((section, i) => {
        const sectionTitle = loopModel.sectionTitles[i] ?? '';
        // 中间分支类型名（alt→else, par→and, critical→option，其他默认 else）
        const branchKeyword = block.type === 'par' || block.type === 'par-over'
          ? 'and'
          : block.type === 'critical'
            ? 'option'
            : 'else';
        const sectionLabel = sectionTitle ? `${branchKeyword}: ${sectionTitle}` : branchKeyword;
        return (
          <g key={`section-${i}`}>
            {/* 分隔线 */}
            <line
              x1={rectX}
              y1={section.y}
              x2={rectX + rectW}
              y2={section.y}
              style={{ stroke: color.stroke }}
              strokeWidth={1}
              strokeDasharray="4,2"
            />
            {/* 分支标签条 */}
            <rect
              x={rectX}
              y={section.y - BLOCK_LABEL_HEIGHT}
              width={Math.max(sectionLabel.length * 7 + 16, 50)}
              height={BLOCK_LABEL_HEIGHT}
              style={{ fill: color.stroke }}
              rx={2}
              ry={2}
            />
            <text
              x={rectX + 8}
              y={section.y - BLOCK_LABEL_HEIGHT / 2}
              dominantBaseline="central"
              fontSize={11}
              fontWeight={600}
              style={{ fill: 'var(--seq-block-label-text)' }}
            >
              {sectionLabel}
            </text>
          </g>
        );
      })}
      {/* B4.4：resize handle（顶部 + 底部边缘，仅 onResizeStart 提供时渲染）
          - 透明矩形作为命中区域，cursor 提示可拖拽方向
          - mousedown 触发 onResizeStart，传递 edge + 原始 start/end */}
      {showResizeHandles && (
        <>
          <rect
            x={rectX}
            y={topHandleY}
            width={rectW}
            height={handleHeight}
            fill="transparent"
            style={{ cursor: 'ns-resize' }}
            onMouseDown={createResizeMousedown('top')}
          />
          <rect
            x={rectX}
            y={bottomHandleY}
            width={rectW}
            height={handleHeight}
            fill="transparent"
            style={{ cursor: 'ns-resize' }}
            onMouseDown={createResizeMousedown('bottom')}
          />
        </>
      )}
    </g>
  );
});
