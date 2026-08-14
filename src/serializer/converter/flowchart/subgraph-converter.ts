/**
 * SubgraphConverter — SubgraphOpenBlock/SubgraphCloseBlock ↔ MermaidNode(isSubgraph) 双向转换
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 4
 *
 * 数据流：
 *   parse 方向：
 *     - SubgraphOpenConverter.parseBlock: 创建 MermaidNode(isSubgraph=true) + ctx.registerNode + ctx.pushParent
 *     - SubgraphCloseConverter.parseBlock: ctx.popParent + LIFO 校验
 *   serialize 方向：
 *     - SubgraphOpenConverter.serializeBlock: MermaidNode(isSubgraph) → SubgraphOpenBlock（含 rawText）
 *     - SubgraphCloseConverter: 仅 parse 方向（serialize 由 ConverterRegistry.serialize 扫描时自动配对产出）
 *
 * 字段映射要点（SubgraphOpenBlock）：
 *   - subgraphId → MermaidNode.id
 *   - title → data.label（空串时回退为 id）
 *   - classNames → data.classNames
 *   - hasExplicitDir → data.hasExplicitDir
 *   - dir → data.dir
 *   - isSubgraph = true
 *   - shape = 'rect'（对齐 flowchart-parser.ts:430）
 *   - parentId = ctx.currentParent()（嵌套 subgraph）
 *
 * 栈管理（决策11）：
 *   - SubgraphOpenConverter.parseBlock 后调用 ctx.pushParent(subgraphId)
 *   - 后续 VertexBlock/EdgeBlock 通过 ctx.currentParent() 读取栈顶设置 parentId/data.subgraphId
 *   - SubgraphCloseConverter.parseBlock 调用 ctx.popParent() 弹出栈顶
 *   - LIFO 校验：弹出的 subgraphId 应与 block.subgraphId 匹配，不匹配则记录 BlockConvertError
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../types.js、../types.js，不引用 React/DOM。
 */

import type {
  FlowchartDirection,
  MermaidNode,
  MermaidNodeData,
} from '../../types.js';
import type {
  SubgraphCloseBlock,
  SubgraphOpenBlock,
} from '../../recognizer/types.js';
import type {
  BlockConvertError,
  ConverterContext,
  IModelBlockConverter,
  ISideEffectBlockConverter,
} from '../types.js';
import type { FlowchartRecognizedBlock } from '../../recognizer/types.js';

// ============================================================
// 1. SubgraphOpenConverter — SubgraphOpenBlock ↔ MermaidNode(isSubgraph) 双向
// ============================================================

/**
 * SubgraphOpenBlock ↔ MermaidNode(isSubgraph=true) 双向转换器
 *
 * parse 时副作用：ctx.pushParent(subgraphId)
 * 后续 VertexBlock/EdgeBlock 通过 ctx.currentParent() 读取栈顶 parentId/subgraphId
 */
export class SubgraphOpenConverter
  implements IModelBlockConverter<SubgraphOpenBlock, MermaidNode, ConverterContext>
{
  /** parse：SubgraphOpenBlock → MermaidNode(isSubgraph)，注册节点 + pushParent */
  parseBlock(block: SubgraphOpenBlock, context: ConverterContext): MermaidNode | null {
    const data: MermaidNodeData = {
      label: block.title !== '' ? block.title : block.subgraphId,
      shape: 'rect',
      isSubgraph: true,
      ...(block.classNames.length > 0 ? { classNames: [...block.classNames] } : {}),
      ...(block.hasExplicitDir ? { hasExplicitDir: true } : {}),
      ...(block.dir !== undefined ? { dir: block.dir } : {}),
      ...(block.sourceLine !== undefined ? { _sourceLine: block.sourceLine } : {}),
    };

    const node: MermaidNode = {
      id: block.subgraphId,
      type: 'subgraph',
      position: { x: 0, y: 0 },
      data,
      ...(context.currentParent() !== undefined
        ? { parentId: context.currentParent() }
        : {}),
    };

    context.registerNode(node);
    context.pushParent(block.subgraphId);
    return node;
  }

  /** serialize：MermaidNode(isSubgraph) → SubgraphOpenBlock（含 rawText） */
  serializeBlock(model: MermaidNode, _context: ConverterContext): SubgraphOpenBlock | null {
    // 非 subgraph 节点不序列化为 SubgraphOpenBlock
    if (model.data.isSubgraph !== true) {
      return null;
    }

    const data = model.data;
    // label 可选（types.ts）：undefined 或等于 id 时 title 为空，否则用 label 作为 title
    const title = data.label !== undefined && data.label !== model.id ? data.label : '';
    const rawText = this.formatSubgraphOpen(model.id, title);

    const block: SubgraphOpenBlock = {
      type: 'subgraph-open',
      sourceLine: data._sourceLine,
      rawText,
      indent: 0,
      subgraphId: model.id,
      title,
      classNames: data.classNames ?? [],
      hasExplicitDir: data.hasExplicitDir === true,
      dir: this.parseDirection(data.dir),
    };

    return block;
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 生成 subgraph open 语法
   * - 有标题：`subgraph id[title]`（id 与 [ 之间无空格，对齐 mermaid 官方语法）
   * - 无标题：`subgraph id`
   */
  private formatSubgraphOpen(id: string, title: string): string {
    if (title === '') {
      return `subgraph ${id}`;
    }
    return `subgraph ${id}[${title}]`;
  }

  /**
   * 将 data.dir 字符串解析为 FlowchartDirection
   */
  private parseDirection(dir: string | undefined): FlowchartDirection | undefined {
    if (dir === undefined) {
      return undefined;
    }
    if (dir === 'TB' || dir === 'TD' || dir === 'BT' || dir === 'RL' || dir === 'LR') {
      return dir;
    }
    return undefined;
  }
}

// ============================================================
// 2. SubgraphCloseConverter — SubgraphCloseBlock 仅 parse 方向
// ============================================================

/**
 * SubgraphCloseBlock 副作用型转换器（仅 parse 方向）
 *
 * parse 时：ctx.popParent() + LIFO 校验
 * serialize 时：由 ConverterRegistry.serialize 扫描 canvas 时按 parentId 分组深度优先遍历自动配对产出
 */
export class SubgraphCloseConverter
  implements ISideEffectBlockConverter<SubgraphCloseBlock, ConverterContext>
{
  /**
   * parse：弹出栈顶 parent，LIFO 校验
   *
   * 程序错误不可包容（code-standards 第 5 章）：SubgraphCloseBlock 与 SubgraphOpenBlock
   * 应由 Recognizer 的 pendingStack 机制保证配对，若 LIFO 校验失败说明 Recognizer 有 bug，
   * 抛出 SubgraphStackError 让 ConverterRegistry.parseBlocks 捕获并记录到 errors 数组。
   */
  parseBlock(block: SubgraphCloseBlock, context: ConverterContext): void {
    const popped = context.popParent();
    if (popped === undefined) {
      throw new SubgraphStackError(
        'subgraph-close without matching subgraph-open',
        block,
      );
    }
    if (popped !== block.subgraphId) {
      throw new SubgraphStackError(
        `subgraph-close mismatch: expected ${block.subgraphId}, got ${popped}`,
        block,
      );
    }
  }
}

// ============================================================
// 3. SubgraphStackError — LIFO 校验错误（供 Registry 捕获）
// ============================================================

/**
 * Subgraph 栈错误（LIFO 校验失败）
 *
 * ConverterRegistry.parseBlocks 通过 try/catch 捕获此错误，
 * 转换为 BlockConvertError 累加到 errors 数组（不中断后续 block 处理）。
 */
export class SubgraphStackError extends Error {
  readonly block: FlowchartRecognizedBlock;

  constructor(message: string, block: SubgraphCloseBlock) {
    super(message);
    this.name = 'SubgraphStackError';
    this.block = block;
  }
}

/**
 * 构造 BlockConvertError（从 SubgraphStackError）
 *
 * 供 ConverterRegistry.parseBlocks 的 catch 块调用
 */
export function toBlockConvertError(err: SubgraphStackError): BlockConvertError {
  return {
    block: err.block,
    message: err.message,
  };
}
