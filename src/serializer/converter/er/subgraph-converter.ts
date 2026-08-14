/**
 * ErSubgraphOpenConverter / ErSubgraphCloseConverter — subgraph Block ↔ MermaidNode 双向转换
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块2-转换器.md
 * 阶段：模块2 L2-7
 *
 * 数据流：
 *   parse 方向：
 *     - ErSubgraphOpenBlock → MermaidNode（type='er-subgraph', isSubgraph=true）+ ctx.pushParent
 *       - metadataCollector.addErSubgraph({ id, title, nodes, dir, parentId })
 *     - ErSubgraphCloseBlock → ctx.popParent（LIFO 校验，失配抛 SubgraphStackError）
 *   serialize 方向：
 *     - MermaidNode（type='er-subgraph'） → ErSubgraphOpenBlock（含 rawText，对齐设计点1）
 *     - ErSubgraphCloseBlock 由 Registry 在 DFS 扫描时自动产出（不需要 Converter）
 *
 * subgraph 嵌套通过 parentId 表达（设计点4）：
 *   - parse: ErSubgraphOpenBlock → ctx.pushParent(subgraphId)，后续 entity 节点 parentId=block.parentId（模块1 已前置）
 *   - serialize: DFS 扫描 metadata.erSubgraphs 按 parentId 递归，产出 OpenBlock + 递归子节点 + CloseBlock
 *
 * 与 class namespace 的差异（设计点8）：
 *   - class namespace 块内直接包含 class 定义（`class Foo { ... }`）
 *   - erDiagram subgraph 块内仅引用节点 ID（`NODE1\nNODE2`）
 *   - ER subgraph rawText 包含 open + direction + 节点引用（多行，不含 close）
 *   - ErSubgraphCloseBlock.rawText = `}`（由 Registry 用工厂函数产出）
 *
 * rawText 生成（对齐 er.jison 官方语法 `subgraph <id> ... end`）：
 *   - subgraph open：`subgraph Title\n  direction LR\n  NODE1\n  NODE2`（多行，内部缩进 2 空格）
 *   - subgraph close：`end`（由 Registry.createSubgraphCloseBlock 生成）
 *
 * 语法偏差修复（2026-07-07）：原设计假设 ER subgraph 用 `subgraph "Title" { ... }`（flowchart 语法），
 * 实际 er.jison 语法是 `subgraph <id> ... end`。已修订 formatSubgraphOpen + createSubgraphCloseBlock。
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、../types.js，不引用 React/DOM。
 */

import type {
  FlowchartDirection,
  MermaidNode,
  MermaidNodeData,
  MermaidShapeType,
} from '../../types.js';
import type {
  ErSubgraphCloseBlock,
  ErSubgraphOpenBlock,
} from '../../recognizer/types.js';
import type { ErConverterContext } from './types.js';
import type {
  BlockConvertError,
  IModelBlockConverter,
  ISideEffectBlockConverter,
} from '../types.js';

// ============================================================
// SubgraphStackError — subgraph 栈失配错误
// ============================================================

/**
 * subgraph 栈失配错误
 *
 * 场景：ErSubgraphCloseBlock 的 subgraphId 与栈顶不匹配（LIFO 校验失败）
 * 处理：转为 BlockConvertError 累积到 errors 数组，不中断后续 block 处理
 *
 * 对齐 flowchart SubgraphStackError / class NamespaceStackError：携带 block 字段供 toBlockConvertError 提取
 */
export class SubgraphStackError extends Error {
  readonly block: ErSubgraphCloseBlock;
  readonly expectedId: string | undefined;
  readonly actualId: string;
  constructor(block: ErSubgraphCloseBlock, expectedId: string | undefined) {
    super(
      `Subgraph stack mismatch: closing '${block.subgraphId}' but expected '${expectedId ?? 'undefined'}'`,
    );
    this.name = 'SubgraphStackError';
    this.block = block;
    this.actualId = block.subgraphId;
    this.expectedId = expectedId;
  }
}

/**
 * 构造 BlockConvertError（从 SubgraphStackError）
 *
 * 供 ErConverterRegistry.parseBlocks 的 catch 块调用
 */
export function toBlockConvertError(err: SubgraphStackError): BlockConvertError {
  return {
    block: err.block,
    message: err.message,
  };
}

// ============================================================
// 辅助函数：rawText 生成
// ============================================================

/**
 * 生成 subgraph open block 的 rawText（对齐 er.jison 官方语法 `subgraph <id> ... end`）
 *
 * 格式（多行，内部缩进 2 空格，不含 close）：
 *   ```
 *   subgraph Title
 *     direction LR
 *     NODE1
 *     NODE2
 *   ```
 *
 * title 处理：直接输出 id（对齐 er.jison subgraph 语法 `subgraph <id>`，无引号无花括号）
 * direction：仅 dir 存在时输出 `  direction ${dir}`
 * 节点引用：遍历 nodes，每行输出 `  ${nodeId}`
 *
 * 不含 close 行（`end`），由 ErSubgraphCloseBlock 单独产出。
 * 嵌套 subgraph 在 ErSubgraphOpenBlock 和 ErSubgraphCloseBlock 之间由 Registry DFS 产出。
 */
function formatSubgraphOpen(
  title: string,
  dir: FlowchartDirection | undefined,
  nodes: readonly string[],
): string {
  const lines: string[] = [];
  lines.push(`subgraph ${title}`);

  // direction（块内方向，仅显式声明时输出）
  if (dir !== undefined) {
    lines.push(`  direction ${dir}`);
  }

  // 节点 ID 引用（直接子节点，嵌套 subgraph 由 Registry DFS 递归产出）
  for (const nodeId of nodes) {
    lines.push(`  ${nodeId}`);
  }

  return lines.join('\n');
}

// ============================================================
// ErSubgraphOpenConverter 实现（产出型）
// ============================================================

/**
 * ErSubgraphOpenBlock ↔ MermaidNode 双向转换器
 *
 * parse 方向产出 subgraph 节点（type='er-subgraph'，isSubgraph=true），
 * 并 pushParent 入栈，后续 entity 节点 parentId 由 block.parentId 决定（模块1 已前置）。
 *
 * 设计点4 关键差异（模块1 方案B 增强）：
 *   - 模块1 已通过 parentDB 前置计算 parentId，Converter 直接读取 block.parentId 设置到 node.parentId
 *   - pushParent 仅用于 subgraph-open/close 块的 LIFO 栈管理校验
 *   - currentParent() 在 ER Converter 中不被主动调用
 */
export class ErSubgraphOpenConverter
  implements IModelBlockConverter<ErSubgraphOpenBlock, MermaidNode, ErConverterContext>
{
  /** parse：ErSubgraphOpenBlock → MermaidNode，通过 ctx.registerNode 注册 + ctx.pushParent 入栈 */
  parseBlock(block: ErSubgraphOpenBlock, context: ErConverterContext): MermaidNode | null {
    const data: MermaidNodeData = {
      label: block.title,
      shape: 'er-subgraph' as MermaidShapeType,
      isSubgraph: true,
      ...(block.dir !== undefined ? { dir: block.dir } : {}),
      ...(block.nodes.length > 0 ? { subgraphNodes: [...block.nodes] } : {}),
      ...(block.sourceLine !== undefined ? { _sourceLine: block.sourceLine } : {}),
    };

    const node: MermaidNode = {
      id: block.subgraphId,
      type: 'er-subgraph',
      position: { x: 0, y: 0 },
      data,
      ...(block.parentId !== undefined ? { parentId: block.parentId, extent: 'parent' as const } : {}),
    };

    context.registerNode(node);
    context.pushParent(block.subgraphId);

    // 累积到 metadata.erSubgraphs（含 parentId，用于 serialize 还原嵌套结构）
    context.metadataCollector.addErSubgraph({
      id: block.subgraphId,
      title: block.title,
      nodes: [...block.nodes],
      ...(block.dir !== undefined ? { dir: block.dir } : {}),
      ...(block.parentId !== undefined ? { parentId: block.parentId } : {}),
    });

    return node;
  }

  /** serialize：MermaidNode → ErSubgraphOpenBlock（含 rawText，对齐设计点1） */
  serializeBlock(model: MermaidNode, _context: ErConverterContext): ErSubgraphOpenBlock | null {
    // 非子图节点返回 null
    if (model.type !== 'er-subgraph') {
      return null;
    }

    const data = model.data;
    const title = (data.label as string | undefined) ?? model.id;
    const dir = data.dir as FlowchartDirection | undefined;
    const nodes = (data.subgraphNodes as string[] | undefined) ?? [];

    // rawText 由 formatSubgraphOpen 生成（设计点1：rawText 由 Converter 生成）
    const rawText = formatSubgraphOpen(title, dir, nodes);

    const block: ErSubgraphOpenBlock = {
      type: 'subgraph-open',
      sourceLine: data._sourceLine,
      rawText,
      indent: 0,
      subgraphId: model.id,
      title,
      dir,
      nodes: [...nodes],
      parentId: model.parentId,
    };

    return block;
  }
}

// ============================================================
// ErSubgraphCloseConverter 实现（副作用型，栈管理）
// ============================================================

/**
 * ErSubgraphCloseBlock 副作用型转换器
 *
 * parse 方向：ctx.popParent（LIFO 校验，失配抛 SubgraphStackError）
 * 无 serialize 方向（ErSubgraphCloseBlock 由 Registry 在 DFS 扫描时自动产出）
 */
export class ErSubgraphCloseConverter
  implements ISideEffectBlockConverter<ErSubgraphCloseBlock, ErConverterContext>
{
  /** parse：ErSubgraphCloseBlock → ctx.popParent（LIFO 校验） */
  parseBlock(block: ErSubgraphCloseBlock, context: ErConverterContext): void {
    const expectedId = context.popParent();
    // LIFO 校验：popParent 返回的 id 应与 block.subgraphId 匹配
    if (expectedId !== block.subgraphId) {
      throw new SubgraphStackError(block, expectedId);
    }
  }
}
