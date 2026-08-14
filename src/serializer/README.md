# packages/serializer/src

## 用途

Mermaid 解析器和序列化器核心实现，包含 AST 定义、解析器、识别器、转换器、装配器和序列化器。

## 文件命名规则

- 核心类型：`types.ts`（MermaidNode/MermaidEdge 等核心类型的**唯一权威**）
- AST：`ast/{diagramType}.ts`
- 解析器：`parser/{diagramType}-parser.ts`（基于 Jison）
- 识别器：`recognizer/{diagramType}-recognizer.ts`
- 转换器：`converter/{diagramType}-converter.ts`
- 装配器：`assembler/{diagramType}-assembler.ts`
- 序列化器：`serializer/{diagramType}-serializer.ts`
- 工具函数：`id-generator.ts`、`error-collector.ts` 等
- 调度器：`parse-dispatcher.ts`、`serialize-dispatcher.ts`
- 环境入口：`index.ts`（Node）、`browser.ts`（浏览器）

## 禁止放置

- React 组件或 DOM 相关代码（违反模块边界，参见 `code-standards.md` 第十一章）
- 服务端逻辑（WebSocket、MCP、Store）
- 测试文件（测试放在 `packages/serializer/test/` 目录）
- 重新定义 MermaidNode/MermaidEdge 等核心类型（仅在 `types.ts` 定义）
