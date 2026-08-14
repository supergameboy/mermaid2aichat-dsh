/**
 * 右键菜单 — 画布右键菜单组件
 *
 * 单一职责：提供右键菜单 UI，触发对应回调
 *
 * 数据流:
 *   画布右键事件 → ContextMenu(position, selectedNodeIds)
 *     → onCreateSubgraph / onCreateSubgraphWithSelected / onClose
 *
 * 菜单项:
 *   - 创建 Subgraph（无选中节点时）
 *   - 创建 Subgraph 包含选中节点（有选中节点时）
 *   - 切换形状（有选中节点时，展开形状子菜单）
 */

import { memo, useEffect, useRef } from 'react';
import type { MermaidShapeType } from '@mermaid2aichat/serializer';

// ============================================================
// 类型
// ============================================================

export interface ContextMenuProps {
  /** 菜单显示位置（屏幕坐标） */
  position: { x: number; y: number };
  /** 当前选中的节点 ID 列表 */
  selectedNodeIds: string[];
  /** 创建 Subgraph（无选中节点） */
  onCreateSubgraph: () => void;
  /** 创建 Subgraph 包含选中节点 */
  onCreateSubgraphWithSelected: () => void;
  /** 切换选中节点形状（有选中节点时） */
  onSwitchShape?: (shape: MermaidShapeType) => void;
  /** 删除选中的普通节点 */
  onDeleteNode?: () => void;
  /** 删除当前子图节点 */
  onDeleteSubgraph?: () => void;
  /** 关闭菜单 */
  onClose: () => void;
}

// ============================================================
// 常量
// ============================================================

/** 常用形状快速切换 */
const QUICK_SHAPES: { value: MermaidShapeType; label: string }[] = [
  { value: 'rect', label: '矩形' },
  { value: 'rounded', label: '圆角矩形' },
  { value: 'circle', label: '圆形' },
  { value: 'diamond', label: '菱形' },
  { value: 'stadium', label: '体育场形' },
  { value: 'hexagon', label: '六边形' },
];

// ============================================================
// 组件
// ============================================================

export const ContextMenu = memo(function ContextMenu({
  position,
  selectedNodeIds,
  onCreateSubgraph,
  onCreateSubgraphWithSelected,
  onSwitchShape,
  onDeleteNode,
  onDeleteSubgraph,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const hasSelection = selectedNodeIds.length > 0;
  const canDeleteNode = hasSelection && onDeleteNode !== undefined;
  const canDeleteSubgraph = onDeleteSubgraph !== undefined;

  // 菜单打开时自动聚焦，支持失焦关闭
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  // 点击外部 / 按 Escape 关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!menuRef.current?.contains(e.relatedTarget as Node)) {
      onClose();
    }
  };

  const handleCreateSubgraph = () => {
    if (hasSelection) {
      onCreateSubgraphWithSelected();
    } else {
      onCreateSubgraph();
    }
    onClose();
  };

  const handleSwitchShape = (shape: MermaidShapeType) => {
    onSwitchShape?.(shape);
    onClose();
  };

  const handleDeleteNode = () => {
    onDeleteNode?.();
    onClose();
  };

  const handleDeleteSubgraph = () => {
    onDeleteSubgraph?.();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      tabIndex={-1}
      onBlur={handleBlur}
      className="context-menu"
      style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 1000 }}
    >
      {/* 创建 Subgraph */}
      <button
        onClick={handleCreateSubgraph}
        className="context-menu-item"
      >
        {hasSelection ? `创建子图 (含 ${selectedNodeIds.length} 个节点)` : '创建子图'}
      </button>

      {/* 分隔线 + 删除选项 */}
      {(canDeleteNode || canDeleteSubgraph) && (
        <>
          <div className="context-menu-separator" />
          {canDeleteSubgraph && (
            <button
              onClick={handleDeleteSubgraph}
              className="context-menu-item context-menu-item-danger"
            >
              删除子图
            </button>
          )}
          {canDeleteNode && (
            <button
              onClick={handleDeleteNode}
              className="context-menu-item context-menu-item-danger"
            >
              {selectedNodeIds.length > 1 ? `删除 ${selectedNodeIds.length} 个节点` : '删除节点'}
            </button>
          )}
        </>
      )}

      {/* 分隔线 */}
      {hasSelection && onSwitchShape && (
        <>
          <div className="context-menu-separator" />
          <div className="context-menu-label">切换形状</div>
          {QUICK_SHAPES.map((shape) => (
            <button
              key={shape.value}
              onClick={() => handleSwitchShape(shape.value)}
              className="context-menu-item"
            >
              {shape.label}
            </button>
          ))}
        </>
      )}
    </div>
  );
});
