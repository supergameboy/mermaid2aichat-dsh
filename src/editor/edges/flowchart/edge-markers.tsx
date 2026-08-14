/**
 * flowchart 边标记定义 — 16 种 MermaidEdgeStyle 的端点 marker 配置 + SVG defs
 *
 * 单一职责：根据 MermaidEdgeStyle 计算端点 marker 类型，提供 SVG marker 定义组件
 *
 * 端点形状（对齐官方 mermaid arrowType）:
 *   - arrow_point  → 实心三角箭头（填充）
 *   - arrow_circle → 空心圆圈
 *   - arrow_cross  → X 形十字
 *   - 无 marker    → 普通线段端点
 *
 * 线型（对齐官方 mermaid stroke）:
 *   - normal → 实线（strokeWidth: 2）
 *   - thick  → 粗实线（strokeWidth: 4）
 *   - dotted → 虚线（strokeDasharray: 5,5）
 *   - invisible → 不可见
 */
import type { MermaidEdgeStyle } from '@mermaid2aichat/serializer';

// ============================================================
// 类型定义
// ============================================================

/** 端点 marker 类型（纯字符串，与 React Flow 解耦） */
export type MarkerKind = 'arrow' | 'circle' | 'cross' | undefined;

/** 边样式配置 */
export interface EdgeStyleConfig {
  /** 线型 */
  stroke: 'normal' | 'thick' | 'dotted' | 'invisible';
  /** 线宽 */
  strokeWidth: number;
  /** 虚线模式 */
  strokeDasharray?: string;
  /** 起始端点 marker */
  markerStart?: MarkerKind;
  /** 结束端点 marker */
  markerEnd?: MarkerKind;
}

// ============================================================
// 16 种边样式配置表
// ============================================================

/** 完整的 16 种 MermaidEdgeStyle → EdgeStyleConfig 映射 */
export const EDGE_STYLE_CONFIG: Record<MermaidEdgeStyle, EdgeStyleConfig> = {
  // === 单端箭头 — 实线 ===
  'line':                 { stroke: 'normal', strokeWidth: 2,                                       },
  'arrow':                { stroke: 'normal', strokeWidth: 2,                  markerEnd: 'arrow'           },
  'cross':                { stroke: 'normal', strokeWidth: 2,                  markerEnd: 'cross'           },
  'circle':               { stroke: 'normal', strokeWidth: 2,                  markerEnd: 'circle'          },
  // === 单端箭头 — 粗实线 ===
  'thick-line':           { stroke: 'thick',  strokeWidth: 4,                                       },
  'thick-arrow':          { stroke: 'thick',  strokeWidth: 4,                  markerEnd: 'arrow'           },
  'thick-cross':          { stroke: 'thick',  strokeWidth: 4,                  markerEnd: 'cross'           },
  'thick-circle':         { stroke: 'thick',  strokeWidth: 4,                  markerEnd: 'circle'          },
  // === 单端箭头 — 虚线 ===
  'dotted':               { stroke: 'dotted', strokeWidth: 2, strokeDasharray: '5,5'                       },
  'dotted-arrow':         { stroke: 'dotted', strokeWidth: 2, strokeDasharray: '5,5', markerEnd: 'arrow'  },
  'dotted-cross':         { stroke: 'dotted', strokeWidth: 2, strokeDasharray: '5,5', markerEnd: 'cross'  },
  'dotted-circle':        { stroke: 'dotted', strokeWidth: 2, strokeDasharray: '5,5', markerEnd: 'circle' },
  // === 双端箭头 ===
  'bidirectional-arrow':  { stroke: 'normal', strokeWidth: 2, markerStart: 'arrow',  markerEnd: 'arrow'  },
  'bidirectional-cross':  { stroke: 'normal', strokeWidth: 2, markerStart: 'cross',  markerEnd: 'cross'  },
  'bidirectional-circle': { stroke: 'normal', strokeWidth: 2, markerStart: 'circle', markerEnd: 'circle' },
  // === 特殊 ===
  'invisible':            { stroke: 'invisible', strokeWidth: 0,                                     },
};

// ============================================================
// 公共 API
// ============================================================

/**
 * 获取边样式配置
 * 未知样式回退到 arrow 配置
 */
export function getEdgeStyleConfig(edgeStyle: MermaidEdgeStyle): EdgeStyleConfig {
  return EDGE_STYLE_CONFIG[edgeStyle] ?? EDGE_STYLE_CONFIG.arrow;
}

/**
 * 将 MarkerKind 转换为 SVG marker url
 * 如 'arrow' → 'url(#mermaid-flowchart-arrow-marker)'
 */
export function toMarkerUrl(marker: MarkerKind): string | undefined {
  if (!marker) return undefined;
  return `url(#mermaid-flowchart-${marker}-marker)`;
}

// ============================================================
// SVG Marker 定义组件
// ============================================================

/** 默认描边颜色 */
const DEFAULT_STROKE = '#333333';

/**
 * SVG Marker 定义组件 — 在画布的 <defs> 中渲染所有 marker 定义
 *
 * 必须放置在 React Flow 的 <svg> 内部（通过 GraphCanvas 的 <defs> 注入）
 * 三种 marker:
 *   - arrow: 实心三角箭头（指向终点）
 *   - circle: 空心圆圈
 *   - cross: X 形十字
 */
export function FlowchartEdgeMarkers({ color = DEFAULT_STROKE }: { color?: string }) {
  return (
    <>
      {/* 实心三角箭头 — 指向边的终点方向 */}
      <marker
        id="mermaid-flowchart-arrow-marker"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill={color} stroke={color} strokeWidth="1" />
      </marker>

      {/* 空心圆圈 */}
      <marker
        id="mermaid-flowchart-circle-marker"
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="10"
        markerHeight="10"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <circle cx="5" cy="5" r="4" fill="none" stroke={color} strokeWidth="1.5" />
      </marker>

      {/* X 形十字 */}
      <marker
        id="mermaid-flowchart-cross-marker"
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <path d="M 0 0 L 10 10 M 10 0 L 0 10" stroke={color} strokeWidth="1.5" fill="none" />
      </marker>
    </>
  );
}
