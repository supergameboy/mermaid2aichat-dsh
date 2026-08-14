/**
 * 样式序列化器 — classDef/class/style/linkStyle → Mermaid 样式代码
 *
 * 单一职责：将画布元数据中的样式信息序列化为 Mermaid 样式语句
 *
 * 语法:
 *   classDef id style1,style2,...
 *   class nodeId className
 *   style nodeId fill:#f00,stroke:#900
 *   linkStyle 0 stroke:#f00
 *   linkStyle 0 interpolate basis
 *   linkStyle 0 animate true
 *   linkStyle default interpolate basis
 *   linkStyle default stroke:#f00
 */

import type { MermaidNode, MermaidEdge, GraphMetadata, FlowClassDefInfo } from '../../types.js';

// ============================================================
// 公共 API
// ============================================================

/**
 * 序列化 classDef 语句
 * @param metadata - 画布元数据
 * @returns classDef 代码行数组
 */
export function serializeClassDefs(metadata: GraphMetadata | undefined): string[] {
  const classes = metadata?.flowClassDefs;
  if (!classes || classes.length === 0) {
    return [];
  }

  return classes.map((cls) => {
    // 对齐官方: styles 和 textStyles 分开输出（官方 classDef 语法: classDef id styles [textStyles]
    // 但 Mermaid 语法中 textStyles 用 `:::` 前缀，这里简化为合并输出）
    const allStyles = [...cls.styles, ...cls.textStyles];
    return `classDef ${cls.id} ${allStyles.join(',')}`;
  });
}

/**
 * 序列化 class 应用语句（`class nodeId className`）
 * 从节点的 classNames 扩展字段读取
 * @param nodes - 画布所有节点
 * @returns class 代码行数组
 */
export function serializeClassApplications(nodes: MermaidNode[]): string[] {
  const lines: string[] = [];

  for (const node of nodes) {
    const classNames = node.data.classNames;
    if (!classNames || classNames.length === 0) {
      continue;
    }
    // 跳过 subgraph 节点（subgraph 的 class 在 subgraph 序列化中处理）
    if (node.data.isSubgraph) {
      continue;
    }
    lines.push(`class ${node.id} ${classNames.join(',')}`);
  }

  return lines;
}

/**
 * 序列化 style 语句（`style nodeId fill:#f00,stroke:#900`）
 * 从节点的 styles 扩展字段读取（对齐官方 FlowVertex.styles）
 * @param nodes - 画布所有节点
 * @returns style 代码行数组
 */
export function serializeNodeStyles(nodes: MermaidNode[]): string[] {
  const lines: string[] = [];

  for (const node of nodes) {
    const styles = node.data.styles;
    if (!styles || styles.length === 0) {
      continue;
    }
    lines.push(`style ${node.id} ${styles.join(',')}`);
  }

  return lines;
}

/**
 * 序列化 linkStyle 语句（`linkStyle 0 stroke:#f00`）
 * 从边的 styles/interpolate/animate 扩展字段读取（对齐官方 FlowEdge.style/interpolate）
 *
 * 支持的语法:
 *   linkStyle 0 stroke:#f00
 *   linkStyle 0 interpolate basis
 *   linkStyle 0 animate true
 *   linkStyle 0 interpolate basis stroke:#f00 animate true
 *   linkStyle default interpolate basis
 *   linkStyle default stroke:#f00
 *
 * @param edges - 画布所有边（按索引顺序）
 * @param metadata - 画布元数据（用于读取 defaultInterpolate/defaultStyle）
 * @returns linkStyle 代码行数组
 */
export function serializeLinkStyles(edges: MermaidEdge[], metadata?: GraphMetadata): string[] {
  const lines: string[] = [];

  // 1. linkStyle default 语句（默认边样式/插值）
  const defaultInterpolate = metadata?.flowDefaultInterpolate;
  const defaultStyle = metadata?.flowDefaultStyle;

  if (defaultInterpolate && defaultStyle && defaultStyle.length > 0) {
    lines.push(`linkStyle default interpolate ${defaultInterpolate} ${defaultStyle.join(',')}`);
  } else if (defaultStyle && defaultStyle.length > 0) {
    lines.push(`linkStyle default ${defaultStyle.join(',')}`);
  } else if (defaultInterpolate) {
    lines.push(`linkStyle default interpolate ${defaultInterpolate}`);
  }

  // 2. 各边的 linkStyle 语句
  edges.forEach((edge, index) => {
    const styles = edge.data.styles;
    const interpolate = edge.data.interpolate;
    const animate = edge.data.animate;

    const parts: string[] = [];
    if (interpolate) {
      parts.push(`interpolate ${interpolate}`);
    }
    if (styles && styles.length > 0) {
      parts.push(styles.join(','));
    }
    if (animate) {
      parts.push('animate true');
    }

    if (parts.length > 0) {
      lines.push(`linkStyle ${index} ${parts.join(' ')}`);
    }
  });

  return lines;
}
