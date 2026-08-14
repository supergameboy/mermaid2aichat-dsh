/**
 * dagre 布局 — 用于 flowchart/class/er/state/architecture 图结构类型
 *
 * 单一职责：使用 dagre 计算节点位置，返回带位置的节点数组
 *
 * 数据流:
 *   MermaidNode[] + MermaidEdge[] + FlowchartDirection + GraphMetadata
 *     → dagre.layout（compound graph + 动态尺寸 + minlen + 自环排除）
 *     → { nodes: MermaidNode[]（带位置）, edges: MermaidEdge[]（自环标记） }
 *
 * 关键设计:
 *   - compound: true 支持 subgraph 嵌套（parentId → dagre parent）
 *   - 动态节点尺寸（非 subgraph 用 computeNodeSize 重算；subgraph 用默认值作为 dagre 初始尺寸，由 calculateSubgraphSize 独立计算输出尺寸）
 *   - 两阶段布局（第一阶段 compound 图算子节点相对位置与实际子图尺寸；
 *     第二阶段用扁平图按实际尺寸重跑 dagre 确保 sibling 非重叠，保留第一阶段子节点相对位置）
 *   - 边 minlen 支持（edge.data.length → dagre minlen）
 *   - 自环边特殊处理（source === target，不参与 dagre 排名，绕节点一圈）
 *   - ranksep=120, nodesep=60（增大间距减少交叉）
 */

import dagre from 'dagre-cluster-fix';
import type {
  FlowchartDirection,
  GraphMetadata,
  MermaidEdge,
  MermaidNode,
} from '@mermaid2aichat/serializer';
import { computeNodeSize } from '../nodes/flowchart/shapes/node-size.js';
import { computeClassBoxSize } from '../nodes/class/class-box-size.js';
import { computeErBoxSize } from '../nodes/er/er-box-size.js';
import { isContainerNode } from '../graph-canvas-helpers.js';

// ============================================================
// 常量
// ============================================================


const RANK_SEP = 120;
const NODE_SEP = 60;
export const SUBGRAPH_DEFAULT_WIDTH = 300;
export const SUBGRAPH_DEFAULT_HEIGHT = 200;
export const SUBGRAPH_MIN_WIDTH = 200;
export const SUBGRAPH_MIN_HEIGHT = 100;
/** 标题栏高度，需与 subgraph-node.tsx 保持一致 */
export const SUBGRAPH_TITLE_HEIGHT = 28;
/** 子图内容区水平内边距，与 dagre 布局后左右间距一致（实测约 NODE_SEP * 0.75） */
export const SUBGRAPH_HORIZONTAL_PADDING = 45;
/** 子图内容区垂直内边距，与 dagre 布局后上下间距一致（实测约 RANK_SEP/2） */
const SUBGRAPH_VERTICAL_PADDING = 60;

// ============================================================
// 布局函数
// ============================================================

/**
 * 使用 dagre 计算节点位置
 *
 * @param nodes - 画布节点（subgraph 节点通过 parentId 标识父子关系）
 * @param edges - 画布边（自环边会被排除出 dagre 排名）
 * @param direction - 布局方向（TB/BT/LR/RL）
 * @param metadata - 图元数据（预留，用于读取 subgraph 方向等）
 * @returns 带位置的节点数组 + 自环标记的边数组
 */
export function layoutWithDagre(
  nodes: MermaidNode[],
  edges: MermaidEdge[],
  direction: FlowchartDirection = 'TB',
  metadata?: GraphMetadata,
): { nodes: MermaidNode[]; edges: MermaidEdge[] } {
  // 空画布直接返回
  if (nodes.length === 0) return { nodes, edges };

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({
    rankdir: toDagreRankDir(direction),
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    marginx: 20,
    marginy: 20,
    edgesep: 20,
    // 贪心 FAS 算法处理环边，结果不依赖节点插入顺序（dfsFAS 按 g.nodes() 顺序 DFS，
    // 节点注册顺序扰动会导致环边反转选择不稳定，引发 R/S 这类回边节点位置错乱）
    acyclicer: 'greedy',
  });
  g.setDefaultEdgeLabel(() => ({}));

  // 添加节点（含 subgraph 容器节点）
  // 边界校验：先收集所有节点 ID，setParent 时校验父节点存在性
  // 防止孤儿 parentId（父节点已删除但子节点 parentId 未清理）导致 dagre dfs 崩溃
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    const { width, height } = getNodeSize(node);
    g.setNode(node.id, { width, height });
    // compound graph 父子关系：仅当父节点存在于图中时才设置
    if (node.parentId && nodeIds.has(node.parentId)) {
      g.setParent(node.id, node.parentId);
    }
  }

  // 添加边（排除自环边，自环边不参与 dagre 排名）
  const selfLoopEdgeIds = new Set<string>();
  for (const edge of edges) {
    if (edge.source === edge.target) {
      selfLoopEdgeIds.add(edge.id);
      continue; // 自环边不加入 dagre
    }
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      const minlen = readEdgeLength(edge);
      g.setEdge(edge.source, edge.target, minlen > 1 ? { minlen } : {});
    }
  }

  // 计算布局（第一阶段：用默认/估算尺寸）
  dagre.layout(g);

  // 构建 parentId → 直接子节点 映射（两阶段共用，不依赖 dagre 结果）
  const childrenMap = new Map<string, MermaidNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = childrenMap.get(node.parentId) ?? [];
    siblings.push(node);
    childrenMap.set(node.parentId, siblings);
  }

  // 计算子图嵌套深度，用于自底向上处理
  function getNestingDepth(nodeId: string): number {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node?.parentId) return 0;
    return 1 + getNestingDepth(node.parentId);
  }

  // 收集所有子图节点，按嵌套深度降序排列（最深优先，保证内层先计算）
  const subgraphNodes = nodes.filter(isContainerNode);
  subgraphNodes.sort((a, b) => getNestingDepth(b.id) - getNestingDepth(a.id));

  // 第一阶段：dagre 用默认尺寸布局 → 收集相对位置 → 计算实际子图尺寸 → 居中子节点

  // 1. 收集 dagre 输出的绝对位置（节点中心 → 左上角）和尺寸
  // subgraph 节点使用 dagre 计算的真实尺寸（compound 模式自动扩展父节点以包含子节点），
  // 普通节点使用 getNodeSize 输入尺寸
  const absolutePositions = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    if (!dagreNode) continue;
    const nodeIsSubgraph = isContainerNode(node);
    const width = nodeIsSubgraph ? dagreNode.width : getNodeSize(node).width;
    const height = nodeIsSubgraph ? dagreNode.height : getNodeSize(node).height;
    absolutePositions.set(node.id, {
      x: dagreNode.x - width / 2,
      y: dagreNode.y - height / 2,
      width,
      height,
    });
  }

  // 2. 将子节点位置转换为相对父 subgraph 的坐标，并向下偏移标题栏高度
  const relativePositions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const abs = absolutePositions.get(node.id);
    if (!abs) continue;
    if (node.parentId && absolutePositions.has(node.parentId)) {
      const parentAbs = absolutePositions.get(node.parentId)!;
      relativePositions.set(node.id, {
        x: abs.x - parentAbs.x,
        y: abs.y - parentAbs.y + SUBGRAPH_TITLE_HEIGHT,
      });
    } else {
      relativePositions.set(node.id, { ...abs });
    }
  }

  // 3. 计算子图真实尺寸：基于直接子节点包围盒 + padding，并居中子节点
  const subgraphSizeMap = new Map<string, { width: number; height: number }>();
  for (const node of subgraphNodes) {
    // 仅遍历存在于 dagre 图中的子图节点（防止孤儿 parentId 导致崩溃）
    if (!g.hasNode(node.id)) continue;

    // 只遍历直接子节点（relativePositions 是相对于直接父节点的坐标）
    // 嵌套子图的 subgraphSizeMap 已包含其自身所有后代的尺寸，无需重复遍历
    const directChildren = childrenMap.get(node.id) ?? [];
    if (directChildren.length === 0) {
      // 空子图使用默认尺寸（不复用旧布局产物，与 getNodeSize 保持一致）
      subgraphSizeMap.set(node.id, {
        width: SUBGRAPH_DEFAULT_WIDTH,
        height: SUBGRAPH_DEFAULT_HEIGHT,
      });
      continue;
    }

    // 基于直接子节点包围盒计算内容区尺寸
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const child of directChildren) {
      const childPos = relativePositions.get(child.id);
      if (!childPos) continue;

      // 统一调用 getChildSize：子图用 subgraphSizeMap / child.width，普通节点用 getNodeSize
      const childSize = getChildSize(child, subgraphSizeMap);

      minX = Math.min(minX, childPos.x);
      minY = Math.min(minY, childPos.y);
      maxX = Math.max(maxX, childPos.x + childSize.width);
      maxY = Math.max(maxY, childPos.y + childSize.height);
    }

    const contentWidth = Number.isFinite(minX) ? maxX - minX : 0;
    const contentHeight = Number.isFinite(minY) ? maxY - minY : 0;

    // 统一调用 calculateSubgraphSize：不再使用 dagreNode.width/height 作为下限
    // dagre 内部 padding 已通过 SUBGRAPH_HORIZONTAL_PADDING / SUBGRAPH_VERTICAL_PADDING 反映
    const { width, height } = calculateSubgraphSize(contentWidth, contentHeight);

    subgraphSizeMap.set(node.id, { width, height });

    // 调整子节点相对坐标使内容在子图内按 padding 居中
    // 子图位置保持 dagre 分配值，不独立偏移——独立偏移会破坏 dagre 的 sibling 非重叠布局
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) continue;

    const adjustX = SUBGRAPH_HORIZONTAL_PADDING - minX;
    const adjustY = SUBGRAPH_TITLE_HEIGHT + SUBGRAPH_VERTICAL_PADDING - minY;

    for (const child of directChildren) {
      const childPos = relativePositions.get(child.id);
      if (!childPos) continue;
      relativePositions.set(child.id, {
        ...childPos,
        x: childPos.x + adjustX,
        y: childPos.y + adjustY,
      });
    }
  }

  // 第二阶段：用实际子图尺寸构建扁平图（无 compound 关系）重跑 dagre，确保 sibling 间距
  //
  // 根因：dagre compound 模式有两个问题：
  //   1. 根据子节点包围盒重新计算父节点尺寸，忽略通过 setNode 设置的 width/height
  //   2. compound 模式下 sibling 间距基于 dagre 内部计算的尺寸（含 compound padding），
  //      与我们渲染用的实际尺寸不一致 → 即使 dagre 尺寸 > 我们的尺寸，仍可能出现 sibling 重叠
  //
  // 解决方案：**始终**构建扁平图（compound: false），只包含根级节点（无 parentId）。
  //   - subgraph 用第一阶段计算的实际尺寸（subgraphSizeMap）
  //   - 普通根节点用 getNodeSize
  //   - 跨子图边映射为根节点之间的边（child → root ancestor）
  // dagre 对扁平节点直接使用我们设置的尺寸做 sibling 间距，无 compound 重新计算。
  //
  // 子节点相对位置保持第一阶段值（含居中调整），不受第二阶段影响——子节点 position 是相对
  // 父 subgraph 左上角的偏移，不随父 subgraph 绝对位置变化而变化。
  //
  // 注意：只要存在 ≥2 个根级节点就运行第二阶段。单个根节点时跳过（无 sibling 无需重排）。
  const rootNodes = nodes.filter((n) => !n.parentId);
  if (rootNodes.length >= 2) {
    // 构建 childId → rootId 映射（沿 parentId 链回溯到根）
    const rootOf = new Map<string, string>();
    for (const node of nodes) {
      let currentId: string = node.id;
      let currentParentId: string | undefined = node.parentId;
      while (currentParentId) {
        const parent = nodes.find((n) => n.id === currentParentId);
        if (!parent) break;
        currentId = parent.id;
        currentParentId = parent.parentId;
      }
      rootOf.set(node.id, currentId);
    }

    // 扁平图：只含根级节点
    const flatGraph = new dagre.graphlib.Graph({ compound: false });
    flatGraph.setGraph({
      rankdir: toDagreRankDir(direction),
      ranksep: RANK_SEP,
      nodesep: NODE_SEP,
      marginx: 20,
      marginy: 20,
      edgesep: 20,
      acyclicer: 'greedy',
    });
    flatGraph.setDefaultEdgeLabel(() => ({}));

    for (const node of rootNodes) {
      const size = isContainerNode(node)
        ? (subgraphSizeMap.get(node.id) ?? getNodeSize(node))
        : getNodeSize(node);
      flatGraph.setNode(node.id, { width: size.width, height: size.height });
    }

    // 跨根边：child → root 映射后，跳过同根边（子图内部边不影响根级布局）
    for (const edge of edges) {
      if (edge.source === edge.target) continue; // 跳过自环
      const sourceRoot = rootOf.get(edge.source);
      const targetRoot = rootOf.get(edge.target);
      if (!sourceRoot || !targetRoot) continue;
      if (sourceRoot === targetRoot) continue; // 同子图内部边
      if (flatGraph.hasNode(sourceRoot) && flatGraph.hasNode(targetRoot)) {
        flatGraph.setEdge(sourceRoot, targetRoot, {});
      }
    }

    dagre.layout(flatGraph);

    // 只更新根级节点位置（无 parentId 的节点）
    for (const node of rootNodes) {
      const dn = flatGraph.node(node.id);
      if (!dn) continue;
      const size = isContainerNode(node)
        ? (subgraphSizeMap.get(node.id) ?? getNodeSize(node))
        : getNodeSize(node);
      relativePositions.set(node.id, {
        x: dn.x - size.width / 2,
        y: dn.y - size.height / 2,
      });
    }
  }

  // 4. 映射回 MermaidNode
  const newNodes = nodes.map((node) => {
    const dagreNode = g.node(node.id);
    if (!dagreNode) return node;
    const pos = relativePositions.get(node.id);
    if (!pos) return node;

    const baseSize = getNodeSize(node);
    const size = isContainerNode(node)
      ? (subgraphSizeMap.get(node.id) ?? baseSize)
      : baseSize;

    // 内容自适应节点（er-box）：不回写 width/height，让 React Flow 通过 ResizeObserver
    // 测量实际 DOM 尺寸，确保 Handle 位置（DOM 边缘）与边锚点（React Flow 内部尺寸）一致。
    //
    // 原因：er-box 使用 display: inline-block + CSS grid minmax 自适应列宽，DOM 宽度由
    // 内容决定。估算值（per-column 字宽 × 字符数）与实际 DOM 宽度可能不一致（中文字宽
    // 偏差、proportional 字体不等宽），若回写 node.width 会导致：
    //   - React Flow NodeWrapper 设置 CSS width = 估算值（≠ DOM 宽度）
    //   - Handle 定位在 DOM 边缘（实际宽度）
    //   - 边锚点基于 node.width（估算值）计算
    //   - 两者不匹配 → 边锚点偏离 Handle
    //
    // dagre 布局仍用 getNodeSize 估算值计算间距（g.setNode 已用估算值），仅不回写到节点
    // state，保证 DOM 是节点尺寸的唯一数据源（institution §1.1 单一数据源）。
    // React Flow 测量 DOM 后会通过 dimensions change（set:true）设置 node.width = 实际值。
    if (node.type === 'er-box') {
      return {
        ...node,
        position: { x: pos.x, y: pos.y },
        width: undefined,
        height: undefined,
      };
    }

    return {
      ...node,
      position: { x: pos.x, y: pos.y },
      width: size.width,
      height: size.height,
    };
  });

  // 自环边标记（渲染器据此绘制绕圈路径）
  const newEdges = edges.map((edge) => {
    if (selfLoopEdgeIds.has(edge.id)) {
      return { ...edge, data: { ...edge.data, isSelfLoop: true } };
    }
    return edge;
  });

  return { nodes: newNodes, edges: newEdges };
}

// ============================================================
// 辅助函数
// ============================================================

/** 将 FlowchartDirection 转换为 dagre rankdir */
function toDagreRankDir(direction: FlowchartDirection): string {
  switch (direction) {
    case 'TB':
    case 'TD':
      return 'TB';
    case 'BT':
      return 'BT';
    case 'LR':
      return 'LR';
    case 'RL':
      return 'RL';
    default:
      return 'TB';
  }
}

/**
 * 获取节点尺寸（动态尺寸）
 *
 * 非 subgraph 节点：始终用 computeNodeSize 重新计算
 *   - computeNodeSize 是 ShapeRenderer 渲染尺寸的单一数据源
 *   - 忽略 node.width/height 旧值，避免容器尺寸与形状尺寸不一致
 *     （不一致会导致边起终点偏离形状边缘）
 *
 * class-box 节点（M3 修订）：调用 computeClassBoxSize 估算尺寸
 *   - class-box 高度依赖 members 数量（动态），computeNodeSize 仅基于 shape + label
 *   - 修复"代码初始化后布局出现类重叠"bug：dagre 收到的尺寸不含 members 导致间距过小
 *   - 算法：标题 + annotation + N 属性 + divider + M 方法 + 空类提示
 *
 * subgraph/namespace 节点：始终用默认尺寸作为 dagre 初始尺寸
 *   - dagre compound 模式会自动扩张父节点以包含子节点，初始值仅作为最小下限
 *   - 不使用 node.width/height 旧值 —— 旧值是上一次布局的产物，与方向强相关
 *     （TB 方向 subgraph 窄高，LR 方向宽矮），复用旧值会导致方向切换时旧尺寸
 *     成为新方向的下限（dagre 只扩张不收缩），subgraph 被迫保持过大尺寸，
 *     子节点在过大空间内居中分布，节点间距异常
 *   - subgraph 最终输出尺寸由 calculateSubgraphSize 基于子节点包围盒独立计算
 */
function getNodeSize(node: MermaidNode): { width: number; height: number } {
  // 容器型节点（subgraph + class-namespace）：默认尺寸作为 dagre 初始尺寸
  if (isContainerNode(node)) {
    return {
      width: SUBGRAPH_DEFAULT_WIDTH,
      height: SUBGRAPH_DEFAULT_HEIGHT,
    };
  }

  // class-box 节点：根据 members/stereotype/generics 估算动态尺寸
  if (node.type === 'class-box') {
    return computeClassBoxSize(node);
  }

  // er-box 节点：根据 attributes/alias 估算动态尺寸（M4 模块4 L2-8）
  //   - 与 class-box 同模式：动态尺寸避免 dagre 布局重叠
  //   - er-subgraph 走 isContainerNode 分支（已在上方处理）
  if (node.type === 'er-box') {
    return computeErBoxSize(node);
  }

  // 非 subgraph 节点：始终用 computeNodeSize 重新计算
  // 确保 node.width/height 与 ShapeRenderer 的渲染尺寸一致
  // shape/label 为 optional（边规则节点不携带），用默认值 resolve（与 shape-boundary.ts / 序列化层一致）
  return computeNodeSize(node.data.shape ?? 'rect', node.data.label ?? node.id);
}

// ============================================================
// 子图尺寸/子节点尺寸 共享计算（layoutWithDagre 与 recalculateSubgraphSizes 共用）
// ============================================================

/**
 * 计算子图尺寸（统一算法）
 *
 * 算法：基于子节点包围盒 + 标准安全距离
 * - 水平：2 × SUBGRAPH_HORIZONTAL_PADDING（≈ NODE_SEP * 0.75，与 dagre 左右间距一致）
 * - 垂直：2 × SUBGRAPH_VERTICAL_PADDING + SUBGRAPH_TITLE_HEIGHT（≈ RANK_SEP + 标题栏）
 *
 * 不再使用 dagreNode.width/height 作为下限：
 * dagre compound 模式自动扩展父节点尺寸时含 marginx/marginy/ranksep 等内部 padding，
 * 通过 SUBGRAPH_HORIZONTAL_PADDING/SUBGRAPH_VERTICAL_PADDING 实测反推已能反映 dagre 主项间距，
 * 直接使用 dagreNode 会导致重绘路径与拖动重算路径尺寸不一致。
 *
 * @param contentWidth - 子节点包围盒宽度
 * @param contentHeight - 子节点包围盒高度
 * @returns 子图宽高（与 SUBGRAPH_MIN_WIDTH/HEIGHT 取 max）
 */
function calculateSubgraphSize(
  contentWidth: number,
  contentHeight: number,
): { width: number; height: number } {
  return {
    width: Math.max(
      SUBGRAPH_MIN_WIDTH,
      contentWidth + SUBGRAPH_HORIZONTAL_PADDING * 2,
    ),
    height: Math.max(
      SUBGRAPH_MIN_HEIGHT,
      contentHeight + SUBGRAPH_VERTICAL_PADDING * 2 + SUBGRAPH_TITLE_HEIGHT,
    ),
  };
}

/**
 * 读取子节点尺寸（统一算法）
 *
 * - 子图节点：优先使用已计算尺寸（subgraphSizeMap → child.width/height → 默认尺寸）
 * - 普通节点：使用 getNodeSize
 *
 * @param child - 子节点
 * @param subgraphSizeMap - 已计算的子图尺寸映射（layoutWithDagre 自底向上计算时传入）
 *                          recalculateSubgraphSizes 不传，直接读 child.width/height
 */
function getChildSize(
  child: MermaidNode,
  subgraphSizeMap?: Map<string, { width: number; height: number }>,
): { width: number; height: number } {
  if (isContainerNode(child)) {
    // 优先使用本次循环已计算的尺寸，其次使用节点上保留的尺寸，最后用默认尺寸
    const computed = subgraphSizeMap?.get(child.id);
    if (computed) return computed;
    return {
      width: child.width ?? SUBGRAPH_DEFAULT_WIDTH,
      height: child.height ?? SUBGRAPH_DEFAULT_HEIGHT,
    };
  }
  return getNodeSize(child);
}

/**
 * 读取边的 length 字段（minlen）
 * Mermaid 语法: A --- B（length=1）, A ---- B（length=2）, A ----- B（length=3）
 */
function readEdgeLength(edge: MermaidEdge): number {
  const length = edge.data.length;
  if (typeof length === 'number' && length > 1) {
    return length;
  }
  return 1;
}

// isSubgraph 函数已删除，统一使用 isContainerNode（来自 graph-canvas-helpers.ts）
// 修改原因：isSubgraph 仅检查 data.isSubgraph，不包含 class-namespace（type === 'class-namespace'）
// 统一容器判定为单一数据源（institution §1.1）

// ============================================================
// 实时子图尺寸重计算（用户拖拽节点时调用）
// ============================================================

/**
 * 根据子节点当前位置实时重算所有 subgraph 的位置和尺寸
 *
 * 数据流:
 *   nodes（含子节点相对位置）→ 按 parentId 分组 → 计算包围盒 → 更新 subgraph position/width/height
 *
 * 设计:
 *   - 按嵌套深度自底向上计算（最深子图先算，外层子图包含内层子图尺寸）
 *   - 只遍历直接子节点，嵌套子图的尺寸已计算完毕
 *   - 子节点位置是相对于父 subgraph 的坐标（React Flow Parent Node 机制）
 *   - 同步调整 subgraph position 和子节点相对坐标，保持子节点视觉绝对位置不变
 *
 * @param nodes - 当前画布所有节点
 * @returns 更新了 position/width/height 的节点数组
 */
export function recalculateSubgraphSizes(nodes: MermaidNode[]): MermaidNode[] {
  if (nodes.length === 0) return nodes;

  // 创建可变节点映射，用于就地更新
  const nodeMap = new Map<string, MermaidNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, { ...node });
  }

  // 构建 parentId → 直接子节点 ID 映射
  const childrenMap = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = childrenMap.get(node.parentId) ?? [];
    siblings.push(node.id);
    childrenMap.set(node.parentId, siblings);
  }

  // 计算子图嵌套深度
  function getNestingDepth(nodeId: string): number {
    const node = nodeMap.get(nodeId);
    if (!node?.parentId) return 0;
    return 1 + getNestingDepth(node.parentId);
  }

  // 收集所有子图节点，按嵌套深度降序排列（最深优先）
  // 修改前：nodes.filter(isSubgraph) — isSubgraph 仅检查 data.isSubgraph，不包含 class-namespace
  // 修改后：统一使用 isContainerNode（subgraph + class-namespace + data.isSubgraph）
  const subgraphNodes = nodes.filter(isContainerNode);
  subgraphNodes.sort((a, b) => getNestingDepth(b.id) - getNestingDepth(a.id));

  for (const subgraphNode of subgraphNodes) {
    const subgraph = nodeMap.get(subgraphNode.id);
    if (!subgraph) continue;

    const childIds = childrenMap.get(subgraphNode.id) ?? [];
    if (childIds.length === 0) {
      // 空子图：确保有默认尺寸（否则 findContainerAtPosition 会因 width/height 为 0 而跳过，
      // 导致用户无法将节点拖入空的 namespace/subgraph）
      if (subgraph.width === undefined || subgraph.height === undefined) {
        subgraph.width = SUBGRAPH_DEFAULT_WIDTH;
        subgraph.height = SUBGRAPH_DEFAULT_HEIGHT;
      }
      continue;
    }

    // 基于直接子节点包围盒计算内容区尺寸
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const childId of childIds) {
      const child = nodeMap.get(childId);
      if (!child) continue;

      // 统一调用 getChildSize：子图用 child.width/height，普通节点用 getNodeSize
      const childSize = getChildSize(child);

      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxX = Math.max(maxX, child.position.x + childSize.width);
      maxY = Math.max(maxY, child.position.y + childSize.height);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      continue;
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // 仅调整子节点相对坐标使内容在子图内按 padding 居中
    // 子图位置保持不变，不独立偏移——与 layoutWithDagre 保持一致
    const adjustX = SUBGRAPH_HORIZONTAL_PADDING - minX;
    const adjustY = SUBGRAPH_TITLE_HEIGHT + SUBGRAPH_VERTICAL_PADDING - minY;

    for (const childId of childIds) {
      const child = nodeMap.get(childId);
      if (!child) continue;
      child.position = {
        x: child.position.x + adjustX,
        y: child.position.y + adjustY,
      };
    }

    // 统一调用 calculateSubgraphSize：与 layoutWithDagre 共用同一算法
    const { width, height } = calculateSubgraphSize(contentWidth, contentHeight);

    subgraph.width = width;
    subgraph.height = height;
  }

  // 返回更新后的节点数组
  return nodes.map((node) => nodeMap.get(node.id) ?? node);
}

// ============================================================
// 自环边标记
// ============================================================

/**
 * 标记自环边（source === target）
 *
 * A* 边路由不处理自环边，由 React Flow 内置自环渲染处理。
 *
 * @param edges 当前边数组
 * @returns 更新了 isSelfLoop 标记的边数组
 */
export function markSelfLoopEdges(edges: MermaidEdge[]): MermaidEdge[] {
  if (edges.length === 0) return edges;

  return edges.map((edge) => {
    if (edge.source === edge.target) {
      return { ...edge, data: { ...edge.data, isSelfLoop: true } };
    }
    // 非自环边：确保没有 isSelfLoop 标记
    if (edge.data.isSelfLoop) {
      const newData: MermaidEdge['data'] = { ...edge.data };
      delete newData.isSelfLoop;
      return { ...edge, data: newData };
    }
    return edge;
  });
}
