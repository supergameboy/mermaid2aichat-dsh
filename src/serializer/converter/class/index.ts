/**
 * class Converter 注册入口 — 12 种 ClassBlockConverterEntry 注册
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块2-转换器.md
 * 阶段：M3 重构 L2-10
 *
 * 数据流：
 *   parse 方向：ClassConverterRegistry.parseBlocks 按 block.type 路由到对应 Converter.parseBlock
 *   serialize 方向：ClassConverterRegistry.serialize 从 canvas 扫描产出 block
 *
 * 注册表职责：
 *   - 提供 12 种 ClassBlockConverterEntry（按 ClassBlockType 完整覆盖）
 *   - 通用 registry.ts 按 diagramType 路由到此注册表
 *
 * 设计模式（对齐 flowchart/index.ts）：
 *   - Converter 单例在 index.ts 实例化（无状态可复用）
 *   - ClassConverterRegistry 构造函数消费 classConverterEntries 构建查找表
 *   - index.ts ↔ registry.ts 通过 `import type` 打破运行时循环依赖
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、各 *-converter.js，不引用 React/DOM。
 */

import type { ClassBlockConverterEntry } from './registry.js';
import { ClassConverter } from './class-converter.js';
import { RelationConverter } from './relation-converter.js';
import { NoteConverter } from './note-converter.js';
import {
  NamespaceCloseConverter,
  NamespaceOpenConverter,
} from './namespace-converter.js';
import {
  ClassApplyConverter,
  ClassDefConverter,
  StyleConverter,
} from './style-converter.js';
import { DirectionConverter } from './direction-converter.js';
import {
  AccDescriptionConverter,
  AccTitleConverter,
} from './title-converter.js';
import { ClickConverter } from './click-converter.js';

// ============================================================
// class Converter 实例（单例，无状态可复用）
// ============================================================

const classConverter = new ClassConverter();
const relationConverter = new RelationConverter();
const noteConverter = new NoteConverter();
const namespaceOpenConverter = new NamespaceOpenConverter();
const namespaceCloseConverter = new NamespaceCloseConverter();
const classApplyConverter = new ClassApplyConverter();
const styleConverter = new StyleConverter();
const classDefConverter = new ClassDefConverter();
const clickConverter = new ClickConverter();
const directionConverter = new DirectionConverter();
const accTitleConverter = new AccTitleConverter();
const accDescriptionConverter = new AccDescriptionConverter();

// ============================================================
// class Converter 注册表（12 种 ClassBlockConverterEntry 完整覆盖）
// ============================================================

/**
 * class Converter 注册表
 *
 * 按 ClassBlockType 完整覆盖 12 种 ClassBlockConverterEntry：
 *   - 产出型（4）：class/relation/note/namespace-open → IModelBlockConverter 双向
 *   - 结构型（1）：namespace-close → ISideEffectBlockConverter 仅 parse
 *   - 指令型（2）：class-apply/style → ISideEffectBlockConverter 仅 parse
 *   - 全局指令型（5）：classDef/click/direction/accTitle/accDescription → ISideEffectBlockConverter 仅 parse
 *
 * ClassConverterRegistry 构造函数消费此数组构建 blockType → entry 查找表，
 * dispatchParse 按 block.type 收窄分发，requireConverter 函数重载返回精确 Converter 类型。
 */
export const classConverterEntries: readonly ClassBlockConverterEntry[] = [
  { type: 'class', converter: classConverter },
  { type: 'relation', converter: relationConverter },
  { type: 'note', converter: noteConverter },
  { type: 'namespace-open', converter: namespaceOpenConverter },
  { type: 'namespace-close', converter: namespaceCloseConverter },
  { type: 'class-apply', converter: classApplyConverter },
  { type: 'style', converter: styleConverter },
  { type: 'classDef', converter: classDefConverter },
  { type: 'click', converter: clickConverter },
  { type: 'direction', converter: directionConverter },
  { type: 'accTitle', converter: accTitleConverter },
  { type: 'accDescription', converter: accDescriptionConverter },
];
