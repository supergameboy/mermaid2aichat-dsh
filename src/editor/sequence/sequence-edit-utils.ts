/**
 * sequence-edit-utils — 时序图编辑操作纯函数集合（B4.5/B5.4）
 *
 * 单一职责：提供时序图编辑操作（删除/Box 重分配/嵌套判定）的纯函数实现
 *   - 无副作用：所有函数基于输入返回新值，不修改原数组
 *   - 可独立测试：纯函数不依赖 React/DOM，可单元测试
 *
 * 提取原因（对齐 code-standards.md §7.3「纯逻辑与副作用分离」）：
 *   - 原 sequence-canvas.tsx 内三个私有纯函数（reassignParticipantBox /
 *     adjustIndexAfterDeletion / isNestedBlock）无法被外部测试访问
 *   - 提取为独立模块后，B5.4 编辑操作测试可直接单元测试这些纯函数
 *   - sequence-canvas.tsx 改为 import 使用，行为不变
 *
 * 设计文档：
 *   - docs/design/fractal-design-20260701-sequence重新设计/fractal-design-20260701-sequence重新设计-B4-L2-子功能细化.md
 *   - docs/design/fractal-design-20260701-sequence重新设计/fractal-design-20260701-sequence重新设计-B5-集成验证闭环.md
 */

import type {
  SequenceBlockInfo,
  SequenceBoxInfo,
} from '@mermaid2aichat/serializer';

/**
 * B4.4：重分配参与者所属 Box（单一数据源：box.actorKeys）
 *
 * 纯函数：基于现有 boxes 数组返回新的 boxes 数组（不可变更新）
 * - 从所有 box.actorKeys 中移除该 participantId
 * - 若 targetBoxId !== null，追加到目标 box.actorKeys
 * - 无变化的 box 保留原引用（避免不必要的重渲染）
 *
 * 被 handleUpdateBoxAssignment（属性面板）和 handleAssignBox（拖拽）共用，
 * 消除代码重复（code-standards.md §2.4「一个概念只表达一次」）
 */
export function reassignParticipantBox(
  boxes: SequenceBoxInfo[],
  participantId: string,
  targetBoxId: string | null,
): SequenceBoxInfo[] {
  return boxes.map((box) => {
    const filtered = box.actorKeys.filter((id) => id !== participantId);
    if (box.id === targetBoxId) {
      return { ...box, actorKeys: [...filtered, participantId] };
    }
    return filtered.length === box.actorKeys.length ? box : { ...box, actorKeys: filtered };
  });
}

/**
 * B4.5：删除消息后索引调整（纯函数）
 *
 * 语义：
 * - 被删索引之前的 original 不变
 * - 被删索引之后的 original 减去 adjustment（adjustment = 排在被删索引之前的被删索引数量）
 * - original 等于被删索引：
 *   - isEnd=false（startMessage / messageIndex）：返回 -1，外层 filter 清理孤儿
 *   - isEnd=true（endMessage）：保持 adjustment 不变，让 endMessage 指向被删索引
 *     （变为不含该消息的排他终点，显式空块表达"不做任何调整"，避免 no-op 表达式歧义）
 *
 * 被 deleteParticipant / deleteMessage 共用，消除索引调整逻辑重复
 */
export function adjustIndexAfterDeletion(
  original: number,
  removedIndices: ReadonlySet<number>,
  isEnd = false,
): number {
  let adjustment = 0;
  for (const removed of removedIndices) {
    if (removed < original) {
      adjustment++;
    } else if (removed === original && !isEnd) {
      // startMessage / messageIndex 等于被删索引：标记为 -1，外层 filter 清理孤儿
      return -1;
    } else if (removed === original && isEnd) {
      // endMessage 等于被删索引：保持 adjustment 不变，return original - adjustment
      // 使 endMessage 指向被删索引（变为不含该消息的排他终点）
    }
  }
  return original - adjustment;
}

/**
 * B4.5：判断 child 是否为 parent 的嵌套子块（纯函数）
 *
 * 嵌套定义：child.startMessage ≥ parent.startMessage
 *           且 child.endMessage ≤ parent.endMessage
 *           且 child !== parent
 *
 * 被 deleteBlock 共用，用于连带删除嵌套子块
 */
export function isNestedBlock(
  child: SequenceBlockInfo,
  parent: SequenceBlockInfo,
): boolean {
  return (
    child.startMessage >= parent.startMessage &&
    child.endMessage <= parent.endMessage &&
    child !== parent
  );
}
