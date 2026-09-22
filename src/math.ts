/**
 * 一组刻意保持简单的纯函数，用来在 CI 里验证「构建产物真的能用」。
 */

/** 求和，空数组返回 0。 */
export function sum(values: readonly number[]): number {
  return values.reduce<number>((acc, n) => acc + n, 0);
}

/** 把 value 限制在 [min, max] 区间内，越界时抛错而不是静默修正。 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError(`clamp: min (${min}) 不能大于 max (${max})`);
  }
  return Math.min(Math.max(value, min), max);
}

/** 按本地习惯格式化金额，默认人民币。 */
export function formatCurrency(
  amount: number,
  options: { locale?: string; currency?: string } = {},
): string {
  const { locale = 'zh-CN', currency = 'CNY' } = options;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

/** 求平均值，空数组返回 null（避免 0/0 得到 NaN）。 */
export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return sum(values) / values.length;
}
