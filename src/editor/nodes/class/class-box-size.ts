/**
 * class-box 节点尺寸估算 — 用于 dagre 布局输入
 *
 * 单一职责：根据 class-box 节点的数据（members/stereotype/generics/annotations）估算渲染尺寸
 *
 * 设计动机（M3 修订）：
 *   - 修复"代码初始化后布局出现类重叠"bug
 *   - dagre-layout.ts:getNodeSize 对非 subgraph 节点统一调用 computeNodeSize(shape, label)
 *   - computeNodeSize 仅基于 shape + label 算尺寸，不考虑 members 数量
 *   - class-box 节点实际高度 = 标题 + annotation + N 属性 + divider + M 方法（动态）
 *   - 修复：getNodeSize 增加 class-box 分支调用本函数
 *
 * 算法（对齐 class-box.tsx 实际渲染参数，class-box-constants.ts 共享常量）：
 *   height = LABEL_HEIGHT + LABEL_PADDING_Y
 *            + (有 stereotype/annotations ? ANNOTATION_PADDING_Y + ANNOTATION_LINE_HEIGHT × 行数 : 0)
 *            + (fields.length > 0 ? fields.length × MEMBER_LINE_HEIGHT + MEMBER_GROUP_PADDING_Y : 0)
 *            + (fields.length > 0 && methods.length > 0 ? DIVIDER_HEIGHT : 0)
 *            + (methods.length > 0 ? methods.length × MEMBER_LINE_HEIGHT + MEMBER_GROUP_PADDING_Y : 0)
 *            + (空类 ? EMPTY_CLASS_HINT_HEIGHT : 0)
 *
 *   width = max(MIN_WIDTH,
 *               (label.length + (generics ? generics.length + 2 : 0)) × LABEL_FONT_WIDTH + LABEL_HORIZONTAL_PADDING,
 *               longestMemberText.length × MEMBER_FONT_WIDTH + MEMBER_HORIZONTAL_PADDING)
 *
 * 字宽估算说明：
 *   - monospace 字体（members/methods）：字符等宽 × MEMBER_FONT_WIDTH=7，估算精确
 *   - proportional 字体（label, bolder）：字符不等宽，按平均字宽 LABEL_FONT_WIDTH=8 估算
 *     对齐现有 shape-geometry.ts:CHAR_WIDTH=8 的估算方式
 *   - 不使用 canvas.measureText：会引入 DOM 依赖，破坏纯函数特性（影响 SSR/测试）
 *
 * 模块边界：仅依赖 @mermaid2aichat/serializer 类型，不引用 React/DOM（code-standards.md §7）
 */

import type { MermaidNode, NodeMember } from '@mermaid2aichat/serializer';
import { CLASS_BOX_CONSTANTS as C } from './class-box-constants.js';

/**
 * 估算 class-box 节点的 dagre 布局尺寸
 *
 * @param node - type='class-box' 的 MermaidNode
 * @returns 节点宽高（用于 dagre 布局输入，估算值偏大时浪费空间，偏小时仍会重叠）
 */
export function computeClassBoxSize(node: MermaidNode): { width: number; height: number } {
  const data = node.data;
  const members = data.members ?? [];
  const fields = members.filter((m) => !m.isMethod);
  const methods = members.filter((m) => m.isMethod);
  const stereotype = data.stereotype;
  const annotations = data.annotations ?? [];
  const generics = data.generics;
  const label = String(data.label ?? node.id);

  // === 高度估算 ===
  let height = C.LABEL_HEIGHT + C.LABEL_PADDING_Y;

  // annotation-group（有 stereotype 或 annotations 时渲染）
  if (stereotype !== undefined || annotations.length > 0) {
    const annotationLines = (stereotype ? 1 : 0) + (annotations.length > 0 ? 1 : 0);
    height += C.ANNOTATION_PADDING_Y + C.ANNOTATION_LINE_HEIGHT * annotationLines;
  }

  // members-group（属性区）
  if (fields.length > 0) {
    height += fields.length * C.MEMBER_LINE_HEIGHT + C.MEMBER_GROUP_PADDING_Y;
  }

  // divider 2（属性和方法都存在时）
  if (fields.length > 0 && methods.length > 0) {
    height += C.DIVIDER_HEIGHT;
  }

  // methods-group（方法区）
  if (methods.length > 0) {
    height += methods.length * C.MEMBER_LINE_HEIGHT + C.MEMBER_GROUP_PADDING_Y;
  }

  // 空类提示（属性和方法都为空时显示）
  if (fields.length === 0 && methods.length === 0) {
    height += C.EMPTY_CLASS_HINT_HEIGHT;
  }

  // === 宽度估算 ===
  // 标题完整显示长度（label + 可选 <generics>）
  const labelDisplayLength = label.length + (generics ? generics.length + 2 : 0);
  const labelWidth = labelDisplayLength * C.LABEL_FONT_WIDTH + C.LABEL_HORIZONTAL_PADDING;

  // 最长 member 文本宽度
  let longestMemberWidth = 0;
  for (const member of members) {
    const text = formatMemberText(member);
    const width = text.length * C.MEMBER_FONT_WIDTH + C.MEMBER_HORIZONTAL_PADDING;
    if (width > longestMemberWidth) {
      longestMemberWidth = width;
    }
  }

  const width = Math.max(C.MIN_WIDTH, labelWidth, longestMemberWidth);

  return { width, height };
}

/**
 * 格式化 member 显示文本（对齐 class-box.tsx 的 formatAttribute/formatMethod 实现）
 *
 * 用于估算宽度，必须与 class-box.tsx 渲染时的文本格式一致
 */
function formatMemberText(member: NodeMember): string {
  const visibility = member.visibility ?? '';
  if (member.isMethod) {
    const parameters = member.parameters ?? '';
    const returnType = member.returnType ?? '';
    const returnTypePart = returnType ? `: ${returnType}` : '';
    return `${visibility} ${member.name}(${parameters})${returnTypePart}`;
  }
  const type = member.type ?? '';
  const typePart = type ? `: ${type}` : '';
  return `${visibility} ${member.name}${typePart}`;
}
