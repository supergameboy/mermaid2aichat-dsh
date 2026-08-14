/**
 * ContextMenu — 时序图通用右键菜单组件
 *
 * 单一职责：根据 ContextMenuItem[] 描述渲染菜单 UI（含子菜单、分隔线、禁用态）
 *
 * B4.3 实现：
 *   - 通用组件，不绑定具体业务逻辑（菜单结构由调用方通过 items prop 提供）
 *   - 支持子菜单递归渲染（鼠标 hover 展开）
 *   - 支持分隔线（separator: true）
 *   - 支持禁用态（disabled: true）
 *   - 屏幕坐标定位（position: { x, y }），自动边界检测防止超出视口
 *   - 点击外部 / Escape 关闭
 *
 * 与 flowchart/context-menu.tsx 区别：
 *   - flowchart 版本是定制化（直接绑定 onCreateSubgraph 等业务回调）
 *   - 本 sequence 版本是通用化（items 数组描述菜单结构，调用方负责构造）
 *   - 通用化设计便于 B4.3 在不同右键场景（画布/参与者/消息/注释/块/box）复用同一组件
 */
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';

// ============================================================
// 类型
// ============================================================

/** 菜单项描述 */
export interface ContextMenuItem {
  /** 菜单项 ID（用于 React key，调用方保证唯一） */
  id: string;
  /** 显示文本 */
  label: string;
  /** 图标（可选，渲染在文本前） */
  icon?: ReactNode;
  /** 子菜单（可选，与 onClick 互斥；存在时 hover 展开） */
  submenu?: ContextMenuItem[];
  /** 点击回调（与 submenu 互斥） */
  onClick?: () => void;
  /** 是否禁用（禁用时显示但不可点击） */
  disabled?: boolean;
  /** 是否分隔线（为 true 时其他字段忽略，渲染为水平线） */
  separator?: boolean;
}

/** ContextMenu 组件 Props */
export interface ContextMenuProps {
  /** 菜单项列表（顶层） */
  items: ContextMenuItem[];
  /** 菜单显示位置（屏幕坐标，clientX/clientY） */
  position: { x: number; y: number };
  /** 关闭回调（点击外部 / Escape / 点击菜单项后触发） */
  onClose: () => void;
}

// ============================================================
// 常量
// ============================================================

/** 菜单宽度（用于边界检测） */
const MENU_WIDTH = 180;
/** 菜单行高（用于边界检测估算） */
const MENU_ITEM_HEIGHT = 32;
/** 子菜单与父菜单的间距 */
const SUBMENU_OFFSET = 4;

// ============================================================
// 组件
// ============================================================

export const ContextMenu = memo(function ContextMenu({
  items,
  position,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState(position);

  // 边界检测：菜单打开时若超出视口右/下边界，调整位置回缩
  useEffect(() => {
    const estimatedHeight = items.length * MENU_ITEM_HEIGHT + 8;
    const maxX = window.innerWidth - MENU_WIDTH - 8;
    const maxY = window.innerHeight - estimatedHeight - 8;
    setAdjustedPos({
      x: Math.min(position.x, maxX),
      y: Math.min(position.y, maxY),
    });
  }, [position, items.length]);

  // 点击外部 / Escape 关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
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

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        minWidth: MENU_WIDTH,
        zIndex: 1000,
      }}
      role="menu"
    >
      <MenuItemsList items={items} onClose={onClose} />
    </div>
  );
});

// ============================================================
// 内部组件
// ============================================================

/** 菜单项列表（顶层和子菜单共用） */
interface MenuItemsListProps {
  items: ContextMenuItem[];
  onClose: () => void;
}

function MenuItemsList({ items, onClose }: MenuItemsListProps) {
  return (
    <>
      {items.map((item) => (
        <MenuItemView key={item.id} item={item} onClose={onClose} />
      ))}
    </>
  );
}

/** 单个菜单项（处理分隔线、禁用态、子菜单） */
interface MenuItemViewProps {
  item: ContextMenuItem;
  onClose: () => void;
}

function MenuItemView({ item, onClose }: MenuItemViewProps) {
  // 分隔线：渲染水平线，不响应任何事件
  if (item.separator) {
    return <div className="context-menu-separator" role="separator" />;
  }

  const hasSubmenu = item.submenu !== undefined && item.submenu.length > 0;
  const isDisabled = item.disabled === true;

  const handleClick = () => {
    if (isDisabled || hasSubmenu) return;
    item.onClick?.();
    onClose();
  };

  // 子菜单通过 hover 展开（鼠标移入显示，移出隐藏）
  // 由 SubMenu 组件内部管理 hover 状态
  if (hasSubmenu) {
    return <SubMenuTrigger item={item} onClose={onClose} />;
  }

  return (
    <button
      type="button"
      className="context-menu-item"
      onClick={handleClick}
      disabled={isDisabled}
      style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
      role="menuitem"
    >
      {item.icon !== undefined && (
        <span className="context-menu-item-icon" aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className="context-menu-item-label">{item.label}</span>
    </button>
  );
}

/** 子菜单触发器（hover 展开子菜单） */
interface SubMenuTriggerProps {
  item: ContextMenuItem;
  onClose: () => void;
}

function SubMenuTrigger({ item, onClose }: SubMenuTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // hover 展开子菜单时计算位置（默认在父菜单右侧）
  const handleMouseEnter = () => {
    if (triggerRef.current === null) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedHeight = (item.submenu?.length ?? 0) * MENU_ITEM_HEIGHT + 8;
    const maxX = window.innerWidth - MENU_WIDTH - 8;
    const maxY = window.innerHeight - estimatedHeight - 8;
    // 子菜单默认在父菜单右侧，若超出右边界则改为左侧
    const defaultX = rect.right + SUBMENU_OFFSET;
    const x = defaultX + MENU_WIDTH > window.innerWidth - 8
      ? rect.left - MENU_WIDTH - SUBMENU_OFFSET
      : defaultX;
    setSubmenuPos({
      x: Math.min(x, maxX),
      y: Math.min(rect.top, maxY),
    });
    setIsOpen(true);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    // 鼠标移动到子菜单内时不关闭
    if (submenuRef.current !== null && e.relatedTarget instanceof Node && submenuRef.current.contains(e.relatedTarget)) {
      return;
    }
    setIsOpen(false);
  };

  // 子菜单内部鼠标离开时关闭
  const handleSubmenuMouseLeave = (e: React.MouseEvent) => {
    if (triggerRef.current !== null && e.relatedTarget instanceof Node && triggerRef.current.contains(e.relatedTarget)) {
      return;
    }
    setIsOpen(false);
  };

  const isDisabled = item.disabled === true;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative' }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="context-menu-item"
        disabled={isDisabled}
        style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {item.icon !== undefined && (
          <span className="context-menu-item-icon" aria-hidden="true">
            {item.icon}
          </span>
        )}
        <span className="context-menu-item-label">{item.label}</span>
        <span className="context-menu-item-arrow" aria-hidden="true">▶</span>
      </button>
      {isOpen && item.submenu !== undefined && (
        <div
          ref={submenuRef}
          className="context-menu"
          onMouseLeave={handleSubmenuMouseLeave}
          style={{
            position: 'fixed',
            left: submenuPos.x,
            top: submenuPos.y,
            minWidth: MENU_WIDTH,
            zIndex: 1001,
          }}
          role="menu"
        >
          <MenuItemsList items={item.submenu} onClose={onClose} />
        </div>
      )}
    </div>
  );
}
