/**
 * er Converter 注册入口 — 10 种 ErBlockConverterEntry 注册
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块2-转换器.md
 * 阶段：模块2 L2-10
 *
 * 数据流：
 *   parse 方向：ErConverterRegistry.parseBlocks 按 block.type 路由到对应 Converter.parseBlock
 *   serialize 方向：ErConverterRegistry.serialize 从 canvas 扫描产出 block
 *
 * 注册表职责：
 *   - 提供 10 种 ErBlockConverterEntry（按 ErBlockType 完整覆盖）
 *   - 通用 registry.ts 按 diagramType 路由到此注册表
 *
 * 设计模式（对齐 flowchart/class/index.ts）：
 *   - Converter 单例在 index.ts 实例化（无状态可复用）
 *   - ErConverterRegistry 构造函数消费 erConverterEntries 构建查找表
 *   - index.ts ↔ registry.ts 通过 `import type` 打破运行时循环依赖
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、各 *-converter.js，不引用 React/DOM。
 */

import type { ErBlockConverterEntry } from './registry.js';
import { ErEntityConverter } from './entity-converter.js';
import { ErRelationshipConverter } from './relationship-converter.js';
import {
  ErSubgraphCloseConverter,
  ErSubgraphOpenConverter,
} from './subgraph-converter.js';
import {
  ErClassApplyConverter,
  ErClassDefConverter,
  ErStyleConverter,
} from './style-converter.js';
import { ErDirectionConverter } from './direction-converter.js';
import {
  ErAccDescriptionConverter,
  ErAccTitleConverter,
} from './title-converter.js';

// ============================================================
// er Converter 实例（单例，无状态可复用）
// ============================================================

const entityConverter = new ErEntityConverter();
const relationshipConverter = new ErRelationshipConverter();
const subgraphOpenConverter = new ErSubgraphOpenConverter();
const subgraphCloseConverter = new ErSubgraphCloseConverter();
const classApplyConverter = new ErClassApplyConverter();
const styleConverter = new ErStyleConverter();
const classDefConverter = new ErClassDefConverter();
const directionConverter = new ErDirectionConverter();
const accTitleConverter = new ErAccTitleConverter();
const accDescriptionConverter = new ErAccDescriptionConverter();

// ============================================================
// er Converter 注册表（10 种 ErBlockConverterEntry 完整覆盖）
// ============================================================

/**
 * er Converter 注册表
 *
 * 按 ErBlockType 完整覆盖 10 种 ErBlockConverterEntry：
 *   - 产出型（3）：entity/relationship/subgraph-open → IModelBlockConverter 双向
 *   - 结构型（1）：subgraph-close → ISideEffectBlockConverter 仅 parse
 *   - 指令型（2）：class-apply/style → ISideEffectBlockConverter 仅 parse
 *   - 全局指令型（4）：classDef/direction/accTitle/accDescription → ISideEffectBlockConverter 仅 parse
 *
 * ErConverterRegistry 构造函数消费此数组构建 blockType → entry 查找表，
 * dispatchParse 按 block.type 收窄分发，requireConverter 函数重载返回精确 Converter 类型。
 */
export const erConverterEntries: readonly ErBlockConverterEntry[] = [
  { type: 'entity', converter: entityConverter },
  { type: 'relationship', converter: relationshipConverter },
  { type: 'subgraph-open', converter: subgraphOpenConverter },
  { type: 'subgraph-close', converter: subgraphCloseConverter },
  { type: 'class-apply', converter: classApplyConverter },
  { type: 'style', converter: styleConverter },
  { type: 'classDef', converter: classDefConverter },
  { type: 'direction', converter: directionConverter },
  { type: 'accTitle', converter: accTitleConverter },
  { type: 'accDescription', converter: accDescriptionConverter },
];
