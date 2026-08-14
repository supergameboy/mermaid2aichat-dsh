/**
 * RelationshipEditor — erDiagram 关系属性编辑面板
 *
 * 单一职责：编辑关系边的基数、关系类型、角色标签
 *
 * M4 重构模块5 L2-1：
 *   - 从旧字段（cardinality.from/to + erRole）迁移到模块2 新字段
 *   - 对齐模块2 MermaidEdgeData：erCardA/erCardB/erRoleA/erIdentification
 *   - erCardA → A 端基数（source 端，5 种含 md-parent）
 *   - erCardB → B 端基数（target 端，4 种排除 md-parent）
 *   - erRoleA → 角色标签（关系标签）
 *   - erIdentification → 关系类型（identifying/non-identifying）
 *
 * 数据流:
 *   MermaidEdge → RelationshipEditor → onUpdate(Partial<MermaidEdgeData>) → 更新 CanvasState
 *
 * 字段约定（模块2 重构后新字段）:
 *   - erCardA?: ERCardinality          — A 端基数（source 端）
 *   - erCardB?: ERCardinality          — B 端基数（target 端）
 *   - erRoleA?: string                 — A 端角色标签
 *   - erIdentification?: ERIdentification — 关系类型
 */

import { memo } from 'react';
import type { MermaidEdge, ERCardinality, ERIdentification } from '@mermaid2aichat/serializer';

export interface RelationshipEditorProps {
  /** 当前编辑的关系边 */
  relationshipEdge: MermaidEdge;
  /** 更新回调 */
  onUpdate: (data: Partial<MermaidEdge['data']>) => void;
}

/** A 端基数选项（5 种，source 端，含 md-parent）
 *
 * md-parent 仅 A 端有效：jison 语法 u(?=[.\-|]) 仅在 source 端匹配
 */
const CARDINALITY_A_OPTIONS: readonly { value: ERCardinality; label: string }[] = [
  { value: 'zero-or-one', label: '|o 零或一' },
  { value: 'zero-or-more', label: 'o{ 零或多' },
  { value: 'one-or-more', label: '|{ 一或多' },
  { value: 'only-one', label: '|| 仅一' },
  { value: 'md-parent', label: 'u 多对多父节点 (仅 A 端)' },
];

/** B 端基数选项（4 种，排除 md-parent）
 *
 * md-parent 在 B 端无效：jison 语法 u(?=[.\-|]) 只匹配后跟 -/./| 的 u，
 * 在 B 端 u 后跟空格，会被解析为 UNICODE_TEXT 而非 MD_PARENT。
 * 对齐 er-edge.tsx toMarkerEndUrl 的 md-parent B 端校验（抛程序错误）。
 */
const CARDINALITY_B_OPTIONS: readonly { value: ERCardinality; label: string }[] = [
  { value: 'zero-or-one', label: '|o 零或一' },
  { value: 'zero-or-more', label: 'o{ 零或多' },
  { value: 'one-or-more', label: '|{ 一或多' },
  { value: 'only-one', label: '|| 仅一' },
];

/** 关系类型选项（2 种，对齐模块2 ERIdentification） */
const IDENTIFICATION_OPTIONS: readonly { value: ERIdentification; label: string }[] = [
  { value: 'identifying', label: '标识关系 (-- 实线)' },
  { value: 'non-identifying', label: '非标识关系 (.. 虚线)' },
];

/** 关系编辑面板组件 — 消费模块2 新字段 erCardA/erCardB/erRoleA/erIdentification */
export const RelationshipEditor = memo(function RelationshipEditor({
  relationshipEdge,
  onUpdate,
}: RelationshipEditorProps) {
  const data = relationshipEdge.data;
  const cardA = data.erCardA ?? 'only-one';
  const cardB = data.erCardB ?? 'only-one';
  const identification = data.erIdentification ?? 'identifying';
  const roleA = data.erRoleA ?? '';

  return (
    <div className="panel-content">
      {/* source 实体（只读） */}
      <div className="panel-info">
        <span className="info-label">起始实体:</span>
        <span className="info-value">{relationshipEdge.source}</span>
      </div>

      {/* target 实体（只读） */}
      <div className="panel-info">
        <span className="info-label">目标实体:</span>
        <span className="info-value">{relationshipEdge.target}</span>
      </div>

      {/* A 端基数（source 端，含 md-parent） */}
      <label className="panel-label">
        基数（A 端 / 起始端）
        <select
          className="panel-select"
          value={cardA}
          onChange={(e) => {
            const value = e.target.value as ERCardinality;
            onUpdate({ erCardA: value });
          }}
        >
          {CARDINALITY_A_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* B 端基数（target 端，排除 md-parent） */}
      <label className="panel-label">
        基数（B 端 / 目标端）
        <select
          className="panel-select"
          value={cardB}
          onChange={(e) => {
            const value = e.target.value as ERCardinality;
            onUpdate({ erCardB: value });
          }}
        >
          {CARDINALITY_B_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 关系类型 */}
      <label className="panel-label">
        关系类型
        <select
          className="panel-select"
          value={identification}
          onChange={(e) => {
            const value = e.target.value as ERIdentification;
            onUpdate({ erIdentification: value });
          }}
        >
          {IDENTIFICATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 角色标签（erRoleA，对齐官方 erRenderer 的 relationshipLabelBox） */}
      <label className="panel-label">
        角色标签
        <input
          className="panel-input"
          type="text"
          value={roleA}
          placeholder="如: contains, owns"
          onChange={(e) => {
            const value = e.target.value;
            // erRoleA 是角色标签，同时更新 edge.label 供 EdgeLabelRenderer 渲染
            onUpdate({
              erRoleA: value || undefined,
              label: value || undefined,
            });
          }}
        />
      </label>

      <div className="panel-info">
        <span className="info-label">ID:</span>
        <span className="info-value">{relationshipEdge.id}</span>
      </div>
    </div>
  );
});

RelationshipEditor.displayName = 'RelationshipEditor';
