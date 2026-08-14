/**
 * 时序图渲染尺寸常量 — B3.3 改造后仅保留渲染尺寸（非布局坐标）
 *
 * 单一职责：定义渲染层使用的固定尺寸常量（非布局坐标）
 *
 * B3.3 改造（v9）：
 *   - 删除 14 个被 layout 取代的坐标常量（含 2 个死代码坐标常量）
 *     * 12 个常规坐标常量：PARTICIPANT_TOP_Y/HEIGHT/WIDTH/SPACING/LEFT_PADDING/CENTER_Y/BOTTOM_Y、
 *       FIRST_MESSAGE_Y、MESSAGE_ROW_HEIGHT、LIFELINE_BOTTOM_PADDING、ACTIVATION_BAR_WIDTH/HEIGHT
 *     * 2 个死代码坐标常量：BLOCK_PADDING（被 loopModel.starty 取代）、BOX_PADDING（被 layout.bounds.y 取代）
 *   - 删除 2 个被 layout 取代的函数（getParticipantX/getMessageY）
 *   - 保留 4 个渲染尺寸常量（NOTE_WIDTH/NOTE_HEIGHT/BLOCK_LABEL_HEIGHT/BOX_LABEL_HEIGHT）
 *
 * 布局坐标现在由 calculateLayout 产出的 LayoutResult 提供（单一数据源）
 * 来源：B3-L2 子功能细化文档 v9 layout-constants 清理决策
 */

/** Note 框宽度（渲染尺寸，非布局坐标） */
export const NOTE_WIDTH = 100;

/** Note 框高度（渲染尺寸，非布局坐标） */
export const NOTE_HEIGHT = 36;

/** 块结构标签高度（渲染尺寸，非布局坐标） */
export const BLOCK_LABEL_HEIGHT = 22;

/** Box 框标签高度（渲染尺寸，非布局坐标） */
export const BOX_LABEL_HEIGHT = 24;
