/**
 * useCanvasServices — 统一管理 CodeConverter + CanvasEmitter 服务实例
 *
 * 单一职责：封装三个 Canvas 组件（GraphCanvas/SequenceCanvas/SpecializedShell）共用的
 * 服务实例化模式 + onCanvasChange ref 包装 + useSyncedMermaidCode 调用
 *
 * 设计依据：Stage 7（editor CodeConverter + CanvasEmitter 服务）
 * 实例生命周期与组件一致（useRef 持有，组件卸载时自动 GC）
 *
 * 数据流：
 *   - codeConverter：parseMermaid + serializeMermaid 封装，管理 rawCode/previousCanvas 缓存
 *   - canvasEmitter：统一画布变更出口，内部调用 canvasToCode 生成 mermaid
 *   - mermaidCode：服务端同步（syncCanvas.rawCode）+ 本地操作（emitCanvasChange 返回值）
 *
 * 模块边界：仅引用 @mermaid2aichat/serializer + react + ./services + ./use-synced-mermaid-code，不引用 DOM/MCP/WS。✅
 */

import { useRef } from 'react';
import type { CanvasState } from '@mermaid2aichat/serializer';
import {
  createCodeConverter,
  createCanvasEmitter,
  type CodeConverter,
  type CanvasEmitter,
  type CanvasChangePayload,
} from '../services/index.js';
import { useSyncedMermaidCode } from './use-synced-mermaid-code.js';

export interface UseCanvasServicesOptions {
  /** 当前同步的画布状态（含可选 rawCode 字段） */
  syncCanvas: CanvasState;
  /** 画布变更回调（统一出口，来自 App.tsx 或 canvas.tsx 的 CanvasProps.onCanvasChange） */
  onCanvasChange: (payload: CanvasChangePayload) => void;
}

export interface CanvasServices {
  /** 画布↔代码转换服务（封装 parseMermaid + serializeMermaid） */
  codeConverter: CodeConverter;
  /** 画布变更发射器（统一出口，内部调用 canvasToCode 生成 mermaid） */
  canvasEmitter: CanvasEmitter;
  /** 当前 mermaid 代码（喂 CodeEditor/Toolbar） */
  mermaidCode: string;
  /** 本地设置 mermaid 代码（记录 ref 避免服务端同步回环） */
  setMermaidCode: (code: string) => void;
}

/**
 * 统一管理 CodeConverter + CanvasEmitter 服务实例
 *
 * @param options.syncCanvas - 当前同步的画布状态（含可选 rawCode 字段）
 * @param options.onCanvasChange - 画布变更回调（统一出口）
 * @returns 服务实例 + mermaidCode state
 *
 * 内部行为：
 *   1. useRef 持有 CodeConverter 实例（首次渲染创建，后续复用）
 *   2. useRef 持有 onCanvasChange 回调（避免闭包过期）
 *   3. useRef 持有 CanvasEmitter 实例（首次渲染创建，后续复用）
 *   4. 调用 useSyncedMermaidCode 管理 mermaidCode state
 */
export function useCanvasServices(options: UseCanvasServicesOptions): CanvasServices {
  const { syncCanvas, onCanvasChange } = options;

  // CodeConverter：封装 parseMermaid + serializeMermaid，管理 rawCode/previousCanvas 缓存
  const codeConverterRef = useRef<CodeConverter | null>(null);
  if (codeConverterRef.current === null) {
    codeConverterRef.current = createCodeConverter();
  }
  const codeConverter = codeConverterRef.current;

  // onCanvasChange 可能随父组件重渲染而变化，用 ref 持有最新回调避免闭包过期
  const onCanvasChangeRef = useRef(onCanvasChange);
  onCanvasChangeRef.current = onCanvasChange;

  // CanvasEmitter：统一画布变更出口，内部调用 canvasToCode 生成 mermaid
  const canvasEmitterRef = useRef<CanvasEmitter | null>(null);
  if (canvasEmitterRef.current === null) {
    canvasEmitterRef.current = createCanvasEmitter(
      (payload) => onCanvasChangeRef.current(payload),
      codeConverter,
    );
  }
  const canvasEmitter = canvasEmitterRef.current;

  // mermaidCode state — 服务端同步（syncCanvas.rawCode）+ 本地操作（emitCanvasChange 返回值）
  const { mermaidCode, setMermaidCode } = useSyncedMermaidCode(syncCanvas, codeConverter);

  return { codeConverter, canvasEmitter, mermaidCode, setMermaidCode };
}
