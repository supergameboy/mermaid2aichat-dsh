/**
 * SequenceCanvas — 时序图画布（专用渲染器，不使用 React Flow）
 *
 * 单一职责：管理时序图画布状态，渲染参与者/生命线/消息/注释/块结构/Box 分组
 *
 * 数据流设计（单向，无循环）：
 * - 服务端同步：syncCanvas → useEffect → 内部 state（nodes/edges/metadata）
 * - 本地操作：内部 state → CanvasEmitter.emitCanvasChange(canvas)
 *   → CodeConverter.canvasToCode 生成 mermaid → onCanvasChange(payload) → 外部发送到服务端
 *
 * Stage 7 修订（2026-06-30）：
 *   - 删除直接调用 serializeMermaid/parseMermaid，改用 CodeConverter + CanvasEmitter
 *   - 删除 mermaidCode useMemo（由 emitCanvasChange 返回值更新 state）
 *   - 删除 onCanvasUpdate 出口，统一走 onCanvasChange（携带 fullState + mermaid）
 *
 * 渲染层次（从底到顶）：
 *   1. Box 分组框（背景层）
 *   2. Block 块结构框（背景层）
 *   3. 生命线（虚线）
 *   4. 激活条
 *   5. 消息箭头
 *   6. 注释框
 *   7. 参与者框（顶层）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isSequenceCanvasState,
  mapCanvasStateToAst,
  type CanvasState,
  type SequenceCanvasState,
  type SequenceParticipant,
  type SequenceMessage,
  type SequenceActorType,
  type SequenceBlockInfo,
  type SequenceBlockType,
  type SequenceBoxInfo,
  type SequenceNoteInfo,
  type DiagramType,
  type FlowchartDirection,
  type MermaidShapeType,
} from '@mermaid2aichat/serializer';
import type { CanvasProps } from '../types.js';
import { idGenerator, createCodeChangeHandler } from '../services/index.js';
import { useCanvasServices } from '../hooks/use-canvas-services.js';
import { Toolbar } from '../components/toolbar.js';
import { NodeLibrary } from '../components/node-library.js';
import { CodeEditor } from '../components/code-editor.js';
import { InlineEditor } from '../components/inline-editor.js';
import { showToast } from '../components/toast.js';
import type { ConnectionMode } from '../nodes/index.js';
import {
  ParticipantRow,
  MessageRow,
  NoteRow,
  BlockFrame,
  BoxFrame,
  Lifeline,
  ActivationBar,
  SequenceArrowMarkers,
  SequenceBackground,
  SequenceMiniMap,
  type SequenceMiniMapRect,
  CanvasHelpPanel,
} from './index.js';
import {
  calculateLayout,
  type ActorLayout,
  type MessageLayoutItem,
} from './sequence-layout.js';
import { SEQUENCE_LAYOUT_CONFIG } from './sequence-constants.js';
import { screenToSvg } from './svg-coords.js';
import { useSequenceConnect } from './use-sequence-connect.js';
import { useSequenceReorder } from './use-sequence-reorder.js';
import { useSequenceParticipantReorder } from './use-sequence-participant-reorder.js';
import { useSequenceNoteReorder } from './use-sequence-note-reorder.js';
import { useSequenceBlockResize } from './use-sequence-block-resize.js';
import { useSequenceBoxAssign } from './use-sequence-box-assign.js';
import { useSequenceViewport } from './use-sequence-viewport.js';
import { validateActivationPairing } from './validate-activation-pairing.js';
// B5.4：编辑操作纯函数（提取自本文件，便于单元测试，对齐 code-standards.md §7.3）
import {
  reassignParticipantBox,
  adjustIndexAfterDeletion,
  isNestedBlock,
} from './sequence-edit-utils.js';
import {
  ParticipantEditor,
  MessageEditor,
  NoteEditor,
  BlockEditor,
  BoxEditor,
  ContextMenu,
  type ContextMenuItem,
} from '../components/sequence/index.js';
import '../styles.css';

// ============================================================
// 类型定义
// ============================================================

/** SequenceCanvas Props — 继承 CanvasProps，syncCanvas 为时序图专用
 *
 * SequenceCanvasState 解耦：syncCanvas 类型从 GraphCanvasState 改为 SequenceCanvasState。
 * 时序图不再借用 nodes/edges/metadata，使用独立的 participants/messages/notes/blocks/boxes/autonumber。
 */
export interface SequenceCanvasProps extends CanvasProps {
  /** syncCanvas 是 SequenceCanvasState（diagramType='sequenceDiagram'） */
  syncCanvas: SequenceCanvasState;
}

/** 选中项类型 */
type SelectedType = 'participant' | 'message' | 'note' | 'block' | 'box';

/** 选中项标识 */
interface Selection {
  type: SelectedType;
  /** participant/message 使用 id，note/block/box 使用数组索引 */
  id: string | number;
}

/**
 * B4.3：右键菜单目标（区分空白处 vs 元素）
 *
 * - undefined: 空白处右键（弹出新增主菜单）
 * - { type, id }: 元素右键（弹出"在此之后插入"+ 删除菜单）
 */
interface ContextMenuTarget {
  type: SelectedType;
  id: string | number;
}

/** B4.3：右键菜单状态（位置 + 目标） */
interface ContextMenuState {
  position: { x: number; y: number };
  target: ContextMenuTarget | undefined;
}

/**
 * B4.3：图表设置编辑面板状态
 *   - autonumber: 序列号开关
 *   - accTitle: 标题
 *   - accDescription: 描述
 *   - 由 handleOpenChartSettings 打开，由 ChartSettingsPanel 内嵌渲染
 */
interface ChartSettingsState {
  open: boolean;
  autonumber: boolean;
  accTitle: string;
  accDescription: string;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * SequenceCanvasState 解耦：删除 readSequenceBoxes 辅助函数
 *   - 原因：boxes 现在是 SequenceCanvasState 的独立字段，不再从 metadata.sequenceBoxes 读取
 *   - 单一数据源：canvas.boxes 直接使用，无需 helper
 */

/**
 * B2 v7 修复5 遗留死代码清理（B3.1 顺手修复）：
 *   - readCreatedActors / readDestroyedActors 已删除
 *   - 原因：B2 v7 修复5 删除了 GraphMetadata.createdActors/destroyedActors 字段定义
 *     （数据源迁移到 message.create/destroy，单一数据源原则）
 *   - 这两个 helper 函数引用已删除的字段，且从未被使用（grep 验证仅定义处出现）
 *   - 删除死代码符合"禁止过渡期代码"和"架构缺陷必须解决"原则
 */

/**
 * B3.3 改造（v9）：删除 computeActivationRanges / ActivationRange
 *   - 原因：被 layout.models.activations 取代（calculateLayout 阶段3 processMessages
 *     调用 newActivation 推入，BoundsModels.activations 持久保留所有激活记录）
 *   - ActivationBar 渲染改用 layout.models.activations[i]（单一数据源）
 *   - 详见 B3-L2 设计文档 v9 双数据源处理决策问题2
 */

/** 计算块结构嵌套深度 */
function computeBlockDepth(block: SequenceBlockInfo, allBlocks: SequenceBlockInfo[]): number {
  let depth = 0;
  for (const other of allBlocks) {
    if (other === block) continue;
    const otherStart = other.startMessage;
    const otherEnd = other.endMessage ?? Number.MAX_SAFE_INTEGER;
    if (block.startMessage >= otherStart && block.startMessage < otherEnd) {
      depth++;
    }
  }
  return depth;
}

// B5.4：reassignParticipantBox / adjustIndexAfterDeletion / isNestedBlock 三个纯函数
// 已提取到 ./sequence-edit-utils.ts，便于单元测试（对齐 code-standards.md §7.3 纯逻辑与副作用分离）

// ============================================================
// B4.3 常量：右键菜单选项
// ============================================================

/** 参与者类型选项（8 种 SequenceActorType，对齐 mermaid 语法） */
const PARTICIPANT_TYPE_OPTIONS: { value: SequenceActorType; label: string }[] = [
  { value: 'participant', label: 'Participant' },
  { value: 'actor', label: 'Actor' },
  { value: 'boundary', label: 'Boundary' },
  { value: 'collections', label: 'Collections' },
  { value: 'control', label: 'Control' },
  { value: 'database', label: 'Database' },
  { value: 'entity', label: 'Entity' },
  { value: 'queue', label: 'Queue' },
];

/** 块类型选项（8 种，对齐 SequenceBlockType，移除 autonumber） */
const BLOCK_TYPE_OPTIONS: { value: SequenceBlockType; label: string }[] = [
  { value: 'alt', label: 'alt (条件分支)' },
  { value: 'opt', label: 'opt (可选)' },
  { value: 'loop', label: 'loop (循环)' },
  { value: 'par', label: 'par (并行)' },
  { value: 'par-over', label: 'par_over (并行覆盖)' },
  { value: 'critical', label: 'critical (关键)' },
  { value: 'break', label: 'break (中断)' },
  { value: 'rect', label: 'rect (矩形)' },
];

// ============================================================
// 主组件
// ============================================================

export function SequenceCanvas(props: SequenceCanvasProps) {
  const {
    syncCanvas,
    syncViewport,
    onCanvasChange,
    onViewportChange,
    onDiagramTypeChange,
  } = props;

  // ============================================================
  // 内部状态（SequenceCanvasState 解耦：用专用字段替代 nodes/edges/metadata）
  // ============================================================

  const [participants, setParticipants] = useState<SequenceParticipant[]>(syncCanvas.participants);
  const [messages, setMessages] = useState<SequenceMessage[]>(syncCanvas.messages);
  const [notes, setNotes] = useState<SequenceNoteInfo[]>(syncCanvas.notes);
  const [blocks, setBlocks] = useState<SequenceBlockInfo[]>(syncCanvas.blocks);
  const [boxes, setBoxes] = useState<SequenceBoxInfo[]>(syncCanvas.boxes);
  const [autonumber, setAutonumber] = useState<boolean>(syncCanvas.autonumber);
  const [accTitle, setAccTitle] = useState<string | undefined>(syncCanvas.accTitle);
  const [accDescription, setAccDescription] = useState<string | undefined>(syncCanvas.accDescription);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [connectionMode] = useState<ConnectionMode>('direction');
  const [localDirection] = useState<FlowchartDirection>('TB');

  // B4.3：右键菜单状态（null 表示菜单关闭；target=undefined 表示空白处右键）
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // B4.3：图表设置编辑面板状态（autonumber/accTitle/accDescription）
  const [chartSettings, setChartSettings] = useState<ChartSettingsState>({
    open: false,
    autonumber: syncCanvas.autonumber,
    accTitle: syncCanvas.accTitle ?? '',
    accDescription: syncCanvas.accDescription ?? '',
  });

  // refs 用于回调中读取最新值
  const participantsRef = useRef(participants);
  const messagesRef = useRef(messages);
  const notesRef = useRef(notes);
  const blocksRef = useRef(blocks);
  const boxesRef = useRef(boxes);
  const autonumberRef = useRef(autonumber);
  const accTitleRef = useRef(accTitle);
  const accDescriptionRef = useRef(accDescription);
  participantsRef.current = participants;
  messagesRef.current = messages;
  notesRef.current = notes;
  blocksRef.current = blocks;
  boxesRef.current = boxes;
  autonumberRef.current = autonumber;
  accTitleRef.current = accTitle;
  accDescriptionRef.current = accDescription;

  // ============================================================
  // Stage 7：CodeConverter + CanvasEmitter 服务实例（通过 useCanvasServices 统一管理）
  // ============================================================
  // CodeConverter：封装 parseMermaid + serializeMermaid，管理 rawCode/previousCanvas 缓存
  // CanvasEmitter：统一画布变更出口，内部调用 canvasToCode 生成 mermaid
  // 实例生命周期与 SequenceCanvas 一致（useRef 持有，组件卸载时自动 GC）
  const { codeConverter, canvasEmitter, mermaidCode, setMermaidCode } = useCanvasServices({
    syncCanvas,
    onCanvasChange,
  });

  // ============================================================
  // 同步外部状态（SequenceCanvasState 解耦：从 syncCanvas 专用字段同步）
  // ============================================================

  useEffect(() => {
    setParticipants(syncCanvas.participants);
  }, [syncCanvas.participants]);

  useEffect(() => {
    setMessages(syncCanvas.messages);
  }, [syncCanvas.messages]);

  useEffect(() => {
    setNotes(syncCanvas.notes);
  }, [syncCanvas.notes]);

  useEffect(() => {
    setBlocks(syncCanvas.blocks);
  }, [syncCanvas.blocks]);

  useEffect(() => {
    setBoxes(syncCanvas.boxes);
  }, [syncCanvas.boxes]);

  useEffect(() => {
    setAutonumber(syncCanvas.autonumber);
  }, [syncCanvas.autonumber]);

  useEffect(() => {
    setAccTitle(syncCanvas.accTitle);
  }, [syncCanvas.accTitle]);

  useEffect(() => {
    setAccDescription(syncCanvas.accDescription);
  }, [syncCanvas.accDescription]);

  // ============================================================
  // 派生数据（SequenceCanvasState 解耦：直接使用 state，无需从 metadata 派生）
  // ============================================================

  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => a.sequence - b.sequence);
  }, [messages]);

  // ============================================================
  // B3.3 改造（v9）：派生 SequenceAST + LayoutResult（单一数据源）
  // ============================================================
  // 数据流：SequenceCanvasState → mapCanvasStateToAst → SequenceAST → calculateLayout → LayoutResult
  // 渲染层（8 个子组件）从 layout 派生 props，删除原 lastMessageY/activationRanges/
  // participantIndexMap/canvasWidth/canvasHeight 等重复计算
  // 详见 B3-L2 设计文档 v9 调用路径 + SequenceCanvas 改造细节

  const canvasState = useMemo<SequenceCanvasState>(() => ({
    diagramType: 'sequenceDiagram',
    participants,
    messages,
    notes,
    blocks,
    boxes,
    autonumber,
    ...(accTitle !== undefined ? { accTitle } : {}),
    ...(accDescription !== undefined ? { accDescription } : {}),
  }), [participants, messages, notes, blocks, boxes, autonumber, accTitle, accDescription]);

  const ast = useMemo(() => mapCanvasStateToAst(canvasState), [canvasState]);
  const layout = useMemo(() => calculateLayout(ast), [ast]);

  // MiniMap 缩略 rect 聚合（box → block → participant → note，大容器在下层避免遮挡）
  // 对齐 React Flow <MiniMap/> 只接收 nodes 数组、按顺序渲染的设计
  // block 从 models.loops 派生，字段可空用 ?? 0 收敛，跳过尺寸 ≤ 0 的无效块
  const minimapRects: SequenceMiniMapRect[] = useMemo(() => {
    const rects: SequenceMiniMapRect[] = [];
    for (const box of layout.boxLayouts) {
      rects.push(box.bounds);
    }
    for (const loop of layout.models.loops) {
      const x = loop.startx ?? 0;
      const y = loop.starty ?? 0;
      const w = (loop.stopx ?? 0) - x;
      const h = (loop.stopy ?? 0) - y;
      if (w > 0 && h > 0) {
        rects.push({ x, y, width: w, height: h });
      }
    }
    for (const p of layout.participantLayouts) {
      rects.push(p.bounds);
    }
    for (const n of layout.noteLayouts) {
      rects.push(n.bounds);
    }
    return rects;
  }, [layout.boxLayouts, layout.models.loops, layout.participantLayouts, layout.noteLayouts]);

  // canvasWidth/canvasHeight/viewBox 直接来自 layout（单一数据源，删除原 useMemo 重复计算）
  const { canvasWidth, canvasHeight, viewBox } = layout;
  // P3-2 修复：bottomY 提取为顶部一次性变量（stopy 类型为 number | undefined，空图场景可能 undefined）
  // 与 calculateLayout 阶段6 的 (data.stopy ?? 0) 策略一致，避免在多处重复 ?? 0
  const bottomY = layout.bounds.stopy ?? 0;

  // 消息布局查找性能优化（O(1) 查找）：sequence → MessageLayoutItem
  const messageLayoutMap = useMemo(() => {
    const m = new Map<number, MessageLayoutItem>();
    for (const item of layout.messageLayouts) m.set(item.sequence, item);
    return m;
  }, [layout.messageLayouts]);

  // ============================================================
  // 统一画布变更入口（对齐 GraphCanvas 的 applyCanvasChange 模式）
  // ============================================================

  /**
   * 统一时序画布变更入口
   *
   * 接收 Partial<SequenceCanvasState>，与 ref 镜像合并成完整 canvas，
   * 同步 setXxx + emitCanvasChange + setMermaidCode。
   *
   * 数据流（设计文档 §调用路径1）：
   *   handler 同步计算 nextXxx → applySequenceCanvasChange({ xxx: nextXxx })
   *     ├─ 用 ref 兜底未变更字段，合并成完整 SequenceCanvasState
   *     ├─ 同步 setXxx（React state 更新）
   *     └─ canvasEmitter.emitCanvasChange(nextCanvas) → onCanvasChange(payload) + setMermaidCode
   *
   * 对比原 notifyUpdate + setTimeout(0) 模式：无跨事件循环时序依赖，消除 13 处 setTimeout。
   */
  const applySequenceCanvasChange = useCallback((changes: Partial<SequenceCanvasState>) => {
    const nextCanvas: SequenceCanvasState = {
      diagramType: 'sequenceDiagram',
      participants: changes.participants ?? participantsRef.current,
      messages: changes.messages ?? messagesRef.current,
      notes: changes.notes ?? notesRef.current,
      blocks: changes.blocks ?? blocksRef.current,
      boxes: changes.boxes ?? boxesRef.current,
      autonumber: changes.autonumber ?? autonumberRef.current,
      ...((changes.accTitle !== undefined
        ? { accTitle: changes.accTitle }
        : accTitleRef.current !== undefined
          ? { accTitle: accTitleRef.current }
          : {})),
      ...((changes.accDescription !== undefined
        ? { accDescription: changes.accDescription }
        : accDescriptionRef.current !== undefined
          ? { accDescription: accDescriptionRef.current }
          : {})),
    };
    if (changes.participants !== undefined) setParticipants(changes.participants);
    if (changes.messages !== undefined) setMessages(changes.messages);
    if (changes.notes !== undefined) setNotes(changes.notes);
    if (changes.blocks !== undefined) setBlocks(changes.blocks);
    if (changes.boxes !== undefined) setBoxes(changes.boxes);
    if (changes.autonumber !== undefined) setAutonumber(changes.autonumber);
    if (changes.accTitle !== undefined) setAccTitle(changes.accTitle);
    if (changes.accDescription !== undefined) setAccDescription(changes.accDescription);
    // emitCanvasChange 内部调用 canvasToCode 生成 mermaid + 组装 payload + 调用 onCanvasChange
    // 返回值 mermaid 用于更新本地 mermaidCode state（喂 CodeEditor）
    const newMermaid = canvasEmitter.emitCanvasChange(nextCanvas);
    setMermaidCode(newMermaid);
  }, [canvasEmitter]);

  /**
   * 校验 messages 并在非法时 Toast 提示（源头拦截统一入口）
   *
   * 算法：
   *   1. 调用 validateActivationPairing(messages) 模拟 newActivation/endActivation 栈操作
   *   2. valid=true → return true（调用方负责 applySequenceCanvasChange({ messages })）
   *   3. valid=false → showToast(issues[0].message, 'error') + return false（调用方不写入）
   *
   * 注意：本函数不负责 setMessages/applySequenceCanvasChange，仅负责校验 + Toast。
   * 调用方根据返回值决定是否写入，便于复合场景（如 Delete key 复合删除
   * 需要同时变更 participants/messages/notes，校验失败时全部不写入）。
   *
   * @returns 是否合法（true=可以写入，false=已 Toast 提示，不要写入）
   */
  const validateAndToast = useCallback((messages: SequenceMessage[]): boolean => {
    const result = validateActivationPairing(messages);
    if (!result.valid) {
      const firstIssue = result.issues[0];
      if (firstIssue) {
        showToast(firstIssue.message, 'error');
      }
      return false;
    }
    return true;
  }, []);

  // ============================================================
  // 代码编辑
  // ============================================================

  // 图类型变更检查 + 解析失败处理由 createCodeChangeHandler 统一封装（根因 A 修复）
  // onSameTypeUpdate 保留 SequenceCanvas 专属逻辑：isSequenceCanvasState 守卫 + 激活配对校验 + 字段写入
  const handleCodeChange = useCallback(
    createCodeChangeHandler({
      codeConverter,
      canvasEmitter,
      setMermaidCode,
      setCodeError,
      currentType: syncCanvas.diagramType,
      onSameTypeUpdate: (newCanvas: CanvasState) => {
        // 同类型更新：isSequenceCanvasState 守卫
        // （SequenceCanvasState 解耦后 isGraphCanvasState 对 sequence 永远 false）
        if (!isSequenceCanvasState(newCanvas)) {
          setCodeError('内部错误：解析结果不是 SequenceCanvasState');
          return;
        }
        // 源头拦截：校验激活/停用配对，非法时不写入并保持上一份合法状态
        if (!validateAndToast(newCanvas.messages)) {
          setCodeError('代码中存在激活/停用配对失配，画布保持上一份合法状态');
          return;
        }
        setCodeError(null);
        setSelection(null);
        // 走统一变更入口（同步 setXxx + emitCanvasChange + setMermaidCode）
        applySequenceCanvasChange({
          participants: newCanvas.participants,
          messages: newCanvas.messages,
          notes: newCanvas.notes,
          blocks: newCanvas.blocks,
          boxes: newCanvas.boxes,
          autonumber: newCanvas.autonumber,
          ...(newCanvas.accTitle !== undefined ? { accTitle: newCanvas.accTitle } : {}),
          ...(newCanvas.accDescription !== undefined ? { accDescription: newCanvas.accDescription } : {}),
        });
      },
    }),
    [codeConverter, canvasEmitter, setMermaidCode, setCodeError, validateAndToast, applySequenceCanvasChange, syncCanvas.diagramType],
  );

  // ============================================================
  // 选中和编辑
  // ============================================================

  const handleSelectParticipant = useCallback((id: string) => {
    setSelection({ type: 'participant', id });
  }, []);

  const handleEditParticipant = useCallback((id: string) => {
    setEditingParticipantId(id);
    setSelection({ type: 'participant', id });
  }, []);

  const handleSelectMessage = useCallback((id: string) => {
    setSelection({ type: 'message', id });
  }, []);

  const handleEditMessage = useCallback((id: string) => {
    setEditingMessageId(id);
    setSelection({ type: 'message', id });
  }, []);

  const handleSelectNote = useCallback((noteIndex: number) => {
    setSelection({ type: 'note', id: noteIndex });
  }, []);

  const handleSelectBlock = useCallback((blockIndex: number) => {
    setSelection({ type: 'block', id: blockIndex });
  }, []);

  const handleSelectBox = useCallback((boxIndex: number) => {
    setSelection({ type: 'box', id: boxIndex });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  // ============================================================
  // 内联编辑确认
  // ============================================================

  const confirmParticipantEdit = useCallback((id: string, newLabel: string) => {
    const nextParticipants = participantsRef.current.map((p) =>
      p.id === id ? { ...p, label: newLabel } : p
    );
    setEditingParticipantId(null);
    applySequenceCanvasChange({ participants: nextParticipants });
  }, [applySequenceCanvasChange]);

  const confirmMessageEdit = useCallback((id: string, newLabel: string) => {
    const nextMessages = messagesRef.current.map((m) =>
      m.id === id ? { ...m, label: newLabel } : m
    );
    setEditingMessageId(null);
    applySequenceCanvasChange({ messages: nextMessages });
  }, [applySequenceCanvasChange]);

  // ============================================================
  // 属性面板更新
  // ============================================================

  const handleUpdateParticipant = useCallback((id: string, data: Partial<SequenceParticipant>) => {
    const nextParticipants = participantsRef.current.map((p) =>
      p.id === id ? { ...p, ...data } : p
    );
    applySequenceCanvasChange({ participants: nextParticipants });
  }, [applySequenceCanvasChange]);

  const handleUpdateMessage = useCallback((id: string, data: Partial<SequenceMessage>) => {
    const nextMessages = messagesRef.current.map((m) =>
      m.id === id ? { ...m, ...data } : m
    );
    if (!validateAndToast(nextMessages)) return;
    applySequenceCanvasChange({ messages: nextMessages });
  }, [validateAndToast, applySequenceCanvasChange]);

  const handleUpdateMessageSource = useCallback((id: string, source: string) => {
    const nextMessages = messagesRef.current.map((m) =>
      m.id === id ? { ...m, from: source } : m
    );
    if (!validateAndToast(nextMessages)) return;
    applySequenceCanvasChange({ messages: nextMessages });
  }, [validateAndToast, applySequenceCanvasChange]);

  const handleUpdateMessageTarget = useCallback((id: string, target: string) => {
    const nextMessages = messagesRef.current.map((m) =>
      m.id === id ? { ...m, to: target } : m
    );
    if (!validateAndToast(nextMessages)) return;
    applySequenceCanvasChange({ messages: nextMessages });
  }, [validateAndToast, applySequenceCanvasChange]);

  const handleUpdateNote = useCallback((noteIndex: number, data: Partial<SequenceNoteInfo>) => {
    const nextNotes = notesRef.current.map((n, i) =>
      i === noteIndex ? { ...n, ...data } : n
    );
    applySequenceCanvasChange({ notes: nextNotes });
  }, [applySequenceCanvasChange]);

  const handleUpdateBlock = useCallback((blockIndex: number, data: Partial<SequenceBlockInfo>) => {
    const nextBlocks = blocksRef.current.map((b, i) =>
      i === blockIndex ? { ...b, ...data } : b
    );
    applySequenceCanvasChange({ blocks: nextBlocks });
  }, [applySequenceCanvasChange]);

  const handleUpdateBox = useCallback((boxIndex: number, data: Partial<SequenceBoxInfo>) => {
    const nextBoxes = boxesRef.current.map((b, i) =>
      i === boxIndex ? { ...b, ...data } : b
    );
    // B4.2: actorKeys 单一数据源同步——若 actorKeys 变更，从其他 box 移除新增的参与者
    // （一个参与者只能属于一个 box）
    if (data.actorKeys !== undefined) {
      const targetBox = boxesRef.current[boxIndex];
      if (targetBox) {
        const oldActorKeys = new Set(targetBox.actorKeys);
        const addedActors = data.actorKeys.filter((id) => !oldActorKeys.has(id));
        if (addedActors.length > 0) {
          const addedSet = new Set(addedActors);
          for (let i = 0; i < nextBoxes.length; i++) {
            if (i === boxIndex) continue;
            const box = nextBoxes[i];
            if (box.actorKeys.some((id) => addedSet.has(id))) {
              nextBoxes[i] = {
                ...box,
                actorKeys: box.actorKeys.filter((id) => !addedSet.has(id)),
              };
            }
          }
        }
      }
    }
    applySequenceCanvasChange({ boxes: nextBoxes });
  }, [applySequenceCanvasChange]);

  /**
   * B4.2: 切换参与者所属 Box（属性面板入口）
   * 委托 reassignParticipantBox 纯函数（与 handleAssignBox 共用，单一数据源：box.actorKeys）
   */
  const handleUpdateBoxAssignment = useCallback(
    (participantId: string, newBoxId: string | null) => {
      const nextBoxes = reassignParticipantBox(boxesRef.current, participantId, newBoxId);
      applySequenceCanvasChange({ boxes: nextBoxes });
    },
    [applySequenceCanvasChange],
  );

  // ============================================================
  // 添加参与者
  // ============================================================

  const handleAddParticipant = useCallback((_shape: MermaidShapeType) => {
    const newId = idGenerator.generate('seq_part');
    // shape → actorType 映射：seq-actor → 'actor'，其他（seq-participant 等）→ 'participant'
    // 未来若节点库扩展更多 seq-* 模板，可在此映射到对应 SequenceActorType
    const actorType: SequenceActorType = _shape === 'seq-actor' ? 'actor' : 'participant';
    const newParticipant: SequenceParticipant = {
      id: newId,
      label: `参与者${participantsRef.current.length + 1}`,
      actorType,
      explicitlyDeclared: true,
    };
    const nextParticipants = [...participantsRef.current, newParticipant];
    applySequenceCanvasChange({ participants: nextParticipants });
  }, [applySequenceCanvasChange]);

  // ============================================================
  // B4.3：5 类新增处理函数 + 图表设置
  // ============================================================

  /** B4.3：新增指定类型的参与者（可选加入指定 box） */
  const handleAddParticipantWithType = useCallback(
    (actorType: SequenceActorType, boxId?: string) => {
      const newId = idGenerator.generate('seq_part');
      const newParticipant: SequenceParticipant = {
        id: newId,
        label: `参与者${participantsRef.current.length + 1}`,
        actorType,
        explicitlyDeclared: true,
      };
      const nextParticipants = [...participantsRef.current, newParticipant];
      // 若指定 box，将参与者加入 box.actorKeys（单一数据源）
      if (boxId !== undefined) {
        const nextBoxes = boxesRef.current.map((box) =>
          box.id === boxId
            ? { ...box, actorKeys: [...box.actorKeys, newId] }
            : box,
        );
        applySequenceCanvasChange({ participants: nextParticipants, boxes: nextBoxes });
      } else {
        applySequenceCanvasChange({ participants: nextParticipants });
      }
      // 自动选中并打开编辑
      setSelection({ type: 'participant', id: newId });
      setEditingParticipantId(newId);
    },
    [applySequenceCanvasChange],
  );

  /** B4.3：新增消息（在指定消息索引后插入；afterIndex=undefined 表示末尾追加） */
  const handleAddMessage = useCallback(
    (afterIndex?: number) => {
      const sorted = [...messagesRef.current].sort((a, b) => a.sequence - b.sequence);
      const insertAt = afterIndex === undefined ? sorted.length : afterIndex + 1;
      // 默认 from/to：取已有消息中的参与者；若空图则使用占位 id（用户后续编辑）
      const fallbackFrom = sorted[0]?.from ?? 'A';
      const fallbackTo = sorted[0]?.to ?? 'B';
      const newMessage: SequenceMessage = {
        id: idGenerator.generate('seq_msg'),
        from: fallbackFrom,
        to: fallbackTo,
        label: '',
        messageType: 'solid-arrow',
        sequence: insertAt,
      };
      // 插入到 sorted 的 insertAt 位置，重新分配 sequence = index
      const newSorted = [
        ...sorted.slice(0, insertAt),
        newMessage,
        ...sorted.slice(insertAt),
      ];
      const newMessages = newSorted.map((m, i) => ({ ...m, sequence: i }));
      if (!validateAndToast(newMessages)) return;
      applySequenceCanvasChange({ messages: newMessages });
      // 自动选中并打开编辑
      setSelection({ type: 'message', id: newMessage.id });
      setEditingMessageId(newMessage.id);
    },
    [validateAndToast, applySequenceCanvasChange],
  );

  /** B4.3：新增注释（在指定消息索引后插入；afterIndex=undefined 表示末尾） */
  const handleAddNote = useCallback(
    (afterIndex?: number) => {
      const messageIndex = afterIndex === undefined ? messagesRef.current.length : afterIndex + 1;
      // 默认关联第一个参与者；若空图则使用占位 id（用户后续编辑）
      const fallbackParticipant = participantsRef.current[0]?.id ?? 'A';
      const newNote: SequenceNoteInfo = {
        participantIds: [fallbackParticipant],
        position: 'over',
        label: '',
        messageIndex,
      };
      const nextNotes = [...notesRef.current, newNote];
      applySequenceCanvasChange({ notes: nextNotes });
      // 自动选中新 note（索引为最后一个）
      setSelection({ type: 'note', id: nextNotes.length - 1 });
    },
    [applySequenceCanvasChange],
  );

  /** B4.3：新增块（指定类型，覆盖 startMessage..endMessage 范围） */
  const handleAddBlock = useCallback(
    (type: SequenceBlockType, startMessage: number, endMessage: number) => {
      const isRect = type === 'rect';
      const newBlock: SequenceBlockInfo = {
        type,
        label: isRect ? '' : type,
        ...(isRect ? { color: 'rgb(200,200,200)' } : {}),
        startMessage,
        endMessage,
        midBranches: [],
      };
      const nextBlocks = [...blocksRef.current, newBlock];
      applySequenceCanvasChange({ blocks: nextBlocks });
      // 自动选中新 block（索引为最后一个）
      setSelection({ type: 'block', id: nextBlocks.length - 1 });
    },
    [applySequenceCanvasChange],
  );

  /** B4.3：新增 Box（默认 rgba 颜色 + 空参与者列表） */
  const handleAddBox = useCallback(() => {
    const newBox: SequenceBoxInfo = {
      id: idGenerator.generate('seq_box'),
      name: `Box${boxesRef.current.length + 1}`,
      color: 'rgba(100,150,200,0.2)',
      actorKeys: [],
      wrap: false,
    };
    const nextBoxes = [...boxesRef.current, newBox];
    applySequenceCanvasChange({ boxes: nextBoxes });
    // 自动选中新 box（索引为最后一个）
    setSelection({ type: 'box', id: nextBoxes.length - 1 });
  }, [applySequenceCanvasChange]);

  /** B4.3：打开图表设置面板（autonumber/accTitle/accDescription） */
  const handleOpenChartSettings = useCallback(() => {
    setChartSettings({
      open: true,
      autonumber: autonumberRef.current,
      accTitle: accTitleRef.current ?? '',
      accDescription: accDescriptionRef.current ?? '',
    });
  }, []);

  /** B4.3：图表设置面板字段变更（实时同步本地 state，不立即写画布） */
  const handleChartSettingsChange = useCallback(
    (data: Partial<ChartSettingsState>) => {
      setChartSettings((prev) => ({ ...prev, ...data }));
    },
    [],
  );

  /** B4.3：图表设置面板确认（写入画布并关闭面板） */
  const handleChartSettingsConfirm = useCallback(() => {
    applySequenceCanvasChange({
      autonumber: chartSettings.autonumber,
      accTitle: chartSettings.accTitle,
      accDescription: chartSettings.accDescription,
    });
    setChartSettings((prev) => ({ ...prev, open: false }));
  }, [chartSettings, applySequenceCanvasChange]);

  /** B4.3：图表设置面板取消（丢弃修改并关闭面板） */
  const handleChartSettingsCancel = useCallback(() => {
    setChartSettings((prev) => ({ ...prev, open: false }));
  }, []);

  /** B4.3：右键事件处理（区分空白处 vs 元素） */
  const handleContextMenu = useCallback(
    (event: React.MouseEvent, target?: ContextMenuTarget) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
        target,
      });
    },
    [],
  );

  /**
   * B4.3：构造空白处右键菜单（6 项主菜单）
   * - 新增参与者（子菜单：8 种类型）
   * - 新增消息
   * - 新增注释
   * - 新增块（子菜单：8 种类型）
   * - 新增 Box
   * - 分隔线
   * - 图表设置
   */
  const buildCanvasMenu = useCallback((): ContextMenuItem[] => {
    // 当前消息范围（用于新增块的默认范围）
    const msgCount = messagesRef.current.length;
    const startMsg = 0;
    const endMsg = msgCount;
    return [
      {
        id: 'add-participant',
        label: '新增参与者',
        submenu: PARTICIPANT_TYPE_OPTIONS.map((opt) => ({
          id: `add-participant-${opt.value}`,
          label: opt.label,
          onClick: () => handleAddParticipantWithType(opt.value),
        })),
      },
      {
        id: 'add-message',
        label: '新增消息',
        onClick: () => handleAddMessage(),
      },
      {
        id: 'add-note',
        label: '新增注释',
        onClick: () => handleAddNote(),
      },
      {
        id: 'add-block',
        label: '新增块',
        submenu: BLOCK_TYPE_OPTIONS.map((opt) => ({
          id: `add-block-${opt.value}`,
          label: opt.label,
          onClick: () => handleAddBlock(opt.value, startMsg, endMsg),
        })),
      },
      {
        id: 'add-box',
        label: '新增 Box',
        onClick: () => handleAddBox(),
      },
      { id: 'separator-1', label: '', separator: true },
      {
        id: 'chart-settings',
        label: '图表设置',
        onClick: () => handleOpenChartSettings(),
      },
    ];
  }, [handleAddParticipantWithType, handleAddMessage, handleAddNote, handleAddBlock, handleAddBox, handleOpenChartSettings]);

  // ============================================================
  // B4.5：统一删除处理（含完整副作用同步）
  // ============================================================
  // 被 buildElementMenu 的"删除"菜单项 + Delete 键 useEffect 共用，
  // 消除两处重复的删除逻辑（code-standards.md §2.4「一个概念只表达一次」）
  //
  // 5 类元素的删除副作用：
  //   - participant: 级联清理 messages + notes + boxes.actorKeys + 重排 sequence + 同步 notes/blocks 索引
  //   - message: 重排 sequence + 同步 notes.messageIndex + blocks.startMessage/endMessage/midBranches + 清理孤儿
  //   - note: 简单过滤（无副作用）
  //   - block: 含嵌套子块连带删除（块删除不影响消息索引，notes/blocks 不需调整）
  //   - box: 简单过滤（参与者自动解绑，单一数据源 box.actorKeys）
  //
  // 索引调整语义（adjustIndexAfterDeletion）:
  //   - messageIndex / startMessage 等于被删索引 → 标记 -1，外层 filter 清理孤儿
  //   - endMessage 等于被删索引 → 指向被删索引（变为不含该消息的排他终点，保留合法空块）
  //   - 其他索引 → 按被删索引数量前移
  const handleDelete = useCallback(
    (target: Selection): void => {
      const changes: Partial<SequenceCanvasState> = {};

      if (target.type === 'participant') {
        const id = target.id as string;
        // 1. 过滤 participants
        const nextParticipants = participantsRef.current.filter((p) => p.id !== id);
        // 2. 过滤 messages（移除 from === id 或 to === id 的），收集被删 sequence
        const removedSequences = new Set<number>();
        const survivingMessages: SequenceMessage[] = [];
        for (const m of messagesRef.current) {
          if (m.from === id || m.to === id) {
            removedSequences.add(m.sequence);
          } else {
            survivingMessages.push(m);
          }
        }
        // 3. 按 sequence 排序后重新分配 sequence = index（0..N 连续）
        const nextMessages = survivingMessages
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map((m, i) => ({ ...m, sequence: i }));
        // 4. 过滤 notes（移除 participantIds 含 id 的）
        const filteredNotes = notesRef.current.filter((n) => !n.participantIds.includes(id));
        // 5. 调整剩余 notes.messageIndex + 清理孤儿（附着消息被删的 Note）
        const nextNotes = filteredNotes
          .map((note) => ({
            ...note,
            messageIndex: adjustIndexAfterDeletion(note.messageIndex, removedSequences),
          }))
          .filter((note) => note.messageIndex >= 0);
        // 6. 调整 blocks.startMessage/endMessage/midBranches + 清理孤儿块（保留合法空块）
        const nextBlocks = blocksRef.current
          .map((block) => ({
            ...block,
            startMessage: adjustIndexAfterDeletion(block.startMessage, removedSequences),
            endMessage: adjustIndexAfterDeletion(block.endMessage, removedSequences, true),
            midBranches: block.midBranches.map((b) => ({
              ...b,
              startMessage: adjustIndexAfterDeletion(b.startMessage, removedSequences),
              endMessage: adjustIndexAfterDeletion(b.endMessage, removedSequences, true),
            })),
          }))
          .filter((block) => block.startMessage >= 0 && block.endMessage >= block.startMessage);
        // 7. 清理 boxes.actorKeys（移除 id，单一数据源）
        const nextBoxes = boxesRef.current.map((box) => ({
          ...box,
          actorKeys: box.actorKeys.filter((k) => k !== id),
        }));
        // 8. 源头拦截：删除参与者会移除相关 message，可能断裂其他参与者的激活/停用配对
        if (!validateAndToast(nextMessages)) return;
        changes.participants = nextParticipants;
        changes.messages = nextMessages;
        changes.notes = nextNotes;
        changes.blocks = nextBlocks;
        changes.boxes = nextBoxes;
      } else if (target.type === 'message') {
        const id = target.id as string;
        // 1. 找到被删消息的 sequence
        const removedMsg = messagesRef.current.find((m) => m.id === id);
        if (removedMsg === undefined) return;
        const removedSequences = new Set<number>([removedMsg.sequence]);
        // 2. 过滤 messages + 重新分配 sequence = index
        const nextMessages = messagesRef.current
          .filter((m) => m.id !== id)
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map((m, i) => ({ ...m, sequence: i }));
        // 3. 调整 notes.messageIndex + 清理孤儿
        const nextNotes = notesRef.current
          .map((note) => ({
            ...note,
            messageIndex: adjustIndexAfterDeletion(note.messageIndex, removedSequences),
          }))
          .filter((note) => note.messageIndex >= 0);
        // 4. 调整 blocks.startMessage/endMessage/midBranches + 清理孤儿块
        const nextBlocks = blocksRef.current
          .map((block) => ({
            ...block,
            startMessage: adjustIndexAfterDeletion(block.startMessage, removedSequences),
            endMessage: adjustIndexAfterDeletion(block.endMessage, removedSequences, true),
            midBranches: block.midBranches.map((b) => ({
              ...b,
              startMessage: adjustIndexAfterDeletion(b.startMessage, removedSequences),
              endMessage: adjustIndexAfterDeletion(b.endMessage, removedSequences, true),
            })),
          }))
          .filter((block) => block.startMessage >= 0 && block.endMessage >= block.startMessage);
        // 5. 源头拦截：删除带 activate/deactivate 的消息会断裂配对
        if (!validateAndToast(nextMessages)) return;
        changes.messages = nextMessages;
        changes.notes = nextNotes;
        changes.blocks = nextBlocks;
      } else if (target.type === 'note') {
        const idx = target.id as number;
        changes.notes = notesRef.current.filter((_, i) => i !== idx);
      } else if (target.type === 'block') {
        const idx = target.id as number;
        const parentBlock = blocksRef.current[idx];
        if (parentBlock === undefined) return;
        // 连带删除嵌套子块（子块是块结构，非消息）
        // 块删除不影响消息索引：notes 仍附着原消息，其他块的 start/endMessage 仍指向相同消息
        const indicesToDelete = new Set<number>([idx]);
        blocksRef.current.forEach((b, i) => {
          if (i !== idx && isNestedBlock(b, parentBlock)) {
            indicesToDelete.add(i);
          }
        });
        changes.blocks = blocksRef.current.filter((_, i) => !indicesToDelete.has(i));
      } else if (target.type === 'box') {
        const idx = target.id as number;
        // Box 删除：参与者自动解绑（单一数据源 box.actorKeys，无需额外清理）
        changes.boxes = boxesRef.current.filter((_, i) => i !== idx);
      }

      setSelection(null);
      setContextMenu(null);
      applySequenceCanvasChange(changes);
    },
    [validateAndToast, applySequenceCanvasChange],
  );

  /**
   * B4.3：构造元素右键菜单（"在此之后插入"+ 删除）
   * - 子菜单：消息 / 注释 / 块（8 种）
   * - 分隔线
   * - 删除（调用 B4.5 统一 handleDelete）
   */
  const buildElementMenu = useCallback(
    (target: ContextMenuTarget): ContextMenuItem[] => {
      // 计算 afterIndex（基于元素索引）
      let afterIndex: number;
      if (target.type === 'message') {
        // message 用 id 查找 sequence
        const msg = messagesRef.current.find((m) => m.id === (target.id as string));
        afterIndex = msg ? msg.sequence : messagesRef.current.length - 1;
      } else if (target.type === 'note' || target.type === 'block' || target.type === 'box') {
        afterIndex = target.id as number;
      } else {
        // participant 不支持"在此之后插入"概念，使用末尾
        afterIndex = messagesRef.current.length - 1;
      }

      // 当前消息范围（用于新增块）
      const msgCount = messagesRef.current.length;
      const startMsg = afterIndex >= 0 ? afterIndex : 0;
      const endMsg = msgCount;

      return [
        {
          id: 'insert-after',
          label: '在此之后插入',
          submenu: [
            {
              id: 'insert-message',
              label: '消息',
              onClick: () => handleAddMessage(afterIndex),
            },
            {
              id: 'insert-note',
              label: '注释',
              onClick: () => handleAddNote(afterIndex),
            },
            {
              id: 'insert-block',
              label: '块',
              submenu: BLOCK_TYPE_OPTIONS.map((opt) => ({
                id: `insert-block-${opt.value}`,
                label: opt.label,
                onClick: () => handleAddBlock(opt.value, startMsg, endMsg),
              })),
            },
          ],
        },
        { id: 'separator-1', label: '', separator: true },
        {
          id: 'delete',
          label: '删除',
          onClick: () => handleDelete(target),
        },
      ];
    },
    [handleAddMessage, handleAddNote, handleAddBlock, handleDelete],
  );

  /** B4.3：构造当前 contextMenu 的菜单项（基于 target 分发） */
  const contextMenuItems = useMemo<ContextMenuItem[]>((): ContextMenuItem[] => {
    if (contextMenu === null) return [];
    if (contextMenu.target === undefined) {
      return buildCanvasMenu();
    }
    return buildElementMenu(contextMenu.target);
  }, [contextMenu, buildCanvasMenu, buildElementMenu]);

  // ============================================================
  // 删除选中项（B4.5：委托统一 handleDelete，消除重复）
  // ============================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
        return;
      }
      if (!selection) return;
      e.preventDefault();
      handleDelete(selection);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, handleDelete]);

  // ============================================================
  // 当前选中项的数据
  // ============================================================

  const selectedParticipant = useMemo(() => {
    if (!selection || selection.type !== 'participant') return null;
    const id = selection.id as string;
    return participants.find((p) => p.id === id) ?? null;
  }, [selection, participants]);

  const selectedMessage = useMemo(() => {
    if (!selection || selection.type !== 'message') return null;
    const id = selection.id as string;
    return messages.find((m) => m.id === id) ?? null;
  }, [selection, messages]);

  const selectedNote = useMemo(() => {
    if (!selection || selection.type !== 'note') return null;
    const idx = selection.id as number;
    return notes[idx] ?? null;
  }, [selection, notes]);

  const selectedBlock = useMemo(() => {
    if (!selection || selection.type !== 'block') return null;
    const idx = selection.id as number;
    return blocks[idx] ?? null;
  }, [selection, blocks]);

  const selectedBox = useMemo(() => {
    if (!selection || selection.type !== 'box') return null;
    const idx = selection.id as number;
    return boxes[idx] ?? null;
  }, [selection, boxes]);

  const editingParticipant = editingParticipantId
    ? participants.find((p) => p.id === editingParticipantId) ?? null
    : null;
  const editingMessage = editingMessageId
    ? messages.find((m) => m.id === editingMessageId) ?? null
    : null;

  // ============================================================
  // B4 编辑模式升级：拖拽连线 + 拖拽排序 + 画布平移缩放
  // ============================================================
  // 设计文档：docs/design/sequence-editing-mode-upgrade.md
  // 三个独立 hook 各管一种拖拽状态机，通过回调通知 Canvas 修改 state

  // SVG 元素 ref（viewport hook 用于 wheel 监听 + 坐标转换）
  const svgRef = useRef<SVGSVGElement | null>(null);
  // transform 容器 ref（用于空白区域判断）
  const transformGroupRef = useRef<SVGGElement | null>(null);

  // 画布平移缩放 hook
  const { viewport, isPanning, startPan, updatePan, endPan, fitView } = useSequenceViewport({
    svgRef,
    syncViewport,
    onViewportChange,
  });

  // 切换图表类型进入时序图时 fitView（对齐 GraphCanvas React Flow fitView prop 行为）
  // hasFitViewRef 保证只在首次有效 layout 后触发一次：
  //   - mount 时若 syncCanvas 已有内容 → 立即 fitView
  //   - mount 时若 syncCanvas 为空图 → 等首次有内容时 fitView
  //   - 后续编辑（添加/删除元素）不重置视图，避免干扰用户平移/缩放
  // 组件卸载（切到 flowchart）再挂载（切回 sequence）时 ref 重置，重新 fitView
  const hasFitViewRef = useRef(false);
  useEffect(() => {
    if (hasFitViewRef.current) return;
    const boundsW = (layout.bounds.stopx ?? 0) - (layout.bounds.startx ?? 0);
    const boundsH = (layout.bounds.stopy ?? 0) - (layout.bounds.starty ?? 0);
    if (boundsW <= 0 || boundsH <= 0) return; // 空图不 fitView，等首次有内容
    fitView(layout.bounds, { width: canvasWidth, height: canvasHeight });
    hasFitViewRef.current = true;
  }, [layout.bounds, canvasWidth, canvasHeight, fitView]);

  // 平移 window 监听器（isPanning 时注册，endPan 后自动移除）
  useEffect(() => {
    if (!isPanning) return;
    const handleMouseMove = (e: MouseEvent) => {
      updatePan(e.clientX, e.clientY);
    };
    const handleMouseUp = () => {
      endPan();
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, updatePan, endPan]);

  // 屏幕坐标 → SVG 坐标转换（供 connect/reorder hook 使用）
  const toSvgCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (svgRef.current === null) return { x: 0, y: 0 };
      return screenToSvg(clientX, clientY, svgRef.current, viewport);
    },
    [viewport],
  );

  // 命中检测：SVG 坐标 → 参与者 id（覆盖整个参与者列：顶部 actor 到底部 mirror）
  const hitTestParticipant = useCallback(
    (svgX: number, svgY: number): string | null => {
      for (const p of layout.participantLayouts) {
        const actorLayout = layout.actors.get(p.participantId);
        if (!actorLayout) continue;
        const xMin = actorLayout.x;
        const xMax = actorLayout.x + actorLayout.width;
        const yMin = actorLayout.y;
        const yMax = actorLayout.bottomY + actorLayout.height;
        if (svgX >= xMin && svgX <= xMax && svgY >= yMin && svgY <= yMax) {
          return p.participantId;
        }
      }
      return null;
    },
    [layout],
  );

  // 命中检测：SVG Y 坐标 → dropIndex（消息插入位置 0..N）
  // 基于 message bounds 顶点 Y（"插入到第 i 条消息之前"语义，用于 message-reorder 排序插入）
  // 注：layout.messageLayouts 已由 buildMessageLayouts 按 sequence 升序构建，无需重复 sort
  const hitTestDropIndex = useCallback(
    (svgY: number): number => {
      for (let i = 0; i < layout.messageLayouts.length; i++) {
        if (svgY < layout.messageLayouts[i].bounds.y) {
          return i;
        }
      }
      return layout.messageLayouts.length;
    },
    [layout.messageLayouts],
  );

  // B4.4 命中检测：SVG X 坐标 → 参与者 dropIndex（横向插入位置 0..N）
  // 基于参与者 bounds 中点 X（"插入到第 i 个参与者之前"语义，用于 participant-reorder）
  const hitTestParticipantDropIndex = useCallback(
    (svgX: number): number => {
      for (let i = 0; i < layout.participantLayouts.length; i++) {
        const bounds = layout.participantLayouts[i].bounds;
        if (svgX < bounds.x + bounds.width / 2) return i;
      }
      return layout.participantLayouts.length;
    },
    [layout.participantLayouts],
  );

  // B4.4 命中检测：SVG Y 坐标 → 消息索引（基于消息中点 Y）
  // 与 hitTestDropIndex（基于顶点 Y）的差异：
  //   - hitTestDropIndex: "插入到第 i 条消息之前"（适合排序插入位置）
  //   - hitTestMessageIndex: "属于第 i 条消息"（适合 note 附着 / block resize 到最近消息边界）
  // 用于 note-reorder（note 附着到第 N 条消息）和 block-resize（resize 到最近消息边界）
  const hitTestMessageIndex = useCallback(
    (svgY: number): number => {
      for (let i = 0; i < layout.messageLayouts.length; i++) {
        const bounds = layout.messageLayouts[i].bounds;
        if (svgY < bounds.y + bounds.height / 2) return i;
      }
      return layout.messageLayouts.length;
    },
    [layout.messageLayouts],
  );

  // B4.4 命中检测：SVG 坐标 → box.id（不在任何 box 内返回 null）
  // 用于 participant-to-box 拖拽命中检测（Alt+拖拽参与者进入/离开 Box）
  const hitTestBox = useCallback(
    (svgX: number, svgY: number): string | null => {
      // B4.4 修复：Box 命中检测只比较 x 坐标，忽略 y 坐标
      // 原因：Box 的 bounds（layout.boxLayouts）只覆盖顶部 actor 区域（约 50px 高），
      //   但用户拖拽时鼠标在画布的消息区域（y > actor.height），若比较 y 坐标则永远命中不了 Box。
      // Box 横向不重叠（单一数据源：box.actorKeys，一个参与者只属于一个 Box），
      //   所以只比较 x 坐标即可正确命中，且允许用户拖拽到任意高度都能命中 Box。
      void svgY; // 显式标注 svgY 不参与命中判定
      for (let i = 0; i < layout.boxLayouts.length; i++) {
        const boxLayout = layout.boxLayouts[i];
        const bounds = boxLayout.bounds;
        if (svgX >= bounds.x && svgX <= bounds.x + bounds.width) {
          const box = boxesRef.current[boxLayout.boxIndex];
          return box ? box.id : null;
        }
      }
      return null;
    },
    [layout.boxLayouts],
  );

  // 创建新消息（拖拽连线完成时调用）
  const handleCreateMessage = useCallback(
    (sourceId: string, targetId: string) => {
      const newMessage: SequenceMessage = {
        // ID 冲突 bug 修复：原 `seq-msg-${messagesRef.current.length}` 在删除消息后会与已存在 ID 冲突
        // 改用 idGenerator.generate('seq_msg') 保证全局唯一
        id: idGenerator.generate('seq_msg'),
        from: sourceId,
        to: targetId,
        label: '',
        messageType: 'solid-arrow',
        sequence: messagesRef.current.length,
      };
      const nextMessages = [...messagesRef.current, newMessage];
      // 自动选中新 message + 进入编辑状态
      setSelection({ type: 'message', id: newMessage.id });
      setEditingMessageId(newMessage.id);
      applySequenceCanvasChange({ messages: nextMessages });
    },
    [applySequenceCanvasChange],
  );

  // 重排消息（拖拽排序完成时调用）
  // B4.4 扩展：同步 notes.messageIndex + blocks.startMessage/endMessage/midBranches
  const handleReorderMessage = useCallback(
    (messageId: string, fromIndex: number, toIndex: number) => {
      // 不可变更新：sort by sequence → splice out → splice in → re-assign sequence 0..N
      const sorted = [...messagesRef.current].sort((a, b) => a.sequence - b.sequence);
      if (fromIndex < 0 || fromIndex >= sorted.length) return;
      // 拖拽至末尾时 toIndex === sorted.length（合法），splice 自动处理
      // 拖拽至中间时 toIndex < sorted.length，splice 插入到 toIndex 位置
      // dropIndex 范围 [0, sorted.length]，fromIndex 范围 [0, sorted.length-1]
      // 当 fromIndex === toIndex 或 fromIndex === toIndex - 1（向下拖一格）时无变化
      const clampedTo = Math.max(0, Math.min(toIndex, sorted.length));
      if (fromIndex === clampedTo || fromIndex === clampedTo - 1) return;
      const [moved] = sorted.splice(fromIndex, 1);
      // clampedTo > fromIndex 时插入位置需 -1（splice 已移除原元素）
      const insertAt = clampedTo > fromIndex ? clampedTo - 1 : clampedTo;
      sorted.splice(insertAt, 0, moved);
      // 重新分配 sequence = index（0..N 连续整数，保证 sortedMessages 索引一致）
      const newMessages = sorted.map((m, i) => ({ ...m, sequence: i }));
      // 源头拦截：重排后 `-` 可能出现在 `+` 之前，校验非法则不写入
      if (!validateAndToast(newMessages)) return;

      // B4.4 副作用：同步 notes.messageIndex 和 blocks.startMessage/endMessage/midBranches
      // 索引重映射规则：原索引根据拖拽方向调整
      // - 原索引 === fromIndex → 重映射为 insertAt（被拖动的消息）
      // - fromIndex < insertAt（向下拖）：(fromIndex, insertAt] 范围内的索引 -1
      // - fromIndex > insertAt（向上拖）：[insertAt, fromIndex) 范围内的索引 +1
      const remapIndex = (original: number): number => {
        if (original === fromIndex) return insertAt;
        if (fromIndex < insertAt) {
          if (original > fromIndex && original <= insertAt) return original - 1;
        } else {
          if (original >= insertAt && original < fromIndex) return original + 1;
        }
        return original;
      };
      const newNotes = notesRef.current.map((note) => ({
        ...note,
        messageIndex: remapIndex(note.messageIndex),
      }));
      const newBlocks = blocksRef.current.map((block) => {
        const newStart = remapIndex(block.startMessage);
        const newEnd = remapIndex(block.endMessage);
        const newMidBranches = block.midBranches.map((b) => ({
          ...b,
          startMessage: remapIndex(b.startMessage),
          endMessage: remapIndex(b.endMessage),
        }));
        // midBranches 范围一致性夹紧：跨块拖拽后 midBranches 可能超出父块范围
        // 夹紧到父块范围内（避免渲染异常）
        return {
          ...block,
          startMessage: newStart,
          endMessage: newEnd,
          midBranches: newMidBranches.map((mb) => ({
            ...mb,
            startMessage: Math.max(mb.startMessage, newStart),
            endMessage: Math.min(mb.endMessage, newEnd),
          })),
        };
      });
      applySequenceCanvasChange({ messages: newMessages, notes: newNotes, blocks: newBlocks });
    },
    [validateAndToast, applySequenceCanvasChange],
  );

  // B4.4：重排参与者（横向拖拽完成时调用，同步 box.actorKeys 顺序）
  const handleReorderParticipant = useCallback(
    (participantId: string, fromIndex: number, toIndex: number) => {
      const list = [...participantsRef.current];
      if (fromIndex < 0 || fromIndex >= list.length) return;
      const clampedTo = Math.max(0, Math.min(toIndex, list.length));
      if (fromIndex === clampedTo || fromIndex === clampedTo - 1) return;
      const [moved] = list.splice(fromIndex, 1);
      const insertAt = clampedTo > fromIndex ? clampedTo - 1 : clampedTo;
      list.splice(insertAt, 0, moved);
      // B4.4 副作用：box.actorKeys 顺序按新 participants 顺序重排
      // 单一数据源：box.actorKeys 中的顺序应与 participants 数组顺序一致
      const newOrder = list.map((p) => p.id);
      const newBoxes = boxesRef.current.map((box) => {
        // 仅保留 box.actorKeys 中存在的参与者，按新顺序排列
        const reorderedKeys = newOrder.filter((id) => box.actorKeys.includes(id));
        return { ...box, actorKeys: reorderedKeys };
      });
      applySequenceCanvasChange({ participants: list, boxes: newBoxes });
    },
    [applySequenceCanvasChange],
  );

  // B4.4：重排 Note（更新 note.messageIndex）
  const handleReorderNote = useCallback(
    (noteIndex: number, _fromMessageIndex: number, toMessageIndex: number) => {
      const list = [...notesRef.current];
      if (noteIndex < 0 || noteIndex >= list.length) return;
      // toMessageIndex 范围 [0, messageCount]：消息末尾追加合法
      const msgCount = messagesRef.current.length;
      const clampedTo = Math.max(0, Math.min(toMessageIndex, msgCount));
      list[noteIndex] = { ...list[noteIndex], messageIndex: clampedTo };
      applySequenceCanvasChange({ notes: list });
    },
    [applySequenceCanvasChange],
  );

  // B4.4：Resize Block（调整 startMessage 或 endMessage，含范围夹紧）
  const handleResizeBlock = useCallback(
    (
      blockIndex: number,
      edge: 'top' | 'bottom',
      originalStart: number,
      originalEnd: number,
      newIndex: number,
    ) => {
      const list = [...blocksRef.current];
      if (blockIndex < 0 || blockIndex >= list.length) return;
      const msgCount = messagesRef.current.length;
      // 夹紧到 [0, msgCount] 范围
      const clampedNew = Math.max(0, Math.min(newIndex, msgCount));
      const block = list[blockIndex];
      let newStart = originalStart;
      let newEnd = originalEnd;
      if (edge === 'top') {
        // 上边缘 resize：调整 startMessage，必须 < endMessage（至少留 1 条消息的块体）
        newStart = Math.min(clampedNew, originalEnd - 1);
        newStart = Math.max(0, newStart);
      } else {
        // 下边缘 resize：调整 endMessage，必须 > startMessage
        newEnd = Math.max(clampedNew, originalStart + 1);
        newEnd = Math.min(msgCount, newEnd);
      }
      // midBranches 范围夹紧到新 [newStart, newEnd]
      const newMidBranches = block.midBranches.map((mb) => ({
        ...mb,
        startMessage: Math.max(mb.startMessage, newStart),
        endMessage: Math.min(mb.endMessage, newEnd),
      }));
      list[blockIndex] = {
        ...block,
        startMessage: newStart,
        endMessage: newEnd,
        midBranches: newMidBranches,
      };
      applySequenceCanvasChange({ blocks: list });
    },
    [applySequenceCanvasChange],
  );

  // B4.4：拖拽参与者进入/离开 Box（拖拽入口）
  // 委托 reassignParticipantBox 纯函数（与 handleUpdateBoxAssignment 共用）
  // 一个参与者只能属于一个 box，新 box 会从旧 box 移除
  const handleAssignBox = useCallback(
    (participantId: string, targetBoxId: string | null) => {
      const newBoxes = reassignParticipantBox(boxesRef.current, participantId, targetBoxId);
      applySequenceCanvasChange({ boxes: newBoxes });
    },
    [applySequenceCanvasChange],
  );

  // ============================================================
  // B4.4：拖拽 hook 集成（6 个 hook，各管一种拖拽状态机）
  // ============================================================
  // 设计文档：docs/design/fractal-design-20260701-sequence重新设计/fractal-design-20260701-sequence重新设计-B4-L2-子功能细化.md
  // 6 个 hook 各自独立管理状态机，通过回调通知 Canvas 修改 state
  // - useSequenceConnect: 拖拽连线（创建新消息）
  // - useSequenceReorder: 消息纵向排序（B3.4 已实现，B4.4 扩展副作用同步）
  // - useSequenceParticipantReorder: 参与者横向排序（B4.4 新增）
  // - useSequenceNoteReorder: Note 纵向排序（B4.4 新增，同步 messageIndex）
  // - useSequenceBlockResize: Block 上下边缘 resize（B4.4 新增）
  // - useSequenceBoxAssign: 参与者拖入/拖出 Box（B4.4 新增，Alt+拖拽触发）

  const { dragState: connectDragState, startConnectionDrag } = useSequenceConnect({
    onCreateMessage: handleCreateMessage,
    hitTestParticipant,
    toSvgCoords,
  });

  const { dragState: reorderDragState, startReorderDrag } = useSequenceReorder({
    onReorderMessage: handleReorderMessage,
    hitTestDropIndex,
    toSvgCoords,
  });

  const { dragState: participantReorderDragState, startParticipantReorder } =
    useSequenceParticipantReorder({
      onReorderParticipant: handleReorderParticipant,
      hitTestParticipantDropIndex,
      toSvgCoords,
    });

  const { dragState: noteReorderDragState, startNoteReorder } = useSequenceNoteReorder({
    onReorderNote: handleReorderNote,
    // Note 落点 = messageIndex（基于消息中点 Y），与 block-resize 共用 hitTestMessageIndex
    hitTestNoteDropIndex: hitTestMessageIndex,
    toSvgCoords,
  });

  const { dragState: blockResizeDragState, startBlockResize } = useSequenceBlockResize({
    onResizeBlock: handleResizeBlock,
    hitTestMessageIndex,
    toSvgCoords,
  });

  const { dragState: boxAssignDragState, startBoxAssign } = useSequenceBoxAssign({
    onAssignBox: handleAssignBox,
    hitTestBox,
    toSvgCoords,
  });

  // 画布 mousedown：空白区域 + 中键触发平移
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // 中键（button === 1）：任意位置触发平移，preventDefault 阻止浏览器自动滚动
      if (e.button === 1) {
        e.preventDefault();
        startPan(e.clientX, e.clientY);
        return;
      }
      // 左键（button === 0）：仅空白区域触发平移
      if (e.button === 0) {
        const isEmptyArea =
          e.target === svgRef.current || e.target === transformGroupRef.current;
        if (isEmptyArea) {
          startPan(e.clientX, e.clientY);
        }
        // 非空白区域不处理，让子元素自己的 onClick/onMouseDown 处理
      }
    },
    [startPan],
  );

  // ============================================================
  // B4.4：拖拽指示器计算（5 种拖拽类型，各自渲染不同几何形状）
  // ============================================================
  // - message-reorder: 水平蓝色虚线（dropIndex 插入位置 Y）
  // - participant-reorder: 垂直蓝色虚线（dropIndex 插入位置 X）
  // - note-reorder: 水平橙色虚线（dropMessageIndex 对应消息 Y）
  // - block-resize: 水平绿色虚线（newIndex 对应消息 Y）
  // - box-assign: 高亮悬停 box（hoverBoxId 对应 box 的 bounds 描边）
  //
  // 设计原则：每种拖拽类型的指示器几何形状不同，便于用户区分当前拖拽模式

  /** message-reorder 指示线 Y 坐标（基于 dropIndex 在 messageLayouts 中的插入位置）
   *  注：layout.messageLayouts 已由 buildMessageLayouts 按 sequence 升序构建，无需重复 sort */
  const messageReorderIndicatorY = useMemo(() => {
    if (reorderDragState.type !== 'reordering') return null;
    const layouts = layout.messageLayouts;
    if (layouts.length === 0) return 0;
    if (reorderDragState.dropIndex <= 0) {
      return layouts[0].bounds.y - SEQUENCE_LAYOUT_CONFIG.messageMargin / 2;
    }
    if (reorderDragState.dropIndex >= layouts.length) {
      return layouts[layouts.length - 1].bounds.y + SEQUENCE_LAYOUT_CONFIG.messageMargin / 2;
    }
    return (
      (layouts[reorderDragState.dropIndex - 1].bounds.y +
        layouts[reorderDragState.dropIndex].bounds.y) /
      2
    );
  }, [reorderDragState, layout.messageLayouts]);

  /** participant-reorder 指示线 X 坐标（基于 dropIndex 在 participantLayouts 中的插入位置） */
  const participantReorderIndicatorX = useMemo(() => {
    if (participantReorderDragState.type !== 'reordering') return null;
    const layouts = layout.participantLayouts;
    if (layouts.length === 0) return 0;
    // actorMargin 是参与者间距（SEQUENCE_LAYOUT_CONFIG.actorMargin = 50）
    const margin = SEQUENCE_LAYOUT_CONFIG.actorMargin / 2;
    if (participantReorderDragState.dropIndex <= 0) {
      return layouts[0].bounds.x - margin;
    }
    if (participantReorderDragState.dropIndex >= layouts.length) {
      return layouts[layouts.length - 1].bounds.x + layouts[layouts.length - 1].bounds.width + margin;
    }
    return (
      layouts[participantReorderDragState.dropIndex - 1].bounds.x +
      layouts[participantReorderDragState.dropIndex - 1].bounds.width +
      margin
    );
  }, [participantReorderDragState, layout.participantLayouts]);

  /** note-reorder 指示线 Y 坐标（基于 dropMessageIndex 对应消息的 Y） */
  const noteReorderIndicatorY = useMemo(() => {
    if (noteReorderDragState.type !== 'reordering') return null;
    const layouts = layout.messageLayouts;
    if (layouts.length === 0) return 0;
    const idx = Math.min(noteReorderDragState.dropMessageIndex, layouts.length - 1);
    return layouts[idx].bounds.y;
  }, [noteReorderDragState, layout.messageLayouts]);

  /** block-resize 指示线 Y 坐标（基于 newIndex 对应消息的 Y） */
  const blockResizeIndicatorY = useMemo(() => {
    if (blockResizeDragState.type !== 'resizing') return null;
    const layouts = layout.messageLayouts;
    if (layouts.length === 0) return 0;
    const idx = Math.min(blockResizeDragState.newIndex, layouts.length - 1);
    return layouts[idx].bounds.y;
  }, [blockResizeDragState, layout.messageLayouts]);

  /** box-assign 高亮 box 的 bounds（基于 hoverBoxId 查找 layout.boxLayouts） */
  const boxAssignHighlightBounds = useMemo(() => {
    if (boxAssignDragState.type !== 'assigning') return null;
    if (boxAssignDragState.hoverBoxId === null) return null;
    for (const boxLayout of layout.boxLayouts) {
      const box = boxesRef.current[boxLayout.boxIndex];
      if (box && box.id === boxAssignDragState.hoverBoxId) {
        return boxLayout.bounds;
      }
    }
    return null;
  }, [boxAssignDragState, layout.boxLayouts]);

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="app-container">
      <Toolbar
        diagramType="sequenceDiagram"
        direction={localDirection}
        mermaidCode={mermaidCode}
        connectionMode={connectionMode}
        onConnectionModeChange={() => {
          // 时序图不支持连线模式切换
        }}
        onDiagramTypeChange={onDiagramTypeChange as (newType: DiagramType) => void}
        onDirectionChange={() => {
          // 时序图不支持方向切换
        }}
        darkMode={props.darkMode}
        onDarkModeToggle={props.onDarkModeToggle}
      />

      <div className="main-content">
        <div className="left-panel">
          <NodeLibrary diagramType="sequenceDiagram" onAddNode={handleAddParticipant} />
        </div>

        <div
          className="canvas-container"
          onClick={handleClearSelection}
          style={{
            overflow: 'hidden',
            cursor: isPanning ? 'grabbing' : 'default',
            // 拖拽时屏蔽文本选中（连线/排序/平移操作触发）
            userSelect: 'none',
          }}
        >
          <svg
            ref={svgRef}
            onMouseDown={handleCanvasMouseDown}
            onContextMenu={(e) => {
              // 命中元素时由元素 onContextMenu 冒泡截断（stopPropagation）
              // 此处仅在空白处（svg 自身或 transform 容器）触发画布菜单
              // 非空白非元素区域（Lifeline/ActivationBar）也 preventDefault 避免浏览器默认菜单
              const isEmptyArea =
                e.target === svgRef.current || e.target === transformGroupRef.current;
              if (isEmptyArea) {
                handleContextMenu(e, undefined);
              } else {
                e.preventDefault();
              }
            }}
            width="100%"
            height="100%"
            viewBox={viewBox}
            // xMinYMin meet：左上对齐 + 保持宽高比 + 整体可见
            // 使 SVG 铺满 canvas-container 容器，viewBox 自动缩放
            preserveAspectRatio="xMinYMin meet"
            // 底色由 CSS 变量提供（亮色 #fafafa / 暗色由 .dark 覆盖）
            // SequenceBackground 仅负责斑点 pattern，底色在 SVG 元素层
            style={{ display: 'block', background: 'var(--seq-canvas-bg)' }}
          >
            <defs>
              {/* B3.4：箭头 marker 定义集中管理（9 个 marker，策略B 多类型共用）
                  - 5 个现有 marker（filled/open/cross/point/bidirectional）
                  - 4 个新增 marker（solid-top/solid-bottom/stick-top/stick-bottom)
                  - 详见 arrow-markers.tsx */}
              <SequenceArrowMarkers />
            </defs>

            {/* viewport transform 容器：所有画布内容 + 拖拽临时元素受 transform 影响 */}
            <g
              ref={transformGroupRef}
              transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}
            >

            {/* 画布斑点背景（transform group 内部第一个子元素，跟随 viewport 平移缩放）
                对齐 React Flow <Background/> Dots variant：pan 时 dots 跟随移动，zoom 时 dots 间距和大小跟随变化
                底色由 SVG 元素 style.background 提供（固定不跟随缩放），此处仅斑点 pattern 跟随 */}
            <SequenceBackground />

            {/* 1. Box 分组框（背景层） */}
            {boxes.map((box, idx) => {
              const layoutItem = layout.boxLayouts[idx];
              if (!layoutItem) return null;
              return (
                <BoxFrame
                  key={`box-${idx}`}
                  box={box}
                  boxIndex={idx}
                  layout={layoutItem}
                  bottomY={bottomY}
                  selected={selection?.type === 'box' && selection.id === idx}
                  onSelect={handleSelectBox}
                  onContextMenu={(e) => handleContextMenu(e, { type: 'box', id: idx })}
                />
              );
            })}

            {/* 2. Block 块结构框（背景层） */}
            {blocks.map((block, idx) => {
              const loopModel = layout.models.loops[idx];
              if (!loopModel) return null;
              const depth = computeBlockDepth(block, blocks);
              return (
                <BlockFrame
                  key={`block-${idx}`}
                  block={block}
                  blockIndex={idx}
                  loopModel={loopModel}
                  depth={depth}
                  selected={selection?.type === 'block' && selection.id === idx}
                  onSelect={handleSelectBlock}
                  onContextMenu={(e) => handleContextMenu(e, { type: 'block', id: idx })}
                  onResizeStart={startBlockResize}
                />
              );
            })}

            {/* 3. 生命线 */}
            {layout.participantLayouts.map((p) => {
              const actorLayout = layout.actors.get(p.participantId);
              if (!actorLayout) return null;
              return (
                <Lifeline
                  key={`lifeline-${p.participantId}`}
                  layout={actorLayout}
                  bottomY={bottomY}
                  selected={selection?.type === 'participant' && selection.id === p.participantId}
                />
              );
            })}

            {/* 4. 激活条（P1-2 修复：删除冗余 actorLayout prop，全部从 activation 派生） */}
            {layout.models.activations.map((activation, idx) => (
              <ActivationBar
                key={`activation-${idx}`}
                activation={activation}
                selected={false}
              />
            ))}

            {/* 5. 消息箭头 */}
            {sortedMessages.map((message) => {
              const layoutItem = messageLayoutMap.get(message.sequence);
              if (!layoutItem) return null;
              const fromActorLayout = layout.actors.get(message.from);
              const toActorLayout = layout.actors.get(message.to);
              if (!fromActorLayout || !toActorLayout) return null;
              return (
                <MessageRow
                  key={message.id}
                  message={message}
                  layout={layoutItem}
                  fromActorLayout={fromActorLayout}
                  toActorLayout={toActorLayout}
                  selected={selection?.type === 'message' && selection.id === message.id}
                  showSequenceNumber={autonumber}
                  onSelect={handleSelectMessage}
                  onEdit={handleEditMessage}
                  onReorderStart={startReorderDrag}
                  onContextMenu={(e) => handleContextMenu(e, { type: 'message', id: message.id })}
                />
              );
            })}

            {/* 6. 注释框（P3-3 修复：删除 overParticipantLayout 冗余 prop） */}
            {notes.map((note, idx) => {
              const layoutItem = layout.noteLayouts[idx];
              if (!layoutItem) return null;
              const participantLayout = layout.actors.get(note.participantIds[0]);
              if (!participantLayout) return null;
              return (
                <NoteRow
                  key={`note-${idx}`}
                  note={note}
                  noteIndex={idx}
                  layout={layoutItem}
                  participantLayout={participantLayout}
                  selected={selection?.type === 'note' && selection.id === idx}
                  onSelect={handleSelectNote}
                  onContextMenu={(e) => handleContextMenu(e, { type: 'note', id: idx })}
                  onReorderStart={startNoteReorder}
                />
              );
            })}

            {/* 7. 参与者框（顶层 + 底部镜像，P1-4 + P1-1 修复） */}
            {layout.participantLayouts.map((p, participantIndex) => {
              const actorLayout = layout.actors.get(p.participantId);
              if (!actorLayout) return null;
              const participant = participants.find((pa) => pa.id === p.participantId);
              if (!participant) return null;
              return (
                <ParticipantRow
                  key={p.participantId}
                  participant={participant}
                  layout={actorLayout}
                  mirrorActors={SEQUENCE_LAYOUT_CONFIG.mirrorActors}
                  selected={selection?.type === 'participant' && selection.id === p.participantId}
                  onSelect={handleSelectParticipant}
                  onEdit={handleEditParticipant}
                  onConnectionStart={startConnectionDrag}
                  onContextMenu={(e) => handleContextMenu(e, { type: 'participant', id: p.participantId })}
                  onReorderStart={startParticipantReorder}
                  participantIndex={participantIndex}
                  onBoxAssignStart={startBoxAssign}
                />
              );
            })}

            {/* 拖拽临时连线（位于 <g transform> 内部，使用 SVG 坐标，受 viewport transform 影响） */}
            {connectDragState.type === 'connecting' && (
              <line
                x1={connectDragState.sourceX}
                y1={connectDragState.sourceY}
                x2={connectDragState.currentX}
                y2={connectDragState.currentY}
                // SVG stroke 属性形式不支持 var()，用 inline style
                style={{ stroke: 'var(--seq-drag-indicator-stroke)' }}
                strokeWidth={2}
                strokeDasharray="4,4"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}

            {/* B4.4：5 种拖拽类型的 drop indicator（位于 <g transform> 内部，使用 SVG 坐标）
                - message-reorder: 水平蓝色虚线（插入位置 Y）
                - participant-reorder: 垂直蓝色虚线（插入位置 X）
                - note-reorder: 水平橙色虚线（附着消息 Y）
                - block-resize: 水平绿色虚线（resize 目标消息 Y）
                - box-assign: 高亮悬停 box 描边（hoverBoxId 对应 bounds）
                每种类型几何形状不同，便于用户区分当前拖拽模式 */}

            {/* message-reorder 指示线（水平蓝色虚线，跨整个画布宽度） */}
            {messageReorderIndicatorY !== null && (
              <line
                x1={0}
                y1={messageReorderIndicatorY}
                x2={canvasWidth}
                y2={messageReorderIndicatorY}
                style={{ stroke: 'var(--seq-drag-indicator-stroke)' }}
                strokeWidth={2}
                strokeDasharray="4,4"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}

            {/* participant-reorder 指示线（垂直蓝色虚线，跨整个画布高度） */}
            {participantReorderIndicatorX !== null && (
              <line
                x1={participantReorderIndicatorX}
                y1={0}
                x2={participantReorderIndicatorX}
                y2={canvasHeight}
                style={{ stroke: 'var(--seq-drag-indicator-stroke)' }}
                strokeWidth={2}
                strokeDasharray="4,4"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}

            {/* note-reorder 指示线（水平，橙色，附着消息 Y） */}
            {noteReorderIndicatorY !== null && (
              <line
                x1={0}
                y1={noteReorderIndicatorY}
                x2={canvasWidth}
                y2={noteReorderIndicatorY}
                style={{ stroke: 'var(--seq-note-stroke)' }}
                strokeWidth={2}
                strokeDasharray="6,3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}

            {/* block-resize 指示线（水平，绿色，resize 目标消息 Y） */}
            {blockResizeIndicatorY !== null && (
              <line
                x1={0}
                y1={blockResizeIndicatorY}
                x2={canvasWidth}
                y2={blockResizeIndicatorY}
                style={{ stroke: 'var(--seq-block-loop-stroke)' }}
                strokeWidth={2}
                strokeDasharray="2,4"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}

            {/* box-assign 高亮描边（悬停 box 的 bounds） */}
            {boxAssignHighlightBounds !== null && (
              <rect
                x={boxAssignHighlightBounds.x}
                y={boxAssignHighlightBounds.y}
                width={boxAssignHighlightBounds.width}
                height={boxAssignHighlightBounds.height}
                style={{
                  fill: 'none',
                  stroke: 'var(--seq-block-selected-stroke)',
                }}
                strokeWidth={3}
                strokeDasharray="6,3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            </g>
          </svg>

          {/* MiniMap（仅展示，对齐 GraphCanvas React Flow <MiniMap/> 视觉）
              - 绝对定位浮层（.seq-minimap-container: right/bottom 10px, 150x100）
              - 不响应交互（pointer-events: none），渲染节点 rect + viewport mask（evenodd 挖空 viewport） */}
          <SequenceMiniMap
            bounds={layout.bounds}
            viewport={viewport}
            viewBoxSize={{ width: canvasWidth, height: canvasHeight }}
            rects={minimapRects}
          />

          {/* 画布左下角帮助面板（B4.4 UI 帮助说明扩展）
              - 折叠态：36x36 圆形「?」按钮
              - 展开态：300px 宽帮助面板，含 B4 全部操作 + 快捷键
              - 位置：absolute, left/bottom var(--space-3)（与右下角 minimap 对称） */}
          <CanvasHelpPanel />

          {/* 内联编辑器：参与者 */}
          {editingParticipant && (
            <div
              className="inline-editor-overlay"
              style={{
                position: 'absolute',
                top: (() => {
                  // B3.3 改造：从 layout 派生位置（原 PARTICIPANT_TOP_Y + PARTICIPANT_HEIGHT + 8）
                  const actorLayout = layout.actors.get(editingParticipant.id);
                  return actorLayout ? actorLayout.y + actorLayout.height + 8 : 80;
                })(),
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                background: 'var(--seq-inline-editor-bg)',
                padding: '8px',
                borderRadius: '4px',
                boxShadow: '0 2px 8px var(--seq-inline-editor-shadow)',
                width: 240,
              }}
            >
              <InlineEditor
                value={editingParticipant.label ?? editingParticipant.id}
                onConfirm={(value) => confirmParticipantEdit(editingParticipant.id, value)}
                onCancel={() => setEditingParticipantId(null)}
              />
            </div>
          )}

          {/* 内联编辑器：消息 */}
          {editingMessage && (
            <div
              className="inline-editor-overlay"
              style={{
                position: 'absolute',
                top: 80,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                background: 'var(--seq-inline-editor-bg)',
                padding: '8px',
                borderRadius: '4px',
                boxShadow: '0 2px 8px var(--seq-inline-editor-shadow)',
                width: 320,
              }}
            >
              <InlineEditor
                value={editingMessage.label ?? ''}
                onConfirm={(value) => confirmMessageEdit(editingMessage.id, value)}
                onCancel={() => setEditingMessageId(null)}
              />
            </div>
          )}

          {/* B4.3：右键菜单浮层（contextMenu !== null 时渲染，position 为屏幕坐标） */}
          {contextMenu !== null && (
            <ContextMenu
              items={contextMenuItems}
              position={contextMenu.position}
              onClose={() => setContextMenu(null)}
            />
          )}

          {/* B4.3：图表设置面板（autonumber / accTitle / accDescription） */}
          {chartSettings.open && (
            <div
              className="inline-editor-overlay"
              style={{
                position: 'absolute',
                top: 80,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                background: 'var(--seq-inline-editor-bg)',
                padding: '12px',
                borderRadius: '4px',
                boxShadow: '0 2px 8px var(--seq-inline-editor-shadow)',
                width: 320,
              }}
            >
              <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>图表设置</h4>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={chartSettings.autonumber}
                  onChange={(e) => handleChartSettingsChange({ autonumber: e.target.checked })}
                />
                <span>显示消息序号 (autonumber)</span>
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <span style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>标题 (accTitle)</span>
                <input
                  type="text"
                  value={chartSettings.accTitle}
                  onChange={(e) => handleChartSettingsChange({ accTitle: e.target.value })}
                  style={{ width: '100%', padding: '4px', boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>描述 (accDescription)</span>
                <textarea
                  value={chartSettings.accDescription}
                  onChange={(e) => handleChartSettingsChange({ accDescription: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '4px', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleChartSettingsCancel}
                  style={{ padding: '4px 12px' }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleChartSettingsConfirm}
                  style={{ padding: '4px 12px' }}
                >
                  确定
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="right-panel">
          <CodeEditor
            code={mermaidCode}
            onCodeChange={handleCodeChange}
            error={codeError}
            diagramType="sequenceDiagram"
          />
          {/* 属性面板：根据选中类型显示不同编辑器 */}
          <div className="property-panel">
            <h3 className="panel-title">属性面板</h3>
            {!selection && (
              <p className="panel-hint">选中参与者/消息/注释/块/Box 以编辑属性</p>
            )}
            {selectedParticipant && (
              <ParticipantEditor
                participant={selectedParticipant}
                boxes={boxes}
                onUpdate={(data) => handleUpdateParticipant(selectedParticipant.id, data)}
                onUpdateBoxAssignment={(boxId) =>
                  handleUpdateBoxAssignment(selectedParticipant.id, boxId)
                }
              />
            )}
            {selectedMessage && (
              <MessageEditor
                message={selectedMessage}
                participants={participants}
                onUpdate={(data) => handleUpdateMessage(selectedMessage.id, data)}
                onUpdateSource={(source) => handleUpdateMessageSource(selectedMessage.id, source)}
                onUpdateTarget={(target) => handleUpdateMessageTarget(selectedMessage.id, target)}
              />
            )}
          {selectedNote && (
            <NoteEditor
              note={selectedNote}
              participants={participants}
              messages={messages}
              onUpdate={(data) => {
                const idx = selection?.type === 'note' ? selection.id as number : 0;
                handleUpdateNote(idx, data);
              }}
            />
          )}
          {selectedBlock && (
            <BlockEditor
              block={selectedBlock}
              messages={messages}
              onUpdate={(data) => {
                const idx = selection?.type === 'block' ? selection.id as number : 0;
                handleUpdateBlock(idx, data);
              }}
            />
          )}
          {selectedBox && (
            <BoxEditor
              box={selectedBox}
              participants={participants}
              onUpdate={(data) => {
                const idx = selection?.type === 'box' ? selection.id as number : 0;
                handleUpdateBox(idx, data);
              }}
            />
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
