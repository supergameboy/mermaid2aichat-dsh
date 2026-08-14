/**
 * baseAssembler — 通用 Block[] 拼装函数（M3 重构 L2-2 新增）
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块3-装配器.md
 * 阶段：M3 重构 L2-2（通用 assembleBlocks 函数，diagramType 无关）
 *
 * 职责：复用 ContextStack LIFO 校验，按 Block[] 原顺序拼接为代码字符串。
 *   被 FlowchartAssembler / ClassAssembler 共用，零代码重复。
 *
 * 数据流（serialize 方向）：
 *   RecognizedBlock<string>[] → assembleBlocks(blocks, options) → body 字符串
 *     - openBlock（type === options.openBlockType）→ stack.push({indent, scopeId}) + 输出 indent + rawText
 *     - closeBlock（type === options.closeBlockType）→ stack.pop()（LIFO 校验 scopeId 匹配）+ 输出 indent + rawText
 *     - 其他 block → 输出 indent + rawText
 *     - 栈未归零 → throw 程序错误
 *
 * 设计决策（M3 方案B）：
 *   - diagramType 无关：通过 options.openBlockType/closeBlockType/getScopeId 参数化嵌套边界
 *   - 复用 ContextStack：LIFO scopeId 匹配校验 + 栈未归零校验，零代码重复
 *   - preserveIndent 控制缩进策略（与 openBlockType/closeBlockType 正交）
 *
 * M3 验证后修订 [技-2]：blocks 参数类型为 RecognizedBlock<string>[]（对齐模块1 泛型化基接口），
 * 兼容 FlowchartRecognizedBlock / ClassRecognizedBlock（两者均 extends RecognizedBlock<string>）。
 *
 * M3 验证后修订 [一-8-补]：消费 AssembleInternalOptions.getScopeId 回调提取 scopeId，
 * 由调用方负责从 block 的特定字段（subgraphId/namespaceId）提取，baseAssembler 不硬编码字段名。
 *
 * 程序错误不可包容：栈 underflow、scopeId 不匹配、栈未归零 → 直接 throw（对齐 institution.md 第1.7条）。
 *
 * 模块边界：仅依赖 ./types.js、./context-stack.js、../recognizer/types.js，不引用 React/DOM。
 */

import type { RecognizedBlock } from '../recognizer/types.js';
import type { AssembleInternalOptions } from './types.js';
import { ContextStack } from './context-stack.js';

/**
 * 通用 Block[] 拼装函数，diagramType 无关。
 *
 * @param blocks Block 流（含 rawText/indent 字段，由 Converter serialize 方向产出）
 * @param options 拼装选项（openBlockType/closeBlockType 区分 subgraph/namespace +
 *                 preserveIndent 控制缩进 + getScopeId 提取 scopeId 用于 LIFO 校验）
 * @returns body 字符串（不含 header，header 由 assembler/index.ts 生成）
 * @throws Error 当 openBlock/closeBlock 不配对、scopeId 不匹配、或栈未归零时
 */
export function assembleBlocks(
  blocks: readonly RecognizedBlock<string>[],
  options: AssembleInternalOptions,
): string {
  const preserveIndent = options.preserveIndent ?? true;
  const stack = new ContextStack<string>();
  const lines: string[] = [];

  for (const block of blocks) {
    const indent = preserveIndent ? ' '.repeat(block.indent) : '';

    if (block.type === options.openBlockType) {
      const scopeId = options.getScopeId(block);
      stack.push({ indent: block.indent + 2, scopeId });
      lines.push(indentBlock(block.rawText, indent));
    } else if (block.type === options.closeBlockType) {
      const popped = stack.pop();
      const closeScopeId = options.getScopeId(block);
      if (popped.scopeId !== closeScopeId) {
        throw new Error(
          `assembleBlocks: close block scopeId mismatch — expected '${popped.scopeId ?? 'undefined'}', got '${closeScopeId}'`,
        );
      }
      lines.push(indentBlock(block.rawText, indent));
    } else {
      // 其他 block（vertex/edge/class/relation/note/class-apply/style/classDef/click/
      // direction/title/accTitle/accDescription/comment/blank 等）— 统一输出 indent + rawText
      lines.push(indentBlock(block.rawText, indent));
    }
  }

  // 栈未归零说明 openBlock/closeBlock 不配对（程序错误）
  if (stack.depth() > 0) {
    throw new Error(
      `assembleBlocks: unclosed scope(s) — stack depth ${stack.depth()} at end of assembly`,
    );
  }

  return lines.join('\n');
}

/**
 * 对 rawText 应用 block 级缩进，处理多行 rawText（如 class 块体 `class Foo {\n  +field: Type\n}`）
 *
 * 单行 rawText（flowchart 全部 block + class 的 relation/note/namespace-open 等）：
 *   直接返回 `${indent}${rawText}`
 *
 * 多行 rawText（class 块体含成员）：
 *   对每一行应用 indent，保留 rawText 内部相对缩进（如成员的 2 空格 class 体缩进）
 *   对齐老路径 serializeClassNode(node, indent) 行为：所有行都加 block 级 indent
 *
 * 空行不应用 indent（避免产生纯空白行，保持输出整洁）
 *
 * @param rawText - Converter serialize 方向产出的原始文本（含内部缩进，无 block 级缩进）
 * @param indent - block 级缩进字符串（由 block.indent × ' ' 计算）
 */
function indentBlock(rawText: string, indent: string): string {
  if (!rawText.includes('\n')) {
    return `${indent}${rawText}`;
  }
  return rawText
    .split('\n')
    .map((line) => (line.length > 0 ? `${indent}${line}` : line))
    .join('\n');
}
