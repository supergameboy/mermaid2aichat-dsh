/**
 * Mermaid 反向编辑器 — 节点半边。
 *
 * 注册模型工具 mermaid_load：AI 把 Mermaid 代码送入浏览器编辑器面板。
 * 工具注册在宿主平面（全局层），每个会话的 agent 都可见，无需修改
 * agent preset。工具结果以 ```mermaid 代码块文本返回，客户端插件通过
 * 对话扫描通道识别该工具结果并自动导入为新标签。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { parseMermaid } from './serializer/index.js'

/** 插件名（诊断用）。 */
export const name = 'mermaid2aichat-dsh'

/** 硬依赖：宿主工具注册表面。 */
export const inject = ['tools']

/** mermaid_load 工具定义：参数/输出均为纯 JSON Schema 规格。 */
const MERMAID_LOAD_TOOL = defineTool({
  name: 'mermaid_load',
  description:
    '把 Mermaid 图表代码发送到浏览器的 Mermaid 反向编辑器面板，'
    + '用户可以在编辑器中查看、修改图表，再把修改后的代码发回对话。'
    + '仅支持 flowchart / sequenceDiagram / classDiagram / erDiagram 四种图表类型。',
  parameters: {
    code: {
      type: 'string',
      required: true,
      description: '完整的 mermaid 图表代码（不带 ``` 围栏）',
    },
    title: {
      type: 'string',
      description: '图表标题（可选，作为编辑器标签名）',
    },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true },
        diagramType: { type: 'string', required: true },
        message: { type: 'string', required: true },
      },
    },
    render(args: unknown, value: unknown): { type: 'text'; text: string }[] {
      const a = args as { code: string }
      const v = value as { ok: boolean; diagramType: string; message: string }
      if (!v.ok) return [{ type: 'text', text: `Mermaid 代码解析失败：${v.message}` }]
      return [{
        type: 'text',
        text: `已发送到 Mermaid 编辑器（${v.diagramType}）：\n\`\`\`mermaid\n${a.code}\n\`\`\``,
      }]
    },
  },
  async execute(args: unknown): Promise<{ ok: boolean; diagramType: string; message: string }> {
    const a = args as { code: string }
    const parsed = parseMermaid(a.code)
    if (!parsed.success) {
      const first = parsed.errors[0]
      return {
        ok: false,
        diagramType: '',
        message: first !== undefined ? `${first.line}:${first.column} ${first.message}` : '未知解析错误',
      }
    }
    return {
      ok: true,
      diagramType: parsed.canvas.diagramType,
      message: '已发送到 Mermaid 编辑器',
    }
  },
})

/** 宿主插件体：注册 mermaid_load 工具（随 fiber 销毁自动移除）。 */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.tools.register(MERMAID_LOAD_TOOL),
    'mermaid2aichat-dsh: mermaid_load tool',
  )
}
