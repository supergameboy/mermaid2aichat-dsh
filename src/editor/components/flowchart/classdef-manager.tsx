/**
 * classDef 管理面板 — 创建/编辑/删除 classDef 样式类
 *
 * 单一职责：提供 FlowClass 的 CRUD 编辑 UI
 *
 * 数据流:
 *   FlowClass[] → ClassDefManager → onCreate/onUpdate/onDelete → 更新 CanvasState.metadata.flowClassDefs
 *
 * classDef 语法:
 *   classDef className fill:#f9f,stroke:#333,stroke-width:2px;
 *   styles 数组每项为 "key:value" 字符串
 */

import { memo, useState } from 'react';
import type { FlowClass } from '@mermaid2aichat/serializer';

// ============================================================
// 类型
// ============================================================

export interface ClassDefManagerProps {
  /** 当前所有 classDef */
  classes: FlowClass[];
  /** 创建 classDef */
  onCreate: (id: string, styles: string[]) => void;
  /** 更新 classDef */
  onUpdate: (id: string, styles: string[]) => void;
  /** 删除 classDef */
  onDelete: (id: string) => void;
}

// ============================================================
// 组件
// ============================================================

export const ClassDefManager = memo(function ClassDefManager({
  classes,
  onCreate,
  onUpdate,
  onDelete,
}: ClassDefManagerProps) {
  const [newId, setNewId] = useState('');
  const [newStyles, setNewStyles] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStyles, setEditStyles] = useState('');

  const handleCreate = () => {
    const id = newId.trim();
    if (!id) return;
    const styles = parseStyles(newStyles);
    onCreate(id, styles);
    setNewId('');
    setNewStyles('');
  };

  const handleStartEdit = (cls: FlowClass) => {
    setEditingId(cls.id);
    setEditStyles(cls.styles.join(','));
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const styles = parseStyles(editStyles);
    onUpdate(editingId, styles);
    setEditingId(null);
    setEditStyles('');
  };

  return (
    <div className="classdef-manager" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>样式类管理</h4>

      {/* 创建新 classDef */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px', border: '1px solid #d9d9d9', borderRadius: '4px' }}>
        <span style={{ fontSize: '12px', color: '#666' }}>新建样式类</span>
        <input
          type="text"
          placeholder="类名 (如: highlight)"
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          style={{ padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: '4px', fontSize: '13px' }}
        />
        <input
          type="text"
          placeholder="样式 (如: fill:#f9f,stroke:#333)"
          value={newStyles}
          onChange={(e) => setNewStyles(e.target.value)}
          style={{ padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: '4px', fontSize: '13px' }}
        />
        <button
          onClick={handleCreate}
          disabled={!newId.trim()}
          style={{
            padding: '4px 12px',
            border: '1px solid #1890ff',
            borderRadius: '4px',
            backgroundColor: '#1890ff',
            color: '#fff',
            cursor: newId.trim() ? 'pointer' : 'not-allowed',
            fontSize: '13px',
            opacity: newId.trim() ? 1 : 0.5,
          }}
        >
          创建
        </button>
      </div>

      {/* 已有 classDef 列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {classes.length === 0 && (
          <span style={{ fontSize: '12px', color: '#999' }}>暂无样式类</span>
        )}
        {classes.map((cls) => (
          <div
            key={cls.id}
            style={{
              padding: '8px',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>{cls.id}</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => handleStartEdit(cls)}
                  style={btnStyle}
                >
                  编辑
                </button>
                <button
                  onClick={() => onDelete(cls.id)}
                  style={{ ...btnStyle, color: '#ff4d4f', borderColor: '#ff4d4f' }}
                >
                  删除
                </button>
              </div>
            </div>
            {editingId === cls.id ? (
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="text"
                  value={editStyles}
                  onChange={(e) => setEditStyles(e.target.value)}
                  style={{ flex: 1, padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: '4px', fontSize: '12px' }}
                />
                <button onClick={handleSaveEdit} style={btnStyle}>保存</button>
                <button onClick={() => setEditingId(null)} style={btnStyle}>取消</button>
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: '#666' }}>{cls.styles.join(',') || '(无样式)'}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

// ============================================================
// 辅助
// ============================================================

const btnStyle: React.CSSProperties = {
  padding: '2px 8px',
  border: '1px solid #d9d9d9',
  borderRadius: '4px',
  backgroundColor: '#fff',
  cursor: 'pointer',
  fontSize: '12px',
};

/** 解析样式字符串为数组 */
function parseStyles(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
