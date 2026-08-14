/**
 * validateActivationPairing — 校验消息序列中激活/停用配对合法性
 *
 * 单一职责：模拟 newActivation/endActivation 栈操作，检测 dangling-deactivate
 *
 * 校验规则（对齐 sequence-bounds.ts newActivation/endActivation 栈语义）：
 *   - `+`（message.activate=true）激活 TARGET（message.to），入栈
 *   - `-`（message.deactivate=true）停用 SOURCE（message.from），从栈顶向下查找最近的匹配并移除
 *   - `-` 时栈中无匹配 → 非法（dangling-deactivate）→ 拦截 + Toast
 *   - 遍历结束栈非空 → 合法（dangling-activate，由 sequence-layout.ts 阶段4.5 兜底延伸到末尾）
 *
 * 算法对齐点：
 *   1. `+` 激活 TARGET 的语义来自 sequence-layout.ts:537 注释（from: to, to: from 传入 newActivation）
 *   2. `-` 停用 SOURCE 的语义来自 sequence-layout.ts:567（endActivation({ from: msg.from })）
 *   3. 从栈顶向下查找最近的匹配项对齐 sequence-bounds.ts:391-397 endActivation 的 LIFO 弹出语义
 *
 * 数据流：SequenceMessage[] → validateActivationPairing → ActivationValidationResult
 *
 * 设计文档：docs/design/illegal-operation-interception.md
 */
import type { SequenceMessage } from '@mermaid2aichat/serializer';

/** 校验问题类型（仅 dangling-deactivate，dangling-activate 是 mermaid 合法语法不拦截） */
export type ActivationValidationIssueType = 'dangling-deactivate';

/** 单个校验问题 */
export interface ActivationValidationIssue {
  /** 问题类型：dangling-deactivate=`-` 时栈中无匹配激活 */
  type: ActivationValidationIssueType;
  /** 触发问题的 message.id */
  messageId: string;
  /** 触发问题的 actor id */
  actor: string;
  /** 用户可读的问题描述（直接作为 Toast 内容） */
  message: string;
}

/** 校验结果 */
export interface ActivationValidationResult {
  /** valid=true 表示合法，可以写入；valid=false 表示非法，必须拦截 */
  valid: boolean;
  /** 所有问题列表（valid=true 时为空数组） */
  issues: ActivationValidationIssue[];
}

/**
 * 校验消息序列中激活/停用配对是否合法
 *
 * @param messages SequenceCanvasState 的 messages 数组（函数内部按 message.sequence 升序排序后校验）
 * @returns 校验结果
 */
export function validateActivationPairing(messages: SequenceMessage[]): ActivationValidationResult {
  // 1. 按 message.sequence 升序排序（对齐 mapCanvasStateToAst 的 events.sort）
  const sorted = [...messages].sort((a, b) => a.sequence - b.sequence);

  // 2. 模拟 newActivation/endActivation 栈操作
  // 栈元素：{ actor, messageId }（actor 可重复，支持同一 actor 多次嵌套激活）
  const stack: Array<{ actor: string; messageId: string }> = [];
  const issues: ActivationValidationIssue[] = [];

  for (const message of sorted) {
    // `+` 激活 TARGET（message.to）— 入栈
    if (message.activate === true) {
      stack.push({ actor: message.to, messageId: message.id });
    }
    // `-` 停用 SOURCE（message.from）— 从栈顶向下查找最近的匹配并移除（LIFO 语义）
    // 独立 if（非 else if），允许同一条 message 同时 activate 和 deactivate
    if (message.deactivate === true) {
      let matchIndex = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].actor === message.from) {
          matchIndex = i;
          break;
        }
      }
      if (matchIndex === -1) {
        // 非法：deactivate 前无对应 activate
        issues.push({
          type: 'dangling-deactivate',
          messageId: message.id,
          actor: message.from,
          message: `参与者 "${message.from}" 的停用操作没有对应的激活操作（请检查消息顺序）`,
        });
      } else {
        stack.splice(matchIndex, 1);
      }
    }
  }

  // 3. 不检查栈中残留（dangling-activate 是 mermaid 合法语法，
  //    由 sequence-layout.ts:883-907 阶段4.5 兜底延伸到末尾，不拦截）

  return { valid: issues.length === 0, issues };
}
