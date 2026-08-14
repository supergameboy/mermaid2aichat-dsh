/**
 * jison 模块类型声明
 * jison ^0.4.18 没有官方 @types/jison，此处提供最小类型声明
 *
 * 实测 jison 模块导出：
 *   { Jison, version, print, LR0Generator, LALRGenerator, SLRGenerator,
 *     LR1Generator, LLGenerator, Generator, Parser }
 *
 * 官方推荐使用 `Parser` 类（兼容 LALR/LL 等多种语法）
 */

declare module 'jison' {
  /** jison Parser 类（生成解析器 + 解析输入） */
  export class Parser {
    constructor(grammar: string | object);
    /** 解析输入字符串 */
    parse(input: string): unknown;
    /** 生成解析器源代码 */
    generate(options?: {
      moduleType?: 'es' | 'cjs' | 'amd' | 'umd';
      moduleName?: string;
      parserType?: string;
    }): string;
  }

  /** 兼容别名（旧代码可能使用 JisonParser 名称） */
  export { Parser as JisonParser };
}
