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

import { VISIBILITY_VALUES, type Visibility } from './constants.js';
import type { ClassVisibility, NodeMember } from '../../types.js';

/** 泛型类型占位符正则（匹配 `~Type~` 形式的泛型声明） */
const GENERIC_TYPE_REGEX = /~([^~]+)~/g;

/**
 * 解析泛型类型占位符（简化版，对齐官方 common.parseGenericTypes）
 *
 * 将 `~Type~` 转换为 `<Type>`，用于显示
 */
function parseGenericTypes(text: string): string {
  return text.replace(GENERIC_TYPE_REGEX, '<$1>');
}

/**
 * ClassMember — 类图成员（属性/方法）解析器
 *
 * 解析成员字符串如：
 *   - `+publicAttr: Type` → visibility='+', id='publicAttr', returnType='Type'
 *   - `-privateMethod(): ReturnType` → visibility='-', id='privateMethod', parameters='', returnType='ReturnType'
 *   - `#protectedAttr: Type*` → visibility='#', id='protectedAttr', classifier='*'（static）
 *   - `~packageMethod(): ReturnType$` → visibility='~', classifier='$'（abstract）
 */
export class ClassMember {
  /** 成员 ID（名称） */
  id: string;
  /** CSS 样式（由 parseClassifier 生成） */
  cssStyle: string;
  /** 成员类型（method/attribute） */
  memberType: 'method' | 'attribute';
  /** 可见性符号（+/-/#/~/''） */
  visibility: Visibility;
  /** 显示文本（含 HTML 转义） */
  text: string;
  /**
   * 分类符（'*' 表示 static，'$' 表示 abstract）
   * @defaultValue ''
   */
  classifier: string;
  /**
   * 方法参数（仅 method 类型）
   * @defaultValue ''
   */
  parameters: string;
  /**
   * 方法返回类型（仅 method 类型）
   * @defaultValue ''
   */
  returnType: string;

  constructor(input: string, memberType: 'method' | 'attribute') {
    this.memberType = memberType;
    this.visibility = '';
    this.classifier = '';
    this.text = '';
    this.id = '';
    this.cssStyle = '';
    this.parameters = '';
    this.returnType = '';
    // 解析层不做 sanitizeText（移除 getConfig 依赖），直接解析原始输入
    this.parseMember(input);
  }

  /**
   * 获取显示详情（displayText + cssStyle）
   *
   * displayText 格式：
   *   - attribute: `+attrName`
   *   - method: `+methodName(params) : ReturnType`
   */
  getDisplayDetails(): { displayText: string; cssStyle: string } {
    let displayText = this.visibility + parseGenericTypes(this.id);
    if (this.memberType === 'method') {
      displayText += `(${parseGenericTypes(this.parameters.trim())})`;
      if (this.returnType) {
        displayText += ' : ' + parseGenericTypes(this.returnType);
      }
    }

    displayText = displayText.trim();
    const cssStyle = this.parseClassifier();

    return {
      displayText,
      cssStyle,
    };
  }

  /**
   * 解析成员字符串
   *
   * 方法格式：`[visibility]name(parameters)[classifier][returnType][classifier]`
   * 属性格式：`[visibility]name[type][classifier]`
   *
   * classifier 检测：
   *   - `*` 后缀 → static（font-style:italic）
   *   - `$` 后缀 → abstract（text-decoration:underline）
   */
  parseMember(input: string): void {
    let potentialClassifier = '';

    if (this.memberType === 'method') {
      const methodRegEx = /([#+~-])?(.+)\((.*)\)([\s$*])?(.*)([$*])?/;
      const match = methodRegEx.exec(input);
      if (match) {
        const detectedVisibility = match[1] ? match[1].trim() : '';

        if (isVisibility(detectedVisibility)) {
          this.visibility = detectedVisibility;
        }

        this.id = match[2];
        this.parameters = match[3] ? match[3].trim() : '';
        potentialClassifier = match[4] ? match[4].trim() : '';
        // returnType 可能包含前导冒号和空格（如 `: void`），需要去除
        this.returnType = match[5] ? match[5].trim().replace(/^:\s*/, '') : '';

        if (potentialClassifier === '') {
          const lastChar = this.returnType.substring(this.returnType.length - 1);
          if (/[$*]/.exec(lastChar)) {
            potentialClassifier = lastChar;
            this.returnType = this.returnType.substring(0, this.returnType.length - 1);
          }
        }
      }
    } else {
      const length = input.length;
      const firstChar = input.substring(0, 1);
      const lastChar = input.substring(length - 1);

      if (isVisibility(firstChar)) {
        this.visibility = firstChar;
      }

      if (/[$*]/.exec(lastChar)) {
        potentialClassifier = lastChar;
      }

      this.id = input.substring(
        this.visibility === '' ? 0 : 1,
        potentialClassifier === '' ? length : length - 1,
      );
    }

    this.classifier = potentialClassifier;
    // Preserve one space only
    this.id = this.id.startsWith(' ') ? ' ' + this.id.trim() : this.id.trim();

    const combinedText = `${this.visibility ? '\\' + this.visibility : ''}${parseGenericTypes(this.id)}${this.memberType === 'method' ? `(${parseGenericTypes(this.parameters)})${this.returnType ? ' : ' + parseGenericTypes(this.returnType) : ''}` : ''}`;
    this.text = combinedText.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    if (this.text.startsWith('\\&lt;')) {
      this.text = this.text.replace('\\&lt;', '~');
    }
  }

  /**
   * 解析分类符为 CSS 样式
   *
   * @returns CSS 样式字符串
   *   - `*` → `font-style:italic;`（static）
   *   - `$` → `text-decoration:underline;`（abstract）
   *   - 其他 → `''`
   */
  parseClassifier(): string {
    switch (this.classifier) {
      case '*':
        return 'font-style:italic;';
      case '$':
        return 'text-decoration:underline;';
      default:
        return '';
    }
  }
}

/**
 * 类型守卫：判断字符串是否为合法的可见性符号
 */
function isVisibility(value: string): value is Visibility {
  return (VISIBILITY_VALUES as readonly string[]).includes(value);
}

// ============================================================
// 独立函数：parseMember / serializeMember（供 ClassConverter 复用，验证后修订 [完-3]）
// ============================================================

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
export function parseMember(
  memberText: string,
  memberKind: 'method' | 'attribute',
): NodeMember {
  if (memberKind === 'method') {
    return parseMethodMember(memberText);
  }
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
export function serializeMember(member: NodeMember): string {
  if (member.isMethod) {
    return serializeMethodMember(member);
  }
  return serializeAttributeMember(member);
}

// ============================================================
// 私有辅助：方法解析与序列化
// ============================================================

/** 方法正则（对齐 ClassMember.parseMember 的 methodRegEx） */
const METHOD_REGEX = /([#+~-])?(.+)\((.*)\)([\s$*])?(.*)([$*])?/;

/** 解析方法成员字符串为 NodeMember */
function parseMethodMember(memberText: string): NodeMember {
  const match = METHOD_REGEX.exec(memberText);
  if (!match) {
    // 正则失配：返回最小合法 NodeMember（name 为原始文本，对齐 ClassMember.parseMember 失配行为）
    return {
      name: memberText.trim(),
      visibility: '' as ClassVisibility,
      isStatic: false,
      isAbstract: false,
      isMethod: true,
    };
  }

  const visibility = match[1] ? match[1].trim() : '';
  const safeVisibility: ClassVisibility = isVisibility(visibility) ? visibility : ('' as ClassVisibility);
  const name = match[2].trim();
  const parameters = match[3] ? match[3].trim() : '';
  let potentialClassifier = match[4] ? match[4].trim() : '';
  let returnType = match[5] ? match[5].trim().replace(/^:\s*/, '') : '';

  // classifier 可能在 returnType 末尾（对齐 ClassMember.parseMember 逻辑）
  if (potentialClassifier === '') {
    const lastChar = returnType.substring(returnType.length - 1);
    if (/[$*]/.exec(lastChar)) {
      potentialClassifier = lastChar;
      returnType = returnType.substring(0, returnType.length - 1);
    }
  }

  return {
    name,
    ...(parameters ? { parameters } : {}),
    ...(returnType ? { returnType } : {}),
    visibility: safeVisibility,
    isStatic: potentialClassifier === '*',
    isAbstract: potentialClassifier === '$',
    isMethod: true,
  };
}

/** 序列化方法 NodeMember 为成员字符串 */
function serializeMethodMember(member: NodeMember): string {
  const classifier = member.isStatic ? '*' : member.isAbstract ? '$' : '';
  const visibility = member.visibility ?? '';
  const params = member.parameters ?? '';
  const returnType = member.returnType;
  // 格式: [visibility]name(params)[: ReturnType][classifier]
  // 对齐 mermaid 源码格式（`+eat(): void`，冒号前无空格）
  // 官方 ClassMember.getDisplayDetails 的 ` : ` 用于显示渲染，不用于源码序列化
  // classifier 放在 returnType 之后（正则 match[6] 位置），确保 serialize-parse 往返一致
  let text = `${visibility}${member.name}(${params})`;
  if (returnType) {
    text += `: ${returnType}`;
  }
  if (classifier) {
    text += classifier;
  }
  return text;
}

// ============================================================
// 私有辅助：属性解析与序列化
// ============================================================

/** 解析属性成员字符串为 NodeMember（含 name:type 拆分，对齐 class-parser.ts parseAttributeNameAndType） */
function parseAttributeMember(memberText: string): NodeMember {
  const length = memberText.length;
  const firstChar = memberText.substring(0, 1);
  const lastChar = memberText.substring(length - 1);

  const visibility: ClassVisibility = isVisibility(firstChar) ? firstChar : ('' as ClassVisibility);
  const hasClassifier = /[$*]/.exec(lastChar) !== null;
  const potentialClassifier = hasClassifier ? lastChar : '';

  // 提取 id 部分（去除 visibility 前缀和 classifier 后缀）
  const idStart = visibility === '' ? 0 : 1;
  const idEnd = hasClassifier ? length - 1 : length;
  const rawId = memberText.substring(idStart, idEnd).trim();

  // 拆分 name: type（对齐 class-parser.ts parseAttributeNameAndType）
  const { name, type } = parseAttributeNameAndType(rawId);

  return {
    name,
    ...(type ? { type } : {}),
    visibility,
    isStatic: potentialClassifier === '*',
    isAbstract: potentialClassifier === '$',
    isMethod: false,
  };
}

/** 序列化属性 NodeMember 为成员字符串 */
function serializeAttributeMember(member: NodeMember): string {
  const classifier = member.isStatic ? '*' : member.isAbstract ? '$' : '';
  const visibility = member.visibility ?? '';
  const type = member.type;
  // 格式: [visibility]name[: type][classifier]
  let text = `${visibility}${member.name}`;
  if (type) {
    text += `: ${type}`;
  }
  if (classifier) {
    text += classifier;
  }
  return text;
}

/** 解析属性名和类型（`attrName: Type` → `{ name: 'attrName', type: 'Type' }`，对齐 class-parser.ts） */
function parseAttributeNameAndType(id: string): { name: string; type?: string } {
  const colonIndex = id.indexOf(':');
  if (colonIndex < 0) {
    return { name: id.trim() };
  }
  const name = id.substring(0, colonIndex).trim();
  const type = id.substring(colonIndex + 1).trim();
  return { name, ...(type ? { type } : {}) };
}
