/**
 * use-sequence-reorder — 拖拽排序状态 hook
 *
 * 单一职责：管理排序拖拽状态机（idle ↔ reordering），提供 mousedown/mousemove/mouseup 处理器
 * 不直接修改 CanvasState，通过 onReorderMessage 回调通知调用方
 *
 * 坐标转换：hook 内部调用 toSvgCoords 将 clientY 转为 SVG Y 坐标后存入 dragState
 * originalIndex / dropIndex 都是 sortedEdges 索引（= edge.data.sequence 值）
 *
 * 与 use-sequence-connect 的差异：
 *   - endDrag 无参数（dropIndex 已在 mousemove 时通过 hitTestDropIndex 更新）
 *   - updateDragPosition 只用 clientY（排序是垂直方向）
 *   - startReorderDrag 初始 dropIndex = originalIndex（不调用 hitTestDropIndex）
 *
 * 副作用安全设计（对齐 use-sequence-connect）：
 *   - dragStateRef 同步镜像 dragState，避免严格模式下 updater 重复执行副作用
 *   - 回调函数用 ref 持有最新值，避免 window 事件监听器闭包过期
 *
 * 设计文档：docs/design/sequence-editing-mode-upgrade.md
 */

import { useCallback, useRef, useState } from 'react';

/** 排序拖拽状态 */
export type ReorderDragState =
  | { type: 'idle' }
  | {
      type: 'reordering';
      messageId: string;
      originalIndex: number;  // sortedEdges 索引
      currentY: number;       // SVG 坐标
      dropIndex: number;       // 拖拽落点（0..N）
    };

export interface UseSequenceReorderOptions {
  /** 重排消息回调（拖拽排序完成时调用） */
  onReorderMessage: (messageId: string, fromIndex: number, toIndex: number) => void;
  /** 命中检测：返回 SVG Y 坐标对应的 dropIndex（消息索引位置 0..N） */
  hitTestDropIndex: (svgY: number) => number;
  /** 屏幕坐标转 SVG 坐标 */
  toSvgCoords: (clientX: number, clientY: number) => { x: number; y: number };
}

export interface UseSequenceReorderResult {
  /** 当前拖拽状态 */
  dragState: ReorderDragState;
  /** 开始排序拖拽（在 grip 手柄 mousedown 时调用） */
  startReorderDrag: (messageId: string, messageIndex: number, clientX: number, clientY: number) => void;
  /** 更新拖拽位置（mousemove 时调用） */
  updateDragPosition: (clientX: number, clientY: number) => void;
  /** 结束拖拽（mouseup 时调用，会触发 onReorderMessage） */
  endDrag: () => void;
  /** 取消拖拽（ESC 键或鼠标离开窗口时调用） */
  cancelDrag: () => void;
}

export function useSequenceReorder(options: UseSequenceReorderOptions): UseSequenceReorderResult {
  const { onReorderMessage, hitTestDropIndex, toSvgCoords } = options;

  const [dragState, setDragState] = useState<ReorderDragState>({ type: 'idle' });

  // dragStateRef：同步镜像 dragState，供事件处理器读取最新值
  // 避免在 setDragState functional updater 内部调用副作用（onReorderMessage）
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // 回调函数用 ref 持有最新值，避免 window 事件监听器闭包过期
  const onReorderMessageRef = useRef(onReorderMessage);
  const hitTestDropIndexRef = useRef(hitTestDropIndex);
  const toSvgCoordsRef = useRef(toSvgCoords);
  onReorderMessageRef.current = onReorderMessage;
  hitTestDropIndexRef.current = hitTestDropIndex;
  toSvgCoordsRef.current = toSvgCoords;

  // window 事件处理器引用（用于 removeEventListener）
  const mousemoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseupHandlerRef = useRef<(() => void) | null>(null);
  const keydownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  /** 移除 window 事件监听器（幂等：无监听器时无操作） */
  const removeWindowListeners = useCallback(() => {
    if (mousemoveHandlerRef.current !== null) {
      window.removeEventListener('mousemove', mousemoveHandlerRef.current);
      mousemoveHandlerRef.current = null;
    }
    if (mouseupHandlerRef.current !== null) {
      window.removeEventListener('mouseup', mouseupHandlerRef.current);
      mouseupHandlerRef.current = null;
    }
    if (keydownHandlerRef.current !== null) {
      window.removeEventListener('keydown', keydownHandlerRef.current);
      keydownHandlerRef.current = null;
    }
  }, []);

  /** 更新拖拽位置（仅 reordering 状态生效）：转换坐标 + hitTestDropIndex 更新 dropIndex */
  const updateDragPosition = useCallback((clientX: number, clientY: number) => {
    const prev = dragStateRef.current;
    if (prev.type !== 'reordering') return;
    const { y } = toSvgCoordsRef.current(clientX, clientY);
    const dropIndex = hitTestDropIndexRef.current(y);
    const next: ReorderDragState = { ...prev, currentY: y, dropIndex };
    dragStateRef.current = next;
    setDragState(next);
  }, []);

  /** 结束拖拽：触发 onReorderMessage（即使 dropIndex === originalIndex 也调用，边界 #4） */
  const endDrag = useCallback(() => {
    const prev = dragStateRef.current;
    if (prev.type !== 'reordering') return;
    // 同步更新 ref，防止同步重复调用 endDrag 触发两次 onReorderMessage
    dragStateRef.current = { type: 'idle' };
    onReorderMessageRef.current(prev.messageId, prev.originalIndex, prev.dropIndex);
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 取消拖拽：回到 idle，不触发 onReorderMessage */
  const cancelDrag = useCallback(() => {
    dragStateRef.current = { type: 'idle' };
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 开始排序拖拽：转换坐标 → 切换 reordering 状态 → 注册 window 监听器 */
  const startReorderDrag = useCallback(
    (messageId: string, messageIndex: number, clientX: number, clientY: number) => {
      // 防御性：清除可能残留的旧监听器，避免重复 start 导致监听器泄漏
      removeWindowListeners();

      const { y } = toSvgCoordsRef.current(clientX, clientY);
      const next: ReorderDragState = {
        type: 'reordering',
        messageId,
        originalIndex: messageIndex,
        currentY: y,
        // 初始 dropIndex = originalIndex（startReorderDrag 不调用 hitTestDropIndex）
        dropIndex: messageIndex,
      };
      dragStateRef.current = next;
      setDragState(next);

      const mousemoveHandler = (e: MouseEvent) => {
        updateDragPosition(e.clientX, e.clientY);
      };
      const mouseupHandler = () => {
        endDrag();
      };
      const keydownHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          cancelDrag();
        }
      };

      mousemoveHandlerRef.current = mousemoveHandler;
      mouseupHandlerRef.current = mouseupHandler;
      keydownHandlerRef.current = keydownHandler;

      window.addEventListener('mousemove', mousemoveHandler);
      window.addEventListener('mouseup', mouseupHandler);
      window.addEventListener('keydown', keydownHandler);
    },
    [removeWindowListeners, updateDragPosition, endDrag, cancelDrag],
  );

  return {
    dragState,
    startReorderDrag,
    updateDragPosition,
    endDrag,
    cancelDrag,
  };
}
