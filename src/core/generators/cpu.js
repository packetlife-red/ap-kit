// CPU性能（CPI・MIPS・クロック）
// 落とし穴：クロック周波数の単位（MHz/GHz）と時間（ns）の往復、
// 命令ミックスの重み付き平均を単純平均にしてしまう。

import { register, step, fmtNum, fmtPct, fmtInt } from '../genkit.js';
import { round } from '../rng.js';

register({
  id: 'cpu',
  name: 'CPI・MIPS・命令ミックス',
  category: 'テクノロジ系',
  tags: ['CPI', 'MIPS', 'クロック', '命令ミックス'],

  gen(rng) {
    return rng.pick([genMix, genMips, genExecTime])(rng);
  },
});

// 命令ミックスの素材。比率の合計が100%になる組を作る。
function makeMix(rng) {
  // 重み付き平均が単純平均と一致してしまう配分は出題として不適切
  // （加重平均を理解していなくても正解できてしまう）ので、一致しない組が出るまで引き直す。
  for (let attempt = 0; attempt < 30; attempt++) {
    const n = rng.int(3, 4);
    const names = rng.sample(['演算命令', '転送命令', '分岐命令', '比較命令', 'メモリ参照命令'], n);

    // 10%刻みで合計100%になるよう配分（各20%以上にして偏りすぎを防ぐ）
    const parts = [];
    let rest = 10;
    for (let i = 0; i < n - 1; i++) {
      const max = rest - (n - 1 - i) * 2;
      const v = rng.int(2, Math.max(2, max));
      parts.push(v);
      rest -= v;
    }
    parts.push(rest);

    // CPIは互いに異なる値にする
    const cpis = rng.sample([1, 2, 3, 4, 5, 6, 8, 10], n);
    const mix = names.map((name, i) => ({ name, ratio: parts[i] / 10, cpi: cpis[i] }));

    const weighted = mix.reduce((s, m) => s + m.ratio * m.cpi, 0);
    const simple = cpis.reduce((s, c) => s + c, 0) / n;
    if (Math.abs(weighted - simple) > 0.05) return mix;
  }
  // 30回引いても見つからない確率は事実上ゼロだが、無限ループは避ける
  return [
    { name: '演算命令', ratio: 0.5, cpi: 2 },
    { name: '転送命令', ratio: 0.3, cpi: 4 },
    { name: '分岐命令', ratio: 0.2, cpi: 8 },
  ];
}

// --- 命令ミックスから平均CPI -------------------------------------------
function genMix(rng) {
  const mix = makeMix(rng);

  const answer = round(mix.reduce((s, m) => s + m.ratio * m.cpi, 0), 4);
  const simpleAvg = round(mix.reduce((s, m) => s + m.cpi, 0) / mix.length, 4);
  const sum = round(mix.reduce((s, m) => s + m.cpi, 0), 4);
  const maxCpi = round(Math.max(...mix.map((m) => m.cpi)), 4);

  const table = mix
    .map((m) => `　${m.name}：出現率 ${fmtPct(m.ratio, 0)}、実行に ${m.cpi} クロック`)
    .join('\n');

  return {
    question:
      `あるプロセッサの命令の内訳が次のとおりである。\n${table}\n` +
      `このプロセッサの平均CPI（1命令あたりの平均クロック数）はいくらか。`,
    hint: '出現率を重みとした加重平均。単純平均ではない。',
    answer,
    distractors: [
      { value: simpleAvg, why: '単純平均を取っている。出現率という重みを使っていない。' },
      { value: sum, why: 'クロック数を合計しただけ。1命令あたりの平均なので割合を掛ける。' },
      { value: maxCpi, why: '最も遅い命令のクロック数を答えている。平均は全体の重み付き和。' },
    ],
    format: (v) => `${fmtNum(v, 3)}クロック`,
    steps: [
      step('公式', '平均CPI = Σ(出現率 × CPI)', null),
      step(
        '代入',
        mix.map((m) => `${fmtNum(m.ratio, 1)}×${m.cpi}`).join(' + '),
        answer,
        'クロック'
      ),
    ],
    note: '命令ミックスは「よく出る命令ほど効く」加重平均。出現率の合計が1になっているか必ず確認する。',
  };
}

// --- MIPS値 -------------------------------------------------------------
function genMips(rng) {
  const ghz = rng.pick([0.5, 0.8, 1.0, 1.25, 1.6, 2.0, 2.5, 4.0]);
  const cpi = rng.pick([1.25, 1.6, 2, 2.5, 3.2, 4, 5, 8]);

  const mhz = ghz * 1000;
  const answer = round(mhz / cpi, 4); // MIPS = クロック(MHz)/CPI

  const multiplied = round(mhz * cpi, 4);
  const inGhz = round(ghz / cpi, 4); // 単位をGHzのまま計算
  const inverted = round(cpi / mhz, 4);

  return {
    question:
      `クロック周波数 ${fmtNum(ghz, 2)} GHz、平均CPI ${fmtNum(cpi, 2)} のプロセッサがある。\n` +
      `このプロセッサの性能は何MIPSか。`,
    hint: 'MIPS＝1秒あたりの百万命令数。クロックをMHzに直してCPIで割る。',
    answer,
    distractors: [
      { value: multiplied, why: 'CPIを掛けている。CPIが大きいほど遅いので割るのが正しい。' },
      { value: inGhz, why: 'GHzのまま割っている。MIPSは百万単位なのでMHzに直す（×1000）。' },
      { value: inverted, why: '逆数を取っている。MIPSは大きいほど高性能な指標。' },
    ],
    format: (v) => `${fmtNum(v, 2)}MIPS`,
    steps: [
      // 式に「= …MHz」と書いてあるので value は持たせない（二重表示になる）
      step('クロックをMHzへ', `${fmtNum(ghz, 2)} GHz = ${mhz} MHz`, null),
      step('MIPS', `${mhz} / ${fmtNum(cpi, 2)}`, answer, 'MIPS'),
    ],
    note:
      `1命令に平均${fmtNum(cpi, 2)}クロック。1秒間に${mhz}百万クロック進むので、` +
      `実行できる命令数はその${fmtNum(1 / cpi, 3)}倍。`,
  };
}

// --- 実行時間 -----------------------------------------------------------
function genExecTime(rng) {
  const ghz = rng.pick([0.5, 0.8, 1.25, 1.6, 2.0, 2.5, 4.0]);
  const cpi = rng.pick([1.25, 1.6, 2.5, 3.2, 4, 5, 8]);
  const instructions = rng.int(2, 50) * 10; // 20〜500 百万命令

  // 実行時間(秒) = 命令数 × CPI / クロック(Hz)
  const answer = round((instructions * 1e6 * cpi) / (ghz * 1e9), 6);

  const noCpi = round((instructions * 1e6) / (ghz * 1e9), 6);
  // cpi×ghz=2 のとき noCpi と一致するので、そのときは自動的に捨てられる
  const multiplied = round((instructions * 1e6 * cpi * ghz) / 1e9, 6);
  const divCpi = round((instructions * 1e6) / cpi / (ghz * 1e9), 6);
  const inMhz = round((instructions * 1e6 * cpi) / (ghz * 1e6), 6); // GHz→MHzで割る単位ミス

  return {
    question:
      `クロック周波数 ${fmtNum(ghz, 2)} GHz、平均CPI ${fmtNum(cpi, 2)} のプロセッサで、` +
      `${instructions} 百万命令のプログラムを実行する。\n実行時間は何秒か。`,
    hint: '実行時間 = 命令数 × CPI ÷ クロック周波数。単位をHzと個数に揃えてから割る。',
    answer,
    distractors: [
      { value: noCpi, why: 'CPIを掛けていない。1命令に複数クロックかかる分が抜けている。' },
      { value: divCpi, why: 'CPIで割っている。CPIが大きいほど時間はかかるので掛ける。' },
      { value: multiplied, why: 'クロック周波数を掛けている。速いほど時間は短くなるので割る。' },
      { value: inMhz, why: 'GHzをMHz（10⁶）として割っている。GHzは10⁹。' },
    ],
    format: (v) => `${fmtNum(v, 4)}秒`,
    steps: [
      step('総クロック数', `${instructions}×10⁶ × ${fmtNum(cpi, 2)}`, round(instructions * 1e6 * cpi, 0), 'クロック'),
      step('クロック周波数', `${fmtNum(ghz, 2)} GHz = ${fmtInt(ghz * 1e9)} Hz`, null),
      step('実行時間', `${fmtInt(instructions * 1e6 * cpi)} / ${fmtInt(ghz * 1e9)}`, answer, '秒'),
    ],
    note: '「必要な総クロック数 ÷ 1秒に進むクロック数」と読めば、掛けるか割るかで迷わない。',
  };
}
