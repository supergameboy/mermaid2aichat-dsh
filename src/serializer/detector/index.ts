/**
 * Detector 模块入口 — 图表类型识别统一入口
 *
 * 单一职责：提供 detectDiagramType 统一入口，预处理代码后按优先级匹配 detector
 *
 * 数据流:
 *   detectDiagramType(code)
 *     → preprocessCode(code)        // 去 frontmatter/指令/注释
 *     → detectorRegistry.match(text) // 按优先级正则匹配
 *     → DiagramType | null
 *
 * 参考来源:
 *   - mermaid-develop/packages/mermaid/src/diagram-api/detectType.ts
 */

import type { DiagramType } from '../types.js';
import { detectorRegistry } from './detector-registry.js';
import { preprocessCode } from './preprocessor.js';
import { BUILTIN_DETECTORS } from './builtin-detectors.js';

// ============================================================
// 模块初始化
// ============================================================

/** 标记内置 detector 是否已注册（防止重复注册） */
let builtinRegistered = false;

/**
 * 注册所有内置 detector（模块初始化时调用）
 * 幂等：重复调用不会重复注册
 */
export function registerBuiltinDetectors(): void {
  if (builtinRegistered) return;
  detectorRegistry.registerAll(BUILTIN_DETECTORS);
  builtinRegistered = true;
}

// 模块加载时自动注册内置 detector
registerBuiltinDetectors();

// ============================================================
// 统一入口
// ============================================================

/**
 * 从代码检测图表类型（统一入口）
 *
 * 流程:
 *   1. 空代码返回 null
 *   2. 预处理（去 frontmatter/指令/注释）
 *   3. 按优先级匹配 detector
 *
 * @param code - 原始 Mermaid 代码
 * @returns 匹配的 DiagramType，无匹配返回 null
 */
export function detectDiagramType(code: string): DiagramType | null {
  const trimmed = code.trim();
  if (trimmed.length === 0) return null;

  const preprocessed = preprocessCode(code);
  return detectorRegistry.match(preprocessed);
}

// ============================================================
// 导出
// ============================================================

export type { DiagramDetector, DetectorRecord, DetectorRegistry } from './detector-registry.js';
export { detectorRegistry } from './detector-registry.js';
export { preprocessCode } from './preprocessor.js';
export { BUILTIN_DETECTORS } from './builtin-detectors.js';
