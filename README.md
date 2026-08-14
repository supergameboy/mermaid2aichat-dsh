# mermaid2aichat-dsh — Mermaid 反向编辑器（DeepSeek Harness 插件）

把 [Mermaid 反向编辑器](https://github.com/) 迁移为 DeepSeek Harness（dsh）的浏览器插件：
在 dsh 前端右侧提供一个**可关闭的编辑器面板**，可视化编辑图表并双向同步 Mermaid 代码。

只迁移四种图表类型：**flowchart（流程图）、sequenceDiagram（时序图）、classDiagram（类图）、erDiagram（ER 图）**。
编辑器 UI 是核心，**不需要 MCP / 服务端 / VSCode 插件**——插件直接与 dsh 通信。

## 功能特性

- 右侧可关闭面板：侧边栏底部按钮打开/关闭；**页面内全屏**（⧉ 全屏，覆盖整个页面，
  非浏览器全屏）解决画布显示区域过小的问题
- **多标签管理**：新建（+）/ 切换 / 关闭（确认弹窗）/ 双击重命名 / 拖拽排序，
  每个标签独立持有画布、代码与视口，整值持久化
- 可视化编辑 + Mermaid 代码双向同步（画布编辑 → 代码；代码编辑 → 画布）
- 四种图表类型切换（工具栏下拉或代码首行修改，弹窗确认）
- 节点库拖拽添加、连线、属性面板、子图/命名空间/实体/参与者等专用编辑器
- **双向 Mermaid 代码传输**（插件核心需求，与 Agent 直接通信）：
  - 编辑器 → 对话：「发送到对话」把活动标签的代码块送入当前会话
  - 对话 → 编辑器：响应式扫描当前会话中的 ```mermaid 代码块（AI 产出或用户消息），
    侧边栏按钮角标提示，「从对话导入」一键解析为新标签，用户查看/编辑后发回 Agent 反馈
- 画布与代码整值持久化到 localStorage，刷新/重开面板自动恢复
- 独立暗色模式（仅作用于面板内部，不影响 dsh 主题）

## 架构

一个 npm 包同时是两种角色：

1. **bundle（补丁层）**：`dsh.bundle.patch` 指向 `cordis.patch.yml`，
   它把插件注册为一行 `dsh.client` 组合。安装后 `dsh-client-modules` 扫描该行、
   注入 `window.__DSH_BOOT__`，前端按需加载 `lib/client.js`。
2. **client 插件（浏览器半边）**：注册两个界面贡献——
   - `sidebar.footer.action`：启动按钮
   - `shell.overlay`：右侧浮动编辑器面板（共享一个 store 句柄）

通信路径（无 MCP / 无服务端）：

```
编辑器画布 ──onCanvasChange──▶ 共享 store（localStorage 持久化，多标签）
共享 store ──「发送到对话」──▶ ctx.sessions.scope(id).conversation.send()
对话会话 ──blocks 可观测源──▶ useBlocks() ──「从对话导入」──▶ 解析为新标签
```

对话 → 编辑器方向：`blocks.ts` 订阅当前会话的 ConversationSnapshot（`ctx.sessions.list` +
`binding(id).session`），扫描消息中的 ```mermaid 代码块，经槽位 inject 的 hooks 仓
绑定为 `useBlocks` 选择器钩子，响应式驱动角标、提示与导入下拉。

编辑器与序列化器源码内联在 `lib/client.js` 中（`@xyflow/react`、`dagre-cluster-fix`、
`js-yaml` 全部打包进 bundle；react 等平台模块由 dsh shell 的模块表提供）。

```
src/
  index.ts              节点半边（空插件体，供宿主 Loader 加载）
  client/               DSH 插件（面板 + 启动按钮 + store + 对话桥接）
  editor/               编辑器 UI（画布、工具栏、节点库、属性面板、代码编辑器）
  serializer/           解析/序列化器（4 种图表类型的 jison 解析器 + 序列化器）
cordis.patch.yml        bundle 补丁层
lib/                    构建产物（已提交，git 安装开箱即用）
```

## 安装

### 方式一：npm 安装（推荐）

```sh
dsh plugin --profile web add mermaid2aichat-dsh
```

### 方式二：本地目录安装（开发调试）

```sh
dsh plugin --profile web add <本仓库路径>
```

### 方式三：GitHub 安装

```sh
dsh plugin --profile web add github:<你的账号>/mermaid-dsh-plugin
```

> 仓库内已提交 `lib/` 构建产物，git 安装无需构建脚本即可使用。
> 若 pnpm 因 prepare 脚本阻止构建，按提示在
> `$DSH_HOME/profiles/web/pnpm-workspace.yaml` 的 `allowBuilds` 中放行该包，或改用方式一。

安装后重启 `dsh web`，刷新页面即可在侧边栏底部看到「Mermaid 编辑器」按钮。

## 开发

```sh
pnpm install      # 安装依赖
pnpm run build    # 构建 lib/index.js（节点半边）+ lib/client.js（浏览器半边）
pnpm run typecheck
pnpm run watch    # tsdown 监听重建
```

修改源码后必须重新 `pnpm run build` 并重启 `dsh web`（构建产物是 `lib/client.js`，
dsh 服务端在启动时扫描）。

## 发布到 GitHub / npm

1. 推送本仓库到 GitHub（`lib/` 已提交，安装方无需构建）。
2. 发布到 npm（会自动先构建）：

```sh
npm publish
```

3. 之后用户即可用 `dsh plugin --profile web add mermaid2aichat-dsh` 一键安装。

## 已知限制

- 仅支持 flowchart / sequenceDiagram / classDiagram / erDiagram 四种图表类型；
  其它类型（state、gantt、mindmap 等）的代码已移除，解析时会提示不支持。
- 「从对话导入」只扫描当前会话**已加载的消息窗口**；消息分页之外的旧消息
  需先上滑加载历史后才会被扫描到。
- 客户端 bundle 体积较大（内联了 React Flow 等全部编辑器依赖），首次加载面板时
  由浏览器按需拉取。
