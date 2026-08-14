/**
 * ErEntityConverter — ErEntityBlock ↔ MermaidNode 双向转换
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块2-转换器.md
 * 阶段：模块2 L2-5
 *
 * 数据流：
 *   parse 方向：ErEntityBlock → MermaidNode（通过 ctx.registerNode 注册）
 *     - entityName → node.id + data.label（实体名同时作为节点 ID 和标签）
 *     - attributes[] → data.attributes[]（NodeAttribute[]，字段一一对应：type/name/keys/comment）
 *     - alias（空字符串视为 undefined）
 *     - cssClasses（空格分隔）→ data.classNames（过滤 'default'）
 *     - cssCompiledStyles 直接拷贝（模块1 已前置计算）
 *     - parentId 直接设置（模块1 已前置计算）
 *   serialize 方向：MermaidNode → ErEntityBlock（含 rawText）
 *     - node.id → entityName
 *     - data.attributes → attributes[]（ErAttributeBlock[]）
 *     - data.alias → alias（undefined 转为空字符串）
 *     - data.classNames → cssClasses（join(' ')）
 *     - data.cssCompiledStyles → cssCompiledStyles
 *     - node.parentId → parentId
 *     - rawText 由 formatEntityBlock 生成（单行 `ENTITY` 或多行 `ENTITY {\n  ...\n}`）
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、../types.js，
 *   ../../serializer/shared/escape-helpers.js，不引用 React/DOM。
 */

import type {
  ERAttributeKey,
  MermaidNode,
  MermaidNodeData,
  MermaidShapeType,
  NodeAttribute,
} from '../../types.js';
import type {
  ErAttributeBlock,
  ErAttributeKeyType,
  ErEntityBlock,
} from '../../recognizer/types.js';
import type { ErConverterContext } from './types.js';
import type { IModelBlockConverter } from '../types.js';
import { escapeStringLiteral } from '../../serializer/shared/escape-helpers.js';

// ============================================================
// 私有辅助：属性映射
// ============================================================

/**
 * ErAttributeBlock → NodeAttribute（parse 方向）
 *
 * 字段映射：
 *   - type/name 直接拷贝
 *   - keys: readonly ErAttributeKeyType[] → ERAttributeKey[]（类型相同，拷贝去 readonly）
 *   - comment: 空字符串视为 undefined（对齐 NodeAttribute.comment 语义）
 */
function toNodeAttribute(attr: ErAttributeBlock): NodeAttribute {
  const nodeAttr: NodeAttribute = {
    type: attr.type,
    name: attr.name,
    keys: [...attr.keys] as ERAttributeKey[],
  };
  if (attr.comment !== '') {
    nodeAttr.comment = attr.comment;
  }
  return nodeAttr;
}

/**
 * NodeAttribute → ErAttributeBlock（serialize 方向）
 *
 * 字段映射（反向）：
 *   - type/name 直接拷贝
 *   - keys: ERAttributeKey[] → ErAttributeKeyType[]（类型相同，拷贝去 readonly）
 *   - comment: undefined 转为空字符串（对齐 ErAttributeBlock.comment 语义）
 */
function fromNodeAttribute(attr: NodeAttribute): ErAttributeBlock {
  return {
    type: attr.type,
    name: attr.name,
    keys: [...(attr.keys ?? [])] as ErAttributeKeyType[],
    comment: attr.comment ?? '',
  };
}

/**
 * 序列化单个属性为 Mermaid 属性行（对齐老路径 entity-serializer.ts serializeAttribute）
 *
 * 格式: `type name keys comment`
 *   - keys: PK/FK/UK，多个用逗号分隔
 *   - comment: 用双引号包裹（如 `"订单ID"`），内部双引号转义
 */
function serializeAttribute(attr: NodeAttribute): string {
  const parts: string[] = [attr.type, attr.name];
  if (attr.keys && attr.keys.length > 0) {
    parts.push(attr.keys.join(','));
  }
  if (attr.comment) {
    parts.push(`"${escapeStringLiteral(attr.comment)}"`);
  }
  return parts.join(' ');
}

/**
 * 生成 entity block 的 rawText（不含 block 级缩进，由 Assembler 应用）
 *
 * 格式（对齐老路径 entity-serializer.ts serializeEntity）：
 *   - 无属性：单行 `ENTITY_NAME`（含别名 `ENTITY_NAME[alias]`）
 *   - 有属性：多行 `ENTITY_NAME[alias] {\n  type name PK "comment"\n}`
 *
 * 内部属性缩进 2 空格（entity 体缩进），block 级缩进由 Assembler 处理。
 */
function formatEntityBlock(
  entityName: string,
  alias: string,
  attributes: readonly NodeAttribute[],
): string {
  // 实体名（含别名: `ENTITY[alias]`）
  const entityHeader = alias !== '' ? `${entityName}[${alias}]` : entityName;

  // 无属性时输出单行声明
  if (attributes.length === 0) {
    return entityHeader;
  }

  // 有属性时输出多行块
  const lines: string[] = [];
  lines.push(`${entityHeader} {`);
  for (const attr of attributes) {
    lines.push(`  ${serializeAttribute(attr)}`);
  }
  lines.push('}');
  return lines.join('\n');
}

// ============================================================
// ErEntityConverter 实现
// ============================================================

/**
 * ErEntityBlock ↔ MermaidNode 双向转换器
 *
 * parse 方向产出 entity 节点（type='er-box'，shape='er-box'），
 * parentId 由 block.parentId 决定（模块1 已前置，无需 ctx.currentParent()）。
 *
 * 设计点7：entity attributes/alias 映射
 *   - ErEntityBlock.attributes[] → MermaidNodeData.attributes[]（NodeAttribute[]）
 *   - ErEntityBlock.alias（空字符串视为 undefined）
 *   - ErEntityBlock.cssClasses → MermaidNodeData.classNames（按空格拆分，过滤 'default'）
 *   - ErEntityBlock.cssCompiledStyles → MermaidNodeData.cssCompiledStyles（直接拷贝）
 *   - ErEntityBlock.entityName → MermaidNode.id + MermaidNodeData.label
 *   - ErEntityBlock.parentId → MermaidNode.parentId
 */
export class ErEntityConverter
  implements IModelBlockConverter<ErEntityBlock, MermaidNode, ErConverterContext>
{
  /** parse：ErEntityBlock → MermaidNode，通过 ctx.registerNode 注册 */
  parseBlock(block: ErEntityBlock, context: ErConverterContext): MermaidNode | null {
    // 1. attributes 映射（ErAttributeBlock[] → NodeAttribute[]）
    const attributes: NodeAttribute[] = block.attributes.map(toNodeAttribute);

    // 2. cssClasses 拆分到 classNames（过滤 ErDB 默认的 'default' 类）
    const cssClasses = block.cssClasses.trim();
    const classNames: string[] | undefined =
      cssClasses !== ''
        ? cssClasses.split(/\s+/).filter((c) => c !== 'default')
        : undefined;

    // 3. alias 空字符串视为 undefined
    const alias: string | undefined = block.alias !== '' ? block.alias : undefined;

    // 4. 构建 MermaidNodeData（条件展开避免 undefined 覆盖）
    const data: MermaidNodeData = {
      label: block.entityName,
      shape: 'er-box' as MermaidShapeType,
      ...(attributes.length > 0 ? { attributes } : {}),
      ...(alias !== undefined ? { alias } : {}),
      ...(classNames !== undefined && classNames.length > 0 ? { classNames } : {}),
      ...(block.cssCompiledStyles.length > 0
        ? { cssCompiledStyles: [...block.cssCompiledStyles] }
        : {}),
      ...(block.sourceLine !== undefined ? { _sourceLine: block.sourceLine } : {}),
    };

    const node: MermaidNode = {
      id: block.entityName,
      type: 'er-box',
      position: { x: 0, y: 0 },
      data,
      ...(block.parentId !== undefined ? { parentId: block.parentId } : {}),
    };

    // 注册节点（Converter 注册模式，对齐 class ClassConverter/RelationConverter/NamespaceOpenConverter）
    context.registerNode(node);

    return node;
  }

  /** serialize：MermaidNode → ErEntityBlock（含 rawText，对齐设计点1） */
  serializeBlock(model: MermaidNode, _context: ErConverterContext): ErEntityBlock | null {
    // 非实体节点返回 null（由其他 Converter 处理）
    if (model.type !== 'er-box' && model.data.shape !== 'er-box') {
      return null;
    }

    const data = model.data;
    const entityName = model.id;
    const alias = (data.alias as string | undefined) ?? '';
    const attributes = (data.attributes as NodeAttribute[] | undefined) ?? [];

    // classNames → cssClasses（join(' ')）
    const classNames = (data.classNames as string[] | undefined) ?? [];
    const cssClasses = classNames.join(' ');

    // cssCompiledStyles 直接读取（无需查 classes Map 重新计算）
    const cssCompiledStyles = (data.cssCompiledStyles as string[] | undefined) ?? [];

    // rawText 由 formatEntityBlock 生成（设计点1：rawText 由 Converter 生成）
    const rawText = formatEntityBlock(entityName, alias, attributes);

    const block: ErEntityBlock = {
      type: 'entity',
      sourceLine: data._sourceLine,
      rawText,
      indent: 0,
      entityName,
      alias,
      attributes: attributes.map(fromNodeAttribute),
      cssClasses,
      cssCompiledStyles: [...cssCompiledStyles],
      parentId: model.parentId,
    };

    return block;
  }
}
