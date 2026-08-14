/**
 * 属性面板 — 按 diagramType 动态显示节点/边属性编辑
 *
 * 单一职责：根据图表类型显示对应的属性字段
 * - flowchart: 形状选择 + 边样式 + 通用样式
 * - classDiagram: 成员编辑 + 关系类型
 * - erDiagram: 实体编辑 + 属性编辑 + 关系编辑（M4 新组件）
 * - 数据图表类型: 显示提示信息
 *
 * 注：sequenceDiagram 不使用 PropertyPanel，由 SequenceCanvas 内联渲染
 *   ParticipantEditor/MessageEditor/NoteEditor/BlockEditor/BoxEditor（专用编辑器）
 */
import type {
  DiagramType,
  MermaidEdge,
  MermaidNode,
  NodeStyle,
  GraphMetadata,
  ErClassInfo,
  ErClassApplyInfo,
} from '@mermaid2aichat/serializer';
import { EntityEditor, AttributeEditor, RelationshipEditor, ErSubgraphEditor, ClassDefEditor } from './er/index.js';
import { ShapeSwitcher, EdgeStyleEditor, SubgraphEditor } from './flowchart/index.js';
import {
  ClassEditor,
  MemberEditor,
  RelationEditor,
  NoteEditor,
  NamespaceEditor,
} from './class/index.js';
// 容器判定统一数据源（替代本地 isSubgraphNode，单一数据源 institution §1.1）
import { isContainerNode } from '../graph-canvas-helpers.js';

/** v4：选中状态联合类型（替代 selectedNodeId + selectedGroupId） */
export type SelectedId =
  | { type: 'node'; id: string }
  | { type: 'group'; id: string }
  | { type: 'edge'; id: string }
  | null;

interface PropertyPanelProps {
  /** 当前图表类型（决定显示哪些字段） */
  readonly diagramType: DiagramType;
  readonly selectedNode: MermaidNode | null;
  readonly selectedEdge: MermaidEdge | null;
  readonly onUpdateNode: (id: string, data: Partial<MermaidNode['data']>) => void;
  readonly onUpdateEdge: (id: string, data: Partial<MermaidEdge['data']>) => void;
  /** 所有节点（供 ClassDefEditor、classDiagram 推断、flowchart SubgraphEditor 使用） */
  readonly nodes?: MermaidNode[];
  /** classDiagram: 所有边（供 NoteEditor 推断关联 class + handleSelectNoteClassId 创建/更新/删除 note-edge） */
  readonly edges?: MermaidEdge[];
  /** classDiagram: 替换整个 edges 数组（handleSelectNoteClassId 用） */
  readonly onUpdateEdges?: (edges: MermaidEdge[]) => void;
  /** 完整节点更新回调（flowchart SubgraphEditor 用：含 parentId 等） */
  readonly onUpdateNodeFull?: (id: string, updates: Partial<MermaidNode>) => void;
  /** flowchart: 移动节点到 subgraph（subgraphId 为 null 表示移出到顶层） */
  readonly onMoveToSubgraph?: (nodeId: string, subgraphId: string | null) => void;
  /** flowchart: 删除 subgraph 节点 */
  readonly onDeleteSubgraph?: (id: string) => void;
  /** erDiagram: 全局元数据（包含 erClasses/erClassApplyClasses，供 ClassDefEditor 消费） */
  readonly metadata?: GraphMetadata;
  /** erDiagram: 更新元数据（更新 erClasses/erClassApplyClasses 等，触发 applyCanvasChange） */
  readonly onUpdateMetadata?: (metadata: GraphMetadata) => void;
}

export function PropertyPanel({
  diagramType,
  selectedNode,
  selectedEdge,
  onUpdateNode,
  onUpdateEdge,
  nodes,
  edges,
  onUpdateEdges,
  onUpdateNodeFull,
  onMoveToSubgraph,
  onDeleteSubgraph,
  metadata,
  onUpdateMetadata,
}: PropertyPanelProps) {
  if (!selectedNode && !selectedEdge) {
    // erDiagram: 未选中状态挂载 ClassDefEditor（L2 决策1方案A：全局样式编辑入口）
    // 语义清晰：未选中 = 全局编辑，选中 = 节点/边编辑
    if (diagramType === 'erDiagram' && metadata && onUpdateMetadata) {
      const erClasses = metadata.erClasses ?? [];
      const erClassApplyClasses = metadata.erClassApplyClasses ?? [];
      return (
        <div className="property-panel">
          <h3 className="panel-title">全局样式</h3>
          <ClassDefEditor
            classDefs={erClasses}
            classApplies={erClassApplyClasses}
            nodes={nodes ?? []}
            onUpdateClassDefs={(newClassDefs: ErClassInfo[]) =>
              onUpdateMetadata({ ...metadata, erClasses: newClassDefs })
            }
            onUpdateClassApplies={(newClassApplies: ErClassApplyInfo[]) =>
              onUpdateMetadata({ ...metadata, erClassApplyClasses: newClassApplies })
            }
            onUpdateNodeStyles={(nodeId: string, styles: string[]) => {
              onUpdateNode(nodeId, { styles });
            }}
          />
        </div>
      );
    }
    return (
      <div className="property-panel">
        <h3 className="panel-title">属性面板</h3>
        <p className="panel-hint">选中节点或边以编辑属性</p>
      </div>
    );
  }

  if (selectedNode) {
    return (
      <NodePropertyEditor
        node={selectedNode}
        diagramType={diagramType}
        onUpdate={onUpdateNode}
        nodes={nodes}
        edges={edges}
        onUpdateEdges={onUpdateEdges}
        onUpdateNodeFull={onUpdateNodeFull}
        onMoveToSubgraph={onMoveToSubgraph}
        onDeleteSubgraph={onDeleteSubgraph}
      />
    );
  }

  if (selectedEdge) {
    return (
      <EdgePropertyEditor
        edge={selectedEdge}
        diagramType={diagramType}
        onUpdate={onUpdateEdge}
      />
    );
  }

  return null;
}

// === 节点属性编辑器 ===

interface NodePropertyEditorProps {
  node: MermaidNode;
  diagramType: DiagramType;
  onUpdate: (id: string, data: Partial<MermaidNode['data']>) => void;
  /** 所有节点（供 classDiagram 推断与 flowchart SubgraphEditor 使用） */
  nodes?: MermaidNode[];
  /** classDiagram: 所有边（NoteEditor 推断关联 + handleSelectNoteClassId 创建/更新/删除 note-edge） */
  edges?: MermaidEdge[];
  /** classDiagram: 替换整个 edges 数组（handleSelectNoteClassId 用） */
  onUpdateEdges?: (edges: MermaidEdge[]) => void;
  /** 完整节点更新回调（flowchart SubgraphEditor 用） */
  onUpdateNodeFull?: (id: string, updates: Partial<MermaidNode>) => void;
  /** flowchart: 移动节点到 subgraph */
  onMoveToSubgraph?: (nodeId: string, subgraphId: string | null) => void;
  /** flowchart: 删除 subgraph 节点 */
  onDeleteSubgraph?: (id: string) => void;
}

function NodePropertyEditor({
  node,
  diagramType,
  onUpdate,
  nodes,
  edges,
  onUpdateEdges,
  onUpdateNodeFull,
  onMoveToSubgraph,
  onDeleteSubgraph,
}: NodePropertyEditorProps) {
  // erDiagram 使用专用 EntityEditor（含实体名+别名），跳过通用文本字段
  const skipGenericLabel = diagramType === 'erDiagram';

  // classDiagram: 按 node.type 三分发到 ClassEditor+MemberEditor / NoteEditor / NamespaceEditor
  if (diagramType === 'classDiagram') {
    if (node.type === 'class-box') {
      return (
        <div className="property-panel">
          <h3 className="panel-title">类属性</h3>
          <ClassEditor classNode={node} onUpdate={(data) => onUpdate(node.id, data)} />
          <MemberEditor
            members={node.data.members ?? []}
            onChange={(members) => onUpdate(node.id, { members })}
          />
        </div>
      );
    }
    if (node.type === 'class-note') {
      const associatedClassId = inferAssociatedClassId(node.id, edges);
      const classOptions = buildClassOptions(nodes);
      return (
        <div className="property-panel">
          <h3 className="panel-title">注释属性</h3>
          <NoteEditor
            noteNode={node}
            associatedClassId={associatedClassId}
            classOptions={classOptions}
            onUpdate={(data) => onUpdate(node.id, data)}
            onSelectClassId={(classId) => handleSelectNoteClassId(node.id, classId, edges, onUpdateEdges)}
          />
        </div>
      );
    }
    if (node.type === 'class-namespace') {
      const containedClasses = inferContainedClasses(node.id, nodes);
      return (
        <div className="property-panel">
          <h3 className="panel-title">命名空间属性</h3>
          <NamespaceEditor
            namespaceNode={node}
            containedClasses={containedClasses}
            onUpdate={(data) => onUpdate(node.id, data)}
          />
        </div>
      );
    }
  }

  // flowchart: subgraph 节点使用专用 SubgraphEditor
  // 注：isContainerNode 在 flowchart 上下文中仅匹配 subgraph 节点（class-namespace 不会出现在 flowchart）
  if (diagramType === 'flowchart' && isContainerNode(node) && onDeleteSubgraph) {
    return (
      <div className="property-panel">
        <SubgraphEditor
          subgraph={node}
          nodes={nodes ?? []}
          onChange={(updates) => {
            if (onUpdateNodeFull) {
              onUpdateNodeFull(node.id, updates);
            }
          }}
          onDelete={() => onDeleteSubgraph(node.id)}
          onMoveToSubgraph={onMoveToSubgraph}
        />
      </div>
    );
  }

  // erDiagram: er-subgraph 节点使用专用 ErSubgraphEditor（编辑 label/dir）
  // er-box 继续走通用返回（EntityEditor + AttributeEditor + 通用样式）
  if (diagramType === 'erDiagram' && node.type === 'er-subgraph') {
    return (
      <div className="property-panel">
        <h3 className="panel-title">子图属性</h3>
        <ErSubgraphEditor
          subgraphNode={node}
          onUpdate={(data) => onUpdate(node.id, data)}
        />
      </div>
    );
  }

  return (
    <div className="property-panel">
      <h3 className="panel-title">节点属性</h3>
      <div className="panel-content">
        {/* 通用字段：标签（erDiagram 由 EntityEditor 承载） */}
        {!skipGenericLabel && (
          <label className="panel-label">
            文本
            <input
              className="panel-input"
              type="text"
              value={node.data.label}
              onChange={(e) => onUpdate(node.id, { label: e.target.value })}
            />
          </label>
        )}

        {/* flowchart: 形状切换器（M1：使用 ShapeSwitcher 替代 inline select） */}
        {diagramType === 'flowchart' && (
          <ShapeSwitcher
            currentShape={node.data.shape ?? 'rect'}
            onChange={(shape) => onUpdate(node.id, { shape })}
          />
        )}

        {/* classDiagram 已在 NodePropertyEditor 入口处按 node.type 三分发到专用编辑器，此处不再处理 */}

        {/* erDiagram: 实体编辑（名称+别名） + 属性编辑 */}
        {diagramType === 'erDiagram' && (
          <>
            <EntityEditor
              entityNode={node}
              onUpdate={(data) => onUpdate(node.id, data)}
            />
            <AttributeEditor
              attributes={node.data.attributes ?? []}
              onChange={(attributes) => onUpdate(node.id, { attributes })}
            />
          </>
        )}

        {/* 通用字段：样式 */}
        <NodeStyleEditor node={node} onUpdate={onUpdate} />

        <div className="panel-info">
          <span className="info-label">ID:</span>
          <span className="info-value">{node.id}</span>
        </div>
        <div className="panel-info">
          <span className="info-label">位置:</span>
          <span className="info-value">
            ({Math.round(node.position.x)}, {Math.round(node.position.y)})
          </span>
        </div>
      </div>
    </div>
  );
}

// === 边属性编辑器 ===

interface EdgePropertyEditorProps {
  edge: MermaidEdge;
  diagramType: DiagramType;
  onUpdate: (id: string, data: Partial<MermaidEdge['data']>) => void;
}

function EdgePropertyEditor({ edge, diagramType, onUpdate }: EdgePropertyEditorProps) {
  // erDiagram 使用专用 RelationshipEditor（含基数+关系类型+角色），跳过通用标签字段
  const skipGenericLabel = diagramType === 'erDiagram';

  // classDiagram 使用专用 RelationEditor（双端关系类型+基数+线型+标签），完整替代通用编辑
  if (diagramType === 'classDiagram') {
    return (
      <div className="property-panel">
        <h3 className="panel-title">关系属性</h3>
        <RelationEditor
          relation={edge}
          onUpdate={(data) => onUpdate(edge.id, data)}
        />
      </div>
    );
  }

  return (
    <div className="property-panel">
      <h3 className="panel-title">边属性</h3>
      <div className="panel-content">
        {/* flowchart: 使用专用 EdgeStyleEditor（M1：替代 inline select） */}
        {diagramType === 'flowchart' && (
          <EdgeStyleEditor
            edge={edge}
            onChange={(updates) => {
              if (updates.data) {
                onUpdate(edge.id, updates.data);
              }
            }}
          />
        )}

        {/* 通用字段：标签（erDiagram 由 RelationshipEditor 承载，flowchart 由 EdgeStyleEditor 承载） */}
        {!skipGenericLabel && diagramType !== 'flowchart' && (
          <label className="panel-label">
            标签
            <input
              className="panel-input"
              type="text"
              value={edge.data.label ?? ''}
              placeholder="（无标签）"
              onChange={(e) => onUpdate(edge.id, { label: e.target.value })}
            />
          </label>
        )}

        {/* classDiagram 已在 EdgePropertyEditor 入口处由 RelationEditor 完整承载，此处不再处理 */}

        {/* erDiagram: 关系编辑（基数+关系类型+角色） */}
        {diagramType === 'erDiagram' && (
          <RelationshipEditor
            relationshipEdge={edge}
            onUpdate={(data) => onUpdate(edge.id, data)}
          />
        )}

        <div className="panel-info">
          <span className="info-label">ID:</span>
          <span className="info-value">{edge.id}</span>
        </div>
        <div className="panel-info">
          <span className="info-label">连接:</span>
          <span className="info-value">{edge.source} → {edge.target}</span>
        </div>
      </div>
    </div>
  );
}

// === 节点样式编辑器（通用）===

interface NodeStyleEditorProps {
  node: MermaidNode;
  onUpdate: (id: string, data: Partial<MermaidNode['data']>) => void;
}

function NodeStyleEditor({ node, onUpdate }: NodeStyleEditorProps) {
  return (
    <>
      <div className="panel-section-title">样式</div>
      <label className="panel-label panel-color-row">
        填充色
        <input
          className="panel-color"
          type="color"
          value={node.data.style?.fill ?? '#ffffff'}
          onChange={(e) =>
            onUpdate(node.id, {
              style: { ...node.data.style, fill: e.target.value } as NodeStyle,
            })
          }
        />
      </label>
      <label className="panel-label panel-color-row">
        边框色
        <input
          className="panel-color"
          type="color"
          value={node.data.style?.stroke ?? '#333333'}
          onChange={(e) =>
            onUpdate(node.id, {
              style: { ...node.data.style, stroke: e.target.value } as NodeStyle,
            })
          }
        />
      </label>
      <label className="panel-label panel-color-row">
        文字色
        <input
          className="panel-color"
          type="color"
          value={node.data.style?.color ?? '#333333'}
          onChange={(e) =>
            onUpdate(node.id, {
              style: { ...node.data.style, color: e.target.value } as NodeStyle,
            })
          }
        />
      </label>
      <button
        className="panel-reset-btn"
        type="button"
        onClick={() => onUpdate(node.id, { style: undefined })}
      >
        重置样式
      </button>
    </>
  );
}

// === classDiagram 辅助函数 ===

/**
 * 从 note-edge 连线推断关联的 classId（NoteEditor 表单 select 当前值）
 *
 * 查找 edges 中 type='note-edge' 且 source===noteNodeId 的边，返回其 target（关联 classId）
 * 对齐模块4 onConnect note-edge 规范化方向（class=source/note=target）
 */
function inferAssociatedClassId(
  noteNodeId: string,
  edges: readonly MermaidEdge[] | undefined,
): string | undefined {
  if (!edges) return undefined;
  const noteEdge = edges.find(
    (e) => e.type === 'note-edge' && e.source === noteNodeId,
  );
  return noteEdge?.target;
}

/**
 * 从 nodes 过滤 class-box 节点构建 classOptions（NoteEditor 表单 select 选项）
 */
function buildClassOptions(
  nodes: readonly MermaidNode[] | undefined,
): readonly { id: string; label: string }[] {
  if (!nodes) return [];
  return nodes
    .filter((n) => n.type === 'class-box')
    .map((n) => ({ id: n.id, label: (n.data.label as string | undefined) ?? n.id }));
}

/**
 * 从 parentId 嵌套推断包含的类（NamespaceEditor 只读展示用）
 *
 * 过滤 nodes 中 parentId===namespaceNodeId 且 type==='class-box' 的节点
 */
function inferContainedClasses(
  namespaceNodeId: string,
  nodes: readonly MermaidNode[] | undefined,
): readonly MermaidNode[] {
  if (!nodes) return [];
  return nodes.filter(
    (n) => n.parentId === namespaceNodeId && n.type === 'class-box',
  );
}

/**
 * 用户在 NoteEditor 选择 classId 时，创建/更新/删除 note-edge（两者都支持的核心处理器）
 *
 * 实现逻辑（对齐设计文档接口签名）:
 *   - 查找现有 note-edge（source===noteNodeId && type==='note-edge'）
 *   - classId === undefined：删除现有 note-edge（如有）
 *   - classId !== undefined && 现有 note-edge 存在：更新 note-edge.target = classId
 *   - classId !== undefined && 无现有 note-edge：创建新 note-edge
 *
 * 数据源统一为 note-edge 连线（单一数据源），表单选择是编辑 note-edge 的一种方式
 */
function handleSelectNoteClassId(
  noteNodeId: string,
  classId: string | undefined,
  edges: readonly MermaidEdge[] | undefined,
  onUpdateEdges: ((edges: MermaidEdge[]) => void) | undefined,
): void {
  if (!edges || !onUpdateEdges) return;

  const existingIndex = edges.findIndex(
    (e) => e.type === 'note-edge' && e.source === noteNodeId,
  );
  const hasExisting = existingIndex >= 0;

  // classId === undefined：删除现有 note-edge（如有）
  if (classId === undefined) {
    if (hasExisting) {
      const newEdges = edges.filter((_, i) => i !== existingIndex);
      onUpdateEdges(newEdges);
    }
    return;
  }

  // classId !== undefined && 现有 note-edge 存在：更新 note-edge.target = classId
  if (hasExisting) {
    const newEdges = edges.map((e, i) =>
      i === existingIndex ? { ...e, target: classId } : e,
    );
    onUpdateEdges(newEdges);
    return;
  }

  // classId !== undefined && 无现有 note-edge：创建新 note-edge
  // 对齐模块4 onConnect note-edge 分支：edgeStyle='dotted', type='note-edge'
  const newNoteEdge: MermaidEdge = {
    id: `note-edge-${Date.now()}`,
    source: noteNodeId,
    target: classId,
    type: 'note-edge',
    data: { edgeStyle: 'dotted' },
  };
  onUpdateEdges([...edges, newNoteEdge]);
}

// === 通用辅助函数 ===

// 注：原本地 isSubgraphNode 函数已删除，统一使用 graph-canvas-helpers.ts 的 isContainerNode
// （单一数据源 institution §1.1，覆盖 subgraph + class-namespace + data.isSubgraph 三种判定）
