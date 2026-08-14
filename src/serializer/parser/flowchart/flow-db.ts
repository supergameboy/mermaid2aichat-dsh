/**
 * FlowDB — 官方 mermaid v11 `flowDb.ts` 的纯 TypeScript 移植
 *
 * 单一职责：jison parser 调用此类的实例方法收集 AST 数据
 *
 * 与官方的差异:
 *   - 移除 D3/select/DOMPurify 依赖（getData 返回纯数据，不操作 DOM）
 *   - 移除 getConfig 依赖（使用默认配置或注入配置）
 *   - 移除 look 依赖（渲染由 editor 层负责）
 *   - 移除 document.querySelector 等 DOM 操作（不在解析层处理交互）
 *   - 移除 common.sanitizeText（在渲染层处理 HTML 转义）
 *   - 移除 createTooltip（在渲染层处理 tooltip）
 *   - 移除 bindFunctions（在渲染层处理事件绑定）
 *   - 适配 TypeScript 严格模式（禁止 any，禁止 ! 非空断言）
 *   - 保留 addVertex/addLink/destructLink/addSubGraph/addClass/setClass/setLink/
 *     updateLink/updateLinkInterpolate/setClickEvent/setTooltip/setDirection 逻辑
 *   - 保留 setAccTitle/setAccDescription/setDiagramTitle 逻辑
 *
 * 数据流:
 *   jison parser → FlowDB.addVertex/addLink/... → FlowDB.getData() → FlowchartAST
 *
 * 注意:
 *   - jison 只支持直接属性，因此所有 jison 调用的方法都在构造函数中 bind
 *   - lex.firstGraph() 是 jison 词法分析器调用的方法
 */

import * as yaml from 'js-yaml';
import type {
  FlowchartAST,
  FlowVertex,
  FlowEdge,
  FlowClass,
  FlowSubGraph,
  FlowLink,
  FlowClickEvent,
  FlowText,
  FlowVertexTypeParam,
  FlowLabelType,
} from '../../ast/flowchart-ast.js';
import type { FlowchartDirection } from '../../types.js';
import { normalizeDirection } from '../direction-utils.js';

// ============================================================
// 内部类型
// ============================================================

/** 边列表扩展属性（defaultInterpolate/defaultStyle） */
interface FlowEdgeArray extends Array<FlowEdge> {
  defaultInterpolate?: string;
  defaultStyle?: string[];
}

/** shapeData YAML 解析结果（节点元数据） */
interface NodeMetaData {
  shape?: string;
  label?: string;
  labelType?: string;
  icon?: string;
  form?: 'circle' | 'square' | 'rounded';
  pos?: 't' | 'b';
  img?: string;
  w?: number | string;
  h?: number | string;
  constraint?: 'on' | 'off';
  animate?: boolean;
  animation?: 'fast' | 'slow';
  curve?: string;
}

/** 链接数据（jison 传入的 linkData 可能是 { id: string }） */
interface LinkData {
  id: string;
}

/** jison parser 调用的 yy 对象接口（FlowDB 方法签名子集） */
export interface FlowDBYY {
  addVertex: FlowDB['addVertex'];
  addLink: FlowDB['addLink'];
  destructLink: FlowDB['destructLink'];
  addSubGraph: FlowDB['addSubGraph'];
  addClass: FlowDB['addClass'];
  setClass: FlowDB['setClass'];
  setLink: FlowDB['setLink'];
  updateLink: FlowDB['updateLink'];
  updateLinkInterpolate: FlowDB['updateLinkInterpolate'];
  setClickEvent: FlowDB['setClickEvent'];
  setTooltip: FlowDB['setTooltip'];
  setDirection: FlowDB['setDirection'];
  setAccTitle: FlowDB['setAccTitle'];
  setAccDescription: FlowDB['setAccDescription'];
  setDiagramTitle: FlowDB['setDiagramTitle'];
  firstGraph: FlowDB['firstGraph'];
  lex: { firstGraph: FlowDB['firstGraph'] };
}

/**
 * Recognizer 专用的 yy 对象接口
 *
 * 扩展 FlowDBYY，新增 enterScope（subgraphStart 归约时调用）。
 * enterScope 是 RecognizerCollector 专有方法（FlowDB 不需要），
 * 因为 Recognizer 使用 pendingStack 栈结构区分 subgraph 作用域，
 * 而 FlowDB 使用 flat 的 subGraphs 列表 + 节点 ID 引用。
 */
export interface RecognizerYY extends FlowDBYY {
  /** 进入 subgraph 作用域（jison subgraphStart 归约时调用） */
  enterScope: () => void;
}

// ============================================================
// 常量
// ============================================================

const MERMAID_DOM_ID_PREFIX = 'flowchart-';

/** 默认最大边数（对齐官方 maxEdges 配置） */
const DEFAULT_MAX_EDGES = 500;

// ============================================================
// FlowDB 类
// ============================================================

/**
 * FlowDB — flowchart 解析数据收集器
 *
 * 实例方法被 jison parser 通过 `yy.methodName()` 调用
 * 所有 jison 调用的方法在构造函数中 bind，确保 this 指向正确
 */
export class FlowDB {
  private vertexCounter = 0;
  private vertices = new Map<string, FlowVertex>();
  private edges: FlowEdgeArray = [];
  private classes = new Map<string, FlowClass>();
  private subGraphs: FlowSubGraph[] = [];
  private subGraphLookup = new Map<string, FlowSubGraph>();
  private tooltips = new Map<string, string>();
  private subCount = 0;
  private firstGraphFlag = true;
  private direction: FlowchartDirection | undefined;
  private secCount = -1;
  private posCrossRef: number[] = [];
  private clickEvents: FlowClickEvent[] = [];
  private accTitleValue: string | undefined;
  private accDescriptionValue: string | undefined;
  private diagramTitleValue: string | undefined;
  private maxEdges = DEFAULT_MAX_EDGES;

  constructor() {
    // jison 只支持直接属性，因此所有 jison 调用的方法都在构造函数中 bind
    this.addVertex = this.addVertex.bind(this);
    this.firstGraph = this.firstGraph.bind(this);
    this.setDirection = this.setDirection.bind(this);
    this.addSubGraph = this.addSubGraph.bind(this);
    this.addLink = this.addLink.bind(this);
    this.setLink = this.setLink.bind(this);
    this.updateLink = this.updateLink.bind(this);
    this.addClass = this.addClass.bind(this);
    this.setClass = this.setClass.bind(this);
    this.destructLink = this.destructLink.bind(this);
    this.setClickEvent = this.setClickEvent.bind(this);
    this.setTooltip = this.setTooltip.bind(this);
    this.updateLinkInterpolate = this.updateLinkInterpolate.bind(this);
    this.setAccTitle = this.setAccTitle.bind(this);
    this.setAccDescription = this.setAccDescription.bind(this);
    this.setDiagramTitle = this.setDiagramTitle.bind(this);

    this.lex = {
      firstGraph: this.firstGraph.bind(this),
    };

    this.clear();
  }

  // ============================================================
  // 文本清理（简化版，不做 HTML 转义，由渲染层负责）
  // ============================================================

  private sanitizeText(txt: string): string {
    return txt;
  }

  private sanitizeNodeLabelType(labelType: string | undefined): FlowLabelType {
    switch (labelType) {
      case 'markdown':
      case 'string':
      case 'text':
        return labelType;
      default:
        return 'markdown';
    }
  }

  // ============================================================
  // 顶点（节点）相关
  // ============================================================

  /**
   * 添加顶点（jison 调用）
   *
   * @param id - 节点 ID
   * @param textObj - 文本对象（{ text, type }）
   * @param type - 形状类型（jison 语法层）
   * @param style - 内联样式列表（style 语句）
   * @param classes - 应用的 classDef id 列表
   * @param dir - 节点方向
   * @param props - 节点属性（`[|field:value|]` 语法）
   * @param metadata - shapeData YAML 字符串（`@{ shape: xxx, ... }`）
   */
  public addVertex(
    id: string,
    textObj: FlowText | undefined,
    type: FlowVertexTypeParam,
    style: string[] | undefined,
    classes: string[] | undefined,
    dir: string | undefined,
    props: Record<string, unknown> | undefined,
    metadata: unknown,
  ): void {
    if (!id || id.trim().length === 0) {
      return;
    }

    // 解析 shapeData YAML 元数据
    const doc = this.parseShapeData(metadata as string | undefined);

    // 检查是否为边（边也可以有 shapeData 元数据，如 animate/curve）
    const edge = this.edges.find((e) => e.id === id);
    if (edge) {
      if (doc?.animate !== undefined) {
        edge.animate = doc.animate;
      }
      if (doc?.animation !== undefined) {
        edge.animation = doc.animation;
      }
      if (doc?.curve !== undefined) {
        edge.interpolate = doc.curve;
      }
      return;
    }

    // 获取或创建顶点
    let vertex = this.vertices.get(id);
    if (vertex === undefined) {
      vertex = {
        id,
        labelType: 'text',
        domId: MERMAID_DOM_ID_PREFIX + id + '-' + this.vertexCounter,
        styles: [],
        classes: [],
      };
      this.vertices.set(id, vertex);
    }
    this.vertexCounter++;

    // 设置文本
    if (textObj !== undefined) {
      const txt = this.sanitizeText(textObj.text.trim());
      vertex.labelType = textObj.type;
      // 去除首尾引号
      if (txt.startsWith('"') && txt.endsWith('"')) {
        vertex.text = txt.substring(1, txt.length - 1);
      } else {
        vertex.text = txt;
      }
    } else if (vertex.text === undefined) {
      vertex.text = id;
    }

    // 设置形状类型
    if (type !== undefined) {
      vertex.type = type;
    }

    // 设置内联样式
    if (style !== undefined) {
      style.forEach((s) => {
        vertex!.styles.push(s);
      });
    }

    // 设置 classDef 应用
    if (classes !== undefined) {
      classes.forEach((s) => {
        vertex!.classes.push(s);
      });
    }

    // 设置方向
    if (dir !== undefined) {
      vertex.dir = dir;
    }

    // 设置属性
    if (vertex.props === undefined) {
      vertex.props = props;
    } else if (props !== undefined) {
      Object.assign(vertex.props, props);
    }

    // 应用 shapeData 元数据
    if (doc !== undefined) {
      this.applyNodeMetaData(vertex, doc);
    }
  }

  /** 解析 shapeData YAML 字符串（对齐官方 yaml.load + JSON_SCHEMA） */
  private parseShapeData(metadata: string | undefined): NodeMetaData | undefined {
    if (metadata === undefined || metadata === null) {
      return undefined;
    }

    // 对齐官方 flowDb.ts：单行包装为 JSON 对象格式，多行直接使用
    let yamlData: string;
    if (!metadata.includes('\n')) {
      yamlData = '{\n' + metadata + '\n}';
    } else {
      yamlData = metadata + '\n';
    }

    try {
      return yaml.load(yamlData, { schema: yaml.JSON_SCHEMA }) as NodeMetaData;
    } catch {
      return undefined;
    }
  }

  /** 应用 shapeData 元数据到顶点 */
  private applyNodeMetaData(vertex: FlowVertex, doc: NodeMetaData): void {
    if (doc.shape) {
      if (doc.shape !== doc.shape.toLowerCase() || doc.shape.includes('_')) {
        throw new Error(`No such shape: ${doc.shape}. Shape names should be lowercase.`);
      }
      vertex.type = doc.shape as FlowVertex['type'];
    }

    if (doc.label !== undefined) {
      vertex.text = doc.label;
      vertex.labelType = this.sanitizeNodeLabelType(doc.labelType);
    }

    if (doc.icon) {
      vertex.icon = doc.icon;
      if (!doc.label?.trim() && vertex.text === vertex.id) {
        vertex.text = '';
      }
    }

    if (doc.form) {
      vertex.form = doc.form;
    }

    if (doc.pos) {
      vertex.pos = doc.pos;
    }

    if (doc.img) {
      vertex.img = doc.img;
      if (!doc.label?.trim() && vertex.text === vertex.id) {
        vertex.text = '';
      }
    }

    if (doc.constraint) {
      vertex.constraint = doc.constraint;
    }

    if (doc.w !== undefined) {
      vertex.assetWidth = Number(doc.w);
    }

    if (doc.h !== undefined) {
      vertex.assetHeight = Number(doc.h);
    }
  }

  // ============================================================
  // 边（链接）相关
  // ============================================================

  /**
   * 添加单条边（内部方法）
   */
  private addSingleLink(
    start: string,
    end: string,
    type: { type?: string; stroke?: string; length?: number; text?: { text: string; type: string } },
    id?: string,
  ): void {
    const edge: FlowEdge = {
      start: start,
      end: end,
      type: undefined,
      text: '',
      labelType: 'text',
      classes: [],
      isUserDefinedId: false,
      interpolate: this.edges.defaultInterpolate,
    };

    const linkTextObj = type.text;
    if (linkTextObj !== undefined) {
      const txt = this.sanitizeText(linkTextObj.text.trim());
      if (txt.startsWith('"') && txt.endsWith('"')) {
        edge.text = txt.substring(1, txt.length - 1);
      } else {
        edge.text = txt;
      }
      edge.labelType = this.sanitizeNodeLabelType(linkTextObj.type);
    }

    if (type !== undefined) {
      edge.type = type.type;
      edge.stroke = type.stroke as FlowEdge['stroke'];
      edge.length = (type.length ?? 0) > 10 ? 10 : type.length;
    }

    if (id && !this.edges.some((e) => e.id === id)) {
      edge.id = id;
      edge.isUserDefinedId = true;
    } else {
      const existingLinks = this.edges.filter(
        (e) => e.start === edge.start && e.end === edge.end,
      );
      if (existingLinks.length === 0) {
        edge.id = this.getEdgeId(edge.start, edge.end, { counter: 0, prefix: 'L' });
      } else {
        edge.id = this.getEdgeId(edge.start, edge.end, {
          counter: existingLinks.length + 1,
          prefix: 'L',
        });
      }
    }

    if (this.edges.length < this.maxEdges) {
      this.edges.push(edge);
    } else {
      throw new Error(
        `Edge limit exceeded. ${this.edges.length} edges found, but the limit is ${this.maxEdges}.`,
      );
    }
  }

  /** 生成边 ID（对齐官方 getEdgeId） */
  private getEdgeId(
    start: string,
    end: string,
    options: { counter: number; prefix: string },
    userDefinedId?: string,
  ): string {
    if (userDefinedId) {
      return userDefinedId;
    }
    return `${options.prefix}${start}${end}${options.counter}`;
  }

  /** 判断 linkData 是否为 { id: string } */
  private isLinkData(value: unknown): value is LinkData {
    return (
      value !== null &&
      typeof value === 'object' &&
      'id' in value &&
      typeof (value as LinkData).id === 'string'
    );
  }

  /**
   * 添加边（jison 调用）
   * 支持多对多连接：A & B --> C & D 生成 4 条边
   *
   * @param _start - 起点节点 ID 列表
   * @param _end - 终点节点 ID 列表
   * @param linkData - 边数据（可能包含 id 字段，用于用户自定义边 ID）
   */
  public addLink(_start: string[], _end: string[], linkData: unknown): void {
    const id = this.isLinkData(linkData) ? linkData.id.replace('@', '') : undefined;

    // 对于 A e1@--> B & C 语法，只有第一条边使用用户定义的 ID
    for (const start of _start) {
      for (const end of _end) {
        const isLastStart = start === _start[_start.length - 1];
        const isFirstEnd = end === _end[0];
        if (isLastStart && isFirstEnd) {
          this.addSingleLink(
            start,
            end,
            linkData as {
              type?: string;
              stroke?: string;
              length?: number;
              text?: { text: string; type: string };
            },
            id,
          );
        } else {
          this.addSingleLink(
            start,
            end,
            linkData as {
              type?: string;
              stroke?: string;
              length?: number;
              text?: { text: string; type: string };
            },
            undefined,
          );
        }
      }
    }
  }

  /**
   * 更新边的插值算法（jison 调用）
   * @param positions - 位置列表（'default' 或边索引）
   * @param interpolate - 插值算法名称
   */
  public updateLinkInterpolate(positions: ('default' | number)[], interpolate: string): void {
    positions.forEach((pos) => {
      if (pos === 'default') {
        this.edges.defaultInterpolate = interpolate;
      } else {
        const edge = this.edges[pos];
        if (edge) {
          edge.interpolate = interpolate;
        }
      }
    });
  }

  /**
   * 更新边样式（jison 调用）
   * @param positions - 位置列表（'default' 或边索引）
   * @param style - 样式列表
   */
  public updateLink(positions: ('default' | number)[], style: string[]): void {
    positions.forEach((pos) => {
      if (typeof pos === 'number' && pos >= this.edges.length) {
        throw new Error(
          `The index ${pos} for linkStyle is out of bounds. Valid indices for linkStyle are between 0 and ${
            this.edges.length - 1
          }.`,
        );
      }
      if (pos === 'default') {
        this.edges.defaultStyle = style;
      } else {
        const edge = this.edges[pos];
        if (edge) {
          edge.style = style;
          // 如果 style 中没有 fill，添加 fill:none
          if (style.length > 0 && !style.some((s) => s?.startsWith('fill'))) {
            edge.style.push('fill:none');
          }
        }
      }
    });
  }

  // ============================================================
  // classDef 相关
  // ============================================================

  /**
   * 添加 classDef（jison 调用）
   * @param ids - classDef id（逗号分隔多个）
   * @param _style - 样式列表
   */
  public addClass(ids: string, _style: string[]): void {
    // 对齐官方：将 \, 转义为 §§§，, 转为 ;，再还原 §§§ 为 ,
    const style = _style
      .join()
      .replace(/\\,/g, '§§§')
      .replace(/,/g, ';')
      .replace(/§§§/g, ',')
      .split(';');

    ids.split(',').forEach((id) => {
      let classNode = this.classes.get(id);
      if (classNode === undefined) {
        classNode = { id, styles: [], textStyles: [] };
        this.classes.set(id, classNode);
      }

      if (style !== undefined) {
        style.forEach((s) => {
          if (/color/.exec(s)) {
            // color 相关样式同时加入 textStyles（fill 替换为 bgFill）
            const newStyle = s.replace('fill', 'bgFill');
            classNode!.textStyles.push(newStyle);
          }
          classNode!.styles.push(s);
        });
      }
    });
  }

  /**
   * 应用 classDef 到节点/边/subgraph（jison 调用）
   * @param ids - 节点/边/subgraph id（逗号分隔多个）
   * @param className - classDef id
   */
  public setClass(ids: string, className: string): void {
    for (const id of ids.split(',')) {
      const vertex = this.vertices.get(id);
      if (vertex) {
        vertex.classes.push(className);
      }
      const edge = this.edges.find((e) => e.id === id);
      if (edge) {
        edge.classes.push(className);
      }
      const subGraph = this.subGraphLookup.get(id);
      if (subGraph) {
        subGraph.classes.push(className);
      }
    }
  }

  // ============================================================
  // 方向相关
  // ============================================================

  /**
   * 设置图表方向（jison 调用）
   *
   * 边界校验：调用 normalizeDirection 在 jison→db 边界完成字符串→FlowchartDirection 校验
   * @param dir - 方向字符串（LR/RL/TB/BT/TD/</>^/v）
   */
  public setDirection(dir: string): void {
    this.direction = normalizeDirection(dir);
  }

  // ============================================================
  // 链接（href）相关
  // ============================================================

  /**
   * 设置链接（jison 调用）
   * @param ids - 节点 id（逗号分隔多个）
   * @param linkStr - URL
   * @param target - 链接 target
   */
  public setLink(ids: string, linkStr: string, target: string): void {
    ids.split(',').forEach((id) => {
      const vertex = this.vertices.get(id);
      if (vertex !== undefined) {
        vertex.link = linkStr;
        vertex.linkTarget = target;
      }
    });
    this.setClass(ids, 'clickable');
  }

  // ============================================================
  // tooltip 相关
  // ============================================================

  /**
   * 设置 tooltip（jison 调用）
   * @param ids - 节点 id（逗号分隔多个）
   * @param tooltip - tooltip 文本
   */
  public setTooltip(ids: string, tooltip: string): void {
    if (tooltip === undefined) {
      return;
    }
    const sanitized = this.sanitizeText(tooltip);
    for (const id of ids.split(',')) {
      this.tooltips.set(id, sanitized);
    }
  }

  // ============================================================
  // click 事件相关
  // ============================================================

  /**
   * 设置 click 事件（jison 调用）
   * @param ids - 节点 id（逗号分隔多个）
   * @param functionName - 回调函数名
   * @param functionArgs - 回调函数参数
   */
  public setClickEvent(ids: string, functionName: string, functionArgs: string): void {
    ids.split(',').forEach((id) => {
      const vertex = this.vertices.get(id);
      if (vertex) {
        vertex.haveCallback = true;
      }
      this.clickEvents.push({
        nodeId: id,
        functionName: functionName || undefined,
        functionArgs: functionArgs || undefined,
      });
    });
    this.setClass(ids, 'clickable');
  }

  // ============================================================
  // subgraph 相关
  // ============================================================

  /**
   * 添加 subgraph（jison 调用）
   * @param _id - 子图 ID（{ text: string } 或 undefined）
   * @param list - 子图包含的节点列表（可能包含 direction 语句）
   * @param _title - 子图标题（{ text: string, type: string } 或 undefined）
   * @returns 子图 ID
   */
  public addSubGraph(
    _id: { text: string } | undefined,
    list: unknown[],
    _title: { text: string; type: string } | undefined,
  ): string {
    let id: string | undefined = _id?.text.trim();
    let title = _title?.text;

    // 当 id 和 title 是同一对象且 title 含空格时，id 置空（对齐官方逻辑）
    if (_id === _title && _title && /\s/.exec(_title.text)) {
      id = undefined;
    }

    // 去重并提取 direction 语句
    const result = this.uniqSubgraphList(list);
    const nodeList = result.nodeList as string[];
    const rawDir = result.dir;
    const hasExplicitDir = rawDir !== undefined;
    const dir = rawDir ?? undefined;

    id = id ?? 'subGraph' + this.subCount;
    title = title || '';
    title = this.sanitizeText(title);
    this.subCount = this.subCount + 1;

    const subGraph: FlowSubGraph = {
      id: id,
      nodes: nodeList,
      title: title.trim(),
      classes: [],
      dir,
      hasExplicitDir,
      labelType: this.sanitizeNodeLabelType(_title?.type),
    };

    // 移除已属于其他 subgraph 的成员
    subGraph.nodes = this.makeUniq(subGraph, this.subGraphs).nodes;
    this.subGraphs.push(subGraph);
    this.subGraphLookup.set(id, subGraph);
    return id;
  }

  /** 去重并提取 direction 语句 */
  private uniqSubgraphList(list: unknown[]): { nodeList: unknown[]; dir: string | undefined } {
    const seen = new Set<string>();
    const objs: unknown[] = [];
    let dir: string | undefined;
    const prims: Record<string, Set<unknown>> = {
      boolean: new Set(),
      number: new Set(),
      string: new Set(),
    };

    const nodeList = list.flat().filter((item) => {
      const type = typeof item;
      // 提取 direction 语句
      if (item && typeof item === 'object' && 'stmt' in item && (item as { stmt: unknown }).stmt === 'dir') {
        dir = (item as unknown as { value: string }).value;
        return false;
      }
      if (typeof item === 'string' && item.trim() === '') {
        return false;
      }
      if (type in prims) {
        if (prims[type].has(item)) {
          return false;
        }
        prims[type].add(item);
        return true;
      } else {
        if (objs.includes(item)) {
          return false;
        }
        objs.push(item);
        return true;
      }
    });

    return { nodeList, dir };
  }

  /** 检查节点是否已存在于任何 subgraph */
  private exists(allSgs: FlowSubGraph[], _id: string): boolean {
    for (const sg of allSgs) {
      if (sg.nodes.includes(_id)) {
        return true;
      }
    }
    return false;
  }

  /** 从所有 subgraph 中删除已存在的 id */
  private makeUniq(sg: FlowSubGraph, allSubgraphs: FlowSubGraph[]): { nodes: string[] } {
    const res: string[] = [];
    sg.nodes.forEach((_id, pos) => {
      if (!this.exists(allSubgraphs, _id)) {
        const node = sg.nodes[pos];
        if (node) {
          res.push(node);
        }
      }
    });
    return { nodes: res };
  }

  // ============================================================
  // 边类型解析（destructLink）
  // ============================================================

  /**
   * 解析边起始端语法（jison 调用）
   * @param _str - 起始端字符串（如 "<--", "x--", "o--"）
   */
  private destructStartLink(_str: string): FlowLink {
    let str = _str.trim();
    let type = 'arrow_open';

    switch (str[0]) {
      case '<':
        type = 'arrow_point';
        str = str.slice(1);
        break;
      case 'x':
        type = 'arrow_cross';
        str = str.slice(1);
        break;
      case 'o':
        type = 'arrow_circle';
        str = str.slice(1);
        break;
    }

    let stroke = 'normal';
    if (str.includes('=')) {
      stroke = 'thick';
    }
    if (str.includes('.')) {
      stroke = 'dotted';
    }

    return { type, stroke };
  }

  /** 计算字符串中某字符的出现次数 */
  private countChar(char: string, str: string): number {
    let count = 0;
    for (let i = 0; i < str.length; ++i) {
      if (str[i] === char) {
        ++count;
      }
    }
    return count;
  }

  /**
   * 解析边终端语法（jison 调用）
   * @param _str - 终端字符串（如 "-->", "--x", "--o", "==>", "~~~"）
   */
  private destructEndLink(_str: string): FlowLink {
    const str = _str.trim();
    let line = str.slice(0, -1);
    let type = 'arrow_open';

    switch (str.slice(-1)) {
      case 'x':
        type = 'arrow_cross';
        if (str.startsWith('x')) {
          type = 'double_' + type;
          line = line.slice(1);
        }
        break;
      case '>':
        type = 'arrow_point';
        if (str.startsWith('<')) {
          type = 'double_' + type;
          line = line.slice(1);
        }
        break;
      case 'o':
        type = 'arrow_circle';
        if (str.startsWith('o')) {
          type = 'double_' + type;
          line = line.slice(1);
        }
        break;
    }

    let stroke = 'normal';
    let length = line.length - 1;

    if (line.startsWith('=')) {
      stroke = 'thick';
    }
    if (line.startsWith('~')) {
      stroke = 'invisible';
    }

    const dots = this.countChar('.', line);
    if (dots) {
      stroke = 'dotted';
      length = dots;
    }

    return { type, stroke, length };
  }

  /**
   * 解析边语法（jison 调用）
   * @param _str - 边字符串（如 "-->", "o--o", "==>"）
   * @param _startStr - 起始端字符串（可选，如 "<--"）
   */
  public destructLink(_str: string, _startStr?: string): FlowLink {
    const info = this.destructEndLink(_str);
    let startInfo: FlowLink;

    if (_startStr) {
      startInfo = this.destructStartLink(_startStr);

      if (startInfo.stroke !== info.stroke) {
        return { type: 'INVALID', stroke: 'INVALID' };
      }

      if (startInfo.type === 'arrow_open') {
        // -- xyz -->  - 取终端的箭头类型
        startInfo.type = info.type;
      } else {
        // x-- xyz -->  - 不支持
        if (startInfo.type !== info.type) {
          return { type: 'INVALID', stroke: 'INVALID' };
        }
        startInfo.type = 'double_' + startInfo.type;
      }

      if (startInfo.type === 'double_arrow') {
        startInfo.type = 'double_arrow_point';
      }

      startInfo.length = info.length;
      return startInfo;
    }

    return info;
  }

  // ============================================================
  // 索引和查询
  // ============================================================

  private getPosForId(id: string): number {
    for (const [i, subGraph] of this.subGraphs.entries()) {
      if (subGraph.id === id) {
        return i;
      }
    }
    return -1;
  }

  private indexNodes2(id: string, pos: number): { result: boolean; count: number } {
    const nodes = this.subGraphs[pos]?.nodes ?? [];
    this.secCount = this.secCount + 1;
    if (this.secCount > 2000) {
      return { result: false, count: 0 };
    }
    this.posCrossRef[this.secCount] = pos;

    if (this.subGraphs[pos]?.id === id) {
      return { result: true, count: 0 };
    }

    let count = 0;
    let posCount = 1;
    while (count < nodes.length) {
      const childPos = this.getPosForId(nodes[count] ?? '');
      if (childPos >= 0) {
        const res = this.indexNodes2(id, childPos);
        if (res.result) {
          return { result: true, count: posCount + res.count };
        } else {
          posCount = posCount + res.count;
        }
      }
      count = count + 1;
    }

    return { result: false, count: posCount };
  }

  public getDepthFirstPos(pos: number): number {
    return this.posCrossRef[pos] ?? -1;
  }

  public indexNodes(): void {
    this.secCount = -1;
    if (this.subGraphs.length > 0) {
      this.indexNodes2('none', this.subGraphs.length - 1);
    }
  }

  public getSubGraphs(): FlowSubGraph[] {
    return this.subGraphs;
  }

  /**
   * 首次调用返回 true（用于 jison 词法分析器判断是否为首个 graph 关键字）
   */
  public firstGraph(): boolean {
    if (this.firstGraphFlag) {
      this.firstGraphFlag = false;
      return true;
    }
    return false;
  }

  // ============================================================
  // accTitle / accDescription / diagramTitle
  // ============================================================

  public setAccTitle(title: string): void {
    this.accTitleValue = title;
  }

  public getAccTitle(): string | undefined {
    return this.accTitleValue;
  }

  public setAccDescription(desc: string): void {
    this.accDescriptionValue = desc;
  }

  public getAccDescription(): string | undefined {
    return this.accDescriptionValue;
  }

  public setDiagramTitle(title: string): void {
    this.diagramTitleValue = title;
  }

  public getDiagramTitle(): string | undefined {
    return this.diagramTitleValue;
  }

  // ============================================================
  // 清理和重置
  // ============================================================

  public clear(): void {
    this.vertices = new Map();
    this.classes = new Map();
    this.edges = [];
    this.subGraphs = [];
    this.subGraphLookup = new Map();
    this.subCount = 0;
    this.tooltips = new Map();
    this.clickEvents = [];
    this.firstGraphFlag = true;
    this.direction = undefined;
    this.accTitleValue = undefined;
    this.accDescriptionValue = undefined;
    this.diagramTitleValue = undefined;
    this.vertexCounter = 0;
    this.secCount = -1;
    this.posCrossRef = [];
  }

  // ============================================================
  // lex（jison 词法分析器调用）
  // ============================================================

  public lex: { firstGraph: () => boolean };

  // ============================================================
  // getData — 获取完整 AST
  // ============================================================

  /**
   * 获取解析后的完整数据
   * 返回 FlowchartAST 结构，由 flowchart-parser.ts 映射为 CanvasState
   */
  public getData(): FlowchartAST {
    return {
      direction: this.direction,
      vertices: Array.from(this.vertices.values()),
      edges: this.edges.map((e) => ({ ...e })),
      classes: Array.from(this.classes.values()),
      subGraphs: this.subGraphs.map((sg) => ({ ...sg, nodes: [...sg.nodes] })),
      clickEvents: [...this.clickEvents],
      tooltips: new Map(this.tooltips),
      accTitle: this.accTitleValue,
      accDescription: this.accDescriptionValue,
      title: this.diagramTitleValue,
      defaultInterpolate: this.edges.defaultInterpolate,
      defaultStyle: this.edges.defaultStyle,
    };
  }
}
