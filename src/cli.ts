#!/usr/bin/env node
import { average, formatCurrency, sum } from './index';

const USAGE = '用法: cicd-starter <数字...>   例: cicd-starter 1 2 3';

function parseNumbers(argv: readonly string[]): number[] {
  return argv.map((raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new TypeError(`无法解析为数字: "${raw}"`);
    }
    return n;
  });
}

function main(argv: readonly string[]): number {
  if (argv.length === 0) {
    console.log(USAGE);
    return 0;
  }

  const values = parseNumbers(argv);
  const total = sum(values);
  const avg = average(values);

  console.log(`个数 : ${values.length}`);
  console.log(`合计 : ${formatCurrency(total)}`);
  console.log(`均值 : ${avg === null ? '-' : formatCurrency(avg)}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
