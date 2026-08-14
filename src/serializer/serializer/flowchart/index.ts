/**
 * flowchart 序列化器入口
 *
 * 统一导出 flowchart 序列化相关的公共 API
 *
 * Stage 6 切换：serializeFlowchart 已移除（顶级 serializeMermaid 改用 assemble 新路径）。
 * incremental-serializer 已删除（决策1：违反单一数据源 + fallback 掩盖缺陷，
 * 格式保留职责由新 Assembler 通过 block.rawText + ContextStack 承接）。
 * 此处保留 vertex/edge/subgraph/style/click 子序列化器导出，
 * 供 vertex-converter/edge-converter 等内部模块复用。
 */

export { serializeVertex, serializeVertexClassSuffix } from './vertex-serializer.js';
export { serializeEdge } from './edge-serializer.js';
export { serializeSubgraph } from './subgraph-serializer.js';
export {
  serializeClassDefs,
  serializeClassApplications,
  serializeNodeStyles,
  serializeLinkStyles,
} from './style-serializer.js';
export { serializeClickEvents } from './click-serializer.js';
