/**
 * 序列化调度器 — 浏览器安全
 *
 * 单一职责：根据 diagramType 分发到对应序列化器
 *
 * 数据流:
 *   serializeMermaid(canvas) → 按 canvas.diagramType 分发 → 各类型序列化器 → SerializeResult
 *
 * 新路径（flowchart Stage 6 / classDiagram M3 L2-5 切换 / erDiagram 重构 模块3 L2-3 切换）:
 *   canvas → assemble(canvas) → AssembleResult { code, errors } → SerializeResult { mermaid, errors }
 *
 * 其他 diagramType 暂仍走专用 serializer 老路径（决策7，后续 Stage 接入）。
 *
 * 注意: 本文件为浏览器安全入口，不导入任何 Node.js 内置模块。
 * 图表类型检测（detectDiagramType）位于 detector/index.ts，基于官方 detector 注册机制。
 * 解析调度（parseMermaid）位于 parse-dispatcher.ts，同样浏览器安全。
 */

import type {
  CanvasState,
  ParseError,
  SerializeResult,
} from './types.js';
import { assemble } from './assembler/index.js';
import { serializeSequence } from './serializer/sequence/index.js';
import { diagramTypeInfo } from './diagram-registry.js';

// detectDiagramType 从 detector 模块重新导出（保持向后兼容）
export { detectDiagramType } from './detector/index.js';

// ============================================================
// 序列化调度
// ============================================================

/**
 * 序列化 CanvasState 为 Mermaid 代码
 *
 * @param canvas - CanvasState（任意图表类型）
 * @returns 序列化结果（包含 mermaid 代码和错误列表）
 */
export function serializeMermaid(canvas: CanvasState): SerializeResult {
  switch (canvas.diagramType) {
    case 'flowchart':
    case 'classDiagram':
    case 'erDiagram': {
      // 新路径（flowchart Stage 6 / classDiagram M3 L2-5 / erDiagram 重构 模块3 L2-3）：
      // assemble → AssembleResult → SerializeResult
      // assemble 内部不 catch 程序错误（P2-2，对齐 parseBlocks throw 模式），
      // errors 仅承载"非致命错误"（目前无此场景，预留接口）
      const assembleResult = assemble(canvas);
      return {
        mermaid: assembleResult.code,
        errors: assembleResult.errors.map((err): ParseError => ({
          line: 0,
          column: 0,
          message: err.message,
          severity: 'error',
        })),
      };
    }
    case 'sequenceDiagram':
      return serializeSequence(canvas);
    default: {
      // 注册表驱动：计划内未实现的类型给出「开发中」错误，其余按未知处理。
      const type = (canvas as { diagramType: string }).diagramType as Parameters<typeof diagramTypeInfo>[0];
      const info = diagramTypeInfo(type);
      const message = info !== undefined && !info.implemented
        ? `图表类型 "${type}"（${info.label}）正在开发中，暂不支持序列化（计划见 PLAN.md）`
        : `无法识别的图表类型 "${type}"`;
      return {
        mermaid: '',
        errors: [{
          line: 0,
          column: 0,
          message,
          severity: 'error',
        }],
      };
    }
  }
}
