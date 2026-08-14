/**
 * sequence 解析器
 *
 * 单一职责：将 Mermaid sequenceDiagram 代码解析为 SequenceCanvasState
 *
 * 数据流:
 *   源代码字符串
 *     → 加载 jison 生成的 sequence-parser.cjs
 *     → 创建 SequenceDB 实例，作为 yy 传入 parser
 *     → parser.parse(source) 调用 SequenceDB.apply/parseMessage/... 收集数据
 *     → SequenceDB.getData() 返回 SequenceAST
 *     → mapAstToCanvasState(ast) 映射为 SequenceCanvasState
 *
 * 错误处理:
 *   - jison 抛出的语法错误被捕获，转换为 ParseError[]
 *   - 解析成功时 errors 为空数组
 */

import { parser as sequenceParser } from '../jison/sequence-parser.js';
import { preprocessCode } from '../../detector/preprocessor.js';
import type {
  SequenceCanvasState,
  SequenceParticipant,
  SequenceMessage,
  SequenceActorType,
  SequenceArrowType,
  SequenceBlockType,
  SequenceBlockInfo,
  SequenceBlockMidBranch,
  SequenceBoxInfo,
  SequenceNoteInfo,
  ParseError,
} from '../../types.js';
import type { SequenceAST } from '../../ast/sequence-ast.js';
import { SequenceDB } from './sequence-db.js';
// 公共 API：CanvasState → AST 逆向映射（B2 新增，供 B3 渲染层 bounds 算法消费）
export { mapCanvasStateToAst } from './sequence-ast-mapper.js';
import {
  LINETYPE,
  PLACEMENT,
  LINETYPE_TO_ARROW_TYPE,
  LINETYPE_TO_BLOCK_TYPE,
} from './constants.js';

// ============================================================
// jison parser（静态 import，浏览器兼容）
// ============================================================

interface JisonParserInstance {
  parse(input: string): unknown;
  yy: unknown;
}

/** sequence jison 解析器实例 */
const sequenceJisonParser: JisonParserInstance = sequenceParser as unknown as JisonParserInstance;

// ============================================================
// 解析结果类型
// ============================================================

/** sequence 解析结果 */
export interface SequenceParseResult {
  /** 是否解析成功（无语法错误） */
  success: boolean;
  /** 解析后的 SequenceCanvasState（失败时返回空状态） */
  canvas: SequenceCanvasState;
  /** 解析错误列表 */
  errors: ParseError[];
}

// ============================================================
// AST → SequenceCanvasState 映射
// ============================================================

/** PARTICIPANT_TYPE 字符串字面量集合，用于校验 actor.type */
const VALID_ACTOR_TYPES: ReadonlySet<string> = new Set([
  'participant',
  'actor',
  'boundary',
  'collections',
  'control',
  'database',
  'entity',
  'queue',
]);

/**
 * 将 SequenceAST 映射为 SequenceCanvasState
 *
 * 映射规则（单一数据源）:
 *   - actors → participants: SequenceParticipant[]
 *   - messages（普通消息）→ messages: SequenceMessage[]
 *   - messages（块标记）→ blocks: SequenceBlockInfo[]
 *   - notes → notes: SequenceNoteInfo[]
 *   - boxes → boxes: SequenceBoxInfo[]
 *   - createdActors/destroyedActors → 派生到 message.create/destroy
 *   - sequenceNumbersEnabled → autonumber
 */
function mapAstToCanvasState(ast: SequenceAST): SequenceCanvasState {
  const participants: SequenceParticipant[] = [];
  const messages: SequenceMessage[] = [];
  const blocks: SequenceBlockInfo[] = [];
  const notes: SequenceNoteInfo[] = [];
  const boxes: SequenceBoxInfo[] = [];

  // ============================================================
  // 1. 映射 boxes → boxes（box.actorKeys 是参与者归属的唯一数据源）
  // ============================================================
  let boxIndex = 0;
  for (const box of ast.boxes) {
    const boxId = `box-${boxIndex}`;
    boxes.push({
      id: boxId,
      name: box.name,
      color: box.fill,
      actorKeys: [...box.actorKeys],
      // B4.1: 映射 Box.wrap → SequenceBoxInfo.wrap（round-trip 完整性）
      wrap: box.wrap,
    });
    boxIndex++;
  }

  // ============================================================
  // 2. 映射 actors → participants
  // ============================================================
  // B4.4 单一数据源修复：不再写入 participant.boxId（死字段）
  // Box 归属唯一通过 box.actorKeys 反查（participant-editor / handleAssignBox 都基于此）
  for (const [actorId, actor] of ast.actors) {
    participants.push({
      id: actorId,
      label: actor.description || actor.name,
      actorType: normalizeActorType(actor.type),
      ...(actor.explicitlyDeclared !== undefined ? { explicitlyDeclared: actor.explicitlyDeclared } : {}),
      ...(actor.wrap ? { wrap: true } : {}),
      ...(Object.keys(actor.links).length > 0 ? { links: actor.links } : {}),
      ...(Object.keys(actor.properties).length > 0 ? { properties: actor.properties } : {}),
    });
  }

  // ============================================================
  // 3. 遍历 messages，分发到 messages / blocks / notes
  //
  // B4.1 重构：
  //   - Note 使用 ast.notes[noteIndex].participantIds（单一数据源，P3-4 修复）
  //   - Block 合并 midBranches 到单一块（不再为 else/and/option 创建多个 block 条目）
  //   - Block 颜色独立存储到 SequenceBlockInfo.color（rect 块专用，不再复用 label）
  //   - central-connection 通过 messageType 表达（P3-5：不新增 CanvasState 层 centralConnection 字段）
  // ============================================================

  /**
   * Block 帧结构（用于跟踪嵌套块和中间分支）
   *
   * 设计：
   *   - 主分支（main）由 block.label + block.startMessage 表达，不存入 midBranches
   *   - 中间分支（else/and/option）按出现顺序存入 midBranches
   *   - 当前分支（currentBranch）跟踪正在扫描的主分支或中间分支
   *   - 块结束时，若当前分支是中间分支，存入 midBranches 后再构建 block
   */
  interface BlockFrame {
    type: SequenceBlockType;
    /** 主分支标签（rect 类型为空字符串，颜色用 color 字段） */
    label: string;
    /** rect 块专用颜色（独立字段，不再复用 label） */
    color?: string;
    /** 主分支起始消息索引（含）= 块起始 */
    startMessage: number;
    /** 已关闭的中间分支列表（else/and/option） */
    midBranches: SequenceBlockMidBranch[];
    /** 当前正在扫描的分支（主分支或中间分支） */
    currentBranch: {
      type: 'main' | 'else' | 'and' | 'option';
      label: string;
      startMessage: number;
    };
  }

  const blockStack: BlockFrame[] = [];

  let messageSequence = 0;
  let lastMessageIndex: number | undefined; // 跟踪最近创建的 message 索引，用于关联 deactivate 信号
  let autonumberEnabled = false;
  // msgIndex → messageIndex 映射，用于关联 ast.createdActors/destroyedActors 到 message.create/destroy
  const msgIndexToMessageIndex = new Map<number, number>();
  // B4.1 P3-4：noteIndex 跟踪 ast.notes 数组消费进度，与 NOTE 信号一一对应
  // sequence-db.ts addNote 同步 push notes 和 messages（NOTE 信号），顺序一致
  let noteIndex = 0;

  for (let i = 0; i < ast.messages.length; i++) {
    const msg = ast.messages[i];
    const linetype = msg.type;

    // 跳过 sequenceIndex（autonumber 配置消息），但检测 visible=true
    if (linetype === LINETYPE.AUTONUMBER) {
      // sequenceIndex 消息的 message 字段是 { start, step, visible }
      if (typeof msg.message === 'object' && msg.message !== null) {
        const visible = (msg.message as { visible?: boolean }).visible;
        if (visible) {
          autonumberEnabled = true;
        } else {
          autonumberEnabled = false;
        }
      }
      continue;
    }

    // Note 消息（LINETYPE.NOTE）
    if (linetype === LINETYPE.NOTE) {
      // PLACEMENT 是数值常量（LEFTOF=0, RIGHTOF=1, OVER=2）
      const placementNum: number = typeof msg.placement === 'number' ? msg.placement : PLACEMENT.OVER;
      const position: 'left' | 'right' | 'over' =
        placementNum === PLACEMENT.LEFTOF ? 'left' :
        placementNum === PLACEMENT.RIGHTOF ? 'right' :
        'over';
      const noteMessage = typeof msg.message === 'string' ? msg.message : '';

      // B4.1 P3-4 修复：使用 ast.notes[noteIndex].participantIds 作为单一数据源
      //   - sequence-db.ts addNote 同步 push notes 和 messages（NOTE 信号）
      //   - 每个 NOTE 信号对应 ast.notes 中的一条记录，顺序一致
      //   - participantIds 数组统一存储单/多参与者（单参与者长度为 1）
      //   - 不再使用 msg.from 作为 participantId（消除双数据表示）
      const astNote = ast.notes[noteIndex];
      noteIndex++;
      if (!astNote) {
        throw new Error(
          `mapAstToCanvasState: NOTE signal at messages[${i}] has no corresponding note in ast.notes (noteIndex=${noteIndex - 1})`,
        );
      }

      notes.push({
        participantIds: astNote.participantIds,
        position,
        label: noteMessage,
        // messageIndex 对齐 message 的 sequence 字段，便于序列化时按顺序输出
        messageIndex: messageSequence,
      });
      continue;
    }

    // 块结构消息（linetype 必须存在才判断）
    if (linetype !== undefined) {
      const blockTypeStr = LINETYPE_TO_BLOCK_TYPE[linetype];
      if (blockTypeStr) {
        const blockType = blockTypeStr as SequenceBlockType;
        const blockLabel = typeof msg.message === 'string' ? msg.message : '';

        if (isBlockStart(linetype)) {
          // B4.1: rect 块颜色独立存储到 color 字段（不再复用 label）
          //   - rect 块的 label 为空字符串（颜色用 color 字段）
          //   - 其他块类型的 color 为 undefined
          const isRect = linetype === LINETYPE.RECT_START;
          const rectColor = isRect ? msg.color : undefined;
          const mainLabel = isRect ? '' : blockLabel;

          blockStack.push({
            type: blockType,
            label: mainLabel,
            color: rectColor,
            startMessage: messageSequence,
            midBranches: [],
            currentBranch: {
              type: 'main',
              label: mainLabel,
              startMessage: messageSequence,
            },
          });
        } else if (isBlockEnd(linetype)) {
          const frame = blockStack.pop();
          if (frame) {
            // 关闭当前分支（若为中间分支，存入 midBranches）
            if (frame.currentBranch.type !== 'main') {
              frame.midBranches.push({
                type: frame.currentBranch.type,
                label: frame.currentBranch.label,
                startMessage: frame.currentBranch.startMessage,
                endMessage: messageSequence,
              });
            }

            blocks.push({
              type: frame.type,
              label: frame.label,
              ...(frame.color !== undefined ? { color: frame.color } : {}),
              startMessage: frame.startMessage,
              endMessage: messageSequence,
              midBranches: frame.midBranches,
            });
          }
        } else if (isBlockMid(linetype)) {
          // B4.1: 中间分支（else/and/option）合并到当前块，不再创建新 block 条目
          //   - 关闭当前分支（若为中间分支，存入 midBranches；主分支不存入）
          //   - 开启新的中间分支（currentBranch）
          const frame = blockStack[blockStack.length - 1];
          if (frame) {
            // 根据 linetype 确定中间分支类型
            const midType: 'else' | 'and' | 'option' =
              linetype === LINETYPE.ALT_ELSE ? 'else' :
              linetype === LINETYPE.PAR_AND ? 'and' :
              'option'; // CRITICAL_OPTION

            // 关闭当前分支（若为中间分支，存入 midBranches；主分支由 block.label 表达，不存入）
            if (frame.currentBranch.type !== 'main') {
              frame.midBranches.push({
                type: frame.currentBranch.type,
                label: frame.currentBranch.label,
                startMessage: frame.currentBranch.startMessage,
                endMessage: messageSequence,
              });
            }

            // 开启新的中间分支
            frame.currentBranch = {
              type: midType,
              label: blockLabel,
              startMessage: messageSequence,
            };
          }
        }
        continue;
      }

      // 激活信号
      if (linetype === LINETYPE.ACTIVE_START) {
        // `+` 简写：普通消息已有 activate=true，ACTIVE_START 是冗余信号，跳过
        // 独立 activate X：普通消息没有 activate=true，附加到 activateActors
        const actor = msg.from;
        if (actor !== undefined && lastMessageIndex !== undefined && messages[lastMessageIndex]) {
          const lastMsg = messages[lastMessageIndex];
          if (lastMsg.activate !== true) {
            if (!lastMsg.activateActors) {
              lastMsg.activateActors = [];
            }
            lastMsg.activateActors.push(actor);
          }
        }
        continue;
      }
      if (linetype === LINETYPE.ACTIVE_END) {
        // `-` 简写：lastMsg.deactivate===true（jison sequence.jison:337 addMessage 设置 deactivate:true）
        //   ACTIVE_END 是冗余信号（停用信息已在 lastMsg.deactivate），跳过
        // 独立 deactivate X：lastMsg.deactivate!==true，附加到 deactivateActors
        //   对称于 ACTIVE_START 处理（lastMsg.activate===true → 跳过；else → activateActors）
        const actor = msg.from;
        if (actor !== undefined && lastMessageIndex !== undefined && messages[lastMessageIndex]) {
          const lastMsg = messages[lastMessageIndex];
          if (lastMsg.deactivate !== true) {
            if (!lastMsg.deactivateActors) {
              lastMsg.deactivateActors = [];
            }
            lastMsg.deactivateActors.push(actor);
          }
        }
        continue;
      }
    }

    // 普通消息 → SequenceMessage
    if (msg.from && msg.to && linetype !== undefined) {
      // B4.1 P3-5：central-connection 通过 messageType 表达
      //   - jison central-connection 规则设置 msg.type=signalType（用户指定的箭头，如 6=DOTTED_OPEN）
      //     和 msg.centralConnection=CENTRAL_CONNECTION_*（59/60/61）
      //   - messageType 应反映 centralConnection 类型（59/60/61），而非 signalType
      //   - 通过 msg.centralConnection 反向映射到 SequenceArrowType，覆盖默认的 signalType 映射
      //   - 不在 SequenceMessage 上新增 centralConnection 字段（消除跨模块类型断裂）
      //   - AST 层 Message.centralConnection 保留（jison 解析时存储 59/60/61）
      //   - 反向映射（mapCanvasStateToAst）输出 msg.type=59/60/61, msg.centralConnection=0，
      //     round-trip 时 LINETYPE_TO_ARROW_TYPE[msg.type] 直接映射为 central-connection 类型
      const effectiveLinetype = msg.centralConnection && msg.centralConnection !== 0
        ? msg.centralConnection
        : linetype;
      const arrowTypeStr = LINETYPE_TO_ARROW_TYPE[effectiveLinetype];
      // 修复8（P2-4，v7 循环验证修复）：移除 `?? 'solid-arrow'` fallback，
      //   未知 LINETYPE 抛错（与 message-serializer.ts P2-4 修复对齐，禁止 fallback 掩盖主逻辑缺陷）
      if (!arrowTypeStr) {
        throw new Error(
          `mapAstToCanvasState: unknown LINETYPE "${String(effectiveLinetype)}" cannot map to SequenceArrowType`,
        );
      }
      const arrowType = arrowTypeStr as SequenceArrowType;
      const messageText = typeof msg.message === 'string' ? msg.message : '';

      const message: SequenceMessage = {
        id: `seq-msg-${messageSequence}`,
        from: msg.from,
        to: msg.to,
        label: messageText,
        messageType: arrowType,
        sequence: messageSequence,
        ...(msg.activate ? { activate: true } : {}),
        ...(msg.deactivate ? { deactivate: true } : {}),
      };

      messages.push(message);
      lastMessageIndex = messages.length - 1;
      msgIndexToMessageIndex.set(i, lastMessageIndex);
      // 修复6（P2-1，v7 循环验证修复）：messageSequence++ 移入 if 块内
      //   phantom message（msg.from/to 为 undefined，如 central-connection 的 phantom）不递增 sequence，
      //   否则 Note 的 messageIndex 和 Block 的 startMessage/endMessage 会与普通消息的 sequence 错位
      messageSequence++;
    }
  }

  // 关闭未闭合的块
  while (blockStack.length > 0) {
    const frame = blockStack.pop();
    if (frame) {
      // 关闭当前分支（若为中间分支，存入 midBranches）
      if (frame.currentBranch.type !== 'main') {
        frame.midBranches.push({
          type: frame.currentBranch.type,
          label: frame.currentBranch.label,
          startMessage: frame.currentBranch.startMessage,
          endMessage: messageSequence,
        });
      }

      blocks.push({
        type: frame.type,
        label: frame.label,
        ...(frame.color !== undefined ? { color: frame.color } : {}),
        startMessage: frame.startMessage,
        endMessage: messageSequence,
        midBranches: frame.midBranches,
      });
    }
  }

  // ============================================================
  // 3.5 派生 message.create/destroy（从 ast.createdActors/destroyedActors）
  //
  // 数据源（单一数据源在 SequenceMessage）:
  //   - ast.createdActors[actorId] = msgIndex 表示"参与者在第 msgIndex 条消息时被创建"
  //   - 通过 msgIndexToMessageIndex 找到对应 message，设置 message.create = true
  //   - 仅当 message.to === actorId 时设置（mermaid 语义约定：create 后跟的消息 target 是被创建参与者）
  //   - 反向映射（mapCanvasStateToAst）对称地从 message.create 派生 createdActors[message.to]
  // ============================================================
  for (const [actorId, msgIndex] of ast.createdActors) {
    const messageIndex = msgIndexToMessageIndex.get(msgIndex);
    if (messageIndex !== undefined && messages[messageIndex].to === actorId) {
      messages[messageIndex].create = true;
    }
  }
  for (const [actorId, msgIndex] of ast.destroyedActors) {
    const messageIndex = msgIndexToMessageIndex.get(msgIndex);
    if (messageIndex !== undefined && messages[messageIndex].to === actorId) {
      messages[messageIndex].destroy = true;
    }
  }

  // ============================================================
  // 4. 构建 SequenceCanvasState
  // ============================================================
  return {
    diagramType: 'sequenceDiagram',
    participants,
    messages,
    notes,
    blocks,
    boxes,
    autonumber: autonumberEnabled,
    ...(ast.accTitle ? { accTitle: ast.accTitle } : {}),
    ...(ast.accDescr ? { accDescription: ast.accDescr } : {}),
  };
}

/**
 * 校验 actor.type 字符串并断言为 SequenceActorType
 *
 * PARTICIPANT_TYPE 常量值（'actor'/'boundary'/...）与 SequenceActorType 字面量完全一致，
 * 但 Actor.type 类型是 string，需要校验后断言为 SequenceActorType。
 * 未知值抛错（程序错误不可包容，code-standards.md 第5条）。
 */
function normalizeActorType(type: string): SequenceActorType {
  if (VALID_ACTOR_TYPES.has(type)) {
    return type as SequenceActorType;
  }
  throw new Error(`normalizeActorType: unknown actor type "${type}"`);
}

/** 判断 LINETYPE 是否为块开始 */
function isBlockStart(linetype: number): boolean {
  return linetype === LINETYPE.LOOP_START ||
    linetype === LINETYPE.ALT_START ||
    linetype === LINETYPE.OPT_START ||
    linetype === LINETYPE.PAR_START ||
    linetype === LINETYPE.PAR_OVER_START ||
    linetype === LINETYPE.CRITICAL_START ||
    linetype === LINETYPE.BREAK_START ||
    linetype === LINETYPE.RECT_START;
}

/** 判断 LINETYPE 是否为块结束 */
function isBlockEnd(linetype: number): boolean {
  return linetype === LINETYPE.LOOP_END ||
    linetype === LINETYPE.ALT_END ||
    linetype === LINETYPE.OPT_END ||
    linetype === LINETYPE.PAR_END ||
    linetype === LINETYPE.CRITICAL_END ||
    linetype === LINETYPE.BREAK_END ||
    linetype === LINETYPE.RECT_END;
}

/** 判断 LINETYPE 是否为块中间分支（else/and/option） */
function isBlockMid(linetype: number): boolean {
  return linetype === LINETYPE.ALT_ELSE ||
    linetype === LINETYPE.PAR_AND ||
    linetype === LINETYPE.CRITICAL_OPTION;
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 解析 sequenceDiagram 代码为 SequenceCanvasState
 *
 * 预处理（架构修复）:
 *   - 内部调用 preprocessCode 清理 frontmatter/指令/注释（保持行号一致）
 *   - jison 解析清理后的 code，错误上下文使用原始 source
 *
 * @param source - Mermaid sequenceDiagram 源代码（可含 %% 注释、%%{directive}%%、frontmatter）
 * @returns 解析结果（包含 canvas 和 errors）
 */
export function parseSequence(source: string): SequenceParseResult {
  const parser = sequenceJisonParser;
  const sequenceDB = new SequenceDB();

  // 将 SequenceDB 实例作为 yy 传入 parser
  // jison 语法动作通过 yy.apply/yy.parseMessage/... 调用 SequenceDB 方法
  parser.yy = sequenceDB;

  try {
    // 预处理：清理 frontmatter/指令/注释（替换为等长换行，保持行号一致）
    // jison 无法解析 %% 注释和 %%{directive}%%，必须预处理
    const preprocessedSource = preprocessCode(source);
    // jison 语法要求 sequenceDiagram 后必须有 NEWLINE
    const normalizedSource = preprocessedSource.endsWith('\n') ? preprocessedSource : preprocessedSource + '\n';
    parser.parse(normalizedSource);

    const ast = sequenceDB.getData();
    const canvas = mapAstToCanvasState(ast);

    return {
      success: true,
      canvas,
      errors: [],
    };
  } catch (err) {
    const error: ParseError = {
      line: extractLine(err),
      column: extractColumn(err),
      message: extractMessage(err),
      severity: 'error',
      context: source.split('\n')[extractLine(err) - 1] ?? undefined,
    };

    // 返回空 canvas + 错误列表
    const emptyCanvas: SequenceCanvasState = {
      diagramType: 'sequenceDiagram',
      participants: [],
      messages: [],
      notes: [],
      blocks: [],
      boxes: [],
      autonumber: false,
    };

    return {
      success: false,
      canvas: emptyCanvas,
      errors: [error],
    };
  } finally {
    // 重置 parser.yy，避免泄漏
    parser.yy = {};
  }
}

// ============================================================
// 错误信息提取
// ============================================================

function extractLine(err: unknown): number {
  if (err && typeof err === 'object') {
    const line = (err as { line?: unknown }).line;
    if (typeof line === 'number') return line;
    const hash = (err as { hash?: { line?: unknown } }).hash;
    if (hash && typeof hash.line === 'number') return hash.line;
  }
  return 1;
}

function extractColumn(err: unknown): number {
  if (err && typeof err === 'object') {
    const column = (err as { column?: unknown }).column;
    if (typeof column === 'number') return column;
    const hash = (err as { hash?: { column?: unknown } }).hash;
    if (hash && typeof hash.column === 'number') return hash.column;
  }
  return 1;
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message || 'sequence parse error';
  }
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'sequence parse error';
}
