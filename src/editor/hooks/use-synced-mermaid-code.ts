/**
 * useSyncedMermaidCode — 统一管理 mermaidCode 的服务端同步与本地操作
 *
 * 单一职责：封装 syncCanvas → mermaidCode 的服务端同步路径，
 * 同时提供本地操作入口 setMermaidCode，通过 ref 区分两种来源避免回环。
 *
 * 设计背景：
 *   Stage 7 重构（commit 357dc07）删除了 syncedRawCode useEffect + mermaidCode useMemo，
 *   导致切换 tab 时 syncCanvas.rawCode 无法同步到 mermaidCode state，代码框显示旧代码。
 *   本 hook 恢复这条同步路径，统一三个 Canvas 组件（GraphCanvas/SequenceCanvas/SpecializedShell）的逻辑。
 *
 * 数据流：
 *   服务端同步：syncCanvas 变化 → 生成 nextCode → setMermaidCodeState（切 tab / 其他客户端编辑 / 刷新重连）
 *     - syncCanvas.rawCode 存在：使用 rawCode（保留用户格式，用户编辑过的代码）
 *     - syncCanvas.rawCode 为 undefined：从 canvas 序列化生成代码（新建空视图 / 仅有拖拽操作的视图）
 *   本地操作：调用 setMermaidCode(code) → setMermaidCodeState + 记录 lastLocalCodeRef（避免回环）
 *
 * 回环避免：
 *   本地操作设置 mermaidCode 后，服务端广播回来的 syncCanvas.rawCode 可能与本地设置的值不同
 *   （本地设置的是 emitCanvasChange 返回的序列化代码，服务端 rawCode 是原始代码保留格式）。
 *   用 lastLocalCodeRef 记录本地最近设置的值：
 *     - nextCode == lastLocalCodeRef → 跳过（本地回环，避免覆盖用户编辑）
 *     - nextCode != lastLocalCodeRef → 更新（服务端同步，显示原始代码保留格式）
 *
 * 模块边界：仅引用 @mermaid2aichat/serializer（类型）+ react + ./services/code-converter，不引用 DOM/MCP/WS。✅
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CanvasState } from '@mermaid2aichat/serializer';
import type { CodeConverter } from '../services/code-converter.js';

/**
 * 统一管理 mermaidCode 的服务端同步与本地操作
 *
 * @param syncCanvas - 当前同步的画布状态（含可选 rawCode 字段）
 * @param codeConverter - 画布↔代码转换服务（rawCode=undefined 时从 canvas 序列化生成代码）
 * @returns mermaidCode - 当前代码（喂 CodeEditor/Toolbar）
 * @returns setMermaidCode - 本地操作入口（设置代码并记录 ref 避免回环）
 */
export function useSyncedMermaidCode(
  syncCanvas: CanvasState,
  codeConverter: CodeConverter,
): {
  mermaidCode: string;
  setMermaidCode: (code: string) => void;
} {
  const [mermaidCode, setMermaidCodeState] = useState<string>('');
  const lastLocalCodeRef = useRef<string>('');

  // 服务端同步：syncCanvas 变化时更新 mermaidCode
  // - rawCode 存在：使用 rawCode（保留用户格式，切 tab / 其他客户端编辑 / 刷新重连场景）
  // - rawCode 为 undefined：从 canvas 序列化生成代码（新建空视图 / 仅有拖拽操作的视图）
  // 跳过本地回环：如果 nextCode 等于本地最近设置的值，说明是本地操作的服务端回传，跳过
  useEffect(() => {
    const syncedRawCode = syncCanvas.rawCode;
    const nextCode = syncedRawCode ?? codeConverter.canvasToCode(syncCanvas).mermaid;
    if (nextCode !== lastLocalCodeRef.current) {
      setMermaidCodeState(nextCode);
      lastLocalCodeRef.current = nextCode;
    }
  }, [syncCanvas, codeConverter]);

  // 本地操作设置 mermaidCode 时，同步更新 ref（避免后续服务端回传覆盖）
  const setMermaidCode = useCallback((code: string) => {
    lastLocalCodeRef.current = code;
    setMermaidCodeState(code);
  }, []);

  return { mermaidCode, setMermaidCode };
}
