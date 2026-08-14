/**
 * drag-drop-index — 拖拽落点计算纯函数（B4.4）
 *
 * 单一职责：基于 B3 LayoutResult 计算各类拖拽操作的落点索引
 * 不持有状态、不产生副作用，纯函数易于测试
 *
 * 5 类 SequenceDragType 共用此模块：
 *   - participant-reorder    横向：基于 layout.participantLayouts[i].bounds.x
 *   - message-reorder        纵向：基于 layout.messageLayouts[i].bounds.y
 *   - note-reorder           纵向：基于 layout.noteLayouts[i].bounds.y
 *   - block-resize-top/bottom 纵向：基于消息索引（resize 到最近消息边界）
 *   - participant-to-box     二维：基于 layout.boxLayouts[i].bounds 命中检测
 *
 * 设计文档：docs/design/fractal-design-20260701-sequence重新设计/fractal-design-20260701-sequence重新设计-B4-L2-子功能细化.md
 */

import type { LayoutResult } from './sequence-layout.js';

/** 拖拽类型（5 类，落点计算分发依据） */
export type SequenceDragType =
  | 'participant-reorder' // 参与者横向排序
  | 'message-reorder' // 消息纵向排序
  | 'note-reorder' // Note 纵向排序
  | 'block-resize-top' // Block 上边缘 resize
  | 'block-resize-bottom' // Block 下边缘 resize
  | 'participant-to-box'; // 参与者拖入/拖出 Box

/** 二维坐标（SVG 坐标系） */
export interface DragPoint {
  x: number;
  y: number;
}

/** 矩形 bounds（与 LayoutRect 结构一致，独立定义避免循环依赖） */
export interface DragBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 判断点是否在 bounds 矩形内（含边界） */
export function isPointInBounds(point: DragPoint, bounds: DragBounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/**
 * 基于 Y 坐标计算消息索引（用于 block resize）
 *
 * 落点规则：
 *   - 鼠标 Y < 第 i 条消息 bounds 中点 → 落点为 i（即第 i 条消息之前）
 *   - 鼠标 Y ≥ 最后一条消息 bounds 中点 → 落点为 N（即所有消息之后）
 *
 * 返回值范围：[0, N]
 */
export function calculateMessageIndexFromY(y: number, layout: LayoutResult): number {
  for (let i = 0; i < layout.messageLayouts.length; i++) {
    const bounds = layout.messageLayouts[i].bounds;
    if (y < bounds.y + bounds.height / 2) return i;
  }
  return layout.messageLayouts.length;
}

/**
 * 落点计算主入口（5 类 DragType 分发）
 *
 * 返回值语义：
 *   - number: 落点索引（participant/message/note = 0..N，block-resize = 消息索引）
 *   - null: 仅 participant-to-box 不命中任何 box 时返回（表示拖出所有 box）
 *
 * 不命中场景的处理由调用方决定（如不调用 onReorderXxx 回调）
 */
export function calculateDropIndex(
  type: SequenceDragType,
  point: DragPoint,
  layout: LayoutResult,
): number | null {
  switch (type) {
    case 'participant-reorder': {
      // 横向：基于 layout.participantLayouts[i].bounds.x 范围判断
      for (let i = 0; i < layout.participantLayouts.length; i++) {
        const bounds = layout.participantLayouts[i].bounds;
        if (point.x < bounds.x + bounds.width / 2) return i;
      }
      return layout.participantLayouts.length;
    }
    case 'message-reorder': {
      // 纵向：基于 layout.messageLayouts[i].bounds.y 范围判断
      for (let i = 0; i < layout.messageLayouts.length; i++) {
        const bounds = layout.messageLayouts[i].bounds;
        if (point.y < bounds.y + bounds.height / 2) return i;
      }
      return layout.messageLayouts.length;
    }
    case 'note-reorder': {
      // 纵向：基于 layout.noteLayouts[i].bounds.y 范围判断
      for (let i = 0; i < layout.noteLayouts.length; i++) {
        const bounds = layout.noteLayouts[i].bounds;
        if (point.y < bounds.y + bounds.height / 2) return i;
      }
      return layout.noteLayouts.length;
    }
    case 'block-resize-top':
    case 'block-resize-bottom': {
      // 基于消息索引计算（resize 到最近消息边界）
      return calculateMessageIndexFromY(point.y, layout);
    }
    case 'participant-to-box': {
      // 判断 point 是否在某个 box.bounds 内
      for (const box of layout.boxLayouts) {
        if (isPointInBounds(point, box.bounds)) return box.boxIndex;
      }
      return null; // 不在任何 box 内
    }
  }
}
