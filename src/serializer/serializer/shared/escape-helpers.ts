/**
 * 转义辅助函数 — Mermaid 代码中特殊字符的转义
 *
 * 单一职责：仅处理字符转义，不涉及业务逻辑
 */

/**
 * 转义节点标签中的特殊字符
 * Mermaid 节点标签需要转义: \ " [ ] { } ( ) 换行
 */
export function escapeLabel(label: string): string {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\n/g, '<br/>');
}

/**
 * 转义边标签中的特殊字符
 * Mermaid 边标签需要转义: \ |
 */
export function escapeEdgeLabel(label: string): string {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|');
}

/**
 * 转义字符串字面量（用于带引号的字符串，如 pie 切片标签）
 * 仅转义引号和反斜杠
 */
export function escapeStringLiteral(label: string): string {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/**
 * 反转义字符串字面量（与 escapeStringLiteral 对称）
 * 仅反转义 \" 和 \\
 */
export function unescapeStringLiteral(label: string): string {
  return label
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * 反转义标签
 */
export function unescapeLabel(label: string): string {
  return label.replace(/\\(.)/g, '$1');
}
