// 待ち行列理論 M/M/1
// 落とし穴：「待ち時間」と「応答時間（＝待ち時間＋処理時間）」の取り違え。
// ρ=λ/μ が1に近づくと待ちが爆発する — シミュレータで体感できるようにしてある。

import { register, step, fmtNum, fmtPct } from '../genkit.js';
import { round } from '../rng.js';

register({
  id: 'queue',
  name: '待ち行列（M/M/1）',
  category: 'テクノロジ系',
  tags: ['待ち行列', '利用率', '応答時間', 'M/M/1'],
  simId: 'queue', // 対応するシミュレータ

  gen(rng) {
    return rng.pick([genWait, genResponse, genUtil])(rng);
  },
});

// パラメータは「利用率が半端すぎない」範囲に取る。
// ρ=0.9 を超えると待ち時間が跳ね上がって選択肢の桁が揃わなくなるため上限を置く。
function baseParams(rng) {
  const ts = rng.int(2, 20) / 10; // 平均サービス時間 0.2〜2.0秒
  // ρ=0.5 は避ける。ρ/(1−ρ)=1 となり「分数を逆にするミス」が正解と同じ値になって
  // 誤答として成立しないうえ、問題としても偶然当たりやすくなる。
  const rho = rng.pick([0.2, 0.25, 0.3, 0.4, 0.6, 0.7, 0.75, 0.8]);
  const lambda = round(rho / ts, 6); // λ = ρ/Ts
  return { ts, rho, lambda };
}

// --- 平均待ち時間 -------------------------------------------------------
function genWait(rng) {
  const { ts, rho } = baseParams(rng);

  const answer = round((rho / (1 - rho)) * ts, 4); // Tw
  const response = round(answer + ts, 4); // 典型ミス：応答時間を答える
  // 注：Ts/(1−ρ) は応答時間と同じ値なので誤答に使わない（responseと重複する）
  const inverted = round(((1 - rho) / rho) * ts, 4); // 分数を逆にする
  const justRho = round(rho * ts, 4); // ρ×Ts で止まる
  const noTs = round(rho / (1 - rho), 4); // Tsを掛け忘れる

  return {
    question:
      `M/M/1 の待ち行列モデルで、平均サービス時間が ${fmtNum(ts, 1)} 秒、` +
      `窓口の利用率が ${fmtPct(rho, 0)} である。\n` +
      `このとき平均待ち時間は何秒か。`,
    hint: '待ち時間は「自分の処理時間」を含まない。含めると応答時間になる。',
    answer,
    distractors: [
      { value: response, why: '応答時間（待ち時間＋処理時間）を答えている。設問は待ち時間だけ。' },
      { value: inverted, why: '分数を逆にしている（(1−ρ)/ρ）。ρが大きいほど待つ、が正しい向き。' },
      { value: justRho, why: 'ρ×Ts で止まっている。(1−ρ)で割る「混雑による増幅」が抜けている。' },
      { value: noTs, why: 'サービス時間Tsを掛け忘れている。ρ/(1−ρ) は「Tsの何倍待つか」という倍率。' },
    ],
    format: (v) => `${fmtNum(v, 3)}秒`,
    steps: [
      step('公式', 'Tw = ρ/(1−ρ) × Ts', null),
      step('混雑度', `${fmtNum(rho, 2)} / (1 − ${fmtNum(rho, 2)})`, round(rho / (1 - rho), 6)),
      step('待ち時間', `${fmtNum(round(rho / (1 - rho), 6), 4)} × ${fmtNum(ts, 1)}`, answer, '秒'),
    ],
    note:
      `利用率${fmtPct(rho, 0)}で待ち時間は処理時間の${fmtNum(rho / (1 - rho), 2)}倍。` +
      `ρが1に近づくと分母が0に近づき、待ち時間は無限に発散する。`,
  };
}

// --- 平均応答時間 -------------------------------------------------------
function genResponse(rng) {
  const { ts, rho } = baseParams(rng);

  const answer = round(ts / (1 - rho), 4); // Tq = Ts/(1-ρ)
  const waitOnly = round((rho / (1 - rho)) * ts, 4); // 典型ミス：待ち時間で止まる
  const inverted = round(ts * (1 - rho), 4); // 掛け算にしてしまう
  const doubled = round(ts / (1 - rho) + ts, 4); // 処理時間を二重に足す

  return {
    question:
      `M/M/1 の待ち行列モデルで、平均サービス時間が ${fmtNum(ts, 1)} 秒、` +
      `窓口の利用率が ${fmtPct(rho, 0)} である。\n` +
      `このとき平均応答時間（システムに入ってから出るまで）は何秒か。`,
    hint: '応答時間 = 待ち時間 + 自分の処理時間。まとめると Ts/(1−ρ)。',
    answer,
    distractors: [
      { value: waitOnly, why: '待ち時間だけを答えている。応答時間は自分の処理時間も含む。' },
      { value: inverted, why: '(1−ρ)を掛けている。混雑すると短くなる式になってしまい向きが逆。' },
      { value: doubled, why: '処理時間を二重に足している。Ts/(1−ρ) の時点で既に含まれている。' },
    ],
    format: (v) => `${fmtNum(v, 3)}秒`,
    steps: [
      step('公式', 'Tq = Ts / (1−ρ)　（= 待ち時間 + Ts）', null),
      step('代入', `${fmtNum(ts, 1)} / (1 − ${fmtNum(rho, 2)})`, answer, '秒'),
      step('内訳（参考）', `待ち ${fmtNum(waitOnly, 3)}秒 + 処理 ${fmtNum(ts, 1)}秒`, null),
    ],
    note: '応答時間と待ち時間の差は「自分の処理時間Ts」ちょうど。設問がどちらを聞いているか必ず確認する。',
  };
}

// --- 利用率 -------------------------------------------------------------
function genUtil(rng) {
  // Ts=1.0秒 と λ=1.0 は避ける。
  //   Ts=1 だと λ×Ts と λ/Ts が同じ値になる
  //   λ=1（Ts=ρのとき）だと λ/Ts・1/Ts・1/(λTs) が3つとも同じ値に潰れる
  // どちらも「掛けるか割るか」を問う誤答が成立しなくなる。
  const ts = rng.pick([0.2, 0.4, 0.5, 0.8, 1.2, 1.5, 2.0]);
  const rho = rng.pick([0.2, 0.3, 0.4, 0.6, 0.7, 0.8].filter((r) => r !== ts));
  const lambda = round(rho / ts, 4);

  const answer = round(lambda * ts, 4);
  const inverted = round(1 / (lambda * ts), 4);
  const divided = round(lambda / ts, 4);
  const complement = round(1 - lambda * ts, 4);
  const asMu = round(1 / ts, 4); // サービス率をそのまま答える

  return {
    question:
      `M/M/1 の待ち行列モデルで、平均到着率が ${fmtNum(lambda, 3)} 件/秒、` +
      `平均サービス時間が ${fmtNum(ts, 1)} 秒である。\n` +
      `この窓口の利用率はいくらか。`,
    hint: 'ρ = λ/μ。μ（サービス率）はサービス時間の逆数なので、ρ = λ×Ts。',
    answer,
    distractors: [
      { value: complement, why: '1から引いている。これは「窓口が空いている割合」。' },
      { value: divided, why: 'λをTsで割っている。Tsは時間なので掛けるのが正しい（ρ=λ/μ=λ×Ts）。' },
      { value: asMu, why: 'サービス率μ（＝1/Ts）を答えている。利用率はλとμの比。' },
      { value: inverted, why: '逆数を取っている。利用率は必ず0〜1に収まる。' },
    ],
    format: (v) => fmtNum(v, 4),
    steps: [
      step('サービス率', `μ = 1 / ${fmtNum(ts, 1)}`, round(1 / ts, 4), '件/秒'),
      step('利用率', `ρ = λ × Ts = ${fmtNum(lambda, 3)} × ${fmtNum(ts, 1)}`, answer),
    ],
    note: `利用率${fmtPct(answer, 1)}。ρ≧1になると行列は無限に伸びる（システムが破綻する）。`,
  };
}
