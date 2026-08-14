import type { ParseError } from './types.js';

/**
 * 错误收集器 — 解析错误收集、定位、反馈
 * 宽容模式：收集错误但不中断解析
 */
export class ErrorCollector {
  private errors: ParseError[] = [];

  add(error: ParseError): void {
    this.errors.push(error);
  }

  addError(line: number, column: number, message: string, context?: string): void {
    this.errors.push({ line, column, message, severity: 'error', context });
  }

  addWarning(line: number, column: number, message: string, context?: string): void {
    this.errors.push({ line, column, message, severity: 'warning', context });
  }

  getErrors(): ParseError[] {
    return [...this.errors];
  }

  hasErrors(): boolean {
    return this.errors.some((e) => e.severity === 'error');
  }

  hasWarnings(): boolean {
    return this.errors.some((e) => e.severity === 'warning');
  }

  clear(): void {
    this.errors = [];
  }

  getSummary(): { errors: number; warnings: number; total: number } {
    const errors = this.errors.filter((e) => e.severity === 'error').length;
    const warnings = this.errors.filter((e) => e.severity === 'warning').length;
    return { errors, warnings, total: this.errors.length };
  }
}
