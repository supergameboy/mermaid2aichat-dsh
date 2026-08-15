/**
 * editor 包类型定义 — Canvas 组件接口
 *
 * Stage 7 修订（2026-06-30）：
 *   合并 onCanvasEdit(CanvasSnapshot)/onCanvasUpdate(CanvasState) 双出口为单一
 *   onCanvasChange(CanvasChangePayload)。CanvasChangePayload 携带 snapshot?/fullState/mermaid
 *   三字段，由 CanvasEmitter 内部组装，消费方按需读取。
 */
import type {
  CanvasSnapshot,
  CanvasState,
  DiagramType,
  FlowchartDirection,
  GraphMetadata,
  MermaidEdge,
  MermaidEdgeData,
  MermaidNode,
  MermaidNodeData,
  Viewport,
} from '@mermaid2aichat/serializer';
import type { CanvasChangePayload } from './services/canvas-emitter.js';

// 重导出 CanvasSnapshot 和 CanvasChangePayload 供消费者使用
export type { CanvasSnapshot, CanvasChangePayload };

/**
 * React Flow 节点数据兼容类型
 *
 * 设计说明：
 * - MermaidNodeData 在 serializer 包内以 `type` 别名（对象字面量形式）声明，TypeScript
 *   为其推导隐式索引签名，使其原生满足 React Flow `Node<T extends Record<string, unknown>>`
 *   约束。因此此处不再需要 `& Record<string, unknown>` 交叉类型。
 * - 此处保留为 MermaidNodeData 的语义别名，标注"editor 内 React Flow 节点的 data 类型"，
 *   便于阅读和后续可能的差异化扩展。
 * - 节点数据扩展类型（如 SubgraphNodeData/ErSubgraphNodeData/StateCompositeNodeData）
 *   必须使用 `type X = ReactFlowNodeData & { ... }` 形式，不可改回 `interface extends`，
 *   否则将丢失隐式索引签名推导，破坏 React Flow 约束。
 */
export type ReactFlowNodeData = MermaidNodeData;

/**
 * React Flow 边数据兼容类型（同 ReactFlowNodeData，MermaidEdgeData 的语义别名）
 */
export type ReactFlowEdgeData = MermaidEdgeData;

/**
 * Canvas 组件 Props
 *
 * 数据流设计（单向，无循环）：
 * - 服务端同步：syncNodes/syncEdges/syncDirection/syncViewport → Canvas 内部 useEffect → React Flow state
 * - 本地操作：React Flow state → handler 同步构造 canvas → CanvasEmitter.emitCanvasChange
 *   → CodeConverter.canvasToCode → onCanvasChange(payload) → 外部发送到服务端
 *
 * Stage 7 修订（2026-06-30）：
 *   原 onCanvasEdit(CanvasSnapshot) + onCanvasUpdate(CanvasState) 双出口合并为单一
 *   onCanvasChange(CanvasChangePayload)。payload 携带 snapshot?/fullState/mermaid
 *   三字段，由 CanvasEmitter 内部组装（调用 CodeConverter.canvasToCode 生成 mermaid）。
 *   消费方按需读取：snapshot 用于图结构类型，fullState 用于类型切换/数据图表类型。
 */
export interface CanvasProps {
  /** 服务端同步的节点（变化时覆盖 Canvas 内部 state） */
  syncNodes: MermaidNode[];
  /** 服务端同步的边 */
  syncEdges: MermaidEdge[];
  /** 服务端同步的方向 */
  syncDirection: FlowchartDirection;
  /** 服务端同步的视口（平移/缩放） */
  syncViewport: Viewport | null;
  /** 服务端同步的元数据（architecture 的 groups 等） */
  syncMetadata?: GraphMetadata;

  /**
   * 画布变更回调（统一出口）。
   *
   * 用户操作（拖动节点/添加边/修改 label 等）和代码编辑器变更（包括类型切换）均通过此回调。
   * payload 由 CanvasEmitter 内部组装：
   *   - snapshot：图结构类型时填充（从 GraphCanvasState 提取），消费方用于更新图结构画布
   *   - fullState：总是填充（等于输入 canvas），用于类型切换/数据图表类型
   *   - mermaid：由 CodeConverter.canvasToCode 生成，用于 CodeEditor 显示 + 广播
   *
   * 外部（App.tsx）负责：乐观更新本地 state + 发送 WsClientMessage 到服务端。
   */
  onCanvasChange: (payload: CanvasChangePayload) => void;
  /** 方向变化回调 */
  onDirectionChange: (dir: FlowchartDirection) => void;
  /** 视口变化回调（用户平移/缩放触发） */
  onViewportChange: (viewport: Viewport) => void;
  /** 图表类型切换回调（用户通过代码区下拉选择器或代码编辑器首行修改触发）
   * 外部负责弹窗确认 + 构造新类型 CanvasState + 发送到服务端
   */
  onDiagramTypeChange?: (newType: DiagramType) => void;
}
