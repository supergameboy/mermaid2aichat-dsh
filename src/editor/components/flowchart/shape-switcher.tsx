/**
 * 形状切换器 — 选中节点后切换形状
 *
 * 单一职责：提供形状选择 UI，触发 onChange 回调
 *
 * 数据流:
 *   MermaidNode.data.shape → ShapeSwitcher → onChange(newShape) → 更新 CanvasState
 */

import { memo } from 'react';
import type { MermaidShapeType } from '@mermaid2aichat/serializer';

// ============================================================
// 类型
// ============================================================

export interface ShapeSwitcherProps {
  /** 当前形状 */
  currentShape: MermaidShapeType;
  /** 切换形状回调 */
  onChange: (shape: MermaidShapeType) => void;
}

// ============================================================
// 常量
// ============================================================

/** flowchart 常用形状列表（按官方 jison 语法分组） */
const SHAPE_GROUPS: { group: string; shapes: { value: MermaidShapeType; label: string; syntax: string }[] }[] = [
  {
    group: '基本形状',
    shapes: [
      { value: 'rect', label: '矩形', syntax: 'id[文本]' },
      { value: 'rounded', label: '圆角矩形', syntax: 'id(文本)' },
      { value: 'stadium', label: '体育场形', syntax: 'id([文本])' },
      { value: 'ellipse', label: '椭圆', syntax: 'id(-文本-)' },
      { value: 'circle', label: '圆形', syntax: 'id((文本))' },
      { value: 'doublecircle', label: '双圆', syntax: 'id(((文本)))' },
      { value: 'diamond', label: '菱形', syntax: 'id{文本}' },
      { value: 'hexagon', label: '六边形', syntax: 'id{{文本}}' },
    ],
  },
  {
    group: '特殊形状',
    shapes: [
      { value: 'subroutine', label: '子程序', syntax: 'id[[文本]]' },
      { value: 'cylinder', label: '圆柱体', syntax: 'id[(文本)]' },
      { value: 'odd', label: '奇形', syntax: 'id>文本]' },
      { value: 'trapezoid', label: '梯形', syntax: 'id[/文本/]' },
      { value: 'trapezoid-reverse', label: '倒梯形', syntax: 'id[\\文本\\]' },
      { value: 'lean-right', label: '右倾斜', syntax: 'id[/文本\\]' },
      { value: 'lean-left', label: '左倾斜', syntax: 'id[\\文本/]' },
    ],
  },
  {
    group: '扩展形状',
    shapes: [
      { value: 'text', label: '文本块', syntax: 'text' },
      { value: 'document', label: '文档', syntax: 'document' },
      { value: 'note', label: '便签', syntax: 'note' },
      { value: 'triangle', label: '三角形', syntax: 'triangle' },
      { value: 'cloud', label: '云形', syntax: 'cloud' },
      { value: 'bang', label: '爆炸形', syntax: 'bang' },
      { value: 'fork-join', label: 'Fork/Join', syntax: 'fork-join' },
      { value: 'hourglass', label: '沙漏', syntax: 'hourglass' },
      { value: 'lightning-bolt', label: '闪电', syntax: 'lightning-bolt' },
    ],
  },
];

// ============================================================
// 组件
// ============================================================

export const ShapeSwitcher = memo(function ShapeSwitcher({
  currentShape,
  onChange,
}: ShapeSwitcherProps) {
  return (
    <div className="shape-switcher">
      <h4 className="shape-switcher-title">切换形状</h4>

      {SHAPE_GROUPS.map((group) => (
        <div key={group.group} className="shape-switcher-group">
          <span className="shape-switcher-group-label">{group.group}</span>
          <div className="shape-switcher-grid">
            {group.shapes.map((shape) => {
              const isActive = currentShape === shape.value;
              return (
                <button
                  key={shape.value}
                  title={shape.syntax}
                  onClick={() => onChange(shape.value)}
                  className={`shape-switcher-item ${isActive ? 'shape-switcher-item-active' : ''}`}
                >
                  {shape.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});
