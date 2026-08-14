/**
 * 解析器统一导出
 * 单一职责：导出所有解析器入口
 *
 * 包含:
 *   - jison 解析器（10 种图表类型）
 *   - 手写解析器（pie + architecture）
 *   - 通用类型
 */

// jison 解析器（本插件仅保留四种已迁移图表类型）
export {
  parseFlowchart,
  parseSequence,
  parseClass,
  parseER,
  clearParserCache,
} from './jison-parser.js';
export type { JisonParseResult, JisonParser } from './jison-parser.js';
