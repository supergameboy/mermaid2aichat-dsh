/**
 * GraphCanvas — 图结构类型画布（React Flow）
 *
 * 单一职责：管理 React Flow 画布状态，处理用户交互，通过回调通知外部
 * 支持 7 种图结构类型：flowchart/sequenceDiagram/classDiagram/erDiagram/mindmap/stateDiagram/architecture
 *
 * 数据流设计（单向，无循环）：
 * - 服务端同步：syncNodes/syncEdges/syncDirection → useEffect → React Flow state
 * - 本地操作：React Flow state → handler 同步构造 canvas → CanvasEmitter.emitCanvasChange
 *   → CodeConverter.canvasToCode → onCanvasChange(payload) → 外部发送到服务端
 *
 * Stage 7 修订（2026-06-30）：
 *   - 删除 applyIncrementalChanges（决策1：incremental-serializer 已删除）
 *   - 删除 mermaidCode useMemo + 4 个 ref（rawCodeRef/previousCanvasRef/isDraggingRef/mermaidCodeCache）
 *   - 改用 CodeConverter + CanvasEmitter 服务（useRef 持有实例）
 *   - mermaidCode 由 emitCanvasChange 返回值更新（state，非 ref）
 *   - 22 处 setTimeout(0) 改为同步调用 emitCanvasChange（消除 ref 依赖）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useUpdateNodeInternals,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Node,
  type Edge,
  type OnNodeDrag,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  isGraphCanvasState,
  detectCycle,
  type CanvasState,
  type MermaidShapeType,
  type MermaidNode,
  type MermaidEdge,
  type FlowchartDirection,
  type GraphDiagramType,
  type GraphCanvasState,
  type GraphMetadata,
  type ArchitectureGroupInfo,
  type ArchitectureLayoutHint,
  type ArchitectureEdgeInfo,
} from '@mermaid2aichat/serializer';
import type { CanvasDispatcherProps } from './canvas.js';
import type { CanvasProps } from './types.js';
import { idGenerator, createCodeChangeHandler } from './services/index.js';
import { useCanvasServices } from './hooks/use-canvas-services.js';
import { useSyncedViewport } from './hooks/use-synced-viewport.js';
import { getNodeTypes, DirectionContext, ConnectionModeContext, type ConnectionMode } from './nodes/index.js';
import { getEdgeTypes } from './edges/index.js';
import { FlowchartEdgeMarkers } from './edges/flowchart/index.js';
import { ErEdgeMarkers } from './edges/er/index.js';
import { getLayoutFn } from './layouts/index.js';
import { recalculateSubgraphSizes, markSelfLoopEdges, SUBGRAPH_TITLE_HEIGHT } from './layouts/dagre-layout.js';
import {
  sortNodesByParentOrder,
  mapNodeTypeForFlowchart,
  normalizeClassDiagramNode,
  centerNodeAt,
  getViewportCenterFlowPosition,
  isContainerNode,
  getNodeAbsolutePosition,
  collectSubtreeIds,
  findContainerAtPosition,
  findStartNode,
} from './graph-canvas-helpers.js';
// M3 修订：handleNodeDragStop 计算被拖拽节点尺寸时需要 class-box 动态尺寸（修复布局重叠 bug）
import { computeClassBoxSize } from './nodes/class/class-box-size.js';
// M4 修订：er-box 同样需要动态尺寸估算（attributes/alias 影响高度）
import { computeErBoxSize } from './nodes/er/er-box-size.js';
import { Toolbar } from './components/toolbar.js';
import { NodeLibrary } from './components/node-library.js';
import { getTemplate, getTemplatesForDiagramType } from './components/node-templates.js';
import { ConsumedBadge } from './components/consumed-badge.js';
import { ConnectionStatus } from './components/connection-status.js';
import { PropertyPanel, type SelectedId } from './components/property-panel.js';
import { ContextMenu } from './components/flowchart/context-menu.js';
import { InlineEditor } from './components/inline-editor.js';
import { CodeEditor } from './components/code-editor.js';
import { MindmapTreePanel, collectDescendantIds } from './components/mindmap/index.js';
import { ArchitectureTreePanel } from './components/architecture/architecture-tree-panel.js';
import { ArchitectureLayoutPanel } from './components/architecture/architecture-layout-panel.js';
import { useSyncedMermaidCode } from './hooks/use-synced-mermaid-code.js';
// M0: 触发 architecture icon 自动注册到 IconRegistry
import './components/architecture-icon-registration.js';
import './styles.css';

// React Flow 内部测量变化类型（非用户操作，不应触发 canvas_edit）
const INTERNAL_CHANGE_TYPES = new Set(['measured', 'dimensions']);

/** 默认新节点标签 */
const DEFAULT_NODE_LABEL = '新节点';

/** GraphCanvas Props — 继承 CanvasDispatcherProps，增加 diagramType */
export interface GraphCanvasProps extends CanvasDispatcherProps {
  /** 图表类型（决定节点/边组件和布局算法） */
  diagramType: GraphDiagramType;
}

function GraphCanvasInner(props: GraphCanvasProps) {
  const {
    syncNodes,
    syncEdges,
    syncDirection,
    syncViewport,
    syncMetadata,
    // syncCanvas 由 Canvas 分发器透传，用于读取 rawCode 等完整状态
    syncCanvas,
    consumed,
    canvasSource,
    lastConsumedAt,
    connectionStatus,
    onCanvasChange,
    onDirectionChange,
    onResetConsumed,
    onViewportChange,
    onDiagramTypeChange,
    diagramType,
  } = props;

  const reactFlow = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  // reactFlowRef：持有 useReactFlow 实例，避免 applyCanvasChange useCallback 依赖 reactFlow 导致频繁重建
  const reactFlowRef = useRef(reactFlow);
  reactFlowRef.current = reactFlow;

  const [nodes, setNodes, onNodesChange] = useNodesState<MermaidNode>(syncNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<MermaidEdge>(syncEdges);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  /** v4：architecture 选中状态联合类型（替代 selectedGroupId） */
  const [archSelectedId, setArchSelectedId] = useState<SelectedId>(null);
  /** v4：architecture 删除 group 确认对话框状态 */
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<{ groupId: string; groupName: string } | null>(null);
  /** M1：flowchart 右键菜单状态 */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeIds: string[]; targetNodeId?: string } | null>(null);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const directionRef = useRef(syncDirection);
  /** architecture: metadata 状态（groups 等） */
  const [metadata, setMetadata] = useState<GraphMetadata | undefined>(syncMetadata);
  const metadataRef = useRef(metadata);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  directionRef.current = syncDirection;
  metadataRef.current = metadata;

  // ============================================================
  // Stage 7：CodeConverter + CanvasEmitter 服务实例（通过 useCanvasServices 统一管理）
  // ============================================================
  // CodeConverter：封装 parseMermaid + serializeMermaid，管理 rawCode/previousCanvas 缓存
  // CanvasEmitter：统一画布变更出口，内部调用 canvasToCode 生成 mermaid
  // 实例生命周期与 GraphCanvas 一致（useRef 持有，组件卸载时自动 GC）
  const { codeConverter, canvasEmitter, mermaidCode, setMermaidCode } = useCanvasServices({
    syncCanvas,
    onCanvasChange,
  });

  const [localDirection, setLocalDirection] = useState<FlowchartDirection>(syncDirection);

  useEffect(() => {
    setLocalDirection(syncDirection);
  }, [syncDirection]);

  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('direction');

  // 面板折叠/调整宽度状态
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(280);
  const [resizing, setResizing] = useState<'left' | 'right' | null>(null);

  // 根据 diagramType 选择节点/边类型和布局函数
  const nodeTypes = useMemo(() => getNodeTypes(diagramType), [diagramType]);
  const edgeTypes = useMemo(() => getEdgeTypes(diagramType), [diagramType]);
  const layoutFn = useMemo(() => getLayoutFn(diagramType), [diagramType]);

  const handleConnectionModeChange = useCallback(
    (mode: ConnectionMode) => {
      setConnectionMode(mode);
      const edgeType = mode === 'nearest' ? 'floating' : 'smoothstep';
      setEdges((eds) => eds.map((e) => ({ ...e, type: edgeType })));
      setTimeout(() => {
        nodesRef.current.forEach((node) => updateNodeInternals(node.id));
      }, 0);
    },
    [setEdges, updateNodeInternals]
  );

  // 面板拖拽调整宽度
  const handleResizeStart = useCallback((panel: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(panel);
    const startX = e.clientX;
    const startWidth = panel === 'left' ? leftWidth : rightWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = panel === 'left'
        ? moveEvent.clientX - startX
        : startX - moveEvent.clientX;
      const minWidth = 180;
      const maxWidth = 400;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
      if (panel === 'left') {
        setLeftWidth(newWidth);
      } else {
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [leftWidth, rightWidth]);

  // viewport 远端同步防循环（通过 useSyncedViewport 统一管理）
  const { isApplyingRemoteViewport } = useSyncedViewport({
    syncViewport,
    applyRemoteViewport: (vp) => reactFlow.setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom }),
  });



  // architecture: 同步 metadata（groups 等）
  useEffect(() => {
    setMetadata(syncMetadata);
  }, [syncMetadata]);

  // mindmap: 从 nodes 的 parentId 派生 edges（用于 React Flow 渲染，不存储在 CanvasState.edges）
  useEffect(() => {
    if (diagramType !== 'mindmap') return;
    const derivedEdges: MermaidEdge[] = nodes
      .filter((n): n is MermaidNode & { parentId: string } => Boolean(n.parentId))
      .map((n) => ({
        id: `mindmap-edge-${n.id}`,
        source: n.parentId,
        target: n.id,
        type: 'smoothstep',
        data: { edgeStyle: 'line' as const },
      }));
    setEdges(derivedEdges);
  }, [nodes, diagramType, setEdges]);

  /**
   * 构造 GraphCanvasState（同步，无 ref 依赖）
   *
   * Stage 7 修订：原 getCanvasSnapshot 从 ref 读取，依赖 setTimeout(0) 等 state 更新。
   * 改为接收 nodes/edges/direction/metadata 参数，调用方同步构造，消除 setTimeout 依赖。
   *
   * mindmap 的 edges 从 parentId 派生，不存储在 CanvasState.edges 中（传 []）。
   * architecture 需要传递 metadata（groups 等）。
   */
  const buildCanvasState = useCallback(
    (
      nodesParam: MermaidNode[],
      edgesParam: MermaidEdge[],
      directionParam: FlowchartDirection,
      metadataParam: GraphMetadata | undefined,
    ): GraphCanvasState => {
      // mindmap 的 edges 从 parentId 派生，不存储在 CanvasState.edges 中
      const effectiveEdges = diagramType === 'mindmap' ? [] : edgesParam;
      const canvas: GraphCanvasState = {
        diagramType,
        nodes: nodesParam,
        edges: effectiveEdges,
        direction: directionParam,
        ...(metadataParam !== undefined ? { metadata: metadataParam } : {}),
        needsLayout: false,
      };
      return canvas;
    },
    [diagramType],
  );

  interface CanvasChangeOptions {
    /** 新的节点数组（已包含本次变更） */
    nodes: MermaidNode[];
    /** 新的边数组（如果边也变了；不传则使用 edgesRef.current） */
    edges?: MermaidEdge[];
    /**
     * 新的 metadata（architecture groups/layoutHints 等）。
     * 若本次变更涉及 metadata，必须通过此字段同步传入，避免 setMetadata 异步
     * 导致 metadataRef.current 时序问题。applyCanvasChange 内部会同步更新
     * metadataRef.current + setMetadata + 传入 buildCanvasState。
     */
    metadata?: GraphMetadata;
    /**
     * 计算类别（可组合，互不冲突）：
     * - layout: 重布局，调用 layoutFn 重新计算所有节点位置（最重，包含子图和边）
     * - subgraph: 重算子图，根据子节点位置重算 subgraph 尺寸和位置（仅 flowchart 生效）
     * - edges: 重算连线，根据节点位置重新计算边的回路边状态和自环标记（仅 flowchart 生效）
     *
     * layout 为 true 时忽略 subgraph/edges（layoutFn 已包含二者）
     * 全为 false/undefined 时仅 sortNodesByParentOrder + 通知外部
     */
    recalculate?: {
      layout?: boolean;
      subgraph?: boolean;
      edges?: boolean;
    };
  }

  /**
   * 统一画布变更入口：所有 flowchart/structure/位置/属性/metadata 变更都走此函数
   *
   * Stage 7 修订：
   *   - 删除 setTimeout(0) + onCanvasEdit(getCanvasSnapshot()) 模式
   *   - 改为同步构造 canvas + emitCanvasChange(canvas)
   *   - emitCanvasChange 内部调用 canvasToCode 生成 mermaid，返回值更新 mermaidCode state
   *   - 接受可选 metadata 参数：同步更新 metadataRef.current + setMetadata + 传入 buildCanvasState
   *     消除 caller 端 setMetadata + setTimeout(0) 的时序依赖
   *   - 数据流：handler → applyCanvasChange → setNodes/setEdges/setMetadata + emitCanvasChange → onCanvasChange(payload)
   */
  const applyCanvasChange = useCallback((options: CanvasChangeOptions) => {
    let { nodes: newNodes, edges: newEdges, metadata: newMetadata, recalculate } = options;
    // 统一节点标准化：各图类型节点必须设置正确的 type 和 width/height
    // 这样新创建节点、代码解析、服务端同步的渲染路径完全一致
    if (diagramType === 'flowchart') {
      newNodes = newNodes.map(mapNodeTypeForFlowchart);
    } else if (diagramType === 'classDiagram') {
      newNodes = newNodes.map(normalizeClassDiagramNode);
    }
    // Bug10: parentId 变更后必须保证父节点排在子节点之前，否则 React Flow 无法识别父子关系
    newNodes = sortNodesByParentOrder(newNodes);
    const currentEdges = newEdges ?? edgesRef.current;
    const rec = recalculate ?? {};

    // 同步更新 metadata：caller 传入 newMetadata 时立即写入 ref，避免 layoutFn 读到旧值
    const effectiveMetadata = newMetadata ?? metadataRef.current;
    if (newMetadata !== undefined && newMetadata !== metadataRef.current) {
      metadataRef.current = newMetadata;
      setMetadata(newMetadata);
    }

    if (rec.layout) {
      // 重布局：layoutFn 已包含子图尺寸和回路边标记计算
      // 使用 directionRef.current 而非 localDirection state，确保 setLocalDirection 后立即调用也能读到最新方向
      const layouted = layoutFn(newNodes, currentEdges, directionRef.current, effectiveMetadata);
      newNodes = layouted.nodes;
      newEdges = layouted.edges;

      // 重布局后居中到逻辑起点节点，便于从起点开始浏览
      const startNode = findStartNode(newNodes, currentEdges);
      if (startNode) {
        const zoom = reactFlowRef.current.getViewport().zoom;
        const cx = startNode.position.x + (startNode.width ?? 0) / 2;
        const cy = startNode.position.y + (startNode.height ?? 0) / 2;
        // setTimeout(0)：等待 setNodes 渲染后再 setCenter，与 onDirectionChange 的 updateNodeInternals 时序模式一致
        setTimeout(() => {
          reactFlowRef.current.setCenter(cx, cy, { zoom });
        }, 0);
      }
    } else {
      // 非重布局：按标志独立执行重算子图和重算连线
      // M3 修订：recalculate.subgraph 扩展到 classDiagram
      //   - 原仅 flowchart 生效，classDiagram namespace 拖拽后尺寸不重算 → 视觉错位
      //   - isContainerNode 已统一覆盖 subgraph + class-namespace（graph-canvas-helpers.ts）
      //   - recalculateSubgraphSizes 已基于 isContainerNode 工作（dagre-layout.ts:464）
      if (rec.subgraph && (diagramType === 'flowchart' || diagramType === 'classDiagram')) {
        newNodes = recalculateSubgraphSizes(newNodes);
      }
      if (rec.edges && diagramType === 'flowchart') {
        newEdges = markSelfLoopEdges(currentEdges);
      }
    }

    setNodes(newNodes);
    if (newEdges !== undefined) setEdges(newEdges);

    // Stage 7：同步构造 canvas + emitCanvasChange（无 setTimeout）
    const canvas = buildCanvasState(
      newNodes,
      newEdges ?? edgesRef.current,
      directionRef.current,
      effectiveMetadata,
    );
    const newMermaid = canvasEmitter.emitCanvasChange(canvas);
    setMermaidCode(newMermaid);
  }, [diagramType, layoutFn, setNodes, setEdges, setMetadata, canvasEmitter, buildCanvasState]);

  // ============================================================
  // 统一画布渲染管线
  // ============================================================

  // syncCanvas ref：用于 needsLayout 检查，但不作为 effect 依赖
  // 避免方向等字段变化时误触 syncNodes/syncEdges effect 覆盖布局结果
  const syncCanvasRef = useRef(syncCanvas);
  syncCanvasRef.current = syncCanvas;

  // 修复 6：服务端同步节点后，若 syncCanvas.needsLayout 为 true，说明尚未布局，
  // 自动触发 structural 布局，避免 MCP create_view 后节点重叠。
  // 依赖 syncNodes/syncEdges 而非 syncCanvas，防止方向变更等场景误触
  //
  // 归一化后再 setNodes：parseMermaid 直出的容器节点不带 width/height，
  // 当 needsLayout !== true 时不触发 layout，直接 setNodes 会导致 React Flow NodeWrapper
  // 对无尺寸节点设置 visibility:hidden，内层容器背景色不可见。
  // 此处与 applyCanvasChange 内部保持一致（各图类型都有兜底默认尺寸）。
  // applyCanvasChange 仍传原始 syncNodes（其内部会再次归一化），避免双重归一化。
  useEffect(() => {
    let normalized: MermaidNode[];
    if (diagramType === 'flowchart') {
      normalized = syncNodes.map(mapNodeTypeForFlowchart);
    } else if (diagramType === 'classDiagram') {
      normalized = syncNodes.map(normalizeClassDiagramNode);
    } else {
      normalized = syncNodes;
    }
    setNodes(normalized);

    // 仅在 syncCanvas 显式需要布局时触发，防止覆盖用户手动调整的布局
    if (isGraphCanvasState(syncCanvasRef.current) && syncCanvasRef.current.needsLayout === true) {
      applyCanvasChange({ nodes: syncNodes, edges: syncEdges, recalculate: { layout: true } });
    }
  }, [syncNodes, setNodes, syncEdges, applyCanvasChange, diagramType]);

  useEffect(() => {
    // 需要布局时由 applyCanvasChange 统一设置 edges，避免覆盖布局结果
    if (isGraphCanvasState(syncCanvasRef.current) && syncCanvasRef.current.needsLayout === true) return;
    setEdges(syncEdges);
  }, [syncEdges, setEdges]);

  // 当从其他图类型切换回 flowchart 时，触发一次自动布局
  // 否则节点可能仍沿用其他类型的坐标，导致全部挤在一起
  const prevDiagramTypeRef = useRef(diagramType);
  useEffect(() => {
    if (prevDiagramTypeRef.current !== diagramType && diagramType === 'flowchart') {
      applyCanvasChange({ nodes: syncNodes, edges: syncEdges, recalculate: { layout: true } });
    }
    prevDiagramTypeRef.current = diagramType;
  }, [diagramType, syncNodes, syncEdges, applyCanvasChange]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<MermaidNode>[]) => {
      onNodesChange(changes);
      // 注意：所有用户触发的结构/位置变更统一通过 applyCanvasChange 处理并通知外部
      // handleNodesChange 只负责 React Flow 内部状态同步，不再直接触发 onCanvasEdit
    },
    [onNodesChange]
  );

  /**
   * 移动节点到 subgraph/namespace（subgraphId 为 null 表示移出到顶层）
   *
   * 坐标转换说明：
   * - React Flow Parent Node 机制下，子节点 position 是相对于父节点的坐标
   * - 移入子图：绝对坐标 → 相对坐标（减去目标 subgraph 的绝对坐标）
   * - 移出子图：相对坐标 → 绝对坐标（累加所有祖先 subgraph 的 position）
   * - 不设置 extent:'parent'，允许子节点自由移动（用户要求去除移动限制）
   *
   * 嵌套子图处理：
   * - 移出多层嵌套子图时，需要累加所有祖先的 position 才能得到绝对坐标
   * - 移入嵌套子图时，需要计算目标 subgraph 的绝对坐标（累加其所有祖先）
   *
   * M3 修订：
   *   - 删除局部 getAbsolutePosition 函数，统一使用公共 getNodeAbsolutePosition
   *     （单一数据源 institution §1.1，与 findContainerAtPosition/handleNodeDragStop 共用）
   *   - 必须定义在 handleNodeDragStop 之前（依赖数组引用，避免 TDZ）
   */
  const handleMoveToSubgraph = useCallback((nodeId: string, subgraphId: string | null) => {
    const moved = nodesRef.current.map((n) => {
      if (n.id !== nodeId) return n;
      if (subgraphId === null) {
        // 移出子图：相对坐标 → 绝对坐标
        const { parentId, extent, ...rest } = n;
        const absolutePos = getNodeAbsolutePosition(n, nodesRef.current);
        return {
          ...rest,
          position: {
            x: absolutePos.x,
            y: absolutePos.y,
          },
        };
      }
      // 移入子图：绝对坐标 → 相对坐标
      const subgraph = nodesRef.current.find((p) => p.id === subgraphId);
      if (!subgraph) return n;  // 目标 subgraph 不存在，保持原状态
      const nodeAbsPos = getNodeAbsolutePosition(n, nodesRef.current);
      const subgraphAbsPos = getNodeAbsolutePosition(subgraph, nodesRef.current);
      return {
        ...n,
        parentId: subgraphId,
        position: {
          x: nodeAbsPos.x - subgraphAbsPos.x,
          y: nodeAbsPos.y - subgraphAbsPos.y + SUBGRAPH_TITLE_HEIGHT,
        },
      };
    });

    applyCanvasChange({ nodes: moved, recalculate: { subgraph: true, edges: true } });
  }, [applyCanvasChange]);

  /**
   * 拖拽结束后处理容器包含 + 重算子图尺寸（M3 修订：实装拖拽进入 namespace/subgraph）
   *
   * 数据流：
   *   React Flow onNodeDragStop(event, node)
   *     → collectDescendantIds(node.id, nodes) — 排除自身+后代防循环
   *     → getNodeAbsolutePosition(node, nodes) — 被拖拽节点绝对坐标
   *     → findContainerAtPosition(nodes, center, excludeIds) — 找最深容器
   *     → 与原 parentId 比较：
   *         - 不同 → handleMoveToSubgraph（移入新容器或移出到顶层）
   *         - 相同 → applyCanvasChange 重算 subgraph + edges
   *
   * 覆盖范围：flowchart subgraph + classDiagram namespace（isContainerNode 统一判定）
   * 防循环：collectSubtreeIds 排除自身+所有后代，避免拖入自己后代形成 parentId 环
   */
  const handleNodeDragStop = useCallback<OnNodeDrag<MermaidNode>>(
    (event, node) => {
      const draggedNode = node;
      // 1. 收集被拖拽节点 + 后代 ID（防循环：拖入自己后代会形成 parentId 环）
      const excludeIds = collectSubtreeIds(draggedNode.id, nodesRef.current);
      // 2. 计算被拖拽节点绝对中心点
      const absPos = getNodeAbsolutePosition(draggedNode, nodesRef.current);
      // class-box / er-box 节点用动态尺寸估算（含 members/attributes），其他用 node.width/height
      const nodeSize = draggedNode.type === 'class-box'
        ? computeClassBoxSize(draggedNode)
        : draggedNode.type === 'er-box'
          ? computeErBoxSize(draggedNode)
          : { width: draggedNode.width ?? 0, height: draggedNode.height ?? 0 };
      const center = {
        x: absPos.x + nodeSize.width / 2,
        y: absPos.y + nodeSize.height / 2,
      };
      // 3. 找最深容器（最深优先，排除自身+后代）
      const targetContainer = findContainerAtPosition(nodesRef.current, center, excludeIds);
      const targetParentId = targetContainer?.id ?? null;
      // 4. 与原 parentId 比较，决定移入/移出/不变
      if (targetParentId !== (draggedNode.parentId ?? null)) {
        // parentId 变化：复用 handleMoveToSubgraph 处理坐标转换 + 父子关系更新
        handleMoveToSubgraph(draggedNode.id, targetParentId);
      } else {
        // parentId 不变：仅重算 subgraph 尺寸 + 标记自环边
        applyCanvasChange({ nodes: nodesRef.current, recalculate: { subgraph: true, edges: true } });
      }
    },
    [applyCanvasChange, handleMoveToSubgraph],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<MermaidEdge>[]) => {
      onEdgesChange(changes);
      // 注意：所有用户触发的结构/位置变更统一通过 applyCanvasChange 处理并通知外部
      // handleEdgesChange 只负责 React Flow 内部状态同步，不再直接触发 onCanvasEdit
    },
    [onEdgesChange]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      // v4 修复#7：architecture 模式下创建 archEdge 数据，确保新边可序列化
      if (diagramType === 'architecture') {
        const handleIdToDir = (handleId: string | null | undefined): 'L' | 'R' | 'T' | 'B' => {
          switch (handleId) {
            case 'left': return 'L';
            case 'right': return 'R';
            case 'top': return 'T';
            case 'bottom': return 'B';
            default: return 'L';
          }
        };
        const archEdge: ArchitectureEdgeInfo = {
          lhsId: connection.source,
          lhsDir: handleIdToDir(connection.sourceHandle),
          lhsInto: false,
          rhsId: connection.target,
          rhsDir: handleIdToDir(connection.targetHandle),
          rhsInto: true, // 默认有箭头
        };
        const newEdge: MermaidEdge = {
          ...connection,
          id: idGenerator.generate('edge'),
          type: connectionMode === 'nearest' ? 'floating' : 'smoothstep',
          data: { edgeStyle: 'arrow', archEdge },
        };
        const newEdges = addEdge(newEdge, edgesRef.current);
        applyCanvasChange({ nodes: nodesRef.current, edges: newEdges });
        return;
      }

      // classDiagram 分支（M3 模块4 L2-7）：创建 class-relation 或 note-edge 边
      // 对齐 NoteConverter/RelationConverter 创建的边字段，保证 serialize 往返一致
      if (diagramType === 'classDiagram') {
        const sourceNode = nodesRef.current.find((n) => n.id === connection.source);
        const targetNode = nodesRef.current.find((n) => n.id === connection.target);

        // note-edge 子分支：source 或 target 是 note 节点
        // 规范化方向：class 总是 source，note 总是 target（对齐 NoteConverter 设计）
        if (sourceNode?.type === 'class-note' || targetNode?.type === 'class-note') {
          const isNoteSource = sourceNode?.type === 'class-note';
          const classId = isNoteSource ? connection.target : connection.source;
          const noteId = isNoteSource ? connection.source : connection.target;

          const noteEdge: MermaidEdge = {
            id: `note-edge-${Date.now()}`,
            source: classId,
            target: noteId,
            type: 'note-edge',
            data: { edgeStyle: 'dotted' },
          };
          const newEdges = addEdge(noteEdge, edgesRef.current);
          applyCanvasChange({ nodes: nodesRef.current, edges: newEdges });
          return;
        }

        // class-relation 子分支：source/target 都是 class 节点（默认）
        // 默认 relationType1/relationType2='none'（用户可在 property-panel 编辑）
        const classRelationEdge: MermaidEdge = {
          id: `class-relation-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle ?? null,
          targetHandle: connection.targetHandle ?? null,
          type: 'class-relation',
          data: {
            edgeStyle: 'line',
            relationType1: 'none',
            relationType2: 'none',
            lineType: 'line',
          },
        };
        const newEdges = addEdge(classRelationEdge, edgesRef.current);
        applyCanvasChange({ nodes: nodesRef.current, edges: newEdges });
        return;
      }

      // erDiagram 分支（M4 模块5 L2-5）：创建 er-relation 边
      // 对齐 RelationshipConverter 创建的边字段，默认 erCardA/erCardB='only-one' / erIdentification='identifying'
      // erRoleA 默认 undefined（用户可在 property-panel 编辑）
      if (diagramType === 'erDiagram') {
        const erRelationEdge: MermaidEdge = {
          id: `er-relation-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle ?? null,
          targetHandle: connection.targetHandle ?? null,
          type: 'er-relation',
          data: {
            edgeStyle: 'line',
            erCardA: 'only-one',
            erCardB: 'only-one',
            erIdentification: 'identifying',
          },
        };
        const newEdges = addEdge(erRelationEdge, edgesRef.current);
        applyCanvasChange({ nodes: nodesRef.current, edges: newEdges });
        return;
      }

      const newEdge: MermaidEdge = {
        ...connection,
        id: `edge_${Date.now()}`,
        type: connectionMode === 'nearest' ? 'floating' : 'smoothstep',
        data: { edgeStyle: 'arrow' },
      };
      const newEdges = addEdge(newEdge, edgesRef.current);
      applyCanvasChange({ nodes: nodesRef.current, edges: newEdges, recalculate: { edges: true } });
    },
    [connectionMode, diagramType, applyCanvasChange]
  );

  // ============================================================
  // architecture 节点添加回调（v4 新增）
  // 注意：必须在 addNodeFromLibrary/onDrop 之前定义，因为它们被引用
  // ============================================================

  /** v4：architecture 添加 group（可选父 group ID 实现嵌套） */
  const handleAddGroup = useCallback((parentId?: string) => {
    const groupId = idGenerator.generate('group');
    const newNode: MermaidNode = {
      id: groupId,
      type: 'arch-group',
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: {
        label: '新分组',
        shape: 'arch-group',
      },
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    };
    // v4 根因修复：group 属性全部通过 nodes[] 表达
    //   - title → node.data.label（已在 newNode.data 中设置）
    //   - in（父 group）→ node.parentId（已在 newNode 中设置）
    //   - metadata.groups 仅保留 id 和可选 icon（作为 group 索引）
    // Stage 7：同步构造 newMetadata + 传给 applyCanvasChange（消除 setMetadata 异步时序问题）
    const newGroup: ArchitectureGroupInfo = { id: groupId };
    const prevMeta = metadataRef.current;
    const newMetadata: GraphMetadata = {
      ...(prevMeta ?? {}),
      groups: [...(prevMeta?.groups ?? []), newGroup],
    };
    const newNodes = [...nodesRef.current, newNode];
    setArchSelectedId({ type: 'group', id: groupId });
    applyCanvasChange({ nodes: newNodes, metadata: newMetadata });
  }, [applyCanvasChange]);

  /** v4：architecture 添加 service（可选所属 group ID） */
  const handleAddService = useCallback((groupId?: string) => {
    const newNode: MermaidNode = {
      id: idGenerator.generate('node'),
      type: 'arch-service',
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: {
        label: '新服务',
        shape: 'arch-service',
        archIcon: 'server',
      },
      ...(groupId ? { parentId: groupId, extent: 'parent' as const } : {}),
    };
    const newNodes = [...nodesRef.current, newNode];
    setArchSelectedId({ type: 'node', id: newNode.id });
    applyCanvasChange({ nodes: newNodes });
  }, [applyCanvasChange]);

  /** v4：architecture 添加 junction（可选所属 group ID） */
  const handleAddJunction = useCallback((groupId?: string) => {
    const newNode: MermaidNode = {
      id: idGenerator.generate('node'),
      type: 'arch-junction',
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: {
        label: '连接点',
        shape: 'arch-junction',
        archIsJunction: true,
      },
      ...(groupId ? { parentId: groupId, extent: 'parent' as const } : {}),
    };
    const newNodes = [...nodesRef.current, newNode];
    setArchSelectedId({ type: 'node', id: newNode.id });
    applyCanvasChange({ nodes: newNodes });
  }, [applyCanvasChange]);

  const addNodeFromLibrary = useCallback(
    (shape: MermaidShapeType) => {
      // mindmap: 画布为空时创建 root 节点，画布非空时通过树形面板添加子节点
      if (diagramType === 'mindmap') {
        if (nodesRef.current.length > 0) {
          setCodeError('mindmap 已有根节点，请通过树形面板添加子节点');
          return;
        }
        const newNode: MermaidNode = {
          id: idGenerator.generate('node'),
          type: 'mindmap-default',
          position: { x: 100, y: 200 },
          data: {
            label: '根节点',
            shape: 'mindmap-default',
            mindmapType: 'default',
            isRoot: true,
          },
        };
        // Stage 7：mindmap 的 edges 由 buildCanvasState 内部从 parentId 派生为 []，
        // 同步走 applyCanvasChange，无需 setTimeout
        const newNodes = [...nodesRef.current, newNode];
        setCodeError(null);
        applyCanvasChange({ nodes: newNodes });
        return;
      }

      // v4 修复#8：architecture 模式下根据 shape 创建对应类型节点
      if (diagramType === 'architecture') {
        if (shape === 'arch-group') {
          handleAddGroup();
        } else if (shape === 'arch-junction') {
          handleAddJunction();
        } else {
          // arch-service 或其他 shape 统一作为 service
          handleAddService();
        }
        return;
      }

      // 计算 viewport 中心对应的 flow 坐标
      const viewportCenter = getViewportCenterFlowPosition(reactFlow);
      const position = centerNodeAt(shape, DEFAULT_NODE_LABEL, viewportCenter);

      const newNode: MermaidNode = {
        id: idGenerator.generate('node'),
        type: shape,
        position,
        data: {
          label: DEFAULT_NODE_LABEL,
          shape,
        },
      };
      applyCanvasChange({ nodes: [...nodesRef.current, newNode], recalculate: { subgraph: true, edges: true } });
    },
    [diagramType, reactFlow, applyCanvasChange, handleAddGroup, handleAddService, handleAddJunction]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const shape = event.dataTransfer.getData('application/mermaid-shape') as MermaidShapeType;
      if (!shape) return;

      // v4 修复#8：architecture 模式下委托给专用处理函数
      // 注意：architecture 节点位置由布局算法决定，不使用拖放位置
      if (diagramType === 'architecture') {
        if (shape === 'arch-group') {
          handleAddGroup();
        } else if (shape === 'arch-junction') {
          handleAddJunction();
        } else {
          handleAddService();
        }
        return;
      }

      const flowPosition = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const position = centerNodeAt(shape, DEFAULT_NODE_LABEL, flowPosition);

      const newNode: MermaidNode = {
        id: idGenerator.generate('node'),
        type: shape,
        position,
        data: { label: DEFAULT_NODE_LABEL, shape },
      };
      applyCanvasChange({ nodes: [...nodesRef.current, newNode], recalculate: { subgraph: true, edges: true } });
    },
    [reactFlow, diagramType, applyCanvasChange, handleAddGroup, handleAddService, handleAddJunction]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onCanvasDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return;

      // mindmap: 画布为空时创建 root 节点，画布非空时通过树形面板添加子节点
      if (diagramType === 'mindmap') {
        if (nodesRef.current.length > 0) {
          setCodeError('mindmap 已有根节点，请通过树形面板添加子节点');
          return;
        }
        const position = reactFlow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        const newNode: MermaidNode = {
          id: idGenerator.generate('node'),
          type: 'mindmap-default',
          position,
          data: {
            label: '根节点',
            shape: 'mindmap-default',
            mindmapType: 'default',
            isRoot: true,
          },
        };
        // Stage 7：同步走 applyCanvasChange（mindmap edges 由 buildCanvasState 派生为 []）
        const newNodes = [...nodesRef.current, newNode];
        setCodeError(null);
        applyCanvasChange({ nodes: newNodes });
        return;
      }

      // v4 修复#8：architecture 模式下不通过双击创建节点
      // architecture 节点类型有特殊语义（service/junction/group），需通过节点库或树形面板创建
      if (diagramType === 'architecture') {
        setCodeError('architecture 请通过左侧节点库或树形面板添加节点');
        return;
      }

      const flowPosition = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      // 根据图类型选择默认节点形状（取节点库第一个模板，与节点库顺序一致）
      const defaultShape = getTemplatesForDiagramType(diagramType)[0]?.type ?? 'rect';
      const position = centerNodeAt(defaultShape, DEFAULT_NODE_LABEL, flowPosition);
      const newNode: MermaidNode = {
        id: idGenerator.generate('node'),
        type: defaultShape,
        position,
        data: { label: DEFAULT_NODE_LABEL, shape: defaultShape },
      };
      applyCanvasChange({ nodes: [...nodesRef.current, newNode], recalculate: { subgraph: true, edges: true } });
    },
    [reactFlow, diagramType, applyCanvasChange]
  );

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    setEditingNodeId(node.id);
    setEditingEdgeId(null);
  }, []);

  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setEditingEdgeId(edge.id);
    setEditingNodeId(null);
  }, []);

  const confirmNodeEdit = useCallback((nodeId: string, newLabel: string) => {
    const newNodes = nodesRef.current.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, label: newLabel } } : n
    );
    setEditingNodeId(null);
    applyCanvasChange({ nodes: newNodes, recalculate: { subgraph: true } });
  }, [applyCanvasChange]);

  const confirmEdgeEdit = useCallback((edgeId: string, newLabel: string) => {
    const newEdges = edgesRef.current.map((e) =>
      e.id === edgeId ? { ...e, data: { ...e.data, label: newLabel || undefined } } : e
    );
    setEditingEdgeId(null);
    applyCanvasChange({ nodes: nodesRef.current, edges: newEdges });
  }, [applyCanvasChange]);

  const handleCodeChange = useCallback(
    createCodeChangeHandler({
      codeConverter,
      canvasEmitter,
      setMermaidCode,
      setCodeError,
      currentType: syncCanvas.diagramType,
      onSameTypeUpdate: (newCanvas: CanvasState) => {
        // 同类型更新：应用解析结果到当前画布
        if (isGraphCanvasState(newCanvas)) {
          const { nodes, edges, direction, metadata: newMetadata } = newCanvas;
          const safeDirection = direction ?? 'TB';

          // 统一走画布渲染管线：structural 变更会调用 layoutFn 并触发 emitCanvasChange
          setLocalDirection(safeDirection);
          directionRef.current = safeDirection;
          setCodeError(null);

          // 传 metadata 给 applyCanvasChange：同步更新 metadataRef.current + setMetadata + buildCanvasState
          // 避免 setMetadata 异步导致 applyCanvasChange 读到旧 metadataRef.current（模块5 偏差修复 2026-07-07）
          applyCanvasChange({
            nodes,
            edges,
            ...(newMetadata !== undefined ? { metadata: newMetadata } : {}),
            recalculate: { layout: true },
          });
        } else {
          setCodeError('内部错误：类型守卫不匹配');
        }
      },
    }),
    [codeConverter, canvasEmitter, setMermaidCode, setCodeError, syncCanvas, setLocalDirection, applyCanvasChange],
  );

  const onSelectionChange = useCallback(({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNodeId(selNodes.length === 1 ? selNodes[0].id : null);
    setSelectedEdgeId(selEdges.length === 1 ? selEdges[0].id : null);

    // v4：architecture 使用联合类型选中状态
    if (diagramType === 'architecture') {
      if (selNodes.length === 1) {
        const selectedNode = selNodes[0];
        // 检测是否为 group 节点（arch-group 类型或 shape === 'arch-group'）
        const isGroup = selectedNode.type === 'arch-group'
          || selectedNode.data.shape === 'arch-group';
        if (isGroup) {
          setArchSelectedId({ type: 'group', id: selectedNode.id });
        } else {
          setArchSelectedId({ type: 'node', id: selectedNode.id });
        }
      } else if (selEdges.length === 1) {
        setArchSelectedId({ type: 'edge', id: selEdges[0].id });
      } else {
        setArchSelectedId(null);
      }
    }
  }, [diagramType]);

  const onMove = useCallback(
    (_event: unknown, viewport: { x: number; y: number; zoom: number }) => {
      if (isApplyingRemoteViewport.current) return;
      onViewportChange({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    },
    [onViewportChange]
  );

  /**
   * 更新元数据（erDiagram ClassDefEditor 用：更新 erClasses/erClassApplyClasses）
   *
   * 数据流：ClassDefEditor → onUpdateClassDefs/onUpdateClassApplies → onUpdateMetadata
   *   → applyCanvasChange({ nodes, metadata }) → serialize → recognize → convert 往返
   *   → cssCompiledStyles 在新一轮 parse 中由 Recognizer 重新计算
   *
   * 不需要 recalculate（metadata 变更不需要重布局，节点位置不变）
   */
  const handleUpdateMetadata = useCallback((newMetadata: GraphMetadata) => {
    applyCanvasChange({ nodes: nodesRef.current, metadata: newMetadata });
  }, [applyCanvasChange]);

  const handleUpdateNode = useCallback((id: string, data: Partial<MermaidNode['data']>) => {
    const newNodes = nodesRef.current.map((n) => {
      if (n.id !== id) return n;
      const newData = { ...n.data, ...data };
      const newType = data.shape ?? n.type;
      return { ...n, type: newType, data: newData };
    });
    applyCanvasChange({ nodes: newNodes, recalculate: { subgraph: true } });
  }, [applyCanvasChange]);

  const handleUpdateEdge = useCallback((id: string, data: Partial<MermaidEdge['data']>) => {
    const newEdges = edgesRef.current.map((e) =>
      e.id === id ? { ...e, data: { ...e.data, ...data } } : e
    );
    applyCanvasChange({ nodes: nodesRef.current, edges: newEdges });
  }, [applyCanvasChange]);

  /** 替换整个 edges 数组（classDiagram NoteEditor handleSelectNoteClassId 用：创建/更新/删除 note-edge） */
  const handleUpdateEdges = useCallback((newEdges: MermaidEdge[]) => {
    applyCanvasChange({ nodes: nodesRef.current, edges: newEdges });
  }, [applyCanvasChange]);

  // ============================================================
  // mindmap 树形操作（M6 新增）
  // ============================================================

  /** 添加子节点：在选中节点下创建新子节点 */
  const handleAddChild = useCallback((parentId: string) => {
    const parentNode = nodesRef.current.find((n) => n.id === parentId);
    const parentX = parentNode?.position.x ?? 0;
    const parentY = parentNode?.position.y ?? 0;
    const newNode: MermaidNode = {
      id: idGenerator.generate('node'),
      type: 'mindmap-default',
      position: { x: parentX + 200, y: parentY + (Math.random() * 100 - 50) },
      data: {
        label: '新节点',
        shape: 'mindmap-default',
        mindmapType: 'default',
      },
      parentId,
      extent: 'parent',
    };
    // Stage 7：同步走 applyCanvasChange（mindmap edges 由 buildCanvasState 派生为 []）
    const newNodes = [...nodesRef.current, newNode];
    setSelectedNodeId(newNode.id);
    applyCanvasChange({ nodes: newNodes });
  }, [applyCanvasChange]);

  /** 添加兄弟节点：在选中节点的父节点下创建新子节点 */
  const handleAddSibling = useCallback((nodeId: string) => {
    const currentNode = nodesRef.current.find((n) => n.id === nodeId);
    if (!currentNode) return;
    const parentId = currentNode.parentId;
    if (!parentId) {
      // 根节点没有兄弟节点（mindmap 只能有一个根）
      return;
    }
    const newNode: MermaidNode = {
      id: idGenerator.generate('node'),
      type: 'mindmap-default',
      position: {
        x: currentNode.position.x + 50,
        y: currentNode.position.y + 80,
      },
      data: {
        label: '新节点',
        shape: 'mindmap-default',
        mindmapType: 'default',
      },
      parentId,
      extent: 'parent',
    };
    // Stage 7：同步走 applyCanvasChange（mindmap edges 由 buildCanvasState 派生为 []）
    const newNodes = [...nodesRef.current, newNode];
    setSelectedNodeId(newNode.id);
    applyCanvasChange({ nodes: newNodes });
  }, [applyCanvasChange]);

  /** 删除 mindmap 节点：递归删除选中节点及其所有子节点 */
  const handleDeleteMindmapNode = useCallback((nodeId: string) => {
    // 构建 parentId → children[] 的映射
    const childrenMap = new Map<string, MermaidNode[]>();
    for (const node of nodesRef.current) {
      const pid = node.parentId ?? '';
      if (pid) {
        const children = childrenMap.get(pid);
        if (children) {
          children.push(node);
        } else {
          childrenMap.set(pid, [node]);
        }
      }
    }
    // 递归收集要删除的节点 ID
    const idsToDelete = collectDescendantIds(nodeId, childrenMap);
    const idSet = new Set(idsToDelete);
    // Stage 7：同步走 applyCanvasChange（mindmap edges 由 buildCanvasState 派生为 []）
    const newNodes = nodesRef.current.filter((n) => !idSet.has(n.id));
    setSelectedNodeId(null);
    applyCanvasChange({ nodes: newNodes });
  }, [applyCanvasChange]);

  /** 选中 mindmap 节点 */
  const handleSelectMindmapNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    // 同步 React Flow 选中状态
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
  }, [setNodes]);

  // ============================================================
  // architecture 操作（M7 新增）
  // ============================================================

  /** architecture: 完整节点更新（含 parentId 等） */
  const handleUpdateNodeFull = useCallback((id: string, updates: Partial<MermaidNode>) => {
    // Stage 7：同步构造 newNodes + applyCanvasChange（无 setTimeout）
    const newNodes = nodesRef.current.map((n) => (n.id === id ? { ...n, ...updates } : n));
    applyCanvasChange({ nodes: newNodes });
  }, [applyCanvasChange]);

  /** architecture: 完整边更新（含 sourceHandle 等） */
  const handleUpdateEdgeFull = useCallback((id: string, updates: Partial<MermaidEdge>) => {
    // Stage 7：同步构造 newEdges + applyCanvasChange（无 setTimeout）
    const newEdges = edgesRef.current.map((e) => (e.id === id ? { ...e, ...updates } : e));
    applyCanvasChange({ nodes: nodesRef.current, edges: newEdges });
  }, [applyCanvasChange]);

  /** architecture: 删除节点（v4：统一回调，支持 options.recursive）
   * v4 决策 11：废弃 handleDeleteNode/handleDeleteGroup/handleRemoveGroupMember，统一到此回调
   * v4 决策 7：group 删除支持两种模式
   *   - recursive=true：递归删除子节点
   *   - recursive=false（默认）：删除 group，子节点 parentId 清除（提升为顶层）
   * group 删除时由 GraphCanvas 弹出确认对话框让用户选择
   *
   * Stage 7：同步计算所有新状态 → 单次 applyCanvasChange（消除 setTimeout + stale refs 竞态）
   */
  const handleDeleteNodeRecursive = useCallback((id: string, options?: { recursive?: boolean }) => {
    const targetNode = nodesRef.current.find((n) => n.id === id);
    if (!targetNode) return;

    const isGroup = targetNode.type === 'arch-group'
      || targetNode.data.shape === 'arch-group';

    // group 删除：检查是否需要弹出确认对话框
    if (isGroup && options === undefined) {
      // 检查是否有子节点
      const hasChildren = nodesRef.current.some((n) => n.parentId === id);
      if (hasChildren) {
        // 弹出确认对话框（由 UI 渲染）
        const groupName = targetNode.data.label ?? targetNode.id;
        setDeleteGroupConfirm({ groupId: id, groupName });
        return;
      }
      // 无子节点，直接删除
    }

    const recursive = options?.recursive ?? false;

    // 收集要删除的节点 ID
    const idsToDelete = new Set<string>([id]);
    if (recursive) {
      // 递归收集所有后代
      const childrenMap = new Map<string, MermaidNode[]>();
      for (const node of nodesRef.current) {
        const pid = node.parentId ?? '';
        if (pid) {
          const children = childrenMap.get(pid);
          if (children) {
            children.push(node);
          } else {
            childrenMap.set(pid, [node]);
          }
        }
      }
      const descendantIds = collectDescendantIds(id, childrenMap);
      for (const descId of descendantIds) {
        idsToDelete.add(descId);
      }
    }

    // 同步计算新状态（无 setTimeout + stale refs 竞态）
    let newNodes: MermaidNode[] = nodesRef.current.filter((n) => !idsToDelete.has(n.id));
    // 非 recursive 模式：清除子节点的 parentId（提升为顶层）
    if (!recursive) {
      newNodes = newNodes.map((n) => {
        if (n.parentId === id) {
          const { parentId: _p, extent: _e, ...rest } = n;
          void _p;
          void _e;
          return rest;
        }
        return n;
      });
    }
    const newEdges = edgesRef.current.filter(
      (e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target)
    );
    const newMetadata: GraphMetadata | undefined = (isGroup && metadataRef.current?.groups)
      ? { ...metadataRef.current, groups: metadataRef.current.groups.filter((g) => g.id !== id) }
      : metadataRef.current;

    setArchSelectedId(null);
    setDeleteGroupConfirm(null);

    // 单次 applyCanvasChange，使用计算后的新状态
    const opts: CanvasChangeOptions = { nodes: newNodes, edges: newEdges };
    if (isGroup && newMetadata !== metadataRef.current) {
      opts.metadata = newMetadata;
    }
    applyCanvasChange(opts);
  }, [applyCanvasChange]);

  /** architecture: 删除边 */
  const handleDeleteEdge = useCallback((id: string) => {
    // Stage 7：同步构造 newEdges + applyCanvasChange（无 setTimeout）
    const newEdges = edgesRef.current.filter((e) => e.id !== id);
    setSelectedEdgeId(null);
    setArchSelectedId(null);
    applyCanvasChange({ nodes: nodesRef.current, edges: newEdges });
  }, [applyCanvasChange]);

  /** v4：architecture 移动节点到其他 group（含循环引用检测）
   * v4 决策 11：替代 handleRemoveGroupMember
   * targetGroupId 为 null 表示移出 group（提升为顶层）
   *
   * Stage 7：同步构造 newNodes + applyCanvasChange（applyCanvasChange 内部已调用
   * sortNodesByParentOrder，无需 caller 重复排序）
   */
  const handleMoveToGroup = useCallback((nodeId: string, targetGroupId: string | null) => {
    // v4：循环引用检测
    if (detectCycle(nodesRef.current, nodeId, targetGroupId)) {
      setCodeError('无法移动节点到后代 group：会形成循环引用');
      return;
    }

    const newNodes = nodesRef.current.map((n) => {
      if (n.id !== nodeId) return n;
      if (targetGroupId === null) {
        // 移出 group：清除 parentId 和 extent
        const { parentId: _p, extent: _e, ...rest } = n;
        void _p;
        void _e;
        return rest;
      }
      // 移入 group：设置 parentId 和 extent
      return { ...n, parentId: targetGroupId, extent: 'parent' as const };
    });
    setCodeError(null);
    applyCanvasChange({ nodes: newNodes });
  }, [applyCanvasChange]);

  // ============================================================
  // architecture 树形编辑回调（v3 新增，v4 修订）
  // 注意：handleAddGroup/handleAddService/handleAddJunction 已移至 addNodeFromLibrary 之前
  // ============================================================

  // ============================================================
  // architecture layout hints 回调（v4 新增）
  // ============================================================

  /** v4：添加 layout hint
   * Stage 7：同步计算 newMetadata → applyCanvasChange（applyCanvasChange 内部同步更新
   * metadataRef.current + setMetadata + 传入 buildCanvasState）
   */
  const handleAddLayoutHint = useCallback((direction: 'row' | 'column', members: string[]) => {
    const prev = metadataRef.current;
    const newHint: ArchitectureLayoutHint = { direction, members };
    const newHints = [...(prev?.layoutHints ?? []), newHint];
    const newMetadata: GraphMetadata = { ...prev, layoutHints: newHints };
    applyCanvasChange({ nodes: nodesRef.current, edges: edgesRef.current, metadata: newMetadata });
  }, [applyCanvasChange]);

  /** v4：更新 layout hint
   * Stage 7：同步计算 newMetadata → applyCanvasChange
   */
  const handleUpdateLayoutHint = useCallback((index: number, updates: Partial<ArchitectureLayoutHint>) => {
    const prev = metadataRef.current;
    if (!prev?.layoutHints) return;
    const newHints = prev.layoutHints.map((h, i) => (i === index ? { ...h, ...updates } : h));
    const newMetadata: GraphMetadata = { ...prev, layoutHints: newHints };
    applyCanvasChange({ nodes: nodesRef.current, edges: edgesRef.current, metadata: newMetadata });
  }, [applyCanvasChange]);

  /** v4：删除 layout hint
   * Stage 7：同步计算 newMetadata → applyCanvasChange
   */
  const handleDeleteLayoutHint = useCallback((index: number) => {
    const prev = metadataRef.current;
    if (!prev?.layoutHints) return;
    const newHints = prev.layoutHints.filter((_, i) => i !== index);
    const newMetadata: GraphMetadata = { ...prev, layoutHints: newHints };
    applyCanvasChange({ nodes: nodesRef.current, edges: edgesRef.current, metadata: newMetadata });
  }, [applyCanvasChange]);

  /** v4：切换成员是否在 layout hint 中
   * Stage 7：同步计算 newMetadata → applyCanvasChange
   */
  const handleToggleLayoutMember = useCallback((hintIndex: number, nodeId: string) => {
    const prev = metadataRef.current;
    if (!prev?.layoutHints) return;
    const newHints = prev.layoutHints.map((h, i) => {
      if (i !== hintIndex) return h;
      const isMember = h.members.includes(nodeId);
      return {
        ...h,
        members: isMember
          ? h.members.filter((id) => id !== nodeId)
          : [...h.members, nodeId],
      };
    });
    const newMetadata: GraphMetadata = { ...prev, layoutHints: newHints };
    applyCanvasChange({ nodes: nodesRef.current, edges: edgesRef.current, metadata: newMetadata });
  }, [applyCanvasChange]);

  /** v4：architecture 树形面板选中节点 */
  const handleSelectArchNode = useCallback((nodeId: string) => {
    setArchSelectedId({ type: 'node', id: nodeId });
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
  }, [setNodes]);

  /** v4：architecture 树形面板选中 group */
  const handleSelectArchGroup = useCallback((groupId: string) => {
    setArchSelectedId({ type: 'group', id: groupId });
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === groupId })));
  }, [setNodes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
          return;
        }
        const selectedNodes = nodesRef.current.filter((n) => n.selected);
        const selectedEdges = edgesRef.current.filter((e) => e.selected);
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          e.preventDefault();
          // v4 修复#6：architecture 模式下，group 节点删除走 handleDeleteNodeRecursive
          if (diagramType === 'architecture' && selectedNodes.length === 1) {
            const node = selectedNodes[0];
            const isGroup = node.type === 'arch-group'
              || node.data.shape === 'arch-group';
            if (isGroup) {
              // group 删除走 v4 逻辑（会弹出确认对话框）
              handleDeleteNodeRecursive(node.id);
              return;
            }
            // 非 group 节点也走 handleDeleteNodeRecursive（统一删除逻辑）
            handleDeleteNodeRecursive(node.id);
            return;
          }
          // Stage 7：同步计算新状态（删除 reactFlow.deleteElements + setTimeout 路径）
          // 删除前捕获被删 subgraph 的绝对位置，用于子节点坐标转换
          const deletedSubgraphAbsPos = new Map<string, { x: number; y: number }>();
          for (const node of selectedNodes) {
            // M3 修订：统一使用 isContainerNode（覆盖 subgraph + class-namespace）
            if (isContainerNode(node)) {
              deletedSubgraphAbsPos.set(node.id, getNodeAbsolutePosition(node, nodesRef.current));
            }
          }
          const deletedNodeIds = new Set(selectedNodes.map((n) => n.id));
          const deletedEdgeIds = new Set(selectedEdges.map((e) => e.id));

          // Bug9: 显式过滤与被删节点关联的边，避免悬挂边；同时过滤用户显式选中的边
          const nextEdges = edgesRef.current.filter(
            (e) => !deletedEdgeIds.has(e.id)
              && !deletedNodeIds.has(e.source)
              && !deletedNodeIds.has(e.target),
          );
          // 清理孤儿 parentId：将被删 subgraph 的子节点提升为顶层，并做坐标转换
          const nextNodes = nodesRef.current
            .filter((n) => !deletedNodeIds.has(n.id))
            .map((n) => {
              if (!n.parentId || !deletedNodeIds.has(n.parentId)) return n;
              const subgraphAbsPos = deletedSubgraphAbsPos.get(n.parentId);
              const { parentId: _p, extent: _e, ...rest } = n;
              void _p;
              void _e;
              return {
                ...rest,
                position: subgraphAbsPos
                  ? {
                    x: n.position.x + subgraphAbsPos.x,
                    y: n.position.y + subgraphAbsPos.y - SUBGRAPH_TITLE_HEIGHT,
                  }
                  : n.position,
              };
            });
          applyCanvasChange({ nodes: nextNodes, edges: nextEdges, recalculate: { subgraph: true, edges: true } });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [diagramType, handleDeleteNodeRecursive, applyCanvasChange]);

  // ============================================================
  // M1: flowchart 右键菜单 + subgraph 创建/管理
  // ============================================================

  /** 右键节点 — 显示上下文菜单 */
  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    if (diagramType !== 'flowchart') return;
    event.preventDefault();
    // 获取当前选中的节点 ID 列表
    const selectedIds = nodesRef.current
      .filter((n) => n.selected)
      .map((n) => n.id);
    const nodeIds = selectedIds.length > 0 ? selectedIds : [node.id];
    setContextMenu({ x: event.clientX, y: event.clientY, nodeIds, targetNodeId: node.id });
  }, [diagramType]);

  /** 右键画布空白 — 显示上下文菜单（无选中节点） */
  const handlePaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    if (diagramType !== 'flowchart') return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeIds: [], targetNodeId: undefined });
  }, [diagramType]);

  /** 创建空 subgraph */
  const handleCreateSubgraph = useCallback(() => {
    const subgraphId = idGenerator.generate('subgraph');
    const newNode: MermaidNode = {
      id: subgraphId,
      type: 'subgraph',
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: {
        label: '新子图',
        shape: 'rect',
        isSubgraph: true,
        subgraphNodes: [],
      },
    };
    applyCanvasChange({ nodes: [...nodesRef.current, newNode], recalculate: { subgraph: true } });
    setSelectedNodeId(subgraphId);
  }, [applyCanvasChange]);

  /** 创建 subgraph 包含选中节点 */
  const handleCreateSubgraphWithSelected = useCallback(() => {
    if (!contextMenu || contextMenu.nodeIds.length === 0) return;
    const subgraphId = idGenerator.generate('subgraph');
    const selectedNodeIds = contextMenu.nodeIds;

    // 计算选中节点的边界框，定位 subgraph
    const selectedNodes = nodesRef.current.filter((n) => selectedNodeIds.includes(n.id));
    if (selectedNodes.length === 0) return;

    const minX = Math.min(...selectedNodes.map((n) => n.position.x));
    const minY = Math.min(...selectedNodes.map((n) => n.position.y));

    // Bug4 修复：subgraph 的绝对位置（考虑子节点位置的包围盒）
    const subgraphAbsPos = { x: minX - 20, y: minY - 40 };

    const newNode: MermaidNode = {
      id: subgraphId,
      type: 'subgraph',
      position: subgraphAbsPos,
      data: {
        label: '新子图',
        shape: 'rect',
        isSubgraph: true,
        subgraphNodes: selectedNodeIds,
      },
    };

    // 将选中节点的绝对坐标转换为相对于 subgraph 的坐标
    // dagre 约定子节点 Y 坐标包含 SUBGRAPH_TITLE_HEIGHT 偏移
    const newNodes = nodesRef.current.map((n) => {
      if (!selectedNodeIds.includes(n.id)) return n;
      let absX = n.position.x;
      let absY = n.position.y;
      let currentParentId = n.parentId;
      const visited = new Set<string>();
      while (currentParentId && !visited.has(currentParentId)) {
        visited.add(currentParentId);
        const parent = nodesRef.current.find((p) => p.id === currentParentId);
        if (!parent) break;
        absX += parent.position.x;
        absY += parent.position.y;
        currentParentId = parent.parentId;
      }
      return {
        ...n,
        parentId: subgraphId,
        position: {
          x: absX - subgraphAbsPos.x,
          y: absY - subgraphAbsPos.y + SUBGRAPH_TITLE_HEIGHT,
        },
      };
    });
    newNodes.push(newNode);

    applyCanvasChange({ nodes: newNodes, recalculate: { subgraph: true, edges: true } });
    setSelectedNodeId(subgraphId);
  }, [contextMenu, applyCanvasChange]);

  /** 右键菜单切换形状 */
  const handleSwitchShapeFromMenu = useCallback((shape: MermaidShapeType) => {
    if (!contextMenu || contextMenu.nodeIds.length === 0) return;
    const ids = contextMenu.nodeIds;
    const newNodes = nodesRef.current.map((n) =>
      ids.includes(n.id)
        ? { ...n, data: { ...n.data, shape } }
        : n,
    );
    applyCanvasChange({ nodes: newNodes, recalculate: { subgraph: true } });
  }, [contextMenu, applyCanvasChange]);

  /** 删除 subgraph 节点（子节点移出到顶层） */
  const handleDeleteSubgraph = useCallback((id: string) => {
    // Bug4 修复：先获取被删除 subgraph 的绝对位置，用于子节点坐标转换
    const subgraph = nodesRef.current.find((n) => n.id === id);
    const subgraphAbsPos = subgraph ? (() => {
      let x = subgraph.position.x;
      let y = subgraph.position.y;
      let currentParentId = subgraph.parentId;
      const visited = new Set<string>();
      while (currentParentId && !visited.has(currentParentId)) {
        visited.add(currentParentId);
        const parent = nodesRef.current.find((p) => p.id === currentParentId);
        if (!parent) break;
        x += parent.position.x;
        y += parent.position.y;
        currentParentId = parent.parentId;
      }
      return { x, y };
    })() : { x: 0, y: 0 };

    const filtered = nodesRef.current
      .filter((n) => n.id !== id)
      .map((n) => {
        if (n.parentId === id) {
          // Bug4 修复：相对坐标 → 绝对坐标
          const { parentId, extent, ...rest } = n;
          return {
            ...rest,
            position: {
              x: n.position.x + subgraphAbsPos.x,
              y: n.position.y + subgraphAbsPos.y - SUBGRAPH_TITLE_HEIGHT,
            },
          };
        }
        return n;
      });

    // Bug9: 删除与子图关联的边
    const nextEdges = edgesRef.current.filter(
      (e) => e.source !== id && e.target !== id,
    );
    applyCanvasChange({ nodes: filtered, edges: nextEdges, recalculate: { subgraph: true, edges: true } });
    setSelectedNodeId(null);
  }, [applyCanvasChange]);

  /** 右键菜单删除选中节点（子图节点会被过滤，避免子图被 reactFlow 直接删除导致子节点孤立）
   * Stage 7：同步计算新状态 → applyCanvasChange（删除 reactFlow.deleteElements + setTimeout）
   */
  const handleDeleteNodeFromMenu = useCallback(() => {
    if (!contextMenu || contextMenu.nodeIds.length === 0) return;
    const idsToDelete = contextMenu.nodeIds.filter((id) => {
      const node = nodesRef.current.find((n) => n.id === id);
      return node?.data?.isSubgraph !== true;
    });
    if (idsToDelete.length === 0) return;
    const deletedNodeIds = new Set(idsToDelete);
    // Bug9: 显式过滤被删节点 + 关联边，避免悬挂边
    const nextNodes = nodesRef.current.filter((n) => !deletedNodeIds.has(n.id));
    const nextEdges = edgesRef.current.filter(
      (e) => !deletedNodeIds.has(e.source) && !deletedNodeIds.has(e.target),
    );
    applyCanvasChange({ nodes: nextNodes, edges: nextEdges, recalculate: { subgraph: true, edges: true } });
  }, [contextMenu, applyCanvasChange]);

  /** 右键菜单删除子图 */
  const handleDeleteSubgraphFromMenu = useCallback(() => {
    if (!contextMenu?.targetNodeId) return;
    handleDeleteSubgraph(contextMenu.targetNodeId);
  }, [contextMenu, handleDeleteSubgraph]);

  const editingNode = editingNodeId ? nodes.find((n) => n.id === editingNodeId) : null;
  const editingEdge = editingEdgeId ? edges.find((e) => e.id === editingEdgeId) : null;
  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) ?? null : null;

  // ============================================================
  // Stage 7：mermaidCode 由 emitCanvasChange 返回值更新（state）
  // ============================================================
  // 原 mermaidCode useMemo 已删除（含增量序列化分支 + rawCode 直接返回分支 + 全量序列化分支）。
  // mermaidCode 现在由 applyCanvasChange/handleCodeChange 内部调用 emitCanvasChange 后
  // 用返回值 setMermaidCode 更新。CodeEditor/Toolbar 从 mermaidCode state 读取。
  // 拖动期间跳过序列化的优化已移除（isDraggingRef 已删除）— 拖动结束统一走 applyCanvasChange。

  return (
    <div className="app-container">
      <Toolbar
        diagramType={diagramType}
        direction={localDirection}
        mermaidCode={mermaidCode}
        connectionMode={connectionMode}
        onConnectionModeChange={handleConnectionModeChange}
        onDiagramTypeChange={onDiagramTypeChange}
        darkMode={props.darkMode}
        onDarkModeToggle={props.onDarkModeToggle}
        onDirectionChange={(dir) => {
          setLocalDirection(dir);
          directionRef.current = dir;
          // 同步更新 metadata.direction，消除方向双源（canvas.direction vs canvas.metadata.direction）
          // 不同步会导致 round-trip 时 registry.ts 用 stale metadata.direction 覆盖 canvas.direction
          // applyCanvasChange 内部会同步写入 metadataRef.current + setMetadata + 传入 buildCanvasState
          const newMetadata: GraphMetadata = { ...metadataRef.current, direction: dir };
          onDirectionChange(dir);
          applyCanvasChange({
            nodes: nodesRef.current,
            edges: edgesRef.current,
            metadata: newMetadata,
            recalculate: { layout: true },
          });
          setTimeout(() => {
            nodesRef.current.forEach((node) => updateNodeInternals(node.id));
          }, 0);
        }}
      />

      <div className="main-content">
        <div
          className={`left-panel ${leftCollapsed ? 'collapsed' : ''}`}
          style={{ position: 'relative', width: leftCollapsed ? 0 : leftWidth, transition: resizing ? 'none' : 'width var(--transition-normal)' }}
        >
          {/* 拖拽调整宽度手柄 */}
          {!leftCollapsed && (
            <div
              className={`panel-resize-handle panel-resize-handle-left ${resizing === 'left' ? 'active' : ''}`}
              onMouseDown={handleResizeStart('left')}
            />
          )}
          {/* 折叠按钮 */}
          <button
            className={`panel-collapse-btn panel-collapse-btn-left`}
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            title={leftCollapsed ? '展开面板' : '折叠面板'}
            style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: leftCollapsed ? -16 : -16 }}
          >
            {leftCollapsed ? '›' : '‹'}
          </button>
          <NodeLibrary diagramType={diagramType} onAddNode={addNodeFromLibrary} />
          {diagramType === 'mindmap' && (
            <MindmapTreePanel
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              onAddChild={handleAddChild}
              onAddSibling={handleAddSibling}
              onDeleteNode={handleDeleteMindmapNode}
              onSelectNode={handleSelectMindmapNode}
            />
          )}
          {diagramType === 'architecture' && (
            <>
              <ArchitectureTreePanel
                nodes={nodes}
                groups={metadata?.groups ?? []}
                selectedId={archSelectedId?.type === 'edge' ? null : archSelectedId}
                onAddGroup={handleAddGroup}
                onAddService={handleAddService}
                onAddJunction={handleAddJunction}
                onDeleteNode={handleDeleteNodeRecursive}
                onMoveToGroup={handleMoveToGroup}
                onSelectNode={handleSelectArchNode}
                onSelectGroup={handleSelectArchGroup}
              />
              <ArchitectureLayoutPanel
                nodes={nodes}
                layoutHints={metadata?.layoutHints ?? []}
                onAddLayoutHint={handleAddLayoutHint}
                onUpdateLayoutHint={handleUpdateLayoutHint}
                onDeleteLayoutHint={handleDeleteLayoutHint}
                onToggleLayoutMember={handleToggleLayoutMember}
              />
            </>
          )}
        </div>

        <div className="canvas-container" onDoubleClick={onCanvasDoubleClick}>
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <defs>
              {/* flowchart 边 marker（M1 新增，16 种边样式） */}
              <FlowchartEdgeMarkers color="#333333" />

              {/* class 关系专用 marker（10 个 = 5 种 × Start/End）
                  M3 模块4 L2-6：对齐官方 classDb 双端 marker
                  - End 版本 orient='auto'（终点箭头方向）
                  - Start 版本 orient='auto-start-reverse'（起点自动反向）
                  颜色用 CSS 变量 var(--class-edge-stroke)，适配暗色模式 */}
              {/* === End markers（5 个）=== */}
              <marker
                id="mermaid-arrow-end"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--class-edge-stroke)" />
              </marker>
              <marker
                id="mermaid-circle-end"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <circle cx="5" cy="5" r="4" stroke="var(--class-edge-stroke)" strokeWidth="1.5" fill="none" />
              </marker>
              <marker
                id="mermaid-hollow-triangle-end"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--class-box-bg)" stroke="var(--class-edge-stroke)" strokeWidth="1" />
              </marker>
              <marker
                id="mermaid-filled-diamond-end"
                viewBox="0 0 10 10"
                refX="0"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto"
              >
                <path d="M 0 5 L 5 0 L 10 5 L 5 10 z" fill="var(--class-edge-stroke)" />
              </marker>
              <marker
                id="mermaid-hollow-diamond-end"
                viewBox="0 0 10 10"
                refX="0"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto"
              >
                <path d="M 0 5 L 5 0 L 10 5 L 5 10 z" fill="var(--class-box-bg)" stroke="var(--class-edge-stroke)" strokeWidth="1" />
              </marker>
              {/* === Start markers（5 个，orient='auto-start-reverse' 自动反向）=== */}
              <marker
                id="mermaid-arrow-start"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--class-edge-stroke)" />
              </marker>
              <marker
                id="mermaid-circle-start"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <circle cx="5" cy="5" r="4" stroke="var(--class-edge-stroke)" strokeWidth="1.5" fill="none" />
              </marker>
              <marker
                id="mermaid-hollow-triangle-start"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--class-box-bg)" stroke="var(--class-edge-stroke)" strokeWidth="1" />
              </marker>
              <marker
                id="mermaid-filled-diamond-start"
                viewBox="0 0 10 10"
                refX="0"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 5 L 5 0 L 10 5 L 5 10 z" fill="var(--class-edge-stroke)" />
              </marker>
              <marker
                id="mermaid-hollow-diamond-start"
                viewBox="0 0 10 10"
                refX="0"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 5 L 5 0 L 10 5 L 5 10 z" fill="var(--class-box-bg)" stroke="var(--class-edge-stroke)" strokeWidth="1" />
              </marker>

              {/* ER 关系专用 marker（10 个 = 5 种基数 × Start/End）
                  M4 模块4 L2-8：对齐官方 erMarkers.js
                  - 所有 marker orient='auto'（与官方一致，图形已按 Start/End 分别设计）
                  - 不设 viewBox（与官方一致，用默认 "0 0 markerWidth markerHeight"）
                  - circle fill 用 var(--er-box-bg)，path stroke 用 color 参数
                  颜色用 CSS 变量 var(--er-edge-stroke)，适配暗色模式 */}
              <ErEdgeMarkers color="var(--er-edge-stroke)" />
            </defs>
          </svg>
          <DirectionContext.Provider value={localDirection}>
            <ConnectionModeContext.Provider value={connectionMode}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={onConnect}
                onNodeDoubleClick={onNodeDoubleClick}
                onEdgeDoubleClick={onEdgeDoubleClick}
                onSelectionChange={onSelectionChange}
                onMove={onMove}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeContextMenu={handleNodeContextMenu}
                onPaneContextMenu={handlePaneContextMenu}
                onNodeDragStop={handleNodeDragStop}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                deleteKeyCode={null}
                zoomOnDoubleClick={false}
                defaultEdgeOptions={{
                  type: connectionMode === 'nearest' ? 'floating' : 'smoothstep',
                }}
              >
                <Background />
                <Controls />
                <MiniMap />
              </ReactFlow>
            </ConnectionModeContext.Provider>
          </DirectionContext.Provider>

          {contextMenu && (() => {
            const targetNode = contextMenu.targetNodeId
              ? nodesRef.current.find((n) => n.id === contextMenu.targetNodeId)
              : undefined;
            const isTargetSubgraph = targetNode
              ? targetNode.data.isSubgraph === true
              : false;
            return (
              <ContextMenu
                position={{ x: contextMenu.x, y: contextMenu.y }}
                selectedNodeIds={contextMenu.nodeIds}
                onCreateSubgraph={handleCreateSubgraph}
                onCreateSubgraphWithSelected={handleCreateSubgraphWithSelected}
                onSwitchShape={handleSwitchShapeFromMenu}
                onDeleteNode={isTargetSubgraph ? undefined : handleDeleteNodeFromMenu}
                onDeleteSubgraph={isTargetSubgraph ? handleDeleteSubgraphFromMenu : undefined}
                onClose={() => setContextMenu(null)}
              />
            );
          })()}

          {editingNode && (
            <div
              className="inline-editor-overlay"
              style={{ position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}
            >
              <InlineEditor
                value={editingNode.data.label ?? editingNode.id}
                onConfirm={(value) => confirmNodeEdit(editingNode.id, value)}
                onCancel={() => setEditingNodeId(null)}
              />
            </div>
          )}

          {editingEdge && (
            <div
              className="inline-editor-overlay"
              style={{ position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}
            >
              <InlineEditor
                value={editingEdge.data.label ?? ''}
                onConfirm={(value) => confirmEdgeEdit(editingEdge.id, value)}
                onCancel={() => setEditingEdgeId(null)}
              />
            </div>
          )}

          <ConsumedBadge
            consumed={consumed}
            canvasSource={canvasSource}
            lastConsumedAt={lastConsumedAt}
            onReset={onResetConsumed}
          />

          <ConnectionStatus status={connectionStatus} />
        </div>

        <div
          className={`right-panel ${rightCollapsed ? 'collapsed' : ''}`}
          style={{ position: 'relative', width: rightCollapsed ? 0 : rightWidth, transition: resizing ? 'none' : 'width var(--transition-normal)' }}
        >
          {/* 拖拽调整宽度手柄 */}
          {!rightCollapsed && (
            <div
              className={`panel-resize-handle panel-resize-handle-right ${resizing === 'right' ? 'active' : ''}`}
              onMouseDown={handleResizeStart('right')}
            />
          )}
          {/* 折叠按钮 */}
          <button
            className="panel-collapse-btn panel-collapse-btn-right"
            onClick={() => setRightCollapsed(!rightCollapsed)}
            title={rightCollapsed ? '展开面板' : '折叠面板'}
            style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: -16 }}
          >
            {rightCollapsed ? '‹' : '›'}
          </button>
          <CodeEditor
            code={mermaidCode}
            onCodeChange={handleCodeChange}
            error={codeError}
            diagramType={diagramType}
          />
          <PropertyPanel
            diagramType={diagramType}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onUpdateNode={handleUpdateNode}
            onUpdateEdge={handleUpdateEdge}
            nodes={nodes}
            groups={metadata?.groups}
            edges={edges}
            onUpdateEdges={handleUpdateEdges}
            selectedId={archSelectedId}
            onUpdateNodeFull={handleUpdateNodeFull}
            onUpdateEdgeFull={handleUpdateEdgeFull}
            onDeleteNode={handleDeleteNodeRecursive}
            onDeleteEdge={handleDeleteEdge}
            onMoveToGroup={handleMoveToGroup}
            onMoveToSubgraph={handleMoveToSubgraph}
            onDeleteSubgraph={handleDeleteSubgraph}
            metadata={metadata}
            onUpdateMetadata={handleUpdateMetadata}
          />
        </div>

        {deleteGroupConfirm && (
          <div
            className="tab-modal-overlay"
            onClick={() => setDeleteGroupConfirm(null)}
          >
            <div className="tab-modal">
              <h3 className="type-switch-title">
                删除分组「{deleteGroupConfirm.groupName}」
              </h3>
              <p className="type-switch-message">
                该分组下有子节点，请选择删除方式：
              </p>
              <ul style={{ margin: '0 0 16px 0', fontSize: 13, color: '#555', paddingLeft: 20 }}>
                <li>递归删除：删除分组及其所有子节点</li>
                <li>保留子节点：仅删除分组，子节点提升为顶层</li>
              </ul>
              <div className="tab-modal-actions">
                <button
                  type="button"
                  className="tab-modal-btn tab-modal-cancel"
                  onClick={() => setDeleteGroupConfirm(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="tab-modal-btn tab-modal-confirm"
                  onClick={() => handleDeleteNodeRecursive(deleteGroupConfirm.groupId, { recursive: false })}
                >
                  保留子节点
                </button>
                <button
                  type="button"
                  className="tab-modal-btn tab-modal-confirm"
                  onClick={() => handleDeleteNodeRecursive(deleteGroupConfirm.groupId, { recursive: true })}
                >
                  递归删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * GraphCanvas 组件 — 包裹 ReactFlowProvider
 * 图结构类型专用画布，根据 diagramType 选择节点/边组件和布局算法
 */
export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
