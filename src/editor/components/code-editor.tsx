/**
 * CodeEditor — Mermaid 代码编辑器（可编辑，实时同步画布）
 *
 * 职责：显示当前画布序列化后的 Mermaid 代码，支持用户编辑并提交（失焦或 Ctrl+Enter）
 *   - 空代码处理：清空代码不报错，显示提示
 *   - diagramType 显示：在标题栏显示当前图表类型
 *
 * 设计说明：Mermaid 代码编辑导致的图类型切换由 createCodeChangeHandler 统一处理（直切 + 保留代码），
 *           CodeEditor 不显示类型切换提示——类型不一致是用户编辑代码的自然现象，无需额外提示。
 */
import { useState, useEffect, useRef, memo } from 'react';
import { type DiagramType } from '@mermaid2aichat/serializer';

interface CodeEditorProps {
  /** Mermaid 代码（由 Canvas 序列化后传入） */
  code: string;
  /** 代码编辑回调（失焦或 Ctrl+Enter 时触发） */
  onCodeChange?: (code: string) => void;
  /** 解析错误信息（null 表示无错误） */
  error?: string | null;
  /** 当前图表类型（用于标题栏 badge 显示） */
  diagramType?: DiagramType;
}

/** 图表类型中文标签 */
const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  flowchart: '流程图',
  sequenceDiagram: '时序图',
  classDiagram: '类图',
  erDiagram: 'ER图',
  stateDiagram: '状态图',
  mindmap: '思维导图',
  architecture: '架构图',
  gantt: '甘特图',
  pie: '饼图',
  timeline: '时间线',
  quadrantChart: '四象限图',
  xychart: '坐标图',
};

export const CodeEditor = memo(function CodeEditor({ code, onCodeChange, error, diagramType }: CodeEditorProps) {
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

  return (
    <div className="code-editor">
      <div className="code-editor-title">
        <span>Mermaid 代码</span>
        {diagramType && (
          <span className="code-editor-type-badge">{DIAGRAM_TYPE_LABELS[diagramType]}</span>
        )}
      </div>
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
