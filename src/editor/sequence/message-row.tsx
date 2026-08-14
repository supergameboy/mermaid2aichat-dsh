/**
 * MessageRow — 时序图消息行（参与者之间的箭头）
 *
 * 单一职责：渲染单条消息箭头，含线型、箭头头、标签
 *
 * B3.3 改造（v9）：
 *   - props 从固定坐标（sourceX/targetX/y）改为 layout prop（MessageLayoutItem）+ fromActorLayout + toActorLayout
 *   - sourceX = fromActorLayout.centerX，targetX = toActorLayout.centerX
 *   - y = layout.bounds.y（消息 Y 坐标，来自 layout）
 *   - messageType = layout.messageType（单一数据源 = layout，不再从 edge.data.messageType 读）
 *   - 保留原 getLineStyle helper 函数
 *   - 保留原自调用（source === target）半圆路径逻辑，用 fromActorLayout/toActorLayout 的 centerX
 *   - 激活指示（+/-）不在标签渲染，由 ActivationBar 组件独立渲染生命线上的激活条
 *   - 保留原序号显示从 message.data.sequence 读取
 *
 * B3.4 改造（v10）：
 *   - 删除 getArrowMarkerId（仅返回 marker-end，无法表达反向箭头 marker-start）
 *   - 改用 getArrowMarkerConfig（返回 { markerEnd?, markerStart? }，覆盖 29 种 SequenceArrowType）
 *   - line/path 元素同时设置 markerStart + markerEnd（双向箭头 / 反向箭头 marker-start 生效）
 *   - marker 定义集中在 arrow-markers.tsx（9 个 marker，策略B 多类型共用）
 *
 * B3.4 改造（v11）：central-connection 圆形节点接入
 *   - 派生 centralType = deriveCentralConnectionType(messageType)（3 种 central-connection → forward/reverse/dual，其他 26 种 → null）
 *   - 普通 + 自环两分支在 text 后条件渲染 <CentralConnectionRender/>（z-index 顶层覆盖）
 *   - central-connection 三种类型仍渲染消息线（不渲染 marker）+ 标签
 *   - central-connection 自环走 isSelfCall 半圆分支（与普通自环一致）
 */
import { memo } from 'react';
import type { SequenceMessage, SequenceArrowType } from '@mermaid2aichat/serializer';
import type { ActorLayout, MessageLayoutItem } from './sequence-layout.js';
import { getArrowMarkerConfig } from './arrow-markers.js';
import { CentralConnectionRender, deriveCentralConnectionType } from './central-connection-render.js';

interface MessageRowProps {
  /** 消息数据（业务数据源，用于 id/label/sequence） */
  message: SequenceMessage;
  /** 消息布局项（来自 layout.messageLayouts[i]，含 bounds/sequence/messageType） */
  layout: MessageLayoutItem;
  /** 起始参与者布局（含 centerX） */
  fromActorLayout: ActorLayout;
  /** 目标参与者布局（含 centerX） */
  toActorLayout: ActorLayout;
  /** 是否被选中 */
  selected: boolean;
  /** 是否显示序号（autonumber，来自 canvas.autonumber） */
  showSequenceNumber: boolean;
  /** 点击选中回调 */
  onSelect: (id: string) => void;
  /** 双击编辑回调 */
  onEdit: (id: string) => void;
  /** 排序手柄 mousedown 回调（拖拽排序发起，由画布层提供；undefined 时不渲染 grip） */
  onReorderStart?: (
    messageId: string,
    messageIndex: number,
    clientX: number,
    clientY: number,
  ) => void;
  /** B4.3：右键菜单回调（undefined 时不响应右键） */
  onContextMenu?: (event: React.MouseEvent) => void;
}

/** 根据 SequenceArrowType 推导线型 */
function getLineStyle(messageType: SequenceArrowType): {
  strokeDasharray: string;
  strokeWidth: number;
} {
  // 含 'dotted' 关键字的为虚线
  if (messageType.includes('dotted')) {
    return { strokeDasharray: '5,4', strokeWidth: 1.5 };
  }
  return { strokeDasharray: 'none', strokeWidth: 1.5 };
}

/** Grip 手柄配置：undefined 表示不渲染（onReorderStart 未提供时） */
interface GripHandle {
  messageId: string;
  messageIndex: number; // = message.sequence（sortedMessages 索引）
  onMousedown: (
    messageId: string,
    messageIndex: number,
    clientX: number,
    clientY: number,
  ) => void;
}

/** grip 6 个圆点相对中心的偏移（2 列 × 3 行） */
const GRIP_DOTS: ReadonlyArray<readonly [number, number]> = [
  [-3, -4],
  [-3, 0],
  [-3, 4],
  [3, -4],
  [3, 0],
  [3, 4],
];

/**
 * 渲染拖拽排序 grip 手柄（消息左侧 ⋮⋮ 图标）
 *
 * 位置：消息最左端左侧 18 SVG 单位（视觉一致性，与 source/target 方向无关）
 * 命中区域：16×16 透明矩形（扩大拖拽触发范围，避免圆点过小难以点击）
 * mousedown：stopPropagation 阻止冒泡到 onClick（避免触发选中）
 */
function renderGripHandle(
  sourceX: number,
  targetX: number,
  y: number,
  selected: boolean,
  gripHandle: GripHandle | undefined,
) {
  if (gripHandle === undefined) return null;
  const gripX = Math.min(sourceX, targetX) - 18;
  const gripY = y;
  const fill = selected ? 'var(--seq-grip-selected-fill)' : 'var(--seq-grip-fill)';
  return (
    <g
      style={{ cursor: 'grab' }}
      onMouseDown={(e) => {
        e.stopPropagation(); // 阻止冒泡到父 <g> 的 onClick（避免触发选中）
        gripHandle.onMousedown(
          gripHandle.messageId,
          gripHandle.messageIndex,
          e.clientX,
          e.clientY,
        );
      }}
    >
      {/* 不可见命中区域（扩大拖拽触发范围） */}
      <rect x={gripX - 8} y={gripY - 8} width={16} height={16} fill="transparent" />
      {/* 可见的 6 个圆点（⋮⋮ 图标） */}
      {GRIP_DOTS.map(([dx, dy], i) => (
        <circle key={i} cx={gripX + dx} cy={gripY + dy} r={1.5} style={{ fill }} />
      ))}
    </g>
  );
}

/** 消息行组件 */
export const MessageRow = memo(function MessageRow({
  message,
  layout,
  fromActorLayout,
  toActorLayout,
  selected,
  showSequenceNumber,
  onSelect,
  onEdit,
  onReorderStart,
  onContextMenu,
}: MessageRowProps) {
  // 单一数据源：messageType 从 layout 取（不再从 edge.data.messageType 读）
  const messageType: SequenceArrowType = layout.messageType;
  const lineStyle = getLineStyle(messageType);
  // B3.4：改用 getArrowMarkerConfig（支持 markerStart 反向箭头 + markerEnd 正向箭头）
  const markerConfig = getArrowMarkerConfig(messageType);
  // B3.4 v11：派生 central-connection 渲染类型（3 种 → forward/reverse/dual，其他 → null）
  const centralType = deriveCentralConnectionType(messageType);
  const stroke = selected ? 'var(--seq-message-selected-stroke)' : 'var(--seq-message-stroke)';

  const sourceX = fromActorLayout.centerX;
  const targetX = toActorLayout.centerX;
  const y = layout.bounds.y;

  // 处理自调用（source === target）：绘制半圆
  const isSelfCall = sourceX === targetX;
  const label = message.label;
  const sequence = message.sequence;

  // 拖拽排序 grip 配置：仅当 onReorderStart 提供时渲染（messageIndex = sortedMessages 索引 = message.sequence）
  const gripHandle: GripHandle | undefined =
    onReorderStart === undefined
      ? undefined
      : {
          messageId: message.id,
          messageIndex: sequence,
          onMousedown: onReorderStart,
        };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(message.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(message.id);
  };

  // 标签位置：箭头中点上方
  const labelX = (sourceX + targetX) / 2;
  const labelY = y - 8;

  // 激活指示（+/-）不在标签渲染：激活由 ActivationBar 组件独立渲染生命线上的实心矩形
  // 原 +/- 后缀是 B3.3 之前的错误实现，对齐官方渲染（官方不显示 +/-，激活通过 ActivationBar 表达）
  const displayLabel = label;
  const sequenceLabel = showSequenceNumber ? `${sequence + 1}. ` : '';

  if (isSelfCall) {
    // 自调用：绘制半圆路径
    const radius = 20;
    const path = `M ${sourceX} ${y} C ${sourceX + radius * 2} ${y - radius}, ${sourceX + radius * 2} ${y + radius}, ${sourceX} ${y + radius}`;
    return (
      <g
        style={{ cursor: 'pointer' }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={onContextMenu}
      >
        {renderGripHandle(sourceX, targetX, y, selected, gripHandle)}
        <path
          d={path}
          fill="none"
          style={{ stroke }}
          strokeWidth={lineStyle.strokeWidth}
          strokeDasharray={lineStyle.strokeDasharray}
          markerStart={markerConfig.markerStart}
          markerEnd={markerConfig.markerEnd}
        />
        <text
          x={sourceX + 30}
          y={y - 4}
          fontSize={12}
          style={{ fill: selected ? 'var(--seq-message-selected-text)' : 'var(--seq-message-text)' }}
        >
          {sequenceLabel}{displayLabel}
        </text>
        {centralType && (
          <CentralConnectionRender
            fromX={sourceX}
            toX={targetX}
            y={y}
            type={centralType}
            selected={selected}
          />
        )}
      </g>
    );
  }

  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu}
    >
      {renderGripHandle(sourceX, targetX, y, selected, gripHandle)}
      <line
        x1={sourceX}
        y1={y}
        x2={targetX}
        y2={y}
        style={{ stroke }}
        strokeWidth={selected ? lineStyle.strokeWidth + 0.5 : lineStyle.strokeWidth}
        strokeDasharray={lineStyle.strokeDasharray}
        markerStart={markerConfig.markerStart}
        markerEnd={markerConfig.markerEnd}
      />
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        fontSize={12}
        style={{ fill: selected ? 'var(--seq-message-selected-text)' : 'var(--seq-message-text)' }}
      >
        {sequenceLabel}{displayLabel}
      </text>
      {centralType && (
        <CentralConnectionRender
          fromX={sourceX}
          toX={targetX}
          y={y}
          type={centralType}
          selected={selected}
        />
      )}
    </g>
  );
});
