// EVM（アーンドバリューマネジメント）
// 落とし穴：差異（SV/CV）は「EV −」から始まる。引く順序を逆にすると符号が反転する。
// 指数（SPI/CPI）は「EV ÷」。分子は常にEV。

import { register, step, fmtNum, fmtManYen } from '../genkit.js';
import { round } from '../rng.js';

register({
  id: 'evm',
  name: 'EVM（アーンドバリュー）',
  category: 'マネジメント系',
  tags: ['EVM', 'SPI', 'CPI', 'SV', 'CV', 'EAC'],

  gen(rng) {
    return rng.pick([genVariance, genIndex, genEac])(rng);
  },
});

// PV/EV/AC を作る。単位は万円。
// EVとPV、EVとACをそれぞれ別方向にずらして、指標が1をまたぐ問題も出るようにする。
function baseValues(rng) {
  // SVとCV（SPIとCPI）が同じ値になる組合せは、
  // 「もう一方を答えるミス」「符号や分母分子を逆にするミス」が誤答として成立しないため避ける。
  //
  // 除外条件は PV==AC、2EV==PV+AC、EV²==PV·AC など複数あり、
  // 数式で列挙すると漏れやすい。実際の差異・指数の値どうしを比べて
  // 全て異なる組が出るまで引き直すほうが確実。
  for (let attempt = 0; attempt < 60; attempt++) {
    const pv = rng.int(10, 60) * 10; // 100〜600万円
    // EV は PV の 70〜125%（100%は避ける＝差異0だと誤答が潰れる）
    const ev = round(pv * rng.pick([0.7, 0.8, 0.9, 1.1, 1.2, 1.25]), 0);
    const ac = round(ev * rng.pick([0.75, 0.8, 0.9, 1.1, 1.2, 1.25]), 0);

    const values = [
      ev - pv, // SV
      ev - ac, // CV
      pv - ev, // SVの符号違い
      ac - ev, // CVの符号違い
      pv - ac, // EVを使わないミス
    ];
    const ratios = [
      ev / pv, // SPI
      ev / ac, // CPI
      pv / ev, // SPIの逆数
      ac / ev, // CPIの逆数
      pv / ac, // EVを使わないミス
    ];

    // 判定は「画面に出る文字列」で行う。
    // round(v, 3) で区別できても、表示が fmtNum(v, 3) で丸められて同じ文字列になれば、
    // 利用者から見れば同じ選択肢であり buildChoices に捨てられる。
    // （実際 1.0995 と 1.1 がどちらも "1.1" と表示されて誤答が足りなくなっていた）
    const distinct = (arr, digits) =>
      new Set(arr.map((v) => fmtNum(v, digits))).size === arr.length;

    if (distinct(values, 1) && distinct(ratios, 3)) return { pv, ev, ac };
  }
  // 引き直しで見つからない確率は事実上ゼロだが、無限ループは避ける。
  // この値が上の条件を満たすことは確認済み。
  return { pv: 100, ev: 70, ac: 53 };
}

function situation(pv, ev, ac) {
  return (
    `あるプロジェクトの、ある時点での状況は次のとおりである。\n` +
    `　PV（計画価値）：${fmtManYen(pv)}\n` +
    `　EV（出来高）：${fmtManYen(ev)}\n` +
    `　AC（実コスト）：${fmtManYen(ac)}`
  );
}

// --- 差異（SV / CV） ----------------------------------------------------
function genVariance(rng) {
  const { pv, ev, ac } = baseValues(rng);
  const isSchedule = rng.bool();

  const answer = isSchedule ? round(ev - pv, 4) : round(ev - ac, 4);
  const flipped = -answer; // 引く順序が逆
  const other = isSchedule ? round(ev - ac, 4) : round(ev - pv, 4); // もう一方の差異
  const otherFlipped = -other;
  const wrongPair = round(pv - ac, 4); // EVを使わない

  const name = isSchedule ? 'SV（スケジュール差異）' : 'CV（コスト差異）';
  const formula = isSchedule ? 'SV = EV − PV' : 'CV = EV − AC';

  return {
    question: `${situation(pv, ev, ac)}\nこのプロジェクトの ${name} はいくらか。`,
    hint: '差異はどちらも「EV −」から始まる。スケジュールならPV、コストならACを引く。',
    answer,
    distractors: [
      { value: flipped, why: `引く順序が逆（${isSchedule ? 'PV − EV' : 'AC − EV'}）。符号が反転している。` },
      { value: other, why: `もう一方の差異（${isSchedule ? 'CV = EV − AC' : 'SV = EV − PV'}）を求めている。` },
      { value: wrongPair, why: 'PV − AC を計算している。差異の基準は常にEV（実際にできた分）。' },
      { value: otherFlipped, why: 'もう一方の差異を、さらに逆順で計算している。' },
    ],
    format: (v) => (v >= 0 ? `+${fmtManYen(v)}` : `−${fmtManYen(-v)}`),
    steps: [
      step('公式', formula, null),
      step('代入', `${fmtNum(ev, 0)} − ${fmtNum(isSchedule ? pv : ac, 0)}`, answer, '万円'),
    ],
    note:
      answer >= 0
        ? `プラスなので${isSchedule ? '予定より進んでいる' : '予算内に収まっている'}。差異は「プラスが良い」と覚える。`
        : `マイナスなので${isSchedule ? '予定より遅れている' : '予算を超過している'}。差異は「プラスが良い」と覚える。`,
  };
}

// --- 指数（SPI / CPI） --------------------------------------------------
function genIndex(rng) {
  const { pv, ev, ac } = baseValues(rng);
  const isSchedule = rng.bool();

  const answer = round(isSchedule ? ev / pv : ev / ac, 4);
  const flipped = round(isSchedule ? pv / ev : ac / ev, 4); // 分母分子が逆
  const other = round(isSchedule ? ev / ac : ev / pv, 4); // もう一方の指数
  const wrongPair = round(pv / ac, 4);
  // 表示は fmtNum(v,3) で末尾の0が落ちるため、生値が違っても "1.1" のように
  // 同じ文字列になって潰れる組がある（1.0995 と 1.1 で実際に発生した）。
  // 値が明確に離れる誤答を足して吸収する。
  const acOverPv = round(ac / pv, 4); // EVを使わず、逆向きに割る
  // 「1 − 指数」を答えてしまうミス（達成率と未達率の取り違え）
  const oneMinus = round(1 - (isSchedule ? ev / pv : ev / ac), 4);

  const name = isSchedule ? 'SPI（スケジュール効率指数）' : 'CPI（コスト効率指数）';
  const formula = isSchedule ? 'SPI = EV ÷ PV' : 'CPI = EV ÷ AC';

  return {
    question: `${situation(pv, ev, ac)}\nこのプロジェクトの ${name} はいくらか。`,
    hint: '指数はどちらも「EV ÷」。分子は常にEV。',
    answer,
    distractors: [
      { value: flipped, why: `分子と分母が逆（${isSchedule ? 'PV ÷ EV' : 'AC ÷ EV'}）。分子は常にEV。` },
      { value: other, why: `もう一方の指数（${isSchedule ? 'CPI = EV ÷ AC' : 'SPI = EV ÷ PV'}）を求めている。` },
      { value: wrongPair, why: 'PV ÷ AC を計算している。指数の基準は常にEV。' },
      { value: acOverPv, why: 'AC ÷ PV を計算している。EVが入っていないので出来高を評価できていない。' },
      { value: oneMinus, why: '1から引いている。指数はそのまま1と比べる値（1以上なら良好）。' },
    ],
    format: (v) => fmtNum(v, 3),
    steps: [
      step('公式', formula, null),
      step('代入', `${fmtNum(ev, 0)} / ${fmtNum(isSchedule ? pv : ac, 0)}`, answer),
    ],
    note:
      answer >= 1
        ? `1以上なので${isSchedule ? '予定より進んでいる' : '効率よくコストを使えている'}。指数は「1以上が良い」。`
        : `1未満なので${isSchedule ? '予定より遅れている' : 'コスト効率が悪い'}。指数は「1以上が良い」。`,
  };
}

// --- 完成時総コスト見積（EAC） ------------------------------------------
function genEac(rng) {
  const { pv, ev, ac } = baseValues(rng);
  const bac = round(pv * rng.pick([1.5, 2, 2.5, 3]), 0); // 完成時総予算

  const cpi = ev / ac;
  const answer = round(bac / cpi, 0); // EAC = BAC / CPI

  const asBac = bac; // 予算どおりと考える
  const multiplied = round(bac * cpi, 0); // 掛けてしまう
  const plusAc = round(bac + ac, 0);
  const remaining = round(bac - ev, 0);

  return {
    question:
      `${situation(pv, ev, ac)}\n` +
      `完成時総予算（BAC）は ${fmtManYen(bac)} である。\n` +
      `現在のコスト効率がこのまま続くと仮定したとき、完成時総コスト見積（EAC）はいくらか。`,
    hint: 'EAC = BAC ÷ CPI。効率が悪い（CPI<1）ほど、見積は予算より膨らむ。',
    answer,
    distractors: [
      { value: asBac, why: '予算どおりに終わると考えている。現在のコスト効率を反映する必要がある。' },
      { value: multiplied, why: 'CPIを掛けている。効率が悪いほど総コストは増えるので割る。' },
      { value: remaining, why: 'BAC − EV は「残作業の価値」。完成時の総コストではない。' },
      { value: plusAc, why: 'BACにACを足している。ACは既にBACの一部を消化した実績。' },
    ],
    format: (v) => fmtManYen(v),
    steps: [
      step('CPI', `${fmtNum(ev, 0)} / ${fmtNum(ac, 0)}`, round(cpi, 4)),
      step('公式', 'EAC = BAC / CPI', null),
      step('代入', `${fmtNum(bac, 0)} / ${fmtNum(round(cpi, 4), 4)}`, answer, '万円'),
    ],
    note:
      cpi < 1
        ? `CPIが1未満なので、このままでは予算${fmtManYen(bac)}を約${fmtManYen(answer - bac)}超過する見込み。`
        : `CPIが1以上なので、このままなら予算${fmtManYen(bac)}を下回る見込み。`,
  };
}
