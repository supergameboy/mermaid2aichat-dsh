/**
 * Sequence 常量定义
 *
 * 单一职责：定义 LINETYPE / ARROWTYPE / PLACEMENT / PARTICIPANT_TYPE 常量
 * 这些常量值必须与 jison 语法中引用的 yy.LINETYPE / yy.ARROWTYPE / yy.PLACEMENT 完全一致
 */

/** 信号类型（消息/注释/块结构的类型标识） */
export const LINETYPE = {
  SOLID: 0,
  DOTTED: 1,
  NOTE: 2,
  SOLID_CROSS: 3,
  DOTTED_CROSS: 4,
  SOLID_OPEN: 5,
  DOTTED_OPEN: 6,
  LOOP_START: 10,
  LOOP_END: 11,
  ALT_START: 12,
  ALT_ELSE: 13,
  ALT_END: 14,
  OPT_START: 15,
  OPT_END: 16,
  ACTIVE_START: 17,
  ACTIVE_END: 18,
  PAR_START: 19,
  PAR_AND: 20,
  PAR_END: 21,
  RECT_START: 22,
  RECT_END: 23,
  SOLID_POINT: 24,
  DOTTED_POINT: 25,
  AUTONUMBER: 26,
  CRITICAL_START: 27,
  CRITICAL_OPTION: 28,
  CRITICAL_END: 29,
  BREAK_START: 30,
  BREAK_END: 31,
  PAR_OVER_START: 32,
  BIDIRECTIONAL_SOLID: 33,
  BIDIRECTIONAL_DOTTED: 34,

  SOLID_TOP: 41,
  SOLID_BOTTOM: 42,
  STICK_TOP: 43,
  STICK_BOTTOM: 44,

  SOLID_ARROW_TOP_REVERSE: 45,
  SOLID_ARROW_BOTTOM_REVERSE: 46,
  STICK_ARROW_TOP_REVERSE: 47,
  STICK_ARROW_BOTTOM_REVERSE: 48,

  SOLID_TOP_DOTTED: 51,
  SOLID_BOTTOM_DOTTED: 52,
  STICK_TOP_DOTTED: 53,
  STICK_BOTTOM_DOTTED: 54,

  SOLID_ARROW_TOP_REVERSE_DOTTED: 55,
  SOLID_ARROW_BOTTOM_REVERSE_DOTTED: 56,
  STICK_ARROW_TOP_REVERSE_DOTTED: 57,
  STICK_ARROW_BOTTOM_REVERSE_DOTTED: 58,

  CENTRAL_CONNECTION: 59,
  CENTRAL_CONNECTION_REVERSE: 60,
  CENTRAL_CONNECTION_DUAL: 61,
} as const;

/** 箭头头类型 */
export const ARROWTYPE = {
  FILLED: 0,
  OPEN: 1,
} as const;

/** Note 放置位置 */
export const PLACEMENT = {
  LEFTOF: 0,
  RIGHTOF: 1,
  OVER: 2,
} as const;

/** 参与者类型 */
export const PARTICIPANT_TYPE = {
  ACTOR: 'actor',
  BOUNDARY: 'boundary',
  COLLECTIONS: 'collections',
  CONTROL: 'control',
  DATABASE: 'database',
  ENTITY: 'entity',
  PARTICIPANT: 'participant',
  QUEUE: 'queue',
} as const;

/** LINETYPE → SequenceArrowType 映射 */
export const LINETYPE_TO_ARROW_TYPE: Readonly<Record<number, string>> = {
  [LINETYPE.SOLID]: 'solid-arrow',
  [LINETYPE.DOTTED]: 'dotted-arrow',
  [LINETYPE.SOLID_OPEN]: 'solid-open',
  [LINETYPE.DOTTED_OPEN]: 'dotted-open',
  [LINETYPE.SOLID_CROSS]: 'solid-cross',
  [LINETYPE.DOTTED_CROSS]: 'dotted-cross',
  [LINETYPE.SOLID_POINT]: 'solid-point',
  [LINETYPE.DOTTED_POINT]: 'dotted-point',
  [LINETYPE.BIDIRECTIONAL_SOLID]: 'bidirectional-solid',
  [LINETYPE.BIDIRECTIONAL_DOTTED]: 'bidirectional-dotted',
  [LINETYPE.SOLID_TOP]: 'solid-top',
  [LINETYPE.SOLID_BOTTOM]: 'solid-bottom',
  [LINETYPE.STICK_TOP]: 'stick-top',
  [LINETYPE.STICK_BOTTOM]: 'stick-bottom',
  [LINETYPE.SOLID_TOP_DOTTED]: 'solid-top-dotted',
  [LINETYPE.SOLID_BOTTOM_DOTTED]: 'solid-bottom-dotted',
  [LINETYPE.STICK_TOP_DOTTED]: 'stick-top-dotted',
  [LINETYPE.STICK_BOTTOM_DOTTED]: 'stick-bottom-dotted',
  [LINETYPE.SOLID_ARROW_TOP_REVERSE]: 'solid-arrow-top-reverse',
  [LINETYPE.SOLID_ARROW_BOTTOM_REVERSE]: 'solid-arrow-bottom-reverse',
  [LINETYPE.STICK_ARROW_TOP_REVERSE]: 'stick-arrow-top-reverse',
  [LINETYPE.STICK_ARROW_BOTTOM_REVERSE]: 'stick-arrow-bottom-reverse',
  [LINETYPE.SOLID_ARROW_TOP_REVERSE_DOTTED]: 'solid-arrow-top-reverse-dotted',
  [LINETYPE.SOLID_ARROW_BOTTOM_REVERSE_DOTTED]: 'solid-arrow-bottom-reverse-dotted',
  [LINETYPE.STICK_ARROW_TOP_REVERSE_DOTTED]: 'stick-arrow-top-reverse-dotted',
  [LINETYPE.STICK_ARROW_BOTTOM_REVERSE_DOTTED]: 'stick-arrow-bottom-reverse-dotted',
  [LINETYPE.CENTRAL_CONNECTION]: 'central-connection',
  [LINETYPE.CENTRAL_CONNECTION_REVERSE]: 'central-connection-reverse',
  [LINETYPE.CENTRAL_CONNECTION_DUAL]: 'central-connection-dual',
};

/**
 * LINETYPE → SequenceBlockType 映射
 *
 * B4.1 P3-8 修复：PAR_OVER_START 映射从 'par' 修正为 'par-over'
 *   - 对齐 SequenceBlockType 联合类型中的 'par-over' 字面量
 *   - 消除映射不一致（原代码错误映射为 'par'）
 *   - 影响：mapAstToCanvasState 将 PAR_OVER_START 信号正确映射为 'par-over' 块类型
 */
export const LINETYPE_TO_BLOCK_TYPE: Readonly<Record<number, string>> = {
  [LINETYPE.LOOP_START]: 'loop',
  [LINETYPE.LOOP_END]: 'loop',
  [LINETYPE.ALT_START]: 'alt',
  [LINETYPE.ALT_ELSE]: 'alt',
  [LINETYPE.ALT_END]: 'alt',
  [LINETYPE.OPT_START]: 'opt',
  [LINETYPE.OPT_END]: 'opt',
  [LINETYPE.PAR_START]: 'par',
  [LINETYPE.PAR_AND]: 'par',
  [LINETYPE.PAR_END]: 'par',
  [LINETYPE.PAR_OVER_START]: 'par-over',
  [LINETYPE.RECT_START]: 'rect',
  [LINETYPE.RECT_END]: 'rect',
  [LINETYPE.CRITICAL_START]: 'critical',
  [LINETYPE.CRITICAL_OPTION]: 'critical',
  [LINETYPE.CRITICAL_END]: 'critical',
  [LINETYPE.BREAK_START]: 'break',
  [LINETYPE.BREAK_END]: 'break',
};
