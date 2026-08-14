/**
 * SequenceArrowMarkers — 时序图箭头 marker 定义 + 类型映射
 *
 * 单一职责：
 *   1. 定义 9 个 SVG marker（5 现有 + 4 新增，对齐官方 mermaid svgDraw.js）
 *   2. 提供 getArrowMarkerConfig: SequenceArrowType → { markerEnd?, markerStart? } 映射
 *
 * 策略B（多类型共用 marker，B3.4 设计文档）：
 *   - solid/dotted 共用同一 marker，线型由 stroke-dasharray 控制（在 message-row.tsx 处理）
 *   - 正向箭头用 marker-end，反向箭头用 marker-start
 *   - 反向箭头 top/bottom 反转（对齐官方 mermaid sequenceRenderer.ts:606-624）：
 *       solid-arrow-top-reverse     → markerStart=solid-bottom（top 反转）
 *       solid-arrow-bottom-reverse  → markerStart=solid-top（bottom 反转）
 *       stick-arrow-top-reverse     → markerStart=stick-bottom
 *       stick-arrow-bottom-reverse  → markerStart=stick-top
 *   - central-connection 三种类型由 CentralConnectionRender 渲染圆形节点，不使用 marker
 *
 * marker 总览（9 个 marker 覆盖 26 种箭头类型，3 种 central-connection 不使用 marker = 29 种）：
 *   现有 5 个：seq-arrow-filled / open / cross / point / bidirectional
 *   新增 4 个：seq-arrow-solid-top / solid-bottom / stick-top / stick-bottom
 *
 * 数据源对齐（官方 mermaid）：
 *   - 新增 4 个 marker 的 SVG 属性对齐 svgDraw.js:1944-2008
 *   - 反向箭头 marker-start 映射对齐 sequenceRenderer.ts:606-624
 */
import type { SequenceArrowType } from '@mermaid2aichat/serializer';

// ============================================================
// 类型定义
// ============================================================

/** 箭头 marker 配置 — markerEnd/markerStart 至多一个有值（双向箭头两者都有值）
 *
 * 值为 `url(#marker-id)` 字符串，或 undefined（不设置 marker）
 * central-connection 三种类型返回空对象（不使用 marker）
 */
export interface ArrowMarkerConfig {
  /** 终点 marker（正向箭头） */
  markerEnd?: string;
  /** 起点 marker（反向箭头 / 双向箭头） */
  markerStart?: string;
}

// ============================================================
// 公共 API：getArrowMarkerConfig
// ============================================================

/** 根据 SequenceArrowType 推导 marker 配置
 *
 * 策略B：solid/dotted 共用 marker（线型由调用方控制 stroke-dasharray）
 * 反向箭头 top/bottom 反转（对齐官方 mermaid sequenceRenderer.ts:606-624）
 *
 * @throws Error 未知类型抛错（程序错误不可包容，institution.md 第1.7条）
 */
export function getArrowMarkerConfig(messageType: SequenceArrowType): ArrowMarkerConfig {
  switch (messageType) {
    // === 基本箭头（marker-end） ===
    case 'solid-arrow':
    case 'dotted-arrow':
      return { markerEnd: 'url(#seq-arrow-filled)' };
    case 'solid-open':
    case 'dotted-open':
      return { markerEnd: 'url(#seq-arrow-open)' };
    case 'solid-cross':
    case 'dotted-cross':
      return { markerEnd: 'url(#seq-arrow-cross)' };
    case 'solid-point':
    case 'dotted-point':
      return { markerEnd: 'url(#seq-arrow-point)' };

    // === 双向箭头（marker-start + marker-end） ===
    case 'bidirectional-solid':
    case 'bidirectional-dotted':
      return {
        markerStart: 'url(#seq-arrow-bidirectional)',
        markerEnd: 'url(#seq-arrow-filled)',
      };

    // === 异步箭头-正向（marker-end） ===
    case 'solid-top':
    case 'solid-top-dotted':
      return { markerEnd: 'url(#seq-arrow-solid-top)' };
    case 'solid-bottom':
    case 'solid-bottom-dotted':
      return { markerEnd: 'url(#seq-arrow-solid-bottom)' };
    case 'stick-top':
    case 'stick-top-dotted':
      return { markerEnd: 'url(#seq-arrow-stick-top)' };
    case 'stick-bottom':
    case 'stick-bottom-dotted':
      return { markerEnd: 'url(#seq-arrow-stick-bottom)' };

    // === 异步箭头-反向（marker-start，top/bottom 反转） ===
    // 对齐官方 mermaid sequenceRenderer.ts:606-624：
    //   solid-arrow-top-reverse     → marker-start = solidBottomArrowHead
    //   solid-arrow-bottom-reverse  → marker-start = solidTopArrowHead
    //   stick-arrow-top-reverse     → marker-start = stickBottomArrowHead
    //   stick-arrow-bottom-reverse  → marker-start = stickTopArrowHead
    case 'solid-arrow-top-reverse':
    case 'solid-arrow-top-reverse-dotted':
      return { markerStart: 'url(#seq-arrow-solid-bottom)' };
    case 'solid-arrow-bottom-reverse':
    case 'solid-arrow-bottom-reverse-dotted':
      return { markerStart: 'url(#seq-arrow-solid-top)' };
    case 'stick-arrow-top-reverse':
    case 'stick-arrow-top-reverse-dotted':
      return { markerStart: 'url(#seq-arrow-stick-bottom)' };
    case 'stick-arrow-bottom-reverse':
    case 'stick-arrow-bottom-reverse-dotted':
      return { markerStart: 'url(#seq-arrow-stick-top)' };

    // === central-connection（圆形节点，不使用 marker） ===
    // 由 CentralConnectionRender 渲染圆形节点，不调用 getArrowMarkerConfig
    case 'central-connection':
    case 'central-connection-reverse':
    case 'central-connection-dual':
      return {};

    // === 未知类型：抛错（程序错误不可包容） ===
    default:
      throw new Error(
        `getArrowMarkerConfig: unknown messageType "${String(messageType)}"`,
      );
  }
}

// ============================================================
// SVG Marker 定义组件
// ============================================================

/** 默认描边/填充颜色（CSS 变量，暗色模式自动跟随） */
const DEFAULT_COLOR = 'var(--seq-arrow-color)';

/** SVG Marker 定义组件 — 在画布 <defs> 中渲染 9 个 marker
 *
 * 必须放置在 <svg> 内部的 <defs> 中（通过 SequenceCanvas 注入）
 *
 * marker 来源：
 *   - 5 个现有 marker（保留原 sequence-canvas.tsx 内联定义，未修改属性）
 *   - 4 个新增 marker（对齐官方 mermaid svgDraw.js:1944-2008）
 *
 * 新增 marker 关键属性（对齐官方）：
 *   - orient="auto-start-reverse"：保证 marker-start 方向正确（反向箭头）
 *   - markerUnits="userSpaceOnUse"：marker 大小不随 strokeWidth 缩放
 *   - refX/refY：marker 在线条上的锚点（对齐官方）
 *   - markerWidth/Height=12：marker 渲染尺寸（对齐官方）
 */
export function SequenceArrowMarkers() {
  return (
    <>
      {/* === 5 个现有 marker（保留原属性，未修改） === */}

      {/* 实心三角箭头（solid-arrow / dotted-arrow / bidirectional 的 marker-end） */}
      <marker
        id="seq-arrow-filled"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: DEFAULT_COLOR }} />
      </marker>

      {/* 开放三角箭头（solid-open / dotted-open） */}
      <marker
        id="seq-arrow-open"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto"
      >
        <path d="M 0 0 L 10 5 L 0 10" fill="none" strokeWidth="1.5" style={{ stroke: DEFAULT_COLOR }} />
      </marker>

      {/* 十字箭头（solid-cross / dotted-cross） */}
      <marker
        id="seq-arrow-cross"
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto"
      >
        <path d="M 0 0 L 10 10 M 10 0 L 0 10" strokeWidth="2" fill="none" style={{ stroke: DEFAULT_COLOR }} />
      </marker>

      {/* 圆点箭头（solid-point / dotted-point） */}
      <marker
        id="seq-arrow-point"
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto"
      >
        <circle cx="5" cy="5" r="4" style={{ fill: DEFAULT_COLOR }} />
      </marker>

      {/* 双向箭头起点（bidirectional-solid / bidirectional-dotted 的 marker-start） */}
      <marker
        id="seq-arrow-bidirectional"
        viewBox="0 0 10 10"
        refX="0"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto"
      >
        <path d="M 10 0 L 0 5 L 10 10 z" style={{ fill: DEFAULT_COLOR }} />
      </marker>

      {/* === 4 个新增 marker（对齐官方 mermaid svgDraw.js:1944-2008） === */}

      {/* 实心顶部箭头（solid-top / solid-top-dotted 的 marker-end；
          solid-arrow-bottom-reverse 的 marker-start，因 top/bottom 反转） */}
      <marker
        id="seq-arrow-solid-top"
        refX="7.9"
        refY="7.25"
        markerWidth="12"
        markerHeight="12"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <path d="M 0 0 L 10 8 L 0 8 z" style={{ fill: DEFAULT_COLOR }} />
      </marker>

      {/* 实心底部箭头（solid-bottom / solid-bottom-dotted 的 marker-end；
          solid-arrow-top-reverse 的 marker-start，因 top/bottom 反转） */}
      <marker
        id="seq-arrow-solid-bottom"
        refX="7.9"
        refY="0.75"
        markerWidth="12"
        markerHeight="12"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <path d="M 0 0 L 10 0 L 0 8 z" style={{ fill: DEFAULT_COLOR }} />
      </marker>

      {/* 棍状顶部箭头（stick-top / stick-top-dotted 的 marker-end；
          stick-arrow-bottom-reverse 的 marker-start） */}
      <marker
        id="seq-arrow-stick-top"
        refX="7.5"
        refY="7"
        markerWidth="12"
        markerHeight="12"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <path d="M 0 0 L 7 7" strokeWidth="1.5" fill="none" style={{ stroke: 'var(--seq-arrow-color)' }} />
      </marker>

      {/* 棍状底部箭头（stick-bottom / stick-bottom-dotted 的 marker-end；
          stick-arrow-top-reverse 的 marker-start） */}
      <marker
        id="seq-arrow-stick-bottom"
        refX="7.5"
        refY="0"
        markerWidth="12"
        markerHeight="12"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <path d="M 0 7 L 7 0" strokeWidth="1.5" fill="none" style={{ stroke: 'var(--seq-arrow-color)' }} />
      </marker>
    </>
  );
}
