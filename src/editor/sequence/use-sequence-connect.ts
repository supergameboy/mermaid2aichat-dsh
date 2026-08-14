/**
 * use-sequence-connect — 拖拽连线状态 hook
 *
 * 单一职责：管理连线拖拽状态机（idle ↔ connecting），提供 mousedown/mousemove/mouseup 处理器
 * 不直接修改 CanvasState，通过 onCreateMessage 回调通知调用方
 *
 * 坐标转换：hook 内部调用 toSvgCoords 将 clientX/Y 转为 SVG 坐标后存入 dragState
 * 事件监听：startConnectionDrag 注册 window mousemove/mouseup/keydown；
 *          endDrag/cancelDrag 移除监听器
 *
 * 副作用安全设计：
 *   - dragStateRef 同步镜像 dragState，供事件处理器读取最新值（避免 React 异步更新闭包过期）
 *   - 回调函数（onCreateMessage/hitTestParticipant/toSvgCoords）用 ref 持有最新值
 *   - endDrag 在 setDragState 外部调用 onCreateMessage，避免严格模式下 updater 重复执行副作用
 *
 * 设计文档：docs/design/sequence-editing-mode-upgrade.md
 */

import { useCallback, useRef, useState } from 'react';

/** 连线拖拽状态 */
export type ConnectDragState =
  | { type: 'idle' }
  | {
      type: 'connecting';
      sourceId: string;
      sourceX: number;  // SVG 坐标
      sourceY: number;  // SVG 坐标
      currentX: number; // SVG 坐标（鼠标当前位置）
      currentY: number;
    };

export interface UseSequenceConnectOptions {
  /** 创建新消息回调（拖拽连线完成时调用） */
  onCreateMessage: (sourceId: string, targetId: string) => void;
  /** 命中检测：返回 SVG 坐标下的参与者 id，无命中返回 null */
  hitTestParticipant: (svgX: number, svgY: number) => string | null;
  /** 屏幕坐标转 SVG 坐标（由调用方提供，封装 svg-coords.screenToSvg） */
  toSvgCoords: (clientX: number, clientY: number) => { x: number; y: number };
}

export interface UseSequenceConnectResult {
  /** 当前拖拽状态 */
  dragState: ConnectDragState;
  /** 开始连线拖拽（在参与者连接点 mousedown 时调用） */
  startConnectionDrag: (sourceId: string, clientX: number, clientY: number) => void;
  /** 更新拖拽位置（mousemove 时调用） */
  updateDragPosition: (clientX: number, clientY: number) => void;
  /** 结束拖拽（mouseup 时调用，会触发 onCreateMessage 或取消） */
  endDrag: (clientX: number, clientY: number) => void;
  /** 取消拖拽（ESC 键或鼠标离开窗口时调用） */
  cancelDrag: () => void;
}

export function useSequenceConnect(options: UseSequenceConnectOptions): UseSequenceConnectResult {
  const { onCreateMessage, hitTestParticipant, toSvgCoords } = options;

  const [dragState, setDragState] = useState<ConnectDragState>({ type: 'idle' });

  // dragStateRef：同步镜像 dragState，供事件处理器读取最新值
  // 避免在 setDragState functional updater 内部调用副作用（onCreateMessage）
  // React 严格模式下 updater 会被调用两次，导致副作用重复执行
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // 回调函数用 ref 持有最新值，避免 window 事件监听器闭包过期
  const onCreateMessageRef = useRef(onCreateMessage);
  const hitTestParticipantRef = useRef(hitTestParticipant);
  const toSvgCoordsRef = useRef(toSvgCoords);
  onCreateMessageRef.current = onCreateMessage;
  hitTestParticipantRef.current = hitTestParticipant;
  toSvgCoordsRef.current = toSvgCoords;

  // window 事件处理器引用（用于 removeEventListener）
  const mousemoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseupHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
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

  /** 更新拖拽位置（仅 connecting 状态生效） */
  const updateDragPosition = useCallback((clientX: number, clientY: number) => {
    const prev = dragStateRef.current;
    if (prev.type !== 'connecting') return;
    const { x, y } = toSvgCoordsRef.current(clientX, clientY);
    const next: ConnectDragState = { ...prev, currentX: x, currentY: y };
    dragStateRef.current = next;
    setDragState(next);
  }, []);

  /** 结束拖拽：命中参与者则触发 onCreateMessage，否则取消 */
  const endDrag = useCallback((clientX: number, clientY: number) => {
    const prev = dragStateRef.current;
    if (prev.type !== 'connecting') return;
    // 同步更新 ref，防止同步重复调用 endDrag 触发两次 onCreateMessage
    dragStateRef.current = { type: 'idle' };

    const { x, y } = toSvgCoordsRef.current(clientX, clientY);
    const targetId = hitTestParticipantRef.current(x, y);
    if (targetId !== null) {
      onCreateMessageRef.current(prev.sourceId, targetId);
    }
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 取消拖拽：回到 idle，不触发 onCreateMessage */
  const cancelDrag = useCallback(() => {
    dragStateRef.current = { type: 'idle' };
    setDragState({ type: 'idle' });
    removeWindowListeners();
  }, [removeWindowListeners]);

  /** 开始连线拖拽：转换坐标 → 切换 connecting 状态 → 注册 window 监听器 */
  const startConnectionDrag = useCallback((sourceId: string, clientX: number, clientY: number) => {
    // 防御性：清除可能残留的旧监听器，避免重复 start 导致监听器泄漏
    removeWindowListeners();

    const { x, y } = toSvgCoordsRef.current(clientX, clientY);
    const next: ConnectDragState = {
      type: 'connecting',
      sourceId,
      sourceX: x,
      sourceY: y,
      currentX: x,
      currentY: y,
    };
    dragStateRef.current = next;
    setDragState(next);

    const mousemoveHandler = (e: MouseEvent) => {
      updateDragPosition(e.clientX, e.clientY);
    };
    const mouseupHandler = (e: MouseEvent) => {
      endDrag(e.clientX, e.clientY);
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
  }, [removeWindowListeners, updateDragPosition, endDrag, cancelDrag]);

  return {
    dragState,
    startConnectionDrag,
    updateDragPosition,
    endDrag,
    cancelDrag,
  };
}
