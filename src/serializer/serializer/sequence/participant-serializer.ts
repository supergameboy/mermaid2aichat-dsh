/**
 * sequence 序列化器 — 参与者序列化
 *
 * 单一职责：将 SequenceParticipant[] 序列化为 Mermaid participant/actor 代码
 *
 * 输出格式:
 *   - "participant A as Alice\n"
 *   - "actor B\n"
 *   - "participant C@{type: 'boundary'}\n"  （非默认类型用 YAML 元数据）
 *   - "box rgba(255,0,0,0.2) BoxName\n  participant A\n  participant B\nend\n"
 *
 * Mermaid 语法约束（对齐官方 sequenceDiagram.jison）:
 *   - 仅 `participant` 和 `actor` 是有效的声明关键字
 *   - boundary/collections/control/database/entity/queue 必须通过 YAML 元数据声明：
 *     `participant X@{type: 'boundary'}`
 *   - alias 可写入 YAML 元数据：`participant X@{type: 'boundary', alias: 'Label'}`
 */

import type { SequenceParticipant, SequenceBoxInfo, SequenceActorType } from '../../types.js';

/**
 * 关键字声明型参与者类型 → 声明关键字映射
 *
 * 仅 participant/actor 是有效的 jison 关键字，其他类型必须通过 YAML 元数据声明
 */
const PARTICIPANT_KEYWORD: Record<SequenceActorType, string> = {
  participant: 'participant',
  actor: 'actor',
  // 非关键字类型使用 'participant' 作为声明关键字，类型信息通过 @{type: '...'} 元数据表达
  boundary: 'participant',
  collections: 'participant',
  control: 'participant',
  database: 'participant',
  entity: 'participant',
  queue: 'participant',
};

/**
 * 判断参与者类型是否为关键字声明型（vs YAML 元数据声明型）
 *
 * participant/actor: 直接使用关键字（`participant X` / `actor X`）
 * 其他类型: 必须使用 `participant X@{type: '...'}` 语法
 */
function isKeywordType(actorType: SequenceParticipant['actorType']): boolean {
  return actorType === 'participant' || actorType === 'actor';
}

/**
 * 序列化 YAML 元数据（用于非关键字类型的参与者声明）
 *
 * 格式: `{type: 'boundary'}` 或 `{type: 'boundary', alias: 'Label'}`
 * 使用单引号包裹字符串值，对齐 Mermaid 官方示例语法
 */
function serializeYamlMetadata(
  actorType: SequenceParticipant['actorType'],
  alias: string | undefined,
): string {
  const parts: string[] = [`type: '${actorType}'`];
  if (alias) {
    parts.push(`alias: '${alias}'`);
  }
  return `{${parts.join(', ')}}`;
}

/**
 * 序列化参与者
 *
 * @param participants - 参与者列表（单一数据源）
 * @param boxes - Box 分组列表
 * @returns 序列化后的代码行数组
 */
export function serializeParticipants(
  participants: SequenceParticipant[],
  boxes: SequenceBoxInfo[],
): string[] {
  const lines: string[] = [];

  // 按 box 分组：先输出 box 内的参与者，再输出无 box 的参与者
  const boxedActorKeys = new Set<string>();
  for (const box of boxes) {
    for (const key of box.actorKeys) {
      boxedActorKeys.add(key);
    }
  }

  // 输出 box 分组
  for (const box of boxes) {
    const colorPart = box.color && box.color !== 'transparent' ? ` ${box.color}` : '';
    // B4.1: 序列化 wrap 标记（对齐 sequence-db.ts:515-528 extractWrap 解析格式）
    //   - wrap=true → 输出 ` :wrap:`
    //   - wrap=false / undefined → 不输出（默认值，round-trip 一致）
    const wrapPart = box.wrap === true ? ' :wrap:' : '';
    const namePart = box.name ? ` ${box.name}` : '';
    lines.push(`box${colorPart}${wrapPart}${namePart}`);

    for (const actorKey of box.actorKeys) {
      const participant = participants.find((p) => p.id === actorKey);
      if (participant) {
        lines.push(`  ${serializeSingleParticipant(participant)}`);
      }
    }

    lines.push('end');
    lines.push('');
  }

  // 输出无 box 的参与者
  for (const participant of participants) {
    if (!boxedActorKeys.has(participant.id)) {
      // 跳过消息派生的参与者（非显式声明）
      // explicitlyDeclared === false 表示从消息引用派生，不应输出 participant 声明
      // undefined（UI 创建或旧数据）默认视为显式，正常输出
      if (participant.explicitlyDeclared === false) continue;
      lines.push(serializeSingleParticipant(participant));
    }
  }

  // B5.1: 序列化参与者的 links/properties（独立语句，对齐 jison links/properties 规则）
  //   - 仅在参与者存在 links/properties 时输出
  //   - 输出顺序：participant 声明 → links → properties
  //   - 避免写入 YAML metadata（jison CONFIG 规则 `[^\}]+` 不支持嵌套 {}，无法承载 JSON 对象）
  for (const participant of participants) {
    if (participant.links && Object.keys(participant.links).length > 0) {
      lines.push(`links ${participant.id}: ${JSON.stringify(participant.links)}`);
    }
    if (participant.properties && Object.keys(participant.properties).length > 0) {
      lines.push(`properties ${participant.id}: ${JSON.stringify(participant.properties)}`);
    }
  }

  if (participants.length > 0) {
    lines.push('');
  }

  return lines;
}

/**
 * 序列化单个参与者
 *
 * 输出规则（对齐官方 sequenceDiagram.jison participant_statement 语法）:
 *   - participant/actor: `participant X` / `actor X` / `participant X as Label`
 *   - 其他类型: `participant X@{type: 'boundary'}` / `participant X@{type: 'boundary', alias: 'Label'}`
 */
function serializeSingleParticipant(participant: SequenceParticipant): string {
  const keyword = PARTICIPANT_KEYWORD[participant.actorType];
  const label = participant.label;
  const hasAlias = Boolean(label) && label !== participant.id;

  // 关键字类型：直接使用 `keyword id` 或 `keyword id as label`
  if (isKeywordType(participant.actorType)) {
    if (hasAlias && label) {
      return `${keyword} ${participant.id} as ${label}`;
    }
    return `${keyword} ${participant.id}`;
  }

  // 非关键字类型：使用 YAML 元数据 `participant id@{type: '...', alias: '...'}`
  const metadata = serializeYamlMetadata(participant.actorType, hasAlias ? label : undefined);
  return `${keyword} ${participant.id}@${metadata}`;
}
