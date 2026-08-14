/**
 * CodeChangeHandler — 代码编辑统一处理（图类型变更检查 + 解析失败处理）
 *
 * 单一职责：封装三个 Canvas 组件（GraphCanvas/SequenceCanvas/SpecializedShell）共用的
 * handleCodeChange 主干流程（图类型变更检查 + 解析失败处理）
 *
 * 设计依据：
 *   - 根因 A 修复："直切 + 保留代码"策略 — 即使 parseMermaid 解析失败，
 *     只要 detectDiagramType 检测到目标类型与当前不同，就直切画布（保留用户代码作为 rawCode）
 *   - 统一 currentType 来源（消除 props / 硬编码 / syncCanvas 三种来源不一致）
 *   - 同类型更新逻辑差异巨大（图结构布局重算 / 序列字段写入 / 数据图表直传），
 *     通过 onSameTypeUpdate 回调交由调用方实现
 *
 * 数据流：
 *   code → codeConverter.codeToCanvas → ParseResult
 *     → 图类型变更检查（detectDiagramType + currentType 比较）
 *       → 变更：emitCanvasChange(空 canvas + rawCode 或解析结果) → return
 *       → 未变更：解析失败显示错误 → return；解析成功 → onSameTypeUpdate(newCanvas)
 *
 * 模块边界：仅引用 @mermaid2aichat/serializer + ./code-converter + ./canvas-emitter，不引用 React/DOM/MCP/WS。✅
 */

import {
  detectDiagramType,
  createEmptyCanvasState,
  type CanvasState,
  type DiagramType,
  type ParseError,
} from '@mermaid2aichat/serializer';
import type { CodeConverter } from './code-converter.js';
import type { CanvasEmitter } from './canvas-emitter.js';

export interface CreateCodeChangeHandlerOptions {
  /** 画布↔代码转换服务 */
  codeConverter: CodeConverter;
  /** 画布变更发射器 */
  canvasEmitter: CanvasEmitter;
  /** 本地设置 mermaid 代码（更新 CodeEditor 显示） */
  setMermaidCode: (code: string) => void;
  /** 设置代码错误信息（null 表示无错误） */
  setCodeError: (error: string | null) => void;
  /** 当前图表类型（统一来源：syncCanvas.diagramType） */
  currentType: DiagramType;
  /**
   * 同类型更新回调（各组件专属逻辑）
   * - GraphCanvas: applyCanvasChange({ nodes, edges, recalculate: { layout: true } })
   * - SequenceCanvas: setParticipants/setMessages/... + emitCanvasChange
   * - SpecializedShell: handleCanvasChange(newCanvas)
   */
  onSameTypeUpdate: (canvas: CanvasState) => void;
}

/**
 * 创建代码编辑统一处理函数
 *
 * @returns (code: string) => void — 可直接作为 CodeEditor 的 onCodeChange 回调
 *
 * 内部行为：
 *   1. codeConverter.codeToCanvas(code) 解析代码
 *   2. 图类型变更检查（优先于解析失败检查，确保"直切 + 保留代码"策略）
 *      - 解析成功：目标类型 = newCanvas.diagramType
 *      - 解析失败：目标类型 = detectDiagramType(code)
 *      - 目标类型与 currentType 不同 → 直切（emitCanvasChange）
 *   3. 同类型更新：解析失败显示错误；解析成功调用 onSameTypeUpdate
 */
export function createCodeChangeHandler(
  options: CreateCodeChangeHandlerOptions,
): (code: string) => void {
  const {
    codeConverter,
    canvasEmitter,
    setMermaidCode,
    setCodeError,
    currentType,
    onSameTypeUpdate,
  } = options;

  return (code: string) => {
    const result = codeConverter.codeToCanvas(code);
    const newCanvas = result.canvas;

    // 图类型变更检查（优先于解析失败检查，确保"直切 + 保留代码"策略）
    // 即使 parseMermaid 解析失败，只要 detectDiagramType 检测到目标类型与当前不同，就直切画布
    // 这样 CodeEditor 的"提交后将切换"提示文案承诺才能兑现（根因 A 修复）
    const targetType = result.success
      ? newCanvas.diagramType
      : detectDiagramType(code);
    if (targetType && targetType !== currentType) {
      setCodeError(null);
      // 解析成功：保留解析结果（含 rawCode）；解析失败：空 canvas + rawCode（保留用户代码）
      const canvasToEmit: CanvasState = result.success
        ? newCanvas
        : { ...createEmptyCanvasState(targetType), rawCode: code };
      const newMermaid = canvasEmitter.emitCanvasChange(canvasToEmit);
      setMermaidCode(newMermaid);
      return;
    }

    // 同类型更新：解析失败则显示错误
    if (!result.success) {
      setCodeError(result.errors.map((e: ParseError) => e.message).join('; '));
      return;
    }

    // 同类型更新：交由调用方实现专属逻辑
    onSameTypeUpdate(newCanvas);
  };
}
