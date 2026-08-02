// 確率・期待値
// 落とし穴：条件付き確率で分母を全体にしてしまう、
// 「少なくとも1つ」を余事象で解かずに足し算してしまう。

import { register, step, fmtNum, fmtPct } from '../genkit.js';
import { round } from '../rng.js';

register({
  id: 'probability',
  name: '確率・期待値',
  category: 'テクノロジ系',
  tags: ['確率', '条件付き確率', 'ベイズ', '期待値', '余事象'],

  gen(rng) {
    return rng.pick([genAtLeastOne, genConditional, genExpected])(rng);
  },
});

// --- 少なくとも1つ（余事象） --------------------------------------------
function genAtLeastOne(rng) {
  const n = rng.int(3, 6);
  // 故障率は「n個すべて無事」の確率が半端な値にならない範囲で選ぶ
  const p = rng.pick([0.01, 0.02, 0.05, 0.1, 0.2]);

  const noneFail = Math.pow(1 - p, n);
  const answer = round(1 - noneFail, 6);

  const summed = round(Math.min(p * n, 0.999999), 6); // 単純に足す
  const allFail = round(Math.pow(p, n), 6); // 全部故障する確率
  const complement = round(noneFail, 6); // 余事象を答えてしまう
  const exactlyOne = round(n * p * Math.pow(1 - p, n - 1), 6); // ちょうど1個

  return {
    question:
      `ある装置が1年以内に故障する確率は ${fmtPct(p, 0)} である。\n` +
      `この装置を ${n} 台使うシステムで、1年以内に少なくとも1台が故障する確率はいくらか。\n` +
      `なお、各装置の故障は互いに独立とする。`,
    hint: '「少なくとも1つ」は「1つも起きない」の余事象で考える。',
    answer,
    distractors: [
      { value: summed, why: '各装置の故障率を単純に足している。確率は足し算では合成できない（重複を二重に数える）。' },
      { value: complement, why: '「1台も故障しない確率」を答えている。最後に1から引く。' },
      { value: allFail, why: '「全台が故障する確率」を求めている。設問は「少なくとも1台」。' },
      { value: exactlyOne, why: '「ちょうど1台だけ故障する確率」。2台以上故障する場合も含める必要がある。' },
    ],
    format: (v) => fmtNum(v, 4),
    steps: [
      step('1台も故障しない確率', `(1 − ${fmtNum(p, 2)})^${n}`, round(noneFail, 6)),
      step('その余事象', `1 − ${fmtNum(noneFail, 6)}`, answer),
    ],
    note:
      `1台あたり${fmtPct(p, 0)}でも、${n}台あると${fmtPct(answer, 1)}まで上がる。` +
      `台数が増えるほど「どれかが壊れる」確率は急に高くなる — 直列構成の稼働率が下がる理由と同じ考え方。`,
  };
}

// --- 条件付き確率（ベイズ） ---------------------------------------------
function genConditional(rng) {
  // 検査の問題。数字は整数で割り切れるよう、母数を大きめに取る。
  const total = rng.pick([1000, 2000, 10000]);
  const defectRate = rng.pick([0.01, 0.02, 0.05]); // 不良品の割合
  const detectRate = rng.pick([0.9, 0.95, 0.98]); // 不良品を正しく検出する率
  const falseRate = rng.pick([0.02, 0.05, 0.1]); // 良品を誤って不良と判定する率

  const defective = total * defectRate;
  const good = total - defective;

  const truePositive = defective * detectRate; // 不良品で「不良」判定
  const falsePositive = good * falseRate; // 良品で「不良」判定
  const positive = truePositive + falsePositive; // 「不良」判定の総数

  const answer = round(truePositive / positive, 6); // 判定が不良のとき本当に不良の確率

  const asDetect = round(detectRate, 6); // 検出率と混同
  const asDefect = round(defectRate, 6); // 事前確率と混同
  const overTotal = round(truePositive / total, 6); // 分母を全体にする
  const inverted = round(falsePositive / positive, 6); // 誤検出のほうを答える

  return {
    question:
      `製品全体の ${fmtPct(defectRate, 0)} が不良品である。\n` +
      `検査装置は、不良品を ${fmtPct(detectRate, 0)} の確率で「不良」と判定するが、\n` +
      `良品も ${fmtPct(falseRate, 0)} の確率で誤って「不良」と判定してしまう。\n` +
      `ある製品が「不良」と判定されたとき、それが実際に不良品である確率はいくらか。`,
    hint: '「不良と判定された全体」を分母に、「本当に不良だったもの」を分子にする。',
    answer,
    distractors: [
      { value: asDetect, why: '検出率をそのまま答えている。これは「不良品が正しく判定される確率」で、向きが逆。' },
      { value: overTotal, why: '分母を製品全体にしている。条件付き確率の分母は「不良と判定されたもの」だけ。' },
      { value: asDefect, why: '全体の不良率（事前確率）を答えている。検査結果という条件が反映されていない。' },
      { value: inverted, why: '「不良と判定されたが実は良品」の確率。設問はその逆。' },
    ],
    format: (v) => fmtNum(v, 4),
    steps: [
      step(`${total.toLocaleString('ja-JP')}個で考える`, `不良品 ${defective} 個、良品 ${good} 個`, null),
      step('不良品で「不良」判定', `${defective} × ${fmtNum(detectRate, 2)}`, round(truePositive, 2), '個'),
      step('良品で「不良」判定', `${good} × ${fmtNum(falseRate, 2)}`, round(falsePositive, 2), '個'),
      step('「不良」判定の合計', `${fmtNum(truePositive, 2)} + ${fmtNum(falsePositive, 2)}`, round(positive, 2), '個'),
      step('そのうち本当に不良', `${fmtNum(truePositive, 2)} / ${fmtNum(positive, 2)}`, answer),
    ],
    note:
      `検出率${fmtPct(detectRate, 0)}と高性能に見えても、実際に不良である確率は${fmtPct(answer, 1)}にとどまる。` +
      `元の不良率が低いと、誤検出のほうが数で上回るため。具体的な個数で考えると直感的に分かる。`,
  };
}

// --- 期待値 -------------------------------------------------------------
function genExpected(rng) {
  const names = ['計画A', '計画B', '計画C', '計画D'];

  // 誤答が正解と衝突しない組が出るまで引き直す。
  // 「加重平均＝単純平均」「合計＝期待値」になる配分は実際に発生し、
  // 除外条件を数式で書き並べるより実値を比べるほうが確実（EVMで確立した方式）。
  let items, answer, simpleAvg, sum, maxProfit, onlyPositive;
  for (let attempt = 0; attempt < 40; attempt++) {
    const n = rng.int(3, 4);

    // 確率の合計が1になる組を作る（10%刻み）
    const parts = [];
    let rest = 10;
    for (let i = 0; i < n - 1; i++) {
      const max = rest - (n - 1 - i);
      parts.push(rng.int(1, Math.max(1, max)));
      rest -= parts[parts.length - 1];
    }
    parts.push(rest);

    // 利益は互いに異なる値にする（同値だと誤答が潰れる）
    const profits = rng.sample([-200, -100, -50, 100, 200, 300, 500, 800], n);

    items = names.slice(0, n).map((name, i) => ({ name, p: parts[i] / 10, profit: profits[i] }));

    answer = round(items.reduce((s, it) => s + it.p * it.profit, 0), 4);
    simpleAvg = round(profits.reduce((s, v) => s + v, 0) / n, 4);
    sum = round(profits.reduce((s, v) => s + v, 0), 4);
    maxProfit = round(Math.max(...profits), 4);
    onlyPositive = round(
      items.filter((it) => it.profit > 0).reduce((s, it) => s + it.p * it.profit, 0),
      4
    );

    // 正解を含めた5つの値がすべて異なれば、誤答が3つ残ることが保証される
    const vs = [answer, simpleAvg, sum, maxProfit, onlyPositive];
    if (new Set(vs.map((v) => v.toFixed(4))).size === vs.length) break;
  }

  const table = items
    .map((it) => `　${it.name}：確率 ${fmtPct(it.p, 0)}、損益 ${it.profit >= 0 ? '+' : '−'}${Math.abs(it.profit)}万円`)
    .join('\n');

  return {
    question:
      `ある投資について、起こりうる結果とその確率が次のとおり見込まれている。\n${table}\n` +
      `この投資の損益の期待値はいくらか。`,
    hint: '期待値 = Σ(確率 × その場合の値)。確率を重みとした加重平均。',
    answer,
    distractors: [
      { value: simpleAvg, why: '単純平均を取っている。確率という重みを使っていない。' },
      { value: sum, why: '損益を合計しただけ。期待値は確率を掛けてから足す。' },
      { value: onlyPositive, why: 'マイナスの結果を計算に入れていない。損失も期待値に含める。' },
      { value: maxProfit, why: '最もうまくいった場合の値を答えている。期待値は全ケースの重み付き平均。' },
    ],
    format: (v) => `${v >= 0 ? '+' : '−'}${fmtNum(Math.abs(v), 1)}万円`,
    steps: [
      step('公式', '期待値 = Σ(確率 × 損益)', null),
      step(
        '代入',
        items.map((it) => `${fmtNum(it.p, 1)}×(${it.profit})`).join(' + '),
        answer,
        '万円'
      ),
    ],
    note:
      answer >= 0
        ? `期待値がプラスなので、この投資を何度も繰り返せば平均的には利益が出る計算。`
        : `期待値がマイナスなので、繰り返すほど損失が積み上がる計算になる。`,
  };
}
