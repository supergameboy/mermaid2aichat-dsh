/**
 * sequence 序列化器 — 消息序列化
 *
 * 单一职责：将 SequenceMessage[] 序列化为 Mermaid 消息代码
 *
 * 输出格式:
 *   - "A->>B: message\n"
 *   - "create participant C\nA->>C: message\n"（B4.1: create 作为前置独立语句）
 *   - "destroy C\nA->>C: message\n"（B4.1: destroy 作为前置独立语句）
 *
 * 实现:
 *   - ARROW_SYNTAX 映射表：central-connection 三种类型映射到带 () 标记的正确语法
 *   - 移除 `?? '->>'` fallback（违反禁止 fallback 原则）
 *   - messageType 缺失或未在 ARROW_SYNTAX 中定义时抛错（程序错误不可包容）
 *   - central-connection 三种类型输出含空格分隔（对齐 jison 语法 `actor signaltype '()' actor` token 切分）
 *   - 其他箭头类型保持无空格分隔（不破坏现有测试）
 *   - B4.1 P2-3: create/destroy 由 message-serializer 统一负责（sequence-serializer 不再独立输出）
 *     - create/destroy 是独立的 mermaid 语句，不是消息内联修饰符
 *     - jison 语法: `create participant X` / `destroy X` 是独立 statement
 *     - 序列化时输出在消息行之前，保证 round-trip 正确
 */

import type { SequenceMessage, SequenceArrowType, SequenceActorType } from '../../types.js';

/**
 * 箭头语法映射表（central-connection 三种类型）
 *
 * central-connection 三种类型保留为独立的 SequenceArrowType，通过 messageType 直接映射：
 *   - 'central-connection'       → '-->()'     （actor signaltype '()' actor）
 *   - 'central-connection-reverse' → '()-->'    （actor '()' signaltype actor）
 *   - 'central-connection-dual'    → '()-->()' （actor '()' signaltype '()' actor）
 *
 * 不新增 centralConnection 字段，消除跨模块类型断裂风险
 *
 * v5 修正：reverse/dual 使用正向 `-->`（DOTTED_OPEN_ARROW），不是 `<--`。
 *   "reverse" 指的是 `()` 标记位置反转（在箭头前 vs 后），不是箭头方向反转。
 *   jison lexer 无 `<-` / `<--` token，`()<--` / `()<-->()` 无法 round-trip（Parse error）。
 */
const ARROW_SYNTAX: Record<SequenceArrowType, string> = {
  // 基本箭头
  'solid-arrow': '->>',
  'dotted-arrow': '-->>',
  'solid-open': '->',
  'dotted-open': '-->',
  'solid-cross': '-x',
  'dotted-cross': '--x',
  'solid-point': '-)',
  'dotted-point': '--)',
  // 双向箭头
  'bidirectional-solid': '<<->>',
  'bidirectional-dotted': '<<-->>',
  // 异步箭头实线（对齐 jison 语法：\\=\ 一个反斜杠，//=\ 一个斜杠）
  //   jison 规则: \-\\\\  matches `-\` (single backslash) → STICK_ARROW_TOP
  //   jison 规则: \-\/\/  matches `-/` (single slash) → STICK_ARROW_BOTTOM
  //   注: jison 中 \\\\ 是双重转义 = 一个反斜杠字面量, \/ 是一个斜杠字面量
  //   对齐官方 Mermaid 源码 sequenceDiagram.jison 第 104-110 行
  'solid-top': '-|\\',
  'solid-bottom': '-|/',
  'stick-top': '-\\\\',
  'stick-bottom': '-//',
  // 异步箭头点线
  'solid-top-dotted': '--|\\',
  'solid-bottom-dotted': '--|/',
  'stick-top-dotted': '--\\\\',
  'stick-bottom-dotted': '--//',
  // 反向异步箭头实线
  'solid-arrow-top-reverse': '/|-',
  'solid-arrow-bottom-reverse': '\\|-',
  'stick-arrow-top-reverse': '//-',
  'stick-arrow-bottom-reverse': '\\\\-',
  // 反向异步箭头点线
  'solid-arrow-top-reverse-dotted': '/|--',
  'solid-arrow-bottom-reverse-dotted': '\\|--',
  'stick-arrow-top-reverse-dotted': '//--',
  'stick-arrow-bottom-reverse-dotted': '\\\\--',
  // 中心连接（三种类型各自映射到带 () 标记的正确语法，v5 修正：正向 -->）
  'central-connection': '-->()',
  'central-connection-reverse': '()-->',
  'central-connection-dual': '()-->()',
};

/**
 * 判断是否为 central-connection 类型（输出格式需含空格分隔）
 *
 * central-connection 三种类型的 jison 语法 `actor signaltype '()' actor` 要求 token 间有空格分隔，
 * 与普通箭头 `actor signaltype actor`（无空格）不同。
 */
function isCentralConnection(arrowType: SequenceArrowType): boolean {
  return arrowType === 'central-connection' ||
    arrowType === 'central-connection-reverse' ||
    arrowType === 'central-connection-dual';
}

/**
 * 参与者类型 → 关键字（SequenceActorType 字面量与关键字一致，create 语句使用）
 *
 * jison 语法: `create participant X` / `create actor X` / `create boundary X` 等
 * create 后必须跟一个 participant_statement，其中包含类型关键字
 */
const PARTICIPANT_KEYWORD: Record<SequenceActorType, string> = {
  'participant': 'participant',
  'actor': 'actor',
  'boundary': 'boundary',
  'collections': 'collections',
  'control': 'control',
  'database': 'database',
  'entity': 'entity',
  'queue': 'queue',
};

/**
 * 序列化单条消息
 *
 * 实现:
 *   - arrow = ARROW_SYNTAX[message.messageType]（含 central-connection 三种类型的正确语法）
 *   - messageType 必须在 ARROW_SYNTAX 中定义，否则抛错（移除 fallback，程序错误不可包容）
 *   - central-connection 三种类型输出含空格分隔（对齐 jison 语法 token 切分）
 *   - 其他箭头类型保持无空格分隔（保持现有输出格式）
 *   - B4.1 P2-3: create/destroy 作为前置独立语句输出（不是内联修饰符）
 *     - create=true: 输出 `create <keyword> <target>` 行 + 消息行
 *     - destroy=true: 输出 `destroy <target>` 行 + 消息行
 *     - create/destroy 的目标是 message.to（被创建/销毁的参与者）
 *
 * @param message - 消息（messageType 必须为合法 SequenceArrowType，否则抛错）
 * @param indent - 缩进（用于块内消息）
 * @param targetActorType - create 时目标参与者的类型关键字（从 canvas.participants 查找）；
 *   create=true 时必填，destroy=true 或无 create/destroy 时可不填
 * @returns 序列化后的代码行（string[]，create/destroy 时返回多行）
 */
export function serializeMessage(
  message: SequenceMessage,
  indent = '',
  targetActorType?: SequenceActorType,
): string[] {
  const arrowType = message.messageType;

  // messageType 缺失抛错（程序错误不可包容，移除 fallback）
  if (!arrowType) {
    throw new Error(`serializeMessage: unknown messageType "${String(arrowType)}"`);
  }

  // messageType 不在 ARROW_SYNTAX 中时抛错（移除 `?? '->>'` fallback）
  const arrow = ARROW_SYNTAX[arrowType];
  if (!arrow) {
    throw new Error(`serializeMessage: unknown messageType "${arrowType}"`);
  }

  const messageText = message.label;
  const activate = message.activate;
  const deactivate = message.deactivate;

  // activate 简写：若 activate=true，使用 + 后缀（不再输出独立 activate 语句）
  // deactivate 简写：若 deactivate=true，使用 - 后缀
  // 注意：+ 加在 target 前，- 也加在 target 前（mermaid 语法约定）
  let suffix = '';
  if (activate && deactivate) {
    // 同时激活和停用：mermaid 不支持同一条消息同时 +/-，优先 activate
    suffix = '+';
  } else if (activate) {
    suffix = '+';
  } else if (deactivate) {
    suffix = '-';
  }

  // B4.1 P2-3: create/destroy 前置独立语句
  //   - jison 语法: `create participant X` / `destroy X` 是独立 statement
  //   - create 需要目标参与者的类型关键字（participant/actor/boundary/...）
  //   - destroy 不需要类型关键字（jison: `destroy actor` → destroyParticipant）
  //   - create/destroy 的目标是 message.to（被创建/销毁的参与者）
  const lines: string[] = [];
  if (message.create === true) {
    if (!targetActorType) {
      throw new Error(
        `serializeMessage: create=true but targetActorType is undefined for message.to="${message.to}"`,
      );
    }
    const keyword = PARTICIPANT_KEYWORD[targetActorType];
    lines.push(`${indent}create ${keyword} ${message.to}`);
  }
  if (message.destroy === true) {
    lines.push(`${indent}destroy ${message.to}`);
  }

  // central-connection 三种类型需要含空格分隔（对齐 jison 语法 `actor signaltype '()' actor` token 切分）
  if (isCentralConnection(arrowType)) {
    lines.push(`${indent}${message.from} ${arrow}${suffix} ${message.to}: ${messageText}`);
  } else {
    // 普通箭头和双向箭头：无空格分隔（保持现有输出格式）
    lines.push(`${indent}${message.from}${arrow}${suffix}${message.to}: ${messageText}`);
  }

  // 独立 activate 语句（跟在消息行之后，对齐 mermaid `activate X` 语法）
  if (message.activateActors) {
    for (const actor of message.activateActors) {
      lines.push(`${indent}activate ${actor}`);
    }
  }
  // 独立 deactivate 语句（跟在消息行之后，对齐 mermaid `deactivate X` 语法）
  if (message.deactivateActors) {
    for (const actor of message.deactivateActors) {
      lines.push(`${indent}deactivate ${actor}`);
    }
  }

  return lines;
}
