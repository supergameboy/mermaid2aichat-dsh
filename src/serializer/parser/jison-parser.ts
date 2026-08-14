/**
 * jison 解析器统一封装
 * 单一职责：加载 jison 生成的 ESM 解析器，提供类型安全的 parse 接口
 *
 * 数据流:
 *   源代码字符串 → jison 生成的 parser.parse() → 官方 AST（unknown）
 *   → 类型断言为对应 AST 类型 → 返回 { ast, errors }
 *
 * 错误处理:
 *   - jison 抛出的语法错误被捕获，转换为 ParseError[]
 *   - 解析成功时 errors 为空数组
 *
 * 注意:
 *   - jison 0.4.18 生成 CommonJS 代码，由 compile:jison 脚本后处理为 ESM
 *   - 解析器文件在 src/parser/jison/ 下，扩展名 .js（ESM）
 *   - 该目录被 .gitignore 忽略，构建前必须先运行 pnpm compile:jison
 *   - 通过静态 import 加载，浏览器兼容，无需 createRequire/require()
 *   - 解析器返回的 AST 结构对齐官方 mermaid 语法，由各图表类型模块负责映射到 CanvasState
 */

import type {
  FlowchartAST,
  SequenceAST,
  ClassAST,
  ERAST,
} from '../ast/index.js';
import type { ParseError } from '../types.js';

// 静态导入 jison 生成的 ESM 解析器（浏览器兼容）
import { parser as flowParser } from './jison/flow-parser.js';
import { parser as sequenceParser } from './jison/sequence-parser.js';
import { parser as classParser } from './jison/class-parser.js';
import { parser as erParser } from './jison/er-parser.js';

/** 解析结果（内部通用类型） */
export interface JisonParseResult<T> {
  ast: T;
  errors: ParseError[];
}

/**
 * jison 解析器接口（最小契约）
 * jison 生成的解析器必须实现此接口
 */
export interface JisonParser {
  parse(input: string): unknown;
}

/**
 * 安全调用 jison 解析器
 * 捕获 jison 抛出的语法错误，转换为 ParseError[]
 */
function safeParse<T>(
  parserName: string,
  parser: JisonParser,
  source: string,
): JisonParseResult<T> {
  try {
    const ast = parser.parse(source) as T;
    return { ast, errors: [] };
  } catch (err) {
    const line = extractLine(err);
    const error: ParseError = {
      line,
      column: extractColumn(err),
      message: extractMessage(err, parserName),
      severity: 'error',
      context: source.split('\n')[line - 1] ?? undefined,
    };
    return {
      ast: createEmptyAst<T>(),
      errors: [error],
    };
  }
}

function extractLine(err: unknown): number {
  if (err && typeof err === 'object') {
    const line = (err as { line?: unknown }).line;
    if (typeof line === 'number') return line;
  }
  return 1;
}

function extractColumn(err: unknown): number {
  if (err && typeof err === 'object') {
    const column = (err as { column?: unknown }).column;
    if (typeof column === 'number') return column;
  }
  return 1;
}

function extractMessage(err: unknown, parserName: string): string {
  if (err instanceof Error) {
    return err.message || `${parserName} parse error`;
  }
  if (typeof err === 'string') return err;
  return `${parserName} parse error`;
}

/**
 * 创建空 AST（解析失败时使用）
 * 各 AST 类型都是对象类型，返回空对象通过类型断言
 */
function createEmptyAst<T>(): T {
  return {} as T;
}

// ============================================================
// 公共 API — jison 图表类型的解析函数
// ============================================================

/** 解析 flowchart 代码为 FlowchartAST */
export function parseFlowchart(source: string): JisonParseResult<FlowchartAST> {
  return safeParse<FlowchartAST>('flowchart', flowParser, source);
}

/** 解析 sequenceDiagram 代码为 SequenceAST */
export function parseSequence(source: string): JisonParseResult<SequenceAST> {
  return safeParse<SequenceAST>('sequence', sequenceParser, source);
}

/** 解析 classDiagram 代码为 ClassAST */
export function parseClass(source: string): JisonParseResult<ClassAST> {
  return safeParse<ClassAST>('class', classParser, source);
}

/** 解析 erDiagram 代码为 ERAST */
export function parseER(source: string): JisonParseResult<ERAST> {
  return safeParse<ERAST>('er', erParser, source);
}

/**
 * 清除解析器缓存（兼容旧 API，静态 import 无需缓存）
 * @deprecated 静态 import 模式下无缓存，此函数为空操作
 */
export function clearParserCache(): void {
  // 静态 import 模式下无需缓存，保留函数以兼容旧 API
}
