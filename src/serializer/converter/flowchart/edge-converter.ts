/**
 * EdgeConverter — EdgeBlock ↔ MermaidEdge 双向转换
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 4
 *
 * 数据流：
 *   parse 方向：EdgeBlock → MermaidEdge（通过 ctx.registerEdge 累加）
 *     - data.subgraphId 由 ctx.currentParent() 读取栈顶设置（P1-6 方案B）
 *   serialize 方向：MermaidEdge → EdgeBlock（含 rawText，复用 serializeEdge 纯函数）
 *
 * 字段映射要点：
 *   - sourceId → MermaidEdge.source
 *   - targetId → MermaidEdge.target
 *   - edgeStyle → data.edgeStyle
 *   - label → data.label
 *   - labelType → data.labelType
 *   - length → data.length
 *   - edgeId → MermaidEdge.id + data.isUserDefinedId（无 edgeId 时自动生成 edge-{index}）
 *   - classNames → data.classNames
 *   - ctx.currentParent() → data.subgraphId（P1-6 方案B）
 *   - sourceLine → data._sourceLine
 *   - hasSourceVertexDef / hasTargetVertexDef 已恒为 false（设计-实现差异#4）
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../types.js、../../serializer/flowchart/edge-serializer.js，不引用 React/DOM。
 */

import type {
  MermaidEdge,
  MermaidEdgeData,
} from '../../types.js';
import type { EdgeBlock } from '../../recognizer/types.js';
import type {
  ConverterContext,
  IModelBlockConverter,
} from '../types.js';
import { serializeEdge } from '../../serializer/flowchart/edge-serializer.js';

// ============================================================
// EdgeConverter 实现
// ============================================================

/**
 * EdgeBlock ↔ MermaidEdge 双向转换器
 */
export class EdgeConverter
  implements IModelBlockConverter<EdgeBlock, MermaidEdge, ConverterContext>
{
  /** parse：EdgeBlock → MermaidEdge，通过 ctx.registerEdge 累加 */
  parseBlock(block: EdgeBlock, context: ConverterContext): MermaidEdge | null {
    const parentSubgraphId = context.currentParent();
    const edgeIndex = context.getEdges().length;
    const edgeId = block.edgeId ?? `edge-${edgeIndex}`;

    const data: MermaidEdgeData = {
      edgeStyle: block.edgeStyle,
      ...(block.label !== undefined ? { label: block.label } : {}),
      ...(block.labelType !== undefined ? { labelType: block.labelType } : {}),
      ...(block.length !== undefined ? { length: block.length } : {}),
      ...(block.classNames.length > 0 ? { classNames: [...block.classNames] } : {}),
      ...(block.edgeId !== undefined ? { isUserDefinedId: true } : {}),
      ...(parentSubgraphId !== undefined ? { subgraphId: parentSubgraphId } : {}),
      ...(block.sourceLine !== undefined ? { _sourceLine: block.sourceLine } : {}),
    };

    const edge: MermaidEdge = {
      id: edgeId,
      source: block.sourceId,
      target: block.targetId,
      type: 'default',
      data,
    };

    context.registerEdge(edge);
    return edge;
  }

  /** serialize：MermaidEdge → EdgeBlock（含 rawText） */
  serializeBlock(model: MermaidEdge, _context: ConverterContext): EdgeBlock | null {
    const data = model.data;
    const rawText = serializeEdge(model);

    const block: EdgeBlock = {
      type: 'edge',
      sourceLine: data._sourceLine,
      rawText,
      indent: 0,
      sourceId: model.source,
      targetId: model.target,
      hasSourceVertexDef: false,
      hasTargetVertexDef: false,
      edgeStyle: data.edgeStyle,
      label: data.label,
      labelType: data.labelType,
      length: data.length,
      edgeId: data.isUserDefinedId === true ? model.id : undefined,
      classNames: data.classNames ?? [],
    };

    return block;
  }
}
