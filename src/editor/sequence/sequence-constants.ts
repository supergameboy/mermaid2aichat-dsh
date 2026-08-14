/**
 * Sequence 布局常量 — 对齐官方 mermaid config.schema.yaml sequence 默认值
 *
 * 单一职责：定义 sequence 图布局的几何常量，作为 SequenceBounds 类的计算基准
 *
 * 与官方的差异：
 *   - 移除 getConfig 依赖（使用本文件默认常量，对齐官方默认值）
 *   - 适配 TypeScript 严格模式（const 断言确保字面量类型）
 *
 * 来源：B3 设计文档 sequence-constants.ts 接口签名
 */

/**
 * 官方 sequence 布局默认常量
 *
 * 对齐 mermaid packages/mermaid/src/config.schema.yaml sequence 默认值：
 *   - activationWidth: 激活矩形宽度
 *   - diagramMarginX/Y: 图表边距
 *   - actorMargin: actor 之间间距
 *   - width/height: actor 默认宽高
 *   - boxMargin: 循环 box 外边距（嵌套缩进系数）
 *   - boxTextMargin: 循环 box 文本边距
 *   - noteMargin: note 边距
 *   - messageMargin: 消息间距
 *   - mirrorActors: 是否镜像底部 actor（P1-4 修复：对齐官方默认值 true）
 *   - wrap: 自动换行
 *   - labelBoxWidth/Height: 循环 label box 尺寸
 *   - bottomMarginAdj: 底部边距调整（mirrorActors=true 时 height 计算用）
 */
export const SEQUENCE_LAYOUT_CONFIG = {
  activationWidth: 10,
  diagramMarginX: 50,
  diagramMarginY: 10,
  actorMargin: 50,
  width: 150,
  height: 65,
  boxMargin: 10,
  boxTextMargin: 5,
  noteMargin: 10,
  messageMargin: 35,
  mirrorActors: true, // P1-4 修复：对齐官方默认值 true，完全对齐官方标准形式渲染
  wrap: false,
  labelBoxWidth: 50,
  labelBoxHeight: 20,
  bottomMarginAdj: 1, // 对齐官方默认值（mirrorActors=true 时 height = boxHeight + 2*diagramMarginY - boxMargin + bottomMarginAdj）
} as const;

/** central-connection 渲染常量（B3.4 渲染层使用，B3.1 一并定义以便统一管理） */
export const CENTRAL_CONNECTION_CIRCLE_OFFSET = 16.5;
export const CENTRAL_CONNECTION_BASE_OFFSET = 4;
export const CENTRAL_CONNECTION_BIDIRECTIONAL_OFFSET = 6;

/**
 * 布局配置类型（便于注入测试配置或后续扩展）
 *
 * 设计偏差修订（B3.1 实现）：原设计文档为 `typeof SEQUENCE_LAYOUT_CONFIG`（readonly 字面量类型），
 * 实际测试和 B3.2 扩展需要注入自定义配置（如 boxMargin: 20）。
 * 改为 interface，字段类型为 number（保留 readonly 性质），允许注入自定义配置。
 * 设计文档将在 B3.1 完成后统一修订。
 */
export interface SequenceLayoutConfig {
  readonly activationWidth: number;
  readonly diagramMarginX: number;
  readonly diagramMarginY: number;
  readonly actorMargin: number;
  readonly width: number;
  readonly height: number;
  readonly boxMargin: number;
  readonly boxTextMargin: number;
  readonly noteMargin: number;
  readonly messageMargin: number;
  readonly mirrorActors: boolean;
  readonly wrap: boolean;
  readonly labelBoxWidth: number;
  readonly labelBoxHeight: number;
  readonly bottomMarginAdj: number;
}
