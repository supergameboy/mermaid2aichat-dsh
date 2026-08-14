//#region src/index.ts
/**
* Mermaid 反向编辑器 — 节点半边（空插件体）。
*
* 纯 UI 插件：宿主侧无任何行为。空 apply 的存在是为了让该行出现在宿主
* Loader 组合中（加载与生命周期跟随宿主），浏览器半边通过 exports["./client"]
* 交付，由包清单里的 dsh.client 声明被发现。
*/
/** 插件名（诊断用）。 */
const name = "mermaid2aichat-dsh";
/** 宿主插件体 — 无宿主侧行为。 */
function apply() {}
//#endregion
export { apply, name };
