/**
 * Lifeline — 时序图参与者生命线（虚线）
 *
 * 单一职责：渲染参与者下方的虚线，从参与者底部延伸到生命线终点
 *
 * B3.3 改造（v9）：
 *   - props 从固定坐标（x/lastMessageY）改为 layout prop（ActorLayout.centerX + bottomY）
 *   - 生命线 y1 = layout.y + layout.height（参与者框底部）
 *   - 生命线 y2 = bottomY（来自 layout.bounds.stopy，含 mirrorActors 推进）
 *   - 删除原 PARTICIPANT_BOTTOM_Y/LIFELINE_BOTTOM_PADDING 常量依赖（已被 layout 取代）
 */
import { memo } from 'react';
import type { ActorLayout } from './sequence-layout.js';

interface LifelineProps {
  /** 参与者布局（含 centerX/y/height） */
  layout: ActorLayout;
  /** 生命线终点 Y 坐标（来自 layout.bounds.stopy，含 mirrorActors 推进） */
  bottomY: number;
  /** 是否被选中 */
  selected?: boolean;
}

/** 生命线组件 */
export const Lifeline = memo(function Lifeline({ layout, bottomY, selected }: LifelineProps) {
  return (
    <line
      x1={layout.centerX}
      y1={layout.y + layout.height}
      x2={layout.centerX}
      y2={bottomY}
      style={{
        stroke: selected
          ? 'var(--seq-lifeline-selected-stroke)'
          : 'var(--seq-lifeline-stroke)',
      }}
      strokeWidth={1.5}
      strokeDasharray="6,4"
      pointerEvents="none"
    />
  );
});
