/**
 * ER 关系边组件 — 渲染 erDiagram 的关系边（Bezier 曲线 + 10 marker + relationshipLabelBox）
 *
 * 单一职责：根据双端基数渲染对应 marker，显示角色标签和关系线型
 *
 * 模块4 L2-4（套用 ClassEdgeComponent 模式 + ER 特化）：
 *   - useBoundaryConnection 计算边界连接点（复用流程图统一算法）
 *   - CSS 变量适配暗色模式（var(--er-edge-stroke) 等）
 *   - 10 marker 映射：5 种基数 × Start/End（对齐官方 erRenderer 双端 marker）
 *   - Bezier 曲线路径（React Flow getBezierPath，对齐项目其他边组件）
 *   - relationshipLabelBox（rect 背景 + text 标签，对齐官方 erRenderer）
 *   - 线型：erIdentification='non-identifying' → strokeDasharray='8,8'（对齐官方，实线/虚线）
 *
 * 数据流:
 *   MermaidEdgeData.erCardA → ER_CARDINALITY_TO_MARKER_START → markerStart
 *   MermaidEdgeData.erCardB → ER_CARDINALITY_TO_MARKER_END → markerEnd
 *   MermaidEdgeData.erIdentification → strokeDasharray（identifying=实线 / non-identifying=虚线）
 *   MermaidEdgeData.erRoleA → 中点 relationshipLabelBox（角色标签）
 *
 * 字段消费（模块2 重构后的新字段，对齐 MermaidEdgeData）:
 *   - erCardA: ERCardinality — A 端基数 → markerStart
 *   - erCardB: ERCardinality — B 端基数 → markerEnd
 *   - erRoleA: string — A 端角色（关系标签）→ 中点 relationshipLabelBox
 *   - erIdentification: ERIdentification — 关系类型 → strokeDasharray
 *
 * md-parent 校验（对齐 relationship-converter.ts P2-1 修复）：
 *   - md-parent 仅 A 端有效（jison u(?=[.\-\|]) 仅 source 端匹配）
 *   - erCardB === 'md-parent' 是非法状态，渲染时抛程序错误（不 fallback 掩盖缺陷）
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块4-渲染器.md
 */

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  type EdgeProps,
} from '@xyflow/react';
import type { MermaidEdgeData, ERCardinality } from '@mermaid2aichat/serializer';
import { useBoundaryConnection } from '../boundary-connection.js';
import {
  ER_CARDINALITY_TO_MARKER_START,
  ER_CARDINALITY_TO_MARKER_END,
} from './er-edge-markers.js';

// ============================================================
// 辅助函数
// ============================================================

/**
 * 将基数转为 markerStart url（exhaustive，无 fallback）
 *
 * @param card - A 端基数（erCardA），undefined 时无 marker
 * @returns markerStart url 字符串（如 'url(#er-only-one-start)'），或 undefined
 */
function toMarkerStartUrl(card: ERCardinality | undefined): string | undefined {
  if (card === undefined) return undefined;
  const markerId = ER_CARDINALITY_TO_MARKER_START[card];
  return `url(#${markerId})`;
}

/**
 * 将基数转为 markerEnd url（exhaustive，无 fallback）
 *
 * md-parent 校验：md-parent 仅 A 端有效，erCardB === 'md-parent' 是非法状态，
 * 抛程序错误（对齐 relationship-converter.ts P2-1 修复，不 fallback 掩盖缺陷）
 *
 * @param card - B 端基数（erCardB），undefined 时无 marker
 * @returns markerEnd url 字符串，或 undefined
 * @throws {Error} 当 card === 'md-parent'（B 端不允许 md-parent）
 */
function toMarkerEndUrl(card: ERCardinality | undefined): string | undefined {
  if (card === undefined) return undefined;
  // 程序错误校验：md-parent 仅 A 端有效，B 端出现是非法状态
  // jison 语法 u(?=[.\-|]) 仅在 source 端匹配，B 端不会出现 md-parent
  // 违反时抛错暴露上游 bug，禁止用空字符串 fallback 掩盖缺陷（institution.md 第1.7条）
  if (card === 'md-parent') {
    throw new Error(
      "ER edge render error: erCardB cannot be 'md-parent' (only valid on A side). " +
        'This indicates an upstream bug in the converter or parser.',
    );
  }
  const markerId = ER_CARDINALITY_TO_MARKER_END[card];
  return `url(#${markerId})`;
}

// ============================================================
// 边组件
// ============================================================

/**
 * ER 关系边组件 — Bezier 曲线 + 10 marker + relationshipLabelBox + CSS 变量
 *
 * 套用 ClassEdgeComponent 模式：
 *   - useBoundaryConnection 计算边界连接点
 *   - CSS 变量适配暗色模式
 *   - 双端 marker 映射（erCardA → markerStart / erCardB → markerEnd）
 *   - 中点 relationshipLabelBox（角色标签 erRoleA）
 *
 * ER 特化：
 *   - Bezier 曲线路径（React Flow getBezierPath，对齐项目其他边组件）
 *   - 线型：erIdentification='non-identifying' → strokeDasharray='8,8'（对齐官方）
 *   - md-parent B 端校验（程序错误抛错，不 fallback）
 */
export const ErEdgeComponent = memo(function ErEdgeComponent({
  id,
  source,
  target,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as MermaidEdgeData | undefined;

  // 边界连接点计算（复用流程图统一算法：射线求交，自动选最近方向）
  const connection = useBoundaryConnection(source, target);

  // 双端基数 → markerStart/markerEnd
  const markerStart = toMarkerStartUrl(edgeData?.erCardA);
  const markerEnd = toMarkerEndUrl(edgeData?.erCardB);

  // 线型：non-identifying → 虚线（strokeDasharray '8,8'，对齐官方 erRenderer），identifying → 实线
  const identification = edgeData?.erIdentification;
  const strokeDasharray = identification === 'non-identifying' ? '8,8' : undefined;

  // 角色标签（erRoleA，对齐官方 erRenderer 的 relationshipLabelBox）
  const roleLabel = edgeData?.erRoleA ?? edgeData?.label;

  // CSS 变量适配暗色模式
  const strokeColor = selected
    ? 'var(--er-edge-selected-stroke)'
    : 'var(--er-edge-stroke)';
  const labelBg = 'var(--er-edge-label-bg)';
  const labelText = 'var(--er-edge-label-text)';
  const labelBorder = selected
    ? 'var(--er-edge-selected-stroke)'
    : 'var(--er-edge-stroke)';

  // 路径生成：优先使用边界连接点（非自环且节点已挂载），否则回退到 React Flow 默认坐标
  const pathParams = connection ?? {
    sourceX,
    sourceY,
    sourcePosition: sourcePosition as Position,
    targetX,
    targetY,
    targetPosition: targetPosition as Position,
  };
  const [edgePath, labelX, labelY] = getBezierPath(pathParams);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: 2,
          ...(strokeDasharray !== undefined ? { strokeDasharray } : {}),
        }}
        markerStart={markerStart}
        markerEnd={markerEnd}
      />

      {/* 角色标签 — 中点 relationshipLabelBox（对齐官方 erRenderer） */}
      {roleLabel && (
        <EdgeLabelRenderer>
          <div
            className="er-edge-role-label"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: labelBg,
              color: labelText,
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              border: `1px solid ${labelBorder}`,
              pointerEvents: 'all',
            }}
          >
            {roleLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

ErEdgeComponent.displayName = 'ErEdge';
