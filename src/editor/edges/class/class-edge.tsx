/**
 * Class 关系边组件 — 渲染 classDiagram 的关系边
 *
 * 单一职责：根据双端关系类型渲染对应线型和 marker，显示基数和关系标签
 *
 * M3 重构模块4 L2-5：
 *   - 双端关系类型：读取 relationType1（起点）+ relationType2（终点），分别映射 markerStart/markerEnd
 *   - 10 marker 映射：5 种关系类型 × Start/End（对齐官方 classDb 双端 marker）
 *   - 基数标签：cardinality1（source 端）+ cardinality2（target 端）
 *   - 线型：lineType='dotted' → strokeDasharray='5,5'，'line' → 实线
 *   - CSS 变量适配暗色模式（stroke/label-bg/label-text 用 CSS 变量）
 *
 * 数据流:
 *   MermaidEdgeData.relationType1 → RELATION_TYPE_TO_MARKER_START → markerStart
 *   MermaidEdgeData.relationType2 → RELATION_TYPE_TO_MARKER_END → markerEnd
 *   MermaidEdgeData.lineType → strokeDasharray
 *   MermaidEdgeData.cardinality1/cardinality2 → 基数标签（source/target 端）
 *   MermaidEdgeData.relationLabel → 关系标签（居中）
 *
 * relationType 数值映射（对齐 jison ClassDB）:
 *   0=AGGREGATION（空心菱形）, 1=EXTENSION（空心三角）, 2=COMPOSITION（实心菱形）,
 *   3=DEPENDENCY（箭头）, 4=LOLLIPOP（圆圈），'none'=无 marker
 *
 * Marker 定义位于 graph-canvas.tsx 的 <defs> 中（10 个 = 5 种 × Start/End）
 */

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  type EdgeProps,
} from '@xyflow/react';
import type { MermaidEdgeData } from '@mermaid2aichat/serializer';
import { useBoundaryConnection } from '../boundary-connection.js';

// ============================================================
// 关系类型 → marker 映射（10 个 marker = 5 种 × Start/End）
// ============================================================

/** relationType 数值 → markerStart id 映射（起点 marker） */
export const RELATION_TYPE_TO_MARKER_START: Record<number | 'none', string | undefined> = {
  0: 'mermaid-hollow-diamond-start',  // AGGREGATION → 空心菱形
  1: 'mermaid-hollow-triangle-start', // EXTENSION → 空心三角
  2: 'mermaid-filled-diamond-start',  // COMPOSITION → 实心菱形
  3: 'mermaid-arrow-start',           // DEPENDENCY → 箭头
  4: 'mermaid-circle-start',          // LOLLIPOP → 圆圈
  'none': undefined,                  // 无 marker
};

/** relationType 数值 → markerEnd id 映射（终点 marker） */
export const RELATION_TYPE_TO_MARKER_END: Record<number | 'none', string | undefined> = {
  0: 'mermaid-hollow-diamond-end',
  1: 'mermaid-hollow-triangle-end',
  2: 'mermaid-filled-diamond-end',
  3: 'mermaid-arrow-end',
  4: 'mermaid-circle-end',
  'none': undefined,
};

/** 将 relationType 转为 marker url（兼容 number | 'none' | undefined） */
function toMarkerUrl(
  relationType: number | 'none' | undefined,
  markerMap: Record<number | 'none', string | undefined>,
): string | undefined {
  if (relationType === undefined) return undefined;
  const markerId = markerMap[relationType];
  return markerId !== undefined ? `url(#${markerId})` : undefined;
}

// ============================================================
// 边组件
// ============================================================

/** Class 关系边组件 — 双端关系类型 + 10 marker + 基数标签 + CSS 变量 */
export const ClassEdgeComponent = memo(function ClassEdgeComponent({
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

  // 双端关系类型 → markerStart/markerEnd
  const markerStart = toMarkerUrl(edgeData?.relationType1, RELATION_TYPE_TO_MARKER_START);
  const markerEnd = toMarkerUrl(edgeData?.relationType2, RELATION_TYPE_TO_MARKER_END);

  // 线型：dotted → 虚线，line → 实线
  const lineType = edgeData?.lineType ?? 'line';
  const strokeDasharray = lineType === 'dotted' ? '5,5' : undefined;

  // 基数标签（双端）
  const cardinality1 = edgeData?.cardinality1;
  const cardinality2 = edgeData?.cardinality2;

  // 关系标签
  const relationLabel = edgeData?.relationLabel ?? edgeData?.label;

  const strokeColor = selected
    ? 'var(--class-edge-selected-stroke)'
    : 'var(--class-edge-stroke)';
  const labelBg = 'var(--class-edge-label-bg)';
  const labelText = 'var(--class-edge-label-text)';
  const labelBorder = selected
    ? 'var(--class-edge-selected-stroke)'
    : 'var(--class-edge-stroke)';

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

  // 基数标签位置：cardinality1 在 source 端，cardinality2 在 target 端
  // 基于实际路径起终点计算，确保标签紧贴边界连接点
  const fromLabelX = pathParams.sourceX + (labelX - pathParams.sourceX) * 0.5;
  const fromLabelY = pathParams.sourceY + (labelY - pathParams.sourceY) * 0.5;
  const toLabelX = pathParams.targetX + (labelX - pathParams.targetX) * 0.5;
  const toLabelY = pathParams.targetY + (labelY - pathParams.targetY) * 0.5;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 3 : 2,
          ...(strokeDasharray !== undefined ? { strokeDasharray } : {}),
        }}
        markerStart={markerStart}
        markerEnd={markerEnd}
      />

      {/* 基数标签 — source 端（cardinality1） */}
      {cardinality1 && (
        <EdgeLabelRenderer>
          <div
            className="edge-cardinality-from"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${fromLabelX}px, ${fromLabelY}px)`,
              background: labelBg,
              color: labelText,
              padding: '1px 6px',
              borderRadius: 3,
              fontSize: 11,
              border: `1px solid ${labelBorder}`,
              pointerEvents: 'all',
              fontFamily: 'monospace',
            }}
          >
            {cardinality1}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* 基数标签 — target 端（cardinality2） */}
      {cardinality2 && (
        <EdgeLabelRenderer>
          <div
            className="edge-cardinality-to"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${toLabelX}px, ${toLabelY}px)`,
              background: labelBg,
              color: labelText,
              padding: '1px 6px',
              borderRadius: 3,
              fontSize: 11,
              border: `1px solid ${labelBorder}`,
              pointerEvents: 'all',
              fontFamily: 'monospace',
            }}
          >
            {cardinality2}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* 关系标签 — 中间位置 */}
      {relationLabel && (
        <EdgeLabelRenderer>
          <div
            className="edge-relation-label"
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
            {relationLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

ClassEdgeComponent.displayName = 'ClassEdge';
