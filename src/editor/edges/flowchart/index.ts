/**
 * flowchart 边组件注册表 — 统一导出边组件、marker 定义、配置
 */
export { FlowchartEdgeComponent, flowchartEdgeTypes } from './flowchart-edge.js';
export {
  FlowchartEdgeMarkers,
  getEdgeStyleConfig,
  toMarkerUrl,
  EDGE_STYLE_CONFIG,
  type EdgeStyleConfig,
  type MarkerKind,
} from './edge-markers.js';
