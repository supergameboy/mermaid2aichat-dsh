/**
 * ID 生成器 — 自动短 ID（A, B, C... Z, AA, AB...）
 * 双射 26 进制算法，保证唯一性
 */
export class IdGenerator {
  private counter = 0;
  private usedIds: Set<string> = new Set();

  /**
   * 生成新的唯一短 ID
   * 规则：A, B, C, ... Z, AA, AB, ... AZ, BA, ... ZZ, AAA, ...
   */
  generate(): string {
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
  register(id: string): void {
    this.usedIds.add(id);
  }

  /**
   * 批量注册已存在的 ID
   */
  registerMany(ids: string[]): void {
    for (const id of ids) {
      this.usedIds.add(id);
    }
  }

  /**
   * 检查 ID 是否已被使用
   */
  isUsed(id: string): boolean {
    return this.usedIds.has(id);
  }

  /**
   * 重置生成器（清空已用 ID 集合和计数器）
   */
  reset(): void {
    this.counter = 0;
    this.usedIds.clear();
  }

  /**
   * 获取所有已注册 ID（只读视图，返回副本避免外部修改）
   */
  getUsedIds(): Set<string> {
    return new Set(this.usedIds);
  }

  /**
   * 序号 → 字母 ID
   * 0→A, 1→B, ... 25→Z, 26→AA, 27→AB, ...
   * 算法：26 进制，但无"0"位，所以是双射计数（bijective base-26）
   */
  private indexToId(index: number): string {
    if (index < 0) return 'A';
    let result = '';
    let n = index + 1; // 从 1 开始，使 0→A
    while (n > 0) {
      n--; // 调整为 0-based
      result = String.fromCharCode(65 + (n % 26)) + result;
      n = Math.floor(n / 26);
    }
    return result;
  }
}

/** 全局默认实例 */
export const idGenerator = new IdGenerator();
