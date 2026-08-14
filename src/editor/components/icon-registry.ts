/**
 * IconRegistry — 统一 Icon 注册表
 *
 * 单一职责：按 diagramType 管理 icon 列表，提供查询和搜索能力
 *
 * 设计要点:
 *   - 全局单例 iconRegistry
 *   - 各图模块通过 register(diagramType, icons) 注册
 *   - M0 阶段注册 architecture 的 12 个 icon（复用现有 architecture-icons.tsx）
 *   - mindmap 等其他图的 icon 在各图模块注册
 *
 * 数据流:
 *   IconRegistry.getIcons(diagramType) → IconDefinition[] → IconPicker 渲染
 */

import type { JSX } from 'react';
import type { DiagramType } from '@mermaid2aichat/serializer';

// ============================================================
// 类型
// ============================================================

/** Icon 定义 */
export interface IconDefinition {
  /** icon 唯一标识（如 'database'/'cloud'） */
  name: string;
  /** 显示名称（如 '数据库'） */
  label: string;
  /** SVG 渲染函数（接收颜色，返回 JSX 子元素，不含外层 <svg>） */
  render: (color: string) => JSX.Element;
  /** SVG viewBox（默认 '0 0 24 24'） */
  viewBox?: string;
}

// ============================================================
// IconRegistry 实现
// ============================================================

/**
 * Icon 注册表（按 diagramType 分组）
 *
 * 设计要点:
 *   - 按 diagramType 存储 icon 列表
 *   - 重复注册同 diagramType 会覆盖旧列表
 *   - search 支持按 name/label 模糊匹配
 */
export class IconRegistry {
  /** 内部存储：diagramType → icon 列表 */
  private readonly iconsByType = new Map<DiagramType, IconDefinition[]>();

  /**
   * 注册 icon 集
   * 同 diagramType 重复注册会覆盖旧列表
   */
  register(diagramType: DiagramType, icons: IconDefinition[]): void {
    this.iconsByType.set(diagramType, [...icons]);
  }

  /**
   * 获取图类型的 icon 列表
   * @returns icon 列表（无注册返回空数组）
   */
  getIcons(diagramType: DiagramType): readonly IconDefinition[] {
    return this.iconsByType.get(diagramType) ?? [];
  }

  /**
   * 按关键字搜索 icon（匹配 name 或 label）
   * @param diagramType - 图表类型
   * @param keyword - 搜索关键字（空字符串返回全部）
   * @returns 匹配的 icon 列表
   */
  search(diagramType: DiagramType, keyword: string): IconDefinition[] {
    const all = this.getIcons(diagramType);
    if (!keyword.trim()) {
      return [...all];
    }
    const lower = keyword.toLowerCase();
    return all.filter(
      (icon) =>
        icon.name.toLowerCase().includes(lower) ||
        icon.label.toLowerCase().includes(lower),
    );
  }

  /**
   * 检查图类型是否已注册 icon
   */
  hasIcons(diagramType: DiagramType): boolean {
    return (this.iconsByType.get(diagramType)?.length ?? 0) > 0;
  }
}

// ============================================================
// 全局实例
// ============================================================

/** 全局 icon 注册表实例（单一数据源） */
export const iconRegistry = new IconRegistry();
