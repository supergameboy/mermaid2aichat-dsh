/**
 * IconPicker — 可搜索的 Icon 选择器
 *
 * 单一职责：从 IconRegistry 获取 icon 列表，提供搜索和选择能力
 *
 * 数据流:
 *   IconRegistry.getIcons(diagramType) → 搜索过滤 → 渲染网格 → 用户选择 → onChange
 */

import { useState, useMemo, type ReactElement } from 'react';
import type { DiagramType } from '@mermaid2aichat/serializer';
import { iconRegistry } from './icon-registry.js';

// ============================================================
// 类型
// ============================================================

export interface IconPickerProps {
  /** 当前图类型 */
  diagramType: DiagramType;
  /** 当前选中的 icon（null 表示未选中） */
  value: string | null;
  /** 选择 icon 回调 */
  onChange: (icon: string | null) => void;
  /** 是否允许清除（选择 null），默认 true */
  allowClear?: boolean;
}

// ============================================================
// 常量
// ============================================================

const ICON_SIZE = 28;
const ICON_COLOR = '#087ebf';

// ============================================================
// 组件实现
// ============================================================

/**
 * 可搜索的 icon 选择器
 *
 * 显示当前图类型支持的所有 icon，支持关键字搜索
 * 点击 icon 选中，再次点击取消选中
 */
export function IconPicker({
  diagramType,
  value,
  onChange,
  allowClear = true,
}: IconPickerProps): ReactElement {
  const [keyword, setKeyword] = useState('');

  const icons = useMemo(
    () => iconRegistry.search(diagramType, keyword),
    [diagramType, keyword],
  );

  const hasIcons = iconRegistry.hasIcons(diagramType);

  // 无 icon 注册时显示提示
  if (!hasIcons) {
    return (
      <div className="icon-picker-empty">
        <span>该图类型暂无可用 icon</span>
      </div>
    );
  }

  return (
    <div className="icon-picker">
      <input
        type="text"
        className="icon-picker-search"
        placeholder="搜索 icon..."
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      <div className="icon-picker-grid">
        {allowClear && (
          <button
            type="button"
            className={`icon-picker-item ${value === null ? 'selected' : ''}`}
            onClick={() => onChange(null)}
            title="无 icon"
          >
            <span className="icon-picker-none">∅</span>
          </button>
        )}
        {icons.map((icon) => (
          <button
            key={icon.name}
            type="button"
            className={`icon-picker-item ${value === icon.name ? 'selected' : ''}`}
            onClick={() => onChange(icon.name)}
            title={icon.label}
          >
            <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={icon.viewBox ?? '0 0 24 24'}>
              {icon.render(ICON_COLOR)}
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
