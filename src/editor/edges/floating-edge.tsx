/**
 * Floating Edge — 就近连接模式的自定义边组件
 *
 * 动态计算 source/target 节点之间最近的连接点，不绑定到固定 Handle。
 * 从节点中心向对端中心发出射线，通过 shape-boundary 的 getBoundaryConnectionPoint
 * 计算与形状边缘的真实交点，避免按容器 div 计算带来的偏差。
 * 复用 flowchart/edge-markers 的样式逻辑（getEdgeStyleConfig、toMarkerUrl）。
 */
import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react';
import type { MermaidEdgeData, MermaidEdgeStyle, MermaidNode } from '@mermaid2aichat/serializer';
import { getEdgeStyleConfig, toMarkerUrl } from './flowchart/edge-markers.js';
import {
  getBoundaryConnectionPoint,
  getNodeCenter,
} from '../nodes/flowchart/shapes/shape-boundary.js';

/**
 * 计算两个节点之间最近的连接点和方向
 *
 * 以对方中心为目标点，分别求 source/target 与形状边缘的交点，
 * 返回 source/target 的坐标和方向（Position）。
 */
function getEdgeParams(
  source: InternalNode<MermaidNode>,
  target: InternalNode<MermaidNode>,
): {
  sx: number;
  sy: number;
  sourcePos: Position;
  tx: number;
  ty: number;
  targetPos: Position;
} {
  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);

  const sourceConn = getBoundaryConnectionPoint(source, targetCenter);
  const targetConn = getBoundaryConnectionPoint(target, sourceCenter);

  return {
    sx: sourceConn.x,
    sy: sourceConn.y,
    sourcePos: sourceConn.position,
    tx: targetConn.x,
    ty: targetConn.y,
    targetPos: targetConn.position,
  };
}

/** Floating Edge 自定义边组件 — 就近连接模式 */
export const FloatingEdgeComponent = memo(({
  id,
  source,
  target,
  data,
  selected,
}: EdgeProps) => {
  const sourceNode = useInternalNode<MermaidNode>(source);
  const targetNode = useInternalNode<MermaidNode>(target);

  // 节点未挂载或未测量时，不渲染边（避免初始渲染异常）
  if (!sourceNode || !targetNode) return null;

  const edgeData = data as MermaidEdgeData | undefined;
  const edgeStyle: MermaidEdgeStyle = edgeData?.edgeStyle ?? 'arrow';
  const config = getEdgeStyleConfig(edgeStyle);

  // 不可见线 — 仅布局占位，不渲染视觉元素
  if (config.stroke === 'invisible') {
    return null;
  }

  // 线型样式
  const strokeColor = selected ? '#1890ff' : '#333333';
  const stroke = config.strokeDasharray
    ? { stroke: strokeColor, strokeWidth: config.strokeWidth, strokeDasharray: config.strokeDasharray }
    : { stroke: strokeColor, strokeWidth: config.strokeWidth };

  // 端点 marker
  const markerEnd = toMarkerUrl(config.markerEnd);
  const markerStart = toMarkerUrl(config.markerStart);

  const { sx, sy, sourcePos, tx, ty, targetPos } = getEdgeParams(sourceNode, targetNode);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={stroke}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: '#fff',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              border: `1px solid ${selected ? '#1890ff' : '#d9d9d9'}`,
              pointerEvents: 'all',
            }}
            className="edge-label"
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

FloatingEdgeComponent.displayName = 'FloatingEdge';
