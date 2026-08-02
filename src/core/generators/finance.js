// 損益分岐点・ROI・正味現在価値
// 落とし穴：変動費率と限界利益率の取り違え（合計1になる関係）、
// 損益分岐点「売上高」と「販売数量」の混同。

import { register, step, fmtNum, fmtPct, fmtManYen } from '../genkit.js';
import { round } from '../rng.js';

register({
  id: 'finance',
  name: '損益分岐点・ROI・NPV',
  category: 'ストラテジ系',
  tags: ['損益分岐点', '限界利益率', '変動費', 'ROI', '正味現在価値'],

  gen(rng) {
    return rng.pick([genBep, genProfit, genRoi, genNpv])(rng);
  },
});

// --- 損益分岐点売上高 ---------------------------------------------------
function genBep(rng) {
  const fixed = rng.int(10, 80) * 10; // 固定費 100〜800万円
  // 変動費率は限界利益率と別の値になるよう0.5を避ける（0.5だと両者が同値）
  const varRate = rng.pick([0.2, 0.25, 0.3, 0.4, 0.6, 0.7, 0.75]);
  const marginRate = round(1 - varRate, 4);

  const answer = round(fixed / marginRate, 4);

  const byVarRate = round(fixed / varRate, 4); // 変動費率で割る
  const times = round(fixed * marginRate, 4); // 掛けてしまう
  const asFixed = fixed; // 固定費をそのまま答える
  const plusFixed = round(fixed / marginRate + fixed, 4);

  return {
    question:
      `ある製品の固定費が ${fmtManYen(fixed)}、変動費率が ${fmtPct(varRate, 0)} である。\n` +
      `損益分岐点売上高はいくらか。`,
    hint: '限界利益率＝1−変動費率。固定費をその率で割る。',
    answer,
    distractors: [
      { value: byVarRate, why: '変動費率で割っている。割るのは限界利益率（1−変動費率）。' },
      { value: times, why: '掛けている。固定費を回収するには売上が固定費より大きく必要なので割る。' },
      { value: plusFixed, why: '固定費を二重に足している。損益分岐点売上高の式に既に含まれている。' },
      { value: asFixed, why: '固定費をそのまま答えている。売上のうち変動費に消える分があるので、より多く売る必要がある。' },
    ],
    format: (v) => fmtManYen(v),
    steps: [
      step('限界利益率', `1 − ${fmtNum(varRate, 2)}`, marginRate),
      step('公式', '損益分岐点売上高 = 固定費 / 限界利益率', null),
      step('代入', `${fixed} / ${fmtNum(marginRate, 2)}`, answer, '万円'),
    ],
    note:
      `売上${fmtManYen(answer)}のとき、変動費${fmtManYen(answer * varRate)}＋固定費${fmtManYen(fixed)}で利益がちょうど0になる。`,
  };
}

// --- 目標利益を達成する売上高 -------------------------------------------
function genProfit(rng) {
  const fixed = rng.int(10, 60) * 10;
  const varRate = rng.pick([0.2, 0.25, 0.3, 0.4, 0.6, 0.7]);
  const marginRate = round(1 - varRate, 4);
  const target = rng.int(5, 30) * 10; // 目標利益 50〜300万円

  const answer = round((fixed + target) / marginRate, 4);

  const noTarget = round(fixed / marginRate, 4); // 目標利益を足し忘れる
  // varRate と marginRate の関係次第で noTarget と同値になる組がある
  // （例：固定費460・変動費率60% だとどちらも1150）。誤答を厚めに用意して吸収する。
  const byVarRate = round((fixed + target) / varRate, 4);
  const plusTarget = round(fixed / marginRate + target, 4); // 利益を後から足す
  const asSum = fixed + target; // 割り戻しをせず、そのまま足しただけ
  const timesMargin = round((fixed + target) * marginRate, 4); // 割らずに掛ける

  return {
    question:
      `ある製品の固定費が ${fmtManYen(fixed)}、変動費率が ${fmtPct(varRate, 0)} である。\n` +
      `${fmtManYen(target)}の利益を確保するには、売上高はいくら必要か。`,
    hint: '固定費と目標利益を合わせた額を、限界利益率で割る。',
    answer,
    distractors: [
      { value: noTarget, why: '目標利益を加えていない。これは損益分岐点売上高（利益0の場合）。' },
      { value: plusTarget, why: '目標利益を後から足している。利益分も限界利益率で割り戻す必要がある。' },
      { value: byVarRate, why: '変動費率で割っている。割るのは限界利益率（1−変動費率）。' },
      { value: asSum, why: '固定費と目標利益を足しただけ。売上の一部は変動費に消えるので割り戻しが要る。' },
      { value: timesMargin, why: '限界利益率を掛けている。必要な売上を求めるので割るのが正しい。' },
    ],
    format: (v) => fmtManYen(v),
    steps: [
      step('限界利益率', `1 − ${fmtNum(varRate, 2)}`, marginRate),
      step('回収すべき額', `${fixed} + ${target}`, fixed + target, '万円'),
      step('必要な売上高', `${fixed + target} / ${fmtNum(marginRate, 2)}`, answer, '万円'),
    ],
    note:
      '目標利益は「固定費と同じように回収すべき額」として扱う。' +
      '売上の一部は変動費に消えるので、割り戻しが必要。',
  };
}

// --- ROI ----------------------------------------------------------------
function genRoi(rng) {
  const invest = rng.int(10, 50) * 100; // 投資額 1000〜5000万円
  const gain = round(invest * rng.pick([0.1, 0.15, 0.2, 0.25, 0.3, 0.4]), 0); // 利益

  const answer = round(gain / invest, 4);

  const withInvest = round((gain + invest) / invest, 4); // 回収率と混同（＝ROI+1）
  const doubled = round((gain / invest) * 2, 4); // 2倍に見積もる
  // 注：gain − invest（差額）は率ではないため、%として表示すると
  //     「−276000%」のような明らかにおかしい選択肢になる。率どうしで比較できる誤答だけを使う。
  const halfRate = round(gain / invest / 2, 4); // 期間で割ってしまう
  const timesTen = round((gain / invest) * 10, 4); // 桁を1つ間違える

  return {
    question:
      `${fmtManYen(invest)}を投資し、${fmtManYen(gain)}の利益が得られた。\n` +
      `このときのROI（投資利益率）はいくらか。`,
    hint: 'ROI＝利益÷投資額。投資した額に対してどれだけ儲かったか。',
    answer,
    distractors: [
      { value: withInvest, why: '利益に投資額を足している（回収率）。ROIは利益だけを投資額で割る。' },
      { value: halfRate, why: '何かで割って半分にしている。ROIは利益を投資額で割るだけ。' },
      { value: timesTen, why: '桁を1つ間違えている。割り算の結果をそのまま率として読む。' },
      { value: doubled, why: '2倍に見積もっている。利益をそのまま投資額で割るだけでよい。' },
    ],
    format: (v) => fmtPct(v, 1),
    steps: [
      step('公式', 'ROI = 利益 / 投資額', null),
      step('代入', `${gain} / ${invest}`, answer),
    ],
    note: `投資額の${fmtPct(answer, 1)}が利益として返ってきた計算。ROIが高いほど投資効率が良い。`,
  };
}

// --- 正味現在価値（NPV） ------------------------------------------------
function genNpv(rng) {
  const rate = rng.pick([0.05, 0.1]); // 割引率
  const years = 2; // 2年分（手計算できる範囲に留める）
  const cash = rng.int(10, 40) * 10; // 各年のキャッシュフロー
  const invest = rng.int(10, 50) * 10;

  // 現在価値 = Σ CF/(1+r)^n
  const pv1 = cash / (1 + rate);
  const pv2 = cash / Math.pow(1 + rate, 2);
  const pvTotal = pv1 + pv2;
  const answer = round(pvTotal - invest, 2);

  const noDiscount = round(cash * years - invest, 2); // 割り引かない
  const noInvest = round(pvTotal, 2); // 投資額を引き忘れる
  const multiplied = round(cash * (1 + rate) + cash * Math.pow(1 + rate, 2) - invest, 2); // 掛けてしまう

  return {
    question:
      `初期投資 ${fmtManYen(invest)}のプロジェクトがあり、` +
      `1年後と2年後にそれぞれ ${fmtManYen(cash)}のキャッシュフローが見込まれる。\n` +
      `割引率を ${fmtPct(rate, 0)} とするとき、正味現在価値（NPV）はおよそいくらか。`,
    hint: '将来のお金を現在価値に割り引いてから合計し、最後に初期投資を引く。',
    answer,
    distractors: [
      { value: noDiscount, why: '割引をしていない。将来のお金は現在価値に直す必要がある。' },
      { value: noInvest, why: '初期投資を引いていない。「正味」なので投資額を差し引く。' },
      { value: multiplied, why: '(1+r)を掛けている。将来価値→現在価値は割る方向。' },
    ],
    format: (v) => fmtManYen(v),
    steps: [
      step('1年後の現在価値', `${cash} / 1.${String(rate * 100).padStart(2, '0')}`, round(pv1, 2), '万円'),
      step('2年後の現在価値', `${cash} / 1.${String(rate * 100).padStart(2, '0')}²`, round(pv2, 2), '万円'),
      step('現在価値の合計', `${fmtNum(pv1, 2)} + ${fmtNum(pv2, 2)}`, round(pvTotal, 2), '万円'),
      step('NPV', `${fmtNum(pvTotal, 2)} − ${invest}`, answer, '万円'),
    ],
    note:
      answer >= 0
        ? 'NPVがプラスなので、この投資は割引率を上回るリターンがあり採算が合う。'
        : 'NPVがマイナスなので、この割引率のもとでは採算が合わない。',
  };
}
