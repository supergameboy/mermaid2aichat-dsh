/**
 * CodeEditor — Mermaid 代码编辑器（可编辑，实时同步画布）
 *
 * 职责：显示当前画布序列化后的 Mermaid 代码，支持用户编辑并提交（失焦或 Ctrl+Enter）
 *   - 空代码处理：清空代码不报错，显示提示
 *   - 标题栏承载「图表类型 / 流程图方向 / 连线模式」选择器与复制代码按钮
 *     （原独立工具栏已移除，相关控件收进代码区）
 *
 * 设计说明：Mermaid 代码编辑导致的图类型切换由 createCodeChangeHandler 统一处理（直切 + 保留代码），
 *           CodeEditor 不显示类型切换提示——类型不一致是用户编辑代码的自然现象，无需额外提示。
 */
import { useState, useEffect, useRef, memo } from 'react';
import { type DiagramType, type FlowchartDirection, isGraphDiagramType, DIAGRAM_TYPES } from '@mermaid2aichat/serializer';
import type { ConnectionMode } from '../nodes/flowchart/index.js';
import { showToast } from './toast.js';

interface CodeEditorProps {
  /** Mermaid 代码（由 Canvas 序列化后传入） */
  code: string;
  /** 代码编辑回调（失焦或 Ctrl+Enter 时触发） */
  onCodeChange?: (code: string) => void;
  /** 解析错误信息（null 表示无错误） */
  error?: string | null;
  /** 当前图表类型（类型选择器的当前值；未提供选择器时仅作内部判断） */
  diagramType?: DiagramType;
  /** 图表类型切换回调（提供时渲染下拉选择器） */
  onDiagramTypeChange?: (newType: DiagramType) => void;
  /** 当前流程图方向（仅 flowchart 渲染） */
  direction?: FlowchartDirection;
  /** 方向切换回调（仅 flowchart 渲染） */
  onDirectionChange?: (dir: FlowchartDirection) => void;
  /** 当前连线模式（仅图结构类型渲染） */
  connectionMode?: ConnectionMode;
  /** 连线模式切换回调（仅图结构类型渲染） */
  onConnectionModeChange?: (mode: ConnectionMode) => void;
}

const DIRECTIONS: FlowchartDirection[] = ['TB', 'TD', 'BT', 'RL', 'LR'];

export const CodeEditor = memo(function CodeEditor({
  code,
  onCodeChange,
  error,
  diagramType,
  onDiagramTypeChange,
  direction,
  onDirectionChange,
  connectionMode,
  onConnectionModeChange,
}: CodeEditorProps) {
  const [localCode, setLocalCode] = useState(code || '');
  const [isFocused, setIsFocused] = useState(false);
  const userEditedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 画布变化 → 代码更新（仅在未聚焦且用户未手动编辑时同步）
  useEffect(() => {
    if (!isFocused && !userEditedRef.current) {
      setLocalCode(code || '');
    }
  }, [code, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    userEditedRef.current = true;
    setLocalCode(e.target.value);
  };

  const handleFocus = () => setIsFocused(true);

  const handleBlur = () => {
    setIsFocused(false);
    if (userEditedRef.current && localCode !== code) {
      onCodeChange?.(localCode);
      userEditedRef.current = false; // 提交后立即重置，允许后续画布变化同步
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (userEditedRef.current && localCode !== code) {
        onCodeChange?.(localCode);
        userEditedRef.current = false; // 提交后立即重置，允许后续画布变化同步
      }
    }
  };

  // 复制 mermaid 代码到剪贴板（优先 Clipboard API，受限环境回退 execCommand）
  const handleCopy = async () => {
    const text = code || localCode;
    try {
      await navigator.clipboard.writeText(text);
      showToast('代码已复制到剪贴板', 'success');
      return;
    } catch {
      // 无剪贴板权限/非安全上下文时走隐藏 textarea 回退
    }
    try {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      const ok = document.execCommand('copy');
      helper.remove();
      showToast(ok ? '代码已复制到剪贴板' : '复制失败，请手动复制', ok ? 'success' : 'error');
    } catch {
      showToast('复制失败，请手动复制', 'error');
    }
  };

  const showDirection = diagramType === 'flowchart' && direction !== undefined && onDirectionChange !== undefined;
  const showConnectionMode =
    diagramType !== undefined && isGraphDiagramType(diagramType)
    && connectionMode !== undefined && onConnectionModeChange !== undefined;
  const showControls = onDiagramTypeChange !== undefined || showDirection || showConnectionMode;

  return (
    <div className="code-editor">
      <div className="code-editor-title">
        <span>Mermaid 代码</span>
        <button type="button" className="code-editor-copy" onClick={() => { void handleCopy() }} title="复制 Mermaid 代码到剪贴板">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>

      {showControls && (
        <div className="code-editor-controls">
          {onDiagramTypeChange !== undefined && diagramType !== undefined && (
            <select
              value={diagramType}
              onChange={(e) => onDiagramTypeChange(e.target.value as DiagramType)}
              className="code-editor-select"
              title="切换图表类型"
            >
              {DIAGRAM_TYPES.map((info) => (
                <option key={info.type} value={info.type} disabled={!info.implemented}>
                  {info.label}{info.implemented ? '' : '（开发中）'}
                </option>
              ))}
            </select>
          )}
          {showDirection && (
            <select
              value={direction}
              onChange={(e) => onDirectionChange!(e.target.value as FlowchartDirection)}
              className="code-editor-select"
              title="切换流程图方向并重新布局"
            >
              {DIRECTIONS.map((dir) => (
                <option key={dir} value={dir}>{dir}</option>
              ))}
            </select>
          )}
          {showConnectionMode && (
            <select
              value={connectionMode}
              onChange={(e) => onConnectionModeChange!(e.target.value as ConnectionMode)}
              className="code-editor-select"
              title="选择节点连线模式：按方向连接或就近连接"
            >
              <option value="direction">按方向</option>
              <option value="nearest">就近</option>
            </select>
          )}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="code-editor-content"
        value={localCode}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        placeholder="输入 Mermaid 代码（清空将清空画布）"
      />
      {error && <div className="code-editor-error">{error}</div>}
    </div>
  );
});
