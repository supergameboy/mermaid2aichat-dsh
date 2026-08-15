# 计划：补全其余 8 种图的识别 / 渲染 / 编辑

> 状态：已定稿，待按里程碑推进。开放决策在执行中通过提问逐项确认。
> 范围：在现有 4 图（flowchart / sequenceDiagram / classDiagram / erDiagram）基础上，
> 补齐 8 种：**stateDiagram / mindmap / gantt / pie / timeline / quadrantChart / xychart / architecture**。

## 原则

1. **不移植旧项目**（`mermaid反向编辑器`）：旧图实现仅作对照参考，代码一律不抄；
   不移植的原因即旧项目的剩余图型识别/渲染/编辑均有问题。
2. **以官方 mermaid 仓库为准**：语法与渲染行为对照本地 `mermaid-develop`（官方 v10.2.4 全量源码，
   33 个 diagram 实现 + `packages/parser` jison 语法源）与线上 v11。
3. **解析器：vendored jison**（已决策）——按官方语法自 vendor 出解析器，走现有
   recognize→converter 流水线，保持插件自包含、不依赖 mermaid 运行时。
4. **编辑方法按族设计**（见「编辑方法设计」），先定编辑模型再写代码。

## 现状盘点

| 层 | 已支持 | 8 种目标类型的缺口 |
|---|---|---|
| 识别 parse | 4 种 | parse-dispatcher 只放行 4 种；recognizer/converter 只有 3 图 + sequence 专用 parser |
| 序列化 serialize | 4 种 | 无 mindmap/state/gantt/pie/… 的代码生成 |
| 渲染 render | GraphCanvas（3 图）+ SequenceCanvas | 无任何新 canvas |
| 编辑 edit | 画布交互 + 属性面板 + 代码同步 | 无 |

要点：`serializer/types.ts` 已为全部 12 种图预留数据模型与类型守卫
（GraphDiagramType 含 mindmap/stateDiagram/architecture，ChartDiagramType 含
gantt/pie/timeline/quadrantChart/xychart），缺的是 parse / serialize / canvas /
交互 / 类型切换 UI / 暗色·紧凑·错误提示 / 测试 七件套。

## 编辑方法设计（按族）

按「本质是**拓扑**还是**数据/时间/参数**」分三族，每族一种编辑模型：

**族 A：图结构族 → 画布直接编辑（复用 GraphCanvas，交互模型同 flowchart）**

- **stateDiagram**（v1 即含完整子集，已决策）：节点 = 状态 / 复合态 / 备注，边 = 迁移
  （含条件标签）；双击加状态、拖拽连线、属性面板改迁移；**v1 含 stateDiagram-v2 的
  复合态、并发区（fork/join）、备注**——这是它相对 flowchart 的差异点。
- **mindmap**：树结构；复用 GraphCanvas + 树布局；增删子节点、重排、样式。

**族 B：图表/时间线族 → 结构化编辑 + 即时重渲染（画布选择为主，编辑走面板和代码）**

- **gantt**：行（任务/里程碑/区间）+ 时间轴；**v1 含画布任务条拖拽调日期（已决策）**，
  同时保留代码主入口 + 结构化行编辑器。
- **timeline / journey**：时段/步骤行式语法简单 → 代码为主编辑入口，结构化面板编辑器
  （AST 生成的行编辑器：增删改排序）为辅，画布渲染即时跟随。
- **pie / quadrantChart / xychart**：纯图表 → 画布只读渲染 + 结构化面板编辑
  （扇区 / 象限点 / 系列数据表）。

**族 C：布局复杂族 → 代码优先 + 只读渲染**

- **architecture**：官方布局复杂（分组/3D），v1 代码编辑 + 只读渲染，v2 再评估画布编辑。

**统一底线**：所有图型至少保证「代码 ↔ 渲染」双向同步；只有图结构族开放画布直接修改
（拓扑编辑价值高、交互模型成熟）；数据类图型开放结构化面板（防手滑毁数据、对机器友好）。

## 识别（解析）计划

- 每类型对照官方 jison 语法（`mermaid-develop/packages/parser`）vendored 出自己的
  解析器 → 图族走现有 recognize→converter 流水线，图表族写专用 parseGantt/parsePie/…
- 扩展 `builtin-detectors` 识别新首行关键字（stateDiagram-v2 / mindmap / gantt / pie /
  timeline / quadrantChart / xychart / architecture）
- 序列化反向补齐，保证 **round-trip 稳定**（解析→序列化→再解析幂等）
- 语法演进：优先 v10.2.4 稳定语法，v11 langium 新语法分批评估，不一次性全追

## 渲染计划

- 图族：GraphCanvas 扩展节点/边组件 + 布局（state 用 dagre；mindmap 用树布局，
  对照官方 tidy-tree）
- 图表族：新建各 SVG canvas（模式照 SequenceCanvas：纯 SVG、viewBox、无 React Flow），
  暗色/紧凑进现有 CSS 体系
- architecture：独立 canvas + 官方布局参考
- 体积：每个 canvas 独立模块，P6 专项做按需加载/分包

## 里程碑与工作量（人日，粗估）

| 阶段 | 内容 | 估算 |
|---|---|---|
| **P0 基础设施** | 统一 dispatch 表、放开 diagramType、round-trip 测试夹具（官方 examples 作 golden fixtures）、代码区类型下拉补全 8 项 | 3–5d |
| **P1 stateDiagram** | 族 A 完整画布编辑（含复合态/并发区/备注） | 4–6d |
| **P2 mindmap** | 树画布编辑 | 3–5d |
| **P3 图表族批量** | pie / quadrantChart / xychart / timeline / journey（共享结构化编辑器基建，各 2–3d，可并行） | 10–14d |
| **P4 gantt** | 时间轴+任务+依赖+画布拖拽调日期 | 4–6d |
| **P5 architecture** | 只读优先 | 4–6d |
| **P6 收尾** | 文档、体积/分包、回归（含 dsh-web-ui 共存回归） | 2–3d |

合计约 30–45 人日；图族与图表族互不依赖，P3 内各图可并行。

## 验证策略

- 官方 fixtures：mermaid 仓库 examples + 本地 `mermaid-live-editor-develop` 跑官方渲染，
  与我们 parse→serialize→parse 幂等 + 渲染截图对照
- 每类型 golden tests（与现有 `error-collector.test.ts` 同模式）
- 手工闭环清单：新建→画/改→发送到对话→AI 再改→导回

## 风险

- jison 语法量大、v11 langium 追不动 → 优先级排序，经典语法优先
- round-trip 保真（注释/顺序/样式）→ 按图型单独打磨增量序列化
- bundle 体积：8 个新 canvas → P6 按需加载专项
- 图表族「结构化编辑」易过度设计 → 先代码优先，按需加面板
- 类型切换弹窗、compact、暗色、会话隔离都要覆盖新图型

## 已定决策（执行中逐项确认）

1. 解析器：**vendored jison**（不依赖官方运行时）
2. stateDiagram v1：**含复合态、并发区（fork/join）、备注**
3. gantt v1：**含画布任务条拖拽调日期**

开放决策（执行到对应里程碑时经提问确认，如：P0 代码区类型下拉是否一并放行
requirement/gitGraph 等第 9+ 种图；P2 mindmap 编辑范围；P5 architecture 是否加结构化面板）。
