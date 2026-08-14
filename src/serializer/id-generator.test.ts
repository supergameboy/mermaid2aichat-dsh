/**
 * ID 生成器测试 — 26 进制编码、唯一性、register、registerMany、isUsed、getUsedIds
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IdGenerator } from './id-generator.js';

describe('IdGenerator', () => {
  let gen: IdGenerator;

  beforeEach(() => {
    gen = new IdGenerator();
  });

  describe('generate() — 基本生成', () => {
    it('should generate A as first ID', () => {
      expect(gen.generate()).toBe('A');
    });

    it('should generate sequential IDs A, B, C', () => {
      expect(gen.generate()).toBe('A');
      expect(gen.generate()).toBe('B');
      expect(gen.generate()).toBe('C');
    });

    it('should generate Z then AA (26th then 27th)', () => {
      for (let i = 0; i < 25; i++) {
        gen.generate();
      }
      expect(gen.generate()).toBe('Z');
      expect(gen.generate()).toBe('AA');
    });

    it('should generate AB after AA', () => {
      for (let i = 0; i < 26; i++) {
        gen.generate();
      }
      expect(gen.generate()).toBe('AA');
      expect(gen.generate()).toBe('AB');
    });

    it('should generate AZ then BA', () => {
      for (let i = 0; i < 51; i++) {
        gen.generate();
      }
      expect(gen.generate()).toBe('AZ');
      expect(gen.generate()).toBe('BA');
    });
  });

  describe('register() — 预注册 ID', () => {
    it('should skip registered IDs', () => {
      gen.register('A');
      gen.register('B');
      // 第一个未注册的是 C
      expect(gen.generate()).toBe('C');
    });

    it('should skip registered IDs across ranges', () => {
      gen.register('A');
      gen.register('AA');
      // A 被注册，下一个是 B
      expect(gen.generate()).toBe('B');
    });

    it('should allow registering same ID multiple times (idempotent)', () => {
      gen.register('A');
      gen.register('A');
      expect(gen.generate()).toBe('B');
    });
  });

  describe('registerMany() — 批量注册', () => {
    it('should register multiple IDs at once', () => {
      gen.registerMany(['A', 'B', 'C']);
      // A/B/C 被注册，第一个未注册的是 D
      expect(gen.generate()).toBe('D');
    });

    it('should handle empty array', () => {
      gen.registerMany([]);
      expect(gen.generate()).toBe('A');
    });

    it('should be idempotent for duplicate IDs', () => {
      gen.registerMany(['A', 'A', 'B', 'B']);
      expect(gen.generate()).toBe('C');
    });

    it('should register IDs across ranges', () => {
      gen.registerMany(['A', 'Z', 'AA']);
      // A 被注册，下一个是 B
      expect(gen.generate()).toBe('B');
    });
  });

  describe('isUsed() — 检查 ID 是否已使用', () => {
    it('should return false for unused ID', () => {
      expect(gen.isUsed('A')).toBe(false);
    });

    it('should return true for registered ID', () => {
      gen.register('A');
      expect(gen.isUsed('A')).toBe(true);
    });

    it('should return true for generated ID', () => {
      gen.generate(); // 生成 A
      expect(gen.isUsed('A')).toBe(true);
      expect(gen.isUsed('B')).toBe(false);
    });

    it('should return true for registerMany IDs', () => {
      gen.registerMany(['X', 'Y', 'Z']);
      expect(gen.isUsed('X')).toBe(true);
      expect(gen.isUsed('Y')).toBe(true);
      expect(gen.isUsed('Z')).toBe(true);
      expect(gen.isUsed('W')).toBe(false);
    });
  });

  describe('getUsedIds() — 获取所有已注册 ID', () => {
    it('should return empty set for fresh generator', () => {
      const used = gen.getUsedIds();
      expect(used.size).toBe(0);
    });

    it('should return registered IDs', () => {
      gen.register('A');
      gen.register('B');
      const used = gen.getUsedIds();
      expect(used.size).toBe(2);
      expect(used.has('A')).toBe(true);
      expect(used.has('B')).toBe(true);
    });

    it('should include generated IDs', () => {
      gen.generate(); // A
      gen.generate(); // B
      const used = gen.getUsedIds();
      expect(used.size).toBe(2);
      expect(used.has('A')).toBe(true);
      expect(used.has('B')).toBe(true);
    });

    it('should return a copy (modifying result does not affect generator)', () => {
      gen.register('A');
      const used = gen.getUsedIds();
      used.add('EXTERNAL');
      // 修改副本不应影响原生成器
      expect(gen.isUsed('EXTERNAL')).toBe(false);
      expect(gen.isUsed('A')).toBe(true);
    });

    it('should be empty after reset', () => {
      gen.register('A');
      gen.generate();
      gen.reset();
      expect(gen.getUsedIds().size).toBe(0);
    });
  });

  describe('reset() — 重置', () => {
    it('should reset counter and used IDs', () => {
      gen.generate();
      gen.generate();
      gen.register('X');
      gen.reset();
      expect(gen.generate()).toBe('A');
    });

    it('should allow reusing IDs after reset', () => {
      gen.generate();
      gen.reset();
      expect(gen.generate()).toBe('A');
    });
  });

  describe('唯一性保证', () => {
    it('should never generate duplicate IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(gen.generate());
      }
      expect(ids.size).toBe(100);
    });

    it('should avoid registered IDs in bulk generation', () => {
      gen.register('A');
      gen.register('B');
      gen.register('C');
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const id = gen.generate();
        expect(id).not.toBe('A');
        expect(id).not.toBe('B');
        expect(id).not.toBe('C');
        ids.add(id);
      }
      expect(ids.size).toBe(50);
    });
  });
});
