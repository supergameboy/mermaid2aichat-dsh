/**
 * 节点库 — 按图表类型动态显示可用形状，支持点击添加和拖拽到画布
 *
 * 单一职责：根据 diagramType 渲染对应节点形状列表
 * - 图结构类型：显示该类型可用的模板（使用 ShapePreview 渲染真实形状预览）
 * - 数据图表类型：返回 null（不显示节点库）
 *
 * 数据源：从 node-templates.ts 模板注册表读取，按 order 排序
 */

import type { DragEvent, ReactElement } from 'react';
import {
  type DiagramType,
  type MermaidShapeType,
} from '@mermaid2aichat/serializer';
import { getTemplatesForDiagramType, type NodeTemplate } from './node-templates.js';
import { ShapePreview } from './shape-preview.js';

interface NodeLibraryProps {
  /** 当前图表类型（决定可用形状） */
  diagramType: DiagramType;
  /** 添加节点回调 */
  onAddNode: (shape: MermaidShapeType, icon?: string) => void;
}

/** 渲染形状预览图标 */
function ShapeIcon({ shape }: { shape: MermaidShapeType }): ReactElement {
  return <ShapePreview shape={shape} size={28} />;
}

export function NodeLibrary({ diagramType, onAddNode }: NodeLibraryProps): ReactElement | null {
  const templates = getTemplatesForDiagramType(diagramType);

  // 拖拽开始：将形状类型写入 dataTransfer
  const handleDragStart = (e: DragEvent<HTMLButtonElement>, template: NodeTemplate) => {
    e.dataTransfer.setData('application/mermaid-shape', template.type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="node-library">
      <h3 className="library-title">节点库</h3>
      <div className="node-list">
        {templates.map((template) => (
          <button
            key={template.type}
            className="node-item"
            draggable
            onDragStart={(e) => handleDragStart(e, template)}
            onClick={() => onAddNode(template.type)}
            title={`点击添加或拖拽到画布：${template.label}`}
          >
            <span className="node-icon">
              <ShapeIcon shape={template.type} />
            </span>
            <span className="node-label">{template.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
