import { describe, it, expect } from 'vitest';
import { migrateCanvasState, createEmptyCanvasState, isGraphCanvasState } from './types.js';

describe('migrateCanvasState', () => {
  it('应保留 flowchart 画布中的 rawCode', () => {
    const rawCode = 'flowchart TD\n  A[开始] --> B[结束]\n  %% 用户注释\n';
    const original = {
      ...createEmptyCanvasState('flowchart'),
      rawCode,
    };
    const migrated = migrateCanvasState(original);
    expect(isGraphCanvasState(migrated)).toBe(true);
    expect(migrated.rawCode).toBe(rawCode);
  });

  it('应保留所有 12 种图表类型的 rawCode', () => {
    const rawCode = '%% 原始代码\n';
    const diagramTypes = [
      'flowchart',
      'sequenceDiagram',
      'classDiagram',
      'erDiagram',
      'mindmap',
      'stateDiagram',
      'architecture',
      'gantt',
      'pie',
      'timeline',
      'quadrantChart',
      'xychart',
    ] as const;

    for (const type of diagramTypes) {
      const original = { ...createEmptyCanvasState(type), rawCode };
      const migrated = migrateCanvasState(original);
      expect(migrated.diagramType).toBe(type);
      expect(migrated.rawCode).toBe(rawCode);
    }
  });

  it('无 rawCode 时不应添加 undefined 字段', () => {
    const original = createEmptyCanvasState('flowchart');
    const migrated = migrateCanvasState(original);
    expect(Object.prototype.hasOwnProperty.call(migrated, 'rawCode')).toBe(false);
  });

  it('旧版无 diagramType 数据迁移时应保留 rawCode', () => {
    const rawCode = 'graph TD\n  A --> B\n';
    const legacy = {
      nodes: [],
      edges: [],
      direction: 'TD',
      rawCode,
    };
    const migrated = migrateCanvasState(legacy);
    expect(migrated.diagramType).toBe('flowchart');
    expect(migrated.rawCode).toBe(rawCode);
  });

  it('应保留图结构画布的 needsLayout 标志', () => {
    const original = {
      ...createEmptyCanvasState('flowchart'),
      needsLayout: true,
    };
    const migrated = migrateCanvasState(original);
    expect(isGraphCanvasState(migrated)).toBe(true);
    if (isGraphCanvasState(migrated)) {
      expect(migrated.needsLayout).toBe(true);
    }
  });

  it('无 needsLayout 时不应添加 undefined 字段', () => {
    const original = createEmptyCanvasState('flowchart');
    const migrated = migrateCanvasState(original);
    expect(Object.prototype.hasOwnProperty.call(migrated, 'needsLayout')).toBe(false);
  });
});
