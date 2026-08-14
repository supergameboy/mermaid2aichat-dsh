/**
 * ER Diagram 常量定义
 *
 * 单一职责：定义 CARDINALITY / IDENTIFICATION 常量及其到 M0 类型的映射
 * 这些常量值必须与 jison 语法中引用的 yy.Cardinality / yy.Identification 完全一致
 *
 * 来源：对齐官方 mermaid packages/mermaid/src/diagrams/er/erDb.ts 的 Cardinality/Identification
 */

/** ER 基数常量（jison 通过 yy.Cardinality 访问）
 *
 * 数值含义（与官方 erDiagram.jison 一致）：
 *   - ZERO_OR_ONE:   |o / o|  零或一
 *   - ZERO_OR_MORE:  o{ / }o  零或多（o{ 为右侧形式，}o 为左侧形式）
 *   - ONE_OR_MORE:   |{ / }|  一或多（|{ 为右侧形式，}| 为左侧形式）
 *   - ONLY_ONE:      ||       仅一
 *   - MD_PARENT:     u        多对多父节点（仅 source 端，后跟 -/.//|）
 *
 * 注意：
 *   - jison 语法层使用大写形式字符串，M0 ERCardinality 使用小写连字符形式
 *   - jison 中 }o 和 o{ 都解析为 ZERO_OR_MORE（左侧/右侧形式差异）
 *   - jison 中 u 仅在后跟 -/.//| 时解析为 MD_PARENT（仅 source 端有效）
 */
export const CARDINALITY = {
  ZERO_OR_ONE: 'ZERO_OR_ONE',
  ZERO_OR_MORE: 'ZERO_OR_MORE',
  ONE_OR_MORE: 'ONE_OR_MORE',
  ONLY_ONE: 'ONLY_ONE',
  MD_PARENT: 'MD_PARENT',
} as const;

/** ER 关系类型常量（jison 通过 yy.Identification 访问）
 *
 * 数值含义（与官方 erDb.ts 一致）：
 *   - IDENTIFYING:     --  实线（标识关系）
 *   - NON_IDENTIFYING: ..  虚线（非标识关系）
 */
export const IDENTIFICATION = {
  IDENTIFYING: 'IDENTIFYING',
  NON_IDENTIFYING: 'NON_IDENTIFYING',
} as const;

/** 基数到符号的映射（用于序列化时输出 jison 语法符号）
 *
 * 注意：序列化输出右侧形式符号（o{/|{），jison 解析时 }o/}| 也会被识别为相同基数。
 * MD_PARENT 输出 'u'，仅在 source 端（cardinality.from）有效。
 */
export const CARDINALITY_TO_SYMBOL: Readonly<Record<string, string>> = {
  [CARDINALITY.ZERO_OR_ONE]: '|o',
  [CARDINALITY.ZERO_OR_MORE]: 'o{',
  [CARDINALITY.ONE_OR_MORE]: '|{',
  [CARDINALITY.ONLY_ONE]: '||',
  [CARDINALITY.MD_PARENT]: 'u',
};

/** 关系类型到符号的映射（用于序列化时输出 jison 语法符号） */
export const IDENTIFICATION_TO_SYMBOL: Readonly<Record<string, string>> = {
  [IDENTIFICATION.IDENTIFYING]: '--',
  [IDENTIFICATION.NON_IDENTIFYING]: '..',
};

/** CARDINALITY → ERCardinality 映射（jison 大写形式 → M0 小写连字符形式） */
export const CARDINALITY_TO_ER_CARDINALITY: Readonly<Record<string, string>> = {
  [CARDINALITY.ZERO_OR_ONE]: 'zero-or-one',
  [CARDINALITY.ZERO_OR_MORE]: 'zero-or-more',
  [CARDINALITY.ONE_OR_MORE]: 'one-or-more',
  [CARDINALITY.ONLY_ONE]: 'only-one',
  [CARDINALITY.MD_PARENT]: 'md-parent',
};

/** IDENTIFICATION → ERIdentification 映射（jison 大写形式 → M0 小写连字符形式） */
export const IDENTIFICATION_TO_ER_IDENTIFICATION: Readonly<Record<string, string>> = {
  [IDENTIFICATION.IDENTIFYING]: 'identifying',
  [IDENTIFICATION.NON_IDENTIFYING]: 'non-identifying',
};

/**
 * 将 jison 基数常量值映射为 M0 ERCardinality
 *
 * @param card - jison 语法层使用的基数常量值（如 'ZERO_OR_ONE'）
 * @returns M0 ERCardinality 字符串（如 'zero-or-one'）
 */
export function resolveCardinality(card: string): string {
  const mapped = CARDINALITY_TO_ER_CARDINALITY[card];
  if (!mapped) {
    throw new Error(`Unknown cardinality: ${card}`);
  }
  return mapped;
}

/**
 * 将 jison 关系类型常量值映射为 M0 ERIdentification
 *
 * @param identification - jison 语法层使用的关系类型常量值（如 'IDENTIFYING'）
 * @returns M0 ERIdentification 字符串（如 'identifying'）
 */
export function resolveIdentification(identification: string): string {
  const mapped = IDENTIFICATION_TO_ER_IDENTIFICATION[identification];
  if (!mapped) {
    throw new Error(`Unknown identification: ${identification}`);
  }
  return mapped;
}
