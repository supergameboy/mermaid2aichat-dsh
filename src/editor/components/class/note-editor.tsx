/**
 * NoteEditor — classDiagram 注释编辑面板（节点编辑模式 + 两者都支持关联表达）
 *
 * 单一职责：编辑选中 note 节点的 data.label（text），选择关联 class（双向同步 note-edge）
 *
 * M3 重构模块5 L2-7：
 *   - 从 metadata.classNotes 数组模式重构为节点编辑模式
 *   - 编辑选中 note 节点的 data.label（text，textarea）
 *   - 关联 class 通过 select 表单选择（onSelectClassId → property-panel 创建/更新/删除 note-edge）
 *   - 也支持画布拖拽连线（onConnect 创建 note-edge，表单自动更新）
 *   - 双向同步：画布连线变化 → 表单更新；表单选择变化 → 画布连线更新
 *   - 数据源统一为 note-edge 连线（单一数据源）
 *   - 无创建/删除按钮（通过节点库拖拽创建 + 选中删除）
 *
 * 数据流:
 *   noteNode + associatedClassId + classOptions → NoteEditor
 *     → onUpdate(Partial<MermaidNodeData>) 编辑 text
 *     → onSelectClassId(classId | undefined) 创建/更新/删除 note-edge
 *
 * 关联表达（对齐设计点2 + 用户决策"两者都支持"）:
 *   - 画布连线：用户拖拽 note→class 创建 note-edge（onConnect，模块4 已覆盖）
 *   - 表单选择：用户在 select 选择 class（onSelectClassId，property-panel handleSelectNoteClassId）
 *   - 数据源：note-edge 连线（property-panel 从 edges 推断 associatedClassId 用于表单回显）
 */

import { memo } from 'react';
import type { MermaidNode } from '@mermaid2aichat/serializer';

// ============================================================
// Props
// ============================================================

export interface NoteEditorProps {
  /** 当前选中的 note 节点（type='class-note'） */
  readonly noteNode: MermaidNode;
  /** 从 note-edge 推断的关联 classId（用于表单 select 当前值） */
  readonly associatedClassId: string | undefined;
  /** 可选 class 列表（从 nodes 过滤 type==='class-box' 构建） */
  readonly classOptions: readonly { id: string; label: string }[];
  /** 编辑 note 文本（走 onUpdateNode） */
  readonly onUpdate: (data: Partial<MermaidNode['data']>) => void;
  /** 选择关联 class（property-panel 负责 handleSelectNoteClassId 创建/更新/删除 note-edge） */
  readonly onSelectClassId: (classId: string | undefined) => void;
}

// ============================================================
// 组件
// ============================================================

/** 注释编辑面板组件 — 节点编辑模式 */
export const NoteEditor = memo(function NoteEditor({
  noteNode,
  associatedClassId,
  classOptions,
  onUpdate,
  onSelectClassId,
}: NoteEditorProps) {
  const label = noteNode.data.label ?? '';

  return (
    <div className="panel-content">
      <div className="panel-section-title">注释</div>

      {/* 注释文本 */}
      <label className="panel-label">
        注释文本
        <textarea
          className="panel-input"
          rows={3}
          value={label}
          placeholder="输入注释内容"
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </label>

      {/* 关联类（双向同步 note-edge） */}
      <label className="panel-label">
        关联类
        <select
          className="panel-select"
          value={associatedClassId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onSelectClassId(v || undefined);
          }}
        >
          <option value="">（无）</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </label>

      <div className="panel-info">
        <span className="info-label">ID:</span>
        <span className="info-value">{noteNode.id}</span>
      </div>
    </div>
  );
});
