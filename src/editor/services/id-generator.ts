/**
 * IdGenerator — 统一的画布元素 ID 生成器
 *
 * 单一职责：为节点/边/组/subgraph/参与者/消息/任务等画布元素生成全局唯一 ID
 *
 * 设计依据：
 *   - 消除 graph-canvas / sequence-canvas / chart-layout 三处 ID 生成模式不一致
 *   - 修复 sequence-canvas message ID 用数组长度导致删除后冲突的 bug
 *   - 修复 graph-canvas edge/group/subgraph ID 用纯 Date.now 同毫秒冲突隐患
 *   - 删除 sequence-canvas generateMessageId 死代码
 *
 * 模式：模块级 counter + Date.now（同毫秒递增 counter，保证全局唯一）
 * 实例策略：模块级单例（ID 全局唯一即可，无需按组件隔离 counter）
 *
 * 模块边界：无外部依赖，纯函数。✅
 */

/** ID 生成器接口 */
export interface IdGenerator {
  /**
   * 生成带前缀的唯一 ID
   * @param prefix - ID 前缀（如 'node' / 'edge' / 'seq_part' / 'seq_msg' / 'task'）
   * @returns 格式 `${prefix}_${Date.now()}_${counter++}`
   */
  generate(prefix: string): string;
}

/**
 * 创建 ID 生成器实例
 *
 * counter 闭包封装，外部不可访问。
 * 每次调用 generate 递增 counter，保证同毫秒内生成的 ID 全局唯一。
 */
export function createIdGenerator(): IdGenerator {
  let counter = 0;
  return {
    generate(prefix: string): string {
      return `${prefix}_${Date.now()}_${counter++}`;
    },
  };
}

/**
 * 模块级单例 ID 生成器
 *
 * ID 全局唯一即可，无需按组件隔离 counter。
 * 所有 Canvas 组件共享同一 counter，保证跨组件 ID 不冲突。
 */
export const idGenerator = createIdGenerator();
