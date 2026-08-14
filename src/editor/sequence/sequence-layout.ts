/**
 * Sequence 布局计算入口 — calculateLayout
 *
 * 单一职责：调用 SequenceBounds + 文本测量，产出 LayoutResult 供渲染层消费
 *
 * 数据流:
 *   SequenceAST → calculateLayout(ast) → LayoutResult
 *
 * 7 阶段实现（对齐官方 mermaid sequenceRenderer draw() 阶段 1-7）：
 *   阶段1：计算 actor 动态宽度（measureTextWidth 测量每个 actor 文本）
 *   阶段2：构建 actor 横向布局（layoutActors，含 mirror actors bottomY）
 *   阶段3：遍历 messages，累积 bounds（processMessages）
 *   阶段4：mirror actors bounds 更新（mirrorActors=true 时）
 *   阶段5：获取最终 bounds（bounds.getBounds()）
 *   阶段6：计算画布尺寸（configureSvgSize 等价，单一数据源）
 *   阶段7：构建有序布局数组（participantLayouts/messageLayouts/noteLayouts/boxLayouts）
 *
 * 来源：B3 设计文档 calculateLayout 接口签名 + B3-L2 子功能细化
 */
import type { SequenceAST } from '@mermaid2aichat/serializer';
import type { Actor, Message, Note, Box } from '@mermaid2aichat/serializer';
import { LINETYPE, LINETYPE_TO_ARROW_TYPE, PLACEMENT } from '@mermaid2aichat/serializer';
import type { SequenceArrowType } from '@mermaid2aichat/serializer';
import { SequenceBounds } from './sequence-bounds.js';
import type { BoundsData, BoundsModels, ActorModel, MessageModel, NoteModel, BoxModel } from './sequence-bounds.js';
import { SEQUENCE_LAYOUT_CONFIG } from './sequence-constants.js';
import { measureTextWidth } from './text-measure.js';

// ============================================================
// 布局结果类型定义
// ============================================================

/** 单个元素的布局矩形（拖拽落点计算用） */
export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 参与者布局项（有序，按 participants 顺序） */
export interface ParticipantLayoutItem {
  participantId: string;
  bounds: LayoutRect;
}

/**
 * 消息布局项（有序，按 sequence 顺序）
 *
 * v7 修订（B3.2 实现期设计偏差）：移除 edgeId 字段
 * 原设计 edgeId: string 对应 edge.id，但 ast.messages 不保留原始 edge.id
 * （mapCanvasStateToAst 中 Message.id 被重新分配为 msgIndex: number）
 * sequence 字段已可唯一标识 edge（通过 edge.data.sequence 查找），edgeId 冗余违反单一数据源
 */
export interface MessageLayoutItem {
  /**
   * 消息序号（renderIndex，跳过非渲染信号后的索引）
   * P3-NEW-5 一致性：renderIndex === CanvasState.edges 数组索引 === edge.data.sequence
   * B4.4 拖拽落点计算通过此 sequence 字段查找对应 edge（edge.data.sequence）
   */
  sequence: number;
  bounds: LayoutRect;
  /** 消息箭头类型（含 central-connection 三种，用于渲染层派生圆形节点） */
  messageType: SequenceArrowType;
}

/** Note 布局项（有序，按 messageIndex 顺序） */
export interface NoteLayoutItem {
  noteIndex: number;
  bounds: LayoutRect;
}

/** Box 布局项（有序，按 boxes 顺序） */
export interface BoxLayoutItem {
  boxIndex: number;
  bounds: LayoutRect;
}

/**
 * 参与者布局信息（P2-1 修复：补全 bottomY 字段，供 mirror actors 渲染使用）
 */
export interface ActorLayout {
  actorId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  bounds: { x: number; y: number; width: number; height: number };
  /**
   * 底部镜像 actor 顶部 Y 坐标（mirrorActors=true 时由 calculateLayout 阶段4 填入，
   * 对齐官方 sequenceRenderer.ts:1391-1393 drawActors(isFooter=true) 行为；
   * mirrorActors=false 时与 y 相同（无镜像）
   */
  bottomY: number;
}

/** 布局计算结果 */
export interface LayoutResult {
  bounds: BoundsData;
  models: BoundsModels;
  /** 参与者布局 Map（id → ActorLayout，供 ParticipantRow 等组件查询坐标） */
  actors: Map<string, ActorLayout>;
  /** 有序参与者布局数组（P2-NEW-1：供 B4.4 拖拽落点横向计算） */
  participantLayouts: ParticipantLayoutItem[];
  /** 有序消息布局数组（P2-NEW-1：供 B4.4 拖拽落点纵向计算） */
  messageLayouts: MessageLayoutItem[];
  /** 有序 Note 布局数组（P2-NEW-1：供 B4.4 拖拽落点纵向计算） */
  noteLayouts: NoteLayoutItem[];
  /** 有序 Box 布局数组（P2-NEW-1：供 B4.4 拖拽参与者进出 box 判断） */
  boxLayouts: BoxLayoutItem[];
  canvasWidth: number;
  canvasHeight: number;
  viewBox: string;
}

// ============================================================
// 辅助函数：信号类型判断
// ============================================================

/**
 * 判断是否为 NOTE 类型信号（P2-NEW-A 修复）
 * v7 修订：参数名 signalType → linetype（对齐 Message.type 字段语义，type 即 LINETYPE）
 */
function isNoteSignal(linetype: number | undefined): boolean {
  return linetype === LINETYPE.NOTE;
}

/**
 * 判断是否为块标记信号（v7 新增：buildMessageLayouts 跳过块标记用）
 * 块标记包括：LOOP_START/END、ALT_START/ELSE/END、OPT_START/END、PAR_START/AND/END、
 * PAR_OVER_START、CRITICAL_START/OPTION/END、BREAK_START/END、RECT_START/END、AUTONUMBER
 */
function isBlockSignal(linetype: number | undefined): boolean {
  if (linetype === undefined) return false;
  return (
    linetype === LINETYPE.LOOP_START ||
    linetype === LINETYPE.LOOP_END ||
    linetype === LINETYPE.ALT_START ||
    linetype === LINETYPE.ALT_ELSE ||
    linetype === LINETYPE.ALT_END ||
    linetype === LINETYPE.OPT_START ||
    linetype === LINETYPE.OPT_END ||
    linetype === LINETYPE.PAR_START ||
    linetype === LINETYPE.PAR_AND ||
    linetype === LINETYPE.PAR_END ||
    linetype === LINETYPE.PAR_OVER_START ||
    linetype === LINETYPE.CRITICAL_START ||
    linetype === LINETYPE.CRITICAL_OPTION ||
    linetype === LINETYPE.CRITICAL_END ||
    linetype === LINETYPE.BREAK_START ||
    linetype === LINETYPE.BREAK_END ||
    linetype === LINETYPE.RECT_START ||
    linetype === LINETYPE.RECT_END ||
    linetype === LINETYPE.AUTONUMBER
  );
}

/**
 * 判断是否为块开始信号（用于 processMessages 调用 newLoop）
 */
function isBlockStartSignal(linetype: number | undefined): boolean {
  if (linetype === undefined) return false;
  return (
    linetype === LINETYPE.LOOP_START ||
    linetype === LINETYPE.ALT_START ||
    linetype === LINETYPE.OPT_START ||
    linetype === LINETYPE.PAR_START ||
    linetype === LINETYPE.PAR_OVER_START ||
    linetype === LINETYPE.CRITICAL_START ||
    linetype === LINETYPE.BREAK_START ||
    linetype === LINETYPE.RECT_START
  );
}

/**
 * 判断是否为块结束信号（用于 processMessages 调用 endLoop）
 */
function isBlockEndSignal(linetype: number | undefined): boolean {
  if (linetype === undefined) return false;
  return (
    linetype === LINETYPE.LOOP_END ||
    linetype === LINETYPE.ALT_END ||
    linetype === LINETYPE.OPT_END ||
    linetype === LINETYPE.PAR_END ||
    linetype === LINETYPE.CRITICAL_END ||
    linetype === LINETYPE.BREAK_END ||
    linetype === LINETYPE.RECT_END
  );
}

/**
 * 判断是否为块中间分支信号（用于 processMessages 调用 addSectionToLoop）
 */
function isBlockMidSignal(linetype: number | undefined): boolean {
  if (linetype === undefined) return false;
  return (
    linetype === LINETYPE.ALT_ELSE ||
    linetype === LINETYPE.PAR_AND ||
    linetype === LINETYPE.CRITICAL_OPTION
  );
}

// ============================================================
// 阶段1：calculateActorWidths — 计算 actor 动态宽度
// ============================================================

/**
 * 计算 actor 动态宽度（对齐官方 getMaxMessageWidthPerActor）
 *
 * 算法：
 *   1. 每个 actor 的初始宽度 = actor 文本宽度
 *   2. 遍历 messages，对每个普通消息，更新 from/to actor 的最大宽度（取消息文本宽度）
 *   3. actor 最终宽度 = max(actor 文本宽度, 涉及消息最大宽度) + 2*boxTextMargin
 *   4. 不小于 SEQUENCE_LAYOUT_CONFIG.width（最小宽度保障）
 *
 * @returns Map<actorId, width> 每个 actor 的渲染宽度
 */
function calculateActorWidths(
  actors: Map<string, Actor>,
  messages: Message[],
): Map<string, number> {
  const widths = new Map<string, number>();

  // 1. 初始化：每个 actor 的文本宽度（使用 description，渲染显示文本）
  for (const [id, actor] of actors) {
    widths.set(id, measureTextWidth(actor.description));
  }

  // 2. 遍历 messages，更新涉及 actor 的最大宽度
  for (const msg of messages) {
    // 跳过非普通消息（块标记/NOTE/autonumber）
    // P3-NEW-1 修复：删除 ACTIVE_START/ACTIVE_END 判断（mapCanvasStateToAst 不重建这两种消息类型，死代码）
    if (isBlockSignal(msg.type) || isNoteSignal(msg.type)) {
      continue;
    }
    // 普通消息：测量消息文本宽度，更新 from/to actor
    if (typeof msg.message === 'string' && msg.message.length > 0) {
      const msgWidth = measureTextWidth(msg.message);
      if (msg.from) {
        // 程序错误不可包容：msg.from 引用不存在的 actor 是 AST 一致性错误，应抛错
        const cur = widths.get(msg.from);
        if (cur === undefined) {
          throw new Error(`calculateActorWidths: actor "${msg.from}" not found (referenced by message id=${msg.id})`);
        }
        if (msgWidth > cur) widths.set(msg.from, msgWidth);
      }
      if (msg.to) {
        const cur = widths.get(msg.to);
        if (cur === undefined) {
          throw new Error(`calculateActorWidths: actor "${msg.to}" not found (referenced by message id=${msg.id})`);
        }
        if (msgWidth > cur) widths.set(msg.to, msgWidth);
      }
    }
  }

  // 3. 加 padding，不小于默认 width
  const { width: defaultWidth, boxTextMargin } = SEQUENCE_LAYOUT_CONFIG;
  for (const [id, w] of widths) {
    const padded = w + 2 * boxTextMargin;
    widths.set(id, Math.max(padded, defaultWidth));
  }

  return widths;
}

// ============================================================
// 阶段2：layoutActors — 构建 actor 横向布局
// ============================================================

/**
 * 构建 actor 横向布局（对齐官方 addActorRenderingData）
 *
 * 算法：
 *   1. 按 actors 定义顺序遍历
 *   2. 第一个 actor x = diagramMarginX
 *   3. 后续 actor x = 前一个 actor stopx + actorMargin
 *   4. 构建 ActorLayout，更新 bounds（insert actor bounds + bumpVerticalPos）
 *   5. 返回 Map<actorId, ActorLayout>
 */
function layoutActors(
  actors: Map<string, Actor>,
  actorWidths: Map<string, number>,
  bounds: SequenceBounds,
): Map<string, ActorLayout> {
  const { diagramMarginX, actorMargin, height: defaultActorHeight } = SEQUENCE_LAYOUT_CONFIG;
  const result = new Map<string, ActorLayout>();

  let prevStopX: number | undefined;
  for (const [id, actor] of actors) {
    // P2-3 修复：actor.name → actor.description（与 calculateActorWidths 一致，渲染显示文本）
    // P2-4 修复：移除 textHeight 派生公式，对齐官方 drawActor 使用固定 config.height
    //   官方 sequenceRenderer.ts drawActor: rect = { ..., height: config.height }
    //   高度不由文本派生（文本通过 wrap 或截断处理），统一使用 SEQUENCE_LAYOUT_CONFIG.height
    const width = actorWidths.get(id);
    if (width === undefined) {
      // 程序错误不可包容：actorWidths 必须包含所有 actors（由 calculateActorWidths 保证）
      throw new Error(`layoutActors: actor "${id}" not found in actorWidths (calculateActorWidths inconsistency)`);
    }
    // 计算 x 坐标
    const x = prevStopX === undefined ? diagramMarginX : prevStopX + actorMargin;
    const stopx = x + width;
    prevStopX = stopx;

    const height = defaultActorHeight;
    const y = 0;

    // 构建 ActorLayout
    result.set(id, {
      actorId: id,
      x,
      y,
      width,
      height,
      centerX: x + width / 2,
      centerY: y + height / 2,
      bounds: { x, y, width, height },
      bottomY: y, // 初始与 y 相同，阶段4 更新为底部镜像 Y 坐标
    });

    // 更新 bounds：插入 actor 边界
    bounds.insert(x, y, stopx, y + height);
    // 注册 ActorModel 到 models
    bounds.getBounds().models.addActor({
      startx: x,
      starty: y,
      stopx,
      stopy: y + height,
      width,
      height,
      actor: id,
      description: actor.description,
      box: actor.box?.name ?? null,
    });
  }

  // 推进 verticalPos 到 actor 底部 + boxMargin
  const { boxMargin } = SEQUENCE_LAYOUT_CONFIG;
  let maxActorBottom = 0;
  for (const layout of result.values()) {
    maxActorBottom = Math.max(maxActorBottom, layout.y + layout.height);
  }
  bounds.bumpVerticalPos(maxActorBottom + boxMargin);

  return result;
}

// ============================================================
// 阶段2.5：layoutBoxes — 构建 Box 布局（基于已布局的 actor bounds）
// ============================================================

/**
 * 构建 Box 布局（对齐官方 addBoxRenderingData）
 *
 * 算法：
 *   - 对每个 box，基于其 actorKeys 中所有 actor 的 bounds 计算 box bounds
 *   - box.startx = min(actor.startx) - boxTextMargin
 *   - box.stopx = max(actor.stopx) + boxTextMargin
 *   - box.starty = 0（与 actor 同高起始）
 *   - box.stopy = max(actor.stopy)
 *   - 注册 BoxModel 到 models.boxes
 */
function layoutBoxes(
  boxes: Box[],
  actorLayouts: Map<string, ActorLayout>,
  bounds: SequenceBounds,
): void {
  const { boxTextMargin } = SEQUENCE_LAYOUT_CONFIG;
  const { models } = bounds.getBounds();

  for (const box of boxes) {
    // 收集 box 中所有 actor 的 bounds
    // P3 清理（循环验证）：移除 if(layout) fallback，让 desync 显式抛错
    //   box.actorKeys 引用不存在的 actor 是 AST 一致性错误
    const actorBoundsList: { startx: number; stopx: number; starty: number; stopy: number }[] = [];
    for (const actorKey of box.actorKeys) {
      const layout = actorLayouts.get(actorKey);
      if (!layout) {
        throw new Error(
          `layoutBoxes: actor "${actorKey}" not found in actorLayouts (box name="${box.name}")`,
        );
      }
      actorBoundsList.push({
        startx: layout.bounds.x,
        stopx: layout.bounds.x + layout.width,
        starty: layout.bounds.y,
        stopy: layout.bounds.y + layout.height,
      });
    }

    if (actorBoundsList.length === 0) {
      continue;
    }

    const startx = Math.min(...actorBoundsList.map((a) => a.startx)) - boxTextMargin;
    const stopx = Math.max(...actorBoundsList.map((a) => a.stopx)) + boxTextMargin;
    const starty = Math.min(...actorBoundsList.map((a) => a.starty));
    const stopy = Math.max(...actorBoundsList.map((a) => a.stopy));

    // 更新 bounds
    bounds.insert(startx, starty, stopx, stopy);

    // 注册 BoxModel
    models.addBox({
      startx,
      starty,
      stopx,
      stopy,
      fill: box.fill,
      color: box.fill,
      name: box.name,
      actorKeys: box.actorKeys,
    });
  }
}

// ============================================================
// 阶段3：processMessages — 遍历 messages，累积 bounds
// ============================================================

/**
 * 遍历 messages，累积 bounds（对齐官方 draw messages 阶段）
 *
 * 算法：
 *   - 块开始信号 → bounds.newLoop()
 *   - 块结束信号 → bounds.endLoop()
 *   - 块中间信号 → bounds.addSectionToLoop()
 *   - NOTE → drawNote（计算 note bounds，调用 bounds.insert + bumpVerticalPos + models.addNote）
 *   - AUTONUMBER → 跳过
 *   - 普通消息 → drawMessage（计算 message bounds，调用 bounds.insert + bumpVerticalPos + models.addMessage）
 *     * 若 msg.activate === true，则 newActivation（`+` 激活 TARGET = msg.to）
 *     * 若 msg.deactivate === true，则 endActivation（`-` 停用 SOURCE = msg.from）
 *
 * P3-NEW-1 修复（B3.2 边界场景审查）：删除 ACTIVE_START/ACTIVE_END 分支
 *   mapCanvasStateToAst 不重建这两种消息类型，calculateLayout 接收的 ast.messages 不包含
 *   ACTIVE_START/ACTIVE_END，这两个分支是死代码。activation 创建/结束改走 `+`/`-` 简写路径
 *
 * B3 修复（activation +/- 语义对齐官方 jison）：
 *   - `+` 激活 TARGET（msg.to）— 对齐 jison:334 `activeStart actor: $4.actor`（TARGET）
 *     原 bug：使用 msg.from（SOURCE），导致 ActivationBar 渲染在错误的生命线上
 *   - `-` 停用 SOURCE（msg.from）— 对齐 jison:338 `activeEnd actor: $1.actor`（SOURCE）
 *     原 bug：完全不调用 endActivation，stopy 保持占位 0，被阶段4.5 兜底误设为画布底部
 *   - 修复后阶段4.5 兜底仅对"未配对 `+`（无 `-`）"的 activation 生效（对齐 mermaid "activation 延伸到末尾"语义）
 */
function processMessages(
  messages: Message[],
  bounds: SequenceBounds,
  actorLayouts: Map<string, ActorLayout>,
): void {
  const { models } = bounds.getBounds();

  // P2-6 修复：actorsMap 在入口构建一次（避免每次 newActivation 重建 Map）
  // 用于 newActivation 查询 actor 坐标
  const actorsMap = new Map(models.actors.map((a) => [a.actor, a]));

  for (const msg of messages) {
    // AUTONUMBER：跳过
    if (msg.type === LINETYPE.AUTONUMBER) {
      continue;
    }

    // 块开始信号
    if (isBlockStartSignal(msg.type)) {
      const title = typeof msg.message === 'string' ? msg.message : undefined;
      bounds.newLoop({ message: title, wrap: false });
      continue;
    }

    // 块结束信号
    if (isBlockEndSignal(msg.type)) {
      bounds.endLoop();
      continue;
    }

    // 块中间分支信号
    if (isBlockMidSignal(msg.type)) {
      bounds.addSectionToLoop({ message: typeof msg.message === 'string' ? msg.message : undefined });
      continue;
    }

    // P3-NEW-1 修复（B3.2 边界场景审查）：删除 ACTIVE_START/ACTIVE_END 分支
    //   mapCanvasStateToAst 不重建这两种消息类型（注释明确说明），calculateLayout 接收的
    //   ast.messages 不包含 ACTIVE_START/ACTIVE_END，这两个分支是死代码
    //   activation 创建/结束改走 `+`/`-` 简写路径：
    //     `+` → msg.activate=true → newActivation(TARGET=msg.to)
    //     `-` → msg.deactivate=true → endActivation(SOURCE=msg.from)

    // NOTE 信号：drawNote
    if (isNoteSignal(msg.type)) {
      drawNote(msg, actorLayouts, bounds, models);
      continue;
    }

    // 普通消息：drawMessage（drawMessage 内部抛错保证 from/to 非空）
    drawMessage(msg, actorLayouts, bounds, models);

    // `+` 简写激活 TARGET（msg.to）— 对齐官方 jison sequenceDiagram.jison:334
    //   `actor signaltype '+' actor text2 → activeStart actor: $4.actor`（TARGET）
    //   原 bug：使用 msg.from（SOURCE）激活了错误的 actor，导致 ActivationBar 渲染在错误的生命线上
    //   修复：newActivation 接收 from = msg.to（TARGET），actorsMap.get(msg.to) 查找 target 的 actorRect
    //
    // 调用顺序（v10 修复激活条纵向偏移，对齐官方 mermaid sequenceRenderer 渲染语义）：
    //   官方 sequenceRenderer.ts:1145-1165 主循环中 ACTIVE_START 是独立消息类型，
    //   jison 解析 `+` 简写产生 [addMessage, activeStart] 两条消息（jison:332-335），
    //   循环顺序：先处理 addMessage（boundMessage 推进 verticalPos）→ 再处理 activeStart（newActivation）
    //   即 drawMessage → newActivation（与官方一致）
    //
    //   官方 newActivation 使用 starty = verticalPos + 2（verticalPos 是 boundMessage 推进后的值），
    //   官方 boundMessage 推进 42 像素（10 + lineHeight + totalOffset），偏移 = 0 + 2 = 2 像素
    //   我们 drawMessage 推进 55 像素（messageMargin 35 + messageHeight 20），
    //   若直接用 verticalPos + 1 偏移会达 21 像素（与用户报告一致）
    //
    //   修复：绕过 verticalPos 推进量差异，使用 lastMessage.starty + 1 对齐消息线 starty，
    //   接近官方 +2 像素渲染效果（激活条比消息线略低 1 像素）
    if (msg.activate === true) {
      const from = msg.from;
      const to = msg.to;
      if (!from || !to) {
        throw new Error(`processMessages: activate=true but msg.from/to missing (message id=${msg.id})`);
      }
      const lastMessage = models.lastMessage();
      if (!lastMessage) {
        // 程序错误不可包容：activate=true 必有前序 drawMessage 产生 lastMessage
        throw new Error(`processMessages: activate=true but no previous message found (message id=${msg.id})`);
      }
      bounds.newActivation(
        {
          startx: 0, stopx: 0,
          // starty 对齐消息线 starty + 1（接近官方 +2 像素偏移，避免与消息线重合）
          starty: lastMessage.starty + 1,
          stopy: 0,
          message: '', type: msg.type ?? 0, wrap: false,
          width: 0, height: 0, fromBounds: 0, toBounds: 0,
          // newActivation 内部用 message.from 查找 actorRect 并记录 activation.actor
          // `+` 激活 TARGET，故 from = msg.to（对齐官方 activeStart.actor = $4 = TARGET）
          from: to, to: from, sequenceIndex: 0, sequenceVisible: false,
          id: String(msg.id),
        },
        actorsMap,
      );
    }

    // `-` 简写停用 SOURCE（msg.from）— 对齐官方 jison sequenceDiagram.jison:338
    //   `actor signaltype '-' actor text2 → activeEnd actor: $1.actor`（SOURCE）
    //   原 bug：完全不调用 endActivation，stopy 保持占位 0，被阶段4.5兜底误设为画布底部
    //   修复：msg.deactivate=true 时调用 endActivation，正确设置 stopy
    //
    // stopy 对齐官方 mermaid 渲染语义（v10 修复激活条高度偏高）：
    //   官方 activeEnd(msg, verticalPos) 中 verticalPos = boundMessage 推进后的 verticalPos
    //   官方 boundMessage 推进后 verticalPos = lineStartY（停用消息的消息线 y 坐标）
    //   官方 drawActivation 用 rect.height = verticalPos - starty（stopy = 消息线 y）
    //   本项目 drawMessage 推进 55 像素，this.verticalPos = msg.stopy（消息底部），比官方高 20 像素
    //   修复：传入 stopy = lastMessage.starty（停用消息的消息线 y），绕过推进量差异
    if (msg.deactivate === true) {
      const from = msg.from;
      if (!from) {
        throw new Error(`processMessages: deactivate=true but msg.from missing (message id=${msg.id})`);
      }
      // drawMessage 已在上方调用，models.lastMessage() 必为当前停用消息
      const lastMessage = models.lastMessage();
      if (!lastMessage) {
        // 程序错误不可包容：deactivate=true 必有前序 drawMessage 产生 lastMessage
        throw new Error(`processMessages: deactivate=true but no previous message found (message id=${msg.id})`);
      }
      bounds.endActivation({ from, stopy: lastMessage.starty });
    }

    // 独立 activate 语句（`activate X` 语法）— 附加到当前消息的 activateActors
    //   msg.activateActors 记录被激活的 actor 列表，对齐独立 activate 语句语义
    //   newActivation 的 actor = activateActors[i]（而非 msg.to，因为独立语句不依附于消息方向）
    if (msg.activateActors) {
      const lastMessage = models.lastMessage();
      if (!lastMessage) {
        throw new Error(`processMessages: activateActors but no previous message found (message id=${msg.id})`);
      }
      for (const actor of msg.activateActors) {
        bounds.newActivation(
          {
            startx: 0, stopx: 0,
            starty: lastMessage.starty + 1,
            stopy: 0,
            message: '', type: 0, wrap: false,
            width: 0, height: 0, fromBounds: 0, toBounds: 0,
            from: actor, to: actor,
            sequenceIndex: 0, sequenceVisible: false,
            id: String(msg.id),
          },
          actorsMap,
        );
      }
    }

    // 独立 deactivate 语句（`deactivate X` 语法）— 附加到当前消息的 deactivateActors
    //   msg.deactivateActors 记录被停用的 actor 列表，按顺序逐个 endActivation
    if (msg.deactivateActors) {
      const lastMessage = models.lastMessage();
      if (!lastMessage) {
        throw new Error(`processMessages: deactivateActors but no previous message found (message id=${msg.id})`);
      }
      for (const actor of msg.deactivateActors) {
        bounds.endActivation({ from: actor, stopy: lastMessage.starty });
      }
    }
  }
}

/**
 * 绘制普通消息（对齐官方 drawMessage）
 * 计算 message bounds，调用 bounds.insert + bumpVerticalPos + models.addMessage
 *
 * P1-1 修复（循环验证）：移除早返回 fallback，改为抛错
 *   - msg.from/msg.to 引用不存在的 actor 是 AST 一致性错误（程序错误不可包容）
 *   - 早返回会跳过 models.addMessage，导致 buildMessageLayouts 中 renderIndex 与
 *     models.messages 索引错位，后续所有消息取到错误的 bounds（图论分析 P1 断裂）
 *   - 违反 institution.md 第 1.7 条「禁止 fallback 掩盖主逻辑缺陷」
 *
 * P3 清理：移除未使用的 actors 参数（drawMessage 仅依赖 actorLayouts，不直接读 actors Map）
 */
function drawMessage(
  msg: Message,
  actorLayouts: Map<string, ActorLayout>,
  bounds: SequenceBounds,
  models: BoundsModels,
): void {
  const { messageMargin } = SEQUENCE_LAYOUT_CONFIG;
  if (!msg.from || !msg.to) {
    throw new Error(`drawMessage: message id=${msg.id} missing from/to (from="${msg.from ?? ''}", to="${msg.to ?? ''}")`);
  }
  const fromLayout = actorLayouts.get(msg.from);
  const toLayout = actorLayouts.get(msg.to);
  if (!fromLayout) {
    throw new Error(`drawMessage: actor "${msg.from}" not found in actorLayouts (message id=${msg.id})`);
  }
  if (!toLayout) {
    throw new Error(`drawMessage: actor "${msg.to}" not found in actorLayouts (message id=${msg.id})`);
  }

  // 计算 message 坐标
  const startx = fromLayout.centerX;
  const stopx = toLayout.centerX;
  const starty = bounds.getVerticalPos() + messageMargin;
  const messageText = typeof msg.message === 'string' ? msg.message : '';
  const messageHeight = messageText.length > 0 ? 20 : 0; // 估算：文本高度
  const stopy = starty + messageHeight;

  // 更新 bounds
  const fromBounds = Math.min(fromLayout.bounds.x, toLayout.bounds.x);
  const toBounds = Math.max(fromLayout.bounds.x + fromLayout.width, toLayout.bounds.x + toLayout.width);
  bounds.insert(fromBounds, starty, toBounds, stopy);
  bounds.bumpVerticalPos(messageMargin + messageHeight);

  // 注册 MessageModel
  // P3 清理（循环验证）：from/to 已由上方抛错保证非空（type narrowed to string），移除 ?? '' 死代码
  models.addMessage({
    startx,
    stopx,
    starty,
    stopy,
    message: messageText,
    type: msg.type ?? 0,
    wrap: msg.wrap,
    width: messageText.length > 0 ? measureTextWidth(messageText) : 0,
    height: messageHeight,
    fromBounds,
    toBounds,
    from: msg.from,
    to: msg.to,
    sequenceIndex: msg.id,
    sequenceVisible: false,
    id: String(msg.id),
  });
}

/**
 * 绘制 Note（对齐官方 drawNote）
 * 计算 note bounds，调用 bounds.insert + bumpVerticalPos + models.addNote
 *
 * P2-1 修复（循环验证）：移除早返回 fallback，改为抛错
 *   - msg.from 引用不存在的 actor 是 AST 一致性错误（程序错误不可包容）
 *   - 早返回会跳过 models.addNote，导致 buildNoteLayouts 中 noteIndex 与
 *     models.notes 索引错位（与 drawMessage P1-1 同类问题）
 *   - 违反 institution.md 第 1.7 条「禁止 fallback 掩盖主逻辑缺陷」
 *
 * P3 清理：移除未使用的 actors 参数（drawNote 仅依赖 actorLayouts，不直接读 actors Map）
 */
function drawNote(
  msg: Message,
  actorLayouts: Map<string, ActorLayout>,
  bounds: SequenceBounds,
  models: BoundsModels,
): void {
  const { noteMargin, boxTextMargin } = SEQUENCE_LAYOUT_CONFIG;
  if (!msg.from) {
    throw new Error(`drawNote: message id=${msg.id} missing from (note participant required)`);
  }
  const participantId = msg.from;
  const layout = actorLayouts.get(participantId);
  if (!layout) {
    throw new Error(`drawNote: actor "${participantId}" not found in actorLayouts (message id=${msg.id})`);
  }

  // 计算 note 坐标（简化：over 放在 actor 正上方，left/right 放在两侧）
  const noteText = typeof msg.message === 'string' ? msg.message : '';
  const noteWidth = noteText.length > 0 ? measureTextWidth(noteText) + 2 * boxTextMargin : 50;
  const noteHeight = 30; // 估算 note 高度

  // placement 类型：string（运行时值为 PLACEMENT 常量 number，通过 as unknown as string 绕过类型检查）
  // 用 Number 转换后与 PLACEMENT 常量比较，避免 string/number 类型冲突
  const placementNum = Number(msg.placement);
  const starty = bounds.getVerticalPos() + noteMargin;
  let startx: number;
  let stopx: number;

  if (placementNum === PLACEMENT.LEFTOF) {
    // LEFTOF
    startx = layout.bounds.x - noteWidth;
    stopx = layout.bounds.x;
  } else if (placementNum === PLACEMENT.RIGHTOF) {
    // RIGHTOF
    startx = layout.bounds.x + layout.width;
    stopx = startx + noteWidth;
  } else {
    // OVER（默认）
    startx = layout.centerX - noteWidth / 2;
    stopx = layout.centerX + noteWidth / 2;
  }

  const stopy = starty + noteHeight;

  // 更新 bounds
  bounds.insert(startx, starty, stopx, stopy);
  bounds.bumpVerticalPos(noteMargin + noteHeight);

  // 注册 NoteModel
  models.addNote({
    startx,
    starty,
    startx2: startx, // 简化：与 startx 相同
    stopx,
    stopy,
    message: noteText,
    placement: placementNum,
    actor: participantId,
  });
}

// ============================================================
// 阶段7：buildXxxLayouts — 构建有序布局数组
// ============================================================

/**
 * 构建有序参与者布局数组（P2-NEW-1）
 * P3-2 修复：遍历 ast.actors（按 participants 定义顺序）而非 actorLayouts Map，
 * 确保顺序严格对齐 ast.actors（不依赖 Map 插入顺序的隐含假设）
 *
 * P3 清理（循环验证）：移除 if(layout) fallback，让 desync 显式抛错
 *   actorLayouts 由 layoutActors 从 ast.actors 构建，缺失即 layoutActors bug
 */
function buildParticipantLayouts(
  ast: SequenceAST,
  actorLayouts: Map<string, ActorLayout>,
): ParticipantLayoutItem[] {
  const result: ParticipantLayoutItem[] = [];
  for (const actorId of ast.actors.keys()) {
    const layout = actorLayouts.get(actorId);
    if (!layout) {
      throw new Error(
        `buildParticipantLayouts: actor "${actorId}" not found in actorLayouts — layoutActors desync`,
      );
    }
    result.push({
      participantId: actorId,
      bounds: { x: layout.x, y: layout.y, width: layout.width, height: layout.height },
    });
  }
  return result;
}

/**
 * 构建有序消息布局数组（P2-NEW-1）
 * 按 ast.messages 顺序遍历，跳过块标记/activate/NOTE 等非渲染消息，
 * 从 models.messages 取 bounds，messageType 透传（P2-NEW-3：供渲染层派生 central-connection）
 *
 * P2-NEW-A 修复：NOTE 信号的 bounds 在 models.notes 中（非 models.messages），必须跳过
 * 否则 renderIndex 错位，导致后续消息取到错误的 bounds（note 的 bounds 不在 models.messages 数组中）
 *
 * P3-NEW-5 一致性说明：renderIndex === CanvasState.edges 数组索引 === edge.data.sequence
 *
 * v7 修订（B3.2 实现期设计偏差）：
 *   - msg.signalType → msg.type（Message 类型字段名是 type，非 signalType）
 *   - 移除 edgeId: msg.id（ast.messages 不保留原始 edge.id，sequence 字段已可唯一标识 edge）
 */
function buildMessageLayouts(ast: SequenceAST, models: BoundsModels): MessageLayoutItem[] {
  const result: MessageLayoutItem[] = [];
  let renderIndex = 0;
  for (const msg of ast.messages) {
    // 跳过块标记信号、NOTE 信号
    // P2-NEW-A 修复：NOTE 信号由 drawNote 处理，bounds 在 models.notes 中，不在 models.messages 中
    // v7 修订：msg.type（非 msg.signalType）
    // P3-NEW-1 修复：删除 ACTIVE_START/ACTIVE_END 判断（mapCanvasStateToAst 不重建这两种消息类型，死代码）
    if (
      isBlockSignal(msg.type) ||
      isNoteSignal(msg.type)
    ) {
      continue;
    }
    // P2-2 修复（循环验证）：移除 if(model) fallback，让 desync 显式抛错
    //   model 缺失意味着 processMessages/drawMessage 与 buildMessageLayouts 不一致
    //   （例如 drawMessage 早返回跳过 addMessage，但 renderIndex 仍递增）
    //   违反 institution.md 第 1.7 条「禁止 fallback 掩盖主逻辑缺陷」
    const model = models.messages[renderIndex];
    if (!model) {
      throw new Error(
        `buildMessageLayouts: model missing at renderIndex=${renderIndex} (msg id=${msg.id}) — processMessages/drawMessage desync`,
      );
    }
    const arrowType = LINETYPE_TO_ARROW_TYPE[msg.type ?? 0];
    if (!arrowType) {
      throw new Error(
        `buildMessageLayouts: unknown LINETYPE ${msg.type} (msg id=${msg.id}) at renderIndex=${renderIndex}`,
      );
    }
    result.push({
      // v7 修订：移除 edgeId（ast.messages 不保留原始 edge.id，sequence 已可唯一标识 edge）
      sequence: renderIndex, // === edge.data.sequence（CanvasState.edges 索引）
      bounds: {
        x: model.startx,
        y: model.starty,
        width: model.stopx - model.startx,
        height: model.stopy - model.starty,
      },
      messageType: arrowType as SequenceArrowType, // P2-NEW-3：透传 messageType，渲染层据此派生（v7：msg.type）
    });
    renderIndex++;
  }
  return result;
}

/**
 * 构建有序 Note 布局数组（P2-NEW-1）
 * 按 ast.notes 顺序，从 models.notes 取 bounds
 */
function buildNoteLayouts(models: BoundsModels): NoteLayoutItem[] {
  return models.notes.map((model, index) => ({
    noteIndex: index,
    bounds: {
      x: model.startx,
      y: model.starty,
      width: model.stopx - model.startx,
      height: model.stopy - model.starty,
    },
  }));
}

/**
 * 构建有序 Box 布局数组（P2-NEW-1）
 * 按 ast.boxes 顺序，从 models.boxes 取 bounds
 */
function buildBoxLayouts(models: BoundsModels): BoxLayoutItem[] {
  return models.boxes.map((model, index) => ({
    boxIndex: index,
    bounds: {
      x: model.startx,
      y: model.starty,
      width: model.stopx - model.startx,
      height: model.stopy - model.starty,
    },
  }));
}

// ============================================================
// 主函数：calculateLayout
// ============================================================

/**
 * 计算 sequence 图布局
 *
 * 单一职责：调用 SequenceBounds + 文本测量，产出 LayoutResult 供渲染层消费
 *
 * @param ast - SequenceAST（来自 mapCanvasStateToAst）
 * @returns LayoutResult（供渲染层消费）
 */
export function calculateLayout(ast: SequenceAST): LayoutResult {
  const bounds = new SequenceBounds(SEQUENCE_LAYOUT_CONFIG);
  bounds.init();

  // 阶段1：计算 actor 动态宽度（getMaxMessageWidthPerActor 等价）
  const actorWidths = calculateActorWidths(ast.actors, ast.messages);

  // 阶段2：构建 actor 横向布局（addActorRenderingData 等价）
  const actorLayouts = layoutActors(ast.actors, actorWidths, bounds);

  // 阶段2.5：构建 Box 布局（基于已布局的 actor bounds）
  layoutBoxes(ast.boxes, actorLayouts, bounds);

  // 阶段3：遍历 messages，累积 bounds
  processMessages(ast.messages, bounds, actorLayouts);

  // 阶段4：mirror actors bounds 更新（对齐官方 drawActors(isFooter=true) 阶段）
  // P1 修复：mirrorActors=true 时必须显式更新 bounds.data.stopy
  // P2-2 修复：maxActorHeight 由 measureTextWidth 派生（取所有 actor 文本高度最大值）
  // P2-3 修复：空图场景（actorLayouts 为空）使用 DEFAULT_ACTOR_HEIGHT = 0
  const { mirrorActors, boxMargin } = SEQUENCE_LAYOUT_CONFIG;
  const DEFAULT_ACTOR_HEIGHT = 0; // 空图场景边界值：无 actor 时高度为 0
  if (mirrorActors) {
    const maxActorHeight =
      actorLayouts.size > 0
        ? Math.max(...Array.from(actorLayouts.values()).map((l) => l.height))
        : DEFAULT_ACTOR_HEIGHT;
    bounds.bumpVerticalPos(2 * boxMargin);
    const footerActorTopY = bounds.getVerticalPos();
    actorLayouts.forEach((layout) => {
      layout.bottomY = footerActorTopY; // 底部镜像 actor 顶部 Y 坐标
    });
    bounds.bumpVerticalPos(maxActorHeight + boxMargin);
  }

  // 阶段4.5：dangling-activate 过滤（不渲染激活条）
  //
  // 背景：mermaid 语法允许 `activate A` 独立语句或 `+` 简写不配对 `deactivate`/`-`（dangling-activate），
  //   属合法语法非程序错误（validateActivationPairing 不拦截，用户可输入）。
  //   但官方 mermaid v11 实测对 dangling-activate 不渲染激活条
  //   （验证证据：tmp/mermaid-official-dangling-activate.png + chrome-devtools evaluate_script 实测 3 个 case）
  //
  // stopy 字段语义：
  //   - newActivation 创建时 stopy=0（占位）
  //   - endActivation 时 stopy 被设置为 message.stopy（正值，因 starty ≥ 35，即 messageMargin 累积下限）
  //   - dangling-activate 的 stopy 保持 0（endActivation 从未被调用）
  //   - 故 stopy===0 是 dangling-activate 的可靠判据，不会误判正常配对项
  //
  // 修复策略：从 models.activations 中过滤掉 stopy===0 的 dangling 项
  //   对齐官方 mermaid v11 实测行为（dangling-activate 不渲染激活条）
  //   渲染层（ActivationBar）从 layout.models.activations 取，过滤后不包含 dangling 项
  //
  // 历史背景：阶段4.5 原为"延伸到末尾"兜底（B3.2 设计假设官方延伸到末尾），
  //   2026-07-02 实测推翻该假设（官方不渲染 dangling），改为过滤
  //
  // 单一职责：过滤逻辑放在 calculateLayout（布局入口对 LayoutResult 负全责），
  //   不污染 SequenceBounds（bounds 类只关心算法移植，不关心 mermaid 语法语义）
  //
  // currentVerticalPos 由阶段4.6 loop 兜底继续使用，此处声明为共用变量
  const currentVerticalPos = bounds.getVerticalPos();
  const { models } = bounds.getBounds();
  models.activations = models.activations.filter((activation) => activation.stopy !== 0);

  // 阶段4.6：未关闭 loop 兜底（P2-NEW-1 修复，v9 边界场景完整审查发现 B3.2 设计未覆盖边界场景）
  //
  // 背景：createLoop 初始化时 startx=undefined, stopx=undefined, stopy=undefined（仅 starty=verticalPos 已定）
  //   loop 内有普通消息时，insert 触发 updateBounds → loop 的 startx/stopx/stopy 通过 updateVal 更新为实际值
  //   loop 内无普通消息时（loop 完全空，或仅含 activate/deactivate/note 不触发 insert 的消息），
  //   startx/stopx/stopy 保持 undefined，BlockFrame 渲染：
  //     * stopY = (undefined ?? 0) = 0, startY = verticalPos（≥10） → height = 0 - 10 = -10（负高度）
  //     * stopX = (undefined ?? 0) = 0, startX = (undefined ?? 0) = 0 → width = 0
  //   SVG `<rect height={-10}>` 会翻转绘制，破坏视觉
  //
  // 触发条件（B2 输入下不会触发，B4.1 后可能触发）：
  //   - B2 mapper 反向映射 ast.messages 不重建 ACTIVE_START/ACTIVE_END，loop 内若有 activate/deactivate
  //     信号，正向映射时已走 continue 不触发 insert
  //   - 但若用户在画布上手动创建一个空 loop 块（仅 loop start/end，无消息），mapCanvasStateToAst
  //     会重建 LOOP_START/LOOP_END → ast.messages 包含这两个块标记，processMessages 调用 newLoop/endLoop
  //     但中间无 insert 触发，loop 的 stopx/stopy 保持 undefined
  //
  // 兜底策略：遍历 models.loops，对未关闭字段 fallback
  //   - stopy === undefined → stopy = currentVerticalPos（对齐 P2-2 语义"延伸到 sequence 末尾"）
  //   - stopx === undefined → stopx = bounds.data.stopx ?? 0（已布局的全局最右值）
  //   - startx === undefined → startx = bounds.data.startx ?? 0（已布局的全局最左值）
  //   注意：已关闭 loop（endLoop 之前的最后一个 insert 已设置 stopx/stopy）不会被兜底，
  //   因为字段已非 undefined
  //
  // 单一职责：与阶段4.5 一致，兜底逻辑放在 calculateLayout，不污染 SequenceBounds
  // 实现说明：getBounds() 返回引用，阶段4.5 已解构 models（引用），此处解构 boundsData 后
  //   阶段5 仍可重新解构（同一引用，不会丢失数据）
  const { bounds: boundsData } = bounds.getBounds();
  for (const loop of models.loops) {
    if (loop.stopy === undefined) {
      loop.stopy = currentVerticalPos;
    }
    if (loop.stopx === undefined) {
      loop.stopx = boundsData.stopx ?? 0;
    }
    if (loop.startx === undefined) {
      loop.startx = boundsData.startx ?? 0;
    }
  }

  // 阶段5：获取最终 bounds（含 mirror actors 推进后的 stopy）
  const { bounds: data } = bounds.getBounds();

  // 阶段6：计算画布尺寸（configureSvgSize 等价）
  // P2-NEW-2 修复：canvasHeight 计算统一在 calculateLayout 内完成（考虑 mirrorActors）
  // P1 修复：阶段4 已显式推进 bounds.stopy 含底部 actor，boxHeight 现包含底部 actor 高度
  const { diagramMarginX, diagramMarginY, bottomMarginAdj } = SEQUENCE_LAYOUT_CONFIG;
  const canvasWidth =
    (data.stopx ?? 0) - (data.startx ?? 0) + 2 * SEQUENCE_LAYOUT_CONFIG.diagramMarginX;
  const boxHeight = (data.stopy ?? 0) - (data.starty ?? 0);
  const canvasHeight = mirrorActors
    ? boxHeight + 2 * diagramMarginY - boxMargin + bottomMarginAdj
    : boxHeight + 2 * diagramMarginY;
  const viewBox = `${(data.startx ?? 0) - diagramMarginX} ${-diagramMarginY} ${canvasWidth} ${canvasHeight}`;

  // 阶段7：构建有序布局数组（P2-NEW-1：从 bounds.models 派生，供 B4.4 拖拽落点计算）
  const participantLayouts = buildParticipantLayouts(ast, actorLayouts);
  const messageLayouts = buildMessageLayouts(ast, models);
  const noteLayouts = buildNoteLayouts(models);
  const boxLayouts = buildBoxLayouts(models);

  return {
    bounds: data,
    models,
    actors: actorLayouts,
    participantLayouts,
    messageLayouts,
    noteLayouts,
    boxLayouts,
    canvasWidth,
    canvasHeight,
    viewBox,
  };
}
