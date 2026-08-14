/**
 * services 目录入口 — 画布↔代码转换服务 + 画布变更发射器
 *
 * 单一职责：导出 editor 包内部的转换与发射服务
 *
 * 设计依据：Stage 7（editor CodeConverter + CanvasEmitter 服务）
 *
 * 模块边界：仅引用 @mermaid2aichat/serializer，不引用 React/DOM/MCP/WS。✅
 */

export {
  type CodeConverter,
  createCodeConverter,
} from './code-converter.js';

export {
  type CanvasEmitter,
  type CanvasChangePayload,
  createCanvasEmitter,
} from './canvas-emitter.js';

export {
  type IdGenerator,
  createIdGenerator,
  idGenerator,
} from './id-generator.js';

export {
  type CreateCodeChangeHandlerOptions,
  createCodeChangeHandler,
} from './code-change-handler.js';
