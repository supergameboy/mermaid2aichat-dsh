/**
 * class 专用 UI 组件注册表 — 统一导出编辑面板组件
 *
 * 单一职责：导出 classDiagram 各元素的属性编辑面板组件
 */

export { ClassEditor } from './class-editor.js';
export type { ClassEditorProps } from './class-editor.js';

export { MemberEditor } from './member-editor.js';
export type { MemberEditorProps } from './member-editor.js';

export { RelationEditor } from './relation-editor.js';
export type { RelationEditorProps } from './relation-editor.js';

export { NamespaceEditor } from './namespace-editor.js';
export type { NamespaceEditorProps } from './namespace-editor.js';

export { NoteEditor } from './note-editor.js';
export type { NoteEditorProps } from './note-editor.js';
