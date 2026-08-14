/**
 * ErRelationshipConverter — ErRelationshipBlock ↔ MermaidEdge 双向转换
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块2-转换器.md
 * 阶段：模块2 L2-6
 *
 * 数据流：
 *   parse 方向：ErRelationshipBlock → MermaidEdge（通过 ctx.registerEdge 注册）
 *     - source = block.entityA, target = block.entityB（保留原始 name，不替换为 entity.id）
 *     - erCardA = resolveCardinality(block.cardB)（jison cardB 是 A 端基数，交换后 erCardA = A 端基数）
 *     - erCardB = resolveCardinality(block.cardA)（jison cardA 是 B 端基数，交换后 erCardB = B 端基数）
 *     - erIdentification = IDENTIFICATION_TO_ER_IDENTIFICATION[block.relType]
 *     - erRoleA = block.roleA（空字符串视为 undefined）
 *     - edgeStyle: IDENTIFYING → 'line', NON_IDENTIFYING → 'dotted'（对齐老路径 er-parser.ts）
 *     - edgeId 自动生成 `er-edge-${edgeIndex}`
 *   serialize 方向：MermaidEdge → ErRelationshipBlock（含 rawText）
 *     - entityA = edge.source, entityB = edge.target
 *     - cardA = REVERSE_CARDINALITY_MAP[erCardB]（erCardB 是 B 端基数 → jison cardA 右侧）
 *     - cardB = REVERSE_CARDINALITY_MAP[erCardA]（erCardA 是 A 端基数 → jison cardB 左侧）
 *     - relType = REVERSE_IDENTIFICATION_MAP[erIdentification]
 *     - roleA = erRoleA ?? ''
 *     - rawText 由 formatRelationship 生成（如 `CUSTOMER ||--o{ ORDER : places`）
 *
 * 双端对称（架构缺陷修复，对齐 institution.md 第1.6条）：
 *   - MermaidEdgeData 与 ErRelationshipBlock 字段一一对应：erCardA/erCardB/erRoleA/erIdentification
 *   - 无字段折叠（删除旧 cardinality 对象字段），无信息丢失，双向转换完全对称
 *
 * 端点处理（设计点3）：
 *   - edge.source/target 保留原始 name（不替换为 entity.id，对齐 class LOLLIPOP 策略B）
 *   - 端点节点由 ErEntityBlock 或 ErSubgraphOpenBlock 产出，Converter 通过 ctx.registerNode 注册
 *   - 若 relationship 出现在 entity/subgraph 定义之前（前向引用），Converter 通过 ctx.updateNode 创建默认节点
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、../types.js、
 *   ../../parser/er/constants.js、../../serializer/shared/escape-helpers.js，不引用 React/DOM。
 */

import type {
  ERCardinality,
  ERIdentification,
  MermaidEdge,
  MermaidEdgeData,
  MermaidEdgeStyle,
} from '../../types.js';
import type { ErRelationshipBlock } from '../../recognizer/types.js';
import type { ErConverterContext } from './types.js';
import type { IModelBlockConverter } from '../types.js';
import {
  CARDINALITY,
  CARDINALITY_TO_ER_CARDINALITY,
  IDENTIFICATION,
  IDENTIFICATION_TO_ER_IDENTIFICATION,
} from '../../parser/er/constants.js';
import { escapeStringLiteral } from '../../serializer/shared/escape-helpers.js';

// ============================================================
// 映射表常量
// ============================================================

/**
 * CARDINALITY 常量值 → ERCardinality 字面量（parse 方向使用）
 *
 * 复用 constants.ts 已有的 CARDINALITY_TO_ER_CARDINALITY 映射，
 * 包装为类型安全的查询函数。
 */
function resolveCardinality(card: string): ERCardinality {
  const mapped = CARDINALITY_TO_ER_CARDINALITY[card];
  if (mapped === undefined) {
    throw new Error(`Unknown cardinality: ${card}`);
  }
  return mapped as ERCardinality;
}

/**
 * IDENTIFICATION 常量值 → ERIdentification 字面量（parse 方向使用）
 *
 * 复用 constants.ts 已有的 IDENTIFICATION_TO_ER_IDENTIFICATION 映射。
 */
function resolveIdentification(id: string): ERIdentification {
  const mapped = IDENTIFICATION_TO_ER_IDENTIFICATION[id];
  if (mapped === undefined) {
    throw new Error(`Unknown identification: ${id}`);
  }
  return mapped as ERIdentification;
}

/**
 * ERCardinality 字面量 → CARDINALITY 常量值（serialize 方向反向映射）
 *
 * 由 CARDINALITY_TO_ER_CARDINALITY 反转生成。
 */
const REVERSE_CARDINALITY_MAP: Readonly<Record<ERCardinality, string>> = {
  'zero-or-one': CARDINALITY.ZERO_OR_ONE,
  'zero-or-more': CARDINALITY.ZERO_OR_MORE,
  'one-or-more': CARDINALITY.ONE_OR_MORE,
  'only-one': CARDINALITY.ONLY_ONE,
  'md-parent': CARDINALITY.MD_PARENT,
};

/**
 * ERIdentification 字面量 → IDENTIFICATION 常量值（serialize 方向反向映射）
 *
 * 由 IDENTIFICATION_TO_ER_IDENTIFICATION 反转生成。
 */
const REVERSE_IDENTIFICATION_MAP: Readonly<Record<ERIdentification, string>> = {
  identifying: IDENTIFICATION.IDENTIFYING,
  'non-identifying': IDENTIFICATION.NON_IDENTIFYING,
};

// === 基数符号映射表（serialize 方向生成 rawText 使用）===

/**
 * ERCardinality 字面量 → A 端基数符号（线型左侧，source 端）
 *
 * 对齐官方 erDiagram.jison 语法：
 *   - 'zero-or-one':  |o  （A 端零或一）
 *   - 'zero-or-more': }o  （A 端零或多，左侧形式）
 *   - 'one-or-more':  }|  （A 端一或多，左侧形式）
 *   - 'only-one':     ||  （A 端仅一，双向相同）
 *   - 'md-parent':    u   （A 端多对多父节点，仅 source 端有效）
 *
 * 注：jison 解析时 }o/}| 和 o{/|{ 都会被识别为相同基数（双向兼容），
 *     但序列化时 A 端输出左侧形式（}o/}|）以对齐官方示例。
 *     MD_PARENT 输出 'u'（对齐 constants.ts CARDINALITY_TO_SYMBOL）。
 */
const ER_CARDINALITY_TO_SYMBOL_A: Readonly<Record<ERCardinality, string>> = {
  'zero-or-one': '|o',
  'zero-or-more': '}o',
  'one-or-more': '}|',
  'only-one': '||',
  'md-parent': 'u',
};

/**
 * ERCardinality 字面量 → B 端基数符号（线型右侧，target 端）
 *
 * 对齐官方 erDiagram.jison 语法：
 *   - 'zero-or-one':  o|  （B 端零或一）
 *   - 'zero-or-more': o{  （B 端零或多，右侧形式）
 *   - 'one-or-more':  |{  （B 端一或多，右侧形式）
 *   - 'only-one':     ||  （B 端仅一，双向相同）
 *   - 'md-parent':    不允许（jison 语法 u(?=[.\\-|]) 仅在 source 端匹配）
 *
 * 设计偏差修订：原设计文档 ER_CARDINALITY_TO_SYMBOL_B['md-parent'] = '+{' 是错误的，
 *   jison 语法中不存在 '+{' 符号。MD_PARENT 仅 A 端有效，B 端出现时返回空字符串
 *   （serialize 方向调用方应校验 md-parent 不出现在 B 端）。
 */
const ER_CARDINALITY_TO_SYMBOL_B: Readonly<Record<ERCardinality, string>> = {
  'zero-or-one': 'o|',
  'zero-or-more': 'o{',
  'one-or-more': '|{',
  'only-one': '||',
  'md-parent': '', // 不允许，serialize 方向应校验
};

/**
 * ERIdentification 字面量 → 线型符号（serialize 方向使用）
 *
 * 对齐官方 erDiagram.jison 语法：
 *   - 'identifying':     -- （实线，标识关系）
 *   - 'non-identifying': .. （虚线，非标识关系）
 */
const ER_IDENTIFICATION_TO_SYMBOL: Readonly<Record<ERIdentification, string>> = {
  identifying: '--',
  'non-identifying': '..',
};

/** 角色标签中需要用双引号包裹的字符（空格、双引号、花括号、方括号、竖线、冒号） */
const ROLE_SPECIAL_CHARS = /[\s"{}\[\]|:]/;

/**
 * 格式化角色标签（对齐老路径 relationship-serializer.ts formatRole）
 *
 * 规则:
 *   - 包含空格或特殊字符时，用双引号包裹（如 `"subscribed via"`）
 *   - 内部双引号转义为 `\"`
 *   - 简单标识符直接输出（如 `places`）
 */
function formatRole(role: string): string {
  if (ROLE_SPECIAL_CHARS.test(role)) {
    return `"${escapeStringLiteral(role)}"`;
  }
  return role;
}

/**
 * 生成 relationship block 的 rawText（对齐老路径 relationship-serializer.ts 行为）
 *
 * 格式: `SOURCE cardA lineType cardB TARGET : role`
 *   - cardA: A 端基数符号（左侧，如 `||`、`}o`）
 *   - lineType: erIdentification 的符号（`--` 实线 / `..` 虚线）
 *   - cardB: B 端基数符号（右侧，如 `o{`、`|{`）
 *   - role: 角色标签（可选，含空格时用双引号包裹）
 *
 * 示例:
 *   - `CUSTOMER ||--o{ ORDER : places`
 *   - `A |o..o{ B : "relates to"`
 *   - `USER }|--|| PROFILE`（无角色标签）
 */
function formatRelationship(edge: MermaidEdge): string {
  const { source, target, data } = edge;
  const cardA = data.erCardA ?? 'only-one';
  const cardB = data.erCardB ?? 'only-one';
  const identification = data.erIdentification ?? 'identifying';

  const cardASymbol = ER_CARDINALITY_TO_SYMBOL_A[cardA];
  const cardBSymbol = ER_CARDINALITY_TO_SYMBOL_B[cardB];
  const lineSymbol = ER_IDENTIFICATION_TO_SYMBOL[identification];

  // 构建关系符号: `cardA + lineType + cardB`（如 `||--o{`）
  const relationSymbol = `${cardASymbol}${lineSymbol}${cardBSymbol}`;

  // 角色标签（优先 erRoleA，回退 label）
  const role = data.erRoleA ?? data.label;
  const rolePart = role ? ` : ${formatRole(role)}` : '';

  return `${source} ${relationSymbol} ${target}${rolePart}`;
}

// ============================================================
// ErRelationshipConverter 实现
// ============================================================

/**
 * ErRelationshipBlock ↔ MermaidEdge 双向转换器
 *
 * 双端基数完整对称（erCardA/erCardB/erRoleA/erIdentification），
 * 端点保留原始 name（不替换为 entity.id）。
 */
export class ErRelationshipConverter
  implements IModelBlockConverter<ErRelationshipBlock, MermaidEdge, ErConverterContext>
{
  /** parse：ErRelationshipBlock → MermaidEdge，通过 ctx.registerEdge 注册 */
  parseBlock(block: ErRelationshipBlock, context: ErConverterContext): MermaidEdge | null {
    const edgeIndex = context.getEdges().length;
    const edgeId = `er-edge-${edgeIndex}`;

    // CARDINALITY 常量值 → ERCardinality 字面量
    // mermaid jison 语法中 cardA/cardB 语义反直觉（erDiagram.jison relSpec 规则）：
    //   relSpec: cardinality relType cardinality { $$ = { cardA: $3, relType: $2, cardB: $1 } }
    //   - cardA = 右侧 cardinality（靠近 entityB，是 B 端基数）
    //   - cardB = 左侧 cardinality（靠近 entityA，是 A 端基数）
    //   原因：erRenderer.js 中 cardA → marker-end（B 端附近），cardB → marker-start（A 端附近）
    // 交换后使 erCardA 真正表示 A 端基数，erCardB 表示 B 端基数（与字段名语义一致）
    const erCardA = resolveCardinality(block.cardB);
    const erCardB = resolveCardinality(block.cardA);

    // IDENTIFICATION 常量值 → ERIdentification 字面量
    const erIdentification = resolveIdentification(block.relType);

    // edgeStyle: IDENTIFYING → 'line', NON_IDENTIFYING → 'dotted'（对齐老路径 er-parser.ts）
    const edgeStyle: MermaidEdgeStyle =
      block.relType === IDENTIFICATION.IDENTIFYING ? 'line' : 'dotted';

    // erRoleA 空字符串视为 undefined
    const erRoleA: string | undefined = block.roleA !== '' ? block.roleA : undefined;

    // 构建边数据（双端对称字段，与 ErRelationshipBlock 一一对应）
    const data: MermaidEdgeData = {
      edgeStyle,
      ...(erRoleA !== undefined
        ? { label: erRoleA, erRoleA }
        : {}),
      erCardA,
      erCardB,
      erIdentification,
      ...(block.sourceLine !== undefined ? { _sourceLine: block.sourceLine } : {}),
    };

    const edge: MermaidEdge = {
      id: edgeId,
      source: block.entityA,
      target: block.entityB,
      type: 'er-relation',
      data,
    };

    context.registerEdge(edge);
    return edge;
  }

  /** serialize：MermaidEdge → ErRelationshipBlock（含 rawText，对齐设计点1） */
  serializeBlock(model: MermaidEdge, _context: ErConverterContext): ErRelationshipBlock | null {
    // 非关系边返回 null
    if (model.type !== 'er-relation') {
      return null;
    }

    const data = model.data;
    const erCardA = data.erCardA ?? 'only-one';
    const erCardB = data.erCardB ?? 'only-one';
    const erIdentification = data.erIdentification ?? 'identifying';

    // 程序错误校验：md-parent 仅 A 端有效，B 端出现是非法状态
    // jison 语法 u(?=[.\-|]) 仅在 source 端匹配，B 端不会出现 md-parent
    // 违反时抛错暴露上游 bug，禁止用空字符串 fallback 掩盖缺陷（institution.md 第1.7条）
    if (erCardB === 'md-parent') {
      throw new Error(
        `ER relationship serialize error: erCardB cannot be 'md-parent' (only valid on A side). Edge: ${model.source} -> ${model.target}`,
      );
    }

    // 字面量 → 常量值（serialize 方向反向映射）
    // 注意：parse 方向已交换 erCardA/erCardB（erCardA = A 端基数, erCardB = B 端基数），
    // 此处需反向交换还原 jison 语义：
    //   - block.cardA = jison 的 cardA（右侧/B 端基数）= erCardB
    //   - block.cardB = jison 的 cardB（左侧/A 端基数）= erCardA
    const cardA = REVERSE_CARDINALITY_MAP[erCardB];
    const cardB = REVERSE_CARDINALITY_MAP[erCardA];
    const relType = REVERSE_IDENTIFICATION_MAP[erIdentification];

    // erRoleA → roleA（undefined 转为空字符串）
    const roleA = data.erRoleA ?? '';

    // rawText 由 formatRelationship 生成（设计点1：rawText 由 Converter 生成）
    const rawText = formatRelationship(model);

    const block: ErRelationshipBlock = {
      type: 'relationship',
      sourceLine: data._sourceLine,
      rawText,
      indent: 0,
      entityA: model.source,
      roleA,
      entityB: model.target,
      cardA,
      cardB,
      relType,
    };

    return block;
  }
}
