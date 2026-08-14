/**
 * flowchart Converter 注册表 — 15 种 BlockConverterEntry 注册
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 4
 *
 * 数据流：
 *   parse 方向：ConverterRegistry.parseBlocks 按 block.type 路由到对应 Converter.parseBlock
 *   serialize 方向：ConverterRegistry.serialize 从 canvas 扫描产出 block
 *
 * 注册表职责：
 *   - 提供 15 种 BlockConverterEntry（按 FlowchartBlockType 完整覆盖）
 *   - 通用 registry.ts 按 diagramType 路由到此注册表
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../types.js、./types.js、各 *-converter.js，不引用 React/DOM。
 */

import type { BlockConverterEntry } from '../registry.js';
import { ClickConverter } from './click-converter.js';
import {
  AccDescriptionConverter,
  AccTitleConverter,
  TitleConverter,
} from './title-converter.js';
import { DirectionConverter } from './direction-converter.js';
import {
  ClassApplyConverter,
  ClassDefConverter,
  LinkStyleConverter,
  StyleConverter,
} from './style-converter.js';
import {
  SubgraphCloseConverter,
  SubgraphOpenConverter,
} from './subgraph-converter.js';
import { EdgeConverter } from './edge-converter.js';
import { VertexConverter } from './vertex-converter.js';

// ============================================================
// flowchart Converter 实例（单例，无状态可复用）
// ============================================================

const vertexConverter = new VertexConverter();
const edgeConverter = new EdgeConverter();
const subgraphOpenConverter = new SubgraphOpenConverter();
const subgraphCloseConverter = new SubgraphCloseConverter();
const classDefConverter = new ClassDefConverter();
const classApplyConverter = new ClassApplyConverter();
const styleConverter = new StyleConverter();
const linkStyleConverter = new LinkStyleConverter();
const clickConverter = new ClickConverter();
const directionConverter = new DirectionConverter();
const titleConverter = new TitleConverter();
const accTitleConverter = new AccTitleConverter();
const accDescriptionConverter = new AccDescriptionConverter();

// ============================================================
// flowchart Converter 注册表（15 种 BlockConverterEntry 完整覆盖）
// ============================================================

/**
 * flowchart Converter 注册表
 *
 * 按 FlowchartBlockType 完整覆盖 15 种 BlockConverterEntry：
 *   - 产出型（3）：vertex/edge/subgraph-open → IModelBlockConverter 双向
 *   - 结构型（1）：subgraph-close → ISideEffectBlockConverter 仅 parse
 *   - 指令型（3）：class-apply/style/linkStyle → ISideEffectBlockConverter 仅 parse
 *   - 全局指令型（6）：classDef/click/direction/title/accTitle/accDescription → ISideEffectBlockConverter 仅 parse
 *   - 格式保留型（2）：comment/blank → ISideEffectBlockConverter 仅 parse（无副作用）
 *
 * comment/blank 的 Converter 为 no-op 实现（parse 时无副作用，仅 Assembler 输出 rawText）。
 * 设计-实现差异#5：jison parser 不识别注释/空行，parse 方向不会产出，但保留接口契约完整。
 */
export const flowchartConverterEntries: readonly BlockConverterEntry[] = [
  { type: 'vertex', converter: vertexConverter },
  { type: 'edge', converter: edgeConverter },
  { type: 'subgraph-open', converter: subgraphOpenConverter },
  { type: 'subgraph-close', converter: subgraphCloseConverter },
  { type: 'classDef', converter: classDefConverter },
  { type: 'class-apply', converter: classApplyConverter },
  { type: 'style', converter: styleConverter },
  { type: 'linkStyle', converter: linkStyleConverter },
  { type: 'click', converter: clickConverter },
  { type: 'direction', converter: directionConverter },
  { type: 'title', converter: titleConverter },
  { type: 'accTitle', converter: accTitleConverter },
  { type: 'accDescription', converter: accDescriptionConverter },
  // 格式保留型：无副作用 Converter（parse 时 no-op）
  { type: 'comment', converter: { parseBlock: () => {} } },
  { type: 'blank', converter: { parseBlock: () => {} } },
];
