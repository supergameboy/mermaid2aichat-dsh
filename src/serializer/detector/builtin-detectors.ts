/**
 * 内置 detector 定义 — 12 种图表类型
 *
 * 单一职责：定义各图表类型的 detector 函数和优先级
 *
 * 参考来源:
 *   - mermaid-develop 官方各图的 detector.ts / architectureDetector.ts
 *
 * 优先级规则:
 *   - 带后缀的关键字（architecture-beta, xychart-beta, stateDiagram-v2）合并到同 type 的 detector
 *   - flowchart/graph 别名最常见，优先级适中
 *   - 所有 detector 使用 ^\s*keyword 正则，支持前导空格
 *
 * 注意：同一 DiagramType 只能注册一个 detector（DetectorRegistry 按 type 去重），
 *       带后缀和不带后缀的关键字必须合并到同一个 detector 函数中。
 */

import type { DiagramDetector, DetectorRecord } from './detector-registry.js';

// ============================================================
// 辅助函数
// ============================================================

/**
 * 创建关键字 detector
 * 匹配代码开头（支持前导空白）是否以指定关键字开始
 */
function keywordDetector(keyword: string): DiagramDetector {
  const regex = new RegExp(`^\\s*${escapeRegex(keyword)}\\b`);
  return (text: string): boolean => regex.test(text);
}

/** 转义正则特殊字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 创建多关键字 detector（匹配任意一个关键字）
 * 用于合并带后缀和不带后缀的关键字（如 stateDiagram-v2 和 stateDiagram）
 */
function multiKeywordDetector(keywords: readonly string[]): DiagramDetector {
  const escaped = keywords.map(escapeRegex);
  // 使用非捕获分组，按关键字长度降序排列（长关键字优先匹配）
  const sorted = [...escaped].sort((a, b) => b.length - a.length);
  const regex = new RegExp(`^\\s*(?:${sorted.join('|')})\\b`);
  return (text: string): boolean => regex.test(text);
}

// ============================================================
// 12 种图表类型 detector 定义
// ============================================================

/**
 * 内置 detector 列表（按优先级排序）
 *
 * 优先级说明:
 *   - 10: 带后缀关键字的图类型（合并带后缀和不带后缀的 detector）
 *   - 20: 常见图类型（flowchart/graph）
 *   - 30: 其他图类型
 *
 * 注意：同一 DiagramType 只出现一次，避免 DetectorRegistry 覆盖
 */
export const BUILTIN_DETECTORS: readonly DetectorRecord[] = [
  // === 带后缀关键字的图类型（优先级 10，合并带后缀和不带后缀）===
  {
    type: 'architecture',
    detector: multiKeywordDetector(['architecture-beta', 'architecture']),
    priority: 10,
  },
  {
    type: 'stateDiagram',
    detector: multiKeywordDetector(['stateDiagram-v2', 'stateDiagram']),
    priority: 10,
  },
  {
    type: 'xychart',
    detector: multiKeywordDetector(['xychart-beta', 'xychart']),
    priority: 10,
  },

  // === 常见图类型（优先级 20）===
  {
    type: 'flowchart',
    detector: (text: string): boolean => /^\s*(?:flowchart|graph)\b/.test(text),
    priority: 20,
  },

  // === 其他图类型（优先级 30）===
  {
    type: 'sequenceDiagram',
    detector: keywordDetector('sequenceDiagram'),
    priority: 30,
  },
  {
    type: 'classDiagram',
    detector: keywordDetector('classDiagram'),
    priority: 30,
  },
  {
    type: 'erDiagram',
    detector: keywordDetector('erDiagram'),
    priority: 30,
  },
  {
    type: 'mindmap',
    detector: keywordDetector('mindmap'),
    priority: 30,
  },
  {
    type: 'gantt',
    detector: keywordDetector('gantt'),
    priority: 30,
  },
  {
    type: 'pie',
    detector: keywordDetector('pie'),
    priority: 30,
  },
  {
    type: 'timeline',
    detector: keywordDetector('timeline'),
    priority: 30,
  },
  {
    type: 'quadrantChart',
    detector: keywordDetector('quadrantChart'),
    priority: 30,
  },
];
