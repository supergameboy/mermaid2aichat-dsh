/**
 * Sequence AST 逆向映射器 — SequenceCanvasState → SequenceAST
 *
 * 单一职责：将 SequenceCanvasState 重建为 SequenceAST
 * 为 B3 渲染层的 bounds 算法提供输入
 *
 * 数据流:
 *   SequenceCanvasState → mapCanvasStateToAst(canvas) → SequenceAST → B3 bounds 计算
 *
 * 与 mapAstToCanvasState 的对称关系:
 *   mapAstToCanvasState: SequenceAST → SequenceCanvasState（解析层，B1 已完成）
 *   mapCanvasStateToAst: SequenceCanvasState → SequenceAST（渲染层入口，B2 新增）
 *
 * 字段派生（单一数据源：SequenceCanvasState）:
 *   - actors: canvas.participants → actors Map（按顺序构建 prevActor/nextActor 双向链表）
 *   - messages: canvas.messages + canvas.blocks + canvas.notes + block.midBranches → messages[]（事件排序策略）
 *   - notes: canvas.notes → notes[]
 *   - boxes: canvas.boxes → boxes[]（同时建立 actor.box 引用）
 *   - createdActors/destroyedActors: 遍历 canvas.messages，从 message.create/destroy 派生
 *   - sequenceNumbersEnabled: canvas.autonumber
 *   - accTitle/accDescr: canvas.accTitle/accDescription
 *
 * messages 数组顺序重建（与正向映射等价）:
 *   - 收集所有事件（普通消息、Note、块开始、块结束、中间分支）
 *   - 按 sequence + priority 排序:
 *       priority 0: 块结束（end 最先，确保与下一块 start 不嵌套）
 *       priority 1: 中间分支（else/and/option，在块开始之前，因为子块可能在 else 分支内开始）
 *       priority 2: 块开始
 *       priority 3: Note
 *       priority 4: 普通消息
 *   - AUTONUMBER 消息插入到 messages 数组开头（如果 canvas.autonumber === true）
 *
 * B4.1 修复:
 *   - 移除 BLOCK_TYPE_TO_*_LINETYPE 中的 'autonumber'（SequenceBlockType 已移除 'autonumber'）
 *   - buildNoteMessage/buildNote 使用 participantIds[0]/participantIds（P2-2 修复：移除废弃字段）
 *   - buildBox 使用 boxInfo.wrap ?? false（B4.1 新增 wrap 字段）
 *   - buildBlockStartMessage 处理 rect 块的 color 字段（B4.1 独立 color 字段）
 *   - 新增 buildBlockMidMessage 生成中间分支信号（B4.1 新增 midBranches 字段）
 *   - 事件构建新增 mid-branch 事件（B4.1 序列化中间分支）
 *   - 优先级系统扩展：0/1/2 → 0/1/2/3/4 以正确处理 mid-branch 与 block start 的同 seq 排序
 *
 * 限制（不在 B4.1 范围）:
 *   - 不重建 ACTIVE_START/ACTIVE_END 消息 — deactivate 信息在 message 中保留
 */
import type {
  SequenceCanvasState,
  SequenceMessage,
  SequenceParticipant,
  SequenceBlockType,
  SequenceBlockInfo,
  SequenceBlockMidBranch,
  SequenceBoxInfo,
  SequenceNoteInfo,
} from '../../types.js';
import type { SequenceAST } from '../../ast/sequence-ast.js';
import type { Actor, Box, Message, Note } from './types.js';
import {
  LINETYPE,
  PLACEMENT,
  LINETYPE_TO_ARROW_TYPE,
} from './constants.js';

// ============================================================
// 反向映射表
// ============================================================

/**
 * SequenceArrowType → LINETYPE 反向映射
 *
 * 从 LINETYPE_TO_ARROW_TYPE 反转构建，避免硬编码重复
 */
const ARROW_TYPE_TO_LINETYPE: Readonly<Record<string, number>> = (() => {
  const result: Record<string, number> = {};
  for (const [linetypeStr, arrowType] of Object.entries(LINETYPE_TO_ARROW_TYPE)) {
    result[arrowType as string] = Number(linetypeStr);
  }
  return result;
})();

/**
 * SequenceBlockType → 块开始 LINETYPE 映射
 *
 * B4.1 修复：移除 'autonumber'（SequenceBlockType 已移除 'autonumber'，autonumber 是 metadata 级开关）
 */
const BLOCK_TYPE_TO_START_LINETYPE: Readonly<Record<SequenceBlockType, number>> = {
  loop: LINETYPE.LOOP_START,
  alt: LINETYPE.ALT_START,
  opt: LINETYPE.OPT_START,
  par: LINETYPE.PAR_START,
  'par-over': LINETYPE.PAR_OVER_START,
  critical: LINETYPE.CRITICAL_START,
  break: LINETYPE.BREAK_START,
  rect: LINETYPE.RECT_START,
};

/**
 * SequenceBlockType → 块结束 LINETYPE 映射
 *
 * par-over 的 end 复用 PAR_END（对齐正向映射 LINETYPE_TO_BLOCK_TYPE）
 * B4.1 修复：移除 'autonumber'（SequenceBlockType 已移除 'autonumber'）
 */
const BLOCK_TYPE_TO_END_LINETYPE: Readonly<Record<SequenceBlockType, number>> = {
  loop: LINETYPE.LOOP_END,
  alt: LINETYPE.ALT_END,
  opt: LINETYPE.OPT_END,
  par: LINETYPE.PAR_END,
  'par-over': LINETYPE.PAR_END,
  critical: LINETYPE.CRITICAL_END,
  break: LINETYPE.BREAK_END,
  rect: LINETYPE.RECT_END,
};

/**
 * SequenceBlockMidBranch.type → 中间分支 LINETYPE 映射
 *
 * B4.1 新增：中间分支（else/and/option）信号类型
 *   - 'else'   → ALT_ELSE（alt 块的中间分支）
 *   - 'and'    → PAR_AND（par/par-over 块的中间分支）
 *   - 'option' → CRITICAL_OPTION（critical 块的中间分支）
 */
const MID_TYPE_TO_LINETYPE: Readonly<Record<SequenceBlockMidBranch['type'], number>> = {
  'else': LINETYPE.ALT_ELSE,
  'and': LINETYPE.PAR_AND,
  'option': LINETYPE.CRITICAL_OPTION,
};

/**
 * Note position → PLACEMENT 映射
 *
 * 类型说明：PLACEMENT 常量是 number，但 Message.placement/Note.placement 类型是 string
 * （对齐官方 mermaid 类型定义，jison 运行时赋值为 number）
 * 此处使用 `as unknown as string` 类型断言绕过 TypeScript 检查，保持与正向映射一致
 * （正向映射时 jison 也将 number 赋值给 string 类型的 placement 字段）
 */
const POSITION_TO_PLACEMENT: Readonly<Record<'left' | 'right' | 'over', string>> = {
  left: PLACEMENT.LEFTOF as unknown as string,
  right: PLACEMENT.RIGHTOF as unknown as string,
  over: PLACEMENT.OVER as unknown as string,
};

// ============================================================
// 内部类型
// ============================================================

/**
 * 事件插入策略（用于 messages 数组顺序重建）
 *
 * 与正向映射 mapAstToCanvasState 的 sequence 语义等价：
 *   - 普通消息（canvas.messages）按 sequence 排序
 *   - Note 按 messageIndex 插入
 *   - 块标记按 startMessage/endMessage 插入
 *   - 中间分支按 midBranch.startMessage 插入（B4.1 新增）
 *
 * B4.1 优先级扩展（0/1/2 → 0/1/2/3/4）:
 *   - priority 0: 块结束（end 最先，确保与下一块 start 不嵌套）
 *   - priority 1: 中间分支（else/and/option，在块开始之前，因为子块可能在 else 分支内开始）
 *   - priority 2: 块开始
 *   - priority 3: Note
 *   - priority 4: 普通消息
 */
interface InsertionEvent {
  /** 消息序号（对应正向映射的 sequence） */
  seq: number;
  /** 同 seq 时的优先级（0=块结束, 1=中间分支, 2=块开始, 3=Note, 4=普通消息） */
  priority: number;
  /** 要插入的 Message */
  message: Message;
  /** 关联的 message（如果是普通消息事件，用于 createdActors/destroyedActors 派生） */
  sequenceMessage?: SequenceMessage;
}

// ============================================================
// 构建辅助函数
// ============================================================

/**
 * 从 SequenceParticipant 构建 Actor
 *
 * 按 participants 顺序构建 prevActor/nextActor 双向链表
 * box 通过 canvas.boxes.actorKeys 单一数据源查找
 */
function buildActorFromParticipant(
  participant: SequenceParticipant,
  box: Box | undefined,
  prevActor: string | undefined,
): Actor {
  const label = participant.label || participant.id;
  return {
    name: label,
    description: label,
    wrap: participant.wrap ?? false,
    type: participant.actorType,
    box,
    prevActor,
    nextActor: undefined,
    links: participant.links ?? {},
    properties: participant.properties ?? {},
    actorCnt: null,
    rectData: null,
    // UI 创建的 participant（explicitlyDeclared undefined）视为显式声明
    explicitlyDeclared: participant.explicitlyDeclared ?? true,
  };
}

/**
 * 从 SequenceMessage 构建 Message（普通消息）
 *
 * messageType 必须存在且合法（P2-6 修复：程序错误不可包容）
 * LINETYPE 通过 ARROW_TYPE_TO_LINETYPE 反向映射
 */
function buildMessageFromSequenceMessage(seqMsg: SequenceMessage, id: number): Message {
  const messageType = seqMsg.messageType;
  const linetype = ARROW_TYPE_TO_LINETYPE[messageType];
  if (linetype === undefined) {
    throw new Error(`mapCanvasStateToAst: unknown messageType "${messageType}" (message id: ${seqMsg.id})`);
  }
  return {
    id,
    from: seqMsg.from,
    to: seqMsg.to,
    message: seqMsg.label,
    wrap: false,
    type: linetype,
    activate: seqMsg.activate === true ? true : undefined,
    // `-` 简写停用信号：从 message.deactivate 派生（对齐 `+` activate 派生路径）
    // 官方 jison +/- 语义：`+` 激活 TARGET(msg.to)，`-` 停用 SOURCE(msg.from)
    deactivate: seqMsg.deactivate === true ? true : undefined,
    // 独立 activate/deactivate 语句的 actor 列表（`activate X` / `deactivate X` 语法）
    ...(seqMsg.activateActors ? { activateActors: [...seqMsg.activateActors] } : {}),
    ...(seqMsg.deactivateActors ? { deactivateActors: [...seqMsg.deactivateActors] } : {}),
    // 设计取舍（P2-2，v7 循环验证记录）：centralConnection 字段硬编码为 0
    //   SequenceCanvasState 层面双向映射对称（messageType 完整还原），
    //   仅 AST 层面 msg.type 字段从 signalType 变为 CENTRAL_CONNECTION_*。
    //   B3 渲染层应使用 `msg.type === LINETYPE.CENTRAL_CONNECTION_*` 判定，不依赖 centralConnection 字段。
    //   原始 jison 输出：{type: signalType(如 6), centralConnection: 59}
    //   mapCanvasStateToAst 输出：{type: 59, centralConnection: 0}
    //   round-trip 后 mapAstToCanvasState 仍正确派生 messageType（msg.type=59 直接映射为 'central-connection'）
    centralConnection: 0,
  };
}

/**
 * 从 SequenceNoteInfo 构建 Note Message（插入到 messages 数组）
 *
 * B4.1 P2-2 修复：使用 participantIds[0] 作为 from/to（移除废弃的 participantId 字段）
 * Note 消息的 from/to 都是 primary participant（对齐正向映射 addNote 的行为）
 */
function buildNoteMessage(note: SequenceNoteInfo, id: number): Message {
  // B4.1 P2-2: 使用 participantIds[0] 作为 primary participant
  //   - 单参与者时 participantIds[0] 是该参与者
  //   - 多参与者时 participantIds[0] 是第一个参与者（对齐 sequence-db.ts addNote 的 primaryActorId 逻辑）
  const primaryParticipant = note.participantIds[0];
  return {
    id,
    from: primaryParticipant,
    to: primaryParticipant,
    message: note.label,
    wrap: false,
    type: LINETYPE.NOTE,
    placement: POSITION_TO_PLACEMENT[note.position],
  };
}

/**
 * 从 SequenceNoteInfo 构建 Note（ast.notes 元素）
 *
 * B4.1 P3-4 修复：使用 participantIds 数组（移除废弃的 actor: { actor: string } 单参与者字段）
 */
function buildNote(note: SequenceNoteInfo): Note {
  return {
    // B4.1 P3-4: 统一使用 participantIds 数组（无论单/多参与者）
    participantIds: [...note.participantIds],
    placement: POSITION_TO_PLACEMENT[note.position],
    message: note.label,
    wrap: false,
  };
}

/**
 * 从 SequenceBoxInfo 构建 Box
 *
 * actorKeys 是单一数据源（不从 ParticipantEditor 派生）
 * B4.1 修复：使用 boxInfo.wrap ?? false（B4.1 新增 wrap 字段）
 */
function buildBox(boxInfo: SequenceBoxInfo): Box {
  return {
    name: boxInfo.name,
    fill: boxInfo.color,
    // B4.1: 使用 boxInfo.wrap ?? false（B4.1 新增 wrap 字段，开发阶段不需要向后兼容）
    wrap: boxInfo.wrap ?? false,
    actorKeys: [...boxInfo.actorKeys],
  };
}

/**
 * 从 SequenceBlockInfo 构建块开始 Message
 *
 * B4.1 修复：rect 块颜色独立存储到 Message.color 字段（不再复用 message 字段）
 *   - rect 块的 message 为空字符串（颜色用 color 字段）
 *   - 其他块类型的 message 为 block.label
 */
function buildBlockStartMessage(block: SequenceBlockInfo, id: number): Message {
  const type = BLOCK_TYPE_TO_START_LINETYPE[block.type];
  const baseMessage: Message = {
    id,
    // rect 块的 label 为空字符串（颜色用 color 字段），其他块类型使用 block.label
    message: block.type === 'rect' ? '' : block.label,
    wrap: false,
    type,
  };
  // B4.1: rect 块颜色独立存储到 Message.color 字段
  if (block.type === 'rect' && block.color !== undefined) {
    return { ...baseMessage, color: block.color };
  }
  return baseMessage;
}

/**
 * 从 SequenceBlockInfo 构建块结束 Message
 */
function buildBlockEndMessage(block: SequenceBlockInfo, id: number): Message {
  return {
    id,
    message: '',
    wrap: false,
    type: BLOCK_TYPE_TO_END_LINETYPE[block.type],
  };
}

/**
 * 从 SequenceBlockMidBranch 构建中间分支 Message
 *
 * B4.1 新增：中间分支（else/and/option）信号
 *   - 'else'   → ALT_ELSE 信号（alt 块的中间分支）
 *   - 'and'    → PAR_AND 信号（par/par-over 块的中间分支）
 *   - 'option' → CRITICAL_OPTION 信号（critical 块的中间分支）
 *
 * 中间分支信号是对齐正向映射的 mapAstToCanvasState 中 isBlockMid 处理逻辑：
 *   - 正向映射时，中间分支信号被消费，更新 BlockFrame.currentBranch
 *   - 反向映射时，从 block.midBranches 重建中间分支信号
 */
function buildBlockMidMessage(branch: SequenceBlockMidBranch, id: number): Message {
  const linetype = MID_TYPE_TO_LINETYPE[branch.type];
  return {
    id,
    message: branch.label,
    wrap: false,
    type: linetype,
  };
}

/**
 * 构建 AUTONUMBER Message
 *
 * 对齐正向映射：message 字段是 { start, step, visible } 对象
 */
function buildAutonumberMessage(id: number): Message {
  return {
    id,
    message: { start: 1, step: 1, visible: true },
    wrap: false,
    type: LINETYPE.AUTONUMBER,
  };
}

// ============================================================
// 主函数：mapCanvasStateToAst
// ============================================================

/**
 * 将 SequenceCanvasState 重建为 SequenceAST
 *
 * @param canvas - SequenceCanvasState（diagramType === 'sequenceDiagram'）
 * @returns SequenceAST（供 B3 bounds 算法消费）
 *
 * 字段派生逻辑（单一数据源：SequenceCanvasState）:
 *   - actors: canvas.participants → actors Map（id → Actor），按顺序构建双向链表
 *   - messages: canvas.messages + canvas.blocks + canvas.notes + block.midBranches → messages[]（事件排序策略）
 *   - notes: canvas.notes → notes[]
 *   - boxes: canvas.boxes → boxes[]（基于 actorKeys 单一数据源）
 *   - createdActors: 遍历 canvas.messages，对 message.create === true 的，将 message.to 加入 Map（值为 message.sequence）
 *   - destroyedActors: 遍历 canvas.messages，对 message.destroy === true 的，将 message.to 加入 Map（值为 message.sequence）
 *   - sequenceNumbersEnabled: canvas.autonumber === true
 *   - accTitle/accDescr: canvas.accTitle/accDescription
 */
export function mapCanvasStateToAst(canvas: SequenceCanvasState): SequenceAST {
  // ============================================================
  // 1. 构建 boxes[]
  // ============================================================
  const boxes: Box[] = [];
  for (const boxInfo of canvas.boxes) {
    boxes.push(buildBox(boxInfo));
  }

  // ============================================================
  // 2. 构建 actors Map（按 participants 顺序，建立双向链表）
  // ============================================================
  const actors = new Map<string, Actor>();
  let prevActorId: string | undefined;

  for (const participant of canvas.participants) {
    // 查找 actor 所属的 box（通过 actorKeys 单一数据源）
    let actorBox: Box | undefined;
    for (const box of boxes) {
      if (box.actorKeys.includes(participant.id)) {
        actorBox = box;
        break;
      }
    }

    const actor = buildActorFromParticipant(participant, actorBox, prevActorId);
    actors.set(participant.id, actor);

    // 设置前一个 actor 的 nextActor
    if (prevActorId !== undefined) {
      const prevActor = actors.get(prevActorId);
      if (prevActor) {
        prevActor.nextActor = participant.id;
      }
    }

    prevActorId = participant.id;
  }

  // ============================================================
  // 3. 构建 messages[]（事件排序策略）
  //
  // B4.1 修复：新增中间分支事件（else/and/option），扩展优先级系统
  // ============================================================
  const events: InsertionEvent[] = [];

  // 3.1 普通消息事件（来自 canvas.messages，priority=4）
  for (const seqMsg of canvas.messages) {
    events.push({
      seq: seqMsg.sequence,
      priority: 4,
      message: buildMessageFromSequenceMessage(seqMsg, 0), // id 后续重新分配
      sequenceMessage: seqMsg,
    });
  }

  // 3.2 Note 事件（来自 canvas.notes，priority=3）
  for (const note of canvas.notes) {
    events.push({
      seq: note.messageIndex,
      priority: 3,
      message: buildNoteMessage(note, 0),
    });
  }

  // 3.3 块标记事件（来自 canvas.blocks）
  //   - 块开始：priority=2
  //   - 块结束：priority=0
  //   - 中间分支：priority=1（B4.1 新增）
  for (const block of canvas.blocks) {
    events.push({
      seq: block.startMessage,
      priority: 2,
      message: buildBlockStartMessage(block, 0),
    });
    events.push({
      seq: block.endMessage,
      priority: 0,
      message: buildBlockEndMessage(block, 0),
    });

    // B4.1 新增：中间分支事件（else/and/option）
    //   - 中间分支 seq = midBranch.startMessage（第一条属于该分支的消息 sequence）
    //   - priority=1（在块开始之前，因为子块可能在 else 分支内开始）
    for (const branch of block.midBranches) {
      events.push({
        seq: branch.startMessage,
        priority: 1,
        message: buildBlockMidMessage(branch, 0),
      });
    }
  }

  // 3.4 排序事件（按 seq 升序，同 seq 时按 priority 升序）
  events.sort((a, b) => {
    if (a.seq !== b.seq) return a.seq - b.seq;
    return a.priority - b.priority;
  });

  // 3.5 构建 messages 数组，记录 message → msgIndex 映射
  const messages: Message[] = [];

  // AUTONUMBER 消息（如果启用，插入到开头）
  if (canvas.autonumber === true) {
    messages.push(buildAutonumberMessage(0));
  }

  // 按事件顺序构建 messages
  const sequenceMessageToMsgIndex = new Map<string, number>();
  for (const event of events) {
    const msgIndex = messages.length;
    messages.push({ ...event.message, id: msgIndex });
    if (event.sequenceMessage !== undefined) {
      sequenceMessageToMsgIndex.set(event.sequenceMessage.id, msgIndex);
    }
  }

  // ============================================================
  // 4. 构建 notes[]
  // ============================================================
  const astNotes: Note[] = canvas.notes.map(buildNote);

  // ============================================================
  // 5. 派生 createdActors/destroyedActors（从 message.create/destroy）
  //
  // 对称正向映射（mapAstToCanvasState 第 3.5 节）:
  //   - 正向: ast.createdActors[actorId] = msgIndex → message.create = true（仅当 message.to === actorId）
  //   - 反向: message.create === true → createdActors[message.to] = msgIndex
  // ============================================================
  const createdActors = new Map<string, number>();
  const destroyedActors = new Map<string, number>();

  for (const seqMsg of canvas.messages) {
    const msgIndex = sequenceMessageToMsgIndex.get(seqMsg.id);
    if (msgIndex !== undefined) {
      if (seqMsg.create === true) {
        createdActors.set(seqMsg.to, msgIndex);
      }
      if (seqMsg.destroy === true) {
        destroyedActors.set(seqMsg.to, msgIndex);
      }
    }
  }

  // ============================================================
  // 6. 构建 SequenceAST
  // ============================================================
  return {
    actors,
    messages,
    notes: astNotes,
    boxes,
    createdActors,
    destroyedActors,
    sequenceNumbersEnabled: canvas.autonumber === true,
    accTitle: canvas.accTitle,
    accDescr: canvas.accDescription,
  };
}
