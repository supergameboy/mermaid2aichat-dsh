/**
 * 解析调度器 — 浏览器安全
 *
 * 单一职责：根据 diagramType 分发到对应专用解析器，将 Mermaid 代码解析为 CanvasState
 *
 * 数据流:
 *   parseMermaid(code, options) → 检测/指定 diagramType → 各类型专用解析器 → ParseResult
 *   解析结果的 canvas.rawCode 保留原始代码（用于增量序列化保持格式）
 *
 * 新路径（flowchart Stage 6 / classDiagram M3 重构 L2-7 / erDiagram 重构 模块3 L2-3）:
 *   code → recognize(code, diagramType) → RecognizedBlock[]
 *       → converterRegistry.parseBlocks(blocks, diagramType) → BlockConvertResult
 *       → 补充 frontmatter title（jison parser 不识别 frontmatter）→ ParseResult
 *
 * 其他 diagramType 暂仍走专用 parser 老路径（决策7，后续 Stage 接入）。
 *
 * 注意: 本文件依赖 jison 生成的 ESM 解析器（由 compile-jison.mts 后处理），
 * 通过静态 import 加载，浏览器兼容。detectDiagramType 位于 detector/index.ts。
 */

import type {
  DiagramType,
  GraphCanvasState,
  GraphMetadata,
  ParseError,
  ParseResult,
} from './types.js';
import { detectDiagramType } from './detector/index.js';
import { isGraphCanvasState } from './types.js';
import { recognize } from './recognizer/index.js';
import { converterRegistry } from './converter/registry.js';
import {
  extractJisonLine,
  extractJisonColumn,
  extractJisonMessage,
} from './parser/jison-error.js';
import { extractFrontmatterTitle } from './detector/preprocessor.js';
import { parseSequence } from './parser/sequence/sequence-parser.js';
import { diagramTypeInfo } from './diagram-registry.js';

/** 构造解析失败结果 */
function buildParseFailure(message: string, code: string): ParseResult {
  const error: ParseError = {
    line: 1,
    column: 0,
    message,
    severity: 'error',
    context: code.split('\n')[0],
  };
  return {
    success: false,
    canvas: { diagramType: 'flowchart', nodes: [], edges: [], direction: 'TB' },
    errors: [error],
  };
}

/**
 * 为解析结果的 canvas 填充 rawCode（保留原始代码）
 * 不修改原 canvas 对象，返回带 rawCode 的新对象
 */
function withRawCode<T extends ParseResult>(result: T, code: string): T {
  if (result.success) {
    return { ...result, canvas: { ...result.canvas, rawCode: code } };
  }
  return result;
}

/** parseMermaid 选项 */
export interface ParseMermaidOptions {
  /** 显式指定图表类型，跳过自动检测 */
  diagramType?: DiagramType;
}

/**
 * 解析 Mermaid 代码为 CanvasState
 *
 * 空代码处理（M0 新增）:
 *   - 空字符串或纯空白 → 返回成功结果，canvas 为空 flowchart
 *   - 不报错，允许清空画布
 *
 * 预处理（架构修复）:
 *   - 各 parser 内部调用 preprocessCode 清理 frontmatter/指令/注释
 *   - 预处理保持行号一致（替换为等长换行），确保 _sourceLine 与 rawCode 行号一一对应
 *   - parser 收到的是原始 code，内部预处理后用于 jison 解析，rawCode 保留原始 code
 *
 * @param code - Mermaid 源代码（任意图表类型）
 * @param options - 可选参数，可显式指定 diagramType 跳过自动检测
 * @returns 解析结果（包含 canvas 和 errors，canvas.rawCode 保留原始代码）
 */
export function parseMermaid(code: string, options?: ParseMermaidOptions): ParseResult {
  // 空代码处理：返回空 flowchart 画布，不报错
  const trimmed = code.trim();
  if (trimmed.length === 0) {
    return {
      success: true,
      canvas: { diagramType: 'flowchart', nodes: [], edges: [], direction: 'TB', rawCode: code },
      errors: [],
    };
  }

  const diagramType = options?.diagramType ?? detectDiagramType(code);
  if (diagramType === null) {
    return buildParseFailure('无法识别图表类型（首行关键字未知）', code);
  }

  let result: ParseResult;
  switch (diagramType) {
    case 'flowchart':
    case 'classDiagram':
    case 'erDiagram': {
      // 新路径（flowchart Stage 6 / classDiagram M3 重构 L2-7 / erDiagram 重构 模块3 L2-3）：
      // recognize → converterRegistry.parseBlocks → ParseResult
      // jison 语法错误（recognizer 不 catch，throw 到此）转换为 ParseFailureResult；
      // 块转换错误（converter 收集）作为非致命错误保留在 ParseSuccessResult.errors。
      try {
        const blocks = recognize(code, diagramType);
        const convertResult = converterRegistry.parseBlocks(blocks, diagramType);
        // frontmatter title 处理：jison parser 不识别 frontmatter（preprocessCode 剥离），
        // 在 dispatch 层补充到 metadata.title（对齐老 parseFlowchartCode 的 extractFrontmatterTitle 调用）
        const frontmatterTitle = extractFrontmatterTitle(code);
        let canvas = convertResult.canvas as GraphCanvasState;
        if (frontmatterTitle !== undefined) {
          const metadata: GraphMetadata = canvas.metadata
            ? { ...canvas.metadata, title: frontmatterTitle }
            : { title: frontmatterTitle };
          canvas = { ...canvas, metadata };
        }
        result = {
          success: true,
          canvas,
          errors: convertResult.errors.map((err): ParseError => ({
            line: err.block.sourceLine ?? 0,
            column: 0,
            message: err.message,
            severity: 'error',
            context: err.block.rawText,
          })),
        };
      } catch (err) {
        // jison 语法错误：转换为 ParseFailureResult
        const line = extractJisonLine(err);
        const error: ParseError = {
          line,
          column: extractJisonColumn(err),
          message: extractJisonMessage(err),
          severity: 'error',
          context: code.split('\n')[line - 1],
        };
        result = {
          success: false,
          canvas: { diagramType, nodes: [], edges: [], direction: 'TB' },
          errors: [error],
        };
      }
      break;
    }
    case 'sequenceDiagram':
      result = parseSequence(code);
      break;
    default:
      // 注册表驱动：已实现类型走各自路径；计划内但未实现的类型给出明确的
      // 「开发中」解析失败（不崩溃、不静默）；未知类型给通用失败。
      const info = diagramTypeInfo(diagramType);
      if (info !== undefined && !info.implemented) {
        return buildParseFailure(
          `图表类型 "${diagramType}"（${info.label}）正在开发中，暂不支持解析（计划见 PLAN.md）`,
          code,
        );
      }
      return buildParseFailure(`无法识别的图表类型 "${diagramType}"`, code);
  }

  // 为成功的解析结果填充 rawCode（保留原始代码用于增量序列化）
  const withCode = withRawCode(result, code);

  // 图结构类型刚从 Mermaid 源码解析，节点位置尚未由布局算法计算，
  // 显式标记需要自动布局。
  if (withCode.success && isGraphCanvasState(withCode.canvas)) {
    return { ...withCode, canvas: { ...withCode.canvas, needsLayout: true } };
  }

  return withCode;
}
