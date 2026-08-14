/**
 * use-sequence-box-assign — 参与者拖入/拖出 Box hook（B4.4）
 *
 * 单一职责：管理参与者拖入/拖出 Box 的状态机（idle ↔ assigning），
 *   提供 mousedown/mousemove/mouseup/Escape 处理器
 * 不直接修改 CanvasState，通过 onAssignBox 回调通知调用方
 *
 * 与 use-sequence-reorder 的差异：
 *   - 拖拽目标是参与者到 Box 的归属关系（participantId + targetBoxId|null）
 *   - 落点计算是二维命中检测（基于 box.bounds 矩形判断）
 *   - dropBoxId = null 表示拖出所有 Box（解绑）
 *
 * 坐标转换：hook 内部调用 toSvgCoords 将 clientX/Y 转为 SVG 坐标后存入 dragState
 * hitTestBox 接受 SVG X/Y 坐标，返回 box.id 或 null（不在任何 box 内）
 *
 * 副作用安全设计（对齐 use-sequence-reorder）：
 *   - dragStateRef 同步镜像 dragState，避免严格模式下 updater 重复执行副作用
 *   - 回调函数用 ref 持有最新值，避免 window 事件监听器闭包过期
 *
 * 设计文档：docs/design/fractal-design-20260701-sequence重新设计/fractal-design-20260701-sequence重新设计-B4-L2-子功能细化.md
 */

import { useCallback, useRef, useState } from 'react';

/** Box 分配拖拽状态 */
export type BoxAssignDragState =
  | { type: 'idle' }
  | {
      type: 'assigning';
      participantId: string;
      currentX: number; // SVG 坐标
      currentY: number; // SVG 坐标
      /** 当前悬停的 box.id；null 表示不在任何 box 内（拖出） */
      hoverBoxId: string | null;
    };

export interface UseSequenceBoxAssignOptions {
  /** 分配 Box 回调（拖拽完成时调用；targetBoxId=null 表示拖出所有 box） */
  onAssignBox: (participantId: string, targetBoxId: string | null) => void;
  /** 命中检测：返回 SVG 坐标下的 box.id，无命中返回 null */
  hitTestBox: (svgX: number, svgY: number) => string | null;
  /** 屏幕坐标转 SVG 坐标 */
  toSvgCoords: (clientX: number, clientY: number) => { x: number; y: number };
}

export interface UseSequenceBoxAssignResult {
  /** 当前拖拽状态 */
  dragState: BoxAssignDragState;
  /** 开始 Box 分配拖拽（在参与者 grip 手柄 mousedown 时调用，与 reorder 共用 grip） */
  startBoxAssign: (
    participantId: string,
    clientX: number,
    clientY: number,
  ) => void;
  /** 更新拖拽位置（mousemove 时调用） */
  updateDragPosition: (clientX: number, clientY: number) => void;
  /** 结束拖拽（mouseup 时调用，会触发 onAssignBox） */
  endDrag: () => void;
  /** 取消拖拽（ESC 键或鼠标离开窗口时调用） */
  cancelDrag: () => void;
}

export function useSequenceBoxAssign(
  options: UseSequenceBoxAssignOptions,
): UseSequenceBoxAssignResult {
  const { onAssignBox, hitTestBox, toSvgCoords } = options;

  const [dragState, setDragState] = useState<BoxAssignDragState>({ type: 'idle' });

  // dragStateRef：同步镜像 dragState，供事件处理器读取最新值
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // 回调函数用 ref 持有最新值，避免 window 事件监听器闭包过期
  const onAssignBoxRef = useRef(onAssignBox);
  const hitTestBoxRef = useRef(hitTestBox);
  const toSvgCoordsRef = useRef(toSvgCoords);
  onAssignBoxRef.current = onAssignBox;
  hitTestBoxRef.current = hitTestBox;
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

  /** 更新拖拽位置（仅 assigning 状态生效）：转换坐标 + hitTestBox 更新 hoverBoxId */
  const updateDragPosition = useCallback((clientX: number, clientY: number) => {
    const prev = dragStateRef.current;
    if (prev.type !== 'assigning') return;
    const { x, y } = toSvgCoordsRef.current(clientX, clientY);
    const hoverBoxId = hitTestBoxRef.current(x, y);
    const next: BoxAssignDragState = { ...prev, currentX: x, currentY: y, hoverBoxId };
    dragStateRef.current = next;
    setDragState(next);
  }, []);

  /** 结束拖拽：触发 onAssignBox（即使 hoverBoxId 与原归属相同也调用，边界一致） */
  const endDrag = useCallback(() => {
    const prev = dragStateRef.current;
    if (prev.type !== 'assigning') return;
    // 同步更新 ref，防止同步重复调用 endDrag 触发两次 onAssignBox
    dragStateRef.current = { type: 'idle' };
    onAssignBoxRef.current(prev.participantId, prev.hoverBoxId);
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 取消拖拽：回到 idle，不触发 onAssignBox */
  const cancelDrag = useCallback(() => {
    dragStateRef.current = { type: 'idle' };
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 开始 Box 分配拖拽：转换坐标 → 切换 assigning 状态 → 注册 window 监听器 */
  const startBoxAssign = useCallback(
    (participantId: string, clientX: number, clientY: number) => {
      // 防御性：清除可能残留的旧监听器，避免重复 start 导致监听器泄漏
      removeWindowListeners();

      const { x, y } = toSvgCoordsRef.current(clientX, clientY);
      // 初始 hoverBoxId = 当前 mouse 位置所在的 box（开始拖拽即命中检测）
      const initialHoverBoxId = hitTestBoxRef.current(x, y);
      const next: BoxAssignDragState = {
        type: 'assigning',
        participantId,
        currentX: x,
        currentY: y,
        hoverBoxId: initialHoverBoxId,
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
    startBoxAssign,
    updateDragPosition,
    endDrag,
    cancelDrag,
  };
}
