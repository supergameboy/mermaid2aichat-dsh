/**
 * class 节点组件注册表 — 统一导出 class 节点组件和注册表
 *
 * 单一职责：导出 classDiagram 的节点组件，提供 nodeTypes 注册表
 */

export { ClassBoxComponent } from './class-box.js';
export type { ClassBoxFlowNode } from './class-box.js';
export { NoteNodeComponent } from './note-node.js';
export type { NoteFlowNode } from './note-node.js';
export { NamespaceNodeComponent } from './namespace-node.js';
export type { NamespaceFlowNode } from './namespace-node.js';

import type { NodeTypes } from '@xyflow/react';
import { ClassBoxComponent } from './class-box.js';
import { NoteNodeComponent } from './note-node.js';
import { NamespaceNodeComponent } from './namespace-node.js';

/** class 节点类型注册表 — key 必须与 Converter 创建的 node.type 一致 */
export const classNodeTypes: NodeTypes = {
  'class-box': ClassBoxComponent,
  'class-note': NoteNodeComponent,
  'class-namespace': NamespaceNodeComponent,
};
