/**
 * tsdown 构建配置 — 复用 DeepSeek Harness 客户端插件的打包约定：
 * - lib/index.js：Node 半边（空插件体，供宿主 Loader 加载）
 * - lib/client.js：浏览器半边（CJS 闭包工厂，调用 window.__ModuleLoader__.load 注册）
 * 平台模块（react/@deepseek-ai/*）保持 external，由 shell 的模块表提供；
 * 其余依赖（@xyflow/react、dagre-cluster-fix、序列化器、编辑器源码）全部内联。
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'

const ID = 'mermaid2aichat-dsh'

/** Shell 共享的平台模块（与 @deepseek-ai/dsh-client-web/src/platform.ts 一致，外加运行时 store 引擎豁免）。 */
const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** CSS 内联插件：普通 .css 注入 <style data-plugin> 标签，.module.css 额外导出类名映射。 */
function cssInlinePlugin() {
  return {
    name: 'dsh-css-inline',
    resolveId(source, importer) {
      if (!source.endsWith('.css')) return null
      const abs = importer !== undefined ? resolvePath(dirname(importer), source) : source
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const isModule = basename(fileId).endsWith('.module.css')
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: isModule ? { pattern: '[hash]_[local]' } : undefined,
        minify: true,
      })
      const classMap = {}
      if (isModule) {
        for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
      }
      const tagId = `${ID}/${basename(fileId)}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
        '  const tag = document.createElement(\'style\');',
        `  tag.dataset.plugin = ${JSON.stringify(ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }
}

export default defineConfig([
  {
    name: ID,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    dts: false,
    clean: false,
    resolve: {
      alias: {
        '@mermaid2aichat/serializer': resolvePath(ROOT, 'src/serializer/index.ts'),
      },
    },
  },
  {
    name: `${ID}/client`,
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    // 除平台模块外全部内联（@xyflow/react、dagre-cluster-fix、编辑器源码）。
    noExternal: (id) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    resolve: {
      alias: {
        '@mermaid2aichat/serializer': resolvePath(ROOT, 'src/serializer/index.ts'),
      },
    },
    plugins: [cssInlinePlugin()],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
