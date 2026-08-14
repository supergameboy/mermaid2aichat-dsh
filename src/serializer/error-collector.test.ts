/**
 * ErrorCollector 测试 — 错误/警告收集、hasErrors、hasWarnings
 *
 * 重点验证 hasErrors() 仅检查 error 级别（不含 warning）— 设计文档 P1 决策
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorCollector } from './error-collector.js';

describe('ErrorCollector', () => {
  let collector: ErrorCollector;

  beforeEach(() => {
    collector = new ErrorCollector();
  });

  describe('addError / addWarning', () => {
    it('should add error via addError', () => {
      collector.addError(1, 5, '语法错误');
      const errors = collector.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({
        line: 1,
        column: 5,
        message: '语法错误',
        severity: 'error',
        context: undefined,
      });
    });

    it('should add warning via addWarning', () => {
      collector.addWarning(2, 10, '兼容性警告');
      const errors = collector.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe('warning');
    });

    it('should add error with context', () => {
      collector.addError(1, 1, '错误', '上下文行');
      expect(collector.getErrors()[0].context).toBe('上下文行');
    });

    it('should add via add() with full ParseError object', () => {
      collector.add({
        line: 3,
        column: 7,
        message: '完整错误',
        severity: 'error',
      });
      expect(collector.getErrors()).toHaveLength(1);
    });
  });

  describe('hasErrors — 仅检查 error 级别', () => {
    it('should return false when empty', () => {
      expect(collector.hasErrors()).toBe(false);
    });

    it('should return false when only warnings', () => {
      collector.addWarning(1, 1, '警告');
      expect(collector.hasErrors()).toBe(false);
    });

    it('should return true when has errors', () => {
      collector.addError(1, 1, '错误');
      expect(collector.hasErrors()).toBe(true);
    });

    it('should return true when has both errors and warnings', () => {
      collector.addError(1, 1, '错误');
      collector.addWarning(2, 2, '警告');
      expect(collector.hasErrors()).toBe(true);
    });

    it('should not count warnings as errors', () => {
      collector.addWarning(1, 1, '警告1');
      collector.addWarning(2, 2, '警告2');
      collector.addWarning(3, 3, '警告3');
      expect(collector.hasErrors()).toBe(false);
    });
  });

  describe('hasWarnings', () => {
    it('should return false when empty', () => {
      expect(collector.hasWarnings()).toBe(false);
    });

    it('should return false when only errors', () => {
      collector.addError(1, 1, '错误');
      expect(collector.hasWarnings()).toBe(false);
    });

    it('should return true when has warnings', () => {
      collector.addWarning(1, 1, '警告');
      expect(collector.hasWarnings()).toBe(true);
    });
  });

  describe('getErrors', () => {
    it('should return a copy (not internal reference)', () => {
      collector.addError(1, 1, '错误');
      const errors1 = collector.getErrors();
      const errors2 = collector.getErrors();
      expect(errors1).not.toBe(errors2);
      expect(errors1).toEqual(errors2);
    });

    it('should preserve insertion order', () => {
      collector.addError(1, 1, '第一');
      collector.addWarning(2, 2, '第二');
      collector.addError(3, 3, '第三');
      const errors = collector.getErrors();
      expect(errors[0].message).toBe('第一');
      expect(errors[1].message).toBe('第二');
      expect(errors[2].message).toBe('第三');
    });
  });

  describe('clear', () => {
    it('should clear all errors and warnings', () => {
      collector.addError(1, 1, '错误');
      collector.addWarning(2, 2, '警告');
      collector.clear();
      expect(collector.getErrors()).toHaveLength(0);
      expect(collector.hasErrors()).toBe(false);
      expect(collector.hasWarnings()).toBe(false);
    });
  });

  describe('getSummary', () => {
    it('should return zero summary when empty', () => {
      expect(collector.getSummary()).toEqual({ errors: 0, warnings: 0, total: 0 });
    });

    it('should count errors and warnings separately', () => {
      collector.addError(1, 1, '错误1');
      collector.addError(2, 2, '错误2');
      collector.addWarning(3, 3, '警告1');
      expect(collector.getSummary()).toEqual({ errors: 2, warnings: 1, total: 3 });
    });

    it('should reflect clear state', () => {
      collector.addError(1, 1, '错误');
      collector.clear();
      expect(collector.getSummary()).toEqual({ errors: 0, warnings: 0, total: 0 });
    });
  });
});
