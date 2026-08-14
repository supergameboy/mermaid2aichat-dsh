/**
 * jison 错误信息提取工具
 *
 * 单一职责：从 jison parser 抛出的错误对象中提取 line/column/message
 *
 * 背景：jison 0.4.18 的错误对象格式不统一：
 *   - 顶层可能直接有 line/column/message 属性
 *   - 也可能嵌套在 hash: { line, column } 中
 *   - message 可能是 Error.message 或字符串
 *
 * 模块边界：纯工具函数，不依赖任何其他模块，可被所有 parser 使用。
 */

/**
 * 从 jison 错误中提取行号
 *
 * @param err - jison parser 抛出的错误对象
 * @returns 行号（1-based），无法提取时返回 1
 */
export function extractJisonLine(err: unknown): number {
  if (err && typeof err === 'object') {
    const line = (err as { line?: unknown }).line;
    if (typeof line === 'number') return line;
    // jison 错误可能在 hash.line
    const hash = (err as { hash?: { line?: unknown } }).hash;
    if (hash && typeof hash.line === 'number') return hash.line;
  }
  return 1;
}

/**
 * 从 jison 错误中提取列号
 *
 * @param err - jison parser 抛出的错误对象
 * @returns 列号（1-based），无法提取时返回 1
 */
export function extractJisonColumn(err: unknown): number {
  if (err && typeof err === 'object') {
    const column = (err as { column?: unknown }).column;
    if (typeof column === 'number') return column;
    const hash = (err as { hash?: { column?: unknown } }).hash;
    if (hash && typeof hash.column === 'number') return hash.column;
  }
  return 1;
}

/**
 * 从 jison 错误中提取错误信息
 *
 * @param err - jison parser 抛出的错误对象
 * @returns 错误信息字符串，无法提取时返回 'parse error'
 */
export function extractJisonMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message || 'parse error';
  }
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'parse error';
}
