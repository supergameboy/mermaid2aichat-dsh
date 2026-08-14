/**
 * 宿主运行时面声明（最小契约）— 仅类型，构建期不依赖 @deepseek-ai/* 发布产物。
 * 运行时这些包从 profile node_modules 的 healed 回退解析（包清单 dependencies 声明）。
 */

declare module '@deepseek-ai/dsh-tools' {
  export interface ToolRunContext {
    signal: AbortSignal
  }
  export function defineTool(options: {
    name: string
    description: string
    parameters: unknown
    output: {
      schema: unknown
      render(args: unknown, value: unknown): unknown[]
    }
    execute?: (args: unknown, exec: ToolRunContext) => Promise<unknown>
  }): unknown
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 宿主工具注册表面（全局层，每个 agent 可见）。 */
    tools: { register(definition: unknown): () => void }
  }
}
