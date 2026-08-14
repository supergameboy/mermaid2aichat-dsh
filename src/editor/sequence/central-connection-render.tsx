/**
 * CentralConnectionRender — central-connection 圆形节点渲染组件
 *
 * 单一职责：在指定 cx 位置渲染圆形节点（fill=var(--seq-central-circle-fill) stroke=none，selected 时 fill=var(--seq-central-circle-selected-fill)）
 *
 * B3.4 实现要点（v11 设计补充，对齐官方 sequenceRenderer.ts:318-372 drawCircle）：
 *   - 圆形半径 r=5（官方 sequenceRenderer.ts:322 `r: 5`）
 *   - fill=var(--seq-central-circle-fill)（与消息线 stroke 颜色一致，显式优于依赖默认值；selected 时 var(--seq-central-circle-selected-fill)）
 *   - stroke=none（对齐官方渲染视觉）
 *   - 不设置 width/height（P3-NEW-3：SVG circle 用 r 定义大小，width/height 无意义）
 *   - 渲染顺序对齐官方 sequenceRenderer.ts:361-372：
 *       forward → drawCircle(toX)
 *       reverse → drawCircle(fromX)
 *       dual    → drawCircle(fromX) + drawCircle(toX)（先 from 后 to）
 *   - autonumber 偏移量暂不实现（P3-NEW-2：与现有 B3 渲染一致，未来扩展点保留）
 *
 * 派生函数 deriveCentralConnectionType：
 *   - 单一数据源 = messageType（SequenceArrowType），不新增 centralConnection 字段
 *   - 与 B2 ARROW_SYNTAX 直接映射一致，与 P0-2/P0-3 修复决策一致
 *   - 3 种 central-connection 类型 → 'forward'/'reverse'/'dual'
 *   - 其他 26 种类型 → null
 */
import type { SequenceArrowType } from '@mermaid2aichat/serializer';

// ============================================================
// 常量
// ============================================================

/** 圆形半径（对齐官方 sequenceRenderer.ts:322 r: 5） */
const CENTRAL_CIRCLE_RADIUS = 5;

/** 默认圆形填充颜色 CSS 变量（与消息线 stroke 颜色一致） */
const DEFAULT_CIRCLE_FILL_VAR = 'var(--seq-central-circle-fill)';

/** 选中时圆形填充颜色 CSS 变量（与消息线 selected 颜色一致） */
const SELECTED_CIRCLE_FILL_VAR = 'var(--seq-central-circle-selected-fill)';

// ============================================================
// 类型定义
// ============================================================

/** central-connection 渲染类型（由 messageType 派生，对齐官方 msg.centralConnection） */
export type CentralConnectionType = 'forward' | 'reverse' | 'dual';

// ============================================================
// 派生函数
// ============================================================

/** messageType → central-connection 渲染类型映射表（P2-NEW-3 修复）
 *
 * 单一数据源 = messageType，不新增 centralConnection 字段到 CanvasState/edge.data
 * 与 B2 ARROW_SYNTAX 直接映射一致，与 P0-2/P0-3 修复决策一致
 */
const CENTRAL_CONNECTION_TYPE_MAP: Partial<Record<SequenceArrowType, CentralConnectionType>> = {
  'central-connection': 'forward',
  'central-connection-reverse': 'reverse',
  'central-connection-dual': 'dual',
};

/** 根据 messageType 派生 central-connection 渲染类型
 *
 * @param messageType - 消息箭头类型（SequenceArrowType，29 种之一）
 * @returns 'forward' | 'reverse' | 'dual'（central-connection 三种类型）或 null（其他 26 种类型）
 */
export function deriveCentralConnectionType(
  messageType: SequenceArrowType,
): CentralConnectionType | null {
  return CENTRAL_CONNECTION_TYPE_MAP[messageType] ?? null;
}

// ============================================================
// 渲染组件
// ============================================================

/** CentralConnectionRender Props */
export interface CentralConnectionRenderProps {
  /** 消息线起点 x（source actor 中心，对应官方 fromCenter） */
  fromX: number;
  /** 消息线终点 x（target actor 中心，对应官方 toCenter） */
  toX: number;
  /** 消息线 y 坐标（圆形 cy，对应官方 lineStartY） */
  y: number;
  /** central-connection 渲染类型（由 messageType 派生） */
  type: CentralConnectionType;
  /** 是否被选中（P1-NEW-4：selected 时 fill 改为 var(--seq-central-circle-selected-fill)） */
  selected: boolean;
}

/** CentralConnectionRender — central-connection 圆形节点渲染组件
 *
 * 渲染逻辑（对齐官方 sequenceRenderer.ts:361-372 switch (msg.centralConnection)）：
 *   - forward: drawCircle(toX) → 在 toX 位置画一个圆
 *   - reverse: drawCircle(fromX) → 在 fromX 位置画一个圆
 *   - dual: drawCircle(fromX) + drawCircle(toX) → 画两个独立圆形
 */
export function CentralConnectionRender({ fromX, toX, y, type, selected }: CentralConnectionRenderProps) {
  const fill = selected ? SELECTED_CIRCLE_FILL_VAR : DEFAULT_CIRCLE_FILL_VAR;
  const drawCircle = (cx: number) => (
    <circle
      cx={cx}
      cy={y}
      r={CENTRAL_CIRCLE_RADIUS}
      style={{ fill }}
      stroke="none"
    />
  );

  return (
    <g>
      {/* 渲染顺序对齐官方 sequenceRenderer.ts:368-371：
          - forward: drawCircle(toX)
          - reverse: drawCircle(fromX)
          - dual: drawCircle(fromX) + drawCircle(toX)（先 from 后 to，对齐官方） */}
      {(type === 'reverse' || type === 'dual') && drawCircle(fromX)}
      {(type === 'forward' || type === 'dual') && drawCircle(toX)}
    </g>
  );
}
