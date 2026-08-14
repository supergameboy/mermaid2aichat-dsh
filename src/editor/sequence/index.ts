/**
 * sequence 模块入口 — 时序图渲染组件统一导出
 *
 * 单一职责：导出时序图专用渲染组件（不使用 React Flow）
 */

export { SequenceCanvas } from './sequence-canvas.js';
export type { SequenceCanvasProps } from './sequence-canvas.js';

export { ParticipantRow } from './participant-row.js';
export { MessageRow } from './message-row.js';
export { NoteRow } from './note-row.js';
export { BlockFrame } from './block-frame.js';
export { BoxFrame } from './box-frame.js';
export { Lifeline } from './lifeline.js';
export { ActivationBar } from './activation-bar.js';

// B3.4：箭头 marker 定义 + 类型映射（9 个 marker，策略B 多类型共用）
export { SequenceArrowMarkers, getArrowMarkerConfig } from './arrow-markers.js';
export type { ArrowMarkerConfig } from './arrow-markers.js';

// B3.4：central-connection 圆形节点渲染（v11：派生映射 + 渲染组件）
export { CentralConnectionRender, deriveCentralConnectionType } from './central-connection-render.js';
export type { CentralConnectionType, CentralConnectionRenderProps } from './central-connection-render.js';

// 渲染尺寸常量导出（B3.3 改造后仅保留 4 个渲染尺寸，布局坐标常量已删除）
export {
  NOTE_WIDTH,
  NOTE_HEIGHT,
  BLOCK_LABEL_HEIGHT,
  BOX_LABEL_HEIGHT,
} from './layout-constants.js';

// 画布背景 + 缩略图（统一化重构新增）
export { SequenceBackground } from './background.js';
export { SequenceMiniMap } from './minimap.js';
export type { SequenceMiniMapProps, SequenceMiniMapRect } from './minimap.js';

// 画布左下角帮助面板（B4.4 UI 帮助说明扩展）
export { CanvasHelpPanel } from './canvas-help-panel.js';
