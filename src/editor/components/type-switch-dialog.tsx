/**
 * TypeSwitchDialog — 图表类型切换确认弹窗
 *
 * 单一职责：用户切换图表类型时弹出确认，提示将清空当前画布数据
 *
 * 注意：VSCode webview 禁止原生 confirm/dialog，必须使用自定义模态对话框
 */
import type { DiagramType } from '@mermaid2aichat/serializer';

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

interface TypeSwitchDialogProps {
  /** 当前类型 */
  currentType: DiagramType;
  /** 目标类型 */
  newType: DiagramType;
  /** 确认切换回调（将清空画布并切换到新类型） */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

export function TypeSwitchDialog({
  currentType,
  newType,
  onConfirm,
  onCancel,
}: TypeSwitchDialogProps) {
  // 同类型不弹窗（理论上不会发生）
  if (currentType === newType) return null;

  const currentLabel = DIAGRAM_TYPE_LABELS[currentType];
  const newLabel = DIAGRAM_TYPE_LABELS[newType];

  return (
    <div
      className="type-switch-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="type-switch-dialog" role="dialog" aria-modal="true">
        <div className="type-switch-header">
          <h3 className="type-switch-title">切换图表类型</h3>
        </div>

        <div className="type-switch-body">
          <p className="type-switch-message">
            即将从 <strong>{currentLabel}</strong> 切换到 <strong>{newLabel}</strong>
          </p>
          <p className="type-switch-warning">
            切换将清空当前画布的所有数据，且无法撤销。
          </p>
        </div>

        <div className="type-switch-footer">
          <button
            type="button"
            className="type-switch-btn type-switch-btn-cancel"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="type-switch-btn type-switch-btn-confirm"
            onClick={onConfirm}
          >
            确认切换
          </button>
        </div>
      </div>
    </div>
  );
}
