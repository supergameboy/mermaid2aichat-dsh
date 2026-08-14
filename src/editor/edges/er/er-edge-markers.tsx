/**
 * ER 边标记定义 — 10 个 ER marker 的 SVG defs 组件 + 基数映射表
 *
 * 单一职责：定义 ER 关系边的端点 marker（5 种基数 × Start/End = 10 个），提供基数到 marker id 的映射
 *
 * 模块4 L2-5（对齐官方 erMarkers.js）：
 *   - 直接复用官方 erMarkers.js 的 SVG path 定义（M 18,7 L9,13... 等）
 *   - marker ID 加 'er-' 前缀避免与 class/flowchart marker 冲突
 *   - 颜色用 CSS 变量 var(--er-edge-stroke)，适配暗色模式
 *   - circle fill 用 var(--er-box-bg)，暗色模式下与 ErBox 背景一致
 *
 * 10 个 marker（对齐官方 erMarkers.js）：
 *   - ONLY_ONE_START/END：两条竖线（||）
 *   - ZERO_OR_ONE_START/END：circle + 竖线（|o / o|）
 *   - ONE_OR_MORE_START/END：曲线 + 竖线（|{ / }|）
 *   - ZERO_OR_MORE_START/END：circle + 曲线（o{ / }o）
 *   - MD_PARENT_START/END：菱形（u）
 *
 * orient 策略（对齐官方 erMarkers.js）：
 *   - 所有 marker 用 orient='auto'（与官方一致）
 *   - Start marker 的图形设计已考虑 orient='auto' 的朝向（竖线/曲线靠近路径一侧）
 *   - 不用 orient='auto-start-reverse'（与 class marker 不同，ER marker 图形已按 Start/End 分别设计）
 *
 * 映射表（exhaustive，无 fallback，institution §1.7 禁止 fallback 掩盖缺陷）：
 *   - ER_CARDINALITY_TO_MARKER_START: Record<ERCardinality, string> — 5 种基数 → Start marker id
 *   - ER_CARDINALITY_TO_MARKER_END: Record<ERCardinality, string> — 5 种基数 → End marker id
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块4-渲染器.md
 */

import type { ERCardinality } from '@mermaid2aichat/serializer';

// ============================================================
// 基数 → marker id 映射表（exhaustive，无 fallback）
// ============================================================

/** ER 基数 → markerStart id 映射表（5 种 × Start，exhaustive 无 fallback） */
export const ER_CARDINALITY_TO_MARKER_START: Record<ERCardinality, string> = {
  'zero-or-one': 'er-zero-or-one-start',
  'zero-or-more': 'er-zero-or-more-start',
  'one-or-more': 'er-one-or-more-start',
  'only-one': 'er-only-one-start',
  'md-parent': 'er-md-parent-start',
};

/** ER 基数 → markerEnd id 映射表（5 种 × End，exhaustive 无 fallback） */
export const ER_CARDINALITY_TO_MARKER_END: Record<ERCardinality, string> = {
  'zero-or-one': 'er-zero-or-one-end',
  'zero-or-more': 'er-zero-or-more-end',
  'one-or-more': 'er-one-or-more-end',
  'only-one': 'er-only-one-end',
  'md-parent': 'er-md-parent-end',
};

// ============================================================
// SVG Marker 定义组件
// ============================================================

/**
 * SVG Marker 定义组件 — 在画布的 <defs> 中渲染 10 个 ER marker
 *
 * 用法：在 graph-canvas.tsx 的 <defs> 中渲染 <ErEdgeMarkers color="var(--er-edge-stroke)" />
 *
 * @param color - marker 描边颜色（CSS 变量字符串，如 'var(--er-edge-stroke)'）
 */
export function ErEdgeMarkers({ color }: { color: string }): React.ReactElement {
  return (
    <>
      {/* === MD_PARENT marker（菱形，对齐官方 erMarkers.js L23-45）===
          不设 viewBox：SVG marker 默认 viewBox="0 0 markerWidth markerHeight"，
          path 坐标按官方原始值（M 18,7 L9,13...），与官方 erMarkers.js 行为一致 */}
      <marker
        id="er-md-parent-start"
        refX={0}
        refY={7}
        markerWidth={190}
        markerHeight={240}
        orient="auto"
      >
        <path d="M 18,7 L9,13 L1,7 L9,1 Z" fill={color} />
      </marker>
      <marker
        id="er-md-parent-end"
        refX={19}
        refY={7}
        markerWidth={20}
        markerHeight={28}
        orient="auto"
      >
        <path d="M 18,7 L9,13 L1,7 L9,1 Z" fill={color} />
      </marker>

      {/* === ONLY_ONE marker（两条竖线，对齐官方 erMarkers.js L47-73）=== */}
      <marker
        id="er-only-one-start"
        refX={0}
        refY={9}
        markerWidth={18}
        markerHeight={18}
        orient="auto"
      >
        <path d="M9,0 L9,18 M15,0 L15,18" stroke={color} fill="none" />
      </marker>
      <marker
        id="er-only-one-end"
        refX={18}
        refY={9}
        markerWidth={18}
        markerHeight={18}
        orient="auto"
      >
        <path d="M3,0 L3,18 M9,0 L9,18" stroke={color} fill="none" />
      </marker>

      {/* === ZERO_OR_ONE marker（circle + 竖线，对齐官方 erMarkers.js L75-109）=== */}
      <marker
        id="er-zero-or-one-start"
        refX={0}
        refY={9}
        markerWidth={30}
        markerHeight={18}
        orient="auto"
      >
        <circle cx={21} cy={9} r={6} stroke={color} fill="var(--er-box-bg)" />
        <path d="M9,0 L9,18" stroke={color} fill="none" />
      </marker>
      <marker
        id="er-zero-or-one-end"
        refX={30}
        refY={9}
        markerWidth={30}
        markerHeight={18}
        orient="auto"
      >
        <circle cx={9} cy={9} r={6} stroke={color} fill="var(--er-box-bg)" />
        <path d="M21,0 L21,18" stroke={color} fill="none" />
      </marker>

      {/* === ONE_OR_MORE marker（曲线 + 竖线，对齐官方 erMarkers.js L111-137）=== */}
      <marker
        id="er-one-or-more-start"
        refX={18}
        refY={18}
        markerWidth={45}
        markerHeight={36}
        orient="auto"
      >
        <path d="M0,18 Q 18,0 36,18 Q 18,36 0,18 M42,9 L42,27" stroke={color} fill="none" />
      </marker>
      <marker
        id="er-one-or-more-end"
        refX={27}
        refY={18}
        markerWidth={45}
        markerHeight={36}
        orient="auto"
      >
        <path d="M3,9 L3,27 M9,18 Q27,0 45,18 Q27,36 9,18" stroke={color} fill="none" />
      </marker>

      {/* === ZERO_OR_MORE marker（circle + 曲线，对齐官方 erMarkers.js L139-181）=== */}
      <marker
        id="er-zero-or-more-start"
        refX={18}
        refY={18}
        markerWidth={57}
        markerHeight={36}
        orient="auto"
      >
        <circle cx={48} cy={18} r={6} stroke={color} fill="var(--er-box-bg)" />
        <path d="M0,18 Q18,0 36,18 Q18,36 0,18" stroke={color} fill="none" />
      </marker>
      <marker
        id="er-zero-or-more-end"
        refX={39}
        refY={18}
        markerWidth={57}
        markerHeight={36}
        orient="auto"
      >
        <circle cx={9} cy={18} r={6} stroke={color} fill="var(--er-box-bg)" />
        <path d="M21,18 Q39,0 57,18 Q39,36 21,18" stroke={color} fill="none" />
      </marker>
    </>
  );
}
