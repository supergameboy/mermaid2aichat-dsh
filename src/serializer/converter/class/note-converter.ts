/**
 * NoteConverter — NoteBlock ↔ MermaidNode + NoteEdge 双向转换
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块2-转换器.md
 * 阶段：M3 重构 L2-5
 *
 * 数据流：
 *   parse 方向：NoteBlock → MermaidNode（type='class-note'） + NoteEdge（type='note-edge'）
 *     - 创建 note 节点（data.label=text, shape='note'）
 *     - 若 block.classId 存在，额外创建 note-edge（source=classId, target=noteId）
 *     - metadataCollector.addNote({text, classId})
 *   serialize 方向：MermaidNode（type='class-note'） → NoteBlock（含 rawText，对齐设计点1）
 *     - text = node.data.label
 *     - classId 从 note-edge.source 推断（查找 ctx.getEdges() 中 target=noteId 的 note-edge）
 *     - rawText 由 formatNote 生成（`note for ClassId "text"` 或 `note "text"`）
 *
 * note for ClassName 关联：
 *   - parse: NoteBlock.classId → NoteEdge.source=classId, NoteEdge.target=noteId
 *   - serialize: 查找 NoteEdge.target=noteId → NoteBlock.classId=NoteEdge.source
 *
 * 独立 note（无 classId）：
 *   - parse: 仅创建 note 节点，不创建 note-edge
 *   - serialize: NoteBlock.classId=undefined，rawText=`note "text"`
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、../types.js，不引用 React/DOM。
 */

import type {
  MermaidEdge,
  MermaidEdgeData,
  MermaidEdgeStyle,
  MermaidNode,
  MermaidNodeData,
  MermaidShapeType,
} from '../../types.js';
import type { NoteBlock } from '../../recognizer/types.js';
import type {
  ClassConverterContext,
} from './types.js';
import type {
  IModelBlockConverter,
} from '../types.js';

// ============================================================
// 辅助函数：rawText 生成
// ============================================================

/**
 * 转义 note 文本中的特殊字符（双引号）
 *
 * 对齐老路径 note-serializer.ts escapeNoteText
 */
function escapeNoteText(text: string): string {
  return text.replace(/"/g, '\\"');
}

/**
 * 生成 note block 的 rawText（对齐老路径 serializeNote 行为）
 *
 * - 关联 class 的 note：`note for ClassId "text"`
 * - 独立 note（无 classId）：`note "text"`
 */
function formatNote(classId: string | undefined, text: string): string {
  const escapedText = escapeNoteText(text);
  if (classId !== undefined && classId !== '') {
    return `note for ${classId} "${escapedText}"`;
  }
  return `note "${escapedText}"`;
}

// ============================================================
// NoteConverter 实现
// ============================================================

/**
 * NoteBlock ↔ MermaidNode 双向转换器
 *
 * parse 方向产出 note 节点（type='class-note'，shape='note'），
 * 若有关联 classId 额外产出 note-edge（type='note-edge'）
 */
export class NoteConverter
  implements IModelBlockConverter<NoteBlock, MermaidNode, ClassConverterContext>
{
  /** parse：NoteBlock → MermaidNode + NoteEdge，通过 ctx.registerNode/registerEdge 注册 */
  parseBlock(block: NoteBlock, context: ClassConverterContext): MermaidNode | null {
    const noteIndex = context.getNodes().filter((n) => n.type === 'class-note').length;
    const noteId = `note-${noteIndex}`;

    // 1. 创建 note 节点
    const data: MermaidNodeData = {
      label: block.text,
      shape: 'class-note' as MermaidShapeType,
      ...(block.sourceLine !== undefined ? { _sourceLine: block.sourceLine } : {}),
    };

    const node: MermaidNode = {
      id: noteId,
      type: 'class-note',
      position: { x: 0, y: 0 },
      data,
      ...(context.currentParent() !== undefined
        ? { parentId: context.currentParent() }
        : {}),
    };

    context.registerNode(node);

    // 2. 若有关联 classId，创建 note-edge（source=classId, target=noteId）
    if (block.classId !== undefined && block.classId !== '') {
      const edgeData: MermaidEdgeData = {
        edgeStyle: 'dotted' as MermaidEdgeStyle,
      };
      const noteEdge: MermaidEdge = {
        id: `note-edge-${noteIndex}`,
        source: block.classId,
        target: noteId,
        type: 'note-edge',
        data: edgeData,
      };
      context.registerEdge(noteEdge);
    }

    // 3. 累积到 metadata.classNotes
    context.metadataCollector.addNote({
      text: block.text,
      ...(block.classId !== undefined && block.classId !== ''
        ? { classId: block.classId }
        : {}),
    });

    return node;
  }

  /** serialize：MermaidNode → NoteBlock（含 rawText，对齐设计点1） */
  serializeBlock(model: MermaidNode, context: ClassConverterContext): NoteBlock | null {
    // 非注解节点返回 null
    if (model.type !== 'class-note') {
      return null;
    }

    const data = model.data;
    const text = (data.label as string | undefined) ?? '';

    // 从 note-edge 推断 classId：查找 ctx.getEdges() 中 target=noteId 的 note-edge
    const noteEdge = context.getEdges().find(
      (edge) => edge.type === 'note-edge' && edge.target === model.id,
    );
    const classId = noteEdge?.source;

    // rawText 由 formatNote 生成（设计点1：rawText 由 Converter 生成）
    const rawText = formatNote(classId, text);

    const block: NoteBlock = {
      type: 'note',
      sourceLine: data._sourceLine,
      rawText,
      indent: 0,
      text,
      // classId 类型为 string | undefined（required 字段，值可为 undefined）
      classId,
    };

    return block;
  }
}
