// 記憶階層の実効アクセス時間
// 落とし穴：ヒット率と NFP（ミス率）の取り違え、
// 「ミス時は主記憶だけ」か「キャッシュを見てから主記憶」かの解釈違い。

import { register, step, fmtNum, fmtPct } from '../genkit.js';
import { round } from '../rng.js';

register({
  id: 'cache',
  name: 'キャッシュ実効アクセス時間',
  category: 'テクノロジ系',
  tags: ['キャッシュ', 'ヒット率', '実効アクセス時間', '記憶階層'],

  gen(rng) {
    return rng.pick([genEffective, genHitRate, genSpeedup])(rng);
  },
});

// --- 実効アクセス時間 ---------------------------------------------------
function genEffective(rng) {
  const tc = rng.int(5, 40); // キャッシュ 5〜40ns
  const tm = tc * rng.int(8, 20); // 主記憶はキャッシュの8〜20倍
  const h = rng.int(80, 98) / 100; // ヒット率 80〜98%

  const answer = round(h * tc + (1 - h) * tm, 4);

  const swapped = round((1 - h) * tc + h * tm, 4); // ヒット率とミス率を逆
  const avg = round((tc + tm) / 2, 4); // 単純平均
  const missOnly = round(h * tc + (1 - h) * (tc + tm), 4); // ミス時にキャッシュ時間も足す解釈
  const cacheOnly = round(tc / h, 4);

  return {
    question:
      `キャッシュメモリのアクセス時間が ${tc} ナノ秒、主記憶のアクセス時間が ${tm} ナノ秒、` +
      `キャッシュのヒット率が ${fmtPct(h, 0)} である。\n` +
      `実効アクセス時間は何ナノ秒か。なお、ミスした場合は主記憶のみアクセスするものとする。`,
    hint: '「ヒットしたときの時間×ヒット率」＋「ミスしたときの時間×ミス率」の加重平均。',
    answer,
    distractors: [
      { value: swapped, why: 'ヒット率とミス率を逆に掛けている。ほとんどはヒットする側に重みがある。' },
      { value: missOnly, why: 'ミス時にキャッシュのアクセス時間も足している。設問は「主記憶のみ」と指定。' },
      { value: avg, why: '単純平均を取っている。ヒット率という重みを使っていない。' },
      { value: cacheOnly, why: 'キャッシュ時間をヒット率で割っている。加重平均は掛けて足す。' },
    ],
    format: (v) => `${fmtNum(v, 2)}ナノ秒`,
    steps: [
      step('公式', '実効 = ヒット率×キャッシュ + ミス率×主記憶', null),
      step('ミス率', `1 − ${fmtNum(h, 2)}`, round(1 - h, 4)),
      step(
        '代入',
        `${fmtNum(h, 2)}×${tc} + ${fmtNum(1 - h, 2)}×${tm}`,
        answer,
        'ナノ秒'
      ),
    ],
    note:
      `主記憶より ${fmtNum(tm / answer, 2)} 倍速い。ヒット率が数%変わるだけで実効時間が大きく動くのがキャッシュの効き方。`,
  };
}

// --- ヒット率を逆算 -----------------------------------------------------
function genHitRate(rng) {
  const tc = rng.int(10, 30);
  const tm = tc * rng.int(10, 20);
  const h = rng.int(85, 97) / 100;
  const eff = round(h * tc + (1 - h) * tm, 4);

  const answer = round(h, 4);
  const missRate = round(1 - h, 4);
  const ratio = round(tc / eff, 4);
  const ratio2 = round(eff / tm, 4);

  return {
    question:
      `キャッシュメモリのアクセス時間が ${tc} ナノ秒、主記憶のアクセス時間が ${tm} ナノ秒のシステムで、` +
      `実効アクセス時間を測ったところ ${fmtNum(eff, 2)} ナノ秒であった。\n` +
      `このときのキャッシュのヒット率はいくらか。なお、ミスした場合は主記憶のみアクセスする。`,
    hint: '実効 = h×Tc + (1−h)×Tm を h について解く。',
    answer,
    distractors: [
      { value: missRate, why: 'ミス率（NFP）を求めている。設問はヒット率。' },
      { value: ratio, why: 'キャッシュ時間を実効時間で割っている。式を解いていない。' },
      { value: ratio2, why: '実効時間を主記憶時間で割っている。これはヒット率にならない。' },
    ],
    format: (v) => fmtNum(v, 4),
    steps: [
      step('式を展開', `${fmtNum(eff, 2)} = h×${tc} + (1−h)×${tm}`, null),
      step('整理', `${fmtNum(eff, 2)} = ${tm} − h×${tm - tc}`, null),
      step(
        'hについて解く',
        `(${tm} − ${fmtNum(eff, 2)}) / ${tm - tc}`,
        answer
      ),
    ],
    note: 'ヒット率を逆算する型。展開して「h×(Tm−Tc)」の形に整理すると迷わない。',
  };
}

// --- 高速化率（アムダールの法則の素朴版） -------------------------------
function genSpeedup(rng) {
  const tm = rng.int(50, 100);
  const tc = rng.int(5, 15);
  const h = rng.int(70, 95) / 100;
  const eff = round(h * tc + (1 - h) * tm, 6);

  const answer = round(tm / eff, 4);
  const inverted = round(eff / tm, 4);
  const diff = round(tm - eff, 4);
  const ratioTc = round(tm / tc, 4);

  return {
    question:
      `キャッシュのない構成では主記憶（${tm} ナノ秒）に毎回アクセスしていた。\n` +
      `ここにアクセス時間 ${tc} ナノ秒のキャッシュを導入し、ヒット率 ${fmtPct(h, 0)} を得た。\n` +
      `キャッシュ導入により、アクセスは何倍速くなったか。ミス時は主記憶のみアクセスする。`,
    hint: '「何倍速いか」＝ 導入前の時間 ÷ 導入後の時間。',
    answer,
    distractors: [
      { value: inverted, why: '割る向きが逆。速くなったなら答えは1より大きくなるはず。' },
      { value: ratioTc, why: 'キャッシュ単体との比を取っている。ミスする分が計算に入っていない。' },
      { value: diff, why: '差を取っている。「何倍」は比であって差ではない。' },
    ],
    format: (v) => `${fmtNum(v, 2)}倍`,
    steps: [
      step('導入後の実効時間', `${fmtNum(h, 2)}×${tc} + ${fmtNum(1 - h, 2)}×${tm}`, eff, 'ナノ秒'),
      step('高速化率', `${tm} / ${fmtNum(eff, 4)}`, answer, '倍'),
    ],
    note:
      `ヒット率${fmtPct(h, 0)}でも${fmtNum(answer, 2)}倍止まり。` +
      `残りのミスが足を引っ張るのがポイント（ここがアムダールの法則の考え方）。`,
  };
}
