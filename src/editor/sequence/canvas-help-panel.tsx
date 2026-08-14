/**
 * CanvasHelpPanel — 画布左下角可折叠帮助面板
 *
 * 单一职责：展示 B4 全部编辑操作 + 快捷键说明，支持折叠/展开
 *
 * 交互行为：
 *   - 默认折叠态：显示「?」圆形按钮（40x40），占位极小
 *   - 点击展开：显示完整帮助面板（按分类组织）
 *   - 点击外部收起：document mousedown 监听
 *   - Escape 收起：键盘事件监听
 *
 * 位置：absolute, left/bottom 10px（与右下角 minimap 对称）
 *
 * 设计文档：B4.4 拖拽排序系统 UI 帮助说明扩展（用户决策：可折叠面板 + 完整操作+快捷键）
 */
import { useState, useRef, useEffect, useCallback } from 'react';

/** 帮助条目：操作名称 + 操作说明 */
interface HelpEntry {
  /** 操作名称（粗体显示） */
  label: string;
  /** 操作说明（普通文本） */
  description: string;
}

/** 帮助分类：标题 + 条目列表 */
interface HelpSection {
  /** 分类标题 */
  title: string;
  /** 该分类下的帮助条目 */
  entries: HelpEntry[];
}

/**
 * 帮助内容分类（B4 全部编辑操作 + 快捷键）
 *
 * 来源：
 *   - B4.3 右键菜单新增 5 类元素
 *   - B4.4 拖拽排序（参与者/消息/Note/Block resize/Box 分配）
 *   - B4.4 拖拽连线创建消息
 *   - B4.5 Delete 键删除
 *   - 5 个拖拽 hook 的 Escape 取消
 *   - use-sequence-viewport 平移缩放
 */
const HELP_SECTIONS: HelpSection[] = [
  {
    title: '新增元素',
    entries: [
      {
        label: '右键画布空白',
        description: '打开画布菜单，选择新增参与者/消息/Note/Block/Box',
      },
      {
        label: '右键已有元素',
        description: '打开元素菜单，选择新增同类型元素或编辑当前元素',
      },
    ],
  },
  {
    title: '拖拽编辑',
    entries: [
      {
        label: '参与者顶部连接点',
        description: '拖拽到另一参与者，创建新消息',
      },
      {
        label: '参与者 grip（顶部矩形左侧）',
        description: '横向拖拽重排参与者顺序',
      },
      {
        label: 'Shift + 参与者 grip',
        description: '拖入/拖出 Box（Box 分配模式）',
      },
      {
        label: '消息左侧 grip',
        description: '纵向拖拽重排消息顺序',
      },
      {
        label: 'Note 左侧 grip',
        description: '纵向拖拽重排 Note 顺序',
      },
      {
        label: 'Block 上下边缘 handle',
        description: '拖拽调整 Block 起止消息范围',
      },
    ],
  },
  {
    title: '画布操作',
    entries: [
      {
        label: '拖拽空白处',
        description: '平移画布视口',
      },
      {
        label: '滚轮',
        description: '以鼠标位置为中心缩放画布',
      },
      {
        label: '点击元素',
        description: '选中元素（属性面板显示编辑项）',
      },
      {
        label: '点击空白处',
        description: '取消选中',
      },
    ],
  },
  {
    title: '键盘快捷键',
    entries: [
      {
        label: 'Delete / Backspace',
        description: '删除选中的元素（含副作用清理：Box actorKeys、消息 sequence 等）',
      },
      {
        label: 'Escape',
        description: '取消当前拖拽操作（连线/排序/Block resize/Box 分配）',
      },
    ],
  },
];

/**
 * CanvasHelpPanel 组件
 *
 * 纯展示组件，无 props。内部管理 expanded/collapsed 状态。
 */
export function CanvasHelpPanel(): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /** 点击外部收起面板 */
  const handleDocumentMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!expanded) return;
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        setExpanded(false);
      }
    },
    [expanded],
  );

  /** Escape 收起面板 */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!expanded) return;
      if (e.key === 'Escape') {
        setExpanded(false);
      }
    },
    [expanded],
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleDocumentMouseDown, handleKeyDown]);

  /** 切换展开/折叠 */
  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  if (!expanded) {
    // 折叠态：圆形「?」按钮
    return (
      <div className="seq-help-panel-collapsed" ref={panelRef}>
        <button
          type="button"
          className="seq-help-toggle"
          onClick={toggleExpanded}
          aria-label="显示画布使用帮助"
          title="显示画布使用帮助"
        >
          ?
        </button>
      </div>
    );
  }

  // 展开态：完整帮助面板
  return (
    <div className="seq-help-panel-expanded" ref={panelRef}>
      <div className="seq-help-panel-header">
        <span className="seq-help-panel-title">画布使用帮助</span>
        <button
          type="button"
          className="seq-help-close"
          onClick={toggleExpanded}
          aria-label="收起帮助面板"
          title="收起"
        >
          ×
        </button>
      </div>
      <div className="seq-help-panel-content">
        {HELP_SECTIONS.map((section) => (
          <div key={section.title} className="seq-help-section">
            <div className="seq-help-section-title">{section.title}</div>
            <ul className="seq-help-entry-list">
              {section.entries.map((entry) => (
                <li key={entry.label} className="seq-help-entry">
                  <span className="seq-help-entry-label">{entry.label}</span>
                  <span className="seq-help-entry-desc">{entry.description}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
