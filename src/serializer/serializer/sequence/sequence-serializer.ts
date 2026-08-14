/**
 * sequence 序列化器 — SequenceCanvasState → Mermaid sequenceDiagram 代码
 *
 * 单一职责：将 SequenceCanvasState 序列化为 Mermaid 代码
 *
 * 数据流:
 *   SequenceCanvasState
 *     → serializeSequence(canvas) 入口
 *     → 分发到:
 *       1. header: "sequenceDiagram\n"
 *       2. autonumber: "autonumber\n" (若启用)
 *       3. accTitle/accDescription: 无障碍信息
 *       4. boxes + participants: "box ...\n  participant A\nend\n" / "participant A as Alice\n"
 *       5. messages + notes + blocks: 按时间顺序输出
 *     → 合并为 Mermaid 代码字符串
 *
 * B4.1 修复:
 *   - 移除 createdActors/destroyedActors 独立输出（由 message-serializer prefix 统一负责，避免双重输出）
 *   - Note 序列化使用 serializeNote（单一职责，从 note-serializer.ts 引入）
 *   - Note participantId → participantIds.join(',')（多参与者支持）
 *   - 序列化 midBranches（else/and/option 中间分支，从 block-serializer.ts 引入）
 *   - serializeMessage 接收 targetActorType 参数（用于 create 语句的关键字查找）
 *   - 移除 serializeActivate 调用（activate/deactivate 已由 +/- 后缀表达）
 *   - 块内按 midBranches 分段输出（main 分支 + 各中间分支）
 */

import type {
  CanvasState,
  SequenceCanvasState,
  SequenceMessage,
  SequenceActorType,
  SerializeResult,
  ParseError,
  SequenceBlockInfo,
  SequenceNoteInfo,
} from '../../types.js';
import { serializeParticipants } from './participant-serializer.js';
import { serializeMessage } from './message-serializer.js';
import {
  serializeBlockStart,
  serializeBlockEnd,
  serializeBlockMidBranch,
} from './block-serializer.js';
import { serializeNote } from './note-serializer.js';

// ============================================================
// 公共 API
// ============================================================

/**
 * 序列化 SequenceCanvasState 为 Mermaid sequenceDiagram 代码
 *
 * @param canvas - CanvasState（必须 diagramType === 'sequenceDiagram'）
 * @returns 序列化结果（包含 mermaid 代码和错误列表）
 */
export function serializeSequence(canvas: CanvasState): SerializeResult {
  if (canvas.diagramType !== 'sequenceDiagram') {
    const error: ParseError = {
      line: 0,
      column: 0,
      message: `Expected sequenceDiagram diagramType, got ${canvas.diagramType}`,
      severity: 'error',
    };
    return { mermaid: '', errors: [error] };
  }

  const seqCanvas = canvas as SequenceCanvasState;
  const errors: ParseError[] = [];
  const lines: string[] = [];

  // 1. 图表头
  lines.push('sequenceDiagram');
  lines.push('');

  // 2. 无障碍信息
  const accTitle = seqCanvas.accTitle;
  const accDescription = seqCanvas.accDescription;
  if (accTitle) {
    lines.push(`accTitle: ${accTitle}`);
  }
  if (accDescription) {
    lines.push(`accDescr: ${accDescription}`);
  }
  if (accTitle || accDescription) {
    lines.push('');
  }

  // 3. autonumber
  if (seqCanvas.autonumber) {
    lines.push('autonumber');
    lines.push('');
  }

  // 4. boxes + participants
  const participantLines = serializeParticipants(seqCanvas.participants, seqCanvas.boxes);
  lines.push(...participantLines);

  // 5. 消息 + Note + 块结构（按时间顺序）
  const messageLines = serializeMessagesWithBlocks(seqCanvas);
  lines.push(...messageLines);

  // 合并为最终代码（去除尾部空行）
  const mermaid = lines.join('\n').replace(/\n+$/, '\n');

  return {
    mermaid,
    errors,
  };
}

// ============================================================
// 消息序列化（含块结构和 Note 按时间顺序输出）
// ============================================================

/**
 * 按时间顺序序列化消息、Note、块结构
 *
 * 策略:
 *   1. 按 sequence 索引排序消息
 *   2. 块结构按 startMessage/endMessage 范围包裹消息，构建嵌套树
 *   3. 块内按 midBranches 分段输出（main 分支 + else/and/option 中间分支）
 *   4. Note 按 messageIndex 插入到对应消息前
 *
 * B4.1 修复:
 *   - 移除 createdActors/destroyedActors 派生（由 message-serializer prefix 统一负责，避免双重输出）
 *   - 构建 participantTypeMap 供 create 语句查找 actorType
 *   - 序列化 midBranches（中间分支头，使用 serializeBlockMidBranch）
 */
function serializeMessagesWithBlocks(canvas: SequenceCanvasState): string[] {
  const lines: string[] = [];
  const blocks = canvas.blocks;
  const notes = canvas.notes;

  // B4.1: 构建 participantTypeMap，供 serializeMessage 的 create 语句查找 actorType
  //   - message.to 对应的 participant.actorType 决定 create 语句的关键字（participant/actor/boundary/...）
  //   - create=true 时 targetActorType 必填，未找到则 serializeMessage 抛错（程序错误不可包容）
  const participantTypeMap = new Map<string, SequenceActorType>();
  for (const participant of canvas.participants) {
    participantTypeMap.set(participant.id, participant.actorType);
  }

  // 按 sequence 排序消息
  const sortedMessages = [...canvas.messages].sort((a, b) => a.sequence - b.sequence);

  // 构建块结构树（处理嵌套）
  const blockTree = buildBlockTree(blocks);

  // 递归序列化块结构
  // outputNoteIndices 跟踪已输出的 Note，避免跨分段重复输出
  const outputNoteIndices = new Set<number>();
  serializeBlockNode(blockTree, sortedMessages, notes, participantTypeMap, 0, lines, outputNoteIndices);

  if (lines.length > 0) {
    lines.push('');
  }

  return lines;
}

/** 块结构树节点 */
interface BlockNode {
  block: SequenceBlockInfo | null; // null 表示根节点
  children: BlockNode[];
}

/**
 * 构建块结构树
 *
 * 排序规则：
 *   1. startMessage 升序（先开始的块先处理）
 *   2. endMessage 降序（同 startMessage 时，范围更宽的块为外层，先入栈）
 *
 * 使用栈构建嵌套结构：
 *   - 新块的 startMessage >= 栈顶块的 endMessage 时，弹出栈顶（栈顶块已结束）
 *   - 否则新块作为栈顶块的子节点入栈
 *
 * B5.1 修复：同 startMessage 时必须 endMessage 降序，否则外层块被错误地嵌套在内层块下，
 *   导致外层块范围（endMessage 较大）的消息无法被正确归类，root 层会重复输出这些消息。
 *   反例：alt(1..3) 与 loop(1..2) 同 start=1，若 loop 先入栈，alt 会被错误地成为 loop 的子节点，
 *   alt 的 else 分支消息（seq=2）超出 loop 范围（end=2），在 root 层被重复输出。
 */
function buildBlockTree(blocks: SequenceBlockInfo[]): BlockNode {
  const root: BlockNode = {
    block: null,
    children: [],
  };

  // 排序：startMessage 升序 + endMessage 降序（外层块先入栈）
  const sortedBlocks = [...blocks].sort((a, b) => {
    if (a.startMessage !== b.startMessage) {
      return a.startMessage - b.startMessage;
    }
    return b.endMessage - a.endMessage;
  });

  const stack: BlockNode[] = [root];

  for (const block of sortedBlocks) {
    // 弹出所有已结束的块（新块 startMessage >= 栈顶 endMessage 表示栈顶块已结束）
    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      if (top.block && block.startMessage >= top.block.endMessage) {
        stack.pop();
      } else {
        break;
      }
    }

    const node: BlockNode = {
      block,
      children: [],
    };

    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return root;
}

/**
 * 递归序列化块结构
 *
 * B4.1 修复:
 *   - 移除独立 create/destroy 输出（由 message-serializer prefix 统一负责）
 *   - 序列化 midBranches（else/and/option 中间分支头）
 *   - 使用 serializeNote（单一职责，从 note-serializer.ts 引入）
 *   - 传递 targetActorType 给 serializeMessage（用于 create 语句）
 *   - 移除 serializeActivate 调用（已由 +/- 后缀表达）
 *
 * 分段策略:
 *   - main 分支: [block.startMessage, midBranches[0].startMessage) 或 [block.startMessage, block.endMessage)
 *   - midBranch[i]: [midBranches[i].startMessage, midBranches[i].endMessage)
 *   - 分段连续，覆盖 [block.startMessage, block.endMessage)
 */
function serializeBlockNode(
  node: BlockNode,
  messages: SequenceMessage[],
  notes: SequenceNoteInfo[],
  participantTypeMap: Map<string, SequenceActorType>,
  depth: number,
  lines: string[],
  outputNoteIndices: Set<number>,
): void {
  const indent = '  '.repeat(depth);

  // 输出块开始
  if (node.block) {
    lines.push(serializeBlockStart(node.block, indent));
  }

  const startIdx = node.block?.startMessage ?? 0;
  const endIdx = node.block?.endMessage ?? Number.MAX_SAFE_INTEGER;
  const midBranches = node.block?.midBranches ?? [];

  // 构建分段列表：main 分支 + 各 midBranch
  //   - main: [startIdx, firstMidStart)
  //   - midBranch[i]: [midBranches[i].startMessage, midBranches[i].endMessage)
  //   - 分段连续（parser 保证 midBranches[i].endMessage === midBranches[i+1].startMessage）
  const segments: Array<{
    type: 'main' | 'else' | 'and' | 'option';
    label: string;
    startIdx: number;
    endIdx: number;
  }> = [];

  const firstMidStart = midBranches.length > 0 ? midBranches[0].startMessage : endIdx;
  segments.push({
    type: 'main',
    label: node.block?.label ?? '',
    startIdx,
    endIdx: firstMidStart,
  });

  for (const branch of midBranches) {
    segments.push({
      type: branch.type,
      label: branch.label,
      startIdx: branch.startMessage,
      endIdx: branch.endMessage,
    });
  }

  // 获取该块的子块（已按 startMessage 排序）
  const children = node.children;

  // 按分段输出
  for (const segment of segments) {
    // 中间分支输出 header（main 分支无 header，由 block start 表达）
    if (segment.type !== 'main') {
      // 使用 serializeBlockMidBranch（单一职责，从 block-serializer.ts 引入）
      // branch.type 已包含关键字（'else'/'and'/'option'），直接使用
      const branch = {
        type: segment.type as 'else' | 'and' | 'option',
        label: segment.label,
        startMessage: segment.startIdx,
        endMessage: segment.endIdx,
      };
      lines.push(serializeBlockMidBranch(branch, indent));
    }

    // 收集该分段内的子块（startMessage 在 [segment.startIdx, segment.endIdx) 范围内）
    const segmentChildren = children.filter(
      c => c.block !== null && c.block.startMessage >= segment.startIdx && c.block.startMessage < segment.endIdx,
    );

    // 收集该分段内的事件（子块 + 消息），按 idx 排序输出
    const events: Array<
      | { kind: 'child'; child: BlockNode; idx: number }
      | { kind: 'message'; message: SequenceMessage; idx: number }
    > = [];

    for (const child of segmentChildren) {
      if (child.block) {
        events.push({ kind: 'child', child, idx: child.block.startMessage });
      }
    }

    for (const message of messages) {
      if (message.sequence >= segment.startIdx && message.sequence < segment.endIdx) {
        // 跳过属于子块的消息（在子块范围内的消息由子块递归处理）
        const inChild = segmentChildren.some(
          c => c.block !== null && message.sequence >= c.block.startMessage && message.sequence < c.block.endMessage,
        );
        if (!inChild) {
          events.push({ kind: 'message', message, idx: message.sequence });
        }
      }
    }

    // 按 idx 排序（子块和消息按 sequence 顺序交错输出）
    events.sort((a, b) => a.idx - b.idx);

    // 输出事件
    for (const event of events) {
      if (event.kind === 'child') {
        // 子块前的 Note（messageIndex === child.block.startMessage）
        // 语义：Note 在子块开始前输出，属于当前分段
        outputNotesAtPosition(notes, event.child.block!.startMessage, indent, lines, outputNoteIndices);
        // 递归输出子块
        serializeBlockNode(event.child, messages, notes, participantTypeMap, depth + 1, lines, outputNoteIndices);
      } else {
        // 消息前的 Note（messageIndex === message.sequence）
        // 语义：Note 在消息前输出，属于当前分段
        outputNotesAtPosition(notes, event.message.sequence, indent, lines, outputNoteIndices);
        // 输出消息（传递 targetActorType 用于 create 语句关键字查找）
        // B4.1: create/destroy 由 message-serializer prefix 形式统一输出，不再独立输出
        const targetActorType = participantTypeMap.get(event.message.to);
        const msgLines = serializeMessage(event.message, indent, targetActorType);
        lines.push(...msgLines);
      }
    }
  }

  // 输出块结束后剩余的 Note（仅在根节点处理尾部 Note）
  // 尾部 Note: messageIndex 不匹配任何消息的 sequence，可能是消息末尾后的 Note
  if (!node.block) {
    for (let i = 0; i < notes.length; i++) {
      if (!outputNoteIndices.has(i)) {
        lines.push(serializeNote(notes[i], indent));
        outputNoteIndices.add(i);
      }
    }
  }

  // 输出块结束
  if (node.block) {
    lines.push(serializeBlockEnd(indent));
  }
}

/**
 * 输出指定位置的 Note（messageIndex === position）
 *
 * Note 的 messageIndex 语义（来自 parser）:
 *   - parser 设置 note.messageIndex = messageSequence（下一条消息的 sequence）
 *   - 序列化时，Note 输出在 messageIndex 对应的消息之前
 *   - 即：messageIndex === N 的 Note 输出在 sequence === N 的消息之前
 *
 * @param notes - Note 列表
 * @param position - 消息 sequence 或块 startMessage
 * @param indent - 缩进
 * @param lines - 输出行数组
 * @param outputNoteIndices - 已输出的 Note 索引集合（避免重复输出）
 */
function outputNotesAtPosition(
  notes: SequenceNoteInfo[],
  position: number,
  indent: string,
  lines: string[],
  outputNoteIndices: Set<number>,
): void {
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].messageIndex === position && !outputNoteIndices.has(i)) {
      lines.push(serializeNote(notes[i], indent));
      outputNoteIndices.add(i);
    }
  }
}
