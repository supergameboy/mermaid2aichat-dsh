/**
 * 边序列化器 — MermaidEdge → Mermaid 边代码
 *
 * 单一职责：将 MermaidEdge 的边样式、标签、ID 序列化为 Mermaid 语法
 *
 * 边样式映射（对齐 flow.jison link 规则 + destructLink 逻辑）:
 *   line                  → ---
 *   arrow                 → -->
 *   cross                 → --x
 *   circle                → --o
 *   thick-line            → ===
 *   thick-arrow           → ==>
 *   thick-cross           → ==x
 *   thick-circle          → ==o
 *   dotted                → -.-
 *   dotted-arrow          → -.->
 *   dotted-cross          → -.-x
 *   dotted-circle         → -.-o
 *   bidirectional-arrow   → <-->
 *   bidirectional-cross   → x--x
 *   bidirectional-circle  → o--o
 *   invisible             → ~~~
 */

import type { MermaidEdge, MermaidEdgeStyle } from '../../types.js';
import { escapeEdgeLabel } from '../shared/escape-helpers.js';

// ============================================================
// 边样式 → Mermaid 语法映射
// ============================================================

/**
 * 将 MermaidEdgeStyle 映射为 Mermaid 边语法字符串
 *
 * 对齐 flow-db.ts destructEndLink/destructStartLink 的逆操作:
 *   - stroke: normal → `--`, thick → `==`, dotted → `-.`, invisible → `~~`
 *   - type: arrow_point → `>`, arrow_circle → `o`, arrow_cross → `x`, arrow_open → (无)
 *   - 双端箭头: 起始端加对应字符
 */
function edgeStyleToSyntax(style: MermaidEdgeStyle): string {
  switch (style) {
    // === 单端箭头 ===
    case 'line':
      return '---';
    case 'arrow':
      return '-->';
    case 'cross':
      return '--x';
    case 'circle':
      return '--o';
    case 'thick-line':
      return '===';
    case 'thick-arrow':
      return '==>';
    case 'thick-cross':
      return '==x';
    case 'thick-circle':
      return '==o';
    case 'dotted':
      return '-.-';
    case 'dotted-arrow':
      return '-.->';
    case 'dotted-cross':
      return '-.-x';
    case 'dotted-circle':
      return '-.-o';
    // === 双端箭头 ===
    case 'bidirectional-arrow':
      return '<-->';
    case 'bidirectional-cross':
      return 'x--x';
    case 'bidirectional-circle':
      return 'o--o';
    // === 特殊 ===
    case 'invisible':
      return '~~~';
    default:
      return '-->';
  }
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 序列化单条边为 Mermaid 代码
 *
 * @param edge - MermaidEdge
 * @returns Mermaid 边代码行（如 `A -->|label| B` 或 `A@--> B`）
 */
export function serializeEdge(edge: MermaidEdge): string {
  const { source, target, data } = edge;
  const syntax = edgeStyleToSyntax(data.edgeStyle);

  // 边 ID（用户自定义时输出 `id@-->` 语法）
  const isUserDefinedId = data.isUserDefinedId;
  const idPrefix = edge.id && isUserDefinedId ? `${edge.id}@` : '';

  // 边标签（`-->|label|` 语法）
  const label = data.label;
  const labelPart = label ? `|${escapeEdgeLabel(label)}|` : '';

  return `${source} ${idPrefix}${syntax}${labelPart} ${target}`;
}
