/**
 * Vitest 配置 — 解析 @mermaid2aichat/serializer 别名（与 tsconfig paths 一致）。
 * 仅测试使用，不影响 tsdown 构建。
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@mermaid2aichat/serializer': `${root}src/serializer/index.ts`,
    },
  },
  test: {
    environment: 'node',
  },
});
