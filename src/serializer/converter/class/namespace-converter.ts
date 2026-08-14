/**
 * NamespaceOpenConverter / NamespaceCloseConverter — Namespace Block ↔ MermaidNode 双向转换
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块2-转换器.md
 * 阶段：M3 重构 L2-6
 *
 * 数据流：
 *   parse 方向：
 *     - NamespaceOpenBlock → MermaidNode（type='class-namespace', isSubgraph=true）+ ctx.pushParent
 *       - metadataCollector.addNamespace({namespaceId, label, parentId: ctx.currentParent()})
 *     - NamespaceCloseBlock → ctx.popParent（LIFO 校验，失配抛 NamespaceStackError）
 *   serialize 方向：
 *     - MermaidNode（type='class-namespace'） → NamespaceOpenBlock（含 rawText，对齐设计点1）
 *     - NamespaceCloseBlock 由 Registry 在 DFS 扫描时自动产出（不需要 Converter）
 *
 * namespace 嵌套通过 parentId 表达：
 *   - parse: NamespaceOpenBlock → ctx.pushParent(namespaceId)，后续 class/note 节点 parentId=ctx.currentParent()
 *   - serialize: DFS 扫描 nodes 按 parentId 递归，namespace 节点产出 NamespaceOpenBlock + 递归子节点 + NamespaceCloseBlock
 *
 * rawText 生成（对齐老路径 serializeNamespace 行为）：
 *   - namespace open：`namespace Name {`（仅 open 行，子节点由 DFS 递归产出独立 block）
 *   - namespace close：`}`（由 Registry.createNamespaceCloseBlock 生成，对齐 mermaid classDiagram namespace 关闭语法）
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、../types.js，不引用 React/DOM。
 */

import type {
  MermaidNode,
  MermaidNodeData,
  MermaidShapeType,
} from '../../types.js';
import type {
  NamespaceCloseBlock,
  NamespaceOpenBlock,
} from '../../recognizer/types.js';
import type {
  ClassConverterContext,
} from './types.js';
import type {
  BlockConvertError,
  IModelBlockConverter,
  ISideEffectBlockConverter,
} from '../types.js';

// ============================================================
// NamespaceStackError — namespace 栈失配错误
// ============================================================

/**
 * namespace 栈失配错误
 *
 * 场景：NamespaceCloseBlock 的 namespaceId 与栈顶不匹配（LIFO 校验失败）
 * 处理：转为 BlockConvertError 累积到 errors 数组，不中断后续 block 处理
 *
 * 对齐 flowchart SubgraphStackError：携带 block 字段供 toBlockConvertError 提取
 */
export class NamespaceStackError extends Error {
  readonly block: NamespaceCloseBlock;
  readonly expectedId: string | undefined;
  readonly actualId: string;
  constructor(block: NamespaceCloseBlock, expectedId: string | undefined) {
    super(
      `Namespace stack mismatch: closing '${block.namespaceId}' but expected '${expectedId ?? 'undefined'}'`,
    );
    this.name = 'NamespaceStackError';
    this.block = block;
    this.actualId = block.namespaceId;
    this.expectedId = expectedId;
  }
}

/**
 * 构造 BlockConvertError（从 NamespaceStackError）
 *
 * 供 ClassConverterRegistry.parseBlocks 的 catch 块调用
 */
export function toBlockConvertError(err: NamespaceStackError): BlockConvertError {
  return {
    block: err.block,
    message: err.message,
  };
}

// ============================================================
// 辅助函数：rawText 生成
// ============================================================

/**
 * 生成 namespace open block 的 rawText（对齐老路径 serializeNamespace 行为）
 *
 * 格式：`namespace Name {`（仅 open 行，子节点由 DFS 递归产出独立 block）
 *
 * label 处理：
 *   - data.label 存在且与 id 不同：用 label 作为显示名
 *   - data.label 不存在或与 id 相同：用 id 作为显示名
 */
function formatNamespaceOpen(namespaceId: string, label: string | undefined): string {
  const displayName = label !== undefined && label !== '' ? label : namespaceId;
  return `namespace ${displayName} {`;
}

// ============================================================
// NamespaceOpenConverter 实现（产出型）
// ============================================================

/**
 * NamespaceOpenBlock ↔ MermaidNode 双向转换器
 *
 * parse 方向产出 namespace 节点（type='class-namespace'，isSubgraph=true），
 * 并 pushParent 入栈，后续 class/note 节点 parentId 指向此 namespace
 */
export class NamespaceOpenConverter
  implements IModelBlockConverter<NamespaceOpenBlock, MermaidNode, ClassConverterContext>
{
  /** parse：NamespaceOpenBlock → MermaidNode，通过 ctx.registerNode 注册 + ctx.pushParent 入栈 */
  parseBlock(block: NamespaceOpenBlock, context: ClassConverterContext): MermaidNode | null {
    const parentId = context.currentParent();
    const label = block.label ?? block.namespaceId;

    const data: MermaidNodeData = {
      label,
      shape: 'class-namespace' as MermaidShapeType,
      isSubgraph: true,
      ...(block.sourceLine !== undefined ? { _sourceLine: block.sourceLine } : {}),
    };

    const node: MermaidNode = {
      id: block.namespaceId,
      type: 'class-namespace',
      position: { x: 0, y: 0 },
      data,
      ...(parentId !== undefined ? { parentId, extent: 'parent' as const } : {}),
    };

    context.registerNode(node);
    context.pushParent(block.namespaceId);

    // 累积到 metadata.namespaces
    context.metadataCollector.addNamespace({
      namespaceId: block.namespaceId,
      label,
      ...(parentId !== undefined ? { parentId } : {}),
    });

    return node;
  }

  /** serialize：MermaidNode → NamespaceOpenBlock（含 rawText，对齐设计点1） */
  serializeBlock(model: MermaidNode, _context: ClassConverterContext): NamespaceOpenBlock | null {
    // 非命名空间节点返回 null
    if (model.type !== 'class-namespace') {
      return null;
    }

    const data = model.data;
    // 直接透传 data.label（undefined 表示用户未显式设标签，formatNamespaceOpen 回退为 id）
    const label = data.label as string | undefined;

    // rawText 由 formatNamespaceOpen 生成（设计点1：rawText 由 Converter 生成）
    const rawText = formatNamespaceOpen(model.id, label);

    const block: NamespaceOpenBlock = {
      type: 'namespace-open',
      sourceLine: data._sourceLine,
      rawText,
      indent: 0,
      namespaceId: model.id,
      // label 类型为 string | undefined（required 字段，值可为 undefined）
      label,
    };

    return block;
  }
}

// ============================================================
// NamespaceCloseConverter 实现（副作用型，栈管理）
// ============================================================

/**
 * NamespaceCloseBlock 副作用型转换器
 *
 * parse 方向：ctx.popParent（LIFO 校验，失配抛 NamespaceStackError）
 * 无 serialize 方向（NamespaceCloseBlock 由 Registry 在 DFS 扫描时自动产出）
 */
export class NamespaceCloseConverter
  implements ISideEffectBlockConverter<NamespaceCloseBlock, ClassConverterContext>
{
  /** parse：NamespaceCloseBlock → ctx.popParent（LIFO 校验） */
  parseBlock(block: NamespaceCloseBlock, context: ClassConverterContext): void {
    const expectedId = context.popParent();
    // LIFO 校验：popParent 返回的 id 应与 block.namespaceId 匹配
    if (expectedId !== block.namespaceId) {
      throw new NamespaceStackError(block, expectedId);
    }
  }
}
