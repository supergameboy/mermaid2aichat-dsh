/**
 * subgraph 序列化器 — subgraph 节点 → Mermaid subgraph 代码
 *
 * 单一职责：将 subgraph 节点及其子节点序列化为 Mermaid subgraph 语法
 *
 * 语法:
 *   subgraph id[Title]
 *     direction TD  (可选，显式方向时输出)
 *     ...子节点和边...
 *   end
 *
 * 嵌套通过 parentId 关系确定，子节点缩进 2 空格
 */

import type { MermaidNode, MermaidEdge } from '../../types.js';
import { serializeVertex, serializeVertexClassSuffix } from './vertex-serializer.js';
import { serializeEdge } from './edge-serializer.js';

// ============================================================
// 类型
// ============================================================

/** subgraph 序列化上下文 */
interface SubgraphContext {
  /** 所有节点（按 ID 索引） */
  nodesById: Map<string, MermaidNode>;
  /** 所有边 */
  edges: MermaidEdge[];
  /** 节点 → 所属 parent ID 映射 */
  parentMap: Map<string, string>;
  /** parent ID → 直接子节点 ID 列表 */
  childrenMap: Map<string, string[]>;
  /** subgraph 节点 ID 集合 */
  subgraphIds: Set<string>;
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 序列化 subgraph 及其所有子节点/边
 *
 * @param subgraphNode - subgraph 节点
 * @param allNodes - 画布所有节点
 * @param allEdges - 画布所有边
 * @returns Mermaid subgraph 代码块（含子节点和内部边）
 */
export function serializeSubgraph(
  subgraphNode: MermaidNode,
  allNodes: MermaidNode[],
  allEdges: MermaidEdge[],
): string {
  const ctx = buildContext(allNodes, allEdges);
  return serializeSubgraphNode(subgraphNode, ctx, 0);
}

// ============================================================
// 内部实现
// ============================================================

/** 构建序列化上下文 */
function buildContext(allNodes: MermaidNode[], allEdges: MermaidEdge[]): SubgraphContext {
  const nodesById = new Map<string, MermaidNode>();
  const parentMap = new Map<string, string>();
  const childrenMap = new Map<string, string[]>();
  const subgraphIds = new Set<string>();

  for (const node of allNodes) {
    nodesById.set(node.id, node);
    const isSubgraph = node.data.isSubgraph;
    if (isSubgraph) {
      subgraphIds.add(node.id);
    }
    if (node.parentId) {
      parentMap.set(node.id, node.parentId);
      const siblings = childrenMap.get(node.parentId) ?? [];
      siblings.push(node.id);
      childrenMap.set(node.parentId, siblings);
    }
  }

  return {
    nodesById,
    edges: allEdges,
    parentMap,
    childrenMap,
    subgraphIds,
  };
}

/** 递归序列化 subgraph 节点 */
function serializeSubgraphNode(node: MermaidNode, ctx: SubgraphContext, depth: number): string {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);

  // subgraph 头部: `subgraph id[Title]` 或 `subgraph id[Title]:::className`
  const title = node.data.label ?? node.id;
  const classNames = node.data.classNames;
  const classSuffix = classNames && classNames.length > 0 ? `:::${classNames.join(',')}` : '';
  lines.push(`${indent}subgraph ${node.id}[${title}]${classSuffix}`);

  // subgraph 方向（显式声明时输出）
  const dir = node.data.dir;
  const hasExplicitDir = node.data.hasExplicitDir;
  if (dir && hasExplicitDir) {
    lines.push(`${indent}  direction ${dir}`);
  }

  // 序列化直接子节点
  const childIds = ctx.childrenMap.get(node.id) ?? [];

  for (const childId of childIds) {
    const childNode = ctx.nodesById.get(childId);
    if (!childNode) continue;

    const isChildSubgraph = ctx.subgraphIds.has(childId);
    if (isChildSubgraph) {
      // 递归序列化嵌套 subgraph
      lines.push(serializeSubgraphNode(childNode, ctx, depth + 1));
    } else {
      // 普通节点
      const vertexCode = serializeVertex(childNode);
      const childClassSuffix = serializeVertexClassSuffix(childNode);
      lines.push(`${indent}  ${vertexCode}${childClassSuffix}`);
    }
  }

  // 序列化两端都在此 subgraph 直接子级内的边
  for (const edge of ctx.edges) {
    const sourceInThisSubgraph = isDirectChild(edge.source, node.id, ctx);
    const targetInThisSubgraph = isDirectChild(edge.target, node.id, ctx);
    if (sourceInThisSubgraph && targetInThisSubgraph) {
      lines.push(`${indent}  ${serializeEdge(edge)}`);
    }
  }

  // subgraph 尾部
  lines.push(`${indent}end`);
  return lines.join('\n');
}

/** 判断节点是否为指定 subgraph 的直接子节点 */
function isDirectChild(nodeId: string, subgraphId: string, ctx: SubgraphContext): boolean {
  return ctx.parentMap.get(nodeId) === subgraphId;
}
