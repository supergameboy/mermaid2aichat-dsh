/**
 * 完整类型系统 — 对齐官方 mermaid v11 标准
 * 单一数据源：所有包通过 import 引用，禁止重新定义
 */

import type { FlowLabelType, FlowClickEvent, FlowSubGraph } from './ast/flowchart-ast.js';
import type { StyleClass } from './parser/class/types.js';

// ============================================================
// 1. 节点形状类型（对齐官方 shapes.ts，70+ 种）
// ============================================================

/**
 * Mermaid 节点形状类型
 * - flowchart 标准形状（16 种 jison 语法）
 * - flowchart 扩展形状（通过 @{shape: xxx} 元数据）
 * - 各图表类型专用形状
 */
export type MermaidShapeType =
  // === flowchart jison 语法形状（16 种）===
  | 'rect'                    // id[文本] 标准矩形
  | 'rounded'                 // id(文本) 圆角矩形
  | 'stadium'                 // id([文本]) 体育场形
  | 'ellipse'                 // id(-文本-) 椭圆
  | 'subroutine'              // id[[文本]] 子程序
  | 'cylinder'                // id[(文本)] 圆柱体
  | 'circle'                  // id((文本)) 圆形
  | 'doublecircle'            // id(((文本))) 双圆
  | 'diamond'                 // id{文本} 菱形
  | 'hexagon'                 // id{{文本}} 六边形
  | 'odd'                     // id>文本] 奇形
  | 'trapezoid'               // id[/文本/] 梯形
  | 'trapezoid-reverse'       // id[\文本\] 倒梯形
  | 'lean-right'              // id[/文本\] 右倾斜
  | 'lean-left'               // id[\文本/] 左倾斜
  | 'rect-with-prop'          // id[|field:value|文本] 带属性矩形
  // === flowchart 扩展形状（shapeData，31 种常用）===
  | 'datastore'               // 数据存储
  | 'document'                // 文档
  | 'note'                    // 便签
  | 'triangle'                // 三角形
  | 'fork-join'               // Fork/Join
  | 'hourglass'               // 沙漏
  | 'lightning-bolt'          // 闪电
  | 'cloud'                   // 云形
  | 'bang'                    // 爆炸形
  | 'text'                    // 文本块
  | 'card'                    // 卡片
  | 'lined-rectangle'         // 带线矩形
  | 'small-circle'            // 小起点圆
  | 'framed-circle'           // 带框圆（停止点）
  | 'brace-left'              // 左花括号
  | 'brace-right'             // 右花括号
  | 'braces'                  // 双花括号
  | 'delay'                   // 延迟（半圆角矩形）
  | 'horizontal-cylinder'     // 水平圆柱
  | 'lined-cylinder'          // 带线圆柱（磁盘）
  | 'curved-trapezoid'        // 曲边梯形（显示器）
  | 'divided-rectangle'       // 分割矩形
  | 'window-pane'             // 窗格（内部存储）
  | 'filled-circle'           // 实心圆（连接点）
  | 'notched-pentagon'        // 凹五边形（循环限制）
  | 'flipped-triangle'        // 倒三角
  | 'sloped-rectangle'        // 斜矩形（手动输入）
  | 'stacked-document'        // 堆叠文档
  | 'stacked-rectangle'       // 堆叠矩形
  | 'bow-tie-rectangle'       // 蝴蝶结矩形
  | 'crossed-circle'          // 交叉圆
  | 'tagged-document'         // 标签文档
  | 'tagged-rectangle'        // 标签矩形
  | 'flag'                    // 旗帜（纸带）
  | 'lined-document'          // 带线文档
  // === state 专用形状（8 种）===
  | 'state-default'           // 默认状态
  | 'state-with-desc'         // 带描述状态
  | 'state-start'             // 起始状态（小圆）
  | 'state-end'               // 结束状态（带框圆）
  | 'state-divider'           // 分隔线
  | 'state-group'             // 状态组
  | 'state-note'              // 便签
  | 'state-note-group'        // 便签组
  // === class/er 专用形状（5 种）===
  | 'class-box'               // 类图盒子
  | 'class-note'              // 类图注释（折角矩形，接入 ShapeGeometry）
  | 'class-namespace'         // 类图命名空间（容器，复合结构不接入 ShapeGeometry，仅 MermaidShapeType 合法化）
  | 'er-box'                  // ER 图盒子
  | 'er-subgraph'             // ER 图子图（容器，复合结构不接入 ShapeGeometry，仅 MermaidShapeType 合法化）
  // === mindmap 专用形状（7 种）===
  | 'mindmap-default'         // 默认（无边界）
  | 'mindmap-rounded'         // 圆角矩形
  | 'mindmap-rect'            // 矩形
  | 'mindmap-circle'          // 圆形
  | 'mindmap-cloud'           // 云形
  | 'mindmap-bang'            // 爆炸形
  | 'mindmap-hexagon'         // 六边形
  // === architecture 专用形状（3 种）===
  | 'arch-service'            // 架构服务
  | 'arch-junction'           // 架构连接点
  | 'arch-group'              // 架构分组
  // === sequence 专用形状（2 种）===
  | 'seq-participant'         // 参与者
  | 'seq-actor'               // 演员
  // === 内部未文档化形状（按需扩展）===
  | 'composite'               // 复合形状
  | 'label-rect'              // 标签矩形
  | 'block-arrow'             // 块箭头
  | 'icon-square'             // 方形图标
  | 'icon-circle'             // 圆形图标
  | 'icon'                    // 图标
  | 'icon-rounded'            // 圆角图标
  | 'image-square'            // 方形图片
  | 'anchor'                  // 锚点
  | 'kanban-item'             // 看板项
  | 'requirement-box';        // 需求图盒子

// ============================================================
// 2. 边样式类型（对齐官方 flow.jison，16 种）
// ============================================================

/**
 * Mermaid 边样式
 * 线型（4 种）× 箭头头类型（4 种）的组合 + 双端箭头 + 不可见线
 */
export type MermaidEdgeStyle =
  // === 单端箭头（线型 × 箭头头）===
  | 'line'              // --- 普通实线无箭头
  | 'arrow'             // --> 实线带箭头
  | 'cross'             // --x 实线带十字
  | 'circle'            // --o 实线带圆圈
  | 'thick-line'        // === 粗实线无箭头
  | 'thick-arrow'       // ==> 粗实线带箭头
  | 'thick-cross'       // ==x 粗实线带十字
  | 'thick-circle'      // ==o 粗实线带圆圈
  | 'dotted'            // -.- 点线无箭头
  | 'dotted-arrow'      // -.-> 点线带箭头
  | 'dotted-cross'      // -.x 点线带十字
  | 'dotted-circle'     // -.o 点线带圆圈
  // === 双端箭头 ===
  | 'bidirectional-arrow'   // <--> 双向箭头
  | 'bidirectional-cross'   // x--x 双向十字
  | 'bidirectional-circle'  // o--o 双向圆圈
  // === 特殊 ===
  | 'invisible';            // ~~~ 不可见线（仅布局占位）

// ============================================================
// 3. Sequence 箭头类型（对齐官方 sequenceDiagram.jison，26+ 种）
// ============================================================

/**
 * Sequence Diagram 箭头类型
 * 线型（solid/dashed）× 箭头头类型（filled/open/cross/point/async）的组合
 */
export type SequenceArrowType =
  // === 基本箭头（8 种）===
  | 'solid-arrow'           // ->> 实线实心三角
  | 'dotted-arrow'          // -->> 点线实心三角
  | 'solid-open'            // -> 实线开放
  | 'dotted-open'           // --> 点线开放
  | 'solid-cross'           // -x 实线十字
  | 'dotted-cross'          // --x 点线十字
  | 'solid-point'           // -) 实线圆点
  | 'dotted-point'          // --) 点线圆点
  // === 双向箭头（2 种）===
  | 'bidirectional-solid'   // <<->> 双向实线实心
  | 'bidirectional-dotted'  // <<-->> 双向点线实心
  // === 异步箭头实线（4 种）===
  | 'solid-top'             // -|\ 实线顶部
  | 'solid-bottom'          // -|/ 实线底部
  | 'stick-top'             // -\\ 实线顶部细线
  | 'stick-bottom'          // -/\ 实线底部细线
  // === 异步箭头点线（4 种）===
  | 'solid-top-dotted'      // --|\ 点线顶部
  | 'solid-bottom-dotted'   // --|/ 点线底部
  | 'stick-top-dotted'      // --\\ 点线顶部细线
  | 'stick-bottom-dotted'   // --/\ 点线底部细线
  // === 反向异步箭头实线（4 种）===
  | 'solid-arrow-top-reverse'    // /|- 反向顶部实心
  | 'solid-arrow-bottom-reverse' // \|- 反向底部实心
  | 'stick-arrow-top-reverse'    // /\- 反向顶部细线
  | 'stick-arrow-bottom-reverse' // \\- 反向底部细线
  // === 反向异步箭头点线（4 种）===
  | 'solid-arrow-top-reverse-dotted'    // /|-- 反向顶部实心点线
  | 'solid-arrow-bottom-reverse-dotted' // \|-- 反向底部实心点线
  | 'stick-arrow-top-reverse-dotted'    // /\-- 反向顶部细线点线
  | 'stick-arrow-bottom-reverse-dotted' // \\-- 反向底部细线点线
  // === 中心连接（3 种）===
  | 'central-connection'          // 中心连接
  | 'central-connection-reverse'  // 中心反向连接
  | 'central-connection-dual';    // 中心双向连接

// ============================================================
// 4. Sequence 块类型（alt/opt/loop 等）
// ============================================================

/**
 * Sequence 块类型（B4.1 修复：移除 'autonumber'）
 *
 * autonumber 是 metadata 级开关（SequenceCanvasState.autonumber），不是块类型。
 * 8 种块类型对应 mermaid sequence 语法：alt/opt/loop/par/par-over/critical/break/rect
 */
export type SequenceBlockType =
  | 'alt'
  | 'opt'
  | 'loop'
  | 'par'
  | 'par-over'
  | 'critical'
  | 'break'
  | 'rect';

// ============================================================
// 5. Class Diagram 关系类型（对齐官方 classDiagram.jison）
// ============================================================

/**
 * Class Diagram 关系类型
 */
export type ClassRelationType =
  | 'aggregation'    // o-- 空心菱形（聚合）
  | 'extension'      // <|-- 空心三角箭头（继承）
  | 'composition'    // *-- 实心菱形（组合）
  | 'association'    // --> 开放箭头（关联）
  | 'dependency'     // <.. 开放箭头虚线（依赖）
  | 'realization'    // <|.. 空心三角箭头虚线（实现）
  | 'lollipop';      // --o 棒棒糖（接口实现）

/** Class Diagram 线型 */
export type ClassLineType = 'line' | 'dotted';

/** Class Diagram 成员可见性 */
export type ClassVisibility = '+' | '-' | '#' | '~' | '';

/** Class Diagram 成员分类符 */
export type ClassClassifier = '*' | '$' | '';

/** Class Diagram 构造型（从 annotation 推断，如 `<<interface>>`） */
export type ClassStereotype =
  | 'interface' | 'abstract' | 'annotation' | 'enum'
  | 'protocol' | 'exception' | 'metaclass' | 'stereotype';

// ============================================================
// 6. ER Diagram 基数类型（对齐官方 erDiagram.jison）
// ============================================================

/**
 * ER Diagram 基数类型
 *
 * 符号说明（对齐官方 erDiagram.jison 语法）:
 *   - ZERO_OR_ONE:   |o / o|  零或一
 *   - ZERO_OR_MORE:  o{ / }o  零或多（o{ 为右侧形式，}o 为左侧形式）
 *   - ONE_OR_MORE:   |{ / }|  一或多（|{ 为右侧形式，}| 为左侧形式）
 *   - ONLY_ONE:      ||       仅一
 *   - MD_PARENT:     u        多对多父节点（仅左侧/source 端，后跟 -/.//|）
 */
export type ERCardinality =
  | 'zero-or-one'    // |o 零或一
  | 'zero-or-more'   // o{ 零或多
  | 'one-or-more'    // |{ 一或多
  | 'only-one'       // || 仅一
  | 'md-parent';     // u 多对多父节点（仅 source 端）

/** ER Diagram 关系类型（标识/非标识） */
export type ERIdentification = 'identifying' | 'non-identifying';

/** ER Diagram 属性键类型 */
export type ERAttributeKey = 'PK' | 'FK' | 'UK';

// ============================================================
// 7. State Diagram 状态类型（对齐官方 stateCommon.ts）
// ============================================================

/**
 * State Diagram 状态类型
 */
export type StateNodeType =
  | 'default'    // 默认状态
  | 'fork'       // Fork 状态
  | 'join'       // Join 状态
  | 'choice'     // 选择状态
  | 'divider'    // 分隔符
  | 'start'      // 起始状态
  | 'end';       // 结束状态

/** State Diagram 语句类型 */
export type StateStmtType =
  | 'state'
  | 'relation'
  | 'classDef'
  | 'styleDef'
  | 'applyClass'
  | 'direction'
  | 'root';

/** State Diagram Note 位置 */
export type StateNotePosition = 'left of' | 'right of';

// ============================================================
// 8. Mindmap 节点类型（对齐官方 mindmapDb.ts）
// ============================================================

/**
 * Mindmap 节点类型
 */
export type MindmapNodeType =
  | 'default'        // 默认（无边界）
  | 'rounded'        // (文本) 圆角矩形
  | 'rect'           // [文本] 矩形
  | 'circle'         // ((文本)) 圆形
  | 'cloud'          // (文本) 云形
  | 'bang'           // ))文本)) 爆炸形
  | 'hexagon';       // {{文本}} 六边形

// ============================================================
// 9. Architecture 类型（对齐官方 architectureTypes.ts）
// ============================================================

/** Architecture 方向 */
export type ArchitectureDirection = 'L' | 'R' | 'T' | 'B';

/** Architecture 对齐方式 */
export type ArchitectureAlignment = 'vertical' | 'horizontal' | 'bend';

// ============================================================
// 10. 通用基础类型
// ============================================================

/** 流程图方向 */
export type FlowchartDirection = 'TB' | 'TD' | 'BT' | 'RL' | 'LR';

/**
 * FlowchartDirection 类型守卫
 *
 * 用于外部数据（JSON.parse / localStorage / WebSocket 消息）→ typed structure 边界校验
 * （code-standards 第5章：边界校验在入口处完成）
 *
 * 注意：jison parser 输出的方向字符串可能包含符号（<,^,>,v）和 'TD' 同义词，
 * 需使用 parser/direction-utils.ts 的 normalizeDirection 完成归一化；
 * 本类型守卫仅做字面量匹配，不做归一化。
 */
export function isFlowchartDirection(dir: string): dir is FlowchartDirection {
  return dir === 'TB' || dir === 'TD' || dir === 'BT' || dir === 'RL' || dir === 'LR';
}

/** 节点样式 */
export interface NodeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  color?: string;
  /** 其他任意 CSS 属性（保留 Mermaid 原始 style/classDef 中的所有属性） */
  [key: string]: string | number | undefined;
}

/** 边标记（与 React Flow EdgeMarker 兼容） */
export interface EdgeMarker {
  type: 'arrow' | 'arrowclosed';
  width?: number;
  height?: number;
  color?: string;
}

// ============================================================
// 11. 图表类型枚举
// ============================================================

/**
 * 12 种 Mermaid 图表类型
 * - 图结构类型（6种）：使用 GraphCanvasState，由 React Flow 渲染
 * - 时序图（1种）：使用 SequenceCanvasState，由专用 SVG 渲染器渲染
 * - 数据图表类型（5种）：使用专用 CanvasState，由专用渲染器渲染
 */
export type DiagramType =
  | GraphDiagramType
  | SequenceDiagramType
  | ChartDiagramType;

/** 图结构类型集合（6种）— 共用 GraphCanvasState，由 GraphCanvas（React Flow）渲染 */
export type GraphDiagramType =
  | 'flowchart'
  | 'classDiagram'
  | 'erDiagram'
  | 'mindmap'
  | 'stateDiagram'
  | 'architecture';

/** 时序图类型（独立于 GraphDiagramType）— 使用 SequenceCanvasState */
export type SequenceDiagramType = 'sequenceDiagram';

/** 数据图表类型集合（5种）— 各有专用 CanvasState */
export type ChartDiagramType =
  | 'gantt'
  | 'pie'
  | 'timeline'
  | 'quadrantChart'
  | 'xychart';

// ============================================================
// 12. 类型专用子类型定义
// ============================================================

/** classDiagram 类成员 */
export interface NodeMember {
  name: string;
  type?: string;
  visibility: ClassVisibility;
  isStatic: boolean;
  isAbstract: boolean;
  returnType?: string;
  isMethod: boolean;
  /** classDiagram: 方法参数（如 "param1: Type, param2: Type"） */
  parameters?: string;
}

/** erDiagram 实体属性 */
export interface NodeAttribute {
  name: string;
  type: string;
  keys: ERAttributeKey[];
  comment?: string;
}

/**
 * Sequence 块中间分支（else/and/option）
 *
 * B4.1 新增：alt→else, par/par-over→and, critical→option 中间分支
 * 一个块可以有多个中间分支（如 alt 块含多个 else）
 */
export interface SequenceBlockMidBranch {
  /** 分支类型（'else' for alt, 'and' for par/par-over, 'option' for critical） */
  type: 'else' | 'and' | 'option';
  /** 分支标签 */
  label: string;
  /** 分支起始消息索引（含） */
  startMessage: number;
  /** 分支结束消息索引（不含，等于下一分支起始或主块 endMessage） */
  endMessage: number;
}

/**
 * sequenceDiagram 块信息（alt/opt/loop 等）
 *
 * B4.1 扩展：
 *   - 新增 `midBranches`：alt/par/critical 的中间分支（else/and/option）
 *   - 新增 `color`：rect 块专用颜色（独立字段，不再复用 label）
 *   - `label` 改为必填（rect 类型时为空字符串，颜色用 color 字段）
 *   - `endMessage` 改为必填（开发阶段不需要向后兼容）
 */
export interface SequenceBlockInfo {
  /** 块类型（8 种，不含 autonumber） */
  type: SequenceBlockType;
  /** 块标签（rect 类型时为空字符串，颜色用 color 字段） */
  label: string;
  /** rect 块专用颜色（如 'rgb(255,0,0)'，其他类型为 undefined） */
  color?: string;
  /** 主分支起始消息索引（含） */
  startMessage: number;
  /** 块结束消息索引（不含） */
  endMessage: number;
  /** 中间分支列表（alt→else, par/par-over→and, critical→option） */
  midBranches: SequenceBlockMidBranch[];
}

/**
 * sequenceDiagram 注释信息
 *
 * B4.1 扩展：
 *   - `participantId`（单值）→ `participantIds`（数组）：支持 `Note over A,B` 多参与者
 *   - 单参与者时长度为 1，使用 `participantIds[0]` 获取主参与者
 *   - 移除 `participantId` 字段（开发阶段不需要向后兼容，P2-2 修复）
 */
export interface SequenceNoteInfo {
  /** 关联参与者 ID 列表（支持 Note over A,B 多参与者；单参与者时长度为 1） */
  participantIds: string[];
  /** 位置：left of / right of / over */
  position: 'left' | 'right' | 'over';
  /** 注释文本 */
  label: string;
  /** 关联消息索引（Note 在第几条消息后） */
  messageIndex: number;
}

// ============================================================
// 12.1 Sequence 独立数据模型（独立于 GraphCanvasState，单一数据源）
// ============================================================

/**
 * 时序图参与者关键字类型（对应 mermaid 语法）
 * 来源：对齐官方 mermaid sequenceDb actor.type（8 种字符串字面量）
 *
 * 注意：与 jison 解析器内部的 PARTICIPANT_TYPE 数值枚举不同。
 * SequenceActorType 是 CanvasState 层类型，PARTICIPANT_TYPE 是 jison 层类型，
 * 两者通过 normalizeActorType(actor.type: number): SequenceActorType 转换。
 */
export type SequenceActorType =
  | 'participant'
  | 'actor'
  | 'boundary'
  | 'collections'
  | 'control'
  | 'database'
  | 'entity'
  | 'queue';

/**
 * 时序图参与者（替代原 MermaidNode + metadata.participants 双数据源）
 *
 * 单一数据源：participants 数组是权威来源，不再重复存储到 metadata
 */
export interface SequenceParticipant {
  /** 参与者 id（jison 解析的字符串，如 'Alice'） */
  id: string;
  /** 显示标签（actor.description || actor.name） */
  label: string;
  /** 参与者关键字类型（决定渲染形状） */
  actorType: SequenceActorType;
  /** 是否显式声明（participant/actor 语句）vs 消息派生
   *  undefined 视为显式（UI 创建的参与者默认显式） */
  explicitlyDeclared?: boolean;
  /** 是否自动换行 */
  wrap?: boolean;
  /** 链接映射（值来自 JSON.parse，类型不确定） */
  links?: Record<string, unknown>;
  /** 属性映射（值来自 JSON.parse，类型不确定） */
  properties?: Record<string, unknown>;
}

/**
 * 时序图消息（替代原 MermaidEdge + edge.data 双重编码）
 *
 * 单一数据源：messages 数组是权威来源
 * 删除原 MermaidEdge.edgeStyle（从 messageType 派生，不存储）
 */
export interface SequenceMessage {
  /** 消息 id（`seq-msg-${sequence}`） */
  id: string;
  /** 发送方参与者 id */
  from: string;
  /** 接收方参与者 id */
  to: string;
  /** 消息文本 */
  label: string;
  /** 箭头类型（26 种，对应 mermaid 语法） */
  messageType: SequenceArrowType;
  /** 时间序号（按顺序，Note/Block 不递增） */
  sequence: number;
  /** 激活（+ 后缀） */
  activate?: boolean;
  /** 停用（- 后缀） */
  deactivate?: boolean;
  /** 独立 activate 语句的 actor 列表（`activate X` 语法，附加到最近一条消息） */
  activateActors?: string[];
  /** 独立 deactivate 语句的 actor 列表（`deactivate X` 语法，附加到最近一条消息） */
  deactivateActors?: string[];
  /** create 语句 */
  create?: boolean;
  /** destroy 语句 */
  destroy?: boolean;
}

/**
 * 时序图画布状态（独立于 GraphCanvasState）
 *
 * 设计依据：
 *   - 时序图使用时间轴布局（参与者水平 + 消息垂直），与 React Flow 的自由布局不匹配
 *   - SequenceCanvas 是专用 SVG 渲染器，不经过 GraphCanvas/React Flow
 *   - 字段与时序图业务模型一一对应，不借用 nodes/edges
 *
 * 单一数据源：
 *   - participants/messages/notes/blocks/boxes 各自独立数组，无重复存储
 *   - 不再有 metadata.participants 与 nodes 的有损重复
 */
export interface SequenceCanvasState {
  diagramType: 'sequenceDiagram';
  /** 参与者列表（权威数据源） */
  participants: SequenceParticipant[];
  /** 消息列表（权威数据源，按 sequence 排序） */
  messages: SequenceMessage[];
  /** 注释列表 */
  notes: SequenceNoteInfo[];
  /** 块结构列表（alt/opt/loop 等） */
  blocks: SequenceBlockInfo[];
  /** Box 分组列表 */
  boxes: SequenceBoxInfo[];
  /** 是否启用自动编号 */
  autonumber: boolean;
  /** Accessibility 标题 */
  accTitle?: string;
  /** Accessibility 描述 */
  accDescription?: string;
  /** 原始 Mermaid 代码（用于增量序列化保持格式） */
  rawCode?: string;
}

/**
 * classDiagram 命名空间信息（M3 重构：从 {name, classIds} 改为 {namespaceId, label?, parentId?}）
 *
 * 单一数据源：作为 GraphMetadata.namespaces 字段类型，与 NamespaceOpenBlock 字段一一对应。
 * - namespaceId：namespace 节点 id
 * - label：namespace 显示名称（可选，若未设则用 namespaceId）
 * - parentId：父 namespace 的 id（嵌套关系，顶层为 undefined）
 */
export interface ClassNamespaceInfo {
  readonly namespaceId: string;
  readonly label?: string;
  readonly parentId?: string;
}

/**
 * classDiagram 注释信息（M3 重构：从 {classId, position, label} 改为 {text, classId?}）
 *
 * 单一数据源：作为 GraphMetadata.classNotes 字段类型，与 NoteBlock 字段一一对应。
 * - text：note 文本内容
 * - classId：关联的 class 节点 id（可选，独立 note 无 classId）
 *
 * position 字段废弃：class 文法不支持方位语法（note for X / note left of X 等已废弃），
 * note 通过 note-edge 连线表达与 class 的关联，无方位概念。
 */
export interface ClassNoteInfo {
  readonly text: string;
  readonly classId?: string;
}

/**
 * classDiagram classDef 定义信息（M3 重构：对应 ClassCssDefBlock）
 *
 * 单一数据源：作为 GraphMetadata.classDefs 字段类型。
 * - className：classDef 定义的样式类名（如 `classDef red fill:#f00` 中的 `red`）
 * - styles：CSS 样式字符串数组（如 `['fill:#f00', 'stroke:#000']`）
 * - textStyles：文本样式字符串数组（color 相关，fill 替换为 bgFill）
 *
 * 设计偏差修订（M3 实现期）：原设计将此类型定义在 converter/class/types.ts，
 * 但 ClassDefInfo 是 GraphMetadata 字段类型（数据模型），按 ClassNamespaceInfo/ClassNoteInfo
 * 同一原则（单一数据源），统一定义在 types.ts，避免 types.ts ↔ converter/class/types.ts 循环依赖。
 */
export interface ClassDefInfo {
  readonly className: string;
  readonly styles: readonly string[];
  readonly textStyles: readonly string[];
}

/**
 * classDiagram click 事件信息（M3 重构：对应 ClassClickBlock，13 种 jison 变体合并）
 *
 * 单一数据源：作为 GraphMetadata.classClickEvents 字段类型。
 * - classId：点击事件绑定的 class 节点 id
 * - functionName：回调函数名（click classId callback 形式）
 * - functionArgs：回调函数参数（click classId callback "arg" 形式）
 * - link：跳转链接 URL（click classId "link" 形式）
 * - linkTarget：链接打开目标（_self/_blank/_parent/_top）
 * - tooltip：tooltip 文本（click classId callback "tooltip" 形式，同步累积到 classTooltips）
 *
 * 设计偏差修订（M3 实现期）：原设计将此类型定义在 converter/class/types.ts，
 * 但 ClassClickEvent 是 GraphMetadata 字段类型（数据模型），按 ClassNamespaceInfo/ClassNoteInfo
 * 同一原则（单一数据源），统一定义在 types.ts，避免循环依赖。
 */
export interface ClassClickEvent {
  readonly classId: string;
  readonly functionName?: string;
  readonly functionArgs?: string;
  readonly link?: string;
  readonly linkTarget?: string;
  readonly tooltip?: string;
}

/**
 * sequenceDiagram Box 信息（box 语句定义的参与者分组，单一数据源）
 *
 * B4.1 扩展：新增 `wrap`（box 自动换行）
 */
export interface SequenceBoxInfo {
  id: string;
  name: string;
  /** 颜色（统一 rgba 格式，如 'rgba(255,0,0,0.2)'，transparent 表示无填充） */
  color: string;
  /** 包含的参与者 ID 列表（单一数据源，ParticipantEditor 不再维护 sequenceBoxName） */
  actorKeys: string[];
  /** 是否自动换行（B4.1 新增） */
  wrap?: boolean;
}

/** architecture 分组信息（v4 根因修复：移除 title/in/icon，group 属性全部通过 nodes[] 表达）
 *
 * 单一数据源原则：
 *   - title → node.data.label（与其他节点类型一致）
 *   - in（父 group）→ node.parentId（与其他节点类型一致）
 *   - icon → node.data.archIcon（与 service 的 icon 统一）
 *   - id → 保留在此结构中（作为 group 索引）
 */
export interface ArchitectureGroupInfo {
  id: string;
}

/** architecture layout hint（v4 新增：UI 编辑 layout:row [a, b, c] 语法） */
export interface ArchitectureLayoutHint {
  direction: 'row' | 'column';
  /** 节点 ID 列表 */
  members: string[];
}

/** architecture 边方向信息 */
export interface ArchitectureEdgeInfo {
  lhsId: string;
  lhsDir: ArchitectureDirection;
  lhsInto: boolean;
  lhsGroup?: string;
  rhsId: string;
  rhsDir: ArchitectureDirection;
  rhsInto: boolean;
  rhsGroup?: string;
  title?: string;
}

/** stateDiagram 复合状态信息 */
export interface StateCompositeInfo {
  stateId: string;
  childStateIds: string[];
  direction?: FlowchartDirection;
}

/** stateDiagram Note 信息 */
export interface StateNoteInfo {
  stateId: string;
  position: StateNotePosition;
  label: string;
}

/** stateDiagram classDef 信息 */
export interface StateClassDefInfo {
  name: string;
  style: string;
}

/** flowchart classDef 信息（对齐官方 FlowClass，保留完整 styles/textStyles） */
export interface FlowClassDefInfo {
  /** classDef id */
  id: string;
  /** 样式列表 */
  styles: string[];
  /** 文本样式列表（color 相关，fill 替换为 bgFill） */
  textStyles: string[];
}

/**
 * erDiagram 子图信息（对应 metadata.erSubgraphs）
 *
 * 模块2 方案B 重构：
 *   - 删除 classes 字段（class-apply 信息由 metadata.erClassApplyClasses 统一管理，单一数据源）
 *   - 新增 parentId 字段（支持嵌套 subgraph 的 serialize 还原）
 *   - dir 类型从 string 收窄为 FlowchartDirection（与 ErDirectionBlock.dir 一致）
 */
export interface ErSubGraphInfo {
  /** 子图 ID */
  id: string;
  /** 子图标题 */
  title: string;
  /** 子图包含的节点 ID 列表 */
  nodes: string[];
  /** 子图方向（TB/BT/RL/LR，可选，与 ErDirectionBlock.dir 类型一致） */
  dir?: FlowchartDirection;
  /** 父 subgraph ID（嵌套 subgraph 场景，用于 serialize 还原嵌套结构） */
  parentId?: string;
}

/** erDiagram 样式类信息（对应 metadata.erClasses） */
export interface ErClassInfo {
  /** classDef id */
  id: string;
  /** 样式列表 */
  styles: string[];
  /** 文本样式列表 */
  textStyles: string[];
}

/**
 * erDiagram class 应用信息（对应 metadata.erClassApplyClasses）
 *
 * 模块2 方案B 新增：从 ErClassApplyBlock 累积，serialize 还原 class 语句用。
 * 单一数据源：与 ErSubGraphInfo/ErClassInfo 同在 types.ts 定义，
 * converter/er/types.ts 通过 import 引用（避免循环依赖）。
 */
export interface ErClassApplyInfo {
  /** 目标实体/subgraph ID 列表（对应 ErClassApplyBlock.ids） */
  ids: string[];
  /** CSS 类名列表（对应 ErClassApplyBlock.classNames） */
  classNames: string[];
}

/** mindmap 节点装饰信息 */
export interface MindmapDecorationInfo {
  nodeId: string;
  icon?: string;
  className?: string;
}

// ============================================================
// 13. 节点数据（统一类型，禁止各模块重新定义）
// ============================================================

/**
 * Mermaid 节点数据
 * 统一类型定义，所有模块引用此类型，禁止重新定义
 *
 * v4 决策6：删除 `[key: string]: unknown` 索引签名，所有扩展字段显式类型化。
 * React Flow NodeProps 约束通过 MermaidNode 顶层（不加索引签名）保证 width/height 不被视为 required。
 *
 * 类型形式选择：必须使用 `type` 别名（对象字面量形式），不可改回 `interface`。
 * 原因：TypeScript 仅为 type alias（对象字面量形式）推导隐式索引签名，
 * 使其可赋值给 `Record<string, unknown>`，从而满足 React Flow
 * `Node<T extends Record<string, unknown>>` 约束；interface 不享有此推导。
 * 同时不显式声明 `[key: string]: unknown`，保留对未知字段访问的编译期错误（类型安全）。
 */
export type MermaidNodeData = {
  /**
   * 节点标签文本
   *
   * 可选的原因：边规则 `A --> B` 产出的 VertexBlock 不携带 label（jison 边规则
   * 不解析标签语法），Converter 不应 fallback 为 nodeId 掩盖这一事实（code-standards 第6章）。
   * mergeNode 跳过 undefined 字段，保留先定义的真实 label；若节点从未定义 label，
   * 由渲染层（shape-boundary.ts 已用 `?? id`）和序列化层（vertex-serializer.ts:217
   * 已用 `data.label ?? id`）处理默认值。
   */
  label?: string;
  /**
   * 节点形状类型
   *
   * 可选的原因：边规则 `A --> B` 产出的 VertexBlock 不携带 shape（jison 边规则
   * 不解析形状语法），Converter 不应 fallback 掩盖这一事实（code-standards 第6章）。
   * mergeNode 跳过 undefined 字段，保留先定义的真实 shape；若节点从未定义 shape，
   * 由渲染层（shape-boundary.ts:106 已用 `?? 'rect'`）处理默认值。
   */
  shape?: MermaidShapeType;
  style?: NodeStyle;
  // === 类型专用字段（可选，通过 diagramType 约束）===
  /** classDiagram: 类成员列表 */
  members?: NodeMember[];
  /** erDiagram: 实体属性列表 */
  attributes?: NodeAttribute[];
  /** stateDiagram: 特殊状态类型 */
  stateType?: StateNodeType;
  /** stateDiagram: 状态描述（带描述状态） */
  stateDescription?: string;
  /** mindmap: 节点形状 */
  mindmapType?: MindmapNodeType;
  /** mindmap: 节点图标 */
  mindmapIcon?: string;
  /** mindmap: 节点 CSS 类 */
  mindmapClass?: string;
  /** architecture: 服务图标 */
  archIcon?: string;
  /** architecture: 服务图标文本 */
  archIconText?: string;
  /** architecture: 是否为 junction */
  archIsJunction?: boolean;
  /** classDiagram: 类可见性（用于命名空间内） */
  classNamespace?: string;
  /** classDiagram: 注释列表 */
  classNotes?: ClassNoteInfo[];
  /** 通用: classDef 应用的 CSS 类名列表 */
  classNames?: string[];
  /** 通用: 点击事件 URL */
  clickUrl?: string;
  /** 通用: 点击事件回调名 */
  clickCallback?: string;
  /** 通用: tooltip */
  tooltip?: string;
  // === flowchart 扩展字段（对齐 ast/flowchart-ast.ts FlowVertex）===
  /** flowchart: 是否为子图节点 */
  isSubgraph?: boolean;
  /** 原始行号（0-based，决策10 方案B 适配器下可能为 undefined；保留用于调试和日志，不参与核心数据流） */
  _sourceLine?: number;
  /** 子图方向（flowchart/erDiagram/stateDiagram 通用，节点级别） */
  dir?: string;
  /** flowchart: 是否为用户显式声明的方向 */
  hasExplicitDir?: boolean;
  /** flowchart: 子图节点 ID 列表（仅 isSubgraph=true 时有效） */
  subgraphNodes?: string[];
  /** flowchart: 内联样式列表（style 语句，序列化用） */
  styles?: string[];
  /** flowchart: 标签类型 */
  labelType?: FlowLabelType;
  /** flowchart: 节点属性（`[|field:value|]` 语法） */
  props?: Record<string, unknown>;
  /** flowchart: 链接 target（_self/_blank/_parent/_top） */
  linkTarget?: string;
  /** flowchart: 图标名称 */
  icon?: string;
  /** flowchart: 图标形式 */
  form?: 'circle' | 'square' | 'rounded';
  /** flowchart: 标签位置 */
  pos?: 't' | 'b';
  /** flowchart: 图片 URL */
  img?: string;
  /** flowchart: 图片宽度 */
  assetWidth?: number;
  /** flowchart: 图片高度 */
  assetHeight?: number;
  /** flowchart: 布局约束 */
  constraint?: 'on' | 'off';
  /** flowchart: 是否有回调 */
  haveCallback?: boolean;
  // === classDiagram 扩展字段（对齐 parser/class/types.ts ClassNode）===
  /** classDiagram: 是否为根节点 */
  isRoot?: boolean;
  /** classDiagram: 构造型（如 `<<interface>>`） */
  stereotype?: ClassStereotype;
  /** classDiagram: 注解列表 */
  annotations?: string[];
  /** classDiagram: 泛型类型（如 `List~Item~` 中的 `Item`） */
  generics?: string;
  /** classDiagram: 别名 */
  alias?: string;
  // === stateDiagram 扩展字段 ===
  /** stateDiagram: Note 位置（'left of' | 'right of'） */
  notePosition?: StateNotePosition;
  // === erDiagram 扩展字段 ===
  /** erDiagram: 实体颜色索引（用于 ER 渲染器分配颜色） */
  colorIndex?: number;
  /**
   * erDiagram: classDef 编译后的样式列表（模块1 方案B 前置逻辑的存储位置）
   *
   * 由模块1 getCompiledStyles 计算（classes Map 累积），Converter parse 时直接拷贝
   * ErEntityBlock.cssCompiledStyles 到此字段。serialize 时直接读取（无需重新查表）。
   * 渲染层（模块4）通过 parseStylesToNodeStyle 独立消费，与 data.styles 双路径消费。
   */
  cssCompiledStyles?: string[];
};

// ============================================================
// 14. 边数据（统一类型，禁止各模块重新定义）
// ============================================================

/**
 * Mermaid 边数据
 * 统一类型定义，所有模块引用此类型，禁止重新定义
 *
 * v4 决策6：删除 `[key: string]: unknown` 索引签名，所有扩展字段显式类型化。
 *
 * 类型形式选择：必须使用 `type` 别名（对象字面量形式），原因同 MermaidNodeData —
 * 仅为 type alias 推导隐式索引签名，满足 React Flow Edge 约束。
 */
export type MermaidEdgeData = {
  edgeStyle: MermaidEdgeStyle;
  label?: string;
  // === 类型专用字段（可选，通过 diagramType 约束）===
  /**
   * classDiagram: 起点关系类型（M3 重构：与 RelationBlock.relationType1 一一对应，双端对称无信息丢失）
   *
   * 数值型（对齐 jison ClassDB type1）：
   *   - 0: AGGREGATION（空心菱形 ◇）
   *   - 1: EXTENSION（空心三角 △，继承）
   *   - 2: COMPOSITION（实心菱形 ◆）
   *   - 3: DEPENDENCY（箭头 →，依赖）
   *   - 4: LOLLIPOP（圆圈 ○，接口实现）
   *   - 'none': 无 marker
   *
   * 渲染层（模块4）按数值查 markerStart，5 种 Start marker。
   */
  relationType1?: number | 'none';
  /**
   * classDiagram: 终点关系类型（M3 重构：与 RelationBlock.relationType2 一一对应，双端对称无信息丢失）
   *
   * 数值型（对齐 jison ClassDB type2），同 relationType1 的取值范围。
   * 渲染层（模块4）按数值查 markerEnd，5 种 End marker。
   */
  relationType2?: number | 'none';
  /** classDiagram: 线型（'line'=实线 / 'dotted'=虚线，对应 RelationBlock.lineType 数值，Converter 做映射） */
  lineType?: ClassLineType;
  /** classDiagram: 关系标签（对应 RelationBlock.label） */
  relationLabel?: string;
  // === erDiagram 扩展字段（模块2 方案B：双端基数对称，与 ErRelationshipBlock 一一对应）===
  /**
   * erDiagram: A 端基数（对应 ErRelationshipBlock.cardA）
   *
   * CARDINALITY 常量值经 ErRelationshipConverter 映射到 ERCardinality 字面量：
   *   - ZERO_OR_ONE → 'zero-or-one'（符号 |o / o|）
   *   - ZERO_OR_MORE → 'zero-or-more'（符号 }o / o{）
   *   - ONE_OR_MORE → 'one-or-more'（符号 }| / |{）
   *   - ONLY_ONE → 'only-one'（符号 ||）
   *   - MD_PARENT → 'md-parent'（符号 }+ / +{）
   */
  erCardA?: ERCardinality;
  /** erDiagram: B 端基数（对应 ErRelationshipBlock.cardB，同 erCardA 取值范围） */
  erCardB?: ERCardinality;
  /**
   * erDiagram: 关系类型（对应 ErRelationshipBlock.relType）
   *
   * IDENTIFICATION 常量值经 ErRelationshipConverter 映射到 ERIdentification 字面量：
   *   - IDENTIFYING → 'identifying'（实线 --）
   *   - NON_IDENTIFYING → 'non-identifying'（虚线 ..）
   */
  erIdentification?: ERIdentification;
  /** erDiagram: A 端角色（对应 ErRelationshipBlock.roleA，关系标签） */
  erRoleA?: string;
  /** stateDiagram: 转换标签 */
  transitionLabel?: string;
  /** architecture: 边方向信息 */
  archEdge?: ArchitectureEdgeInfo;
  /** 通用: classDef 应用的 CSS 类名列表 */
  classNames?: string[];
  /** flowchart: 是否为回路边 */
  isBackEdge?: boolean;
  /** flowchart: 布局阶段计算的 source 连接方向 */
  sourcePosition?: 'top' | 'bottom' | 'left' | 'right';
  /** flowchart: 布局阶段计算的 target 连接方向 */
  targetPosition?: 'top' | 'bottom' | 'left' | 'right';
  /** flowchart: 是否为自环边（运行时由布局标记，渲染据此绕圈绘制） */
  isSelfLoop?: boolean;
  // === flowchart 扩展字段（对齐 ast/flowchart-ast.ts FlowEdge）===
  /** flowchart: 内联样式列表（linkStyle 语句，序列化用） */
  styles?: string[];
  /** flowchart: 曲线类型 */
  interpolate?: string;
  /**
   * flowchart: 边动画
   *
   * 决策18 扩展为联合类型（保留 FlowEdge.animation 速度信息）：
   *   - undefined: 无动画
   *   - true: 默认速度动画（向后兼容）
   *   - 'fast' | 'slow': 显式速度
   *
   * 对齐 ast/flowchart-ast.ts FlowEdge.animate (boolean) + FlowEdge.animation ('fast'|'slow')，
   * 合并为单字段消除原 flowchart-parser.ts:474-475 同时设置 animate + animation 两个字段的冗余。
   */
  animate?: boolean | 'fast' | 'slow';
  /** flowchart: 边长度（对应 `---`/`----`/`-----` 语法，用于 dagre minlen） */
  length?: number;
  /** flowchart: 是否为用户定义 ID */
  isUserDefinedId?: boolean;
  /** flowchart: 边标签类型（对齐 FlowEdge.labelType，markdown/string/text 三种；P1-1 修订） */
  labelType?: FlowLabelType;
  /** flowchart: 所属 subgraph ID（顶层为 undefined；P1-6 方案B，由 EdgeConverter.parseBlock 从 ctx.currentParent() 读取栈顶设置，用于决策3 边归属判断） */
  subgraphId?: string;
  /** 原始行号（0-based，决策10 方案B 适配器下可能为 undefined；保留用于调试和日志，不参与核心数据流） */
  _sourceLine?: number;
  // === classDiagram 扩展字段（M3 重构：双端对称，与 RelationBlock 字段一一对应）===
  /** classDiagram: 左基数（对应 RelationBlock.cardinality1，如 "1" "0..*" "1..1"） */
  cardinality1?: string;
  /** classDiagram: 右基数（对应 RelationBlock.cardinality2） */
  cardinality2?: string;
};

// ============================================================
// 15. 画布节点和边（与 React Flow 兼容）
// ============================================================

/**
 * 画布节点（与 React Flow Node 结构兼容）
 *
 * 设计说明：
 * - 顶层不加索引签名，否则 NodeProps 的 Pick 会将 width/height 等视为 required
 * - `data` 类型为 MermaidNodeData（type alias，对象字面量形式），TypeScript 会为其推导
 *   隐式索引签名，从而满足 React Flow `Node<T extends Record<string, unknown>>` 约束。
 *   注意：若改回 `interface` 声明，将丢失隐式索引签名，导致 React Flow 约束失败。
 * - 同时 MermaidNodeData 不显式声明 `[key: string]: unknown`，保留对未知字段访问的
 *   编译期错误（强制类型安全访问，符合 v4 决策6）
 */
export interface MermaidNode {
  id: string;
  /** React Flow 节点类型（如 'default'、'subgraph'、'sequence-participant'），决定渲染组件 */
  type?: string;
  position: { x: number; y: number };
  data: MermaidNodeData;
  parentId?: string;
  extent?: 'parent' | [[number, number], [number, number]];
  selected?: boolean;
  dragging?: boolean;
  width?: number;
  height?: number;
  zIndex?: number;
}

/**
 * 画布边（与 React Flow Edge 结构兼容）
 *
 * 设计说明：同 MermaidNode.data，MermaidEdgeData 必须保持 type alias 形式以保留
 * 隐式索引签名，满足 React Flow `Edge<T extends Record<string, unknown>>` 约束
 */
export interface MermaidEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  data: MermaidEdgeData;
  markerStart?: EdgeMarker;
  markerEnd?: EdgeMarker;
  /** React Flow EdgeBase 兼容字段：源节点 Handle ID（如 'left'/'right'/'top'/'bottom'） */
  sourceHandle?: string | null;
  /** React Flow EdgeBase 兼容字段：目标节点 Handle ID */
  targetHandle?: string | null;
  selected?: boolean;
  animated?: boolean;
  zIndex?: number;
}

/** 画布视口 */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

// ============================================================
// 16. GraphMetadata 联合类型（按 diagramType 区分有效字段）
// ============================================================

/**
 * 图结构类型元数据
 * 按 diagramType 区分有效字段，所有图结构类型共用此接口
 * 各字段都是可选的，由各图表类型的解析器/序列化器负责填充和读取
 *
 * v4 决策6：删除 `[key: string]: unknown` 索引签名，所有扩展字段显式类型化。
 */
export interface GraphMetadata {
  /** classDiagram 专用: 命名空间信息 */
  namespaces?: ClassNamespaceInfo[];
  /**
   * classDiagram 专用: classDef 定义（M3 重构：类型从 StateClassDefInfo[] 改为 ClassDefInfo[]）
   *
   * 历史问题：原字段类型为 StateClassDefInfo[]，但 class 解析器实际使用 classStyleClasses
   * （StyleClass[]），此字段在 GraphMetadata 上为 dead code，仅 QuadrantCanvasState /
   * XYChartCanvasState 各自的 classDefs 字段使用 StateClassDefInfo[]（独立字段，非 GraphMetadata）。
   * M3 重构复用此字段名，类型改为 ClassDefInfo[]（class 专用 classDef 定义）。
   */
  classDefs?: ClassDefInfo[];
  /** stateDiagram 专用: 复合状态信息 */
  composites?: StateCompositeInfo[];
  /** stateDiagram 专用: Note 信息 */
  stateNotes?: StateNoteInfo[];
  /** stateDiagram 专用: classDef 定义 */
  stateClassDefs?: StateClassDefInfo[];
  /** stateDiagram 专用: 方向 */
  stateDirection?: FlowchartDirection;
  /** architecture 专用: 分组信息（v4：移除 nodeIds，成员通过 parentId 派生） */
  groups?: ArchitectureGroupInfo[];
  /** architecture 专用: 边方向信息 */
  archEdges?: ArchitectureEdgeInfo[];
  /** architecture 专用: layout hints（v4 新增：UI 编辑 layout:row [a, b, c] 语法） */
  layoutHints?: ArchitectureLayoutHint[];
  /** mindmap 专用: 节点装饰信息 */
  mindmapDecorations?: MindmapDecorationInfo[];
  /** erDiagram 专用: 子图信息 */
  erSubgraphs?: ErSubGraphInfo[];
  /** erDiagram 专用: 样式类定义 */
  erClasses?: ErClassInfo[];
  /** erDiagram 专用: class 应用信息（模块2 方案B 新增，serialize 还原 class 语句用） */
  erClassApplyClasses?: ErClassApplyInfo[];
  /** 通用: classDef 定义（flowchart 等） */
  flowClassDefs?: FlowClassDefInfo[];
  /** 通用: title */
  title?: string;
  /** 通用: accessibility 标题 */
  accTitle?: string;
  /** 通用: accessibility 描述 */
  accDescription?: string;
  // === flowchart 扩展字段（对齐 ast/flowchart-ast.ts FlowchartAST）===
  /** flowchart: click 事件列表 */
  flowClickEvents?: FlowClickEvent[];
  /** flowchart: tooltip 映射（nodeId → tooltip，parser 输出 Object.fromEntries，object literal） */
  flowTooltips?: Record<string, string>;
  /** flowchart: 默认边插值算法（linkStyle default interpolate xxx） */
  flowDefaultInterpolate?: string;
  /** flowchart: 默认边样式（linkStyle default stroke:#f00） */
  flowDefaultStyle?: string[];
  /** flowchart: 图表方向 */
  direction?: FlowchartDirection;
  /** flowchart: 子图 AST 信息（保留原始 subGraph 结构，用于序列化） */
  flowSubgraphs?: FlowSubGraph[];
  // === classDiagram 扩展字段 ===
  /** classDiagram: 注释信息（与 stateNotes 区分，class 专用） */
  classNotes?: ClassNoteInfo[];
  /**
   * classDiagram: 样式类定义（classDef 定义的样式类）
   *
   * M3 重构后此字段供老 parser 使用，新 converter 路径使用 classDefs（ClassDefInfo[]）。
   * 模块3 删除老 parser 路径时一并清理此字段。
   */
  classStyleClasses?: StyleClass[];
  /** classDiagram: click 事件列表（M3 重构新增，对应 ClassClickBlock） */
  classClickEvents?: ClassClickEvent[];
  /** classDiagram: tooltip 映射（nodeId → tooltip，M3 重构新增，从 click event 提取） */
  classTooltips?: Record<string, string>;
}

// ============================================================
// 17. 画布状态（判别联合类型）
// ============================================================

/**
 * 图结构类型共用状态（6种图结构类型使用）
 * nodes/edges 为权威数据源，其他字段为派生或元数据
 */
export interface GraphCanvasState {
  diagramType: GraphDiagramType;
  nodes: MermaidNode[];
  edges: MermaidEdge[];
  /** flowchart 专用方向 */
  direction?: FlowchartDirection;
  /** 各类型特有元数据（按 diagramType 区分有效字段） */
  metadata?: GraphMetadata;
  /** M0 新增：原始 Mermaid 代码（用于增量序列化保持格式） */
  rawCode?: string;
  /**
   * 是否需要自动布局。
   * - true：节点位置尚未由布局算法计算（如刚从 Mermaid 代码解析而来），
   *   GraphCanvas 应在同步后执行 structural 布局。
   * - false/undefined：位置已确定，禁止覆盖。
   */
  needsLayout?: boolean;
}

/**
 * Gantt 甘特图状态
 * 扩展 accTitle/accDescription 字段
 */
export interface GanttCanvasState {
  diagramType: 'gantt';
  title?: string;
  accTitle?: string;
  accDescription?: string;
  /** dateFormat 必填（官方 gantt 语法要求，否则无法解析日期） */
  dateFormat: string;
  axisFormat?: string;
  tickInterval?: string;
  todayMarker?: string;
  excludes?: string[];
  includes?: string[];
  /** weekday 关键字：官方只支持 sunday/monday（设置周起始日） */
  weekday?: 'sunday' | 'monday';
  weekend?: 'friday' | 'saturday';
  inclusiveEndDates?: boolean;
  topAxis?: boolean;
  displayMode?: 'compact' | 'regular';
  sections: GanttSection[];
  /** M0 新增：原始 Mermaid 代码（用于增量序列化保持格式） */
  rawCode?: string;
}

/** Gantt 任务区段 */
export interface GanttSection {
  name: string;
  tasks: GanttTask[];
}

/**
 * Gantt 任务
 * 统一定义，禁止各模块重新定义
 *
 * v4 根因修复（单一数据源原则）：
 *   - 移除 status 字段，统一使用 tags: string[]（支持多标签组合，如 ['done', 'crit']）
 *   - 移除 afterId 字段，统一使用 dependencies: string[]（支持多依赖，如 ['t1', 't2']）
 *   - 新增 clickUrl 字段，存储 click href URL（单一数据源：task 是权威来源）
 */
export interface GanttTask {
  id?: string;
  label: string;
  /** v4：移除 status，统一使用 tags（多标签组合） */
  startDate?: string;
  /** v4：移除 afterId，统一使用 dependencies（多依赖） */
  duration?: string;
  endDate?: string;
  /** 多标签组合（如 ['done', 'crit']），不限制具体值 */
  tags?: string[];
  /** 多依赖（如 ['t1', 't2']），对应官方 after t1 t2 语法 */
  dependencies?: string[];
  priority?: 'high' | 'medium' | 'low';
  /** v4 新增：click href URL（单一数据源：task 是权威来源） */
  clickUrl?: string;
}

/**
 * Pie 饼图状态
 * 扩展 accTitle/accDescription 字段
 */
export interface PieCanvasState {
  diagramType: 'pie';
  title?: string;
  accTitle?: string;
  accDescription?: string;
  showData?: boolean;
  slices: PieSlice[];
  /** M0 新增：原始 Mermaid 代码（用于增量序列化保持格式） */
  rawCode?: string;
}

/** Pie 饼图切片 */
export interface PieSlice {
  label: string;
  value: number;
}

/**
 * Timeline 时间线状态
 * 扩展 accTitle/accDescription 字段
 */
export interface TimelineCanvasState {
  diagramType: 'timeline';
  title?: string;
  accTitle?: string;
  accDescription?: string;
  direction?: 'LR' | 'TB';
  sections: TimelineSection[];
  /** M0 新增：原始 Mermaid 代码（用于增量序列化保持格式） */
  rawCode?: string;
}

/** Timeline 区段 */
export interface TimelineSection {
  name?: string;
  periods: TimelinePeriod[];
}

/** Timeline 时间段 */
export interface TimelinePeriod {
  label: string;
  events: TimelineEvent[];
}

/** Timeline 事件 */
export interface TimelineEvent {
  label: string;
}

/**
 * QuadrantChart 四象限图状态
 * 扩展 accTitle/accDescription 字段
 * 坐标归一化到 0-1 范围
 */
export interface QuadrantCanvasState {
  diagramType: 'quadrantChart';
  title?: string;
  accTitle?: string;
  accDescription?: string;
  quadrants: {
    '1': string;  // 右上象限标题
    '2': string;  // 左上象限标题
    '3': string;  // 左下象限标题
    '4': string;  // 右下象限标题
  };
  xAxis: { leftText: string; rightText: string };
  yAxis: { topText: string; bottomText: string };
  points: QuadrantPoint[];
  classDefs?: StateClassDefInfo[];
  /** M0 新增：原始 Mermaid 代码（用于增量序列化保持格式） */
  rawCode?: string;
}

/** QuadrantChart 数据点（坐标归一化 0-1） */
export interface QuadrantPoint {
  label: string;
  x: number;  // 0-1
  y: number;  // 0-1
  className?: string;
  style?: NodeStyle;
  /** 数据点半径（quadrant 特有样式，对应官方 `radius: N`） */
  radius?: number;
}

/**
 * XYChart 坐标图状态
 * 扩展 accTitle/accDescription 字段
 */
export interface XYChartCanvasState {
  diagramType: 'xychart';
  title?: string;
  accTitle?: string;
  accDescription?: string;
  orientation?: 'horizontal' | 'vertical';
  showDataLabel?: boolean;
  plotColorPalette?: string;
  xAxis: XYAxis;
  yAxis: XYAxis;
  series: XYSeries[];
  classDefs?: StateClassDefInfo[];
  /** M0 新增：原始 Mermaid 代码（用于增量序列化保持格式） */
  rawCode?: string;
}

/** XYChart 坐标轴 */
export interface XYAxis {
  type: 'band' | 'linear';  // x: band/linear, y: linear only
  title?: string;
  min?: number;
  max?: number;
  categories?: string[];  // type='band' 时
  data?: number[];        // type='linear' 时
}

/** XYChart 数据系列 */
export interface XYSeries {
  name?: string;
  type: 'line' | 'bar';
  data: number[];
  color?: string;
  className?: string;
}

/**
 * 画布状态 — 判别联合类型
 * 通过 diagramType 字段区分具体类型
 */
export type CanvasState =
  | GraphCanvasState
  | SequenceCanvasState
  | GanttCanvasState
  | PieCanvasState
  | TimelineCanvasState
  | QuadrantCanvasState
  | XYChartCanvasState;

/**
 * 图结构画布更新（部分字段）
 * 用于 updateActiveCanvas 等 API，仅支持图结构类型的部分更新
 */
export interface GraphCanvasUpdate {
  nodes?: MermaidNode[];
  edges?: MermaidEdge[];
  direction?: FlowchartDirection;
  metadata?: GraphMetadata;
  /** 原始 Mermaid 代码（用于增量序列化保留格式） */
  rawCode?: string;
  /**
   * 是否需要自动布局。仅在 payload 显式携带时更新 Store；
   * 否则保留原值，避免误清空已有标志。
   */
  needsLayout?: boolean;
}

// ============================================================
// 18. 类型守卫
// ============================================================

const GRAPH_DIAGRAM_TYPES: ReadonlySet<GraphDiagramType> = new Set([
  'flowchart',
  'classDiagram',
  'erDiagram',
  'mindmap',
  'stateDiagram',
  'architecture',
]);

const CHART_DIAGRAM_TYPES: ReadonlySet<ChartDiagramType> = new Set([
  'gantt',
  'pie',
  'timeline',
  'quadrantChart',
  'xychart',
]);

/** 判断图表类型是否为图结构类型 */
export function isGraphDiagramType(type: DiagramType): type is GraphDiagramType {
  return GRAPH_DIAGRAM_TYPES.has(type as GraphDiagramType);
}

/** 判断图表类型是否为数据图表类型 */
export function isChartDiagramType(type: DiagramType): type is ChartDiagramType {
  return CHART_DIAGRAM_TYPES.has(type as ChartDiagramType);
}

/** 判断图表类型是否为时序图 */
export function isSequenceDiagramType(type: DiagramType): type is SequenceDiagramType {
  return type === 'sequenceDiagram';
}

/** 判断画布状态是否为图结构类型 */
export function isGraphCanvasState(state: CanvasState): state is GraphCanvasState {
  return isGraphDiagramType(state.diagramType);
}

/** 判断画布状态是否为时序图 */
export function isSequenceCanvasState(state: CanvasState): state is SequenceCanvasState {
  return state.diagramType === 'sequenceDiagram';
}

/** 判断画布状态是否为 Gantt 甘特图 */
export function isGanttCanvasState(state: CanvasState): state is GanttCanvasState {
  return state.diagramType === 'gantt';
}

/** 判断画布状态是否为 Pie 饼图 */
export function isPieCanvasState(state: CanvasState): state is PieCanvasState {
  return state.diagramType === 'pie';
}

/** 判断画布状态是否为 Timeline 时间线 */
export function isTimelineCanvasState(state: CanvasState): state is TimelineCanvasState {
  return state.diagramType === 'timeline';
}

/** 判断画布状态是否为 QuadrantChart 四象限图 */
export function isQuadrantCanvasState(state: CanvasState): state is QuadrantCanvasState {
  return state.diagramType === 'quadrantChart';
}

/** 判断画布状态是否为 XYChart 坐标图 */
export function isXYChartCanvasState(state: CanvasState): state is XYChartCanvasState {
  return state.diagramType === 'xychart';
}

// ============================================================
// 19. 迁移函数和工厂函数
// ============================================================

/**
 * 迁移旧版 CanvasState 到新版
 * 支持所有图表类型的迁移
 *
 * 唯一权威实现，其他模块直接调用此函数
 */
export function migrateCanvasState(state: unknown): CanvasState {
  if (typeof state !== 'object' || state === null) {
    return createEmptyCanvasState('flowchart');
  }

  const raw = state as Record<string, unknown>;
  const diagramType = raw.diagramType;
  // M0: 原始 Mermaid 代码必须在迁移过程中保留，否则服务端持久化/视图切换/重连同步会丢失用户格式
  const rawCode = typeof raw.rawCode === 'string' ? raw.rawCode : undefined;

  // 旧版无 diagramType 数据迁移为 flowchart
  if (typeof diagramType !== 'string') {
    return withRawCode(migrateLegacyFlowchart(raw), rawCode);
  }

  // 类型断言: 经过 string 检查后，断言为 DiagramType
  const typedDiagramType = diagramType as DiagramType;

  // 时序图独立迁移分支（SequenceCanvasState，独立于 GraphCanvasState）
  if (isSequenceDiagramType(typedDiagramType)) {
    return withRawCode(migrateSequenceCanvasState(raw), rawCode);
  }

  if (isGraphDiagramType(typedDiagramType)) {
    return withRawCode(migrateGraphCanvasState(raw, typedDiagramType), rawCode);
  }

  switch (typedDiagramType) {
    case 'gantt':
      return withRawCode(migrateGanttCanvasState(raw), rawCode);
    case 'pie':
      return withRawCode(migratePieCanvasState(raw), rawCode);
    case 'timeline':
      return withRawCode(migrateTimelineCanvasState(raw), rawCode);
    case 'quadrantChart':
      return withRawCode(migrateQuadrantCanvasState(raw), rawCode);
    case 'xychart':
      return withRawCode(migrateXYChartCanvasState(raw), rawCode);
    default:
      return createEmptyCanvasState('flowchart');
  }
}

/**
 * 迁移 sequence 画布状态
 *
 * 设计决策（开发阶段原则）：
 *   - 项目当前为开发阶段，不需要向后兼容，不做数据迁移（institution.md 第10条）
 *   - 仅做结构校验：raw 必须包含 participants/messages/notes/blocks/boxes/autonumber 字段
 *   - 字段缺失或类型不匹配 → 抛错（程序错误不可包容，code-standards.md 第5条）
 *   - 禁止 fallback：不尝试从旧 GraphCanvasState 结构（nodes/edges/metadata）转换
 *     （institution.md 第7条：fallback 是掩盖主逻辑缺陷的低级做法）
 *
 * 测试数据修复：
 *   - 测试 helper 必须改为构造新类型（阶段 6 处理）
 *   - 不通过 migrateSequenceCanvasState 容错来兼容旧 helper
 */
function migrateSequenceCanvasState(raw: Record<string, unknown>): SequenceCanvasState {
  if (!Array.isArray(raw.participants)) {
    throw new Error(`migrateSequenceCanvasState: participants 必须是数组，实际: ${typeof raw.participants}`);
  }
  if (!Array.isArray(raw.messages)) {
    throw new Error(`migrateSequenceCanvasState: messages 必须是数组，实际: ${typeof raw.messages}`);
  }
  if (!Array.isArray(raw.notes)) {
    throw new Error(`migrateSequenceCanvasState: notes 必须是数组，实际: ${typeof raw.notes}`);
  }
  if (!Array.isArray(raw.blocks)) {
    throw new Error(`migrateSequenceCanvasState: blocks 必须是数组，实际: ${typeof raw.blocks}`);
  }
  if (!Array.isArray(raw.boxes)) {
    throw new Error(`migrateSequenceCanvasState: boxes 必须是数组，实际: ${typeof raw.boxes}`);
  }
  if (typeof raw.autonumber !== 'boolean') {
    throw new Error(`migrateSequenceCanvasState: autonumber 必须是 boolean，实际: ${typeof raw.autonumber}`);
  }

  return {
    diagramType: 'sequenceDiagram',
    participants: raw.participants as SequenceParticipant[],
    messages: raw.messages as SequenceMessage[],
    notes: raw.notes as SequenceNoteInfo[],
    blocks: raw.blocks as SequenceBlockInfo[],
    boxes: raw.boxes as SequenceBoxInfo[],
    autonumber: raw.autonumber,
    ...(typeof raw.accTitle === 'string' ? { accTitle: raw.accTitle } : {}),
    ...(typeof raw.accDescription === 'string' ? { accDescription: raw.accDescription } : {}),
  };
}

/** 在迁移后的画布上保留原始 Mermaid 代码 */
function withRawCode<T extends CanvasState>(canvas: T, rawCode: string | undefined): T {
  if (rawCode === undefined) return canvas;
  return { ...canvas, rawCode };
}

/**
 * 创建指定类型的空画布状态
 * 用于图表类型切换时初始化新类型的空白画布
 */
export function createEmptyCanvasState(diagramType: DiagramType): CanvasState {
  if (isSequenceDiagramType(diagramType)) {
    return {
      diagramType: 'sequenceDiagram',
      participants: [],
      messages: [],
      notes: [],
      blocks: [],
      boxes: [],
      autonumber: false,
    };
  }

  if (isGraphDiagramType(diagramType)) {
    return {
      diagramType,
      nodes: [],
      edges: [],
    };
  }

  switch (diagramType) {
    case 'gantt':
      return { diagramType: 'gantt', dateFormat: '', sections: [] };
    case 'pie':
      return { diagramType: 'pie', slices: [] };
    case 'timeline':
      return { diagramType: 'timeline', sections: [] };
    case 'quadrantChart':
      return {
        diagramType: 'quadrantChart',
        quadrants: { '1': '', '2': '', '3': '', '4': '' },
        xAxis: { leftText: '', rightText: '' },
        yAxis: { topText: '', bottomText: '' },
        points: [],
      };
    case 'xychart':
      return {
        diagramType: 'xychart',
        xAxis: { type: 'band', categories: [] },
        yAxis: { type: 'linear' },
        series: [],
      };
    default:
      return { diagramType: 'flowchart', nodes: [], edges: [] };
  }
}

// ============================================================
// 迁移辅助函数（内部使用）
// ============================================================

function migrateLegacyFlowchart(raw: Record<string, unknown>): GraphCanvasState {
  const nodes = Array.isArray(raw.nodes) ? (raw.nodes as MermaidNode[]) : [];
  const edges = Array.isArray(raw.edges) ? (raw.edges as MermaidEdge[]) : [];
  const direction = typeof raw.direction === 'string' && isFlowchartDirection(raw.direction)
    ? raw.direction
    : undefined;
  const metadata = raw.metadata && typeof raw.metadata === 'object'
    ? (raw.metadata as GraphMetadata)
    : undefined;

  return {
    diagramType: 'flowchart',
    nodes,
    edges,
    direction,
    metadata,
  };
}

function migrateGraphCanvasState(
  raw: Record<string, unknown>,
  diagramType: GraphDiagramType,
): GraphCanvasState {
  const nodes = Array.isArray(raw.nodes) ? (raw.nodes as MermaidNode[]) : [];
  const edges = Array.isArray(raw.edges) ? (raw.edges as MermaidEdge[]) : [];
  const direction = typeof raw.direction === 'string' && isFlowchartDirection(raw.direction)
    ? raw.direction
    : undefined;
  const metadata = raw.metadata && typeof raw.metadata === 'object'
    ? (raw.metadata as GraphMetadata)
    : undefined;
  const needsLayout = typeof raw.needsLayout === 'boolean' ? raw.needsLayout : undefined;

  return {
    diagramType,
    nodes,
    edges,
    direction,
    metadata,
    ...(needsLayout !== undefined ? { needsLayout } : {}),
  };
}

function migrateGanttCanvasState(raw: Record<string, unknown>): GanttCanvasState {
  const sections = Array.isArray(raw.sections) ? (raw.sections as GanttSection[]) : [];
  return {
    diagramType: 'gantt',
    title: typeof raw.title === 'string' ? raw.title : undefined,
    accTitle: typeof raw.accTitle === 'string' ? raw.accTitle : undefined,
    accDescription: typeof raw.accDescription === 'string' ? raw.accDescription : undefined,
    dateFormat: typeof raw.dateFormat === 'string' ? raw.dateFormat : '',
    axisFormat: typeof raw.axisFormat === 'string' ? raw.axisFormat : undefined,
    tickInterval: typeof raw.tickInterval === 'string' ? raw.tickInterval : undefined,
    todayMarker: typeof raw.todayMarker === 'string' ? raw.todayMarker : undefined,
    excludes: Array.isArray(raw.excludes) ? (raw.excludes as string[]) : undefined,
    includes: Array.isArray(raw.includes) ? (raw.includes as string[]) : undefined,
    weekday: typeof raw.weekday === 'string' ? (raw.weekday as GanttCanvasState['weekday']) : undefined,
    weekend: typeof raw.weekend === 'string' ? (raw.weekend as GanttCanvasState['weekend']) : undefined,
    inclusiveEndDates: typeof raw.inclusiveEndDates === 'boolean' ? raw.inclusiveEndDates : undefined,
    topAxis: typeof raw.topAxis === 'boolean' ? raw.topAxis : undefined,
    displayMode: typeof raw.displayMode === 'string' ? (raw.displayMode as GanttCanvasState['displayMode']) : undefined,
    sections,
  };
}

function migratePieCanvasState(raw: Record<string, unknown>): PieCanvasState {
  const slices = Array.isArray(raw.slices) ? (raw.slices as PieSlice[]) : [];
  return {
    diagramType: 'pie',
    title: typeof raw.title === 'string' ? raw.title : undefined,
    accTitle: typeof raw.accTitle === 'string' ? raw.accTitle : undefined,
    accDescription: typeof raw.accDescription === 'string' ? raw.accDescription : undefined,
    showData: typeof raw.showData === 'boolean' ? raw.showData : undefined,
    slices,
  };
}

function migrateTimelineCanvasState(raw: Record<string, unknown>): TimelineCanvasState {
  // 旧版 periods 字段迁移到 sections
  let sections: TimelineSection[] = [];
  if (Array.isArray(raw.sections)) {
    sections = raw.sections as TimelineSection[];
  } else if (Array.isArray(raw.periods)) {
    // 旧版 periods 迁移
    sections = [{
      name: undefined,
      periods: raw.periods as TimelinePeriod[],
    }];
  }

  return {
    diagramType: 'timeline',
    title: typeof raw.title === 'string' ? raw.title : undefined,
    accTitle: typeof raw.accTitle === 'string' ? raw.accTitle : undefined,
    accDescription: typeof raw.accDescription === 'string' ? raw.accDescription : undefined,
    direction: typeof raw.direction === 'string' ? (raw.direction as 'LR' | 'TB') : undefined,
    sections,
  };
}

function migrateQuadrantCanvasState(raw: Record<string, unknown>): QuadrantCanvasState {
  const quadrants = (raw.quadrants && typeof raw.quadrants === 'object')
    ? (raw.quadrants as QuadrantCanvasState['quadrants'])
    : { '1': '', '2': '', '3': '', '4': '' };

  const xAxis = (raw.xAxis && typeof raw.xAxis === 'object')
    ? (raw.xAxis as QuadrantCanvasState['xAxis'])
    : { leftText: '', rightText: '' };

  const yAxis = (raw.yAxis && typeof raw.yAxis === 'object')
    ? (raw.yAxis as QuadrantCanvasState['yAxis'])
    : { topText: '', bottomText: '' };

  // 旧版坐标 0-100 迁移到 0-1 归一化
  let points: QuadrantPoint[] = [];
  if (Array.isArray(raw.points)) {
    points = (raw.points as QuadrantPoint[]).map((p) => ({
      label: p.label,
      x: p.x > 1 ? p.x / 100 : p.x,  // 旧版 0-100 迁移到 0-1
      y: p.y > 1 ? p.y / 100 : p.y,
      className: p.className,
      style: p.style,
      radius: p.radius,
    }));
  }

  return {
    diagramType: 'quadrantChart',
    title: typeof raw.title === 'string' ? raw.title : undefined,
    accTitle: typeof raw.accTitle === 'string' ? raw.accTitle : undefined,
    accDescription: typeof raw.accDescription === 'string' ? raw.accDescription : undefined,
    quadrants,
    xAxis,
    yAxis,
    points,
    classDefs: Array.isArray(raw.classDefs) ? (raw.classDefs as StateClassDefInfo[]) : undefined,
  };
}

function migrateXYChartCanvasState(raw: Record<string, unknown>): XYChartCanvasState {
  // 旧版 'category' 轴类型迁移到 'band'
  const migrateAxis = (axis: unknown): XYAxis => {
    if (!axis || typeof axis !== 'object') {
      return { type: 'linear' };
    }
    const a = axis as Record<string, unknown>;
    const type = a.type === 'category' ? 'band' : (a.type === 'band' || a.type === 'linear' ? a.type : 'linear');
    return {
      type: type as 'band' | 'linear',
      title: typeof a.title === 'string' ? a.title : undefined,
      min: typeof a.min === 'number' ? a.min : undefined,
      max: typeof a.max === 'number' ? a.max : undefined,
      categories: Array.isArray(a.categories) ? (a.categories as string[]) : undefined,
      data: Array.isArray(a.data) ? (a.data as number[]) : undefined,
    };
  };

  return {
    diagramType: 'xychart',
    title: typeof raw.title === 'string' ? raw.title : undefined,
    accTitle: typeof raw.accTitle === 'string' ? raw.accTitle : undefined,
    accDescription: typeof raw.accDescription === 'string' ? raw.accDescription : undefined,
    orientation: typeof raw.orientation === 'string' ? (raw.orientation as 'horizontal' | 'vertical') : undefined,
    showDataLabel: typeof raw.showDataLabel === 'boolean' ? raw.showDataLabel : undefined,
    plotColorPalette: typeof raw.plotColorPalette === 'string' ? raw.plotColorPalette : undefined,
    xAxis: migrateAxis(raw.xAxis),
    yAxis: migrateAxis(raw.yAxis),
    series: Array.isArray(raw.series) ? (raw.series as XYSeries[]) : [],
    classDefs: Array.isArray(raw.classDefs) ? (raw.classDefs as StateClassDefInfo[]) : undefined,
  };
}

// ============================================================
// 20. 画布内容来源和消费状态
// ============================================================

export type CanvasSource = 'user' | 'ai' | null;

export interface ConsumedState {
  consumed: boolean;
  lastConsumedAt: number | null;
  canvasSource: CanvasSource;
}

// ============================================================
// 21. 解析结果和序列化结果
// ============================================================

export interface ParseSuccessResult {
  success: true;
  canvas: CanvasState;
  errors: ParseError[];
}

export interface ParseFailureResult {
  success: false;
  canvas: CanvasState;
  errors: ParseError[];
}

export type ParseResult = ParseSuccessResult | ParseFailureResult;

export interface ParseError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  context?: string;
}

export interface SerializeResult {
  mermaid: string;
  errors: ParseError[];
}

// ============================================================
// 22. 多标签页视图类型
// ============================================================

export type ViewSource = 'user' | 'ai';

export interface ViewSummary {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  sessionId: string | null;
  source: ViewSource;
  diagramType: DiagramType;
}

export interface ViewContent {
  canvas: CanvasState;
  consumed: ConsumedState;
  viewport: Viewport;
}

export interface View extends ViewSummary, ViewContent {}

export interface ActiveViewPayload {
  viewId: string;
  canvas: CanvasState;
  consumed: ConsumedState;
  viewport: Viewport;
  title: string | null;
}

// ============================================================
// 20. 画布快照（Editor → WebEditor 通信）
// ============================================================

/** 画布快照（图结构类型，用于 onCanvasEdit 回调传递） */
export interface CanvasSnapshot {
  nodes: MermaidNode[];
  edges: MermaidEdge[];
  direction: FlowchartDirection;
  /** architecture 等类型的元数据（如 groups） */
  metadata?: GraphMetadata;
  /** 原始 Mermaid 代码（用于增量序列化保留格式） */
  rawCode?: string;
  /**
   * 是否需要自动布局。可选字段，默认 false/undefined 表示位置已确定。
   * GraphCanvas 布局完成后应回传 needsLayout: false，防止服务端/其他客户端再次布局。
   */
  needsLayout?: boolean;
}

// ============================================================
// 21. WebSocket 通信协议类型
// ============================================================

/** 消费状态 WebSocket 载荷 */
export interface ConsumedPayload {
  consumed: boolean;
  lastConsumedAt: number | null;
  canvasSource: CanvasSource;
}

/** 视口 WebSocket 载荷 */
export interface ViewportPayload {
  viewport: Viewport;
}

/** 视图列表更新 WebSocket 载荷 */
export interface ViewsUpdatePayload {
  views: ViewSummary[];
  activeViewId: string | null;
}

/** 重连全量同步 WebSocket 载荷 */
export interface ReconnectSyncPayload {
  views: ViewSummary[];
  activeViewId: string | null;
  activeView: ActiveViewPayload | null;
}

/** 视图状态原子更新载荷（列表 + 活动视图内容一并同步） */
export interface ViewsStateUpdatePayload {
  views: ViewSummary[];
  activeViewId: string | null;
  activeView: ActiveViewPayload | null;
}

/** MCP 工具共享的 workspaceRoot 参数 */
export interface WorkspaceRootArgs {
  /** 工作区根目录。支持 Unicode；若省略，则从 x-workspace-root header 读取 */
  workspaceRoot?: string;
}

/** 服务端 → 客户端 WebSocket 消息 */
export type WsServerMessage =
  | { type: 'canvas_update'; payload: CanvasState; timestamp: number }
  | { type: 'consumed_update'; payload: ConsumedPayload; timestamp: number }
  | { type: 'viewport_update'; payload: ViewportPayload; timestamp: number }
  | { type: 'views_update'; payload: ViewsUpdatePayload; timestamp: number }
  | { type: 'active_view_update'; payload: ActiveViewPayload; timestamp: number }
  | { type: 'views_state_update'; payload: ViewsStateUpdatePayload; timestamp: number }
  | { type: 'reconnect_sync'; payload: ReconnectSyncPayload; timestamp: number };

/** 客户端 → 服务端 WebSocket 消息 */
export type WsClientMessage =
  | { type: 'canvas_edit'; payload: CanvasState }
  | { type: 'reset_consumed' }
  | { type: 'viewport_edit'; payload: ViewportPayload }
  | { type: 'switch_view'; viewId: string }
  | { type: 'create_view'; payload?: { title?: string | null } }
  | { type: 'close_view'; viewId: string }
  | { type: 'rename_view'; viewId: string; title: string }
  | { type: 'reorder_views'; orderedIds: string[] };
