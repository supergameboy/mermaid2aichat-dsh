/**
 * flowchart 边组件 — 形状边界连接 + 贝塞尔回退
 *
 * 单一职责：
 *   1. 自环边 → React Flow 内置自环渲染
 *   2. 非自环边 → 从节点中心向目标节点发出射线，用 intersectShapeRay 计算与形状边缘的交点，
 *      再用 Bezier/SmoothStep/Straight 直连
 *
 * 数据流:
 *   sourceNode / targetNode（useInternalNode）
 *     → getNodeCenter + getBoundaryConnectionPoint
 *     → 得到 source/target 边界连接点与 Position
 *     → getCurvePath(interpolate) 生成 SVG path
 */
import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
  type EdgeProps,
} from '@xyflow/react';
import type { MermaidEdgeData, MermaidEdgeStyle } from '@mermaid2aichat/serializer';
import { getEdgeStyleConfig, toMarkerUrl } from './edge-markers.js';
import { useBoundaryConnection } from '../boundary-connection.js';

// ============================================================
// 类型
// ============================================================

/** 曲线类型联合（对齐官方 13 种） */
export type EdgeCurveType =
  | 'basis'
  | 'cardinal'
  | 'step'
  | 'stepAfter'
  | 'stepBefore'
  | 'monotoneX'
  | 'monotoneY'
  | 'natural'
  | 'linear'
  | 'bumpX'
  | 'bumpY'
  | 'catmullRom'
  | 'rounded';

// ============================================================
// 常量
// ============================================================

const DEFAULT_STROKE_COLOR = '#333333';
const SELECTED_STROKE_COLOR = '#1890ff';
const DEFAULT_FONT_SIZE = 12;

// ============================================================
// 曲线类型 → React Flow path 生成函数映射（回退用）
// ============================================================

function getCurvePath(
  curveType: string | undefined,
  params: {
    sourceX: number;
    sourceY: number;
    sourcePosition: Parameters<typeof getBezierPath>[0]['sourcePosition'];
    targetX: number;
    targetY: number;
    targetPosition: Parameters<typeof getBezierPath>[0]['targetPosition'];
  },
): [path: string, labelX: number, labelY: number, offsetX: number, offsetY: number] {
  switch (curveType) {
    case 'step':
    case 'stepAfter':
    case 'stepBefore':
    case 'rounded':
      return getSmoothStepPath(params);
    case 'linear':
      return getStraightPath(params);
    case 'basis':
    case 'cardinal':
    case 'monotoneX':
    case 'monotoneY':
    case 'natural':
    case 'bumpX':
    case 'bumpY':
    case 'catmullRom':
    default:
      return getBezierPath(params);
  }
}

// ============================================================
// 边组件
// ============================================================

export const FlowchartEdgeComponent = memo(function FlowchartEdgeComponent({
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
  const edgeStyle: MermaidEdgeStyle = edgeData?.edgeStyle ?? 'arrow';
  const config = getEdgeStyleConfig(edgeStyle);

  // 边界连接点计算（复用统一 hook，与 class/note/floating 边组件共用同一套算法）
  const connection = useBoundaryConnection(source, target);

  // 不可见线 — 仅布局占位，不渲染视觉元素
  if (config.stroke === 'invisible') {
    return null;
  }

  // 线型样式
  const linkStyles = edgeData?.styles;
  const parsedLinkStyle = parseLinkStyle(linkStyles);
  const strokeColor = selected
    ? SELECTED_STROKE_COLOR
    : (parsedLinkStyle.stroke ?? DEFAULT_STROKE_COLOR);
  const interpolate = edgeData?.interpolate;
  const animate = edgeData?.animate;

  const style: React.CSSProperties = {
    stroke: strokeColor,
    strokeWidth: parsedLinkStyle.strokeWidth ?? config.strokeWidth,
  };

  if (parsedLinkStyle.strokeDasharray || config.strokeDasharray) {
    style.strokeDasharray = parsedLinkStyle.strokeDasharray || config.strokeDasharray;
  }

  if (animate) {
    style.animation = 'dashdraw 0.5s linear infinite';
    if (!style.strokeDasharray) {
      style.strokeDasharray = '5,5';
    }
  }

  // 端点 marker
  const markerEnd = toMarkerUrl(config.markerEnd);
  const markerStart = toMarkerUrl(config.markerStart);

  // 路径生成：优先使用边界连接点（非自环且节点已挂载），否则回退到 React Flow 默认坐标
  let edgePath: string;
  let labelX = 0;
  let labelY = 0;

  if (connection) {
    [edgePath, labelX, labelY] = getCurvePath(interpolate, connection);
  } else {
    [edgePath, labelX, labelY] = getCurvePath(interpolate, {
      sourceX,
      sourceY,
      sourcePosition: sourcePosition as Position,
      targetX,
      targetY,
      targetPosition: targetPosition as Position,
    });
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
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
              fontSize: `${DEFAULT_FONT_SIZE}px`,
              border: `1px solid ${selected ? SELECTED_STROKE_COLOR : '#d9d9d9'}`,
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

// ============================================================
// 边类型注册
// ============================================================

export const flowchartEdgeTypes = {
  default: FlowchartEdgeComponent,
  smoothstep: FlowchartEdgeComponent,
};

// ============================================================
// 辅助函数
// ============================================================

/** 解析 linkStyle 字符串数组，提取 stroke / stroke-width / stroke-dasharray */
function parseLinkStyle(styles: string[] | undefined): {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
} {
  if (!styles || styles.length === 0) return {};
  const result: { stroke?: string; strokeWidth?: number; strokeDasharray?: string } = {};
  for (const s of styles) {
    const colonIndex = s.indexOf(':');
    if (colonIndex === -1) continue;
    const key = s.substring(0, colonIndex).trim();
    const value = s.substring(colonIndex + 1).trim();
    switch (key) {
      case 'stroke':
        result.stroke = value;
        break;
      case 'stroke-width':
      case 'strokeWidth': {
        const num = Number(value);
        if (Number.isFinite(num)) {
          result.strokeWidth = num;
        } else {
          const loose = Number(value.replace(/[^0-9.]/g, ''));
          if (Number.isFinite(loose)) {
            result.strokeWidth = loose;
          }
        }
        break;
      }
      case 'stroke-dasharray':
        result.strokeDasharray = value;
        break;
    }
  }
  return result;
}
