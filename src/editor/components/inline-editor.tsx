/** 内联编辑器 — 双击节点/边时显示，用于编辑文本 */
import { useEffect, useRef, useState } from 'react';

interface InlineEditorProps {
  value: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InlineEditor({ value, onConfirm, onCancel }: InlineEditorProps) {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(editValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    onConfirm(editValue);
  };

  return (
    <input
      ref={inputRef}
      className="inline-editor"
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      style={{ width: '100%' }}
    />
  );
}
