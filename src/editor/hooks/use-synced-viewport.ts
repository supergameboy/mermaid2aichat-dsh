/**
 * useSyncedViewport — 统一 viewport 远端同步防循环逻辑
 *
 * 单一职责：封装 GraphCanvas（内联）与 use-sequence-viewport（已 hook 化）共用的
 * viewport 远端同步防循环机制
 *
 * 防循环机制：
 *   - prevSyncViewportRef: 记录上次应用的 syncViewport，防止本地回传触发重复 setViewport
 *   - isApplyingRemoteViewport: 守卫标志，远端 setViewport 期间为 true，拦截 onViewportChange
 *   - setTimeout(0) 重置守卫，确保同一事件循环内 onViewportChange 被拦截
 *
 * 设计依据：消除 graph-canvas 内联散落与 sequence hook 化的不对称（单一数据源）
 *
 * 模块边界：仅引用 @mermaid2aichat/serializer + react，不引用 DOM/MCP/WS。✅
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Viewport } from '@mermaid2aichat/serializer';

export interface UseSyncedViewportOptions {
  /** 远端同步的 viewport（来自 CanvasProps.syncViewport，null 表示无远端同步） */
  syncViewport: Viewport | null;
  /**
   * 将远端 viewport 应用到渲染层
   * - GraphCanvas: reactFlow.setViewport(viewport)
   * - SequenceCanvas: setViewportState(viewport) + viewportRef.current = viewport
   */
  applyRemoteViewport: (viewport: Viewport) => void;
}

export interface UseSyncedViewportResult {
  /**
   * 本地变更守卫
   * 本地 onMove/applyViewport 调用前判断：if (isApplyingRemoteViewport.current) return;
   */
  isApplyingRemoteViewport: RefObject<boolean>;
}

/**
 * 统一 viewport 远端同步防循环逻辑
 *
 * @param options.syncViewport - 远端同步的 viewport（null 表示无远端同步）
 * @param options.applyRemoteViewport - 将远端 viewport 应用到渲染层的回调
 * @returns isApplyingRemoteViewport - 本地变更守卫 ref
 *
 * 内部行为：
 *   1. syncViewport === null → 跳过
 *   2. syncViewport 与 prevSyncViewportRef 值相同 → 跳过（防止本地回传循环）
 *   3. 更新 prevSyncViewportRef + 开启守卫 + applyRemoteViewport
 *   4. setTimeout(0) 重置守卫（确保同一事件循环内 onViewportChange 被拦截）
 */
export function useSyncedViewport(options: UseSyncedViewportOptions): UseSyncedViewportResult {
  const { syncViewport, applyRemoteViewport } = options;

  // 防循环机制
  const prevSyncViewportRef = useRef<Viewport | null>(null);
  const isApplyingRemoteViewport = useRef(false);

  // applyRemoteViewport 可能随渲染变化，用 ref 持有最新值
  const applyRemoteViewportRef = useRef(applyRemoteViewport);
  applyRemoteViewportRef.current = applyRemoteViewport;

  useEffect(() => {
    if (syncViewport === null) return;

    // 防止本地回传触发的重复 setViewport：
    // onMove → onViewportChange → sendViewportEdit → store.setViewportSync
    // → syncViewport 变化 → setViewport → onMove（循环）
    // 如果新值与上次应用的值相同，跳过 setViewport
    const prev = prevSyncViewportRef.current;
    if (
      prev !== null &&
      prev.x === syncViewport.x &&
      prev.y === syncViewport.y &&
      prev.zoom === syncViewport.zoom
    ) {
      return;
    }

    prevSyncViewportRef.current = { ...syncViewport };
    isApplyingRemoteViewport.current = true;
    applyRemoteViewportRef.current(syncViewport);
    // setTimeout(0) 确保同一事件循环内 onViewportChange 被守卫拦截
    setTimeout(() => {
      isApplyingRemoteViewport.current = false;
    }, 0);
  }, [syncViewport]);

  return { isApplyingRemoteViewport };
}
