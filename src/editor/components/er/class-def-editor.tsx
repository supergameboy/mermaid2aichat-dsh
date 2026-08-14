/**
 * ClassDefEditor — erDiagram 全局样式指令编辑面板
 *
 * 单一职责：编辑 classDef / class-apply / 内联 style 三种全局样式指令
 *
 * M4 重构模块5 L2-6（方案C 核心）：
 *   - classDef 指令：编辑 canvas.metadata.erClasses（ErClassInfo[]）
 *   - class-apply 指令：编辑 canvas.metadata.erClassApplyClasses（ErClassApplyInfo[]）
 *   - 内联 style 指令：编辑 node.data.styles（按节点 ID 索引）
 *
 * 数据流:
 *   canvas.metadata.erClasses → ClassDefEditor → onUpdateClassDefs → applyCanvasChange
 *   canvas.metadata.erClassApplyClasses → ClassDefEditor → onUpdateClassApplies → applyCanvasChange
 *   node.data.styles → ClassDefEditor → onUpdateNodeStyles → applyCanvasChange
 *
 * 字段对齐（对齐模块2 设计点5）:
 *   - classDefs → canvas.metadata.erClasses（ErClassInfo[]）
 *   - classApplies → canvas.metadata.erClassApplyClasses（ErClassApplyInfo[]）
 *   - nodes → canvas.nodes（MermaidNode[]，读取各节点 node.data.styles 编辑内联 style）
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块5-编辑器.md
 */

import { memo } from 'react';
import type {
  MermaidNode,
  ErClassInfo,
  ErClassApplyInfo,
} from '@mermaid2aichat/serializer';

// ============================================================
// Props
// ============================================================

export interface ClassDefEditorProps {
  /** classDef 指令列表（来自 canvas.metadata.erClasses） */
  readonly classDefs: ErClassInfo[];
  /** class-apply 指令列表（来自 canvas.metadata.erClassApplyClasses） */
  readonly classApplies: ErClassApplyInfo[];
  /** 全部节点列表（读取各节点的 data.styles 编辑内联 style 指令） */
  readonly nodes: MermaidNode[];
  /** 更新 classDef 指令（写入 canvas.metadata.erClasses） */
  readonly onUpdateClassDefs: (classDefs: ErClassInfo[]) => void;
  /** 更新 class-apply 指令（写入 canvas.metadata.erClassApplyClasses） */
  readonly onUpdateClassApplies: (classApplies: ErClassApplyInfo[]) => void;
  /** 更新节点内联样式（写入 node.data.styles，按节点 ID 索引） */
  readonly onUpdateNodeStyles: (nodeId: string, styles: string[]) => void;
}

// ============================================================
// 辅助函数
// ============================================================

/** 将逗号分隔的文本拆分为 string[]（trim + 过滤空值） */
function splitStyles(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 将 string[] 拼接为逗号分隔的文本 */
function joinStyles(styles: string[]): string {
  return styles.join(', ');
}

// ============================================================
// 组件
// ============================================================

/** 全局样式指令编辑面板 — classDef / class-apply / 内联 style */
export const ClassDefEditor = memo(function ClassDefEditor({
  classDefs,
  classApplies,
  nodes,
  onUpdateClassDefs,
  onUpdateClassApplies,
  onUpdateNodeStyles,
}: ClassDefEditorProps) {
  // === classDef 操作 ===
  const handleAddClassDef = () => {
    const newClassDef: ErClassInfo = {
      id: `classDef-${Date.now()}`,
      styles: [],
      textStyles: [],
    };
    onUpdateClassDefs([...classDefs, newClassDef]);
  };

  const handleUpdateClassDef = (index: number, updates: Partial<ErClassInfo>) => {
    const next = classDefs.map((cd, i) => (i === index ? { ...cd, ...updates } : cd));
    onUpdateClassDefs(next);
  };

  const handleDeleteClassDef = (index: number) => {
    onUpdateClassDefs(classDefs.filter((_, i) => i !== index));
  };

  // === class-apply 操作 ===
  const handleAddClassApply = () => {
    const newApply: ErClassApplyInfo = {
      ids: [],
      classNames: [],
    };
    onUpdateClassApplies([...classApplies, newApply]);
  };

  const handleUpdateClassApply = (index: number, updates: Partial<ErClassApplyInfo>) => {
    const next = classApplies.map((ca, i) => (i === index ? { ...ca, ...updates } : ca));
    onUpdateClassApplies(next);
  };

  const handleDeleteClassApply = (index: number) => {
    onUpdateClassApplies(classApplies.filter((_, i) => i !== index));
  };

  // === 有内联 style 的节点 ===
  const nodesWithStyles = nodes.filter(
    (n) => n.data.styles !== undefined && (n.data.styles as string[]).length > 0,
  );

  return (
    <div className="panel-content">
      {/* === classDef 指令 === */}
      <div className="panel-section-title">classDef 指令 ({classDefs.length})</div>
      {classDefs.length === 0 && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          无 classDef 指令。点击下方按钮添加。
        </p>
      )}
      {classDefs.map((cd, i) => (
        <div
          key={`classdef-${i}`}
          style={{
            marginBottom: 'var(--space-2)',
            padding: 'var(--space-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <label className="panel-label">
            类名
            <input
              className="panel-input"
              type="text"
              value={cd.id}
              placeholder="如: highlight"
              onChange={(e) => handleUpdateClassDef(i, { id: e.target.value })}
            />
          </label>
          <label className="panel-label">
            样式（逗号分隔）
            <input
              className="panel-input"
              type="text"
              value={joinStyles(cd.styles)}
              placeholder="如: fill:#f00, stroke:#333"
              onChange={(e) => handleUpdateClassDef(i, { styles: splitStyles(e.target.value) })}
            />
          </label>
          <label className="panel-label">
            文本样式（逗号分隔）
            <input
              className="panel-input"
              type="text"
              value={joinStyles(cd.textStyles)}
              placeholder="如: color:#fff"
              onChange={(e) => handleUpdateClassDef(i, { textStyles: splitStyles(e.target.value) })}
            />
          </label>
          <button
            className="panel-btn"
            onClick={() => handleDeleteClassDef(i)}
            style={{ marginTop: 'var(--space-1)' }}
          >
            删除
          </button>
        </div>
      ))}
      <button className="panel-btn" onClick={handleAddClassDef}>
        + 添加 classDef
      </button>

      {/* === class-apply 指令 === */}
      <div className="panel-section-title" style={{ marginTop: 'var(--space-3)' }}>
        class-apply 指令 ({classApplies.length})
      </div>
      {classApplies.length === 0 && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          无 class-apply 指令。点击下方按钮添加。
        </p>
      )}
      {classApplies.map((ca, i) => (
        <div
          key={`classapply-${i}`}
          style={{
            marginBottom: 'var(--space-2)',
            padding: 'var(--space-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <label className="panel-label">
            类名（逗号分隔）
            <input
              className="panel-input"
              type="text"
              value={joinStyles(ca.classNames)}
              placeholder="如: highlight, bold"
              onChange={(e) =>
                handleUpdateClassApply(i, { classNames: splitStyles(e.target.value) })
              }
            />
          </label>
          <label className="panel-label">
            目标 ID（逗号分隔）
            <input
              className="panel-input"
              type="text"
              value={joinStyles(ca.ids)}
              placeholder="如: Entity1, Entity2"
              onChange={(e) => handleUpdateClassApply(i, { ids: splitStyles(e.target.value) })}
            />
          </label>
          <button
            className="panel-btn"
            onClick={() => handleDeleteClassApply(i)}
            style={{ marginTop: 'var(--space-1)' }}
          >
            删除
          </button>
        </div>
      ))}
      <button className="panel-btn" onClick={handleAddClassApply}>
        + 添加 class-apply
      </button>

      {/* === 内联 style 指令（按节点）=== */}
      <div className="panel-section-title" style={{ marginTop: 'var(--space-3)' }}>
        内联 style 指令 ({nodesWithStyles.length})
      </div>
      {nodesWithStyles.length === 0 && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          无内联 style 指令。在画布选中节点后可通过样式编辑器添加。
        </p>
      )}
      {nodesWithStyles.map((node) => {
        const styles = (node.data.styles as string[]) ?? [];
        return (
          <div
            key={node.id}
            style={{
              marginBottom: 'var(--space-2)',
              padding: 'var(--space-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <label className="panel-label">
              {node.data.label ?? node.id}
              <input
                className="panel-input"
                type="text"
                value={joinStyles(styles)}
                placeholder="如: fill:#f00, stroke:#333"
                onChange={(e) => onUpdateNodeStyles(node.id, splitStyles(e.target.value))}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
});

ClassDefEditor.displayName = 'ClassDefEditor';
