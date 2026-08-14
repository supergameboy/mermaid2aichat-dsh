/**
 * SequenceCanvasErrorBoundary — SequenceCanvas 子树错误边界
 *
 * 单一职责：兜底捕获 SequenceCanvas 子树渲染错误，显示友好提示而非白屏
 *
 * 设计原则（institution.md 第1.7条 + design-first.md）：
 *   - 源头拦截（validateActivationPairing）是主防线，已挡住已知非法操作
 *   - ErrorBoundary 是次防线（双保险），主要应对未来扩展引入的未预见错误
 *   - 不掩盖错误：componentDidCatch 中调用 showToast 提示用户
 *   - 错误信息透传到 UI，便于用户报告和定位
 *
 * 恢复机制：
 *   - 触发后用户需刷新页面（syncCanvas 重新推送，画布恢复）
 *   - 不提供自动恢复（避免复杂度，源头拦截已覆盖已知场景，触发概率极低）
 *
 * 设计文档：docs/design/illegal-operation-interception.md
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { showToast } from './toast.js';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * SequenceCanvas 错误边界 — 兜底捕获 SequenceCanvas 子树渲染错误
 *
 * 用法（canvas.tsx）：
 *   <SequenceCanvasErrorBoundary>
 *     <SequenceCanvas {...props} />
 *   </SequenceCanvasErrorBoundary>
 */
export class SequenceCanvasErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    // 渲染阶段调用，更新 state 触发降级 UI
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    // 提交阶段调用，副作用：Toast 通知用户（不掩盖错误，让用户感知到问题）
    showToast(`画布渲染异常：${error.message}`, 'error');
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="sequence-canvas-error">
          <div className="sequence-canvas-error__icon" aria-hidden="true">⚠</div>
          <div className="sequence-canvas-error__title">画布渲染异常</div>
          <div className="sequence-canvas-error__message">{this.state.errorMessage}</div>
          <div className="sequence-canvas-error__hint">请刷新页面以恢复画布</div>
        </div>
      );
    }
    return this.props.children;
  }
}
