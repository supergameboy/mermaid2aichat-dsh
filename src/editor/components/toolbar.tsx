/**
 * 工具栏 — 图表类型显示 + 方向切换（仅 flowchart）+ 连线模式 + 复制代码
 *
 * 单一职责：工具栏 UI，根据 diagramType 动态显示控件
 */
import type {
  DiagramType,
  FlowchartDirection,
  GraphDiagramType,
} from '@mermaid2aichat/serializer';
import { isGraphDiagramType } from '@mermaid2aichat/serializer';
import type { ConnectionMode } from '../nodes/flowchart/index.js';
import { showToast } from './toast.js';

interface ToolbarProps {
  /** 当前图表类型 */
  diagramType: DiagramType;
  /** 方向（仅 flowchart 使用） */
  direction: FlowchartDirection;
  onDirectionChange: (dir: FlowchartDirection) => void;
  mermaidCode: string;
  connectionMode: ConnectionMode;
  onConnectionModeChange: (mode: ConnectionMode) => void;
  /** 图表类型切换回调（用户选择新类型时触发） */
  onDiagramTypeChange?: (newType: DiagramType) => void;
  /** 当前是否为暗色模式 */
  darkMode?: boolean;
  /** 切换暗色模式回调 */
  onDarkModeToggle?: () => void;
}

const DIRECTIONS: FlowchartDirection[] = ['TB', 'TD', 'BT', 'RL', 'LR'];

/** 图表类型中文标签 */
const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  flowchart: '流程图',
  sequenceDiagram: '时序图',
  classDiagram: '类图',
  erDiagram: 'ER图',
  mindmap: '思维导图',
  stateDiagram: '状态图',
  architecture: '架构图',
  gantt: '甘特图',
  pie: '饼图',
  timeline: '时间线',
  quadrantChart: '四象限图',
  xychart: '坐标图',
};

/** 本插件支持的图表类型（用于下拉选择器，仅四种已迁移类型） */
export const SUPPORTED_DIAGRAM_TYPES: DiagramType[] = [
  'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'erDiagram',
];

export function Toolbar({
  diagramType,
  direction,
  onDirectionChange,
  mermaidCode,
  connectionMode,
  onConnectionModeChange,
  onDiagramTypeChange,
  darkMode = false,
  onDarkModeToggle,
}: ToolbarProps) {
  // 复制 mermaid 代码到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mermaidCode);
      showToast('代码已复制到剪贴板', 'success');
    } catch {
      showToast('复制失败，请手动复制', 'error');
    }
  };

  const isGraphType = isGraphDiagramType(diagramType);

  return (
    <div className="toolbar">
      {/* Logo / 品牌标识 */}
      <div className="toolbar-section">
        <span className="toolbar-logo" title="Mermaid2AIChat">M2A</span>
      </div>

      {/* 分隔线 */}
      <div className="toolbar-divider" />

      {/* 图表类型选择器 */}
      <div className="toolbar-section">
        {onDiagramTypeChange ? (
          <select
            value={diagramType}
            onChange={(e) => onDiagramTypeChange(e.target.value as DiagramType)}
            className="toolbar-select toolbar-type-select"
            title="切换图表类型"
          >
            {SUPPORTED_DIAGRAM_TYPES.map((t) => (
              <option key={t} value={t}>{DIAGRAM_TYPE_LABELS[t]}</option>
            ))}
          </select>
        ) : (
          <span className="diagram-type-badge">{DIAGRAM_TYPE_LABELS[diagramType]}</span>
        )}
      </div>

      {/* 方向选择 — 仅 flowchart 显示 */}
      {diagramType === 'flowchart' && (
        <div className="toolbar-section">
          <select
            value={direction}
            onChange={(e) => onDirectionChange(e.target.value as FlowchartDirection)}
            className="toolbar-select"
            title="切换流程图方向并重新布局"
          >
            {DIRECTIONS.map((dir) => (
              <option key={dir} value={dir}>{dir}</option>
            ))}
          </select>
        </div>
      )}

      {/* 连线模式 — 仅图结构类型显示 */}
      {isGraphType && (
        <div className="toolbar-section">
          <select
            value={connectionMode}
            onChange={(e) => onConnectionModeChange(e.target.value as ConnectionMode)}
            className="toolbar-select"
            title="选择节点连线模式：按方向连接或就近连接"
          >
            <option value="direction">按方向</option>
            <option value="nearest">就近</option>
          </select>
        </div>
      )}

      {/* 右侧操作区 */}
      <div className="toolbar-section toolbar-actions">
        {onDarkModeToggle && (
          <button type="button" className="toolbar-btn" onClick={onDarkModeToggle} title={darkMode ? '切换到亮色模式' : '切换到暗色模式'}>
            {darkMode ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
        )}
        <button type="button" className="toolbar-btn" onClick={handleCopy} title="复制 Mermaid 代码到剪贴板">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
    </div>
  );
}
