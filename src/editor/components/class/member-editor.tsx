/**
 * MemberEditor — classDiagram 成员编辑面板
 *
 * 单一职责：添加/编辑/删除类的属性和方法
 *
 * 数据流:
 *   NodeMember[] → MemberEditor → onChange(NodeMember[]) → 更新 CanvasState
 */

import { memo } from 'react';
import type { NodeMember, ClassVisibility } from '@mermaid2aichat/serializer';

export interface MemberEditorProps {
  /** 当前成员列表 */
  members: NodeMember[];
  /** 更新回调 */
  onChange: (members: NodeMember[]) => void;
}

/** 可见性选项 */
const VISIBILITY_OPTIONS: { value: ClassVisibility; label: string }[] = [
  { value: '+', label: '+ public' },
  { value: '-', label: '- private' },
  { value: '#', label: '# protected' },
  { value: '~', label: '~ package' },
  { value: '', label: '（无）' },
];

/** 创建新属性 */
function createAttribute(): NodeMember {
  return {
    name: 'newAttr',
    visibility: '+',
    isStatic: false,
    isAbstract: false,
    isMethod: false,
  };
}

/** 创建新方法 */
function createMethod(): NodeMember {
  return {
    name: 'newMethod',
    visibility: '+',
    isStatic: false,
    isAbstract: false,
    isMethod: true,
    parameters: '',
    returnType: '',
  };
}

/** 成员编辑面板组件 */
export const MemberEditor = memo(function MemberEditor({
  members,
  onChange,
}: MemberEditorProps) {
  const updateMember = (index: number, patch: Partial<NodeMember>) => {
    const next = members.map((m, i) => (i === index ? { ...m, ...patch } : m));
    onChange(next);
  };

  const addAttribute = () => {
    onChange([...members, createAttribute()]);
  };

  const addMethod = () => {
    onChange([...members, createMethod()]);
  };

  const removeMember = (index: number) => {
    onChange(members.filter((_, i) => i !== index));
  };

  return (
    <div className="panel-content">
      <div className="panel-section-title">类成员</div>

      {members.map((member, index) => (
        <div key={index} className="panel-member" style={{ border: '1px solid var(--color-border-hover)', padding: 'var(--space-2)', marginBottom: 'var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
          {/* 成员类型标签 */}
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
            {member.isMethod ? '方法' : '属性'}
          </div>

          {/* 可见性 */}
          <label className="panel-label">
            可见性
            <select
              className="panel-select"
              value={member.visibility}
              onChange={(e) =>
                updateMember(index, {
                  visibility: e.target.value as ClassVisibility,
                })
              }
            >
              {VISIBILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          {/* 名称 */}
          <label className="panel-label">
            名称
            <input
              className="panel-input"
              type="text"
              value={member.name}
              onChange={(e) => updateMember(index, { name: e.target.value })}
            />
          </label>

          {/* 属性：类型 / 方法：参数 + 返回类型 */}
          {!member.isMethod && (
            <label className="panel-label">
              类型
              <input
                className="panel-input"
                type="text"
                value={member.type ?? ''}
                placeholder="如: string"
                onChange={(e) => updateMember(index, { type: e.target.value })}
              />
            </label>
          )}

          {member.isMethod && (
            <>
              <label className="panel-label">
                参数
              <input
                className="panel-input"
                type="text"
                value={member.parameters ?? ''}
                placeholder="如: param1: Type, param2: Type"
                onChange={(e) => updateMember(index, { parameters: e.target.value })}
              />
              </label>
              <label className="panel-label">
                返回类型
                <input
                  className="panel-input"
                  type="text"
                  value={member.returnType ?? ''}
                  placeholder="如: void"
                  onChange={(e) => updateMember(index, { returnType: e.target.value })}
                />
              </label>
            </>
          )}

          {/* static / abstract 复选框 */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
            <label className="panel-label panel-checkbox-row">
              <input
                type="checkbox"
                checked={member.isStatic}
                onChange={(e) => updateMember(index, { isStatic: e.target.checked })}
              />
              静态 (*)
            </label>
            <label className="panel-label panel-checkbox-row">
              <input
                type="checkbox"
                checked={member.isAbstract}
                onChange={(e) => updateMember(index, { isAbstract: e.target.checked })}
              />
              抽象 ($)
            </label>
          </div>

          {/* 删除按钮 */}
          <button
            type="button"
            className="panel-reset-btn"
            onClick={() => removeMember(index)}
            style={{ marginTop: 'var(--space-1)' }}
          >
            删除{member.isMethod ? '方法' : '属性'}
          </button>
        </div>
      ))}

      {/* 添加按钮 */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <button type="button" className="panel-reset-btn" onClick={addAttribute}>
          添加属性
        </button>
        <button type="button" className="panel-reset-btn" onClick={addMethod}>
          添加方法
        </button>
      </div>
    </div>
  );
});
