/**
 * use-sequence-block-resize — Block 上下边缘 resize hook（B4.4）
 *
 * 单一职责：管理 Block 边缘 resize 拖拽状态机（idle ↔ resizing），
 *   提供 mousedown/mousemove/mouseup/Escape 处理器
 * 不直接修改 CanvasState，通过 onResizeBlock 回调通知调用方
 *
 * 两种 edge 模式：
 *   - 'top'：上边缘 resize，调整 block.startMessage
 *   - 'bottom'：下边缘 resize，调整 block.endMessage
 *
 * 落点计算：基于 SVG Y 坐标转换为消息索引（hitTestMessageIndex）
 *   - top edge: newIndex 必须满足 newIndex < originalEnd（不允许 top 越过 bottom）
 *   - bottom edge: newIndex 必须满足 newIndex > originalStart（不允许 bottom 越过 top）
 *   - 边界夹紧由调用方在 handleResizeBlock 中完成（hook 仅传递 newIndex）
 *
 * 与 use-sequence-reorder 的差异：
 *   - 拖拽对象是 Block（blockIndex + edge），use-sequence-reorder 是消息
 *   - 落点是消息索引（resize 到最近消息边界），不是消息插入位置
 *   - dragState 额外保存 originalStart/originalEnd，便于调用方做范围夹紧
 *
 * 副作用安全设计（对齐 use-sequence-reorder）：
 *   - dragStateRef 同步镜像 dragState，避免严格模式下 updater 重复执行副作用
 *   - 回调函数用 ref 持有最新值，避免 window 事件监听器闭包过期
 *
 * 设计文档：docs/design/fractal-design-20260701-sequence重新设计/fractal-design-20260701-sequence重新设计-B4-L2-子功能细化.md
 */

import { useCallback, useRef, useState } from 'react';

/** Block resize 边缘类型 */
export type BlockResizeEdge = 'top' | 'bottom';

/** Block resize 拖拽状态 */
export type BlockResizeDragState =
  | { type: 'idle' }
  | {
      type: 'resizing';
      blockIndex: number;
      edge: BlockResizeEdge;
      originalStart: number; // 原始 startMessage（用于调用方做范围夹紧）
      originalEnd: number; // 原始 endMessage（用于调用方做范围夹紧）
      currentY: number; // SVG 坐标
      newIndex: number; // 拖拽落点对应的消息索引
    };

export interface UseSequenceBlockResizeOptions {
  /** Resize Block 回调（拖拽完成时调用） */
  onResizeBlock: (
    blockIndex: number,
    edge: BlockResizeEdge,
    originalStart: number,
    originalEnd: number,
    newIndex: number,
  ) => void;
  /** 命中检测：返回 SVG Y 坐标对应的消息索引（0..messageCount） */
  hitTestMessageIndex: (svgY: number) => number;
  /** 屏幕坐标转 SVG 坐标 */
  toSvgCoords: (clientX: number, clientY: number) => { x: number; y: number };
}

export interface UseSequenceBlockResizeResult {
  /** 当前拖拽状态 */
  dragState: BlockResizeDragState;
  /** 开始 resize 拖拽（在 Block 上下边缘 handle mousedown 时调用） */
  startBlockResize: (
    blockIndex: number,
    edge: BlockResizeEdge,
    originalStart: number,
    originalEnd: number,
    clientX: number,
    clientY: number,
  ) => void;
  /** 更新拖拽位置（mousemove 时调用） */
  updateDragPosition: (clientX: number, clientY: number) => void;
  /** 结束拖拽（mouseup 时调用，会触发 onResizeBlock） */
  endDrag: () => void;
  /** 取消拖拽（ESC 键或鼠标离开窗口时调用） */
  cancelDrag: () => void;
}

export function useSequenceBlockResize(
  options: UseSequenceBlockResizeOptions,
): UseSequenceBlockResizeResult {
  const { onResizeBlock, hitTestMessageIndex, toSvgCoords } = options;

  const [dragState, setDragState] = useState<BlockResizeDragState>({ type: 'idle' });

  // dragStateRef：同步镜像 dragState，供事件处理器读取最新值
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // 回调函数用 ref 持有最新值，避免 window 事件监听器闭包过期
  const onResizeBlockRef = useRef(onResizeBlock);
  const hitTestMessageIndexRef = useRef(hitTestMessageIndex);
  const toSvgCoordsRef = useRef(toSvgCoords);
  onResizeBlockRef.current = onResizeBlock;
  hitTestMessageIndexRef.current = hitTestMessageIndex;
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

  /** 更新拖拽位置（仅 resizing 状态生效）：转换坐标 + hitTestMessageIndex 更新 newIndex */
  const updateDragPosition = useCallback((clientX: number, clientY: number) => {
    const prev = dragStateRef.current;
    if (prev.type !== 'resizing') return;
    const { y } = toSvgCoordsRef.current(clientX, clientY);
    const newIndex = hitTestMessageIndexRef.current(y);
    const next: BlockResizeDragState = { ...prev, currentY: y, newIndex };
    dragStateRef.current = next;
    setDragState(next);
  }, []);

  /** 结束拖拽：触发 onResizeBlock（即使 newIndex === originalStart/End 也调用，边界一致） */
  const endDrag = useCallback(() => {
    const prev = dragStateRef.current;
    if (prev.type !== 'resizing') return;
    // 同步更新 ref，防止同步重复调用 endDrag 触发两次 onResizeBlock
    dragStateRef.current = { type: 'idle' };
    onResizeBlockRef.current(
      prev.blockIndex,
      prev.edge,
      prev.originalStart,
      prev.originalEnd,
      prev.newIndex,
    );
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 取消拖拽：回到 idle，不触发 onResizeBlock */
  const cancelDrag = useCallback(() => {
    dragStateRef.current = { type: 'idle' };
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 开始 resize 拖拽：转换坐标 → 切换 resizing 状态 → 注册 window 监听器 */
  const startBlockResize = useCallback(
    (
      blockIndex: number,
      edge: BlockResizeEdge,
      originalStart: number,
      originalEnd: number,
      clientX: number,
      clientY: number,
    ) => {
      // 防御性：清除可能残留的旧监听器，避免重复 start 导致监听器泄漏
      removeWindowListeners();

      const { y } = toSvgCoordsRef.current(clientX, clientY);
      // 初始 newIndex = edge 对应的原始 start/end（不调用 hitTestMessageIndex）
      const initialNewIndex = edge === 'top' ? originalStart : originalEnd;
      const next: BlockResizeDragState = {
        type: 'resizing',
        blockIndex,
        edge,
        originalStart,
        originalEnd,
        currentY: y,
        newIndex: initialNewIndex,
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
    startBlockResize,
    updateDragPosition,
    endDrag,
    cancelDrag,
  };
}
