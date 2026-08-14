/**
 * MessageEditor — 时序图消息属性编辑面板
 *
 * 单一职责：编辑消息的 from/to/文本/箭头类型/激活/停用/create/destroy
 *
 * B4.2 补全：
 *   - 新增 create/destroy checkbox（互斥约束：不能同时为 true）
 *     * 单一数据源 = SequenceMessage.create/destroy
 *     * 语义：此消息触发 target 参与者的创建/销毁
 *     * 序列化：create 前缀 `create `，destroy 前缀 `destroy `
 *   - activate/deactivate 互斥约束（勾选一个自动取消另一个）
 *
 * SequenceCanvasState 解耦（B2 修订）：
 *   - props 从 MermaidEdge 改为 SequenceMessage（单一数据源）
 *   - 字段映射：data.label→label、data.messageType→messageType、data.activate→activate、
 *     data.deactivate→deactivate、data.create→create、data.destroy→destroy、
 *     data.sequence→sequence、source→from、target→to
 *   - participants 参数类型为 SequenceParticipant[]
 */
import { memo } from 'react';
import type {
  SequenceMessage,
  SequenceArrowType,
  SequenceParticipant,
} from '@mermaid2aichat/serializer';

export interface MessageEditorProps {
  /** 当前编辑的消息 */
  message: SequenceMessage;
  /** 可用的参与者列表 */
  participants: SequenceParticipant[];
  /** 更新 data 字段回调 */
  onUpdate: (data: Partial<SequenceMessage>) => void;
  /** 更新 from 字段回调 */
  onUpdateSource: (source: string) => void;
  /** 更新 to 字段回调 */
  onUpdateTarget: (target: string) => void;
}

/** 箭头类型选项（对齐 SequenceArrowType，29 项完整版） */
const ARROW_TYPE_OPTIONS: { value: SequenceArrowType; label: string }[] = [
  { value: 'solid-arrow', label: '实线箭头 (->>)' },
  { value: 'dotted-arrow', label: '虚线箭头 (-->>) ' },
  { value: 'solid-open', label: '实线开口 (->)' },
  { value: 'dotted-open', label: '虚线开口 (-->)' },
  { value: 'solid-cross', label: '实线十字 (-x)' },
  { value: 'dotted-cross', label: '虚线十字 (--x)' },
  { value: 'solid-point', label: '实线圆点 (-))' },
  { value: 'dotted-point', label: '虚线圆点 (--))' },
  { value: 'bidirectional-solid', label: '双向实线 (<<->>)' },
  { value: 'bidirectional-dotted', label: '双向虚线 (<<-->>) ' },
  { value: 'solid-top', label: '实线顶部 (-|\\)' },
  { value: 'solid-bottom', label: '实线底部 (-|/)' },
  { value: 'stick-top', label: '实线顶部细线 (-\\\\)' },
  { value: 'stick-bottom', label: '实线底部细线 (-/\\)' },
  { value: 'solid-top-dotted', label: '虚线顶部 (--|\\)' },
  { value: 'solid-bottom-dotted', label: '虚线底部 (--|/)' },
  { value: 'stick-top-dotted', label: '虚线顶部细线 (--\\\\)' },
  { value: 'stick-bottom-dotted', label: '虚线底部细线 (--/\\)' },
  { value: 'solid-arrow-top-reverse', label: '反向顶部实心 (/|-)' },
  { value: 'solid-arrow-bottom-reverse', label: '反向底部实心 (\\|-)' },
  { value: 'stick-arrow-top-reverse', label: '反向顶部细线 (/\\-)' },
  { value: 'stick-arrow-bottom-reverse', label: '反向底部细线 (\\\\-)' },
  { value: 'solid-arrow-top-reverse-dotted', label: '反向顶部实心点线 (/|--)' },
  { value: 'solid-arrow-bottom-reverse-dotted', label: '反向底部实心点线 (\\|--)' },
  { value: 'stick-arrow-top-reverse-dotted', label: '反向顶部细线点线 (/\\--)' },
  { value: 'stick-arrow-bottom-reverse-dotted', label: '反向底部细线点线 (\\\\--)' },
  { value: 'central-connection', label: '中心连接 (-->())' },
  { value: 'central-connection-reverse', label: '中心反向连接 (()<--)' },
  { value: 'central-connection-dual', label: '中心双向连接 (()<-->())' },
];

/** 消息编辑面板组件 */
export const MessageEditor = memo(function MessageEditor({
  message,
  participants,
  onUpdate,
  onUpdateSource,
  onUpdateTarget,
}: MessageEditorProps) {
  /** activate/deactivate 互斥：勾选一个自动取消另一个 */
  const handleActivateChange = (checked: boolean) => {
    onUpdate(checked ? { activate: true, deactivate: false } : { activate: false });
  };

  const handleDeactivateChange = (checked: boolean) => {
    onUpdate(checked ? { deactivate: true, activate: false } : { deactivate: false });
  };

  /** create/destroy 互斥：勾选一个自动取消另一个（语义上不能同时创建并销毁） */
  const handleCreateChange = (checked: boolean) => {
    onUpdate(checked ? { create: true, destroy: false } : { create: false });
  };

  const handleDestroyChange = (checked: boolean) => {
    onUpdate(checked ? { destroy: true, create: false } : { destroy: false });
  };

  return (
    <div className="panel-content">
      {/* From */}
      <label className="panel-label">
        From
        <select
          className="panel-select"
          value={message.from}
          onChange={(e) => onUpdateSource(e.target.value)}
        >
          {participants.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>

      {/* To */}
      <label className="panel-label">
        To
        <select
          className="panel-select"
          value={message.to}
          onChange={(e) => onUpdateTarget(e.target.value)}
        >
          {participants.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>

      {/* 消息文本 */}
      <label className="panel-label">
        消息文本
        <input
          className="panel-input"
          type="text"
          value={message.label}
          placeholder="（无消息文本）"
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </label>

      {/* 箭头类型（29 种，含 central-connection 三种） */}
      <label className="panel-label">
        箭头类型
        <select
          className="panel-select"
          value={message.messageType}
          onChange={(e) =>
            onUpdate({ messageType: e.target.value as SequenceArrowType })
          }
        >
          {ARROW_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 激活（+ 后缀） */}
      <label className="panel-label panel-checkbox-row">
        <input
          type="checkbox"
          checked={message.activate === true}
          onChange={(e) => handleActivateChange(e.target.checked)}
        />
        激活目标 (+)
      </label>

      {/* 停用（- 后缀） */}
      <label className="panel-label panel-checkbox-row">
        <input
          type="checkbox"
          checked={message.deactivate === true}
          onChange={(e) => handleDeactivateChange(e.target.checked)}
        />
        停用目标 (-)
      </label>

      {/* 创建参与者（create 前缀；与 destroy 互斥） */}
      <label className="panel-label panel-checkbox-row">
        <input
          type="checkbox"
          checked={message.create === true}
          onChange={(e) => handleCreateChange(e.target.checked)}
        />
        创建目标参与者 (create)
      </label>

      {/* 销毁参与者（destroy 前缀；与 create 互斥） */}
      <label className="panel-label panel-checkbox-row">
        <input
          type="checkbox"
          checked={message.destroy === true}
          onChange={(e) => handleDestroyChange(e.target.checked)}
        />
        销毁目标参与者 (destroy)
      </label>

      <div className="panel-info">
        <span className="info-label">ID:</span>
        <span className="info-value">{message.id}</span>
      </div>
      <div className="panel-info">
        <span className="info-label">顺序:</span>
        <span className="info-value">{message.sequence + 1}</span>
      </div>
    </div>
  );
});
