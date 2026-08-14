/**
 * 方向归一化工具
 *
 * 单一职责：将 jison 产出的方向字符串归一化为 FlowchartDirection
 *
 * 边界校验（code-standards 第5章：边界校验在入口处完成）：
 *   - jison parser 产出的 direction 是任意字符串
 *   - 在 db 层 setDirection 入口调用此函数完成校验
 *   - db 内部只存 FlowchartDirection，消费端无需 cast
 *
 * 归一化规则（对齐官方 flowDb.ts 既有逻辑）：
 *   - 符号方向 <,^,>,v 后缀 → RL/BT/LR/TB
 *   - 'TD' 同义词 → 'TB'（FlowchartDirection 类型保留 'TD' 但 db 层归一化为 'TB'）
 *   - 非法方向 → undefined（不存储，由 db 层使用默认值或保持原值）
 */

import type { FlowchartDirection } from '../types.js';
import { isFlowchartDirection } from '../types.js';

/**
 * 将 jison 产出的方向字符串归一化为 FlowchartDirection
 *
 * @param dir - jison 产出的原始方向字符串（可能为 undefined / 空字符串 / 符号 / 'TD' 同义词）
 * @returns 归一化后的 FlowchartDirection，无效方向返回 undefined
 */
export function normalizeDirection(dir: string | undefined): FlowchartDirection | undefined {
  if (!dir) return undefined;
  const trimmed = dir.trim();
  if (!trimmed) return undefined;

  // 符号方向归一化（flowchart 语法：<,^,>,v 后缀，对齐 flowDb.ts 既有逻辑）
  if (/.*</.test(trimmed)) return 'RL';
  if (/.*\^/.test(trimmed)) return 'BT';
  if (/.*>/.test(trimmed)) return 'LR';
  if (/.*v/.test(trimmed)) return 'TB';

  // 'TD' 同义词归一化（对齐官方 flowDb.ts，db 层统一存储 'TB'）
  if (trimmed === 'TD') return 'TB';

  // 校验是否为合法方向
  if (isFlowchartDirection(trimmed)) {
    return trimmed;
  }

  return undefined;
}
