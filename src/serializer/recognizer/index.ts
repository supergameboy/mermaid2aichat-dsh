/**
 * Recognizer 层入口 — IBlockRecognizer 接口 + RecognizerRegistry + recognize 入口
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：M3（flowchart + classDiagram 识别器已接入）
 *       erDiagram 重构（fractal-design-20260707-erDiagram重构）
 *
 * 数据流：
 *   parse 方向：code → recognize(code, diagramType) → RecognizedBlock<string>[] → Converter.parseBlocks
 *
 * 模块边界：仅依赖 ./types.js（RecognizedBlock）、./flowchart-recognizer.js（FlowchartRecognizer）、
 * ./class-recognizer.js（ClassRecognizer）、./er-recognizer.js（ErRecognizer）和
 * ../types.js（DiagramType），不引用 React/DOM。
 */

import type { DiagramType } from '../types.js';
import type {
  FlowchartRecognizedBlock,
  ClassRecognizedBlock,
  ErRecognizedBlock,
  RecognizedBlock,
} from './types.js';
import { FlowchartRecognizer } from './flowchart-recognizer.js';
import { ClassRecognizer } from './class-recognizer.js';
import { ErRecognizer } from './er-recognizer.js';

// ============================================================
// 1. 识别器接口
// ============================================================

/** 识别器接口 */
export interface IBlockRecognizer {
  /**
   * 识别代码产出 block 流。
   *
   * 忠实产出全部 block（含注释/空行），不做过滤；过滤/格式选项由 Assembler 承担，故无 options 参数（轻微-1）。
   * recognize 入口的 diagramType 仅用于 Registry 路由，不透传给具体 recognizer。
   *
   * 返回类型泛化为 RecognizedBlock<string>[]，允许不同 diagramType 的 Recognizer 返回各自的 Block 联合类型
   * （FlowchartRecognizer 返回 FlowchartRecognizedBlock[]，ClassRecognizer 返回 ClassRecognizedBlock[]，
   * 均为 RecognizedBlock<string> 的子类型，协变兼容）。
   */
  recognize(code: string): readonly RecognizedBlock<string>[];
}

// ============================================================
// 2. 识别器注册表接口
// ============================================================

/** 识别器注册表 */
export interface RecognizerRegistry {
  /**
   * 获取识别器。
   * 未注册的 diagramType 返回 undefined，由调用方（parse-dispatcher）回退到老路径（决策7；轻微-3）。
   */
  get(diagramType: DiagramType): IBlockRecognizer | undefined;
}

// ============================================================
// 3. 内部注册表 — 按 diagramType 路由到对应 Recognizer 实例
// ============================================================

/**
 * 内部识别器注册表
 *
 * Recognizer 实例为无状态对象（每次 recognize 调用内部创建独立的 Collector），
 * 因此可作为模块级单例共享。
 *
 * 当前注册项：
 *   - 'flowchart' → FlowchartRecognizer（Stage 3）
 *   - 'classDiagram' → ClassRecognizer（M3 模块1）
 *   - 'erDiagram' → ErRecognizer（erDiagram 重构模块1）
 *
 * 后续阶段将扩展注册其他 diagramType 的 Recognizer。
 */
const recognizerMap: ReadonlyMap<DiagramType, IBlockRecognizer> = new Map<
  DiagramType,
  IBlockRecognizer
>([
  ['flowchart', new FlowchartRecognizer()],
  ['classDiagram', new ClassRecognizer()],
  ['erDiagram', new ErRecognizer()],
]);

// ============================================================
// 4. 识别入口
// ============================================================

/**
 * 识别入口 — 按 diagramType 路由到对应 Recognizer.
 *
 * 重载签名（类型安全）：调用方用字面量 diagramType 调用时，TypeScript 返回对应的窄类型 Block[]，
 * 无需类型断言。用变量调用时匹配泛化签名，返回 RecognizedBlock<string>[]。
 *
 * @param code 原始 Mermaid 代码
 * @param diagramType 图表类型（仅用于 Registry 路由，不透传给具体 recognizer）
 * @returns 识别块流（忠实产出，含注释/空行，不做过滤）
 *
 * @throws Error 当 diagramType 未注册对应 Recognizer 时抛出。
 *   决策7；轻微-3：parse-dispatcher 在 Stage 5 接入时，需在调用 recognize 前判断 diagramType
 *   是否已注册（通过 diagramType === 'flowchart' 等显式判断，或扩展本模块导出 isRecognizerRegistered），
 *   未注册则回退到老路径。
 */
export function recognize(code: string, diagramType: 'flowchart'): readonly FlowchartRecognizedBlock[];
export function recognize(code: string, diagramType: 'classDiagram'): readonly ClassRecognizedBlock[];
export function recognize(code: string, diagramType: 'erDiagram'): readonly ErRecognizedBlock[];
export function recognize(code: string, diagramType: DiagramType): readonly RecognizedBlock<string>[];
export function recognize(
  code: string,
  diagramType: DiagramType,
): readonly RecognizedBlock<string>[] {
  const recognizer = recognizerMap.get(diagramType);
  if (recognizer === undefined) {
    throw new Error(`No recognizer registered for diagram type: ${diagramType}`);
  }
  return recognizer.recognize(code);
}
