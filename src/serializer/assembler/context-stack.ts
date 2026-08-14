/**
 * ContextStack — 显式栈实现（决策2；M3 重构 L2-1 泛型化）
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 5；M3 重构 L2-1（泛型化 TScopeId + 字段重命名 subgraphId → scopeId）
 *
 * 职责：维护嵌套作用域状态（subgraph/namespace/未来其他嵌套），提供 LIFO 校验
 * - openBlock（subgraph-open / namespace-open）→ push({ indent, scopeId })
 * - closeBlock（subgraph-close / namespace-close）→ pop() + scopeId 匹配校验
 *
 * 不用于计算输出缩进（block.indent 已由 ConverterRegistry.serialize DFS 设置）。
 * currentIndent() 仅为调试/验证便利方法。
 *
 * 栈非空不变式（P3-3 清理后明确）：
 *   - 构造函数初始化默认帧 → frames 永不为空
 *   - pop() 有 underflow 检查 → length <= 1 时 throw，不会清空数组
 *   - current() 无需 fallback，直接返回栈顶（程序错误不可包容）
 *
 * 程序错误不可包容（code-standards 第5章）：空栈 pop 抛出错误。
 *
 * M3 重构 L2-1（验证后修订 [一-8][一-9]）：
 *   - 泛型化 `ContextStack<TScopeId = string>`，覆盖 subgraphId/namespaceId/未来其他嵌套 ID
 *   - 字段重命名 `subgraphId` → `scopeId`（语义泛化）
 *   - 方法名对齐现有源码：current/currentIndent/push/pop/depth（不引入 peek/size）
 *
 * 模块边界：仅依赖 ./types.js，不引用 React/DOM。
 */

import type { IContextStack, StackFrame } from './types.js';

export class ContextStack<TScopeId = string> implements IContextStack<TScopeId> {
  private readonly frames: StackFrame<TScopeId>[];

  constructor() {
    // 初始化默认帧 {indent:0, scopeId:undefined}，栈永不为空
    this.frames = [{ indent: 0, scopeId: undefined }];
  }

  current(): StackFrame<TScopeId> {
    // 栈永不为空（构造函数初始化 + pop underflow 检查），直接返回栈顶
    // P3-3 清理：移除冗余 ?? DEFAULT_FRAME fallback（fallback 掩盖程序错误）
    return this.frames[this.frames.length - 1];
  }

  currentIndent(): string {
    return ' '.repeat(this.current().indent);
  }

  push(frame: StackFrame<TScopeId>): void {
    this.frames.push(frame);
  }

  pop(): StackFrame<TScopeId> {
    if (this.frames.length <= 1) {
      throw new Error(
        'ContextStack.pop: stack underflow — close block without matching open block',
      );
    }
    const frame = this.frames.pop();
    if (frame === undefined) {
      // 类型守卫：Array.prototype.pop() 返回 T | undefined，length > 1 保证非空但 TS 无法推断
      throw new Error(
        'ContextStack.pop: stack invariant violated — pop returned undefined',
      );
    }
    return frame;
  }

  depth(): number {
    return this.frames.length - 1;
  }
}
