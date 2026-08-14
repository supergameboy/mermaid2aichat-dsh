/**
 * AttributeEditor — erDiagram 实体属性编辑面板
 *
 * 单一职责：添加/编辑/删除实体的属性（NodeAttribute）
 *
 * 数据流:
 *   NodeAttribute[] → AttributeEditor → onChange(NodeAttribute[]) → 更新 CanvasState
 *
 * 字段约定（NodeAttribute）:
 *   - name: string          — 属性名
 *   - type: string          — 属性类型（如 string/int/varchar）
 *   - keys: ERAttributeKey[] — 键标记列表（PK/FK/UK，可多选）
 *   - comment?: string      — 注释
 */

import { memo } from 'react';
import type { NodeAttribute, ERAttributeKey } from '@mermaid2aichat/serializer';

export interface AttributeEditorProps {
  /** 当前属性列表 */
  attributes: NodeAttribute[];
  /** 更新回调 */
  onChange: (attributes: NodeAttribute[]) => void;
}

/** 键标记选项 */
const KEY_OPTIONS: { value: ERAttributeKey; label: string }[] = [
  { value: 'PK', label: 'PK 主键' },
  { value: 'FK', label: 'FK 外键' },
  { value: 'UK', label: 'UK 唯一键' },
];

/** 创建新属性 */
function createAttribute(): NodeAttribute {
  return {
    name: 'newAttr',
    type: 'string',
    keys: [],
    comment: '',
  };
}

/** 属性编辑面板组件 */
export const AttributeEditor = memo(function AttributeEditor({
  attributes,
  onChange,
}: AttributeEditorProps) {
  const updateAttribute = (index: number, patch: Partial<NodeAttribute>) => {
    const next = attributes.map((attr, i) => (i === index ? { ...attr, ...patch } : attr));
    onChange(next);
  };

  const addAttribute = () => {
    onChange([...attributes, createAttribute()]);
  };

  const removeAttribute = (index: number) => {
    onChange(attributes.filter((_, i) => i !== index));
  };

  /** 切换某个 key 的选中状态 */
  const toggleKey = (index: number, key: ERAttributeKey, checked: boolean) => {
    const attr = attributes[index];
    const currentKeys = attr.keys;
    const nextKeys = checked
      ? [...currentKeys, key]
      : currentKeys.filter((k) => k !== key);
    updateAttribute(index, { keys: nextKeys });
  };

  return (
    <div className="panel-content">
      <div className="panel-section-title">实体属性</div>

      {attributes.map((attr, index) => (
        <div
          key={index}
          className="panel-attribute"
          style={{ border: '1px solid var(--color-border-hover)', padding: 'var(--space-2)', marginBottom: 'var(--space-2)', borderRadius: 'var(--radius-sm)' }}
        >
          {/* 属性类型 + 名称 */}
          <label className="panel-label">
            类型
            <input
              className="panel-input"
              type="text"
              value={attr.type}
              placeholder="如: string, int, varchar"
              onChange={(e) => updateAttribute(index, { type: e.target.value })}
            />
          </label>

          <label className="panel-label">
            名称
            <input
              className="panel-input"
              type="text"
              value={attr.name}
              onChange={(e) => updateAttribute(index, { name: e.target.value })}
            />
          </label>

          {/* 键标记复选框 */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
            {KEY_OPTIONS.map((opt) => (
              <label key={opt.value} className="panel-label panel-checkbox-row">
                <input
                  type="checkbox"
                  checked={attr.keys.includes(opt.value)}
                  onChange={(e) => toggleKey(index, opt.value, e.target.checked)}
                />
                {opt.label}
              </label>
            ))}
          </div>

          {/* 注释 */}
          <label className="panel-label">
            注释
            <input
              className="panel-input"
              type="text"
              value={attr.comment ?? ''}
              placeholder="如: 主键ID"
              onChange={(e) => updateAttribute(index, { comment: e.target.value || undefined })}
            />
          </label>

          {/* 删除按钮 */}
          <button
            type="button"
            className="panel-reset-btn"
            onClick={() => removeAttribute(index)}
            style={{ marginTop: 'var(--space-1)' }}
          >
            删除属性
          </button>
        </div>
      ))}

      {/* 添加按钮 */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <button type="button" className="panel-reset-btn" onClick={addAttribute}>
          添加属性
        </button>
      </div>
    </div>
  );
});

AttributeEditor.displayName = 'AttributeEditor';
