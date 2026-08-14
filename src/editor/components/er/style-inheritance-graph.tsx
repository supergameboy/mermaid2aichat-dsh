/**
 * StyleInheritanceGraph — 可视化 classDef → class-apply → 节点 的样式继承关系（树形结构）
 *
 * 单一职责：将 classDef / class-apply / node 三层关系构建为树形结构并递归渲染
 *
 * M4 重构模块5 L2-8（方案C 核心，L2 决策3 方案A：树形结构）：
 *   - 树根：classDef（ErClassInfo.id）
 *   - 树枝：class-apply（ErClassApplyInfo，按 classNames 匹配 classDef）
 *   - 树叶：node（MermaidNode，按 apply.ids 匹配）
 *   - 递归渲染树节点，支持折叠/展开
 *   - 叶子节点点击触发 onSelectNode 回调
 *
 * 数据流:
 *   classDefs + classApplies + nodes → buildTree → StyleTreeNode[]
 *     → 递归渲染 → 用户点击叶子 → onSelectNode(nodeId)
 *
 * 多对多关系处理（L2 决策3 方案A 劣势）：
 *   - 一个节点应用多个 classDef 时，在树形结构中重复显示（每个 classDef 下都出现一次）
 *   - 这是树形结构的固有局限，设计文档已确认接受
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块5-编辑器.md
 */

import { memo, useMemo, useState } from 'react';
import type {
  ErClassApplyInfo,
  ErClassInfo,
  MermaidNode,
} from '@mermaid2aichat/serializer';

// ============================================================
// Props
// ============================================================

export interface StyleInheritanceGraphProps {
  /** classDef 指令列表（来自 canvas.metadata.erClasses） */
  readonly classDefs: ErClassInfo[];
  /** class-apply 指令列表（来自 canvas.metadata.erClassApplyClasses） */
  readonly classApplies: ErClassApplyInfo[];
  /** 全部节点列表（用于展示叶子节点 + 读取各节点的 data.styles 内联样式） */
  readonly nodes: MermaidNode[];
  /** 选中节点回调（点击树叶子节点时选中画布对应节点） */
  readonly onSelectNode?: (nodeId: string) => void;
}

// ============================================================
// 树形数据模型
// ============================================================

interface StyleTreeNode {
  /** 节点类型：classDef（根/枝）或 node（叶） */
  readonly type: 'classDef' | 'node';
  /** 显示名称（classDef.id 或 node.data.label ?? node.id） */
  readonly name: string;
  /** 叶子节点的画布节点 ID（仅 type='node' 时有值，用于 onSelectNode） */
  readonly nodeId?: string;
  /** 叶子节点的内联样式（node.data.styles，仅 type='node' 时有值） */
  readonly inlineStyles?: readonly string[];
  /** classDef 的子节点（仅 type='classDef' 时有值） */
  readonly children: readonly StyleTreeNode[];
}

// ============================================================
// 树构建函数
// ============================================================

/**
 * 构建 classDef → node 继承树
 *
 * 算法：
 *   1. 遍历每个 classDef
 *   2. 查找所有 classApplies 中 classNames 包含此 classDef.id 的语句
 *   3. 收集这些语句的 ids（去重，因为同一节点可能被多条 apply 语句引用）
 *   4. 为每个 nodeId 构造叶子节点（查找 nodes 列表获取 label 和 styles）
 *
 * @param classDefs - classDef 指令列表
 * @param classApplies - class-apply 指令列表
 * @param nodes - 全部节点列表
 * @returns 树形结构数组（每个 classDef 一个根节点）
 */
function buildTree(
  classDefs: readonly ErClassInfo[],
  classApplies: readonly ErClassApplyInfo[],
  nodes: readonly MermaidNode[],
): readonly StyleTreeNode[] {
  return classDefs.map((classDef): StyleTreeNode => {
    // 查找应用了此 classDef 的所有 class-apply 语句
    const applies = classApplies.filter((apply) => apply.classNames.includes(classDef.id));

    // 收集所有目标节点 ID（去重，保持插入顺序）
    const nodeIds = new Set<string>();
    for (const apply of applies) {
      for (const id of apply.ids) {
        nodeIds.add(id);
      }
    }

    // 构造叶子节点
    const children: StyleTreeNode[] = [...nodeIds].map((nodeId): StyleTreeNode => {
      const node = nodes.find((n) => n.id === nodeId);
      const inlineStyles = (node?.data.styles as string[] | undefined) ?? [];
      return {
        type: 'node',
        name: node?.data.label ?? nodeId,
        nodeId,
        inlineStyles,
        children: [],
      };
    });

    return {
      type: 'classDef',
      name: classDef.id,
      children,
    };
  });
}

// ============================================================
// 组件
// ============================================================

/**
 * 可视化样式继承关系（树形结构）
 *
 * 实现策略（L2 决策3 方案A）：
 *   - buildTree 构建树形数据（useMemo 缓存，依赖 classDefs/classApplies/nodes）
 *   - useState 管理折叠状态（collapsedIds: Set<string>，存储已折叠的 classDef.id）
 *   - 递归渲染树节点（classDef 显示折叠图标 + id，node 显示 label + 内联样式标记）
 *   - 叶子节点点击触发 onSelectNode
 */
export const StyleInheritanceGraph = memo(function StyleInheritanceGraph({
  classDefs,
  classApplies,
  nodes,
  onSelectNode,
}: StyleInheritanceGraphProps) {
  const tree = useMemo(
    () => buildTree(classDefs, classApplies, nodes),
    [classDefs, classApplies, nodes],
  );

  // 折叠状态：存储已折叠的 classDef.id 集合（默认全部展开）
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleCollapse = (classDefId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(classDefId)) {
        next.delete(classDefId);
      } else {
        next.add(classDefId);
      }
      return next;
    });
  };

  if (tree.length === 0) {
    return (
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
        无 classDef 指令。无法展示继承关系。
      </p>
    );
  }

  return (
    <div className="style-inheritance-graph">
      {tree.map((node) => (
        <TreeItem
          key={`classdef-${node.name}`}
          node={node}
          collapsedIds={collapsedIds}
          onToggleCollapse={toggleCollapse}
          onSelectNode={onSelectNode}
          level={0}
        />
      ))}
    </div>
  );
});

StyleInheritanceGraph.displayName = 'StyleInheritanceGraph';

// ============================================================
// 递归树节点渲染
// ============================================================

interface TreeItemProps {
  readonly node: StyleTreeNode;
  readonly collapsedIds: Set<string>;
  readonly onToggleCollapse: (classDefId: string) => void;
  readonly onSelectNode?: (nodeId: string) => void;
  /** 缩进层级（0=根） */
  readonly level: number;
}

function TreeItem({
  node,
  collapsedIds,
  onToggleCollapse,
  onSelectNode,
  level,
}: TreeItemProps) {
  const indent = level * 16;

  // classDef 节点：显示折叠图标 + id + 子节点数
  if (node.type === 'classDef') {
    const isCollapsed = collapsedIds.has(node.name);
    const childCount = node.children.length;
    return (
      <div style={{ marginBottom: 'var(--space-1)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            paddingLeft: indent,
            userSelect: 'none',
          }}
          onClick={() => onToggleCollapse(node.name)}
        >
          <span style={{ width: 16, textAlign: 'center' }}>
            {isCollapsed ? '▶' : '▼'}
          </span>
          <span style={{ fontWeight: 'bold', color: 'var(--color-text)' }}>
            {node.name}
          </span>
          <span
            style={{
              marginLeft: 'var(--space-1)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
            }}
          >
            ({childCount})
          </span>
        </div>
        {!isCollapsed && childCount > 0 && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={`node-${child.nodeId ?? child.name}`}
                node={child}
                collapsedIds={collapsedIds}
                onToggleCollapse={onToggleCollapse}
                onSelectNode={onSelectNode}
                level={level + 1}
              />
            ))}
          </div>
        )}
        {!isCollapsed && childCount === 0 && (
          <div
            style={{
              paddingLeft: indent + 24,
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
              fontStyle: 'italic',
            }}
          >
            （未应用到任何节点）
          </div>
        )}
      </div>
    );
  }

  // node 叶子：显示 label + 内联样式标记（如果有）
  const hasInlineStyles = (node.inlineStyles?.length ?? 0) > 0;
  const isClickable = onSelectNode !== undefined && node.nodeId !== undefined;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        paddingLeft: indent + 24,
        cursor: isClickable ? 'pointer' : 'default',
        color: isClickable ? 'var(--color-text)' : 'var(--color-text-muted)',
      }}
      onClick={() => {
        if (isClickable && node.nodeId !== undefined) {
          onSelectNode?.(node.nodeId);
        }
      }}
    >
      <span style={{ width: 16, textAlign: 'center' }}>•</span>
      <span>{node.name}</span>
      {hasInlineStyles && (
        <span
          style={{
            marginLeft: 'var(--space-1)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            fontStyle: 'italic',
          }}
          title={`内联样式: ${(node.inlineStyles ?? []).join(', ')}`}
        >
          +style
        </span>
      )}
    </div>
  );
}
