/**
 * sequence 编辑面板入口 — 时序图专用属性编辑器 + 右键菜单统一导出
 *
 * 单一职责：导出时序图各元素的属性编辑面板组件 + 通用右键菜单组件
 */

export { ParticipantEditor } from './participant-editor.js';
export type { ParticipantEditorProps } from './participant-editor.js';

export { MessageEditor } from './message-editor.js';
export type { MessageEditorProps } from './message-editor.js';

export { NoteEditor } from './note-editor.js';
export type { NoteEditorProps } from './note-editor.js';

export { BlockEditor } from './block-editor.js';
export type { BlockEditorProps } from './block-editor.js';

export { BoxEditor } from './box-editor.js';
export type { BoxEditorProps } from './box-editor.js';

// B4.3：通用右键菜单组件
export { ContextMenu } from './context-menu.js';
export type { ContextMenuProps, ContextMenuItem } from './context-menu.js';
