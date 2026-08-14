/**
 * 边样式编辑器 — 编辑边的箭头类型、线型、曲线类型、动画
 *
 * 单一职责：提供边样式编辑 UI，触发 onChange 回调
 *
 * 数据流:
 *   MermaidEdge.data.edgeStyle + interpolate + animate → EdgeStyleEditor
 *     → onChange(updates) → 更新 CanvasState
 *
 * 支持的编辑:
 *   - 箭头类型（16 种 MermaidEdgeStyle）
 *   - 曲线类型（13 种 interpolate）
 *   - 边动画（animate true/false）
 *   - 边标签
 */

import { memo, useState, useEffect } from 'react';
import type { MermaidEdge, MermaidEdgeStyle } from '@mermaid2aichat/serializer';

// ============================================================
// 类型
// ============================================================

export interface EdgeStyleEditorProps {
  /** 当前编辑的边 */
  edge: MermaidEdge;
  /** 更新边属性 */
  onChange: (updates: Partial<MermaidEdge>) => void;
}

// ============================================================
// 常量
// ============================================================

/** 箭头/线型选项（16 种） */
const EDGE_STYLE_OPTIONS: { value: MermaidEdgeStyle; label: string; group: string }[] = [
  // 单端 - 实线
  { value: 'line', label: '实线 无箭头', group: '实线' },
  { value: 'arrow', label: '实线 箭头', group: '实线' },
  { value: 'cross', label: '实线 十字', group: '实线' },
  { value: 'circle', label: '实线 圆圈', group: '实线' },
  // 单端 - 粗实线
  { value: 'thick-line', label: '粗实线 无箭头', group: '粗实线' },
  { value: 'thick-arrow', label: '粗实线 箭头', group: '粗实线' },
  { value: 'thick-cross', label: '粗实线 十字', group: '粗实线' },
  { value: 'thick-circle', label: '粗实线 圆圈', group: '粗实线' },
  // 单端 - 点线
  { value: 'dotted', label: '点线 无箭头', group: '点线' },
  { value: 'dotted-arrow', label: '点线 箭头', group: '点线' },
  { value: 'dotted-cross', label: '点线 十字', group: '点线' },
  { value: 'dotted-circle', label: '点线 圆圈', group: '点线' },
  // 双端
  { value: 'bidirectional-arrow', label: '双向 箭头', group: '双端' },
  { value: 'bidirectional-cross', label: '双向 十字', group: '双端' },
  { value: 'bidirectional-circle', label: '双向 圆圈', group: '双端' },
  // 特殊
  { value: 'invisible', label: '不可见线', group: '特殊' },
];

/** 曲线类型选项（13 种） */
const CURVE_OPTIONS: { value: string; label: string }[] = [
  { value: 'linear', label: '直线 (linear)' },
  { value: 'basis', label: '基础曲线 (basis)' },
  { value: 'cardinal', label: '基数曲线 (cardinal)' },
  { value: 'catmullRom', label: 'Catmull-Rom' },
  { value: 'monotoneX', label: '单调X (monotoneX)' },
  { value: 'monotoneY', label: '单调Y (monotoneY)' },
  { value: 'natural', label: '自然曲线 (natural)' },
  { value: 'bumpX', label: '凸X (bumpX)' },
  { value: 'bumpY', label: '凸Y (bumpY)' },
  { value: 'step', label: '阶梯 (step)' },
  { value: 'stepAfter', label: '阶梯后 (stepAfter)' },
  { value: 'stepBefore', label: '阶梯前 (stepBefore)' },
  { value: 'rounded', label: '圆角阶梯 (rounded)' },
];

// ============================================================
// 组件
// ============================================================

export const EdgeStyleEditor = memo(function EdgeStyleEditor({
  edge,
  onChange,
}: EdgeStyleEditorProps) {
  const [label, setLabel] = useState(edge.data.label ?? '');

  // 同步外部更新
  useEffect(() => {
    setLabel(edge.data.label ?? '');
  }, [edge.data.label]);

  const handleLabelCommit = () => {
    if (label !== (edge.data.label ?? '')) {
      onChange({
        data: { ...edge.data, label: label || undefined },
      });
    }
  };

  const handleStyleChange = (value: MermaidEdgeStyle) => {
    onChange({
      data: { ...edge.data, edgeStyle: value },
    });
  };

  const handleCurveChange = (value: string) => {
    onChange({
      data: { ...edge.data, interpolate: value },
    });
  };

  const handleAnimateToggle = (animate: boolean) => {
    onChange({
      data: { ...edge.data, animate },
    });
  };

  // 按 group 分组
  const groupedStyles = EDGE_STYLE_OPTIONS.reduce<Record<string, typeof EDGE_STYLE_OPTIONS>>((acc, opt) => {
    if (!acc[opt.group]) acc[opt.group] = [];
    acc[opt.group].push(opt);
    return acc;
  }, {});

  return (
    <div className="edge-style-editor">
      <h4 className="editor-title">边样式</h4>

      {/* 边标签 */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span className="editor-section-label">标签</span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleLabelCommit}
          onKeyDown={(e) => e.key === 'Enter' && handleLabelCommit()}
          placeholder="边标签文本"
          className="editor-input"
        />
      </label>

      {/* 箭头/线型 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span className="editor-section-label">箭头/线型</span>
        <select
          value={edge.data.edgeStyle}
          onChange={(e) => handleStyleChange(e.target.value as MermaidEdgeStyle)}
          className="editor-select"
        >
          {Object.entries(groupedStyles).map(([group, opts]) => (
            <optgroup key={group} label={group}>
              {opts.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* 曲线类型 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span className="editor-section-label">曲线类型 (interpolate)</span>
        <select
          value={edge.data.interpolate ?? ''}
          onChange={(e) => handleCurveChange(e.target.value)}
          className="editor-select"
        >
          <option value="">默认 (Bezier)</option>
          {CURVE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* 动画 */}
      <label className="editor-checkbox-label">
        <input
          type="checkbox"
          checked={edge.data.animate === true}
          onChange={(e) => handleAnimateToggle(e.target.checked)}
        />
        <span>边动画 (animate true)</span>
      </label>
    </div>
  );
});


