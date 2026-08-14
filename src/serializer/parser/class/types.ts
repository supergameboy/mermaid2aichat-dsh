/**
 * Class Diagram 专用 AST 层类型定义
 *
 * 单一职责：定义 ClassDB 内部使用的 ClassNode/ClassRelation/ClassNote/NamespaceNode/Interface/StyleClass 类型
 * 来源：移植自官方 mermaid packages/mermaid/src/diagrams/class/classTypes.ts
 *
 * 注意：
 * - 核心类型（ClassRelationType / ClassLineType / ClassVisibility / ClassClassifier /
 *   ClassNamespaceInfo / ClassNoteInfo / NodeMember / MermaidNodeData / MermaidEdgeData / GraphMetadata）
 *   已在 M0 `packages/serializer/src/types.ts` 中统一定义，本文件不重新定义
 * - 本文件仅定义 class 解析器内部使用的 AST 层数据结构（与官方 classTypes.ts 对齐）
 * - ClassMember 类定义在 class-member.ts，本文件仅 import 引用
 */

import type { ClassMember } from './class-member.js';
import type { Visibility } from './constants.js';

/** Class 类节点（对齐官方 classTypes.ts ClassNode） */
export interface ClassNode {
  id: string;
  /** 泛型类型（如 `List~Item~` 中的 `Item`） */
  type: string;
  label: string;
  /** 形状固定为 classBox */
  shape: 'classBox';
  /** 显示文本（含泛型 HTML 转义） */
  text: string;
  /** CSS 类名字符串（空格分隔） */
  cssClasses: string;
  /** 方法列表 */
  methods: ClassMember[];
  /** 属性列表 */
  members: ClassMember[];
  /** 注解列表（如 `<<interface>>`） */
  annotations: string[];
  /** DOM ID（用于渲染层） */
  domId: string;
  /** 内联样式列表 */
  styles: string[];
  /** 父命名空间 ID（namespace 嵌套） */
  parent?: string;
  /** 链接 URL */
  link?: string;
  /** 链接打开目标（_self/_blank/_parent/_top） */
  linkTarget?: string;
  /** 是否有回调函数 */
  haveCallback?: boolean;
  /** tooltip 文本 */
  tooltip?: string;
  /** 渲染外观（由渲染层使用，解析层不设置） */
  look?: string;
}

/** Class 关系（对齐官方 classTypes.ts ClassRelation） */
export interface ClassRelation {
  /** 起始类 ID */
  id1: string;
  /** 目标类 ID */
  id2: string;
  /** 起始端关系标题（基数，如 "1"） */
  relationTitle1: string;
  /** 目标端关系标题（基数，如 "0..*"） */
  relationTitle2: string;
  /** 关系类型字符串（兼容官方 type 字段，通常为空） */
  type: string;
  /**
   * 关系标签（如 `: places` 中的 `places`）
   *
   * jison grammar 行为：
   *   - case 19（无标签关系 `A <|-- B`）：title 字段未初始化，值为 undefined
   *   - case 20（有标签关系 `A <|-- B : label`）：jison 在 addRelation 前调用
   *     `yy.cleanupLabel(labelToken)` 处理标签 token 后赋值，title 为非空字符串
   *
   * 因此 title 类型为 string | undefined，反映 jison 实际产出。
   */
  title: string | undefined;
  /** 显示文本（兼容官方 text 字段） */
  text: string;
  /** 内联样式列表 */
  style: string[];
  /** 关系细节（type1/type2 为 relationType 数值，lineType 为 LINE_TYPE 数值） */
  relation: {
    /** 起始端关系类型（RELATION_TYPE 数值，'none' 表示无） */
    type1: number | 'none';
    /** 目标端关系类型（RELATION_TYPE 数值，'none' 表示无） */
    type2: number | 'none';
    /** 线型（LINE_TYPE 数值） */
    lineType: number;
  };
}

/** Class 注释（对齐官方 classTypes.ts ClassNote） */
export interface ClassNote {
  id: string;
  /** 关联的类 ID */
  class: string;
  /** 注释文本 */
  text: string;
  /** 注释索引（用于生成 id） */
  index: number;
  /** 父命名空间 ID */
  parent?: string;
}

/** Class 接口（lollipop 关系自动生成的接口节点） */
export interface Interface {
  id: string;
  label: string;
  classId: string;
}

/** Class 命名空间节点（对齐官方 classTypes.ts NamespaceNode） */
export interface NamespaceNode {
  id: string;
  label: string;
  domId: string;
  /** 命名空间内的类 */
  classes: ClassMap;
  /** 命名空间内的注释 */
  notes: ClassNoteMap;
  /** 子命名空间 */
  children: NamespaceMap;
  /** 父命名空间 ID */
  parent?: string;
  /**
   * 是否为用户显式声明的命名空间（如 `namespace A.B { ... }`）
   * false 表示解析点分名称时自动创建的中间祖先
   * 用于 compact 渲染模式仅输出显式声明的命名空间
   */
  explicit: boolean;
}

/** Class 样式类（classDef 定义的样式类） */
export interface StyleClass {
  id: string;
  styles: string[];
  textStyles: string[];
}

/** Class 映射类型 */
export type ClassMap = Map<string, ClassNode>;
export type ClassNoteMap = Map<string, ClassNote>;
export type NamespaceMap = Map<string, NamespaceNode>;

/** jison parser 调用的 yy 对象接口（用于类型约束） */
export interface ClassDBYY {
  addRelation: (relation: ClassRelation) => void;
  addClassesToNamespace: (id: string, classNames: string[], noteNames: string[]) => void;
  addNamespace: (id: string, label?: string) => string;
  popNamespace: () => void;
  setCssClass: (ids: string, className: string) => void;
  addMembers: (className: string, members: string[]) => void;
  addClass: (id: string) => void;
  setClassLabel: (id: string, label: string) => void;
  addAnnotation: (className: string, annotation: string) => void;
  addMember: (className: string, member: string) => void;
  cleanupLabel: (label: string) => string;
  addNote: (text: string, className?: string) => string;
  defineClass: (ids: string[], style: string[]) => void;
  setDirection: (dir: string) => void;
  setLink: (ids: string, linkStr: string, target?: string) => void;
  setTooltip: (ids: string, tooltip?: string) => void;
  setClickEvent: (ids: string, functionName: string, functionArgs?: string) => void;
  setCssStyle: (id: string, styles: string[]) => void;
  setAccTitle: (title: string) => void;
  setAccDescription: (desc: string) => void;
  relationType: typeof import('./constants.js').RELATION_TYPE;
  lineType: typeof import('./constants.js').LINE_TYPE;
}

/** Visibility 类型重导出（便于其他模块引用） */
export type { Visibility } from './constants.js';
