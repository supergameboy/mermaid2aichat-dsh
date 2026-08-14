/**
 * Detector 注册表 — 参考官方 mermaid detectType.ts
 *
 * 单一职责：管理所有图表类型的 detector，按优先级匹配
 *
 * 数据流:
 *   preprocessCode(code) → DetectorRegistry.match(code) → DiagramType | null
 *
 * 参考来源:
 *   - mermaid-develop/packages/mermaid/src/diagram-api/detectType.ts
 */

import type { DiagramType } from '../types.js';

// ============================================================
// 类型定义
// ============================================================

/**
 * DiagramDetector 函数类型
 * 对齐官方 DiagramDetector: (text: string, config?) => boolean
 * 简化版：不依赖 config（本项目不需要 config 区分 detector）
 */
export type DiagramDetector = (text: string) => boolean;

/**
 * Detector 注册记录
 */
export interface DetectorRecord {
  /** 图表类型 */
  readonly type: DiagramType;
  /** detector 函数 */
  readonly detector: DiagramDetector;
  /** 优先级（数字越小优先级越高，默认 100） */
  readonly priority: number;
}

// ============================================================
// DetectorRegistry 实现
// ============================================================

/**
 * Detector 注册表（单一数据源）
 *
 * 设计要点:
 *   - 按 priority 排序，priority 相同按注册顺序
 *   - match() 遍历所有 detector，第一个返回 true 的胜出
 *   - 支持重复注册（后注册覆盖同 type 的旧记录）
 */
export class DetectorRegistry {
  /** 内部存储：type → record 映射（去重） */
  private readonly records = new Map<DiagramType, DetectorRecord>();

  /**
   * 注册 detector
   * 同 type 重复注册会覆盖旧记录
   */
  register(record: DetectorRecord): void {
    const normalized: DetectorRecord = {
      type: record.type,
      detector: record.detector,
      priority: record.priority ?? 100,
    };
    this.records.set(record.type, normalized);
  }

  /**
   * 批量注册
   */
  registerAll(records: readonly DetectorRecord[]): void {
    for (const record of records) {
      this.register(record);
    }
  }

  /**
   * 匹配图表类型（按优先级顺序）
   *
   * @param text - 预处理后的代码
   * @returns 匹配的 DiagramType，无匹配返回 null
   */
  match(text: string): DiagramType | null {
    const sorted = this.getSortedRecords();
    for (const record of sorted) {
      if (record.detector(text)) {
        return record.type;
      }
    }
    return null;
  }

  /**
   * 获取所有已注册 detector（按优先级排序，用于调试/测试）
   */
  getAll(): readonly DetectorRecord[] {
    return this.getSortedRecords();
  }

  /**
   * 获取按优先级排序的 record 列表
   */
  private getSortedRecords(): readonly DetectorRecord[] {
    return Array.from(this.records.values()).sort((a, b) => a.priority - b.priority);
  }
}

// ============================================================
// 全局实例
// ============================================================

/** 全局 detector 注册表实例（单一数据源） */
export const detectorRegistry = new DetectorRegistry();
