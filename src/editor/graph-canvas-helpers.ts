/**
 * graph-canvas 辅助纯函数 — 从 graph-canvas.tsx 提取的可复用工具
 *
 * 单一职责：提供 graph-canvas 所需的纯函数（无 React 依赖、无副作用）
 *
 * 包含：
 * - sortNodesByParentOrder：按 parentId 拓扑排序
 * - getNodeAbsolutePosition：计算节点绝对坐标（rename 自 getSubgraphAbsolutePosition，原函数已支持任意节点）
 * - isContainerNode：判断容器型节点（统一 subgraph + class-namespace，单一数据源）
 * - collectDescendantIds：收集节点自身 + 所有后代 ID（拖拽防循环用）
 * - findContainerAtPosition：在画布上找包含指定位置的容器型节点（最深优先）
 * - mapNodeTypeForFlowchart：subgraph 节点类型映射
 * - centerNodeAt：计算节点左上角位置
 * - getViewportCenterFlowPosition：viewport 中心 flow 坐标
 * - findStartNode：查找流程图逻辑起点节点（无入边的顶层节点）
 */
import type {
  MermaidEdge,
  MermaidNode,
  MermaidShapeType,
} from '@mermaid2aichat/serializer';
import { computeNodeSize } from './nodes/flowchart/shapes/node-size.js';
import { computeClassBoxSize } from './nodes/class/class-box-size.js';
import { SUBGRAPH_DEFAULT_WIDTH, SUBGRAPH_DEFAULT_HEIGHT } from './layouts/dagre-layout.js';

/**
 * 按 parentId 拓扑排序节点数组，确保父节点排在子节点之前
 * React Flow 要求 parent nodes 必须在 children 之前处理
 */
export function sortNodesByParentOrder<T extends { id: string; parentId?: string | null }>(nodes: T[]): T[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const result: T[] = [];

  function visit(node: T) {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent) visit(parent);
    }
    result.push(node);
  }

  for (const node of nodes) {
    visit(node);
  }
  return result;
}

/**
 * 计算节点的绝对坐标（累加所有祖先的 position）
 * 用于将子节点从 subgraph/namespace 中移出时做坐标转换
 *
 * Rename 自 getSubgraphAbsolutePosition（原函数已支持任意节点，仅改名以反映语义）
 *
 * @param node 目标节点
 * @param allNodes 画布所有节点（用于查找祖先）
 */
export function getNodeAbsolutePosition(
  node: MermaidNode,
  allNodes: MermaidNode[],
): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let currentParentId = node.parentId;
  const visited = new Set<string>();
  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = allNodes.find((p) => p.id === currentParentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    currentParentId = parent.parentId;
  }
  return { x, y };
}

/**
 * 判断节点是否为容器型节点（统一判定，单一数据源）
 *
 * 容器型节点 = flowchart subgraph 或 classDiagram namespace
 *
 * 替代原 isSubgraphNode（仅检查 type === 'subgraph' || data.isSubgraph === true）
 * 扩展支持 classDiagram namespace（type === 'class-namespace'）
 *
 * 同时保留 data.isSubgraph === true 判定，因为 parse 方向直出的节点
 * 在 mapNodeTypeForFlowchart 映射前 type 可能是 'rect' 但 data.isSubgraph 已为 true
 *
 * 调用点：dagre-layout.ts、property-panel.tsx、graph-canvas.tsx、handleNodeDragStop
 */
export function isContainerNode(node: MermaidNode): boolean {
  return (
    node.type === 'subgraph' ||
    node.type === 'class-namespace' ||
    node.data.isSubgraph === true
  );
}

/**
 * 收集节点自身 + 所有后代 ID（递归遍历 parentId）
 *
 * 用于拖拽时排除自身和后代，防止形成 parentId 环：
 *   - 若节点 A 拖入自己的后代 namespace B，会形成 A.parentId = B 且 B 是 A 的后代 → 循环
 *   - sortNodesByParentOrder 的 visited 集合防死循环，但拓扑排序结果会错误
 *   - recalculateSubgraphSizes 的 getNestingDepth 会无限递归 → 栈溢出
 *   - dagre setParent 形成环 → layout 崩溃
 *
 * 注：与 mindmap/components/mindmap-tree-panel.tsx 的 collectDescendantIds 是不同函数：
 *   - 本函数（graph-canvas-helpers）接收 MermaidNode[]，BFS 遍历 parentId，返回 Set<string>
 *   - mindmap 版本接收预构建的 childrenMap，返回 string[]
 *   - 命名差异（collectSubtreeIds vs collectDescendantIds）避免导入冲突
 *
 * @param nodeId - 起始节点 ID
 * @param allNodes - 画布所有节点
 * @returns 包含 nodeId 和所有后代的 Set
 */
export function collectSubtreeIds(
  nodeId: string,
  allNodes: MermaidNode[],
): Set<string> {
  const result = new Set<string>([nodeId]);
  // BFS 遍历：每轮收集 parentId 在 result 中的节点
  let frontier = [nodeId];
  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      for (const node of allNodes) {
        if (node.parentId === id && !result.has(node.id)) {
          result.add(node.id);
          nextFrontier.push(node.id);
        }
      }
    }
    frontier = nextFrontier;
  }
  return result;
}

/**
 * 计算容器的嵌套深度（用于 findContainerAtPosition 最深优先排序）
 *
 * 嵌套深度 = 祖先中容器型节点的数量
 */
function getContainerNestingDepth(nodeId: string, allNodes: MermaidNode[]): number {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  let depth = 0;
  let currentId: string | undefined = nodeId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = nodeMap.get(currentId);
    if (!node?.parentId) break;
    const parent = nodeMap.get(node.parentId);
    if (!parent) break;
    if (isContainerNode(parent)) depth++;
    currentId = parent.id;
  }
  return depth;
}

/**
 * 在画布上找到包含指定位置的容器型节点（最深优先）
 *
 * 算法：
 *   1. 候选容器 = nodes.filter(n => isContainerNode(n) && !excludeIds.has(n.id))
 *   2. 按 getContainerNestingDepth 降序排序（嵌套最深的优先）
 *   3. 遍历候选：计算容器绝对 boundingBox（绝对 position + width/height）
 *   4. 返回第一个包含 position 的容器
 *
 * 最深优先原因：嵌套 namespace 场景下，position 可能同时被外层和内层 namespace 包含，
 * 若返回外层，被拖拽节点会跨过内层直接挂到外层 → 错误
 *
 * @param nodes - 画布所有节点
 * @param position - 待检测位置（绝对坐标）
 * @param excludeIds - 排除的节点 ID 集合（拖拽节点自身+后代，防循环）
 * @returns 包含 position 的最深容器，无则 undefined
 */
export function findContainerAtPosition(
  nodes: MermaidNode[],
  position: { x: number; y: number },
  excludeIds: Set<string>,
): MermaidNode | undefined {
  // 1. 候选容器
  const candidates = nodes.filter(
    (n) => isContainerNode(n) && !excludeIds.has(n.id),
  );

  // 2. 按嵌套深度降序排序（最深优先）
  candidates.sort(
    (a, b) =>
      getContainerNestingDepth(b.id, nodes) -
      getContainerNestingDepth(a.id, nodes),
  );

  // 3. 遍历候选，返回第一个包含 position 的容器
  for (const container of candidates) {
    const absPos = getNodeAbsolutePosition(container, nodes);
    const width = container.width ?? 0;
    const height = container.height ?? 0;
    if (width === 0 || height === 0) continue;
    if (
      position.x >= absPos.x &&
      position.x <= absPos.x + width &&
      position.y >= absPos.y &&
      position.y <= absPos.y + height
    ) {
      return container;
    }
  }

  return undefined;
}

/**
 * 将 CanvasState 中的 subgraph 节点映射为 React Flow 'subgraph' 类型
 * 解析器输出的 subgraph 节点 type 为 'rect'，data.isSubgraph 为 true
 * React Flow 需要单独的 'subgraph' 节点类型才能使用 SubgraphNodeComponent 渲染
 *
 * 同时对非 subgraph 节点重新计算 width/height：
 * - computeNodeSize 是 ShapeRenderer 渲染尺寸的单一数据源
 * - 服务端发来的 node.width/height 可能是旧值或布局算法的产物
 * - 若不重算，React Flow 容器尺寸（.react-flow__node inline style）与
 *   ShapeRenderer 渲染尺寸（.mermaid-shape）会不一致，导致边起终点偏离形状边缘
 *
 * subgraph 节点的 width/height 由 layout 计算，但 parseMermaid 直出的 subgraph 节点不带 width/height。
 * 当 syncCanvas.needsLayout !== true（已布局过或服务端透传未布局状态）时，syncNodes useEffect 不触发 layout，
 * 直接 setNodes 会导致 React Flow NodeWrapper 对无尺寸节点设置 visibility:hidden，
 * 内层 subgraph 的 .mermaid-subgraph div 坍缩为 0×0，背景色不可见。
 * 此处兜底 SUBGRAPH_DEFAULT_WIDTH/HEIGHT，保证节点始终可渲染，layout 触发后真实尺寸覆盖默认值。
 */
export function mapNodeTypeForFlowchart(node: MermaidNode): MermaidNode {
  if (node.data.isSubgraph) {
    return {
      ...node,
      type: 'subgraph',
      ...(node.width === undefined ? { width: SUBGRAPH_DEFAULT_WIDTH } : {}),
      ...(node.height === undefined ? { height: SUBGRAPH_DEFAULT_HEIGHT } : {}),
    };
  }
  // 普通节点：type 设为 'default'，由 FlowchartNodeComponent 根据 data.shape 分发
  // shape/label 为 optional（边规则节点不携带），用默认值 resolve（与 shape-boundary.ts / 序列化层一致）
  const { width, height } = computeNodeSize(node.data.shape ?? 'rect', node.data.label ?? node.id);
  return { ...node, type: 'default', width, height };
}

/**
 * classDiagram 节点归一化（与 mapNodeTypeForFlowchart 对称）
 *
 * 统一确保所有 classDiagram 节点都有正确的 width/height：
 * - class-namespace：兜底默认尺寸（空 namespace 也能被 findContainerAtPosition 命中）
 * - class-box：调用 computeClassBoxSize 动态计算（含 members/stereotype/generics）
 * - class-note：调用 computeNodeSize（已接入 ShapeRenderer）
 *
 * 与 flowchart 对称的设计动机：
 * - 解析器输出、服务端同步、用户新创建的节点可能不带 width/height
 * - 统一在此处归一化，保证所有进入 React Flow 的节点都有正确尺寸
 * - 避免 findContainerAtPosition 因 width/height 为 0 而跳过容器节点
 */
export function normalizeClassDiagramNode(node: MermaidNode): MermaidNode {
  if (node.type === 'class-namespace' || node.data.isSubgraph) {
    return {
      ...node,
      type: 'class-namespace',
      ...(node.width === undefined ? { width: SUBGRAPH_DEFAULT_WIDTH } : {}),
      ...(node.height === undefined ? { height: SUBGRAPH_DEFAULT_HEIGHT } : {}),
    };
  }
  if (node.type === 'class-box') {
    const { width, height } = computeClassBoxSize(node);
    return { ...node, width, height };
  }
  // class-note 及其他形状：使用 computeNodeSize
  const { width, height } = computeNodeSize(
    (node.data.shape ?? node.type) as MermaidShapeType,
    node.data.label ?? node.id,
  );
  return { ...node, width, height };
}

/**
 * 计算新节点左上角位置，使其中心对齐给定 flow 坐标
 *
 * class-box 用动态尺寸估算（含 members/stereotype/generics），
 * 其他形状用 computeNodeSize（基于 shape + label）
 */
export function centerNodeAt(
  shape: MermaidShapeType,
  label: string,
  center: { x: number; y: number },
): { x: number; y: number } {
  let size: { width: number; height: number };
  if (shape === 'class-box') {
    // class-box 用动态尺寸估算（空类，无 members）
    size = computeClassBoxSize({ data: { label } } as MermaidNode);
  } else {
    size = computeNodeSize(shape, label);
  }
  return {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  };
}

/**
 * 计算当前 viewport 中心对应的 flow 坐标
 */
export function getViewportCenterFlowPosition(
  reactFlow: {
    getViewport: () => { x: number; y: number; zoom: number };
    screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
  },
): { x: number; y: number } {
  const container = document.querySelector('.canvas-container') as HTMLElement | null;
  const containerW = container?.clientWidth ?? 800;
  const containerH = container?.clientHeight ?? 600;
  return reactFlow.screenToFlowPosition({
    x: containerW / 2,
    y: containerH / 2,
  });
}

/**
 * 查找流程图逻辑起点节点
 *
 * 算法：无入边的顶层节点（flowchart 起始节点）
 *   - 顶层节点 = 无 parentId 的节点
 *   - 无入边 = 不在任何 edge.target 中
 *   - 取第一个（按 nodes 数组顺序，保持解析顺序）
 *   - fallback 1：循环图（所有顶层节点都有入边）→ 任意无入边节点（含 subgraph 内部）
 *     场景：顶层是环（所有顶层节点都有入边），但某 subgraph 内部存在无入边节点，
 *     此时用该节点作为布局参考起点，避免布局器从环中任意节点起步导致顺序错乱
 *   - fallback 2：全有入边 → 第一个顶层节点
 *   - fallback 3：全嵌套（无顶层节点）→ nodes[0]
 *
 * @param nodes - 画布节点数组
 * @param edges - 画布边数组
 * @returns 逻辑起点节点，空画布返回 undefined
 */
export function findStartNode(
  nodes: MermaidNode[],
  edges: MermaidEdge[],
): MermaidNode | undefined {
  if (nodes.length === 0) return undefined;

  // 顶层节点（无 parentId）
  const topLevelNodes = nodes.filter((n) => !n.parentId);
  if (topLevelNodes.length === 0) {
    // 全嵌套 fallback：所有节点都在 subgraph 内
    return nodes[0];
  }

  // 有入边的节点 ID 集合
  const nodesWithIncoming = new Set(edges.map((e) => e.target));

  // 无入边的顶层节点（逻辑起点）
  const startNodes = topLevelNodes.filter((n) => !nodesWithIncoming.has(n.id));
  if (startNodes.length > 0) {
    return startNodes[0];
  }

  // 循环图 fallback：顶层节点全部有入边时，尝试任意无入边节点（含 subgraph 内部）
  const anyNodeWithoutIncoming = nodes.find((n) => !nodesWithIncoming.has(n.id));
  if (anyNodeWithoutIncoming !== undefined) {
    return anyNodeWithoutIncoming;
  }

  // 全有入边 fallback：第一个顶层节点
  return topLevelNodes[0];
}
