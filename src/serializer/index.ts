/**
 * Mermaid 序列化器 — 全量入口（Node.js）
 *
 * 单一职责：re-export browser.ts 的全部导出
 *
 * 架构:
 *   - browser.ts: 浏览器安全入口，导出全部内容（类型、序列化器、工具、DB 类、
 *     jison 解析器、专用解析器、serializeMermaid、parseMermaid、detectDiagramType）
 *   - index.ts: 全量入口，re-export browser.ts
 *
 * 架构变更（2026-06-22）:
 *   jison 0.4.18 生成的 CJS 代码已由 compile-jison.mts 后处理为 ESM，
 *   所有解析器改用静态 import，不再依赖 node:module/node:url/node:path。
 *   因此 browser.ts 与 index.ts 导出内容完全一致。
 *   保留入口分离是为了 package.json exports 的条件导出架构，
 *   为未来可能出现的 Node.js 专属代码预留。
 *
 * 消费者通过 package.json exports 条件自动路由:
 *   - 浏览器（Vite）→ browser 条件 → dist/browser.js
 *   - Node.js（server）→ import 条件 → dist/index.js
 */

export * from './browser.js';
