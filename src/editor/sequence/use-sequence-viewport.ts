/**
 * use-sequence-viewport — 画布平移缩放 hook
 *
 * 单一职责：管理 viewport 状态（{ x, y, zoom }），处理平移/缩放交互
 * 通过 onViewportChange 回调与外部通信，不直接调用 WebSocket
 *
 * 防循环机制（通过 useSyncedViewport 统一管理，对齐 GraphCanvas 模式）：
 *   - prevSyncViewportRef: 记录上次应用的 syncViewport，防止本地回传触发重复 setViewport
 *   - isApplyingRemoteViewport: 守卫标志，远端 setViewport 期间为 true，拦截 onViewportChange
 *   - setTimeout(0) 重置守卫，确保同一事件循环内 onViewportChange 被拦截
 *
 * wheel 事件：useEffect + addEventListener('wheel', handler, { passive: false })
 *   - React onWheel 是 passive，无法 preventDefault，必须用原生 addEventListener
 *   - handler 内部 preventDefault + computeZoomViewport（zoom-to-cursor）
 *
 * 设计文档：docs/design/sequence-editing-mode-upgrade.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Viewport } from '@mermaid2aichat/serializer';
import { computeZoomViewport, screenToViewBox } from './svg-coords';
import { useSyncedViewport } from '../hooks/use-synced-viewport.js';
import type { BoundsData } from './sequence-bounds.js';

/** 默认 viewport */
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export interface UseSequenceViewportOptions {
  /** 远端同步的 viewport（来自 CanvasProps.syncViewport，null 表示无远端同步） */
  syncViewport: Viewport | null;
  /** viewport 变化回调（触发 WS viewport_edit，需被 isApplyingRemoteViewport 守卫） */
  onViewportChange: (viewport: Viewport) => void;
  /** SVG 元素 ref（用于原生 wheel 事件监听 + 坐标转换） */
  svgRef: RefObject<SVGSVGElement | null>;
}

export interface UseSequenceViewportResult {
  /** 当前 viewport */
  viewport: Viewport;
  /** 是否正在拖拽平移（用于设置 cursor: grabbing） */
  isPanning: boolean;
  /** 开始平移（mousedown 空白区域或中键时调用） */
  startPan: (clientX: number, clientY: number) => void;
  /** 更新平移（mousemove 时调用） */
  updatePan: (clientX: number, clientY: number) => void;
  /** 结束平移（mouseup 时调用） */
  endPan: () => void;
  /** 重置 viewport 到默认值 */
  resetViewport: () => void;
  /** 根据 layout.bounds 自适应缩放，使整个时序图居中可见 */
  fitView: (bounds: BoundsData, viewBoxSize: { width: number; height: number }) => void;
}

export function useSequenceViewport(options: UseSequenceViewportOptions): UseSequenceViewportResult {
  const { syncViewport, onViewportChange, svgRef } = options;

  const [viewport, setViewportState] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);

  // viewportRef：同步镜像 viewport，供事件处理器读取最新值
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // 回调用 ref 持有最新值，避免事件监听器闭包过期
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  // 平移状态：记录起点位置（viewBox 坐标起点 + viewport 起点）
  // 注：使用 viewBox 坐标而非屏幕像素，因为 viewport.x/y 是 viewBox 单位
  //     当 SVG width="100%" + preserveAspectRatio 时 scaleFactor 可能≠1
  //     屏幕像素 delta 会导致平移距离错误（过头或迟钝）
  const panStateRef = useRef<{
    startViewBoxX: number;
    startViewBoxY: number;
    startViewportX: number;
    startViewportY: number;
  } | null>(null);

  // 防循环机制（通过 useSyncedViewport 统一管理，对齐 GraphCanvas 模式）
  // applyRemoteViewport: 将远端 viewport 写入 viewportRef + setViewportState（供 useEffect 同步应用）
  // isApplyingRemoteViewport: 守卫 ref，远端 setViewport 期间为 true，applyViewport 内部拦截 onViewportChange
  const { isApplyingRemoteViewport } = useSyncedViewport({
    syncViewport,
    applyRemoteViewport: (vp) => {
      viewportRef.current = vp;
      setViewportState(vp);
    },
  });

  /**
   * 统一 viewport 更新入口：同步 ref + state，可选触发 onViewportChange
   *
   * @param next - 新 viewport
   * @param notify - 是否触发 onViewportChange（被 isApplyingRemoteViewport 守卫拦截）
   */
  const applyViewport = useCallback((next: Viewport, notify: boolean) => {
    viewportRef.current = next;
    setViewportState(next);
    if (notify && !isApplyingRemoteViewport.current) {
      onViewportChangeRef.current(next);
    }
  }, [isApplyingRemoteViewport]);

  /** 开始平移：将屏幕坐标转为 viewBox 坐标后记录起点 + 当前 viewport 起点 */
  const startPan = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (svg === null) return; // 防御：SVG 未挂载时不开始平移
    const current = viewportRef.current;
    const { x: vbX, y: vbY } = screenToViewBox(clientX, clientY, svg);
    panStateRef.current = {
      startViewBoxX: vbX,
      startViewBoxY: vbY,
      startViewportX: current.x,
      startViewportY: current.y,
    };
    setIsPanning(true);
  }, [svgRef]);

  /** 更新平移：当前 viewBox 坐标 - 起点 viewBox 坐标 = viewBox delta，加到起点 viewport */
  const updatePan = useCallback((clientX: number, clientY: number) => {
    const pan = panStateRef.current;
    if (pan === null) return;
    const svg = svgRef.current;
    if (svg === null) return;
    const { x: vbX, y: vbY } = screenToViewBox(clientX, clientY, svg);
    const newX = pan.startViewportX + (vbX - pan.startViewBoxX);
    const newY = pan.startViewportY + (vbY - pan.startViewBoxY);
    const current = viewportRef.current;
    applyViewport({ x: newX, y: newY, zoom: current.zoom }, true);
  }, [svgRef, applyViewport]);

  /** 结束平移：清除 panState */
  const endPan = useCallback(() => {
    panStateRef.current = null;
    setIsPanning(false);
  }, []);

  /** 重置 viewport 到默认值 */
  const resetViewport = useCallback(() => {
    applyViewport(DEFAULT_VIEWPORT, true);
  }, [applyViewport]);

  /** 根据 layout.bounds 自适应缩放，使整个时序图居中可见
   *
   * 算法（设计文档 §调用路径2）：
   *   - boundsW/H = (stop - start) ?? 0
   *   - 空图场景（boundsW<=0 || boundsH<=0）退化为 resetViewport
   *   - zoom = min(vbW*0.9/boundsW, vbH*0.9/boundsH)（留 10% 边距）
   *   - x = vbCenterX - boundsCenterX * zoom
   *   - y = vbCenterY - boundsCenterY * zoom
   *   - applyViewport({ x, y, zoom }, notify=true)
   */
  const fitView = useCallback(
    (bounds: BoundsData, viewBoxSize: { width: number; height: number }) => {
      const boundsStartX = bounds.startx ?? 0;
      const boundsStopX = bounds.stopx ?? 0;
      const boundsStartY = bounds.starty ?? 0;
      const boundsStopY = bounds.stopy ?? 0;
      const boundsW = boundsStopX - boundsStartX;
      const boundsH = boundsStopY - boundsStartY;
      // 空图场景退化为 resetViewport
      if (boundsW <= 0 || boundsH <= 0) {
        applyViewport(DEFAULT_VIEWPORT, true);
        return;
      }
      const vbW = viewBoxSize.width;
      const vbH = viewBoxSize.height;
      // 留 10% 边距，整体可见
      const zoom = Math.min((vbW * 0.9) / boundsW, (vbH * 0.9) / boundsH);
      const boundsCenterX = (boundsStartX + boundsStopX) / 2;
      const boundsCenterY = (boundsStartY + boundsStopY) / 2;
      const vbCenterX = vbW / 2;
      const vbCenterY = vbH / 2;
      const x = vbCenterX - boundsCenterX * zoom;
      const y = vbCenterY - boundsCenterY * zoom;
      applyViewport({ x, y, zoom }, true);
    },
    [applyViewport],
  );

  // syncViewport 远端同步防循环已由 useSyncedViewport 统一管理（见上方 hook 调用）

  // wheel 滚轮缩放（原生 addEventListener，passive: false 才能 preventDefault）
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault(); // 阻止页面滚动
      const current = viewportRef.current;
      const zoomDelta = event.deltaY > 0 ? 0.9 : 1.1;
      // 屏幕坐标 → viewBox 坐标（处理 SVG width/height="100%" 的 scaleFactor）
      // computeZoomViewport 期望 viewBox 坐标，否则 scaleFactor≠1 时 zoom-to-cursor 错位
      const { x: vbX, y: vbY } = screenToViewBox(event.clientX, event.clientY, svg);
      const next = computeZoomViewport(vbX, vbY, current, zoomDelta);
      applyViewport(next, true);
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, [svgRef, applyViewport]);

  return {
    viewport,
    isPanning,
    startPan,
    updatePan,
    endPan,
    resetViewport,
    fitView,
  };
}
