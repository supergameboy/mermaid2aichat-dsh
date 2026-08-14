import { defineTool } from "@deepseek-ai/dsh-tools";
import * as yaml from "js-yaml";
//#region src/serializer/types.ts
/**
* FlowchartDirection 类型守卫
*
* 用于外部数据（JSON.parse / localStorage / WebSocket 消息）→ typed structure 边界校验
* （code-standards 第5章：边界校验在入口处完成）
*
* 注意：jison parser 输出的方向字符串可能包含符号（<,^,>,v）和 'TD' 同义词，
* 需使用 parser/direction-utils.ts 的 normalizeDirection 完成归一化；
* 本类型守卫仅做字面量匹配，不做归一化。
*/
function isFlowchartDirection(dir) {
	return dir === "TB" || dir === "TD" || dir === "BT" || dir === "RL" || dir === "LR";
}
const GRAPH_DIAGRAM_TYPES = /* @__PURE__ */ new Set([
	"flowchart",
	"classDiagram",
	"erDiagram",
	"mindmap",
	"stateDiagram",
	"architecture"
]);
/** 判断图表类型是否为图结构类型 */
function isGraphDiagramType(type) {
	return GRAPH_DIAGRAM_TYPES.has(type);
}
/** 判断画布状态是否为图结构类型 */
function isGraphCanvasState(state) {
	return isGraphDiagramType(state.diagramType);
}
//#endregion
//#region src/serializer/parser/direction-utils.ts
/**
* 将 jison 产出的方向字符串归一化为 FlowchartDirection
*
* @param dir - jison 产出的原始方向字符串（可能为 undefined / 空字符串 / 符号 / 'TD' 同义词）
* @returns 归一化后的 FlowchartDirection，无效方向返回 undefined
*/
function normalizeDirection(dir) {
	if (!dir) return void 0;
	const trimmed = dir.trim();
	if (!trimmed) return void 0;
	if (/.*</.test(trimmed)) return "RL";
	if (/.*\^/.test(trimmed)) return "BT";
	if (/.*>/.test(trimmed)) return "LR";
	if (/.*v/.test(trimmed)) return "TB";
	if (trimmed === "TD") return "TB";
	if (isFlowchartDirection(trimmed)) return trimmed;
}
//#endregion
//#region src/serializer/parser/sequence/constants.ts
/**
* Sequence 常量定义
*
* 单一职责：定义 LINETYPE / ARROWTYPE / PLACEMENT / PARTICIPANT_TYPE 常量
* 这些常量值必须与 jison 语法中引用的 yy.LINETYPE / yy.ARROWTYPE / yy.PLACEMENT 完全一致
*/
/** 信号类型（消息/注释/块结构的类型标识） */
const LINETYPE = {
	SOLID: 0,
	DOTTED: 1,
	NOTE: 2,
	SOLID_CROSS: 3,
	DOTTED_CROSS: 4,
	SOLID_OPEN: 5,
	DOTTED_OPEN: 6,
	LOOP_START: 10,
	LOOP_END: 11,
	ALT_START: 12,
	ALT_ELSE: 13,
	ALT_END: 14,
	OPT_START: 15,
	OPT_END: 16,
	ACTIVE_START: 17,
	ACTIVE_END: 18,
	PAR_START: 19,
	PAR_AND: 20,
	PAR_END: 21,
	RECT_START: 22,
	RECT_END: 23,
	SOLID_POINT: 24,
	DOTTED_POINT: 25,
	AUTONUMBER: 26,
	CRITICAL_START: 27,
	CRITICAL_OPTION: 28,
	CRITICAL_END: 29,
	BREAK_START: 30,
	BREAK_END: 31,
	PAR_OVER_START: 32,
	BIDIRECTIONAL_SOLID: 33,
	BIDIRECTIONAL_DOTTED: 34,
	SOLID_TOP: 41,
	SOLID_BOTTOM: 42,
	STICK_TOP: 43,
	STICK_BOTTOM: 44,
	SOLID_ARROW_TOP_REVERSE: 45,
	SOLID_ARROW_BOTTOM_REVERSE: 46,
	STICK_ARROW_TOP_REVERSE: 47,
	STICK_ARROW_BOTTOM_REVERSE: 48,
	SOLID_TOP_DOTTED: 51,
	SOLID_BOTTOM_DOTTED: 52,
	STICK_TOP_DOTTED: 53,
	STICK_BOTTOM_DOTTED: 54,
	SOLID_ARROW_TOP_REVERSE_DOTTED: 55,
	SOLID_ARROW_BOTTOM_REVERSE_DOTTED: 56,
	STICK_ARROW_TOP_REVERSE_DOTTED: 57,
	STICK_ARROW_BOTTOM_REVERSE_DOTTED: 58,
	CENTRAL_CONNECTION: 59,
	CENTRAL_CONNECTION_REVERSE: 60,
	CENTRAL_CONNECTION_DUAL: 61
};
/** 箭头头类型 */
const ARROWTYPE = {
	FILLED: 0,
	OPEN: 1
};
/** Note 放置位置 */
const PLACEMENT = {
	LEFTOF: 0,
	RIGHTOF: 1,
	OVER: 2
};
/** 参与者类型 */
const PARTICIPANT_TYPE = {
	ACTOR: "actor",
	BOUNDARY: "boundary",
	COLLECTIONS: "collections",
	CONTROL: "control",
	DATABASE: "database",
	ENTITY: "entity",
	PARTICIPANT: "participant",
	QUEUE: "queue"
};
/** LINETYPE → SequenceArrowType 映射 */
const LINETYPE_TO_ARROW_TYPE = {
	[LINETYPE.SOLID]: "solid-arrow",
	[LINETYPE.DOTTED]: "dotted-arrow",
	[LINETYPE.SOLID_OPEN]: "solid-open",
	[LINETYPE.DOTTED_OPEN]: "dotted-open",
	[LINETYPE.SOLID_CROSS]: "solid-cross",
	[LINETYPE.DOTTED_CROSS]: "dotted-cross",
	[LINETYPE.SOLID_POINT]: "solid-point",
	[LINETYPE.DOTTED_POINT]: "dotted-point",
	[LINETYPE.BIDIRECTIONAL_SOLID]: "bidirectional-solid",
	[LINETYPE.BIDIRECTIONAL_DOTTED]: "bidirectional-dotted",
	[LINETYPE.SOLID_TOP]: "solid-top",
	[LINETYPE.SOLID_BOTTOM]: "solid-bottom",
	[LINETYPE.STICK_TOP]: "stick-top",
	[LINETYPE.STICK_BOTTOM]: "stick-bottom",
	[LINETYPE.SOLID_TOP_DOTTED]: "solid-top-dotted",
	[LINETYPE.SOLID_BOTTOM_DOTTED]: "solid-bottom-dotted",
	[LINETYPE.STICK_TOP_DOTTED]: "stick-top-dotted",
	[LINETYPE.STICK_BOTTOM_DOTTED]: "stick-bottom-dotted",
	[LINETYPE.SOLID_ARROW_TOP_REVERSE]: "solid-arrow-top-reverse",
	[LINETYPE.SOLID_ARROW_BOTTOM_REVERSE]: "solid-arrow-bottom-reverse",
	[LINETYPE.STICK_ARROW_TOP_REVERSE]: "stick-arrow-top-reverse",
	[LINETYPE.STICK_ARROW_BOTTOM_REVERSE]: "stick-arrow-bottom-reverse",
	[LINETYPE.SOLID_ARROW_TOP_REVERSE_DOTTED]: "solid-arrow-top-reverse-dotted",
	[LINETYPE.SOLID_ARROW_BOTTOM_REVERSE_DOTTED]: "solid-arrow-bottom-reverse-dotted",
	[LINETYPE.STICK_ARROW_TOP_REVERSE_DOTTED]: "stick-arrow-top-reverse-dotted",
	[LINETYPE.STICK_ARROW_BOTTOM_REVERSE_DOTTED]: "stick-arrow-bottom-reverse-dotted",
	[LINETYPE.CENTRAL_CONNECTION]: "central-connection",
	[LINETYPE.CENTRAL_CONNECTION_REVERSE]: "central-connection-reverse",
	[LINETYPE.CENTRAL_CONNECTION_DUAL]: "central-connection-dual"
};
/**
* LINETYPE → SequenceBlockType 映射
*
* B4.1 P3-8 修复：PAR_OVER_START 映射从 'par' 修正为 'par-over'
*   - 对齐 SequenceBlockType 联合类型中的 'par-over' 字面量
*   - 消除映射不一致（原代码错误映射为 'par'）
*   - 影响：mapAstToCanvasState 将 PAR_OVER_START 信号正确映射为 'par-over' 块类型
*/
const LINETYPE_TO_BLOCK_TYPE = {
	[LINETYPE.LOOP_START]: "loop",
	[LINETYPE.LOOP_END]: "loop",
	[LINETYPE.ALT_START]: "alt",
	[LINETYPE.ALT_ELSE]: "alt",
	[LINETYPE.ALT_END]: "alt",
	[LINETYPE.OPT_START]: "opt",
	[LINETYPE.OPT_END]: "opt",
	[LINETYPE.PAR_START]: "par",
	[LINETYPE.PAR_AND]: "par",
	[LINETYPE.PAR_END]: "par",
	[LINETYPE.PAR_OVER_START]: "par-over",
	[LINETYPE.RECT_START]: "rect",
	[LINETYPE.RECT_END]: "rect",
	[LINETYPE.CRITICAL_START]: "critical",
	[LINETYPE.CRITICAL_OPTION]: "critical",
	[LINETYPE.CRITICAL_END]: "critical",
	[LINETYPE.BREAK_START]: "break",
	[LINETYPE.BREAK_END]: "break"
};
//#endregion
//#region src/serializer/parser/sequence/sequence-db.ts
/**
* SequenceDB — 官方 mermaid `sequenceDb.ts` 的纯 TypeScript 移植
*
* 单一职责：jison parser 调用此类的实例方法收集 AST 数据
*
* 与官方的差异:
*   - 移除 getConfig 依赖（使用默认配置）
*   - 移除 document/Option/window.CSS 依赖（parseBoxData 颜色校验改为纯函数正则）
*   - 移除 sanitizeText 依赖（HTML 转义由渲染层负责）
*   - 移除 commonClear/setAccTitle 等 commonDb 依赖（在本地实现）
*   - 移除 ImperativeState 依赖（使用直接字段）
*   - 移除 log 依赖（解析层不输出日志）
*   - 移除 addDetails（依赖 document.getElementById，不在解析层支持）
*   - 适配 TypeScript 严格模式（禁止 any，禁止 ! 非空断言）
*   - 保留 addActor/addMessage/addSignal/addNote/addLinks/addALink/addProperties/addBox/apply 逻辑
*
* 数据流:
*   jison parser → SequenceDB.apply(param) → 分发到 addActor/addMessage/... → SequenceDB.getData() → SequenceAST
*
* 注意:
*   - jison 只支持直接属性，因此所有 jison 调用的方法都在构造函数中 bind
*   - LINETYPE/ARROWTYPE/PLACEMENT 作为实例属性挂载，供 jison 语法动作引用
*/
/** 颜色正则（rgb/rgba/hsl/hsla 或 CSS 颜色名） */
const COLOR_REGEX = /^(rgba?|hsla?)\s*\(.*\)$/i;
/** 常用 CSS 颜色名 */
const CSS_COLOR_NAMES = /* @__PURE__ */ new Set([
	"transparent",
	"black",
	"white",
	"red",
	"green",
	"blue",
	"yellow",
	"cyan",
	"magenta",
	"gray",
	"grey",
	"orange",
	"purple",
	"pink",
	"brown",
	"navy",
	"teal",
	"olive",
	"maroon",
	"aqua",
	"fuchsia",
	"lime",
	"silver"
]);
/**
* SequenceDB — sequence 解析数据收集器
*
* 实例方法被 jison parser 通过 `yy.methodName()` 调用
* 所有 jison 调用的方法在构造函数中 bind，确保 this 指向正确
*/
var SequenceDB = class {
	constructor() {
		this.state = createInitialState();
		this.LINETYPE = LINETYPE;
		this.ARROWTYPE = ARROWTYPE;
		this.PLACEMENT = PLACEMENT;
		this.apply = this.apply.bind(this);
		this.parseBoxData = this.parseBoxData.bind(this);
		this.parseMessage = this.parseMessage.bind(this);
		this.addActor = this.addActor.bind(this);
		this.addMessage = this.addMessage.bind(this);
		this.addSignal = this.addSignal.bind(this);
		this.addNote = this.addNote.bind(this);
		this.addLinks = this.addLinks.bind(this);
		this.addALink = this.addALink.bind(this);
		this.addProperties = this.addProperties.bind(this);
		this.addBox = this.addBox.bind(this);
		this.enableSequenceNumbers = this.enableSequenceNumbers.bind(this);
		this.disableSequenceNumbers = this.disableSequenceNumbers.bind(this);
		this.setWrap = this.setWrap.bind(this);
		this.setAccTitle = this.setAccTitle.bind(this);
		this.setAccDescription = this.setAccDescription.bind(this);
		this.setDiagramTitle = this.setDiagramTitle.bind(this);
		this.clear();
	}
	/** 重置状态 */
	clear() {
		this.state = createInitialState();
	}
	/** 创建初始状态 */
	static createInitialState() {
		return createInitialState();
	}
	/** 添加 box（jison 调用） */
	addBox(data) {
		const box = {
			name: data.text,
			wrap: data.wrap ?? this.autoWrap(),
			fill: data.color,
			actorKeys: []
		};
		this.state.boxes.push(box);
		this.state.currentBox = box;
	}
	/** box 结束（jison 通过 apply('boxEnd') 调用） */
	boxEnd() {
		this.state.currentBox = void 0;
	}
	/** 添加参与者（jison 调用） */
	addActor(id, name, description, type, metadata) {
		let assignedBox = this.state.currentBox;
		let doc;
		if (metadata !== void 0 && typeof metadata === "string") doc = this.parseParticipantMetadata(metadata);
		const effectiveType = doc?.type ?? type;
		if (doc?.alias && (!description || description.text === name)) description = {
			text: doc.alias,
			wrap: description?.wrap ?? void 0,
			type: effectiveType
		};
		const isExplicit = type !== void 0;
		const old = this.state.actors.get(id);
		if (old) {
			if (this.state.currentBox && old.box && this.state.currentBox !== old.box) throw new Error(`A same participant should only be defined in one Box: ${old.name} can't be in '${old.box.name}' and in '${this.state.currentBox.name}' at the same time.`);
			assignedBox = old.box ? old.box : this.state.currentBox;
			old.box = assignedBox;
			old.explicitlyDeclared = old.explicitlyDeclared === true || isExplicit;
			if (old && name === old.name && description == null) return;
		}
		if (description?.text == null) description = {
			text: name,
			type: effectiveType
		};
		if (effectiveType == null || description.text == null) description = {
			text: name,
			type: effectiveType
		};
		const metadataLinks = doc?.links;
		const metadataProperties = doc?.properties;
		const preservedLinks = old?.links ?? {};
		const preservedProperties = old?.properties ?? {};
		const actor = {
			box: assignedBox,
			name,
			description: description.text,
			wrap: description.wrap ?? this.autoWrap(),
			prevActor: this.state.prevActor,
			links: metadataLinks ?? preservedLinks,
			properties: metadataProperties ?? preservedProperties,
			actorCnt: null,
			rectData: null,
			type: effectiveType ?? PARTICIPANT_TYPE.PARTICIPANT,
			explicitlyDeclared: old?.explicitlyDeclared === true || isExplicit
		};
		this.state.actors.set(id, actor);
		if (this.state.prevActor) {
			const prevActorInRecords = this.state.actors.get(this.state.prevActor);
			if (prevActorInRecords) prevActorInRecords.nextActor = id;
		}
		if (this.state.currentBox) this.state.currentBox.actorKeys.push(id);
		this.state.prevActor = id;
	}
	/**
	* 解析参与者元数据（B1 + B5.1 修复：对齐官方 sequenceDb.addActor 行为）
	*
	* 行为:
	*   - jison CONFIG_CONTENT 抓取的是 `@{...}` 内部内容（不含外层 {}）
	*   - 单行 metadata（无换行）：补 `{\n...\n}` 包成 flow mapping 解析（支持逗号分隔）
	*   - 多行 metadata（含换行）：直接 + `\n` 作为 block mapping 解析（支持换行分隔）
	*   - 合法 yaml: 返回解析后的 ParticipantMetaData（含 type/alias/其他字段）
	*   - 非法 yaml 语法（如缺逗号）: yaml.load 抛 YAMLException，try-catch 捕获返回空对象
	*   - yaml.load 返回非对象（字符串/数字/数组）: 视为无效 metadata，返回空对象
	*
	* 对齐官方 mermaid sequenceDb.ts:165-172：
	*   ```ts
	*   if (!metadata.includes('\n')) {
	*     yamlData = '{\n' + metadata + '\n}';
	*   } else {
	*     yamlData = metadata + '\n';
	*   }
	*   doc = yaml.load(yamlData, { schema: yaml.JSON_SCHEMA });
	*   ```
	*
	* 空对象行为: doc?.type=undefined → effectiveType 走默认值；doc?.alias=undefined → 不覆盖 description
	*
	* @param metadata - yaml 格式的元数据字符串（不含外层 {}，如 "type: 'queue', alias: 'My Queue'"）
	* @returns 解析后的参与者元数据（非法时返回空对象，由调用方走默认值）
	*/
	parseParticipantMetadata(metadata) {
		try {
			const yamlData = metadata.includes("\n") ? metadata + "\n" : "{\n" + metadata + "\n}";
			const doc = yaml.load(yamlData);
			if (doc && typeof doc === "object" && !Array.isArray(doc)) return doc;
			return {};
		} catch {
			return {};
		}
	}
	/** 计算参与者激活次数 */
	activationCount(part) {
		if (!part) return 0;
		let count = 0;
		for (const msg of this.state.messages) {
			if (msg.type === LINETYPE.ACTIVE_START && msg.from === part) count++;
			if (msg.type === LINETYPE.ACTIVE_END && msg.from === part) count--;
		}
		return count;
	}
	/** 添加消息（jison 调用） */
	addMessage(idFrom, idTo, message, answer) {
		this.state.messages.push({
			id: this.state.messages.length,
			from: idFrom,
			to: idTo,
			message: message.text,
			wrap: message.wrap ?? this.autoWrap(),
			answer
		});
	}
	/** 添加信号（jison 调用）
	*
	* B4.1 扩展：新增 `color` 参数（rect 块专用颜色，独立字段，不再复用 message 字段）
	*
	* 独立 activate/deactivate 修复：新增 `deactivate` 参数
	*   对称于 `activate` 参数：
	*     - `+` 简写（jison sequence.jison:333）：addMessage 传 activate=true
	*     - `-` 简写（jison sequence.jison:337）：addMessage 传 deactivate=true
	*     - 独立 activate X / 独立 deactivate X：addSignal 不传 activate/deactivate
	*   parser (sequence-parser.ts ACTIVE_END 处理) 通过 lastMsg.deactivate===true 区分 `-` 简写与独立 deactivate
	*/
	addSignal(idFrom, idTo, message, messageType, activate = false, centralConnection, color, deactivate = false) {
		if (messageType === LINETYPE.ACTIVE_END) {
			if (this.activationCount(idFrom ?? "") < 1) {
				const error = /* @__PURE__ */ new Error("Trying to inactivate an inactive participant (" + idFrom + ")");
				error.hash = {
					text: "->>-",
					token: "->>-",
					line: "1",
					loc: {
						first_line: 1,
						last_line: 1,
						first_column: 1,
						last_column: 1
					},
					expected: ["'ACTIVE_PARTICIPANT'"]
				};
				throw error;
			}
		}
		this.state.messages.push({
			id: this.state.messages.length,
			from: idFrom,
			to: idTo,
			message: message?.text ?? "",
			wrap: message?.wrap ?? this.autoWrap(),
			type: messageType,
			activate,
			deactivate,
			centralConnection: centralConnection ?? 0,
			...color !== void 0 ? { color } : {}
		});
		return true;
	}
	/**
	* 添加 Note（jison 调用）
	*
	* B4.1 P3-4 修复：统一存储到 Note.participantIds 数组
	*   - 无论单参与者还是多参与者，统一存储到 Note.participantIds 数组
	*   - 单参与者时长度为 1，多参与者时长度为 N
	*   - 不再使用 Note.actor 单参与者字段，消除双数据表示
	*
	* actor 参数可以是：
	*   - 字符串（left of/right of 单个参与者）
	*   - 字符串数组（over 多个参与者）
	*   - { actor: string } 对象（兼容旧格式，jison 仍可能传入）
	*/
	addNote(actor, placement, message) {
		let participantIds;
		let primaryActorId;
		if (typeof actor === "string") {
			participantIds = [actor];
			primaryActorId = actor;
		} else if (Array.isArray(actor)) {
			participantIds = [...actor];
			primaryActorId = actor[0] ?? "";
		} else {
			participantIds = [actor.actor];
			primaryActorId = actor.actor;
		}
		const note = {
			participantIds,
			placement,
			message: message.text,
			wrap: message.wrap ?? this.autoWrap()
		};
		this.state.notes.push(note);
		this.state.messages.push({
			id: this.state.messages.length,
			from: primaryActorId,
			to: primaryActorId,
			message: message.text,
			wrap: message.wrap ?? this.autoWrap(),
			type: LINETYPE.NOTE,
			placement
		});
	}
	/** 添加参与者链接（JSON 格式，jison 调用） */
	addLinks(actorId, text) {
		const actor = this.getActor(actorId);
		try {
			let sanitizedText = text.text.replace(/&equals;/g, "=").replace(/&amp;/g, "&");
			const links = JSON.parse(sanitizedText);
			this.insertLinks(actor, links);
		} catch {}
	}
	/** 添加单个链接（label@url 格式，jison 调用） */
	addALink(actorId, text) {
		const actor = this.getActor(actorId);
		try {
			const links = {};
			let sanitizedText = text.text.replace(/&equals;/g, "=").replace(/&amp;/g, "&");
			const sep = sanitizedText.indexOf("@");
			const label = sanitizedText.slice(0, sep - 1).trim();
			links[label] = sanitizedText.slice(sep + 1).trim();
			this.insertLinks(actor, links);
		} catch {}
	}
	/** 插入链接到 actor */
	insertLinks(actor, links) {
		if (actor.links == null) actor.links = links;
		else for (const key in links) if (Object.prototype.hasOwnProperty.call(links, key)) actor.links[key] = links[key];
	}
	/** 添加参与者属性（JSON 格式，jison 调用） */
	addProperties(actorId, text) {
		const actor = this.getActor(actorId);
		try {
			const properties = JSON.parse(text.text);
			this.insertProperties(actor, properties);
		} catch {}
	}
	/** 插入属性到 actor */
	insertProperties(actor, properties) {
		if (actor.properties == null) actor.properties = properties;
		else for (const key in properties) if (Object.prototype.hasOwnProperty.call(properties, key)) actor.properties[key] = properties[key];
	}
	/** 设置 wrap（jison 调用） */
	setWrap(wrapSetting) {
		this.state.wrapEnabled = wrapSetting;
	}
	/** 自动 wrap（未显式设置时使用默认值 false） */
	autoWrap() {
		return this.state.wrapEnabled ?? false;
	}
	/** 从文本中提取 wrap 标记 */
	extractWrap(text) {
		if (text === void 0) return {
			cleanedText: void 0,
			wrap: void 0
		};
		const trimmed = text.trim();
		const wrap = /^:?wrap:/.exec(trimmed) !== null ? true : /^:?nowrap:/.exec(trimmed) !== null ? false : void 0;
		return {
			cleanedText: (wrap === void 0 ? trimmed : trimmed.replace(/^:?(?:no)?wrap:/, "")).trim(),
			wrap
		};
	}
	/** 解析消息文本（jison 调用） */
	parseMessage(str) {
		const trimmedStr = str.trim();
		const { wrap, cleanedText } = this.extractWrap(trimmedStr);
		return {
			text: cleanedText ?? "",
			wrap
		};
	}
	/**
	* 解析 box 数据（jison 调用）
	* 格式：color first then description
	* color 可以是 rgb/rgba/hsl/hsla 或 CSS 颜色名
	*/
	parseBoxData(str) {
		const match = /^((?:rgba?|hsla?)\s*\(.*\)|\w*)(.*)$/s.exec(str);
		let color = match?.[1] ? match[1].trim() : "transparent";
		let title = match?.[2] ? match[2].trim() : void 0;
		if (color && !COLOR_REGEX.test(color) && !CSS_COLOR_NAMES.has(color.toLowerCase())) {
			color = "transparent";
			title = str.trim();
		}
		const { wrap, cleanedText } = this.extractWrap(title);
		return {
			text: cleanedText || void 0,
			color,
			wrap
		};
	}
	enableSequenceNumbers() {
		this.state.sequenceNumbersEnabled = true;
	}
	disableSequenceNumbers() {
		this.state.sequenceNumbersEnabled = false;
	}
	showSequenceNumbers() {
		return this.state.sequenceNumbersEnabled;
	}
	setAccTitle(title) {
		this.state.accTitle = title;
	}
	getAccTitle() {
		return this.state.accTitle;
	}
	setAccDescription(desc) {
		this.state.accDescription = desc;
	}
	getAccDescription() {
		return this.state.accDescription;
	}
	setDiagramTitle(title) {
		this.state.diagramTitle = title;
	}
	getDiagramTitle() {
		return this.state.diagramTitle;
	}
	getActors() {
		return this.state.actors;
	}
	getActor(id) {
		const actor = this.state.actors.get(id);
		if (!actor) throw new Error(`Actor not found: ${id}`);
		return actor;
	}
	getActorKeys() {
		return [...this.state.actors.keys()];
	}
	getMessages() {
		return this.state.messages;
	}
	getNotes() {
		return this.state.notes;
	}
	getBoxes() {
		return this.state.boxes;
	}
	getCreatedActors() {
		return this.state.createdActors;
	}
	getDestroyedActors() {
		return this.state.destroyedActors;
	}
	hasAtLeastOneBox() {
		return this.state.boxes.length > 0;
	}
	hasAtLeastOneBoxWithTitle() {
		return this.state.boxes.some((b) => b.name);
	}
	getActorProperty(actor, key) {
		if (actor?.properties !== void 0) return actor.properties[key];
	}
	/** 批量应用操作（jison 调用） */
	apply(param) {
		if (Array.isArray(param)) {
			for (const item of param) this.apply(item);
			return;
		}
		const obj = param;
		switch (obj.type) {
			case "sequenceIndex":
				this.state.messages.push({
					id: this.state.messages.length,
					from: void 0,
					to: void 0,
					message: {
						start: obj.sequenceIndex,
						step: obj.sequenceIndexStep,
						visible: obj.sequenceVisible
					},
					wrap: false,
					type: obj.signalType
				});
				break;
			case "addParticipant":
				this.addActor(obj.actor, obj.actor, obj.description, obj.draw, obj.config);
				break;
			case "createParticipant": {
				if (this.state.actors.has(obj.actor)) throw new Error("It is not possible to have actors with the same id, even if one is destroyed before the next is created. Use 'AS' aliases to simulate the behavior");
				const actorObj = {
					box: void 0,
					name: obj.actor,
					description: obj.description?.text ?? obj.actor,
					wrap: this.autoWrap(),
					prevActor: this.state.prevActor,
					links: {},
					properties: {},
					actorCnt: null,
					rectData: null,
					type: obj.draw ?? PARTICIPANT_TYPE.PARTICIPANT
				};
				this.state.lastCreated = actorObj;
				this.addActor(obj.actor, obj.actor, obj.description, obj.draw, obj.config);
				const createdActor = this.state.actors.get(obj.actor);
				if (createdActor) createdActor.explicitlyDeclared = false;
				this.state.createdActors.set(obj.actor, this.state.messages.length);
				break;
			}
			case "destroyParticipant": {
				const actor = this.state.actors.get(obj.actor);
				if (actor) this.state.lastDestroyed = actor;
				this.state.destroyedActors.set(obj.actor, this.state.messages.length);
				break;
			}
			case "activeStart":
				this.addSignal(obj.actor, void 0, void 0, obj.signalType);
				break;
			case "centralConnection":
			case "centralConnectionReverse":
			case "activeEnd":
				this.addSignal(obj.actor, void 0, void 0, obj.signalType);
				break;
			case "addNote":
				this.addNote(obj.actor, obj.placement, obj.text);
				break;
			case "addLinks":
				this.addLinks(obj.actor, obj.text);
				break;
			case "addALink":
				this.addALink(obj.actor, obj.text);
				break;
			case "addProperties":
				this.addProperties(obj.actor, obj.text);
				break;
			case "addMessage":
				if (this.state.lastCreated) {
					if (obj.to !== this.state.lastCreated.name) throw new Error("The created participant " + this.state.lastCreated.name + " does not have an associated creating message after its declaration. Please check the sequence diagram.");
					else this.state.lastCreated = void 0;
				} else if (this.state.lastDestroyed) {
					if (obj.to !== this.state.lastDestroyed.name && obj.from !== this.state.lastDestroyed.name) throw new Error("The destroyed participant " + this.state.lastDestroyed.name + " does not have an associated destroying message after its declaration. Please check the sequence diagram.");
					else this.state.lastDestroyed = void 0;
				}
				this.addSignal(obj.from, obj.to, obj.msg, obj.signalType, obj.activate, obj.centralConnection, void 0, obj.deactivate);
				break;
			case "boxStart":
				this.addBox(obj.boxData);
				break;
			case "boxEnd":
				this.boxEnd();
				break;
			case "loopStart":
				this.addSignal(void 0, void 0, obj.loopText, obj.signalType);
				break;
			case "loopEnd":
				this.addSignal(void 0, void 0, void 0, obj.signalType);
				break;
			case "rectStart": {
				const colorStr = obj.color?.text;
				this.addSignal(void 0, void 0, void 0, obj.signalType, false, void 0, colorStr);
				break;
			}
			case "rectEnd":
				this.addSignal(void 0, void 0, void 0, obj.signalType);
				break;
			case "optStart":
				this.addSignal(void 0, void 0, obj.optText, obj.signalType);
				break;
			case "optEnd":
				this.addSignal(void 0, void 0, void 0, obj.signalType);
				break;
			case "altStart":
				this.addSignal(void 0, void 0, obj.altText, obj.signalType);
				break;
			case "else":
				this.addSignal(void 0, void 0, obj.altText, obj.signalType);
				break;
			case "altEnd":
				this.addSignal(void 0, void 0, void 0, obj.signalType);
				break;
			case "setAccTitle":
				this.setAccTitle(obj.text);
				break;
			case "parStart":
				this.addSignal(void 0, void 0, obj.parText, obj.signalType);
				break;
			case "and":
				this.addSignal(void 0, void 0, obj.parText, obj.signalType);
				break;
			case "parEnd":
				this.addSignal(void 0, void 0, void 0, obj.signalType);
				break;
			case "criticalStart":
				this.addSignal(void 0, void 0, obj.criticalText, obj.signalType);
				break;
			case "option":
				this.addSignal(void 0, void 0, obj.optionText, obj.signalType);
				break;
			case "criticalEnd":
				this.addSignal(void 0, void 0, void 0, obj.signalType);
				break;
			case "breakStart":
				this.addSignal(void 0, void 0, obj.breakText, obj.signalType);
				break;
			case "breakEnd": this.addSignal(void 0, void 0, void 0, obj.signalType);
		}
	}
	getData() {
		return {
			actors: this.state.actors,
			messages: this.state.messages,
			notes: this.state.notes,
			boxes: this.state.boxes,
			createdActors: this.state.createdActors,
			destroyedActors: this.state.destroyedActors,
			sequenceNumbersEnabled: this.state.sequenceNumbersEnabled,
			accTitle: this.state.accTitle,
			accDescr: this.state.accDescription
		};
	}
};
function createInitialState() {
	return {
		prevActor: void 0,
		actors: /* @__PURE__ */ new Map(),
		createdActors: /* @__PURE__ */ new Map(),
		destroyedActors: /* @__PURE__ */ new Map(),
		boxes: [],
		messages: [],
		notes: [],
		sequenceNumbersEnabled: false,
		wrapEnabled: void 0,
		currentBox: void 0,
		lastCreated: void 0,
		lastDestroyed: void 0,
		accTitle: void 0,
		accDescription: void 0,
		diagramTitle: void 0
	};
}
//#endregion
//#region src/serializer/parser/class/constants.ts
/**
* Class Diagram 常量定义
*
* 单一职责：定义 RELATION_TYPE / LINE_TYPE / VISIBILITY_VALUES 常量
* 这些常量值必须与 jison 语法中引用的 yy.relationType / yy.lineType 完全一致
*
* 来源：对齐官方 mermaid packages/mermaid/src/diagrams/class/classDb.ts 的 relationType/lineType
*/
/** 关系类型（jison 通过 yy.relationType 访问）
*
* 数值含义（与官方 classDb.ts 一致）：
*   - AGGREGATION: o-- 空心菱形（聚合）
*   - EXTENSION:   <|-- 空心三角箭头（继承）/ <|.. 实现虚线
*   - COMPOSITION: *-- 实心菱形（组合）
*   - DEPENDENCY:  <.. 开放箭头虚线（依赖）/ --> 开放箭头实线（关联）
*   - LOLLIPOP:    ()-- 棒棒糖（接口实现）
*
* 注意：jison 语法层只有 5 种 relationType，association/realization 由 relationType + lineType 组合决定：
*   - association  = DEPENDENCY + LINE（-->）
*   - realization  = EXTENSION + DOTTED_LINE（<|..）
*   - dependency   = DEPENDENCY + DOTTED_LINE（<..）
*   - extension    = EXTENSION + LINE（<|--）
*/
const RELATION_TYPE = {
	AGGREGATION: 0,
	EXTENSION: 1,
	COMPOSITION: 2,
	DEPENDENCY: 3,
	LOLLIPOP: 4
};
/** 线型（jison 通过 yy.lineType 访问） */
const LINE_TYPE = {
	LINE: 0,
	DOTTED_LINE: 1
};
/** 可见性符号集合（对齐官方 classTypes.ts visibilityValues） */
const VISIBILITY_VALUES = [
	"#",
	"+",
	"~",
	"-",
	""
];
RELATION_TYPE.AGGREGATION, RELATION_TYPE.EXTENSION, RELATION_TYPE.COMPOSITION, RELATION_TYPE.DEPENDENCY, RELATION_TYPE.LOLLIPOP;
/** LINE_TYPE → ClassLineType 映射 */
const LINE_TYPE_TO_CLASS_LINE_TYPE = {
	[LINE_TYPE.LINE]: "line",
	[LINE_TYPE.DOTTED_LINE]: "dotted"
};
//#endregion
//#region src/serializer/parser/class/class-member.ts
/**
* ClassMember — 官方 mermaid `classTypes.ts` ClassMember 类的纯 TypeScript 移植
*
* 单一职责：解析和存储类图成员变量/方法的元数据（visibility/classifier/parameters/returnType）
*
* 与官方的差异:
*   - 移除 getConfig 依赖（使用默认配置，不做 securityLevel 相关处理）
*   - 移除 sanitizeText 依赖（HTML 转义由渲染层负责，解析层保留原始文本）
*   - 移除 parseGenericTypes 依赖（在本地实现简化版）
*   - 适配 TypeScript 严格模式（禁止 any，禁止 ! 非空断言，初始化所有字段）
*
* 数据流:
*   ClassDB.addMember(className, memberString) → new ClassMember(memberString, memberType)
*   → parseMember() 填充 id/visibility/parameters/returnType/classifier
*   → getDisplayDetails() 返回 { displayText, cssStyle } 供渲染层使用
*/
/**
* 类型守卫：判断字符串是否为合法的可见性符号
*/
function isVisibility(value) {
	return VISIBILITY_VALUES.includes(value);
}
/**
* 解析成员字符串为 NodeMember（ClassConverter.parseBlock 调用）
*
* 设计偏差修订（M3 实现期）：原设计 memberKind 包含 'annotation' | 'method' | 'attribute'，
* 但 'annotation' 并非真正的成员（注解通过 ClassConverter 单独处理，提取文本后累积到
* data.annotations[]），parseMember 仅处理 'method' | 'attribute' 两种真正的成员类型。
*
* 复用 ClassMember 类的解析逻辑，但产出 NodeMember 数据结构（而非 ClassMember 实例），
* 避免 Converter 层依赖 ClassMember 类实例（解耦解析逻辑与数据结构）。
*
* @param memberText 原始成员文本（如 '+publicAttr: Type' / '-privateMethod(): ReturnType'）
* @param memberKind 成员类型（'method' | 'attribute'，由 ClassMemberBlock.memberKind 传入）
* @returns NodeMember 数据结构（含 name/visibility/isStatic/isAbstract/returnType/isMethod/parameters/type）
*/
function parseMember(memberText, memberKind) {
	if (memberKind === "method") return parseMethodMember(memberText);
	return parseAttributeMember(memberText);
}
/**
* 序列化 NodeMember 为成员字符串（ClassConverter.serializeBlock 调用）
*
* 反向操作：从 NodeMember 还原成员字符串，用于 serialize 方向产出 ClassBlock.members[].memberText。
*
* @param member NodeMember 数据结构
* @returns 成员字符串（如 '+publicAttr: Type' / '-privateMethod(): ReturnType'）
*/
function serializeMember(member) {
	if (member.isMethod) return serializeMethodMember(member);
	return serializeAttributeMember(member);
}
/** 方法正则（对齐 ClassMember.parseMember 的 methodRegEx） */
const METHOD_REGEX = /([#+~-])?(.+)\((.*)\)([\s$*])?(.*)([$*])?/;
/** 解析方法成员字符串为 NodeMember */
function parseMethodMember(memberText) {
	const match = METHOD_REGEX.exec(memberText);
	if (!match) return {
		name: memberText.trim(),
		visibility: "",
		isStatic: false,
		isAbstract: false,
		isMethod: true
	};
	const visibility = match[1] ? match[1].trim() : "";
	const safeVisibility = isVisibility(visibility) ? visibility : "";
	const name = match[2].trim();
	const parameters = match[3] ? match[3].trim() : "";
	let potentialClassifier = match[4] ? match[4].trim() : "";
	let returnType = match[5] ? match[5].trim().replace(/^:\s*/, "") : "";
	if (potentialClassifier === "") {
		const lastChar = returnType.substring(returnType.length - 1);
		if (/[$*]/.exec(lastChar)) {
			potentialClassifier = lastChar;
			returnType = returnType.substring(0, returnType.length - 1);
		}
	}
	return {
		name,
		...parameters ? { parameters } : {},
		...returnType ? { returnType } : {},
		visibility: safeVisibility,
		isStatic: potentialClassifier === "*",
		isAbstract: potentialClassifier === "$",
		isMethod: true
	};
}
/** 序列化方法 NodeMember 为成员字符串 */
function serializeMethodMember(member) {
	const classifier = member.isStatic ? "*" : member.isAbstract ? "$" : "";
	const visibility = member.visibility ?? "";
	const params = member.parameters ?? "";
	const returnType = member.returnType;
	let text = `${visibility}${member.name}(${params})`;
	if (returnType) text += `: ${returnType}`;
	if (classifier) text += classifier;
	return text;
}
/** 解析属性成员字符串为 NodeMember（含 name:type 拆分，对齐 class-parser.ts parseAttributeNameAndType） */
function parseAttributeMember(memberText) {
	const length = memberText.length;
	const firstChar = memberText.substring(0, 1);
	const lastChar = memberText.substring(length - 1);
	const visibility = isVisibility(firstChar) ? firstChar : "";
	const hasClassifier = /[$*]/.exec(lastChar) !== null;
	const potentialClassifier = hasClassifier ? lastChar : "";
	const idStart = visibility === "" ? 0 : 1;
	const idEnd = hasClassifier ? length - 1 : length;
	const { name, type } = parseAttributeNameAndType(memberText.substring(idStart, idEnd).trim());
	return {
		name,
		...type ? { type } : {},
		visibility,
		isStatic: potentialClassifier === "*",
		isAbstract: potentialClassifier === "$",
		isMethod: false
	};
}
/** 序列化属性 NodeMember 为成员字符串 */
function serializeAttributeMember(member) {
	const classifier = member.isStatic ? "*" : member.isAbstract ? "$" : "";
	const visibility = member.visibility ?? "";
	const type = member.type;
	let text = `${visibility}${member.name}`;
	if (type) text += `: ${type}`;
	if (classifier) text += classifier;
	return text;
}
/** 解析属性名和类型（`attrName: Type` → `{ name: 'attrName', type: 'Type' }`，对齐 class-parser.ts） */
function parseAttributeNameAndType(id) {
	const colonIndex = id.indexOf(":");
	if (colonIndex < 0) return { name: id.trim() };
	const name = id.substring(0, colonIndex).trim();
	const type = id.substring(colonIndex + 1).trim();
	return {
		name,
		...type ? { type } : {}
	};
}
//#endregion
//#region src/serializer/parser/er/constants.ts
/**
* ER Diagram 常量定义
*
* 单一职责：定义 CARDINALITY / IDENTIFICATION 常量及其到 M0 类型的映射
* 这些常量值必须与 jison 语法中引用的 yy.Cardinality / yy.Identification 完全一致
*
* 来源：对齐官方 mermaid packages/mermaid/src/diagrams/er/erDb.ts 的 Cardinality/Identification
*/
/** ER 基数常量（jison 通过 yy.Cardinality 访问）
*
* 数值含义（与官方 erDiagram.jison 一致）：
*   - ZERO_OR_ONE:   |o / o|  零或一
*   - ZERO_OR_MORE:  o{ / }o  零或多（o{ 为右侧形式，}o 为左侧形式）
*   - ONE_OR_MORE:   |{ / }|  一或多（|{ 为右侧形式，}| 为左侧形式）
*   - ONLY_ONE:      ||       仅一
*   - MD_PARENT:     u        多对多父节点（仅 source 端，后跟 -/.//|）
*
* 注意：
*   - jison 语法层使用大写形式字符串，M0 ERCardinality 使用小写连字符形式
*   - jison 中 }o 和 o{ 都解析为 ZERO_OR_MORE（左侧/右侧形式差异）
*   - jison 中 u 仅在后跟 -/.//| 时解析为 MD_PARENT（仅 source 端有效）
*/
const CARDINALITY = {
	ZERO_OR_ONE: "ZERO_OR_ONE",
	ZERO_OR_MORE: "ZERO_OR_MORE",
	ONE_OR_MORE: "ONE_OR_MORE",
	ONLY_ONE: "ONLY_ONE",
	MD_PARENT: "MD_PARENT"
};
/** ER 关系类型常量（jison 通过 yy.Identification 访问）
*
* 数值含义（与官方 erDb.ts 一致）：
*   - IDENTIFYING:     --  实线（标识关系）
*   - NON_IDENTIFYING: ..  虚线（非标识关系）
*/
const IDENTIFICATION = {
	IDENTIFYING: "IDENTIFYING",
	NON_IDENTIFYING: "NON_IDENTIFYING"
};
CARDINALITY.ZERO_OR_ONE, CARDINALITY.ZERO_OR_MORE, CARDINALITY.ONE_OR_MORE, CARDINALITY.ONLY_ONE, CARDINALITY.MD_PARENT;
IDENTIFICATION.IDENTIFYING, IDENTIFICATION.NON_IDENTIFYING;
/** CARDINALITY → ERCardinality 映射（jison 大写形式 → M0 小写连字符形式） */
const CARDINALITY_TO_ER_CARDINALITY = {
	[CARDINALITY.ZERO_OR_ONE]: "zero-or-one",
	[CARDINALITY.ZERO_OR_MORE]: "zero-or-more",
	[CARDINALITY.ONE_OR_MORE]: "one-or-more",
	[CARDINALITY.ONLY_ONE]: "only-one",
	[CARDINALITY.MD_PARENT]: "md-parent"
};
/** IDENTIFICATION → ERIdentification 映射（jison 大写形式 → M0 小写连字符形式） */
const IDENTIFICATION_TO_ER_IDENTIFICATION = {
	[IDENTIFICATION.IDENTIFYING]: "identifying",
	[IDENTIFICATION.NON_IDENTIFYING]: "non-identifying"
};
//#endregion
//#region src/serializer/serializer/shared/escape-helpers.ts
/**
* 转义辅助函数 — Mermaid 代码中特殊字符的转义
*
* 单一职责：仅处理字符转义，不涉及业务逻辑
*/
/**
* 转义节点标签中的特殊字符
* Mermaid 节点标签需要转义: \ " [ ] { } ( ) 换行
*/
function escapeLabel(label) {
	return label.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\n/g, "<br/>");
}
/**
* 转义边标签中的特殊字符
* Mermaid 边标签需要转义: \ |
*/
function escapeEdgeLabel(label) {
	return label.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}
/**
* 转义字符串字面量（用于带引号的字符串，如 pie 切片标签）
* 仅转义引号和反斜杠
*/
function escapeStringLiteral(label) {
	return label.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
//#endregion
//#region src/serializer/serializer/flowchart/vertex-serializer.ts
/** jison 语法层支持的 16 种标准形状（不需要 shapeData） */
const JISON_SYNTAX_SHAPES = /* @__PURE__ */ new Set([
	"rect",
	"rounded",
	"stadium",
	"ellipse",
	"subroutine",
	"cylinder",
	"circle",
	"doublecircle",
	"diamond",
	"hexagon",
	"odd",
	"trapezoid",
	"trapezoid-reverse",
	"lean-right",
	"lean-left",
	"rect-with-prop"
]);
/**
* 根据 labelType 选择转义函数并包裹标签
*
* @param label - 原始标签文本
* @param labelType - 标签类型（text/string/markdown）
* @returns 转义并包裹后的标签
*/
function formatLabel(label, labelType) {
	switch (labelType) {
		case "string": return `"${escapeStringLiteral(label)}"`;
		case "markdown": return `~${label}~`;
		default: return escapeLabel(label);
	}
}
/**
* 生成带标签的形状语法
* @param id - 节点 ID
* @param label - 已转义的标签
* @param shape - 形状类型
* @returns Mermaid 顶点代码（如 `A[Hello]`）
*/
function formatShape(id, label, shape) {
	switch (shape) {
		case "rect": return `${id}[${label}]`;
		case "rounded": return `${id}(${label})`;
		case "stadium": return `${id}([${label}])`;
		case "ellipse": return `${id}(-${label}-)`;
		case "subroutine": return `${id}[[${label}]]`;
		case "cylinder": return `${id}[(${label})]`;
		case "circle": return `${id}((${label}))`;
		case "doublecircle": return `${id}(((${label})))`;
		case "diamond": return `${id}{${label}}`;
		case "hexagon": return `${id}{{${label}}}`;
		case "odd": return `${id}>${label}]`;
		case "trapezoid": return `${id}[/${label}\\]`;
		case "trapezoid-reverse": return `${id}[\\${label}/]`;
		case "lean-right": return `${id}[/${label}/]`;
		case "lean-left": return `${id}[\\${label}\\]`;
		default: return `${id}[${label}]`;
	}
}
/**
* 生成带属性的矩形语法
* 对齐 jison: `id[|field:value|label]`
*/
function formatRectWithProps(id, label, props) {
	return `${id}[|${Object.entries(props).map(([key, value]) => `${key}:${String(value)}`).join("|")}|${label}]`;
}
/**
* 生成 shapeData 扩展形状语法
* 对齐 jison: `id@{ shape: xxx, label: "...", ... }`
*/
function formatShapeData(id, data) {
	const entries = [`shape: ${data.shape}`];
	if (data.label !== void 0 && data.label !== "") {
		const escapedLabel = escapeStringLiteral(data.label);
		entries.push(`label: "${escapedLabel}"`);
	}
	const icon = data.icon;
	if (icon) entries.push(`icon: "${icon}"`);
	const form = data.form;
	if (form) entries.push(`form: ${form}`);
	const pos = data.pos;
	if (pos) entries.push(`pos: ${pos}`);
	const img = data.img;
	if (img) entries.push(`img: "${img}"`);
	const assetWidth = data.assetWidth;
	if (assetWidth !== void 0) entries.push(`w: ${assetWidth}`);
	const assetHeight = data.assetHeight;
	if (assetHeight !== void 0) entries.push(`h: ${assetHeight}`);
	const constraint = data.constraint;
	if (constraint) entries.push(`constraint: ${constraint}`);
	return `${id}@{ ${entries.join(", ")} }`;
}
/**
* 序列化单个顶点为 Mermaid 代码
*
* @param node - MermaidNode
* @returns Mermaid 顶点代码行（如 `A[Hello]` 或 `A@{ shape: docs, label: "Documents" }`）
*/
function serializeVertex(node) {
	const { id, data } = node;
	const labelType = data.labelType;
	const formattedLabel = formatLabel(data.label ?? id, labelType);
	const props = data.props;
	if (props && Object.keys(props).length > 0) return formatRectWithProps(id, formattedLabel, props);
	const shape = data.shape ?? "rect";
	if (JISON_SYNTAX_SHAPES.has(shape)) return formatShape(id, formattedLabel, shape);
	return formatShapeData(id, data);
}
//#endregion
//#region src/serializer/serializer/flowchart/edge-serializer.ts
/**
* 将 MermaidEdgeStyle 映射为 Mermaid 边语法字符串
*
* 对齐 flow-db.ts destructEndLink/destructStartLink 的逆操作:
*   - stroke: normal → `--`, thick → `==`, dotted → `-.`, invisible → `~~`
*   - type: arrow_point → `>`, arrow_circle → `o`, arrow_cross → `x`, arrow_open → (无)
*   - 双端箭头: 起始端加对应字符
*/
function edgeStyleToSyntax(style) {
	switch (style) {
		case "line": return "---";
		case "arrow": return "-->";
		case "cross": return "--x";
		case "circle": return "--o";
		case "thick-line": return "===";
		case "thick-arrow": return "==>";
		case "thick-cross": return "==x";
		case "thick-circle": return "==o";
		case "dotted": return "-.-";
		case "dotted-arrow": return "-.->";
		case "dotted-cross": return "-.-x";
		case "dotted-circle": return "-.-o";
		case "bidirectional-arrow": return "<-->";
		case "bidirectional-cross": return "x--x";
		case "bidirectional-circle": return "o--o";
		case "invisible": return "~~~";
		default: return "-->";
	}
}
/**
* 序列化单条边为 Mermaid 代码
*
* @param edge - MermaidEdge
* @returns Mermaid 边代码行（如 `A -->|label| B` 或 `A@--> B`）
*/
function serializeEdge(edge) {
	const { source, target, data } = edge;
	const syntax = edgeStyleToSyntax(data.edgeStyle);
	const isUserDefinedId = data.isUserDefinedId;
	const idPrefix = edge.id && isUserDefinedId ? `${edge.id}@` : "";
	const label = data.label;
	return `${source} ${idPrefix}${syntax}${label ? `|${escapeEdgeLabel(label)}|` : ""} ${target}`;
}
//#endregion
//#region src/serializer/id-generator.ts
/**
* ID 生成器 — 自动短 ID（A, B, C... Z, AA, AB...）
* 双射 26 进制算法，保证唯一性
*/
var IdGenerator = class {
	constructor() {
		this.counter = 0;
		this.usedIds = /* @__PURE__ */ new Set();
	}
	/**
	* 生成新的唯一短 ID
	* 规则：A, B, C, ... Z, AA, AB, ... AZ, BA, ... ZZ, AAA, ...
	*/
	generate() {
		let id = this.indexToId(this.counter);
		while (this.usedIds.has(id)) {
			this.counter++;
			id = this.indexToId(this.counter);
		}
		this.counter++;
		this.usedIds.add(id);
		return id;
	}
	/**
	* 注册已存在的 ID，避免后续 generate() 生成重复
	*/
	register(id) {
		this.usedIds.add(id);
	}
	/**
	* 批量注册已存在的 ID
	*/
	registerMany(ids) {
		for (const id of ids) this.usedIds.add(id);
	}
	/**
	* 检查 ID 是否已被使用
	*/
	isUsed(id) {
		return this.usedIds.has(id);
	}
	/**
	* 重置生成器（清空已用 ID 集合和计数器）
	*/
	reset() {
		this.counter = 0;
		this.usedIds.clear();
	}
	/**
	* 获取所有已注册 ID（只读视图，返回副本避免外部修改）
	*/
	getUsedIds() {
		return new Set(this.usedIds);
	}
	/**
	* 序号 → 字母 ID
	* 0→A, 1→B, ... 25→Z, 26→AA, 27→AB, ...
	* 算法：26 进制，但无"0"位，所以是双射计数（bijective base-26）
	*/
	indexToId(index) {
		if (index < 0) return "A";
		let result = "";
		let n = index + 1;
		while (n > 0) {
			n--;
			result = String.fromCharCode(65 + n % 26) + result;
			n = Math.floor(n / 26);
		}
		return result;
	}
};
new IdGenerator();
//#endregion
//#region src/serializer/converter/flowchart/style-converter.ts
/**
* 将 style 语句的字符串数组解析为结构化 NodeStyle 对象
*
* style 语句格式: "fill:#e1f5fe", "stroke:#333", "stroke-width:2", "color:#fff", "font-size:12px"
*
* Bug5 修复（对齐老 flowchart-parser.ts parseStylesToNodeStyle）：
*   不再过滤非 fill/stroke/stroke-width/color 属性，将所有 key:value 对保留，
*   确保 classDef / inline style 的任意 CSS 属性在 parse-serialize 往返中不丢失。
*
* 设计意图：data.style 是 NodeStyle 对象（用于渲染层），data.styles 是字符串数组（用于序列化层）。
* 两个字段都是 parse 方向的产物：StyleConverter.parseBlock 追加到 data.styles，
* buildCanvas 阶段调用 mergeNodeStyles 统一构建 data.style（合并 classDef + direct styles）。
*
* @param styles - style 语句的字符串数组（如 ['fill:#f00', 'font-size:12px']）
* @returns NodeStyle 对象，若 styles 为空返回 undefined
*/
function parseStylesToNodeStyle(styles) {
	if (styles.length === 0) return void 0;
	const result = {};
	for (const s of styles) {
		const colonIndex = s.indexOf(":");
		if (colonIndex === -1) continue;
		const key = s.substring(0, colonIndex).trim();
		const value = s.substring(colonIndex + 1).trim();
		switch (key) {
			case "fill":
				result.fill = value;
				break;
			case "stroke":
				result.stroke = value;
				break;
			case "stroke-width":
			case "strokeWidth": {
				const num = Number(value);
				if (Number.isFinite(num)) result.strokeWidth = num;
				else {
					result[key] = value;
					const loose = Number(value.replace(/[^0-9.]/g, ""));
					if (Number.isFinite(loose)) result.strokeWidth = loose;
				}
				break;
			}
			case "color":
				result.color = value;
				break;
			default: result[key] = value;
		}
	}
	return Object.keys(result).length > 0 ? result : void 0;
}
/**
* 合并 classDef 样式和直接 style 到节点的 data.style
*
* 合并优先级（对齐老 flowchart-parser.ts mapVertexToNode 的 mergedStyle 逻辑）：
*   1. 先合并 classDef 样式（按 node.data.classNames 声明顺序，后声明的覆盖先声明的）
*   2. 再合并直接 style（node.data.styles，覆盖 classDef）
*
* 该函数在 FlowchartConverterRegistry.buildCanvas 阶段调用（post-process），
* 因为 ClassApplyConverter.parseBlock 时 metadata.flowClassDefs 可能还未填充（顺序依赖）。
*
* 不破坏 serialize 方向：serialize 仍从 data.styles 读取，data.style 仅用于渲染层和 round-trip 语义保留。
*
* @param node - 待合并样式的节点（mutate node.data.style）
* @param flowClassDefs - classDef 定义列表（从 metadata.flowClassDefs 读取）
*/
function mergeNodeStyles(node, flowClassDefs) {
	const mergedStyle = {};
	let hasAnyStyle = false;
	const classNames = node.data.classNames;
	if (classNames !== void 0 && classNames.length > 0) for (const className of classNames) {
		const classDef = flowClassDefs.find((cd) => cd.id === className);
		if (classDef !== void 0) {
			const classStyle = parseStylesToNodeStyle(classDef.styles);
			if (classStyle !== void 0) {
				Object.assign(mergedStyle, classStyle);
				hasAnyStyle = true;
			}
		}
	}
	const directStyles = node.data.styles;
	if (directStyles !== void 0 && directStyles.length > 0) {
		const directStyle = parseStylesToNodeStyle(directStyles);
		if (directStyle !== void 0) {
			Object.assign(mergedStyle, directStyle);
			hasAnyStyle = true;
		}
	}
	if (hasAnyStyle) node.data.style = mergedStyle;
}
/**
* ClassDefBlock 副作用型转换器
*
* parse 时：构造 FlowClassDefInfo 调用 metadataCollector.addClassDef
* 累积到 metadata.flowClassDefs
*/
var ClassDefConverter$1 = class {
	parseBlock(block, context) {
		const info = {
			id: block.className,
			styles: [...block.styles],
			textStyles: [...block.textStyles]
		};
		context.metadataCollector.addClassDef(info);
	}
};
/**
* ClassApplyBlock 副作用型转换器
*
* parse 时：对每个 nodeId 调用 ctx.updateNode，将 className 追加到 data.classNames（去重）
*
* 对齐 flow-db.ts setClass 行为：class 应用是追加而非覆盖，同一节点可应用多个 class。
*/
var ClassApplyConverter$1 = class {
	parseBlock(block, context) {
		for (const nodeId of block.nodeIds) context.updateNode(nodeId, (node) => {
			const existing = node.data.classNames ?? [];
			if (!existing.includes(block.className)) node.data.classNames = [...existing, block.className];
		});
	}
};
/**
* StyleBlock 副作用型转换器
*
* parse 时：对每个 nodeId 调用 ctx.updateNode，将 styles 追加到 data.styles
*
* 对齐 flow-db.ts addVertex 行为：style 语句追加到 vertex.styles 数组（不覆盖）。
* data.style NodeStyle 对象由 buildCanvas 阶段调用 mergeNodeStyles 统一构建
* （合并 classDef + direct styles，避免 ClassApplyConverter 顺序依赖问题）。
*/
var StyleConverter$1 = class {
	parseBlock(block, context) {
		for (const nodeId of block.nodeIds) context.updateNode(nodeId, (node) => {
			const existing = node.data.styles ?? [];
			node.data.styles = [...existing, ...block.styles];
		});
	}
};
/**
* LinkStyleBlock 副作用型转换器
*
* parse 时按 target.kind 分流：
*   - 'indices': 对每个 index 调用 ctx.updateEdgeByIndex，追加 styles 到 data.styles，
*     若 interpolate 非空则设置 data.interpolate，若 animate 非空则设置 data.animate
*   - 'default': 调用 metadataCollector.setLinkStyleDefault(styles, interpolate)（决策16）
*
* 对齐 flow-db.ts updateLink/updateLinkInterpolate 行为：
*   - updateLink 按 index 追加 style 到 edge.style 数组
*   - updateLinkInterpolate 按 index 设置 edge.interpolate
*   - 'default' 时设置 edges.defaultStyle/defaultInterpolate
*/
var LinkStyleConverter = class {
	parseBlock(block, context) {
		const { target, styles, interpolate, animate } = block;
		if (target.kind === "default") {
			context.metadataCollector.setLinkStyleDefault(styles, interpolate);
			return;
		}
		for (const index of target.indices) context.updateEdgeByIndex(index, (edge) => {
			const existing = edge.data.styles ?? [];
			edge.data.styles = [...existing, ...styles];
			if (interpolate !== void 0) edge.data.interpolate = interpolate;
			if (animate !== void 0) edge.data.animate = animate;
		});
	}
};
//#endregion
//#region src/serializer/converter/flowchart/click-converter.ts
/**
* ClickBlock 副作用型转换器（仅 parse 方向，决策15：仅 metadata 累积）
*
* parse 时构造 FlowClickEvent 调用 metadataCollector.addClickEvent。
* FlowClickEvent 承载所有 click 语义字段（functionName/functionArgs/link/linkTarget/tooltip），
* addClickEvent 实现内部根据字段非空情况分别累积到 flowClickEvents 和 flowTooltips。
*/
var ClickConverter$1 = class {
	parseBlock(block, context) {
		const event = {
			nodeId: block.nodeId,
			...block.functionName !== void 0 ? { functionName: block.functionName } : {},
			...block.functionArgs !== void 0 ? { functionArgs: block.functionArgs } : {},
			...block.link !== void 0 ? { link: block.link } : {},
			...block.linkTarget !== void 0 ? { linkTarget: block.linkTarget } : {},
			...block.tooltip !== void 0 ? { tooltip: block.tooltip } : {}
		};
		context.metadataCollector.addClickEvent(event);
	}
};
//#endregion
//#region src/serializer/converter/flowchart/title-converter.ts
/**
* TitleBlock 副作用型转换器（仅 parse 方向）
*
* parse 时调用 metadataCollector.setTitle 累积到 metadata.title（覆盖式）。
* 对齐 flow-db.ts setDiagramTitle 行为。
*/
var TitleConverter = class {
	parseBlock(block, context) {
		context.metadataCollector.setTitle(block.title);
	}
};
/**
* AccTitleBlock 副作用型转换器（仅 parse 方向）
*
* parse 时调用 metadataCollector.setAccTitle 累积到 metadata.accTitle（覆盖式）。
* 对齐 flow-db.ts setAccTitle 行为。
*/
var AccTitleConverter$1 = class {
	parseBlock(block, context) {
		context.metadataCollector.setAccTitle(block.accTitle);
	}
};
/**
* AccDescriptionBlock 副作用型转换器（仅 parse 方向）
*
* parse 时调用 metadataCollector.setAccDescription 累积到 metadata.accDescription（覆盖式）。
* 对齐 flow-db.ts setAccDescription 行为。
*/
var AccDescriptionConverter$1 = class {
	parseBlock(block, context) {
		context.metadataCollector.setAccDescription(block.accDescription);
	}
};
//#endregion
//#region src/serializer/converter/flowchart/direction-converter.ts
/**
* DirectionBlock 副作用型转换器（仅 parse 方向）
*
* parse 时调用 metadataCollector.setDirection 累积到 metadata.direction。
* 对齐 flow-db.ts setDirection 行为：direction 语句设置图表方向（覆盖式）。
*/
var DirectionConverter$1 = class {
	parseBlock(block, context) {
		const dir = block.dir;
		context.metadataCollector.setDirection(dir);
	}
};
//#endregion
//#region src/serializer/converter/flowchart/subgraph-converter.ts
/**
* SubgraphOpenBlock ↔ MermaidNode(isSubgraph=true) 双向转换器
*
* parse 时副作用：ctx.pushParent(subgraphId)
* 后续 VertexBlock/EdgeBlock 通过 ctx.currentParent() 读取栈顶 parentId/subgraphId
*/
var SubgraphOpenConverter = class {
	/** parse：SubgraphOpenBlock → MermaidNode(isSubgraph)，注册节点 + pushParent */
	parseBlock(block, context) {
		const data = {
			label: block.title !== "" ? block.title : block.subgraphId,
			shape: "rect",
			isSubgraph: true,
			...block.classNames.length > 0 ? { classNames: [...block.classNames] } : {},
			...block.hasExplicitDir ? { hasExplicitDir: true } : {},
			...block.dir !== void 0 ? { dir: block.dir } : {},
			...block.sourceLine !== void 0 ? { _sourceLine: block.sourceLine } : {}
		};
		const node = {
			id: block.subgraphId,
			type: "subgraph",
			position: {
				x: 0,
				y: 0
			},
			data,
			...context.currentParent() !== void 0 ? { parentId: context.currentParent() } : {}
		};
		context.registerNode(node);
		context.pushParent(block.subgraphId);
		return node;
	}
	/** serialize：MermaidNode(isSubgraph) → SubgraphOpenBlock（含 rawText） */
	serializeBlock(model, _context) {
		if (model.data.isSubgraph !== true) return null;
		const data = model.data;
		const title = data.label !== void 0 && data.label !== model.id ? data.label : "";
		const rawText = this.formatSubgraphOpen(model.id, title);
		return {
			type: "subgraph-open",
			sourceLine: data._sourceLine,
			rawText,
			indent: 0,
			subgraphId: model.id,
			title,
			classNames: data.classNames ?? [],
			hasExplicitDir: data.hasExplicitDir === true,
			dir: this.parseDirection(data.dir)
		};
	}
	/**
	* 生成 subgraph open 语法
	* - 有标题：`subgraph id[title]`（id 与 [ 之间无空格，对齐 mermaid 官方语法）
	* - 无标题：`subgraph id`
	*/
	formatSubgraphOpen(id, title) {
		if (title === "") return `subgraph ${id}`;
		return `subgraph ${id}[${title}]`;
	}
	/**
	* 将 data.dir 字符串解析为 FlowchartDirection
	*/
	parseDirection(dir) {
		if (dir === void 0) return;
		if (dir === "TB" || dir === "TD" || dir === "BT" || dir === "RL" || dir === "LR") return dir;
	}
};
/**
* SubgraphCloseBlock 副作用型转换器（仅 parse 方向）
*
* parse 时：ctx.popParent() + LIFO 校验
* serialize 时：由 ConverterRegistry.serialize 扫描 canvas 时按 parentId 分组深度优先遍历自动配对产出
*/
var SubgraphCloseConverter = class {
	/**
	* parse：弹出栈顶 parent，LIFO 校验
	*
	* 程序错误不可包容（code-standards 第 5 章）：SubgraphCloseBlock 与 SubgraphOpenBlock
	* 应由 Recognizer 的 pendingStack 机制保证配对，若 LIFO 校验失败说明 Recognizer 有 bug，
	* 抛出 SubgraphStackError 让 ConverterRegistry.parseBlocks 捕获并记录到 errors 数组。
	*/
	parseBlock(block, context) {
		const popped = context.popParent();
		if (popped === void 0) throw new SubgraphStackError$1("subgraph-close without matching subgraph-open", block);
		if (popped !== block.subgraphId) throw new SubgraphStackError$1(`subgraph-close mismatch: expected ${block.subgraphId}, got ${popped}`, block);
	}
};
/**
* Subgraph 栈错误（LIFO 校验失败）
*
* ConverterRegistry.parseBlocks 通过 try/catch 捕获此错误，
* 转换为 BlockConvertError 累加到 errors 数组（不中断后续 block 处理）。
*/
var SubgraphStackError$1 = class extends Error {
	constructor(message, block) {
		super(message);
		this.name = "SubgraphStackError";
		this.block = block;
	}
};
/**
* 构造 BlockConvertError（从 SubgraphStackError）
*
* 供 ConverterRegistry.parseBlocks 的 catch 块调用
*/
function toBlockConvertError$2(err) {
	return {
		block: err.block,
		message: err.message
	};
}
//#endregion
//#region src/serializer/converter/flowchart/edge-converter.ts
/**
* EdgeBlock ↔ MermaidEdge 双向转换器
*/
var EdgeConverter = class {
	/** parse：EdgeBlock → MermaidEdge，通过 ctx.registerEdge 累加 */
	parseBlock(block, context) {
		const parentSubgraphId = context.currentParent();
		const edgeIndex = context.getEdges().length;
		const edgeId = block.edgeId ?? `edge-${edgeIndex}`;
		const data = {
			edgeStyle: block.edgeStyle,
			...block.label !== void 0 ? { label: block.label } : {},
			...block.labelType !== void 0 ? { labelType: block.labelType } : {},
			...block.length !== void 0 ? { length: block.length } : {},
			...block.classNames.length > 0 ? { classNames: [...block.classNames] } : {},
			...block.edgeId !== void 0 ? { isUserDefinedId: true } : {},
			...parentSubgraphId !== void 0 ? { subgraphId: parentSubgraphId } : {},
			...block.sourceLine !== void 0 ? { _sourceLine: block.sourceLine } : {}
		};
		const edge = {
			id: edgeId,
			source: block.sourceId,
			target: block.targetId,
			type: "default",
			data
		};
		context.registerEdge(edge);
		return edge;
	}
	/** serialize：MermaidEdge → EdgeBlock（含 rawText） */
	serializeBlock(model, _context) {
		const data = model.data;
		const rawText = serializeEdge(model);
		return {
			type: "edge",
			sourceLine: data._sourceLine,
			rawText,
			indent: 0,
			sourceId: model.source,
			targetId: model.target,
			hasSourceVertexDef: false,
			hasTargetVertexDef: false,
			edgeStyle: data.edgeStyle,
			label: data.label,
			labelType: data.labelType,
			length: data.length,
			edgeId: data.isUserDefinedId === true ? model.id : void 0,
			classNames: data.classNames ?? []
		};
	}
};
//#endregion
//#region src/serializer/converter/flowchart/vertex-converter.ts
/**
* VertexBlock ↔ MermaidNode 双向转换器
*
* 决策17 merge 语义：registerNode 时若 nodeId 已存在则按字段优先级 merge
* （后定义的非 undefined 字段覆盖前定义的），由 ConverterContext 实现负责。
*/
var VertexConverter = class {
	/** parse：VertexBlock → MermaidNode，通过 ctx.registerNode 累加 */
	parseBlock(block, context) {
		const data = {
			...block.label !== void 0 ? { label: block.label } : {},
			...block.shape !== void 0 ? { shape: block.shape } : {},
			isSubgraph: false,
			...block.labelType !== void 0 ? { labelType: block.labelType } : {},
			...block.inlineStyles.length > 0 ? { styles: [...block.inlineStyles] } : {},
			...block.inlineClasses.length > 0 ? { classNames: [...block.inlineClasses] } : {},
			...block.dir !== void 0 ? { dir: block.dir } : {},
			...block.props !== void 0 ? { props: block.props } : {},
			...block.sourceLine !== void 0 ? { _sourceLine: block.sourceLine } : {}
		};
		const node = {
			id: block.nodeId,
			type: "default",
			position: {
				x: 0,
				y: 0
			},
			data,
			...context.currentParent() !== void 0 ? { parentId: context.currentParent() } : {}
		};
		context.registerNode(node);
		return node;
	}
	/** serialize：MermaidNode → VertexBlock（含 rawText） */
	serializeBlock(model, _context) {
		if (model.data.isSubgraph === true) return null;
		const data = model.data;
		const rawText = serializeVertex(model);
		return {
			type: "vertex",
			sourceLine: data._sourceLine,
			rawText,
			indent: 0,
			nodeId: model.id,
			label: data.label === model.id ? void 0 : data.label,
			labelType: data.labelType,
			shape: data.shape,
			inlineStyles: data.styles ?? [],
			inlineClasses: data.classNames ?? [],
			dir: this.parseDirection(data.dir),
			props: data.props
		};
	}
	/**
	* 将 data.dir 字符串解析为 FlowchartDirection
	* data.dir 类型为 string（types.ts:627），serialize 方向需收窄为 FlowchartDirection
	*/
	parseDirection(dir) {
		if (dir === void 0) return;
		if (dir === "TB" || dir === "TD" || dir === "BT" || dir === "RL" || dir === "LR") return dir;
	}
};
//#endregion
//#region src/serializer/converter/flowchart/index.ts
const vertexConverter = new VertexConverter();
const edgeConverter = new EdgeConverter();
const subgraphOpenConverter$1 = new SubgraphOpenConverter();
const subgraphCloseConverter$1 = new SubgraphCloseConverter();
const classDefConverter$2 = new ClassDefConverter$1();
const classApplyConverter$2 = new ClassApplyConverter$1();
const styleConverter$2 = new StyleConverter$1();
const linkStyleConverter = new LinkStyleConverter();
const clickConverter$1 = new ClickConverter$1();
const directionConverter$2 = new DirectionConverter$1();
const titleConverter = new TitleConverter();
const accTitleConverter$2 = new AccTitleConverter$1();
const accDescriptionConverter$2 = new AccDescriptionConverter$1();
/**
* flowchart Converter 注册表
*
* 按 FlowchartBlockType 完整覆盖 15 种 BlockConverterEntry：
*   - 产出型（3）：vertex/edge/subgraph-open → IModelBlockConverter 双向
*   - 结构型（1）：subgraph-close → ISideEffectBlockConverter 仅 parse
*   - 指令型（3）：class-apply/style/linkStyle → ISideEffectBlockConverter 仅 parse
*   - 全局指令型（6）：classDef/click/direction/title/accTitle/accDescription → ISideEffectBlockConverter 仅 parse
*   - 格式保留型（2）：comment/blank → ISideEffectBlockConverter 仅 parse（无副作用）
*
* comment/blank 的 Converter 为 no-op 实现（parse 时无副作用，仅 Assembler 输出 rawText）。
* 设计-实现差异#5：jison parser 不识别注释/空行，parse 方向不会产出，但保留接口契约完整。
*/
const flowchartConverterEntries = [
	{
		type: "vertex",
		converter: vertexConverter
	},
	{
		type: "edge",
		converter: edgeConverter
	},
	{
		type: "subgraph-open",
		converter: subgraphOpenConverter$1
	},
	{
		type: "subgraph-close",
		converter: subgraphCloseConverter$1
	},
	{
		type: "classDef",
		converter: classDefConverter$2
	},
	{
		type: "class-apply",
		converter: classApplyConverter$2
	},
	{
		type: "style",
		converter: styleConverter$2
	},
	{
		type: "linkStyle",
		converter: linkStyleConverter
	},
	{
		type: "click",
		converter: clickConverter$1
	},
	{
		type: "direction",
		converter: directionConverter$2
	},
	{
		type: "title",
		converter: titleConverter
	},
	{
		type: "accTitle",
		converter: accTitleConverter$2
	},
	{
		type: "accDescription",
		converter: accDescriptionConverter$2
	},
	{
		type: "comment",
		converter: { parseBlock: () => {} }
	},
	{
		type: "blank",
		converter: { parseBlock: () => {} }
	}
];
//#endregion
//#region src/serializer/converter/class/namespace-converter.ts
/**
* namespace 栈失配错误
*
* 场景：NamespaceCloseBlock 的 namespaceId 与栈顶不匹配（LIFO 校验失败）
* 处理：转为 BlockConvertError 累积到 errors 数组，不中断后续 block 处理
*
* 对齐 flowchart SubgraphStackError：携带 block 字段供 toBlockConvertError 提取
*/
var NamespaceStackError = class extends Error {
	constructor(block, expectedId) {
		super(`Namespace stack mismatch: closing '${block.namespaceId}' but expected '${expectedId ?? "undefined"}'`);
		this.name = "NamespaceStackError";
		this.block = block;
		this.actualId = block.namespaceId;
		this.expectedId = expectedId;
	}
};
/**
* 构造 BlockConvertError（从 NamespaceStackError）
*
* 供 ClassConverterRegistry.parseBlocks 的 catch 块调用
*/
function toBlockConvertError$1(err) {
	return {
		block: err.block,
		message: err.message
	};
}
/**
* 生成 namespace open block 的 rawText（对齐老路径 serializeNamespace 行为）
*
* 格式：`namespace Name {`（仅 open 行，子节点由 DFS 递归产出独立 block）
*
* label 处理：
*   - data.label 存在且与 id 不同：用 label 作为显示名
*   - data.label 不存在或与 id 相同：用 id 作为显示名
*/
function formatNamespaceOpen(namespaceId, label) {
	return `namespace ${label !== void 0 && label !== "" ? label : namespaceId} {`;
}
/**
* NamespaceOpenBlock ↔ MermaidNode 双向转换器
*
* parse 方向产出 namespace 节点（type='class-namespace'，isSubgraph=true），
* 并 pushParent 入栈，后续 class/note 节点 parentId 指向此 namespace
*/
var NamespaceOpenConverter = class {
	/** parse：NamespaceOpenBlock → MermaidNode，通过 ctx.registerNode 注册 + ctx.pushParent 入栈 */
	parseBlock(block, context) {
		const parentId = context.currentParent();
		const label = block.label ?? block.namespaceId;
		const data = {
			label,
			shape: "class-namespace",
			isSubgraph: true,
			...block.sourceLine !== void 0 ? { _sourceLine: block.sourceLine } : {}
		};
		const node = {
			id: block.namespaceId,
			type: "class-namespace",
			position: {
				x: 0,
				y: 0
			},
			data,
			...parentId !== void 0 ? {
				parentId,
				extent: "parent"
			} : {}
		};
		context.registerNode(node);
		context.pushParent(block.namespaceId);
		context.metadataCollector.addNamespace({
			namespaceId: block.namespaceId,
			label,
			...parentId !== void 0 ? { parentId } : {}
		});
		return node;
	}
	/** serialize：MermaidNode → NamespaceOpenBlock（含 rawText，对齐设计点1） */
	serializeBlock(model, _context) {
		if (model.type !== "class-namespace") return null;
		const data = model.data;
		const label = data.label;
		const rawText = formatNamespaceOpen(model.id, label);
		return {
			type: "namespace-open",
			sourceLine: data._sourceLine,
			rawText,
			indent: 0,
			namespaceId: model.id,
			label
		};
	}
};
/**
* NamespaceCloseBlock 副作用型转换器
*
* parse 方向：ctx.popParent（LIFO 校验，失配抛 NamespaceStackError）
* 无 serialize 方向（NamespaceCloseBlock 由 Registry 在 DFS 扫描时自动产出）
*/
var NamespaceCloseConverter = class {
	/** parse：NamespaceCloseBlock → ctx.popParent（LIFO 校验） */
	parseBlock(block, context) {
		const expectedId = context.popParent();
		if (expectedId !== block.namespaceId) throw new NamespaceStackError(block, expectedId);
	}
};
//#endregion
//#region src/serializer/converter/class/class-converter.ts
/** annotation → stereotype 映射（对齐 class-parser.ts ANNOTATION_TO_STEREOTYPE） */
const ANNOTATION_TO_STEREOTYPE = {
	interface: "interface",
	abstract: "abstract",
	annotation: "annotation",
	enum: "enum",
	protocol: "protocol",
	exception: "exception",
	metaclass: "metaclass",
	stereotype: "stereotype"
};
/** stereotype → annotation 文本映射（serialize 方向，对齐老路径 STEREOTYPE_TO_ANNOTATION） */
const STEREOTYPE_TO_ANNOTATION = {
	interface: "<<interface>>",
	abstract: "<<abstract>>",
	annotation: "<<annotation>>",
	enum: "<<enum>>",
	protocol: "<<protocol>>",
	exception: "<<exception>>",
	metaclass: "<<metaclass>>",
	stereotype: "<<stereotype>>"
};
/**
* 从 annotations 列表推断 stereotype
*
* annotations 如 `['interface']` → stereotype='interface'
* 多个 annotation 时取第一个匹配的（对齐 class-parser.ts inferStereotype）
*/
function inferStereotype(annotations) {
	for (const annotation of annotations) {
		const lower = annotation.toLowerCase().trim();
		const stereotype = ANNOTATION_TO_STEREOTYPE[lower];
		if (stereotype) return stereotype;
	}
}
/**
* 收集需要输出的注解（serialize 方向）
*
* 规则（对齐老路径 collectAnnotations）：
*   - stereotype 存在时输出对应的 `<<stereotype>>`
*   - annotations 中非 stereotype 的注解也输出 `<<annotation>>`
*   - 去重：避免 stereotype 对应的注解被重复输出
*/
function collectAnnotations(stereotype, annotations) {
	const result = [];
	const seen = /* @__PURE__ */ new Set();
	if (stereotype) {
		const annotation = STEREOTYPE_TO_ANNOTATION[stereotype];
		if (annotation) {
			result.push(annotation);
			seen.add(stereotype.toLowerCase());
		}
	}
	for (const ann of annotations) {
		const lower = ann.toLowerCase().trim();
		if (seen.has(lower)) continue;
		if (STEREOTYPE_TO_ANNOTATION[lower]) continue;
		result.push(`<<${ann}>>`);
		seen.add(lower);
	}
	return result;
}
/**
* 生成 class block 的 rawText（不含 block 级缩进，由 Assembler 应用）
*
* - 无成员 + 无注解：单行 `class ClassName`（含泛型 `class Foo~T~`）
* - 有成员或注解：多行 `class ClassName {\n  <<interface>>\n  +field: Type\n}`
*   内部成员/注解缩进 2 空格（class 体缩进）
*
* 对齐老路径 serializeClassNode(node, '') 行为（empty indent，block 级缩进由 Assembler 处理）
*/
function formatClassBlock(classId, annotations, members, stereotype) {
	const annotationsToOutput = collectAnnotations(stereotype, annotations);
	if (members.length === 0 && annotationsToOutput.length === 0) return `class ${classId}`;
	const lines = [];
	lines.push(`class ${classId} {`);
	for (const annotation of annotationsToOutput) lines.push(`  ${annotation}`);
	for (const member of members) lines.push(`  ${serializeMember(member)}`);
	lines.push("}");
	return lines.join("\n");
}
/** 泛型占位符正则（匹配 classId 中的 `~T~` 形式） */
const GENERICS_REGEX = /~([^~]+)~/;
/**
* 拆分 classId 中的泛型 `~T~` → { label, generics }
*
* 例：`List~Item~` → { label: 'List', generics: 'Item' }
* 无泛型时返回 { label: classId }（对齐 class-parser.ts 的 type 字段处理）
*/
function splitGenerics(classId) {
	const match = GENERICS_REGEX.exec(classId);
	if (!match) return { label: classId };
	const generics = match[1];
	return {
		label: classId.replace(match[0], ""),
		generics
	};
}
/**
* 合成 label + generics → classId（含 ~T~）
*
* 例：{ label: 'List', generics: 'Item' } → `List~Item~`
* 无 generics 时返回 label（serialize 方向反向操作）
*/
function joinGenerics(label, generics) {
	if (generics === void 0 || generics === "") return label;
	return `${label}~${generics}~`;
}
/**
* ClassBlock ↔ MermaidNode 双向转换器
*
* parse 方向产出 class 节点（type='class-box'，shape='class-box'），
* parentId 由 ctx.currentParent() 决定（namespace 嵌套）
*/
var ClassConverter = class {
	/** parse：ClassBlock → MermaidNode，通过 ctx.registerNode 注册 */
	parseBlock(block, context) {
		const { label: classLabel, generics } = splitGenerics(block.classId);
		const nodeLabel = block.label ?? classLabel;
		const annotations = [...block.annotations];
		const nodeMembers = [];
		for (const member of block.members) {
			if (member.memberKind === "annotation") {
				const text = extractAnnotationText(member.memberText);
				if (text) annotations.push(text);
				continue;
			}
			nodeMembers.push(parseMember(member.memberText, member.memberKind));
		}
		const stereotype = inferStereotype(annotations);
		const node = {
			id: classLabel,
			type: "class-box",
			position: {
				x: 0,
				y: 0
			},
			data: {
				label: nodeLabel,
				shape: "class-box",
				...nodeMembers.length > 0 ? { members: nodeMembers } : {},
				...annotations.length > 0 ? { annotations } : {},
				...stereotype ? { stereotype } : {},
				...generics ? { generics } : {},
				...block.cssClasses.length > 0 ? { classNames: [...block.cssClasses] } : {},
				...block.sourceLine !== void 0 ? { _sourceLine: block.sourceLine } : {}
			},
			...context.currentParent() !== void 0 ? { parentId: context.currentParent() } : {}
		};
		context.registerNode(node);
		return node;
	}
	/** serialize：MermaidNode → ClassBlock（含 rawText，对齐设计点1） */
	serializeBlock(model, _context) {
		if (model.type !== "class-box" && model.data.shape !== "class-box") return null;
		const data = model.data;
		const label = data.label ?? model.id;
		const generics = data.generics;
		const classId = joinGenerics(label, generics);
		const annotations = data.annotations ?? [];
		const members = [];
		const nodeMembers = data.members ?? [];
		for (const nodeMember of nodeMembers) members.push({
			memberText: serializeMember(nodeMember),
			memberKind: nodeMember.isMethod ? "method" : "attribute"
		});
		const stereotype = data.stereotype;
		const explicitLabel = label === model.id ? void 0 : label;
		const rawText = formatClassBlock(classId, annotations, nodeMembers, stereotype);
		return {
			type: "class",
			sourceLine: data._sourceLine,
			rawText,
			indent: 0,
			classId,
			label: explicitLabel,
			stereotype,
			annotations,
			members,
			cssClasses: data.classNames ?? []
		};
	}
};
/**
* 提取注解文本（去除 <<>> 包裹）
*
* 对齐 class-recognizer.ts extractAnnotationText：
*   `<<interface>>` → `interface`
*   非 `<<...>>` 格式返回空字符串
*/
function extractAnnotationText(memberText) {
	const trimmed = memberText.trim();
	if (trimmed.startsWith("<<") && trimmed.endsWith(">>")) return trimmed.substring(2, trimmed.length - 2);
	return "";
}
//#endregion
//#region src/serializer/converter/class/relation-converter.ts
/**
* LINE_TYPE 数值 → ClassLineType 字符串（parse 方向使用）
*
* 复用 constants.ts 已有的 LINE_TYPE_TO_CLASS_LINE_TYPE 映射，
* 包装为 ReadonlyMap 提供类型安全的查询接口。
*/
const LINE_TYPE_MAP = new Map(Object.entries(LINE_TYPE_TO_CLASS_LINE_TYPE).map(([key, value]) => [Number(key), value]));
/**
* ClassLineType 字符串 → LINE_TYPE 数值（serialize 方向反向映射）
*
* 反向查表：'line' → 0 (LINE_TYPE.LINE)，'dotted' → 1 (LINE_TYPE.DOTTED_LINE)
*/
const LINE_TYPE_REVERSE_MAP = /* @__PURE__ */ new Map([["line", LINE_TYPE.LINE], ["dotted", LINE_TYPE.DOTTED_LINE]]);
/**
* 数值型关系类型 → 左端（source 端）符号（serialize 方向使用）
*
* jison 语法中左端符号出现在线型左侧：
*   - EXTENSION: `<|` 空心三角指向 source
*   - COMPOSITION: `*` 实心菱形在 source 端
*   - AGGREGATION: `o` 空心菱形在 source 端
*   - DEPENDENCY: `<` 箭头指向 source
*   - LOLLIPOP: `()` 圆圈在 source 端
*/
const LEFT_SYMBOL = {
	[RELATION_TYPE.AGGREGATION]: "o",
	[RELATION_TYPE.EXTENSION]: "<|",
	[RELATION_TYPE.COMPOSITION]: "*",
	[RELATION_TYPE.DEPENDENCY]: "<",
	[RELATION_TYPE.LOLLIPOP]: "()"
};
/**
* 数值型关系类型 → 右端（target 端）符号（serialize 方向使用）
*
* jison 语法中右端符号出现在线型右侧：
*   - EXTENSION: `|>` 空心三角指向 target
*   - COMPOSITION: `*` 实心菱形在 target 端
*   - AGGREGATION: `o` 空心菱形在 target 端
*   - DEPENDENCY: `>` 箭头指向 target
*   - LOLLIPOP: `()` 圆圈在 target 端
*/
const RIGHT_SYMBOL = {
	[RELATION_TYPE.AGGREGATION]: "o",
	[RELATION_TYPE.EXTENSION]: "|>",
	[RELATION_TYPE.COMPOSITION]: "*",
	[RELATION_TYPE.DEPENDENCY]: ">",
	[RELATION_TYPE.LOLLIPOP]: "()"
};
/** 线型 → 线符号（serialize 方向使用） */
const LINE_SYMBOL = {
	line: "--",
	dotted: ".."
};
/**
* 构建箭头语法（双端对称，serialize 方向使用）
*
* 策略：根据数值型 type1/type2 分别查 LEFT_SYMBOL/RIGHT_SYMBOL，
*       组合为 `左符号 + 线符号 + 右符号`。
*   - type1 存在: 左端有符号（如 `<|--`, `*--`, `o--`, `<..`, `<|..`）
*   - type2 存在: 右端有符号（如 `-->`, `--o`, `--()`, `..>`, `..|>`）
*   - 双端都有: 如 `<|--o`（左端继承 + 右端聚合）
*   - 双端都无: 仅线型 `--` 或 `..`
*/
function buildArrowSyntax(type1, type2, lineType) {
	const lineSymbol = LINE_SYMBOL[lineType];
	return `${type1 !== void 0 ? LEFT_SYMBOL[type1] ?? "" : ""}${lineSymbol}${type2 !== void 0 ? RIGHT_SYMBOL[type2] ?? "" : ""}`;
}
/**
* 生成 relation block 的 rawText（对齐老路径 serializeRelation 行为）
*
* 格式：`source "card1" arrow "card2" target : label`
* - cardinality1/cardinality2 可选，存在时用双引号包裹
* - label 可选，存在时用 ` : ` 分隔
* - arrow 由 buildArrowSyntax 生成（双端对称符号组合）
*/
function formatRelation(edge) {
	const { source, target, data } = edge;
	const arrow = buildArrowSyntax(typeof data.relationType1 === "number" ? data.relationType1 : void 0, typeof data.relationType2 === "number" ? data.relationType2 : void 0, data.lineType ?? "line");
	const fromPart = data.cardinality1 ? `"${data.cardinality1}" ` : "";
	const toPart = data.cardinality2 ? ` "${data.cardinality2}"` : "";
	const label = data.relationLabel ?? data.label;
	return `${source} ${fromPart}${arrow}${toPart} ${target}${label ? ` : ${label}` : ""}`;
}
/**
* RelationBlock ↔ MermaidEdge 双向转换器
*
* 双端关系类型完整对称，LOLLIPOP 保留原始 source/target（不生成 interface 节点）
*/
var RelationConverter = class {
	/** parse：RelationBlock → MermaidEdge，通过 ctx.registerEdge 注册 */
	parseBlock(block, context) {
		const edgeId = `class-relation-${context.getEdges().length}`;
		const classLineType = LINE_TYPE_MAP.get(block.lineType) ?? "line";
		const data = {
			edgeStyle: classLineType === "dotted" ? "dotted" : "line",
			...block.label !== void 0 && block.label !== "" ? {
				label: block.label,
				relationLabel: block.label
			} : {},
			relationType1: block.relationType1,
			relationType2: block.relationType2,
			lineType: classLineType,
			...block.cardinality1 !== void 0 ? { cardinality1: block.cardinality1 } : {},
			...block.cardinality2 !== void 0 ? { cardinality2: block.cardinality2 } : {},
			...block.sourceLine !== void 0 ? { _sourceLine: block.sourceLine } : {}
		};
		const edge = {
			id: edgeId,
			source: block.sourceId,
			target: block.targetId,
			type: "class-relation",
			data
		};
		context.registerEdge(edge);
		return edge;
	}
	/** serialize：MermaidEdge → RelationBlock（含 rawText，对齐设计点1） */
	serializeBlock(model, _context) {
		if (model.type !== "class-relation") return null;
		const data = model.data;
		const classLineType = data.lineType ?? "line";
		const lineNumber = LINE_TYPE_REVERSE_MAP.get(classLineType) ?? LINE_TYPE.LINE;
		const label = data.relationLabel ?? data.label;
		const rawText = formatRelation(model);
		return {
			type: "relation",
			sourceLine: data._sourceLine,
			rawText,
			indent: 0,
			sourceId: model.source,
			targetId: model.target,
			relationType1: data.relationType1 ?? "none",
			relationType2: data.relationType2 ?? "none",
			lineType: lineNumber,
			cardinality1: data.cardinality1,
			cardinality2: data.cardinality2,
			label
		};
	}
};
//#endregion
//#region src/serializer/converter/class/note-converter.ts
/**
* 转义 note 文本中的特殊字符（双引号）
*
* 对齐老路径 note-serializer.ts escapeNoteText
*/
function escapeNoteText(text) {
	return text.replace(/"/g, "\\\"");
}
/**
* 生成 note block 的 rawText（对齐老路径 serializeNote 行为）
*
* - 关联 class 的 note：`note for ClassId "text"`
* - 独立 note（无 classId）：`note "text"`
*/
function formatNote(classId, text) {
	const escapedText = escapeNoteText(text);
	if (classId !== void 0 && classId !== "") return `note for ${classId} "${escapedText}"`;
	return `note "${escapedText}"`;
}
/**
* NoteBlock ↔ MermaidNode 双向转换器
*
* parse 方向产出 note 节点（type='class-note'，shape='note'），
* 若有关联 classId 额外产出 note-edge（type='note-edge'）
*/
var NoteConverter = class {
	/** parse：NoteBlock → MermaidNode + NoteEdge，通过 ctx.registerNode/registerEdge 注册 */
	parseBlock(block, context) {
		const noteIndex = context.getNodes().filter((n) => n.type === "class-note").length;
		const noteId = `note-${noteIndex}`;
		const node = {
			id: noteId,
			type: "class-note",
			position: {
				x: 0,
				y: 0
			},
			data: {
				label: block.text,
				shape: "class-note",
				...block.sourceLine !== void 0 ? { _sourceLine: block.sourceLine } : {}
			},
			...context.currentParent() !== void 0 ? { parentId: context.currentParent() } : {}
		};
		context.registerNode(node);
		if (block.classId !== void 0 && block.classId !== "") {
			const noteEdge = {
				id: `note-edge-${noteIndex}`,
				source: block.classId,
				target: noteId,
				type: "note-edge",
				data: { edgeStyle: "dotted" }
			};
			context.registerEdge(noteEdge);
		}
		context.metadataCollector.addNote({
			text: block.text,
			...block.classId !== void 0 && block.classId !== "" ? { classId: block.classId } : {}
		});
		return node;
	}
	/** serialize：MermaidNode → NoteBlock（含 rawText，对齐设计点1） */
	serializeBlock(model, context) {
		if (model.type !== "class-note") return null;
		const data = model.data;
		const text = data.label ?? "";
		const classId = context.getEdges().find((edge) => edge.type === "note-edge" && edge.target === model.id)?.source;
		const rawText = formatNote(classId, text);
		return {
			type: "note",
			sourceLine: data._sourceLine,
			rawText,
			indent: 0,
			text,
			classId
		};
	}
};
//#endregion
//#region src/serializer/converter/class/style-converter.ts
/**
* ClassCssApplyBlock 副作用型转换器
*
* parse 方向：对每个 classId 调 ctx.updateNode 追加 className 到 data.classNames（去重）
*
* 单一数据源：apply 映射只在 node.data.classNames，不存 metadata（设计偏差修订）
*/
var ClassApplyConverter = class {
	parseBlock(block, context) {
		for (const classId of block.classIds) context.updateNode(classId, (node) => {
			const existing = node.data.classNames ?? [];
			if (!existing.includes(block.className)) node.data.classNames = [...existing, block.className];
		});
	}
};
/**
* ClassStyleBlock 副作用型转换器
*
* parse 方向：ctx.updateNode(classId, mutate 追加 data.styles)
* 不构建 data.style（由 buildCanvas 阶段 mergeNodeStyles 统一构建，对齐 flowchart 决策17）
*/
var StyleConverter = class {
	parseBlock(block, context) {
		context.updateNode(block.classId, (node) => {
			const existing = node.data.styles ?? [];
			node.data.styles = [...existing, ...block.styles];
		});
	}
};
/**
* ClassCssDefBlock 副作用型转换器
*
* parse 方向：metadataCollector.addClassDef({className, styles, textStyles})
* 累积到 metadata.classDefs（ClassDefInfo[]）
*/
var ClassDefConverter = class {
	parseBlock(block, context) {
		const classDef = {
			className: block.className,
			styles: [...block.styles],
			textStyles: [...block.textStyles]
		};
		context.metadataCollector.addClassDef(classDef);
	}
};
//#endregion
//#region src/serializer/converter/class/direction-converter.ts
/**
* ClassDirectionBlock 副作用型转换器
*
* parse 方向：调 metadataCollector.setDirection，累积到 metadata.direction
* buildCanvas 阶段同步到顶层 canvas.direction（单一数据源修复）
*/
var DirectionConverter = class {
	parseBlock(block, context) {
		context.metadataCollector.setDirection(block.dir);
	}
};
//#endregion
//#region src/serializer/converter/class/title-converter.ts
/**
* ClassAccTitleBlock 副作用型转换器
*
* parse 方向：调 metadataCollector.setAccTitle，累积到 metadata.accTitle
*/
var AccTitleConverter = class {
	parseBlock(block, context) {
		context.metadataCollector.setAccTitle(block.accTitle);
	}
};
/**
* ClassAccDescriptionBlock 副作用型转换器
*
* parse 方向：调 metadataCollector.setAccDescription，累积到 metadata.accDescription
*/
var AccDescriptionConverter = class {
	parseBlock(block, context) {
		context.metadataCollector.setAccDescription(block.accDescription);
	}
};
//#endregion
//#region src/serializer/converter/class/click-converter.ts
/**
* ClassClickBlock 副作用型转换器（仅 parse 方向，决策15：仅 metadata 累积）
*
* parse 时构造 ClassClickEvent 调用 metadataCollector.addClickEvent。
* ClassClickEvent 承载所有 click 语义字段（functionName/functionArgs/link/linkTarget/tooltip），
* addClickEvent 实现内部根据字段非空情况分别累积到 classClickEvents 和 classTooltips。
*/
var ClickConverter = class {
	parseBlock(block, context) {
		const event = {
			classId: block.classId,
			...block.functionName !== void 0 ? { functionName: block.functionName } : {},
			...block.functionArgs !== void 0 ? { functionArgs: block.functionArgs } : {},
			...block.link !== void 0 ? { link: block.link } : {},
			...block.linkTarget !== void 0 ? { linkTarget: block.linkTarget } : {},
			...block.tooltip !== void 0 ? { tooltip: block.tooltip } : {}
		};
		context.metadataCollector.addClickEvent(event);
	}
};
//#endregion
//#region src/serializer/converter/class/index.ts
const classConverter = new ClassConverter();
const relationConverter = new RelationConverter();
const noteConverter = new NoteConverter();
const namespaceOpenConverter = new NamespaceOpenConverter();
const namespaceCloseConverter = new NamespaceCloseConverter();
const classApplyConverter$1 = new ClassApplyConverter();
const styleConverter$1 = new StyleConverter();
const classDefConverter$1 = new ClassDefConverter();
const clickConverter = new ClickConverter();
const directionConverter$1 = new DirectionConverter();
const accTitleConverter$1 = new AccTitleConverter();
const accDescriptionConverter$1 = new AccDescriptionConverter();
/**
* class Converter 注册表
*
* 按 ClassBlockType 完整覆盖 12 种 ClassBlockConverterEntry：
*   - 产出型（4）：class/relation/note/namespace-open → IModelBlockConverter 双向
*   - 结构型（1）：namespace-close → ISideEffectBlockConverter 仅 parse
*   - 指令型（2）：class-apply/style → ISideEffectBlockConverter 仅 parse
*   - 全局指令型（5）：classDef/click/direction/accTitle/accDescription → ISideEffectBlockConverter 仅 parse
*
* ClassConverterRegistry 构造函数消费此数组构建 blockType → entry 查找表，
* dispatchParse 按 block.type 收窄分发，requireConverter 函数重载返回精确 Converter 类型。
*/
const classConverterEntries = [
	{
		type: "class",
		converter: classConverter
	},
	{
		type: "relation",
		converter: relationConverter
	},
	{
		type: "note",
		converter: noteConverter
	},
	{
		type: "namespace-open",
		converter: namespaceOpenConverter
	},
	{
		type: "namespace-close",
		converter: namespaceCloseConverter
	},
	{
		type: "class-apply",
		converter: classApplyConverter$1
	},
	{
		type: "style",
		converter: styleConverter$1
	},
	{
		type: "classDef",
		converter: classDefConverter$1
	},
	{
		type: "click",
		converter: clickConverter
	},
	{
		type: "direction",
		converter: directionConverter$1
	},
	{
		type: "accTitle",
		converter: accTitleConverter$1
	},
	{
		type: "accDescription",
		converter: accDescriptionConverter$1
	}
];
//#endregion
//#region src/serializer/converter/class/registry.ts
/**
* 创建前向引用默认节点（class-box 类型）
*
* 场景：ClassStyleBlock/ClassCssApplyBlock 可能出现在 ClassBlock 之前
* （如 `style A fill:#fff` 在 `class A` 之前）。
* 对齐 flowchart createDefaultNode 行为：隐式创建节点，后续 registerNode 通过 merge 合并字段。
*
* 默认节点的 styles/classNames 为 undefined（不覆盖已有字段），
* label 回退为 nodeId（对齐 flowchart 行为）。
*/
function createDefaultNode$2(nodeId) {
	return {
		id: nodeId,
		type: "class-box",
		position: {
			x: 0,
			y: 0
		},
		data: {
			label: nodeId,
			shape: "class-box",
			isSubgraph: false
		}
	};
}
/**
* 合并两个 MermaidNode（incoming 非 undefined 字段覆盖 existing）
*
* id 是主键，永不变化。
* data 字段通过 mergeNodeData 深层合并（incoming 非 undefined 字段覆盖 existing）。
* parentId 由 incoming 优先（class 不会在边定义时顺便更新节点，无需 deepest-wins 决策）。
* 其他顶层可选字段（extent/selected 等）按 incoming 非 undefined 覆盖。
*/
function mergeNode$2(existing, incoming) {
	const incomingRecord = incoming;
	const mergedTop = { ...existing };
	for (const key of Object.keys(incomingRecord)) {
		if (key === "data" || key === "id") continue;
		const value = incomingRecord[key];
		if (value !== void 0) mergedTop[key] = value;
	}
	const result = mergedTop;
	result.id = existing.id;
	result.data = mergeNodeData$2(existing.data, incoming.data);
	return result;
}
/**
* 合并两个 MermaidNodeData（incoming 非 undefined 字段覆盖 existing）
*
* 遍历 incoming 的所有 key，非 undefined 的值覆盖 existing 的对应字段。
* 支持数组类型字段（如 styles/classNames）的整体替换语义 —
* 数组替换而非拼接，因为同一 classId 的 ClassBlock 重新定义时应当替换而非追加。
*/
function mergeNodeData$2(existing, incoming) {
	const existingRecord = existing;
	const incomingRecord = incoming;
	const merged = { ...existingRecord };
	for (const key of Object.keys(incomingRecord)) {
		const value = incomingRecord[key];
		if (value !== void 0) merged[key] = value;
	}
	return merged;
}
/** 构造 NamespaceCloseBlock（rawText: '}'，对齐 mermaid classDiagram namespace 关闭语法）
*
* mermaid classDiagram 的 namespace 关闭符号是 `}`（不是 flowchart subgraph 的 `end`）。
* 老路径 namespace-serializer.ts line 120 确认：`lines.push(`${indent}}`)`。
*/
function createNamespaceCloseBlock(namespaceId, indent) {
	return {
		type: "namespace-close",
		sourceLine: void 0,
		rawText: "}",
		indent,
		namespaceId
	};
}
/**
* 构造顶层 DirectionBlock（rawText: `direction ${dir}`，indent=0）
*
* [一-6-补] 修订：classDiagram header 是固定字符串 `classDiagram`（无 direction 后缀，
* mermaid 官方 classDiagram 不支持 `classDiagram TB` header 语法），顶层 direction
* 必须作为独立 DirectionBlock 产出（对齐老路径 serializeClass 行为）。
* 与 flowchart 不同（flowchart header 含 direction，Converter 不产出顶层 DirectionBlock）。
*/
function createDirectionBlock$2(dir) {
	return {
		type: "direction",
		sourceLine: void 0,
		rawText: `direction ${dir}`,
		indent: 0,
		dir
	};
}
/** 构造 AccTitleBlock（rawText: `accTitle: ${accTitle}`） */
function createAccTitleBlock$2(accTitle) {
	return {
		type: "accTitle",
		sourceLine: void 0,
		rawText: `accTitle: ${accTitle}`,
		indent: 0,
		accTitle
	};
}
/** 构造 AccDescriptionBlock（rawText: `accDescr: ${accDescription}`，对齐官方缩写语法） */
function createAccDescriptionBlock$2(accDescription) {
	return {
		type: "accDescription",
		sourceLine: void 0,
		rawText: `accDescr: ${accDescription}`,
		indent: 0,
		accDescription
	};
}
/** 构造 ClassCssDefBlock（rawText: `classDef className style1,style2,...`） */
function createClassDefBlock$2(info) {
	const allStyles = [...info.styles, ...info.textStyles];
	return {
		type: "classDef",
		sourceLine: void 0,
		rawText: `classDef ${info.className} ${allStyles.join(",")}`,
		indent: 0,
		className: info.className,
		styles: [...info.styles],
		textStyles: [...info.textStyles]
	};
}
/** 构造 ClassCssApplyBlock（rawText: `class classId1,classId2 ::: className`）
*
* 对齐 mermaid 官方 classDiagram 语法：`class A ::: red`（用 ::: 分隔符应用 CSS 类）。
* 多个 classId 可合并为 `class A,B ::: red`（官方允许逗号分隔）。
*/
function createClassApplyBlock$2(classIds, className) {
	return {
		type: "class-apply",
		sourceLine: void 0,
		rawText: `class ${classIds.join(",")} ::: ${className}`,
		indent: 0,
		classIds: [...classIds],
		className
	};
}
/** 构造 ClassStyleBlock（rawText: `style classId style1,style2,...`） */
function createStyleBlock$2(classId, styles) {
	return {
		type: "style",
		sourceLine: void 0,
		rawText: `style ${classId} ${styles.join(",")}`,
		indent: 0,
		classId,
		styles: [...styles]
	};
}
/** 构造 ClassClickBlock（rawText 根据 event 字段组合，对齐官方 click 语法） */
function createClickBlock$1(event) {
	const parts = ["click", event.classId];
	if (event.functionName !== void 0) {
		parts.push(event.functionName);
		if (event.functionArgs !== void 0) parts.push("call", event.functionArgs);
	}
	if (event.link !== void 0) {
		parts.push("href", `"${event.link}"`);
		if (event.linkTarget !== void 0) parts.push(event.linkTarget);
	}
	if (event.tooltip !== void 0) parts.push(`"${event.tooltip}"`);
	return {
		type: "click",
		sourceLine: void 0,
		rawText: parts.join(" "),
		indent: 0,
		classId: event.classId,
		functionName: event.functionName,
		functionArgs: event.functionArgs,
		link: event.link,
		linkTarget: event.linkTarget,
		tooltip: event.tooltip
	};
}
/**
* 构造 NoteBlock（从 ClassNoteInfo，对齐 NoteConverter.formatNote 行为）
*
* rawText 格式：
*   - 关联 class 的 note：`note for ClassId "text"`（双引号转义）
*   - 独立 note（无 classId）：`note "text"`
*
* 使用场景：serialize 方向 fallback — 当 canvas 无 note 节点（type='class-note'）
* 但有 metadata.classNotes 时，从 metadata.classNotes 产出 NoteBlock。
* 保证数据不丢失（兼容老路径数据，对齐老路径 serializeNotes 优先用 metadata.classNotes 的行为）。
*/
function createNoteBlockFromInfo(note) {
	const escapedText = note.text.replace(/"/g, "\\\"");
	const classId = note.classId;
	return {
		type: "note",
		sourceLine: void 0,
		rawText: classId !== void 0 && classId !== "" ? `note for ${classId} "${escapedText}"` : `note "${escapedText}"`,
		indent: 0,
		text: note.text,
		classId
	};
}
/**
* ClassConverterContext 默认实现
*
* 内部状态：
*   - parentStack: string[] — namespace 栈，pushParent/popParent/currentParent
*   - nodes: Map<string, MermaidNode> — 节点注册表（保留插入顺序，merge 语义）
*   - edges: MermaidEdge[] — 边列表（按注册顺序）
*   - metadataCollector: ClassMetadataCollector — 注入的元数据收集器
*   - errors: BlockConvertError[] — 错误收集（不中断后续 block 处理）
*
* merge 语义：registerNode 时若 nodeId 已存在则按字段优先级 merge。
* 前向引用：updateNode 在节点不存在时创建默认节点（对齐 flowchart createDefaultNode 行为）。
*/
var ClassDefaultConverterContext = class {
	constructor(metadataCollector) {
		this.parentStack = [];
		this.nodes = /* @__PURE__ */ new Map();
		this.edges = [];
		this.errors = [];
		this.metadataCollector = metadataCollector;
	}
	pushParent(namespaceId) {
		this.parentStack.push(namespaceId);
	}
	popParent() {
		return this.parentStack.pop();
	}
	currentParent() {
		return this.parentStack[this.parentStack.length - 1];
	}
	/**
	* 注册新节点（merge 语义）
	*
	* 若 nodeId 已存在，按字段优先级 merge（incoming 非 undefined 字段覆盖 existing）。
	* 支持 ClassBlock 重新定义时替换字段（如 label/members 等）。
	*
	* parentId 归属语义：incoming.parentId 优先（class 不会在边定义时顺便更新节点，
	* 无需 flowchart 的 deepest-wins 决策）。
	*/
	registerNode(node) {
		const existing = this.nodes.get(node.id);
		if (existing === void 0) {
			this.nodes.set(node.id, node);
			return;
		}
		const merged = mergeNode$2(existing, node);
		if (node.parentId !== void 0) merged.parentId = node.parentId;
		this.nodes.set(node.id, merged);
	}
	/**
	* 更新已有节点（前向引用：节点不存在时创建默认节点）
	*
	* 场景：ClassStyleBlock/ClassCssApplyBlock 可能出现在 ClassBlock 之前。
	* 对齐 flowchart createDefaultNode 行为：隐式创建节点，后续 registerNode 通过 merge 合并。
	*/
	updateNode(nodeId, mutate) {
		const existing = this.nodes.get(nodeId);
		if (existing === void 0) {
			const defaultNode = createDefaultNode$2(nodeId);
			mutate(defaultNode);
			this.nodes.set(nodeId, defaultNode);
			return;
		}
		mutate(existing);
	}
	getNode(nodeId) {
		return this.nodes.get(nodeId);
	}
	/** 获取所有节点（保留插入顺序，Map iteration order 保证） */
	getNodes() {
		return [...this.nodes.values()];
	}
	registerEdge(edge) {
		this.edges.push(edge);
	}
	getEdges() {
		return this.edges;
	}
	addError(error) {
		this.errors.push(error);
	}
	/** 获取累积的错误列表（parseBlocks 返回时使用） */
	getErrors() {
		return this.errors;
	}
};
/**
* ClassMetadataCollector 默认实现
*
* 内部状态对应 GraphMetadata 的 class 相关字段：
*   - classDefs: ClassDefInfo[] — classDef 累积
*   - clickEvents: ClassClickEvent[] — click 累积
*   - tooltips: Record<string, string> — classId → tooltip（从 click event 提取）
*   - namespaces: ClassNamespaceInfo[] — namespace 累积
*   - notes: ClassNoteInfo[] — note 累积
*   - directionValue / accTitleValue / accDescriptionValue — 覆盖式
*
* addClickEvent 内部根据 tooltip 非空情况同步累积到 tooltips（对齐 flowchart addClickEvent）。
* build() 返回 GraphMetadata，仅包含非空字段。
*/
var DefaultClassMetadataCollector = class {
	constructor() {
		this.classDefsValue = [];
		this.clickEventsValue = [];
		this.tooltipsValue = {};
		this.namespacesValue = [];
		this.notesValue = [];
	}
	addClassDef(classDef) {
		this.classDefsValue.push(classDef);
	}
	/**
	* 添加 click 事件
	*
	* 累积到 clickEvents，同时若 event.tooltip 非空则累积到 tooltips 映射。
	* 对齐 flowchart DefaultMetadataCollector.addClickEvent 行为。
	*/
	addClickEvent(click) {
		this.clickEventsValue.push(click);
		if (click.tooltip !== void 0) this.tooltipsValue[click.classId] = click.tooltip;
	}
	addTooltip(nodeId, tooltip) {
		this.tooltipsValue[nodeId] = tooltip;
	}
	addNamespace(namespace) {
		this.namespacesValue.push(namespace);
	}
	addNote(note) {
		this.notesValue.push(note);
	}
	setDirection(dir) {
		this.directionValue = dir;
	}
	setAccTitle(title) {
		this.accTitleValue = title;
	}
	setAccDescription(desc) {
		this.accDescriptionValue = desc;
	}
	getClassDefs() {
		return this.classDefsValue;
	}
	getClickEvents() {
		return this.clickEventsValue;
	}
	getTooltips() {
		return this.tooltipsValue;
	}
	getNamespaces() {
		return this.namespacesValue;
	}
	getNotes() {
		return this.notesValue;
	}
	getDirection() {
		return this.directionValue;
	}
	getAccTitle() {
		return this.accTitleValue;
	}
	getAccDescription() {
		return this.accDescriptionValue;
	}
	/**
	* 构建最终 GraphMetadata（仅包含非空字段）
	*/
	build() {
		const metadata = {};
		if (this.classDefsValue.length > 0) metadata.classDefs = [...this.classDefsValue];
		if (this.clickEventsValue.length > 0) metadata.classClickEvents = [...this.clickEventsValue];
		if (Object.keys(this.tooltipsValue).length > 0) metadata.classTooltips = { ...this.tooltipsValue };
		if (this.namespacesValue.length > 0) metadata.namespaces = [...this.namespacesValue];
		if (this.notesValue.length > 0) metadata.classNotes = [...this.notesValue];
		if (this.directionValue !== void 0) metadata.direction = this.directionValue;
		if (this.accTitleValue !== void 0) metadata.accTitle = this.accTitleValue;
		if (this.accDescriptionValue !== void 0) metadata.accDescription = this.accDescriptionValue;
		return metadata;
	}
};
/**
* class 专属 ConverterRegistry 实现
*
* parse 方向：
*   - 创建 ClassDefaultConverterContext + DefaultClassMetadataCollector
*   - 遍历 blocks，try/catch NamespaceStackError → BlockConvertError（不中断）
*   - dispatchParse: exhaustive switch 12 个 case + never check
*   - buildCanvas: 从 ctx 提取 nodes/edges，从 metadataCollector.build() 提取 metadata
*
* serialize 方向（7 步扫描，[一-6-补] 修订：新增顶层 DirectionBlock；L2-7 修订：新增 Note fallback）：
*   - 1. 顶层 DirectionBlock（从 metadata.direction ?? canvas.direction，[一-6-补] 修订）
*   - 2. AccTitle / AccDescription blocks（从 metadata）
*   - 3. Nodes DFS（按 parentId 分组深度优先遍历，namespace 嵌套产出 open/close）
*   - 3.5 Note from metadata.classNotes（fallback：当无 note 节点时从 metadata.classNotes 产出，L2-7 修订）
*   - 4. ClassDef blocks（从 metadata.classDefs）
*   - 5. ClassApply blocks（从 nodes.classNames，按 className 分组）
*   - 6. Style blocks（从 nodes.styles，按 styles 内容分组）
*   - 7. Click blocks（从 metadata.classClickEvents）
*
* 顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（[一-6-补] 修订）：
*   - classDiagram header 是固定字符串 `classDiagram`（无 direction 后缀，mermaid 官方不支持 `classDiagram TB`）
*   - 顶层 direction 必须作为独立 DirectionBlock 产出（对齐老路径 serializeClass 行为）
*   - 与 flowchart 不同（flowchart header 含 direction，Converter 不产出顶层 DirectionBlock）
* class-relation 边全部在顶层产出（class 边无 subgraphId 概念，source/target 是全局 classId）。
* note-edge 不产出（由 NoteConverter 处理 note 节点时内部推断 classId）。
*/
var ClassConverterRegistry = class {
	constructor() {
		this.lookup = new Map(classConverterEntries.map((entry) => [entry.type, entry]));
	}
	/**
	* parse：按 blockType 分发到对应 Converter.parseBlock
	*
	* - 产出型 block（class/relation/note/namespace-open）→ IModelBlockConverter.parseBlock → model（累加到 ctx）
	* - 副作用型 block → ISideEffectBlockConverter.parseBlock → void（副作用通过 ctx 受控方法承载）
	* - NamespaceStackError 转为 BlockConvertError 累积到 errors，不中断后续 block 处理
	*
	* @returns BlockConvertResult { canvas, errors }
	*/
	parseBlocks(blocks, diagramType) {
		if (diagramType !== "classDiagram") throw new Error(`ClassConverterRegistry only supports 'classDiagram', got '${diagramType}'`);
		const metadataCollector = new DefaultClassMetadataCollector();
		const ctx = new ClassDefaultConverterContext(metadataCollector);
		for (const block of blocks) try {
			this.dispatchParse(block, ctx);
		} catch (err) {
			if (err instanceof NamespaceStackError) ctx.addError(toBlockConvertError$1(err));
			else throw err;
		}
		const metadata = metadataCollector.build();
		return {
			canvas: this.buildCanvas(ctx, metadata),
			errors: [...ctx.getErrors()]
		};
	}
	/**
	* 构建 GraphCanvasState
	*
	* 从 ctx 提取 nodes/edges，从 metadata 提取 direction。
	* metadata 仅在非空时设置。
	*
	* direction 同步到顶层（单一数据源修复：metadata.direction 是方向唯一来源，
	* 同步到 canvas.direction 供 React Flow 直接读取）。
	*/
	buildCanvas(ctx, metadata) {
		const canvas = {
			diagramType: "classDiagram",
			nodes: ctx.getNodes(),
			edges: [...ctx.getEdges()],
			needsLayout: true
		};
		if (metadata.direction !== void 0) canvas.direction = metadata.direction;
		if (Object.keys(metadata).length > 0) canvas.metadata = metadata;
		return canvas;
	}
	/**
	* exhaustive switch 分发 parse（12 个 case + never check）
	*
	* 按 block.type 分发到对应 Converter.parseBlock，类型收窄保证类型安全。
	* default 分支的 never check 确保所有 case 已覆盖，新增 block 类型时编译期报错。
	*/
	dispatchParse(block, ctx) {
		switch (block.type) {
			case "class":
				this.requireConverter("class").parseBlock(block, ctx);
				break;
			case "relation":
				this.requireConverter("relation").parseBlock(block, ctx);
				break;
			case "note":
				this.requireConverter("note").parseBlock(block, ctx);
				break;
			case "namespace-open":
				this.requireConverter("namespace-open").parseBlock(block, ctx);
				break;
			case "namespace-close":
				this.requireConverter("namespace-close").parseBlock(block, ctx);
				break;
			case "class-apply":
				this.requireConverter("class-apply").parseBlock(block, ctx);
				break;
			case "style":
				this.requireConverter("style").parseBlock(block, ctx);
				break;
			case "classDef":
				this.requireConverter("classDef").parseBlock(block, ctx);
				break;
			case "click":
				this.requireConverter("click").parseBlock(block, ctx);
				break;
			case "direction":
				this.requireConverter("direction").parseBlock(block, ctx);
				break;
			case "accTitle":
				this.requireConverter("accTitle").parseBlock(block, ctx);
				break;
			case "accDescription": this.requireConverter("accDescription").parseBlock(block, ctx);
		}
	}
	/**
	* serialize：从 canvas 产出所有 blocks（8 步扫描，[一-6-补] 修订：新增顶层 DirectionBlock；L2-7 修订：新增 Note fallback）
	*
	* - 1. 顶层 DirectionBlock（从 metadata.direction ?? canvas.direction，[一-6-补] 修订）
	* - 2. 全局指令：AccTitle / AccDescription（从 metadata）
	* - 3. Nodes DFS（按 parentId 分组深度优先遍历，namespace 嵌套产出 open/close）
	* - 3.5 Note from metadata.classNotes（fallback：当无 note 节点时从 metadata.classNotes 产出，L2-7 修订）
	* - 4. ClassDef blocks（从 metadata.classDefs）
	* - 5. ClassApply blocks（从 nodes.classNames，按 className 分组）
	* - 6. Style blocks（从 nodes.styles，按 styles 内容分组）
	* - 7. Click blocks（从 metadata.classClickEvents）
	*
	* 顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（[一-6-补] 修订）：
	*   - classDiagram header 是固定字符串 `classDiagram`（无 direction 后缀，mermaid 官方不支持 `classDiagram TB`）
	*   - 顶层 direction 必须作为独立 DirectionBlock 产出（对齐老路径 serializeClass 行为）
	*   - direction 数据源优先级：metadata.direction（权威）→ canvas.direction（顶层冗余字段）
	*   - 与 flowchart 不同（flowchart header 含 direction，Converter 不产出顶层 DirectionBlock）
	* class-relation 边全部在顶层产出（class 边无 subgraphId 概念）。
	* note-edge 不产出（由 NoteConverter 处理 note 节点时内部推断 classId）。
	* Note fallback（L2-7 修订）：当 canvas 无 note 节点（type='class-note'）但有 metadata.classNotes 时，
	*   从 metadata.classNotes 产出 NoteBlock，保证数据不丢失（兼容老路径数据）。
	*/
	serialize(canvas, diagramType) {
		if (diagramType !== "classDiagram") throw new Error(`ClassConverterRegistry only supports 'classDiagram', got '${diagramType}'`);
		if (canvas.diagramType !== "classDiagram") throw new Error(`Expected GraphCanvasState with diagramType 'classDiagram', got '${canvas.diagramType}'`);
		const graphCanvas = canvas;
		const metadata = graphCanvas.metadata ?? {};
		const blocks = [];
		const ctx = new ClassDefaultConverterContext(new DefaultClassMetadataCollector());
		for (const edge of graphCanvas.edges) ctx.registerEdge(edge);
		const direction = metadata.direction;
		if (direction !== void 0) blocks.push(createDirectionBlock$2(direction));
		if (metadata.accTitle !== void 0) blocks.push(createAccTitleBlock$2(metadata.accTitle));
		if (metadata.accDescription !== void 0) blocks.push(createAccDescriptionBlock$2(metadata.accDescription));
		const nodesByParent = this.groupNodesByParent(graphCanvas.nodes);
		this.dfsSerialize(void 0, 0, nodesByParent, ctx, blocks);
		if (!graphCanvas.nodes.some((n) => n.type === "class-note") && metadata.classNotes !== void 0) for (const note of metadata.classNotes) blocks.push(createNoteBlockFromInfo(note));
		if (metadata.classDefs !== void 0) for (const classDef of metadata.classDefs) blocks.push(createClassDefBlock$2(classDef));
		const classApplyBlocks = this.serializeClassApplyBlocks(graphCanvas.nodes);
		blocks.push(...classApplyBlocks);
		const styleBlocks = this.serializeStyleBlocks(graphCanvas.nodes);
		blocks.push(...styleBlocks);
		if (metadata.classClickEvents !== void 0) for (const event of metadata.classClickEvents) blocks.push(createClickBlock$1(event));
		return blocks;
	}
	/**
	* DFS 深度优先遍历产出 class/relation/note/namespace-open/namespace-close blocks
	*
	* 遍历顺序（M3 修订：对齐官方示例）：
	*   - 顶层入口（parentId === undefined）先产出所有 class-relation 边（关系骨架在前）
	*   - 然后遍历当前层级的子节点：
	*     - 若为 namespace（type='class-namespace'）：NamespaceOpenBlock → 递归 → NamespaceCloseBlock
	*     - 若为 class-box（type='class-box'）：ClassBlock
	*     - 若为 note（type='class-note'）：NoteBlock
	*   - class-relation 边仅顶层产出（class 边无 subgraphId 概念）
	*
	* 修订原因：原实现"先 children 后 relation"导致官方示例（`Animal <|-- Duck` 在前，class 在后）
	* 序列化后变成"先 class 后 relation"。修订后与官方示例顺序一致。
	*
	* indent 计算：depth × 2（namespace 嵌套深度 × 2）
	* NamespaceCloseBlock 的 indent 与 NamespaceOpenBlock 相同（外层 indent）。
	*/
	dfsSerialize(parentId, depth, nodesByParent, ctx, blocks) {
		const indent = depth * 2;
		if (parentId === void 0) {
			const relationConverter = this.requireConverter("relation");
			for (const edge of ctx.getEdges()) {
				if (edge.type !== "class-relation") continue;
				const relationBlock = relationConverter.serializeBlock(edge, ctx);
				if (relationBlock !== null) blocks.push({
					...relationBlock,
					indent
				});
			}
		}
		const children = nodesByParent.get(parentId) ?? [];
		for (const node of children) if (node.type === "class-namespace") {
			const openBlock = this.requireConverter("namespace-open").serializeBlock(node, ctx);
			if (openBlock !== null) blocks.push({
				...openBlock,
				indent
			});
			this.dfsSerialize(node.id, depth + 1, nodesByParent, ctx, blocks);
			blocks.push(createNamespaceCloseBlock(node.id, indent));
		} else if (node.type === "class-box") {
			const classBlock = this.requireConverter("class").serializeBlock(node, ctx);
			if (classBlock !== null) blocks.push({
				...classBlock,
				indent
			});
		} else if (node.type === "class-note") {
			const noteBlock = this.requireConverter("note").serializeBlock(node, ctx);
			if (noteBlock !== null) blocks.push({
				...noteBlock,
				indent
			});
		}
	}
	/**
	* 按 parentId 分组节点（undefined = 顶层）
	* 保留 canvas.nodes 的原始顺序（Map + push 保证）。
	*/
	groupNodesByParent(nodes) {
		const map = /* @__PURE__ */ new Map();
		for (const node of nodes) {
			const parentId = node.parentId;
			const existing = map.get(parentId);
			if (existing === void 0) map.set(parentId, [node]);
			else existing.push(node);
		}
		return map;
	}
	/**
	* 序列化 ClassApply blocks
	*
	* 扫描所有节点的 data.classNames，按 className 分组，
	* 每个 className 产出一个 ClassCssApplyBlock（含所有应用该 class 的节点 ID）。
	* 对齐 flowchart serializeClassApplyBlocks 模式。
	*/
	serializeClassApplyBlocks(nodes) {
		const classToNodes = /* @__PURE__ */ new Map();
		for (const node of nodes) {
			const classNames = node.data.classNames;
			if (classNames === void 0 || classNames.length === 0) continue;
			for (const className of classNames) {
				const existing = classToNodes.get(className);
				if (existing === void 0) classToNodes.set(className, [node.id]);
				else existing.push(node.id);
			}
		}
		const blocks = [];
		for (const [className, classIds] of classToNodes) blocks.push(createClassApplyBlock$2(classIds, className));
		return blocks;
	}
	/**
	* 序列化 Style blocks
	*
	* 扫描所有节点的 data.styles，按 styles 内容分组（相同 styles 的节点合并为一个 ClassStyleBlock）。
	* 注意：class 的 ClassStyleBlock 字段是 classId（单个），不是 nodeIds（数组），
	* 所以每个有 styles 的节点产出独立的 ClassStyleBlock（不合并）。
	* 使用 \0 作为分隔符构建 key（避免 styles 内容冲突，对齐 flowchart）。
	*/
	serializeStyleBlocks(nodes) {
		const blocks = [];
		for (const node of nodes) {
			const styles = node.data.styles;
			if (styles === void 0 || styles.length === 0) continue;
			blocks.push(createStyleBlock$2(node.id, styles));
		}
		return blocks;
	}
	requireConverter(type) {
		const entry = this.lookup.get(type);
		if (entry === void 0) throw new Error(`Converter not registered for block type: ${type}`);
		return entry.converter;
	}
};
//#endregion
//#region src/serializer/converter/er/subgraph-converter.ts
/**
* subgraph 栈失配错误
*
* 场景：ErSubgraphCloseBlock 的 subgraphId 与栈顶不匹配（LIFO 校验失败）
* 处理：转为 BlockConvertError 累积到 errors 数组，不中断后续 block 处理
*
* 对齐 flowchart SubgraphStackError / class NamespaceStackError：携带 block 字段供 toBlockConvertError 提取
*/
var SubgraphStackError = class extends Error {
	constructor(block, expectedId) {
		super(`Subgraph stack mismatch: closing '${block.subgraphId}' but expected '${expectedId ?? "undefined"}'`);
		this.name = "SubgraphStackError";
		this.block = block;
		this.actualId = block.subgraphId;
		this.expectedId = expectedId;
	}
};
/**
* 构造 BlockConvertError（从 SubgraphStackError）
*
* 供 ErConverterRegistry.parseBlocks 的 catch 块调用
*/
function toBlockConvertError(err) {
	return {
		block: err.block,
		message: err.message
	};
}
/**
* 生成 subgraph open block 的 rawText（对齐 er.jison 官方语法 `subgraph <id> ... end`）
*
* 格式（多行，内部缩进 2 空格，不含 close）：
*   ```
*   subgraph Title
*     direction LR
*     NODE1
*     NODE2
*   ```
*
* title 处理：直接输出 id（对齐 er.jison subgraph 语法 `subgraph <id>`，无引号无花括号）
* direction：仅 dir 存在时输出 `  direction ${dir}`
* 节点引用：遍历 nodes，每行输出 `  ${nodeId}`
*
* 不含 close 行（`end`），由 ErSubgraphCloseBlock 单独产出。
* 嵌套 subgraph 在 ErSubgraphOpenBlock 和 ErSubgraphCloseBlock 之间由 Registry DFS 产出。
*/
function formatSubgraphOpen(title, dir, nodes) {
	const lines = [];
	lines.push(`subgraph ${title}`);
	if (dir !== void 0) lines.push(`  direction ${dir}`);
	for (const nodeId of nodes) lines.push(`  ${nodeId}`);
	return lines.join("\n");
}
/**
* ErSubgraphOpenBlock ↔ MermaidNode 双向转换器
*
* parse 方向产出 subgraph 节点（type='er-subgraph'，isSubgraph=true），
* 并 pushParent 入栈，后续 entity 节点 parentId 由 block.parentId 决定（模块1 已前置）。
*
* 设计点4 关键差异（模块1 方案B 增强）：
*   - 模块1 已通过 parentDB 前置计算 parentId，Converter 直接读取 block.parentId 设置到 node.parentId
*   - pushParent 仅用于 subgraph-open/close 块的 LIFO 栈管理校验
*   - currentParent() 在 ER Converter 中不被主动调用
*/
var ErSubgraphOpenConverter = class {
	/** parse：ErSubgraphOpenBlock → MermaidNode，通过 ctx.registerNode 注册 + ctx.pushParent 入栈 */
	parseBlock(block, context) {
		const data = {
			label: block.title,
			shape: "er-subgraph",
			isSubgraph: true,
			...block.dir !== void 0 ? { dir: block.dir } : {},
			...block.nodes.length > 0 ? { subgraphNodes: [...block.nodes] } : {},
			...block.sourceLine !== void 0 ? { _sourceLine: block.sourceLine } : {}
		};
		const node = {
			id: block.subgraphId,
			type: "er-subgraph",
			position: {
				x: 0,
				y: 0
			},
			data,
			...block.parentId !== void 0 ? {
				parentId: block.parentId,
				extent: "parent"
			} : {}
		};
		context.registerNode(node);
		context.pushParent(block.subgraphId);
		context.metadataCollector.addErSubgraph({
			id: block.subgraphId,
			title: block.title,
			nodes: [...block.nodes],
			...block.dir !== void 0 ? { dir: block.dir } : {},
			...block.parentId !== void 0 ? { parentId: block.parentId } : {}
		});
		return node;
	}
	/** serialize：MermaidNode → ErSubgraphOpenBlock（含 rawText，对齐设计点1） */
	serializeBlock(model, _context) {
		if (model.type !== "er-subgraph") return null;
		const data = model.data;
		const title = data.label ?? model.id;
		const dir = data.dir;
		const nodes = data.subgraphNodes ?? [];
		const rawText = formatSubgraphOpen(title, dir, nodes);
		return {
			type: "subgraph-open",
			sourceLine: data._sourceLine,
			rawText,
			indent: 0,
			subgraphId: model.id,
			title,
			dir,
			nodes: [...nodes],
			parentId: model.parentId
		};
	}
};
/**
* ErSubgraphCloseBlock 副作用型转换器
*
* parse 方向：ctx.popParent（LIFO 校验，失配抛 SubgraphStackError）
* 无 serialize 方向（ErSubgraphCloseBlock 由 Registry 在 DFS 扫描时自动产出）
*/
var ErSubgraphCloseConverter = class {
	/** parse：ErSubgraphCloseBlock → ctx.popParent（LIFO 校验） */
	parseBlock(block, context) {
		const expectedId = context.popParent();
		if (expectedId !== block.subgraphId) throw new SubgraphStackError(block, expectedId);
	}
};
//#endregion
//#region src/serializer/converter/er/style-converter.ts
/**
* ErClassApplyBlock 副作用型转换器
*
* parse 方向：
*   1. 对每个 id 调 ctx.updateNode，将 block.classNames 追加到 data.classNames（去重，过滤 'default'）
*   2. metadataCollector.addErClassApply({ids, classNames})（保留原始分组供 serialize 还原）
*
* ER class-apply 语法支持多目标多类名：
*   `class A,B c1,c2` → A 和 B 都应用 c1 和 c2
*
* 'default' 类过滤：'default' 是 ErDB 的隐式基类，显式应用为 no-op，
* 对齐 entity-converter.cssClasses 的 'default' 过滤行为。
*/
var ErClassApplyConverter = class {
	parseBlock(block, context) {
		const filteredClassNames = block.classNames.filter((cn) => cn !== "default");
		for (const id of block.ids) context.updateNode(id, (node) => {
			const merged = [...node.data.classNames ?? []];
			for (const cn of filteredClassNames) if (!merged.includes(cn)) merged.push(cn);
			node.data.classNames = merged;
		});
		if (filteredClassNames.length > 0) {
			const applyInfo = {
				ids: [...block.ids],
				classNames: filteredClassNames
			};
			context.metadataCollector.addErClassApply(applyInfo);
		}
	}
};
/**
* ErStyleBlock 副作用型转换器
*
* parse 方向：对每个 id 调 ctx.updateNode，将 block.styles 追加到 data.styles
*
* 不构建 data.style（由 buildCanvas 阶段 mergeErNodeStyles 统一构建），
* 对齐 flowchart/class StyleConverter 的延迟合并策略。
*
* ER style 语法支持多目标：
*   `style A,B fill:#f00,stroke:#333` → A 和 B 都应用这些样式
*/
var ErStyleConverter = class {
	parseBlock(block, context) {
		for (const id of block.ids) context.updateNode(id, (node) => {
			const existing = node.data.styles ?? [];
			node.data.styles = [...existing, ...block.styles];
		});
	}
};
/**
* ErClassDefBlock 副作用型转换器
*
* parse 方向：metadataCollector.addErClass({id, styles, textStyles})
* 累积到 metadata.erClasses（ErClassInfo[]）
*
* ER classDef 语法：
*   `classDef className style1,style2` → 定义可复用的 CSS 类
*/
var ErClassDefConverter = class {
	parseBlock(block, context) {
		const classInfo = {
			id: block.className,
			styles: [...block.styles],
			textStyles: [...block.textStyles]
		};
		context.metadataCollector.addErClass(classInfo);
	}
};
/**
* 合并 cssCompiledStyles + data.styles 到节点的 data.style
*
* 合并优先级（对齐老 er-parser.ts mapAstToCanvasState 的 allStyles 逻辑）：
*   1. 先合并 cssCompiledStyles（模块1 前置计算的 classDef 编译样式）
*   2. 再合并 data.styles（ErStyleConverter 追加的内联样式，覆盖 classDef）
*
* 与 flowchart mergeNodeStyles 的差异：
*   - flowchart 需要 flowClassDefs 参数查表计算 classDef 样式（classDef 未前置编译）
*   - ER 的 cssCompiledStyles 已由模块1 前置编译，无需查表，直接 parseStylesToNodeStyle
*
* 该函数在 ErConverterRegistry.buildCanvas 阶段调用（post-process），
* 构建 data.style NodeStyle 对象供渲染层（模块4）和编辑器（模块5）消费。
*
* @param node - 待合并样式的节点（mutate node.data.style）
*/
function mergeErNodeStyles(node) {
	const mergedStyle = {};
	let hasAnyStyle = false;
	const cssCompiledStyles = node.data.cssCompiledStyles;
	if (cssCompiledStyles !== void 0 && cssCompiledStyles.length > 0) {
		const compiledStyle = parseStylesToNodeStyle(cssCompiledStyles);
		if (compiledStyle !== void 0) {
			Object.assign(mergedStyle, compiledStyle);
			hasAnyStyle = true;
		}
	}
	const directStyles = node.data.styles;
	if (directStyles !== void 0 && directStyles.length > 0) {
		const directStyle = parseStylesToNodeStyle(directStyles);
		if (directStyle !== void 0) {
			Object.assign(mergedStyle, directStyle);
			hasAnyStyle = true;
		}
	}
	if (hasAnyStyle) node.data.style = mergedStyle;
}
//#endregion
//#region src/serializer/converter/er/entity-converter.ts
/**
* ErAttributeBlock → NodeAttribute（parse 方向）
*
* 字段映射：
*   - type/name 直接拷贝
*   - keys: readonly ErAttributeKeyType[] → ERAttributeKey[]（类型相同，拷贝去 readonly）
*   - comment: 空字符串视为 undefined（对齐 NodeAttribute.comment 语义）
*/
function toNodeAttribute(attr) {
	const nodeAttr = {
		type: attr.type,
		name: attr.name,
		keys: [...attr.keys]
	};
	if (attr.comment !== "") nodeAttr.comment = attr.comment;
	return nodeAttr;
}
/**
* NodeAttribute → ErAttributeBlock（serialize 方向）
*
* 字段映射（反向）：
*   - type/name 直接拷贝
*   - keys: ERAttributeKey[] → ErAttributeKeyType[]（类型相同，拷贝去 readonly）
*   - comment: undefined 转为空字符串（对齐 ErAttributeBlock.comment 语义）
*/
function fromNodeAttribute(attr) {
	return {
		type: attr.type,
		name: attr.name,
		keys: [...attr.keys ?? []],
		comment: attr.comment ?? ""
	};
}
/**
* 序列化单个属性为 Mermaid 属性行（对齐老路径 entity-serializer.ts serializeAttribute）
*
* 格式: `type name keys comment`
*   - keys: PK/FK/UK，多个用逗号分隔
*   - comment: 用双引号包裹（如 `"订单ID"`），内部双引号转义
*/
function serializeAttribute(attr) {
	const parts = [attr.type, attr.name];
	if (attr.keys && attr.keys.length > 0) parts.push(attr.keys.join(","));
	if (attr.comment) parts.push(`"${escapeStringLiteral(attr.comment)}"`);
	return parts.join(" ");
}
/**
* 生成 entity block 的 rawText（不含 block 级缩进，由 Assembler 应用）
*
* 格式（对齐老路径 entity-serializer.ts serializeEntity）：
*   - 无属性：单行 `ENTITY_NAME`（含别名 `ENTITY_NAME[alias]`）
*   - 有属性：多行 `ENTITY_NAME[alias] {\n  type name PK "comment"\n}`
*
* 内部属性缩进 2 空格（entity 体缩进），block 级缩进由 Assembler 处理。
*/
function formatEntityBlock(entityName, alias, attributes) {
	const entityHeader = alias !== "" ? `${entityName}[${alias}]` : entityName;
	if (attributes.length === 0) return entityHeader;
	const lines = [];
	lines.push(`${entityHeader} {`);
	for (const attr of attributes) lines.push(`  ${serializeAttribute(attr)}`);
	lines.push("}");
	return lines.join("\n");
}
/**
* ErEntityBlock ↔ MermaidNode 双向转换器
*
* parse 方向产出 entity 节点（type='er-box'，shape='er-box'），
* parentId 由 block.parentId 决定（模块1 已前置，无需 ctx.currentParent()）。
*
* 设计点7：entity attributes/alias 映射
*   - ErEntityBlock.attributes[] → MermaidNodeData.attributes[]（NodeAttribute[]）
*   - ErEntityBlock.alias（空字符串视为 undefined）
*   - ErEntityBlock.cssClasses → MermaidNodeData.classNames（按空格拆分，过滤 'default'）
*   - ErEntityBlock.cssCompiledStyles → MermaidNodeData.cssCompiledStyles（直接拷贝）
*   - ErEntityBlock.entityName → MermaidNode.id + MermaidNodeData.label
*   - ErEntityBlock.parentId → MermaidNode.parentId
*/
var ErEntityConverter = class {
	/** parse：ErEntityBlock → MermaidNode，通过 ctx.registerNode 注册 */
	parseBlock(block, context) {
		const attributes = block.attributes.map(toNodeAttribute);
		const cssClasses = block.cssClasses.trim();
		const classNames = cssClasses !== "" ? cssClasses.split(/\s+/).filter((c) => c !== "default") : void 0;
		const alias = block.alias !== "" ? block.alias : void 0;
		const data = {
			label: block.entityName,
			shape: "er-box",
			...attributes.length > 0 ? { attributes } : {},
			...alias !== void 0 ? { alias } : {},
			...classNames !== void 0 && classNames.length > 0 ? { classNames } : {},
			...block.cssCompiledStyles.length > 0 ? { cssCompiledStyles: [...block.cssCompiledStyles] } : {},
			...block.sourceLine !== void 0 ? { _sourceLine: block.sourceLine } : {}
		};
		const node = {
			id: block.entityName,
			type: "er-box",
			position: {
				x: 0,
				y: 0
			},
			data,
			...block.parentId !== void 0 ? { parentId: block.parentId } : {}
		};
		context.registerNode(node);
		return node;
	}
	/** serialize：MermaidNode → ErEntityBlock（含 rawText，对齐设计点1） */
	serializeBlock(model, _context) {
		if (model.type !== "er-box" && model.data.shape !== "er-box") return null;
		const data = model.data;
		const entityName = model.id;
		const alias = data.alias ?? "";
		const attributes = data.attributes ?? [];
		const cssClasses = (data.classNames ?? []).join(" ");
		const cssCompiledStyles = data.cssCompiledStyles ?? [];
		const rawText = formatEntityBlock(entityName, alias, attributes);
		return {
			type: "entity",
			sourceLine: data._sourceLine,
			rawText,
			indent: 0,
			entityName,
			alias,
			attributes: attributes.map(fromNodeAttribute),
			cssClasses,
			cssCompiledStyles: [...cssCompiledStyles],
			parentId: model.parentId
		};
	}
};
//#endregion
//#region src/serializer/converter/er/relationship-converter.ts
/**
* CARDINALITY 常量值 → ERCardinality 字面量（parse 方向使用）
*
* 复用 constants.ts 已有的 CARDINALITY_TO_ER_CARDINALITY 映射，
* 包装为类型安全的查询函数。
*/
function resolveCardinality(card) {
	const mapped = CARDINALITY_TO_ER_CARDINALITY[card];
	if (mapped === void 0) throw new Error(`Unknown cardinality: ${card}`);
	return mapped;
}
/**
* IDENTIFICATION 常量值 → ERIdentification 字面量（parse 方向使用）
*
* 复用 constants.ts 已有的 IDENTIFICATION_TO_ER_IDENTIFICATION 映射。
*/
function resolveIdentification(id) {
	const mapped = IDENTIFICATION_TO_ER_IDENTIFICATION[id];
	if (mapped === void 0) throw new Error(`Unknown identification: ${id}`);
	return mapped;
}
/**
* ERCardinality 字面量 → CARDINALITY 常量值（serialize 方向反向映射）
*
* 由 CARDINALITY_TO_ER_CARDINALITY 反转生成。
*/
const REVERSE_CARDINALITY_MAP = {
	"zero-or-one": CARDINALITY.ZERO_OR_ONE,
	"zero-or-more": CARDINALITY.ZERO_OR_MORE,
	"one-or-more": CARDINALITY.ONE_OR_MORE,
	"only-one": CARDINALITY.ONLY_ONE,
	"md-parent": CARDINALITY.MD_PARENT
};
/**
* ERIdentification 字面量 → IDENTIFICATION 常量值（serialize 方向反向映射）
*
* 由 IDENTIFICATION_TO_ER_IDENTIFICATION 反转生成。
*/
const REVERSE_IDENTIFICATION_MAP = {
	identifying: IDENTIFICATION.IDENTIFYING,
	"non-identifying": IDENTIFICATION.NON_IDENTIFYING
};
/**
* ERCardinality 字面量 → A 端基数符号（线型左侧，source 端）
*
* 对齐官方 erDiagram.jison 语法：
*   - 'zero-or-one':  |o  （A 端零或一）
*   - 'zero-or-more': }o  （A 端零或多，左侧形式）
*   - 'one-or-more':  }|  （A 端一或多，左侧形式）
*   - 'only-one':     ||  （A 端仅一，双向相同）
*   - 'md-parent':    u   （A 端多对多父节点，仅 source 端有效）
*
* 注：jison 解析时 }o/}| 和 o{/|{ 都会被识别为相同基数（双向兼容），
*     但序列化时 A 端输出左侧形式（}o/}|）以对齐官方示例。
*     MD_PARENT 输出 'u'（对齐 constants.ts CARDINALITY_TO_SYMBOL）。
*/
const ER_CARDINALITY_TO_SYMBOL_A = {
	"zero-or-one": "|o",
	"zero-or-more": "}o",
	"one-or-more": "}|",
	"only-one": "||",
	"md-parent": "u"
};
/**
* ERCardinality 字面量 → B 端基数符号（线型右侧，target 端）
*
* 对齐官方 erDiagram.jison 语法：
*   - 'zero-or-one':  o|  （B 端零或一）
*   - 'zero-or-more': o{  （B 端零或多，右侧形式）
*   - 'one-or-more':  |{  （B 端一或多，右侧形式）
*   - 'only-one':     ||  （B 端仅一，双向相同）
*   - 'md-parent':    不允许（jison 语法 u(?=[.\\-|]) 仅在 source 端匹配）
*
* 设计偏差修订：原设计文档 ER_CARDINALITY_TO_SYMBOL_B['md-parent'] = '+{' 是错误的，
*   jison 语法中不存在 '+{' 符号。MD_PARENT 仅 A 端有效，B 端出现时返回空字符串
*   （serialize 方向调用方应校验 md-parent 不出现在 B 端）。
*/
const ER_CARDINALITY_TO_SYMBOL_B = {
	"zero-or-one": "o|",
	"zero-or-more": "o{",
	"one-or-more": "|{",
	"only-one": "||",
	"md-parent": ""
};
/**
* ERIdentification 字面量 → 线型符号（serialize 方向使用）
*
* 对齐官方 erDiagram.jison 语法：
*   - 'identifying':     -- （实线，标识关系）
*   - 'non-identifying': .. （虚线，非标识关系）
*/
const ER_IDENTIFICATION_TO_SYMBOL = {
	identifying: "--",
	"non-identifying": ".."
};
/** 角色标签中需要用双引号包裹的字符（空格、双引号、花括号、方括号、竖线、冒号） */
const ROLE_SPECIAL_CHARS = /[\s"{}\[\]|:]/;
/**
* 格式化角色标签（对齐老路径 relationship-serializer.ts formatRole）
*
* 规则:
*   - 包含空格或特殊字符时，用双引号包裹（如 `"subscribed via"`）
*   - 内部双引号转义为 `\"`
*   - 简单标识符直接输出（如 `places`）
*/
function formatRole(role) {
	if (ROLE_SPECIAL_CHARS.test(role)) return `"${escapeStringLiteral(role)}"`;
	return role;
}
/**
* 生成 relationship block 的 rawText（对齐老路径 relationship-serializer.ts 行为）
*
* 格式: `SOURCE cardA lineType cardB TARGET : role`
*   - cardA: A 端基数符号（左侧，如 `||`、`}o`）
*   - lineType: erIdentification 的符号（`--` 实线 / `..` 虚线）
*   - cardB: B 端基数符号（右侧，如 `o{`、`|{`）
*   - role: 角色标签（可选，含空格时用双引号包裹）
*
* 示例:
*   - `CUSTOMER ||--o{ ORDER : places`
*   - `A |o..o{ B : "relates to"`
*   - `USER }|--|| PROFILE`（无角色标签）
*/
function formatRelationship(edge) {
	const { source, target, data } = edge;
	const cardA = data.erCardA ?? "only-one";
	const cardB = data.erCardB ?? "only-one";
	const identification = data.erIdentification ?? "identifying";
	const cardASymbol = ER_CARDINALITY_TO_SYMBOL_A[cardA];
	const cardBSymbol = ER_CARDINALITY_TO_SYMBOL_B[cardB];
	const relationSymbol = `${cardASymbol}${ER_IDENTIFICATION_TO_SYMBOL[identification]}${cardBSymbol}`;
	const role = data.erRoleA ?? data.label;
	return `${source} ${relationSymbol} ${target}${role ? ` : ${formatRole(role)}` : ""}`;
}
/**
* ErRelationshipBlock ↔ MermaidEdge 双向转换器
*
* 双端基数完整对称（erCardA/erCardB/erRoleA/erIdentification），
* 端点保留原始 name（不替换为 entity.id）。
*/
var ErRelationshipConverter = class {
	/** parse：ErRelationshipBlock → MermaidEdge，通过 ctx.registerEdge 注册 */
	parseBlock(block, context) {
		const edgeId = `er-edge-${context.getEdges().length}`;
		const erCardA = resolveCardinality(block.cardB);
		const erCardB = resolveCardinality(block.cardA);
		const erIdentification = resolveIdentification(block.relType);
		const edgeStyle = block.relType === IDENTIFICATION.IDENTIFYING ? "line" : "dotted";
		const erRoleA = block.roleA !== "" ? block.roleA : void 0;
		const data = {
			edgeStyle,
			...erRoleA !== void 0 ? {
				label: erRoleA,
				erRoleA
			} : {},
			erCardA,
			erCardB,
			erIdentification,
			...block.sourceLine !== void 0 ? { _sourceLine: block.sourceLine } : {}
		};
		const edge = {
			id: edgeId,
			source: block.entityA,
			target: block.entityB,
			type: "er-relation",
			data
		};
		context.registerEdge(edge);
		return edge;
	}
	/** serialize：MermaidEdge → ErRelationshipBlock（含 rawText，对齐设计点1） */
	serializeBlock(model, _context) {
		if (model.type !== "er-relation") return null;
		const data = model.data;
		const erCardA = data.erCardA ?? "only-one";
		const erCardB = data.erCardB ?? "only-one";
		const erIdentification = data.erIdentification ?? "identifying";
		if (erCardB === "md-parent") throw new Error(`ER relationship serialize error: erCardB cannot be 'md-parent' (only valid on A side). Edge: ${model.source} -> ${model.target}`);
		const cardA = REVERSE_CARDINALITY_MAP[erCardB];
		const cardB = REVERSE_CARDINALITY_MAP[erCardA];
		const relType = REVERSE_IDENTIFICATION_MAP[erIdentification];
		const roleA = data.erRoleA ?? "";
		const rawText = formatRelationship(model);
		return {
			type: "relationship",
			sourceLine: data._sourceLine,
			rawText,
			indent: 0,
			entityA: model.source,
			roleA,
			entityB: model.target,
			cardA,
			cardB,
			relType
		};
	}
};
//#endregion
//#region src/serializer/converter/er/direction-converter.ts
/**
* ErDirectionBlock 副作用型转换器
*
* parse 方向：调 metadataCollector.setDirection，累积到 metadata.direction
* buildCanvas 阶段同步到顶层 canvas.direction（单一数据源修复）
*/
var ErDirectionConverter = class {
	parseBlock(block, context) {
		context.metadataCollector.setDirection(block.dir);
	}
};
//#endregion
//#region src/serializer/converter/er/title-converter.ts
/**
* ErAccTitleBlock 副作用型转换器
*
* parse 方向：调 metadataCollector.setAccTitle，累积到 metadata.accTitle
*/
var ErAccTitleConverter = class {
	parseBlock(block, context) {
		context.metadataCollector.setAccTitle(block.accTitle);
	}
};
/**
* ErAccDescriptionBlock 副作用型转换器
*
* parse 方向：调 metadataCollector.setAccDescription，累积到 metadata.accDescription
*/
var ErAccDescriptionConverter = class {
	parseBlock(block, context) {
		context.metadataCollector.setAccDescription(block.accDescription);
	}
};
//#endregion
//#region src/serializer/converter/er/index.ts
const entityConverter = new ErEntityConverter();
const relationshipConverter = new ErRelationshipConverter();
const subgraphOpenConverter = new ErSubgraphOpenConverter();
const subgraphCloseConverter = new ErSubgraphCloseConverter();
const classApplyConverter = new ErClassApplyConverter();
const styleConverter = new ErStyleConverter();
const classDefConverter = new ErClassDefConverter();
const directionConverter = new ErDirectionConverter();
const accTitleConverter = new ErAccTitleConverter();
const accDescriptionConverter = new ErAccDescriptionConverter();
/**
* er Converter 注册表
*
* 按 ErBlockType 完整覆盖 10 种 ErBlockConverterEntry：
*   - 产出型（3）：entity/relationship/subgraph-open → IModelBlockConverter 双向
*   - 结构型（1）：subgraph-close → ISideEffectBlockConverter 仅 parse
*   - 指令型（2）：class-apply/style → ISideEffectBlockConverter 仅 parse
*   - 全局指令型（4）：classDef/direction/accTitle/accDescription → ISideEffectBlockConverter 仅 parse
*
* ErConverterRegistry 构造函数消费此数组构建 blockType → entry 查找表，
* dispatchParse 按 block.type 收窄分发，requireConverter 函数重载返回精确 Converter 类型。
*/
const erConverterEntries = [
	{
		type: "entity",
		converter: entityConverter
	},
	{
		type: "relationship",
		converter: relationshipConverter
	},
	{
		type: "subgraph-open",
		converter: subgraphOpenConverter
	},
	{
		type: "subgraph-close",
		converter: subgraphCloseConverter
	},
	{
		type: "class-apply",
		converter: classApplyConverter
	},
	{
		type: "style",
		converter: styleConverter
	},
	{
		type: "classDef",
		converter: classDefConverter
	},
	{
		type: "direction",
		converter: directionConverter
	},
	{
		type: "accTitle",
		converter: accTitleConverter
	},
	{
		type: "accDescription",
		converter: accDescriptionConverter
	}
];
//#endregion
//#region src/serializer/converter/er/registry.ts
/**
* 创建前向引用默认节点（er-box 类型）
*
* 场景：ErStyleBlock/ErClassApplyBlock 可能出现在 ErEntityBlock 之前
* （如 `style A fill:#fff` 在 `ENTITY_A` 之前）。
* 对齐 flowchart/class createDefaultNode 行为：隐式创建节点，后续 registerNode 通过 merge 合并字段。
*
* 默认节点的 styles/classNames 为 undefined（不覆盖已有字段），
* label 回退为 nodeId（对齐 flowchart/class 行为）。
*/
function createDefaultNode$1(nodeId) {
	return {
		id: nodeId,
		type: "er-box",
		position: {
			x: 0,
			y: 0
		},
		data: {
			label: nodeId,
			shape: "er-box",
			isSubgraph: false
		}
	};
}
/**
* 合并两个 MermaidNode（incoming 非 undefined 字段覆盖 existing）
*
* id 是主键，永不变化。
* data 字段通过 mergeNodeData 深层合并（incoming 非 undefined 字段覆盖 existing）。
* parentId 由 incoming 优先（ER 不会在边定义时顺便更新节点，无需 flowchart 的 deepest-wins 决策）。
* 其他顶层可选字段（extent/selected 等）按 incoming 非 undefined 覆盖。
*/
function mergeNode$1(existing, incoming) {
	const incomingRecord = incoming;
	const mergedTop = { ...existing };
	for (const key of Object.keys(incomingRecord)) {
		if (key === "data" || key === "id") continue;
		const value = incomingRecord[key];
		if (value !== void 0) mergedTop[key] = value;
	}
	const result = mergedTop;
	result.id = existing.id;
	result.data = mergeNodeData$1(existing.data, incoming.data);
	return result;
}
/**
* 合并两个 MermaidNodeData（incoming 非 undefined 字段覆盖 existing）
*
* 遍历 incoming 的所有 key，非 undefined 的值覆盖 existing 的对应字段。
* 支持数组类型字段（如 styles/classNames）的整体替换语义 —
* 数组替换而非拼接，因为同一 entityId 的 ErEntityBlock 重新定义时应当替换而非追加。
*/
function mergeNodeData$1(existing, incoming) {
	const existingRecord = existing;
	const incomingRecord = incoming;
	const merged = { ...existingRecord };
	for (const key of Object.keys(incomingRecord)) {
		const value = incomingRecord[key];
		if (value !== void 0) merged[key] = value;
	}
	return merged;
}
/**
* 构造 ErSubgraphCloseBlock（rawText: 'end'，对齐 mermaid erDiagram subgraph 关闭语法）
*
* mermaid erDiagram 的 subgraph 关闭符号是 `end`（对齐 er.jison 官方语法
* `subgraph <id> ... end`，与 flowchart subgraph 一致，与 classDiagram namespace 的 `}` 不同）。
*
* 语法偏差修复（2026-07-07）：原设计假设 ER subgraph 用 `}` 关闭（与 class namespace 一致），
* 实际 er.jison 语法是 `end`。已修订 rawText + 注释。
*/
function createSubgraphCloseBlock$1(subgraphId, indent) {
	return {
		type: "subgraph-close",
		sourceLine: void 0,
		rawText: "end",
		indent,
		subgraphId
	};
}
/**
* 构造顶层 ErDirectionBlock（rawText: `direction ${dir}`，indent=0）
*
* erDiagram header 是固定字符串 `erDiagram`（无 direction 后缀），
* 顶层 direction 必须作为独立 DirectionBlock 产出（对齐老路径 serializeER 行为）。
*/
function createDirectionBlock$1(dir) {
	return {
		type: "direction",
		sourceLine: void 0,
		rawText: `direction ${dir}`,
		indent: 0,
		dir
	};
}
/** 构造 ErAccTitleBlock（rawText: `accTitle: ${accTitle}`） */
function createAccTitleBlock$1(accTitle) {
	return {
		type: "accTitle",
		sourceLine: void 0,
		rawText: `accTitle: ${accTitle}`,
		indent: 0,
		accTitle
	};
}
/** 构造 ErAccDescriptionBlock（rawText: `accDescr: ${accDescription}`，对齐官方缩写语法） */
function createAccDescriptionBlock$1(accDescription) {
	return {
		type: "accDescription",
		sourceLine: void 0,
		rawText: `accDescr: ${accDescription}`,
		indent: 0,
		accDescription
	};
}
/** 构造 ErClassDefBlock（rawText: `classDef className style1,style2,...`）
*
* 只输出 info.styles（textStyles 是 parser 从 styles 派生的数据，不应序列化输出）。
*
* 设计偏差修复（2026-07-07）：原实现合并 [...info.styles, ...info.textStyles] 输出，
* 但 er-recognizer.ts 的 addClass 方法把含 `color` 的样式同时加入 styles 和 textStyles
* （textStyles 中 fill 替换为 bgFill），导致 `color:#f00` 重复输出。
* 修复为只输出 info.styles，第二次 parse 时 parser 会重新派生 textStyles。
*/
function createClassDefBlock$1(info) {
	const allStyles = [...info.styles];
	return {
		type: "classDef",
		sourceLine: void 0,
		rawText: `classDef ${info.id} ${allStyles.join(",")}`,
		indent: 0,
		className: info.id,
		styles: [...info.styles],
		textStyles: [...info.textStyles]
	};
}
/** 构造 ErClassApplyBlock（rawText: `class id1,id2 className1,className2`）
*
* 保留原始多目标多类名分组（从 metadata.erClassApplyClasses 产出）。
* 对齐 mermaid 官方 erDiagram 语法：`class A,B c1,c2`（逗号分隔多目标多类名）。
*/
function createClassApplyBlock$1(apply) {
	return {
		type: "class-apply",
		sourceLine: void 0,
		rawText: `class ${apply.ids.join(",")} ${apply.classNames.join(",")}`,
		indent: 0,
		ids: [...apply.ids],
		classNames: [...apply.classNames]
	};
}
/** 构造 ErStyleBlock（rawText: `style nodeId style1,style2,...`） */
function createStyleBlock$1(nodeId, styles) {
	return {
		type: "style",
		sourceLine: void 0,
		rawText: `style ${nodeId} ${styles.join(",")}`,
		indent: 0,
		ids: [nodeId],
		styles: [...styles]
	};
}
/**
* ErConverterContext 默认实现
*
* 内部状态：
*   - parentStack: string[] — subgraph 栈，pushParent/popParent/currentParent
*   - nodes: Map<string, MermaidNode> — 节点注册表（保留插入顺序，merge 语义）
*   - edges: MermaidEdge[] — 边列表（按注册顺序）
*   - metadataCollector: ErMetadataCollector — 注入的元数据收集器
*   - errors: BlockConvertError[] — 错误收集（不中断后续 block 处理）
*
* merge 语义：registerNode 时若 nodeId 已存在则按字段优先级 merge。
* 前向引用：updateNode 在节点不存在时创建默认节点（对齐 flowchart/class createDefaultNode 行为）。
*/
var ErDefaultConverterContext = class {
	constructor(metadataCollector) {
		this.parentStack = [];
		this.nodes = /* @__PURE__ */ new Map();
		this.edges = [];
		this.errors = [];
		this.metadataCollector = metadataCollector;
	}
	pushParent(subgraphId) {
		this.parentStack.push(subgraphId);
	}
	popParent() {
		return this.parentStack.pop();
	}
	currentParent() {
		return this.parentStack[this.parentStack.length - 1];
	}
	/**
	* 注册新节点（merge 语义）
	*
	* 若 nodeId 已存在，按字段优先级 merge（incoming 非 undefined 字段覆盖 existing）。
	* 支持 ErEntityBlock 重新定义时替换字段（如 label/attributes 等）。
	*
	* parentId 归属语义：incoming.parentId 优先（ER 场景：ErEntityBlock 总是带正确 parentId，由模块1 前置）。
	*/
	registerNode(node) {
		const existing = this.nodes.get(node.id);
		if (existing === void 0) {
			this.nodes.set(node.id, node);
			return;
		}
		const merged = mergeNode$1(existing, node);
		if (node.parentId !== void 0) merged.parentId = node.parentId;
		this.nodes.set(node.id, merged);
	}
	/**
	* 更新已有节点（前向引用：节点不存在时创建默认节点）
	*
	* 场景：ErStyleBlock/ErClassApplyBlock 可能出现在 ErEntityBlock 之前。
	* 对齐 flowchart/class createDefaultNode 行为：隐式创建节点，后续 registerNode 通过 merge 合并。
	*/
	updateNode(nodeId, mutate) {
		const existing = this.nodes.get(nodeId);
		if (existing === void 0) {
			const defaultNode = createDefaultNode$1(nodeId);
			mutate(defaultNode);
			this.nodes.set(nodeId, defaultNode);
			return;
		}
		mutate(existing);
	}
	getNode(nodeId) {
		return this.nodes.get(nodeId);
	}
	/** 获取所有节点（保留插入顺序，Map iteration order 保证） */
	getNodes() {
		return [...this.nodes.values()];
	}
	registerEdge(edge) {
		this.edges.push(edge);
	}
	getEdges() {
		return this.edges;
	}
	addError(error) {
		this.errors.push(error);
	}
	/** 获取累积的错误列表（parseBlocks 返回时使用） */
	getErrors() {
		return this.errors;
	}
};
/**
* ErMetadataCollector 默认实现
*
* 内部状态对应 GraphMetadata 的 er 相关字段：
*   - erClassesValue: ErClassInfo[] — classDef 累积
*   - erClassAppliesValue: ErClassApplyInfo[] — class 应用累积（保留原始分组）
*   - erSubgraphsValue: ErSubGraphInfo[] — subgraph 累积（含 parentId）
*   - directionValue / accTitleValue / accDescriptionValue — 覆盖式
*
* build() 返回 GraphMetadata，仅包含非空字段。
*/
var DefaultErMetadataCollector = class {
	constructor() {
		this.erClassesValue = [];
		this.erClassAppliesValue = [];
		this.erSubgraphsValue = [];
	}
	addErClass(classInfo) {
		this.erClassesValue.push(classInfo);
	}
	addErClassApply(apply) {
		this.erClassAppliesValue.push(apply);
	}
	addErSubgraph(subgraph) {
		this.erSubgraphsValue.push(subgraph);
	}
	setDirection(dir) {
		this.directionValue = dir;
	}
	setAccTitle(title) {
		this.accTitleValue = title;
	}
	setAccDescription(desc) {
		this.accDescriptionValue = desc;
	}
	getErClasses() {
		return this.erClassesValue;
	}
	getErClassApplies() {
		return this.erClassAppliesValue;
	}
	getErSubgraphs() {
		return this.erSubgraphsValue;
	}
	getDirection() {
		return this.directionValue;
	}
	getAccTitle() {
		return this.accTitleValue;
	}
	getAccDescription() {
		return this.accDescriptionValue;
	}
	/**
	* 构建最终 GraphMetadata（仅包含非空字段）
	*/
	build() {
		const metadata = {};
		if (this.erClassesValue.length > 0) metadata.erClasses = [...this.erClassesValue];
		if (this.erClassAppliesValue.length > 0) metadata.erClassApplyClasses = [...this.erClassAppliesValue];
		if (this.erSubgraphsValue.length > 0) metadata.erSubgraphs = [...this.erSubgraphsValue];
		if (this.directionValue !== void 0) metadata.direction = this.directionValue;
		if (this.accTitleValue !== void 0) metadata.accTitle = this.accTitleValue;
		if (this.accDescriptionValue !== void 0) metadata.accDescription = this.accDescriptionValue;
		return metadata;
	}
};
/**
* er 专属 ConverterRegistry 实现
*
* parse 方向：
*   - 创建 ErDefaultConverterContext + DefaultErMetadataCollector
*   - 遍历 blocks，try/catch SubgraphStackError → BlockConvertError（不中断）
*   - dispatchParse: exhaustive switch 10 个 case + never check
*   - buildCanvas: 从 ctx 提取 nodes/edges，调用 mergeErNodeStyles 后处理，从 metadataCollector.build() 提取 metadata
*
* serialize 方向（8 步扫描）：
*   - 1. 顶层 DirectionBlock（从 metadata.direction）
*   - 2. AccTitle / AccDescription blocks（从 metadata）
*   - 3. Relationship blocks（从 edges，type='er-relation'）
*   - 4. Subgraph DFS（按 parentId 分组深度优先遍历，open/close 嵌套）
*   - 5. Entity blocks（ALL 顶层产出，indent=0，不按 parentId 嵌套）
*   - 6. ClassDef blocks（从 metadata.erClasses）
*   - 7. ClassApply blocks（从 metadata.erClassApplyClasses，保留原始多目标多类名分组）
*   - 8. Style blocks（从 nodes.data.styles，按节点聚合）
*
* 顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（设计点6）：
*   - erDiagram header 是固定字符串 `erDiagram`（无 direction 后缀）
*   - 顶层 direction 必须作为独立 DirectionBlock 产出（对齐老路径 serializeER 行为）
*   - direction 数据源：metadata.direction（权威源），不 fallback 到 canvas.direction（避免掩盖缺陷）
*
* ER subgraph serialize 特性（设计点8）：
*   - subgraph open rawText 包含 open + direction + 节点引用（多行，内部缩进 2 空格）
*   - 嵌套 subgraph 由 DFS 递归产出（open/close 配对，indent 按 depth × 2 递增）
*   - entity 定义全部在顶层产出（indent=0），subgraph 仅引用节点 ID
*   - er-relation 边全部在顶层产出（ER 边无 subgraphId 概念）
*/
var ErConverterRegistry = class {
	constructor() {
		this.lookup = new Map(erConverterEntries.map((entry) => [entry.type, entry]));
	}
	/**
	* parse：按 blockType 分发到对应 Converter.parseBlock
	*
	* - 产出型 block（entity/relationship/subgraph-open）→ IModelBlockConverter.parseBlock → model（累加到 ctx）
	* - 副作用型 block → ISideEffectBlockConverter.parseBlock → void（副作用通过 ctx 受控方法承载）
	* - SubgraphStackError 转为 BlockConvertError 累积到 errors，不中断后续 block 处理
	*
	* @returns BlockConvertResult { canvas, errors }
	*/
	parseBlocks(blocks, diagramType) {
		if (diagramType !== "erDiagram") throw new Error(`ErConverterRegistry only supports 'erDiagram', got '${diagramType}'`);
		const metadataCollector = new DefaultErMetadataCollector();
		const ctx = new ErDefaultConverterContext(metadataCollector);
		for (const block of blocks) try {
			this.dispatchParse(block, ctx);
		} catch (err) {
			if (err instanceof SubgraphStackError) ctx.addError(toBlockConvertError(err));
			else throw err;
		}
		const metadata = metadataCollector.build();
		return {
			canvas: this.buildCanvas(ctx, metadata),
			errors: [...ctx.getErrors()]
		};
	}
	/**
	* 构建 GraphCanvasState
	*
	* 从 ctx 提取 nodes/edges，从 metadata 提取 direction。
	* 对每个 er-box 节点调用 mergeErNodeStyles 后处理（合并 cssCompiledStyles + data.styles → data.style）。
	* metadata 仅在非空时设置。
	*
	* direction 同步到顶层（单一数据源修复：metadata.direction 是方向唯一来源，
	* 同步到 canvas.direction 供 React Flow 直接读取）。
	*/
	buildCanvas(ctx, metadata) {
		const nodes = ctx.getNodes();
		for (const node of nodes) if (node.type === "er-box") mergeErNodeStyles(node);
		const canvas = {
			diagramType: "erDiagram",
			nodes,
			edges: [...ctx.getEdges()],
			needsLayout: true
		};
		if (metadata.direction !== void 0) canvas.direction = metadata.direction;
		if (Object.keys(metadata).length > 0) canvas.metadata = metadata;
		return canvas;
	}
	/**
	* exhaustive switch 分发 parse（10 个 case + never check）
	*
	* 按 block.type 分发到对应 Converter.parseBlock，类型收窄保证类型安全。
	* default 分支的 never check 确保所有 case 已覆盖，新增 block 类型时编译期报错。
	*/
	dispatchParse(block, ctx) {
		switch (block.type) {
			case "entity":
				this.requireConverter("entity").parseBlock(block, ctx);
				break;
			case "relationship":
				this.requireConverter("relationship").parseBlock(block, ctx);
				break;
			case "subgraph-open":
				this.requireConverter("subgraph-open").parseBlock(block, ctx);
				break;
			case "subgraph-close":
				this.requireConverter("subgraph-close").parseBlock(block, ctx);
				break;
			case "class-apply":
				this.requireConverter("class-apply").parseBlock(block, ctx);
				break;
			case "style":
				this.requireConverter("style").parseBlock(block, ctx);
				break;
			case "classDef":
				this.requireConverter("classDef").parseBlock(block, ctx);
				break;
			case "direction":
				this.requireConverter("direction").parseBlock(block, ctx);
				break;
			case "accTitle":
				this.requireConverter("accTitle").parseBlock(block, ctx);
				break;
			case "accDescription": this.requireConverter("accDescription").parseBlock(block, ctx);
		}
	}
	/**
	* serialize：从 canvas 产出所有 blocks（8 步扫描）
	*
	* - 1. 顶层 DirectionBlock（从 metadata.direction）
	* - 2. 全局指令：AccTitle / AccDescription（从 metadata）
	* - 3. Relationship blocks（从 edges，type='er-relation'）
	* - 4. Subgraph DFS（按 parentId 分组深度优先遍历，open/close 嵌套）
	* - 5. Entity blocks（ALL 顶层产出，indent=0，不按 parentId 嵌套）
	* - 6. ClassDef blocks（从 metadata.erClasses）
	* - 7. ClassApply blocks（从 metadata.erClassApplyClasses，保留原始多目标多类名分组）
	* - 8. Style blocks（从 nodes.data.styles，按节点聚合）
	*
	* 顶层 direction 数据源：metadata.direction（权威源），不 fallback 到 canvas.direction
	* （原始无 direction 声明的代码不应输出 direction，对齐官方示例）。
	*
	* ER entity 定义全部在顶层产出（设计点8）：
	*   - subgraph 仅引用节点 ID（在 open rawText 中），不包含 entity 定义
	*   - entity 定义在顶层独立产出（即使被 subgraph 引用也在顶层定义）
	*   - 与 class namespace 不同（class 定义在 namespace 内部产出）
	*
	* er-relation 边全部在顶层产出（ER 边无 subgraphId 概念，source/target 是全局 entityId）。
	*/
	serialize(canvas, diagramType) {
		if (diagramType !== "erDiagram") throw new Error(`ErConverterRegistry only supports 'erDiagram', got '${diagramType}'`);
		if (canvas.diagramType !== "erDiagram") throw new Error(`Expected GraphCanvasState with diagramType 'erDiagram', got '${canvas.diagramType}'`);
		const graphCanvas = canvas;
		const metadata = graphCanvas.metadata ?? {};
		const blocks = [];
		const ctx = new ErDefaultConverterContext(new DefaultErMetadataCollector());
		const direction = metadata.direction;
		if (direction !== void 0) blocks.push(createDirectionBlock$1(direction));
		if (metadata.accTitle !== void 0) blocks.push(createAccTitleBlock$1(metadata.accTitle));
		if (metadata.accDescription !== void 0) blocks.push(createAccDescriptionBlock$1(metadata.accDescription));
		const relationshipConverter = this.requireConverter("relationship");
		for (const edge of graphCanvas.edges) {
			if (edge.type !== "er-relation") continue;
			const relationshipBlock = relationshipConverter.serializeBlock(edge, ctx);
			if (relationshipBlock !== null) blocks.push({
				...relationshipBlock,
				indent: 0
			});
		}
		const subgraphNodes = graphCanvas.nodes.filter((n) => n.type === "er-subgraph");
		const subgraphIdSet = new Set(subgraphNodes.map((n) => n.id));
		const nodesByParent = this.groupNodesByParent(subgraphNodes);
		this.dfsSubgraphSerialize(void 0, 0, nodesByParent, subgraphIdSet, ctx, blocks);
		const entityConverter = this.requireConverter("entity");
		for (const node of graphCanvas.nodes) {
			if (node.type !== "er-box") continue;
			const entityBlock = entityConverter.serializeBlock(node, ctx);
			if (entityBlock !== null) blocks.push({
				...entityBlock,
				indent: 0
			});
		}
		if (metadata.erClasses !== void 0) for (const classInfo of metadata.erClasses) blocks.push(createClassDefBlock$1(classInfo));
		if (metadata.erClassApplyClasses !== void 0) for (const apply of metadata.erClassApplyClasses) blocks.push(createClassApplyBlock$1(apply));
		const styleBlocks = this.serializeStyleBlocks(graphCanvas.nodes);
		blocks.push(...styleBlocks);
		return blocks;
	}
	/**
	* DFS 深度优先遍历产出 subgraph-open/subgraph-close blocks
	*
	* 遍历顺序：
	*   - 顶层入口（parentId === undefined）遍历所有顶层 subgraph
	*   - 每个 subgraph 产出：SubgraphOpenBlock → 递归子 subgraph → SubgraphCloseBlock
	*   - entity 节点不在此 DFS 中产出（entity 定义在顶层独立输出，步骤 5）
	*
	* indent 计算：depth × 2（subgraph 嵌套深度 × 2）
	* SubgraphCloseBlock 的 indent 与 SubgraphOpenBlock 相同（外层 indent）。
	*
	* subgraphNodes 过滤（设计点8 + 嵌套 subgraph 处理）：
	*   - parser 解析 `subgraph outer\n  subgraph inner` 时会把 'inner' 加入 outer.subgraphNodes
	*   - 序列化时嵌套 subgraph 由 DFS 递归产出（`subgraph inner ... end`），
	*     不应在父 subgraph 的 nodes 引用列表中重复输出
	*   - 用 subgraphIdSet 过滤 data.subgraphNodes，只保留 entity 子节点引用
	*   - round-trip 等价性：第一次和第二次 parse 都会把 'inner' 加入 outer.subgraphNodes（parser 行为一致），
	*     序列化输出一致，CanvasState 等价
	*
	* 与 class namespace DFS 的差异：
	*   - class DFS 在 namespace 内部产出 class/note blocks（按 parentId 分组）
	*   - ER DFS 仅产出 subgraph-open/close，entity 定义在顶层独立输出（设计点8）
	*/
	dfsSubgraphSerialize(parentId, depth, nodesByParent, subgraphIdSet, ctx, blocks) {
		const indent = depth * 2;
		const children = nodesByParent.get(parentId) ?? [];
		for (const node of children) {
			if (node.type !== "er-subgraph") continue;
			const rawSubgraphNodes = node.data.subgraphNodes ?? [];
			const nodeToSerialize = rawSubgraphNodes.some((id) => subgraphIdSet.has(id)) ? {
				...node,
				data: {
					...node.data,
					subgraphNodes: rawSubgraphNodes.filter((id) => !subgraphIdSet.has(id))
				}
			} : node;
			const openBlock = this.requireConverter("subgraph-open").serializeBlock(nodeToSerialize, ctx);
			if (openBlock !== null) blocks.push({
				...openBlock,
				indent
			});
			this.dfsSubgraphSerialize(node.id, depth + 1, nodesByParent, subgraphIdSet, ctx, blocks);
			blocks.push(createSubgraphCloseBlock$1(node.id, indent));
		}
	}
	/**
	* 按 parentId 分组节点（undefined = 顶层）
	* 保留 canvas.nodes 的原始顺序（Map + push 保证）。
	*/
	groupNodesByParent(nodes) {
		const map = /* @__PURE__ */ new Map();
		for (const node of nodes) {
			const parentId = node.parentId;
			const existing = map.get(parentId);
			if (existing === void 0) map.set(parentId, [node]);
			else existing.push(node);
		}
		return map;
	}
	/**
	* 序列化 Style blocks
	*
	* 扫描所有 er-box 节点的 data.styles，每个有 styles 的节点产出独立的 ErStyleBlock。
	* 注意：ErStyleBlock 字段是 ids（数组，支持多目标），serialize 时按节点聚合为单目标。
	* 使用 \0 作为分隔符构建 key（避免 styles 内容冲突，对齐 flowchart）。
	*/
	serializeStyleBlocks(nodes) {
		const blocks = [];
		for (const node of nodes) {
			if (node.type !== "er-box") continue;
			const styles = node.data.styles;
			if (styles === void 0 || styles.length === 0) continue;
			blocks.push(createStyleBlock$1(node.id, styles));
		}
		return blocks;
	}
	requireConverter(type) {
		const entry = this.lookup.get(type);
		if (entry === void 0) throw new Error(`Converter not registered for block type: ${type}`);
		return entry.converter;
	}
};
//#endregion
//#region src/serializer/converter/registry.ts
/**
* 创建前向引用默认节点
*
* 场景：StyleBlock/ClassApplyBlock 可能出现在 VertexBlock 之前
* （如 `style A fill:#fff` 在 `A[Hello]` 之前）。
* 对齐 mermaid flowDb.setClass 行为：隐式创建节点，后续 registerNode 通过决策17 merge 合并字段。
*
* 默认节点的 styles/classNames 为 undefined（不覆盖已有字段），
* label 回退为 nodeId（对齐 flowchart-parser.ts:429 行为）。
*/
function createDefaultNode(nodeId) {
	return {
		id: nodeId,
		type: "default",
		position: {
			x: 0,
			y: 0
		},
		data: {
			label: nodeId,
			shape: "rect",
			isSubgraph: false
		}
	};
}
/**
* 决策17：合并两个 MermaidNode
*
* id 是主键，永不变化。
* data 字段通过 mergeNodeData 深层合并（incoming 非 undefined 字段覆盖 existing）。
* parentId 由 registerNode 的 deepest-wins 决策处理，mergeNode 本身跳过 parentId ——
*   归属语义：incoming.parentId 的嵌套深度 > existing.parentId 时覆盖（移到内层 subgraph），
*   深度相同或更浅时保留 existing（先声明先占，处理平级 subgraph）。
*   对齐 Mermaid 官方 addSubGraph 由内向外调用 + makeUniq 先注册先占 = 内层优先归属。
*   详见 docs/design/node-attribution-fix.md。
* 其他顶层可选字段（extent/selected 等）按 incoming 非 undefined 覆盖。
*/
function mergeNode(existing, incoming) {
	const incomingRecord = incoming;
	const mergedTop = { ...existing };
	for (const key of Object.keys(incomingRecord)) {
		if (key === "data" || key === "id" || key === "parentId") continue;
		const value = incomingRecord[key];
		if (value !== void 0) mergedTop[key] = value;
	}
	const result = mergedTop;
	result.id = existing.id;
	result.data = mergeNodeData(existing.data, incoming.data);
	return result;
}
/**
* 决策17：合并两个 MermaidNodeData（incoming 非 undefined 字段覆盖 existing）
*
* 遍历 incoming 的所有 key，非 undefined 的值覆盖 existing 的对应字段。
* 支持数组类型字段（如 styles/classNames）的整体替换语义 —
* 数组替换而非拼接，因为同一 nodeId 的 VertexBlock 重新定义时应当替换而非追加。
*/
function mergeNodeData(existing, incoming) {
	const existingRecord = existing;
	const incomingRecord = incoming;
	const merged = { ...existingRecord };
	for (const key of Object.keys(incomingRecord)) {
		const value = incomingRecord[key];
		if (value !== void 0) merged[key] = value;
	}
	return merged;
}
/**
* 将字符串解析为 FlowchartDirection（类型守卫）
*
* serialize 方向：MermaidNodeData.dir 类型为 string | undefined，
* 需收窄为 FlowchartDirection 联合字面量类型。
* 仅接受合法字面量，其他值返回 undefined（不产出 DirectionBlock）。
*/
function parseFlowchartDirection(dir) {
	if (dir === void 0) return;
	if (dir === "TB" || dir === "TD" || dir === "BT" || dir === "RL" || dir === "LR") return dir;
}
/** 构造 SubgraphCloseBlock（rawText: 'end'） */
function createSubgraphCloseBlock(subgraphId, indent) {
	return {
		type: "subgraph-close",
		sourceLine: void 0,
		rawText: "end",
		indent,
		subgraphId
	};
}
/** 构造 DirectionBlock（rawText: `direction ${dir}`） */
function createDirectionBlock(dir, indent) {
	return {
		type: "direction",
		sourceLine: void 0,
		rawText: `direction ${dir}`,
		indent,
		dir
	};
}
/** 构造 AccTitleBlock（rawText: `accTitle: ${accTitle}`） */
function createAccTitleBlock(accTitle) {
	return {
		type: "accTitle",
		sourceLine: void 0,
		rawText: `accTitle: ${accTitle}`,
		indent: 0,
		accTitle
	};
}
/** 构造 AccDescriptionBlock（rawText: `accDescr: ${accDescription}`，对齐官方缩写语法） */
function createAccDescriptionBlock(accDescription) {
	return {
		type: "accDescription",
		sourceLine: void 0,
		rawText: `accDescr: ${accDescription}`,
		indent: 0,
		accDescription
	};
}
/** 构造 ClassDefBlock（rawText: `classDef className style1,style2,...`） */
function createClassDefBlock(info) {
	const allStyles = [...info.styles, ...info.textStyles];
	return {
		type: "classDef",
		sourceLine: void 0,
		rawText: `classDef ${info.id} ${allStyles.join(",")}`,
		indent: 0,
		className: info.id,
		styles: [...info.styles],
		textStyles: [...info.textStyles]
	};
}
/** 构造 ClassApplyBlock（rawText: `class nodeId1,nodeId2 className`） */
function createClassApplyBlock(nodeIds, className) {
	return {
		type: "class-apply",
		sourceLine: void 0,
		rawText: `class ${nodeIds.join(",")} ${className}`,
		indent: 0,
		nodeIds: [...nodeIds],
		className
	};
}
/** 构造 StyleBlock（rawText: `style nodeId1,nodeId2 style1,style2,...`） */
function createStyleBlock(nodeIds, styles) {
	return {
		type: "style",
		sourceLine: void 0,
		rawText: `style ${nodeIds.join(",")} ${styles.join(",")}`,
		indent: 0,
		nodeIds: [...nodeIds],
		styles: [...styles]
	};
}
/** 构造 LinkStyleBlock（default 目标，rawText: `linkStyle default [interpolate xxx] [styles] [animate xxx]`） */
function createLinkStyleDefaultBlock(styles, interpolate, animate) {
	return {
		type: "linkStyle",
		sourceLine: void 0,
		rawText: `linkStyle default${interpolate !== void 0 ? ` interpolate ${interpolate}` : ""}${styles.length > 0 ? ` ${styles.join(",")}` : ""}${animate !== void 0 ? ` animate ${animate}` : ""}`,
		indent: 0,
		target: { kind: "default" },
		styles: [...styles],
		interpolate,
		animate
	};
}
/** 构造 LinkStyleBlock（indices 目标，rawText: `linkStyle 0,1,2 [interpolate xxx] [styles] [animate xxx]`） */
function createLinkStyleIndicesBlock(indices, styles, interpolate, animate) {
	const interpolatePart = interpolate !== void 0 ? ` interpolate ${interpolate}` : "";
	const stylesPart = styles.length > 0 ? ` ${styles.join(",")}` : "";
	const animatePart = animate !== void 0 ? ` animate ${animate}` : "";
	return {
		type: "linkStyle",
		sourceLine: void 0,
		rawText: `linkStyle ${indices.join(",")}${interpolatePart}${stylesPart}${animatePart}`,
		indent: 0,
		target: {
			kind: "indices",
			indices: [...indices]
		},
		styles: [...styles],
		interpolate,
		animate
	};
}
/** 构造 ClickBlock（rawText 根据 event 字段组合，对齐官方 click 语法） */
function createClickBlock(event) {
	const parts = ["click", event.nodeId];
	if (event.functionName !== void 0) {
		parts.push(event.functionName);
		if (event.functionArgs !== void 0) parts.push("call", event.functionArgs);
	}
	if (event.link !== void 0) {
		parts.push("href", `"${event.link}"`);
		if (event.linkTarget !== void 0) parts.push(event.linkTarget);
	}
	if (event.tooltip !== void 0) parts.push(`"${event.tooltip}"`);
	return {
		type: "click",
		sourceLine: void 0,
		rawText: parts.join(" "),
		indent: 0,
		nodeId: event.nodeId,
		functionName: event.functionName,
		functionArgs: event.functionArgs,
		link: event.link,
		linkTarget: event.linkTarget,
		tooltip: event.tooltip
	};
}
/**
* ConverterContext 默认实现
*
* 内部状态：
*   - parentStack: string[] — subgraph 栈，pushParent/popParent/currentParent
*   - nodes: Map<string, MermaidNode> — 节点注册表（保留插入顺序，决策17 merge 语义）
*   - edges: MermaidEdge[] — 边列表（按注册顺序，支持数字索引定位）
*   - metadataCollector: IMetadataCollector — 注入的元数据收集器
*
* 决策17 merge 语义：registerNode 时若 nodeId 已存在则按字段优先级 merge。
* 前向引用：updateNode 在节点不存在时创建默认节点（对齐 mermaid flowDb.setClass 行为）。
*/
var DefaultConverterContext = class {
	constructor(metadataCollector) {
		this.parentStack = [];
		this.nodes = /* @__PURE__ */ new Map();
		this.edges = [];
		this.metadataCollector = metadataCollector;
	}
	pushParent(subgraphId) {
		this.parentStack.push(subgraphId);
	}
	popParent() {
		return this.parentStack.pop();
	}
	currentParent() {
		return this.parentStack[this.parentStack.length - 1];
	}
	/**
	* 注册新节点（决策17 merge 语义 + deepest-wins 归属）
	*
	* 若 nodeId 已存在，按字段优先级 merge（incoming 非 undefined 字段覆盖 existing）。
	* 支持 `A[Hello] --> A[World]` 这种边定义时顺便更新节点标签的场景。
	*
	* parentId 归属语义（deepest-wins，对齐 Mermaid 官方内层优先归属）：
	*   - incoming.parentId 更深 → 覆盖 existing.parentId（移到内层 subgraph）
	*   - 深度相同或更浅 → 保留 existing.parentId（先声明先占，处理平级 subgraph）
	*   - incoming.parentId 为 undefined → 保留 existing.parentId（不回退到顶层）
	*/
	registerNode(node) {
		const existing = this.nodes.get(node.id);
		if (existing === void 0) {
			this.nodes.set(node.id, node);
			return;
		}
		const merged = mergeNode(existing, node);
		if (node.parentId !== void 0) {
			const existingDepth = this.getNodeDepth(existing.parentId);
			if (this.getNodeDepth(node.parentId) > existingDepth) merged.parentId = node.parentId;
		}
		this.nodes.set(node.id, merged);
	}
	/**
	* 计算节点的 subgraph 嵌套深度
	*
	* 顶层节点（parentId 为 undefined）depth=0，直接子节点 depth=1，依此类推。
	* 用于 registerNode 的 deepest-wins 决策：比较 incoming 与 existing 的 parentId 深度。
	*
	* parent 未注册时视为 depth=1（前向引用场景：边端点引用尚未声明的 subgraph，
	* 但 subgraph 一旦声明其本身深度至少为 1，故按 1 估算保守值）。
	*/
	getNodeDepth(parentId) {
		if (parentId === void 0) return 0;
		const parent = this.nodes.get(parentId);
		if (parent === void 0) return 1;
		return 1 + this.getNodeDepth(parent.parentId);
	}
	/**
	* 更新已有节点（前向引用：节点不存在时创建默认节点）
	*
	* 场景：StyleBlock/ClassApplyBlock 可能出现在 VertexBlock 之前。
	* 对齐 mermaid flowDb.setClass 行为：隐式创建节点，后续 registerNode 通过决策17 merge 合并。
	*/
	updateNode(nodeId, mutate) {
		const existing = this.nodes.get(nodeId);
		if (existing === void 0) {
			const defaultNode = createDefaultNode(nodeId);
			mutate(defaultNode);
			this.nodes.set(nodeId, defaultNode);
			return;
		}
		mutate(existing);
	}
	getNode(nodeId) {
		return this.nodes.get(nodeId);
	}
	/** 获取所有节点（保留插入顺序，Map iteration order 保证） */
	getNodes() {
		return [...this.nodes.values()];
	}
	registerEdge(edge) {
		this.edges.push(edge);
	}
	updateEdgeByIndex(index, mutate) {
		const edge = this.edges[index];
		if (edge === void 0) return;
		mutate(edge);
	}
	updateAllEdges(mutate) {
		for (const edge of this.edges) mutate(edge);
	}
	getEdges() {
		return this.edges;
	}
};
/**
* IMetadataCollector 默认实现
*
* 内部状态对应 GraphMetadata 的各字段：
*   - flowClassDefs: FlowClassDefInfo[] — classDef 累积
*   - flowClickEvents: FlowClickEvent[] — click 累积
*   - flowTooltips: Record<string, string> — nodeId → tooltip（从 click event 提取）
*   - directionValue / titleValue / accTitleValue / accDescriptionValue — 覆盖式
*   - flowDefaultStyleValue / flowDefaultInterpolateValue — 决策16 setLinkStyleDefault
*
* build() 返回 GraphMetadata，仅包含非空字段。
*/
var DefaultMetadataCollector = class {
	constructor() {
		this.flowClassDefs = [];
		this.flowClickEvents = [];
		this.flowTooltips = {};
	}
	addClassDef(info) {
		this.flowClassDefs.push(info);
	}
	/**
	* 添加 click 事件
	*
	* 累积到 flowClickEvents，同时若 event.tooltip 非空则累积到 flowTooltips 映射。
	* 对齐 flow-db.ts setTooltip 行为：tooltip 通过 click 语句设置。
	*/
	addClickEvent(event) {
		this.flowClickEvents.push(event);
		if (event.tooltip !== void 0) this.flowTooltips[event.nodeId] = event.tooltip;
	}
	setDirection(dir) {
		this.directionValue = dir;
	}
	setTitle(title) {
		this.titleValue = title;
	}
	setAccTitle(accTitle) {
		this.accTitleValue = accTitle;
	}
	setAccDescription(desc) {
		this.accDescriptionValue = desc;
	}
	/**
	* 决策16：设置默认边样式与插值
	*
	* 一次调用同时处理 styles 和 interpolate。
	* - styles: 替换 flowDefaultStyleValue（对齐 mermaid flow-db.ts defaultStyle 替换语义，last wins）
	* - interpolate: 替换 flowDefaultInterpolateValue（非空时才替换）
	*/
	setLinkStyleDefault(styles, interpolate) {
		this.flowDefaultStyleValue = [...styles];
		if (interpolate !== void 0) this.flowDefaultInterpolateValue = interpolate;
	}
	/**
	* 构建最终 GraphMetadata（仅包含非空字段）
	*/
	build() {
		const metadata = {};
		if (this.flowClassDefs.length > 0) metadata.flowClassDefs = this.flowClassDefs;
		if (this.flowClickEvents.length > 0) metadata.flowClickEvents = this.flowClickEvents;
		if (Object.keys(this.flowTooltips).length > 0) metadata.flowTooltips = this.flowTooltips;
		if (this.directionValue !== void 0) metadata.direction = this.directionValue;
		if (this.titleValue !== void 0) metadata.title = this.titleValue;
		if (this.accTitleValue !== void 0) metadata.accTitle = this.accTitleValue;
		if (this.accDescriptionValue !== void 0) metadata.accDescription = this.accDescriptionValue;
		if (this.flowDefaultStyleValue !== void 0) metadata.flowDefaultStyle = this.flowDefaultStyleValue;
		if (this.flowDefaultInterpolateValue !== void 0) metadata.flowDefaultInterpolate = this.flowDefaultInterpolateValue;
		return metadata;
	}
};
/**
* flowchart 专属 ConverterRegistry 实现
*
* parse 方向：
*   - 创建 DefaultConverterContext + DefaultMetadataCollector
*   - 遍历 blocks，try/catch SubgraphStackError → BlockConvertError（不中断）
*   - dispatchParse: exhaustive switch 15 个 case + never check
*   - buildCanvas: 从 ctx 提取 nodes/edges，从 metadataCollector.build() 提取 metadata
*
* serialize 方向：
*   - 1. Title/AccTitle/AccDescription blocks（从 metadata）
*   - 2. Nodes and edges DFS（按 parentId 分组深度优先遍历）
*   - 3. ClassDef blocks（从 metadata.flowClassDefs）
*   - 4. ClassApply blocks（从 nodes.classNames，按 className 分组）
*   - 5. Style blocks（从 nodes.styles，按 styles 内容分组）
*   - 6. LinkStyle blocks（default + per-edge by index）
*   - 7. Click blocks（从 metadata.flowClickEvents）
*
* 顶层 direction 不产出 DirectionBlock（由 Assembler 通过 `flowchart TD` 行处理）。
* 子图 direction 在 SubgraphOpenBlock 之后产出 DirectionBlock。
*/
var FlowchartConverterRegistry = class {
	constructor() {
		this.lookup = new Map(flowchartConverterEntries.map((entry) => [entry.type, entry]));
	}
	parseBlocks(blocks, diagramType) {
		if (diagramType !== "flowchart") throw new Error(`FlowchartConverterRegistry only supports 'flowchart', got '${diagramType}'`);
		const metadataCollector = new DefaultMetadataCollector();
		const ctx = new DefaultConverterContext(metadataCollector);
		const errors = [];
		for (const block of blocks) try {
			this.dispatchParse(block, ctx);
		} catch (err) {
			if (err instanceof SubgraphStackError$1) errors.push(toBlockConvertError$2(err));
			else throw err;
		}
		const metadata = metadataCollector.build();
		return {
			canvas: this.buildCanvas(ctx, metadata),
			errors
		};
	}
	/**
	* 构建 GraphCanvasState
	*
	* 从 ctx 提取 nodes/edges，从 metadata 提取 direction。
	* metadata 仅在非空时设置。
	*
	* post-process:
	*   1. 合并 classDef + direct styles 到 node.data.style
	*      ClassApplyConverter.parseBlock 时 metadata.flowClassDefs 可能还未填充（顺序依赖），
	*      所以 data.style 必须在所有 block 处理完后统一构建。
	*      对齐老 flowchart-parser.ts mapVertexToNode 的 mergedStyle 逻辑。
	*   2. 构建 subgraph.data.subgraphNodes（从 parentId 关系推导）
	*      SubgraphOpenConverter.parseBlock 时子节点尚未注册，无法填充 subgraphNodes。
	*      对齐老 flowchart-parser.ts mapVertexToNode 的 subGraph.nodes 字段。
	*/
	buildCanvas(ctx, metadata) {
		const flowClassDefs = metadata.flowClassDefs ?? [];
		const nodes = ctx.getNodes();
		for (const node of nodes) mergeNodeStyles(node, flowClassDefs);
		const subgraphChildIds = /* @__PURE__ */ new Map();
		for (const node of nodes) {
			const parentId = node.parentId;
			if (parentId !== void 0) {
				const existing = subgraphChildIds.get(parentId);
				if (existing === void 0) subgraphChildIds.set(parentId, [node.id]);
				else existing.push(node.id);
			}
		}
		for (const node of nodes) if (node.data.isSubgraph === true) {
			const childIds = subgraphChildIds.get(node.id);
			if (childIds !== void 0) node.data.subgraphNodes = childIds;
		}
		const canvas = {
			diagramType: "flowchart",
			nodes,
			edges: [...ctx.getEdges()],
			needsLayout: true
		};
		if (metadata.direction !== void 0) canvas.direction = metadata.direction;
		if (Object.keys(metadata).length > 0) canvas.metadata = metadata;
		return canvas;
	}
	/**
	* exhaustive switch 分发 parse（15 个 case + never check）
	*
	* 按 block.type 分发到对应 Converter.parseBlock，类型收窄保证类型安全。
	* default 分支的 never check 确保所有 case 已覆盖，新增 block 类型时编译期报错。
	*/
	dispatchParse(block, ctx) {
		switch (block.type) {
			case "vertex":
				this.requireConverter("vertex").parseBlock(block, ctx);
				break;
			case "edge":
				this.requireConverter("edge").parseBlock(block, ctx);
				break;
			case "subgraph-open":
				this.requireConverter("subgraph-open").parseBlock(block, ctx);
				break;
			case "subgraph-close":
				this.requireConverter("subgraph-close").parseBlock(block, ctx);
				break;
			case "classDef":
				this.requireConverter("classDef").parseBlock(block, ctx);
				break;
			case "class-apply":
				this.requireConverter("class-apply").parseBlock(block, ctx);
				break;
			case "style":
				this.requireConverter("style").parseBlock(block, ctx);
				break;
			case "linkStyle":
				this.requireConverter("linkStyle").parseBlock(block, ctx);
				break;
			case "click":
				this.requireConverter("click").parseBlock(block, ctx);
				break;
			case "direction":
				this.requireConverter("direction").parseBlock(block, ctx);
				break;
			case "title":
				this.requireConverter("title").parseBlock(block, ctx);
				break;
			case "accTitle":
				this.requireConverter("accTitle").parseBlock(block, ctx);
				break;
			case "accDescription":
				this.requireConverter("accDescription").parseBlock(block, ctx);
				break;
			case "comment":
				this.requireConverter("comment").parseBlock(block, ctx);
				break;
			case "blank": this.requireConverter("blank").parseBlock(block, ctx);
		}
	}
	serialize(canvas, diagramType) {
		if (diagramType !== "flowchart") throw new Error(`FlowchartConverterRegistry only supports 'flowchart', got '${diagramType}'`);
		if (canvas.diagramType !== "flowchart") throw new Error(`Expected GraphCanvasState with diagramType 'flowchart', got '${canvas.diagramType}'`);
		const graphCanvas = canvas;
		const metadata = graphCanvas.metadata ?? {};
		const blocks = [];
		const ctx = new DefaultConverterContext(new DefaultMetadataCollector());
		if (metadata.accTitle !== void 0) blocks.push(createAccTitleBlock(metadata.accTitle));
		if (metadata.accDescription !== void 0) blocks.push(createAccDescriptionBlock(metadata.accDescription));
		const nodesByParent = this.groupNodesByParent(graphCanvas.nodes);
		const edgesBySubgraph = this.groupEdgesBySubgraph(graphCanvas.edges);
		this.dfsSerialize(void 0, 0, nodesByParent, edgesBySubgraph, ctx, blocks);
		if (metadata.flowClassDefs !== void 0) for (const classDef of metadata.flowClassDefs) blocks.push(createClassDefBlock(classDef));
		const classApplyBlocks = this.serializeClassApplyBlocks(graphCanvas.nodes);
		blocks.push(...classApplyBlocks);
		const styleBlocks = this.serializeStyleBlocks(graphCanvas.nodes);
		blocks.push(...styleBlocks);
		const linkStyleBlocks = this.serializeLinkStyleBlocks(graphCanvas.edges, metadata);
		blocks.push(...linkStyleBlocks);
		if (metadata.flowClickEvents !== void 0) for (const event of metadata.flowClickEvents) blocks.push(createClickBlock(event));
		return blocks;
	}
	/**
	* DFS 深度优先遍历产出 vertex/edge/subgraph-open/subgraph-close/direction blocks
	*
	* 遍历顺序（P1-4 修订）：
	*   - 对当前层级的每个子节点（按插入顺序）：
	*     - 若为 subgraph：SubgraphOpenBlock → DirectionBlock（若显式方向）→ 递归 → SubgraphCloseBlock
	*     - 若为 vertex：VertexBlock
	*   - 当前层级的所有 edges（按 data.subgraphId 分组）
	*
	* indent 计算：depth × 2（subgraph 嵌套深度 × 2）
	* SubgraphCloseBlock 的 indent 与 SubgraphOpenBlock 相同（外层 indent）。
	*/
	dfsSerialize(parentId, depth, nodesByParent, edgesBySubgraph, ctx, blocks) {
		const indent = depth * 2;
		const children = nodesByParent.get(parentId) ?? [];
		for (const node of children) if (node.data.isSubgraph === true) {
			const openBlock = this.requireConverter("subgraph-open").serializeBlock(node, ctx);
			if (openBlock !== null) blocks.push({
				...openBlock,
				indent
			});
			if (node.data.hasExplicitDir === true) {
				const dir = parseFlowchartDirection(node.data.dir);
				if (dir !== void 0) blocks.push(createDirectionBlock(dir, indent + 2));
			}
			this.dfsSerialize(node.id, depth + 1, nodesByParent, edgesBySubgraph, ctx, blocks);
			blocks.push(createSubgraphCloseBlock(node.id, indent));
		} else {
			const vertexBlock = this.requireConverter("vertex").serializeBlock(node, ctx);
			if (vertexBlock !== null) blocks.push({
				...vertexBlock,
				indent
			});
		}
		const edges = edgesBySubgraph.get(parentId) ?? [];
		const edgeConverter = this.requireConverter("edge");
		for (const edge of edges) {
			const edgeBlock = edgeConverter.serializeBlock(edge, ctx);
			if (edgeBlock !== null) blocks.push({
				...edgeBlock,
				indent
			});
		}
	}
	/**
	* 按 parentId 分组节点（undefined = 顶层）
	* 保留 canvas.nodes 的原始顺序（Map + push 保证）。
	*/
	groupNodesByParent(nodes) {
		const map = /* @__PURE__ */ new Map();
		for (const node of nodes) {
			const parentId = node.parentId;
			const existing = map.get(parentId);
			if (existing === void 0) map.set(parentId, [node]);
			else existing.push(node);
		}
		return map;
	}
	/**
	* 按 data.subgraphId 分组边（undefined = 顶层）
	* 保留 canvas.edges 的原始顺序。
	*/
	groupEdgesBySubgraph(edges) {
		const map = /* @__PURE__ */ new Map();
		for (const edge of edges) {
			const subgraphId = edge.data.subgraphId;
			const existing = map.get(subgraphId);
			if (existing === void 0) map.set(subgraphId, [edge]);
			else existing.push(edge);
		}
		return map;
	}
	/**
	* 序列化 ClassApply blocks
	*
	* 扫描所有节点的 data.classNames，按 className 分组，
	* 每个 className 产出一个 ClassApplyBlock（含所有应用该 class 的节点 ID）。
	*/
	serializeClassApplyBlocks(nodes) {
		const classToNodes = /* @__PURE__ */ new Map();
		for (const node of nodes) {
			const classNames = node.data.classNames;
			if (classNames === void 0 || classNames.length === 0) continue;
			for (const className of classNames) {
				const existing = classToNodes.get(className);
				if (existing === void 0) classToNodes.set(className, [node.id]);
				else existing.push(node.id);
			}
		}
		const blocks = [];
		for (const [className, nodeIds] of classToNodes) blocks.push(createClassApplyBlock(nodeIds, className));
		return blocks;
	}
	/**
	* 序列化 Style blocks
	*
	* 扫描所有节点的 data.styles，按 styles 内容分组（相同 styles 的节点合并为一个 StyleBlock）。
	* 使用 \0 作为分隔符构建 key（避免 styles 内容冲突）。
	*/
	serializeStyleBlocks(nodes) {
		const stylesToNodes = /* @__PURE__ */ new Map();
		for (const node of nodes) {
			const styles = node.data.styles;
			if (styles === void 0 || styles.length === 0) continue;
			const key = styles.join("\0");
			const existing = stylesToNodes.get(key);
			if (existing === void 0) stylesToNodes.set(key, {
				nodeIds: [node.id],
				styles: [...styles]
			});
			else existing.nodeIds.push(node.id);
		}
		const blocks = [];
		for (const { nodeIds, styles } of stylesToNodes.values()) blocks.push(createStyleBlock(nodeIds, styles));
		return blocks;
	}
	/**
	* 序列化 LinkStyle blocks
	*
	* 两种产出：
	*   1. default：从 metadata.flowDefaultStyle + flowDefaultInterpolate 产出（若有）
	*   2. per-edge：扫描 edges.data.{styles, interpolate, animate}，按内容分组，
	*      产出带数字索引列表的 LinkStyleBlock
	*/
	serializeLinkStyleBlocks(edges, metadata) {
		const blocks = [];
		if (metadata.flowDefaultStyle !== void 0 || metadata.flowDefaultInterpolate !== void 0) blocks.push(createLinkStyleDefaultBlock(metadata.flowDefaultStyle ?? [], metadata.flowDefaultInterpolate, void 0));
		const styleToIndices = /* @__PURE__ */ new Map();
		for (let i = 0; i < edges.length; i++) {
			const edge = edges[i];
			const styles = edge.data.styles ?? [];
			const interpolate = edge.data.interpolate;
			const animate = edge.data.animate;
			if (styles.length === 0 && interpolate === void 0 && animate === void 0) continue;
			const key = `${styles.join("\0")}\0${interpolate ?? ""}\0${animate ?? ""}`;
			const existing = styleToIndices.get(key);
			if (existing === void 0) styleToIndices.set(key, {
				indices: [i],
				styles: [...styles],
				interpolate,
				animate
			});
			else existing.indices.push(i);
		}
		for (const { indices, styles, interpolate, animate } of styleToIndices.values()) blocks.push(createLinkStyleIndicesBlock(indices, styles, interpolate, animate));
		return blocks;
	}
	requireConverter(type) {
		const entry = this.lookup.get(type);
		if (entry === void 0) throw new Error(`Converter not registered for block type: ${type}`);
		return entry.converter;
	}
};
/**
* 路由型 ConverterRegistry — 按 diagramType 路由到具体 Registry
*
* 当前已注册：
*   - 'flowchart' → FlowchartConverterRegistry（Stage 4）
*   - 'classDiagram' → ClassConverterRegistry（M3 重构 L2-10）
*   - 'erDiagram' → ErConverterRegistry（erDiagram 重构 模块2 L2-11）
*
* 路由表通过 switch 分发，未实现的 diagramType 抛出程序错误。
*
* 类型安全（M3 重构 L2-10）：
*   - 接口层使用 `RecognizedBlock<string>[]` 基类型（协变兼容各 diagramType 窄类型）
*   - switch 分支内通过 `as` 收窄到具体窄类型（FlowchartRecognizedBlock[]/ClassRecognizedBlock[]/ErRecognizedBlock[]）
*   - 路由层转换安全：调用方按 diagramType 传入对应窄类型，路由层仅做类型断言不做值转换
*/
var RoutingConverterRegistry = class {
	constructor() {
		this.flowchartRegistry = new FlowchartConverterRegistry();
		this.classRegistry = new ClassConverterRegistry();
		this.erRegistry = new ErConverterRegistry();
	}
	parseBlocks(blocks, diagramType) {
		switch (diagramType) {
			case "flowchart": return this.flowchartRegistry.parseBlocks(blocks, diagramType);
			case "classDiagram": return this.classRegistry.parseBlocks(blocks, diagramType);
			case "erDiagram": return this.erRegistry.parseBlocks(blocks, diagramType);
			default: throw new Error(`ConverterRegistry: diagramType '${diagramType}' not yet implemented`);
		}
	}
	serialize(canvas, diagramType) {
		switch (diagramType) {
			case "flowchart": return this.flowchartRegistry.serialize(canvas, diagramType);
			case "classDiagram": return this.classRegistry.serialize(canvas, diagramType);
			case "erDiagram": return this.erRegistry.serialize(canvas, diagramType);
			default: throw new Error(`ConverterRegistry: diagramType '${diagramType}' not yet implemented`);
		}
	}
};
/**
* 全局 ConverterRegistry singleton
*
* 按 diagramType 路由到具体 Registry 实现。
* 当前已注册：flowchart、classDiagram、erDiagram。
*/
const converterRegistry = new RoutingConverterRegistry();
//#endregion
//#region src/serializer/assembler/context-stack.ts
var ContextStack = class {
	constructor() {
		this.frames = [{
			indent: 0,
			scopeId: void 0
		}];
	}
	current() {
		return this.frames[this.frames.length - 1];
	}
	currentIndent() {
		return " ".repeat(this.current().indent);
	}
	push(frame) {
		this.frames.push(frame);
	}
	pop() {
		if (this.frames.length <= 1) throw new Error("ContextStack.pop: stack underflow — close block without matching open block");
		const frame = this.frames.pop();
		if (frame === void 0) throw new Error("ContextStack.pop: stack invariant violated — pop returned undefined");
		return frame;
	}
	depth() {
		return this.frames.length - 1;
	}
};
//#endregion
//#region src/serializer/assembler/base-assembler.ts
/**
* 通用 Block[] 拼装函数，diagramType 无关。
*
* @param blocks Block 流（含 rawText/indent 字段，由 Converter serialize 方向产出）
* @param options 拼装选项（openBlockType/closeBlockType 区分 subgraph/namespace +
*                 preserveIndent 控制缩进 + getScopeId 提取 scopeId 用于 LIFO 校验）
* @returns body 字符串（不含 header，header 由 assembler/index.ts 生成）
* @throws Error 当 openBlock/closeBlock 不配对、scopeId 不匹配、或栈未归零时
*/
function assembleBlocks(blocks, options) {
	const preserveIndent = options.preserveIndent ?? true;
	const stack = new ContextStack();
	const lines = [];
	for (const block of blocks) {
		const indent = preserveIndent ? " ".repeat(block.indent) : "";
		if (block.type === options.openBlockType) {
			const scopeId = options.getScopeId(block);
			stack.push({
				indent: block.indent + 2,
				scopeId
			});
			lines.push(indentBlock(block.rawText, indent));
		} else if (block.type === options.closeBlockType) {
			const popped = stack.pop();
			const closeScopeId = options.getScopeId(block);
			if (popped.scopeId !== closeScopeId) throw new Error(`assembleBlocks: close block scopeId mismatch — expected '${popped.scopeId ?? "undefined"}', got '${closeScopeId}'`);
			lines.push(indentBlock(block.rawText, indent));
		} else lines.push(indentBlock(block.rawText, indent));
	}
	if (stack.depth() > 0) throw new Error(`assembleBlocks: unclosed scope(s) — stack depth ${stack.depth()} at end of assembly`);
	return lines.join("\n");
}
/**
* 对 rawText 应用 block 级缩进，处理多行 rawText（如 class 块体 `class Foo {\n  +field: Type\n}`）
*
* 单行 rawText（flowchart 全部 block + class 的 relation/note/namespace-open 等）：
*   直接返回 `${indent}${rawText}`
*
* 多行 rawText（class 块体含成员）：
*   对每一行应用 indent，保留 rawText 内部相对缩进（如成员的 2 空格 class 体缩进）
*   对齐老路径 serializeClassNode(node, indent) 行为：所有行都加 block 级 indent
*
* 空行不应用 indent（避免产生纯空白行，保持输出整洁）
*
* @param rawText - Converter serialize 方向产出的原始文本（含内部缩进，无 block 级缩进）
* @param indent - block 级缩进字符串（由 block.indent × ' ' 计算）
*/
function indentBlock(rawText, indent) {
	if (!rawText.includes("\n")) return `${indent}${rawText}`;
	return rawText.split("\n").map((line) => line.length > 0 ? `${indent}${line}` : line).join("\n");
}
//#endregion
//#region src/serializer/assembler/flowchart-assembler.ts
/** flowchart 嵌套边界 BlockType */
const FLOWCHART_OPEN_BLOCK_TYPE = "subgraph-open";
const FLOWCHART_CLOSE_BLOCK_TYPE = "subgraph-close";
/**
* 从 flowchart openBlock/closeBlock 提取 scopeId（subgraphId）
*
* 类型断言安全：仅当 block.type === 'subgraph-open' 或 'subgraph-close' 时调用，
* 对应 SubgraphOpenBlock / SubgraphCloseBlock，两者均有 subgraphId: string 必填字段。
* 返回类型为 string（非 undefined），与 AssembleInternalOptions.getScopeId 签名一致。
*/
function getFlowchartScopeId(block) {
	return block.subgraphId;
}
var FlowchartAssembler = class {
	/**
	* 组装 blocks 为代码字符串
	*
	* @param blocks - RecognizedBlock 数组（由 ConverterRegistry.serialize 产出，含正确 indent + rawText）
	* @param options - 用户面向组装选项（仅 preserveIndent；openBlockType/closeBlockType/getScopeId 由本类固定）
	* @returns 代码字符串（不含 header，header 由入口函数 assemble() 生成）
	* @throws Error 当 subgraph-open/close 不配对或 scopeId 不匹配时（由 baseAssembler 抛出）
	*/
	assemble(blocks, options) {
		return assembleBlocks(blocks, {
			preserveIndent: options?.preserveIndent,
			openBlockType: FLOWCHART_OPEN_BLOCK_TYPE,
			closeBlockType: FLOWCHART_CLOSE_BLOCK_TYPE,
			getScopeId: getFlowchartScopeId
		});
	}
};
//#endregion
//#region src/serializer/assembler/class-assembler.ts
/** classDiagram 嵌套边界 BlockType */
const CLASS_OPEN_BLOCK_TYPE = "namespace-open";
const CLASS_CLOSE_BLOCK_TYPE = "namespace-close";
/**
* 从 classDiagram openBlock/closeBlock 提取 scopeId（namespaceId）
*
* 类型断言安全：仅当 block.type === 'namespace-open' 或 'namespace-close' 时调用，
* 对应 NamespaceOpenBlock / NamespaceCloseBlock，两者均有 namespaceId: string 必填字段。
* 返回类型为 string（非 undefined），与 AssembleInternalOptions.getScopeId 签名一致。
*/
function getClassScopeId(block) {
	return block.namespaceId;
}
var ClassAssembler = class {
	/**
	* 组装 blocks 为 classDiagram 代码字符串
	*
	* @param blocks - RecognizedBlock 数组（由 ClassConverterRegistry.serialize 产出，含正确 indent + rawText）
	* @param options - 用户面向组装选项（仅 preserveIndent；openBlockType/closeBlockType/getScopeId 由本类固定）
	* @returns 代码字符串（不含 header，header 由入口函数 assemble() 生成）
	* @throws Error 当 namespace-open/close 不配对或 scopeId 不匹配时（由 baseAssembler 抛出）
	*/
	assemble(blocks, options) {
		return assembleBlocks(blocks, {
			preserveIndent: options?.preserveIndent,
			openBlockType: CLASS_OPEN_BLOCK_TYPE,
			closeBlockType: CLASS_CLOSE_BLOCK_TYPE,
			getScopeId: getClassScopeId
		});
	}
};
//#endregion
//#region src/serializer/assembler/er-assembler.ts
/** erDiagram 嵌套边界 BlockType */
const ER_OPEN_BLOCK_TYPE = "subgraph-open";
const ER_CLOSE_BLOCK_TYPE = "subgraph-close";
/**
* 从 erDiagram openBlock/closeBlock 提取 scopeId（subgraphId）
*
* 类型断言安全：仅当 block.type === 'subgraph-open' 或 'subgraph-close' 时调用，
* 对应 ErSubgraphOpenBlock / ErSubgraphCloseBlock，两者均有 subgraphId: string 必填字段。
* 返回类型为 string（非 undefined），与 AssembleInternalOptions.getScopeId 签名一致。
*/
function getErScopeId(block) {
	return block.subgraphId;
}
var ErAssembler = class {
	/**
	* 组装 blocks 为 erDiagram 代码字符串
	*
	* @param blocks - RecognizedBlock 数组（由 ErConverterRegistry.serialize 产出，含正确 indent + rawText）
	* @param options - 用户面向组装选项（仅 preserveIndent；openBlockType/closeBlockType/getScopeId 由本类固定）
	* @returns 代码字符串（不含 header，header 由入口函数 assemble() 生成）
	* @throws Error 当 subgraph-open/close 不配对或 scopeId 不匹配时（由 baseAssembler 抛出）
	*/
	assemble(blocks, options) {
		return assembleBlocks(blocks, {
			preserveIndent: options?.preserveIndent,
			openBlockType: ER_OPEN_BLOCK_TYPE,
			closeBlockType: ER_CLOSE_BLOCK_TYPE,
			getScopeId: getErScopeId
		});
	}
};
new FlowchartAssembler();
new ClassAssembler();
new ErAssembler();
//#endregion
//#region src/serializer/detector/detector-registry.ts
/**
* Detector 注册表（单一数据源）
*
* 设计要点:
*   - 按 priority 排序，priority 相同按注册顺序
*   - match() 遍历所有 detector，第一个返回 true 的胜出
*   - 支持重复注册（后注册覆盖同 type 的旧记录）
*/
var DetectorRegistry = class {
	constructor() {
		this.records = /* @__PURE__ */ new Map();
	}
	/**
	* 注册 detector
	* 同 type 重复注册会覆盖旧记录
	*/
	register(record) {
		const normalized = {
			type: record.type,
			detector: record.detector,
			priority: record.priority ?? 100
		};
		this.records.set(record.type, normalized);
	}
	/**
	* 批量注册
	*/
	registerAll(records) {
		for (const record of records) this.register(record);
	}
	/**
	* 匹配图表类型（按优先级顺序）
	*
	* @param text - 预处理后的代码
	* @returns 匹配的 DiagramType，无匹配返回 null
	*/
	match(text) {
		const sorted = this.getSortedRecords();
		for (const record of sorted) if (record.detector(text)) return record.type;
		return null;
	}
	/**
	* 获取所有已注册 detector（按优先级排序，用于调试/测试）
	*/
	getAll() {
		return this.getSortedRecords();
	}
	/**
	* 获取按优先级排序的 record 列表
	*/
	getSortedRecords() {
		return Array.from(this.records.values()).sort((a, b) => a.priority - b.priority);
	}
};
/** 全局 detector 注册表实例（单一数据源） */
const detectorRegistry = new DetectorRegistry();
//#endregion
//#region src/serializer/detector/preprocessor.ts
/**
* 代码预处理器 — 参考官方 mermaid regexes.ts
*
* 单一职责：移除 frontmatter / 指令 / 注释，返回纯净代码用于 jison 解析
*
* 行号一致性保证（关键约束）:
*   预处理后的代码必须与原始代码行号一一对应，因为:
*   1. 增量序列化通过 _sourceLine 定位 rawCode（原始代码）的行
*   2. inferSourceLines 基于 _sourceLine 推断节点/边在原始代码中的位置
*   3. 任何预处理都不得改变行号（移除整行会破坏行号映射）
*
* 实现: 所有预处理（frontmatter/指令/注释）均替换为等数量的换行符，
*       保持总行数不变，从而保持行号一致
*
* 数据流:
*   rawCode → frontmatter 替换为换行 → 指令替换为换行 → 注释替换为换行 → 返回纯净代码
*
* 参考来源:
*   - mermaid-develop/packages/mermaid/src/diagram-api/comments.ts (cleanupComments)
*   - mermaid-develop/packages/mermaid/src/diagram-api/regexes.ts (frontMatterRegex)
*   - mermaid-develop/packages/mermaid/src/diagram-api/detectType.ts (directiveRegex)
*/
/**
* Jekyll 风格 frontmatter 块（---...---）
* 基于官方 frontMatterRegex，支持缩进对齐的闭合 ---
*/
const frontMatterRegex = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s;
/**
* Mermaid 指令块（%%{...}%%）
* 对齐官方 directiveRegex
*/
const directiveRegex = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;
/**
* Mermaid 注释（%%...）
* 对齐官方 anyCommentRegex
* 注意: 不匹配 `%%{` 开头的指令（指令由 directiveRegex 处理）
*/
const anyCommentRegex = /\s*%%(?!\{).*\n/gm;
/**
* 将匹配内容替换为等数量的换行符，保持行号一致
*
* @param match - 正则匹配的完整字符串
* @returns 与 match 中换行符数量相同的换行符字符串
*/
function replaceWithNewlines(match) {
	const newlineCount = (match.match(/\n/g) ?? []).length;
	return "\n".repeat(newlineCount);
}
/**
* 预处理 Mermaid 代码（去 frontmatter/指令/注释）
*
* 预处理顺序（对齐官方 detectType.ts）:
*   1. frontmatter 替换为等长换行（保持行号）
*   2. 指令替换为等长换行（保持行号）
*   3. 注释替换为换行（保持行号）
*
* 行号一致性: 所有预处理均保持原始代码的行数，确保 _sourceLine 与 rawCode 行号一一对应
*
* @param code - 原始 Mermaid 代码
* @returns 纯净代码（仅保留图表关键字和内容，行号与原始代码一致）
*/
function preprocessCode(code) {
	return code.replace(frontMatterRegex, (match) => replaceWithNewlines(match)).replace(directiveRegex, (match) => replaceWithNewlines(match)).replace(anyCommentRegex, "\n");
}
/**
* 从 frontmatter 中提取 title 字段
*
* 对齐官方 Diagram.ts 的处理逻辑:
*   - 官方通过 extractFrontMatter 解析 YAML frontmatter 获取 metadata.title
*   - 然后 db.setDiagramTitle(metadata.title) 设置标题
*   - title 不是 jison 语法，必须通过 frontmatter 处理
*
* 简化实现: 不依赖 js-yaml，仅用正则提取 title 字段
*   - 支持 `title: My Title` 和 `title: "My Title"` 两种格式
*   - 不支持多行 YAML 值（title 通常是单行字符串）
*
* @param code - 原始 Mermaid 代码（可能含 frontmatter）
* @returns title 字符串（无 frontmatter 时返回 undefined）
*/
function extractFrontmatterTitle(code) {
	const matches = code.match(frontMatterRegex);
	if (!matches) return;
	const titleMatch = (matches[2] ?? "").match(/^title:\s*(?:"([^"]*)"|'([^']*)'|(.+))\s*$/m);
	if (!titleMatch) return;
	return (titleMatch[1] ?? titleMatch[2] ?? titleMatch[3])?.trim();
}
//#endregion
//#region src/serializer/detector/builtin-detectors.ts
/**
* 创建关键字 detector
* 匹配代码开头（支持前导空白）是否以指定关键字开始
*/
function keywordDetector(keyword) {
	const regex = new RegExp(`^\\s*${escapeRegex(keyword)}\\b`);
	return (text) => regex.test(text);
}
/** 转义正则特殊字符 */
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
* 创建多关键字 detector（匹配任意一个关键字）
* 用于合并带后缀和不带后缀的关键字（如 stateDiagram-v2 和 stateDiagram）
*/
function multiKeywordDetector(keywords) {
	const sorted = [...keywords.map(escapeRegex)].sort((a, b) => b.length - a.length);
	const regex = new RegExp(`^\\s*(?:${sorted.join("|")})\\b`);
	return (text) => regex.test(text);
}
/**
* 内置 detector 列表（按优先级排序）
*
* 优先级说明:
*   - 10: 带后缀关键字的图类型（合并带后缀和不带后缀的 detector）
*   - 20: 常见图类型（flowchart/graph）
*   - 30: 其他图类型
*
* 注意：同一 DiagramType 只出现一次，避免 DetectorRegistry 覆盖
*/
const BUILTIN_DETECTORS = [
	{
		type: "architecture",
		detector: multiKeywordDetector(["architecture-beta", "architecture"]),
		priority: 10
	},
	{
		type: "stateDiagram",
		detector: multiKeywordDetector(["stateDiagram-v2", "stateDiagram"]),
		priority: 10
	},
	{
		type: "xychart",
		detector: multiKeywordDetector(["xychart-beta", "xychart"]),
		priority: 10
	},
	{
		type: "flowchart",
		detector: (text) => /^\s*(?:flowchart|graph)\b/.test(text),
		priority: 20
	},
	{
		type: "sequenceDiagram",
		detector: keywordDetector("sequenceDiagram"),
		priority: 30
	},
	{
		type: "classDiagram",
		detector: keywordDetector("classDiagram"),
		priority: 30
	},
	{
		type: "erDiagram",
		detector: keywordDetector("erDiagram"),
		priority: 30
	},
	{
		type: "mindmap",
		detector: keywordDetector("mindmap"),
		priority: 30
	},
	{
		type: "gantt",
		detector: keywordDetector("gantt"),
		priority: 30
	},
	{
		type: "pie",
		detector: keywordDetector("pie"),
		priority: 30
	},
	{
		type: "timeline",
		detector: keywordDetector("timeline"),
		priority: 30
	},
	{
		type: "quadrantChart",
		detector: keywordDetector("quadrantChart"),
		priority: 30
	}
];
//#endregion
//#region src/serializer/detector/index.ts
/** 标记内置 detector 是否已注册（防止重复注册） */
let builtinRegistered = false;
/**
* 注册所有内置 detector（模块初始化时调用）
* 幂等：重复调用不会重复注册
*/
function registerBuiltinDetectors() {
	if (builtinRegistered) return;
	detectorRegistry.registerAll(BUILTIN_DETECTORS);
	builtinRegistered = true;
}
registerBuiltinDetectors();
/**
* 从代码检测图表类型（统一入口）
*
* 流程:
*   1. 空代码返回 null
*   2. 预处理（去 frontmatter/指令/注释）
*   3. 按优先级匹配 detector
*
* @param code - 原始 Mermaid 代码
* @returns 匹配的 DiagramType，无匹配返回 null
*/
function detectDiagramType(code) {
	if (code.trim().length === 0) return null;
	const preprocessed = preprocessCode(code);
	return detectorRegistry.match(preprocessed);
}
//#endregion
//#region src/serializer/parser/jison/flow-parser.js
var flow = (function() {
	var o = function(k, v, o, l) {
		for (o = o || {}, l = k.length; l--; o[k[l]] = v);
		return o;
	}, $V0 = [1, 4], $V1 = [1, 3], $V2 = [1, 5], $V3 = [
		1,
		8,
		9,
		10,
		11,
		34,
		36,
		38,
		39,
		45,
		61,
		85,
		86,
		87,
		88,
		89,
		90,
		103,
		106,
		107,
		110,
		112,
		115,
		116,
		117,
		122,
		123,
		124,
		125,
		126
	], $V4 = [2, 2], $V5 = [1, 13], $V6 = [1, 14], $V7 = [1, 15], $V8 = [1, 16], $V9 = [1, 25], $Va = [1, 26], $Vb = [1, 27], $Vc = [1, 34], $Vd = [1, 51], $Ve = [1, 50], $Vf = [1, 29], $Vg = [1, 30], $Vh = [1, 31], $Vi = [1, 32], $Vj = [1, 33], $Vk = [1, 46], $Vl = [1, 48], $Vm = [1, 44], $Vn = [1, 49], $Vo = [1, 45], $Vp = [1, 52], $Vq = [1, 47], $Vr = [1, 53], $Vs = [1, 54], $Vt = [1, 35], $Vu = [1, 36], $Vv = [1, 37], $Vw = [1, 38], $Vx = [1, 39], $Vy = [1, 59], $Vz = [
		1,
		8,
		9,
		10,
		11,
		32,
		34,
		36,
		38,
		39,
		45,
		61,
		85,
		86,
		87,
		88,
		89,
		90,
		103,
		106,
		107,
		110,
		112,
		115,
		116,
		117,
		122,
		123,
		124,
		125,
		126
	], $VA = [1, 63], $VB = [1, 62], $VC = [1, 64], $VD = [
		8,
		9,
		11,
		76,
		78,
		79
	], $VE = [1, 80], $VF = [1, 93], $VG = [1, 98], $VH = [1, 97], $VI = [1, 94], $VJ = [1, 90], $VK = [1, 96], $VL = [1, 92], $VM = [1, 99], $VN = [1, 95], $VO = [1, 100], $VP = [1, 91], $VQ = [
		8,
		9,
		10,
		11,
		41,
		76,
		78,
		79
	], $VR = [
		8,
		9,
		10,
		11,
		41,
		47,
		76,
		78,
		79
	], $VS = [
		8,
		9,
		10,
		11,
		29,
		41,
		45,
		47,
		49,
		51,
		53,
		55,
		57,
		59,
		61,
		64,
		66,
		68,
		69,
		71,
		76,
		78,
		79,
		90,
		103,
		106,
		107,
		110,
		112,
		115,
		116,
		117
	], $VT = [
		8,
		9,
		11,
		45,
		61,
		76,
		78,
		79,
		90,
		103,
		106,
		107,
		110,
		112,
		115,
		116,
		117
	], $VU = [
		45,
		61,
		90,
		103,
		106,
		107,
		110,
		112,
		115,
		116,
		117
	], $VV = [1, 123], $VW = [1, 124], $VX = [1, 126], $VY = [1, 125], $VZ = [
		45,
		61,
		63,
		75,
		90,
		103,
		106,
		107,
		110,
		112,
		115,
		116,
		117
	], $V_ = [1, 135], $V$ = [1, 149], $V01 = [1, 150], $V11 = [1, 152], $V21 = [1, 151], $V31 = [1, 137], $V41 = [1, 139], $V51 = [1, 143], $V61 = [1, 144], $V71 = [1, 145], $V81 = [1, 146], $V91 = [1, 147], $Va1 = [1, 148], $Vb1 = [1, 153], $Vc1 = [1, 154], $Vd1 = [1, 133], $Ve1 = [1, 134], $Vf1 = [1, 141], $Vg1 = [1, 136], $Vh1 = [1, 140], $Vi1 = [1, 138], $Vj1 = [
		8,
		9,
		10,
		11,
		32,
		34,
		36,
		38,
		39,
		45,
		61,
		85,
		86,
		87,
		88,
		89,
		90,
		103,
		106,
		107,
		110,
		112,
		115,
		116,
		117,
		122,
		123,
		124,
		125,
		126
	], $Vk1 = [1, 156], $Vl1 = [1, 158], $Vm1 = [
		8,
		9,
		11
	], $Vn1 = [
		8,
		9,
		10,
		11,
		14,
		45,
		61,
		90,
		106,
		107,
		110,
		112,
		115,
		116,
		117
	], $Vo1 = [1, 178], $Vp1 = [1, 174], $Vq1 = [1, 175], $Vr1 = [1, 179], $Vs1 = [1, 176], $Vt1 = [1, 177], $Vu1 = [
		78,
		117,
		120
	], $Vv1 = [
		8,
		9,
		10,
		11,
		12,
		14,
		29,
		32,
		39,
		45,
		61,
		76,
		85,
		86,
		87,
		88,
		89,
		90,
		91,
		106,
		110,
		112,
		115,
		116,
		117
	], $Vw1 = [10, 107], $Vx1 = [
		31,
		50,
		52,
		54,
		56,
		58,
		63,
		65,
		67,
		68,
		70,
		72,
		117,
		118,
		119
	], $Vy1 = [1, 249], $Vz1 = [1, 247], $VA1 = [1, 251], $VB1 = [1, 245], $VC1 = [1, 246], $VD1 = [1, 248], $VE1 = [1, 250], $VF1 = [1, 252], $VG1 = [1, 270], $VH1 = [
		8,
		9,
		11,
		107
	], $VI1 = [
		8,
		9,
		10,
		11,
		61,
		85,
		106,
		107,
		110,
		111,
		112,
		113
	];
	var parser = {
		trace: function trace() {},
		yy: {},
		symbols_: {
			"error": 2,
			"start": 3,
			"graphConfig": 4,
			"document": 5,
			"line": 6,
			"statement": 7,
			"SEMI": 8,
			"NEWLINE": 9,
			"SPACE": 10,
			"EOF": 11,
			"GRAPH": 12,
			"NODIR": 13,
			"DIR": 14,
			"FirstStmtSeparator": 15,
			"ending": 16,
			"endToken": 17,
			"spaceList": 18,
			"spaceListNewline": 19,
			"vertexStatement": 20,
			"separator": 21,
			"styleStatement": 22,
			"linkStyleStatement": 23,
			"classDefStatement": 24,
			"classStatement": 25,
			"clickStatement": 26,
			"subgraphStart": 27,
			"textNoTags": 28,
			"SQS": 29,
			"text": 30,
			"SQE": 31,
			"end": 32,
			"direction": 33,
			"acc_title": 34,
			"acc_title_value": 35,
			"acc_descr": 36,
			"acc_descr_value": 37,
			"acc_descr_multiline_value": 38,
			"subgraph": 39,
			"shapeData": 40,
			"SHAPE_DATA": 41,
			"link": 42,
			"node": 43,
			"styledVertex": 44,
			"AMP": 45,
			"vertex": 46,
			"STYLE_SEPARATOR": 47,
			"idString": 48,
			"DOUBLECIRCLESTART": 49,
			"DOUBLECIRCLEEND": 50,
			"PS": 51,
			"PE": 52,
			"(-": 53,
			"-)": 54,
			"STADIUMSTART": 55,
			"STADIUMEND": 56,
			"SUBROUTINESTART": 57,
			"SUBROUTINEEND": 58,
			"VERTEX_WITH_PROPS_START": 59,
			"NODE_STRING[field]": 60,
			"COLON": 61,
			"NODE_STRING[value]": 62,
			"PIPE": 63,
			"CYLINDERSTART": 64,
			"CYLINDEREND": 65,
			"DIAMOND_START": 66,
			"DIAMOND_STOP": 67,
			"TAGEND": 68,
			"TRAPSTART": 69,
			"TRAPEND": 70,
			"INVTRAPSTART": 71,
			"INVTRAPEND": 72,
			"linkStatement": 73,
			"arrowText": 74,
			"TESTSTR": 75,
			"START_LINK": 76,
			"edgeText": 77,
			"LINK": 78,
			"LINK_ID": 79,
			"edgeTextToken": 80,
			"STR": 81,
			"MD_STR": 82,
			"textToken": 83,
			"keywords": 84,
			"STYLE": 85,
			"LINKSTYLE": 86,
			"CLASSDEF": 87,
			"CLASS": 88,
			"CLICK": 89,
			"DOWN": 90,
			"UP": 91,
			"textNoTagsToken": 92,
			"stylesOpt": 93,
			"idString[vertex]": 94,
			"idString[class]": 95,
			"CALLBACKNAME": 96,
			"CALLBACKARGS": 97,
			"HREF": 98,
			"LINK_TARGET": 99,
			"STR[link]": 100,
			"STR[tooltip]": 101,
			"alphaNum": 102,
			"DEFAULT": 103,
			"numList": 104,
			"INTERPOLATE": 105,
			"NUM": 106,
			"COMMA": 107,
			"style": 108,
			"styleComponent": 109,
			"NODE_STRING": 110,
			"UNIT": 111,
			"BRKT": 112,
			"PCT": 113,
			"idStringToken": 114,
			"MINUS": 115,
			"MULT": 116,
			"UNICODE_TEXT": 117,
			"TEXT": 118,
			"TAGSTART": 119,
			"EDGE_TEXT": 120,
			"alphaNumToken": 121,
			"direction_tb": 122,
			"direction_bt": 123,
			"direction_rl": 124,
			"direction_lr": 125,
			"direction_td": 126,
			"$accept": 0,
			"$end": 1
		},
		terminals_: {
			2: "error",
			8: "SEMI",
			9: "NEWLINE",
			10: "SPACE",
			11: "EOF",
			12: "GRAPH",
			13: "NODIR",
			14: "DIR",
			29: "SQS",
			31: "SQE",
			32: "end",
			34: "acc_title",
			35: "acc_title_value",
			36: "acc_descr",
			37: "acc_descr_value",
			38: "acc_descr_multiline_value",
			39: "subgraph",
			41: "SHAPE_DATA",
			45: "AMP",
			47: "STYLE_SEPARATOR",
			49: "DOUBLECIRCLESTART",
			50: "DOUBLECIRCLEEND",
			51: "PS",
			52: "PE",
			53: "(-",
			54: "-)",
			55: "STADIUMSTART",
			56: "STADIUMEND",
			57: "SUBROUTINESTART",
			58: "SUBROUTINEEND",
			59: "VERTEX_WITH_PROPS_START",
			60: "NODE_STRING[field]",
			61: "COLON",
			62: "NODE_STRING[value]",
			63: "PIPE",
			64: "CYLINDERSTART",
			65: "CYLINDEREND",
			66: "DIAMOND_START",
			67: "DIAMOND_STOP",
			68: "TAGEND",
			69: "TRAPSTART",
			70: "TRAPEND",
			71: "INVTRAPSTART",
			72: "INVTRAPEND",
			75: "TESTSTR",
			76: "START_LINK",
			78: "LINK",
			79: "LINK_ID",
			81: "STR",
			82: "MD_STR",
			85: "STYLE",
			86: "LINKSTYLE",
			87: "CLASSDEF",
			88: "CLASS",
			89: "CLICK",
			90: "DOWN",
			91: "UP",
			94: "idString[vertex]",
			95: "idString[class]",
			96: "CALLBACKNAME",
			97: "CALLBACKARGS",
			98: "HREF",
			99: "LINK_TARGET",
			100: "STR[link]",
			101: "STR[tooltip]",
			103: "DEFAULT",
			105: "INTERPOLATE",
			106: "NUM",
			107: "COMMA",
			110: "NODE_STRING",
			111: "UNIT",
			112: "BRKT",
			113: "PCT",
			115: "MINUS",
			116: "MULT",
			117: "UNICODE_TEXT",
			118: "TEXT",
			119: "TAGSTART",
			120: "EDGE_TEXT",
			122: "direction_tb",
			123: "direction_bt",
			124: "direction_rl",
			125: "direction_lr",
			126: "direction_td"
		},
		productions_: [
			0,
			[3, 2],
			[5, 0],
			[5, 2],
			[6, 1],
			[6, 1],
			[6, 1],
			[6, 1],
			[6, 1],
			[4, 2],
			[4, 2],
			[4, 2],
			[4, 3],
			[16, 2],
			[16, 1],
			[17, 1],
			[17, 1],
			[17, 1],
			[15, 1],
			[15, 1],
			[15, 2],
			[19, 2],
			[19, 2],
			[19, 1],
			[19, 1],
			[18, 2],
			[18, 1],
			[7, 2],
			[7, 2],
			[7, 2],
			[7, 2],
			[7, 2],
			[7, 2],
			[7, 9],
			[7, 6],
			[7, 4],
			[7, 1],
			[7, 2],
			[7, 2],
			[7, 1],
			[27, 1],
			[21, 1],
			[21, 1],
			[21, 1],
			[40, 2],
			[40, 1],
			[20, 4],
			[20, 3],
			[20, 4],
			[20, 2],
			[20, 2],
			[20, 1],
			[43, 1],
			[43, 6],
			[43, 5],
			[44, 1],
			[44, 3],
			[46, 4],
			[46, 4],
			[46, 6],
			[46, 4],
			[46, 4],
			[46, 4],
			[46, 8],
			[46, 4],
			[46, 4],
			[46, 4],
			[46, 6],
			[46, 4],
			[46, 4],
			[46, 4],
			[46, 4],
			[46, 4],
			[46, 1],
			[42, 2],
			[42, 3],
			[42, 3],
			[42, 1],
			[42, 3],
			[42, 4],
			[77, 1],
			[77, 2],
			[77, 1],
			[77, 1],
			[73, 1],
			[73, 2],
			[74, 3],
			[30, 1],
			[30, 2],
			[30, 1],
			[30, 1],
			[84, 1],
			[84, 1],
			[84, 1],
			[84, 1],
			[84, 1],
			[84, 1],
			[84, 1],
			[84, 1],
			[84, 1],
			[84, 1],
			[84, 1],
			[28, 1],
			[28, 2],
			[28, 1],
			[28, 1],
			[24, 5],
			[25, 5],
			[26, 2],
			[26, 4],
			[26, 3],
			[26, 5],
			[26, 3],
			[26, 5],
			[26, 5],
			[26, 7],
			[26, 2],
			[26, 4],
			[26, 2],
			[26, 4],
			[26, 4],
			[26, 6],
			[22, 5],
			[23, 5],
			[23, 5],
			[23, 9],
			[23, 9],
			[23, 7],
			[23, 7],
			[104, 1],
			[104, 3],
			[93, 1],
			[93, 3],
			[108, 1],
			[108, 2],
			[109, 1],
			[109, 1],
			[109, 1],
			[109, 1],
			[109, 1],
			[109, 1],
			[109, 1],
			[109, 1],
			[114, 1],
			[114, 1],
			[114, 1],
			[114, 1],
			[114, 1],
			[114, 1],
			[114, 1],
			[114, 1],
			[114, 1],
			[114, 1],
			[114, 1],
			[83, 1],
			[83, 1],
			[83, 1],
			[83, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[80, 1],
			[80, 1],
			[121, 1],
			[121, 1],
			[121, 1],
			[121, 1],
			[121, 1],
			[121, 1],
			[121, 1],
			[121, 1],
			[121, 1],
			[121, 1],
			[121, 1],
			[48, 1],
			[48, 2],
			[102, 1],
			[102, 2],
			[33, 1],
			[33, 1],
			[33, 1],
			[33, 1],
			[33, 1]
		],
		performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$) {
			var $0 = $$.length - 1;
			switch (yystate) {
				case 2:
					this.$ = [];
					break;
				case 3:
					if (!Array.isArray($$[$0]) || $$[$0].length > 0) $$[$0 - 1].push($$[$0]);
					this.$ = $$[$0 - 1];
					break;
				case 4:
				case 184:
					this.$ = $$[$0];
					break;
				case 11:
					yy.setDirection("TB");
					this.$ = "TB";
					break;
				case 12:
					yy.setDirection($$[$0 - 1]);
					this.$ = $$[$0 - 1];
					break;
				case 27:
					this.$ = $$[$0 - 1].nodes;
					break;
				case 28:
				case 29:
				case 30:
				case 31:
				case 32:
					this.$ = [];
					break;
				case 33:
					this.$ = yy.addSubGraph($$[$0 - 6], $$[$0 - 1], $$[$0 - 4]);
					break;
				case 34:
					this.$ = yy.addSubGraph($$[$0 - 3], $$[$0 - 1], $$[$0 - 3]);
					break;
				case 35:
					this.$ = yy.addSubGraph(void 0, $$[$0 - 1], void 0);
					break;
				case 37:
					this.$ = $$[$0].trim();
					yy.setAccTitle(this.$);
					break;
				case 38:
				case 39:
					this.$ = $$[$0].trim();
					yy.setAccDescription(this.$);
					break;
				case 40:
					yy.enterScope();
					break;
				case 44:
					this.$ = $$[$0 - 1] + $$[$0];
					break;
				case 45:
					this.$ = $$[$0];
					break;
				case 46:
					yy.addVertex($$[$0 - 1][$$[$0 - 1].length - 1], void 0, void 0, void 0, void 0, void 0, void 0, $$[$0]);
					yy.addLink($$[$0 - 3].stmt, $$[$0 - 1], $$[$0 - 2]);
					this.$ = {
						stmt: $$[$0 - 1],
						nodes: $$[$0 - 1].concat($$[$0 - 3].nodes)
					};
					break;
				case 47:
					yy.addLink($$[$0 - 2].stmt, $$[$0], $$[$0 - 1]);
					this.$ = {
						stmt: $$[$0],
						nodes: $$[$0].concat($$[$0 - 2].nodes)
					};
					break;
				case 48:
					yy.addLink($$[$0 - 3].stmt, $$[$0 - 1], $$[$0 - 2]);
					this.$ = {
						stmt: $$[$0 - 1],
						nodes: $$[$0 - 1].concat($$[$0 - 3].nodes)
					};
					break;
				case 49:
					this.$ = {
						stmt: $$[$0 - 1],
						nodes: $$[$0 - 1]
					};
					break;
				case 50:
					yy.addVertex($$[$0 - 1][$$[$0 - 1].length - 1], void 0, void 0, void 0, void 0, void 0, void 0, $$[$0]);
					this.$ = {
						stmt: $$[$0 - 1],
						nodes: $$[$0 - 1],
						shapeData: $$[$0]
					};
					break;
				case 51:
					this.$ = {
						stmt: $$[$0],
						nodes: $$[$0]
					};
					break;
				case 52:
					this.$ = [$$[$0]];
					break;
				case 53:
					yy.addVertex($$[$0 - 5][$$[$0 - 5].length - 1], void 0, void 0, void 0, void 0, void 0, void 0, $$[$0 - 4]);
					this.$ = $$[$0 - 5].concat($$[$0]);
					break;
				case 54:
					this.$ = $$[$0 - 4].concat($$[$0]);
					break;
				case 55:
					this.$ = $$[$0];
					break;
				case 56:
					this.$ = $$[$0 - 2];
					yy.setClass($$[$0 - 2], $$[$0]);
					break;
				case 57:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "square");
					break;
				case 58:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "doublecircle");
					break;
				case 59:
					this.$ = $$[$0 - 5];
					yy.addVertex($$[$0 - 5], $$[$0 - 2], "circle");
					break;
				case 60:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "ellipse");
					break;
				case 61:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "stadium");
					break;
				case 62:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "subroutine");
					break;
				case 63:
					this.$ = $$[$0 - 7];
					yy.addVertex($$[$0 - 7], $$[$0 - 1], "rect", void 0, void 0, void 0, Object.fromEntries([[$$[$0 - 5], $$[$0 - 3]]]));
					break;
				case 64:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "cylinder");
					break;
				case 65:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "round");
					break;
				case 66:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "diamond");
					break;
				case 67:
					this.$ = $$[$0 - 5];
					yy.addVertex($$[$0 - 5], $$[$0 - 2], "hexagon");
					break;
				case 68:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "odd");
					break;
				case 69:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "trapezoid");
					break;
				case 70:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "inv_trapezoid");
					break;
				case 71:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "lean_right");
					break;
				case 72:
					this.$ = $$[$0 - 3];
					yy.addVertex($$[$0 - 3], $$[$0 - 1], "lean_left");
					break;
				case 73:
					this.$ = $$[$0];
					yy.addVertex($$[$0]);
					break;
				case 74:
					$$[$0 - 1].text = $$[$0];
					this.$ = $$[$0 - 1];
					break;
				case 75:
				case 76:
					$$[$0 - 2].text = $$[$0 - 1];
					this.$ = $$[$0 - 2];
					break;
				case 77:
					this.$ = $$[$0];
					break;
				case 78:
					var inf = yy.destructLink($$[$0], $$[$0 - 2]);
					this.$ = {
						"type": inf.type,
						"stroke": inf.stroke,
						"length": inf.length,
						"text": $$[$0 - 1]
					};
					break;
				case 79:
					var inf = yy.destructLink($$[$0], $$[$0 - 2]);
					this.$ = {
						"type": inf.type,
						"stroke": inf.stroke,
						"length": inf.length,
						"text": $$[$0 - 1],
						"id": $$[$0 - 3]
					};
					break;
				case 80:
					this.$ = {
						text: $$[$0],
						type: "text"
					};
					break;
				case 81:
					this.$ = {
						text: $$[$0 - 1].text + "" + $$[$0],
						type: $$[$0 - 1].type
					};
					break;
				case 82:
					this.$ = {
						text: $$[$0],
						type: "string"
					};
					break;
				case 83:
					this.$ = {
						text: $$[$0],
						type: "markdown"
					};
					break;
				case 84:
					var inf = yy.destructLink($$[$0]);
					this.$ = {
						"type": inf.type,
						"stroke": inf.stroke,
						"length": inf.length
					};
					break;
				case 85:
					var inf = yy.destructLink($$[$0]);
					this.$ = {
						"type": inf.type,
						"stroke": inf.stroke,
						"length": inf.length,
						"id": $$[$0 - 1]
					};
					break;
				case 86:
					this.$ = $$[$0 - 1];
					break;
				case 87:
					this.$ = {
						text: $$[$0],
						type: "text"
					};
					break;
				case 88:
					this.$ = {
						text: $$[$0 - 1].text + "" + $$[$0],
						type: $$[$0 - 1].type
					};
					break;
				case 89:
					this.$ = {
						text: $$[$0],
						type: "string"
					};
					break;
				case 90:
				case 105:
					this.$ = {
						text: $$[$0],
						type: "markdown"
					};
					break;
				case 102:
					this.$ = {
						text: $$[$0],
						type: "text"
					};
					break;
				case 103:
					this.$ = {
						text: $$[$0 - 1].text + "" + $$[$0],
						type: $$[$0 - 1].type
					};
					break;
				case 104:
					this.$ = {
						text: $$[$0],
						type: "text"
					};
					break;
				case 106:
					this.$ = $$[$0 - 4];
					yy.addClass($$[$0 - 2], $$[$0]);
					break;
				case 107:
					this.$ = $$[$0 - 4];
					yy.setClass($$[$0 - 2], $$[$0]);
					break;
				case 108:
				case 116:
					this.$ = $$[$0 - 1];
					yy.setClickEvent($$[$0 - 1], $$[$0]);
					break;
				case 109:
				case 117:
					this.$ = $$[$0 - 3];
					yy.setClickEvent($$[$0 - 3], $$[$0 - 2]);
					yy.setTooltip($$[$0 - 3], $$[$0]);
					break;
				case 110:
					this.$ = $$[$0 - 2];
					yy.setClickEvent($$[$0 - 2], $$[$0 - 1], $$[$0]);
					break;
				case 111:
					this.$ = $$[$0 - 4];
					yy.setClickEvent($$[$0 - 4], $$[$0 - 3], $$[$0 - 2]);
					yy.setTooltip($$[$0 - 4], $$[$0]);
					break;
				case 112:
					this.$ = $$[$0 - 2];
					yy.setLink($$[$0 - 2], $$[$0]);
					break;
				case 113:
					this.$ = $$[$0 - 4];
					yy.setLink($$[$0 - 4], $$[$0 - 2]);
					yy.setTooltip($$[$0 - 4], $$[$0]);
					break;
				case 114:
					this.$ = $$[$0 - 4];
					yy.setLink($$[$0 - 4], $$[$0 - 2], $$[$0]);
					break;
				case 115:
					this.$ = $$[$0 - 6];
					yy.setLink($$[$0 - 6], $$[$0 - 4], $$[$0]);
					yy.setTooltip($$[$0 - 6], $$[$0 - 2]);
					break;
				case 118:
					this.$ = $$[$0 - 1];
					yy.setLink($$[$0 - 1], $$[$0]);
					break;
				case 119:
					this.$ = $$[$0 - 3];
					yy.setLink($$[$0 - 3], $$[$0 - 2]);
					yy.setTooltip($$[$0 - 3], $$[$0]);
					break;
				case 120:
					this.$ = $$[$0 - 3];
					yy.setLink($$[$0 - 3], $$[$0 - 2], $$[$0]);
					break;
				case 121:
					this.$ = $$[$0 - 5];
					yy.setLink($$[$0 - 5], $$[$0 - 4], $$[$0]);
					yy.setTooltip($$[$0 - 5], $$[$0 - 2]);
					break;
				case 122:
					this.$ = $$[$0 - 4];
					yy.addVertex($$[$0 - 2], void 0, void 0, $$[$0]);
					break;
				case 123:
					this.$ = $$[$0 - 4];
					yy.updateLink([$$[$0 - 2]], $$[$0]);
					break;
				case 124:
					this.$ = $$[$0 - 4];
					yy.updateLink($$[$0 - 2], $$[$0]);
					break;
				case 125:
					this.$ = $$[$0 - 8];
					yy.updateLinkInterpolate([$$[$0 - 6]], $$[$0 - 2]);
					yy.updateLink([$$[$0 - 6]], $$[$0]);
					break;
				case 126:
					this.$ = $$[$0 - 8];
					yy.updateLinkInterpolate($$[$0 - 6], $$[$0 - 2]);
					yy.updateLink($$[$0 - 6], $$[$0]);
					break;
				case 127:
					this.$ = $$[$0 - 6];
					yy.updateLinkInterpolate([$$[$0 - 4]], $$[$0]);
					break;
				case 128:
					this.$ = $$[$0 - 6];
					yy.updateLinkInterpolate($$[$0 - 4], $$[$0]);
					break;
				case 129:
				case 131:
					this.$ = [$$[$0]];
					break;
				case 130:
				case 132:
					$$[$0 - 2].push($$[$0]);
					this.$ = $$[$0 - 2];
					break;
				case 134:
					this.$ = $$[$0 - 1] + $$[$0];
					break;
				case 182:
					this.$ = $$[$0];
					break;
				case 183:
					this.$ = $$[$0 - 1] + "" + $$[$0];
					break;
				case 185:
					this.$ = $$[$0 - 1] + "" + $$[$0];
					break;
				case 186:
					this.$ = {
						stmt: "dir",
						value: "TB"
					};
					break;
				case 187:
					this.$ = {
						stmt: "dir",
						value: "BT"
					};
					break;
				case 188:
					this.$ = {
						stmt: "dir",
						value: "RL"
					};
					break;
				case 189:
					this.$ = {
						stmt: "dir",
						value: "LR"
					};
					break;
				case 190: this.$ = {
					stmt: "dir",
					value: "TD"
				};
			}
		},
		table: [
			{
				3: 1,
				4: 2,
				9: $V0,
				10: $V1,
				12: $V2
			},
			{ 1: [3] },
			o($V3, $V4, { 5: 6 }),
			{
				4: 7,
				9: $V0,
				10: $V1,
				12: $V2
			},
			{
				4: 8,
				9: $V0,
				10: $V1,
				12: $V2
			},
			{
				13: [1, 9],
				14: [1, 10]
			},
			{
				1: [2, 1],
				6: 11,
				7: 12,
				8: $V5,
				9: $V6,
				10: $V7,
				11: $V8,
				20: 17,
				22: 18,
				23: 19,
				24: 20,
				25: 21,
				26: 22,
				27: 23,
				33: 24,
				34: $V9,
				36: $Va,
				38: $Vb,
				39: $Vc,
				43: 28,
				44: 40,
				45: $Vd,
				46: 41,
				48: 42,
				61: $Ve,
				85: $Vf,
				86: $Vg,
				87: $Vh,
				88: $Vi,
				89: $Vj,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs,
				122: $Vt,
				123: $Vu,
				124: $Vv,
				125: $Vw,
				126: $Vx
			},
			o($V3, [2, 9]),
			o($V3, [2, 10]),
			o($V3, [2, 11]),
			{
				8: [1, 56],
				9: [1, 57],
				10: $Vy,
				15: 55,
				18: 58
			},
			o($Vz, [2, 3]),
			o($Vz, [2, 4]),
			o($Vz, [2, 5]),
			o($Vz, [2, 6]),
			o($Vz, [2, 7]),
			o($Vz, [2, 8]),
			{
				8: $VA,
				9: $VB,
				11: $VC,
				21: 60,
				42: 61,
				73: 65,
				76: [1, 66],
				78: [1, 68],
				79: [1, 67]
			},
			{
				8: $VA,
				9: $VB,
				11: $VC,
				21: 69
			},
			{
				8: $VA,
				9: $VB,
				11: $VC,
				21: 70
			},
			{
				8: $VA,
				9: $VB,
				11: $VC,
				21: 71
			},
			{
				8: $VA,
				9: $VB,
				11: $VC,
				21: 72
			},
			{
				8: $VA,
				9: $VB,
				11: $VC,
				21: 73
			},
			{
				8: $VA,
				9: $VB,
				10: [1, 74],
				11: $VC,
				21: 75
			},
			o($Vz, [2, 36]),
			{ 35: [1, 76] },
			{ 37: [1, 77] },
			o($Vz, [2, 39]),
			o($VD, [2, 51], {
				18: 78,
				40: 79,
				10: $Vy,
				41: $VE
			}),
			{ 10: [1, 81] },
			{ 10: [1, 82] },
			{ 10: [1, 83] },
			{ 10: [1, 84] },
			{
				14: $VF,
				45: $VG,
				61: $VH,
				81: [1, 88],
				90: $VI,
				96: [1, 85],
				98: [1, 86],
				102: 87,
				106: $VJ,
				107: $VK,
				110: $VL,
				112: $VM,
				115: $VN,
				116: $VO,
				117: $VP,
				121: 89
			},
			o([
				8,
				9,
				10,
				11
			], [2, 40]),
			o($Vz, [2, 186]),
			o($Vz, [2, 187]),
			o($Vz, [2, 188]),
			o($Vz, [2, 189]),
			o($Vz, [2, 190]),
			o($VQ, [2, 52]),
			o($VQ, [2, 55], { 47: [1, 101] }),
			o($VR, [2, 73], {
				114: 114,
				29: [1, 102],
				45: $Vd,
				49: [1, 103],
				51: [1, 104],
				53: [1, 105],
				55: [1, 106],
				57: [1, 107],
				59: [1, 108],
				61: $Ve,
				64: [1, 109],
				66: [1, 110],
				68: [1, 111],
				69: [1, 112],
				71: [1, 113],
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				115: $Vq,
				116: $Vr,
				117: $Vs
			}),
			o($VS, [2, 182]),
			o($VS, [2, 143]),
			o($VS, [2, 144]),
			o($VS, [2, 145]),
			o($VS, [2, 146]),
			o($VS, [2, 147]),
			o($VS, [2, 148]),
			o($VS, [2, 149]),
			o($VS, [2, 150]),
			o($VS, [2, 151]),
			o($VS, [2, 152]),
			o($VS, [2, 153]),
			o($V3, [2, 12]),
			o($V3, [2, 18]),
			o($V3, [2, 19]),
			{ 9: [1, 115] },
			o($VT, [2, 26], {
				18: 116,
				10: $Vy
			}),
			o($Vz, [2, 27]),
			{
				43: 117,
				44: 40,
				45: $Vd,
				46: 41,
				48: 42,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs
			},
			o($Vz, [2, 41]),
			o($Vz, [2, 42]),
			o($Vz, [2, 43]),
			o($VU, [2, 77], {
				74: 118,
				63: [1, 120],
				75: [1, 119]
			}),
			{
				77: 121,
				80: 122,
				81: $VV,
				82: $VW,
				117: $VX,
				120: $VY
			},
			{
				76: [1, 127],
				78: [1, 128]
			},
			o($VZ, [2, 84]),
			o($Vz, [2, 28]),
			o($Vz, [2, 29]),
			o($Vz, [2, 30]),
			o($Vz, [2, 31]),
			o($Vz, [2, 32]),
			{
				10: $V_,
				12: $V$,
				14: $V01,
				28: 129,
				32: $V11,
				39: $V21,
				45: $V31,
				61: $V41,
				76: $V51,
				81: [1, 131],
				82: [1, 132],
				84: 142,
				85: $V61,
				86: $V71,
				87: $V81,
				88: $V91,
				89: $Va1,
				90: $Vb1,
				91: $Vc1,
				92: 130,
				106: $Vd1,
				110: $Ve1,
				112: $Vf1,
				115: $Vg1,
				116: $Vh1,
				117: $Vi1
			},
			o($Vj1, $V4, { 5: 155 }),
			o($Vz, [2, 37]),
			o($Vz, [2, 38]),
			o($VD, [2, 49], { 45: $Vk1 }),
			o($VD, [2, 50], {
				18: 157,
				10: $Vy,
				41: $Vl1
			}),
			o($VQ, [2, 45]),
			{
				45: $Vd,
				48: 159,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs
			},
			{
				103: [1, 160],
				104: 161,
				106: [1, 162]
			},
			{
				45: $Vd,
				48: 163,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs
			},
			{
				45: $Vd,
				48: 164,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs
			},
			o($Vm1, [2, 108], {
				10: [1, 165],
				97: [1, 166]
			}),
			{ 81: [1, 167] },
			o($Vm1, [2, 116], {
				121: 169,
				10: [1, 168],
				14: $VF,
				45: $VG,
				61: $VH,
				90: $VI,
				106: $VJ,
				107: $VK,
				110: $VL,
				112: $VM,
				115: $VN,
				116: $VO,
				117: $VP
			}),
			o($Vm1, [2, 118], { 10: [1, 170] }),
			o($Vn1, [2, 184]),
			o($Vn1, [2, 171]),
			o($Vn1, [2, 172]),
			o($Vn1, [2, 173]),
			o($Vn1, [2, 174]),
			o($Vn1, [2, 175]),
			o($Vn1, [2, 176]),
			o($Vn1, [2, 177]),
			o($Vn1, [2, 178]),
			o($Vn1, [2, 179]),
			o($Vn1, [2, 180]),
			o($Vn1, [2, 181]),
			{
				45: $Vd,
				48: 171,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs
			},
			{
				30: 172,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				30: 180,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				30: 182,
				51: [1, 181],
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				30: 183,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				30: 184,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				30: 185,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{ 110: [1, 186] },
			{
				30: 187,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				30: 188,
				66: [1, 189],
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				30: 190,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				30: 191,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				30: 192,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			o($VS, [2, 183]),
			o($V3, [2, 20]),
			o($VT, [2, 25]),
			o($VD, [2, 47], {
				40: 193,
				18: 194,
				10: $Vy,
				41: $VE
			}),
			o($VU, [2, 74], { 10: [1, 195] }),
			{ 10: [1, 196] },
			{
				30: 197,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				78: [1, 198],
				80: 199,
				117: $VX,
				120: $VY
			},
			o($Vu1, [2, 80]),
			o($Vu1, [2, 82]),
			o($Vu1, [2, 83]),
			o($Vu1, [2, 169]),
			o($Vu1, [2, 170]),
			{
				77: 200,
				80: 122,
				81: $VV,
				82: $VW,
				117: $VX,
				120: $VY
			},
			o($VZ, [2, 85]),
			{
				8: $VA,
				9: $VB,
				10: $V_,
				11: $VC,
				12: $V$,
				14: $V01,
				21: 202,
				29: [1, 201],
				32: $V11,
				39: $V21,
				45: $V31,
				61: $V41,
				76: $V51,
				84: 142,
				85: $V61,
				86: $V71,
				87: $V81,
				88: $V91,
				89: $Va1,
				90: $Vb1,
				91: $Vc1,
				92: 203,
				106: $Vd1,
				110: $Ve1,
				112: $Vf1,
				115: $Vg1,
				116: $Vh1,
				117: $Vi1
			},
			o($Vv1, [2, 102]),
			o($Vv1, [2, 104]),
			o($Vv1, [2, 105]),
			o($Vv1, [2, 158]),
			o($Vv1, [2, 159]),
			o($Vv1, [2, 160]),
			o($Vv1, [2, 161]),
			o($Vv1, [2, 162]),
			o($Vv1, [2, 163]),
			o($Vv1, [2, 164]),
			o($Vv1, [2, 165]),
			o($Vv1, [2, 166]),
			o($Vv1, [2, 167]),
			o($Vv1, [2, 168]),
			o($Vv1, [2, 91]),
			o($Vv1, [2, 92]),
			o($Vv1, [2, 93]),
			o($Vv1, [2, 94]),
			o($Vv1, [2, 95]),
			o($Vv1, [2, 96]),
			o($Vv1, [2, 97]),
			o($Vv1, [2, 98]),
			o($Vv1, [2, 99]),
			o($Vv1, [2, 100]),
			o($Vv1, [2, 101]),
			{
				6: 11,
				7: 12,
				8: $V5,
				9: $V6,
				10: $V7,
				11: $V8,
				20: 17,
				22: 18,
				23: 19,
				24: 20,
				25: 21,
				26: 22,
				27: 23,
				32: [1, 204],
				33: 24,
				34: $V9,
				36: $Va,
				38: $Vb,
				39: $Vc,
				43: 28,
				44: 40,
				45: $Vd,
				46: 41,
				48: 42,
				61: $Ve,
				85: $Vf,
				86: $Vg,
				87: $Vh,
				88: $Vi,
				89: $Vj,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs,
				122: $Vt,
				123: $Vu,
				124: $Vv,
				125: $Vw,
				126: $Vx
			},
			{
				10: $Vy,
				18: 205
			},
			{ 45: [1, 206] },
			o($VQ, [2, 44]),
			{
				10: [1, 207],
				45: $Vd,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 114,
				115: $Vq,
				116: $Vr,
				117: $Vs
			},
			{ 10: [1, 208] },
			{
				10: [1, 209],
				107: [1, 210]
			},
			o($Vw1, [2, 129]),
			{
				10: [1, 211],
				45: $Vd,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 114,
				115: $Vq,
				116: $Vr,
				117: $Vs
			},
			{
				10: [1, 212],
				45: $Vd,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 114,
				115: $Vq,
				116: $Vr,
				117: $Vs
			},
			{ 81: [1, 213] },
			o($Vm1, [2, 110], { 10: [1, 214] }),
			o($Vm1, [2, 112], { 10: [1, 215] }),
			{ 81: [1, 216] },
			o($Vn1, [2, 185]),
			{
				81: [1, 217],
				99: [1, 218]
			},
			o($VQ, [2, 56], {
				114: 114,
				45: $Vd,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				115: $Vq,
				116: $Vr,
				117: $Vs
			}),
			{
				31: [1, 219],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			o($Vx1, [2, 87]),
			o($Vx1, [2, 89]),
			o($Vx1, [2, 90]),
			o($Vx1, [2, 154]),
			o($Vx1, [2, 155]),
			o($Vx1, [2, 156]),
			o($Vx1, [2, 157]),
			{
				50: [1, 221],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				30: 222,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				52: [1, 223],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				54: [1, 224],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				56: [1, 225],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				58: [1, 226],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{ 61: [1, 227] },
			{
				65: [1, 228],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				67: [1, 229],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				30: 230,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				31: [1, 231],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				68: $Vo1,
				70: [1, 232],
				72: [1, 233],
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				68: $Vo1,
				70: [1, 235],
				72: [1, 234],
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			o($VD, [2, 46], {
				18: 157,
				10: $Vy,
				41: $Vl1
			}),
			o($VD, [2, 48], { 45: $Vk1 }),
			o($VU, [2, 76]),
			o($VU, [2, 75]),
			{
				63: [1, 236],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			o($VU, [2, 78]),
			o($Vu1, [2, 81]),
			{
				78: [1, 237],
				80: 199,
				117: $VX,
				120: $VY
			},
			{
				30: 238,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			o($Vj1, $V4, { 5: 239 }),
			o($Vv1, [2, 103]),
			o($Vz, [2, 35]),
			{
				44: 240,
				45: $Vd,
				46: 41,
				48: 42,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs
			},
			{
				10: $Vy,
				18: 241
			},
			{
				10: $Vy1,
				61: $Vz1,
				85: $VA1,
				93: 242,
				106: $VB1,
				108: 243,
				109: 244,
				110: $VC1,
				111: $VD1,
				112: $VE1,
				113: $VF1
			},
			{
				10: $Vy1,
				61: $Vz1,
				85: $VA1,
				93: 253,
				105: [1, 254],
				106: $VB1,
				108: 243,
				109: 244,
				110: $VC1,
				111: $VD1,
				112: $VE1,
				113: $VF1
			},
			{
				10: $Vy1,
				61: $Vz1,
				85: $VA1,
				93: 255,
				105: [1, 256],
				106: $VB1,
				108: 243,
				109: 244,
				110: $VC1,
				111: $VD1,
				112: $VE1,
				113: $VF1
			},
			{ 106: [1, 257] },
			{
				10: $Vy1,
				61: $Vz1,
				85: $VA1,
				93: 258,
				106: $VB1,
				108: 243,
				109: 244,
				110: $VC1,
				111: $VD1,
				112: $VE1,
				113: $VF1
			},
			{
				45: $Vd,
				48: 259,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs
			},
			o($Vm1, [2, 109]),
			{ 81: [1, 260] },
			{
				81: [1, 261],
				99: [1, 262]
			},
			o($Vm1, [2, 117]),
			o($Vm1, [2, 119], { 10: [1, 263] }),
			o($Vm1, [2, 120]),
			o($VR, [2, 57]),
			o($Vx1, [2, 88]),
			o($VR, [2, 58]),
			{
				52: [1, 264],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			o($VR, [2, 65]),
			o($VR, [2, 60]),
			o($VR, [2, 61]),
			o($VR, [2, 62]),
			{ 110: [1, 265] },
			o($VR, [2, 64]),
			o($VR, [2, 66]),
			{
				67: [1, 266],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			o($VR, [2, 68]),
			o($VR, [2, 69]),
			o($VR, [2, 71]),
			o($VR, [2, 70]),
			o($VR, [2, 72]),
			o([
				10,
				45,
				61,
				90,
				103,
				106,
				107,
				110,
				112,
				115,
				116,
				117
			], [2, 86]),
			o($VU, [2, 79]),
			{
				31: [1, 267],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				6: 11,
				7: 12,
				8: $V5,
				9: $V6,
				10: $V7,
				11: $V8,
				20: 17,
				22: 18,
				23: 19,
				24: 20,
				25: 21,
				26: 22,
				27: 23,
				32: [1, 268],
				33: 24,
				34: $V9,
				36: $Va,
				38: $Vb,
				39: $Vc,
				43: 28,
				44: 40,
				45: $Vd,
				46: 41,
				48: 42,
				61: $Ve,
				85: $Vf,
				86: $Vg,
				87: $Vh,
				88: $Vi,
				89: $Vj,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs,
				122: $Vt,
				123: $Vu,
				124: $Vv,
				125: $Vw,
				126: $Vx
			},
			o($VQ, [2, 54]),
			{
				44: 269,
				45: $Vd,
				46: 41,
				48: 42,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs
			},
			o($Vm1, [2, 122], { 107: $VG1 }),
			o($VH1, [2, 131], {
				109: 271,
				10: $Vy1,
				61: $Vz1,
				85: $VA1,
				106: $VB1,
				110: $VC1,
				111: $VD1,
				112: $VE1,
				113: $VF1
			}),
			o($VI1, [2, 133]),
			o($VI1, [2, 135]),
			o($VI1, [2, 136]),
			o($VI1, [2, 137]),
			o($VI1, [2, 138]),
			o($VI1, [2, 139]),
			o($VI1, [2, 140]),
			o($VI1, [2, 141]),
			o($VI1, [2, 142]),
			o($Vm1, [2, 123], { 107: $VG1 }),
			{ 10: [1, 272] },
			o($Vm1, [2, 124], { 107: $VG1 }),
			{ 10: [1, 273] },
			o($Vw1, [2, 130]),
			o($Vm1, [2, 106], { 107: $VG1 }),
			o($Vm1, [2, 107], {
				114: 114,
				45: $Vd,
				61: $Ve,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				115: $Vq,
				116: $Vr,
				117: $Vs
			}),
			o($Vm1, [2, 111]),
			o($Vm1, [2, 113], { 10: [1, 274] }),
			o($Vm1, [2, 114]),
			{ 99: [1, 275] },
			{ 52: [1, 276] },
			{ 63: [1, 277] },
			{ 67: [1, 278] },
			{
				8: $VA,
				9: $VB,
				11: $VC,
				21: 279
			},
			o($Vz, [2, 34]),
			o($VQ, [2, 53]),
			{
				10: $Vy1,
				61: $Vz1,
				85: $VA1,
				106: $VB1,
				108: 280,
				109: 244,
				110: $VC1,
				111: $VD1,
				112: $VE1,
				113: $VF1
			},
			o($VI1, [2, 134]),
			{
				14: $VF,
				45: $VG,
				61: $VH,
				90: $VI,
				102: 281,
				106: $VJ,
				107: $VK,
				110: $VL,
				112: $VM,
				115: $VN,
				116: $VO,
				117: $VP,
				121: 89
			},
			{
				14: $VF,
				45: $VG,
				61: $VH,
				90: $VI,
				102: 282,
				106: $VJ,
				107: $VK,
				110: $VL,
				112: $VM,
				115: $VN,
				116: $VO,
				117: $VP,
				121: 89
			},
			{ 99: [1, 283] },
			o($Vm1, [2, 121]),
			o($VR, [2, 59]),
			{
				30: 284,
				68: $Vo1,
				81: $Vp1,
				82: $Vq1,
				83: 173,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			o($VR, [2, 67]),
			o($Vj1, $V4, { 5: 285 }),
			o($VH1, [2, 132], {
				109: 271,
				10: $Vy1,
				61: $Vz1,
				85: $VA1,
				106: $VB1,
				110: $VC1,
				111: $VD1,
				112: $VE1,
				113: $VF1
			}),
			o($Vm1, [2, 127], {
				121: 169,
				10: [1, 286],
				14: $VF,
				45: $VG,
				61: $VH,
				90: $VI,
				106: $VJ,
				107: $VK,
				110: $VL,
				112: $VM,
				115: $VN,
				116: $VO,
				117: $VP
			}),
			o($Vm1, [2, 128], {
				121: 169,
				10: [1, 287],
				14: $VF,
				45: $VG,
				61: $VH,
				90: $VI,
				106: $VJ,
				107: $VK,
				110: $VL,
				112: $VM,
				115: $VN,
				116: $VO,
				117: $VP
			}),
			o($Vm1, [2, 115]),
			{
				31: [1, 288],
				68: $Vo1,
				83: 220,
				117: $Vr1,
				118: $Vs1,
				119: $Vt1
			},
			{
				6: 11,
				7: 12,
				8: $V5,
				9: $V6,
				10: $V7,
				11: $V8,
				20: 17,
				22: 18,
				23: 19,
				24: 20,
				25: 21,
				26: 22,
				27: 23,
				32: [1, 289],
				33: 24,
				34: $V9,
				36: $Va,
				38: $Vb,
				39: $Vc,
				43: 28,
				44: 40,
				45: $Vd,
				46: 41,
				48: 42,
				61: $Ve,
				85: $Vf,
				86: $Vg,
				87: $Vh,
				88: $Vi,
				89: $Vj,
				90: $Vk,
				103: $Vl,
				106: $Vm,
				107: $Vn,
				110: $Vo,
				112: $Vp,
				114: 43,
				115: $Vq,
				116: $Vr,
				117: $Vs,
				122: $Vt,
				123: $Vu,
				124: $Vv,
				125: $Vw,
				126: $Vx
			},
			{
				10: $Vy1,
				61: $Vz1,
				85: $VA1,
				93: 290,
				106: $VB1,
				108: 243,
				109: 244,
				110: $VC1,
				111: $VD1,
				112: $VE1,
				113: $VF1
			},
			{
				10: $Vy1,
				61: $Vz1,
				85: $VA1,
				93: 291,
				106: $VB1,
				108: 243,
				109: 244,
				110: $VC1,
				111: $VD1,
				112: $VE1,
				113: $VF1
			},
			o($VR, [2, 63]),
			o($Vz, [2, 33]),
			o($Vm1, [2, 125], { 107: $VG1 }),
			o($Vm1, [2, 126], { 107: $VG1 })
		],
		defaultActions: {},
		parseError: function parseError(str, hash) {
			if (hash.recoverable) this.trace(str);
			else {
				var error = new Error(str);
				error.hash = hash;
				throw error;
			}
		},
		parse: function parse(input) {
			var self = this, stack = [0], vstack = [null], lstack = [], table = this.table, yytext = "", yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
			var args = lstack.slice.call(arguments, 1);
			var lexer = Object.create(this.lexer);
			var sharedState = { yy: {} };
			for (var k in this.yy) if (Object.prototype.hasOwnProperty.call(this.yy, k)) sharedState.yy[k] = this.yy[k];
			lexer.setInput(input, sharedState.yy);
			sharedState.yy.lexer = lexer;
			sharedState.yy.parser = this;
			if (typeof lexer.yylloc == "undefined") lexer.yylloc = {};
			var yyloc = lexer.yylloc;
			lstack.push(yyloc);
			var ranges = lexer.options && lexer.options.ranges;
			if (typeof sharedState.yy.parseError === "function") this.parseError = sharedState.yy.parseError;
			else this.parseError = Object.getPrototypeOf(this).parseError;
			_token_stack: var lex = function() {
				var token = lexer.lex() || EOF;
				if (typeof token !== "number") token = self.symbols_[token] || token;
				return token;
			};
			var symbol, preErrorSymbol, state, action, r, yyval = {}, p, len, newState, expected;
			while (true) {
				state = stack[stack.length - 1];
				if (this.defaultActions[state]) action = this.defaultActions[state];
				else {
					if (symbol === null || typeof symbol == "undefined") symbol = lex();
					action = table[state] && table[state][symbol];
				}
				if (typeof action === "undefined" || !action.length || !action[0]) {
					var errStr = "";
					expected = [];
					for (p in table[state]) if (this.terminals_[p] && p > TERROR) expected.push("'" + this.terminals_[p] + "'");
					if (lexer.showPosition) errStr = "Parse error on line " + (yylineno + 1) + ":\n" + lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + (this.terminals_[symbol] || symbol) + "'";
					else errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == EOF ? "end of input" : "'" + (this.terminals_[symbol] || symbol) + "'");
					this.parseError(errStr, {
						text: lexer.match,
						token: this.terminals_[symbol] || symbol,
						line: lexer.yylineno,
						loc: yyloc,
						expected
					});
				}
				if (action[0] instanceof Array && action.length > 1) throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
				switch (action[0]) {
					case 1:
						stack.push(symbol);
						vstack.push(lexer.yytext);
						lstack.push(lexer.yylloc);
						stack.push(action[1]);
						symbol = null;
						if (!preErrorSymbol) {
							yyleng = lexer.yyleng;
							yytext = lexer.yytext;
							yylineno = lexer.yylineno;
							yyloc = lexer.yylloc;
							if (recovering > 0) recovering--;
						} else {
							symbol = preErrorSymbol;
							preErrorSymbol = null;
						}
						break;
					case 2:
						len = this.productions_[action[1]][1];
						yyval.$ = vstack[vstack.length - len];
						yyval._$ = {
							first_line: lstack[lstack.length - (len || 1)].first_line,
							last_line: lstack[lstack.length - 1].last_line,
							first_column: lstack[lstack.length - (len || 1)].first_column,
							last_column: lstack[lstack.length - 1].last_column
						};
						if (ranges) yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]];
						r = this.performAction.apply(yyval, [
							yytext,
							yyleng,
							yylineno,
							sharedState.yy,
							action[1],
							vstack,
							lstack
						].concat(args));
						if (typeof r !== "undefined") return r;
						if (len) {
							stack = stack.slice(0, -1 * len * 2);
							vstack = vstack.slice(0, -1 * len);
							lstack = lstack.slice(0, -1 * len);
						}
						stack.push(this.productions_[action[1]][0]);
						vstack.push(yyval.$);
						lstack.push(yyval._$);
						newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
						stack.push(newState);
						break;
					case 3: return true;
				}
			}
			return true;
		}
	};
	parser.lexer = (function() {
		return {
			EOF: 1,
			parseError: function parseError(str, hash) {
				if (this.yy.parser) this.yy.parser.parseError(str, hash);
				else throw new Error(str);
			},
			setInput: function(input, yy) {
				this.yy = yy || this.yy || {};
				this._input = input;
				this._more = this._backtrack = this.done = false;
				this.yylineno = this.yyleng = 0;
				this.yytext = this.matched = this.match = "";
				this.conditionStack = ["INITIAL"];
				this.yylloc = {
					first_line: 1,
					first_column: 0,
					last_line: 1,
					last_column: 0
				};
				if (this.options.ranges) this.yylloc.range = [0, 0];
				this.offset = 0;
				return this;
			},
			input: function() {
				var ch = this._input[0];
				this.yytext += ch;
				this.yyleng++;
				this.offset++;
				this.match += ch;
				this.matched += ch;
				if (ch.match(/(?:\r\n?|\n).*/g)) {
					this.yylineno++;
					this.yylloc.last_line++;
				} else this.yylloc.last_column++;
				if (this.options.ranges) this.yylloc.range[1]++;
				this._input = this._input.slice(1);
				return ch;
			},
			unput: function(ch) {
				var len = ch.length;
				var lines = ch.split(/(?:\r\n?|\n)/g);
				this._input = ch + this._input;
				this.yytext = this.yytext.substr(0, this.yytext.length - len);
				this.offset -= len;
				var oldLines = this.match.split(/(?:\r\n?|\n)/g);
				this.match = this.match.substr(0, this.match.length - 1);
				this.matched = this.matched.substr(0, this.matched.length - 1);
				if (lines.length - 1) this.yylineno -= lines.length - 1;
				var r = this.yylloc.range;
				this.yylloc = {
					first_line: this.yylloc.first_line,
					last_line: this.yylineno + 1,
					first_column: this.yylloc.first_column,
					last_column: lines ? (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length : this.yylloc.first_column - len
				};
				if (this.options.ranges) this.yylloc.range = [r[0], r[0] + this.yyleng - len];
				this.yyleng = this.yytext.length;
				return this;
			},
			more: function() {
				this._more = true;
				return this;
			},
			reject: function() {
				if (this.options.backtrack_lexer) this._backtrack = true;
				else return this.parseError("Lexical error on line " + (this.yylineno + 1) + ". You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n" + this.showPosition(), {
					text: "",
					token: null,
					line: this.yylineno
				});
				return this;
			},
			less: function(n) {
				this.unput(this.match.slice(n));
			},
			pastInput: function() {
				var past = this.matched.substr(0, this.matched.length - this.match.length);
				return (past.length > 20 ? "..." : "") + past.substr(-20).replace(/\n/g, "");
			},
			upcomingInput: function() {
				var next = this.match;
				if (next.length < 20) next += this._input.substr(0, 20 - next.length);
				return (next.substr(0, 20) + (next.length > 20 ? "..." : "")).replace(/\n/g, "");
			},
			showPosition: function() {
				var pre = this.pastInput();
				var c = new Array(pre.length + 1).join("-");
				return pre + this.upcomingInput() + "\n" + c + "^";
			},
			test_match: function(match, indexed_rule) {
				var token, lines, backup;
				if (this.options.backtrack_lexer) {
					backup = {
						yylineno: this.yylineno,
						yylloc: {
							first_line: this.yylloc.first_line,
							last_line: this.last_line,
							first_column: this.yylloc.first_column,
							last_column: this.yylloc.last_column
						},
						yytext: this.yytext,
						match: this.match,
						matches: this.matches,
						matched: this.matched,
						yyleng: this.yyleng,
						offset: this.offset,
						_more: this._more,
						_input: this._input,
						yy: this.yy,
						conditionStack: this.conditionStack.slice(0),
						done: this.done
					};
					if (this.options.ranges) backup.yylloc.range = this.yylloc.range.slice(0);
				}
				lines = match[0].match(/(?:\r\n?|\n).*/g);
				if (lines) this.yylineno += lines.length;
				this.yylloc = {
					first_line: this.yylloc.last_line,
					last_line: this.yylineno + 1,
					first_column: this.yylloc.last_column,
					last_column: lines ? lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length
				};
				this.yytext += match[0];
				this.match += match[0];
				this.matches = match;
				this.yyleng = this.yytext.length;
				if (this.options.ranges) this.yylloc.range = [this.offset, this.offset += this.yyleng];
				this._more = false;
				this._backtrack = false;
				this._input = this._input.slice(match[0].length);
				this.matched += match[0];
				token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
				if (this.done && this._input) this.done = false;
				if (token) return token;
				else if (this._backtrack) {
					for (var k in backup) this[k] = backup[k];
					return false;
				}
				return false;
			},
			next: function() {
				if (this.done) return this.EOF;
				if (!this._input) this.done = true;
				var token, match, tempMatch, index;
				if (!this._more) {
					this.yytext = "";
					this.match = "";
				}
				var rules = this._currentRules();
				for (var i = 0; i < rules.length; i++) {
					tempMatch = this._input.match(this.rules[rules[i]]);
					if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
						match = tempMatch;
						index = i;
						if (this.options.backtrack_lexer) {
							token = this.test_match(tempMatch, rules[i]);
							if (token !== false) return token;
							else if (this._backtrack) {
								match = false;
								continue;
							} else return false;
						} else if (!this.options.flex) break;
					}
				}
				if (match) {
					token = this.test_match(match, rules[index]);
					if (token !== false) return token;
					return false;
				}
				if (this._input === "") return this.EOF;
				else return this.parseError("Lexical error on line " + (this.yylineno + 1) + ". Unrecognized text.\n" + this.showPosition(), {
					text: "",
					token: null,
					line: this.yylineno
				});
			},
			lex: function lex() {
				var r = this.next();
				if (r) return r;
				else return this.lex();
			},
			begin: function begin(condition) {
				this.conditionStack.push(condition);
			},
			popState: function popState() {
				if (this.conditionStack.length - 1 > 0) return this.conditionStack.pop();
				else return this.conditionStack[0];
			},
			_currentRules: function _currentRules() {
				if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
				else return this.conditions["INITIAL"].rules;
			},
			topState: function topState(n) {
				n = this.conditionStack.length - 1 - Math.abs(n || 0);
				if (n >= 0) return this.conditionStack[n];
				else return "INITIAL";
			},
			pushState: function pushState(condition) {
				this.begin(condition);
			},
			stateStackSize: function stateStackSize() {
				return this.conditionStack.length;
			},
			options: {},
			performAction: function anonymous(yy, yy_, $avoiding_name_collisions, YY_START) {
				switch ($avoiding_name_collisions) {
					case 0:
						this.begin("acc_title");
						return 34;
					case 1:
						this.popState();
						return "acc_title_value";
					case 2:
						this.begin("acc_descr");
						return 36;
					case 3:
						this.popState();
						return "acc_descr_value";
					case 4:
						this.begin("acc_descr_multiline");
						break;
					case 5:
						this.popState();
						break;
					case 6: return "acc_descr_multiline_value";
					case 7:
						this.pushState("shapeData");
						yy_.yytext = "";
						return 41;
					case 8:
						this.pushState("shapeDataStr");
						return 41;
					case 9:
						this.popState();
						return 41;
					case 10:
						yy_.yytext = yy_.yytext.replace(/\n\s*/g, "<br/>");
						return 41;
					case 11: return 41;
					case 12:
						this.popState();
						break;
					case 13:
						this.begin("callbackname");
						break;
					case 14:
						this.popState();
						break;
					case 15:
						this.popState();
						this.begin("callbackargs");
						break;
					case 16: return 96;
					case 17:
						this.popState();
						break;
					case 18: return 97;
					case 19: return "MD_STR";
					case 20:
						this.popState();
						break;
					case 21:
						this.begin("md_string");
						break;
					case 22: return "STR";
					case 23:
						this.popState();
						break;
					case 24:
						this.pushState("string");
						break;
					case 25: return 85;
					case 26: return 103;
					case 27: return 86;
					case 28: return 105;
					case 29: return 87;
					case 30: return 88;
					case 31: return 98;
					case 32:
						this.begin("click");
						break;
					case 33:
						this.popState();
						break;
					case 34: return 89;
					case 35:
						if (yy.lex.firstGraph()) this.begin("dir");
						return 12;
					case 36:
						if (yy.lex.firstGraph()) this.begin("dir");
						return 12;
					case 37:
						if (yy.lex.firstGraph()) this.begin("dir");
						return 12;
					case 38:
						if (yy.lex.firstGraph()) this.begin("dir");
						return 12;
					case 39: return 39;
					case 40: return 32;
					case 41: return 99;
					case 42: return 99;
					case 43: return 99;
					case 44: return 99;
					case 45:
						this.popState();
						return 13;
					case 46:
						this.popState();
						return 14;
					case 47:
						this.popState();
						return 14;
					case 48:
						this.popState();
						return 14;
					case 49:
						this.popState();
						return 14;
					case 50:
						this.popState();
						return 14;
					case 51:
						this.popState();
						return 14;
					case 52:
						this.popState();
						return 14;
					case 53:
						this.popState();
						return 14;
					case 54:
						this.popState();
						return 14;
					case 55:
						this.popState();
						return 14;
					case 56: return 122;
					case 57: return 123;
					case 58: return 124;
					case 59: return 125;
					case 60: return 126;
					case 61: return 79;
					case 62: return 106;
					case 63: return 112;
					case 64: return 47;
					case 65: return 61;
					case 66: return 45;
					case 67: return 8;
					case 68: return 107;
					case 69: return 116;
					case 70:
						this.popState();
						return 78;
					case 71:
						this.pushState("edgeText");
						return 76;
					case 72: return 120;
					case 73:
						this.popState();
						return 78;
					case 74:
						this.pushState("thickEdgeText");
						return 76;
					case 75: return 120;
					case 76:
						this.popState();
						return 78;
					case 77:
						this.pushState("dottedEdgeText");
						return 76;
					case 78: return 120;
					case 79: return 78;
					case 80:
						this.popState();
						return 54;
					case 81: return "TEXT";
					case 82:
						this.pushState("ellipseText");
						return 53;
					case 83:
						this.popState();
						return 56;
					case 84:
						this.pushState("text");
						return 55;
					case 85:
						this.popState();
						return 58;
					case 86:
						this.pushState("text");
						return 57;
					case 87: return 59;
					case 88:
						this.pushState("text");
						return 68;
					case 89:
						this.popState();
						return 65;
					case 90:
						this.pushState("text");
						return 64;
					case 91:
						this.popState();
						return 50;
					case 92:
						this.pushState("text");
						return 49;
					case 93:
						this.popState();
						return 70;
					case 94:
						this.popState();
						return 72;
					case 95: return 118;
					case 96:
						this.pushState("trapText");
						return 69;
					case 97:
						this.pushState("trapText");
						return 71;
					case 98: return 119;
					case 99: return 68;
					case 100: return 91;
					case 101: return "SEP";
					case 102: return 90;
					case 103: return 116;
					case 104: return 112;
					case 105: return 45;
					case 106: return 110;
					case 107: return 115;
					case 108: return 117;
					case 109:
						this.popState();
						return 63;
					case 110:
						this.pushState("text");
						return 63;
					case 111:
						this.popState();
						return 52;
					case 112:
						this.pushState("text");
						return 51;
					case 113:
						this.popState();
						return 31;
					case 114:
						this.pushState("text");
						return 29;
					case 115:
						this.popState();
						return 67;
					case 116:
						this.pushState("text");
						return 66;
					case 117: return "TEXT";
					case 118: return "QUOTE";
					case 119: return 9;
					case 120: return 10;
					case 121: return 11;
				}
			},
			rules: [
				/^(?:accTitle\s*:\s*)/,
				/^(?:(?!\n||)*[^\n]*)/,
				/^(?:accDescr\s*:\s*)/,
				/^(?:(?!\n||)*[^\n]*)/,
				/^(?:accDescr\s*\{\s*)/,
				/^(?:[\}])/,
				/^(?:[^\}]*)/,
				/^(?:@\{)/,
				/^(?:["])/,
				/^(?:["])/,
				/^(?:[^\"]+)/,
				/^(?:[^}^"]+)/,
				/^(?:\})/,
				/^(?:call[\s]+)/,
				/^(?:\([\s]*\))/,
				/^(?:\()/,
				/^(?:[^(]*)/,
				/^(?:\))/,
				/^(?:[^)]*)/,
				/^(?:[^`"]+)/,
				/^(?:[`]["])/,
				/^(?:["][`])/,
				/^(?:[^"]+)/,
				/^(?:["])/,
				/^(?:["])/,
				/^(?:style\b)/,
				/^(?:default\b)/,
				/^(?:linkStyle\b)/,
				/^(?:interpolate\b)/,
				/^(?:classDef\b)/,
				/^(?:class\b)/,
				/^(?:href[\s])/,
				/^(?:click[\s]+)/,
				/^(?:[\s\n])/,
				/^(?:[^\s\n]*)/,
				/^(?:flowchart-elk\b)/,
				/^(?:swimlane\b)/,
				/^(?:graph\b)/,
				/^(?:flowchart\b)/,
				/^(?:subgraph\b)/,
				/^(?:end\b\s*)/,
				/^(?:_self\b)/,
				/^(?:_blank\b)/,
				/^(?:_parent\b)/,
				/^(?:_top\b)/,
				/^(?:(\r?\n)*\s*\n)/,
				/^(?:\s*LR\b)/,
				/^(?:\s*RL\b)/,
				/^(?:\s*TB\b)/,
				/^(?:\s*BT\b)/,
				/^(?:\s*TD\b)/,
				/^(?:\s*BR\b)/,
				/^(?:\s*<)/,
				/^(?:\s*>)/,
				/^(?:\s*\^)/,
				/^(?:\s*v\b)/,
				/^(?:.*direction\s+TB[^\n]*)/,
				/^(?:.*direction\s+BT[^\n]*)/,
				/^(?:.*direction\s+RL[^\n]*)/,
				/^(?:.*direction\s+LR[^\n]*)/,
				/^(?:.*direction\s+TD[^\n]*)/,
				/^(?:[^\s\"]+@(?=[^\{\"]))/,
				/^(?:[0-9]+)/,
				/^(?:#)/,
				/^(?::::)/,
				/^(?::)/,
				/^(?:&)/,
				/^(?:;)/,
				/^(?:,)/,
				/^(?:\*)/,
				/^(?:\s*[xo<]?--+[-xo>]\s*)/,
				/^(?:\s*[xo<]?--\s*)/,
				/^(?:[^-]|-(?!-)+)/,
				/^(?:\s*[xo<]?==+[=xo>]\s*)/,
				/^(?:\s*[xo<]?==\s*)/,
				/^(?:[^=]|=(?!))/,
				/^(?:\s*[xo<]?-?\.+-[xo>]?\s*)/,
				/^(?:\s*[xo<]?-\.\s*)/,
				/^(?:[^\.]|\.(?!))/,
				/^(?:\s*~~[\~]+\s*)/,
				/^(?:[-/\)][\)])/,
				/^(?:[^\(\)\[\]\{\}]|!\)+)/,
				/^(?:\(-)/,
				/^(?:\]\))/,
				/^(?:\(\[)/,
				/^(?:\]\])/,
				/^(?:\[\[)/,
				/^(?:\[\|)/,
				/^(?:>)/,
				/^(?:\)\])/,
				/^(?:\[\()/,
				/^(?:\)\)\))/,
				/^(?:\(\(\()/,
				/^(?:[\\(?=\])][\]])/,
				/^(?:\/(?=\])\])/,
				/^(?:\/(?!\])|\\(?!\])|[^\\\[\]\(\)\{\}\/]+)/,
				/^(?:\[\/)/,
				/^(?:\[\\)/,
				/^(?:<)/,
				/^(?:>)/,
				/^(?:\^)/,
				/^(?:\\\|)/,
				/^(?:v\b)/,
				/^(?:\*)/,
				/^(?:#)/,
				/^(?:&)/,
				/^(?:([A-Za-z0-9!"\#$%&'*+\.`?\\_\/]|-(?=[^\>\-\.])|(?!))+)/,
				/^(?:-)/,
				/^(?:[\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6]|[\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377]|[\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5]|[\u03F7-\u0481\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA]|[\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE]|[\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA]|[\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0]|[\u08A2-\u08AC\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0977]|[\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2]|[\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A]|[\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39]|[\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8]|[\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C]|[\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C]|[\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99]|[\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0]|[\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D]|[\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3]|[\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10]|[\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1]|[\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81]|[\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3]|[\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6]|[\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A]|[\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081]|[\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D]|[\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0]|[\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310]|[\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C]|[\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u1700-\u170C\u170E-\u1711]|[\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7]|[\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C]|[\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16]|[\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF]|[\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC]|[\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D]|[\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D]|[\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3]|[\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F]|[\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128]|[\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184]|[\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3]|[\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6]|[\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE]|[\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C]|[\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D]|[\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC]|[\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B]|[\uA640-\uA66E\uA67F-\uA697\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788]|[\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA801\uA803-\uA805]|[\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB]|[\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uAA00-\uAA28]|[\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5]|[\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4]|[\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E]|[\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D]|[\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36]|[\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D]|[\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC]|[\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF]|[\uFFD2-\uFFD7\uFFDA-\uFFDC])/,
				/^(?:\|)/,
				/^(?:\|)/,
				/^(?:\))/,
				/^(?:\()/,
				/^(?:\])/,
				/^(?:\[)/,
				/^(?:(\}))/,
				/^(?:\{)/,
				/^(?:[^\[\]\(\)\{\}\|\"]+)/,
				/^(?:")/,
				/^(?:(\r?\n)+)/,
				/^(?:\s)/,
				/^(?:$)/
			],
			conditions: {
				"shapeDataEndBracket": {
					"rules": [
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"shapeDataStr": {
					"rules": [
						9,
						10,
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"shapeData": {
					"rules": [
						8,
						11,
						12,
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"callbackargs": {
					"rules": [
						17,
						18,
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"callbackname": {
					"rules": [
						14,
						15,
						16,
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"href": {
					"rules": [
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"click": {
					"rules": [
						21,
						24,
						33,
						34,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"dottedEdgeText": {
					"rules": [
						21,
						24,
						76,
						78,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"thickEdgeText": {
					"rules": [
						21,
						24,
						73,
						75,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"edgeText": {
					"rules": [
						21,
						24,
						70,
						72,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"trapText": {
					"rules": [
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						93,
						94,
						95,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"ellipseText": {
					"rules": [
						21,
						24,
						79,
						80,
						81,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"text": {
					"rules": [
						21,
						24,
						79,
						82,
						83,
						84,
						85,
						86,
						89,
						90,
						91,
						92,
						96,
						97,
						109,
						110,
						111,
						112,
						113,
						114,
						115,
						116,
						117
					],
					"inclusive": false
				},
				"vertex": {
					"rules": [
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"dir": {
					"rules": [
						21,
						24,
						45,
						46,
						47,
						48,
						49,
						50,
						51,
						52,
						53,
						54,
						55,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"acc_descr_multiline": {
					"rules": [
						5,
						6,
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"acc_descr": {
					"rules": [
						3,
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"acc_title": {
					"rules": [
						1,
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"md_string": {
					"rules": [
						19,
						20,
						21,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"string": {
					"rules": [
						21,
						22,
						23,
						24,
						79,
						82,
						84,
						86,
						90,
						92,
						96,
						97,
						110,
						112,
						114,
						116
					],
					"inclusive": false
				},
				"INITIAL": {
					"rules": [
						0,
						2,
						4,
						7,
						13,
						21,
						24,
						25,
						26,
						27,
						28,
						29,
						30,
						31,
						32,
						35,
						36,
						37,
						38,
						39,
						40,
						41,
						42,
						43,
						44,
						56,
						57,
						58,
						59,
						60,
						61,
						62,
						63,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						73,
						74,
						76,
						77,
						79,
						82,
						84,
						86,
						87,
						88,
						90,
						92,
						96,
						97,
						98,
						99,
						100,
						101,
						102,
						103,
						104,
						105,
						106,
						107,
						108,
						110,
						112,
						114,
						116,
						118,
						119,
						120,
						121
					],
					"inclusive": true
				}
			}
		};
	})();
	function Parser() {
		this.yy = {};
	}
	Parser.prototype = parser;
	parser.Parser = Parser;
	return new Parser();
})();
const parser$3 = flow;
flow.Parser;
//#endregion
//#region src/serializer/parser/jison/sequence-parser.js
var sequence = (function() {
	var o = function(k, v, o, l) {
		for (o = o || {}, l = k.length; l--; o[k[l]] = v);
		return o;
	}, $V0 = [1, 2], $V1 = [1, 3], $V2 = [1, 4], $V3 = [2, 4], $V4 = [1, 9], $V5 = [1, 11], $V6 = [1, 12], $V7 = [1, 14], $V8 = [1, 15], $V9 = [1, 17], $Va = [1, 18], $Vb = [1, 19], $Vc = [1, 25], $Vd = [1, 26], $Ve = [1, 27], $Vf = [1, 28], $Vg = [1, 29], $Vh = [1, 30], $Vi = [1, 31], $Vj = [1, 32], $Vk = [1, 33], $Vl = [1, 34], $Vm = [1, 35], $Vn = [1, 36], $Vo = [1, 37], $Vp = [1, 38], $Vq = [1, 39], $Vr = [1, 40], $Vs = [1, 42], $Vt = [1, 43], $Vu = [1, 44], $Vv = [1, 45], $Vw = [1, 46], $Vx = [1, 47], $Vy = [
		1,
		4,
		5,
		10,
		14,
		15,
		17,
		19,
		22,
		24,
		30,
		31,
		32,
		34,
		36,
		37,
		38,
		39,
		40,
		42,
		44,
		45,
		47,
		48,
		49,
		50,
		51,
		53,
		54,
		56,
		61,
		62,
		63,
		64,
		73
	], $Vz = [1, 74], $VA = [1, 80], $VB = [1, 81], $VC = [1, 82], $VD = [1, 83], $VE = [1, 84], $VF = [1, 85], $VG = [1, 86], $VH = [1, 87], $VI = [1, 88], $VJ = [1, 89], $VK = [1, 90], $VL = [1, 91], $VM = [1, 92], $VN = [1, 93], $VO = [1, 94], $VP = [1, 95], $VQ = [1, 96], $VR = [1, 97], $VS = [1, 98], $VT = [1, 99], $VU = [1, 100], $VV = [1, 101], $VW = [1, 102], $VX = [1, 103], $VY = [1, 104], $VZ = [1, 105], $V_ = [2, 78], $V$ = [
		4,
		5,
		17,
		51,
		53,
		54
	], $V01 = [
		4,
		5,
		10,
		14,
		15,
		17,
		19,
		22,
		24,
		30,
		31,
		32,
		34,
		36,
		37,
		38,
		39,
		40,
		42,
		44,
		45,
		47,
		51,
		53,
		54,
		56,
		61,
		62,
		63,
		64,
		73
	], $V11 = [
		4,
		5,
		10,
		14,
		15,
		17,
		19,
		22,
		24,
		30,
		31,
		32,
		34,
		36,
		37,
		38,
		39,
		40,
		42,
		44,
		45,
		47,
		50,
		51,
		53,
		54,
		56,
		61,
		62,
		63,
		64,
		73
	], $V21 = [
		4,
		5,
		10,
		14,
		15,
		17,
		19,
		22,
		24,
		30,
		31,
		32,
		34,
		36,
		37,
		38,
		39,
		40,
		42,
		44,
		45,
		47,
		49,
		51,
		53,
		54,
		56,
		61,
		62,
		63,
		64,
		73
	], $V31 = [
		4,
		5,
		10,
		14,
		15,
		17,
		19,
		22,
		24,
		30,
		31,
		32,
		34,
		36,
		37,
		38,
		39,
		40,
		42,
		44,
		45,
		47,
		48,
		51,
		53,
		54,
		56,
		61,
		62,
		63,
		64,
		73
	], $V41 = [5, 52], $V51 = [
		70,
		71,
		72,
		73
	], $V61 = [1, 151];
	var parser = {
		trace: function trace() {},
		yy: {},
		symbols_: {
			"error": 2,
			"start": 3,
			"SPACE": 4,
			"NEWLINE": 5,
			"SD": 6,
			"document": 7,
			"line": 8,
			"statement": 9,
			"INVALID": 10,
			"box_section": 11,
			"box_line": 12,
			"participant_statement": 13,
			"create": 14,
			"box": 15,
			"restOfLine": 16,
			"end": 17,
			"signal": 18,
			"autonumber": 19,
			"NUM": 20,
			"off": 21,
			"activate": 22,
			"actor": 23,
			"deactivate": 24,
			"note_statement": 25,
			"links_statement": 26,
			"link_statement": 27,
			"properties_statement": 28,
			"details_statement": 29,
			"title": 30,
			"legacy_title": 31,
			"acc_title": 32,
			"acc_title_value": 33,
			"acc_descr": 34,
			"acc_descr_value": 35,
			"acc_descr_multiline_value": 36,
			"loop": 37,
			"rect": 38,
			"opt": 39,
			"alt": 40,
			"else_sections": 41,
			"par": 42,
			"par_sections": 43,
			"par_over": 44,
			"critical": 45,
			"option_sections": 46,
			"break": 47,
			"option": 48,
			"and": 49,
			"else": 50,
			"participant": 51,
			"AS": 52,
			"participant_actor": 53,
			"destroy": 54,
			"actor_with_config": 55,
			"note": 56,
			"placement": 57,
			"text2": 58,
			"over": 59,
			"actor_pair": 60,
			"links": 61,
			"link": 62,
			"properties": 63,
			"details": 64,
			"spaceList": 65,
			",": 66,
			"left_of": 67,
			"right_of": 68,
			"signaltype": 69,
			"+": 70,
			"-": 71,
			"()": 72,
			"ACTOR": 73,
			"config_object": 74,
			"CONFIG_START": 75,
			"CONFIG_CONTENT": 76,
			"CONFIG_END": 77,
			"SOLID_OPEN_ARROW": 78,
			"DOTTED_OPEN_ARROW": 79,
			"SOLID_ARROW": 80,
			"SOLID_ARROW_TOP": 81,
			"SOLID_ARROW_BOTTOM": 82,
			"STICK_ARROW_TOP": 83,
			"STICK_ARROW_BOTTOM": 84,
			"SOLID_ARROW_TOP_DOTTED": 85,
			"SOLID_ARROW_BOTTOM_DOTTED": 86,
			"STICK_ARROW_TOP_DOTTED": 87,
			"STICK_ARROW_BOTTOM_DOTTED": 88,
			"SOLID_ARROW_TOP_REVERSE": 89,
			"SOLID_ARROW_BOTTOM_REVERSE": 90,
			"STICK_ARROW_TOP_REVERSE": 91,
			"STICK_ARROW_BOTTOM_REVERSE": 92,
			"SOLID_ARROW_TOP_REVERSE_DOTTED": 93,
			"SOLID_ARROW_BOTTOM_REVERSE_DOTTED": 94,
			"STICK_ARROW_TOP_REVERSE_DOTTED": 95,
			"STICK_ARROW_BOTTOM_REVERSE_DOTTED": 96,
			"BIDIRECTIONAL_SOLID_ARROW": 97,
			"DOTTED_ARROW": 98,
			"BIDIRECTIONAL_DOTTED_ARROW": 99,
			"SOLID_CROSS": 100,
			"DOTTED_CROSS": 101,
			"SOLID_POINT": 102,
			"DOTTED_POINT": 103,
			"TXT": 104,
			"$accept": 0,
			"$end": 1
		},
		terminals_: {
			2: "error",
			4: "SPACE",
			5: "NEWLINE",
			6: "SD",
			10: "INVALID",
			14: "create",
			15: "box",
			16: "restOfLine",
			17: "end",
			19: "autonumber",
			20: "NUM",
			21: "off",
			22: "activate",
			24: "deactivate",
			30: "title",
			31: "legacy_title",
			32: "acc_title",
			33: "acc_title_value",
			34: "acc_descr",
			35: "acc_descr_value",
			36: "acc_descr_multiline_value",
			37: "loop",
			38: "rect",
			39: "opt",
			40: "alt",
			42: "par",
			44: "par_over",
			45: "critical",
			47: "break",
			48: "option",
			49: "and",
			50: "else",
			51: "participant",
			52: "AS",
			53: "participant_actor",
			54: "destroy",
			56: "note",
			59: "over",
			61: "links",
			62: "link",
			63: "properties",
			64: "details",
			66: ",",
			67: "left_of",
			68: "right_of",
			70: "+",
			71: "-",
			72: "()",
			73: "ACTOR",
			75: "CONFIG_START",
			76: "CONFIG_CONTENT",
			77: "CONFIG_END",
			78: "SOLID_OPEN_ARROW",
			79: "DOTTED_OPEN_ARROW",
			80: "SOLID_ARROW",
			81: "SOLID_ARROW_TOP",
			82: "SOLID_ARROW_BOTTOM",
			83: "STICK_ARROW_TOP",
			84: "STICK_ARROW_BOTTOM",
			85: "SOLID_ARROW_TOP_DOTTED",
			86: "SOLID_ARROW_BOTTOM_DOTTED",
			87: "STICK_ARROW_TOP_DOTTED",
			88: "STICK_ARROW_BOTTOM_DOTTED",
			89: "SOLID_ARROW_TOP_REVERSE",
			90: "SOLID_ARROW_BOTTOM_REVERSE",
			91: "STICK_ARROW_TOP_REVERSE",
			92: "STICK_ARROW_BOTTOM_REVERSE",
			93: "SOLID_ARROW_TOP_REVERSE_DOTTED",
			94: "SOLID_ARROW_BOTTOM_REVERSE_DOTTED",
			95: "STICK_ARROW_TOP_REVERSE_DOTTED",
			96: "STICK_ARROW_BOTTOM_REVERSE_DOTTED",
			97: "BIDIRECTIONAL_SOLID_ARROW",
			98: "DOTTED_ARROW",
			99: "BIDIRECTIONAL_DOTTED_ARROW",
			100: "SOLID_CROSS",
			101: "DOTTED_CROSS",
			102: "SOLID_POINT",
			103: "DOTTED_POINT",
			104: "TXT"
		},
		productions_: [
			0,
			[3, 2],
			[3, 2],
			[3, 2],
			[7, 0],
			[7, 2],
			[8, 2],
			[8, 1],
			[8, 1],
			[8, 1],
			[11, 0],
			[11, 2],
			[12, 2],
			[12, 1],
			[12, 1],
			[9, 1],
			[9, 2],
			[9, 4],
			[9, 2],
			[9, 4],
			[9, 3],
			[9, 3],
			[9, 2],
			[9, 3],
			[9, 3],
			[9, 2],
			[9, 2],
			[9, 2],
			[9, 2],
			[9, 2],
			[9, 1],
			[9, 1],
			[9, 2],
			[9, 2],
			[9, 1],
			[9, 4],
			[9, 4],
			[9, 4],
			[9, 4],
			[9, 4],
			[9, 4],
			[9, 4],
			[9, 4],
			[46, 1],
			[46, 4],
			[43, 1],
			[43, 4],
			[41, 1],
			[41, 4],
			[13, 5],
			[13, 3],
			[13, 5],
			[13, 3],
			[13, 3],
			[13, 5],
			[13, 3],
			[13, 5],
			[13, 3],
			[25, 4],
			[25, 4],
			[26, 3],
			[27, 3],
			[28, 3],
			[29, 3],
			[65, 2],
			[65, 1],
			[60, 3],
			[60, 1],
			[57, 1],
			[57, 1],
			[18, 5],
			[18, 5],
			[18, 5],
			[18, 5],
			[18, 6],
			[18, 4],
			[55, 2],
			[74, 3],
			[23, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[58, 1]
		],
		performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$) {
			var $0 = $$.length - 1;
			switch (yystate) {
				case 3:
					yy.apply($$[$0]);
					return $$[$0];
				case 4:
				case 10:
					this.$ = [];
					break;
				case 5:
				case 11:
					$$[$0 - 1].push($$[$0]);
					this.$ = $$[$0 - 1];
					break;
				case 6:
				case 7:
				case 12:
				case 13:
					this.$ = $$[$0];
					break;
				case 8:
				case 9:
				case 14:
					this.$ = [];
					break;
				case 16:
					$$[$0].type = "createParticipant";
					this.$ = $$[$0];
					break;
				case 17:
					$$[$0 - 1].unshift({
						type: "boxStart",
						boxData: yy.parseBoxData($$[$0 - 2])
					});
					$$[$0 - 1].push({
						type: "boxEnd",
						boxText: $$[$0 - 2]
					});
					this.$ = $$[$0 - 1];
					break;
				case 19:
					this.$ = {
						type: "sequenceIndex",
						sequenceIndex: Number($$[$0 - 2]),
						sequenceIndexStep: Number($$[$0 - 1]),
						sequenceVisible: true,
						signalType: yy.LINETYPE.AUTONUMBER
					};
					break;
				case 20:
					this.$ = {
						type: "sequenceIndex",
						sequenceIndex: Number($$[$0 - 1]),
						sequenceIndexStep: 1,
						sequenceVisible: true,
						signalType: yy.LINETYPE.AUTONUMBER
					};
					break;
				case 21:
					this.$ = {
						type: "sequenceIndex",
						sequenceVisible: false,
						signalType: yy.LINETYPE.AUTONUMBER
					};
					break;
				case 22:
					this.$ = {
						type: "sequenceIndex",
						sequenceVisible: true,
						signalType: yy.LINETYPE.AUTONUMBER
					};
					break;
				case 23:
					this.$ = {
						type: "activeStart",
						signalType: yy.LINETYPE.ACTIVE_START,
						actor: $$[$0 - 1].actor
					};
					break;
				case 24:
					this.$ = {
						type: "activeEnd",
						signalType: yy.LINETYPE.ACTIVE_END,
						actor: $$[$0 - 1].actor
					};
					break;
				case 30:
					yy.setDiagramTitle($$[$0].substring(6));
					this.$ = $$[$0].substring(6);
					break;
				case 31:
					yy.setDiagramTitle($$[$0].substring(7));
					this.$ = $$[$0].substring(7);
					break;
				case 32:
					this.$ = $$[$0].trim();
					yy.setAccTitle(this.$);
					break;
				case 33:
				case 34:
					this.$ = $$[$0].trim();
					yy.setAccDescription(this.$);
					break;
				case 35:
					$$[$0 - 1].unshift({
						type: "loopStart",
						loopText: yy.parseMessage($$[$0 - 2]),
						signalType: yy.LINETYPE.LOOP_START
					});
					$$[$0 - 1].push({
						type: "loopEnd",
						loopText: $$[$0 - 2],
						signalType: yy.LINETYPE.LOOP_END
					});
					this.$ = $$[$0 - 1];
					break;
				case 36:
					$$[$0 - 1].unshift({
						type: "rectStart",
						color: yy.parseMessage($$[$0 - 2]),
						signalType: yy.LINETYPE.RECT_START
					});
					$$[$0 - 1].push({
						type: "rectEnd",
						color: yy.parseMessage($$[$0 - 2]),
						signalType: yy.LINETYPE.RECT_END
					});
					this.$ = $$[$0 - 1];
					break;
				case 37:
					$$[$0 - 1].unshift({
						type: "optStart",
						optText: yy.parseMessage($$[$0 - 2]),
						signalType: yy.LINETYPE.OPT_START
					});
					$$[$0 - 1].push({
						type: "optEnd",
						optText: yy.parseMessage($$[$0 - 2]),
						signalType: yy.LINETYPE.OPT_END
					});
					this.$ = $$[$0 - 1];
					break;
				case 38:
					$$[$0 - 1].unshift({
						type: "altStart",
						altText: yy.parseMessage($$[$0 - 2]),
						signalType: yy.LINETYPE.ALT_START
					});
					$$[$0 - 1].push({
						type: "altEnd",
						signalType: yy.LINETYPE.ALT_END
					});
					this.$ = $$[$0 - 1];
					break;
				case 39:
					$$[$0 - 1].unshift({
						type: "parStart",
						parText: yy.parseMessage($$[$0 - 2]),
						signalType: yy.LINETYPE.PAR_START
					});
					$$[$0 - 1].push({
						type: "parEnd",
						signalType: yy.LINETYPE.PAR_END
					});
					this.$ = $$[$0 - 1];
					break;
				case 40:
					$$[$0 - 1].unshift({
						type: "parStart",
						parText: yy.parseMessage($$[$0 - 2]),
						signalType: yy.LINETYPE.PAR_OVER_START
					});
					$$[$0 - 1].push({
						type: "parEnd",
						signalType: yy.LINETYPE.PAR_END
					});
					this.$ = $$[$0 - 1];
					break;
				case 41:
					$$[$0 - 1].unshift({
						type: "criticalStart",
						criticalText: yy.parseMessage($$[$0 - 2]),
						signalType: yy.LINETYPE.CRITICAL_START
					});
					$$[$0 - 1].push({
						type: "criticalEnd",
						signalType: yy.LINETYPE.CRITICAL_END
					});
					this.$ = $$[$0 - 1];
					break;
				case 42:
					$$[$0 - 1].unshift({
						type: "breakStart",
						breakText: yy.parseMessage($$[$0 - 2]),
						signalType: yy.LINETYPE.BREAK_START
					});
					$$[$0 - 1].push({
						type: "breakEnd",
						optText: yy.parseMessage($$[$0 - 2]),
						signalType: yy.LINETYPE.BREAK_END
					});
					this.$ = $$[$0 - 1];
					break;
				case 44:
					this.$ = $$[$0 - 3].concat([{
						type: "option",
						optionText: yy.parseMessage($$[$0 - 1]),
						signalType: yy.LINETYPE.CRITICAL_OPTION
					}, $$[$0]]);
					break;
				case 46:
					this.$ = $$[$0 - 3].concat([{
						type: "and",
						parText: yy.parseMessage($$[$0 - 1]),
						signalType: yy.LINETYPE.PAR_AND
					}, $$[$0]]);
					break;
				case 48:
					this.$ = $$[$0 - 3].concat([{
						type: "else",
						altText: yy.parseMessage($$[$0 - 1]),
						signalType: yy.LINETYPE.ALT_ELSE
					}, $$[$0]]);
					break;
				case 49:
					$$[$0 - 3].draw = "participant";
					$$[$0 - 3].type = "addParticipant";
					$$[$0 - 3].description = yy.parseMessage($$[$0 - 1]);
					this.$ = $$[$0 - 3];
					break;
				case 50:
					$$[$0 - 1].draw = "participant";
					$$[$0 - 1].type = "addParticipant";
					this.$ = $$[$0 - 1];
					break;
				case 51:
					$$[$0 - 3].draw = "actor";
					$$[$0 - 3].type = "addParticipant";
					$$[$0 - 3].description = yy.parseMessage($$[$0 - 1]);
					this.$ = $$[$0 - 3];
					break;
				case 52:
				case 57:
					$$[$0 - 1].draw = "actor";
					$$[$0 - 1].type = "addParticipant";
					this.$ = $$[$0 - 1];
					break;
				case 53:
					$$[$0 - 1].type = "destroyParticipant";
					this.$ = $$[$0 - 1];
					break;
				case 54:
					$$[$0 - 3].draw = "participant";
					$$[$0 - 3].type = "addParticipant";
					$$[$0 - 3].description = yy.parseMessage($$[$0 - 1]);
					this.$ = $$[$0 - 3];
					break;
				case 55:
					$$[$0 - 1].draw = "participant";
					$$[$0 - 1].type = "addParticipant";
					this.$ = $$[$0 - 1];
					break;
				case 56:
					$$[$0 - 3].draw = "actor";
					$$[$0 - 3].type = "addParticipant";
					$$[$0 - 3].description = yy.parseMessage($$[$0 - 1]);
					this.$ = $$[$0 - 3];
					break;
				case 58:
					this.$ = [$$[$0 - 1], {
						type: "addNote",
						placement: $$[$0 - 2],
						actor: $$[$0 - 1].actor,
						text: $$[$0]
					}];
					break;
				case 59:
					$$[$0 - 2] = [].concat($$[$0 - 1], $$[$0 - 1]).slice(0, 2);
					$$[$0 - 2][0] = $$[$0 - 2][0].actor;
					$$[$0 - 2][1] = $$[$0 - 2][1].actor;
					this.$ = [$$[$0 - 1], {
						type: "addNote",
						placement: yy.PLACEMENT.OVER,
						actor: $$[$0 - 2].slice(0, 2),
						text: $$[$0]
					}];
					break;
				case 60:
					this.$ = [$$[$0 - 1], {
						type: "addLinks",
						actor: $$[$0 - 1].actor,
						text: $$[$0]
					}];
					break;
				case 61:
					this.$ = [$$[$0 - 1], {
						type: "addALink",
						actor: $$[$0 - 1].actor,
						text: $$[$0]
					}];
					break;
				case 62:
					this.$ = [$$[$0 - 1], {
						type: "addProperties",
						actor: $$[$0 - 1].actor,
						text: $$[$0]
					}];
					break;
				case 63:
					this.$ = [$$[$0 - 1], {
						type: "addDetails",
						actor: $$[$0 - 1].actor,
						text: $$[$0]
					}];
					break;
				case 66:
					this.$ = [$$[$0 - 2], $$[$0]];
					break;
				case 67:
					this.$ = $$[$0];
					break;
				case 68:
					this.$ = yy.PLACEMENT.LEFTOF;
					break;
				case 69:
					this.$ = yy.PLACEMENT.RIGHTOF;
					break;
				case 70:
					this.$ = [
						$$[$0 - 4],
						$$[$0 - 1],
						{
							type: "addMessage",
							from: $$[$0 - 4].actor,
							to: $$[$0 - 1].actor,
							signalType: $$[$0 - 3],
							msg: $$[$0],
							activate: true
						},
						{
							type: "activeStart",
							signalType: yy.LINETYPE.ACTIVE_START,
							actor: $$[$0 - 1].actor
						}
					];
					break;
				case 71:
					this.$ = [
						$$[$0 - 4],
						$$[$0 - 1],
						{
							type: "addMessage",
							from: $$[$0 - 4].actor,
							to: $$[$0 - 1].actor,
							signalType: $$[$0 - 3],
							msg: $$[$0],
							deactivate: true
						},
						{
							type: "activeEnd",
							signalType: yy.LINETYPE.ACTIVE_END,
							actor: $$[$0 - 4].actor
						}
					];
					break;
				case 72:
					this.$ = [
						$$[$0 - 4],
						$$[$0 - 1],
						{
							type: "addMessage",
							from: $$[$0 - 4].actor,
							to: $$[$0 - 1].actor,
							signalType: $$[$0 - 3],
							msg: $$[$0],
							activate: false,
							centralConnection: yy.LINETYPE.CENTRAL_CONNECTION
						},
						{
							type: "centralConnection",
							signalType: yy.LINETYPE.CENTRAL_CONNECTION,
							actor: $$[$0 - 1].actor
						}
					];
					break;
				case 73:
					this.$ = [
						$$[$0 - 4],
						$$[$0 - 1],
						{
							type: "addMessage",
							from: $$[$0 - 4].actor,
							to: $$[$0 - 1].actor,
							signalType: $$[$0 - 2],
							msg: $$[$0],
							activate: false,
							centralConnection: yy.LINETYPE.CENTRAL_CONNECTION_REVERSE
						},
						{
							type: "centralConnectionReverse",
							signalType: yy.LINETYPE.CENTRAL_CONNECTION_REVERSE,
							actor: $$[$0 - 4].actor
						}
					];
					break;
				case 74:
					this.$ = [
						$$[$0 - 5],
						$$[$0 - 1],
						{
							type: "addMessage",
							from: $$[$0 - 5].actor,
							to: $$[$0 - 1].actor,
							signalType: $$[$0 - 3],
							msg: $$[$0],
							activate: false,
							centralConnection: yy.LINETYPE.CENTRAL_CONNECTION_DUAL
						},
						{
							type: "centralConnection",
							signalType: yy.LINETYPE.CENTRAL_CONNECTION,
							actor: $$[$0 - 1].actor
						},
						{
							type: "centralConnectionReverse",
							signalType: yy.LINETYPE.CENTRAL_CONNECTION_REVERSE,
							actor: $$[$0 - 5].actor
						}
					];
					break;
				case 75:
					this.$ = [
						$$[$0 - 3],
						$$[$0 - 1],
						{
							type: "addMessage",
							from: $$[$0 - 3].actor,
							to: $$[$0 - 1].actor,
							signalType: $$[$0 - 2],
							msg: $$[$0]
						}
					];
					break;
				case 76:
					this.$ = {
						type: "addParticipant",
						actor: $$[$0 - 1],
						config: $$[$0]
					};
					break;
				case 77:
					this.$ = $$[$0 - 1].trim();
					break;
				case 78:
					this.$ = {
						type: "addParticipant",
						actor: $$[$0]
					};
					break;
				case 79:
					this.$ = yy.LINETYPE.SOLID_OPEN;
					break;
				case 80:
					this.$ = yy.LINETYPE.DOTTED_OPEN;
					break;
				case 81:
					this.$ = yy.LINETYPE.SOLID;
					break;
				case 82:
					this.$ = yy.LINETYPE.SOLID_TOP;
					break;
				case 83:
					this.$ = yy.LINETYPE.SOLID_BOTTOM;
					break;
				case 84:
					this.$ = yy.LINETYPE.STICK_TOP;
					break;
				case 85:
					this.$ = yy.LINETYPE.STICK_BOTTOM;
					break;
				case 86:
					this.$ = yy.LINETYPE.SOLID_TOP_DOTTED;
					break;
				case 87:
					this.$ = yy.LINETYPE.SOLID_BOTTOM_DOTTED;
					break;
				case 88:
					this.$ = yy.LINETYPE.STICK_TOP_DOTTED;
					break;
				case 89:
					this.$ = yy.LINETYPE.STICK_BOTTOM_DOTTED;
					break;
				case 90:
					this.$ = yy.LINETYPE.SOLID_ARROW_TOP_REVERSE;
					break;
				case 91:
					this.$ = yy.LINETYPE.SOLID_ARROW_BOTTOM_REVERSE;
					break;
				case 92:
					this.$ = yy.LINETYPE.STICK_ARROW_TOP_REVERSE;
					break;
				case 93:
					this.$ = yy.LINETYPE.STICK_ARROW_BOTTOM_REVERSE;
					break;
				case 94:
					this.$ = yy.LINETYPE.SOLID_ARROW_TOP_REVERSE_DOTTED;
					break;
				case 95:
					this.$ = yy.LINETYPE.SOLID_ARROW_BOTTOM_REVERSE_DOTTED;
					break;
				case 96:
					this.$ = yy.LINETYPE.STICK_ARROW_TOP_REVERSE_DOTTED;
					break;
				case 97:
					this.$ = yy.LINETYPE.STICK_ARROW_BOTTOM_REVERSE_DOTTED;
					break;
				case 98:
					this.$ = yy.LINETYPE.BIDIRECTIONAL_SOLID;
					break;
				case 99:
					this.$ = yy.LINETYPE.DOTTED;
					break;
				case 100:
					this.$ = yy.LINETYPE.BIDIRECTIONAL_DOTTED;
					break;
				case 101:
					this.$ = yy.LINETYPE.SOLID_CROSS;
					break;
				case 102:
					this.$ = yy.LINETYPE.DOTTED_CROSS;
					break;
				case 103:
					this.$ = yy.LINETYPE.SOLID_POINT;
					break;
				case 104:
					this.$ = yy.LINETYPE.DOTTED_POINT;
					break;
				case 105: this.$ = yy.parseMessage($$[$0].trim().substring(1));
			}
		},
		table: [
			{
				3: 1,
				4: $V0,
				5: $V1,
				6: $V2
			},
			{ 1: [3] },
			{
				3: 5,
				4: $V0,
				5: $V1,
				6: $V2
			},
			{
				3: 6,
				4: $V0,
				5: $V1,
				6: $V2
			},
			o([
				1,
				4,
				5,
				10,
				14,
				15,
				19,
				22,
				24,
				30,
				31,
				32,
				34,
				36,
				37,
				38,
				39,
				40,
				42,
				44,
				45,
				47,
				51,
				53,
				54,
				56,
				61,
				62,
				63,
				64,
				73
			], $V3, { 7: 7 }),
			{ 1: [2, 1] },
			{ 1: [2, 2] },
			{
				1: [2, 3],
				4: $V4,
				5: $V5,
				8: 8,
				9: 10,
				10: $V6,
				13: 13,
				14: $V7,
				15: $V8,
				18: 16,
				19: $V9,
				22: $Va,
				23: 41,
				24: $Vb,
				25: 20,
				26: 21,
				27: 22,
				28: 23,
				29: 24,
				30: $Vc,
				31: $Vd,
				32: $Ve,
				34: $Vf,
				36: $Vg,
				37: $Vh,
				38: $Vi,
				39: $Vj,
				40: $Vk,
				42: $Vl,
				44: $Vm,
				45: $Vn,
				47: $Vo,
				51: $Vp,
				53: $Vq,
				54: $Vr,
				56: $Vs,
				61: $Vt,
				62: $Vu,
				63: $Vv,
				64: $Vw,
				73: $Vx
			},
			o($Vy, [2, 5]),
			{
				9: 48,
				13: 13,
				14: $V7,
				15: $V8,
				18: 16,
				19: $V9,
				22: $Va,
				23: 41,
				24: $Vb,
				25: 20,
				26: 21,
				27: 22,
				28: 23,
				29: 24,
				30: $Vc,
				31: $Vd,
				32: $Ve,
				34: $Vf,
				36: $Vg,
				37: $Vh,
				38: $Vi,
				39: $Vj,
				40: $Vk,
				42: $Vl,
				44: $Vm,
				45: $Vn,
				47: $Vo,
				51: $Vp,
				53: $Vq,
				54: $Vr,
				56: $Vs,
				61: $Vt,
				62: $Vu,
				63: $Vv,
				64: $Vw,
				73: $Vx
			},
			o($Vy, [2, 7]),
			o($Vy, [2, 8]),
			o($Vy, [2, 9]),
			o($Vy, [2, 15]),
			{
				13: 49,
				51: $Vp,
				53: $Vq,
				54: $Vr
			},
			{ 16: [1, 50] },
			{ 5: [1, 51] },
			{
				5: [1, 54],
				20: [1, 52],
				21: [1, 53]
			},
			{
				23: 55,
				73: $Vx
			},
			{
				23: 56,
				73: $Vx
			},
			{ 5: [1, 57] },
			{ 5: [1, 58] },
			{ 5: [1, 59] },
			{ 5: [1, 60] },
			{ 5: [1, 61] },
			o($Vy, [2, 30]),
			o($Vy, [2, 31]),
			{ 33: [1, 62] },
			{ 35: [1, 63] },
			o($Vy, [2, 34]),
			{ 16: [1, 64] },
			{ 16: [1, 65] },
			{ 16: [1, 66] },
			{ 16: [1, 67] },
			{ 16: [1, 68] },
			{ 16: [1, 69] },
			{ 16: [1, 70] },
			{ 16: [1, 71] },
			{
				23: 72,
				55: 73,
				73: $Vz
			},
			{
				23: 75,
				55: 76,
				73: $Vz
			},
			{
				23: 77,
				73: $Vx
			},
			{
				69: 78,
				72: [1, 79],
				78: $VA,
				79: $VB,
				80: $VC,
				81: $VD,
				82: $VE,
				83: $VF,
				84: $VG,
				85: $VH,
				86: $VI,
				87: $VJ,
				88: $VK,
				89: $VL,
				90: $VM,
				91: $VN,
				92: $VO,
				93: $VP,
				94: $VQ,
				95: $VR,
				96: $VS,
				97: $VT,
				98: $VU,
				99: $VV,
				100: $VW,
				101: $VX,
				102: $VY,
				103: $VZ
			},
			{
				57: 106,
				59: [1, 107],
				67: [1, 108],
				68: [1, 109]
			},
			{
				23: 110,
				73: $Vx
			},
			{
				23: 111,
				73: $Vx
			},
			{
				23: 112,
				73: $Vx
			},
			{
				23: 113,
				73: $Vx
			},
			o([
				5,
				66,
				72,
				78,
				79,
				80,
				81,
				82,
				83,
				84,
				85,
				86,
				87,
				88,
				89,
				90,
				91,
				92,
				93,
				94,
				95,
				96,
				97,
				98,
				99,
				100,
				101,
				102,
				103,
				104
			], $V_),
			o($Vy, [2, 6]),
			o($Vy, [2, 16]),
			o($V$, [2, 10], { 11: 114 }),
			o($Vy, [2, 18]),
			{
				5: [1, 116],
				20: [1, 115]
			},
			{ 5: [1, 117] },
			o($Vy, [2, 22]),
			{ 5: [1, 118] },
			{ 5: [1, 119] },
			o($Vy, [2, 25]),
			o($Vy, [2, 26]),
			o($Vy, [2, 27]),
			o($Vy, [2, 28]),
			o($Vy, [2, 29]),
			o($Vy, [2, 32]),
			o($Vy, [2, 33]),
			o($V01, $V3, { 7: 120 }),
			o($V01, $V3, { 7: 121 }),
			o($V01, $V3, { 7: 122 }),
			o($V11, $V3, {
				41: 123,
				7: 124
			}),
			o($V21, $V3, {
				43: 125,
				7: 126
			}),
			o($V21, $V3, {
				7: 126,
				43: 127
			}),
			o($V31, $V3, {
				46: 128,
				7: 129
			}),
			o($V01, $V3, { 7: 130 }),
			{
				5: [1, 132],
				52: [1, 131]
			},
			{
				5: [1, 134],
				52: [1, 133]
			},
			o($V41, $V_, {
				74: 135,
				75: [1, 136]
			}),
			{
				5: [1, 138],
				52: [1, 137]
			},
			{
				5: [1, 140],
				52: [1, 139]
			},
			{ 5: [1, 141] },
			{
				23: 145,
				70: [1, 142],
				71: [1, 143],
				72: [1, 144],
				73: $Vx
			},
			{
				69: 146,
				78: $VA,
				79: $VB,
				80: $VC,
				81: $VD,
				82: $VE,
				83: $VF,
				84: $VG,
				85: $VH,
				86: $VI,
				87: $VJ,
				88: $VK,
				89: $VL,
				90: $VM,
				91: $VN,
				92: $VO,
				93: $VP,
				94: $VQ,
				95: $VR,
				96: $VS,
				97: $VT,
				98: $VU,
				99: $VV,
				100: $VW,
				101: $VX,
				102: $VY,
				103: $VZ
			},
			o($V51, [2, 79]),
			o($V51, [2, 80]),
			o($V51, [2, 81]),
			o($V51, [2, 82]),
			o($V51, [2, 83]),
			o($V51, [2, 84]),
			o($V51, [2, 85]),
			o($V51, [2, 86]),
			o($V51, [2, 87]),
			o($V51, [2, 88]),
			o($V51, [2, 89]),
			o($V51, [2, 90]),
			o($V51, [2, 91]),
			o($V51, [2, 92]),
			o($V51, [2, 93]),
			o($V51, [2, 94]),
			o($V51, [2, 95]),
			o($V51, [2, 96]),
			o($V51, [2, 97]),
			o($V51, [2, 98]),
			o($V51, [2, 99]),
			o($V51, [2, 100]),
			o($V51, [2, 101]),
			o($V51, [2, 102]),
			o($V51, [2, 103]),
			o($V51, [2, 104]),
			{
				23: 147,
				73: $Vx
			},
			{
				23: 149,
				60: 148,
				73: $Vx
			},
			{ 73: [2, 68] },
			{ 73: [2, 69] },
			{
				58: 150,
				104: $V61
			},
			{
				58: 152,
				104: $V61
			},
			{
				58: 153,
				104: $V61
			},
			{
				58: 154,
				104: $V61
			},
			{
				4: [1, 157],
				5: [1, 159],
				12: 156,
				13: 158,
				17: [1, 155],
				51: $Vp,
				53: $Vq,
				54: $Vr
			},
			{ 5: [1, 160] },
			o($Vy, [2, 20]),
			o($Vy, [2, 21]),
			o($Vy, [2, 23]),
			o($Vy, [2, 24]),
			{
				4: $V4,
				5: $V5,
				8: 8,
				9: 10,
				10: $V6,
				13: 13,
				14: $V7,
				15: $V8,
				17: [1, 161],
				18: 16,
				19: $V9,
				22: $Va,
				23: 41,
				24: $Vb,
				25: 20,
				26: 21,
				27: 22,
				28: 23,
				29: 24,
				30: $Vc,
				31: $Vd,
				32: $Ve,
				34: $Vf,
				36: $Vg,
				37: $Vh,
				38: $Vi,
				39: $Vj,
				40: $Vk,
				42: $Vl,
				44: $Vm,
				45: $Vn,
				47: $Vo,
				51: $Vp,
				53: $Vq,
				54: $Vr,
				56: $Vs,
				61: $Vt,
				62: $Vu,
				63: $Vv,
				64: $Vw,
				73: $Vx
			},
			{
				4: $V4,
				5: $V5,
				8: 8,
				9: 10,
				10: $V6,
				13: 13,
				14: $V7,
				15: $V8,
				17: [1, 162],
				18: 16,
				19: $V9,
				22: $Va,
				23: 41,
				24: $Vb,
				25: 20,
				26: 21,
				27: 22,
				28: 23,
				29: 24,
				30: $Vc,
				31: $Vd,
				32: $Ve,
				34: $Vf,
				36: $Vg,
				37: $Vh,
				38: $Vi,
				39: $Vj,
				40: $Vk,
				42: $Vl,
				44: $Vm,
				45: $Vn,
				47: $Vo,
				51: $Vp,
				53: $Vq,
				54: $Vr,
				56: $Vs,
				61: $Vt,
				62: $Vu,
				63: $Vv,
				64: $Vw,
				73: $Vx
			},
			{
				4: $V4,
				5: $V5,
				8: 8,
				9: 10,
				10: $V6,
				13: 13,
				14: $V7,
				15: $V8,
				17: [1, 163],
				18: 16,
				19: $V9,
				22: $Va,
				23: 41,
				24: $Vb,
				25: 20,
				26: 21,
				27: 22,
				28: 23,
				29: 24,
				30: $Vc,
				31: $Vd,
				32: $Ve,
				34: $Vf,
				36: $Vg,
				37: $Vh,
				38: $Vi,
				39: $Vj,
				40: $Vk,
				42: $Vl,
				44: $Vm,
				45: $Vn,
				47: $Vo,
				51: $Vp,
				53: $Vq,
				54: $Vr,
				56: $Vs,
				61: $Vt,
				62: $Vu,
				63: $Vv,
				64: $Vw,
				73: $Vx
			},
			{ 17: [1, 164] },
			{
				4: $V4,
				5: $V5,
				8: 8,
				9: 10,
				10: $V6,
				13: 13,
				14: $V7,
				15: $V8,
				17: [2, 47],
				18: 16,
				19: $V9,
				22: $Va,
				23: 41,
				24: $Vb,
				25: 20,
				26: 21,
				27: 22,
				28: 23,
				29: 24,
				30: $Vc,
				31: $Vd,
				32: $Ve,
				34: $Vf,
				36: $Vg,
				37: $Vh,
				38: $Vi,
				39: $Vj,
				40: $Vk,
				42: $Vl,
				44: $Vm,
				45: $Vn,
				47: $Vo,
				50: [1, 165],
				51: $Vp,
				53: $Vq,
				54: $Vr,
				56: $Vs,
				61: $Vt,
				62: $Vu,
				63: $Vv,
				64: $Vw,
				73: $Vx
			},
			{ 17: [1, 166] },
			{
				4: $V4,
				5: $V5,
				8: 8,
				9: 10,
				10: $V6,
				13: 13,
				14: $V7,
				15: $V8,
				17: [2, 45],
				18: 16,
				19: $V9,
				22: $Va,
				23: 41,
				24: $Vb,
				25: 20,
				26: 21,
				27: 22,
				28: 23,
				29: 24,
				30: $Vc,
				31: $Vd,
				32: $Ve,
				34: $Vf,
				36: $Vg,
				37: $Vh,
				38: $Vi,
				39: $Vj,
				40: $Vk,
				42: $Vl,
				44: $Vm,
				45: $Vn,
				47: $Vo,
				49: [1, 167],
				51: $Vp,
				53: $Vq,
				54: $Vr,
				56: $Vs,
				61: $Vt,
				62: $Vu,
				63: $Vv,
				64: $Vw,
				73: $Vx
			},
			{ 17: [1, 168] },
			{ 17: [1, 169] },
			{
				4: $V4,
				5: $V5,
				8: 8,
				9: 10,
				10: $V6,
				13: 13,
				14: $V7,
				15: $V8,
				17: [2, 43],
				18: 16,
				19: $V9,
				22: $Va,
				23: 41,
				24: $Vb,
				25: 20,
				26: 21,
				27: 22,
				28: 23,
				29: 24,
				30: $Vc,
				31: $Vd,
				32: $Ve,
				34: $Vf,
				36: $Vg,
				37: $Vh,
				38: $Vi,
				39: $Vj,
				40: $Vk,
				42: $Vl,
				44: $Vm,
				45: $Vn,
				47: $Vo,
				48: [1, 170],
				51: $Vp,
				53: $Vq,
				54: $Vr,
				56: $Vs,
				61: $Vt,
				62: $Vu,
				63: $Vv,
				64: $Vw,
				73: $Vx
			},
			{
				4: $V4,
				5: $V5,
				8: 8,
				9: 10,
				10: $V6,
				13: 13,
				14: $V7,
				15: $V8,
				17: [1, 171],
				18: 16,
				19: $V9,
				22: $Va,
				23: 41,
				24: $Vb,
				25: 20,
				26: 21,
				27: 22,
				28: 23,
				29: 24,
				30: $Vc,
				31: $Vd,
				32: $Ve,
				34: $Vf,
				36: $Vg,
				37: $Vh,
				38: $Vi,
				39: $Vj,
				40: $Vk,
				42: $Vl,
				44: $Vm,
				45: $Vn,
				47: $Vo,
				51: $Vp,
				53: $Vq,
				54: $Vr,
				56: $Vs,
				61: $Vt,
				62: $Vu,
				63: $Vv,
				64: $Vw,
				73: $Vx
			},
			{ 16: [1, 172] },
			o($Vy, [2, 50]),
			{ 16: [1, 173] },
			o($Vy, [2, 55]),
			o($V41, [2, 76]),
			{ 76: [1, 174] },
			{ 16: [1, 175] },
			o($Vy, [2, 52]),
			{ 16: [1, 176] },
			o($Vy, [2, 57]),
			o($Vy, [2, 53]),
			{
				23: 177,
				73: $Vx
			},
			{
				23: 178,
				73: $Vx
			},
			{
				23: 179,
				73: $Vx
			},
			{
				58: 180,
				104: $V61
			},
			{
				23: 181,
				72: [1, 182],
				73: $Vx
			},
			{
				58: 183,
				104: $V61
			},
			{
				58: 184,
				104: $V61
			},
			{
				66: [1, 185],
				104: [2, 67]
			},
			{ 5: [2, 60] },
			{ 5: [2, 105] },
			{ 5: [2, 61] },
			{ 5: [2, 62] },
			{ 5: [2, 63] },
			o($Vy, [2, 17]),
			o($V$, [2, 11]),
			{
				13: 186,
				51: $Vp,
				53: $Vq,
				54: $Vr
			},
			o($V$, [2, 13]),
			o($V$, [2, 14]),
			o($Vy, [2, 19]),
			o($Vy, [2, 35]),
			o($Vy, [2, 36]),
			o($Vy, [2, 37]),
			o($Vy, [2, 38]),
			{ 16: [1, 187] },
			o($Vy, [2, 39]),
			{ 16: [1, 188] },
			o($Vy, [2, 40]),
			o($Vy, [2, 41]),
			{ 16: [1, 189] },
			o($Vy, [2, 42]),
			{ 5: [1, 190] },
			{ 5: [1, 191] },
			{ 77: [1, 192] },
			{ 5: [1, 193] },
			{ 5: [1, 194] },
			{
				58: 195,
				104: $V61
			},
			{
				58: 196,
				104: $V61
			},
			{
				58: 197,
				104: $V61
			},
			{ 5: [2, 75] },
			{
				58: 198,
				104: $V61
			},
			{
				23: 199,
				73: $Vx
			},
			{ 5: [2, 58] },
			{ 5: [2, 59] },
			{
				23: 200,
				73: $Vx
			},
			o($V$, [2, 12]),
			o($V11, $V3, {
				7: 124,
				41: 201
			}),
			o($V21, $V3, {
				7: 126,
				43: 202
			}),
			o($V31, $V3, {
				7: 129,
				46: 203
			}),
			o($Vy, [2, 49]),
			o($Vy, [2, 54]),
			o($V41, [2, 77]),
			o($Vy, [2, 51]),
			o($Vy, [2, 56]),
			{ 5: [2, 70] },
			{ 5: [2, 71] },
			{ 5: [2, 72] },
			{ 5: [2, 73] },
			{
				58: 204,
				104: $V61
			},
			{ 104: [2, 66] },
			{ 17: [2, 48] },
			{ 17: [2, 46] },
			{ 17: [2, 44] },
			{ 5: [2, 74] }
		],
		defaultActions: {
			5: [2, 1],
			6: [2, 2],
			108: [2, 68],
			109: [2, 69],
			150: [2, 60],
			151: [2, 105],
			152: [2, 61],
			153: [2, 62],
			154: [2, 63],
			180: [2, 75],
			183: [2, 58],
			184: [2, 59],
			195: [2, 70],
			196: [2, 71],
			197: [2, 72],
			198: [2, 73],
			200: [2, 66],
			201: [2, 48],
			202: [2, 46],
			203: [2, 44],
			204: [2, 74]
		},
		parseError: function parseError(str, hash) {
			if (hash.recoverable) this.trace(str);
			else {
				var error = new Error(str);
				error.hash = hash;
				throw error;
			}
		},
		parse: function parse(input) {
			var self = this, stack = [0], vstack = [null], lstack = [], table = this.table, yytext = "", yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
			var args = lstack.slice.call(arguments, 1);
			var lexer = Object.create(this.lexer);
			var sharedState = { yy: {} };
			for (var k in this.yy) if (Object.prototype.hasOwnProperty.call(this.yy, k)) sharedState.yy[k] = this.yy[k];
			lexer.setInput(input, sharedState.yy);
			sharedState.yy.lexer = lexer;
			sharedState.yy.parser = this;
			if (typeof lexer.yylloc == "undefined") lexer.yylloc = {};
			var yyloc = lexer.yylloc;
			lstack.push(yyloc);
			var ranges = lexer.options && lexer.options.ranges;
			if (typeof sharedState.yy.parseError === "function") this.parseError = sharedState.yy.parseError;
			else this.parseError = Object.getPrototypeOf(this).parseError;
			_token_stack: var lex = function() {
				var token = lexer.lex() || EOF;
				if (typeof token !== "number") token = self.symbols_[token] || token;
				return token;
			};
			var symbol, preErrorSymbol, state, action, r, yyval = {}, p, len, newState, expected;
			while (true) {
				state = stack[stack.length - 1];
				if (this.defaultActions[state]) action = this.defaultActions[state];
				else {
					if (symbol === null || typeof symbol == "undefined") symbol = lex();
					action = table[state] && table[state][symbol];
				}
				if (typeof action === "undefined" || !action.length || !action[0]) {
					var errStr = "";
					expected = [];
					for (p in table[state]) if (this.terminals_[p] && p > TERROR) expected.push("'" + this.terminals_[p] + "'");
					if (lexer.showPosition) errStr = "Parse error on line " + (yylineno + 1) + ":\n" + lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + (this.terminals_[symbol] || symbol) + "'";
					else errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == EOF ? "end of input" : "'" + (this.terminals_[symbol] || symbol) + "'");
					this.parseError(errStr, {
						text: lexer.match,
						token: this.terminals_[symbol] || symbol,
						line: lexer.yylineno,
						loc: yyloc,
						expected
					});
				}
				if (action[0] instanceof Array && action.length > 1) throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
				switch (action[0]) {
					case 1:
						stack.push(symbol);
						vstack.push(lexer.yytext);
						lstack.push(lexer.yylloc);
						stack.push(action[1]);
						symbol = null;
						if (!preErrorSymbol) {
							yyleng = lexer.yyleng;
							yytext = lexer.yytext;
							yylineno = lexer.yylineno;
							yyloc = lexer.yylloc;
							if (recovering > 0) recovering--;
						} else {
							symbol = preErrorSymbol;
							preErrorSymbol = null;
						}
						break;
					case 2:
						len = this.productions_[action[1]][1];
						yyval.$ = vstack[vstack.length - len];
						yyval._$ = {
							first_line: lstack[lstack.length - (len || 1)].first_line,
							last_line: lstack[lstack.length - 1].last_line,
							first_column: lstack[lstack.length - (len || 1)].first_column,
							last_column: lstack[lstack.length - 1].last_column
						};
						if (ranges) yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]];
						r = this.performAction.apply(yyval, [
							yytext,
							yyleng,
							yylineno,
							sharedState.yy,
							action[1],
							vstack,
							lstack
						].concat(args));
						if (typeof r !== "undefined") return r;
						if (len) {
							stack = stack.slice(0, -1 * len * 2);
							vstack = vstack.slice(0, -1 * len);
							lstack = lstack.slice(0, -1 * len);
						}
						stack.push(this.productions_[action[1]][0]);
						vstack.push(yyval.$);
						lstack.push(yyval._$);
						newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
						stack.push(newState);
						break;
					case 3: return true;
				}
			}
			return true;
		}
	};
	parser.lexer = (function() {
		return {
			EOF: 1,
			parseError: function parseError(str, hash) {
				if (this.yy.parser) this.yy.parser.parseError(str, hash);
				else throw new Error(str);
			},
			setInput: function(input, yy) {
				this.yy = yy || this.yy || {};
				this._input = input;
				this._more = this._backtrack = this.done = false;
				this.yylineno = this.yyleng = 0;
				this.yytext = this.matched = this.match = "";
				this.conditionStack = ["INITIAL"];
				this.yylloc = {
					first_line: 1,
					first_column: 0,
					last_line: 1,
					last_column: 0
				};
				if (this.options.ranges) this.yylloc.range = [0, 0];
				this.offset = 0;
				return this;
			},
			input: function() {
				var ch = this._input[0];
				this.yytext += ch;
				this.yyleng++;
				this.offset++;
				this.match += ch;
				this.matched += ch;
				if (ch.match(/(?:\r\n?|\n).*/g)) {
					this.yylineno++;
					this.yylloc.last_line++;
				} else this.yylloc.last_column++;
				if (this.options.ranges) this.yylloc.range[1]++;
				this._input = this._input.slice(1);
				return ch;
			},
			unput: function(ch) {
				var len = ch.length;
				var lines = ch.split(/(?:\r\n?|\n)/g);
				this._input = ch + this._input;
				this.yytext = this.yytext.substr(0, this.yytext.length - len);
				this.offset -= len;
				var oldLines = this.match.split(/(?:\r\n?|\n)/g);
				this.match = this.match.substr(0, this.match.length - 1);
				this.matched = this.matched.substr(0, this.matched.length - 1);
				if (lines.length - 1) this.yylineno -= lines.length - 1;
				var r = this.yylloc.range;
				this.yylloc = {
					first_line: this.yylloc.first_line,
					last_line: this.yylineno + 1,
					first_column: this.yylloc.first_column,
					last_column: lines ? (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length : this.yylloc.first_column - len
				};
				if (this.options.ranges) this.yylloc.range = [r[0], r[0] + this.yyleng - len];
				this.yyleng = this.yytext.length;
				return this;
			},
			more: function() {
				this._more = true;
				return this;
			},
			reject: function() {
				if (this.options.backtrack_lexer) this._backtrack = true;
				else return this.parseError("Lexical error on line " + (this.yylineno + 1) + ". You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n" + this.showPosition(), {
					text: "",
					token: null,
					line: this.yylineno
				});
				return this;
			},
			less: function(n) {
				this.unput(this.match.slice(n));
			},
			pastInput: function() {
				var past = this.matched.substr(0, this.matched.length - this.match.length);
				return (past.length > 20 ? "..." : "") + past.substr(-20).replace(/\n/g, "");
			},
			upcomingInput: function() {
				var next = this.match;
				if (next.length < 20) next += this._input.substr(0, 20 - next.length);
				return (next.substr(0, 20) + (next.length > 20 ? "..." : "")).replace(/\n/g, "");
			},
			showPosition: function() {
				var pre = this.pastInput();
				var c = new Array(pre.length + 1).join("-");
				return pre + this.upcomingInput() + "\n" + c + "^";
			},
			test_match: function(match, indexed_rule) {
				var token, lines, backup;
				if (this.options.backtrack_lexer) {
					backup = {
						yylineno: this.yylineno,
						yylloc: {
							first_line: this.yylloc.first_line,
							last_line: this.last_line,
							first_column: this.yylloc.first_column,
							last_column: this.yylloc.last_column
						},
						yytext: this.yytext,
						match: this.match,
						matches: this.matches,
						matched: this.matched,
						yyleng: this.yyleng,
						offset: this.offset,
						_more: this._more,
						_input: this._input,
						yy: this.yy,
						conditionStack: this.conditionStack.slice(0),
						done: this.done
					};
					if (this.options.ranges) backup.yylloc.range = this.yylloc.range.slice(0);
				}
				lines = match[0].match(/(?:\r\n?|\n).*/g);
				if (lines) this.yylineno += lines.length;
				this.yylloc = {
					first_line: this.yylloc.last_line,
					last_line: this.yylineno + 1,
					first_column: this.yylloc.last_column,
					last_column: lines ? lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length
				};
				this.yytext += match[0];
				this.match += match[0];
				this.matches = match;
				this.yyleng = this.yytext.length;
				if (this.options.ranges) this.yylloc.range = [this.offset, this.offset += this.yyleng];
				this._more = false;
				this._backtrack = false;
				this._input = this._input.slice(match[0].length);
				this.matched += match[0];
				token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
				if (this.done && this._input) this.done = false;
				if (token) return token;
				else if (this._backtrack) {
					for (var k in backup) this[k] = backup[k];
					return false;
				}
				return false;
			},
			next: function() {
				if (this.done) return this.EOF;
				if (!this._input) this.done = true;
				var token, match, tempMatch, index;
				if (!this._more) {
					this.yytext = "";
					this.match = "";
				}
				var rules = this._currentRules();
				for (var i = 0; i < rules.length; i++) {
					tempMatch = this._input.match(this.rules[rules[i]]);
					if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
						match = tempMatch;
						index = i;
						if (this.options.backtrack_lexer) {
							token = this.test_match(tempMatch, rules[i]);
							if (token !== false) return token;
							else if (this._backtrack) {
								match = false;
								continue;
							} else return false;
						} else if (!this.options.flex) break;
					}
				}
				if (match) {
					token = this.test_match(match, rules[index]);
					if (token !== false) return token;
					return false;
				}
				if (this._input === "") return this.EOF;
				else return this.parseError("Lexical error on line " + (this.yylineno + 1) + ". Unrecognized text.\n" + this.showPosition(), {
					text: "",
					token: null,
					line: this.yylineno
				});
			},
			lex: function lex() {
				var r = this.next();
				if (r) return r;
				else return this.lex();
			},
			begin: function begin(condition) {
				this.conditionStack.push(condition);
			},
			popState: function popState() {
				if (this.conditionStack.length - 1 > 0) return this.conditionStack.pop();
				else return this.conditionStack[0];
			},
			_currentRules: function _currentRules() {
				if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
				else return this.conditions["INITIAL"].rules;
			},
			topState: function topState(n) {
				n = this.conditionStack.length - 1 - Math.abs(n || 0);
				if (n >= 0) return this.conditionStack[n];
				else return "INITIAL";
			},
			pushState: function pushState(condition) {
				this.begin(condition);
			},
			stateStackSize: function stateStackSize() {
				return this.conditionStack.length;
			},
			options: { "case-insensitive": true },
			performAction: function anonymous(yy, yy_, $avoiding_name_collisions, YY_START) {
				switch ($avoiding_name_collisions) {
					case 0: return 5;
					case 1: break;
					case 2: break;
					case 3: break;
					case 4: break;
					case 5: break;
					case 6: return 20;
					case 7:
						this.begin("CONFIG");
						return 75;
					case 8: return 76;
					case 9:
						this.popState();
						this.begin("ALIAS");
						return 77;
					case 10:
						this.popState();
						this.popState();
						return 77;
					case 11:
						yy_.yytext = yy_.yytext.trim();
						return 73;
					case 12:
						yy_.yytext = yy_.yytext.trim();
						this.begin("ALIAS");
						return 73;
					case 13:
						yy_.yytext = yy_.yytext.trim();
						this.popState();
						return 73;
					case 14:
						this.popState();
						return 10;
					case 15:
						yy_.yytext = yy_.yytext.trim();
						this.popState();
						return 10;
					case 16:
						this.begin("LINE");
						return 15;
					case 17:
						this.begin("ID");
						return 51;
					case 18:
						this.begin("ID");
						return 53;
					case 19: return 14;
					case 20:
						this.begin("ID");
						return 54;
					case 21:
						this.popState();
						this.popState();
						this.begin("LINE");
						return 52;
					case 22:
						this.popState();
						this.popState();
						return 5;
					case 23:
						this.begin("LINE");
						return 37;
					case 24:
						this.begin("LINE");
						return 38;
					case 25:
						this.begin("LINE");
						return 39;
					case 26:
						this.begin("LINE");
						return 40;
					case 27:
						this.begin("LINE");
						return 50;
					case 28:
						this.begin("LINE");
						return 42;
					case 29:
						this.begin("LINE");
						return 44;
					case 30:
						this.begin("LINE");
						return 49;
					case 31:
						this.begin("LINE");
						return 45;
					case 32:
						this.begin("LINE");
						return 48;
					case 33:
						this.begin("LINE");
						return 47;
					case 34:
						this.popState();
						return 16;
					case 35: return 17;
					case 36: return 67;
					case 37: return 68;
					case 38: return 61;
					case 39: return 62;
					case 40: return 63;
					case 41: return 64;
					case 42: return 59;
					case 43: return 56;
					case 44:
						this.begin("ID");
						return 22;
					case 45:
						this.begin("ID");
						return 24;
					case 46: return 30;
					case 47: return 31;
					case 48:
						this.begin("acc_title");
						return 32;
					case 49:
						this.popState();
						return "acc_title_value";
					case 50:
						this.begin("acc_descr");
						return 34;
					case 51:
						this.popState();
						return "acc_descr_value";
					case 52:
						this.begin("acc_descr_multiline");
						break;
					case 53:
						this.popState();
						break;
					case 54: return "acc_descr_multiline_value";
					case 55: return 6;
					case 56: return 19;
					case 57: return 21;
					case 58: return 66;
					case 59: return 5;
					case 60:
						yy_.yytext = yy_.yytext.trim();
						return 73;
					case 61: return 80;
					case 62: return 97;
					case 63: return 98;
					case 64: return 99;
					case 65: return 78;
					case 66: return 79;
					case 67: return 100;
					case 68: return 101;
					case 69: return 102;
					case 70: return 103;
					case 71: return 85;
					case 72: return 86;
					case 73: return 87;
					case 74: return 88;
					case 75: return 93;
					case 76: return 94;
					case 77: return 95;
					case 78: return 96;
					case 79: return 81;
					case 80: return 82;
					case 81: return 83;
					case 82: return 84;
					case 83: return 89;
					case 84: return 90;
					case 85: return 91;
					case 86: return 92;
					case 87: return 104;
					case 88: return 104;
					case 89: return 70;
					case 90: return 71;
					case 91: return 72;
					case 92: return 5;
					case 93: return 10;
				}
			},
			rules: [
				/^(?:[\n]+)/i,
				/^(?:\s+)/i,
				/^(?:((?!\n)\s)+)/i,
				/^(?:#[^\n]*)/i,
				/^(?:%(?!\{)[^\n]*)/i,
				/^(?:[^\}]%%[^\n]*)/i,
				/^(?:([0-9]+(\.[0-9]{1,2})?|\.[0-9]{1,2})(?=[ \n]+))/i,
				/^(?:@\{)/i,
				/^(?:[^\}]+)/i,
				/^(?:\}(?=\s+as\s))/i,
				/^(?:\})/i,
				/^(?:[^\<->\->:\n,;@\s]+(?=@\{))/i,
				/^(?:[^<>:\n,;@\s]+(?=\s+as\s))/i,
				/^(?:[^<>:\n,;@]+(?=\s*[\n;#]|$))/i,
				/^(?:[^<>:\n,;@]*<[^\n]*)/i,
				/^(?:[^\n]+)/i,
				/^(?:box\b)/i,
				/^(?:participant\b)/i,
				/^(?:actor\b)/i,
				/^(?:create\b)/i,
				/^(?:destroy\b)/i,
				/^(?:as\b)/i,
				/^(?:(?:))/i,
				/^(?:loop\b)/i,
				/^(?:rect\b)/i,
				/^(?:opt\b)/i,
				/^(?:alt\b)/i,
				/^(?:else\b)/i,
				/^(?:par\b)/i,
				/^(?:par_over\b)/i,
				/^(?:and\b)/i,
				/^(?:critical\b)/i,
				/^(?:option\b)/i,
				/^(?:break\b)/i,
				/^(?:(?:[:]?(?:no)?wrap)?[^#\n;]*)/i,
				/^(?:end\b)/i,
				/^(?:left of\b)/i,
				/^(?:right of\b)/i,
				/^(?:links\b)/i,
				/^(?:link\b)/i,
				/^(?:properties\b)/i,
				/^(?:details\b)/i,
				/^(?:over\b)/i,
				/^(?:note\b)/i,
				/^(?:activate\b)/i,
				/^(?:deactivate\b)/i,
				/^(?:title\s[^#\n;]+)/i,
				/^(?:title:\s[^#\n;]+)/i,
				/^(?:accTitle\s*:\s*)/i,
				/^(?:(?!\n||)*[^\n]*)/i,
				/^(?:accDescr\s*:\s*)/i,
				/^(?:(?!\n||)*[^\n]*)/i,
				/^(?:accDescr\s*\{\s*)/i,
				/^(?:[\}])/i,
				/^(?:[^\}]*)/i,
				/^(?:sequenceDiagram\b)/i,
				/^(?:autonumber\b)/i,
				/^(?:off\b)/i,
				/^(?:,)/i,
				/^(?:;)/i,
				/^(?:[^\/\\\+\()\+<\->\->:\n,;]+((?!(-x|--x|-\)|--\)|-\|\\|-\\|-\/|-\/\/|-\|\/|\/\|-|\\\|-|\/\/-|\\\\-|\/\|-|--\|\\|--|\(\)))[\-]*[^\+<\->\->:\n,;]+)*)/i,
				/^(?:->>)/i,
				/^(?:<<->>)/i,
				/^(?:-->>)/i,
				/^(?:<<-->>)/i,
				/^(?:->)/i,
				/^(?:-->)/i,
				/^(?:-[x])/i,
				/^(?:--[x])/i,
				/^(?:-[\)])/i,
				/^(?:--[\)])/i,
				/^(?:--\|\\)/i,
				/^(?:--\|\/)/i,
				/^(?:--\\\\)/i,
				/^(?:--\/\/)/i,
				/^(?:\/\|--)/i,
				/^(?:\\\|--)/i,
				/^(?:\/\/--)/i,
				/^(?:\\\\--)/i,
				/^(?:-\|\\)/i,
				/^(?:-\|\/)/i,
				/^(?:-\\\\)/i,
				/^(?:-\/\/)/i,
				/^(?:\/\|-)/i,
				/^(?:\\\|-)/i,
				/^(?:\/\/-)/i,
				/^(?:\\\\-)/i,
				/^(?::(?:(?:no)?wrap)?[^#\n;]*)/i,
				/^(?::)/i,
				/^(?:\+)/i,
				/^(?:-)/i,
				/^(?:\(\))/i,
				/^(?:$)/i,
				/^(?:.)/i
			],
			conditions: {
				"acc_descr_multiline": {
					"rules": [53, 54],
					"inclusive": false
				},
				"acc_descr": {
					"rules": [51],
					"inclusive": false
				},
				"acc_title": {
					"rules": [49],
					"inclusive": false
				},
				"ID": {
					"rules": [
						2,
						3,
						7,
						11,
						12,
						13,
						14,
						15
					],
					"inclusive": false
				},
				"ALIAS": {
					"rules": [
						2,
						3,
						21,
						22
					],
					"inclusive": false
				},
				"LINE": {
					"rules": [
						2,
						3,
						34
					],
					"inclusive": false
				},
				"CONFIG": {
					"rules": [
						8,
						9,
						10
					],
					"inclusive": false
				},
				"CONFIG_DATA": {
					"rules": [],
					"inclusive": false
				},
				"INITIAL": {
					"rules": [
						0,
						1,
						3,
						4,
						5,
						6,
						16,
						17,
						18,
						19,
						20,
						23,
						24,
						25,
						26,
						27,
						28,
						29,
						30,
						31,
						32,
						33,
						35,
						36,
						37,
						38,
						39,
						40,
						41,
						42,
						43,
						44,
						45,
						46,
						47,
						48,
						50,
						52,
						55,
						56,
						57,
						58,
						59,
						60,
						61,
						62,
						63,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						83,
						84,
						85,
						86,
						87,
						88,
						89,
						90,
						91,
						92,
						93
					],
					"inclusive": true
				}
			}
		};
	})();
	function Parser() {
		this.yy = {};
	}
	Parser.prototype = parser;
	parser.Parser = Parser;
	return new Parser();
})();
const parser$2 = sequence;
sequence.Parser;
//#endregion
//#region src/serializer/parser/jison/class-parser.js
var classParser = (function() {
	var o = function(k, v, o, l) {
		for (o = o || {}, l = k.length; l--; o[k[l]] = v);
		return o;
	}, $V0 = [1, 18], $V1 = [1, 19], $V2 = [1, 20], $V3 = [1, 41], $V4 = [1, 26], $V5 = [1, 42], $V6 = [1, 24], $V7 = [1, 25], $V8 = [1, 32], $V9 = [1, 33], $Va = [1, 34], $Vb = [1, 45], $Vc = [1, 35], $Vd = [1, 36], $Ve = [1, 37], $Vf = [1, 38], $Vg = [1, 27], $Vh = [1, 28], $Vi = [1, 29], $Vj = [1, 30], $Vk = [1, 31], $Vl = [1, 44], $Vm = [1, 46], $Vn = [1, 43], $Vo = [1, 47], $Vp = [1, 9], $Vq = [
		1,
		8,
		9
	], $Vr = [1, 58], $Vs = [1, 59], $Vt = [1, 60], $Vu = [1, 61], $Vv = [1, 62], $Vw = [1, 63], $Vx = [1, 64], $Vy = [
		1,
		8,
		9,
		41
	], $Vz = [1, 77], $VA = [
		1,
		8,
		9,
		12,
		13,
		22,
		39,
		41,
		44,
		46,
		68,
		69,
		70,
		71,
		72,
		73,
		74,
		79,
		81
	], $VB = [
		1,
		8,
		9,
		12,
		13,
		18,
		20,
		22,
		39,
		41,
		44,
		46,
		47,
		60,
		68,
		69,
		70,
		71,
		72,
		73,
		74,
		79,
		81,
		86,
		100,
		102,
		103
	], $VC = [
		13,
		60,
		86,
		100,
		102,
		103
	], $VD = [
		13,
		60,
		73,
		74,
		86,
		100,
		102,
		103
	], $VE = [
		13,
		60,
		68,
		69,
		70,
		71,
		72,
		86,
		100,
		102,
		103
	], $VF = [1, 103], $VG = [1, 121], $VH = [1, 117], $VI = [1, 113], $VJ = [1, 119], $VK = [1, 114], $VL = [1, 115], $VM = [1, 116], $VN = [1, 118], $VO = [1, 120], $VP = [
		22,
		50,
		60,
		61,
		82,
		86,
		87,
		88,
		89,
		90
	], $VQ = [1, 128], $VR = [12, 39], $VS = [
		1,
		8,
		9,
		39,
		41,
		44,
		46
	], $VT = [
		1,
		8,
		9,
		22
	], $VU = [1, 153], $VV = [
		1,
		8,
		9,
		61
	], $VW = [
		1,
		8,
		9,
		22,
		50,
		60,
		61,
		82,
		86,
		87,
		88,
		89,
		90
	];
	var parser = {
		trace: function trace() {},
		yy: {},
		symbols_: {
			"error": 2,
			"start": 3,
			"mermaidDoc": 4,
			"statements": 5,
			"graphConfig": 6,
			"CLASS_DIAGRAM": 7,
			"NEWLINE": 8,
			"EOF": 9,
			"statement": 10,
			"classLabel": 11,
			"SQS": 12,
			"STR": 13,
			"SQE": 14,
			"namespaceName": 15,
			"alphaNumToken": 16,
			"classLiteralName": 17,
			"DOT": 18,
			"className": 19,
			"GENERICTYPE": 20,
			"relationStatement": 21,
			"LABEL": 22,
			"namespaceStatement": 23,
			"classStatement": 24,
			"memberStatement": 25,
			"annotationStatement": 26,
			"clickStatement": 27,
			"styleStatement": 28,
			"cssClassStatement": 29,
			"noteStatement": 30,
			"classDefStatement": 31,
			"direction": 32,
			"acc_title": 33,
			"acc_title_value": 34,
			"acc_descr": 35,
			"acc_descr_value": 36,
			"acc_descr_multiline_value": 37,
			"namespaceIdentifier": 38,
			"STRUCT_START": 39,
			"classStatements": 40,
			"STRUCT_STOP": 41,
			"NAMESPACE": 42,
			"classIdentifier": 43,
			"STYLE_SEPARATOR": 44,
			"members": 45,
			"ANNOTATION_START": 46,
			"ANNOTATION_END": 47,
			"CLASS": 48,
			"emptyBody": 49,
			"SPACE": 50,
			"MEMBER": 51,
			"SEPARATOR": 52,
			"relation": 53,
			"NOTE_FOR": 54,
			"noteText": 55,
			"NOTE": 56,
			"CLASSDEF": 57,
			"classList": 58,
			"stylesOpt": 59,
			"ALPHA": 60,
			"COMMA": 61,
			"direction_tb": 62,
			"direction_bt": 63,
			"direction_rl": 64,
			"direction_lr": 65,
			"relationType": 66,
			"lineType": 67,
			"AGGREGATION": 68,
			"EXTENSION": 69,
			"COMPOSITION": 70,
			"DEPENDENCY": 71,
			"LOLLIPOP": 72,
			"LINE": 73,
			"DOTTED_LINE": 74,
			"CALLBACK": 75,
			"LINK": 76,
			"LINK_TARGET": 77,
			"CLICK": 78,
			"CALLBACK_NAME": 79,
			"CALLBACK_ARGS": 80,
			"HREF": 81,
			"STYLE": 82,
			"CSSCLASS": 83,
			"style": 84,
			"styleComponent": 85,
			"NUM": 86,
			"COLON": 87,
			"UNIT": 88,
			"BRKT": 89,
			"PCT": 90,
			"commentToken": 91,
			"textToken": 92,
			"graphCodeTokens": 93,
			"textNoTagsToken": 94,
			"TAGSTART": 95,
			"TAGEND": 96,
			"==": 97,
			"--": 98,
			"DEFAULT": 99,
			"MINUS": 100,
			"keywords": 101,
			"UNICODE_TEXT": 102,
			"BQUOTE_STR": 103,
			"$accept": 0,
			"$end": 1
		},
		terminals_: {
			2: "error",
			7: "CLASS_DIAGRAM",
			8: "NEWLINE",
			9: "EOF",
			12: "SQS",
			13: "STR",
			14: "SQE",
			18: "DOT",
			20: "GENERICTYPE",
			22: "LABEL",
			33: "acc_title",
			34: "acc_title_value",
			35: "acc_descr",
			36: "acc_descr_value",
			37: "acc_descr_multiline_value",
			39: "STRUCT_START",
			41: "STRUCT_STOP",
			42: "NAMESPACE",
			44: "STYLE_SEPARATOR",
			46: "ANNOTATION_START",
			47: "ANNOTATION_END",
			48: "CLASS",
			50: "SPACE",
			51: "MEMBER",
			52: "SEPARATOR",
			54: "NOTE_FOR",
			56: "NOTE",
			57: "CLASSDEF",
			60: "ALPHA",
			61: "COMMA",
			62: "direction_tb",
			63: "direction_bt",
			64: "direction_rl",
			65: "direction_lr",
			68: "AGGREGATION",
			69: "EXTENSION",
			70: "COMPOSITION",
			71: "DEPENDENCY",
			72: "LOLLIPOP",
			73: "LINE",
			74: "DOTTED_LINE",
			75: "CALLBACK",
			76: "LINK",
			77: "LINK_TARGET",
			78: "CLICK",
			79: "CALLBACK_NAME",
			80: "CALLBACK_ARGS",
			81: "HREF",
			82: "STYLE",
			83: "CSSCLASS",
			86: "NUM",
			87: "COLON",
			88: "UNIT",
			89: "BRKT",
			90: "PCT",
			93: "graphCodeTokens",
			95: "TAGSTART",
			96: "TAGEND",
			97: "==",
			98: "--",
			99: "DEFAULT",
			100: "MINUS",
			101: "keywords",
			102: "UNICODE_TEXT",
			103: "BQUOTE_STR"
		},
		productions_: [
			0,
			[3, 1],
			[3, 1],
			[4, 1],
			[6, 4],
			[5, 1],
			[5, 2],
			[5, 3],
			[11, 3],
			[15, 1],
			[15, 1],
			[15, 3],
			[15, 2],
			[19, 1],
			[19, 3],
			[19, 1],
			[19, 2],
			[19, 2],
			[19, 2],
			[10, 1],
			[10, 2],
			[10, 1],
			[10, 1],
			[10, 1],
			[10, 1],
			[10, 1],
			[10, 1],
			[10, 1],
			[10, 1],
			[10, 1],
			[10, 1],
			[10, 2],
			[10, 2],
			[10, 1],
			[23, 4],
			[23, 5],
			[38, 2],
			[38, 3],
			[40, 1],
			[40, 2],
			[40, 3],
			[40, 1],
			[40, 2],
			[40, 3],
			[40, 1],
			[40, 2],
			[40, 3],
			[24, 1],
			[24, 3],
			[24, 4],
			[24, 3],
			[24, 6],
			[24, 4],
			[24, 7],
			[24, 6],
			[43, 2],
			[43, 3],
			[49, 0],
			[49, 2],
			[49, 2],
			[26, 4],
			[45, 1],
			[45, 2],
			[25, 1],
			[25, 2],
			[25, 1],
			[25, 1],
			[21, 3],
			[21, 4],
			[21, 4],
			[21, 5],
			[30, 3],
			[30, 2],
			[31, 3],
			[58, 1],
			[58, 3],
			[32, 1],
			[32, 1],
			[32, 1],
			[32, 1],
			[53, 3],
			[53, 2],
			[53, 2],
			[53, 1],
			[66, 1],
			[66, 1],
			[66, 1],
			[66, 1],
			[66, 1],
			[67, 1],
			[67, 1],
			[27, 3],
			[27, 4],
			[27, 3],
			[27, 4],
			[27, 4],
			[27, 5],
			[27, 3],
			[27, 4],
			[27, 4],
			[27, 5],
			[27, 4],
			[27, 5],
			[27, 5],
			[27, 6],
			[28, 3],
			[29, 3],
			[59, 1],
			[59, 3],
			[84, 1],
			[84, 2],
			[85, 1],
			[85, 1],
			[85, 1],
			[85, 1],
			[85, 1],
			[85, 1],
			[85, 1],
			[85, 1],
			[85, 1],
			[91, 1],
			[91, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[92, 1],
			[94, 1],
			[94, 1],
			[94, 1],
			[94, 1],
			[16, 1],
			[16, 1],
			[16, 1],
			[16, 1],
			[17, 1],
			[55, 1]
		],
		performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$) {
			var $0 = $$.length - 1;
			switch (yystate) {
				case 8:
					this.$ = $$[$0 - 1];
					break;
				case 9:
				case 10:
				case 13:
				case 15:
					this.$ = $$[$0];
					break;
				case 11:
				case 14:
					this.$ = $$[$0 - 2] + "." + $$[$0];
					break;
				case 12:
				case 16:
					this.$ = $$[$0 - 1] + $$[$0];
					break;
				case 17:
				case 18:
					this.$ = $$[$0 - 1] + "~" + $$[$0] + "~";
					break;
				case 19:
					yy.addRelation($$[$0]);
					break;
				case 20:
					$$[$0 - 1].title = yy.cleanupLabel($$[$0]);
					yy.addRelation($$[$0 - 1]);
					break;
				case 31:
					this.$ = $$[$0].trim();
					yy.setAccTitle(this.$);
					break;
				case 32:
				case 33:
					this.$ = $$[$0].trim();
					yy.setAccDescription(this.$);
					break;
				case 34:
					yy.addClassesToNamespace($$[$0 - 3], $$[$0 - 1][0], $$[$0 - 1][1]);
					yy.popNamespace();
					break;
				case 35:
					yy.addClassesToNamespace($$[$0 - 4], $$[$0 - 1][0], $$[$0 - 1][1]);
					yy.popNamespace();
					break;
				case 36:
					this.$ = yy.addNamespace($$[$0]);
					break;
				case 37:
					this.$ = yy.addNamespace($$[$0 - 1], $$[$0]);
					break;
				case 38:
					this.$ = [[$$[$0]], []];
					break;
				case 39:
					this.$ = [[$$[$0 - 1]], []];
					break;
				case 40:
					$$[$0][0].unshift($$[$0 - 2]);
					this.$ = $$[$0];
					break;
				case 41:
					this.$ = [[], [$$[$0]]];
					break;
				case 42:
					this.$ = [[], [$$[$0 - 1]]];
					break;
				case 43:
					$$[$0][1].unshift($$[$0 - 2]);
					this.$ = $$[$0];
					break;
				case 44:
				case 45:
					this.$ = [[], []];
					break;
				case 46:
					this.$ = $$[$0];
					break;
				case 48:
					yy.setCssClass($$[$0 - 2], $$[$0]);
					break;
				case 49:
					yy.addMembers($$[$0 - 3], $$[$0 - 1]);
					break;
				case 51:
					yy.setCssClass($$[$0 - 5], $$[$0 - 3]);
					yy.addMembers($$[$0 - 5], $$[$0 - 1]);
					break;
				case 52:
					yy.addAnnotation($$[$0 - 3], $$[$0 - 1]);
					break;
				case 53:
					yy.addAnnotation($$[$0 - 6], $$[$0 - 4]);
					yy.addMembers($$[$0 - 6], $$[$0 - 1]);
					break;
				case 54:
					yy.addAnnotation($$[$0 - 5], $$[$0 - 3]);
					break;
				case 55:
					this.$ = $$[$0];
					yy.addClass($$[$0]);
					break;
				case 56:
					this.$ = $$[$0 - 1];
					yy.addClass($$[$0 - 1]);
					yy.setClassLabel($$[$0 - 1], $$[$0]);
					break;
				case 60:
					yy.addAnnotation($$[$0], $$[$0 - 2]);
					break;
				case 61:
				case 74:
					this.$ = [$$[$0]];
					break;
				case 62:
					$$[$0].push($$[$0 - 1]);
					this.$ = $$[$0];
					break;
				case 63: break;
				case 64:
					yy.addMember($$[$0 - 1], yy.cleanupLabel($$[$0]));
					break;
				case 65: break;
				case 66: break;
				case 67:
					this.$ = {
						"id1": $$[$0 - 2],
						"id2": $$[$0],
						relation: $$[$0 - 1],
						relationTitle1: "none",
						relationTitle2: "none"
					};
					break;
				case 68:
					this.$ = {
						id1: $$[$0 - 3],
						id2: $$[$0],
						relation: $$[$0 - 1],
						relationTitle1: $$[$0 - 2],
						relationTitle2: "none"
					};
					break;
				case 69:
					this.$ = {
						id1: $$[$0 - 3],
						id2: $$[$0],
						relation: $$[$0 - 2],
						relationTitle1: "none",
						relationTitle2: $$[$0 - 1]
					};
					break;
				case 70:
					this.$ = {
						id1: $$[$0 - 4],
						id2: $$[$0],
						relation: $$[$0 - 2],
						relationTitle1: $$[$0 - 3],
						relationTitle2: $$[$0 - 1]
					};
					break;
				case 71:
					this.$ = yy.addNote($$[$0], $$[$0 - 1]);
					break;
				case 72:
					this.$ = yy.addNote($$[$0]);
					break;
				case 73:
					this.$ = $$[$0 - 2];
					yy.defineClass($$[$0 - 1], $$[$0]);
					break;
				case 75:
					this.$ = $$[$0 - 2].concat([$$[$0]]);
					break;
				case 76:
					yy.setDirection("TB");
					break;
				case 77:
					yy.setDirection("BT");
					break;
				case 78:
					yy.setDirection("RL");
					break;
				case 79:
					yy.setDirection("LR");
					break;
				case 80:
					this.$ = {
						type1: $$[$0 - 2],
						type2: $$[$0],
						lineType: $$[$0 - 1]
					};
					break;
				case 81:
					this.$ = {
						type1: "none",
						type2: $$[$0],
						lineType: $$[$0 - 1]
					};
					break;
				case 82:
					this.$ = {
						type1: $$[$0 - 1],
						type2: "none",
						lineType: $$[$0]
					};
					break;
				case 83:
					this.$ = {
						type1: "none",
						type2: "none",
						lineType: $$[$0]
					};
					break;
				case 84:
					this.$ = yy.relationType.AGGREGATION;
					break;
				case 85:
					this.$ = yy.relationType.EXTENSION;
					break;
				case 86:
					this.$ = yy.relationType.COMPOSITION;
					break;
				case 87:
					this.$ = yy.relationType.DEPENDENCY;
					break;
				case 88:
					this.$ = yy.relationType.LOLLIPOP;
					break;
				case 89:
					this.$ = yy.lineType.LINE;
					break;
				case 90:
					this.$ = yy.lineType.DOTTED_LINE;
					break;
				case 91:
				case 97:
					this.$ = $$[$0 - 2];
					yy.setClickEvent($$[$0 - 1], $$[$0]);
					break;
				case 92:
				case 98:
					this.$ = $$[$0 - 3];
					yy.setClickEvent($$[$0 - 2], $$[$0 - 1]);
					yy.setTooltip($$[$0 - 2], $$[$0]);
					break;
				case 93:
					this.$ = $$[$0 - 2];
					yy.setLink($$[$0 - 1], $$[$0]);
					break;
				case 94:
					this.$ = $$[$0 - 3];
					yy.setLink($$[$0 - 2], $$[$0 - 1], $$[$0]);
					break;
				case 95:
					this.$ = $$[$0 - 3];
					yy.setLink($$[$0 - 2], $$[$0 - 1]);
					yy.setTooltip($$[$0 - 2], $$[$0]);
					break;
				case 96:
					this.$ = $$[$0 - 4];
					yy.setLink($$[$0 - 3], $$[$0 - 2], $$[$0]);
					yy.setTooltip($$[$0 - 3], $$[$0 - 1]);
					break;
				case 99:
					this.$ = $$[$0 - 3];
					yy.setClickEvent($$[$0 - 2], $$[$0 - 1], $$[$0]);
					break;
				case 100:
					this.$ = $$[$0 - 4];
					yy.setClickEvent($$[$0 - 3], $$[$0 - 2], $$[$0 - 1]);
					yy.setTooltip($$[$0 - 3], $$[$0]);
					break;
				case 101:
					this.$ = $$[$0 - 3];
					yy.setLink($$[$0 - 2], $$[$0]);
					break;
				case 102:
					this.$ = $$[$0 - 4];
					yy.setLink($$[$0 - 3], $$[$0 - 1], $$[$0]);
					break;
				case 103:
					this.$ = $$[$0 - 4];
					yy.setLink($$[$0 - 3], $$[$0 - 1]);
					yy.setTooltip($$[$0 - 3], $$[$0]);
					break;
				case 104:
					this.$ = $$[$0 - 5];
					yy.setLink($$[$0 - 4], $$[$0 - 2], $$[$0]);
					yy.setTooltip($$[$0 - 4], $$[$0 - 1]);
					break;
				case 105:
					this.$ = $$[$0 - 2];
					yy.setCssStyle($$[$0 - 1], $$[$0]);
					break;
				case 106:
					yy.setCssClass($$[$0 - 1], $$[$0]);
					break;
				case 107:
					this.$ = [$$[$0]];
					break;
				case 108:
					$$[$0 - 2].push($$[$0]);
					this.$ = $$[$0 - 2];
					break;
				case 110: this.$ = $$[$0 - 1] + $$[$0];
			}
		},
		table: [
			{
				3: 1,
				4: 2,
				5: 3,
				6: 4,
				7: [1, 6],
				10: 5,
				16: 39,
				17: 40,
				19: 21,
				21: 7,
				23: 8,
				24: 9,
				25: 10,
				26: 11,
				27: 12,
				28: 13,
				29: 14,
				30: 15,
				31: 16,
				32: 17,
				33: $V0,
				35: $V1,
				37: $V2,
				38: 22,
				42: $V3,
				43: 23,
				46: $V4,
				48: $V5,
				51: $V6,
				52: $V7,
				54: $V8,
				56: $V9,
				57: $Va,
				60: $Vb,
				62: $Vc,
				63: $Vd,
				64: $Ve,
				65: $Vf,
				75: $Vg,
				76: $Vh,
				78: $Vi,
				82: $Vj,
				83: $Vk,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			{ 1: [3] },
			{ 1: [2, 1] },
			{ 1: [2, 2] },
			{ 1: [2, 3] },
			o($Vp, [2, 5], { 8: [1, 48] }),
			{ 8: [1, 49] },
			o($Vq, [2, 19], { 22: [1, 50] }),
			o($Vq, [2, 21]),
			o($Vq, [2, 22]),
			o($Vq, [2, 23]),
			o($Vq, [2, 24]),
			o($Vq, [2, 25]),
			o($Vq, [2, 26]),
			o($Vq, [2, 27]),
			o($Vq, [2, 28]),
			o($Vq, [2, 29]),
			o($Vq, [2, 30]),
			{ 34: [1, 51] },
			{ 36: [1, 52] },
			o($Vq, [2, 33]),
			o($Vq, [2, 63], {
				53: 53,
				66: 56,
				67: 57,
				13: [1, 54],
				22: [1, 55],
				68: $Vr,
				69: $Vs,
				70: $Vt,
				71: $Vu,
				72: $Vv,
				73: $Vw,
				74: $Vx
			}),
			{ 39: [1, 65] },
			o($Vy, [2, 47], {
				39: [1, 67],
				44: [1, 66],
				46: [1, 68]
			}),
			o($Vq, [2, 65]),
			o($Vq, [2, 66]),
			{
				16: 69,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn
			},
			{
				16: 39,
				17: 40,
				19: 70,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			{
				16: 39,
				17: 40,
				19: 71,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			{
				16: 39,
				17: 40,
				19: 72,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			{ 60: [1, 73] },
			{ 13: [1, 74] },
			{
				16: 39,
				17: 40,
				19: 75,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			{
				13: $Vz,
				55: 76
			},
			{
				58: 78,
				60: [1, 79]
			},
			o($Vq, [2, 76]),
			o($Vq, [2, 77]),
			o($Vq, [2, 78]),
			o($Vq, [2, 79]),
			o($VA, [2, 13], {
				16: 39,
				17: 40,
				19: 81,
				18: [1, 80],
				20: [1, 82],
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			}),
			o($VA, [2, 15], { 20: [1, 83] }),
			{
				15: 84,
				16: 85,
				17: 86,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			{
				16: 39,
				17: 40,
				19: 87,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			o($VB, [2, 133]),
			o($VB, [2, 134]),
			o($VB, [2, 135]),
			o($VB, [2, 136]),
			o([
				1,
				8,
				9,
				12,
				13,
				20,
				22,
				39,
				41,
				44,
				46,
				68,
				69,
				70,
				71,
				72,
				73,
				74,
				79,
				81
			], [2, 137]),
			o($Vp, [2, 6], {
				10: 5,
				21: 7,
				23: 8,
				24: 9,
				25: 10,
				26: 11,
				27: 12,
				28: 13,
				29: 14,
				30: 15,
				31: 16,
				32: 17,
				19: 21,
				38: 22,
				43: 23,
				16: 39,
				17: 40,
				5: 88,
				33: $V0,
				35: $V1,
				37: $V2,
				42: $V3,
				46: $V4,
				48: $V5,
				51: $V6,
				52: $V7,
				54: $V8,
				56: $V9,
				57: $Va,
				60: $Vb,
				62: $Vc,
				63: $Vd,
				64: $Ve,
				65: $Vf,
				75: $Vg,
				76: $Vh,
				78: $Vi,
				82: $Vj,
				83: $Vk,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			}),
			{
				5: 89,
				10: 5,
				16: 39,
				17: 40,
				19: 21,
				21: 7,
				23: 8,
				24: 9,
				25: 10,
				26: 11,
				27: 12,
				28: 13,
				29: 14,
				30: 15,
				31: 16,
				32: 17,
				33: $V0,
				35: $V1,
				37: $V2,
				38: 22,
				42: $V3,
				43: 23,
				46: $V4,
				48: $V5,
				51: $V6,
				52: $V7,
				54: $V8,
				56: $V9,
				57: $Va,
				60: $Vb,
				62: $Vc,
				63: $Vd,
				64: $Ve,
				65: $Vf,
				75: $Vg,
				76: $Vh,
				78: $Vi,
				82: $Vj,
				83: $Vk,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			o($Vq, [2, 20]),
			o($Vq, [2, 31]),
			o($Vq, [2, 32]),
			{
				13: [1, 91],
				16: 39,
				17: 40,
				19: 90,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			{
				53: 92,
				66: 56,
				67: 57,
				68: $Vr,
				69: $Vs,
				70: $Vt,
				71: $Vu,
				72: $Vv,
				73: $Vw,
				74: $Vx
			},
			o($Vq, [2, 64]),
			{
				67: 93,
				73: $Vw,
				74: $Vx
			},
			o($VC, [2, 83], {
				66: 94,
				68: $Vr,
				69: $Vs,
				70: $Vt,
				71: $Vu,
				72: $Vv
			}),
			o($VD, [2, 84]),
			o($VD, [2, 85]),
			o($VD, [2, 86]),
			o($VD, [2, 87]),
			o($VD, [2, 88]),
			o($VE, [2, 89]),
			o($VE, [2, 90]),
			{
				8: [1, 96],
				23: 99,
				24: 97,
				30: 98,
				38: 22,
				40: 95,
				42: $V3,
				43: 23,
				48: $V5,
				54: $V8,
				56: $V9
			},
			{
				16: 100,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn
			},
			{
				41: [1, 102],
				45: 101,
				51: $VF
			},
			{
				16: 104,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn
			},
			{ 47: [1, 105] },
			{ 13: [1, 106] },
			{ 13: [1, 107] },
			{
				79: [1, 108],
				81: [1, 109]
			},
			{
				22: $VG,
				50: $VH,
				59: 110,
				60: $VI,
				82: $VJ,
				84: 111,
				85: 112,
				86: $VK,
				87: $VL,
				88: $VM,
				89: $VN,
				90: $VO
			},
			{ 60: [1, 122] },
			{
				13: $Vz,
				55: 123
			},
			o($Vy, [2, 72]),
			o($Vy, [2, 138]),
			{
				22: $VG,
				50: $VH,
				59: 124,
				60: $VI,
				61: [1, 125],
				82: $VJ,
				84: 111,
				85: 112,
				86: $VK,
				87: $VL,
				88: $VM,
				89: $VN,
				90: $VO
			},
			o($VP, [2, 74]),
			{
				16: 39,
				17: 40,
				19: 126,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			o($VA, [2, 16]),
			o($VA, [2, 17]),
			o($VA, [2, 18]),
			{
				11: 127,
				12: $VQ,
				39: [2, 36]
			},
			o($VR, [2, 9], {
				16: 85,
				17: 86,
				15: 130,
				18: [1, 129],
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			}),
			o($VR, [2, 10]),
			o($VS, [2, 55], {
				11: 131,
				12: $VQ
			}),
			o($Vp, [2, 7]),
			{ 9: [1, 132] },
			o($VT, [2, 67]),
			{
				16: 39,
				17: 40,
				19: 133,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			{
				13: [1, 135],
				16: 39,
				17: 40,
				19: 134,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			o($VC, [2, 82], {
				66: 136,
				68: $Vr,
				69: $Vs,
				70: $Vt,
				71: $Vu,
				72: $Vv
			}),
			o($VC, [2, 81]),
			{ 41: [1, 137] },
			{
				23: 99,
				24: 97,
				30: 98,
				38: 22,
				40: 138,
				42: $V3,
				43: 23,
				48: $V5,
				54: $V8,
				56: $V9
			},
			{
				8: [1, 139],
				41: [2, 38]
			},
			{
				8: [1, 140],
				41: [2, 41]
			},
			{
				8: [1, 141],
				41: [2, 44]
			},
			o($Vy, [2, 48], { 39: [1, 142] }),
			{ 41: [1, 143] },
			o($Vy, [2, 50]),
			{
				41: [2, 61],
				45: 144,
				51: $VF
			},
			{ 47: [1, 145] },
			{
				16: 39,
				17: 40,
				19: 146,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			o($Vq, [2, 91], { 13: [1, 147] }),
			o($Vq, [2, 93], {
				13: [1, 149],
				77: [1, 148]
			}),
			o($Vq, [2, 97], {
				13: [1, 150],
				80: [1, 151]
			}),
			{ 13: [1, 152] },
			o($Vq, [2, 105], { 61: $VU }),
			o($VV, [2, 107], {
				85: 154,
				22: $VG,
				50: $VH,
				60: $VI,
				82: $VJ,
				86: $VK,
				87: $VL,
				88: $VM,
				89: $VN,
				90: $VO
			}),
			o($VW, [2, 109]),
			o($VW, [2, 111]),
			o($VW, [2, 112]),
			o($VW, [2, 113]),
			o($VW, [2, 114]),
			o($VW, [2, 115]),
			o($VW, [2, 116]),
			o($VW, [2, 117]),
			o($VW, [2, 118]),
			o($VW, [2, 119]),
			o($Vq, [2, 106]),
			o($Vy, [2, 71]),
			o($Vq, [2, 73], { 61: $VU }),
			{ 60: [1, 155] },
			o($VA, [2, 14]),
			{ 39: [2, 37] },
			{ 13: [1, 156] },
			{
				15: 157,
				16: 85,
				17: 86,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			o($VR, [2, 12]),
			o($VS, [2, 56]),
			{ 1: [2, 4] },
			o($VT, [2, 69]),
			o($VT, [2, 68]),
			{
				16: 39,
				17: 40,
				19: 158,
				60: $Vb,
				86: $Vl,
				100: $Vm,
				102: $Vn,
				103: $Vo
			},
			o($VC, [2, 80]),
			o($Vy, [2, 34]),
			{ 41: [1, 159] },
			{
				23: 99,
				24: 97,
				30: 98,
				38: 22,
				40: 160,
				41: [2, 39],
				42: $V3,
				43: 23,
				48: $V5,
				54: $V8,
				56: $V9
			},
			{
				23: 99,
				24: 97,
				30: 98,
				38: 22,
				40: 161,
				41: [2, 42],
				42: $V3,
				43: 23,
				48: $V5,
				54: $V8,
				56: $V9
			},
			{
				23: 99,
				24: 97,
				30: 98,
				38: 22,
				40: 162,
				41: [2, 45],
				42: $V3,
				43: 23,
				48: $V5,
				54: $V8,
				56: $V9
			},
			{
				45: 163,
				51: $VF
			},
			o($Vy, [2, 49]),
			{ 41: [2, 62] },
			o($Vy, [2, 52], { 39: [1, 164] }),
			o($Vq, [2, 60]),
			o($Vq, [2, 92]),
			o($Vq, [2, 94]),
			o($Vq, [2, 95], { 77: [1, 165] }),
			o($Vq, [2, 98]),
			o($Vq, [2, 99], { 13: [1, 166] }),
			o($Vq, [2, 101], {
				13: [1, 168],
				77: [1, 167]
			}),
			{
				22: $VG,
				50: $VH,
				60: $VI,
				82: $VJ,
				84: 169,
				85: 112,
				86: $VK,
				87: $VL,
				88: $VM,
				89: $VN,
				90: $VO
			},
			o($VW, [2, 110]),
			o($VP, [2, 75]),
			{ 14: [1, 170] },
			o($VR, [2, 11]),
			o($VT, [2, 70]),
			o($Vy, [2, 35]),
			{ 41: [2, 40] },
			{ 41: [2, 43] },
			{ 41: [2, 46] },
			{ 41: [1, 171] },
			{
				41: [1, 173],
				45: 172,
				51: $VF
			},
			o($Vq, [2, 96]),
			o($Vq, [2, 100]),
			o($Vq, [2, 102]),
			o($Vq, [2, 103], { 77: [1, 174] }),
			o($VV, [2, 108], {
				85: 154,
				22: $VG,
				50: $VH,
				60: $VI,
				82: $VJ,
				86: $VK,
				87: $VL,
				88: $VM,
				89: $VN,
				90: $VO
			}),
			o($VS, [2, 8]),
			o($Vy, [2, 51]),
			{ 41: [1, 175] },
			o($Vy, [2, 54]),
			o($Vq, [2, 104]),
			o($Vy, [2, 53])
		],
		defaultActions: {
			2: [2, 1],
			3: [2, 2],
			4: [2, 3],
			127: [2, 37],
			132: [2, 4],
			144: [2, 62],
			160: [2, 40],
			161: [2, 43],
			162: [2, 46]
		},
		parseError: function parseError(str, hash) {
			if (hash.recoverable) this.trace(str);
			else {
				var error = new Error(str);
				error.hash = hash;
				throw error;
			}
		},
		parse: function parse(input) {
			var self = this, stack = [0], vstack = [null], lstack = [], table = this.table, yytext = "", yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
			var args = lstack.slice.call(arguments, 1);
			var lexer = Object.create(this.lexer);
			var sharedState = { yy: {} };
			for (var k in this.yy) if (Object.prototype.hasOwnProperty.call(this.yy, k)) sharedState.yy[k] = this.yy[k];
			lexer.setInput(input, sharedState.yy);
			sharedState.yy.lexer = lexer;
			sharedState.yy.parser = this;
			if (typeof lexer.yylloc == "undefined") lexer.yylloc = {};
			var yyloc = lexer.yylloc;
			lstack.push(yyloc);
			var ranges = lexer.options && lexer.options.ranges;
			if (typeof sharedState.yy.parseError === "function") this.parseError = sharedState.yy.parseError;
			else this.parseError = Object.getPrototypeOf(this).parseError;
			_token_stack: var lex = function() {
				var token = lexer.lex() || EOF;
				if (typeof token !== "number") token = self.symbols_[token] || token;
				return token;
			};
			var symbol, preErrorSymbol, state, action, r, yyval = {}, p, len, newState, expected;
			while (true) {
				state = stack[stack.length - 1];
				if (this.defaultActions[state]) action = this.defaultActions[state];
				else {
					if (symbol === null || typeof symbol == "undefined") symbol = lex();
					action = table[state] && table[state][symbol];
				}
				if (typeof action === "undefined" || !action.length || !action[0]) {
					var errStr = "";
					expected = [];
					for (p in table[state]) if (this.terminals_[p] && p > TERROR) expected.push("'" + this.terminals_[p] + "'");
					if (lexer.showPosition) errStr = "Parse error on line " + (yylineno + 1) + ":\n" + lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + (this.terminals_[symbol] || symbol) + "'";
					else errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == EOF ? "end of input" : "'" + (this.terminals_[symbol] || symbol) + "'");
					this.parseError(errStr, {
						text: lexer.match,
						token: this.terminals_[symbol] || symbol,
						line: lexer.yylineno,
						loc: yyloc,
						expected
					});
				}
				if (action[0] instanceof Array && action.length > 1) throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
				switch (action[0]) {
					case 1:
						stack.push(symbol);
						vstack.push(lexer.yytext);
						lstack.push(lexer.yylloc);
						stack.push(action[1]);
						symbol = null;
						if (!preErrorSymbol) {
							yyleng = lexer.yyleng;
							yytext = lexer.yytext;
							yylineno = lexer.yylineno;
							yyloc = lexer.yylloc;
							if (recovering > 0) recovering--;
						} else {
							symbol = preErrorSymbol;
							preErrorSymbol = null;
						}
						break;
					case 2:
						len = this.productions_[action[1]][1];
						yyval.$ = vstack[vstack.length - len];
						yyval._$ = {
							first_line: lstack[lstack.length - (len || 1)].first_line,
							last_line: lstack[lstack.length - 1].last_line,
							first_column: lstack[lstack.length - (len || 1)].first_column,
							last_column: lstack[lstack.length - 1].last_column
						};
						if (ranges) yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]];
						r = this.performAction.apply(yyval, [
							yytext,
							yyleng,
							yylineno,
							sharedState.yy,
							action[1],
							vstack,
							lstack
						].concat(args));
						if (typeof r !== "undefined") return r;
						if (len) {
							stack = stack.slice(0, -1 * len * 2);
							vstack = vstack.slice(0, -1 * len);
							lstack = lstack.slice(0, -1 * len);
						}
						stack.push(this.productions_[action[1]][0]);
						vstack.push(yyval.$);
						lstack.push(yyval._$);
						newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
						stack.push(newState);
						break;
					case 3: return true;
				}
			}
			return true;
		}
	};
	parser.lexer = (function() {
		return {
			EOF: 1,
			parseError: function parseError(str, hash) {
				if (this.yy.parser) this.yy.parser.parseError(str, hash);
				else throw new Error(str);
			},
			setInput: function(input, yy) {
				this.yy = yy || this.yy || {};
				this._input = input;
				this._more = this._backtrack = this.done = false;
				this.yylineno = this.yyleng = 0;
				this.yytext = this.matched = this.match = "";
				this.conditionStack = ["INITIAL"];
				this.yylloc = {
					first_line: 1,
					first_column: 0,
					last_line: 1,
					last_column: 0
				};
				if (this.options.ranges) this.yylloc.range = [0, 0];
				this.offset = 0;
				return this;
			},
			input: function() {
				var ch = this._input[0];
				this.yytext += ch;
				this.yyleng++;
				this.offset++;
				this.match += ch;
				this.matched += ch;
				if (ch.match(/(?:\r\n?|\n).*/g)) {
					this.yylineno++;
					this.yylloc.last_line++;
				} else this.yylloc.last_column++;
				if (this.options.ranges) this.yylloc.range[1]++;
				this._input = this._input.slice(1);
				return ch;
			},
			unput: function(ch) {
				var len = ch.length;
				var lines = ch.split(/(?:\r\n?|\n)/g);
				this._input = ch + this._input;
				this.yytext = this.yytext.substr(0, this.yytext.length - len);
				this.offset -= len;
				var oldLines = this.match.split(/(?:\r\n?|\n)/g);
				this.match = this.match.substr(0, this.match.length - 1);
				this.matched = this.matched.substr(0, this.matched.length - 1);
				if (lines.length - 1) this.yylineno -= lines.length - 1;
				var r = this.yylloc.range;
				this.yylloc = {
					first_line: this.yylloc.first_line,
					last_line: this.yylineno + 1,
					first_column: this.yylloc.first_column,
					last_column: lines ? (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length : this.yylloc.first_column - len
				};
				if (this.options.ranges) this.yylloc.range = [r[0], r[0] + this.yyleng - len];
				this.yyleng = this.yytext.length;
				return this;
			},
			more: function() {
				this._more = true;
				return this;
			},
			reject: function() {
				if (this.options.backtrack_lexer) this._backtrack = true;
				else return this.parseError("Lexical error on line " + (this.yylineno + 1) + ". You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n" + this.showPosition(), {
					text: "",
					token: null,
					line: this.yylineno
				});
				return this;
			},
			less: function(n) {
				this.unput(this.match.slice(n));
			},
			pastInput: function() {
				var past = this.matched.substr(0, this.matched.length - this.match.length);
				return (past.length > 20 ? "..." : "") + past.substr(-20).replace(/\n/g, "");
			},
			upcomingInput: function() {
				var next = this.match;
				if (next.length < 20) next += this._input.substr(0, 20 - next.length);
				return (next.substr(0, 20) + (next.length > 20 ? "..." : "")).replace(/\n/g, "");
			},
			showPosition: function() {
				var pre = this.pastInput();
				var c = new Array(pre.length + 1).join("-");
				return pre + this.upcomingInput() + "\n" + c + "^";
			},
			test_match: function(match, indexed_rule) {
				var token, lines, backup;
				if (this.options.backtrack_lexer) {
					backup = {
						yylineno: this.yylineno,
						yylloc: {
							first_line: this.yylloc.first_line,
							last_line: this.last_line,
							first_column: this.yylloc.first_column,
							last_column: this.yylloc.last_column
						},
						yytext: this.yytext,
						match: this.match,
						matches: this.matches,
						matched: this.matched,
						yyleng: this.yyleng,
						offset: this.offset,
						_more: this._more,
						_input: this._input,
						yy: this.yy,
						conditionStack: this.conditionStack.slice(0),
						done: this.done
					};
					if (this.options.ranges) backup.yylloc.range = this.yylloc.range.slice(0);
				}
				lines = match[0].match(/(?:\r\n?|\n).*/g);
				if (lines) this.yylineno += lines.length;
				this.yylloc = {
					first_line: this.yylloc.last_line,
					last_line: this.yylineno + 1,
					first_column: this.yylloc.last_column,
					last_column: lines ? lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length
				};
				this.yytext += match[0];
				this.match += match[0];
				this.matches = match;
				this.yyleng = this.yytext.length;
				if (this.options.ranges) this.yylloc.range = [this.offset, this.offset += this.yyleng];
				this._more = false;
				this._backtrack = false;
				this._input = this._input.slice(match[0].length);
				this.matched += match[0];
				token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
				if (this.done && this._input) this.done = false;
				if (token) return token;
				else if (this._backtrack) {
					for (var k in backup) this[k] = backup[k];
					return false;
				}
				return false;
			},
			next: function() {
				if (this.done) return this.EOF;
				if (!this._input) this.done = true;
				var token, match, tempMatch, index;
				if (!this._more) {
					this.yytext = "";
					this.match = "";
				}
				var rules = this._currentRules();
				for (var i = 0; i < rules.length; i++) {
					tempMatch = this._input.match(this.rules[rules[i]]);
					if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
						match = tempMatch;
						index = i;
						if (this.options.backtrack_lexer) {
							token = this.test_match(tempMatch, rules[i]);
							if (token !== false) return token;
							else if (this._backtrack) {
								match = false;
								continue;
							} else return false;
						} else if (!this.options.flex) break;
					}
				}
				if (match) {
					token = this.test_match(match, rules[index]);
					if (token !== false) return token;
					return false;
				}
				if (this._input === "") return this.EOF;
				else return this.parseError("Lexical error on line " + (this.yylineno + 1) + ". Unrecognized text.\n" + this.showPosition(), {
					text: "",
					token: null,
					line: this.yylineno
				});
			},
			lex: function lex() {
				var r = this.next();
				if (r) return r;
				else return this.lex();
			},
			begin: function begin(condition) {
				this.conditionStack.push(condition);
			},
			popState: function popState() {
				if (this.conditionStack.length - 1 > 0) return this.conditionStack.pop();
				else return this.conditionStack[0];
			},
			_currentRules: function _currentRules() {
				if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
				else return this.conditions["INITIAL"].rules;
			},
			topState: function topState(n) {
				n = this.conditionStack.length - 1 - Math.abs(n || 0);
				if (n >= 0) return this.conditionStack[n];
				else return "INITIAL";
			},
			pushState: function pushState(condition) {
				this.begin(condition);
			},
			stateStackSize: function stateStackSize() {
				return this.conditionStack.length;
			},
			options: {},
			performAction: function anonymous(yy, yy_, $avoiding_name_collisions, YY_START) {
				switch ($avoiding_name_collisions) {
					case 0: return 62;
					case 1: return 63;
					case 2: return 64;
					case 3: return 65;
					case 4: break;
					case 5: break;
					case 6:
						this.begin("acc_title");
						return 33;
					case 7:
						this.popState();
						return "acc_title_value";
					case 8:
						this.begin("acc_descr");
						return 35;
					case 9:
						this.popState();
						return "acc_descr_value";
					case 10:
						this.begin("acc_descr_multiline");
						break;
					case 11:
						this.popState();
						break;
					case 12: return "acc_descr_multiline_value";
					case 13: return 8;
					case 14: break;
					case 15: return 7;
					case 16: return 7;
					case 17: return "EDGE_STATE";
					case 18:
						this.begin("callback_name");
						break;
					case 19:
						this.popState();
						break;
					case 20:
						this.popState();
						this.begin("callback_args");
						break;
					case 21: return 79;
					case 22:
						this.popState();
						break;
					case 23: return 80;
					case 24:
						this.popState();
						break;
					case 25: return "STR";
					case 26:
						this.begin("string");
						break;
					case 27: return 82;
					case 28: return 57;
					case 29:
						this.begin("namespace");
						return 42;
					case 30:
						this.popState();
						return 8;
					case 31: break;
					case 32:
						this.begin("namespace-body");
						return 39;
					case 33:
						this.popState();
						this.less(0);
						break;
					case 34:
						this.popState();
						return 41;
					case 35: return "EOF_IN_STRUCT";
					case 36: return 8;
					case 37: break;
					case 38: return "EDGE_STATE";
					case 39:
						this.begin("class");
						return 48;
					case 40:
						this.popState();
						return 8;
					case 41: break;
					case 42:
						this.popState();
						this.popState();
						return 41;
					case 43:
						this.begin("class-body");
						return 39;
					case 44:
						this.popState();
						return 41;
					case 45: return "EOF_IN_STRUCT";
					case 46: return "EDGE_STATE";
					case 47: return "OPEN_IN_STRUCT";
					case 48: break;
					case 49: return "MEMBER";
					case 50: return 83;
					case 51: return 75;
					case 52: return 76;
					case 53: return 78;
					case 54: return 54;
					case 55: return 56;
					case 56: return 46;
					case 57: return 47;
					case 58: return 81;
					case 59:
						this.popState();
						break;
					case 60: return "GENERICTYPE";
					case 61:
						this.begin("generic");
						break;
					case 62:
						this.popState();
						break;
					case 63: return "BQUOTE_STR";
					case 64:
						this.begin("bqstring");
						break;
					case 65: return 77;
					case 66: return 77;
					case 67: return 77;
					case 68: return 77;
					case 69: return 69;
					case 70: return 69;
					case 71: return 71;
					case 72: return 71;
					case 73: return 70;
					case 74: return 68;
					case 75: return 72;
					case 76: return 73;
					case 77: return 74;
					case 78: return 22;
					case 79: return 44;
					case 80: return 100;
					case 81: return 18;
					case 82: return "PLUS";
					case 83: return 87;
					case 84: return 61;
					case 85: return 89;
					case 86: return 89;
					case 87: return 90;
					case 88: return "EQUALS";
					case 89: return "EQUALS";
					case 90: return 60;
					case 91: return 12;
					case 92: return 14;
					case 93: return "PUNCTUATION";
					case 94: return 86;
					case 95: return 102;
					case 96: return 50;
					case 97: return 50;
					case 98: return 9;
				}
			},
			rules: [
				/^(?:.*direction\s+TB[^\n]*)/,
				/^(?:.*direction\s+BT[^\n]*)/,
				/^(?:.*direction\s+RL[^\n]*)/,
				/^(?:.*direction\s+LR[^\n]*)/,
				/^(?:%%(?!\{)*[^\n]*(\r?\n?)+)/,
				/^(?:%%[^\n]*(\r?\n)*)/,
				/^(?:accTitle\s*:\s*)/,
				/^(?:(?!\n||)*[^\n]*)/,
				/^(?:accDescr\s*:\s*)/,
				/^(?:(?!\n||)*[^\n]*)/,
				/^(?:accDescr\s*\{\s*)/,
				/^(?:[\}])/,
				/^(?:[^\}]*)/,
				/^(?:\s*(\r?\n)+)/,
				/^(?:\s+)/,
				/^(?:classDiagram-v2\b)/,
				/^(?:classDiagram\b)/,
				/^(?:\[\*\])/,
				/^(?:call[\s]+)/,
				/^(?:\([\s]*\))/,
				/^(?:\()/,
				/^(?:[^(]*)/,
				/^(?:\))/,
				/^(?:[^)]*)/,
				/^(?:["])/,
				/^(?:[^"]*)/,
				/^(?:["])/,
				/^(?:style\b)/,
				/^(?:classDef\b)/,
				/^(?:namespace\b)/,
				/^(?:\s*(\r?\n)+)/,
				/^(?:\s+)/,
				/^(?:[{])/,
				/^(?:[}])/,
				/^(?:[}])/,
				/^(?:$)/,
				/^(?:\s*(\r?\n)+)/,
				/^(?:\s+)/,
				/^(?:\[\*\])/,
				/^(?:class\b)/,
				/^(?:\s*(\r?\n)+)/,
				/^(?:\s+)/,
				/^(?:[}])/,
				/^(?:[{])/,
				/^(?:[}])/,
				/^(?:$)/,
				/^(?:\[\*\])/,
				/^(?:[{])/,
				/^(?:[\n])/,
				/^(?:[^{}\n]*)/,
				/^(?:cssClass\b)/,
				/^(?:callback\b)/,
				/^(?:link\b)/,
				/^(?:click\b)/,
				/^(?:note for\b)/,
				/^(?:note\b)/,
				/^(?:<<)/,
				/^(?:>>)/,
				/^(?:href\b)/,
				/^(?:[~])/,
				/^(?:[^~]*)/,
				/^(?:~)/,
				/^(?:[`])/,
				/^(?:[^`]+)/,
				/^(?:[`])/,
				/^(?:_self\b)/,
				/^(?:_blank\b)/,
				/^(?:_parent\b)/,
				/^(?:_top\b)/,
				/^(?:\s*<\|)/,
				/^(?:\s*\|>)/,
				/^(?:\s*>)/,
				/^(?:\s*<)/,
				/^(?:\s*\*)/,
				/^(?:\s*o\b)/,
				/^(?:\s*\(\))/,
				/^(?:--)/,
				/^(?:\.\.)/,
				/^(?::{1}[^:\n;]+)/,
				/^(?::{3})/,
				/^(?:-)/,
				/^(?:\.)/,
				/^(?:\+)/,
				/^(?::)/,
				/^(?:,)/,
				/^(?:#)/,
				/^(?:#)/,
				/^(?:%)/,
				/^(?:=)/,
				/^(?:=)/,
				/^(?:\w+)/,
				/^(?:\[)/,
				/^(?:\])/,
				/^(?:[!"#$%&'*+,-.`?\\/])/,
				/^(?:[0-9]+)/,
				/^(?:[\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6]|[\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377]|[\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5]|[\u03F7-\u0481\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA]|[\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE]|[\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA]|[\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0]|[\u08A2-\u08AC\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0977]|[\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2]|[\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A]|[\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39]|[\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8]|[\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C]|[\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C]|[\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99]|[\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0]|[\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D]|[\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3]|[\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10]|[\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1]|[\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81]|[\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3]|[\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6]|[\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A]|[\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081]|[\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D]|[\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0]|[\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310]|[\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C]|[\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u1700-\u170C\u170E-\u1711]|[\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7]|[\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C]|[\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16]|[\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF]|[\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC]|[\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D]|[\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D]|[\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3]|[\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F]|[\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128]|[\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184]|[\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3]|[\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6]|[\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE]|[\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C]|[\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D]|[\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC]|[\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B]|[\uA640-\uA66E\uA67F-\uA697\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788]|[\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA801\uA803-\uA805]|[\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB]|[\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uAA00-\uAA28]|[\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5]|[\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4]|[\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E]|[\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D]|[\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36]|[\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D]|[\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC]|[\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF]|[\uFFD2-\uFFD7\uFFDA-\uFFDC])/,
				/^(?:\s)/,
				/^(?:\s)/,
				/^(?:$)/
			],
			conditions: {
				"namespace-body": {
					"rules": [
						26,
						29,
						34,
						35,
						36,
						37,
						38,
						39,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"namespace": {
					"rules": [
						26,
						29,
						30,
						31,
						32,
						33,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"class-body": {
					"rules": [
						26,
						44,
						45,
						46,
						47,
						48,
						49,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"class": {
					"rules": [
						26,
						40,
						41,
						42,
						43,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"acc_descr_multiline": {
					"rules": [
						11,
						12,
						26,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"acc_descr": {
					"rules": [
						9,
						26,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"acc_title": {
					"rules": [
						7,
						26,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"callback_args": {
					"rules": [
						22,
						23,
						26,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"callback_name": {
					"rules": [
						19,
						20,
						21,
						26,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"href": {
					"rules": [
						26,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"struct": {
					"rules": [
						26,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"generic": {
					"rules": [
						26,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						59,
						60,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"bqstring": {
					"rules": [
						26,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						62,
						63,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"string": {
					"rules": [
						24,
						25,
						26,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						98
					],
					"inclusive": false
				},
				"INITIAL": {
					"rules": [
						0,
						1,
						2,
						3,
						4,
						5,
						6,
						8,
						10,
						13,
						14,
						15,
						16,
						17,
						18,
						26,
						27,
						28,
						29,
						39,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						61,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						78,
						79,
						80,
						81,
						82,
						83,
						84,
						85,
						86,
						87,
						88,
						89,
						90,
						91,
						92,
						93,
						94,
						95,
						96,
						97,
						98
					],
					"inclusive": true
				}
			}
		};
	})();
	function Parser() {
		this.yy = {};
	}
	Parser.prototype = parser;
	parser.Parser = Parser;
	return new Parser();
})();
const parser$1 = classParser;
classParser.Parser;
//#endregion
//#region src/serializer/parser/jison/er-parser.js
var er = (function() {
	var o = function(k, v, o, l) {
		for (o = o || {}, l = k.length; l--; o[k[l]] = v);
		return o;
	}, $V0 = [5, 8], $V1 = [
		7,
		8,
		22,
		24,
		26,
		28,
		38,
		39,
		40,
		41,
		42,
		43,
		45,
		48,
		49,
		53,
		55,
		56,
		57
	], $V2 = [2, 4], $V3 = [1, 9], $V4 = [1, 11], $V5 = [1, 12], $V6 = [1, 13], $V7 = [1, 14], $V8 = [1, 33], $V9 = [1, 25], $Va = [1, 26], $Vb = [1, 27], $Vc = [1, 28], $Vd = [1, 29], $Ve = [1, 21], $Vf = [1, 30], $Vg = [1, 31], $Vh = [1, 22], $Vi = [1, 20], $Vj = [1, 23], $Vk = [1, 24], $Vl = [2, 8], $Vm = [
		7,
		8,
		22,
		24,
		26,
		28,
		34,
		38,
		39,
		40,
		41,
		42,
		43,
		45,
		48,
		49,
		53,
		55,
		56,
		57
	], $Vn = [1, 39], $Vo = [1, 40], $Vp = [1, 41], $Vq = [1, 42], $Vr = [1, 43], $Vs = [
		7,
		8,
		13,
		15,
		17,
		20,
		21,
		22,
		24,
		26,
		28,
		34,
		38,
		39,
		40,
		41,
		42,
		43,
		45,
		48,
		49,
		52,
		53,
		55,
		56,
		57,
		71,
		72,
		73,
		74,
		75
	], $Vt = [1, 49], $Vu = [1, 50], $Vv = [
		45,
		53,
		55,
		56,
		57
	], $Vw = [1, 60], $Vx = [
		45,
		53,
		55,
		56,
		57,
		76,
		77
	], $Vy = [1, 73], $Vz = [1, 71], $VA = [1, 68], $VB = [1, 72], $VC = [1, 74], $VD = [
		7,
		8,
		13,
		17,
		22,
		24,
		26,
		28,
		34,
		38,
		39,
		40,
		41,
		42,
		43,
		45,
		46,
		47,
		48,
		49,
		53,
		54,
		55,
		56,
		57,
		71,
		72,
		73,
		74,
		75
	], $VE = [1, 81], $VF = [1, 80], $VG = [1, 79], $VH = [
		71,
		72,
		73,
		74,
		75
	], $VI = [1, 94], $VJ = [
		7,
		8,
		47,
		52
	], $VK = [
		7,
		8,
		13,
		46,
		47,
		52,
		53,
		54
	], $VL = [1, 104], $VM = [1, 103], $VN = [1, 102], $VO = [19, 63], $VP = [1, 113], $VQ = [1, 112], $VR = [
		21,
		45,
		53,
		55,
		56,
		57
	], $VS = [
		19,
		63,
		66,
		68
	];
	var parser = {
		trace: function trace() {},
		yy: {},
		symbols_: {
			"error": 2,
			"start": 3,
			"opt_newlines": 4,
			"ER_DIAGRAM": 5,
			"document": 6,
			"EOF": 7,
			"NEWLINE": 8,
			"line": 9,
			"statement": 10,
			"entityName": 11,
			"relSpec": 12,
			"COLON": 13,
			"role": 14,
			"STYLE_SEPARATOR": 15,
			"idList": 16,
			"BLOCK_START": 17,
			"attributes": 18,
			"BLOCK_STOP": 19,
			"SQS": 20,
			"SQE": 21,
			"title": 22,
			"title_value": 23,
			"acc_title": 24,
			"acc_title_value": 25,
			"acc_descr": 26,
			"acc_descr_value": 27,
			"acc_descr_multiline_value": 28,
			"direction": 29,
			"classDefStatement": 30,
			"classStatement": 31,
			"styleStatement": 32,
			"subgraphHeader": 33,
			"END": 34,
			"subgraphStart": 35,
			"separator": 36,
			"subgraphTitle": 37,
			"SUBGRAPH": 38,
			"direction_tb": 39,
			"direction_bt": 40,
			"direction_rl": 41,
			"direction_lr": 42,
			"CLASSDEF": 43,
			"stylesOpt": 44,
			"UNICODE_TEXT": 45,
			"STYLE_TEXT": 46,
			"COMMA": 47,
			"CLASS": 48,
			"STYLE": 49,
			"style": 50,
			"styleComponent": 51,
			"SEMI": 52,
			"NUM": 53,
			"BRKT": 54,
			"ENTITY_NAME": 55,
			"DECIMAL_NUM": 56,
			"ENTITY_ONE": 57,
			"attribute": 58,
			"attributeType": 59,
			"attributeName": 60,
			"attributeKeyTypeList": 61,
			"attributeComment": 62,
			"ATTRIBUTE_WORD": 63,
			"?": 64,
			"attributeKeyType": 65,
			",": 66,
			"ATTRIBUTE_KEY": 67,
			"COMMENT": 68,
			"cardinality": 69,
			"relType": 70,
			"ZERO_OR_ONE": 71,
			"ZERO_OR_MORE": 72,
			"ONE_OR_MORE": 73,
			"ONLY_ONE": 74,
			"MD_PARENT": 75,
			"NON_IDENTIFYING": 76,
			"IDENTIFYING": 77,
			"WORD": 78,
			"$accept": 0,
			"$end": 1
		},
		terminals_: {
			2: "error",
			5: "ER_DIAGRAM",
			7: "EOF",
			8: "NEWLINE",
			13: "COLON",
			15: "STYLE_SEPARATOR",
			17: "BLOCK_START",
			19: "BLOCK_STOP",
			20: "SQS",
			21: "SQE",
			22: "title",
			23: "title_value",
			24: "acc_title",
			25: "acc_title_value",
			26: "acc_descr",
			27: "acc_descr_value",
			28: "acc_descr_multiline_value",
			34: "END",
			38: "SUBGRAPH",
			39: "direction_tb",
			40: "direction_bt",
			41: "direction_rl",
			42: "direction_lr",
			43: "CLASSDEF",
			45: "UNICODE_TEXT",
			46: "STYLE_TEXT",
			47: "COMMA",
			48: "CLASS",
			49: "STYLE",
			52: "SEMI",
			53: "NUM",
			54: "BRKT",
			55: "ENTITY_NAME",
			56: "DECIMAL_NUM",
			57: "ENTITY_ONE",
			63: "ATTRIBUTE_WORD",
			64: "?",
			66: ",",
			67: "ATTRIBUTE_KEY",
			68: "COMMENT",
			71: "ZERO_OR_ONE",
			72: "ZERO_OR_MORE",
			73: "ONE_OR_MORE",
			74: "ONLY_ONE",
			75: "MD_PARENT",
			76: "NON_IDENTIFYING",
			77: "IDENTIFYING",
			78: "WORD"
		},
		productions_: [
			0,
			[3, 4],
			[4, 0],
			[4, 2],
			[6, 0],
			[6, 2],
			[9, 1],
			[9, 1],
			[9, 1],
			[10, 5],
			[10, 9],
			[10, 7],
			[10, 7],
			[10, 4],
			[10, 6],
			[10, 3],
			[10, 5],
			[10, 1],
			[10, 3],
			[10, 7],
			[10, 9],
			[10, 6],
			[10, 8],
			[10, 4],
			[10, 6],
			[10, 2],
			[10, 2],
			[10, 2],
			[10, 1],
			[10, 1],
			[10, 1],
			[10, 1],
			[10, 1],
			[10, 3],
			[33, 3],
			[33, 6],
			[35, 1],
			[37, 1],
			[37, 2],
			[29, 1],
			[29, 1],
			[29, 1],
			[29, 1],
			[30, 4],
			[16, 1],
			[16, 1],
			[16, 3],
			[16, 3],
			[31, 3],
			[32, 4],
			[44, 1],
			[44, 3],
			[50, 1],
			[50, 2],
			[36, 1],
			[36, 1],
			[36, 1],
			[51, 1],
			[51, 1],
			[51, 1],
			[51, 1],
			[11, 1],
			[11, 1],
			[11, 1],
			[11, 1],
			[11, 1],
			[18, 1],
			[18, 2],
			[58, 2],
			[58, 3],
			[58, 3],
			[58, 4],
			[59, 1],
			[59, 2],
			[60, 1],
			[61, 1],
			[61, 3],
			[65, 1],
			[62, 1],
			[12, 3],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[69, 1],
			[70, 1],
			[70, 1],
			[14, 1],
			[14, 1],
			[14, 1]
		],
		performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$) {
			var $0 = $$.length - 1;
			switch (yystate) {
				case 1: break;
				case 4:
					this.$ = [];
					break;
				case 5:
					this.$ = $$[$0 - 1].concat($$[$0]);
					break;
				case 6:
					this.$ = $$[$0];
					break;
				case 7:
				case 8:
					this.$ = [];
					break;
				case 9:
					yy.addEntity($$[$0 - 4]);
					yy.addEntity($$[$0 - 2]);
					yy.addRelationship($$[$0 - 4], $$[$0], $$[$0 - 2], $$[$0 - 3]);
					this.$ = [$$[$0 - 4], $$[$0 - 2]];
					break;
				case 10:
					yy.addEntity($$[$0 - 8]);
					yy.addEntity($$[$0 - 4]);
					yy.addRelationship($$[$0 - 8], $$[$0], $$[$0 - 4], $$[$0 - 5]);
					yy.setClass([$$[$0 - 8]], $$[$0 - 6]);
					yy.setClass([$$[$0 - 4]], $$[$0 - 2]);
					this.$ = [$$[$0 - 8], $$[$0 - 4]];
					break;
				case 11:
					yy.addEntity($$[$0 - 6]);
					yy.addEntity($$[$0 - 2]);
					yy.addRelationship($$[$0 - 6], $$[$0], $$[$0 - 2], $$[$0 - 3]);
					yy.setClass([$$[$0 - 6]], $$[$0 - 4]);
					this.$ = [$$[$0 - 6], $$[$0 - 2]];
					break;
				case 12:
					yy.addEntity($$[$0 - 6]);
					yy.addEntity($$[$0 - 4]);
					yy.addRelationship($$[$0 - 6], $$[$0], $$[$0 - 4], $$[$0 - 5]);
					yy.setClass([$$[$0 - 4]], $$[$0 - 2]);
					this.$ = [$$[$0 - 6], $$[$0 - 4]];
					break;
				case 13:
					yy.addEntity($$[$0 - 3]);
					yy.addAttributes($$[$0 - 3], $$[$0 - 1]);
					this.$ = [$$[$0 - 3]];
					break;
				case 14:
					yy.addEntity($$[$0 - 5]);
					yy.addAttributes($$[$0 - 5], $$[$0 - 1]);
					yy.setClass([$$[$0 - 5]], $$[$0 - 3]);
					this.$ = [$$[$0 - 5]];
					break;
				case 15:
					yy.addEntity($$[$0 - 2]);
					this.$ = [$$[$0 - 2]];
					break;
				case 16:
					yy.addEntity($$[$0 - 4]);
					yy.setClass([$$[$0 - 4]], $$[$0 - 2]);
					this.$ = [$$[$0 - 4]];
					break;
				case 17:
					yy.addEntity($$[$0]);
					this.$ = [$$[$0]];
					break;
				case 18:
					yy.addEntity($$[$0 - 2]);
					yy.setClass([$$[$0 - 2]], $$[$0]);
					this.$ = [$$[$0 - 2]];
					break;
				case 19:
					yy.addEntity($$[$0 - 6], $$[$0 - 4]);
					yy.addAttributes($$[$0 - 6], $$[$0 - 1]);
					this.$ = [$$[$0 - 6]];
					break;
				case 20:
					yy.addEntity($$[$0 - 8], $$[$0 - 6]);
					yy.addAttributes($$[$0 - 8], $$[$0 - 1]);
					yy.setClass([$$[$0 - 8]], $$[$0 - 3]);
					this.$ = [$$[$0 - 8]];
					break;
				case 21:
					yy.addEntity($$[$0 - 5], $$[$0 - 3]);
					this.$ = [$$[$0 - 5]];
					break;
				case 22:
					yy.addEntity($$[$0 - 7], $$[$0 - 5]);
					yy.setClass([$$[$0 - 7]], $$[$0 - 2]);
					this.$ = [$$[$0 - 7]];
					break;
				case 23:
					yy.addEntity($$[$0 - 3], $$[$0 - 1]);
					break;
				case 24:
					yy.addEntity($$[$0 - 5], $$[$0 - 3]);
					yy.setClass([$$[$0 - 5]], $$[$0]);
					break;
				case 25:
				case 26:
					this.$ = $$[$0].trim();
					yy.setAccTitle(this.$);
					break;
				case 27:
				case 28:
					this.$ = $$[$0].trim();
					yy.setAccDescription(this.$);
					break;
				case 29:
					if (!yy.subgraphDepth) {
						yy.setDirection($$[$0].value);
						this.$ = [];
					} else this.$ = $$[$0];
					break;
				case 33:
					yy.subgraphDepth = (yy.subgraphDepth || 1) - 1;
					this.$ = yy.addSubGraph({ text: $$[$0 - 2].id }, $$[$0 - 1], { text: $$[$0 - 2].text });
					break;
				case 34:
					yy.subgraphDepth = (yy.subgraphDepth || 0) + 1;
					this.$ = {
						id: $$[$0 - 1],
						text: $$[$0 - 1]
					};
					break;
				case 35:
					yy.subgraphDepth = (yy.subgraphDepth || 0) + 1;
					this.$ = {
						id: $$[$0 - 4],
						text: $$[$0 - 2]
					};
					break;
				case 36:
					yy.enterScope();
					break;
				case 37:
				case 62:
				case 63:
				case 64:
				case 65:
				case 89:
					this.$ = $$[$0];
					break;
				case 38:
					this.$ = $$[$0 - 1] + " " + $$[$0];
					break;
				case 39:
					this.$ = {
						stmt: "dir",
						value: "TB"
					};
					break;
				case 40:
					this.$ = {
						stmt: "dir",
						value: "BT"
					};
					break;
				case 41:
					this.$ = {
						stmt: "dir",
						value: "RL"
					};
					break;
				case 42:
					this.$ = {
						stmt: "dir",
						value: "LR"
					};
					break;
				case 43:
					this.$ = $$[$0 - 3];
					yy.addClass($$[$0 - 2], $$[$0 - 1]);
					break;
				case 44:
				case 45:
				case 66:
				case 75:
					this.$ = [$$[$0]];
					break;
				case 46:
				case 47:
					this.$ = $$[$0 - 2].concat([$$[$0]]);
					break;
				case 48:
					this.$ = $$[$0 - 2];
					yy.setClass($$[$0 - 1], $$[$0]);
					break;
				case 49:
					this.$ = $$[$0 - 3];
					yy.addCssStyles($$[$0 - 2], $$[$0 - 1]);
					break;
				case 50:
					this.$ = [$$[$0]];
					break;
				case 51:
					$$[$0 - 2].push($$[$0]);
					this.$ = $$[$0 - 2];
					break;
				case 53:
					this.$ = $$[$0 - 1] + $$[$0];
					break;
				case 61:
				case 87:
				case 88:
					this.$ = $$[$0].replace(/"/g, "");
					break;
				case 67:
					$$[$0].push($$[$0 - 1]);
					this.$ = $$[$0];
					break;
				case 68:
					this.$ = {
						type: $$[$0 - 1],
						name: $$[$0]
					};
					break;
				case 69:
					this.$ = {
						type: $$[$0 - 2],
						name: $$[$0 - 1],
						keys: $$[$0]
					};
					break;
				case 70:
					this.$ = {
						type: $$[$0 - 2],
						name: $$[$0 - 1],
						comment: $$[$0]
					};
					break;
				case 71:
					this.$ = {
						type: $$[$0 - 3],
						name: $$[$0 - 2],
						keys: $$[$0 - 1],
						comment: $$[$0]
					};
					break;
				case 72:
				case 74:
				case 77:
					this.$ = $$[$0];
					break;
				case 73:
					this.$ = $$[$0 - 1] + $$[$0];
					break;
				case 76:
					$$[$0 - 2].push($$[$0]);
					this.$ = $$[$0 - 2];
					break;
				case 78:
					this.$ = $$[$0].replace(/"/g, "");
					break;
				case 79:
					this.$ = {
						cardA: $$[$0],
						relType: $$[$0 - 1],
						cardB: $$[$0 - 2]
					};
					break;
				case 80:
					this.$ = yy.Cardinality.ZERO_OR_ONE;
					break;
				case 81:
					this.$ = yy.Cardinality.ZERO_OR_MORE;
					break;
				case 82:
					this.$ = yy.Cardinality.ONE_OR_MORE;
					break;
				case 83:
					this.$ = yy.Cardinality.ONLY_ONE;
					break;
				case 84:
					this.$ = yy.Cardinality.MD_PARENT;
					break;
				case 85:
					this.$ = yy.Identification.NON_IDENTIFYING;
					break;
				case 86: this.$ = yy.Identification.IDENTIFYING;
			}
		},
		table: [
			o($V0, [2, 2], {
				3: 1,
				4: 2
			}),
			{ 1: [3] },
			{
				5: [1, 3],
				8: [1, 4]
			},
			o($V1, $V2, { 6: 5 }),
			o($V0, [2, 3]),
			{
				7: [1, 6],
				8: $V3,
				9: 7,
				10: 8,
				11: 10,
				22: $V4,
				24: $V5,
				26: $V6,
				28: $V7,
				29: 15,
				30: 16,
				31: 17,
				32: 18,
				33: 19,
				35: 32,
				38: $V8,
				39: $V9,
				40: $Va,
				41: $Vb,
				42: $Vc,
				43: $Vd,
				45: $Ve,
				48: $Vf,
				49: $Vg,
				53: $Vh,
				55: $Vi,
				56: $Vj,
				57: $Vk
			},
			o($V1, $Vl, { 1: [2, 1] }),
			o($Vm, [2, 5]),
			o($Vm, [2, 6]),
			o($Vm, [2, 7]),
			o($Vm, [2, 17], {
				12: 34,
				69: 38,
				15: [1, 35],
				17: [1, 36],
				20: [1, 37],
				71: $Vn,
				72: $Vo,
				73: $Vp,
				74: $Vq,
				75: $Vr
			}),
			{ 23: [1, 44] },
			{ 25: [1, 45] },
			{ 27: [1, 46] },
			o($Vm, [2, 28]),
			o($Vm, [2, 29]),
			o($Vm, [2, 30]),
			o($Vm, [2, 31]),
			o($Vm, [2, 32]),
			o($Vm, $V2, { 6: 47 }),
			o($Vs, [2, 61]),
			o($Vs, [2, 62]),
			o($Vs, [2, 63]),
			o($Vs, [2, 64]),
			o($Vs, [2, 65]),
			o($Vm, [2, 39]),
			o($Vm, [2, 40]),
			o($Vm, [2, 41]),
			o($Vm, [2, 42]),
			{
				16: 48,
				45: $Vt,
				46: $Vu
			},
			{
				16: 51,
				45: $Vt,
				46: $Vu
			},
			{
				16: 52,
				45: $Vt,
				46: $Vu
			},
			{
				11: 53,
				45: $Ve,
				53: $Vh,
				55: $Vi,
				56: $Vj,
				57: $Vk
			},
			o($Vv, [2, 36]),
			{
				11: 54,
				45: $Ve,
				53: $Vh,
				55: $Vi,
				56: $Vj,
				57: $Vk
			},
			{
				16: 55,
				45: $Vt,
				46: $Vu
			},
			{
				18: 56,
				19: [1, 57],
				58: 58,
				59: 59,
				63: $Vw
			},
			{
				11: 61,
				45: $Ve,
				53: $Vh,
				55: $Vi,
				56: $Vj,
				57: $Vk
			},
			{
				70: 62,
				76: [1, 63],
				77: [1, 64]
			},
			o($Vx, [2, 80]),
			o($Vx, [2, 81]),
			o($Vx, [2, 82]),
			o($Vx, [2, 83]),
			o($Vx, [2, 84]),
			o($Vm, [2, 25]),
			o($Vm, [2, 26]),
			o($Vm, [2, 27]),
			{
				7: [1, 66],
				8: $V3,
				9: 7,
				10: 8,
				11: 10,
				22: $V4,
				24: $V5,
				26: $V6,
				28: $V7,
				29: 15,
				30: 16,
				31: 17,
				32: 18,
				33: 19,
				34: [1, 65],
				35: 32,
				38: $V8,
				39: $V9,
				40: $Va,
				41: $Vb,
				42: $Vc,
				43: $Vd,
				45: $Ve,
				48: $Vf,
				49: $Vg,
				53: $Vh,
				55: $Vi,
				56: $Vj,
				57: $Vk
			},
			{
				13: $Vy,
				44: 67,
				46: $Vz,
				47: $VA,
				50: 69,
				51: 70,
				53: $VB,
				54: $VC
			},
			o($VD, [2, 44]),
			o($VD, [2, 45]),
			{
				16: 75,
				45: $Vt,
				46: $Vu,
				47: $VA
			},
			{
				13: $Vy,
				44: 76,
				46: $Vz,
				47: $VA,
				50: 69,
				51: 70,
				53: $VB,
				54: $VC
			},
			{
				7: $VE,
				8: $VF,
				20: [1, 78],
				36: 77,
				52: $VG
			},
			{
				13: [1, 82],
				15: [1, 83]
			},
			o($Vm, [2, 18], {
				69: 38,
				12: 84,
				17: [1, 85],
				47: $VA,
				71: $Vn,
				72: $Vo,
				73: $Vp,
				74: $Vq,
				75: $Vr
			}),
			{ 19: [1, 86] },
			o($Vm, [2, 15]),
			{
				18: 87,
				19: [2, 66],
				58: 58,
				59: 59,
				63: $Vw
			},
			{
				60: 88,
				63: [1, 89]
			},
			{
				63: [2, 72],
				64: [1, 90]
			},
			{ 21: [1, 91] },
			{
				69: 92,
				71: $Vn,
				72: $Vo,
				73: $Vp,
				74: $Vq,
				75: $Vr
			},
			o($VH, [2, 85]),
			o($VH, [2, 86]),
			o($Vm, [2, 33]),
			o($Vm, $Vl),
			{
				7: $VE,
				8: $VF,
				36: 93,
				47: $VI,
				52: $VG
			},
			{
				45: [1, 95],
				46: [1, 96]
			},
			o($VJ, [2, 50], {
				51: 97,
				13: $Vy,
				46: $Vz,
				53: $VB,
				54: $VC
			}),
			o($VK, [2, 52]),
			o($VK, [2, 57]),
			o($VK, [2, 58]),
			o($VK, [2, 59]),
			o($VK, [2, 60]),
			o($Vm, [2, 48], { 47: $VA }),
			{
				7: $VE,
				8: $VF,
				36: 98,
				47: $VI,
				52: $VG
			},
			o($Vm, [2, 34]),
			{
				11: 100,
				37: 99,
				45: $Ve,
				53: $Vh,
				55: $Vi,
				56: $Vj,
				57: $Vk
			},
			o($Vm, [2, 54]),
			o($Vm, [2, 55]),
			o($Vm, [2, 56]),
			{
				14: 101,
				45: $VL,
				55: $VM,
				78: $VN
			},
			{
				16: 105,
				45: $Vt,
				46: $Vu
			},
			{
				11: 106,
				45: $Ve,
				53: $Vh,
				55: $Vi,
				56: $Vj,
				57: $Vk
			},
			{
				18: 107,
				19: [1, 108],
				58: 58,
				59: 59,
				63: $Vw
			},
			o($Vm, [2, 13]),
			{ 19: [2, 67] },
			o($VO, [2, 68], {
				61: 109,
				62: 110,
				65: 111,
				67: $VP,
				68: $VQ
			}),
			o([
				19,
				63,
				67,
				68
			], [2, 74]),
			{ 63: [2, 73] },
			o($Vm, [2, 23], {
				15: [1, 115],
				17: [1, 114]
			}),
			o($Vv, [2, 79]),
			o($Vm, [2, 43]),
			{
				13: $Vy,
				46: $Vz,
				50: 116,
				51: 70,
				53: $VB,
				54: $VC
			},
			o($VD, [2, 46]),
			o($VD, [2, 47]),
			o($VK, [2, 53]),
			o($Vm, [2, 49]),
			{
				11: 118,
				21: [1, 117],
				45: $Ve,
				53: $Vh,
				55: $Vi,
				56: $Vj,
				57: $Vk
			},
			o($VR, [2, 37]),
			o($Vm, [2, 9]),
			o($Vm, [2, 87]),
			o($Vm, [2, 88]),
			o($Vm, [2, 89]),
			{
				13: [1, 119],
				47: $VA
			},
			{
				13: [1, 121],
				15: [1, 120]
			},
			{ 19: [1, 122] },
			o($Vm, [2, 16]),
			o($VO, [2, 69], {
				62: 123,
				66: [1, 124],
				68: $VQ
			}),
			o($VO, [2, 70]),
			o($VS, [2, 75]),
			o($VO, [2, 78]),
			o($VS, [2, 77]),
			{
				18: 125,
				19: [1, 126],
				58: 58,
				59: 59,
				63: $Vw
			},
			{
				16: 127,
				45: $Vt,
				46: $Vu
			},
			o($VJ, [2, 51], {
				51: 97,
				13: $Vy,
				46: $Vz,
				53: $VB,
				54: $VC
			}),
			{
				7: $VE,
				8: $VF,
				36: 128,
				52: $VG
			},
			o($VR, [2, 38]),
			{
				14: 129,
				45: $VL,
				55: $VM,
				78: $VN
			},
			{
				16: 130,
				45: $Vt,
				46: $Vu
			},
			{
				14: 131,
				45: $VL,
				55: $VM,
				78: $VN
			},
			o($Vm, [2, 14]),
			o($VO, [2, 71]),
			{
				65: 132,
				67: $VP
			},
			{ 19: [1, 133] },
			o($Vm, [2, 21]),
			o($Vm, [2, 24], {
				17: [1, 134],
				47: $VA
			}),
			o($Vm, [2, 35]),
			o($Vm, [2, 12]),
			{
				13: [1, 135],
				47: $VA
			},
			o($Vm, [2, 11]),
			o($VS, [2, 76]),
			o($Vm, [2, 19]),
			{
				18: 136,
				19: [1, 137],
				58: 58,
				59: 59,
				63: $Vw
			},
			{
				14: 138,
				45: $VL,
				55: $VM,
				78: $VN
			},
			{ 19: [1, 139] },
			o($Vm, [2, 22]),
			o($Vm, [2, 10]),
			o($Vm, [2, 20])
		],
		defaultActions: {
			87: [2, 67],
			90: [2, 73]
		},
		parseError: function parseError(str, hash) {
			if (hash.recoverable) this.trace(str);
			else {
				var error = new Error(str);
				error.hash = hash;
				throw error;
			}
		},
		parse: function parse(input) {
			var self = this, stack = [0], vstack = [null], lstack = [], table = this.table, yytext = "", yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
			var args = lstack.slice.call(arguments, 1);
			var lexer = Object.create(this.lexer);
			var sharedState = { yy: {} };
			for (var k in this.yy) if (Object.prototype.hasOwnProperty.call(this.yy, k)) sharedState.yy[k] = this.yy[k];
			lexer.setInput(input, sharedState.yy);
			sharedState.yy.lexer = lexer;
			sharedState.yy.parser = this;
			if (typeof lexer.yylloc == "undefined") lexer.yylloc = {};
			var yyloc = lexer.yylloc;
			lstack.push(yyloc);
			var ranges = lexer.options && lexer.options.ranges;
			if (typeof sharedState.yy.parseError === "function") this.parseError = sharedState.yy.parseError;
			else this.parseError = Object.getPrototypeOf(this).parseError;
			_token_stack: var lex = function() {
				var token = lexer.lex() || EOF;
				if (typeof token !== "number") token = self.symbols_[token] || token;
				return token;
			};
			var symbol, preErrorSymbol, state, action, r, yyval = {}, p, len, newState, expected;
			while (true) {
				state = stack[stack.length - 1];
				if (this.defaultActions[state]) action = this.defaultActions[state];
				else {
					if (symbol === null || typeof symbol == "undefined") symbol = lex();
					action = table[state] && table[state][symbol];
				}
				if (typeof action === "undefined" || !action.length || !action[0]) {
					var errStr = "";
					expected = [];
					for (p in table[state]) if (this.terminals_[p] && p > TERROR) expected.push("'" + this.terminals_[p] + "'");
					if (lexer.showPosition) errStr = "Parse error on line " + (yylineno + 1) + ":\n" + lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + (this.terminals_[symbol] || symbol) + "'";
					else errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == EOF ? "end of input" : "'" + (this.terminals_[symbol] || symbol) + "'");
					this.parseError(errStr, {
						text: lexer.match,
						token: this.terminals_[symbol] || symbol,
						line: lexer.yylineno,
						loc: yyloc,
						expected
					});
				}
				if (action[0] instanceof Array && action.length > 1) throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
				switch (action[0]) {
					case 1:
						stack.push(symbol);
						vstack.push(lexer.yytext);
						lstack.push(lexer.yylloc);
						stack.push(action[1]);
						symbol = null;
						if (!preErrorSymbol) {
							yyleng = lexer.yyleng;
							yytext = lexer.yytext;
							yylineno = lexer.yylineno;
							yyloc = lexer.yylloc;
							if (recovering > 0) recovering--;
						} else {
							symbol = preErrorSymbol;
							preErrorSymbol = null;
						}
						break;
					case 2:
						len = this.productions_[action[1]][1];
						yyval.$ = vstack[vstack.length - len];
						yyval._$ = {
							first_line: lstack[lstack.length - (len || 1)].first_line,
							last_line: lstack[lstack.length - 1].last_line,
							first_column: lstack[lstack.length - (len || 1)].first_column,
							last_column: lstack[lstack.length - 1].last_column
						};
						if (ranges) yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]];
						r = this.performAction.apply(yyval, [
							yytext,
							yyleng,
							yylineno,
							sharedState.yy,
							action[1],
							vstack,
							lstack
						].concat(args));
						if (typeof r !== "undefined") return r;
						if (len) {
							stack = stack.slice(0, -1 * len * 2);
							vstack = vstack.slice(0, -1 * len);
							lstack = lstack.slice(0, -1 * len);
						}
						stack.push(this.productions_[action[1]][0]);
						vstack.push(yyval.$);
						lstack.push(yyval._$);
						newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
						stack.push(newState);
						break;
					case 3: return true;
				}
			}
			return true;
		}
	};
	parser.lexer = (function() {
		return {
			EOF: 1,
			parseError: function parseError(str, hash) {
				if (this.yy.parser) this.yy.parser.parseError(str, hash);
				else throw new Error(str);
			},
			setInput: function(input, yy) {
				this.yy = yy || this.yy || {};
				this._input = input;
				this._more = this._backtrack = this.done = false;
				this.yylineno = this.yyleng = 0;
				this.yytext = this.matched = this.match = "";
				this.conditionStack = ["INITIAL"];
				this.yylloc = {
					first_line: 1,
					first_column: 0,
					last_line: 1,
					last_column: 0
				};
				if (this.options.ranges) this.yylloc.range = [0, 0];
				this.offset = 0;
				return this;
			},
			input: function() {
				var ch = this._input[0];
				this.yytext += ch;
				this.yyleng++;
				this.offset++;
				this.match += ch;
				this.matched += ch;
				if (ch.match(/(?:\r\n?|\n).*/g)) {
					this.yylineno++;
					this.yylloc.last_line++;
				} else this.yylloc.last_column++;
				if (this.options.ranges) this.yylloc.range[1]++;
				this._input = this._input.slice(1);
				return ch;
			},
			unput: function(ch) {
				var len = ch.length;
				var lines = ch.split(/(?:\r\n?|\n)/g);
				this._input = ch + this._input;
				this.yytext = this.yytext.substr(0, this.yytext.length - len);
				this.offset -= len;
				var oldLines = this.match.split(/(?:\r\n?|\n)/g);
				this.match = this.match.substr(0, this.match.length - 1);
				this.matched = this.matched.substr(0, this.matched.length - 1);
				if (lines.length - 1) this.yylineno -= lines.length - 1;
				var r = this.yylloc.range;
				this.yylloc = {
					first_line: this.yylloc.first_line,
					last_line: this.yylineno + 1,
					first_column: this.yylloc.first_column,
					last_column: lines ? (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length : this.yylloc.first_column - len
				};
				if (this.options.ranges) this.yylloc.range = [r[0], r[0] + this.yyleng - len];
				this.yyleng = this.yytext.length;
				return this;
			},
			more: function() {
				this._more = true;
				return this;
			},
			reject: function() {
				if (this.options.backtrack_lexer) this._backtrack = true;
				else return this.parseError("Lexical error on line " + (this.yylineno + 1) + ". You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n" + this.showPosition(), {
					text: "",
					token: null,
					line: this.yylineno
				});
				return this;
			},
			less: function(n) {
				this.unput(this.match.slice(n));
			},
			pastInput: function() {
				var past = this.matched.substr(0, this.matched.length - this.match.length);
				return (past.length > 20 ? "..." : "") + past.substr(-20).replace(/\n/g, "");
			},
			upcomingInput: function() {
				var next = this.match;
				if (next.length < 20) next += this._input.substr(0, 20 - next.length);
				return (next.substr(0, 20) + (next.length > 20 ? "..." : "")).replace(/\n/g, "");
			},
			showPosition: function() {
				var pre = this.pastInput();
				var c = new Array(pre.length + 1).join("-");
				return pre + this.upcomingInput() + "\n" + c + "^";
			},
			test_match: function(match, indexed_rule) {
				var token, lines, backup;
				if (this.options.backtrack_lexer) {
					backup = {
						yylineno: this.yylineno,
						yylloc: {
							first_line: this.yylloc.first_line,
							last_line: this.last_line,
							first_column: this.yylloc.first_column,
							last_column: this.yylloc.last_column
						},
						yytext: this.yytext,
						match: this.match,
						matches: this.matches,
						matched: this.matched,
						yyleng: this.yyleng,
						offset: this.offset,
						_more: this._more,
						_input: this._input,
						yy: this.yy,
						conditionStack: this.conditionStack.slice(0),
						done: this.done
					};
					if (this.options.ranges) backup.yylloc.range = this.yylloc.range.slice(0);
				}
				lines = match[0].match(/(?:\r\n?|\n).*/g);
				if (lines) this.yylineno += lines.length;
				this.yylloc = {
					first_line: this.yylloc.last_line,
					last_line: this.yylineno + 1,
					first_column: this.yylloc.last_column,
					last_column: lines ? lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length
				};
				this.yytext += match[0];
				this.match += match[0];
				this.matches = match;
				this.yyleng = this.yytext.length;
				if (this.options.ranges) this.yylloc.range = [this.offset, this.offset += this.yyleng];
				this._more = false;
				this._backtrack = false;
				this._input = this._input.slice(match[0].length);
				this.matched += match[0];
				token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
				if (this.done && this._input) this.done = false;
				if (token) return token;
				else if (this._backtrack) {
					for (var k in backup) this[k] = backup[k];
					return false;
				}
				return false;
			},
			next: function() {
				if (this.done) return this.EOF;
				if (!this._input) this.done = true;
				var token, match, tempMatch, index;
				if (!this._more) {
					this.yytext = "";
					this.match = "";
				}
				var rules = this._currentRules();
				for (var i = 0; i < rules.length; i++) {
					tempMatch = this._input.match(this.rules[rules[i]]);
					if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
						match = tempMatch;
						index = i;
						if (this.options.backtrack_lexer) {
							token = this.test_match(tempMatch, rules[i]);
							if (token !== false) return token;
							else if (this._backtrack) {
								match = false;
								continue;
							} else return false;
						} else if (!this.options.flex) break;
					}
				}
				if (match) {
					token = this.test_match(match, rules[index]);
					if (token !== false) return token;
					return false;
				}
				if (this._input === "") return this.EOF;
				else return this.parseError("Lexical error on line " + (this.yylineno + 1) + ". Unrecognized text.\n" + this.showPosition(), {
					text: "",
					token: null,
					line: this.yylineno
				});
			},
			lex: function lex() {
				var r = this.next();
				if (r) return r;
				else return this.lex();
			},
			begin: function begin(condition) {
				this.conditionStack.push(condition);
			},
			popState: function popState() {
				if (this.conditionStack.length - 1 > 0) return this.conditionStack.pop();
				else return this.conditionStack[0];
			},
			_currentRules: function _currentRules() {
				if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
				else return this.conditions["INITIAL"].rules;
			},
			topState: function topState(n) {
				n = this.conditionStack.length - 1 - Math.abs(n || 0);
				if (n >= 0) return this.conditionStack[n];
				else return "INITIAL";
			},
			pushState: function pushState(condition) {
				this.begin(condition);
			},
			stateStackSize: function stateStackSize() {
				return this.conditionStack.length;
			},
			options: { "case-insensitive": true },
			performAction: function anonymous(yy, yy_, $avoiding_name_collisions, YY_START) {
				switch ($avoiding_name_collisions) {
					case 0:
						this.begin("acc_title");
						return 24;
					case 1:
						this.popState();
						return "acc_title_value";
					case 2:
						this.begin("acc_descr");
						return 26;
					case 3:
						this.popState();
						return "acc_descr_value";
					case 4:
						this.begin("acc_descr_multiline");
						break;
					case 5:
						this.popState();
						break;
					case 6: return "acc_descr_multiline_value";
					case 7: return 39;
					case 8: return 40;
					case 9: return 41;
					case 10: return 42;
					case 11: break;
					case 12: return 8;
					case 13: return 55;
					case 14: return 78;
					case 15: return 5;
					case 16:
						this.begin("block");
						return 17;
					case 17: return 54;
					case 18: return 54;
					case 19: return 47;
					case 20: return 15;
					case 21: return 13;
					case 22: break;
					case 23: return 67;
					case 24: return 63;
					case 25: return 63;
					case 26:
						this.begin("block_bq");
						break;
					case 27: return 63;
					case 28:
						this.popState();
						break;
					case 29: return 68;
					case 30: break;
					case 31:
						this.popState();
						return 19;
					case 32: return yy_.yytext[0];
					case 33: return 20;
					case 34: return 21;
					case 35:
						this.begin("style");
						return 49;
					case 36:
						this.popState();
						return 8;
					case 37: break;
					case 38: return 13;
					case 39: return 47;
					case 40: return 54;
					case 41:
						this.begin("style");
						return 43;
					case 42: return 48;
					case 43: return 38;
					case 44: return 34;
					case 45: return 71;
					case 46: return 73;
					case 47: return 73;
					case 48: return 73;
					case 49: return 71;
					case 50: return 71;
					case 51: return 72;
					case 52: return 72;
					case 53: return 72;
					case 54: return 72;
					case 55: return 72;
					case 56: return 73;
					case 57: return 72;
					case 58: return 73;
					case 59: return 74;
					case 60: return 74;
					case 61: return 56;
					case 62: return 74;
					case 63: return 74;
					case 64: return 74;
					case 65: return 57;
					case 66: return 53;
					case 67: return 74;
					case 68: return 71;
					case 69: return 72;
					case 70: return 73;
					case 71: return 75;
					case 72: return 76;
					case 73: return 77;
					case 74: return 77;
					case 75: return 76;
					case 76: return 76;
					case 77: return 76;
					case 78: return 46;
					case 79: return 52;
					case 80: return 45;
					case 81: return yy_.yytext[0];
					case 82: return 7;
				}
			},
			rules: [
				/^(?:accTitle\s*:\s*)/i,
				/^(?:(?!\n||)*[^\n]*)/i,
				/^(?:accDescr\s*:\s*)/i,
				/^(?:(?!\n||)*[^\n]*)/i,
				/^(?:accDescr\s*\{\s*)/i,
				/^(?:[\}])/i,
				/^(?:[^\}]*)/i,
				/^(?:.*direction\s+TB[^\n]*)/i,
				/^(?:.*direction\s+BT[^\n]*)/i,
				/^(?:.*direction\s+RL[^\n]*)/i,
				/^(?:.*direction\s+LR[^\n]*)/i,
				/^(?:[ \t\r]+)/i,
				/^(?:[\n]+)/i,
				/^(?:"[^"%\r\n\v\b\\]+")/i,
				/^(?:"[^"]*")/i,
				/^(?:erDiagram\b)/i,
				/^(?:\{)/i,
				/^(?:#)/i,
				/^(?:#)/i,
				/^(?:,)/i,
				/^(?::::)/i,
				/^(?::)/i,
				/^(?:\s+)/i,
				/^(?:\b((?:PK)|(?:FK)|(?:UK))\b)/i,
				/^(?:([^\s]*)[~].*[~]([^\s]*))/i,
				/^(?:([\*A-Za-z_\u00C0-\uFFFF][A-Za-z0-9\-\_\[\]\(\)\.,\u00C0-\uFFFF\*]*))/i,
				/^(?:[`])/i,
				/^(?:[^`]+)/i,
				/^(?:[`])/i,
				/^(?:"[^"]*")/i,
				/^(?:[\n]+)/i,
				/^(?:\})/i,
				/^(?:.)/i,
				/^(?:\[)/i,
				/^(?:\])/i,
				/^(?:style\b)/i,
				/^(?:[\n]+)/i,
				/^(?:\s+)/i,
				/^(?::)/i,
				/^(?:,)/i,
				/^(?:#)/i,
				/^(?:classDef\b)/i,
				/^(?:class\b)/i,
				/^(?:subgraph\b)/i,
				/^(?:end\b\s*)/i,
				/^(?:one or zero\b)/i,
				/^(?:one or more\b)/i,
				/^(?:one or many\b)/i,
				/^(?:1\+)/i,
				/^(?:\|o\b)/i,
				/^(?:zero or one\b)/i,
				/^(?:zero or more\b)/i,
				/^(?:zero or many\b)/i,
				/^(?:0\+)/i,
				/^(?:\}o\b)/i,
				/^(?:many\(0\))/i,
				/^(?:many\(1\))/i,
				/^(?:many\b)/i,
				/^(?:\}\|)/i,
				/^(?:one\b)/i,
				/^(?:only one\b)/i,
				/^(?:[0-9]+\.[0-9]+)/i,
				/^(?:1(?=\s+[A-Za-z_"']))/i,
				/^(?:1(?=\s+[0-9]))/i,
				/^(?:1(?=(--|\.\.|\.-|-\.)))/i,
				/^(?:1\b)/i,
				/^(?:[0-9]+)/i,
				/^(?:\|\|)/i,
				/^(?:o\|)/i,
				/^(?:o\{)/i,
				/^(?:\|\{)/i,
				/^(?:u(?=[\.\-\|]))/i,
				/^(?:\.\.)/i,
				/^(?:--)/i,
				/^(?:to\b)/i,
				/^(?:optionally to\b)/i,
				/^(?:\.-)/i,
				/^(?:-\.)/i,
				/^(?:([^\x00-\x7F]|\w|-|\*)+)/i,
				/^(?:;)/i,
				/^(?:([^\x00-\x7F]|\w|-|\*|\.)+)/i,
				/^(?:.)/i,
				/^(?:$)/i
			],
			conditions: {
				"style": {
					"rules": [
						36,
						37,
						38,
						39,
						40,
						78,
						79
					],
					"inclusive": false
				},
				"acc_descr_multiline": {
					"rules": [5, 6],
					"inclusive": false
				},
				"acc_descr": {
					"rules": [3],
					"inclusive": false
				},
				"acc_title": {
					"rules": [1],
					"inclusive": false
				},
				"block_bq": {
					"rules": [27, 28],
					"inclusive": false
				},
				"block": {
					"rules": [
						22,
						23,
						24,
						25,
						26,
						29,
						30,
						31,
						32
					],
					"inclusive": false
				},
				"INITIAL": {
					"rules": [
						0,
						2,
						4,
						7,
						8,
						9,
						10,
						11,
						12,
						13,
						14,
						15,
						16,
						17,
						18,
						19,
						20,
						21,
						33,
						34,
						35,
						41,
						42,
						43,
						44,
						45,
						46,
						47,
						48,
						49,
						50,
						51,
						52,
						53,
						54,
						55,
						56,
						57,
						58,
						59,
						60,
						61,
						62,
						63,
						64,
						65,
						66,
						67,
						68,
						69,
						70,
						71,
						72,
						73,
						74,
						75,
						76,
						77,
						80,
						81,
						82
					],
					"inclusive": true
				}
			}
		};
	})();
	function Parser() {
		this.yy = {};
	}
	Parser.prototype = parser;
	parser.Parser = Parser;
	return new Parser();
})();
const parser = er;
er.Parser;
(() => {
	const result = {};
	for (const [linetypeStr, arrowType] of Object.entries(LINETYPE_TO_ARROW_TYPE)) result[arrowType] = Number(linetypeStr);
	return result;
})();
LINETYPE.LOOP_START, LINETYPE.ALT_START, LINETYPE.OPT_START, LINETYPE.PAR_START, LINETYPE.PAR_OVER_START, LINETYPE.CRITICAL_START, LINETYPE.BREAK_START, LINETYPE.RECT_START;
LINETYPE.LOOP_END, LINETYPE.ALT_END, LINETYPE.OPT_END, LINETYPE.PAR_END, LINETYPE.PAR_END, LINETYPE.CRITICAL_END, LINETYPE.BREAK_END, LINETYPE.RECT_END;
LINETYPE.ALT_ELSE, LINETYPE.PAR_AND, LINETYPE.CRITICAL_OPTION;
PLACEMENT.LEFTOF, PLACEMENT.RIGHTOF, PLACEMENT.OVER;
//#endregion
//#region src/serializer/parser/sequence/sequence-parser.ts
/**
* sequence 解析器
*
* 单一职责：将 Mermaid sequenceDiagram 代码解析为 SequenceCanvasState
*
* 数据流:
*   源代码字符串
*     → 加载 jison 生成的 sequence-parser.cjs
*     → 创建 SequenceDB 实例，作为 yy 传入 parser
*     → parser.parse(source) 调用 SequenceDB.apply/parseMessage/... 收集数据
*     → SequenceDB.getData() 返回 SequenceAST
*     → mapAstToCanvasState(ast) 映射为 SequenceCanvasState
*
* 错误处理:
*   - jison 抛出的语法错误被捕获，转换为 ParseError[]
*   - 解析成功时 errors 为空数组
*/
/** sequence jison 解析器实例 */
const sequenceJisonParser = parser$2;
/** PARTICIPANT_TYPE 字符串字面量集合，用于校验 actor.type */
const VALID_ACTOR_TYPES = /* @__PURE__ */ new Set([
	"participant",
	"actor",
	"boundary",
	"collections",
	"control",
	"database",
	"entity",
	"queue"
]);
/**
* 将 SequenceAST 映射为 SequenceCanvasState
*
* 映射规则（单一数据源）:
*   - actors → participants: SequenceParticipant[]
*   - messages（普通消息）→ messages: SequenceMessage[]
*   - messages（块标记）→ blocks: SequenceBlockInfo[]
*   - notes → notes: SequenceNoteInfo[]
*   - boxes → boxes: SequenceBoxInfo[]
*   - createdActors/destroyedActors → 派生到 message.create/destroy
*   - sequenceNumbersEnabled → autonumber
*/
function mapAstToCanvasState(ast) {
	const participants = [];
	const messages = [];
	const blocks = [];
	const notes = [];
	const boxes = [];
	let boxIndex = 0;
	for (const box of ast.boxes) {
		const boxId = `box-${boxIndex}`;
		boxes.push({
			id: boxId,
			name: box.name,
			color: box.fill,
			actorKeys: [...box.actorKeys],
			wrap: box.wrap
		});
		boxIndex++;
	}
	for (const [actorId, actor] of ast.actors) participants.push({
		id: actorId,
		label: actor.description || actor.name,
		actorType: normalizeActorType(actor.type),
		...actor.explicitlyDeclared !== void 0 ? { explicitlyDeclared: actor.explicitlyDeclared } : {},
		...actor.wrap ? { wrap: true } : {},
		...Object.keys(actor.links).length > 0 ? { links: actor.links } : {},
		...Object.keys(actor.properties).length > 0 ? { properties: actor.properties } : {}
	});
	const blockStack = [];
	let messageSequence = 0;
	let lastMessageIndex;
	let autonumberEnabled = false;
	const msgIndexToMessageIndex = /* @__PURE__ */ new Map();
	let noteIndex = 0;
	for (let i = 0; i < ast.messages.length; i++) {
		const msg = ast.messages[i];
		const linetype = msg.type;
		if (linetype === LINETYPE.AUTONUMBER) {
			if (typeof msg.message === "object" && msg.message !== null) {
				if (msg.message.visible) autonumberEnabled = true;
				else autonumberEnabled = false;
			}
			continue;
		}
		if (linetype === LINETYPE.NOTE) {
			const placementNum = typeof msg.placement === "number" ? msg.placement : PLACEMENT.OVER;
			const position = placementNum === PLACEMENT.LEFTOF ? "left" : placementNum === PLACEMENT.RIGHTOF ? "right" : "over";
			const noteMessage = typeof msg.message === "string" ? msg.message : "";
			const astNote = ast.notes[noteIndex];
			noteIndex++;
			if (!astNote) throw new Error(`mapAstToCanvasState: NOTE signal at messages[${i}] has no corresponding note in ast.notes (noteIndex=${noteIndex - 1})`);
			notes.push({
				participantIds: astNote.participantIds,
				position,
				label: noteMessage,
				messageIndex: messageSequence
			});
			continue;
		}
		if (linetype !== void 0) {
			const blockTypeStr = LINETYPE_TO_BLOCK_TYPE[linetype];
			if (blockTypeStr) {
				const blockType = blockTypeStr;
				const blockLabel = typeof msg.message === "string" ? msg.message : "";
				if (isBlockStart(linetype)) {
					const isRect = linetype === LINETYPE.RECT_START;
					const rectColor = isRect ? msg.color : void 0;
					const mainLabel = isRect ? "" : blockLabel;
					blockStack.push({
						type: blockType,
						label: mainLabel,
						color: rectColor,
						startMessage: messageSequence,
						midBranches: [],
						currentBranch: {
							type: "main",
							label: mainLabel,
							startMessage: messageSequence
						}
					});
				} else if (isBlockEnd(linetype)) {
					const frame = blockStack.pop();
					if (frame) {
						if (frame.currentBranch.type !== "main") frame.midBranches.push({
							type: frame.currentBranch.type,
							label: frame.currentBranch.label,
							startMessage: frame.currentBranch.startMessage,
							endMessage: messageSequence
						});
						blocks.push({
							type: frame.type,
							label: frame.label,
							...frame.color !== void 0 ? { color: frame.color } : {},
							startMessage: frame.startMessage,
							endMessage: messageSequence,
							midBranches: frame.midBranches
						});
					}
				} else if (isBlockMid(linetype)) {
					const frame = blockStack[blockStack.length - 1];
					if (frame) {
						const midType = linetype === LINETYPE.ALT_ELSE ? "else" : linetype === LINETYPE.PAR_AND ? "and" : "option";
						if (frame.currentBranch.type !== "main") frame.midBranches.push({
							type: frame.currentBranch.type,
							label: frame.currentBranch.label,
							startMessage: frame.currentBranch.startMessage,
							endMessage: messageSequence
						});
						frame.currentBranch = {
							type: midType,
							label: blockLabel,
							startMessage: messageSequence
						};
					}
				}
				continue;
			}
			if (linetype === LINETYPE.ACTIVE_START) {
				const actor = msg.from;
				if (actor !== void 0 && lastMessageIndex !== void 0 && messages[lastMessageIndex]) {
					const lastMsg = messages[lastMessageIndex];
					if (lastMsg.activate !== true) {
						if (!lastMsg.activateActors) lastMsg.activateActors = [];
						lastMsg.activateActors.push(actor);
					}
				}
				continue;
			}
			if (linetype === LINETYPE.ACTIVE_END) {
				const actor = msg.from;
				if (actor !== void 0 && lastMessageIndex !== void 0 && messages[lastMessageIndex]) {
					const lastMsg = messages[lastMessageIndex];
					if (lastMsg.deactivate !== true) {
						if (!lastMsg.deactivateActors) lastMsg.deactivateActors = [];
						lastMsg.deactivateActors.push(actor);
					}
				}
				continue;
			}
		}
		if (msg.from && msg.to && linetype !== void 0) {
			const effectiveLinetype = msg.centralConnection && msg.centralConnection !== 0 ? msg.centralConnection : linetype;
			const arrowTypeStr = LINETYPE_TO_ARROW_TYPE[effectiveLinetype];
			if (!arrowTypeStr) throw new Error(`mapAstToCanvasState: unknown LINETYPE "${String(effectiveLinetype)}" cannot map to SequenceArrowType`);
			const arrowType = arrowTypeStr;
			const messageText = typeof msg.message === "string" ? msg.message : "";
			const message = {
				id: `seq-msg-${messageSequence}`,
				from: msg.from,
				to: msg.to,
				label: messageText,
				messageType: arrowType,
				sequence: messageSequence,
				...msg.activate ? { activate: true } : {},
				...msg.deactivate ? { deactivate: true } : {}
			};
			messages.push(message);
			lastMessageIndex = messages.length - 1;
			msgIndexToMessageIndex.set(i, lastMessageIndex);
			messageSequence++;
		}
	}
	while (blockStack.length > 0) {
		const frame = blockStack.pop();
		if (frame) {
			if (frame.currentBranch.type !== "main") frame.midBranches.push({
				type: frame.currentBranch.type,
				label: frame.currentBranch.label,
				startMessage: frame.currentBranch.startMessage,
				endMessage: messageSequence
			});
			blocks.push({
				type: frame.type,
				label: frame.label,
				...frame.color !== void 0 ? { color: frame.color } : {},
				startMessage: frame.startMessage,
				endMessage: messageSequence,
				midBranches: frame.midBranches
			});
		}
	}
	for (const [actorId, msgIndex] of ast.createdActors) {
		const messageIndex = msgIndexToMessageIndex.get(msgIndex);
		if (messageIndex !== void 0 && messages[messageIndex].to === actorId) messages[messageIndex].create = true;
	}
	for (const [actorId, msgIndex] of ast.destroyedActors) {
		const messageIndex = msgIndexToMessageIndex.get(msgIndex);
		if (messageIndex !== void 0 && messages[messageIndex].to === actorId) messages[messageIndex].destroy = true;
	}
	return {
		diagramType: "sequenceDiagram",
		participants,
		messages,
		notes,
		blocks,
		boxes,
		autonumber: autonumberEnabled,
		...ast.accTitle ? { accTitle: ast.accTitle } : {},
		...ast.accDescr ? { accDescription: ast.accDescr } : {}
	};
}
/**
* 校验 actor.type 字符串并断言为 SequenceActorType
*
* PARTICIPANT_TYPE 常量值（'actor'/'boundary'/...）与 SequenceActorType 字面量完全一致，
* 但 Actor.type 类型是 string，需要校验后断言为 SequenceActorType。
* 未知值抛错（程序错误不可包容，code-standards.md 第5条）。
*/
function normalizeActorType(type) {
	if (VALID_ACTOR_TYPES.has(type)) return type;
	throw new Error(`normalizeActorType: unknown actor type "${type}"`);
}
/** 判断 LINETYPE 是否为块开始 */
function isBlockStart(linetype) {
	return linetype === LINETYPE.LOOP_START || linetype === LINETYPE.ALT_START || linetype === LINETYPE.OPT_START || linetype === LINETYPE.PAR_START || linetype === LINETYPE.PAR_OVER_START || linetype === LINETYPE.CRITICAL_START || linetype === LINETYPE.BREAK_START || linetype === LINETYPE.RECT_START;
}
/** 判断 LINETYPE 是否为块结束 */
function isBlockEnd(linetype) {
	return linetype === LINETYPE.LOOP_END || linetype === LINETYPE.ALT_END || linetype === LINETYPE.OPT_END || linetype === LINETYPE.PAR_END || linetype === LINETYPE.CRITICAL_END || linetype === LINETYPE.BREAK_END || linetype === LINETYPE.RECT_END;
}
/** 判断 LINETYPE 是否为块中间分支（else/and/option） */
function isBlockMid(linetype) {
	return linetype === LINETYPE.ALT_ELSE || linetype === LINETYPE.PAR_AND || linetype === LINETYPE.CRITICAL_OPTION;
}
/**
* 解析 sequenceDiagram 代码为 SequenceCanvasState
*
* 预处理（架构修复）:
*   - 内部调用 preprocessCode 清理 frontmatter/指令/注释（保持行号一致）
*   - jison 解析清理后的 code，错误上下文使用原始 source
*
* @param source - Mermaid sequenceDiagram 源代码（可含 %% 注释、%%{directive}%%、frontmatter）
* @returns 解析结果（包含 canvas 和 errors）
*/
function parseSequence(source) {
	const parser = sequenceJisonParser;
	const sequenceDB = new SequenceDB();
	parser.yy = sequenceDB;
	try {
		const preprocessedSource = preprocessCode(source);
		const normalizedSource = preprocessedSource.endsWith("\n") ? preprocessedSource : preprocessedSource + "\n";
		parser.parse(normalizedSource);
		return {
			success: true,
			canvas: mapAstToCanvasState(sequenceDB.getData()),
			errors: []
		};
	} catch (err) {
		return {
			success: false,
			canvas: {
				diagramType: "sequenceDiagram",
				participants: [],
				messages: [],
				notes: [],
				blocks: [],
				boxes: [],
				autonumber: false
			},
			errors: [{
				line: extractLine(err),
				column: extractColumn(err),
				message: extractMessage(err),
				severity: "error",
				context: source.split("\n")[extractLine(err) - 1] ?? void 0
			}]
		};
	} finally {
		parser.yy = {};
	}
}
function extractLine(err) {
	if (err && typeof err === "object") {
		const line = err.line;
		if (typeof line === "number") return line;
		const hash = err.hash;
		if (hash && typeof hash.line === "number") return hash.line;
	}
	return 1;
}
function extractColumn(err) {
	if (err && typeof err === "object") {
		const column = err.column;
		if (typeof column === "number") return column;
		const hash = err.hash;
		if (hash && typeof hash.column === "number") return hash.column;
	}
	return 1;
}
function extractMessage(err) {
	if (err instanceof Error) return err.message || "sequence parse error";
	if (typeof err === "string") return err;
	if (err && typeof err === "object") {
		const message = err.message;
		if (typeof message === "string") return message;
	}
	return "sequence parse error";
}
//#endregion
//#region src/serializer/recognizer/flowchart-recognizer.ts
/**
* flowchart 识别器 — 将 Mermaid flowchart 代码识别为 FlowchartRecognizedBlock[] 流
*
* 设计文档：docs/design/modular-recognizer-converter-assembler.md
* 阶段：Stage 3
*
* 数据流：
*   code → preprocessCode → flowJisonParser.parse(code) [yy=RecognizerCollector]
*        → RecognizerCollector 收集 block → getBlocks() → FlowchartRecognizedBlock[]
*
* 关键决策：
*   - 决策10 方案B：适配器模式，RecognizerCollector 实现 FlowDBYY 接口，
*     保留 mermaid jison 原文件不变，仅在 parser.yy 上下文做替换
*     （注：flow.jison 新增 subgraphStart 非终结符触发 enterScope，见 sibling-subgraph-fix.md）
*   - 决策11：pendingStack 栈结构解决 addSubGraph 顺序倒置 + 平级 subgraph 问题
*   - 决策14：preserveIndent 语义收缩（仅保留缩进与顺序）
*
* pendingStack 机制（决策11 栈结构实现）：
*   jison addSubGraph 在子内容解析完后调用（顺序倒置，证据见 flow.jison:380-387）。
*   为区分平级 subgraph 各自的子内容，RecognizerCollector 维护 pendingStack 栈：
*     - enterScope()（jison subgraphStart 归约时调用）push 新空 scope
*     - addVertex/addLink 等 push block 到栈顶 scope
*     - addSubGraph pop 栈顶 scope 作为 childBlocks，递增 indent（+2），
*       打包 [openBlock, ...childBlocks, closeBlock] push 到外层 scope
*   平级 subgraph：各自独立 scope，互不累积，打包后在外层 scope 中平级。
*   嵌套 subgraph：内层先 addSubGraph pop 打包，外层后 addSubGraph pop（含内层打包）再打包。
*
*   历史教训：曾简化为单数组 blocks，导致平级 subgraph 被错误嵌套（第二个 subgraph
*   把第一个 subgraph 的打包结果当作自己的 childBlocks）。根因是单数组无法区分
*   不同 subgraph 的子内容。已恢复为栈结构，详见 docs/design/sibling-subgraph-fix.md。
*
* 已知限制（待 Stage 4 EdgeConverter 实现时决策）：
*   - shapeData 节点元数据（@{ icon, form, pos, img, ... }）未完整承载到 VertexBlock，
*     仅处理 shape 字段（覆盖 type）。其他字段在 Converter 阶段会丢失。
*     原因：VertexBlock 接口未声明这些字段，扩展接口属于 Stage 2 骨架的修订。
*   - shapeData 边元数据（@{ animate, animation, curve }）未承载到 EdgeBlock。
*     原因：EdgeBlock 接口未声明这些字段，且 MermaidEdgeData 未显式声明 animation 字段。
*   - hasSourceVertexDef / hasTargetVertexDef 均设为 false。
*     原因：jison addLink 不提供"边是否同时定义了 source/target 顶点"信息，
*     Converter 可通过 vertexId 集合判断是否需要创建顶点（重复 VertexBlock 会更新已有 MermaidNode）。
*
* 模块边界：仅依赖 ./types.js（RecognizedBlock）、./index.js（IBlockRecognizer）、
* ../parser/jison/flow-parser.js、../detector/preprocessor.js、../parser/direction-utils.js、
* ../parser/flowchart/flow-db.js（FlowDBYY 类型）、../ast/flowchart-ast.js、../types.js。
* 不引用 React/DOM。
*/
const flowJisonParser = parser$3;
const SHAPE_ALIAS_MAP = {
	"rect": "rect",
	"proc": "rect",
	"process": "rect",
	"rectangle": "rect",
	"squarerect": "rect",
	"rounded": "rounded",
	"event": "rounded",
	"roundedrect": "rounded",
	"stadium": "stadium",
	"terminal": "stadium",
	"pill": "stadium",
	"subroutine": "subroutine",
	"subprocess": "subroutine",
	"subproc": "subroutine",
	"framed-rectangle": "subroutine",
	"fr-rect": "subroutine",
	"cylinder": "cylinder",
	"cyl": "cylinder",
	"db": "cylinder",
	"database": "cylinder",
	"datastore": "datastore",
	"data-store": "datastore",
	"circle": "circle",
	"circ": "circle",
	"doublecircle": "doublecircle",
	"double-circle": "doublecircle",
	"dbl-circ": "doublecircle",
	"diamond": "diamond",
	"diam": "diamond",
	"decision": "diamond",
	"question": "diamond",
	"hexagon": "hexagon",
	"hex": "hexagon",
	"prepare": "hexagon",
	"lean-right": "lean-right",
	"lean-r": "lean-right",
	"in-out": "lean-right",
	"lean_right": "lean-right",
	"lean-left": "lean-left",
	"lean-l": "lean-left",
	"out-in": "lean-left",
	"lean_left": "lean-left",
	"trapezoid": "trapezoid",
	"trap-b": "trapezoid",
	"priority": "trapezoid",
	"trapezoid-bottom": "trapezoid",
	"trapezoid-reverse": "trapezoid-reverse",
	"trap-t": "trapezoid-reverse",
	"manual": "trapezoid-reverse",
	"trapezoid-top": "trapezoid-reverse",
	"inv-trapezoid": "trapezoid-reverse",
	"inv_trapezoid": "trapezoid-reverse",
	"odd": "odd",
	"rect_left_inv_arrow": "odd",
	"text": "text",
	"card": "card",
	"notched-rectangle": "card",
	"notch-rect": "card",
	"lined-rectangle": "lined-rectangle",
	"lin-rect": "lined-rectangle",
	"lined-process": "lined-rectangle",
	"lin-proc": "lined-rectangle",
	"shaded-process": "lined-rectangle",
	"small-circle": "small-circle",
	"sm-circ": "small-circle",
	"start": "small-circle",
	"statestart": "small-circle",
	"framed-circle": "framed-circle",
	"fr-circ": "framed-circle",
	"stop": "framed-circle",
	"stateend": "framed-circle",
	"fork-join": "fork-join",
	"fork": "fork-join",
	"join": "fork-join",
	"forkjoin": "fork-join",
	"hourglass": "hourglass",
	"collate": "hourglass",
	"brace-left": "brace-left",
	"brace": "brace-left",
	"brace-l": "brace-left",
	"comment": "brace-left",
	"brace-right": "brace-right",
	"brace-r": "brace-right",
	"braces": "braces",
	"lightning-bolt": "lightning-bolt",
	"bolt": "lightning-bolt",
	"com-link": "lightning-bolt",
	"document": "document",
	"doc": "document",
	"delay": "delay",
	"half-rounded-rectangle": "delay",
	"horizontal-cylinder": "horizontal-cylinder",
	"h-cyl": "horizontal-cylinder",
	"das": "horizontal-cylinder",
	"lined-cylinder": "lined-cylinder",
	"lin-cyl": "lined-cylinder",
	"disk": "lined-cylinder",
	"curved-trapezoid": "curved-trapezoid",
	"curv-trap": "curved-trapezoid",
	"display": "curved-trapezoid",
	"divided-rectangle": "divided-rectangle",
	"div-rect": "divided-rectangle",
	"div-proc": "divided-rectangle",
	"divided-process": "divided-rectangle",
	"triangle": "triangle",
	"tri": "triangle",
	"extract": "triangle",
	"window-pane": "window-pane",
	"win-pane": "window-pane",
	"internal-storage": "window-pane",
	"filled-circle": "filled-circle",
	"f-circ": "filled-circle",
	"junction": "filled-circle",
	"notched-pentagon": "notched-pentagon",
	"notch-pent": "notched-pentagon",
	"loop-limit": "notched-pentagon",
	"flipped-triangle": "flipped-triangle",
	"flip-tri": "flipped-triangle",
	"manual-file": "flipped-triangle",
	"sloped-rectangle": "sloped-rectangle",
	"sl-rect": "sloped-rectangle",
	"manual-input": "sloped-rectangle",
	"stacked-document": "stacked-document",
	"docs": "stacked-document",
	"documents": "stacked-document",
	"st-doc": "stacked-document",
	"stacked-rectangle": "stacked-rectangle",
	"st-rect": "stacked-rectangle",
	"procs": "stacked-rectangle",
	"processes": "stacked-rectangle",
	"bow-tie-rectangle": "bow-tie-rectangle",
	"bow-rect": "bow-tie-rectangle",
	"stored-data": "bow-tie-rectangle",
	"crossed-circle": "crossed-circle",
	"cross-circ": "crossed-circle",
	"summary": "crossed-circle",
	"tagged-document": "tagged-document",
	"tag-doc": "tagged-document",
	"tagged-rectangle": "tagged-rectangle",
	"tag-rect": "tagged-rectangle",
	"tag-proc": "tagged-rectangle",
	"tagged-process": "tagged-rectangle",
	"flag": "flag",
	"paper-tape": "flag",
	"lined-document": "lined-document",
	"lin-doc": "lined-document",
	"note": "note",
	"cloud": "cloud",
	"bang": "bang"
};
/**
* jison 语法层顶点类型 → MermaidShapeType 映射
* 对齐 flowchart-parser.ts 的 mapVertexType 逻辑
*
* @param type - jison 语法层类型（FlowVertexTypeParam）或 shapeData 扩展形状名
*/
function mapVertexType(type) {
	if (type === void 0) return;
	switch (type) {
		case "square": return "rect";
		case "round": return "rounded";
		case "ellipse": return "ellipse";
		case "stadium": return "stadium";
		case "subroutine": return "subroutine";
		case "cylinder": return "cylinder";
		case "circle": return "circle";
		case "doublecircle": return "doublecircle";
		case "diamond": return "diamond";
		case "hexagon": return "hexagon";
		case "odd": return "odd";
		case "trapezoid": return "trapezoid";
		case "inv_trapezoid": return "trapezoid-reverse";
		case "lean_right": return "lean-right";
		case "lean_left": return "lean-left";
		case "rect": return "rect";
		default:
			const normalized = type.toLowerCase();
			const mapped = SHAPE_ALIAS_MAP[normalized];
			if (mapped !== void 0) return mapped;
			return type;
	}
}
/**
* 边类型 + 线型 → MermaidEdgeStyle 映射
* 对齐 flowchart-parser.ts 的 mapEdgeStyle 逻辑
*/
function mapEdgeStyle(type, stroke) {
	if (stroke === "invisible") return "invisible";
	if (type === "double_arrow_point") return stroke === "thick" ? "thick-arrow" : stroke === "dotted" ? "dotted-arrow" : "bidirectional-arrow";
	if (type === "double_arrow_circle") return stroke === "dotted" ? "dotted-circle" : "bidirectional-circle";
	if (type === "double_arrow_cross") return stroke === "dotted" ? "dotted-cross" : "bidirectional-cross";
	const arrowPart = type === "arrow_point" ? "arrow" : type === "arrow_circle" ? "circle" : type === "arrow_cross" ? "cross" : "line";
	switch (stroke) {
		case "thick": return arrowPart === "arrow" ? "thick-arrow" : arrowPart === "circle" ? "thick-circle" : arrowPart === "cross" ? "thick-cross" : "thick-line";
		case "dotted": return arrowPart === "arrow" ? "dotted-arrow" : arrowPart === "circle" ? "dotted-circle" : arrowPart === "cross" ? "dotted-cross" : "dotted";
		default: return arrowPart;
	}
}
/**
* 解析 shapeData YAML 字符串（对齐 flow-db.ts parseShapeData）
* shapeData 语法：@{ shape: xxx, label: xxx, ... }
*/
function parseShapeData(metadata) {
	if (metadata === void 0 || metadata === null) return;
	const metadataStr = typeof metadata === "string" ? metadata : String(metadata);
	let yamlData;
	if (!metadataStr.includes("\n")) yamlData = "{\n" + metadataStr + "\n}";
	else yamlData = metadataStr + "\n";
	try {
		return yaml.load(yamlData, { schema: yaml.JSON_SCHEMA });
	} catch {
		return;
	}
}
/** 规范化标签类型（对齐 flow-db.ts sanitizeNodeLabelType） */
function sanitizeLabelType(labelType) {
	if (labelType === void 0) return;
	switch (labelType) {
		case "markdown":
		case "string":
		case "text": return labelType;
		default: return "markdown";
	}
}
/** 去除首尾引号（对齐 flow-db.ts addVertex/addSingleLink 的引号处理） */
function stripQuotes(text) {
	const trimmed = text.trim();
	if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) return trimmed.substring(1, trimmed.length - 1);
	return trimmed;
}
/** 计算字符串中某字符的出现次数（对齐 flow-db.ts countChar） */
function countChar(char, str) {
	let count = 0;
	for (let i = 0; i < str.length; ++i) if (str[i] === char) ++count;
	return count;
}
/** 解析边起始端语法（对齐 flow-db.ts destructStartLink） */
function destructStartLink(_str) {
	let str = _str.trim();
	let type = "arrow_open";
	switch (str[0]) {
		case "<":
			type = "arrow_point";
			str = str.slice(1);
			break;
		case "x":
			type = "arrow_cross";
			str = str.slice(1);
			break;
		case "o":
			type = "arrow_circle";
			str = str.slice(1);
	}
	let stroke = "normal";
	if (str.includes("=")) stroke = "thick";
	if (str.includes(".")) stroke = "dotted";
	return {
		type,
		stroke
	};
}
/** 解析边终端语法（对齐 flow-db.ts destructEndLink） */
function destructEndLink(_str) {
	const str = _str.trim();
	const line = str.slice(0, -1);
	let type = "arrow_open";
	switch (str.slice(-1)) {
		case "x":
			type = "arrow_cross";
			if (str.startsWith("x")) type = "double_" + type;
			break;
		case ">":
			type = "arrow_point";
			if (str.startsWith("<")) type = "double_" + type;
			break;
		case "o":
			type = "arrow_circle";
			if (str.startsWith("o")) type = "double_" + type;
	}
	let stroke = "normal";
	let length = line.length - 1;
	if (line.startsWith("=")) stroke = "thick";
	if (line.startsWith("~")) stroke = "invisible";
	const dots = countChar(".", line);
	if (dots) {
		stroke = "dotted";
		length = dots;
	}
	return {
		type,
		stroke,
		length
	};
}
/**
* 解析边语法（jison 调用，对齐 flow-db.ts destructLink）
* @param _str - 边字符串（如 "-->", "--x", "--o", "==>"）
* @param _startStr - 起始端字符串（可选，如 "<--", "x--", "o--"）
*/
function destructLink(_str, _startStr) {
	const info = destructEndLink(_str);
	if (_startStr) {
		const startInfo = destructStartLink(_startStr);
		if (startInfo.stroke !== info.stroke) return {
			type: "INVALID",
			stroke: "INVALID"
		};
		if (startInfo.type === "arrow_open") startInfo.type = info.type;
		else {
			if (startInfo.type !== info.type) return {
				type: "INVALID",
				stroke: "INVALID"
			};
			startInfo.type = "double_" + startInfo.type;
		}
		if (startInfo.type === "double_arrow") startInfo.type = "double_arrow_point";
		startInfo.length = info.length;
		return startInfo;
	}
	return info;
}
/**
* 规范化 linkStyle 位置列表
*
* jison numList 规则产出的 NUM token 值是字符串（如 "0"），而 'default' 来自 DEFAULT token。
* TypeScript 签名声明为 `('default' | number)[]`，但运行时 jison 传入的是字符串。
* 此函数把字符串数字转换为 number，'default' 保持不变，消除类型与运行时的不一致。
*
* 对齐 flow-db.ts updateLink 的行为：JavaScript 用 `this.edges[pos]` 时自动转换字符串索引，
* RecognizerCollector 不依赖隐式转换，显式规范化以通过 typeof 检查。
*/
function normalizeLinkStylePositions(positions) {
	return positions.map((p) => {
		if (p === "default") return "default";
		if (typeof p === "number") return p;
		const num = Number(p);
		return Number.isNaN(num) ? p : num;
	});
}
/** 从 list 提取 direction 语句（对齐 flow-db.ts uniqSubgraphList 的 direction 提取逻辑） */
function extractDirectionFromList(list) {
	for (const item of list.flat()) if (item && typeof item === "object" && "stmt" in item && item.stmt === "dir") {
		const value = item.value;
		return { dir: normalizeDirection(value) };
	}
	return { dir: void 0 };
}
/**
* RecognizerCollector — flowchart 识别数据收集器
*
* 实现 FlowDBYY 接口（与 FlowDB 相同的方法签名），但内部产出 RecognizedBlock
* 而非 mutate 状态（决策10 方案B 适配器模式）。
*
* 与 FlowDB 的差异：
*   - 不维护 vertices/edges/subGraphs 等状态，只维护 blocks 数组
*   - addVertex/addLink 产出 VertexBlock/EdgeBlock 加入 blocks
*   - addSubGraph 将 blocks 包装为 SubgraphOpenBlock + blocks + SubgraphCloseBlock
*   - 其他方法产出对应 block 加入 blocks
*
* jison 只支持直接属性，因此所有 jison 调用的方法都在构造函数中 bind。
*/
var RecognizerCollector = class {
	constructor() {
		this.pendingStack = [[]];
		this.edges = [];
		this.subCount = 0;
		this.firstGraphFlag = true;
		this.addVertex = this.addVertex.bind(this);
		this.addLink = this.addLink.bind(this);
		this.destructLink = this.destructLink.bind(this);
		this.addSubGraph = this.addSubGraph.bind(this);
		this.addClass = this.addClass.bind(this);
		this.setClass = this.setClass.bind(this);
		this.setLink = this.setLink.bind(this);
		this.updateLink = this.updateLink.bind(this);
		this.updateLinkInterpolate = this.updateLinkInterpolate.bind(this);
		this.setClickEvent = this.setClickEvent.bind(this);
		this.setTooltip = this.setTooltip.bind(this);
		this.setDirection = this.setDirection.bind(this);
		this.setAccTitle = this.setAccTitle.bind(this);
		this.setAccDescription = this.setAccDescription.bind(this);
		this.setDiagramTitle = this.setDiagramTitle.bind(this);
		this.firstGraph = this.firstGraph.bind(this);
		this.enterScope = this.enterScope.bind(this);
		this.lex = { firstGraph: this.firstGraph.bind(this) };
	}
	/**
	* 进入 subgraph 作用域（jison subgraphStart 归约时调用）
	*
	* push 新的空 scope 到 pendingStack。
	* 后续 addVertex/addLink 等 push 的 block 进入此 scope。
	* addSubGraph 调用时 pop 此 scope 作为 childBlocks。
	*/
	enterScope() {
		this.pendingStack.push([]);
	}
	/**
	* push block 到当前 scope（pendingStack 栈顶）
	*
	* 所有 addVertex/addLink/addClass/setLink 等方法产出 block 时调用此方法，
	* 替代原单数组实现的 this.pushBlock(block)。
	*/
	pushBlock(block) {
		this.pendingStack[this.pendingStack.length - 1].push(block);
	}
	/**
	* 添加顶点（jison 调用）
	*
	* jison 复用此方法传递两类语句（flow.jison line 404-465, 558-559）：
	*   1. 顶点定义（A[Hello] / A() / A@{ shape: rect } 等）→ 产出 VertexBlock
	*   2. style 语句（style A fill:#fff）→ 产出 StyleBlock
	*      证据：flow.jison line 558-559 styleStatement 规则调用
	*      yy.addVertex($idString, undefined, undefined, $stylesOpt)
	*      仅 style 参数非空，其他参数全为 undefined
	*
	* 分流判定：textObj === undefined && type === undefined && style 非空
	*   && classes/dir/props/metadata 全为 undefined
	*   （shapeData 路径 metadata 非 undefined，不会误判）
	*
	* 与 FlowDB.addVertex 的差异：
	*   - 不检查 edge 复用（shapeData 边元数据暂不处理，待 Stage 4 决策）
	*   - 不维护 vertices 状态，直接产出 VertexBlock / StyleBlock
	*   - shapeData 的 shape 字段会覆盖 type（通过 mapVertexType 处理）
	*   - shapeData 的其他字段（icon/form/pos/img 等）暂不承载（VertexBlock 未声明）
	*/
	addVertex(id, textObj, type, style, classes, dir, props, metadata) {
		if (!id || id.trim().length === 0) return;
		if (textObj === void 0 && type === void 0 && style !== void 0 && style.length > 0 && classes === void 0 && dir === void 0 && props === void 0 && metadata === void 0) {
			const styleBlock = {
				type: "style",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				nodeIds: id.split(","),
				styles: style
			};
			this.pushBlock(styleBlock);
			return;
		}
		const doc = parseShapeData(metadata);
		const shape = mapVertexType(doc?.shape !== void 0 ? doc.shape : type);
		let label;
		let labelType;
		if (textObj !== void 0) {
			label = stripQuotes(textObj.text);
			labelType = textObj.type;
		} else if (doc?.label !== void 0) {
			label = doc.label;
			labelType = sanitizeLabelType(doc.labelType);
		} else label = void 0;
		const block = {
			type: "vertex",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			nodeId: id,
			label,
			labelType,
			shape,
			inlineStyles: style ?? [],
			inlineClasses: classes ?? [],
			dir: dir ? normalizeDirection(dir) : void 0,
			props: props ?? void 0
		};
		this.pushBlock(block);
	}
	/** 判断 linkData 是否为 { id: string }（对齐 flow-db.ts isLinkData） */
	isLinkData(value) {
		return value !== null && typeof value === "object" && "id" in value && typeof value.id === "string";
	}
	/**
	* 添加边（jison 调用）
	* 支持多对多连接：A & B --> C & D 生成 4 条边
	*
	* 与 FlowDB.addLink 的差异：
	*   - 不维护 edges 状态，产出 EdgeBlock 加入 blocks
	*   - hasSourceVertexDef / hasTargetVertexDef 均设为 false（已知限制）
	*/
	addLink(_start, _end, linkData) {
		const id = this.isLinkData(linkData) ? linkData.id.replace("@", "") : void 0;
		const edgeData = linkData;
		for (const start of _start) for (const end of _end) {
			const isLastStart = start === _start[_start.length - 1];
			const isFirstEnd = end === _end[0];
			const edgeId = isLastStart && isFirstEnd ? id : void 0;
			const block = this.createEdgeBlock(start, end, edgeData, edgeId);
			this.pushBlock(block);
			this.edges.push(block);
		}
	}
	/** 创建单条 EdgeBlock */
	createEdgeBlock(start, end, edgeData, edgeId) {
		let label;
		let labelType;
		if (edgeData.text !== void 0) {
			label = stripQuotes(edgeData.text.text);
			labelType = sanitizeLabelType(edgeData.text.type);
		}
		const rawLength = edgeData.length;
		const length = rawLength !== void 0 ? rawLength > 10 ? 10 : rawLength : void 0;
		return {
			type: "edge",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			sourceId: start,
			targetId: end,
			hasSourceVertexDef: false,
			hasTargetVertexDef: false,
			edgeStyle: mapEdgeStyle(edgeData.type, edgeData.stroke),
			label,
			labelType,
			length,
			edgeId,
			classNames: []
		};
	}
	/**
	* 更新边的插值算法（jison 调用）
	* 产出 LinkStyleBlock（target.kind === 'indices' 或 'default'）
	*/
	updateLinkInterpolate(positions, interpolate) {
		const normalized = normalizeLinkStylePositions(positions);
		if (normalized.includes("default")) {
			const block = {
				type: "linkStyle",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				target: { kind: "default" },
				styles: [],
				interpolate,
				animate: void 0
			};
			this.pushBlock(block);
		}
		const indices = normalized.filter((p) => typeof p === "number");
		if (indices.length > 0) {
			const block = {
				type: "linkStyle",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				target: {
					kind: "indices",
					indices
				},
				styles: [],
				interpolate,
				animate: void 0
			};
			this.pushBlock(block);
		}
	}
	/**
	* 更新边样式（jison 调用）
	* 产出 LinkStyleBlock（target.kind === 'indices' 或 'default'）
	*/
	updateLink(positions, style) {
		const normalized = normalizeLinkStylePositions(positions);
		for (const pos of normalized) if (typeof pos === "number" && pos >= this.edges.length) throw new Error(`The index ${pos} for linkStyle is out of bounds. Valid indices for linkStyle are between 0 and ${this.edges.length - 1}.`);
		const normalizedStyle = [...style];
		if (normalizedStyle.length > 0 && !normalizedStyle.some((s) => s?.startsWith("fill"))) normalizedStyle.push("fill:none");
		if (normalized.includes("default")) {
			const block = {
				type: "linkStyle",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				target: { kind: "default" },
				styles: normalizedStyle,
				interpolate: void 0,
				animate: void 0
			};
			this.pushBlock(block);
		}
		const indices = normalized.filter((p) => typeof p === "number");
		if (indices.length > 0) {
			const block = {
				type: "linkStyle",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				target: {
					kind: "indices",
					indices
				},
				styles: normalizedStyle,
				interpolate: void 0,
				animate: void 0
			};
			this.pushBlock(block);
		}
	}
	/**
	* 添加 classDef（jison 调用）
	* 对齐 FlowDB.addClass：将 \, 转义为 §§§，, 转为 ;，再还原 §§§ 为 ,
	*/
	addClass(ids, _style) {
		const style = _style.join().replace(/\\,/g, "§§§").replace(/,/g, ";").replace(/§§§/g, ",").split(";");
		const textStyles = [];
		const normalStyles = [];
		for (const s of style) {
			if (/color/.exec(s)) {
				const newStyle = s.replace("fill", "bgFill");
				textStyles.push(newStyle);
			}
			normalStyles.push(s);
		}
		for (const className of ids.split(",")) {
			const block = {
				type: "classDef",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				className,
				styles: normalStyles,
				textStyles
			};
			this.pushBlock(block);
		}
	}
	/**
	* 应用 classDef 到节点/边/subgraph（jison 调用）
	* 产出 ClassApplyBlock
	*/
	setClass(ids, className) {
		const block = {
			type: "class-apply",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			nodeIds: ids.split(","),
			className
		};
		this.pushBlock(block);
	}
	/**
	* 设置图表方向（jison 调用）
	* 产出 DirectionBlock
	*/
	setDirection(dir) {
		const normalized = normalizeDirection(dir);
		if (normalized === void 0) return;
		const block = {
			type: "direction",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			dir: normalized
		};
		this.pushBlock(block);
	}
	/**
	* 设置链接（jison 调用）
	* 产出 ClickBlock（link/linkTarget 字段）
	* 对齐 FlowDB.setLink：同时调用 setClass(ids, 'clickable')
	*/
	setLink(ids, linkStr, target) {
		for (const nodeId of ids.split(",")) {
			const block = {
				type: "click",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				nodeId,
				functionName: void 0,
				functionArgs: void 0,
				link: linkStr,
				linkTarget: target,
				tooltip: void 0
			};
			this.pushBlock(block);
		}
		this.setClass(ids, "clickable");
	}
	/**
	* 设置 tooltip（jison 调用）
	* 产出 ClickBlock（tooltip 字段）
	*
	* 与 FlowDB.setTooltip 的差异：
	*   - FlowDB 维护 tooltips Map，Converter 阶段从 Map 读取
	*   - RecognizerCollector 产出 ClickBlock，Converter 阶段从 ClickBlock 读取
	*/
	setTooltip(ids, tooltip) {
		if (tooltip === void 0) return;
		for (const nodeId of ids.split(",")) {
			const block = {
				type: "click",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				nodeId,
				functionName: void 0,
				functionArgs: void 0,
				link: void 0,
				linkTarget: void 0,
				tooltip
			};
			this.pushBlock(block);
		}
	}
	/**
	* 设置 click 事件（jison 调用）
	* 产出 ClickBlock（functionName/functionArgs 字段）
	* 对齐 FlowDB.setClickEvent：同时调用 setClass(ids, 'clickable')
	*/
	setClickEvent(ids, functionName, functionArgs) {
		for (const nodeId of ids.split(",")) {
			const block = {
				type: "click",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				nodeId,
				functionName: functionName || void 0,
				functionArgs: functionArgs || void 0,
				link: void 0,
				linkTarget: void 0,
				tooltip: void 0
			};
			this.pushBlock(block);
		}
		this.setClass(ids, "clickable");
	}
	/**
	* 添加 subgraph（jison 调用）
	*
	* pendingStack 机制（决策11 栈结构实现）：
	*   jison subgraphStart 归约时已调用 enterScope() push 新 scope。
	*   subgraph 内部的 addVertex/addLink 等 block 已进入该 scope。
	*   addSubGraph 调用时 pop 该 scope 作为 childBlocks，
	*   为 childBlocks 递增 indent（+2），
	*   创建 SubgraphOpenBlock + SubgraphCloseBlock（indent=0），
	*   打包 [openBlock, ...childBlocks, closeBlock] push 到外层 scope。
	*
	* 平级 subgraph：各自独立 scope，互不累积，打包后都在外层 scope 中平级。
	* 嵌套 subgraph：内层 subgraph 先 addSubGraph pop 内层 scope 打包，
	*   外层 addSubGraph pop 外层 scope（含内层打包结果）打包，自动累加 indent。
	*
	* @returns subgraphId（用于 jison 后续引用）
	*/
	addSubGraph(_id, list, _title) {
		let id = _id?.text.trim();
		let title = _title?.text;
		if (_id === _title && _title && /\s/.exec(_title.text)) id = void 0;
		const { dir } = extractDirectionFromList(list);
		const hasExplicitDir = dir !== void 0;
		id = id ?? "subGraph" + this.subCount;
		title = title || "";
		this.subCount = this.subCount + 1;
		const rawChildBlocks = this.pendingStack.pop();
		if (rawChildBlocks === void 0) throw new Error("pendingStack underflow: addSubGraph called without matching enterScope (stack depth=0, expected >=1 after pop)");
		const childBlocks = rawChildBlocks.map((b) => ({
			...b,
			indent: b.indent + 2
		}));
		const openBlock = {
			type: "subgraph-open",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			subgraphId: id,
			title: title.trim(),
			classNames: [],
			hasExplicitDir,
			dir
		};
		const closeBlock = {
			type: "subgraph-close",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			subgraphId: id
		};
		const packagedBlocks = [
			openBlock,
			...childBlocks,
			closeBlock
		];
		this.pendingStack[this.pendingStack.length - 1].push(...packagedBlocks);
		return id;
	}
	/** 解析边语法（jison 调用，对齐 flow-db.ts destructLink） */
	destructLink(_str, _startStr) {
		return destructLink(_str, _startStr);
	}
	/** 设置无障碍标题（jison 调用） */
	setAccTitle(title) {
		const block = {
			type: "accTitle",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			accTitle: title
		};
		this.pushBlock(block);
	}
	/** 设置无障碍描述（jison 调用） */
	setAccDescription(desc) {
		const block = {
			type: "accDescription",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			accDescription: desc
		};
		this.pushBlock(block);
	}
	/** 设置图表标题（jison 调用） */
	setDiagramTitle(title) {
		const block = {
			type: "title",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			title
		};
		this.pushBlock(block);
	}
	/** 首次调用返回 true（用于 jison 词法分析器判断是否为首个 graph 关键字） */
	firstGraph() {
		if (this.firstGraphFlag) {
			this.firstGraphFlag = false;
			return true;
		}
		return false;
	}
	/**
	* 获取收集的 block 列表（返回顶层 scope）
	*
	* 前置不变量：解析结束时 pendingStack 应只剩 1 个元素（顶层 scope）。
	* 若栈深 > 1 说明有未关闭的 subgraph（enterScope 未被 addSubGraph 配对 pop），
	* 立即暴露而非返回不完整数据。
	*/
	getBlocks() {
		if (this.pendingStack.length !== 1) throw new Error(`pendingStack invariant violated: expected depth=1 after parse, got ${this.pendingStack.length} (unclosed subgraph or enterScope/addSubGraph mismatch)`);
		return this.pendingStack[0];
	}
};
/**
* flowchart 识别器
*
* 单一职责：将 Mermaid flowchart 代码识别为 FlowchartRecognizedBlock[] 流
*
* 数据流：
*   code → preprocessCode（清理 frontmatter/指令/注释，保持行号一致）
*        → flowJisonParser.parse(code) [yy=RecognizerCollector]
*        → RecognizerCollector 收集 block
*        → getBlocks() 返回 FlowchartRecognizedBlock[]
*
* 预处理对齐 flowchart-parser.ts 的 parseFlowchartCode：
*   - preprocessCode 清理 frontmatter/指令/注释（替换为等长换行）
*   - 去除右花括号后的尾随空格（对齐官方 flowParser.ts）
*   - 若 source 不以换行结尾，补充换行符（jison 语法要求）
*
* 注释/空行 block 的处理：
*   jison parser 不识别注释（%% ...）和空行，preprocessCode 会将它们替换为等长换行。
*   因此 Recognizer 无法通过适配器产出 CommentBlock/BlankBlock。
*   决策14 已说 serialize 方向不保留注释/空行，parse 方向也不产出（已知限制）。
*/
var FlowchartRecognizer = class {
	/**
	* 识别代码产出 block 流
	*
	* @param code - Mermaid flowchart 源代码（可含 %% 注释、%%{directive}%%、frontmatter）
	* @returns 识别块流（忠实产出 jison 能识别的所有 block，不含注释/空行）
	*/
	recognize(code) {
		const collector = new RecognizerCollector();
		flowJisonParser.yy = collector;
		const processedSource = preprocessCode(code).replace(/}\s*\n/g, "}\n");
		const normalizedSource = processedSource.endsWith("\n") ? processedSource : processedSource + "\n";
		try {
			flowJisonParser.parse(normalizedSource);
		} finally {
			flowJisonParser.yy = {};
		}
		return collector.getBlocks();
	}
};
//#endregion
//#region src/serializer/recognizer/class-recognizer.ts
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
const classJisonParser = parser$1;
/**
* 判定成员类型（对齐 ClassDB.addMember 逻辑）
*
* @param memberText - 成员原始文本
* @returns 'annotation' | 'method' | 'attribute'
*/
function classifyMember(memberText) {
	const trimmed = memberText.trim();
	if (trimmed.startsWith("<<") && trimmed.endsWith(">>")) return "annotation";
	if (trimmed.indexOf(")") > 0) return "method";
	return "attribute";
}
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
var ClassRecognizerCollector = class {
	constructor() {
		this.pendingStack = [[]];
		this.namespaceInfoStack = [];
		this.namespaceStack = [];
		this.currentClass = null;
		this.noteCount = 0;
		this.relationType = RELATION_TYPE;
		this.lineType = LINE_TYPE;
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
	/**
	* 进入 namespace 作用域（addNamespace 调用时）
	*
	* push 新的空 scope 到 pendingStack。
	* 后续 addClass/addRelation 等 push 的 block 进入此 scope。
	* popNamespace 调用时 pop 此 scope 作为 childBlocks。
	*/
	enterScope() {
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
	leaveScope(namespaceInfo) {
		if (this.pendingStack.length < 2) throw new Error(`pendingStack underflow: popNamespace called without matching addNamespace (stack depth=${this.pendingStack.length}, expected >=2)`);
		const rawChildBlocks = this.pendingStack.pop();
		if (rawChildBlocks === void 0) throw new Error("pendingStack pop returned undefined (invariant violated: stack should have at least 2 scopes)");
		const childBlocks = rawChildBlocks.map((b) => ({
			...b,
			indent: b.indent + 2
		}));
		const openBlock = {
			type: "namespace-open",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			namespaceId: namespaceInfo.namespaceId,
			label: namespaceInfo.label
		};
		const closeBlock = {
			type: "namespace-close",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			namespaceId: namespaceInfo.namespaceId
		};
		const packagedBlocks = [
			openBlock,
			...childBlocks,
			closeBlock
		];
		this.pendingStack[this.pendingStack.length - 1].push(...packagedBlocks);
	}
	/**
	* push block 到当前 scope（pendingStack 栈顶）
	*/
	pushBlock(block) {
		this.pendingStack[this.pendingStack.length - 1].push(block);
	}
	/**
	* flush currentClass（产出 ClassBlock 并 pushBlock）
	*
	* 在任何非 class 累积操作前调用，确保 currentClass 中的累积数据被产出为 ClassBlock。
	* 若 currentClass 为 null 则 no-op。
	*/
	flushCurrentClass() {
		if (this.currentClass === null) return;
		const acc = this.currentClass;
		const block = {
			type: "class",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			classId: acc.classId,
			label: acc.label,
			stereotype: acc.stereotype,
			annotations: acc.annotations,
			members: acc.members,
			cssClasses: acc.cssClasses
		};
		this.pushBlock(block);
		this.currentClass = null;
	}
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
	addClass(id) {
		if (!id || id.trim().length === 0) return;
		if (this.currentClass !== null && this.currentClass.classId !== id) this.flushCurrentClass();
		if (this.currentClass !== null && this.currentClass.classId === id) return;
		this.currentClass = {
			classId: id,
			label: void 0,
			stereotype: void 0,
			annotations: [],
			members: [],
			cssClasses: []
		};
	}
	/**
	* 设置类标签（jison 调用）
	*
	* 更新 currentClass.label（若 classId 匹配）。
	*/
	setClassLabel(id, label) {
		if (this.currentClass === null || this.currentClass.classId !== id) {
			this.flushCurrentClass();
			this.addClass(id);
		}
		if (this.currentClass !== null && this.currentClass.classId === id) this.currentClass.label = label;
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
	addAnnotation(className, annotation) {
		if (this.currentClass === null || this.currentClass.classId !== className) {
			this.flushCurrentClass();
			this.addClass(className);
		}
		if (this.currentClass !== null && this.currentClass.classId === className) this.currentClass.annotations.push(annotation);
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
	addMember(className, member) {
		if (this.currentClass === null || this.currentClass.classId !== className) {
			this.flushCurrentClass();
			this.addClass(className);
		}
		if (this.currentClass === null || this.currentClass.classId !== className) return;
		if (typeof member !== "string") return;
		const memberText = member.trim();
		if (memberText.length === 0) return;
		const memberBlock = {
			memberText,
			memberKind: classifyMember(memberText)
		};
		this.currentClass.members.push(memberBlock);
	}
	/**
	* 批量添加成员（jison 调用）
	*
	* jison members 产生式逆序压栈，需 reverse 后逐个 addMember（最终 members[] 顺序与源码一致）。
	* 对齐 ClassDB.addMembers 的 reverse 逻辑。
	*/
	addMembers(className, members) {
		if (!Array.isArray(members)) return;
		const reversed = [...members].reverse();
		for (const member of reversed) this.addMember(className, member);
	}
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
	addRelation(classRelation) {
		this.flushCurrentClass();
		const cardinality1 = classRelation.relationTitle1.trim();
		const cardinality2 = classRelation.relationTitle2.trim();
		const label = classRelation.title;
		const block = {
			type: "relation",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			sourceId: classRelation.id1,
			targetId: classRelation.id2,
			relationType1: classRelation.relation.type1,
			relationType2: classRelation.relation.type2,
			lineType: classRelation.relation.lineType,
			cardinality1: cardinality1.length > 0 && cardinality1 !== "none" ? cardinality1 : void 0,
			cardinality2: cardinality2.length > 0 && cardinality2 !== "none" ? cardinality2 : void 0,
			label: label !== void 0 && label.length > 0 ? label : void 0
		};
		this.pushBlock(block);
	}
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
	addNote(text, className) {
		this.flushCurrentClass();
		const noteId = `note${this.noteCount}`;
		this.noteCount++;
		const block = {
			type: "note",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			text,
			classId: className
		};
		this.pushBlock(block);
		return noteId;
	}
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
	addNamespace(id, label) {
		this.flushCurrentClass();
		const prefix = this.namespaceStack.at(-1);
		const qualifiedId = prefix ? `${prefix}.${id}` : id;
		this.namespaceStack.push(qualifiedId);
		this.namespaceInfoStack.push({
			namespaceId: qualifiedId,
			label
		});
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
	popNamespace() {
		this.flushCurrentClass();
		const namespaceInfo = this.namespaceInfoStack.pop();
		if (namespaceInfo === void 0) throw new Error("namespaceInfoStack underflow: popNamespace called without matching addNamespace");
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
	addClassesToNamespace(_id, _classNames, _noteNames) {}
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
	defineClass(ids, style) {
		this.flushCurrentClass();
		const textStyles = [];
		const normalStyles = [];
		for (const s of style) {
			if (/color/.exec(s)) {
				const newStyle = s.replace("fill", "bgFill");
				textStyles.push(newStyle);
			}
			normalStyles.push(s);
		}
		for (const id of ids) {
			const block = {
				type: "classDef",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				className: id,
				styles: normalStyles,
				textStyles
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
	setCssClass(ids, className) {
		this.flushCurrentClass();
		const block = {
			type: "class-apply",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			classIds: ids.split(","),
			className
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
	setCssStyle(id, styles) {
		this.flushCurrentClass();
		const flattenedStyles = [];
		for (const s of styles) if (s.includes(",")) flattenedStyles.push(...s.split(","));
		else flattenedStyles.push(s);
		const block = {
			type: "style",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			classId: id,
			styles: flattenedStyles
		};
		this.pushBlock(block);
	}
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
	setLink(ids, linkStr, target) {
		this.flushCurrentClass();
		for (const classId of ids.split(",")) {
			const block = {
				type: "click",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				classId,
				functionName: void 0,
				functionArgs: void 0,
				link: linkStr,
				linkTarget: target,
				tooltip: void 0
			};
			this.pushBlock(block);
		}
		this.setCssClass(ids, "clickable");
	}
	/**
	* 设置 tooltip（jison 调用）
	*
	* 产出 ClassClickBlock（tooltip 字段）。
	*
	* @param ids - 类名列表（逗号分隔字符串）
	* @param tooltip - tooltip 文本
	*/
	setTooltip(ids, tooltip) {
		this.flushCurrentClass();
		if (tooltip === void 0) return;
		for (const classId of ids.split(",")) {
			const block = {
				type: "click",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				classId,
				functionName: void 0,
				functionArgs: void 0,
				link: void 0,
				linkTarget: void 0,
				tooltip
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
	setClickEvent(ids, functionName, functionArgs) {
		this.flushCurrentClass();
		for (const classId of ids.split(",")) {
			const block = {
				type: "click",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				classId,
				functionName: functionName || void 0,
				functionArgs: functionArgs || void 0,
				link: void 0,
				linkTarget: void 0,
				tooltip: void 0
			};
			this.pushBlock(block);
		}
		this.setCssClass(ids, "clickable");
	}
	/**
	* 设置方向（jison 调用）
	*
	* 产出 ClassDirectionBlock（dir=normalizeDirection(dir)）。
	* 边界校验：调用 normalizeDirection 在 jison→recognizer 边界完成字符串→FlowchartDirection 校验。
	*/
	setDirection(dir) {
		this.flushCurrentClass();
		const normalized = normalizeDirection(dir);
		if (normalized === void 0) return;
		const block = {
			type: "direction",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			dir: normalized
		};
		this.pushBlock(block);
	}
	/** 设置无障碍标题（jison 调用） */
	setAccTitle(title) {
		this.flushCurrentClass();
		const block = {
			type: "accTitle",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			accTitle: title
		};
		this.pushBlock(block);
	}
	/** 设置无障碍描述（jison 调用） */
	setAccDescription(desc) {
		this.flushCurrentClass();
		const block = {
			type: "accDescription",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			accDescription: desc
		};
		this.pushBlock(block);
	}
	/**
	* 清理标签文本（jison 调用）
	*
	* 对齐 ClassDB.cleanupLabel：移除前导冒号，trim。
	*/
	cleanupLabel(label) {
		let cleaned = label;
		if (cleaned.startsWith(":")) cleaned = cleaned.substring(1);
		return cleaned.trim();
	}
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
	getBlocks() {
		this.flushCurrentClass();
		if (this.pendingStack.length !== 1) throw new Error(`pendingStack invariant violated: expected depth=1 after parse, got ${this.pendingStack.length} (unclosed namespace or addNamespace/popNamespace mismatch)`);
		if (this.namespaceInfoStack.length !== 0) throw new Error(`namespaceInfoStack invariant violated: expected depth=0 after parse, got ${this.namespaceInfoStack.length} (unclosed namespace or addNamespace/popNamespace mismatch)`);
		if (this.namespaceStack.length !== 0) throw new Error(`namespaceStack invariant violated: expected depth=0 after parse, got ${this.namespaceStack.length} (unclosed namespace or addNamespace/popNamespace mismatch)`);
		return this.pendingStack[0];
	}
};
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
var ClassRecognizer = class {
	/**
	* 识别代码产出 block 流
	*
	* @param code - Mermaid classDiagram 源代码（可含 %% 注释、%%{directive}%%、frontmatter）
	* @returns 识别块流（忠实产出 jison 能识别的所有 block）
	*/
	recognize(code) {
		const collector = new ClassRecognizerCollector();
		classJisonParser.yy = collector;
		const preprocessedSource = preprocessCode(code);
		const normalizedSource = preprocessedSource.endsWith("\n") ? preprocessedSource : preprocessedSource + "\n";
		try {
			classJisonParser.parse(normalizedSource);
		} finally {
			classJisonParser.yy = {};
		}
		return collector.getBlocks();
	}
};
//#endregion
//#region src/serializer/recognizer/er-recognizer.ts
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
const erJisonParser = parser;
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
function parseSubgraphList(list) {
	const seen = /* @__PURE__ */ new Set();
	let dir;
	return {
		nodeList: list.filter((item) => {
			if (item && typeof item === "object" && "stmt" in item) {
				if (item.stmt === "dir") dir = item.value;
				return false;
			}
			if (typeof item !== "string") return false;
			const trimmed = item.trim();
			if (!trimmed) return false;
			if (seen.has(trimmed)) return false;
			seen.add(trimmed);
			return true;
		}),
		dir
	};
}
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
var ErRecognizerCollector = class {
	constructor() {
		this.pendingStack = [[]];
		this.classes = /* @__PURE__ */ new Map();
		this.subGraphLookup = /* @__PURE__ */ new Map();
		this.entityAppliedClasses = /* @__PURE__ */ new Map();
		this.subCount = 0;
		this.currentEntity = null;
		this.subgraphDepth = 0;
		this.Cardinality = CARDINALITY;
		this.Identification = IDENTIFICATION;
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
	enterScope() {
		this.pendingStack.push([]);
	}
	/**
	* 离开 subgraph 作用域（addSubGraph 调用时）
	*
	* pop 栈顶 scope 作为 childBlocks。
	* 前置不变量校验：栈深 >= 2（至少有顶层 scope + 当前 subgraph scope）。
	*/
	leaveScope() {
		if (this.pendingStack.length < 2) throw new Error("pendingStack underflow: addSubGraph called without matching subgraphHeader (stack depth=1, expected >=2 before pop)");
		const childBlocks = this.pendingStack.pop();
		if (childBlocks === void 0) throw new Error("pendingStack pop returned undefined (invariant violated)");
		return childBlocks;
	}
	/**
	* push block 到当前 scope（pendingStack 栈顶）
	*/
	pushBlock(block) {
		this.pendingStack[this.pendingStack.length - 1].push(block);
	}
	/**
	* flush currentEntity 产出 ErEntityBlock
	*
	* cssCompiledStyles/parentId 在收尾阶段（finalizeBlocks）回填，
	* parse 阶段暂空（cssCompiledStyles=[]/parentId=undefined）。
	*/
	flushCurrentEntity() {
		if (this.currentEntity === null) return;
		const ent = this.currentEntity;
		const block = {
			type: "entity",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			entityName: ent.entityName,
			alias: ent.alias,
			attributes: ent.attributes,
			cssClasses: ent.cssClasses,
			cssCompiledStyles: [],
			parentId: void 0
		};
		this.pushBlock(block);
		this.currentEntity = null;
	}
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
	addEntity(name, alias = "") {
		if (this.currentEntity !== null) this.flushCurrentEntity();
		this.currentEntity = {
			entityName: name,
			alias,
			attributes: [],
			cssClasses: "default"
		};
		return {
			id: `entity-${name}-0`,
			label: name,
			attributes: [],
			alias,
			shape: "erBox",
			cssClasses: "default",
			cssStyles: [],
			labelType: "markdown"
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
	addAttributes(entityName, attribs) {
		if (this.currentEntity === null || this.currentEntity.entityName !== entityName) this.addEntity(entityName);
		const ent = this.currentEntity;
		if (ent === null) throw new Error(`Failed to add attributes: currentEntity is null for ${entityName}`);
		for (let i = attribs.length - 1; i >= 0; i--) {
			const attr = attribs[i];
			const normalized = {
				type: attr.type,
				name: attr.name,
				keys: normalizeAttributeKeys(attr.keys),
				comment: attr.comment ?? ""
			};
			ent.attributes.push(normalized);
		}
	}
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
	addRelationship(entA, rolA, entB, rSpec) {
		this.flushCurrentEntity();
		const block = {
			type: "relationship",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			entityA: entA,
			roleA: rolA,
			entityB: entB,
			cardA: rSpec.cardA,
			cardB: rSpec.cardB,
			relType: rSpec.relType
		};
		this.pushBlock(block);
	}
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
	setDirection(dir) {
		this.flushCurrentEntity();
		const normalized = normalizeDirection(dir);
		if (normalized === void 0) return;
		const block = {
			type: "direction",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			dir: normalized
		};
		this.pushBlock(block);
	}
	/**
	* 添加内联样式（jison 调用，style 语法）
	*
	* 产出 ErStyleBlock（每个 id 一个），pushBlock 到栈顶 scope。
	*
	* @param ids - 实体或 subgraph ID 列表
	* @param styles - 样式列表
	*/
	addCssStyles(ids, styles) {
		this.flushCurrentEntity();
		if (!styles) return;
		const block = {
			type: "style",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			ids: [...ids],
			styles: [...styles]
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
	addClass(ids, style) {
		this.flushCurrentEntity();
		for (const id of ids) {
			const styles = [];
			const textStyles = [];
			if (style) for (const s of style) {
				if (/color/.exec(s)) {
					const newStyle = s.replace("fill", "bgFill");
					textStyles.push(newStyle);
				}
				styles.push(s);
			}
			const existing = this.classes.get(id);
			const classNode = existing ?? {
				id,
				styles: [],
				textStyles: []
			};
			if (!existing) this.classes.set(id, classNode);
			for (const s of styles) classNode.styles.push(s);
			for (const s of textStyles) classNode.textStyles.push(s);
			const block = {
				type: "classDef",
				sourceLine: void 0,
				rawText: "",
				indent: 0,
				className: id,
				styles,
				textStyles
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
	setClass(ids, classNames) {
		this.flushCurrentEntity();
		for (const id of ids) {
			const existing = this.entityAppliedClasses.get(id);
			if (existing) existing.push(...classNames);
			else this.entityAppliedClasses.set(id, [...classNames]);
		}
		const block = {
			type: "class-apply",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			ids: [...ids],
			classNames: [...classNames]
		};
		this.pushBlock(block);
	}
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
	addSubGraph(_id, list, _title) {
		this.flushCurrentEntity();
		const id = _id.text.trim() || `subGraph${this.subCount}`;
		const title = (_title?.text ?? "").trim();
		const { nodeList, dir } = parseSubgraphList(list.flat());
		const normalizedDir = dir !== void 0 ? normalizeDirection(dir) : void 0;
		this.subCount = this.subCount + 1;
		const subGraph = {
			id,
			nodes: nodeList,
			title,
			classes: [],
			cssStyles: [],
			dir: normalizedDir,
			labelType: "markdown"
		};
		const allSubgraphs = Array.from(this.subGraphLookup.values());
		subGraph.nodes = this.makeUniq(subGraph, allSubgraphs).nodes;
		this.subGraphLookup.set(id, subGraph);
		const childBlocks = this.leaveScope().map((b) => ({
			...b,
			indent: b.indent + 2
		}));
		const openBlock = {
			type: "subgraph-open",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			subgraphId: id,
			title,
			dir: normalizedDir,
			nodes: subGraph.nodes,
			parentId: void 0
		};
		const closeBlock = {
			type: "subgraph-close",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			subgraphId: id
		};
		const packagedBlocks = [
			openBlock,
			...childBlocks,
			closeBlock
		];
		this.pendingStack[this.pendingStack.length - 1].push(...packagedBlocks);
		return id;
	}
	/**
	* 构建所有已分配给现有 subgraph 的节点 ID 的快速查找表
	*
	* 对齐 ErDB.subgraphNodeCache。
	*/
	subgraphNodeCache(allSubgraphs) {
		const nodeCache = /* @__PURE__ */ new Set();
		for (const subGraph of allSubgraphs) for (const id of subGraph.nodes) nodeCache.add(id);
		return nodeCache;
	}
	/**
	* 过滤掉已经属于另一个 subgraph 的节点，保持 subgraph 成员唯一
	*
	* 对齐 ErDB.makeUniq。
	*/
	makeUniq(subGraph, allSubgraphs) {
		const existingNodes = this.subgraphNodeCache(allSubgraphs);
		const res = [];
		subGraph.nodes.forEach((nodeId) => {
			if (existingNodes.has(nodeId)) {} else res.push(nodeId);
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
	getCompiledStyles(cssClasses) {
		const classDefs = cssClasses.split(" ").filter((c) => c.length > 0);
		let compiledStyles = [];
		for (const customClass of classDefs) {
			const cssClass = this.classes.get(customClass);
			if (cssClass?.styles) compiledStyles = [...compiledStyles, ...cssClass.styles].map((s) => s.trim());
			if (cssClass?.textStyles) compiledStyles = [...compiledStyles, ...cssClass.textStyles].map((s) => s.trim());
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
	finalizeBlocks() {
		const blocks = this.pendingStack[0];
		const parentDB = /* @__PURE__ */ new Map();
		for (const subGraph of this.subGraphLookup.values()) for (const nodeId of subGraph.nodes) parentDB.set(nodeId, subGraph.id);
		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			if (block.type === "entity") {
				const entityBlock = block;
				const appliedClassNames = this.entityAppliedClasses.get(entityBlock.entityName) ?? [];
				const mergedCssClasses = [entityBlock.cssClasses, ...appliedClassNames].filter((s) => s.length > 0).join(" ");
				const cssCompiledStyles = this.getCompiledStyles(mergedCssClasses);
				const parentId = parentDB.get(entityBlock.entityName);
				blocks[i] = {
					...entityBlock,
					cssCompiledStyles,
					parentId
				};
			} else if (block.type === "subgraph-open") {
				const openBlock = block;
				const parentId = parentDB.get(openBlock.subgraphId);
				blocks[i] = {
					...openBlock,
					parentId
				};
			}
		}
	}
	/** 设置无障碍标题（jison 调用） */
	setAccTitle(title) {
		this.flushCurrentEntity();
		const block = {
			type: "accTitle",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			accTitle: title
		};
		this.pushBlock(block);
	}
	/** 设置无障碍描述（jison 调用） */
	setAccDescription(desc) {
		this.flushCurrentEntity();
		const block = {
			type: "accDescription",
			sourceLine: void 0,
			rawText: "",
			indent: 0,
			accDescription: desc
		};
		this.pushBlock(block);
	}
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
	getBlocks() {
		this.flushCurrentEntity();
		if (this.pendingStack.length !== 1) throw new Error(`pendingStack invariant violated: expected depth=1 after parse, got ${this.pendingStack.length} (unclosed subgraph or subgraphHeader/END mismatch)`);
		this.finalizeBlocks();
		return this.pendingStack[0];
	}
};
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
var ErRecognizer = class {
	/**
	* 识别代码产出 block 流
	*
	* @param code - Mermaid erDiagram 源代码（可含 %% 注释、%%{directive}%%、frontmatter）
	* @returns 识别块流（忠实产出 jison 能识别的所有 block，不含注释/空行）
	*/
	recognize(code) {
		const collector = new ErRecognizerCollector();
		erJisonParser.yy = collector;
		const preprocessedSource = preprocessCode(code);
		const normalizedSource = preprocessedSource.endsWith("\n") ? preprocessedSource : preprocessedSource + "\n";
		try {
			erJisonParser.parse(normalizedSource);
		} finally {
			erJisonParser.yy = {};
		}
		return collector.getBlocks();
	}
};
/**
* 规范化属性键列表（过滤无效值，转换为 ErAttributeKeyType）
*
* 对齐 er-db.ts 的 normalizeAttributeKeys 函数。
*/
function normalizeAttributeKeys(keys) {
	if (!keys) return [];
	const validKeys = [];
	for (const key of keys) if (key === "PK" || key === "FK" || key === "UK") validKeys.push(key);
	return validKeys;
}
//#endregion
//#region src/serializer/recognizer/index.ts
/**
* 内部识别器注册表
*
* Recognizer 实例为无状态对象（每次 recognize 调用内部创建独立的 Collector），
* 因此可作为模块级单例共享。
*
* 当前注册项：
*   - 'flowchart' → FlowchartRecognizer（Stage 3）
*   - 'classDiagram' → ClassRecognizer（M3 模块1）
*   - 'erDiagram' → ErRecognizer（erDiagram 重构模块1）
*
* 后续阶段将扩展注册其他 diagramType 的 Recognizer。
*/
const recognizerMap = /* @__PURE__ */ new Map([
	["flowchart", new FlowchartRecognizer()],
	["classDiagram", new ClassRecognizer()],
	["erDiagram", new ErRecognizer()]
]);
function recognize(code, diagramType) {
	const recognizer = recognizerMap.get(diagramType);
	if (recognizer === void 0) throw new Error(`No recognizer registered for diagram type: ${diagramType}`);
	return recognizer.recognize(code);
}
//#endregion
//#region src/serializer/parser/jison-error.ts
/**
* jison 错误信息提取工具
*
* 单一职责：从 jison parser 抛出的错误对象中提取 line/column/message
*
* 背景：jison 0.4.18 的错误对象格式不统一：
*   - 顶层可能直接有 line/column/message 属性
*   - 也可能嵌套在 hash: { line, column } 中
*   - message 可能是 Error.message 或字符串
*
* 模块边界：纯工具函数，不依赖任何其他模块，可被所有 parser 使用。
*/
/**
* 从 jison 错误中提取行号
*
* @param err - jison parser 抛出的错误对象
* @returns 行号（1-based），无法提取时返回 1
*/
function extractJisonLine(err) {
	if (err && typeof err === "object") {
		const line = err.line;
		if (typeof line === "number") return line;
		const hash = err.hash;
		if (hash && typeof hash.line === "number") return hash.line;
	}
	return 1;
}
/**
* 从 jison 错误中提取列号
*
* @param err - jison parser 抛出的错误对象
* @returns 列号（1-based），无法提取时返回 1
*/
function extractJisonColumn(err) {
	if (err && typeof err === "object") {
		const column = err.column;
		if (typeof column === "number") return column;
		const hash = err.hash;
		if (hash && typeof hash.column === "number") return hash.column;
	}
	return 1;
}
/**
* 从 jison 错误中提取错误信息
*
* @param err - jison parser 抛出的错误对象
* @returns 错误信息字符串，无法提取时返回 'parse error'
*/
function extractJisonMessage(err) {
	if (err instanceof Error) return err.message || "parse error";
	if (typeof err === "string") return err;
	if (err && typeof err === "object") {
		const message = err.message;
		if (typeof message === "string") return message;
	}
	return "parse error";
}
//#endregion
//#region src/serializer/parse-dispatcher.ts
/** 构造解析失败结果 */
function buildParseFailure(message, code) {
	return {
		success: false,
		canvas: {
			diagramType: "flowchart",
			nodes: [],
			edges: [],
			direction: "TB"
		},
		errors: [{
			line: 1,
			column: 0,
			message,
			severity: "error",
			context: code.split("\n")[0]
		}]
	};
}
/**
* 为解析结果的 canvas 填充 rawCode（保留原始代码）
* 不修改原 canvas 对象，返回带 rawCode 的新对象
*/
function withRawCode(result, code) {
	if (result.success) return {
		...result,
		canvas: {
			...result.canvas,
			rawCode: code
		}
	};
	return result;
}
/**
* 解析 Mermaid 代码为 CanvasState
*
* 空代码处理（M0 新增）:
*   - 空字符串或纯空白 → 返回成功结果，canvas 为空 flowchart
*   - 不报错，允许清空画布
*
* 预处理（架构修复）:
*   - 各 parser 内部调用 preprocessCode 清理 frontmatter/指令/注释
*   - 预处理保持行号一致（替换为等长换行），确保 _sourceLine 与 rawCode 行号一一对应
*   - parser 收到的是原始 code，内部预处理后用于 jison 解析，rawCode 保留原始 code
*
* @param code - Mermaid 源代码（任意图表类型）
* @param options - 可选参数，可显式指定 diagramType 跳过自动检测
* @returns 解析结果（包含 canvas 和 errors，canvas.rawCode 保留原始代码）
*/
function parseMermaid(code, options) {
	if (code.trim().length === 0) return {
		success: true,
		canvas: {
			diagramType: "flowchart",
			nodes: [],
			edges: [],
			direction: "TB",
			rawCode: code
		},
		errors: []
	};
	const diagramType = options?.diagramType ?? detectDiagramType(code);
	if (diagramType === null) return buildParseFailure("无法识别图表类型（首行关键字未知）", code);
	let result;
	switch (diagramType) {
		case "flowchart":
		case "classDiagram":
		case "erDiagram":
			try {
				const blocks = recognize(code, diagramType);
				const convertResult = converterRegistry.parseBlocks(blocks, diagramType);
				const frontmatterTitle = extractFrontmatterTitle(code);
				let canvas = convertResult.canvas;
				if (frontmatterTitle !== void 0) {
					const metadata = canvas.metadata ? {
						...canvas.metadata,
						title: frontmatterTitle
					} : { title: frontmatterTitle };
					canvas = {
						...canvas,
						metadata
					};
				}
				result = {
					success: true,
					canvas,
					errors: convertResult.errors.map((err) => ({
						line: err.block.sourceLine ?? 0,
						column: 0,
						message: err.message,
						severity: "error",
						context: err.block.rawText
					}))
				};
			} catch (err) {
				const line = extractJisonLine(err);
				const error = {
					line,
					column: extractJisonColumn(err),
					message: extractJisonMessage(err),
					severity: "error",
					context: code.split("\n")[line - 1]
				};
				result = {
					success: false,
					canvas: {
						diagramType,
						nodes: [],
						edges: [],
						direction: "TB"
					},
					errors: [error]
				};
			}
			break;
		case "sequenceDiagram":
			result = parseSequence(code);
			break;
		default: return buildParseFailure(`不支持的图表类型 "${diagramType}"（本插件仅支持 flowchart / sequenceDiagram / classDiagram / erDiagram）`, code);
	}
	const withCode = withRawCode(result, code);
	if (withCode.success && isGraphCanvasState(withCode.canvas)) return {
		...withCode,
		canvas: {
			...withCode.canvas,
			needsLayout: true
		}
	};
	return withCode;
}
//#endregion
//#region src/index.ts
/**
* Mermaid 反向编辑器 — 节点半边。
*
* 注册模型工具 mermaid_load：AI 把 Mermaid 代码送入浏览器编辑器面板。
* 工具注册在宿主平面（全局层），每个会话的 agent 都可见，无需修改
* agent preset。工具结果以 ```mermaid 代码块文本返回，客户端插件通过
* 对话扫描通道识别该工具结果并自动导入为新标签。
*/
/** 插件名（诊断用）。 */
const name = "mermaid2aichat-dsh";
/** 硬依赖：宿主工具注册表面。 */
const inject = ["tools"];
/** mermaid_load 工具定义：参数/输出均为纯 JSON Schema 规格。 */
const MERMAID_LOAD_TOOL = defineTool({
	name: "mermaid_load",
	description: "把 Mermaid 图表代码发送到浏览器的 Mermaid 反向编辑器面板，用户可以在编辑器中查看、修改图表，再把修改后的代码发回对话。仅支持 flowchart / sequenceDiagram / classDiagram / erDiagram 四种图表类型。",
	parameters: {
		code: {
			type: "string",
			required: true,
			description: "完整的 mermaid 图表代码（不带 ``` 围栏）"
		},
		title: {
			type: "string",
			description: "图表标题（可选，作为编辑器标签名）"
		}
	},
	output: {
		schema: {
			type: "object",
			additionalProperties: false,
			properties: {
				ok: {
					type: "boolean",
					required: true
				},
				diagramType: {
					type: "string",
					required: true
				},
				message: {
					type: "string",
					required: true
				}
			}
		},
		render(args, value) {
			const a = args;
			const v = value;
			if (!v.ok) return [{
				type: "text",
				text: `Mermaid 代码解析失败：${v.message}`
			}];
			return [{
				type: "text",
				text: `已发送到 Mermaid 编辑器（${v.diagramType}）：\n\`\`\`mermaid\n${a.code}\n\`\`\``
			}];
		}
	},
	async execute(args) {
		const parsed = parseMermaid(args.code);
		if (!parsed.success) {
			const first = parsed.errors[0];
			return {
				ok: false,
				diagramType: "",
				message: first !== void 0 ? `${first.line}:${first.column} ${first.message}` : "未知解析错误"
			};
		}
		return {
			ok: true,
			diagramType: parsed.canvas.diagramType,
			message: "已发送到 Mermaid 编辑器"
		};
	}
});
/** 宿主插件体：注册 mermaid_load 工具（随 fiber 销毁自动移除）。 */
function apply(ctx) {
	ctx.effect(() => ctx.tools.register(MERMAID_LOAD_TOOL), "mermaid2aichat-dsh: mermaid_load tool");
}
//#endregion
export { apply, inject, name };
