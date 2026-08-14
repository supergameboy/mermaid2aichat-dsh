/**
 * use-sequence-participant-reorder — 参与者横向排序 hook（B4.4）
 *
 * 单一职责：管理参与者横向排序拖拽状态机（idle ↔ reordering），
 *   提供 mousedown/mousemove/mouseup/Escape 处理器
 * 不直接修改 CanvasState，通过 onReorderParticipant 回调通知调用方
 *
 * 与 use-sequence-reorder 的差异：
 *   - 横向排序（按 SVG X 坐标计算落点），use-sequence-reorder 是纵向（按 Y）
 *   - 拖拽对象是参与者（participantId + participantIndex），use-sequence-reorder 是消息
 *
 * 坐标转换：hook 内部调用 toSvgCoords 将 clientX 转为 SVG X 坐标后存入 dragState
 * originalIndex / dropIndex 都是 participants 数组索引（0..N-1，落点范围 0..N）
 *
 * 副作用安全设计（对齐 use-sequence-reorder）：
 *   - dragStateRef 同步镜像 dragState，避免严格模式下 updater 重复执行副作用
 *   - 回调函数用 ref 持有最新值，避免 window 事件监听器闭包过期
 *
 * 设计文档：docs/design/fractal-design-20260701-sequence重新设计/fractal-design-20260701-sequence重新设计-B4-L2-子功能细化.md
 */

import { useCallback, useRef, useState } from 'react';

/** 参与者排序拖拽状态 */
export type ParticipantReorderDragState =
  | { type: 'idle' }
  | {
      type: 'reordering';
      participantId: string;
      originalIndex: number; // participants 数组索引
      currentX: number; // SVG 坐标
      dropIndex: number; // 拖拽落点（0..N）
    };

export interface UseSequenceParticipantReorderOptions {
  /** 重排参与者回调（拖拽排序完成时调用） */
  onReorderParticipant: (
    participantId: string,
    fromIndex: number,
    toIndex: number,
  ) => void;
  /** 命中检测：返回 SVG X 坐标对应的 dropIndex（参与者插入位置 0..N） */
  hitTestParticipantDropIndex: (svgX: number) => number;
  /** 屏幕坐标转 SVG 坐标 */
  toSvgCoords: (clientX: number, clientY: number) => { x: number; y: number };
}

export interface UseSequenceParticipantReorderResult {
  /** 当前拖拽状态 */
  dragState: ParticipantReorderDragState;
  /** 开始排序拖拽（在 grip 手柄 mousedown 时调用） */
  startParticipantReorder: (
    participantId: string,
    participantIndex: number,
    clientX: number,
    clientY: number,
  ) => void;
  /** 更新拖拽位置（mousemove 时调用） */
  updateDragPosition: (clientX: number, clientY: number) => void;
  /** 结束拖拽（mouseup 时调用，会触发 onReorderParticipant） */
  endDrag: () => void;
  /** 取消拖拽（ESC 键或鼠标离开窗口时调用） */
  cancelDrag: () => void;
}

export function useSequenceParticipantReorder(
  options: UseSequenceParticipantReorderOptions,
): UseSequenceParticipantReorderResult {
  const { onReorderParticipant, hitTestParticipantDropIndex, toSvgCoords } = options;

  const [dragState, setDragState] = useState<ParticipantReorderDragState>({ type: 'idle' });

  // dragStateRef：同步镜像 dragState，供事件处理器读取最新值
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // 回调函数用 ref 持有最新值，避免 window 事件监听器闭包过期
  const onReorderParticipantRef = useRef(onReorderParticipant);
  const hitTestParticipantDropIndexRef = useRef(hitTestParticipantDropIndex);
  const toSvgCoordsRef = useRef(toSvgCoords);
  onReorderParticipantRef.current = onReorderParticipant;
  hitTestParticipantDropIndexRef.current = hitTestParticipantDropIndex;
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

  /** 更新拖拽位置（仅 reordering 状态生效）：转换坐标 + hitTestParticipantDropIndex 更新 dropIndex */
  const updateDragPosition = useCallback((clientX: number, clientY: number) => {
    const prev = dragStateRef.current;
    if (prev.type !== 'reordering') return;
    const { x } = toSvgCoordsRef.current(clientX, clientY);
    const dropIndex = hitTestParticipantDropIndexRef.current(x);
    const next: ParticipantReorderDragState = { ...prev, currentX: x, dropIndex };
    dragStateRef.current = next;
    setDragState(next);
  }, []);

  /** 结束拖拽：触发 onReorderParticipant（即使 dropIndex === originalIndex 也调用，边界一致） */
  const endDrag = useCallback(() => {
    const prev = dragStateRef.current;
    if (prev.type !== 'reordering') return;
    // 同步更新 ref，防止同步重复调用 endDrag 触发两次 onReorderParticipant
    dragStateRef.current = { type: 'idle' };
    onReorderParticipantRef.current(prev.participantId, prev.originalIndex, prev.dropIndex);
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 取消拖拽：回到 idle，不触发 onReorderParticipant */
  const cancelDrag = useCallback(() => {
    dragStateRef.current = { type: 'idle' };
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 开始排序拖拽：转换坐标 → 切换 reordering 状态 → 注册 window 监听器 */
  const startParticipantReorder = useCallback(
    (
      participantId: string,
      participantIndex: number,
      clientX: number,
      clientY: number,
    ) => {
      // 防御性：清除可能残留的旧监听器，避免重复 start 导致监听器泄漏
      removeWindowListeners();

      const { x } = toSvgCoordsRef.current(clientX, clientY);
      const next: ParticipantReorderDragState = {
        type: 'reordering',
        participantId,
        originalIndex: participantIndex,
        currentX: x,
        // 初始 dropIndex = originalIndex（startParticipantReorder 不调用 hitTestParticipantDropIndex）
        dropIndex: participantIndex,
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
    startParticipantReorder,
    updateDragPosition,
    endDrag,
    cancelDrag,
  };
}
