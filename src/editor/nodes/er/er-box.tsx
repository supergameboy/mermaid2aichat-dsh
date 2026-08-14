/**
 * ErBox 节点组件 — 渲染 ER 实体盒（标题栏 + 4 列分栏属性区，对齐官方 drawAttributes）
 *
 * 单一职责：渲染 erDiagram 的实体节点视觉，管理 Handle 连接点
 *
 * 模块4 L2-1（套用 ClassBoxComponent 模式 + ER 特化）：
 *   - CSS 变量适配暗色模式（var(--er-box-stroke) 等）
 *   - applyNodeStyle 透传用户样式（classDef/style 指令，data.style 由模块2 mergeErNodeStyles 构建）
 *   - 4 列分栏属性区（CSS grid minmax 自适应列宽，列宽 = max(最小列宽, 最长文本宽度)）
 *   - 行交替背景（attributeBoxOdd/attributeBoxEven，对齐官方 erRenderer）
 *   - 共享 ER_BOX_CONSTANTS（供渲染和 dagre 估算共用，单一数据源）
 *
 * 数据流:
 *   MermaidNode (type='er-box') → ErBoxComponent
 *     → 标题栏 (data.label + data.alias)
 *     → divider
 *     → 4 列分栏属性区 (data.attributes: type/name/keys/comment)
 *
 * 字段约定（通过 MermaidNodeData 承载）:
 *   - label: string                  — 实体名（M0 定义）
 *   - attributes?: NodeAttribute[]   — 属性列表（M0 定义）
 *   - alias?: string                 — 实体别名（er 专用）
 *   - style?: NodeStyle              — 用户样式（由模块2 mergeErNodeStyles 构建）
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块4-渲染器.md
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type {
  NodeAttribute,
  ERAttributeKey,
} from '@mermaid2aichat/serializer';
import type { ReactFlowNodeData } from '../../types.js';
import { ER_BOX_CONSTANTS as C } from './er-box-constants.js';
import { applyNodeStyle } from '../shared/apply-node-style.js';

// ============================================================
// 类型
// ============================================================

/** React Flow 节点类型，data 为 ReactFlowNodeData */
export type ErFlowNode = Node<ReactFlowNodeData, 'er-box'>;

// ============================================================
// 常量
// ============================================================

const handleStyle = { width: 8, height: 8 };

/** key badge 样式映射（PK/FK/UK，对齐官方 erRenderer attributeBox 的 key 显示） */
const KEY_BADGE_STYLES: Readonly<Record<ERAttributeKey, { background: string; color: string }>> = {
  PK: { background: '#ff4d4f', color: '#fff' },
  FK: { background: '#1890ff', color: '#fff' },
  UK: { background: '#52c41a', color: '#fff' },
};

/** key 显示顺序约定（PK > FK > UK，对齐官方 erRenderer） */
const KEY_ORDER: readonly ERAttributeKey[] = ['PK', 'FK', 'UK'];

// ============================================================
// 辅助函数
// ============================================================

/** 渲染属性的 key badge 列表（按 PK > FK > UK 顺序） */
function renderKeyBadges(keys: ERAttributeKey[]): React.ReactNode {
  const sorted = KEY_ORDER.filter((k) => keys.includes(k));
  if (sorted.length === 0) return null;
  return sorted.map((key) => {
    const style = KEY_BADGE_STYLES[key];
    return (
      <span
        key={key}
        style={{
          display: 'inline-block',
          background: style.background,
          color: style.color,
          padding: '0 4px',
          borderRadius: 2,
          fontSize: 10,
          fontWeight: 'bold',
          marginRight: 4,
          lineHeight: '14px',
        }}
      >
        {key}
      </span>
    );
  });
}

// ============================================================
// 节点组件
// ============================================================

/**
 * ErBox 节点组件 — 渲染 ER 实体盒（标题栏 + 4 列分栏属性区，对齐官方 drawAttributes）
 *
 * 4 列分栏（CSS grid minmax 自适应列宽）：
 *   - type 列：属性类型（如 string/int）
 *   - name 列：属性名
 *   - keys 列：PK/FK/UK badge
 *   - comment 列：属性注释
 *   - 列宽 = max(最小列宽, 该列所有行最长文本宽度)，由 CSS grid 引擎自动计算
 *
 * 行交替背景：奇数行 attributeBoxOdd / 偶数行 attributeBoxEven（对齐官方 erRenderer）
 */
export const ErBoxComponent = memo(function ErBoxComponent({
  data,
  selected,
}: NodeProps<ErFlowNode>) {
  const attributes = data.attributes ?? [];
  const alias = data.alias;
  const userStyle = data.style;

  // CSS 变量适配暗色模式 + 用户样式透传
  const borderColor = `var(--er-box-${selected ? 'selected-stroke' : 'stroke'})`;
  const borderWidth = selected ? '2px' : '1px';
  const userCss = applyNodeStyle(userStyle);

  return (
    <div
      className="er-box"
      style={{
        position: 'relative',
        display: 'inline-block',
        minWidth: C.MIN_WIDTH,
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius: 4,
        background: 'var(--er-box-bg)',
        color: 'var(--er-box-text)',
        fontSize: 13,
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...userCss,
      }}
    >
      {/* 四方向 Handle — 支持任意方向连接 */}
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />

      {/* 标题栏：实体名 + 别名 */}
      <div
        className="er-box-header"
        style={{
          background: 'var(--er-box-header-bg)',
          padding: '6px 12px',
          fontWeight: 'bold',
          textAlign: 'center',
          color: 'var(--er-box-header-text)',
          borderBottom: attributes.length > 0 ? `1px solid ${borderColor}` : 'none',
        }}
      >
        <div>{data.label}</div>
        {alias && (
          <div style={{ fontSize: 11, fontWeight: 'normal', color: 'var(--er-box-alias-text)', marginTop: 2 }}>
            ({alias})
          </div>
        )}
      </div>

      {/* 4 列分栏属性区（CSS grid minmax 自适应列宽，列宽 = max(最小列宽, 该列最长文本宽度)） */}
      {attributes.length > 0 && (
        <div
          className="er-box-attributes"
          style={{
            display: 'grid',
            gridTemplateColumns: `minmax(${C.COLUMN_TYPE_MIN_WIDTH}px, auto) minmax(${C.COLUMN_NAME_MIN_WIDTH}px, auto) minmax(${C.COLUMN_KEYS_MIN_WIDTH}px, auto) minmax(${C.COLUMN_COMMENT_MIN_WIDTH}px, auto)`,
            gridAutoRows: C.ATTRIBUTE_LINE_HEIGHT + 2,
            fontFamily: 'monospace',
            padding: `${C.ATTRIBUTE_PADDING_Y / 2}px ${C.ATTRIBUTE_HORIZONTAL_PADDING / 2}px`,
          }}
        >
          {attributes.flatMap((attr: NodeAttribute, i: number) => {
            const rowBgClass = i % 2 === 0 ? 'er-attribute-box-odd' : 'er-attribute-box-even';
            return [
              /* type 列 */
              <div
                key={`type-${i}`}
                className={`er-attribute-type ${rowBgClass}`}
                style={{
                  padding: '0 4px',
                  lineHeight: `${C.ATTRIBUTE_LINE_HEIGHT + 2}px`,
                  color: 'var(--er-attribute-type-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {attr.type}
              </div>,
              /* name 列 */
              <div
                key={`name-${i}`}
                className={`er-attribute-name ${rowBgClass}`}
                style={{
                  padding: '0 4px',
                  lineHeight: `${C.ATTRIBUTE_LINE_HEIGHT + 2}px`,
                  color: 'var(--er-box-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {attr.name}
              </div>,
              /* keys 列 */
              <div
                key={`keys-${i}`}
                className={`er-attribute-keys ${rowBgClass}`}
                style={{
                  padding: '0 4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {renderKeyBadges(attr.keys)}
              </div>,
              /* comment 列 */
              <div
                key={`comment-${i}`}
                className={`er-attribute-comment ${rowBgClass}`}
                style={{
                  padding: '0 4px',
                  lineHeight: `${C.ATTRIBUTE_LINE_HEIGHT + 2}px`,
                  color: 'var(--er-attribute-comment-text)',
                  fontStyle: 'italic',
                  fontSize: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {attr.comment && `"${attr.comment}"`}
              </div>,
            ];
          })}
        </div>
      )}

      {/* 空属性提示 */}
      {attributes.length === 0 && (
        <div
          style={{
            padding: '4px 8px',
            color: 'var(--er-box-alias-text)',
            fontStyle: 'italic',
          }}
        >
          （无属性）
        </div>
      )}
    </div>
  );
});

ErBoxComponent.displayName = 'ErBox';
