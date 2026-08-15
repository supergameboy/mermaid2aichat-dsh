/**
 * Round-trip golden 测试 — 官方语法 fixtures 的解析/序列化回归
 *
 * - 已实现类型：parse(fixture) 成功 → serialize → 再 parse → 再 serialize，
 *   断言幂等（第二轮与第一轮一致）与关键字检测一致
 * - 计划内类型（PLAN.md P0 后仍开发中）：parse 优雅失败（success:false，
 *   消息含「开发中」），断言不崩溃、不误判、检测器正常识别
 *
 * fixtures 均为官方 mermaid 语法的规范样例（参照 mermaid-develop 官方仓库）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMermaid } from './parse-dispatcher.js';
import { serializeMermaid } from './serialize-dispatcher.js';
import { detectDiagramType } from './detector/index.js';
import { createEmptyCanvasState } from './types.js';
import type { DiagramType } from './types.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}.mmd`, import.meta.url), 'utf-8');
}

const IMPLEMENTED: Array<[string, DiagramType]> = [
  ['flowchart', 'flowchart'],
  ['sequence', 'sequenceDiagram'],
  ['class', 'classDiagram'],
  ['er', 'erDiagram'],
];

const PLANNED: Array<[string, DiagramType]> = [
  ['state', 'stateDiagram'],
  ['mindmap', 'mindmap'],
  ['architecture', 'architecture'],
  ['gantt', 'gantt'],
  ['pie', 'pie'],
  ['timeline', 'timeline'],
  ['quadrant', 'quadrantChart'],
  ['xychart', 'xychart'],
];

describe('已实现类型 round-trip 幂等', () => {
  for (const [name, type] of IMPLEMENTED) {
    it(`${type} (${name})`, () => {
      const code = fixture(name);
      const first = parseMermaid(code);
      expect(first.success, first.errors?.map((e) => e.message).join('; ')).toBe(true);
      expect(first.canvas.diagramType).toBe(type);
      expect(detectDiagramType(code)).toBe(type);

      const firstSerialized = serializeMermaid(first.canvas);
      expect(firstSerialized.errors.length).toBe(0);

      const second = parseMermaid(firstSerialized.mermaid);
      expect(second.success).toBe(true);
      const secondSerialized = serializeMermaid(second.canvas);
      // 幂等：第二轮序列化与第一轮完全一致
      expect(secondSerialized.mermaid).toBe(firstSerialized.mermaid);
    });
  }
});

describe('计划内类型：优雅失败（开发中）', () => {
  for (const [name, type] of PLANNED) {
    it(`${type} (${name})`, () => {
      const code = fixture(name);
      // 检测器已识别该类型（types.ts 与 detector 覆盖全部 12 种）
      expect(detectDiagramType(code)).toBe(type);

      const result = parseMermaid(code);
      expect(result.success).toBe(false);
      expect(result.errors[0]?.message).toContain('开发中');

      // 同类型空状态序列化同样报「开发中」
      const serialized = serializeMermaid(createEmptyCanvasState(type));
      expect(serialized.errors[0]?.message).toContain('开发中');
    });
  }
});
