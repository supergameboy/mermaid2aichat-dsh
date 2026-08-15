/**
 * CodeChangeHandler 回归测试 — 未实现类型不得直切（防渲染器崩溃）
 *
 * 背景（P0 修复）：代码首行指向「检测到但未实现」的类型时，
 * 旧逻辑直切空画布，Canvas 渲染器收到无法处理的状态后抛错（slot 崩）。
 * 修复后：未实现类型保留当前画布并显示「开发中」错误。
 */
import { describe, it, expect, vi } from 'vitest';
import { createCodeChangeHandler } from './code-change-handler.js';
import type { ParseError, CanvasState } from '@mermaid2aichat/serializer';
import type { CodeConverter } from './code-converter.js';
import type { CanvasEmitter } from './canvas-emitter.js';

/** 构造解析失败结果（stub codeConverter 用）。 */
function failure(errors: ParseError[]): { success: false; canvas: CanvasState; errors: ParseError[] } {
  return {
    success: false,
    canvas: { diagramType: 'flowchart', nodes: [], edges: [] },
    errors,
  };
}

function makeHandler(codeConverter: Partial<CodeConverter>) {
  const emit = vi.fn<(canvas: CanvasState) => string>(() => 'serialized');
  const setMermaidCode = vi.fn();
  const setCodeError = vi.fn();
  const onSameTypeUpdate = vi.fn();
  // 让 stub 返回用户代码对应的结果
  function codeConverterResult(code: string) {
    if (codeConverter.codeToCanvas !== undefined) return (codeConverter.codeToCanvas as (c: string) => ReturnType<typeof failure>)(code);
    return failure([{ line: 1, column: 0, message: 'parse error', severity: 'error' }]);
  }
  const handler = createCodeChangeHandler({
    codeConverter: { codeToCanvas: codeConverterResult } as unknown as CodeConverter,
    canvasEmitter: { emitCanvasChange: emit } as unknown as CanvasEmitter,
    setMermaidCode,
    setCodeError,
    currentType: 'flowchart',
    onSameTypeUpdate,
  });
  return { handler, emit, setMermaidCode, setCodeError, onSameTypeUpdate };
}

describe('CodeChangeHandler 直切策略', () => {
  it('未实现类型（stateDiagram）：不直切、不发射、报开发中', () => {
    const { handler, emit, setMermaidCode, setCodeError, onSameTypeUpdate } = makeHandler({});
    handler('stateDiagram-v2\n  [*] --> Still');
    expect(emit).not.toHaveBeenCalled();
    expect(setMermaidCode).not.toHaveBeenCalled();
    expect(onSameTypeUpdate).not.toHaveBeenCalled();
    expect(setCodeError).toHaveBeenCalledWith(expect.stringContaining('开发中'));
  });

  it('未实现类型（mindmap）：同样不直切', () => {
    const { handler, emit, setCodeError } = makeHandler({});
    handler('mindmap\n  root');
    expect(emit).not.toHaveBeenCalled();
    expect(setCodeError).toHaveBeenCalledWith(expect.stringContaining('开发中'));
  });

  it('已实现类型解析失败：直切空画布（保留 rawCode）', () => {
    const { handler, emit, setCodeError } = makeHandler({});
    handler('classDiagram\n  class A');
    expect(setCodeError).toHaveBeenCalledWith(null);
    expect(emit).toHaveBeenCalledTimes(1);
    const canvas = emit.mock.calls[0][0] as CanvasState;
    expect(canvas.diagramType).toBe('classDiagram');
    expect((canvas as { rawCode?: string }).rawCode).toBe('classDiagram\n  class A');
  });

  it('同类型解析失败：仅显示错误，不发射', () => {
    const { handler, emit, setCodeError, onSameTypeUpdate } = makeHandler({});
    handler('flowchart X');
    expect(emit).not.toHaveBeenCalled();
    expect(onSameTypeUpdate).not.toHaveBeenCalled();
    expect(setCodeError).toHaveBeenCalledWith('parse error');
  });

  it('解析成功且类型变化：发射解析结果', () => {
    const parsed = {
      success: true as const,
      canvas: { diagramType: 'erDiagram' as const, nodes: [], edges: [], rawCode: 'erDiagram\n  A ||--o{ B' },
      errors: [] as ParseError[],
    };
    const { handler, emit } = makeHandler({
      codeToCanvas: () => parsed as unknown as ReturnType<typeof failure>,
    });
    handler('erDiagram\n  A ||--o{ B');
    expect(emit).toHaveBeenCalledWith(parsed.canvas);
  });
});
