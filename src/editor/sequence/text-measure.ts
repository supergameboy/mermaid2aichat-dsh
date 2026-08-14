/**
 * 文本宽度测量 — Canvas measureText 封装
 *
 * 单一职责：测量文本在指定字体下的渲染宽度
 *
 * 数据流:
 *   text → measureTextWidth(text, font) → width (number)
 *
 * 来源：B3 设计文档 text-measure.ts 接口签名 + B3-L2 实现要点
 */

const DEFAULT_FONT = '14px "Open Sans", sans-serif';
let canvasCache: HTMLCanvasElement | null = null;

function getCanvas(): HTMLCanvasElement {
  if (!canvasCache) {
    canvasCache = document.createElement('canvas');
  }
  return canvasCache;
}

/**
 * 测量文本宽度
 *
 * @param text - 待测量文本
 * @param font - CSS font 字符串（如 '14px "Open Sans", sans-serif'）
 * @returns 文本宽度（像素）
 *
 * P2-1 修复：移除 fallback（text.length * 8），canvas.getContext('2d') 在浏览器环境不会返回 null
 * 如果返回 null 说明环境异常，应抛错而非用不准确的 fallback 掩盖缺陷
 */
export function measureTextWidth(text: string, font: string = DEFAULT_FONT): number {
  const ctx = getCanvas().getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable: measureText requires browser environment');
  }
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * 测量多行文本的最大宽度
 *
 * @param lines - 文本行数组
 * @param font - CSS font 字符串
 * @returns 最大宽度（像素）
 */
export function measureMaxTextWidth(lines: string[], font?: string): number {
  return Math.max(...lines.map((line) => measureTextWidth(line, font)));
}
