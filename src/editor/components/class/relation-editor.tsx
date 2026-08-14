/**
 * RelationEditor — classDiagram 关系属性编辑面板（双端字段）
 *
 * 单一职责：编辑关系边的双端类型、基数、线型、标签
 *
 * M3 重构模块5 L2-6：
 *   - 从单端字段（relationType/classCardinality.from/to）重构为双端字段
 *   - 对齐模块2 MermaidEdgeData：relationType1/relationType2/cardinality1/cardinality2/lineType/relationLabel
 *   - relationType1/2 是数值型（0-4 对齐 jison ClassDB）或 'none'（无 marker）
 *   - lineType 是 'line'/'dotted'（对齐 ClassLineType）
 *
 * 数据流:
 *   MermaidEdge → RelationEditor → onUpdate(Partial<MermaidEdgeData>) → 更新 CanvasState
 *
 * relationType 数值映射（对齐 jison ClassDB + 模块4 marker 映射）:
 *   0=AGGREGATION（空心菱形）, 1=EXTENSION（空心三角）, 2=COMPOSITION（实心菱形）,
 *   3=DEPENDENCY（箭头）, 4=LOLLIPOP（圆圈），'none'=无 marker
 */

import { memo } from 'react';
import type { MermaidEdge, ClassLineType } from '@mermaid2aichat/serializer';

// ============================================================
// 常量
// ============================================================

/** 关系类型选项（6 种，对齐模块2 MermaidEdgeData.relationType1/2 + 模块4 marker 映射） */
export const RELATION_TYPE_OPTIONS: readonly { value: number | 'none'; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 0, label: '聚合 (Aggregation ◇)' },
  { value: 1, label: '继承 (Extension △)' },
  { value: 2, label: '组合 (Composition ◆)' },
  { value: 3, label: '依赖 (Dependency →)' },
  { value: 4, label: '棒糖 (Lollipop ○)' },
];

/** 线型选项（2 种，对齐模块2 ClassLineType） */
export const LINE_TYPE_OPTIONS: readonly { value: ClassLineType; label: string }[] = [
  { value: 'line', label: '实线' },
  { value: 'dotted', label: '虚线' },
];

// ============================================================
// Props
// ============================================================

export interface RelationEditorProps {
  /** 当前编辑的关系边 */
  relation: MermaidEdge;
  /** 更新回调 */
  onUpdate: (data: Partial<MermaidEdge['data']>) => void;
}

// ============================================================
// 组件
// ============================================================

/** 关系编辑面板组件 — 双端字段 */
export const RelationEditor = memo(function RelationEditor({
  relation,
  onUpdate,
}: RelationEditorProps) {
  const data = relation.data;
  const relationType1 = data.relationType1 ?? 'none';
  const relationType2 = data.relationType2 ?? 'none';
  const cardinality1 = data.cardinality1 ?? '';
  const cardinality2 = data.cardinality2 ?? '';
  const lineType = data.lineType ?? 'line';
  const relationLabel = data.relationLabel ?? '';

  return (
    <div className="panel-content">
      {/* 起点关系类型（markerStart） */}
      <label className="panel-label">
        起点关系类型
        <select
          className="panel-select"
          value={String(relationType1)}
          onChange={(e) => {
            const v = e.target.value;
            const value: number | 'none' = v === 'none' ? 'none' : Number(v);
            onUpdate({ relationType1: value });
          }}
        >
          {RELATION_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={String(opt.value)}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 终点关系类型（markerEnd） */}
      <label className="panel-label">
        终点关系类型
        <select
          className="panel-select"
          value={String(relationType2)}
          onChange={(e) => {
            const v = e.target.value;
            const value: number | 'none' = v === 'none' ? 'none' : Number(v);
            onUpdate({ relationType2: value });
          }}
        >
          {RELATION_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={String(opt.value)}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 线型 */}
      <label className="panel-label">
        线型
        <select
          className="panel-select"
          value={lineType}
          onChange={(e) => onUpdate({ lineType: e.target.value as ClassLineType })}
        >
          {LINE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 基数（起始端） */}
      <label className="panel-label">
        基数（起始端）
        <input
          className="panel-input"
          type="text"
          value={cardinality1}
          placeholder="如: 1, 0..*, 1..1"
          onChange={(e) => {
            const v = e.target.value;
            onUpdate({ cardinality1: v || undefined });
          }}
        />
      </label>

      {/* 基数（目标端） */}
      <label className="panel-label">
        基数（目标端）
        <input
          className="panel-input"
          type="text"
          value={cardinality2}
          placeholder="如: 0..*, 1, 1..n"
          onChange={(e) => {
            const v = e.target.value;
            onUpdate({ cardinality2: v || undefined });
          }}
        />
      </label>

      {/* 关系标签 */}
      <label className="panel-label">
        关系标签
        <input
          className="panel-input"
          type="text"
          value={relationLabel}
          placeholder="如: places, owns"
          onChange={(e) => {
            const v = e.target.value;
            onUpdate({ relationLabel: v || undefined });
          }}
        />
      </label>

      <div className="panel-info">
        <span className="info-label">ID:</span>
        <span className="info-value">{relation.id}</span>
      </div>
      <div className="panel-info">
        <span className="info-label">连接:</span>
        <span className="info-value">{relation.source} → {relation.target}</span>
      </div>
    </div>
  );
});
