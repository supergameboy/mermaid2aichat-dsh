/**
 * Flowchart AST 类型定义
 *
 * 对齐官方 mermaid v11 `packages/mermaid/src/diagrams/flowchart/types.ts` 的数据结构
 * 仅定义解析器内部使用的 AST 层类型，核心类型（MermaidShapeType/MermaidEdgeStyle 等）
 * 从 `../types.ts` 引用，不重新定义
 *
 * 数据流:
 *   jison parser → FlowDB.addVertex/addLink/... → FlowDB.getData() → FlowchartAST
 *   → flowchart-parser.ts 映射为 CanvasState (GraphCanvasState)
 */

import type {
  FlowchartDirection,
  MermaidShapeType,
} from '../types.js';

// ============================================================
// 顶点（节点）AST
// ============================================================

/**
 * flowchart jison 语法层的顶点类型参数
 * 对齐官方 `FlowVertexTypeParam`，由 jison 语法动作传入 `addVertex(type)`
 *
 * 注意：这是 jison 语法层使用的原始字符串，扩展形状通过 shapeData `@{ shape: xxx }`
 * 元数据设置，此时 type 字段会被覆盖为 MermaidShapeType 中的扩展形状名
 */
export type FlowVertexTypeParam =
  | undefined
  | 'square'
  | 'doublecircle'
  | 'circle'
  | 'ellipse'
  | 'stadium'
  | 'subroutine'
  | 'rect'
  | 'cylinder'
  | 'round'
  | 'diamond'
  | 'hexagon'
  | 'odd'
  | 'trapezoid'
  | 'inv_trapezoid'
  | 'lean_right'
  | 'lean_left';

/**
 * 标签类型（对齐官方 labelType）
 * - text: 普通文本
 * - string: 带引号的字符串
 * - markdown: markdown 字符串（`"..."`）
 */
export type FlowLabelType = 'text' | 'string' | 'markdown';

/**
 * Flowchart 顶点（节点）AST
 * 对齐官方 `FlowVertex`
 */
export interface FlowVertex {
  /** 节点 ID（用户定义或自动生成） */
  id: string;
  /** DOM ID（用于多图共存时的唯一标识） */
  domId: string;
  /** 节点文本 */
  text?: string;
  /** 标签类型 */
  labelType: FlowLabelType;
  /** 形状类型（jison 语法层或 shapeData 扩展） */
  type?: MermaidShapeType | FlowVertexTypeParam;
  /** 应用的 classDef id 列表 */
  classes: string[];
  /** 内联样式（style 语句） */
  styles: string[];
  /** 方向（节点级别） */
  dir?: string;
  /** 节点属性（`[|field:value|]` 语法） */
  props?: Record<string, unknown>;
  /** 是否有回调 */
  haveCallback?: boolean;
  /** href 链接 */
  link?: string;
  /** 链接 target */
  linkTarget?: string;
  /** 图标名称 */
  icon?: string;
  /** 图标形式 */
  form?: 'circle' | 'square' | 'rounded';
  /** 标签位置 */
  pos?: 't' | 'b';
  /** 图片 URL */
  img?: string;
  /** 图片宽度 */
  assetWidth?: number;
  /** 图片高度 */
  assetHeight?: number;
  /** 默认宽度 */
  defaultWidth?: number;
  /** 图片宽高比 */
  imageAspectRatio?: number;
  /** 布局约束 */
  constraint?: 'on' | 'off';
}

// ============================================================
// 边 AST
// ============================================================

/**
 * Flowchart 边 AST
 * 对齐官方 `FlowEdge`
 */
export interface FlowEdge {
  /** 边 ID（用户定义或自动生成） */
  id?: string;
  /** 是否为用户定义 ID */
  isUserDefinedId: boolean;
  /** 起点节点 ID */
  start: string;
  /** 终点节点 ID */
  end: string;
  /** 边类型（arrow_point/arrow_circle/arrow_cross/arrow_open/double_arrow_xxx/INVALID） */
  type?: string;
  /** 线型（normal/thick/dotted/invisible） */
  stroke?: 'normal' | 'thick' | 'dotted' | 'invisible';
  /** 边长度（minlen，1-10） */
  length?: number;
  /** 边文本 */
  text: string;
  /** 标签类型 */
  labelType: FlowLabelType;
  /** 应用的 classDef id 列表 */
  classes: string[];
  /** 内联样式（linkStyle 语句） */
  style?: string[];
  /** 曲线类型 */
  interpolate?: string;
  /** 是否动画 */
  animate?: boolean;
  /** 动画速度 */
  animation?: 'fast' | 'slow';
}

/**
 * Flowchart 边链接信息
 * 对齐官方 `FlowLink`（destructLink 返回值）
 */
export interface FlowLink {
  /** 边类型 */
  type: string;
  /** 线型 */
  stroke: string;
  /** 边长度 */
  length?: number;
  /** 边文本（可选） */
  text?: string;
}

// ============================================================
// classDef / subgraph AST
// ============================================================

/**
 * Flowchart classDef
 * 对齐官方 `FlowClass`
 */
export interface FlowClass {
  /** classDef id */
  id: string;
  /** 样式列表 */
  styles: string[];
  /** 文本样式列表（color 相关） */
  textStyles: string[];
}

/**
 * Flowchart 子图
 * 对齐官方 `FlowSubGraph`
 */
export interface FlowSubGraph {
  /** 子图 ID */
  id: string;
  /** 子图标题 */
  title: string;
  /** 标签类型 */
  labelType: FlowLabelType;
  /** 子图包含的节点 ID 列表 */
  nodes: string[];
  /** 应用的 classDef id 列表 */
  classes: string[];
  /** 子图方向（继承或显式声明） */
  dir?: string;
  /** 是否为用户显式声明的方向 */
  hasExplicitDir: boolean;
}

// ============================================================
// click 事件 AST
// ============================================================

/**
 * Flowchart click 事件
 * 对齐官方 click 语句语义
 */
export interface FlowClickEvent {
  /** 节点 ID */
  nodeId: string;
  /** 回调函数名 */
  functionName?: string;
  /** 回调函数参数 */
  functionArgs?: string;
  /** href 链接 */
  link?: string;
  /** 链接 target */
  linkTarget?: string;
  /** tooltip */
  tooltip?: string;
}

// ============================================================
// FlowchartAST 根节点
// ============================================================

/**
 * Flowchart AST 根节点
 * FlowDB.getData() 返回的完整数据结构
 */
export interface FlowchartAST {
  /** 图表方向 */
  direction: FlowchartDirection | undefined;
  /** 顶点列表 */
  vertices: FlowVertex[];
  /** 边列表 */
  edges: FlowEdge[];
  /** classDef 列表 */
  classes: FlowClass[];
  /** 子图列表 */
  subGraphs: FlowSubGraph[];
  /** click 事件列表 */
  clickEvents: FlowClickEvent[];
  /** tooltip 映射（nodeId → tooltip） */
  tooltips: Map<string, string>;
  /** 无障碍标题 */
  accTitle?: string;
  /** 无障碍描述 */
  accDescription?: string;
  /** 图表标题 */
  title?: string;
  /** 默认边插值算法（linkStyle default interpolate xxx） */
  defaultInterpolate?: string;
  /** 默认边样式（linkStyle default stroke:#f00） */
  defaultStyle?: string[];
}

/**
 * FlowText — jison 语法动作传递的文本对象
 * 对齐官方 `FlowText`
 */
export interface FlowText {
  text: string;
  type: 'text';
}
