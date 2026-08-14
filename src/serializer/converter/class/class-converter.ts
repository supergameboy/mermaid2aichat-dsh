/**
 * ClassConverter — ClassBlock ↔ MermaidNode 双向转换
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块2-转换器.md
 * 阶段：M3 重构 L2-3
 *
 * 数据流：
 *   parse 方向：ClassBlock → MermaidNode（通过 ctx.registerNode 注册）
 *     - classId 拆分泛型 `~T~` → label + data.generics
 *     - stereotype → data.stereotype
 *     - annotations[] → data.annotations[]
 *     - members[] 拆分：memberKind='annotation' → data.annotations[]；memberKind='method'/'attribute' → data.members[]
 *     - cssClasses[] → data.classNames
 *     - parentId 由 ctx.currentParent() 决定
 *   serialize 方向：MermaidNode → ClassBlock（含 rawText，对齐设计点1「rawText 由 Converter 生成」）
 *     - 从 data.label + data.generics 合成 classId（含 ~T~）
 *     - 从 data.stereotype 设 stereotype
 *     - 从 data.annotations 设 annotations[]
 *     - 从 data.members 还原 members[]（memberText 由 serializeMember 生成）
 *     - 从 data.classNames 设 cssClasses
 *     - rawText 由 formatClassBlock 生成（单行 `class Name` 或多行 `class Name {\n  ...\n}`）
 *
 * 设计偏差修订（M3 实现期）：
 *   - members[] 中 memberKind='annotation' 的成员不是真正的成员（注解），
 *     ClassConverter.parseBlock 提取其文本（去除 <<>>）后累积到 data.annotations[]，
 *     不调用 parseMember（parseMember 仅处理 'method' | 'attribute'）
 *   - serialize 方向：data.annotations[] 全部作为 ClassBlock.annotations[] 产出，
 *     data.members[] 全部作为 ClassBlock.members[] 产出（memberKind 由 serializeMember 根据
 *     NodeMember.isMethod 推断），不尝试还原原始源码中 annotations 与 members 的交错顺序
 *     （由 Assembler 在代码生成阶段决定输出顺序）
 *
 * rawText 生成（对齐设计点1 + 老路径 serializeClassNode 行为）：
 *   - 无成员 + 无注解：单行 `class ClassName`（含泛型 `class Foo~T~`）
 *   - 有成员或注解：多行 `class ClassName {\n  <<interface>>\n  +field: Type\n}`
 *   - 内部成员/注解缩进 2 空格（class 体缩进），block 级缩进由 Assembler 应用
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、../../parser/class/class-member.js，不引用 React/DOM。
 */

import type {
  ClassStereotype,
  MermaidNode,
  MermaidNodeData,
  MermaidShapeType,
  NodeMember,
} from '../../types.js';
import type {
  ClassBlock,
  ClassMemberBlock,
} from '../../recognizer/types.js';
import type {
  ClassConverterContext,
} from './types.js';
import type {
  IModelBlockConverter,
} from '../types.js';
import { parseMember, serializeMember } from '../../parser/class/class-member.js';

// ============================================================
// 常量：annotation ↔ stereotype 映射
// ============================================================

/** annotation → stereotype 映射（对齐 class-parser.ts ANNOTATION_TO_STEREOTYPE） */
const ANNOTATION_TO_STEREOTYPE: Readonly<Record<string, ClassStereotype>> = {
  interface: 'interface',
  abstract: 'abstract',
  annotation: 'annotation',
  enum: 'enum',
  protocol: 'protocol',
  exception: 'exception',
  metaclass: 'metaclass',
  stereotype: 'stereotype',
};

/** stereotype → annotation 文本映射（serialize 方向，对齐老路径 STEREOTYPE_TO_ANNOTATION） */
const STEREOTYPE_TO_ANNOTATION: Readonly<Record<string, string>> = {
  interface: '<<interface>>',
  abstract: '<<abstract>>',
  annotation: '<<annotation>>',
  enum: '<<enum>>',
  protocol: '<<protocol>>',
  exception: '<<exception>>',
  metaclass: '<<metaclass>>',
  stereotype: '<<stereotype>>',
};

/**
 * 从 annotations 列表推断 stereotype
 *
 * annotations 如 `['interface']` → stereotype='interface'
 * 多个 annotation 时取第一个匹配的（对齐 class-parser.ts inferStereotype）
 */
function inferStereotype(annotations: readonly string[]): ClassStereotype | undefined {
  for (const annotation of annotations) {
    const lower = annotation.toLowerCase().trim();
    const stereotype = ANNOTATION_TO_STEREOTYPE[lower];
    if (stereotype) {
      return stereotype;
    }
  }
  return undefined;
}

/**
 * 收集需要输出的注解（serialize 方向）
 *
 * 规则（对齐老路径 collectAnnotations）：
 *   - stereotype 存在时输出对应的 `<<stereotype>>`
 *   - annotations 中非 stereotype 的注解也输出 `<<annotation>>`
 *   - 去重：避免 stereotype 对应的注解被重复输出
 */
function collectAnnotations(
  stereotype: string | undefined,
  annotations: readonly string[],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  if (stereotype) {
    const annotation = STEREOTYPE_TO_ANNOTATION[stereotype];
    if (annotation) {
      result.push(annotation);
      seen.add(stereotype.toLowerCase());
    }
  }

  for (const ann of annotations) {
    const lower = ann.toLowerCase().trim();
    if (seen.has(lower)) {
      continue;
    }
    // 跳过已经被 stereotype 覆盖的注解
    if (STEREOTYPE_TO_ANNOTATION[lower]) {
      continue;
    }
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
function formatClassBlock(
  classId: string,
  annotations: readonly string[],
  members: readonly NodeMember[],
  stereotype: string | undefined,
): string {
  const annotationsToOutput = collectAnnotations(stereotype, annotations);

  // 无成员且无注解时，输出单行类声明
  if (members.length === 0 && annotationsToOutput.length === 0) {
    return `class ${classId}`;
  }

  // 有成员或注解时，输出多行类定义
  const lines: string[] = [];
  lines.push(`class ${classId} {`);

  for (const annotation of annotationsToOutput) {
    lines.push(`  ${annotation}`);
  }

  for (const member of members) {
    lines.push(`  ${serializeMember(member)}`);
  }

  lines.push('}');
  return lines.join('\n');
}

// ============================================================
// 泛型拆分/合成辅助
// ============================================================

/** 泛型占位符正则（匹配 classId 中的 `~T~` 形式） */
const GENERICS_REGEX = /~([^~]+)~/;

/**
 * 拆分 classId 中的泛型 `~T~` → { label, generics }
 *
 * 例：`List~Item~` → { label: 'List', generics: 'Item' }
 * 无泛型时返回 { label: classId }（对齐 class-parser.ts 的 type 字段处理）
 */
function splitGenerics(classId: string): { label: string; generics?: string } {
  const match = GENERICS_REGEX.exec(classId);
  if (!match) {
    return { label: classId };
  }
  const generics = match[1];
  const label = classId.replace(match[0], '');
  return { label, generics };
}

/**
 * 合成 label + generics → classId（含 ~T~）
 *
 * 例：{ label: 'List', generics: 'Item' } → `List~Item~`
 * 无 generics 时返回 label（serialize 方向反向操作）
 */
function joinGenerics(label: string, generics: string | undefined): string {
  if (generics === undefined || generics === '') {
    return label;
  }
  return `${label}~${generics}~`;
}

// ============================================================
// ClassConverter 实现
// ============================================================

/**
 * ClassBlock ↔ MermaidNode 双向转换器
 *
 * parse 方向产出 class 节点（type='class-box'，shape='class-box'），
 * parentId 由 ctx.currentParent() 决定（namespace 嵌套）
 */
export class ClassConverter
  implements IModelBlockConverter<ClassBlock, MermaidNode, ClassConverterContext>
{
  /** parse：ClassBlock → MermaidNode，通过 ctx.registerNode 注册 */
  parseBlock(block: ClassBlock, context: ClassConverterContext): MermaidNode | null {
    // 1. 拆分 classId 中的泛型
    const { label: classLabel, generics } = splitGenerics(block.classId);

    // 2. 显式 label（class Name [Label] 语法）优先；无显式 label 用 classLabel
    const nodeLabel = block.label ?? classLabel;

    // 3. 收集 annotations：ClassBlock.annotations[] + members[] 中 memberKind='annotation' 的成员
    const annotations: string[] = [...block.annotations];
    const nodeMembers: NodeMember[] = [];
    for (const member of block.members) {
      if (member.memberKind === 'annotation') {
        // 提取 <<>> 包裹的注解文本（对齐 class-recognizer.ts extractAnnotationText）
        const text = extractAnnotationText(member.memberText);
        if (text) {
          annotations.push(text);
        }
        continue;
      }
      // method/attribute → NodeMember
      nodeMembers.push(parseMember(member.memberText, member.memberKind));
    }

    // 4. 推断 stereotype（从 annotations）
    const stereotype = inferStereotype(annotations);

    // 5. 构建 MermaidNodeData（条件展开避免 undefined 覆盖）
    const data: MermaidNodeData = {
      label: nodeLabel,
      shape: 'class-box' as MermaidShapeType,
      ...(nodeMembers.length > 0 ? { members: nodeMembers } : {}),
      ...(annotations.length > 0 ? { annotations } : {}),
      ...(stereotype ? { stereotype } : {}),
      ...(generics ? { generics } : {}),
      ...(block.cssClasses.length > 0 ? { classNames: [...block.cssClasses] } : {}),
      ...(block.sourceLine !== undefined ? { _sourceLine: block.sourceLine } : {}),
    };

    const node: MermaidNode = {
      id: classLabel,
      type: 'class-box',
      position: { x: 0, y: 0 },
      data,
      ...(context.currentParent() !== undefined
        ? { parentId: context.currentParent() }
        : {}),
    };

    context.registerNode(node);
    return node;
  }

  /** serialize：MermaidNode → ClassBlock（含 rawText，对齐设计点1） */
  serializeBlock(model: MermaidNode, _context: ClassConverterContext): ClassBlock | null {
    // 非类节点返回 null（由其他 Converter 处理）
    if (model.type !== 'class-box' && model.data.shape !== 'class-box') {
      return null;
    }

    const data = model.data;
    const label = (data.label as string | undefined) ?? model.id;
    const generics = data.generics as string | undefined;
    const classId = joinGenerics(label, generics);

    // annotations：直接从 data.annotations 读取
    const annotations = (data.annotations as string[] | undefined) ?? [];

    // members：从 data.members 还原 ClassMemberBlock[]
    const members: ClassMemberBlock[] = [];
    const nodeMembers = (data.members as NodeMember[] | undefined) ?? [];
    for (const nodeMember of nodeMembers) {
      members.push({
        memberText: serializeMember(nodeMember),
        memberKind: nodeMember.isMethod ? 'method' : 'attribute',
      });
    }

    // stereotype：从 data.stereotype 读取（serialize 方向不重新推断，直接用已存的值）
    const stereotype = data.stereotype as string | undefined;

    // label：若与 classId 相同则 undefined（对齐 ClassBlock.label 语义）
    const explicitLabel = label === model.id ? undefined : label;

    // rawText 由 formatClassBlock 生成（设计点1：rawText 由 Converter 生成）
    // 不含 block 级缩进，由 Assembler 应用（对齐老路径 serializeClassNode(node, '') 行为）
    const rawText = formatClassBlock(classId, annotations, nodeMembers, stereotype);

    const block: ClassBlock = {
      type: 'class',
      sourceLine: data._sourceLine,
      rawText,
      indent: 0,
      classId,
      label: explicitLabel,
      stereotype,
      annotations,
      members,
      cssClasses: (data.classNames as string[] | undefined) ?? [],
    };

    return block;
  }
}

// ============================================================
// 私有辅助：提取注解文本
// ============================================================

/**
 * 提取注解文本（去除 <<>> 包裹）
 *
 * 对齐 class-recognizer.ts extractAnnotationText：
 *   `<<interface>>` → `interface`
 *   非 `<<...>>` 格式返回空字符串
 */
function extractAnnotationText(memberText: string): string {
  const trimmed = memberText.trim();
  if (trimmed.startsWith('<<') && trimmed.endsWith('>>')) {
    return trimmed.substring(2, trimmed.length - 2);
  }
  return '';
}
