/**
 * classDiagram 识别器 — 将 Mermaid classDiagram 代码识别为 ClassRecognizedBlock[] 流
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块1-识别器.md
 *
 * 数据流：
 *   code → preprocessCode → classJisonParser.parse(code) [yy=ClassRecognizerCollector]
 *        → ClassRecognizerCollector 收集 block → getBlocks() → ClassRecognizedBlock[]
 *
 * 关键决策（模块1 方案B）：
 *   - 复用 flowchart-recognizer 的 pendingStack 栈结构管理 namespace 嵌套
 *   - class Block 携带 members[] 子数组保留 class 体语义
 *   - LOLLIPOP 关系保留原始 id1/id2（不替换为 interface${N}），由 Converter 决定
 *   - relation 类型保留原始 type1/type2/lineType 三元组（双向对称）
 *
 * pendingStack 机制（复用 flowchart 模式）：
 *   - pendingStack[0] 是顶层 scope
 *   - addNamespace 调用时 enterScope push 新空 scope
 *   - addClass/addRelation/addNote 等 push block 到栈顶 scope
 *   - popNamespace 调用时 pop 栈顶 scope 作为 childBlocks，递增 indent（+2），
 *     打包 [openBlock, ...childBlocks, closeBlock] push 到外层 scope
 *
 * currentClass 累积器（class 体语义）：
 *   jison 在单个 class 语句内调用 addClass → addMembers/addAnnotation/setClassLabel，
 *   但分散在不同 yy 方法中。RecognizerCollector 维护 currentClass 累积器：
 *     - addClass(id) 初始化 currentClass（若已有则先 flush 产出 ClassBlock）
 *     - addMembers/addAnnotation/setClassLabel 累积到 currentClass
 *     - 任何非 class 累积操作（addRelation/addNote/addNamespace/popNamespace/...）前先 flush
 *     - getBlocks() 前最后 flush
 *
 * 模块边界：仅依赖 ./types.js、./index.js、../parser/jison/class-parser.js、
 * ../detector/preprocessor.js、../parser/direction-utils.js、
 * ../parser/class/types.js（ClassDBYY 类型）、../parser/class/constants.js（RELATION_TYPE/LINE_TYPE）。
 * 不引用 React/DOM。
 */

import { parser as classParser } from '../parser/jison/class-parser.js';
import { preprocessCode } from '../detector/preprocessor.js';
import { normalizeDirection } from '../parser/direction-utils.js';
import type { ClassDBYY } from '../parser/class/types.js';
import type { ClassRelation } from '../parser/class/types.js';
import { RELATION_TYPE, LINE_TYPE } from '../parser/class/constants.js';
import type { FlowchartDirection } from '../types.js';
import type {
  ClassRecognizedBlock,
  ClassBlock,
  ClassMemberBlock,
  RelationBlock,
  NoteBlock,
  NamespaceOpenBlock,
  NamespaceCloseBlock,
  ClassCssApplyBlock,
  ClassStyleBlock,
  ClassCssDefBlock,
  ClassClickBlock,
  ClassDirectionBlock,
  ClassAccTitleBlock,
  ClassAccDescriptionBlock,
} from './types.js';
import type { IBlockRecognizer } from './index.js';

// ============================================================
// jison parser 实例
// ============================================================

interface JisonParserInstance {
  parse(input: string): unknown;
  yy: unknown;
}

const classJisonParser: JisonParserInstance = classParser as unknown as JisonParserInstance;

// ============================================================
// 内部类型
// ============================================================

/**
 * currentClass 累积器（mutable，用于在 addClass → addMembers/addAnnotation/setClassLabel 之间累积数据）
 *
 * jison 在单个 class 语句内分多次 yy 方法调用，RecognizerCollector 需要累积这些调用
 * 的数据，在 class 语句结束时（即下一个非 class 累积操作前）一次性产出 ClassBlock。
 */
interface CurrentClassAccumulator {
  /** 类名（含泛型 ~T~，由 Converter 拆分） */
  readonly classId: string;
  /** class Name [Label] 的 Label（显式标签） */
  label: string | undefined;
  /** 行内注解 <<interface>> 等（jison 不区分 stereotype/annotations，统一存 annotations） */
  stereotype: string | undefined;
  /** 行外注解 <<annotation>> 列表（由 addAnnotation 产出） */
  annotations: string[];
  /** 类体成员（属性/方法/注解） */
  members: ClassMemberBlock[];
  /** :::cssClass 简写应用的 CSS 类（暂不承载，由 setCssClass 单独产出 ClassCssApplyBlock） */
  cssClasses: string[];
}

/** namespace 信息（addNamespace 时存储，popNamespace 时取出创建 openBlock） */
interface NamespaceInfo {
  readonly namespaceId: string;
  readonly label: string | undefined;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 判定成员类型（对齐 ClassDB.addMember 逻辑）
 *
 * @param memberText - 成员原始文本
 * @returns 'annotation' | 'method' | 'attribute'
 */
function classifyMember(memberText: string): ClassMemberBlock['memberKind'] {
  const trimmed = memberText.trim();
  if (trimmed.startsWith('<<') && trimmed.endsWith('>>')) {
    return 'annotation';
  }
  if (trimmed.indexOf(')') > 0) {
    return 'method';
  }
  return 'attribute';
}

/**
 * 提取注解文本（去除 <<>> 包裹）
 * 对齐 ClassDB.addMember 的 annotation 处理：`<<interface>>` → `interface`
 */
function extractAnnotationText(memberText: string): string {
  const trimmed = memberText.trim();
  return trimmed.substring(2, trimmed.length - 2);
}

// ============================================================
// ClassRecognizerCollector — 适配器，实现 ClassDBYY 接口
// ============================================================

/**
 * ClassRecognizerCollector — classDiagram 识别数据收集器
 *
 * 实现 ClassDBYY 接口（与 ClassDB 相同的方法签名），但内部产出 ClassRecognizedBlock
 * 而非 mutate 状态（对齐 flowchart-recognizer 的适配器模式）。
 *
 * 与 ClassDB 的差异：
 *   - 不维护 classes/relations/notes/namespaces 等状态，只维护 pendingStack + currentClass
 *   - addClass/addMembers/addAnnotation 累积到 currentClass，flush 时产出 ClassBlock
 *   - addRelation 产出 RelationBlock（保留原始 id1/id2，不替换 LOLLIPOP）
 *   - addNamespace/popNamespace 通过 pendingStack 管理 namespace 嵌套
 *   - addClassesToNamespace 为 no-op（pendingStack 已处理嵌套）
 *
 * jison 只支持直接属性，因此所有 jison 调用的方法都在构造函数中 bind。
 */
class ClassRecognizerCollector implements ClassDBYY {
  /**
   * block 栈（复用 flowchart pendingStack 模式）
   *
   * - pendingStack[0] 是顶层 scope
   * - addNamespace 调用时 enterScope push 新 scope（namespace 子内容进入新 scope）
   * - popNamespace 调用时 pop 当前 scope 作为 childBlocks，打包后 push 到外层 scope
   */
  private pendingStack: ClassRecognizedBlock[][] = [[]];

  /**
   * namespace 信息栈（addNamespace 时 push，popNamespace 时 pop）
   *
   * 存储命名空间的 namespaceId/label，供 popNamespace 创建 NamespaceOpenBlock。
   * 与 pendingStack 配对：addNamespace 时 enterScope + push info，popNamespace 时 pop info + leaveScope。
   */
  private namespaceInfoStack: NamespaceInfo[] = [];

  /**
   * namespace 限定 ID 栈（对齐 ClassDB.namespaceStack）
   *
   * 用于 resolveQualifiedId：addNamespace 时拼接父前缀，popNamespace 时 pop。
   * 例如：栈顶 "A" + addNamespace("B") → qualifiedId = "A.B"
   */
  private namespaceStack: string[] = [];

  /**
   * currentClass 累积器（class 体语义）
   *
   * jison 在单个 class 语句内分多次 yy 方法调用（addClass → addMembers/addAnnotation），
   * currentClass 累积这些调用的数据，在下一个非 class 累积操作前 flush 产出 ClassBlock。
   */
  private currentClass: CurrentClassAccumulator | null = null;

  /** note 计数器（对齐 ClassDB.addNote 的 noteId 生成） */
  private noteCount = 0;

  public readonly relationType = RELATION_TYPE;
  public readonly lineType = LINE_TYPE;

  constructor() {
    // jison 只支持直接属性，所有 jison 调用的方法都在构造函数中 bind
    this.addRelation = this.addRelation.bind(this);
    this.addClassesToNamespace = this.addClassesToNamespace.bind(this);
    this.addNamespace = this.addNamespace.bind(this);
    this.popNamespace = this.popNamespace.bind(this);
    this.setCssClass = this.setCssClass.bind(this);
    this.addMembers = this.addMembers.bind(this);
    this.addClass = this.addClass.bind(this);
    this.setClassLabel = this.setClassLabel.bind(this);
    this.addAnnotation = this.addAnnotation.bind(this);
    this.addMember = this.addMember.bind(this);
    this.cleanupLabel = this.cleanupLabel.bind(this);
    this.addNote = this.addNote.bind(this);
    this.defineClass = this.defineClass.bind(this);
    this.setDirection = this.setDirection.bind(this);
    this.setLink = this.setLink.bind(this);
    this.setTooltip = this.setTooltip.bind(this);
    this.setClickEvent = this.setClickEvent.bind(this);
    this.setCssStyle = this.setCssStyle.bind(this);
    this.setAccTitle = this.setAccTitle.bind(this);
    this.setAccDescription = this.setAccDescription.bind(this);
  }

  // ============================================================
  // scope 栈管理（pendingStack）
  // ============================================================

  /**
   * 进入 namespace 作用域（addNamespace 调用时）
   *
   * push 新的空 scope 到 pendingStack。
   * 后续 addClass/addRelation 等 push 的 block 进入此 scope。
   * popNamespace 调用时 pop 此 scope 作为 childBlocks。
   */
  private enterScope(): void {
    this.pendingStack.push([]);
  }

  /**
   * 离开 namespace 作用域（popNamespace 调用时）
   *
   * pop 当前 scope 作为 childBlocks，递增 indent（+2），
   * 创建 NamespaceOpenBlock + NamespaceCloseBlock（indent=0），
   * 打包 [openBlock, ...childBlocks, closeBlock] push 到外层 scope。
   *
   * 前置不变量校验：pendingStack.length >= 2（至少有外层 scope + 当前 scope）
   */
  private leaveScope(namespaceInfo: NamespaceInfo): void {
    if (this.pendingStack.length < 2) {
      throw new Error(
        'pendingStack underflow: popNamespace called without matching addNamespace ' +
          `(stack depth=${this.pendingStack.length}, expected >=2)`,
      );
    }

    const rawChildBlocks = this.pendingStack.pop();
    if (rawChildBlocks === undefined) {
      throw new Error(
        'pendingStack pop returned undefined (invariant violated: stack should have at least 2 scopes)',
      );
    }

    // 为 childBlocks 递增 indent（+2）
    const childBlocks = rawChildBlocks.map((b) => ({
      ...b,
      indent: b.indent + 2,
    }));

    // 创建 NamespaceOpenBlock（indent=0，由外层嵌套累加）
    const openBlock: NamespaceOpenBlock = {
      type: 'namespace-open',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      namespaceId: namespaceInfo.namespaceId,
      label: namespaceInfo.label,
    };

    // 创建 NamespaceCloseBlock（indent=0）
    const closeBlock: NamespaceCloseBlock = {
      type: 'namespace-close',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      namespaceId: namespaceInfo.namespaceId,
    };

    // 打包 [openBlock, ...childBlocks, closeBlock] push 到外层 scope
    const packagedBlocks: ClassRecognizedBlock[] = [
      openBlock,
      ...childBlocks,
      closeBlock,
    ];
    this.pendingStack[this.pendingStack.length - 1].push(...packagedBlocks);
  }

  /**
   * push block 到当前 scope（pendingStack 栈顶）
   */
  private pushBlock(block: ClassRecognizedBlock): void {
    this.pendingStack[this.pendingStack.length - 1].push(block);
  }

  // ============================================================
  // currentClass 累积器管理
  // ============================================================

  /**
   * flush currentClass（产出 ClassBlock 并 pushBlock）
   *
   * 在任何非 class 累积操作前调用，确保 currentClass 中的累积数据被产出为 ClassBlock。
   * 若 currentClass 为 null 则 no-op。
   */
  private flushCurrentClass(): void {
    if (this.currentClass === null) {
      return;
    }
    const acc = this.currentClass;
    const block: ClassBlock = {
      type: 'class',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      classId: acc.classId,
      label: acc.label,
      stereotype: acc.stereotype,
      annotations: acc.annotations,
      members: acc.members,
      cssClasses: acc.cssClasses,
    };
    this.pushBlock(block);
    this.currentClass = null;
  }

  // ============================================================
  // 类管理（addClass/setClassLabel/addAnnotation/addMember/addMembers）
  // ============================================================

  /**
   * 添加类（jison 调用）
   *
   * 初始化 currentClass 累积器。若已有 currentClass 则先 flush 产出 ClassBlock。
   *
   * 注意：与 ClassDB.addClass 的差异 — 不检查 class 是否已存在（Recognizer 忠实产出
   * 每次 addClass 调用，由 Converter 处理重复 addClass 的情况）。
   *
   * @param id - 类 ID（可能含泛型，如 `List~Item~`）
   */
  public addClass(id: string): void {
    if (!id || id.trim().length === 0) {
      return;
    }
    // 若已有 currentClass，先 flush（不同 class 的 addClass 调用）
    if (this.currentClass !== null && this.currentClass.classId !== id) {
      this.flushCurrentClass();
    }
    // 同一 class 的重复 addClass 调用（如 addMember 内部先调用 addClass）— 不重置累积器
    if (this.currentClass !== null && this.currentClass.classId === id) {
      return;
    }
    this.currentClass = {
      classId: id,
      label: undefined,
      stereotype: undefined,
      annotations: [],
      members: [],
      cssClasses: [],
    };
  }

  /**
   * 设置类标签（jison 调用）
   *
   * 更新 currentClass.label（若 classId 匹配）。
   */
  public setClassLabel(id: string, label: string): void {
    // 若 currentClass 不匹配，先 flush 再初始化（对齐 ClassDB：先 addClass 再 setClassLabel）
    if (this.currentClass === null || this.currentClass.classId !== id) {
      this.flushCurrentClass();
      this.addClass(id);
    }
    if (this.currentClass !== null && this.currentClass.classId === id) {
      this.currentClass.label = label;
    }
  }

  /**
   * 添加注解（jison 调用）
   *
   * 注：jison 调用 addAnnotation 时 annotation 已去除 <<>> 包裹（jison 语法层处理）。
   * 累积到 currentClass.annotations[]。
   *
   * @param className - 类名（可能含泛型）
   * @param annotation - 注解文本（不含 <<>>）
   */
  public addAnnotation(className: string, annotation: string): void {
    // 若 currentClass 不匹配，先 flush 再初始化（对齐 ClassDB：addAnnotation 不调用 addClass，
    // 但 jison 语法保证 addAnnotation 前已调用 addClass；此处防御性处理）
    if (this.currentClass === null || this.currentClass.classId !== className) {
      this.flushCurrentClass();
      this.addClass(className);
    }
    if (this.currentClass !== null && this.currentClass.classId === className) {
      this.currentClass.annotations.push(annotation);
    }
  }

  /**
   * 添加成员（jison 调用）
   *
   * 判定 memberKind：`<<...>>` → annotation；含 `)` → method；其他 → attribute。
   * 加入 currentClass.members[]。
   *
   * 注意：对齐 ClassDB.addMember，先调用 addClass(className) 确保类存在。
   * 但与 ClassDB 的差异：`<<...>>` 成员仍加入 members[]（memberKind='annotation'），
   * 不加入 annotations[]（annotations[] 仅由 addAnnotation 产出）。
   *
   * @param className - 类名
   * @param member - 成员字符串
   */
  public addMember(className: string, member: string): void {
    // 对齐 ClassDB.addMember：先 addClass 确保类存在
    if (this.currentClass === null || this.currentClass.classId !== className) {
      this.flushCurrentClass();
      this.addClass(className);
    }
    if (this.currentClass === null || this.currentClass.classId !== className) {
      return;
    }
    if (typeof member !== 'string') {
      return;
    }
    const memberText = member.trim();
    if (memberText.length === 0) {
      return;
    }
    const memberKind = classifyMember(memberText);
    const memberBlock: ClassMemberBlock = {
      memberText,
      memberKind,
    };
    this.currentClass.members.push(memberBlock);
  }

  /**
   * 批量添加成员（jison 调用）
   *
   * jison members 产生式逆序压栈，需 reverse 后逐个 addMember（最终 members[] 顺序与源码一致）。
   * 对齐 ClassDB.addMembers 的 reverse 逻辑。
   */
  public addMembers(className: string, members: string[]): void {
    if (!Array.isArray(members)) {
      return;
    }
    // reverse 后逐个 addMember（对齐 ClassDB.addMembers）
    const reversed = [...members].reverse();
    for (const member of reversed) {
      this.addMember(className, member);
    }
  }

  // ============================================================
  // 关系管理（addRelation）
  // ============================================================

  /**
   * 添加关系（jison 调用）
   *
   * 产出 RelationBlock：保留原始 id1/id2（LOLLIPOP 不替换），
   * relationType1/relationType2/lineType 完整保留 jison 三元组，
   * cardinality1/cardinality2 从 relationTitle1/relationTitle2 映射（trim 后空字符串 → undefined）。
   *
   * 与 ClassDB.addRelation 的差异：
   *   - 不处理 LOLLIPOP（不生成 interface 节点，保留原始 id1/id2）
   *   - 不 splitClassNameAndType（保留原始 classId，含 ~T~ 泛型）
   *   - 产出 RelationBlock 而非 push 到 relations 数组
   *
   * title 处理对齐老路径 ClassDB.addRelation：
   *   - cleanupLabel 由 jison grammar case 20 在 addRelation 前调用（处理标签 token `:label`），
   *     老路径 addRelation 不重复调用 cleanupLabel，直接读 classRelation.title
   *   - 无标签关系（jison case 19）title 为 undefined，直接保留 undefined
   *   - 有标签关系（jison case 20）title 已是 cleanupLabel 处理后的字符串
   */
  public addRelation(classRelation: ClassRelation): void {
    this.flushCurrentClass();

    // jison 默认值 'none' 表示无基数（对齐老路径 class-parser.ts line 358 的 'none' 过滤）
    const cardinality1 = classRelation.relationTitle1.trim();
    const cardinality2 = classRelation.relationTitle2.trim();
    const label = classRelation.title;

    const block: RelationBlock = {
      type: 'relation',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      sourceId: classRelation.id1,
      targetId: classRelation.id2,
      relationType1: classRelation.relation.type1,
      relationType2: classRelation.relation.type2,
      lineType: classRelation.relation.lineType,
      cardinality1: cardinality1.length > 0 && cardinality1 !== 'none' ? cardinality1 : undefined,
      cardinality2: cardinality2.length > 0 && cardinality2 !== 'none' ? cardinality2 : undefined,
      label: label !== undefined && label.length > 0 ? label : undefined,
    };
    this.pushBlock(block);
  }

  // ============================================================
  // Note 管理（addNote）
  // ============================================================

  /**
   * 添加 Note（jison 调用）
   *
   * 产出 NoteBlock：text, classId（可选）。
   * 返回生成的 noteId（note0, note1, ...），对齐 ClassDB.addNote 的 id 生成。
   *
   * @param text - Note 文本
   * @param className - 关联的类 ID（可选，note for Class 语法提供）
   * @returns Note ID（note0, note1, ...）
   */
  public addNote(text: string, className?: string): string {
    this.flushCurrentClass();
    const noteId = `note${this.noteCount}`;
    this.noteCount++;

    const block: NoteBlock = {
      type: 'note',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      text,
      classId: className,
    };
    this.pushBlock(block);
    return noteId;
  }

  // ============================================================
  // Namespace 管理（addNamespace/popNamespace/addClassesToNamespace）
  // ============================================================

  /**
   * 添加命名空间（jison 调用）
   *
   * 支持点分名称（`A.B`），通过 namespaceStack 拼接父前缀得到 qualifiedId。
   * 产出 NamespaceOpenBlock（延迟到 popNamespace 时创建，与 flowchart addSubGraph 模式一致）。
   *
   * 流程：
   *   1. flushCurrentClass（确保当前 class 已产出）
   *   2. resolveQualifiedId（拼接父前缀）
   *   3. namespaceStack.push(qualifiedId)
   *   4. namespaceInfoStack.push({ namespaceId, label })
   *   5. enterScope（push 新空 scope，namespace 子内容进入此 scope）
   *   6. 返回 qualifiedId
   *
   * @param id - 命名空间 ID（可能是点分名称）
   * @param label - 命名空间标签（可选）
   * @returns 限定 ID（含父前缀）
   */
  public addNamespace(id: string, label?: string): string {
    this.flushCurrentClass();

    // resolveQualifiedId（对齐 ClassDB.resolveQualifiedId）
    const prefix = this.namespaceStack.at(-1);
    const qualifiedId = prefix ? `${prefix}.${id}` : id;

    // push 到 namespaceStack（用于后续 addNamespace 的前缀拼接）
    this.namespaceStack.push(qualifiedId);

    // push 到 namespaceInfoStack（用于 popNamespace 创建 NamespaceOpenBlock）
    this.namespaceInfoStack.push({ namespaceId: qualifiedId, label });

    // enterScope（namespace 子内容进入新 scope）
    this.enterScope();

    return qualifiedId;
  }

  /**
   * 弹出命名空间栈（jison 调用）
   *
   * 流程：
   *   1. flushCurrentClass（确保当前 class 已产出）
   *   2. pop namespaceInfoStack → namespaceInfo
   *   3. leaveScope(namespaceInfo)（pop 当前 scope，递增 indent，打包 [openBlock, ...childBlocks, closeBlock]）
   *   4. pop namespaceStack
   *
   * 前置不变量校验：pendingStack.length >= 2 + namespaceInfoStack.length >= 1 + namespaceStack.length >= 1
   */
  public popNamespace(): void {
    this.flushCurrentClass();

    const namespaceInfo = this.namespaceInfoStack.pop();
    if (namespaceInfo === undefined) {
      throw new Error(
        'namespaceInfoStack underflow: popNamespace called without matching addNamespace',
      );
    }

    this.leaveScope(namespaceInfo);
    this.namespaceStack.pop();
  }

  /**
   * 将类和注释添加到命名空间（jison 调用）
   *
   * **no-op**：pendingStack 已通过 enterScope/leaveScope 处理 namespace 嵌套，
   * class/note Block 已在正确的 scope 内（indent 已正确累加）。
   * 此方法仅用于 ClassDB 的状态关联（classNode.parent = id），Recognizer 不需要。
   */
  public addClassesToNamespace(_id: string, _classNames: string[], _noteNames: string[]): void {
    // no-op：pendingStack 已处理 namespace 嵌套和 indent 累加
  }

  // ============================================================
  // 样式管理（defineClass/setCssClass/setCssStyle）
  // ============================================================

  /**
   * 定义样式类（jison 调用，classDef 语法）
   *
   * 产出 ClassCssDefBlock：className, styles, textStyles。
   * 对齐 flowchart-recognizer.addClass 的 style 处理：
   *   - 含 color 的样式 → textStyles（同时 fill→bgFill 替换）
   *   - 所有样式 → styles
   *
   * @param ids - CSS 类名数组（classDiagram jison 传入数组，flowchart 传入逗号分隔字符串）
   * @param style - 样式字符串数组
   */
  public defineClass(ids: string[], style: string[]): void {
    this.flushCurrentClass();

    // 处理样式：color 相关 → textStyles，所有 → styles
    const textStyles: string[] = [];
    const normalStyles: string[] = [];
    for (const s of style) {
      if (/color/.exec(s)) {
        const newStyle = s.replace('fill', 'bgFill');
        textStyles.push(newStyle);
      }
      normalStyles.push(s);
    }

    for (const id of ids) {
      const block: ClassCssDefBlock = {
        type: 'classDef',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        className: id,
        styles: normalStyles,
        textStyles,
      };
      this.pushBlock(block);
    }
  }

  /**
   * 设置 CSS 类（jison 调用，cssClass 语法）
   *
   * 产出 ClassCssApplyBlock：classIds（逗号拆分）, className。
   *
   * @param ids - 类名列表（逗号分隔字符串，如 "A,B,C"）
   * @param className - CSS 类名
   */
  public setCssClass(ids: string, className: string): void {
    this.flushCurrentClass();
    const classIds = ids.split(',');
    const block: ClassCssApplyBlock = {
      type: 'class-apply',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      classIds,
      className,
    };
    this.pushBlock(block);
  }

  /**
   * 设置内联样式（jison 调用，style 语法）
   *
   * 产出 ClassStyleBlock：classId, styles（逗号拆分）。
   *
   * @param id - 类名
   * @param styles - 样式字符串数组（可能含逗号分隔的样式）
   */
  public setCssStyle(id: string, styles: string[]): void {
    this.flushCurrentClass();
    // 对齐 ClassDB.setCssStyle：含逗号的样式拆分
    const flattenedStyles: string[] = [];
    for (const s of styles) {
      if (s.includes(',')) {
        flattenedStyles.push(...s.split(','));
      } else {
        flattenedStyles.push(s);
      }
    }
    const block: ClassStyleBlock = {
      type: 'style',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      classId: id,
      styles: flattenedStyles,
    };
    this.pushBlock(block);
  }

  // ============================================================
  // 交互管理（setLink/setTooltip/setClickEvent）
  // ============================================================

  /**
   * 设置链接（jison 调用，link/click href 语法）
   *
   * 产出 ClassClickBlock（link/linkTarget 字段）。
   * 对齐 flowchart-recognizer.setLink：同时调用 setCssClass(ids, 'clickable')。
   *
   * @param ids - 类名列表（逗号分隔字符串）
   * @param linkStr - 链接 URL
   * @param target - 链接 target（_self/_blank/_parent/_top）
   */
  public setLink(ids: string, linkStr: string, target?: string): void {
    this.flushCurrentClass();
    for (const classId of ids.split(',')) {
      const block: ClassClickBlock = {
        type: 'click',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        classId,
        functionName: undefined,
        functionArgs: undefined,
        link: linkStr,
        linkTarget: target,
        tooltip: undefined,
      };
      this.pushBlock(block);
    }
    // 对齐 flowchart-recognizer.setLink：同时应用 clickable class
    this.setCssClass(ids, 'clickable');
  }

  /**
   * 设置 tooltip（jison 调用）
   *
   * 产出 ClassClickBlock（tooltip 字段）。
   *
   * @param ids - 类名列表（逗号分隔字符串）
   * @param tooltip - tooltip 文本
   */
  public setTooltip(ids: string, tooltip?: string): void {
    this.flushCurrentClass();
    if (tooltip === undefined) {
      return;
    }
    for (const classId of ids.split(',')) {
      const block: ClassClickBlock = {
        type: 'click',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        classId,
        functionName: undefined,
        functionArgs: undefined,
        link: undefined,
        linkTarget: undefined,
        tooltip,
      };
      this.pushBlock(block);
    }
  }

  /**
   * 设置点击事件（jison 调用，click/callback 语法）
   *
   * 产出 ClassClickBlock（functionName/functionArgs 字段）。
   * 对齐 flowchart-recognizer.setClickEvent：同时调用 setCssClass(ids, 'clickable')。
   *
   * @param ids - 类名列表（逗号分隔字符串）
   * @param functionName - 回调函数名
   * @param functionArgs - 回调函数参数
   */
  public setClickEvent(ids: string, functionName: string, functionArgs?: string): void {
    this.flushCurrentClass();
    for (const classId of ids.split(',')) {
      const block: ClassClickBlock = {
        type: 'click',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        classId,
        functionName: functionName || undefined,
        functionArgs: functionArgs || undefined,
        link: undefined,
        linkTarget: undefined,
        tooltip: undefined,
      };
      this.pushBlock(block);
    }
    // 对齐 flowchart-recognizer.setClickEvent：同时应用 clickable class
    this.setCssClass(ids, 'clickable');
  }

  // ============================================================
  // 方向 / Accessibility（setDirection/setAccTitle/setAccDescription）
  // ============================================================

  /**
   * 设置方向（jison 调用）
   *
   * 产出 ClassDirectionBlock（dir=normalizeDirection(dir)）。
   * 边界校验：调用 normalizeDirection 在 jison→recognizer 边界完成字符串→FlowchartDirection 校验。
   */
  public setDirection(dir: string): void {
    this.flushCurrentClass();
    const normalized = normalizeDirection(dir);
    if (normalized === undefined) {
      return;
    }
    const block: ClassDirectionBlock = {
      type: 'direction',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      dir: normalized,
    };
    this.pushBlock(block);
  }

  /** 设置无障碍标题（jison 调用） */
  public setAccTitle(title: string): void {
    this.flushCurrentClass();
    const block: ClassAccTitleBlock = {
      type: 'accTitle',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      accTitle: title,
    };
    this.pushBlock(block);
  }

  /** 设置无障碍描述（jison 调用） */
  public setAccDescription(desc: string): void {
    this.flushCurrentClass();
    const block: ClassAccDescriptionBlock = {
      type: 'accDescription',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      accDescription: desc,
    };
    this.pushBlock(block);
  }

  // ============================================================
  // 文本处理（cleanupLabel）
  // ============================================================

  /**
   * 清理标签文本（jison 调用）
   *
   * 对齐 ClassDB.cleanupLabel：移除前导冒号，trim。
   */
  public cleanupLabel(label: string): string {
    let cleaned = label;
    if (cleaned.startsWith(':')) {
      cleaned = cleaned.substring(1);
    }
    return cleaned.trim();
  }

  // ============================================================
  // 公共 API
  // ============================================================

  /**
   * 获取收集的 block 列表（返回顶层 scope）
   *
   * 前置不变量校验：
   *   1. pendingStack.length === 1（所有 namespace 已关闭）
   *   2. namespaceInfoStack.length === 0（所有 namespace info 已弹出）
   *   3. namespaceStack.length === 0（所有 namespace 限定 ID 已弹出）
   *
   * 调用前先 flushCurrentClass，确保最后一个 class 已产出。
   */
  public getBlocks(): readonly ClassRecognizedBlock[] {
    this.flushCurrentClass();

    if (this.pendingStack.length !== 1) {
      throw new Error(
        `pendingStack invariant violated: expected depth=1 after parse, got ${this.pendingStack.length} ` +
          '(unclosed namespace or addNamespace/popNamespace mismatch)',
      );
    }
    if (this.namespaceInfoStack.length !== 0) {
      throw new Error(
        `namespaceInfoStack invariant violated: expected depth=0 after parse, got ${this.namespaceInfoStack.length} ` +
          '(unclosed namespace or addNamespace/popNamespace mismatch)',
      );
    }
    if (this.namespaceStack.length !== 0) {
      throw new Error(
        `namespaceStack invariant violated: expected depth=0 after parse, got ${this.namespaceStack.length} ` +
          '(unclosed namespace or addNamespace/popNamespace mismatch)',
      );
    }
    return this.pendingStack[0];
  }
}

// ============================================================
// ClassRecognizer — 实现 IBlockRecognizer
// ============================================================

/**
 * classDiagram 识别器
 *
 * 单一职责：将 Mermaid classDiagram 代码识别为 ClassRecognizedBlock[] 流
 *
 * 数据流：
 *   code → preprocessCode（清理 frontmatter/指令/注释，保持行号一致）
 *        → classJisonParser.parse(code) [yy=ClassRecognizerCollector]
 *        → ClassRecognizerCollector 收集 block
 *        → getBlocks() 返回 ClassRecognizedBlock[]
 *
 * 预处理对齐 flowchart-recognizer 的 recognize 模式：
 *   - preprocessCode 清理 frontmatter/指令/注释（替换为等长换行）
 *   - 若 source 不以换行结尾，补充换行符（jison 语法要求）
 */
export class ClassRecognizer implements IBlockRecognizer {
  /**
   * 识别代码产出 block 流
   *
   * @param code - Mermaid classDiagram 源代码（可含 %% 注释、%%{directive}%%、frontmatter）
   * @returns 识别块流（忠实产出 jison 能识别的所有 block）
   */
  recognize(code: string): readonly ClassRecognizedBlock[] {
    const collector = new ClassRecognizerCollector();

    // 将 ClassRecognizerCollector 实例作为 yy 传入 parser
    classJisonParser.yy = collector;

    // 预处理：清理 frontmatter/指令/注释（替换为等长换行，保持行号一致）
    const preprocessedSource = preprocessCode(code);
    // jison 语法要求 source 以换行结尾，若不以换行结尾则补充
    const normalizedSource = preprocessedSource.endsWith('\n')
      ? preprocessedSource
      : preprocessedSource + '\n';

    try {
      classJisonParser.parse(normalizedSource);
    } finally {
      // 重置 parser.yy，避免泄漏到下次 recognize 调用（对齐 flowchart-recognizer）
      classJisonParser.yy = {};
    }

    return collector.getBlocks();
  }
}
