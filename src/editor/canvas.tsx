/**
 * Canvas — Mermaid 反向编辑器主画布组件（分发器）
 *
 * 职责：根据 diagramType 分发到对应渲染器（本插件仅支持四种图表类型）
 * - sequenceDiagram → SequenceCanvas（专用 SVG 渲染器）
 * - flowchart / classDiagram / erDiagram → GraphCanvas（React Flow）
 */
import type { CanvasState } from '@mermaid2aichat/serializer';
import { isGraphCanvasState, isSequenceCanvasState } from '@mermaid2aichat/serializer';
import type { CanvasProps } from './types.js';
import { GraphCanvas } from './graph-canvas.js';
import { SequenceCanvas } from './sequence/sequence-canvas.js';
import { SequenceCanvasErrorBoundary } from './components/sequence-canvas-error-boundary.js';

/** Canvas Props 扩展 — 增加 syncCanvas 用于分发 */
export interface CanvasDispatcherProps extends CanvasProps {
  /** 当前画布状态（判别联合类型，包含 diagramType） */
  syncCanvas: CanvasState;
}

/**
 * Canvas 组件 — 主分发器
 * 根据 syncCanvas.diagramType 分发到对应渲染器
 */
export function Canvas(props: CanvasDispatcherProps) {
  const { syncCanvas } = props;

  // 时序图 → SequenceCanvas（专用 SVG 渲染器，不使用 React Flow）
  if (isSequenceCanvasState(syncCanvas)) {
    return (
      <SequenceCanvasErrorBoundary>
        <SequenceCanvas
          {...props}
          syncCanvas={syncCanvas}
        />
      </SequenceCanvasErrorBoundary>
    );
  }

  // 图结构类型（flowchart / classDiagram / erDiagram）→ GraphCanvas（React Flow）
  if (isGraphCanvasState(syncCanvas)) {
    return (
      <GraphCanvas
        {...props}
        diagramType={syncCanvas.diagramType}
      />
    );
  }

  // 理论上不可达：本插件仅构造四种图表类型的 CanvasState
  throw new Error('未支持的画布类型');
}
