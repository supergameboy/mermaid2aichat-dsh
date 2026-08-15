# mermaid2aichat-dsh — Mermaid 反向编辑器（DeepSeek Harness 插件）

把 [Mermaid 反向编辑器](https://github.com/) 迁移为 DeepSeek Harness（dsh）的浏览器插件：
在 dsh 前端右侧提供一个**可关闭的编辑器面板**，可视化编辑图表并双向同步 Mermaid 代码。

只迁移四种图表类型：**flowchart（流程图）、sequenceDiagram（时序图）、classDiagram（类图）、erDiagram（ER 图）**。
编辑器 UI 是核心，**不需要 MCP / 服务端 / VSCode 插件**——插件直接与 dsh 通信。

## 功能特性

- 右侧可关闭面板：侧边栏底部按钮打开/关闭；**页面内全屏**（⧉ 全屏，覆盖整个页面，
  非浏览器全屏）解决画布显示区域过小的问题
- **聊天区让位 + 可调宽度（零宿主改动）**：布局控制器在 shell 网格上追加独立编辑器列，
  聊天区自动缩宽、不遮挡对话内容（与 dsh 侧边栏、会话详情列并存，互不遮蔽）；
  列间把手可拖动调整宽度（300–1200px，聊天区始终保留 ≥400px），双击把手复位
- **响应式紧凑模式**：编辑器宽度不足（< 480px）时自动隐藏左右侧面板，只显示画布；
  头部「▥ 紧凑」按钮可随时手动切换
- **会话隔离**：编辑器自动跟随当前会话，标签页按会话分别存储与切换——
  切换 dsh 会话时面板自动切换到该会话自己的标签
- **多标签管理**：新建（+）/ 切换 / 关闭（确认弹窗）/ 双击重命名 / 拖拽排序，
  每个标签独立持有画布、代码与视口，整值持久化
- 可视化编辑 + Mermaid 代码双向同步（画布编辑 → 代码；代码编辑 → 画布）
- 四种图表类型切换（工具栏下拉或代码首行修改，弹窗确认）
- 节点库拖拽添加、连线、属性面板、子图/命名空间/实体/参与者等专用编辑器
- **双向 Mermaid 代码传输**（插件核心需求，与 Agent 直接通信）：
  - **AI → 编辑器（工具通道）**：注册模型工具 `mermaid_load`（宿主全局层，
    无需修改 preset），AI 调用工具后代码**自动导入**为编辑器新标签
  - 对话 → 编辑器：响应式扫描当前会话中的 ```mermaid 代码块（AI 消息/用户消息/工具结果），
    侧边栏按钮角标提示，「从对话导入」一键解析为新标签
  - 编辑器 → 对话：「发送到对话」把活动标签的代码块送入当前会话（SessionFace.prompt）
  - **输入框引用**：在 dsh 输入框输入 `/`，触发菜单的「mermaid」组列出当前会话的
    标签页，选中即把该标签的 Mermaid 代码块插入草稿
- 画布与代码整值持久化到 localStorage，刷新/重开面板自动恢复
- 独立暗色模式（仅作用于面板内部，不影响 dsh 主题）

## 架构

一个 npm 包同时是三种角色：

1. **bundle（补丁层）**：`dsh.bundle.patch` 指向 `cordis.patch.yml`，
   它把插件注册为一行 `dsh.client` 组合。安装后 `dsh-client-modules` 扫描该行、
   注入 `window.__DSH_BOOT__`，前端按需加载 `lib/client.js`。
2. **host 插件（节点半边）**：注册模型工具 `mermaid_load`（`ctx.tools.register`，
   全局层，每个会话的 agent 可见）。
3. **client 插件（浏览器半边）**：注册两个界面贡献 + 一个输入触发源 + 一个 DOM 布局控制器——
   - `sidebar.footer.action`：启动按钮（未读代码块角标）
   - `shell.overlay`：编辑器面板入口（闭 → 空；全屏 → 浮层；开 → portal 进网格列）
   - `inputTriggers`：'/' 触发源「mermaid」（输入框引用标签页代码）
   - `client/layout.ts`：**不修改 dsh 源码**，用 MutationObserver 镜像 shell 的
     行内 `grid-template-columns` 并追加编辑器轨（参照 dsh-web-ui 的
     aionui-panel 方案），自绘拖拽把手与宽度钳制

通信路径（无 MCP / 无服务端）：

```
编辑器画布 ──onCanvasChange──▶ 状态源 state.ts（localStorage 持久化，按会话隔离）
状态源 ──「发送到对话」──▶ SessionFace.prompt('queue')
AI 工具 mermaid_load ──执行──▶ 工具结果（```mermaid 文本）──▶ blocks 源扫描 ──▶ 自动导入
对话会话 ──blocks 可观测源──▶ useBlocks() ──「从对话导入」──▶ 解析为新标签
输入框 '/' ──触发源「mermaid」──▶ 当前会话标签页 ──▶ 插入代码块到草稿
```

状态层（`client/state.ts`）是自研可观测源：面板、启动按钮、触发源与代码块自动导入
共享同一实例；`blocks.ts` 订阅当前会话的 ConversationSnapshot 扫描 mermaid 代码块
（含 `mermaid_load` 工具结果，自动导入为新标签）。

编辑器与序列化器源码内联在 `lib/client.js` 中（`@xyflow/react`、`dagre-cluster-fix`、
`js-yaml` 全部打包进 bundle；react 等平台模块由 dsh shell 的模块表提供）。

```
src/
  index.ts              节点半边（注册模型工具 mermaid_load）
  client/               DSH 插件（状态源 + 面板 + 启动按钮 + 触发源 + 对话扫描）
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

安装后重启 `dsh web`（模型工具 mermaid_load 在宿主启动时注册，必须重启生效），
刷新页面即可在侧边栏底部看到「Mermaid 编辑器」按钮。

### 试用 AI 工具通道

在对话中对 Agent 说「把 XXX 的流程画成 flowchart 送到编辑器」——
Agent 调用 `mermaid_load` 工具后，图表会**自动**出现在编辑器的新标签页中，
并且**面板会自动打开**展示它（面板关闭时同样生效），无需任何手动导入。

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
- 输入框引用（`/` 触发源）只能替换草稿为代码块（产品输入机的公开写入面是
  `setDraft` 语义），不能追加到已有草稿尾部。
- 编辑器列宽度持久化只在拖拽、双击复位与窗口尺寸变化时回写；侧边栏/详情列
  开关只影响当次显示宽度，不修改偏好（窗口变宽后自动恢复，与 dsh 自身的
  布局偏好语义一致）。

### 布局实现说明（为什么不需要改 dsh）

编辑器列是**布局控制器在 DOM 层追加的第 4 条网格轨**：镜像 shell 写入的行内
`grid-template-columns`（2/3 轨兼容，第 3 轨缺失时补 0px），把自己追加到末尾。
因此与 dsh 的侧边栏、聊天区、会话详情列完全解耦——会话详情面板照常开关，
编辑器列与其并存（同一窗口内聊天区、详情、编辑器三者按序让位）。该方案
不依赖 `ctx.layout` 服务，也不遮蔽任何槽位，对 dsh 源码零改动、
对宿主版本零要求。
