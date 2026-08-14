/**
 * 节点模板注册表 — 可复用节点库的统一描述层
 *
 * 单一职责：定义 NodeTemplate 类型和所有内置模板数据，提供注册表查询函数
 *
 * 数据流:
 *   DiagramType → getTemplatesForDiagramType → NodeTemplate[]（按 order 排序）
 *   MermaidShapeType + DiagramType → getTemplate → NodeTemplate | undefined
 *
 * 节点库（node-library.tsx）从模板注册表读取列表渲染，不再硬编码形状数据
 */

import type { MermaidShapeType, DiagramType } from '@mermaid2aichat/serializer';

// ============================================================
// 类型
// ============================================================

/**
 * 节点模板 — 描述节点库中一个可复用节点类型
 *
 * 一个模板可被多个 diagramType 共用；同一 shape 在不同 diagramType 下
 * 可对应不同的显示标签和排序。
 */
export interface NodeTemplate {
  /** 模板唯一标识，对应 MermaidShapeType 或各图类型的节点类型 */
  type: MermaidShapeType;

  /** 节点库中显示的名称 */
  label: string;

  /**
   * 排序权重，越小越靠前。
   * 用于控制节点库中模板的前后顺序，常用形状放前面。
   */
  order: number;

  /** 该模板适用的图类型列表 */
  diagramTypes: DiagramType[];

  /**
   * 默认尺寸（可选）。
   * 若提供，点击添加时先用此尺寸计算 viewport 中心落点；
   * 若未提供，使用 computeNodeDimensions(type, defaultLabel) 动态计算。
   */
  defaultSize?: { width: number; height: number };

  /**
   * 图标渲染模式（预留扩展）。
   * - 'shape-preview': 使用 ShapePreview 渲染真实形状 SVG（当前唯一实现）
   */
  iconMode: 'shape-preview';
}

// ============================================================
// 内置模板数据
// ============================================================

export const NODE_TEMPLATES: readonly NodeTemplate[] = [
  // === flowchart jison 语法形状（16 种）===
  { type: 'rect', label: '矩形', order: 10, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'rounded', label: '圆角', order: 20, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'stadium', label: '体育场', order: 30, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'ellipse', label: '椭圆', order: 40, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'subroutine', label: '子程序', order: 50, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'cylinder', label: '圆柱', order: 60, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'circle', label: '圆形', order: 70, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'doublecircle', label: '双圆', order: 80, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'diamond', label: '菱形', order: 90, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'hexagon', label: '六边形', order: 100, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'odd', label: '奇形', order: 110, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'trapezoid', label: '梯形', order: 120, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'trapezoid-reverse', label: '倒梯形', order: 130, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'lean-right', label: '右倾斜', order: 140, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'lean-left', label: '左倾斜', order: 150, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'rect-with-prop', label: '带属性矩形', order: 155, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },

  // === flowchart 扩展形状 ===
  { type: 'document', label: '文档', order: 160, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'note', label: '便签', order: 170, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'triangle', label: '三角形', order: 180, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'card', label: '卡片', order: 190, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },
  { type: 'text', label: '文本', order: 200, diagramTypes: ['flowchart'], iconMode: 'shape-preview' },

  // === sequenceDiagram ===
  { type: 'seq-participant', label: '参与者', order: 10, diagramTypes: ['sequenceDiagram'], iconMode: 'shape-preview' },
  { type: 'seq-actor', label: 'Actor', order: 20, diagramTypes: ['sequenceDiagram'], iconMode: 'shape-preview' },

  // === classDiagram ===
  { type: 'class-box', label: '类', order: 10, diagramTypes: ['classDiagram'], iconMode: 'shape-preview' },
  { type: 'class-note', label: '注释', order: 20, diagramTypes: ['classDiagram'], iconMode: 'shape-preview' },
  { type: 'class-namespace', label: '命名空间', order: 30, diagramTypes: ['classDiagram'], iconMode: 'shape-preview' },

  // === erDiagram ===
  { type: 'er-box', label: '实体', order: 10, diagramTypes: ['erDiagram'], iconMode: 'shape-preview' },
  { type: 'er-subgraph', label: '子图', order: 20, diagramTypes: ['erDiagram'], iconMode: 'shape-preview' },
];

// ============================================================
// 注册表查询函数
// ============================================================

/**
 * 获取指定图类型可用的模板列表，已按 order 升序排序
 */
export function getTemplatesForDiagramType(
  diagramType: DiagramType,
): NodeTemplate[] {
  return NODE_TEMPLATES
    .filter((t) => t.diagramTypes.includes(diagramType))
    .sort((a, b) => a.order - b.order);
}

/**
 * 获取指定图类型下的单个模板
 */
export function getTemplate(
  type: MermaidShapeType,
  diagramType: DiagramType,
): NodeTemplate | undefined {
  return NODE_TEMPLATES.find(
    (t) => t.type === type && t.diagramTypes.includes(diagramType),
  );
}

/**
 * 判断某 shape 在指定图类型下是否有对应模板
 */
export function isTemplateSupported(
  type: MermaidShapeType,
  diagramType: DiagramType,
): boolean {
  return NODE_TEMPLATES.some(
    (t) => t.type === type && t.diagramTypes.includes(diagramType),
  );
}
