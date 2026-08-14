/**
 * class 边组件注册表 — 统一导出 class 边组件和注册表
 *
 * 单一职责：导出 classDiagram 的边组件，提供 edgeTypes 注册表
 */

export { ClassEdgeComponent } from './class-edge.js';
export { NoteEdgeComponent } from './note-edge.js';

import type { EdgeTypes } from '@xyflow/react';
import { ClassEdgeComponent } from './class-edge.js';
import { NoteEdgeComponent } from './note-edge.js';

/** class 边类型注册表 */
export const classEdgeTypes: EdgeTypes = {
  'class-relation': ClassEdgeComponent,
  'note-edge': NoteEdgeComponent,
  // 兼容 default/smoothstep 类型名（React Flow 默认类型）
  default: ClassEdgeComponent,
  smoothstep: ClassEdgeComponent,
};
