/**
 * ClassBox 节点组件 — 渲染类盒（4 分区 + 2 divider，对齐官方 classBox 渲染标准）
 *
 * 单一职责：渲染 classDiagram 的类节点视觉，管理 Handle 连接点
 *
 * M3 重构模块4 L2-2：
 *   - 4 分区结构：annotation-group / label-group / members-group / methods-group
 *   - 2 条 divider 线（label 下 + members 下）
 *   - classifier 作为 CSS 样式（italic/underline），非文本后缀
 *   - 泛型显示 <T>（id 用 ~T~）
 *   - stereotype 用 «interface» 单书名号
 *   - 消费 node.data.style（用户样式透传）
 *   - CSS 变量适配暗色模式
 *
 * 数据流:
 *   MermaidNode (type='class-box') → ClassBoxComponent
 *     → annotation-group (stereotype «interface» + annotations «ann»)
 *     → label-group (类名 + 泛型 <T>)
 *     → divider 1
 *     → members-group (属性列表，classifier 用 CSS 类)
 *     → divider 2
 *     → methods-group (方法列表，classifier 用 CSS 类)
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type {
  NodeMember,
  ClassVisibility,
  ClassStereotype,
} from '@mermaid2aichat/serializer';
import type { CSSProperties } from 'react';
import type { ReactFlowNodeData } from '../../types.js';
import { CLASS_BOX_CONSTANTS as C } from './class-box-constants.js';
import { applyNodeStyle } from '../shared/apply-node-style.js';

// ============================================================
// 类型
// ============================================================

/** React Flow 节点类型，data 为 ReactFlowNodeData */
export type ClassBoxFlowNode = Node<ReactFlowNodeData, 'class-box'>;

// ============================================================
// 常量
// ============================================================

const handleStyle = { width: 8, height: 8 };

/** stereotype 显示文本（单书名号 «»，对齐官方 classBox 渲染标准） */
const STEREOTYPE_LABELS: Readonly<Record<ClassStereotype, string>> = {
  interface: '«interface»',
  abstract: '«abstract»',
  annotation: '«annotation»',
  enum: '«enum»',
  protocol: '«protocol»',
  exception: '«exception»',
  metaclass: '«metaclass»',
  stereotype: '«stereotype»',
};

const VISIBILITY_SYMBOLS: Readonly<Record<ClassVisibility, string>> = {
  '+': '+',
  '-': '-',
  '#': '#',
  '~': '~',
  '': '',
};

// ============================================================
// 辅助函数
// ============================================================

/** 格式化属性显示文本（不含 classifier 后缀，classifier 由 CSS 类表达） */
function formatAttribute(member: NodeMember): string {
  const visibility = VISIBILITY_SYMBOLS[member.visibility] ?? '';
  const typePart = member.type ? `: ${member.type}` : '';
  return `${visibility} ${member.name}${typePart}`;
}

/** 格式化方法显示文本（不含 classifier 后缀，classifier 由 CSS 类表达） */
function formatMethod(member: NodeMember): string {
  const visibility = VISIBILITY_SYMBOLS[member.visibility] ?? '';
  const params = member.parameters ?? '';
  const returnTypePart = member.returnType ? `: ${member.returnType}` : '';
  return `${visibility} ${member.name}(${params})${returnTypePart}`;
}

/** 获取成员的 classifier CSS 类名（对齐官方 classBox：italic=abstract, underline=static） */
function getMemberClassName(member: NodeMember): string {
  if (member.isAbstract) return 'class-member-abstract';
  if (member.isStatic) return 'class-member-static';
  return '';
}

// ============================================================
// 节点组件
// ============================================================

/** ClassBox 节点组件 — 渲染类盒（4 分区 + 2 divider，对齐官方 classBox） */
export const ClassBoxComponent = memo(function ClassBoxComponent({
  data,
  selected,
}: NodeProps<ClassBoxFlowNode>) {
  const members = data.members ?? [];
  const fields = members.filter((m) => !m.isMethod);
  const methods = members.filter((m) => m.isMethod);

  const stereotype = data.stereotype;
  const generics = data.generics;
  const annotations = data.annotations ?? [];
  const userStyle = data.style;

  // CSS 变量适配暗色模式 + 用户样式透传
  const borderColor = `var(--class-box-${selected ? 'selected-stroke' : 'stroke'})`;
  const borderWidth = selected ? '2px' : '1px';
  const userCss = applyNodeStyle(userStyle);

  // divider 样式（2 条横线：label 下 + members 下）
  const dividerStyle: CSSProperties = {
    height: 0,
    borderTop: `1px solid var(--class-box-divider-stroke)`,
    margin: 0,
  };

  return (
    <div
      className="class-box"
      style={{
        position: 'relative',
        display: 'inline-block',
        minWidth: C.MIN_WIDTH,
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius: 4,
        background: 'var(--class-box-bg)',
        color: 'var(--class-box-text)',
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

      {/* annotation-group：stereotype + annotations（«interface» 单书名号） */}
      {(stereotype || annotations.length > 0) && (
        <div
          className="class-box-annotation-group"
          style={{
            padding: '4px 12px 2px',
            textAlign: 'center',
            color: 'var(--class-box-annotation-text)',
            fontSize: 11,
          }}
        >
          {stereotype && <div>{STEREOTYPE_LABELS[stereotype]}</div>}
          {annotations.length > 0 && (
            <div>{annotations.map((ann) => `«${ann}»`).join(' ')}</div>
          )}
        </div>
      )}

      {/* label-group：类名 + 泛型 <T>（id 用 ~T~，显示用 <T>） */}
      <div
        className="class-box-label-group"
        style={{
          padding: '4px 12px',
          fontWeight: 'bolder',
          textAlign: 'center',
          color: 'var(--class-box-header-text)',
          background: 'var(--class-box-header-bg)',
        }}
      >
        {data.label}
        {generics && <span style={{ fontStyle: 'italic' }}>{`<${generics}>`}</span>}
      </div>

      {/* divider 1（label 下） */}
      <div className="class-box-divider" style={dividerStyle} />

      {/* members-group：属性列表（classifier 用 CSS 类，非文本后缀） */}
      {fields.length > 0 && (
        <div
          className="class-box-members-group"
          style={{ padding: '4px 8px', color: 'var(--class-box-member-text)' }}
        >
          {fields.map((member, i) => (
            <div
              key={`field-${i}`}
              className={getMemberClassName(member)}
              style={{ fontFamily: 'monospace', padding: '1px 0' }}
            >
              {formatAttribute(member)}
            </div>
          ))}
        </div>
      )}

      {/* divider 2（members 下，仅当属性和方法都存在时显示） */}
      {fields.length > 0 && methods.length > 0 && (
        <div className="class-box-divider" style={dividerStyle} />
      )}

      {/* methods-group：方法列表（classifier 用 CSS 类，非文本后缀） */}
      {methods.length > 0 && (
        <div
          className="class-box-methods-group"
          style={{ padding: '4px 8px', color: 'var(--class-box-method-text)' }}
        >
          {methods.map((member, i) => (
            <div
              key={`method-${i}`}
              className={getMemberClassName(member)}
              style={{ fontFamily: 'monospace', padding: '1px 0' }}
            >
              {formatMethod(member)}
            </div>
          ))}
        </div>
      )}

      {/* 空类提示 */}
      {fields.length === 0 && methods.length === 0 && (
        <div
          style={{
            padding: '4px 8px',
            color: 'var(--class-box-annotation-text)',
            fontStyle: 'italic',
          }}
        >
          （空类）
        </div>
      )}
    </div>
  );
});

ClassBoxComponent.displayName = 'ClassBox';
