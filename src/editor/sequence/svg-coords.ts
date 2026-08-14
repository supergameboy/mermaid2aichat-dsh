/**
 * SVG 坐标转换工具
 *
 * 单一职责：屏幕坐标 ↔ SVG 坐标互转，考虑 viewport transform（translate + scale）
 * 纯函数，无副作用，无 React 依赖
 *
 * 用途：
 *   - 拖拽连线时将鼠标 clientX/Y 转为 SVG 坐标，用于命中检测和临时连线渲染
 *   - 滚轮缩放时计算 zoom-to-cursor（保持光标位置在屏幕上不变）
 *
 * 坐标系说明：
 *   - 屏幕坐标（clientX/Y）：相对浏览器窗口的像素坐标
 *   - viewBox 坐标：SVG viewBox 定义的逻辑坐标（受 width/height="100%" + preserveAspectRatio 影响）
 *   - SVG 坐标：未应用 <g transform> 的原始坐标（= viewBox 坐标减去 viewport 平移再除以缩放）
 */

import type { Viewport } from '@mermaid2aichat/serializer';

/** 缩放倍数下限 */
export const MIN_ZOOM = 0.1;
/** 缩放倍数上限 */
export const MAX_ZOOM = 4;

/**
 * 限制 zoom 在 [MIN_ZOOM, MAX_ZOOM] 范围内
 *
 * @param zoom - 待限制的 zoom 值
 * @returns 限制后的 zoom 值
 */
export function clampZoom(zoom: number): number {
  if (zoom < MIN_ZOOM) return MIN_ZOOM;
  if (zoom > MAX_ZOOM) return MAX_ZOOM;
  return zoom;
}

/**
 * 屏幕坐标转 SVG viewBox 坐标（不考虑 viewport transform）
 *
 * 用于 SVG width/height="100%" + preserveAspectRatio="xMinYMin meet" 场景：
 *   - SVG 容器尺寸（rect）可能与 viewBox 尺寸不同
 *   - scaleFactor 将屏幕像素换算为 viewBox 单位
 *   - xMinYMin meet：左上对齐（offset=0）+ 保持宽高比 + 整体可见
 *
 * 公式：
 *   rect = svgElement.getBoundingClientRect()       // 容器屏幕尺寸
 *   vb = svgElement.viewBox.baseVal                  // viewBox 的 {x, y, width, height}
 *   scaleFactor = min(rect.width / vb.width, rect.height / vb.height)  // meet 模式
 *   vbX = (clientX - rect.left) / scaleFactor        // xMinYMin: offset=0
 *   vbY = (clientY - rect.top) / scaleFactor
 *
 * 向后兼容：当 viewBox 缺失或尺寸为 0 时，scaleFactor=1，公式退化为直接减 rect.left/top
 *
 * @param clientX - 鼠标 clientX（相对屏幕）
 * @param clientY - 鼠标 clientY（相对屏幕）
 * @param svgElement - SVG DOM 元素（需 SVGSVGElement 以读取 viewBox.baseVal）
 * @returns viewBox 坐标系下的 { x, y }
 */
export function screenToViewBox(
  clientX: number,
  clientY: number,
  svgElement: SVGSVGElement,
): { x: number; y: number } {
  const rect = svgElement.getBoundingClientRect();
  // viewBox.baseVal 可选链 + 默认值，兼容 happy-dom 不完全支持的情况
  const vb = svgElement.viewBox?.baseVal;
  const hasVB = vb !== undefined && vb.width > 0 && vb.height > 0;
  const scaleFactor = hasVB
    ? Math.min(rect.width / vb.width, rect.height / vb.height)
    : 1;
  // xMinYMin meet 模式：左上对齐，offset = 0
  return {
    x: (clientX - rect.left) / scaleFactor,
    y: (clientY - rect.top) / scaleFactor,
  };
}

/**
 * 屏幕坐标转 SVG 坐标（考虑 viewBox 缩放 + viewport transform）
 *
 * 公式：
 *   {vbX, vbY} = screenToViewBox(clientX, clientY, svgElement)
 *   svgX = (vbX - viewport.x) / viewport.zoom
 *   svgY = (vbY - viewport.y) / viewport.zoom
 *
 * 解释：
 *   - clientX/Y 是相对屏幕的鼠标坐标
 *   - rect.left/top 是 SVG 元素在屏幕上的偏移
 *   - 当 SVG width/height="100%" 时，rect 尺寸 = 容器尺寸，可能与 viewBox 尺寸不同
 *   - viewport.x/y/zoom 是 SVG 内部 <g transform> 的平移/缩放
 *   - 减去平移再除以缩放，得到未应用 transform 的原始 SVG 坐标
 *
 * @param clientX - 鼠标 clientX（相对屏幕）
 * @param clientY - 鼠标 clientY（相对屏幕）
 * @param svgElement - SVG DOM 元素（需 SVGSVGElement 以读取 viewBox.baseVal）
 * @param viewport - 当前 viewport（{ x, y, zoom }）
 * @returns SVG 坐标系下的 { x, y }（即未应用 transform 的原始坐标）
 */
export function screenToSvg(
  clientX: number,
  clientY: number,
  svgElement: SVGSVGElement,
  viewport: Viewport,
): { x: number; y: number } {
  const { x: vbX, y: vbY } = screenToViewBox(clientX, clientY, svgElement);
  return {
    x: (vbX - viewport.x) / viewport.zoom,
    y: (vbY - viewport.y) / viewport.zoom,
  };
}

/**
 * 计算滚轮缩放后的新 viewport（zoom-to-cursor）
 *
 * 数学公式（保持光标位置在屏幕上不变）：
 *   newZoom = clampZoom(currentViewport.zoom * zoomDelta)
 *   ratio = newZoom / currentViewport.zoom
 *   newX = cursorViewBoxX - (cursorViewBoxX - currentViewport.x) * ratio
 *   newY = cursorViewBoxY - (cursorViewBoxY - currentViewport.y) * ratio
 *
 * 推导：
 *   光标在 SVG 内部 <g transform> 后的位置 = viewport.x + svgX * viewport.zoom
 *   要保持光标对应的 svgX 不变：
 *     cursorViewBoxX = newX + svgX * newZoom
 *     svgX = (cursorViewBoxX - newX) / newZoom
 *   与原 svgX = (cursorViewBoxX - oldX) / oldZoom 相等：
 *     (cursorViewBoxX - newX) / newZoom = (cursorViewBoxX - oldX) / oldZoom
 *     newX = cursorViewBoxX - (cursorViewBoxX - oldX) * (newZoom / oldZoom)
 *     newX = cursorViewBoxX - (cursorViewBoxX - oldX) * ratio
 *
 * 注意：传入的 clientX/Y 必须是 viewBox 坐标（即先经 screenToViewBox 转换），
 *      否则在 SVG width/height="100%" + scaleFactor≠1 时计算错误。
 *      保持纯函数签名，由调用方负责坐标转换。
 *
 * @param clientX - 光标在 viewBox 坐标系下的 X（调用方先用 screenToViewBox 转换）
 * @param clientY - 光标在 viewBox 坐标系下的 Y
 * @param currentViewport - 当前 viewport
 * @param zoomDelta - 缩放因子（>1 放大，<1 缩小）
 * @returns 新 viewport（zoom 已 clamp）
 */
export function computeZoomViewport(
  clientX: number,
  clientY: number,
  currentViewport: Viewport,
  zoomDelta: number,
): Viewport {
  const newZoom = clampZoom(currentViewport.zoom * zoomDelta);
  const ratio = newZoom / currentViewport.zoom;
  const newX = clientX - (clientX - currentViewport.x) * ratio;
  const newY = clientY - (clientY - currentViewport.y) * ratio;
  return { x: newX, y: newY, zoom: newZoom };
}
