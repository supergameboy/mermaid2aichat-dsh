/**
 * CanvasEmitter — 画布变更统一出口
 *
 * 单一职责：合并原 onCanvasEdit/onCanvasUpdate 双出口为单一 emitCanvasChange
 *
 * 设计依据：
 *   - 决策9：web-editor 和 vscode-extension 共用 editor 包，CodeConverter/CanvasEmitter 在 editor 内，
 *     双端自动同步。App.tsx 调整 onCanvasEdit/onCanvasUpdate 双出口为统一 onCanvasChange。
 *   - Stage 7 决策修订：CanvasChangePayload 增加 mermaid 字段。emitCanvasChange 内部调用
 *     codeConverter.canvasToCode(canvas) 生成 mermaid，通过 payload 传给 App.tsx。
 *     单向数据流，无 ref 依赖。
 *
 * 数据流:
 *   调用方构造 CanvasState → emitCanvasChange(canvas)
 *     → isGraphCanvasState(canvas) ? 从 canvas 提取 snapshot : snapshot=undefined
 *     → codeConverter.canvasToCode(canvas) 生成 mermaid
 *     → onCanvasChange({ snapshot?, fullState: canvas, mermaid })
 *       → App.tsx 乐观更新本地 state + 发送 WsClientMessage
 *
 * 模块边界：仅引用 @mermaid2aichat/serializer + ./code-converter，不引用 React/DOM/MCP/WS。✅
 */

import {
  isGraphCanvasState,
  type CanvasSnapshot,
  type CanvasState,
  type GraphCanvasState,
} from '@mermaid2aichat/serializer';
import type { CodeConverter } from './code-converter.js';

// ============================================================
// CanvasChangePayload 类型
// ============================================================

/**
 * 画布变更快照（统一出口）
 *
 * 调用方（App.tsx）消费策略：
 *   - payload.snapshot 存在（图结构类型）：用 snapshot 更新图结构画布
 *   - payload.snapshot 不存在（类型切换/数据图表类型）：用 payload.fullState 切换画布类型
 *   - payload.mermaid：用于 CodeEditor 显示 + 广播
 *
 * 设计意图：
 *   - snapshot 仅图结构类型填充（从 GraphCanvasState 提取 nodes/edges/direction/metadata）
 *   - fullState 总是填充（等于输入 canvas），保证消费方能拿到完整 CanvasState
 *   - mermaid 总是填充（由 emitCanvasChange 内部生成）
 */
export interface CanvasChangePayload {
  /**
   * 画布快照（图结构类型使用）。
   * 仅当 canvas 是 GraphCanvasState 时填充（从 canvas 提取 nodes/edges/direction/metadata）。
   * 类型切换/数据图表类型时为 undefined（消费方读 fullState）。
   */
  readonly snapshot: CanvasSnapshot | undefined;

  /**
   * 完整 CanvasState（总是填充）。
   * 用于类型切换场景（如 flowchart → sequenceDiagram）和数据图表类型更新。
   * 图结构类型时也填充（与 snapshot 对应同一 canvas），消费方可选读 fullState 或 snapshot。
   */
  readonly fullState: CanvasState;

  /**
   * 序列化后的 mermaid 代码（Stage 7 决策修订 2026-06-30）。
   *
   * 由 emitCanvasChange 内部调用 codeConverter.canvasToCode(canvas) 生成。
   * App.tsx 从 payload 获取 mermaid 喂 CodeEditor + 广播。
   * 单向数据流，无 ref 依赖。
   */
  readonly mermaid: string;
}

// ============================================================
// CanvasEmitter 接口
// ============================================================

/**
 * 画布发射器接口
 *
 * 调用方传入完整 CanvasState（GraphCanvasState 或其他 CanvasState 子类型），
 * emitCanvasChange 内部：
 *   1. 判断是否为 GraphCanvasState，若是则提取 snapshot
 *   2. 调用 codeConverter.canvasToCode(canvas) 生成 mermaid
 *   3. 组装 CanvasChangePayload 调用 onCanvasChange
 *   4. 返回 mermaid 字符串供调用方更新本地 state（避免重复调用 canvasToCode）
 *
 * 设计意图：将"判断类型 + 提取 snapshot + 序列化 mermaid + 通知外部"四步收敛为单一入口，
 * 避免调用方直接管理 mermaid 缓存和序列化调用。
 *
 * 返回值设计：emitCanvasChange 返回 mermaid 字符串，调用方（GraphCanvas）用此值
 * 更新本地 mermaidCode state（喂 CodeEditor/Toolbar）。这样 canvasToCode 只调用一次，
 * mermaid 既通过 payload 传给 App.tsx（用于广播），又通过返回值传给 GraphCanvas（用于显示）。
 */
export interface CanvasEmitter {
  /**
   * 发射画布变更
   *
   * @param canvas - 完整 CanvasState（GraphCanvasState 或其他子类型）
   * @returns mermaid 字符串（由 codeConverter.canvasToCode 生成，供调用方更新本地 state）
   *
   * 内部行为：
   *   1. isGraphCanvasState(canvas) ? 提取 snapshot : snapshot = undefined
   *   2. codeConverter.canvasToCode(canvas) → mermaid
   *   3. onCanvasChange({ snapshot?, fullState: canvas, mermaid })
   *   4. return mermaid
   */
  emitCanvasChange(canvas: CanvasState): string;
}

// ============================================================
// CanvasEmitter 实现
// ============================================================

/**
 * 创建 CanvasEmitter 实例
 *
 * @param onCanvasChange - 统一出口回调（App.tsx 提供）
 * @param codeConverter - CodeConverter 实例（用于内部调用 canvasToCode 生成 mermaid）
 *
 * 实例生命周期由调用方管理（推荐 useRef 持有，与 GraphCanvas 等组件生命周期一致）。
 */
export function createCanvasEmitter(
  onCanvasChange: (payload: CanvasChangePayload) => void,
  codeConverter: CodeConverter,
): CanvasEmitter {
  return {
    emitCanvasChange(canvas: CanvasState): string {
      // 调用 CodeConverter 生成 mermaid（内部更新 rawCode 缓存）
      const serializeResult = codeConverter.canvasToCode(canvas);
      const mermaid = serializeResult.mermaid;

      // 将序列化代码写入 canvas.rawCode，使服务端同步更新 rawCode
      // 不写入则服务端保留旧 rawCode（含旧方向等），广播回客户端覆盖本地新代码
      const canvasWithCode: CanvasState = isGraphCanvasState(canvas)
        ? { ...canvas, rawCode: mermaid }
        : canvas;

      // 从 GraphCanvasState 提取 snapshot（仅图结构类型有 snapshot）
      const snapshot = extractSnapshot(canvasWithCode);

      // 组装 payload 调用 onCanvasChange
      const payload: CanvasChangePayload = {
        snapshot,
        fullState: canvasWithCode,
        mermaid,
      };
      onCanvasChange(payload);

      // 返回 mermaid 供调用方更新本地 state（避免重复调用 canvasToCode）
      return mermaid;
    },
  };
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 从 GraphCanvasState 提取 CanvasSnapshot
 *
 * GraphCanvasState 字段：diagramType/nodes/edges/direction?/metadata?/rawCode?/needsLayout?
 * CanvasSnapshot 字段：nodes/edges/direction（必填）/metadata?/rawCode?/needsLayout?
 *
 * direction 在 GraphCanvasState 是可选，在 CanvasSnapshot 是必填。
 * 提取时使用默认值 'TB'（与 graph-canvas 的 safeDirection 逻辑一致）。
 *
 * 非 GraphCanvasState 类型返回 undefined（数据图表类型无 snapshot 概念）。
 */
function extractSnapshot(canvas: CanvasState): CanvasSnapshot | undefined {
  if (!isGraphCanvasState(canvas)) {
    return undefined;
  }

  const graphCanvas: GraphCanvasState = canvas;
  const snapshot: CanvasSnapshot = {
    nodes: graphCanvas.nodes,
    edges: graphCanvas.edges,
    direction: graphCanvas.direction ?? 'TB',
    ...(graphCanvas.metadata !== undefined ? { metadata: graphCanvas.metadata } : {}),
    ...(graphCanvas.rawCode !== undefined ? { rawCode: graphCanvas.rawCode } : {}),
    ...(graphCanvas.needsLayout !== undefined ? { needsLayout: graphCanvas.needsLayout } : {}),
  };
  return snapshot;
}
