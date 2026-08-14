/**
 * ClassDefPreview — 实时预览 classDef 样式效果（复用 ErBoxComponent 渲染）
 *
 * 单一职责：将 classDef.styles 转换为 NodeStyle，通过 mini ErBoxComponent 渲染预览
 *
 * M4 重构模块5 L2-7（方案C 核心，L2 决策2 方案A：mini ErBoxComponent）：
 *   - 复用模块4 ErBoxComponent 渲染组件，CSS transform: scale(0.5) 缩小尺寸
 *   - 构造 mock 节点数据（label='PreviewEntity' + 示例 attributes）
 *   - classDef.styles → parseStylesToNodeStyle → NodeStyle 传入 ErBoxComponent.data.style
 *   - 预览效果与实际画布渲染 100% 一致
 *   - 不依赖 cssCompiledStyles（实时预览，无需等待 parse-serialize 往返）
 *
 * 数据流:
 *   ErClassInfo.styles (string[]) → parseStylesToNodeStyle → NodeStyle
 *     → ErBoxComponent.data.style → applyNodeStyle → 渲染
 *
 * 性能评估（P1-9）：
 *   - CSS transform: scale(0.5) 是纯 CSS 变换，不触发 React Flow 内部测量
 *   - 单次预览渲染成本与一个 ErBox 节点渲染成本相同（约 1-2ms）
 *   - ClassDefEditor 列表中同时预览多个 classDef 时，用 React.memo + key 优化
 *   - property-panel 宽度限制下，同时可见预览数量通常 ≤ 5 个，总渲染成本 ≤ 10ms
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块5-编辑器.md
 */

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type {
  ErClassInfo,
  NodeAttribute,
  NodeStyle,
} from '@mermaid2aichat/serializer';
import { parseStylesToNodeStyle } from '@mermaid2aichat/serializer';
import type { ReactFlowNodeData } from '../../types.js';
import { ErBoxComponent, type ErFlowNode } from '../../nodes/er/er-box.js';

// ============================================================
// Props
// ============================================================

export interface ClassDefPreviewProps {
  /** 待预览的 classDef 信息（ErClassInfo，来自 canvas.metadata.erClasses） */
  readonly classDef: ErClassInfo;
}

// ============================================================
// 常量
// ============================================================

/** 预览缩放比例（适配 property-panel 宽度，L2 决策2 方案A） */
const PREVIEW_SCALE = 0.5;

/** 预览实体名（展示标题栏效果） */
const PREVIEW_LABEL = 'PreviewEntity';

/**
 * 预览属性列表（展示 4 列分栏效果：type/name/keys/comment）
 *
 * 覆盖 PK badge + 空属性 + 带注释 3 种行形态，确保预览能反映 ErBox 的全部视觉特性
 */
const PREVIEW_ATTRIBUTES: readonly NodeAttribute[] = [
  { type: 'int', name: 'id', keys: ['PK'], comment: 'ID' },
  { type: 'string', name: 'name', keys: [], comment: '' },
  { type: 'date', name: 'created_at', keys: [], comment: '创建时间' },
];

// ============================================================
// 组件
// ============================================================

/**
 * 实时预览 classDef 样式效果（复用 ErBoxComponent 渲染）
 *
 * 实现策略（L2 决策2 方案A）：
 *   1. classDef.styles (string[]) → parseStylesToNodeStyle → NodeStyle
 *   2. 构造 mock NodeProps<ErFlowNode>（ErBoxComponent 仅消费 data + selected，其他字段必填但不影响渲染）
 *   3. CSS transform: scale(0.5) 缩小 ErBoxComponent
 *   4. pointerEvents: 'none' 禁用交互（预览不响应点击）
 */
export const ClassDefPreview = memo(function ClassDefPreview({
  classDef,
}: ClassDefPreviewProps) {
  // classDef.styles → NodeStyle（单一数据源：复用 flowchart parseStylesToNodeStyle）
  const previewStyle: NodeStyle | undefined = parseStylesToNodeStyle(classDef.styles);

  // 构造 mock NodeProps<ErFlowNode>：
  // - ErBoxComponent 仅解构 data + selected，但 NodeProps 类型要求所有 Required 字段必填
  // - 其他字段（dragging/zIndex/selectable 等）填默认值，不影响 ErBoxComponent 渲染
  const mockNodeProps: NodeProps<ErFlowNode> = {
    id: `preview-${classDef.id}`,
    type: 'er-box',
    data: {
      label: PREVIEW_LABEL,
      attributes: [...PREVIEW_ATTRIBUTES],
      style: previewStyle,
    } as ReactFlowNodeData,
    selected: false,
    dragging: false,
    zIndex: 0,
    selectable: false,
    deletable: false,
    draggable: false,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };

  return (
    <div
      style={{
        transform: `scale(${PREVIEW_SCALE})`,
        transformOrigin: 'top left',
        width: 'fit-content',
        pointerEvents: 'none',
      }}
    >
      <ErBoxComponent {...mockNodeProps} />
    </div>
  );
});

ClassDefPreview.displayName = 'ClassDefPreview';
