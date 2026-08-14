/**
 * ActivationBar — 时序图激活条（生命线上的实心矩形）
 *
 * 单一职责：在生命线上渲染激活条，表示参与者在某段时间内处于活动状态
 *
 * B3.3 改造（v9）：
 *   - props 从固定坐标（x/y/height）改为 activation prop（ActivationModel）
 *   - P1-2 修复：ActivationModel 无 width 字段，全部从 activation 派生
 *     * x = activation.startx
 *     * y = activation.starty
 *     * width = activation.stopx - activation.startx
 *     * height = activation.stopy - activation.starty
 *   - 删除原 ACTIVATION_BAR_WIDTH/ACTIVATION_BAR_HEIGHT 常量依赖（已被 activation 派生取代）
 */
import { memo } from 'react';
import type { ActivationModel } from './sequence-bounds.js';

interface ActivationBarProps {
  /** 激活模型（来自 layout.models.activations[i]，含 actor/startx/stopx/starty/stopy）
   *  P1-2 修复：ActivationModel 无 width 字段（见 sequence-bounds.ts:52-58），
   *  激活条宽度由 SEQUENCE_LAYOUT_CONFIG.activationWidth 在 newActivation 中编码为 startx/stopx，
   *  渲染时用 (stopx - startx) 派生 width，无需额外 actorLayout prop（单一数据源 = activation） */
  activation: ActivationModel;
  /** 是否被选中 */
  selected?: boolean;
}

/** 激活条组件 */
export const ActivationBar = memo(function ActivationBar({ activation, selected }: ActivationBarProps) {
  return (
    <rect
      x={activation.startx}
      y={activation.starty}
      width={activation.stopx - activation.startx}
      height={activation.stopy - activation.starty}
      style={{
        fill: selected
          ? 'var(--seq-activation-selected-fill)'
          : 'var(--seq-activation-fill)',
        stroke: 'var(--seq-activation-stroke)',
      }}
      strokeWidth={1}
      rx={2}
    />
  );
});
