/**
 * er 专用 UI 组件注册表 — 统一导出编辑面板组件
 *
 * 单一职责：导出 erDiagram 各元素的属性编辑面板组件
 */

export { EntityEditor } from './entity-editor.js';
export type { EntityEditorProps } from './entity-editor.js';

export { AttributeEditor } from './attribute-editor.js';
export type { AttributeEditorProps } from './attribute-editor.js';

export { RelationshipEditor } from './relationship-editor.js';
export type { RelationshipEditorProps } from './relationship-editor.js';

export { ErSubgraphEditor } from './er-subgraph-editor.js';
export type { ErSubgraphEditorProps } from './er-subgraph-editor.js';

export { ClassDefEditor } from './class-def-editor.js';
export type { ClassDefEditorProps } from './class-def-editor.js';

export { ClassDefPreview } from './class-def-preview.js';
export type { ClassDefPreviewProps } from './class-def-preview.js';

export { StyleInheritanceGraph } from './style-inheritance-graph.js';
export type { StyleInheritanceGraphProps } from './style-inheritance-graph.js';
