/**
 * sequence 序列化器 — 块结构序列化
 *
 * 单一职责：将 SequenceBlockInfo[] 序列化为 Mermaid 块结构代码
 *
 * 输出格式:
 *   - "alt desc\n  ...\nelse desc\n  ...\nend\n"
 *   - "opt desc\n  ...\nend\n"
 *   - "loop desc\n  ...\nend\n"
 *   - "par desc\n  ...\nand desc\n  ...\nend\n"
 *   - "par_over desc\n  ...\nand desc\n  ...\nend\n"（B4.1 P3-8: par_over 关键字使用下划线）
 *   - "critical desc\n  ...\noption desc\n  ...\nend\n"
 *   - "break desc\n  ...\nend\n"
 *   - "rect rgb(255,0,0)\n  ...\nend\n"（B4.1: rect 颜色使用 block.color，不再复用 label）
 *
 * B4.1 修复：
 *   - 移除 'autonumber' 从 BLOCK_START_KEYWORD（autonumber 是 metadata 级开关，不是块类型）
 *   - P3-8: 'par-over' 映射到 'par_over' 关键字（对齐 jison 语法，使用下划线）
 *   - rect 块颜色独立使用 block.color 字段（不再复用 label）
 *   - 新增 midBranches 序列化（else/and/option 中间分支）
 */

import type { SequenceBlockInfo, SequenceBlockType, SequenceBlockMidBranch } from '../../types.js';

/**
 * 块类型 → 起始关键字
 *
 * B4.1 修复：
 *   - 移除 'autonumber'（autonumber 不是块类型，是 metadata 级开关）
 *   - P3-8: 'par-over' → 'par_over'（对齐 jison 语法关键字，使用下划线）
 */
const BLOCK_START_KEYWORD: Record<SequenceBlockType, string> = {
  'alt': 'alt',
  'opt': 'opt',
  'loop': 'loop',
  'par': 'par',
  'par-over': 'par_over',
  'critical': 'critical',
  'break': 'break',
  'rect': 'rect',
};

/**
 * 块类型 → 中间分支关键字（用于序列化 midBranches）
 *
 * 注意：midBranches 中的每个分支已存储 type 字段（'else'/'and'/'option'），
 * 此映射仅用于校验块类型与中间分支类型的一致性。
 */
const BLOCK_MID_TYPE: Partial<Record<SequenceBlockType, SequenceBlockMidBranch['type']>> = {
  'alt': 'else',
  'par': 'and',
  'par-over': 'and',
  'critical': 'option',
};

/**
 * 序列化块开始
 *
 * B4.1 修复：
 *   - rect 块使用 block.color 字段（独立字段，不再复用 label）
 *   - 其他块类型使用 block.label 作为描述
 *   - 移除 `?? 'loop'` fallback（违反禁止 fallback 原则）
 *
 * @param block - 块信息
 * @param indent - 缩进
 * @returns 序列化后的块开始行
 */
export function serializeBlockStart(
  block: SequenceBlockInfo,
  indent = '',
): string {
  const keyword = BLOCK_START_KEYWORD[block.type];
  if (!keyword) {
    throw new Error(`serializeBlockStart: unknown block type "${block.type}"`);
  }

  // B4.1: rect 块颜色独立使用 block.color 字段（不再复用 label）
  if (block.type === 'rect') {
    const color = block.color;
    if (!color) {
      throw new Error(`serializeBlockStart: rect block must have color field, but got undefined`);
    }
    return `${indent}rect ${color}`;
  }

  return `${indent}${keyword} ${block.label}`;
}

/**
 * 序列化块结束
 */
export function serializeBlockEnd(indent = ''): string {
  return `${indent}end`;
}

/**
 * 序列化块中间分支（else/and/option）
 *
 * B4.1 新增：midBranches 数组中的每个分支独立序列化
 *
 * @param branch - 中间分支信息
 * @param indent - 缩进
 * @returns 序列化后的中间分支行
 */
export function serializeBlockMidBranch(
  branch: SequenceBlockMidBranch,
  indent = '',
): string {
  // branch.type 已包含关键字（'else'/'and'/'option'），直接使用
  return `${indent}${branch.type} ${branch.label}`;
}

/**
 * 序列化块的所有中间分支
 *
 * @param block - 块信息
 * @param indent - 缩进
 * @returns 序列化后的中间分支行数组（无中间分支时为空数组）
 */
export function serializeBlockMidBranches(
  block: SequenceBlockInfo,
  indent = '',
): string[] {
  if (block.midBranches.length === 0) {
    return [];
  }

  // 校验块类型与中间分支类型一致性
  const expectedType = BLOCK_MID_TYPE[block.type];
  if (!expectedType) {
    throw new Error(
      `serializeBlockMidBranches: block type "${block.type}" should not have midBranches`,
    );
  }

  const lines: string[] = [];
  for (const branch of block.midBranches) {
    if (branch.type !== expectedType) {
      throw new Error(
        `serializeBlockMidBranches: block type "${block.type}" expects midBranch type "${expectedType}", got "${branch.type}"`,
      );
    }
    lines.push(serializeBlockMidBranch(branch, indent));
  }
  return lines;
}

/**
 * 判断块类型是否有中间分支
 */
export function hasBlockMid(type: SequenceBlockType): boolean {
  return type in BLOCK_MID_TYPE;
}
