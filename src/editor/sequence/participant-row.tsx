/**
 * ParticipantRow — 时序图参与者行（顶部参与者框 + 底部镜像 actor）
 *
 * 单一职责：渲染单个参与者框，包含图标和名称，支持点击选中和双击编辑
 *
 * B3.3 改造（v9）：
 *   - props 从固定坐标（x）改为 layout prop（ActorLayout，含 x/y/width/height/centerX/centerY/bottomY）
 *   - mirrorActors=true 时渲染顶部 + 底部镜像两组（P1-4 修复对齐官方 drawActors(isFooter=true)）
 *   - 删除原 PARTICIPANT_TOP_Y/PARTICIPANT_HEIGHT/PARTICIPANT_WIDTH 常量依赖（已被 layout 取代）
 */
import { memo } from 'react';
import type { SequenceParticipant, SequenceActorType } from '@mermaid2aichat/serializer';
import type { ActorLayout } from './sequence-layout.js';

interface ParticipantRowProps {
  /** 参与者数据（业务数据源，用于 label/actorType） */
  participant: SequenceParticipant;
  /** 参与者布局（来自 layout.actors.get(id)，含 x/y/width/height/centerX/centerY/bottomY） */
  layout: ActorLayout;
  /** 是否渲染底部镜像 actor（来自 SEQUENCE_LAYOUT_CONFIG.mirrorActors） */
  mirrorActors: boolean;
  /** 是否被选中 */
  selected: boolean;
  /** 点击选中回调 */
  onSelect: (id: string) => void;
  /** 双击编辑回调 */
  onEdit: (id: string) => void;
  /** 连接点 mousedown 回调（拖拽连线发起，仅顶部 actor 渲染连接点；undefined 时不渲染） */
  onConnectionStart?: (participantId: string, clientX: number, clientY: number) => void;
  /** B4.3：右键菜单回调（undefined 时不响应右键） */
  onContextMenu?: (event: React.MouseEvent) => void;
  /** B4.4：排序拖拽 mousedown 回调（横向重排发起，仅顶部 actor 渲染 grip；undefined 时不渲染）
   *  grip 默认触发横向排序，按住 Shift 键触发 onBoxAssignStart（Box 分配模式） */
  onReorderStart?: (
    participantId: string,
    participantIndex: number,
    clientX: number,
    clientY: number,
  ) => void;
  /** B4.4：参与者在 participants 数组中的索引（onReorderStart 第二参数） */
  participantIndex?: number;
  /** B4.4：Box 分配拖拽 mousedown 回调（Alt+拖拽 grip 触发，拖入/拖出 Box）
   *  与 onReorderStart 共用 grip，通过 e.altKey 切换模式 */
  onBoxAssignStart?: (participantId: string, clientX: number, clientY: number) => void;
}

/** 参与者类型 → 图标映射（覆盖 8 种 SequenceActorType） */
const PARTICIPANT_ICONS: Record<SequenceActorType, string> = {
  actor: '👤',
  participant: '📦',
  boundary: '🎯',
  collections: '📚',
  control: '🎮',
  database: '🗄️',
  entity: '🔷',
  queue: '📥',
};

/** 连接点配置：undefined 表示不渲染连接点（底部 mirror） */
interface ConnectionHandle {
  participantId: string;
  onMousedown: (participantId: string, clientX: number, clientY: number) => void;
}

/** B4.4：排序 grip 配置：undefined 表示不渲染（onReorderStart 未提供或底部 mirror）
 *  grip 同时承载两种拖拽模式：默认横向排序，Shift+拖拽触发 Box 分配 */
interface ReorderGrip {
  participantId: string;
  participantIndex: number;
  onReorderMousedown: (
    participantId: string,
    participantIndex: number,
    clientX: number,
    clientY: number,
  ) => void;
  /** Shift+拖拽触发的 Box 分配回调；undefined 表示不支持 Box 分配 */
  onBoxAssignMousedown?: (
    participantId: string,
    clientX: number,
    clientY: number,
  ) => void;
}

/** grip 6 个圆点相对中心的偏移（2 列 × 3 行，与 message-row 一致） */
const GRIP_DOTS: ReadonlyArray<readonly [number, number]> = [
  [-3, -4],
  [-3, 0],
  [-3, 4],
  [3, -4],
  [3, 0],
  [3, 4],
];

/**
 * B4.4：渲染参与者排序 grip 手柄（参与者框左侧 ⋮⋮ 图标）
 *
 * 位置：参与者框左侧 12 SVG 单位（横向排序触发区）
 * 命中区域：16×16 透明矩形
 * mousedown：stopPropagation 阻止冒泡到 onClick（避免触发选中）
 *
 * 模式切换（B4.4 Box 分配决策点，用户确认 Shift+拖拽触发）：
 *   - 默认（无修饰键）：触发 onReorderMousedown（参与者横向排序）
 *   - Shift+拖拽：触发 onBoxAssignMousedown（参与者拖入/拖出 Box）
 *   - 鼠标悬停显示 <title> tooltip 说明操作方式
 */
function renderReorderGrip(
  layout: ActorLayout,
  selected: boolean,
  grip: ReorderGrip | undefined,
) {
  if (grip === undefined) return null;
  const gripX = layout.x - 12;
  const gripY = layout.y + layout.height / 2;
  const fill = selected ? 'var(--seq-grip-selected-fill)' : 'var(--seq-grip-fill)';
  // tooltip 文本：根据是否支持 Box 分配显示不同帮助说明
  const tooltipText = grip.onBoxAssignMousedown !== undefined
    ? '拖拽：横向排序参与者 | Shift+拖拽：拖入/拖出 Box'
    : '拖拽：横向排序参与者';
  return (
    <g
      style={{ cursor: 'ew-resize' }}
      onMouseDown={(e) => {
        e.stopPropagation(); // 阻止冒泡到父 <g> 的 onClick（避免触发选中）
        // B4.4 决策点：Shift+拖拽触发 Box 分配，默认触发参与者排序
        if (e.shiftKey && grip.onBoxAssignMousedown !== undefined) {
          grip.onBoxAssignMousedown(grip.participantId, e.clientX, e.clientY);
        } else {
          grip.onReorderMousedown(
            grip.participantId,
            grip.participantIndex,
            e.clientX,
            e.clientY,
          );
        }
      }}
    >
      {/* B4.4 UI 帮助说明：原生 tooltip 提示拖拽模式（hover 显示） */}
      <title>{tooltipText}</title>
      {/* 不可见命中区域（扩大拖拽触发范围） */}
      <rect x={gripX - 8} y={gripY - 8} width={16} height={16} fill="transparent" />
      {/* 可见的 6 个圆点（⋮⋮ 图标） */}
      {GRIP_DOTS.map(([dx, dy], i) => (
        <circle key={i} cx={gripX + dx} cy={gripY + dy} r={1.5} style={{ fill }} />
      ))}
    </g>
  );
}

/** 单个参与者框渲染（顶部 actor 与底部镜像共用） */
function renderActorBox(
  layout: ActorLayout,
  label: string | undefined,
  icon: string,
  selected: boolean,
  onClick: (e: React.MouseEvent) => void,
  onDoubleClick: (e: React.MouseEvent) => void,
  onContextMenu: ((e: React.MouseEvent) => void) | undefined,
  translateY: number,
  /** 连接点配置：undefined 表示不渲染连接点（底部 mirror） */
  connectionHandle?: ConnectionHandle,
) {
  return (
    <g
      transform={`translate(${layout.x}, ${translateY})`}
      style={{ cursor: 'pointer' }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <rect
        x={0}
        y={0}
        width={layout.width}
        height={layout.height}
        rx={4}
        ry={4}
        style={{
          fill: selected
            ? 'var(--seq-participant-selected-fill)'
            : 'var(--seq-participant-fill)',
          stroke: selected
            ? 'var(--seq-participant-selected-stroke)'
            : 'var(--seq-participant-stroke)',
        }}
        strokeWidth={selected ? 2 : 1}
      />
      <text
        x={layout.width / 2}
        y={layout.height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={14}
        fontWeight={600}
        style={{ fill: 'var(--seq-participant-text)' }}
      >
        <tspan dx={-8}>{icon}</tspan>
        <tspan dx={4}>{label}</tspan>
      </text>
      {/* 连接点 circle（仅顶部 actor 渲染，P2-9 修复：底部 mirror 传 undefined） */}
      {connectionHandle && (
        <circle
          cx={layout.width / 2}
          cy={0}
          r={6}
          style={{
            fill: 'var(--seq-connection-point-fill)',
            stroke: 'var(--seq-connection-point-stroke)',
            cursor: 'crosshair',
          }}
          strokeWidth={2}
          onMouseDown={(e) => {
            e.stopPropagation(); // 阻止冒泡到 onClick
            connectionHandle.onMousedown(
              connectionHandle.participantId,
              e.clientX,
              e.clientY,
            );
          }}
        />
      )}
    </g>
  );
}

/** 参与者框组件 */
export const ParticipantRow = memo(function ParticipantRow({
  participant,
  layout,
  mirrorActors,
  selected,
  onSelect,
  onEdit,
  onConnectionStart,
  onContextMenu,
  onReorderStart,
  participantIndex = 0,
  onBoxAssignStart,
}: ParticipantRowProps) {
  const icon = PARTICIPANT_ICONS[participant.actorType] ?? '📦';
  const label = participant.label;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(participant.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(participant.id);
  };

  // B4.3：右键事件 — 调用方负责 preventDefault/stopPropagation，子组件透传 event
  const handleContextMenu = onContextMenu !== undefined
    ? (e: React.MouseEvent) => onContextMenu(e)
    : undefined;

  // 连接点配置：仅顶部 actor 渲染（onConnectionStart 由画布提供；底部 mirror 不渲染）
  const topConnectionHandle =
    onConnectionStart === undefined
      ? undefined
      : { participantId: participant.id, onMousedown: onConnectionStart };

  // B4.4：排序 grip 配置：仅顶部 actor 渲染（底部 mirror 不渲染）
  // grip 同时承载两种模式：默认横向排序（onReorderMousedown）、Alt+拖拽 Box 分配（onBoxAssignMousedown）
  const topReorderGrip =
    onReorderStart === undefined
      ? undefined
      : {
          participantId: participant.id,
          participantIndex,
          onReorderMousedown: onReorderStart,
          ...(onBoxAssignStart !== undefined ? { onBoxAssignMousedown: onBoxAssignStart } : {}),
        };

  return (
    <>
      {/* B4.4：排序 grip（顶部 actor 左侧，独立渲染使用绝对坐标） */}
      {renderReorderGrip(layout, selected, topReorderGrip)}
      {/* 顶部 actor：传入 connectionHandle（若启用拖拽连线） */}
      {renderActorBox(
        layout,
        label,
        icon,
        selected,
        handleClick,
        handleDoubleClick,
        handleContextMenu,
        layout.y,
        topConnectionHandle,
      )}
      {/* 底部镜像 actor（仅 mirrorActors=true 时渲染，对齐官方 drawActors(isFooter=true)；不渲染连接点/grip） */}
      {mirrorActors &&
        renderActorBox(
          layout,
          label,
          icon,
          selected,
          handleClick,
          handleDoubleClick,
          handleContextMenu,
          layout.bottomY,
        )}
    </>
  );
});
