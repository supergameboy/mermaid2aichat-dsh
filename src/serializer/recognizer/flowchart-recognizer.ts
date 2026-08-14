/**
 * flowchart 识别器 — 将 Mermaid flowchart 代码识别为 FlowchartRecognizedBlock[] 流
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 3
 *
 * 数据流：
 *   code → preprocessCode → flowJisonParser.parse(code) [yy=RecognizerCollector]
 *        → RecognizerCollector 收集 block → getBlocks() → FlowchartRecognizedBlock[]
 *
 * 关键决策：
 *   - 决策10 方案B：适配器模式，RecognizerCollector 实现 FlowDBYY 接口，
 *     保留 mermaid jison 原文件不变，仅在 parser.yy 上下文做替换
 *     （注：flow.jison 新增 subgraphStart 非终结符触发 enterScope，见 sibling-subgraph-fix.md）
 *   - 决策11：pendingStack 栈结构解决 addSubGraph 顺序倒置 + 平级 subgraph 问题
 *   - 决策14：preserveIndent 语义收缩（仅保留缩进与顺序）
 *
 * pendingStack 机制（决策11 栈结构实现）：
 *   jison addSubGraph 在子内容解析完后调用（顺序倒置，证据见 flow.jison:380-387）。
 *   为区分平级 subgraph 各自的子内容，RecognizerCollector 维护 pendingStack 栈：
 *     - enterScope()（jison subgraphStart 归约时调用）push 新空 scope
 *     - addVertex/addLink 等 push block 到栈顶 scope
 *     - addSubGraph pop 栈顶 scope 作为 childBlocks，递增 indent（+2），
 *       打包 [openBlock, ...childBlocks, closeBlock] push 到外层 scope
 *   平级 subgraph：各自独立 scope，互不累积，打包后在外层 scope 中平级。
 *   嵌套 subgraph：内层先 addSubGraph pop 打包，外层后 addSubGraph pop（含内层打包）再打包。
 *
 *   历史教训：曾简化为单数组 blocks，导致平级 subgraph 被错误嵌套（第二个 subgraph
 *   把第一个 subgraph 的打包结果当作自己的 childBlocks）。根因是单数组无法区分
 *   不同 subgraph 的子内容。已恢复为栈结构，详见 docs/design/sibling-subgraph-fix.md。
 *
 * 已知限制（待 Stage 4 EdgeConverter 实现时决策）：
 *   - shapeData 节点元数据（@{ icon, form, pos, img, ... }）未完整承载到 VertexBlock，
 *     仅处理 shape 字段（覆盖 type）。其他字段在 Converter 阶段会丢失。
 *     原因：VertexBlock 接口未声明这些字段，扩展接口属于 Stage 2 骨架的修订。
 *   - shapeData 边元数据（@{ animate, animation, curve }）未承载到 EdgeBlock。
 *     原因：EdgeBlock 接口未声明这些字段，且 MermaidEdgeData 未显式声明 animation 字段。
 *   - hasSourceVertexDef / hasTargetVertexDef 均设为 false。
 *     原因：jison addLink 不提供"边是否同时定义了 source/target 顶点"信息，
 *     Converter 可通过 vertexId 集合判断是否需要创建顶点（重复 VertexBlock 会更新已有 MermaidNode）。
 *
 * 模块边界：仅依赖 ./types.js（RecognizedBlock）、./index.js（IBlockRecognizer）、
 * ../parser/jison/flow-parser.js、../detector/preprocessor.js、../parser/direction-utils.js、
 * ../parser/flowchart/flow-db.js（FlowDBYY 类型）、../ast/flowchart-ast.js、../types.js。
 * 不引用 React/DOM。
 */

import * as yaml from 'js-yaml';
import { parser as flowParser } from '../parser/jison/flow-parser.js';
import { preprocessCode } from '../detector/preprocessor.js';
import { normalizeDirection } from '../parser/direction-utils.js';
import type { RecognizerYY } from '../parser/flowchart/flow-db.js';
import type {
  FlowText,
  FlowVertexTypeParam,
  FlowLabelType,
  FlowLink,
} from '../ast/flowchart-ast.js';
import type {
  FlowchartDirection,
  MermaidEdgeStyle,
  MermaidShapeType,
} from '../types.js';
import type {
  FlowchartRecognizedBlock,
  VertexBlock,
  EdgeBlock,
  SubgraphOpenBlock,
  SubgraphCloseBlock,
  ClassDefBlock,
  ClassApplyBlock,
  StyleBlock,
  LinkStyleBlock,
  ClickBlock,
  DirectionBlock,
  TitleBlock,
  AccTitleBlock,
  AccDescriptionBlock,
} from './types.js';
import type { IBlockRecognizer } from './index.js';

// ============================================================
// jison parser 实例
// ============================================================

interface JisonParserInstance {
  parse(input: string): unknown;
  yy: unknown;
}

const flowJisonParser: JisonParserInstance = flowParser as unknown as JisonParserInstance;

// ============================================================
// 内部类型
// ============================================================

/** shapeData YAML 解析结果（节点/边元数据，对齐 flow-db.ts NodeMetaData） */
interface NodeMetaData {
  shape?: string;
  label?: string;
  labelType?: string;
  icon?: string;
  form?: 'circle' | 'square' | 'rounded';
  pos?: 't' | 'b';
  img?: string;
  w?: number | string;
  h?: number | string;
  constraint?: 'on' | 'off';
  animate?: boolean;
  animation?: 'fast' | 'slow';
  curve?: string;
}

/** 链接数据（jison 传入的 linkData 可能是 { id: string }） */
interface LinkData {
  id: string;
}

/** 边数据（jison 传入的 linkData 的完整结构） */
interface EdgeLinkData {
  type?: string;
  stroke?: string;
  length?: number;
  text?: { text: string; type: string };
  id?: string;
}

// ============================================================
// 辅助函数 — shape 别名映射（对齐 flowchart-parser.ts SHAPE_ALIAS_MAP）
// ============================================================
// 注：代码重复自 flowchart-parser.ts，Stage 5 切换入口时统一提取共享模块

const SHAPE_ALIAS_MAP: Record<string, MermaidShapeType> = {
  // === rect (squareRect) ===
  'rect': 'rect', 'proc': 'rect', 'process': 'rect', 'rectangle': 'rect', 'squarerect': 'rect',
  // === rounded (roundedRect) ===
  'rounded': 'rounded', 'event': 'rounded', 'roundedrect': 'rounded',
  // === stadium ===
  'stadium': 'stadium', 'terminal': 'stadium', 'pill': 'stadium',
  // === subroutine (fr-rect) ===
  'subroutine': 'subroutine', 'subprocess': 'subroutine', 'subproc': 'subroutine',
  'framed-rectangle': 'subroutine', 'fr-rect': 'subroutine',
  // === cylinder ===
  'cylinder': 'cylinder', 'cyl': 'cylinder', 'db': 'cylinder', 'database': 'cylinder',
  // === datastore ===
  'datastore': 'datastore', 'data-store': 'datastore',
  // === circle ===
  'circle': 'circle', 'circ': 'circle',
  // === doublecircle ===
  'doublecircle': 'doublecircle', 'double-circle': 'doublecircle', 'dbl-circ': 'doublecircle',
  // === diamond (question) ===
  'diamond': 'diamond', 'diam': 'diamond', 'decision': 'diamond', 'question': 'diamond',
  // === hexagon ===
  'hexagon': 'hexagon', 'hex': 'hexagon', 'prepare': 'hexagon',
  // === lean-right (lean_right) ===
  'lean-right': 'lean-right', 'lean-r': 'lean-right', 'in-out': 'lean-right', 'lean_right': 'lean-right',
  // === lean-left (lean_left) ===
  'lean-left': 'lean-left', 'lean-l': 'lean-left', 'out-in': 'lean-left', 'lean_left': 'lean-left',
  // === trapezoid ===
  'trapezoid': 'trapezoid', 'trap-b': 'trapezoid', 'priority': 'trapezoid', 'trapezoid-bottom': 'trapezoid',
  // === trapezoid-reverse (inv_trapezoid) ===
  'trapezoid-reverse': 'trapezoid-reverse', 'trap-t': 'trapezoid-reverse', 'manual': 'trapezoid-reverse',
  'trapezoid-top': 'trapezoid-reverse', 'inv-trapezoid': 'trapezoid-reverse', 'inv_trapezoid': 'trapezoid-reverse',
  // === odd (rect_left_inv_arrow) ===
  'odd': 'odd', 'rect_left_inv_arrow': 'odd',
  // === text ===
  'text': 'text',
  // === card (notched-rectangle) ===
  'card': 'card', 'notched-rectangle': 'card', 'notch-rect': 'card',
  // === lined-rectangle (shaded-process) ===
  'lined-rectangle': 'lined-rectangle', 'lin-rect': 'lined-rectangle', 'lined-process': 'lined-rectangle',
  'lin-proc': 'lined-rectangle', 'shaded-process': 'lined-rectangle',
  // === small-circle (stateStart) ===
  'small-circle': 'small-circle', 'sm-circ': 'small-circle', 'start': 'small-circle', 'statestart': 'small-circle',
  // === framed-circle (stateEnd) ===
  'framed-circle': 'framed-circle', 'fr-circ': 'framed-circle', 'stop': 'framed-circle', 'stateend': 'framed-circle',
  // === fork-join (forkJoin) ===
  'fork-join': 'fork-join', 'fork': 'fork-join', 'join': 'fork-join', 'forkjoin': 'fork-join',
  // === hourglass ===
  'hourglass': 'hourglass', 'collate': 'hourglass',
  // === brace-left (curlyBraceLeft) ===
  'brace-left': 'brace-left', 'brace': 'brace-left', 'brace-l': 'brace-left', 'comment': 'brace-left',
  // === brace-right (curlyBraceRight) ===
  'brace-right': 'brace-right', 'brace-r': 'brace-right',
  // === braces (curlyBraces) ===
  'braces': 'braces',
  // === lightning-bolt ===
  'lightning-bolt': 'lightning-bolt', 'bolt': 'lightning-bolt', 'com-link': 'lightning-bolt',
  // === document (waveEdgedRectangle) ===
  'document': 'document', 'doc': 'document',
  // === delay (halfRoundedRectangle) ===
  'delay': 'delay', 'half-rounded-rectangle': 'delay',
  // === horizontal-cylinder (tiltedCylinder) ===
  'horizontal-cylinder': 'horizontal-cylinder', 'h-cyl': 'horizontal-cylinder', 'das': 'horizontal-cylinder',
  // === lined-cylinder ===
  'lined-cylinder': 'lined-cylinder', 'lin-cyl': 'lined-cylinder', 'disk': 'lined-cylinder',
  // === curved-trapezoid ===
  'curved-trapezoid': 'curved-trapezoid', 'curv-trap': 'curved-trapezoid', 'display': 'curved-trapezoid',
  // === divided-rectangle ===
  'divided-rectangle': 'divided-rectangle', 'div-rect': 'divided-rectangle',
  'div-proc': 'divided-rectangle', 'divided-process': 'divided-rectangle',
  // === triangle ===
  'triangle': 'triangle', 'tri': 'triangle', 'extract': 'triangle',
  // === window-pane ===
  'window-pane': 'window-pane', 'win-pane': 'window-pane', 'internal-storage': 'window-pane',
  // === filled-circle ===
  'filled-circle': 'filled-circle', 'f-circ': 'filled-circle', 'junction': 'filled-circle',
  // === notched-pentagon (trapezoidalPentagon) ===
  'notched-pentagon': 'notched-pentagon', 'notch-pent': 'notched-pentagon',
  'loop-limit': 'notched-pentagon',
  // === flipped-triangle ===
  'flipped-triangle': 'flipped-triangle', 'flip-tri': 'flipped-triangle', 'manual-file': 'flipped-triangle',
  // === sloped-rectangle (slopedRect) ===
  'sloped-rectangle': 'sloped-rectangle', 'sl-rect': 'sloped-rectangle',
  'manual-input': 'sloped-rectangle',
  // === stacked-document (multiWaveEdgedRectangle) ===
  'stacked-document': 'stacked-document', 'docs': 'stacked-document',
  'documents': 'stacked-document', 'st-doc': 'stacked-document',
  // === stacked-rectangle (multiRect) ===
  'stacked-rectangle': 'stacked-rectangle', 'st-rect': 'stacked-rectangle',
  'procs': 'stacked-rectangle', 'processes': 'stacked-rectangle',
  // === bow-tie-rectangle (bowTieRect) ===
  'bow-tie-rectangle': 'bow-tie-rectangle', 'bow-rect': 'bow-tie-rectangle', 'stored-data': 'bow-tie-rectangle',
  // === crossed-circle ===
  'crossed-circle': 'crossed-circle', 'cross-circ': 'crossed-circle', 'summary': 'crossed-circle',
  // === tagged-document (taggedWaveEdgedRectangle) ===
  'tagged-document': 'tagged-document', 'tag-doc': 'tagged-document',
  // === tagged-rectangle (taggedRect) ===
  'tagged-rectangle': 'tagged-rectangle', 'tag-rect': 'tagged-rectangle',
  'tag-proc': 'tagged-rectangle', 'tagged-process': 'tagged-rectangle',
  // === flag (waveRectangle) ===
  'flag': 'flag', 'paper-tape': 'flag',
  // === lined-document (linedWaveEdgedRect) ===
  'lined-document': 'lined-document', 'lin-doc': 'lined-document',
  // === note ===
  'note': 'note',
  // === cloud ===
  'cloud': 'cloud',
  // === bang ===
  'bang': 'bang',
};

/**
 * jison 语法层顶点类型 → MermaidShapeType 映射
 * 对齐 flowchart-parser.ts 的 mapVertexType 逻辑
 *
 * @param type - jison 语法层类型（FlowVertexTypeParam）或 shapeData 扩展形状名
 */
function mapVertexType(type: FlowVertexTypeParam | string | undefined): MermaidShapeType | undefined {
  if (type === undefined) {
    return undefined;
  }

  // jison 语法层 16 种标准形状（直接映射）
  switch (type) {
    case 'square':
      return 'rect';
    case 'round':
      return 'rounded';
    case 'ellipse':
      return 'ellipse';
    case 'stadium':
      return 'stadium';
    case 'subroutine':
      return 'subroutine';
    case 'cylinder':
      return 'cylinder';
    case 'circle':
      return 'circle';
    case 'doublecircle':
      return 'doublecircle';
    case 'diamond':
      return 'diamond';
    case 'hexagon':
      return 'hexagon';
    case 'odd':
      return 'odd';
    case 'trapezoid':
      return 'trapezoid';
    case 'inv_trapezoid':
      return 'trapezoid-reverse';
    case 'lean_right':
      return 'lean-right';
    case 'lean_left':
      return 'lean-left';
    case 'rect':
      return 'rect';
    default:
      // shapeData 扩展形状：通过别名映射表查找
      const normalized = type.toLowerCase();
      const mapped = SHAPE_ALIAS_MAP[normalized];
      if (mapped !== undefined) {
        return mapped;
      }
      // 未知形状保留原值（不应发生，防御性处理）
      return type as MermaidShapeType;
  }
}

/**
 * 边类型 + 线型 → MermaidEdgeStyle 映射
 * 对齐 flowchart-parser.ts 的 mapEdgeStyle 逻辑
 */
function mapEdgeStyle(type: string | undefined, stroke: string | undefined): MermaidEdgeStyle {
  // 不可见线
  if (stroke === 'invisible') {
    return 'invisible';
  }

  // 双端箭头
  if (type === 'double_arrow_point') {
    return stroke === 'thick'
      ? 'thick-arrow'
      : stroke === 'dotted'
        ? 'dotted-arrow'
        : 'bidirectional-arrow';
  }
  if (type === 'double_arrow_circle') {
    return stroke === 'dotted' ? 'dotted-circle' : 'bidirectional-circle';
  }
  if (type === 'double_arrow_cross') {
    return stroke === 'dotted' ? 'dotted-cross' : 'bidirectional-cross';
  }

  // 单端箭头
  const arrowPart = type === 'arrow_point' ? 'arrow'
    : type === 'arrow_circle' ? 'circle'
    : type === 'arrow_cross' ? 'cross'
    : 'line'; // arrow_open 或 undefined

  switch (stroke) {
    case 'thick':
      return arrowPart === 'arrow' ? 'thick-arrow'
        : arrowPart === 'circle' ? 'thick-circle'
        : arrowPart === 'cross' ? 'thick-cross'
        : 'thick-line';
    case 'dotted':
      return arrowPart === 'arrow' ? 'dotted-arrow'
        : arrowPart === 'circle' ? 'dotted-circle'
        : arrowPart === 'cross' ? 'dotted-cross'
        : 'dotted';
    case 'normal':
    default:
      return arrowPart as MermaidEdgeStyle;
  }
}

/**
 * 解析 shapeData YAML 字符串（对齐 flow-db.ts parseShapeData）
 * shapeData 语法：@{ shape: xxx, label: xxx, ... }
 */
function parseShapeData(metadata: unknown): NodeMetaData | undefined {
  if (metadata === undefined || metadata === null) {
    return undefined;
  }

  const metadataStr = typeof metadata === 'string' ? metadata : String(metadata);

  // 对齐官方 flowDb.ts：单行包装为 JSON 对象格式，多行直接使用
  let yamlData: string;
  if (!metadataStr.includes('\n')) {
    yamlData = '{\n' + metadataStr + '\n}';
  } else {
    yamlData = metadataStr + '\n';
  }

  try {
    return yaml.load(yamlData, { schema: yaml.JSON_SCHEMA }) as NodeMetaData;
  } catch {
    return undefined;
  }
}

/** 规范化标签类型（对齐 flow-db.ts sanitizeNodeLabelType） */
function sanitizeLabelType(labelType: string | undefined): FlowLabelType | undefined {
  if (labelType === undefined) {
    return undefined;
  }
  switch (labelType) {
    case 'markdown':
    case 'string':
    case 'text':
      return labelType;
    default:
      return 'markdown';
  }
}

/** 去除首尾引号（对齐 flow-db.ts addVertex/addSingleLink 的引号处理） */
function stripQuotes(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.substring(1, trimmed.length - 1);
  }
  return trimmed;
}

// ============================================================
// 辅助函数 — destructLink 边语法解析（对齐 flow-db.ts）
// ============================================================
// 注：代码重复自 flow-db.ts，Stage 5 切换入口时统一提取共享模块

/** 计算字符串中某字符的出现次数（对齐 flow-db.ts countChar） */
function countChar(char: string, str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; ++i) {
    if (str[i] === char) {
      ++count;
    }
  }
  return count;
}

/** 解析边起始端语法（对齐 flow-db.ts destructStartLink） */
function destructStartLink(_str: string): FlowLink {
  let str = _str.trim();
  let type = 'arrow_open';

  switch (str[0]) {
    case '<':
      type = 'arrow_point';
      str = str.slice(1);
      break;
    case 'x':
      type = 'arrow_cross';
      str = str.slice(1);
      break;
    case 'o':
      type = 'arrow_circle';
      str = str.slice(1);
      break;
  }

  let stroke = 'normal';
  if (str.includes('=')) {
    stroke = 'thick';
  }
  if (str.includes('.')) {
    stroke = 'dotted';
  }

  return { type, stroke };
}

/** 解析边终端语法（对齐 flow-db.ts destructEndLink） */
function destructEndLink(_str: string): FlowLink {
  const str = _str.trim();
  const line = str.slice(0, -1);
  let type = 'arrow_open';

  switch (str.slice(-1)) {
    case 'x':
      type = 'arrow_cross';
      if (str.startsWith('x')) {
        type = 'double_' + type;
        // line = line.slice(1); // 对齐官方，但 line 未使用
      }
      break;
    case '>':
      type = 'arrow_point';
      if (str.startsWith('<')) {
        type = 'double_' + type;
        // line = line.slice(1); // 对齐官方，但 line 未使用
      }
      break;
    case 'o':
      type = 'arrow_circle';
      if (str.startsWith('o')) {
        type = 'double_' + type;
        // line = line.slice(1); // 对齐官方，但 line 未使用
      }
      break;
  }

  let stroke = 'normal';
  let length = line.length - 1;

  if (line.startsWith('=')) {
    stroke = 'thick';
  }
  if (line.startsWith('~')) {
    stroke = 'invisible';
  }

  const dots = countChar('.', line);
  if (dots) {
    stroke = 'dotted';
    length = dots;
  }

  return { type, stroke, length };
}

/**
 * 解析边语法（jison 调用，对齐 flow-db.ts destructLink）
 * @param _str - 边字符串（如 "-->", "--x", "--o", "==>"）
 * @param _startStr - 起始端字符串（可选，如 "<--", "x--", "o--"）
 */
function destructLink(_str: string, _startStr?: string): FlowLink {
  const info = destructEndLink(_str);

  if (_startStr) {
    const startInfo = destructStartLink(_startStr);

    if (startInfo.stroke !== info.stroke) {
      return { type: 'INVALID', stroke: 'INVALID' };
    }

    if (startInfo.type === 'arrow_open') {
      // -- xyz -->  - 取终端的箭头类型
      startInfo.type = info.type;
    } else {
      // x-- xyz -->  - 不支持
      if (startInfo.type !== info.type) {
        return { type: 'INVALID', stroke: 'INVALID' };
      }
      startInfo.type = 'double_' + startInfo.type;
    }

    if (startInfo.type === 'double_arrow') {
      startInfo.type = 'double_arrow_point';
    }

    startInfo.length = info.length;
    return startInfo;
  }

  return info;
}

// ============================================================
// 辅助函数 — linkStyle 位置规范化
// ============================================================

/**
 * 规范化 linkStyle 位置列表
 *
 * jison numList 规则产出的 NUM token 值是字符串（如 "0"），而 'default' 来自 DEFAULT token。
 * TypeScript 签名声明为 `('default' | number)[]`，但运行时 jison 传入的是字符串。
 * 此函数把字符串数字转换为 number，'default' 保持不变，消除类型与运行时的不一致。
 *
 * 对齐 flow-db.ts updateLink 的行为：JavaScript 用 `this.edges[pos]` 时自动转换字符串索引，
 * RecognizerCollector 不依赖隐式转换，显式规范化以通过 typeof 检查。
 */
function normalizeLinkStylePositions(
  positions: readonly ('default' | number)[],
): ('default' | number)[] {
  return positions.map((p) => {
    if (p === 'default') {
      return 'default';
    }
    if (typeof p === 'number') {
      return p;
    }
    // jison numList 传入字符串数字（如 "0"），转换为 number
    const num = Number(p);
    return Number.isNaN(num) ? p : num;
  });
}

// ============================================================
// 辅助函数 — subgraph direction 提取（对齐 flow-db.ts uniqSubgraphList）
// ============================================================

/** 方向语句对象（jison 传入 list 中的 direction 语句） */
interface DirectionStatement {
  stmt: 'dir';
  value: string;
}

/** 从 list 提取 direction 语句（对齐 flow-db.ts uniqSubgraphList 的 direction 提取逻辑） */
function extractDirectionFromList(list: unknown[]): { dir: FlowchartDirection | undefined } {
  for (const item of list.flat()) {
    if (
      item &&
      typeof item === 'object' &&
      'stmt' in item &&
      (item as { stmt: unknown }).stmt === 'dir'
    ) {
      const value = (item as unknown as DirectionStatement).value;
      return { dir: normalizeDirection(value) };
    }
  }
  return { dir: undefined };
}

// ============================================================
// RecognizerCollector — 适配器，实现 FlowDBYY 接口
// ============================================================

/**
 * RecognizerCollector — flowchart 识别数据收集器
 *
 * 实现 FlowDBYY 接口（与 FlowDB 相同的方法签名），但内部产出 RecognizedBlock
 * 而非 mutate 状态（决策10 方案B 适配器模式）。
 *
 * 与 FlowDB 的差异：
 *   - 不维护 vertices/edges/subGraphs 等状态，只维护 blocks 数组
 *   - addVertex/addLink 产出 VertexBlock/EdgeBlock 加入 blocks
 *   - addSubGraph 将 blocks 包装为 SubgraphOpenBlock + blocks + SubgraphCloseBlock
 *   - 其他方法产出对应 block 加入 blocks
 *
 * jison 只支持直接属性，因此所有 jison 调用的方法都在构造函数中 bind。
 */
class RecognizerCollector implements RecognizerYY {
  /**
   * block 栈（恢复决策11 原设计的 PendingList[] 栈结构）
   *
   * - pendingStack[0] 是顶层 scope
   * - enterScope() push 新 scope（subgraph 子内容进入新 scope）
   * - addSubGraph() pop 当前 scope 作为 childBlocks，打包后 push 到外层 scope
   *
   * 这解决了单数组实现中平级 subgraph 被错误嵌套的 bug：
   * 平级 subgraph 各自独立 scope，互不累积。
   */
  private pendingStack: FlowchartRecognizedBlock[][] = [[]];

  /** 边索引（按产出顺序，用于 updateLink/updateLinkInterpolate 数字索引定位） */
  private edges: EdgeBlock[] = [];

  /** subgraph 计数器（自动生成 subgraphId） */
  private subCount = 0;

  /** 首个 graph 标志位（jison 词法分析器判断是否为首个 graph 关键字） */
  private firstGraphFlag = true;

  public lex: { firstGraph: () => boolean };

  constructor() {
    // jison 只支持直接属性，所有 jison 调用的方法都在构造函数中 bind
    this.addVertex = this.addVertex.bind(this);
    this.addLink = this.addLink.bind(this);
    this.destructLink = this.destructLink.bind(this);
    this.addSubGraph = this.addSubGraph.bind(this);
    this.addClass = this.addClass.bind(this);
    this.setClass = this.setClass.bind(this);
    this.setLink = this.setLink.bind(this);
    this.updateLink = this.updateLink.bind(this);
    this.updateLinkInterpolate = this.updateLinkInterpolate.bind(this);
    this.setClickEvent = this.setClickEvent.bind(this);
    this.setTooltip = this.setTooltip.bind(this);
    this.setDirection = this.setDirection.bind(this);
    this.setAccTitle = this.setAccTitle.bind(this);
    this.setAccDescription = this.setAccDescription.bind(this);
    this.setDiagramTitle = this.setDiagramTitle.bind(this);
    this.firstGraph = this.firstGraph.bind(this);
    this.enterScope = this.enterScope.bind(this);

    this.lex = {
      firstGraph: this.firstGraph.bind(this),
    };
  }

  // ============================================================
  // scope 栈管理（pendingStack）
  // ============================================================

  /**
   * 进入 subgraph 作用域（jison subgraphStart 归约时调用）
   *
   * push 新的空 scope 到 pendingStack。
   * 后续 addVertex/addLink 等 push 的 block 进入此 scope。
   * addSubGraph 调用时 pop 此 scope 作为 childBlocks。
   */
  public enterScope(): void {
    this.pendingStack.push([]);
  }

  /**
   * push block 到当前 scope（pendingStack 栈顶）
   *
   * 所有 addVertex/addLink/addClass/setLink 等方法产出 block 时调用此方法，
   * 替代原单数组实现的 this.pushBlock(block)。
   */
  private pushBlock(block: FlowchartRecognizedBlock): void {
    this.pendingStack[this.pendingStack.length - 1].push(block);
  }

  // ============================================================
  // 顶点（节点）相关
  // ============================================================

  /**
   * 添加顶点（jison 调用）
   *
   * jison 复用此方法传递两类语句（flow.jison line 404-465, 558-559）：
   *   1. 顶点定义（A[Hello] / A() / A@{ shape: rect } 等）→ 产出 VertexBlock
   *   2. style 语句（style A fill:#fff）→ 产出 StyleBlock
   *      证据：flow.jison line 558-559 styleStatement 规则调用
   *      yy.addVertex($idString, undefined, undefined, $stylesOpt)
   *      仅 style 参数非空，其他参数全为 undefined
   *
   * 分流判定：textObj === undefined && type === undefined && style 非空
   *   && classes/dir/props/metadata 全为 undefined
   *   （shapeData 路径 metadata 非 undefined，不会误判）
   *
   * 与 FlowDB.addVertex 的差异：
   *   - 不检查 edge 复用（shapeData 边元数据暂不处理，待 Stage 4 决策）
   *   - 不维护 vertices 状态，直接产出 VertexBlock / StyleBlock
   *   - shapeData 的 shape 字段会覆盖 type（通过 mapVertexType 处理）
   *   - shapeData 的其他字段（icon/form/pos/img 等）暂不承载（VertexBlock 未声明）
   */
  public addVertex(
    id: string,
    textObj: FlowText | undefined,
    type: FlowVertexTypeParam,
    style: string[] | undefined,
    classes: string[] | undefined,
    dir: string | undefined,
    props: Record<string, unknown> | undefined,
    metadata: unknown,
  ): void {
    if (!id || id.trim().length === 0) {
      return;
    }

    // 分流：识别 style 语句调用模式（flow.jison line 558-559）
    // styleStatement 调用 yy.addVertex(idString, undefined, undefined, stylesOpt)
    // 判定条件：无 label/type/metadata/classes/dir/props，仅 style 非空
    if (
      textObj === undefined &&
      type === undefined &&
      style !== undefined &&
      style.length > 0 &&
      classes === undefined &&
      dir === undefined &&
      props === undefined &&
      metadata === undefined
    ) {
      // idString 支持 COMMA（flow.jison line 597-611），按逗号拆分多目标
      // 对齐 setClass 的拆分逻辑（line 889）
      const nodeIds = id.split(',');
      const styleBlock: StyleBlock = {
        type: 'style',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        nodeIds,
        styles: style,
      };
      this.pushBlock(styleBlock);
      return;
    }

    // 解析 shapeData YAML 元数据
    const doc = parseShapeData(metadata);

    // shapeData 的 shape 字段覆盖 type
    const effectiveType: FlowVertexTypeParam | string =
      doc?.shape !== undefined ? doc.shape : type;
    const shape = mapVertexType(effectiveType);

    // 提取标签文本
    let label: string | undefined;
    let labelType: FlowLabelType | undefined;
    if (textObj !== undefined) {
      label = stripQuotes(textObj.text);
      labelType = textObj.type;
    } else if (doc?.label !== undefined) {
      // shapeData 的 label 字段（覆盖 textObj）
      label = doc.label;
      labelType = sanitizeLabelType(doc.labelType);
    } else {
      label = undefined; // Converter 阶段会用 id 作为默认 label
    }

    const block: VertexBlock = {
      type: 'vertex',
      sourceLine: undefined, // 决策10 方案B：jison 不提供行号
      rawText: '', // 严重-3 决策：parse 方向 rawText 由 Assembler 生成
      indent: 0, // 由 addSubGraph 递增
      nodeId: id,
      label,
      labelType,
      shape,
      inlineStyles: style ?? [],
      inlineClasses: classes ?? [],
      dir: dir ? normalizeDirection(dir) : undefined,
      props: props ?? undefined,
    };
    this.pushBlock(block);
  }

  // ============================================================
  // 边（链接）相关
  // ============================================================

  /** 判断 linkData 是否为 { id: string }（对齐 flow-db.ts isLinkData） */
  private isLinkData(value: unknown): value is LinkData {
    return (
      value !== null &&
      typeof value === 'object' &&
      'id' in value &&
      typeof (value as LinkData).id === 'string'
    );
  }

  /**
   * 添加边（jison 调用）
   * 支持多对多连接：A & B --> C & D 生成 4 条边
   *
   * 与 FlowDB.addLink 的差异：
   *   - 不维护 edges 状态，产出 EdgeBlock 加入 blocks
   *   - hasSourceVertexDef / hasTargetVertexDef 均设为 false（已知限制）
   */
  public addLink(_start: string[], _end: string[], linkData: unknown): void {
    const id = this.isLinkData(linkData) ? linkData.id.replace('@', '') : undefined;
    const edgeData = linkData as EdgeLinkData;

    for (const start of _start) {
      for (const end of _end) {
        const isLastStart = start === _start[_start.length - 1];
        const isFirstEnd = end === _end[0];
        // 对齐 FlowDB.addLink：只有最后一条边使用用户定义的 ID
        const edgeId = isLastStart && isFirstEnd ? id : undefined;

        const block = this.createEdgeBlock(start, end, edgeData, edgeId);
        this.pushBlock(block);
        this.edges.push(block);
      }
    }
  }

  /** 创建单条 EdgeBlock */
  private createEdgeBlock(
    start: string,
    end: string,
    edgeData: EdgeLinkData,
    edgeId: string | undefined,
  ): EdgeBlock {
    // 提取标签
    let label: string | undefined;
    let labelType: FlowLabelType | undefined;
    if (edgeData.text !== undefined) {
      label = stripQuotes(edgeData.text.text);
      labelType = sanitizeLabelType(edgeData.text.type);
    }

    // 长度限制（对齐 FlowDB.addSingleLink：length > 10 时截断为 10）
    const rawLength = edgeData.length;
    const length =
      rawLength !== undefined ? (rawLength > 10 ? 10 : rawLength) : undefined;

    const block: EdgeBlock = {
      type: 'edge',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      sourceId: start,
      targetId: end,
      hasSourceVertexDef: false, // 已知限制：jison addLink 不提供此信息
      hasTargetVertexDef: false, // 已知限制：jison addLink 不提供此信息
      edgeStyle: mapEdgeStyle(edgeData.type, edgeData.stroke),
      label,
      labelType,
      length,
      edgeId,
      classNames: [], // 行内 class 简写（A --> B:::className）由 setClass 处理
    };
    return block;
  }

  /**
   * 更新边的插值算法（jison 调用）
   * 产出 LinkStyleBlock（target.kind === 'indices' 或 'default'）
   */
  public updateLinkInterpolate(positions: ('default' | number)[], interpolate: string): void {
    // 规范化 positions：jison numList 传入字符串数字，需转换为 number
    const normalized = normalizeLinkStylePositions(positions);

    if (normalized.includes('default')) {
      // default 位置：产出 target.kind === 'default' 的 LinkStyleBlock
      const block: LinkStyleBlock = {
        type: 'linkStyle',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        target: { kind: 'default' },
        styles: [],
        interpolate,
        animate: undefined,
      };
      this.pushBlock(block);
    }

    const indices = normalized.filter((p): p is number => typeof p === 'number');
    if (indices.length > 0) {
      const block: LinkStyleBlock = {
        type: 'linkStyle',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        target: { kind: 'indices', indices },
        styles: [],
        interpolate,
        animate: undefined,
      };
      this.pushBlock(block);
    }
  }

  /**
   * 更新边样式（jison 调用）
   * 产出 LinkStyleBlock（target.kind === 'indices' 或 'default'）
   */
  public updateLink(positions: ('default' | number)[], style: string[]): void {
    // 规范化 positions：jison numList 传入字符串数字，需转换为 number
    const normalized = normalizeLinkStylePositions(positions);

    // 对齐 FlowDB.updateLink：索引越界检查
    for (const pos of normalized) {
      if (typeof pos === 'number' && pos >= this.edges.length) {
        throw new Error(
          `The index ${pos} for linkStyle is out of bounds. Valid indices for linkStyle are between 0 and ${
            this.edges.length - 1
          }.`,
        );
      }
    }

    // 对齐 FlowDB.updateLink：如果 style 中没有 fill，添加 fill:none
    const normalizedStyle = [...style];
    if (normalizedStyle.length > 0 && !normalizedStyle.some((s) => s?.startsWith('fill'))) {
      normalizedStyle.push('fill:none');
    }

    if (normalized.includes('default')) {
      const block: LinkStyleBlock = {
        type: 'linkStyle',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        target: { kind: 'default' },
        styles: normalizedStyle,
        interpolate: undefined,
        animate: undefined,
      };
      this.pushBlock(block);
    }

    const indices = normalized.filter((p): p is number => typeof p === 'number');
    if (indices.length > 0) {
      const block: LinkStyleBlock = {
        type: 'linkStyle',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        target: { kind: 'indices', indices },
        styles: normalizedStyle,
        interpolate: undefined,
        animate: undefined,
      };
      this.pushBlock(block);
    }
  }

  // ============================================================
  // classDef 相关
  // ============================================================

  /**
   * 添加 classDef（jison 调用）
   * 对齐 FlowDB.addClass：将 \, 转义为 §§§，, 转为 ;，再还原 §§§ 为 ,
   */
  public addClass(ids: string, _style: string[]): void {
    const style = _style
      .join()
      .replace(/\\,/g, '§§§')
      .replace(/,/g, ';')
      .replace(/§§§/g, ',')
      .split(';');

    // 对齐 FlowDB.addClass：color 相关样式同时加入 textStyles
    const textStyles: string[] = [];
    const normalStyles: string[] = [];
    for (const s of style) {
      if (/color/.exec(s)) {
        const newStyle = s.replace('fill', 'bgFill');
        textStyles.push(newStyle);
      }
      normalStyles.push(s);
    }

    // ids 可能是逗号分隔多个（对齐 FlowDB.addClass）
    for (const className of ids.split(',')) {
      const block: ClassDefBlock = {
        type: 'classDef',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        className,
        styles: normalStyles,
        textStyles,
      };
      this.pushBlock(block);
    }
  }

  /**
   * 应用 classDef 到节点/边/subgraph（jison 调用）
   * 产出 ClassApplyBlock
   */
  public setClass(ids: string, className: string): void {
    const nodeIds = ids.split(',');
    const block: ClassApplyBlock = {
      type: 'class-apply',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      nodeIds,
      className,
    };
    this.pushBlock(block);
  }

  // ============================================================
  // 方向相关
  // ============================================================

  /**
   * 设置图表方向（jison 调用）
   * 产出 DirectionBlock
   */
  public setDirection(dir: string): void {
    const normalized = normalizeDirection(dir);
    if (normalized === undefined) {
      return;
    }
    const block: DirectionBlock = {
      type: 'direction',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      dir: normalized,
    };
    this.pushBlock(block);
  }

  // ============================================================
  // 链接（href）相关
  // ============================================================

  /**
   * 设置链接（jison 调用）
   * 产出 ClickBlock（link/linkTarget 字段）
   * 对齐 FlowDB.setLink：同时调用 setClass(ids, 'clickable')
   */
  public setLink(ids: string, linkStr: string, target: string): void {
    for (const nodeId of ids.split(',')) {
      const block: ClickBlock = {
        type: 'click',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        nodeId,
        functionName: undefined,
        functionArgs: undefined,
        link: linkStr,
        linkTarget: target,
        tooltip: undefined,
      };
      this.pushBlock(block);
    }
    // 对齐 FlowDB.setLink：同时应用 clickable class
    this.setClass(ids, 'clickable');
  }

  // ============================================================
  // tooltip 相关
  // ============================================================

  /**
   * 设置 tooltip（jison 调用）
   * 产出 ClickBlock（tooltip 字段）
   *
   * 与 FlowDB.setTooltip 的差异：
   *   - FlowDB 维护 tooltips Map，Converter 阶段从 Map 读取
   *   - RecognizerCollector 产出 ClickBlock，Converter 阶段从 ClickBlock 读取
   */
  public setTooltip(ids: string, tooltip: string): void {
    if (tooltip === undefined) {
      return;
    }
    for (const nodeId of ids.split(',')) {
      const block: ClickBlock = {
        type: 'click',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        nodeId,
        functionName: undefined,
        functionArgs: undefined,
        link: undefined,
        linkTarget: undefined,
        tooltip,
      };
      this.pushBlock(block);
    }
  }

  // ============================================================
  // click 事件相关
  // ============================================================

  /**
   * 设置 click 事件（jison 调用）
   * 产出 ClickBlock（functionName/functionArgs 字段）
   * 对齐 FlowDB.setClickEvent：同时调用 setClass(ids, 'clickable')
   */
  public setClickEvent(ids: string, functionName: string, functionArgs: string): void {
    for (const nodeId of ids.split(',')) {
      const block: ClickBlock = {
        type: 'click',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        nodeId,
        functionName: functionName || undefined,
        functionArgs: functionArgs || undefined,
        link: undefined,
        linkTarget: undefined,
        tooltip: undefined,
      };
      this.pushBlock(block);
    }
    // 对齐 FlowDB.setClickEvent：同时应用 clickable class
    this.setClass(ids, 'clickable');
  }

  // ============================================================
  // subgraph 相关
  // ============================================================

  /**
   * 添加 subgraph（jison 调用）
   *
   * pendingStack 机制（决策11 栈结构实现）：
   *   jison subgraphStart 归约时已调用 enterScope() push 新 scope。
   *   subgraph 内部的 addVertex/addLink 等 block 已进入该 scope。
   *   addSubGraph 调用时 pop 该 scope 作为 childBlocks，
   *   为 childBlocks 递增 indent（+2），
   *   创建 SubgraphOpenBlock + SubgraphCloseBlock（indent=0），
   *   打包 [openBlock, ...childBlocks, closeBlock] push 到外层 scope。
   *
   * 平级 subgraph：各自独立 scope，互不累积，打包后都在外层 scope 中平级。
   * 嵌套 subgraph：内层 subgraph 先 addSubGraph pop 内层 scope 打包，
   *   外层 addSubGraph pop 外层 scope（含内层打包结果）打包，自动累加 indent。
   *
   * @returns subgraphId（用于 jison 后续引用）
   */
  public addSubGraph(
    _id: { text: string } | undefined,
    list: unknown[],
    _title: { text: string; type: string } | undefined,
  ): string {
    let id: string | undefined = _id?.text.trim();
    let title = _title?.text;

    // 对齐 FlowDB.addSubGraph：当 id 和 title 是同一对象且 title 含空格时，id 置空
    if (_id === _title && _title && /\s/.exec(_title.text)) {
      id = undefined;
    }

    // 从 list 提取 direction 语句（对齐 FlowDB.uniqSubgraphList）
    const { dir } = extractDirectionFromList(list);
    const hasExplicitDir = dir !== undefined;

    id = id ?? 'subGraph' + this.subCount;
    title = title || '';
    this.subCount = this.subCount + 1;

    // pop 当前 scope 作为 childBlocks（enterScope 时 push 的空数组）
    // 前置不变量校验：每个 addSubGraph 必须对应一个 enterScope（栈深 >= 2）
    // 若失配说明 jison 规则被破坏，立即暴露而非静默兜底
    const rawChildBlocks = this.pendingStack.pop();
    if (rawChildBlocks === undefined) {
      throw new Error(
        'pendingStack underflow: addSubGraph called without matching enterScope ' +
          '(stack depth=0, expected >=1 after pop)',
      );
    }
    // 为 childBlocks 递增 indent（+2）
    const childBlocks = rawChildBlocks.map((b) => ({
      ...b,
      indent: b.indent + 2,
    }));

    // 创建 SubgraphOpenBlock（indent=0，由外层 addSubGraph 递增）
    const openBlock: SubgraphOpenBlock = {
      type: 'subgraph-open',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      subgraphId: id,
      title: title.trim(),
      classNames: [], // setClass 调用时更新（通过 ClassApplyBlock）
      hasExplicitDir,
      dir,
    };

    // 创建 SubgraphCloseBlock（indent=0，由外层 addSubGraph 递增）
    const closeBlock: SubgraphCloseBlock = {
      type: 'subgraph-close',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      subgraphId: id,
    };

    // 打包 [openBlock, ...childBlocks, closeBlock] push 到外层 scope
    const packagedBlocks: FlowchartRecognizedBlock[] = [
      openBlock,
      ...childBlocks,
      closeBlock,
    ];
    this.pendingStack[this.pendingStack.length - 1].push(...packagedBlocks);

    return id;
  }

  // ============================================================
  // 边类型解析（destructLink）
  // ============================================================

  /** 解析边语法（jison 调用，对齐 flow-db.ts destructLink） */
  public destructLink(_str: string, _startStr?: string): FlowLink {
    return destructLink(_str, _startStr);
  }

  // ============================================================
  // accTitle / accDescription / diagramTitle
  // ============================================================

  /** 设置无障碍标题（jison 调用） */
  public setAccTitle(title: string): void {
    const block: AccTitleBlock = {
      type: 'accTitle',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      accTitle: title,
    };
    this.pushBlock(block);
  }

  /** 设置无障碍描述（jison 调用） */
  public setAccDescription(desc: string): void {
    const block: AccDescriptionBlock = {
      type: 'accDescription',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      accDescription: desc,
    };
    this.pushBlock(block);
  }

  /** 设置图表标题（jison 调用） */
  public setDiagramTitle(title: string): void {
    const block: TitleBlock = {
      type: 'title',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      title,
    };
    this.pushBlock(block);
  }

  // ============================================================
  // lex（jison 词法分析器调用）
  // ============================================================

  /** 首次调用返回 true（用于 jison 词法分析器判断是否为首个 graph 关键字） */
  public firstGraph(): boolean {
    if (this.firstGraphFlag) {
      this.firstGraphFlag = false;
      return true;
    }
    return false;
  }

  // ============================================================
  // 公共 API
  // ============================================================

  /**
   * 获取收集的 block 列表（返回顶层 scope）
   *
   * 前置不变量：解析结束时 pendingStack 应只剩 1 个元素（顶层 scope）。
   * 若栈深 > 1 说明有未关闭的 subgraph（enterScope 未被 addSubGraph 配对 pop），
   * 立即暴露而非返回不完整数据。
   */
  public getBlocks(): readonly FlowchartRecognizedBlock[] {
    if (this.pendingStack.length !== 1) {
      throw new Error(
        `pendingStack invariant violated: expected depth=1 after parse, got ${this.pendingStack.length} ` +
          '(unclosed subgraph or enterScope/addSubGraph mismatch)',
      );
    }
    return this.pendingStack[0];
  }
}

// ============================================================
// FlowchartRecognizer — 实现 IBlockRecognizer
// ============================================================

/**
 * flowchart 识别器
 *
 * 单一职责：将 Mermaid flowchart 代码识别为 FlowchartRecognizedBlock[] 流
 *
 * 数据流：
 *   code → preprocessCode（清理 frontmatter/指令/注释，保持行号一致）
 *        → flowJisonParser.parse(code) [yy=RecognizerCollector]
 *        → RecognizerCollector 收集 block
 *        → getBlocks() 返回 FlowchartRecognizedBlock[]
 *
 * 预处理对齐 flowchart-parser.ts 的 parseFlowchartCode：
 *   - preprocessCode 清理 frontmatter/指令/注释（替换为等长换行）
 *   - 去除右花括号后的尾随空格（对齐官方 flowParser.ts）
 *   - 若 source 不以换行结尾，补充换行符（jison 语法要求）
 *
 * 注释/空行 block 的处理：
 *   jison parser 不识别注释（%% ...）和空行，preprocessCode 会将它们替换为等长换行。
 *   因此 Recognizer 无法通过适配器产出 CommentBlock/BlankBlock。
 *   决策14 已说 serialize 方向不保留注释/空行，parse 方向也不产出（已知限制）。
 */
export class FlowchartRecognizer implements IBlockRecognizer {
  /**
   * 识别代码产出 block 流
   *
   * @param code - Mermaid flowchart 源代码（可含 %% 注释、%%{directive}%%、frontmatter）
   * @returns 识别块流（忠实产出 jison 能识别的所有 block，不含注释/空行）
   */
  recognize(code: string): readonly FlowchartRecognizedBlock[] {
    const collector = new RecognizerCollector();

    // 将 RecognizerCollector 实例作为 yy 传入 parser
    flowJisonParser.yy = collector;

    // 预处理：清理 frontmatter/指令/注释（替换为等长换行，保持行号一致）
    const preprocessedSource = preprocessCode(code);
    // 对齐官方 flowParser.ts：去除右花括号后的尾随空格
    const processedSource = preprocessedSource.replace(/}\s*\n/g, '}\n');
    // jison 语法要求 GRAPH DIR 后必须有 FirstStmtSeparator（NEWLINE/SEMI/SPACE），
    // 若 source 不以换行结尾，补充一个换行符避免 EOF 解析错误
    const normalizedSource = processedSource.endsWith('\n')
      ? processedSource
      : processedSource + '\n';

    try {
      flowJisonParser.parse(normalizedSource);
    } finally {
      // 重置 parser.yy，避免泄漏到下次 recognize 调用（对齐 flowchart-parser.ts）
      flowJisonParser.yy = {};
    }

    return collector.getBlocks();
  }
}
