/**
 * EntityEditor — erDiagram 实体属性编辑面板
 *
 * 单一职责：编辑实体节点的名称、别名
 *
 * 数据流:
 *   MermaidNode → EntityEditor → onUpdate(Partial<MermaidNodeData>) → 更新 CanvasState
 *
 * 字段约定:
 *   - label: string        — 实体名（M0 定义）
 *   - alias?: string       — 实体别名（er 专用，通过索引签名承载）
 */

import { memo } from 'react';
import type { MermaidNode } from '@mermaid2aichat/serializer';

export interface EntityEditorProps {
  /** 当前编辑的实体节点 */
  entityNode: MermaidNode;
  /** 更新回调 */
  onUpdate: (data: Partial<MermaidNode['data']>) => void;
}

/** 实体编辑面板组件 */
export const EntityEditor = memo(function EntityEditor({
  entityNode,
  onUpdate,
}: EntityEditorProps) {
  const data = entityNode.data;
  const alias = data.alias ?? '';

  return (
    <div className="panel-content">
      {/* 实体名称 */}
      <label className="panel-label">
        实体名称
        <input
          className="panel-input"
          type="text"
          value={data.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </label>

      {/* 别名 */}
      <label className="panel-label">
        别名
        <input
          className="panel-input"
          type="text"
          value={alias}
          placeholder="如: usr（显示为 (usr)）"
          onChange={(e) => onUpdate({ alias: e.target.value || undefined })}
        />
      </label>

      <div className="panel-info">
        <span className="info-label">ID:</span>
        <span className="info-value">{entityNode.id}</span>
      </div>
    </div>
  );
});

EntityEditor.displayName = 'EntityEditor';
