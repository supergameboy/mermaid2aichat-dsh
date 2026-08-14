/**
 * Mermaid 反向编辑器 — 画布组件库（DSH 插件内部）
 *
 * 提供 Canvas 组件（封装 React Flow 画布、节点库、工具栏、属性面板等 UI），
 * 由 DSH 面板通过 CanvasProps 注入状态和回调。仅支持四种图表类型：
 * flowchart / sequenceDiagram / classDiagram / erDiagram。
 */
export { Canvas } from './canvas.js';
export type { CanvasDispatcherProps } from './canvas.js';
export { GraphCanvas } from './graph-canvas.js';
export type { GraphCanvasProps } from './graph-canvas.js';
export { SequenceCanvas } from './sequence/sequence-canvas.js';
export type { SequenceCanvasProps } from './sequence/sequence-canvas.js';
export { Toolbar, SUPPORTED_DIAGRAM_TYPES } from './components/toolbar.js';
export { NodeLibrary } from './components/node-library.js';
export { getTemplatesForDiagramType, getTemplate, isTemplateSupported, NODE_TEMPLATES } from './components/node-templates.js';
export type { NodeTemplate } from './components/node-templates.js';
export { PropertyPanel } from './components/property-panel.js';
export { InlineEditor } from './components/inline-editor.js';
export { CodeEditor } from './components/code-editor.js';
export { TypeSwitchDialog } from './components/type-switch-dialog.js';
export { ToastContainer } from './components/toast.js';

// 节点/边组件导出
export { getNodeTypes } from './nodes/index.js';
export { getEdgeTypes } from './edges/index.js';
export { getLayoutFn } from './layouts/index.js';

// 类型导出
export type {
  CanvasProps,
  CanvasSnapshot,
  CanvasChangePayload,
} from './types.js';
