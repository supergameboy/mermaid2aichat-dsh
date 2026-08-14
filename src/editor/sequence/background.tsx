/**
 * SequenceBackground — 时序图画布斑点背景
 *
 * 单一职责：渲染 SVG pattern 斑点背景，颜色通过 CSS 变量控制（暗色模式自动跟随）
 *
 * 放置位置：transform group 内部第一个子元素（跟随 viewport 平移缩放）
 *   - 对齐 React Flow <Background/> Dots variant 行为
 *   - pattern 用 patternUnits="userSpaceOnUse"，放在 transform group 内后随 transform 缩放
 *   - pan 时 dots 跟随移动，zoom 时 dots 间距和大小跟随变化
 * 底色由 SVG 元素的 style.background（var(--seq-canvas-bg)）提供，固定不跟随缩放
 *
 * 参数对齐 React Flow <Background/> 默认值（@xyflow/react v12.11.0 Background.tsx）：
 *   - gap = 20（pattern 单元尺寸，即间距）
 *   - size = 1（Dots variant 直径），radius = size / 2 = 0.5
 *   - DotPattern 实现：<circle cx={radius} cy={radius} r={radius} />
 *
 * 设计文档：docs/design/sequence-canvas-unification.md §关键设计决策 7
 */

/** 斑点 pattern 间距（像素）— 对齐 React Flow <Background/> gap 默认值 20 */
const DOT_PATTERN_GAP = 20;

/** 斑点直径（像素）— 对齐 React Flow <Background/> Dots variant size 默认值 1 */
const DOT_SIZE = 1;

/** 覆盖区域的 rect 范围（足够大以覆盖任何 viewBox） */
const COVERAGE = 99999;
const COVERAGE_OFFSET = -9999;

/**
 * SequenceBackground — 斑点背景组件
 *
 * 无 props，颜色全部通过 CSS 变量控制（--seq-canvas-dot）
 */
export function SequenceBackground(): JSX.Element {
  // radius = size / 2，对齐 React Flow DotPattern：cx=radius, cy=radius, r=radius
  const radius = DOT_SIZE / 2;
  return (
    <>
      <defs>
        <pattern
          id="seq-dot-pattern"
          x="0"
          y="0"
          width={DOT_PATTERN_GAP}
          height={DOT_PATTERN_GAP}
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx={radius}
            cy={radius}
            r={radius}
            style={{ fill: 'var(--seq-canvas-dot)' }}
          />
        </pattern>
      </defs>
      <rect
        x={COVERAGE_OFFSET}
        y={COVERAGE_OFFSET}
        width={COVERAGE}
        height={COVERAGE}
        fill="url(#seq-dot-pattern)"
        pointerEvents="none"
      />
    </>
  );
}
