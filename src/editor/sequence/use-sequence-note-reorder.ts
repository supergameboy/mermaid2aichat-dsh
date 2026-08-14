/**
 * use-sequence-note-reorder — Note 纵向排序 hook（B4.4）
 *
 * 单一职责：管理 Note 纵向排序拖拽状态机（idle ↔ reordering），
 *   提供 mousedown/mousemove/mouseup/Escape 处理器
 * 不直接修改 CanvasState，通过 onReorderNote 回调通知调用方
 *
 * 与 use-sequence-reorder 的差异：
 *   - 拖拽对象是 Note（noteIndex + currentMessageIndex），use-sequence-reorder 是消息
 *   - 落点范围：[0, messageCount]（Note 可附着任意 messageIndex，包括末尾）
 *   - 落点计算使用 hitTestNoteDropIndex（基于消息 Y 坐标，而非 note Y）
 *     因为 Note 的目标位置是"附着到第 N 条消息"，而不是"在 notes 数组内排序"
 *
 * 坐标转换：hook 内部调用 toSvgCoords 将 clientY 转为 SVG Y 坐标后存入 dragState
 * originalMessageIndex / dropMessageIndex 都是 messageIndex 值（0..messageCount）
 *
 * 副作用安全设计（对齐 use-sequence-reorder）：
 *   - dragStateRef 同步镜像 dragState，避免严格模式下 updater 重复执行副作用
 *   - 回调函数用 ref 持有最新值，避免 window 事件监听器闭包过期
 *
 * 设计文档：docs/design/fractal-design-20260701-sequence重新设计/fractal-design-20260701-sequence重新设计-B4-L2-子功能细化.md
 */

import { useCallback, useRef, useState } from 'react';

/** Note 排序拖拽状态 */
export type NoteReorderDragState =
  | { type: 'idle' }
  | {
      type: 'reordering';
      noteIndex: number;
      originalMessageIndex: number; // 原始 messageIndex
      currentY: number; // SVG 坐标
      dropMessageIndex: number; // 拖拽落点 messageIndex（0..messageCount）
    };

export interface UseSequenceNoteReorderOptions {
  /** 重排 Note 回调（拖拽排序完成时调用） */
  onReorderNote: (
    noteIndex: number,
    fromMessageIndex: number,
    toMessageIndex: number,
  ) => void;
  /** 命中检测：返回 SVG Y 坐标对应的 messageIndex（Note 落点 = 附着到第 N 条消息） */
  hitTestNoteDropIndex: (svgY: number) => number;
  /** 屏幕坐标转 SVG 坐标 */
  toSvgCoords: (clientX: number, clientY: number) => { x: number; y: number };
}

export interface UseSequenceNoteReorderResult {
  /** 当前拖拽状态 */
  dragState: NoteReorderDragState;
  /** 开始排序拖拽（在 Note grip 手柄 mousedown 时调用） */
  startNoteReorder: (
    noteIndex: number,
    currentMessageIndex: number,
    clientX: number,
    clientY: number,
  ) => void;
  /** 更新拖拽位置（mousemove 时调用） */
  updateDragPosition: (clientX: number, clientY: number) => void;
  /** 结束拖拽（mouseup 时调用，会触发 onReorderNote） */
  endDrag: () => void;
  /** 取消拖拽（ESC 键或鼠标离开窗口时调用） */
  cancelDrag: () => void;
}

export function useSequenceNoteReorder(
  options: UseSequenceNoteReorderOptions,
): UseSequenceNoteReorderResult {
  const { onReorderNote, hitTestNoteDropIndex, toSvgCoords } = options;

  const [dragState, setDragState] = useState<NoteReorderDragState>({ type: 'idle' });

  // dragStateRef：同步镜像 dragState，供事件处理器读取最新值
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // 回调函数用 ref 持有最新值，避免 window 事件监听器闭包过期
  const onReorderNoteRef = useRef(onReorderNote);
  const hitTestNoteDropIndexRef = useRef(hitTestNoteDropIndex);
  const toSvgCoordsRef = useRef(toSvgCoords);
  onReorderNoteRef.current = onReorderNote;
  hitTestNoteDropIndexRef.current = hitTestNoteDropIndex;
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

  /** 更新拖拽位置（仅 reordering 状态生效）：转换坐标 + hitTestNoteDropIndex 更新 dropMessageIndex */
  const updateDragPosition = useCallback((clientX: number, clientY: number) => {
    const prev = dragStateRef.current;
    if (prev.type !== 'reordering') return;
    const { y } = toSvgCoordsRef.current(clientX, clientY);
    const dropMessageIndex = hitTestNoteDropIndexRef.current(y);
    const next: NoteReorderDragState = { ...prev, currentY: y, dropMessageIndex };
    dragStateRef.current = next;
    setDragState(next);
  }, []);

  /** 结束拖拽：触发 onReorderNote（即使 dropMessageIndex === originalMessageIndex 也调用，边界一致） */
  const endDrag = useCallback(() => {
    const prev = dragStateRef.current;
    if (prev.type !== 'reordering') return;
    // 同步更新 ref，防止同步重复调用 endDrag 触发两次 onReorderNote
    dragStateRef.current = { type: 'idle' };
    onReorderNoteRef.current(
      prev.noteIndex,
      prev.originalMessageIndex,
      prev.dropMessageIndex,
    );
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 取消拖拽：回到 idle，不触发 onReorderNote */
  const cancelDrag = useCallback(() => {
    dragStateRef.current = { type: 'idle' };
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 开始排序拖拽：转换坐标 → 切换 reordering 状态 → 注册 window 监听器 */
  const startNoteReorder = useCallback(
    (
      noteIndex: number,
      currentMessageIndex: number,
      clientX: number,
      clientY: number,
    ) => {
      // 防御性：清除可能残留的旧监听器，避免重复 start 导致监听器泄漏
      removeWindowListeners();

      const { y } = toSvgCoordsRef.current(clientX, clientY);
      const next: NoteReorderDragState = {
        type: 'reordering',
        noteIndex,
        originalMessageIndex: currentMessageIndex,
        currentY: y,
        // 初始 dropMessageIndex = currentMessageIndex（startNoteReorder 不调用 hitTestNoteDropIndex）
        dropMessageIndex: currentMessageIndex,
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
    startNoteReorder,
    updateDragPosition,
    endDrag,
    cancelDrag,
  };
}
