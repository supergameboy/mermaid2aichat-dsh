/**
 * CodeConverter — 画布↔代码转换服务（单写入闸门模式）
 *
 * 单一职责：封装 parseMermaid + serializeMermaid，管理 rawCode/previousCanvas 缓存
 *
 * 设计依据：
 *   - 决策8：薄封装 + 画布状态缓存（rawCode/previousCanvas），不承担 React Flow state 管理、
 *     布局算法、subgraph 坐标转换职责。借鉴 mermaid-live-editor 单写入闸门 update(mutate) 模式。
 *   - 决策1：incremental-serializer 已删除，rawCode 缓存仅供全量序列化路径使用（不再做增量定位）。
 *   - Stage 7 决策修订：实例由 GraphCanvas/SequenceCanvas/GanttCanvas 内部 useRef 创建，
 *     生命周期与组件一致。
 *
 * 数据流:
 *   codeToCanvas(code) → parseMermaid(code) → 缓存 rawCode + previousCanvas → 返回 ParseResult
 *   canvasToCode(canvas) → serializeMermaid(canvas) → 缓存 rawCode → 返回 SerializeResult
 *   resetCache() → 清空 rawCode + previousCanvas（图表类型切换时调用）
 *
 * 模块边界：仅引用 @mermaid2aichat/serializer，不引用 React/DOM/MCP/WS。✅
 */

import {
  parseMermaid,
  serializeMermaid,
  type CanvasState,
  type ParseResult,
  type SerializeResult,
} from '@mermaid2aichat/serializer';

// ============================================================
// CodeConverter 接口
// ============================================================

/**
 * 画布↔代码转换服务接口
 *
 * 单写入闸门：所有 code↔canvas 转换通过此接口，禁止直接调用 parseMermaid/serializeMermaid。
 * 缓存管理：rawCode/previousCanvas 由 CodeConverter 独占，外部不可访问。
 */
export interface CodeConverter {
  /**
   * 代码 → 画布状态
   *
   * 内部缓存 rawCode（来自 ParseResult.canvas.rawCode）和 previousCanvas（=canvas）。
   * 用于后续 canvasToCode 的全量序列化。
   *
   * @param code - Mermaid 代码字符串
   * @returns ParseResult（含 canvas 和 errors）
   */
  codeToCanvas(code: string): ParseResult;

  /**
   * 画布状态 → 代码
   *
   * 内部调用 serializeMermaid(canvas)，更新 rawCode 缓存为最新序列化结果。
   * previousCanvas 更新为当前 canvas（供下次比较用，但目前无增量序列化路径）。
   *
   * @param canvas - CanvasState（任意图表类型）
   * @returns SerializeResult（含 mermaid 和 errors）
   */
  canvasToCode(canvas: CanvasState): SerializeResult;

  /**
   * 重置缓存
   *
   * 图表类型切换时调用，清空 rawCode 和 previousCanvas。
   * 避免旧类型的 rawCode 被新类型序列化路径误用。
   */
  resetCache(): void;
}

// ============================================================
// CodeConverter 实现
// ============================================================

/**
 * CodeConverter 内部状态
 *
 * rawCode：最近一次 codeToCanvas 的解析器输出 rawCode，或最近一次 canvasToCode 的序列化结果。
 *          用于渲染层显示原始代码格式（保留注释/空行/缩进 — 仅 codeToCanvas 路径保留）。
 * previousCanvas：最近一次处理的 CanvasState，供未来增量序列化路径使用（当前无增量路径，预留）。
 */
interface CodeConverterState {
  rawCode: string | undefined;
  previousCanvas: CanvasState | undefined;
}

/**
 * 创建 CodeConverter 实例
 *
 * 实例生命周期由调用方管理（推荐 useRef 持有，与组件生命周期一致）。
 * 实例内部状态通过闭包封装，外部仅能通过接口方法访问。
 */
export function createCodeConverter(): CodeConverter {
  const state: CodeConverterState = {
    rawCode: undefined,
    previousCanvas: undefined,
  };

  return {
    codeToCanvas(code: string): ParseResult {
      const result = parseMermaid(code);
      // 缓存 rawCode：ParseResult.canvas.rawCode 携带解析器输出的原始代码（保留格式）
      if (result.success) {
        const canvas = result.canvas;
        // GraphCanvasState 等类型携带 rawCode 字段（可选）
        if ('rawCode' in canvas && typeof canvas.rawCode === 'string') {
          state.rawCode = canvas.rawCode;
        } else {
          // 数据图表类型无 rawCode 字段，使用输入 code 作为缓存
          state.rawCode = code;
        }
        state.previousCanvas = canvas;
      }
      // 失败分支不更新缓存（保留上次有效状态）
      return result;
    },

    canvasToCode(canvas: CanvasState): SerializeResult {
      const result = serializeMermaid(canvas);
      // 缓存 rawCode：序列化结果作为新 rawCode（全量序列化路径）
      state.rawCode = result.mermaid;
      state.previousCanvas = canvas;
      return result;
    },

    resetCache(): void {
      state.rawCode = undefined;
      state.previousCanvas = undefined;
    },
  };
}
