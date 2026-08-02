// ジェネレータの出力を端末で目視するためのプレビュー。
//   ./tools/preview.sh              全ジェネレータを1問ずつ
//   ./tools/preview.sh reliability 5   指定分野を5問
//
// 自動検証（verify）は形式の正しさしか見ない。公式そのものが合っているかは
// 人間が読んで確かめる必要があるので、そのための窓口。

import { allGenerators, generate } from '../src/core/generators/index.js';

const args = arguments || [];
const targetId = args[0] || null;
const count = args[1] ? parseInt(args[1], 10) : 1;

const gens = targetId
  ? allGenerators().filter((g) => g.id === targetId)
  : allGenerators();

if (gens.length === 0) {
  print(`該当なし: ${targetId}`);
  print(`利用可能: ${allGenerators().map((g) => g.id).join(', ')}`);
} else {
  for (const g of gens) {
    for (let i = 0; i < count; i++) {
      const seed = (1000003 + i * 7919 + g.id.length * 131) >>> 0;
      const q = generate(g.id, seed);
      print('');
      print('='.repeat(66));
      print(`【${q.generatorName}】 ${q.category}   seed=${q.seed}`);
      print('='.repeat(66));
      print(q.question);
      if (q.hint) print(`\n  ヒント: ${q.hint}`);
      print('');
      q.choices.forEach((c, k) => {
        print(`  ${'アイウエ'[k]}. ${c}${k === q.answerIndex ? '   ← 正解' : ''}`);
      });
      print('');
      print('  --- 解説 ---');
      for (const s of q.steps) {
        const v = s.value === null || s.value === undefined ? '' : ` = ${s.value}${s.unit || ''}`;
        print(`  ${s.label}: ${s.expr}${v}`);
      }
      print('');
      print('  --- 誤答の理由 ---');
      q.choiceMeta.forEach((m, k) => {
        if (!m.correct) print(`  ${'アイウエ'[k]}. ${m.why}`);
      });
      if (q.note) print(`\n  memo: ${q.note}`);
    }
  }
}
