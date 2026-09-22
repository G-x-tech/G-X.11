import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { average, clamp, formatCurrency, sum } from '../src/index';

describe('sum', () => {
  test('空数组返回 0', () => {
    assert.equal(sum([]), 0);
  });

  test('多个数字正确累加', () => {
    assert.equal(sum([1, 2, 3, 4]), 10);
  });

  test('支持负数', () => {
    assert.equal(sum([-5, 5]), 0);
  });
});

describe('clamp', () => {
  test('在区间内原样返回', () => {
    assert.equal(clamp(5, 0, 10), 5);
  });

  test('低于下界取下界', () => {
    assert.equal(clamp(-1, 0, 10), 0);
  });

  test('高于上界取上界', () => {
    assert.equal(clamp(99, 0, 10), 10);
  });

  test('非法区间抛 RangeError', () => {
    assert.throws(() => clamp(5, 10, 0), RangeError);
  });
});

describe('average', () => {
  test('空数组返回 null', () => {
    assert.equal(average([]), null);
  });

  test('正常求均值', () => {
    assert.equal(average([2, 4, 6]), 4);
  });
});

describe('formatCurrency', () => {
  test('默认按人民币输出', () => {
    const out = formatCurrency(1234.5);
    const digits = out.replace(/[^0-9.,-]/g, '');
    assert.equal(digits, '1,234.50');
    assert.ok(out.length > digits.length, '应包含货币符号');
  });

  test('可切换币种', () => {
    const out = formatCurrency(100, { locale: 'en-US', currency: 'USD' });
    assert.equal(out.replace(/[^0-9.,-]/g, ''), '100.00');
  });
});
