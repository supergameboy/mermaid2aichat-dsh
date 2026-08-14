/**
 * SequenceBounds — 官方 mermaid sequenceRenderer bounds 算法的 TypeScript 移植
 *
 * 单一职责：动态计算 sequence 图的包围盒和布局坐标
 *
 * 数据流（外部 calculateLayout 注入，B3.2 实现）:
 *   SequenceAST（外部）→ calculateLayout（外部）→ SequenceBounds.init()
 *     → 遍历 messages 调用 insert/newLoop/... → getBounds()
 *   注：本类不导入 SequenceAST 类型，仅消费由 calculateLayout 派生的数值/字符串/模型
 *
 * 与官方的差异（对齐 B1 决策2 设计原则）:
 *   - 移除 D3 依赖（bounds 仅计算坐标，不操作 DOM）
 *   - 移除 getConfig 依赖（使用 sequence-constants.ts 默认常量）
 *   - 适配 TypeScript 严格模式（禁止 any，禁止 ! 非空断言）
 *   - 移除 saveVerticalPos/resetVerticalPos（P1-2 修复：官方死代码，本类不实现）
 *
 * 来源：B3 设计文档 sequence-bounds.ts 接口签名 + B3-L2 子功能细化
 */
import type { SequenceLayoutConfig } from './sequence-constants.js';

/** bounds 全局边界框 */
export interface BoundsData {
  startx: number | undefined;
  stopx: number | undefined;
  starty: number | undefined;
  stopy: number | undefined;
}

/** 循环/块模型（对齐官方 sequenceRenderer.ts:170-181 createLoop 返回值） */
export interface LoopModel {
  startx: number | undefined;
  starty: number; // 初始化为 verticalPos
  stopx: number | undefined;
  stopy: number | undefined;
  /** 块标题（来自 createLoop title.message） */
  title: string | undefined;
  /** 是否自动换行（来自 createLoop title.wrap） */
  wrap: boolean;
  /** 块标题宽度（来自 createLoop title.width，由 text-measure 测量后填入） */
  width: number | undefined;
  /** 块高度（初始 0，renderLoop 时由 text-measure 派生） */
  height: number;
  /** 块填充色（rect 颜色，来自 createLoop fill 参数） */
  fill: string | undefined;
  /** 中间分支 sections（addSectionToLoop 推入，对齐官方 sequenceRenderer.ts:194-200） */
  sections: Array<{ y: number; height: number }>;
  /** 中间分支标题列表（addSectionToLoop 推入，与 sections 一一对应） */
  sectionTitles: string[];
}

/** 激活模型 */
export interface ActivationModel {
  startx: number;
  starty: number;
  stopx: number;
  stopy: number;
  actor: string;
}

/** 消息模型（对齐官方 msgModel 完整字段，sequenceRenderer.ts:1318-1324 + 2006-2022） */
export interface MessageModel {
  /** 消息线起点 x（含激活宽度调整后） */
  startx: number;
  /** 消息线终点 x（含激活宽度调整后） */
  stopx: number;
  /** 消息线起点 y */
  starty: number;
  /** 消息线终点 y */
  stopy: number;
  /** 消息文本（含 wrap 处理后的文本） */
  message: string;
  /** 信号类型（LINETYPE，对应 SequenceArrowType） */
  type: number;
  /** 是否换行 */
  wrap: boolean;
  /** 消息宽度（由 calculateTextDimensions 派生） */
  width: number;
  /** 消息高度（初始 0，boundMessage 时由 lineHeight 累加，sequenceRenderer.ts:445） */
  height: number;
  /** source actor 边界 x（Math.min(fromLeft, fromRight)，用于 bounds.insert，sequenceRenderer.ts:2020） */
  fromBounds: number;
  /** target actor 边界 x（Math.max(toLeft, toRight)，用于 bounds.insert，sequenceRenderer.ts:2021） */
  toBounds: number;
  /** source actor id（newActivation/endActivation 用，sequenceRenderer.ts:149/167） */
  from: string;
  /** target actor id */
  to: string;
  /** 消息序号（autonumber 启用时使用） */
  sequenceIndex: number;
  /** 是否显示消息序号 */
  sequenceVisible: boolean;
  /** 消息 id（对应 edge.id） */
  id: string;
  // P0-2/P0-3 修复：移除 centralConnection 字段
  // central-connection 三种类型通过 type（即 signalType，对应 SequenceArrowType）表达，
  // 渲染层（MessageRow）通过 messageType 派生 CentralConnectionRender.type，不引入独立字段
}

/** Note 模型 */
export interface NoteModel {
  startx: number;
  starty: number;
  startx2: number;
  stopx: number;
  stopy: number;
  message: string;
  placement: number;
  actor: string;
}

/** 参与者模型（bounds 计算用） */
export interface ActorModel {
  startx: number;
  starty: number;
  stopx: number;
  stopy: number;
  width: number;
  height: number;
  actor: string;
  description: string;
  box: string | null;
}

/** Box 模型（bounds 计算用） */
export interface BoxModel {
  startx: number;
  starty: number;
  stopx: number;
  stopy: number;
  fill: string;
  color: string;
  name: string;
  actorKeys: string[];
}

/** bounds 模型注册表 */
export interface BoundsModels {
  actors: ActorModel[];
  loops: LoopModel[];
  messages: MessageModel[];
  notes: NoteModel[];
  boxes: BoxModel[];
  /**
   * 激活持久记录（B3.1 遗漏修复，v9 发现）
   *
   * 与 SequenceBounds.activations 私有栈的区别：
   *   - 私有栈 this.activations：endActivation 时 splice 弹出，仅用于激活嵌套管理
   *   - models.activations（本字段）：持久记录所有激活，渲染层访问的数据源
   *
   * 对齐 newLoop/endLoop 模式（endLoop pop 栈，models.loops 仍保留）
   * ActivationBar 渲染时从 layout.models.activations 取（单一数据源）
   */
  activations: ActivationModel[];
  addActor(model: ActorModel): void;
  addLoop(model: LoopModel): void;
  addMessage(model: MessageModel): void;
  addNote(model: NoteModel): void;
  addBox(model: BoxModel): void;
  addActivation(model: ActivationModel): void;
  lastActor(): ActorModel | undefined;
  lastLoop(): LoopModel | undefined;
  lastMessage(): MessageModel | undefined;
  lastNote(): NoteModel | undefined;
  lastActivation(): ActivationModel | undefined;
  getHeight(): number;
  clear(): void;
}

/** 创建 bounds 模型注册表（工厂函数，避免 this 绑定问题） */
function createBoundsModels(bounds: SequenceBounds): BoundsModels {
  const models: Omit<BoundsModels, 'getHeight'> = {
    actors: [],
    loops: [],
    messages: [],
    notes: [],
    boxes: [],
    activations: [],
    addActor(model: ActorModel) {
      this.actors.push(model);
    },
    addLoop(model: LoopModel) {
      this.loops.push(model);
    },
    addMessage(model: MessageModel) {
      this.messages.push(model);
    },
    addNote(model: NoteModel) {
      this.notes.push(model);
    },
    addBox(model: BoxModel) {
      this.boxes.push(model);
    },
    addActivation(model: ActivationModel) {
      this.activations.push(model);
    },
    lastActor(): ActorModel | undefined {
      return this.actors[this.actors.length - 1];
    },
    lastLoop(): LoopModel | undefined {
      return this.loops[this.loops.length - 1];
    },
    lastMessage(): MessageModel | undefined {
      return this.messages[this.messages.length - 1];
    },
    lastNote(): NoteModel | undefined {
      return this.notes[this.notes.length - 1];
    },
    lastActivation(): ActivationModel | undefined {
      return this.activations[this.activations.length - 1];
    },
    clear() {
      this.actors = [];
      this.loops = [];
      this.messages = [];
      this.notes = [];
      this.boxes = [];
      this.activations = [];
    },
  };
  return {
    ...models,
    getHeight() {
      return bounds.getBounds().bounds.stopy ?? 0;
    },
  };
}

/**
 * SequenceBounds — 官方 mermaid sequenceRenderer bounds 算法的 TypeScript 移植
 *
 * 用法：
 * ```typescript
 * const bounds = new SequenceBounds(SEQUENCE_LAYOUT_CONFIG);
 * bounds.init();
 * // 横向布局 actors
 * bounds.newLoop({ message: 'Loop', wrap: false });
 * bounds.insert(100, 50, 200, 100);
 * bounds.bumpVerticalPos(20);
 * bounds.endLoop();
 * const { bounds: data, models } = bounds.getBounds();
 * ```
 */
export class SequenceBounds {
  private config: SequenceLayoutConfig;
  private data: BoundsData;
  private verticalPos: number;
  private sequenceItems: LoopModel[]; // 嵌套循环栈
  private activations: ActivationModel[]; // 激活栈
  private models: BoundsModels;

  constructor(config: SequenceLayoutConfig) {
    this.config = config;
    this.data = { startx: undefined, stopx: undefined, starty: undefined, stopy: undefined };
    this.verticalPos = 0;
    this.sequenceItems = [];
    this.activations = [];
    this.models = createBoundsModels(this);
  }

  /** 重置所有状态 */
  init(): void {
    this.data = { startx: undefined, stopx: undefined, starty: undefined, stopy: undefined };
    this.verticalPos = 0;
    this.sequenceItems = [];
    this.activations = [];
    this.models.clear();
  }

  /**
   * 值合并原语：undefined 直接赋值，否则 fun(val, old)
   *
   * 类型设计：fun 接受 NonNullable<T[K]>，使 Math.min/Math.max 等标准库函数可直接传入
   * （标准库函数类型 (...values: number[]) => number 不接受 undefined）
   */
  updateVal<T, K extends keyof T>(
    obj: T,
    key: K,
    val: T[K],
    fun: (a: NonNullable<T[K]>, b: NonNullable<T[K]>) => NonNullable<T[K]>,
  ): void {
    const old = obj[key];
    if (old === undefined) {
      obj[key] = val;
    } else {
      obj[key] = fun(val as NonNullable<T[K]>, old as NonNullable<T[K]>) as T[K];
    }
  }

  /**
   * 级联更新所有 sequenceItems（嵌套缩进 n*boxMargin）
   *
   * 对齐官方 sequenceRenderer.ts updateBounds：
   *   遍历 sequenceItems 栈，cnt 从 0 递增（栈底到栈顶）
   *   每个 item 按栈深度 level = cnt 进行缩进：
   *     - startx/starty 减去 level*boxMargin（向内缩进）
   *     - stopx/stopy 加上 level*boxMargin（向外扩展）
   */
  updateBounds(startx: number, starty: number, stopx: number, stopy: number): void {
    const boxMargin = this.config.boxMargin;
    let cnt = 0;
    for (const item of this.sequenceItems) {
      const level = cnt;
      cnt += 1;
      this.updateVal(item, 'startx', startx - level * boxMargin, Math.min);
      this.updateVal(item, 'stopx', stopx + level * boxMargin, Math.max);
      this.updateVal(item, 'starty', starty - level * boxMargin, Math.min);
      this.updateVal(item, 'stopy', stopy + level * boxMargin, Math.max);
    }
  }

  /** 规范化坐标 + 更新 data + 调用 updateBounds */
  insert(startx: number, starty: number, stopx: number, stopy: number): void {
    // 规范化坐标（对齐官方 insert 实现：使用 Math.min/max）
    const _startx = Math.min(startx, stopx);
    const _stopx = Math.max(startx, stopx);
    const _starty = Math.min(starty, stopy);
    const _stopy = Math.max(starty, stopy);

    // 更新 data
    this.updateVal(this.data, 'startx', _startx, Math.min);
    this.updateVal(this.data, 'stopx', _stopx, Math.max);
    this.updateVal(this.data, 'starty', _starty, Math.min);
    this.updateVal(this.data, 'stopy', _stopy, Math.max);

    // 级联更新所有 sequenceItems
    this.updateBounds(_startx, _starty, _stopx, _stopy);
  }

  /**
   * 创建激活（对齐官方 sequenceRenderer.ts:148-159 newActivation）
   *
   * P1-3 修复：参数补全 actors Map（用于查询 actorRect.x/width 计算 activation x 坐标）
   * 本项目移除 D3 依赖，不需要官方的 diagram 参数
   * message.from 用于查找 actorRect；
   * activation.x = actorRect.x + actorRect.width/2 + (stackedSize-1)*activationWidth/2
   * stackedSize = 当前 actor 已激活层数 + 1（支持同一 actor 多次嵌套激活）
   */
  newActivation(message: MessageModel, actors: Map<string, ActorModel>): void {
    const actor = actors.get(message.from);
    if (!actor) {
      throw new Error(`SequenceBounds.newActivation: actor "${message.from}" not found`);
    }

    // 计算当前 actor 的堆叠层数（已有多少个激活）
    const stackedSize = this.activations.filter((a) => a.actor === message.from).length + 1;

    const activationWidth = this.config.activationWidth;
    // 对齐官方 sequenceRenderer.ts:153 activation.x 计算
    const x = actor.startx + actor.width / 2 + ((stackedSize - 1) * activationWidth) / 2;

    const activation: ActivationModel = {
      startx: x - activationWidth / 2,
      // 使用调用方传入的 message.starty（对齐官方 mermaid 渲染语义）
      // 官方 sequenceRenderer.ts:154 newActivation 用 starty = verticalPos + 2，
      //   verticalPos 是 boundMessage 推进后的值（推进约 42 像素），实际偏移仅 2 像素
      // 本项目 drawMessage 推进 55 像素（messageMargin 35 + messageHeight 20），
      //   若用 verticalPos + 1 偏移达 21 像素（与用户报告的偏上 bug 一致）
      // 修复：sequence-layout.ts processMessages 传入 lastMessage.starty + 1，
      //   绕过 verticalPos 推进量差异，对齐消息线 starty（接近官方 +2 像素效果）
      starty: message.starty,
      stopx: x + activationWidth / 2,
      stopy: 0, // 占位，endActivation 时填入实际 verticalPos
      actor: message.from,
    };
    // B3.1 遗漏修复（v9）：同步 push 到私有栈（激活嵌套管理）和 models.activations（持久记录，渲染层数据源）
    // 对齐 newLoop/endLoop 模式：endActivation 仅 splice 私有栈，models.activations 仍保留
    this.activations.push(activation);
    this.models.addActivation(activation);
  }

  /**
   * 弹出最近匹配 from 的 activation（对齐官方 sequenceRenderer.ts:161-168 endActivation + 1120-1130 activeEnd）
   *
   * P1-3 修复：message.from 用于查找最后一个匹配的 activation（lastIndexOf 语义）
   *
   * stopy 计算对齐官方 mermaid 渲染语义：
   *   官方 activeEnd(msg, verticalPos) 中 verticalPos = boundMessage 推进后的 verticalPos
   *   官方 boundMessage 推进后 verticalPos = lineStartY（停用消息的消息线 y 坐标）
   *   官方 drawActivation 用 rect.height = verticalPos - starty（stopy = 消息线 y）
   *   本项目 drawMessage 推进 55 像素（messageMargin 35 + messageHeight 20），
   *     this.verticalPos = msg.stopy = msg.starty + 20（消息底部），比官方高 20 像素
   *   修复：调用方传入 stopy = msg.starty（停用消息的消息线 y），绕过推进量差异
   *
   * P2-NEW-2 修复（B3.2 边界场景审查）：找不到匹配时抛错（对齐 addSectionToLoop 策略）
   *   原设计返回 undefined（对齐官方 mermaid 静默返回），违反 institution.md 第1.7条"程序错误不可包容"
   *   当前 B2 输入下不会触发（B2 mapper 不重建 ACTIVE_END），B4.1 后可能触发
   *   返回类型从 ActivationModel | undefined 改为 ActivationModel
   */
  endActivation(message: Pick<MessageModel, 'from' | 'stopy'>): ActivationModel {
    // 从栈顶向下查找最后一个 actor === message.from 的 activation
    let lastMatchIndex = -1;
    for (let i = this.activations.length - 1; i >= 0; i--) {
      if (this.activations[i].actor === message.from) {
        lastMatchIndex = i;
        break;
      }
    }

    if (lastMatchIndex === -1) {
      throw new Error(
        `SequenceBounds.endActivation: no matching activation for actor "${message.from}" (call newActivation before endActivation)`,
      );
    }

    const [activation] = this.activations.splice(lastMatchIndex, 1);
    // 使用调用方传入的 message.stopy（对齐官方 activeEnd(verticalPos=lineStartY) 语义）
    activation.stopy = message.stopy;
    return activation;
  }

  /**
   * 创建 loop model（对齐官方 sequenceRenderer.ts:170 createLoop 签名）
   *
   * title 参数对齐官方 createLoop(title = { message, wrap, width }, fill) 签名：
   *   - wrap 必填（boolean）
   *   - message/width 可选（由 text-measure 派生）
   *   - starty = verticalPos（创建时的当前垂直位置）
   */
  createLoop(
    title?: { message?: string; wrap: boolean; width?: number },
    fill?: string,
  ): LoopModel {
    return {
      startx: undefined,
      starty: this.verticalPos,
      stopx: undefined,
      stopy: undefined,
      title: title?.message,
      wrap: title?.wrap ?? false,
      width: title?.width,
      height: 0,
      fill: fill,
      sections: [],
      sectionTitles: [],
    };
  }

  /**
   * push loop 到 sequenceItems 栈 + 持久记录到 models.loops
   *
   * 注意：sequenceItems 是栈（endLoop 时 pop），models.loops 是持久记录
   */
  newLoop(
    title?: { message?: string; wrap: boolean; width?: number },
    fill?: string,
  ): void {
    const loop = this.createLoop(title, fill);
    this.sequenceItems.push(loop);
    this.models.addLoop(loop);
  }

  /** pop sequenceItems 栈顶（不影响 models.loops 持久记录） */
  endLoop(): LoopModel | undefined {
    return this.sequenceItems.pop();
  }

  /**
   * 给栈顶 loop 增加 section（对齐官方 sequenceRenderer.ts:194-200）
   *
   * P2-3 澄清：参数 message 是 msg 对象（含 message 字段），与官方一致
   * （官方调用端 `(message) => bounds.addSectionToLoop(message)` 传入 msg 对象，非字符串）
   * 内部实现推入 message.message 字符串到 sectionTitles（对齐 LoopModel.sectionTitles: string[] 类型）
   *
   * P2-1 修复（B3.1 循环验证）：无栈顶 loop 时抛错（对齐 newActivation 策略）
   * 原实现静默 return 违反"程序错误不可包容"原则（code-standards.md 第5章）
   * 无栈顶 loop 属于调用顺序错误（程序错误），调用方（calculateLayout）保证正确顺序
   */
  addSectionToLoop(message: { message?: string }): void {
    const loop = this.sequenceItems[this.sequenceItems.length - 1];
    if (!loop) {
      throw new Error('SequenceBounds.addSectionToLoop: no loop in stack (call newLoop before addSectionToLoop)');
    }
    loop.sections.push({ y: this.verticalPos, height: 0 });
    loop.sectionTitles.push(message.message ?? '');
  }

  /** 垂直推进，更新 data.stopy */
  bumpVerticalPos(bump: number): void {
    this.verticalPos += bump;
    this.updateVal(this.data, 'stopy', this.verticalPos, Math.max);
  }

  /** 获取当前垂直位置 */
  getVerticalPos(): number {
    return this.verticalPos;
  }

  /** 获取 bounds 和 models */
  getBounds(): { bounds: BoundsData; models: BoundsModels } {
    return { bounds: this.data, models: this.models };
  }
}
