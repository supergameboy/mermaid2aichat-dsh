/**
 * Assembler 入口 — canvas → code
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 *           docs/design/fractal-design-20260703-classDiagram重构/...-模块3-装配器.md
 *           docs/design/fractal-design-20260707-erDiagram重构/...-模块3-装配器.md
 * 阶段：Stage 5（flowchart）；M3 重构 L2-5（classDiagram 路由接入）；
 *       erDiagram 重构 模块3 L2-2（erDiagram 路由接入）
 *
 * 数据流：
 *   assemble(canvas, options) → AssembleResult { code, errors }
 *     1. 按 canvas.diagramType 路由（P1-5 修订）
 *     2. flowchart：
 *        a. 生成 header（`flowchart ${direction}`，direction 来自 canvas.direction，默认 'TB'）
 *        b. ConverterRegistry.serialize(canvas, 'flowchart') → blocks[]
 *        c. FlowchartAssembler.assemble(blocks, options) → body string
 *        d. 组合 frontmatter + header + body → code
 *     3. classDiagram（M3 重构 L2-5 新增）：
 *        a. 生成 header（`classDiagram`，无 direction 后缀，[一-6-补] 修订）
 *           顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（在 body 中），不在 header
 *        b. ConverterRegistry.serialize(canvas, 'classDiagram') → blocks[]
 *        c. ClassAssembler.assemble(blocks, options) → body string
 *        d. 组合 frontmatter + header + body → code
 *     4. erDiagram（erDiagram 重构 模块3 L2-2 新增）：
 *        a. 生成 header（`erDiagram`，无 direction 后缀，对齐 classDiagram [一-6-补] 修订）
 *           mermaid 官方 erDiagram 不支持 `erDiagram TB` header 语法
 *           顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（在 body 中），不在 header
 *        b. ConverterRegistry.serialize(canvas, 'erDiagram') → blocks[]
 *        c. ErAssembler.assemble(blocks, options) → body string
 *        d. 组合 frontmatter + header + body → code
 *     5. 其他 diagramType：返回错误（决策7：仅 flowchart/classDiagram/erDiagram 走新路径）
 *
 * header 生成说明：
 *   - flowchart: `flowchart TB` 不作为 block 产出，由入口函数直接生成 header 行（diagramType 声明 + 顶层方向）
 *   - classDiagram: `classDiagram` 不作为 block 产出，由入口函数直接生成 header 行（仅 diagramType 声明，无 direction 后缀）
 *   - erDiagram: `erDiagram` 不作为 block 产出，由入口函数直接生成 header 行（仅 diagramType 声明，无 direction 后缀）
 *   - 顶层方向来自 canvas.direction（flowchart 专用），默认 'TB'（对齐当前 flowchart-serializer.ts:80）
 *
 * frontmatter 生成说明：
 *   - frontmatter title 在 diagramType 声明之前，是文档级元数据而非 block 级内容
 *   - flowchart、classDiagram、erDiagram 都支持 frontmatter title（当 metadata.title 存在时产出）
 *
 * 错误处理（P2-2 修订，对齐 parseBlocks 模式）：
 *   - serialize 方向的输入是 model（已经过 parse 校验），LIFO 不配对是程序错误（不可恢复）
 *   - 程序错误不可包容：不 catch，让 throw 暴露 bug（对齐 parseBlocks 的 throw err 模式）
 *   - errors 数组保留为 []（预留接口，目前无"非致命错误"场景）
 *
 * 模块边界：依赖 ./types.js、./flowchart-assembler.js、./class-assembler.js、./er-assembler.js、
 *   ../converter/registry.js、../converter/types.js、../types.js，不引用 React/DOM。
 */

import type { AssembleResult } from '../converter/types.js';
import type { CanvasState, FlowchartDirection, GraphCanvasState } from '../types.js';
import type { AssembleUserOptions, IAssembler } from './types.js';
import type { DiagramType } from '../types.js';
import { converterRegistry } from '../converter/registry.js';
import { FlowchartAssembler } from './flowchart-assembler.js';
import { ClassAssembler } from './class-assembler.js';
import { ErAssembler } from './er-assembler.js';

const flowchartAssembler = new FlowchartAssembler();
const classAssembler = new ClassAssembler();
const erAssembler = new ErAssembler();

const DEFAULT_FLOWCHART_DIRECTION: FlowchartDirection = 'TB';

/** 走新路径（Assembler）的 diagramType 集合 */
const ASSEMBLER_SUPPORTED_TYPES: ReadonlySet<DiagramType> = new Set([
  'flowchart',
  'classDiagram',
  'erDiagram',
]);

/**
 * 按 diagramType 生成 header 行
 *
 * - flowchart: `flowchart ${direction}`（direction 来自 canvas.direction，默认 'TB'）
 * - classDiagram: `classDiagram`（无 direction 后缀，[一-6-补] 修订）
 *   顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（在 body 中），不在 header
 */
function generateHeader(graphCanvas: GraphCanvasState): string {
  switch (graphCanvas.diagramType) {
    case 'flowchart': {
      const direction = graphCanvas.direction ?? DEFAULT_FLOWCHART_DIRECTION;
      return `flowchart ${direction}`;
    }
    case 'classDiagram':
      // [一-6-补] 修订：classDiagram header 无 direction 后缀
      // mermaid 官方 classDiagram 不支持 `classDiagram TB` header 语法
      // 顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（在 body 中）
      return 'classDiagram';
    case 'erDiagram':
      // 对齐 classDiagram [一-6-补] 修订：erDiagram header 无 direction 后缀
      // mermaid 官方 erDiagram 不支持 `erDiagram TB` header 语法
      // 顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（在 body 中）
      return 'erDiagram';
    default:
      // 不变量：调用前已通过 ASSEMBLER_SUPPORTED_TYPES 校验
      throw new Error(
        `Assembler: generateHeader unsupported diagramType '${graphCanvas.diagramType}'`,
      );
  }
}

/**
 * 按 diagramType 选择 Assembler 实例
 *
 * - flowchart → FlowchartAssembler（openBlockType='subgraph-open', closeBlockType='subgraph-close'）
 * - classDiagram → ClassAssembler（openBlockType='namespace-open', closeBlockType='namespace-close')
 * - erDiagram → ErAssembler（openBlockType='subgraph-open', closeBlockType='subgraph-close'）
 */
function getAssembler(diagramType: DiagramType): IAssembler {
  switch (diagramType) {
    case 'flowchart':
      return flowchartAssembler;
    case 'classDiagram':
      return classAssembler;
    case 'erDiagram':
      return erAssembler;
    default:
      // 不变量：调用前已通过 ASSEMBLER_SUPPORTED_TYPES 校验
      throw new Error(
        `Assembler: getAssembler unsupported diagramType '${diagramType}'`,
      );
  }
}

/**
 * 组装 CanvasState 为 Mermaid 代码
 *
 * @param canvas - CanvasState（任意图表类型）
 * @param options - 用户面向组装选项（preserveIndent 默认 true）
 * @returns AssembleResult { code, errors }
 */
export function assemble(
  canvas: CanvasState,
  options?: AssembleUserOptions,
): AssembleResult {
  // 决策7：仅 flowchart/classDiagram 走新路径，其他类型暂不支持
  if (!ASSEMBLER_SUPPORTED_TYPES.has(canvas.diagramType)) {
    return {
      code: '',
      errors: [{
        message: `Assembler: diagramType '${canvas.diagramType}' not yet implemented (only 'flowchart', 'classDiagram' and 'erDiagram' supported)`,
      }],
    };
  }

  const graphCanvas = canvas as GraphCanvasState;

  // 1. 生成 frontmatter（title，对齐官方 metadata.title 序列化方式）
  //    frontmatter 在 diagramType 声明之前，是文档级元数据而非 block 级内容
  //    flowchart 和 classDiagram 都支持 frontmatter title（当 metadata.title 存在时产出）
  const frontmatter = graphCanvas.metadata?.title !== undefined
    ? `---\ntitle: ${graphCanvas.metadata.title}\n---\n`
    : '';

  // 2. 生成 header（按 diagramType 分流：flowchart 含 direction，classDiagram 不含）
  const header = generateHeader(graphCanvas);

  // 3. ConverterRegistry.serialize → blocks[] + Assembler.assemble → body
  // P2-2 修订：不 catch — serialize/assemble 抛出的都是程序错误（model 已过 parse 校验），
  // 程序错误不可包容，让 throw 暴露 bug（对齐 parseBlocks 的 throw err 模式）
  // M3 重构 L2-10：ConverterRegistry 接口泛型化为 RecognizedBlock<string>[]（基类型），
  // 各 diagramType 的具体 Registry 实现使用各自的窄类型，路由层协变兼容
  // M3 重构 L2-5：新增 classDiagram 分支，复用通用 assemble 流程
  const blocks = converterRegistry.serialize(canvas, canvas.diagramType);
  const assembler = getAssembler(canvas.diagramType);
  const body = assembler.assemble(blocks, options);

  // 4. 组合 frontmatter + header + body（末尾追加换行符，对齐老路径 serializeFlowchart/serializeClass 行为）
  const code = body.length > 0
    ? `${frontmatter}${header}\n${body}\n`
    : `${frontmatter}${header}\n`;
  return { code, errors: [] };
}

// ============================================================
// 类型重导出（方便外部消费）
// ============================================================

export type {
  AssembleUserOptions,
  AssembleInternalOptions,
  IAssembler,
  IContextStack,
  StackFrame,
} from './types.js';
export { ContextStack } from './context-stack.js';
export { FlowchartAssembler } from './flowchart-assembler.js';
export { ClassAssembler } from './class-assembler.js';
export { ErAssembler } from './er-assembler.js';
export { assembleBlocks } from './base-assembler.js';
