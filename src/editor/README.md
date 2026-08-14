# packages/editor/src

## 用途

React Flow 画布组件库，提供 Mermaid 各图表类型的可视化渲染和编辑能力，供 `web-editor` 和 `vscode-extension` 共用。

## 文件命名规则

- 画布组件：`{type}-canvas.tsx`（如 `graph-canvas.tsx`、`gantt-canvas.tsx`）
- 通用组件：`components/{name}.tsx`（如 `property-panel.tsx`、`tab-bar.tsx`、`toolbar.tsx`）
- 图表类型组件：`components/{diagramType}/`（如 `components/flowchart/`、`components/sequence/`）
- 节点组件：`nodes/{diagramType}/`
- 边组件：`edges/{diagramType}/`
- 自定义 Hooks：`hooks/use-{name}.ts`
- 布局算法：`layouts/{algorithm}.ts`
- 专用渲染逻辑：`{diagramType}/`（如 `sequence/`、`gantt/`）
- 服务：`services/{name}.ts`
- 类型声明：`types/{name}.d.ts`
- 包入口：`index.ts`

## 禁止放置

- MCP 工具实现（属于 `packages/server`）
- WebSocket 服务端逻辑（属于 `packages/server`）
- 直接操作 Store 的代码（客户端通过 WebSocket 同步）
- 引用 `packages/server` 或 `packages/vscode-extension`（违反模块边界）
