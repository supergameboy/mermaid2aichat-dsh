/**
 * 顶点序列化器 — MermaidNode → Mermaid 顶点代码
 *
 * 单一职责：将 MermaidNode 的形状、标签、shapeData 序列化为 Mermaid 语法
 *
 * 形状语法映射（对齐 flow.jison vertex 规则）:
 *   rect              → id[label]
 *   rounded           → id(label)
 *   stadium           → id([label])
 *   ellipse           → id(-label-)
 *   subroutine        → id[[label]]
 *   cylinder          → id[(label)]
 *   circle            → id((label))
 *   doublecircle      → id(((label)))
 *   diamond           → id{label}
 *   hexagon           → id{{label}}
 *   odd               → id>label]
 *   trapezoid         → id[/label\]
 *   trapezoid-reverse → id[\label/]
 *   lean-right        → id[/label/]
 *   lean-left         → id[\label\]
 *   rect-with-prop    → id[|field:value|label]
 *   其他扩展形状      → id@{ shape: xxx, label: "..." }
 *
 * labelType 引号语法（对齐 flow.jison textObj 规则）:
 *   text     → label（escapeLabel 转义特殊字符）
 *   string   → "label"（escapeStringLiteral 转义引号和反斜杠）
 *   markdown → ~label~（不转义，markdown 原样输出）
 */

import type { MermaidNode, MermaidShapeType, MermaidNodeData } from '../../types.js';
import { escapeLabel, escapeStringLiteral } from '../shared/escape-helpers.js';

// ============================================================
// 常量
// ============================================================

/** jison 语法层支持的 16 种标准形状（不需要 shapeData） */
const JISON_SYNTAX_SHAPES: ReadonlySet<MermaidShapeType> = new Set<MermaidShapeType>([
  'rect',
  'rounded',
  'stadium',
  'ellipse',
  'subroutine',
  'cylinder',
  'circle',
  'doublecircle',
  'diamond',
  'hexagon',
  'odd',
  'trapezoid',
  'trapezoid-reverse',
  'lean-right',
  'lean-left',
  'rect-with-prop',
]);

// ============================================================
// 标签转义
// ============================================================

/**
 * 根据 labelType 选择转义函数并包裹标签
 *
 * @param label - 原始标签文本
 * @param labelType - 标签类型（text/string/markdown）
 * @returns 转义并包裹后的标签
 */
function formatLabel(label: string, labelType: string | undefined): string {
  switch (labelType) {
    case 'string':
      // 字符串字面量：用双引号包裹，转义引号和反斜杠
      return `"${escapeStringLiteral(label)}"`;
    case 'markdown':
      // markdown 文本：用 ~ 包裹，不转义
      return `~${label}~`;
    case 'text':
    default:
      // 普通文本：escapeLabel 转义特殊字符
      return escapeLabel(label);
  }
}

// ============================================================
// 形状语法生成
// ============================================================

/**
 * 生成带标签的形状语法
 * @param id - 节点 ID
 * @param label - 已转义的标签
 * @param shape - 形状类型
 * @returns Mermaid 顶点代码（如 `A[Hello]`）
 */
function formatShape(id: string, label: string, shape: MermaidShapeType): string {
  switch (shape) {
    case 'rect':
      return `${id}[${label}]`;
    case 'rounded':
      return `${id}(${label})`;
    case 'stadium':
      return `${id}([${label}])`;
    case 'ellipse':
      return `${id}(-${label}-)`;
    case 'subroutine':
      return `${id}[[${label}]]`;
    case 'cylinder':
      return `${id}[(${label})]`;
    case 'circle':
      return `${id}((${label}))`;
    case 'doublecircle':
      return `${id}(((${label})))`;
    case 'diamond':
      return `${id}{${label}}`;
    case 'hexagon':
      return `${id}{{${label}}}`;
    case 'odd':
      return `${id}>${label}]`;
    case 'trapezoid':
      return `${id}[/${label}\\]`;
    case 'trapezoid-reverse':
      return `${id}[\\${label}/]`;
    case 'lean-right':
      return `${id}[/${label}/]`;
    case 'lean-left':
      return `${id}[\\${label}\\]`;
    default:
      // 不应该到达这里，扩展形状应通过 formatShapeData 处理
      return `${id}[${label}]`;
  }
}

/**
 * 生成带属性的矩形语法
 * 对齐 jison: `id[|field:value|label]`
 */
function formatRectWithProps(
  id: string,
  label: string,
  props: Record<string, unknown>,
): string {
  const propsStr = Object.entries(props)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|');
  return `${id}[|${propsStr}|${label}]`;
}

/**
 * 生成 shapeData 扩展形状语法
 * 对齐 jison: `id@{ shape: xxx, label: "...", ... }`
 */
function formatShapeData(id: string, data: MermaidNodeData): string {
  const entries: string[] = [`shape: ${data.shape}`];

  // label（如果有）— 使用 escapeStringLiteral 转义双引号
  if (data.label !== undefined && data.label !== '') {
    const escapedLabel = escapeStringLiteral(data.label);
    entries.push(`label: "${escapedLabel}"`);
  }

  // icon
  const icon = data.icon;
  if (icon) {
    entries.push(`icon: "${icon}"`);
  }

  // form
  const form = data.form;
  if (form) {
    entries.push(`form: ${form}`);
  }

  // pos
  const pos = data.pos;
  if (pos) {
    entries.push(`pos: ${pos}`);
  }

  // img
  const img = data.img;
  if (img) {
    entries.push(`img: "${img}"`);
  }

  // assetWidth / assetHeight
  const assetWidth = data.assetWidth;
  if (assetWidth !== undefined) {
    entries.push(`w: ${assetWidth}`);
  }
  const assetHeight = data.assetHeight;
  if (assetHeight !== undefined) {
    entries.push(`h: ${assetHeight}`);
  }

  // constraint
  const constraint = data.constraint;
  if (constraint) {
    entries.push(`constraint: ${constraint}`);
  }

  return `${id}@{ ${entries.join(', ')} }`;
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 序列化单个顶点为 Mermaid 代码
 *
 * @param node - MermaidNode
 * @returns Mermaid 顶点代码行（如 `A[Hello]` 或 `A@{ shape: docs, label: "Documents" }`）
 */
export function serializeVertex(node: MermaidNode): string {
  const { id, data } = node;
  const labelType = data.labelType;
  const formattedLabel = formatLabel(data.label ?? id, labelType);

  // 带属性的矩形
  const props = data.props;
  if (props && Object.keys(props).length > 0) {
    return formatRectWithProps(id, formattedLabel, props);
  }

  // jison 语法层标准形状
  // shape 可选（根因2修复）：边规则引用的节点可能从未定义 shape，序列化时用默认 'rect'
  const shape = data.shape ?? 'rect';
  if (JISON_SYNTAX_SHAPES.has(shape)) {
    return formatShape(id, formattedLabel, shape);
  }

  // 扩展形状（shapeData 语法）
  return formatShapeData(id, data);
}

/**
 * 序列化顶点的 classDef 应用（`:::className` 后缀）
 * 对齐 jison: `vertex STYLE_SEPARATOR idString`
 *
 * @param node - MermaidNode
 * @returns `:::className` 或空字符串
 */
export function serializeVertexClassSuffix(node: MermaidNode): string {
  const classNames = node.data.classNames;
  if (!classNames || classNames.length === 0) {
    return '';
  }
  return `:::${classNames.join(',')}`;
}
