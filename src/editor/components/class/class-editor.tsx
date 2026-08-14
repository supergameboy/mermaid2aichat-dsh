/**
 * ClassEditor — classDiagram 类属性编辑面板
 *
 * 单一职责：编辑类节点的名称、stereotype、generics、annotations
 *
 * 数据流:
 *   MermaidNode → ClassEditor → onUpdate(Partial<MermaidNodeData>) → 更新 CanvasState
 */

import { memo } from 'react';
import type { MermaidNode, ClassStereotype } from '@mermaid2aichat/serializer';

export interface ClassEditorProps {
  /** 当前编辑的类节点 */
  classNode: MermaidNode;
  /** 更新回调 */
  onUpdate: (data: Partial<MermaidNode['data']>) => void;
}

/** stereotype 选项 */
const STEREOTYPE_OPTIONS: { value: '' | ClassStereotype; label: string }[] = [
  { value: '', label: '（无）' },
  { value: 'interface', label: '<<interface>>' },
  { value: 'abstract', label: '<<abstract>>' },
  { value: 'annotation', label: '<<annotation>>' },
  { value: 'enum', label: '<<enum>>' },
  { value: 'protocol', label: '<<protocol>>' },
  { value: 'exception', label: '<<exception>>' },
  { value: 'metaclass', label: '<<metaclass>>' },
  { value: 'stereotype', label: '<<stereotype>>' },
];

/** 类编辑面板组件 */
export const ClassEditor = memo(function ClassEditor({
  classNode,
  onUpdate,
}: ClassEditorProps) {
  const data = classNode.data;
  const stereotype = data.stereotype ?? '';
  const generics = data.generics ?? '';
  const annotations = data.annotations ?? [];

  return (
    <div className="panel-content">
      {/* 类名 */}
      <label className="panel-label">
        类名
        <input
          className="panel-input"
          type="text"
          value={data.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </label>

      {/* stereotype */}
      <label className="panel-label">
        Stereotype
        <select
          className="panel-select"
          value={stereotype}
          onChange={(e) => {
            const value = e.target.value as '' | ClassStereotype;
            onUpdate({ stereotype: value || undefined });
          }}
        >
          {STEREOTYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 泛型 */}
      <label className="panel-label">
        泛型
        <input
          className="panel-input"
          type="text"
          value={generics}
          placeholder="如: Item（显示为 ~Item~）"
          onChange={(e) => onUpdate({ generics: e.target.value || undefined })}
        />
      </label>

      {/* annotations（逗号分隔） */}
      <label className="panel-label">
        注解（逗号分隔）
        <input
          className="panel-input"
          type="text"
          value={annotations.join(', ')}
          placeholder="如: interface, deprecated"
          onChange={(e) => {
            const value = e.target.value.trim();
            const list = value
              ? value.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
              : [];
            onUpdate({ annotations: list.length > 0 ? list : undefined });
          }}
        />
      </label>

      <div className="panel-info">
        <span className="info-label">ID:</span>
        <span className="info-value">{classNode.id}</span>
      </div>
    </div>
  );
});
