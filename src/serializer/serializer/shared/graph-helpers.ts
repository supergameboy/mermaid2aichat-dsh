/**
 * 图结构辅助函数（从原 architecture-helpers 迁移而来）
 *
 * 单一职责：节点 parentId 关系的循环引用检测（flowchart 子图嵌套防环）。
 */
import type { MermaidNode } from '../../types.js';

/**
 * 检测移动 nodeId 到 targetGroupId 是否会形成循环引用
 *
 * 循环场景：
 *   - targetGroupId === nodeId（移动到自身）
 *   - targetGroupId 是 nodeId 的后代（移动到自己的子 group）
 *
 * 算法：从 targetGroupId 向上追溯 parentId 链，若遇到 nodeId 则有环
 *
 * @param nodes - 所有节点列表
 * @param nodeId - 待移动的节点 ID
 * @param targetGroupId - 目标 group ID（null 表示移出 group，不会形成循环）
 * @returns true 表示会形成循环引用，应拒绝操作
 */
export function detectCycle(
  nodes: MermaidNode[],
  nodeId: string,
  targetGroupId: string | null,
): boolean {
  // 移出 group（targetGroupId 为 null）不会形成循环
  if (targetGroupId === null) {
    return false;
  }

  // 移动到自身 — 形成循环
  if (targetGroupId === nodeId) {
    return true;
  }

  // 从 targetGroupId 向上追溯 parentId 链
  // 若遇到 nodeId，说明 nodeId 是 targetGroupId 的祖先，
  // 把 nodeId 移到 targetGroupId 下会形成环
  const nodeMap = new Map<string, MermaidNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  let currentId: string | undefined = targetGroupId;
  const visited = new Set<string>(); // 防御性：避免数据异常导致的死循环

  while (currentId !== undefined) {
    // 遇到 nodeId — 说明 nodeId 是 targetGroupId 的祖先，会形成循环
    if (currentId === nodeId) {
      return true;
    }

    // 防御性：已访问过，说明数据有环（异常情况），停止追溯
    if (visited.has(currentId)) {
      return false;
    }
    visited.add(currentId);

    // 向上追溯
    const current = nodeMap.get(currentId);
    currentId = current?.parentId;
  }

  // 追溯到顶层未遇到 nodeId — 无循环
  return false;
}
