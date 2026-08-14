/**
 * 代码预处理器 — 参考官方 mermaid regexes.ts
 *
 * 单一职责：移除 frontmatter / 指令 / 注释，返回纯净代码用于 jison 解析
 *
 * 行号一致性保证（关键约束）:
 *   预处理后的代码必须与原始代码行号一一对应，因为:
 *   1. 增量序列化通过 _sourceLine 定位 rawCode（原始代码）的行
 *   2. inferSourceLines 基于 _sourceLine 推断节点/边在原始代码中的位置
 *   3. 任何预处理都不得改变行号（移除整行会破坏行号映射）
 *
 * 实现: 所有预处理（frontmatter/指令/注释）均替换为等数量的换行符，
 *       保持总行数不变，从而保持行号一致
 *
 * 数据流:
 *   rawCode → frontmatter 替换为换行 → 指令替换为换行 → 注释替换为换行 → 返回纯净代码
 *
 * 参考来源:
 *   - mermaid-develop/packages/mermaid/src/diagram-api/comments.ts (cleanupComments)
 *   - mermaid-develop/packages/mermaid/src/diagram-api/regexes.ts (frontMatterRegex)
 *   - mermaid-develop/packages/mermaid/src/diagram-api/detectType.ts (directiveRegex)
 */

// ============================================================
// 正则定义（对齐官方 regexes.ts）
// ============================================================

/**
 * Jekyll 风格 frontmatter 块（---...---）
 * 基于官方 frontMatterRegex，支持缩进对齐的闭合 ---
 */
const frontMatterRegex = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s;

/**
 * Mermaid 指令块（%%{...}%%）
 * 对齐官方 directiveRegex
 */
const directiveRegex =
  /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;

/**
 * Mermaid 注释（%%...）
 * 对齐官方 anyCommentRegex
 * 注意: 不匹配 `%%{` 开头的指令（指令由 directiveRegex 处理）
 */
const anyCommentRegex = /\s*%%(?!\{).*\n/gm;

// ============================================================
// 辅助函数
// ============================================================

/**
 * 将匹配内容替换为等数量的换行符，保持行号一致
 *
 * @param match - 正则匹配的完整字符串
 * @returns 与 match 中换行符数量相同的换行符字符串
 */
function replaceWithNewlines(match: string): string {
  const newlineCount = (match.match(/\n/g) ?? []).length;
  return '\n'.repeat(newlineCount);
}

// ============================================================
// 预处理函数
// ============================================================

/**
 * 预处理 Mermaid 代码（去 frontmatter/指令/注释）
 *
 * 预处理顺序（对齐官方 detectType.ts）:
 *   1. frontmatter 替换为等长换行（保持行号）
 *   2. 指令替换为等长换行（保持行号）
 *   3. 注释替换为换行（保持行号）
 *
 * 行号一致性: 所有预处理均保持原始代码的行数，确保 _sourceLine 与 rawCode 行号一一对应
 *
 * @param code - 原始 Mermaid 代码
 * @returns 纯净代码（仅保留图表关键字和内容，行号与原始代码一致）
 */
export function preprocessCode(code: string): string {
  return code
    .replace(frontMatterRegex, (match) => replaceWithNewlines(match))
    .replace(directiveRegex, (match) => replaceWithNewlines(match))
    .replace(anyCommentRegex, '\n');
}

// ============================================================
// Frontmatter 元数据提取（对齐官方 frontmatter.ts extractFrontMatter）
// ============================================================

/**
 * 从 frontmatter 中提取 title 字段
 *
 * 对齐官方 Diagram.ts 的处理逻辑:
 *   - 官方通过 extractFrontMatter 解析 YAML frontmatter 获取 metadata.title
 *   - 然后 db.setDiagramTitle(metadata.title) 设置标题
 *   - title 不是 jison 语法，必须通过 frontmatter 处理
 *
 * 简化实现: 不依赖 js-yaml，仅用正则提取 title 字段
 *   - 支持 `title: My Title` 和 `title: "My Title"` 两种格式
 *   - 不支持多行 YAML 值（title 通常是单行字符串）
 *
 * @param code - 原始 Mermaid 代码（可能含 frontmatter）
 * @returns title 字符串（无 frontmatter 时返回 undefined）
 */
export function extractFrontmatterTitle(code: string): string | undefined {
  const matches = code.match(frontMatterRegex);
  if (!matches) {
    return undefined;
  }

  // matches[2] 是 frontmatter 内容（YAML body）
  const yamlBody = matches[2] ?? '';
  // 匹配 `title: value` 或 `title: "value"` 或 `title: 'value'`
  const titleMatch = yamlBody.match(/^title:\s*(?:"([^"]*)"|'([^']*)'|(.+))\s*$/m);
  if (!titleMatch) {
    return undefined;
  }

  // 三种捕获组: 双引号、单引号、无引号
  const title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3];
  return title?.trim();
}

/**
 * 序列化 title 为 frontmatter 格式
 *
 * 对齐官方 frontmatter 格式:
 *   ```
 *   ---
 *   title: My Title
 *   ---
 *   ```
 *
 * @param title - 图表标题
 * @returns frontmatter 字符串（含尾部换行），或 undefined（无 title 时）
 */
export function serializeFrontmatterTitle(title: string): string {
  // 若 title 包含特殊字符（冒号、引号等），用双引号包裹
  const needsQuote = /[:#&*!|>'"%@`]/.test(title) || /^\s|\s$/.test(title);
  const escaped = needsQuote ? `"${title.replace(/"/g, '\\"')}"` : title;
  return `---\ntitle: ${escaped}\n---\n`;
}
