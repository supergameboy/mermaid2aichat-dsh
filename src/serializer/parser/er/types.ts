/**
 * ER Diagram 专用 AST 层类型定义
 *
 * 单一职责：定义 ErDB 内部使用的 EntityNode/Attribute/Relationship/RelSpec/EntityClass/ErSubGraph 类型
 * 来源：移植自官方 mermaid packages/mermaid/src/diagrams/er/erTypes.ts
 *
 * 注意：
 * - 核心类型（ERCardinality / ERIdentification / ERAttributeKey / NodeAttribute /
 *   MermaidNodeData / MermaidEdgeData / GraphMetadata）
 *   已在 M0 `packages/serializer/src/types.ts` 中统一定义，本文件不重新定义
 * - 本文件仅定义 er 解析器内部使用的 AST 层数据结构（与官方 erTypes.ts 对齐）
 */

/** ER 实体属性键类型（对齐官方 erTypes.ts，与 M0 ERAttributeKey 一致） */
export type ErAttributeKeyType = 'PK' | 'FK' | 'UK';

/** ER 实体属性（对齐官方 erTypes.ts Attribute） */
export interface Attribute {
  type: string;
  name: string;
  /** 属性键列表（PK/FK/UK） */
  keys: ErAttributeKeyType[];
  /** 属性注释 */
  comment: string;
}

/** ER 实体节点（对齐官方 erTypes.ts EntityNode） */
export interface EntityNode {
  id: string;
  label: string;
  attributes: Attribute[];
  /** 实体别名（如 `CUSTOMER[Customer]` 中的 `Customer`） */
  alias: string;
  /** 形状固定为 erBox */
  shape: 'erBox';
  /** 渲染外观（由渲染层使用，解析层不设置） */
  look?: string;
  /** CSS 类名字符串（空格分隔） */
  cssClasses?: string;
  /** 内联样式列表 */
  cssStyles?: string[];
  /** 编译后的样式列表（由 getCompiledStyles 生成） */
  cssCompiledStyles?: string[];
  /** 标签类型（markdown/string/text） */
  labelType?: string;
  /** 颜色索引（由 getData 生成，用于渲染层着色） */
  colorIndex?: number;
}

/** ER 关系细节（对齐官方 erTypes.ts RelSpec） */
export interface RelSpec {
  /** A 端基数（CARDINALITY 常量值） */
  cardA: string;
  /** B 端基数（CARDINALITY 常量值） */
  cardB: string;
  /** 关系类型（IDENTIFICATION 常量值） */
  relType: string;
}

/** ER 关系（对齐官方 erTypes.ts Relationship） */
export interface Relationship {
  /** A 端实体 ID（或 subgraph ID） */
  entityA: string;
  /** A 端角色（关系标签） */
  roleA: string;
  /** B 端实体 ID（或 subgraph ID） */
  entityB: string;
  /** 关系细节 */
  relSpec: RelSpec;
}

/** ER 样式类（classDef 定义的样式类，对齐官方 erTypes.ts EntityClass） */
export interface EntityClass {
  id: string;
  styles: string[];
  textStyles: string[];
}

/** ER 子图（对齐官方 erTypes.ts ErSubGraph） */
export interface ErSubGraph {
  /** 子图 ID */
  id: string;
  /** 子图标题 */
  title: string;
  /** 子图包含的节点 ID 列表 */
  nodes: string[];
  /** 应用的 CSS 类名列表 */
  classes: string[];
  /** 内联样式列表 */
  cssStyles?: string[];
  /** 子图方向（可选） */
  dir?: string;
  /** 标签类型 */
  labelType: string;
}

/** ER 实体映射类型 */
export type EntityMap = Map<string, EntityNode>;

/** ER 样式类映射类型 */
export type EntityClassMap = Map<string, EntityClass>;

/**
 * jison 语法中 attribute 的输入类型（keys/comment 可选，由 addAttributes 初始化）
 *
 * jison 语法动作传入的 attribute 可能不含 keys/comment 字段，
 * addAttributes 内部规范化为 Attribute（keys/comment 必填）。
 */
export interface InputAttribute {
  type: string;
  name: string;
  keys?: string[];
  comment?: string;
}

/**
 * jison 语法中 subgraph document 的列表项
 *
 * 可能是：
 *   - 字符串（节点 ID，如 "CUSTOMER"）
 *   - 方向对象（如 { stmt: 'dir', value: 'LR' }）
 */
export type SubGraphListItem = string | { stmt: string; value: string };

/** jison 语法中 addSubGraph 的 title 参数类型 */
export interface SubGraphTitle {
  text: string;
  type?: string;
}

/**
 * ErDB yy 适配器契约，作为 ErRecognizerCollector / ErDB 实现的接口。
 *
 * 参考 FlowDBYY / ClassDBYY 模式，jison 通过 yy.xxx 调用这些方法/属性。
 *
 * 10 个 yy 方法（jison grammar 引用）+ 1 个 enterScope 方法（subgraphStart 显式调用）
 * + 3 个公共属性（jison 引用）。
 *
 * jison yy 浅拷贝约束：
 * jison parser 在 parse 开始时浅拷贝 this.yy 到 sharedState.yy（for...in + hasOwnProperty），
 * getter/setter 属性会被调用 getter 读取值后作为普通值属性赋值到 sharedState.yy，accessor 失效。
 * 因此 subgraphDepth 必须是普通数字属性（jison 直接 ++/--），不能通过 getter/setter 拦截触发 enterScope。
 * enterScope 由 er.jison 的 subgraphStart 非终结符显式调用（对齐 flow.jison line 394-396 模式）。
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块1-识别器.md
 */
export interface ErDBYY {
  // 10 个 yy 方法
  addEntity: (name: string, alias?: string) => EntityNode;
  addAttributes: (entityName: string, attribs: InputAttribute[]) => void;
  addRelationship: (entA: string, rolA: string, entB: string, rSpec: RelSpec) => void;
  setDirection: (dir: string) => void;
  addCssStyles: (ids: string[], styles: string[]) => void;
  addClass: (ids: string[], style: string[]) => void;
  setClass: (ids: string[], classNames: string[]) => void;
  addSubGraph: (
    _id: { text: string },
    list: SubGraphListItem[],
    _title: SubGraphTitle,
  ) => string;
  setAccTitle: (title: string) => void;
  setAccDescription: (desc: string) => void;

  // subgraph 嵌套管理（jison subgraphStart 显式调用）
  // ErRecognizerCollector 实现：push 新空 scope 到 pendingStack
  // ErDB 实现：no-op（subgraph 嵌套通过 document list 参数管理，不依赖 scope 栈）
  enterScope: () => void;

  // 3 个公共属性（jison 引用）
  // subgraphDepth：普通数字属性，jison 直接 ++/--，用于 direction 双路径判断
  // （subgraphDepth=0 时 direction 走 yy.setDirection，>0 时作为 list 一部分传给 addSubGraph）
  // 不用于触发 enterScope（由 subgraphStart 显式调用），与 pendingStack 并行维护
  subgraphDepth: number;
  Cardinality: typeof import('./constants.js').CARDINALITY;
  Identification: typeof import('./constants.js').IDENTIFICATION;
}
