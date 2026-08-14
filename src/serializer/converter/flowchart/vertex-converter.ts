/**
 * VertexConverter — VertexBlock ↔ MermaidNode 双向转换
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 4
 *
 * 数据流：
 *   parse 方向：VertexBlock → MermaidNode（通过 ctx.registerNode 累加，决策17 merge 语义）
 *   serialize 方向：MermaidNode → VertexBlock（含 rawText，复用 serializeVertex 纯函数）
 *
 * 字段映射要点：
 *   - nodeId → MermaidNode.id
 *   - label → data.label（undefined 时条件展开不设置，mergeNode 跳过保留已有 label）
 *   - shape → data.shape（undefined 时条件展开不设置，mergeNode 跳过保留已有 shape）
 *   - labelType → data.labelType
 *   - inlineStyles → data.styles
 *   - inlineClasses → data.classNames
 *   - dir → data.dir
 *   - props → data.props
 *   - sourceLine → data._sourceLine
 *   - isSubgraph = false（VertexBlock 永远非 subgraph）
 *   - position = { x: 0, y: 0 }（布局器填充，Converter 不设置）
 *   - parentId = ctx.currentParent()（嵌套 subgraph 时由栈顶决定）
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../types.js、../../serializer/flowchart/vertex-serializer.js，不引用 React/DOM。
 */

import type {
  FlowchartDirection,
  MermaidNode,
  MermaidNodeData,
} from '../../types.js';
import type { VertexBlock } from '../../recognizer/types.js';
import type {
  ConverterContext,
  IModelBlockConverter,
} from '../types.js';
import { serializeVertex } from '../../serializer/flowchart/vertex-serializer.js';

// ============================================================
// VertexConverter 实现
// ============================================================

/**
 * VertexBlock ↔ MermaidNode 双向转换器
 *
 * 决策17 merge 语义：registerNode 时若 nodeId 已存在则按字段优先级 merge
 * （后定义的非 undefined 字段覆盖前定义的），由 ConverterContext 实现负责。
 */
export class VertexConverter
  implements IModelBlockConverter<VertexBlock, MermaidNode, ConverterContext>
{
  /** parse：VertexBlock → MermaidNode，通过 ctx.registerNode 累加 */
  parseBlock(block: VertexBlock, context: ConverterContext): MermaidNode | null {
    // label/shape 均不 fallback（code-standards 第6章）：边规则产出的 VertexBlock
    // 不携带 label/shape（jison 边规则不解析标签和形状语法），mergeNode 跳过 undefined
    // 字段保留已有 label/shape；节点从未定义 label/shape 时由渲染层默认。
    const data: MermaidNodeData = {
      ...(block.label !== undefined ? { label: block.label } : {}),
      ...(block.shape !== undefined ? { shape: block.shape } : {}),
      isSubgraph: false,
      ...(block.labelType !== undefined ? { labelType: block.labelType } : {}),
      ...(block.inlineStyles.length > 0 ? { styles: [...block.inlineStyles] } : {}),
      ...(block.inlineClasses.length > 0 ? { classNames: [...block.inlineClasses] } : {}),
      ...(block.dir !== undefined ? { dir: block.dir } : {}),
      ...(block.props !== undefined ? { props: block.props as Record<string, unknown> } : {}),
      ...(block.sourceLine !== undefined ? { _sourceLine: block.sourceLine } : {}),
    };

    const node: MermaidNode = {
      id: block.nodeId,
      type: 'default',
      position: { x: 0, y: 0 },
      data,
      ...(context.currentParent() !== undefined
        ? { parentId: context.currentParent() }
        : {}),
    };

    context.registerNode(node);
    return node;
  }

  /** serialize：MermaidNode → VertexBlock（含 rawText） */
  serializeBlock(model: MermaidNode, _context: ConverterContext): VertexBlock | null {
    // subgraph 节点不序列化为 VertexBlock（由 SubgraphConverter 处理）
    if (model.data.isSubgraph === true) {
      return null;
    }

    const data = model.data;
    const rawText = serializeVertex(model);

    const block: VertexBlock = {
      type: 'vertex',
      sourceLine: data._sourceLine,
      rawText,
      indent: 0,
      nodeId: model.id,
      label: data.label === model.id ? undefined : data.label,
      labelType: data.labelType,
      shape: data.shape,
      inlineStyles: data.styles ?? [],
      inlineClasses: data.classNames ?? [],
      dir: this.parseDirection(data.dir),
      props: data.props,
    };

    return block;
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 将 data.dir 字符串解析为 FlowchartDirection
   * data.dir 类型为 string（types.ts:627），serialize 方向需收窄为 FlowchartDirection
   */
  private parseDirection(dir: string | undefined): FlowchartDirection | undefined {
    if (dir === undefined) {
      return undefined;
    }
    // 类型守卫收窄：仅接受合法 FlowchartDirection 字面量
    if (dir === 'TB' || dir === 'TD' || dir === 'BT' || dir === 'RL' || dir === 'LR') {
      return dir;
    }
    return undefined;
  }
}
