/**
 * erDiagram 识别器 — 将 Mermaid erDiagram 代码识别为 ErRecognizedBlock[] 流
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块1-识别器.md
 *
 * 数据流：
 *   code → preprocessCode → erJisonParser.parse(code) [yy=ErRecognizerCollector]
 *        → ErRecognizerCollector 收集 block → getBlocks() → ErRecognizedBlock[]
 *
 * 关键决策（模块1 方案B 完整增强）：
 *   - 复用 flowchart-recognizer 的 pendingStack 栈结构管理 subgraph 嵌套
 *   - entity Block 携带 attributes[] 子数组保留实体体语义
 *   - 前置三项语义整理（makeUniq/getCompiledStyles/parentDB），Converter 退化为纯类型映射器
 *   - relationship 端点保留原始 name（不替换为 entity.id），端点类型由 MermaidNode.data.isSubgraph 判断
 *
 * pendingStack 机制（复用 flowchart 模式，适配 erDiagram jison）：
 *   - pendingStack[0] 是顶层 scope
 *   - subgraphDepth setter 在 value 增加时 enterScope push 新空 scope
 *     （erDiagram.jison subgraphHeader 归约时 yy.subgraphDepth++）
 *   - addEntity/addRelationship 等 push block 到栈顶 scope
 *   - addSubGraph 调用时 pop 栈顶 scope 作为 childBlocks，递增 indent（+2），
 *     打包 [openBlock, ...childBlocks, closeBlock] push 到外层 scope
 *     （erDiagram.jison END 归约时先 yy.subgraphDepth-- 再 yy.addSubGraph）
 *
 * currentEntity 累积器（entity 体语义，对齐 class 的 currentClass 模式）：
 *   jison 在单个 entity 语句内调用 addEntity → addAttributes，
 *   但分散在不同 yy 方法中。RecognizerCollector 维护 currentEntity 累积器：
 *     - addEntity(name, alias) 初始化 currentEntity（若已有则先 flush 产出 ErEntityBlock）
 *     - addAttributes(entityName, attribs) 累积到 currentEntity.attributes[]
 *     - 任何非 entity 累积操作（addRelationship/addSubGraph/addClass/...）前先 flush
 *     - getBlocks() 前最后 flush
 *
 * 两阶段处理（L0 决策1 方案C 增强）：
 *   1. 解析阶段：jison 调用 yy.addXxx → 产出 Block 并 pushBlock；同时维护 classes Map 和 subGraphLookup Map
 *   2. 收尾阶段（getBlocks 调用时）：遍历 Block 流回填 cssCompiledStyles/parentId
 *
 * 模块边界：仅依赖 ./types.js（ErRecognizedBlock）、./index.js（IBlockRecognizer）、
 * ../parser/jison/er-parser.js、../detector/preprocessor.js、../parser/direction-utils.js、
 * ../parser/er/types.js（ErDBYY + EntityNode/Attribute/Relationship/RelSpec/EntityClass/ErSubGraph + InputAttribute/SubGraphListItem/SubGraphTitle）、
 * ../parser/er/constants.js（CARDINALITY/IDENTIFICATION）。
 * 不引用 React/DOM。
 */

import { parser as erParser } from '../parser/jison/er-parser.js';
import { preprocessCode } from '../detector/preprocessor.js';
import { normalizeDirection } from '../parser/direction-utils.js';
import type {
  ErDBYY,
  EntityNode,
  Relationship,
  RelSpec,
  EntityClass,
  ErSubGraph,
  InputAttribute,
  SubGraphListItem,
  SubGraphTitle,
} from '../parser/er/types.js';
import { CARDINALITY, IDENTIFICATION } from '../parser/er/constants.js';
import type { FlowchartDirection } from '../types.js';
import type {
  ErRecognizedBlock,
  ErEntityBlock,
  ErAttributeBlock,
  ErAttributeKeyType,
  ErRelationshipBlock,
  ErSubgraphOpenBlock,
  ErSubgraphCloseBlock,
  ErClassApplyBlock,
  ErStyleBlock,
  ErClassDefBlock,
  ErDirectionBlock,
  ErAccTitleBlock,
  ErAccDescriptionBlock,
} from './types.js';
import type { IBlockRecognizer } from './index.js';

// ============================================================
// jison parser 实例
// ============================================================

interface JisonParserInstance {
  parse(input: string): unknown;
  yy: unknown;
}

const erJisonParser: JisonParserInstance = erParser as unknown as JisonParserInstance;

// ============================================================
// 内部类型
// ============================================================

/**
 * currentEntity 累积器（mutable，用于在 addEntity → addAttributes 之间累积数据）
 *
 * jison 在单个 entity 语句内分多次 yy 方法调用：
 *   1. addEntity(name, alias) 初始化 entity
 *   2. addAttributes(entityName, attribs) 累积属性
 *
 * 由于 addEntity 时可能还没有 attributes，RecognizerCollector 需要累积这些调用，
 * 在 entity 语句结束时（即下一个非 entity 累积操作前）一次性产出 ErEntityBlock。
 *
 * cssCompiledStyles/parentId 在收尾阶段（finalizeBlocks）回填，parse 阶段暂空。
 */
interface CurrentEntityAccumulator {
  /** 实体名（原始 name） */
  readonly entityName: string;
  /** 实体别名（空字符串表示无别名） */
  alias: string;
  /** 属性列表（已 reverse，顺序与源码一致） */
  attributes: ErAttributeBlock[];
  /** CSS 类名字符串（空格分隔，含 'default'） */
  cssClasses: string;
}

// ============================================================
// 辅助函数 — subgraph list 解析（对齐 er-db.ts uniq 函数）
// ============================================================

/**
 * 从 subgraph list 提取节点 ID 列表和方向
 *
 * erDiagram.jison 的 subgraph document 解析时，statement 返回值被收集到 list 中：
 *   - 字符串（节点 ID，如 "CUSTOMER"）
 *   - 方向对象（{ stmt: 'dir', value: 'LR' }）
 *
 * 本函数对齐 er-db.ts addSubGraph 内部的 uniq 函数：
 *   - 过滤空字符串和重复节点
 *   - 提取方向对象
 *
 * @param list - jison 传入的 subgraph list（已 flat）
 * @returns 节点 ID 列表 + 方向（未 normalizeDirection）
 */
function parseSubgraphList(
  list: readonly SubGraphListItem[],
): { nodeList: string[]; dir: string | undefined } {
  const seen = new Set<string>();
  let dir: string | undefined;

  const nodeList = list.filter((item): item is string => {
    // 方向对象：提取 value，过滤出 nodeList
    if (item && typeof item === 'object' && 'stmt' in item) {
      if (item.stmt === 'dir') {
        dir = item.value;
      }
      return false;
    }

    // 非字符串：过滤
    if (typeof item !== 'string') {
      return false;
    }

    const trimmed = item.trim();
    if (!trimmed) {
      return false;
    }

    // 去重
    if (seen.has(trimmed)) {
      return false;
    }
    seen.add(trimmed);

    return true;
  });

  return { nodeList, dir };
}

// ============================================================
// ErRecognizerCollector — 适配器，实现 ErDBYY 接口
// ============================================================

/**
 * ErRecognizerCollector — erDiagram 识别数据收集器
 *
 * 实现 ErDBYY 接口（与 ErDB 相同的方法签名），但内部产出 ErRecognizedBlock
 * 而非 mutate 状态（L0 决策1 方案C 适配器模式）。
 *
 * 与 ErDB 的差异：
 *   - 不维护 entities/relationships/classes/subGraphs 等状态，只维护 pendingStack
 *   - addEntity/addAttributes 产出 ErEntityBlock 加入 pendingStack
 *   - addRelationship 产出 ErRelationshipBlock 加入 pendingStack
 *   - addSubGraph 将 blocks 包装为 ErSubgraphOpenBlock + childBlocks + ErSubgraphCloseBlock
 *   - 其他方法产出对应 block 加入 pendingStack
 *   - 两阶段处理：解析阶段产出 Block，收尾阶段回填 cssCompiledStyles/parentId
 *
 * jison 只支持直接属性，因此所有 jison 调用的方法都在构造函数中 bind。
 */
class ErRecognizerCollector implements ErDBYY {
  /**
   * block 栈（复用 flowchart pendingStack 模式）
   *
   * - pendingStack[0] 是顶层 scope
   * - subgraphDepth setter 在 value 增加时 enterScope（push 新 scope）
   * - addSubGraph() pop 当前 scope 作为 childBlocks，打包后 push 到外层 scope
   */
  private pendingStack: ErRecognizedBlock[][] = [[]];

  /** classDef 收集（追加逻辑，复用已有 classNode，对齐 er-db.ts:330-348） */
  private classes = new Map<string, EntityClass>();

  /** subgraph 收集（供收尾阶段计算 parentId） */
  private subGraphLookup = new Map<string, ErSubGraph>();

  /** setClass 记录 entityId → classNames（供收尾阶段合并到 cssClasses，对齐 er-db.ts:356-374） */
  private entityAppliedClasses = new Map<string, string[]>();

  /** subgraph 计数器（自动生成 subgraphId） */
  private subCount = 0;

  /** currentEntity 累积器（entity 体语义，对齐 class 的 currentClass 模式） */
  private currentEntity: CurrentEntityAccumulator | null = null;

  // 3 个公共属性（jison 引用）
  // subgraphDepth：普通数字属性，jison 直接 ++/--，用于 direction 双路径判断
  // （不触发 enterScope，由 er.jison subgraphStart 显式调用，与 pendingStack 并行维护）
  public subgraphDepth = 0;
  public readonly Cardinality = CARDINALITY;
  public readonly Identification = IDENTIFICATION;

  constructor() {
    // jison yy 浅拷贝约束：jison 只支持直接属性，所有 jison 调用的方法都在构造函数中 bind
    this.addEntity = this.addEntity.bind(this);
    this.addAttributes = this.addAttributes.bind(this);
    this.addRelationship = this.addRelationship.bind(this);
    this.setDirection = this.setDirection.bind(this);
    this.addCssStyles = this.addCssStyles.bind(this);
    this.addClass = this.addClass.bind(this);
    this.setClass = this.setClass.bind(this);
    this.addSubGraph = this.addSubGraph.bind(this);
    this.setAccTitle = this.setAccTitle.bind(this);
    this.setAccDescription = this.setAccDescription.bind(this);
    this.enterScope = this.enterScope.bind(this);
  }

  // ============================================================
  // scope 栈管理（pendingStack）
  // ============================================================

  /**
   * 进入 subgraph 作用域（jison subgraphStart 显式调用）
   *
   * push 新的空 scope 到 pendingStack。
   * 后续 addEntity/addRelationship 等 push 的 block 进入此 scope。
   * addSubGraph 调用时 pop 此 scope 作为 childBlocks。
   *
   * jison yy 浅拷贝约束：enterScope 是 bind 方法，浅拷贝后仍指向 collector，
   * 不能通过 subgraphDepth getter/setter 拦截（accessor 失效）。
   */
  public enterScope(): void {
    this.pendingStack.push([]);
  }

  /**
   * 离开 subgraph 作用域（addSubGraph 调用时）
   *
   * pop 栈顶 scope 作为 childBlocks。
   * 前置不变量校验：栈深 >= 2（至少有顶层 scope + 当前 subgraph scope）。
   */
  private leaveScope(): ErRecognizedBlock[] {
    if (this.pendingStack.length < 2) {
      throw new Error(
        'pendingStack underflow: addSubGraph called without matching subgraphHeader ' +
          '(stack depth=1, expected >=2 before pop)',
      );
    }
    const childBlocks = this.pendingStack.pop();
    if (childBlocks === undefined) {
      throw new Error('pendingStack pop returned undefined (invariant violated)');
    }
    return childBlocks;
  }

  /**
   * push block 到当前 scope（pendingStack 栈顶）
   */
  private pushBlock(block: ErRecognizedBlock): void {
    this.pendingStack[this.pendingStack.length - 1].push(block);
  }

  // ============================================================
  // currentEntity 累积器（entity 体语义）
  // ============================================================

  /**
   * flush currentEntity 产出 ErEntityBlock
   *
   * cssCompiledStyles/parentId 在收尾阶段（finalizeBlocks）回填，
   * parse 阶段暂空（cssCompiledStyles=[]/parentId=undefined）。
   */
  private flushCurrentEntity(): void {
    if (this.currentEntity === null) {
      return;
    }
    const ent = this.currentEntity;
    const block: ErEntityBlock = {
      type: 'entity',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      entityName: ent.entityName,
      alias: ent.alias,
      attributes: ent.attributes,
      cssClasses: ent.cssClasses,
      cssCompiledStyles: [], // 收尾阶段回填
      parentId: undefined, // 收尾阶段回填
    };
    this.pushBlock(block);
    this.currentEntity = null;
  }

  // ============================================================
  // 实体相关（addEntity/addAttributes）
  // ============================================================

  /**
   * 添加实体（jison 调用）
   *
   * 初始化 currentEntity 累积器（若已有则先 flush 产出 ErEntityBlock）。
   * cssClasses 初始为 'default'（对齐 ErDB.addEntity 的默认值）。
   *
   * @param name - 实体名称
   * @param alias - 实体别名（可选，空字符串表示无别名）
   * @returns EntityNode（兼容 ErDBYY 接口，ErRecognizerCollector 不维护 entities Map，
   *          返回一个最小化的 EntityNode 供 jison 语法动作可能的后续引用）
   */
  public addEntity(name: string, alias = ''): EntityNode {
    // 若已有 currentEntity，先 flush
    if (this.currentEntity !== null) {
      this.flushCurrentEntity();
    }

    this.currentEntity = {
      entityName: name,
      alias,
      attributes: [],
      cssClasses: 'default',
    };

    // 返回最小化 EntityNode（jison 语法动作可能引用其 id/label 等字段）
    return {
      id: `entity-${name}-0`,
      label: name,
      attributes: [],
      alias,
      shape: 'erBox',
      cssClasses: 'default',
      cssStyles: [],
      labelType: 'markdown',
    };
  }

  /**
   * 添加实体属性（jison 调用）
   *
   * 注意：jison 语法中 attributes 是逆序压栈的，这里 reverse 后逐个添加
   * 同时初始化 keys/comment 字段（jison 语法可能不提供这些字段）
   *
   * @param entityName - 实体名称
   * @param attribs - 属性列表（逆序，keys/comment 可选）
   */
  public addAttributes(entityName: string, attribs: InputAttribute[]): void {
    // 确保 currentEntity 存在（对齐 ErDB.addAttributes 的 addEntity 调用）
    if (this.currentEntity === null || this.currentEntity.entityName !== entityName) {
      this.addEntity(entityName);
    }

    const ent = this.currentEntity;
    if (ent === null) {
      // 理论上不会到达此处，addEntity 已确保 currentEntity 存在
      throw new Error(`Failed to add attributes: currentEntity is null for ${entityName}`);
    }

    // Process attribs in reverse order due to effect of recursive construction (last attribute is first)
    for (let i = attribs.length - 1; i >= 0; i--) {
      const attr = attribs[i];
      const normalized: ErAttributeBlock = {
        type: attr.type,
        name: attr.name,
        keys: normalizeAttributeKeys(attr.keys),
        comment: attr.comment ?? '',
      };
      ent.attributes.push(normalized);
    }
  }

  // ============================================================
  // 关系相关（addRelationship）
  // ============================================================

  /**
   * 添加关系（jison 调用）
   *
   * 产出 ErRelationshipBlock（完整字段，无需收尾回填），pushBlock 到栈顶 scope。
   *
   * 端点处理：保留原始 name（不替换为 entity.id），由 Converter 通过端点节点的
   * MermaidNode.data.isSubgraph 字段判断端点类型（单一数据源，不冗余存储）。
   *
   * 前向引用处理：若 entA/entB 还未定义（出现在 entity 定义之前），
   * Recognizer 不自动创建 entity Block（与 ErDB.addRelationship 的 addEntity 调用不同）。
   * 原因：Converter 通过 ctx.registerNode 处理前向引用，对齐 flowchart 决策17。
   *
   * @param entA - A 端实体名（原始 name）
   * @param rolA - A 端角色（关系标签）
   * @param entB - B 端实体名
   * @param rSpec - 关系细节（cardA/cardB/relType）
   */
  public addRelationship(entA: string, rolA: string, entB: string, rSpec: RelSpec): void {
    // 非 entity 累积操作前先 flush
    this.flushCurrentEntity();

    const block: ErRelationshipBlock = {
      type: 'relationship',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      entityA: entA,
      roleA: rolA,
      entityB: entB,
      cardA: rSpec.cardA,
      cardB: rSpec.cardB,
      relType: rSpec.relType,
    };
    this.pushBlock(block);
  }

  // ============================================================
  // 方向相关（setDirection）
  // ============================================================

  /**
   * 设置方向（jison 调用）
   *
   * 注意：erDiagram.jison 的 direction 语句在 subgraph 内外处理不同：
   *   - 顶层 direction（subgraphDepth=0）：调用 yy.setDirection → 产出 ErDirectionBlock
   *   - subgraph 内部 direction（subgraphDepth>0）：不调用 yy.setDirection，
   *     而是作为 list 项传给 addSubGraph，由 addSubGraph 提取并设置到 subgraph-open Block 的 dir 字段
   *
   * 边界校验：调用 normalizeDirection 在 jison→recognizer 边界完成字符串→FlowchartDirection 校验
   * 无效方向被忽略（不产出 Block，对齐 ErDB.setDirection 的行为）
   */
  public setDirection(dir: string): void {
    // 非 entity 累积操作前先 flush
    this.flushCurrentEntity();

    const normalized = normalizeDirection(dir);
    if (normalized === undefined) {
      return;
    }
    const block: ErDirectionBlock = {
      type: 'direction',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      dir: normalized,
    };
    this.pushBlock(block);
  }

  // ============================================================
  // 样式相关（addCssStyles/addClass/setClass）
  // ============================================================

  /**
   * 添加内联样式（jison 调用，style 语法）
   *
   * 产出 ErStyleBlock（每个 id 一个），pushBlock 到栈顶 scope。
   *
   * @param ids - 实体或 subgraph ID 列表
   * @param styles - 样式列表
   */
  public addCssStyles(ids: string[], styles: string[]): void {
    // 非 entity 累积操作前先 flush
    this.flushCurrentEntity();

    if (!styles) {
      return;
    }

    const block: ErStyleBlock = {
      type: 'style',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      ids: [...ids],
      styles: [...styles],
    };
    this.pushBlock(block);
  }

  /**
   * 定义样式类（jison 调用，classDef 语法）
   *
   * 产出 ErClassDefBlock + 更新 classes Map（供收尾阶段计算 cssCompiledStyles）。
   *
   * 对齐 ErDB.addClass：color 相关样式同时加入 textStyles（fill→bgFill 替换）。
   *
   * @param ids - 样式类 ID 列表（classDef 可能定义多个类，逗号分隔）
   * @param style - 样式列表
   */
  public addClass(ids: string[], style: string[]): void {
    // 非 entity 累积操作前先 flush
    this.flushCurrentEntity();

    for (const id of ids) {
      const styles: string[] = [];
      const textStyles: string[] = [];

      if (style) {
        for (const s of style) {
          if (/color/.exec(s)) {
            const newStyle = s.replace('fill', 'bgFill');
            textStyles.push(newStyle);
          }
          styles.push(s);
        }
      }

      // 更新 classes Map（追加逻辑，对齐 er-db.ts:330-348）
      // 复用已有 classNode，push 到 styles/textStyles（同一 className 多次定义时累积）
      const existing = this.classes.get(id);
      const classNode: EntityClass = existing ?? { id, styles: [], textStyles: [] };
      if (!existing) {
        this.classes.set(id, classNode);
      }
      for (const s of styles) {
        classNode.styles.push(s);
      }
      for (const s of textStyles) {
        classNode.textStyles.push(s);
      }

      // 产出 ErClassDefBlock（Block 是语句级快照，只携带本次定义的 styles/textStyles）
      const block: ErClassDefBlock = {
        type: 'classDef',
        sourceLine: undefined,
        rawText: '',
        indent: 0,
        className: id,
        styles,
        textStyles,
      };
      this.pushBlock(block);
    }
  }

  /**
   * 应用样式类到实体或 subgraph（jison 调用，class 语法）
   *
   * 产出 ErClassApplyBlock，pushBlock 到栈顶 scope。
   *
   * @param ids - 实体或 subgraph ID 列表
   * @param classNames - 样式类名列表
   */
  public setClass(ids: string[], classNames: string[]): void {
    // 非 entity 累积操作前先 flush
    this.flushCurrentEntity();

    // 记录 entityId → classNames 到 entityAppliedClasses Map（对齐 er-db.ts:356-374）
    // 供收尾阶段合并到 entity Block 的 cssClasses，确保 cssCompiledStyles 包含 setClass 应用的样式
    for (const id of ids) {
      const existing = this.entityAppliedClasses.get(id);
      if (existing) {
        existing.push(...classNames);
      } else {
        this.entityAppliedClasses.set(id, [...classNames]);
      }
    }

    const block: ErClassApplyBlock = {
      type: 'class-apply',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      ids: [...ids],
      classNames: [...classNames],
    };
    this.pushBlock(block);
  }

  // ============================================================
  // SubGraph 相关（addSubGraph）
  // ============================================================

  /**
   * 添加子图（jison 调用）
   *
   * pendingStack 机制（适配 erDiagram.jison）：
   *   subgraphHeader 归约时 yy.subgraphDepth++ 触发 enterScope（push 新 scope）。
   *   subgraph 内部的 addEntity/addRelationship 等 block 已进入该 scope。
   *   END 归约时 yy.subgraphDepth--（setter 不做事），然后调用 addSubGraph：
   *     - leaveScope pop 栈顶 scope 作为 childBlocks
   *     - 为 childBlocks 递增 indent（+2）
   *     - 从 list 提取节点 ID 列表 + 方向
   *     - makeUniq 去重（过滤已属于其他 subgraph 的节点）
   *     - 创建 ErSubgraphOpenBlock（parentId 暂空，收尾回填）+ ErSubgraphCloseBlock
   *     - 打包 [openBlock, ...childBlocks, closeBlock] push 到外层 scope
   *
   * @param _id - 子图 ID 信息 `{ text: string }`
   * @param list - 子图包含的节点列表（可能是字符串或方向对象）
   * @param _title - 子图标题信息 `{ text: string; type?: string }`
   * @returns 子图 ID
   */
  public addSubGraph(
    _id: { text: string },
    list: SubGraphListItem[],
    _title: SubGraphTitle,
  ): string {
    // 非 entity 累积操作前先 flush
    this.flushCurrentEntity();

    // 提取 subgraphId
    const id = _id.text.trim() || `subGraph${this.subCount}`;
    const title = (_title?.text ?? '').trim();

    // 从 list 提取节点 ID 列表 + 方向
    const { nodeList, dir } = parseSubgraphList(list.flat());
    const normalizedDir = dir !== undefined ? normalizeDirection(dir) : undefined;

    this.subCount = this.subCount + 1;

    // 构建 ErSubGraph（供 subGraphLookup 和 makeUniq 使用）
    const subGraph: ErSubGraph = {
      id,
      nodes: nodeList,
      title,
      classes: [],
      cssStyles: [],
      dir: normalizedDir,
      labelType: 'markdown',
    };

    // makeUniq 去重（过滤已属于其他 subgraph 的节点）
    const allSubgraphs = Array.from(this.subGraphLookup.values());
    const uniq = this.makeUniq(subGraph, allSubgraphs);
    subGraph.nodes = uniq.nodes;

    // 注册到 subGraphLookup（供收尾阶段计算 parentId）
    this.subGraphLookup.set(id, subGraph);

    // leaveScope pop 栈顶 scope 作为 childBlocks
    const rawChildBlocks = this.leaveScope();

    // 为 childBlocks 递增 indent（+2）
    const childBlocks = rawChildBlocks.map((b) => ({
      ...b,
      indent: b.indent + 2,
    }));

    // 创建 ErSubgraphOpenBlock（indent=0，由外层 addSubGraph 递增）
    const openBlock: ErSubgraphOpenBlock = {
      type: 'subgraph-open',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      subgraphId: id,
      title,
      dir: normalizedDir,
      nodes: subGraph.nodes,
      parentId: undefined, // 收尾阶段回填
    };

    // 创建 ErSubgraphCloseBlock（indent=0，由外层 addSubGraph 递增）
    const closeBlock: ErSubgraphCloseBlock = {
      type: 'subgraph-close',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      subgraphId: id,
    };

    // 打包 [openBlock, ...childBlocks, closeBlock] push 到外层 scope
    const packagedBlocks: ErRecognizedBlock[] = [
      openBlock,
      ...childBlocks,
      closeBlock,
    ];
    this.pendingStack[this.pendingStack.length - 1].push(...packagedBlocks);

    return id;
  }

  // ============================================================
  // makeUniq / getCompiledStyles / finalizeBlocks（前置语义整理）
  // ============================================================

  /**
   * 构建所有已分配给现有 subgraph 的节点 ID 的快速查找表
   *
   * 对齐 ErDB.subgraphNodeCache。
   */
  private subgraphNodeCache(allSubgraphs: readonly ErSubGraph[]): Set<string> {
    const nodeCache = new Set<string>();
    for (const subGraph of allSubgraphs) {
      for (const id of subGraph.nodes) {
        nodeCache.add(id);
      }
    }
    return nodeCache;
  }

  /**
   * 过滤掉已经属于另一个 subgraph 的节点，保持 subgraph 成员唯一
   *
   * 对齐 ErDB.makeUniq。
   */
  private makeUniq(
    subGraph: ErSubGraph,
    allSubgraphs: readonly ErSubGraph[],
  ): { nodes: string[] } {
    const existingNodes = this.subgraphNodeCache(allSubgraphs);
    const res: string[] = [];
    subGraph.nodes.forEach((nodeId) => {
      if (existingNodes.has(nodeId)) {
        // 节点已属于另一个 subgraph，忽略（保持官方逻辑，但不输出日志）
      } else {
        res.push(nodeId);
      }
    });
    return { nodes: res };
  }

  /**
   * 编译样式（从 classDefs 收集 styles/textStyles）
   *
   * 对齐 ErDB.getCompiledStyles。
   *
   * @param cssClasses - CSS 类名字符串（空格分隔，含 'default'）
   * @returns 编译后的样式列表
   */
  private getCompiledStyles(cssClasses: string): string[] {
    const classDefs = cssClasses.split(' ').filter((c) => c.length > 0);
    let compiledStyles: string[] = [];
    for (const customClass of classDefs) {
      const cssClass = this.classes.get(customClass);
      if (cssClass?.styles) {
        compiledStyles = [...compiledStyles, ...cssClass.styles].map((s) => s.trim());
      }
      if (cssClass?.textStyles) {
        compiledStyles = [...compiledStyles, ...cssClass.textStyles].map((s) => s.trim());
      }
    }
    return compiledStyles;
  }

  /**
   * 收尾阶段：回填 cssCompiledStyles/parentId
   *
   * 三步处理（getBlocks 调用时执行）：
   *   a. 构建 parentDB Map（nodeId → subgraph.id）
   *   b. 遍历 entity Block：合并 entityAppliedClasses 到 cssClasses，再用 classes Map 计算 cssCompiledStyles 回填
   *   c. 遍历 entity/subgraph-open Block：用 parentDB 计算 parentId 回填
   *
   * parentId 计算：
   *   构建 parentDB Map（nodeId → subgraph.id），遍历 subGraphLookup 中所有 subgraph，
   *   将 subgraph.nodes 中的节点映射到 subgraph.id。
   *   entity Block 的 parentId = parentDB.get(entityName)
   *   subgraph-open Block 的 parentId = parentDB.get(subgraphId)
   *
   * 注1：entity Block 的 entityName 是原始 name（非 entity-${name}-${index}），
   *      subGraphLookup 中 subgraph.nodes 存储的也是原始 name，匹配一致。
   * 注2：makeUniq 已过滤嵌套 subgraph id，外层 subgraph.nodes 不包含嵌套 subgraph id，
   *      嵌套 subgraph parentId 由 addSubGraph 调用时的 pendingStack 结构天然确定（此处不处理）。
   */
  private finalizeBlocks(): void {
    const blocks = this.pendingStack[0];

    // 步骤a：构建 parentDB Map（nodeId → subgraph.id）
    const parentDB = new Map<string, string>();
    for (const subGraph of this.subGraphLookup.values()) {
      for (const nodeId of subGraph.nodes) {
        parentDB.set(nodeId, subGraph.id);
      }
    }

    // 步骤b + 步骤c：遍历 blocks 回填 cssCompiledStyles/parentId
    // 注：blocks 是 readonly，需要创建可变副本
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block.type === 'entity') {
        const entityBlock = block as ErEntityBlock;
        // 步骤b1：合并 entityAppliedClasses 到 cssClasses（'default' + 应用的 classNames，对齐 er-db.ts:356-374）
        const appliedClassNames = this.entityAppliedClasses.get(entityBlock.entityName) ?? [];
        const mergedCssClasses = [entityBlock.cssClasses, ...appliedClassNames]
          .filter((s) => s.length > 0)
          .join(' ');
        // 步骤b2：用合并后的 cssClasses 计算 cssCompiledStyles
        const cssCompiledStyles = this.getCompiledStyles(mergedCssClasses);
        // 步骤c：计算 parentId
        const parentId = parentDB.get(entityBlock.entityName);
        blocks[i] = {
          ...entityBlock,
          cssCompiledStyles,
          parentId,
        };
      } else if (block.type === 'subgraph-open') {
        const openBlock = block as ErSubgraphOpenBlock;
        const parentId = parentDB.get(openBlock.subgraphId);
        blocks[i] = {
          ...openBlock,
          parentId,
        };
      }
    }
  }

  // ============================================================
  // accTitle / accDescription
  // ============================================================

  /** 设置无障碍标题（jison 调用） */
  public setAccTitle(title: string): void {
    // 非 entity 累积操作前先 flush
    this.flushCurrentEntity();

    const block: ErAccTitleBlock = {
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
    // 非 entity 累积操作前先 flush
    this.flushCurrentEntity();

    const block: ErAccDescriptionBlock = {
      type: 'accDescription',
      sourceLine: undefined,
      rawText: '',
      indent: 0,
      accDescription: desc,
    };
    this.pushBlock(block);
  }

  // ============================================================
  // 公共 API
  // ============================================================

  /**
   * 获取收集的 block 列表（返回顶层 scope）
   *
   * 前置处理：
   *   1. flushCurrentEntity（确保最后的 entity Block 被产出）
   *   2. finalizeBlocks（收尾阶段：回填 cssCompiledStyles/parentId）
   *
   * 前置不变量：解析结束时 pendingStack 应只剩 1 个元素（顶层 scope）。
   * 若栈深 > 1 说明有未关闭的 subgraph（enterScope 未被 addSubGraph 配对 pop），
   * 立即暴露而非返回不完整数据。
   */
  public getBlocks(): readonly ErRecognizedBlock[] {
    // flush 最后的 currentEntity
    this.flushCurrentEntity();

    // 前置不变量校验
    if (this.pendingStack.length !== 1) {
      throw new Error(
        `pendingStack invariant violated: expected depth=1 after parse, got ${this.pendingStack.length} ` +
          '(unclosed subgraph or subgraphHeader/END mismatch)',
      );
    }

    // 收尾阶段：回填 cssCompiledStyles/parentId
    this.finalizeBlocks();

    return this.pendingStack[0];
  }
}

// ============================================================
// ErRecognizer — 实现 IBlockRecognizer
// ============================================================

/**
 * erDiagram 识别器
 *
 * 单一职责：将 Mermaid erDiagram 代码识别为 ErRecognizedBlock[] 流
 *
 * 数据流：
 *   code → preprocessCode（清理 frontmatter/指令/注释，保持行号一致）
 *        → erJisonParser.parse(code) [yy=ErRecognizerCollector]
 *        → ErRecognizerCollector 收集 block
 *        → getBlocks() 返回 ErRecognizedBlock[]
 *
 * 预处理对齐 er-parser.ts 的 parseErCode：
 *   - preprocessCode 清理 frontmatter/指令/注释（替换为等长换行）
 *   - 若 source 不以换行结尾，补充换行符（jison 语法要求）
 */
export class ErRecognizer implements IBlockRecognizer {
  /**
   * 识别代码产出 block 流
   *
   * @param code - Mermaid erDiagram 源代码（可含 %% 注释、%%{directive}%%、frontmatter）
   * @returns 识别块流（忠实产出 jison 能识别的所有 block，不含注释/空行）
   */
  recognize(code: string): readonly ErRecognizedBlock[] {
    const collector = new ErRecognizerCollector();

    // 将 ErRecognizerCollector 实例作为 yy 传入 parser
    erJisonParser.yy = collector;

    // 预处理：清理 frontmatter/指令/注释（替换为等长换行，保持行号一致）
    const preprocessedSource = preprocessCode(code);
    // jison 语法要求 ER_HEADER 后必须有换行符，若 source 不以换行结尾，补充一个换行符
    const normalizedSource = preprocessedSource.endsWith('\n')
      ? preprocessedSource
      : preprocessedSource + '\n';

    try {
      erJisonParser.parse(normalizedSource);
    } finally {
      // 重置 parser.yy，避免泄漏到下次 recognize 调用（对齐 flowchart-recognizer.ts）
      erJisonParser.yy = {};
    }

    return collector.getBlocks();
  }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 规范化属性键列表（过滤无效值，转换为 ErAttributeKeyType）
 *
 * 对齐 er-db.ts 的 normalizeAttributeKeys 函数。
 */
function normalizeAttributeKeys(keys?: string[]): readonly ErAttributeKeyType[] {
  if (!keys) {
    return [];
  }
  const validKeys: ErAttributeKeyType[] = [];
  for (const key of keys) {
    if (key === 'PK' || key === 'FK' || key === 'UK') {
      validKeys.push(key);
    }
  }
  return validKeys;
}
