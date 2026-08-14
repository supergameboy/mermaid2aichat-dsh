/**
 * click 序列化器 — click/href/tooltip → Mermaid click 代码
 *
 * 单一职责：将节点的交互信息（link/click callback/tooltip）序列化为 Mermaid click 语句
 *
 * 语法:
 *   click nodeId callback()
 *   click nodeId callback(args)
 *   click nodeId "https://example.com" _blank
 *   click nodeId href "https://example.com" _blank
 *
 * tooltip 通过单独的 setTooltip 调用设置，序列化时合并到 click 语句
 */

import type { MermaidNode, GraphMetadata } from '../../types.js';

// ============================================================
// 类型（对齐 FlowClickEvent，从 metadata 读取）
// ============================================================

interface FlowClickEvent {
  nodeId: string;
  functionName?: string;
  functionArgs?: string;
  link?: string;
  linkTarget?: string;
  tooltip?: string;
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 序列化 click 语句
 *
 * 优先从 metadata.flowClickEvents 读取（完整的 click 事件信息），
 * 其次从节点的 clickUrl/linkTarget/tooltip 扩展字段读取（href 链接）
 *
 * @param nodes - 画布所有节点
 * @param metadata - 画布元数据
 * @returns click 代码行数组
 */
export function serializeClickEvents(
  nodes: MermaidNode[],
  metadata: GraphMetadata | undefined,
): string[] {
  const lines: string[] = [];
  const clickEvents = metadata?.flowClickEvents;
  const tooltips = metadata?.flowTooltips;

  // 从 metadata.flowClickEvents 序列化
  if (clickEvents) {
    for (const event of clickEvents) {
      const line = formatClickEvent(event, tooltips?.[event.nodeId]);
      if (line) {
        lines.push(line);
      }
    }
  }

  // 从节点的 clickUrl/linkTarget/tooltip 扩展字段序列化（未在 clickEvents 中的情况）
  const processedNodeIds = new Set(clickEvents?.map((e) => e.nodeId) ?? []);
  for (const node of nodes) {
    if (processedNodeIds.has(node.id)) {
      continue;
    }
    const clickUrl = node.data.clickUrl;
    const linkTarget = node.data.linkTarget;
    const nodeTooltip = node.data.tooltip;
    const effectiveTooltip = nodeTooltip ?? tooltips?.[node.id];
    if (clickUrl) {
      if (linkTarget && effectiveTooltip) {
        lines.push(`click ${node.id} href "${clickUrl}" "${effectiveTooltip}" ${linkTarget}`);
      } else if (linkTarget) {
        lines.push(`click ${node.id} "${clickUrl}" ${linkTarget}`);
      } else {
        lines.push(`click ${node.id} "${clickUrl}"`);
      }
    }
  }

  return lines;
}

// ============================================================
// 内部实现
// ============================================================

/** 格式化单个 click 事件 */
function formatClickEvent(event: FlowClickEvent, tooltip?: string): string | undefined {
  const { nodeId, functionName, functionArgs, link, linkTarget } = event;
  const effectiveTooltip = event.tooltip ?? tooltip;

  // 回调函数模式: `click nodeId callback()` 或 `click nodeId callback(args)`
  if (functionName) {
    const args = functionArgs ?? '';
    if (effectiveTooltip) {
      return `click ${nodeId} ${functionName}(${args}) "${effectiveTooltip}"`;
    }
    return `click ${nodeId} ${functionName}(${args})`;
  }

  // href 链接模式
  if (link) {
    if (linkTarget && effectiveTooltip) {
      return `click ${nodeId} href "${link}" "${effectiveTooltip}" ${linkTarget}`;
    }
    if (linkTarget) {
      return `click ${nodeId} "${link}" ${linkTarget}`;
    }
    return `click ${nodeId} "${link}"`;
  }

  // 仅 tooltip（无回调无链接）— 不输出 click 语句
  return undefined;
}
