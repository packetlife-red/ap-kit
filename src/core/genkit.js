// ジェネレータ共通のヘルパ。
// ここの関数は DOM に触らない（jsc からも import して検証するため）。

import { round, makeRng } from './rng.js';

// 選択肢の組み立て。
//
// 設計の芯：誤答は「典型的なミスをするとこの値になる」ものだけを使う。
// ランダムなダミー値を混ぜない — 消去法で当たってしまうと学習にならないし、
// 「なぜその誤答になるのか」を解説できるからこそ復習の価値が出る。
//
// distractors は [{ value, why }] の形。why は「その誤答に至る考え違い」。
export function buildChoices(rng, answer, distractors, format) {
  const fmt = format || String;
  // 重複判定は「画面に出る文字列」で行う。値が違っても丸めて同じ表示になるなら、
  // 利用者から見れば同じ選択肢が2つ並んでいるのと変わらない。
  const seen = new Set([fmt(answer)]);
  const picked = [];

  for (const d of distractors) {
    if (picked.length >= 3) break;
    if (!isSane(d.value)) continue;
    const k = fmt(d.value);
    // 正解や既出と重複する誤答は捨てる（パラメータ次第で衝突しうる）
    if (seen.has(k)) continue;
    seen.add(k);
    picked.push(d);
  }

  if (picked.length < 3) {
    throw new Error(
      `distractorが足りない（有効${picked.length}件）。パラメータ範囲を見直すこと。`
    );
  }

  const items = [
    { value: answer, correct: true, why: null },
    ...picked.map((d) => ({ value: d.value, correct: false, why: d.why })),
  ];

  const shuffled = rng.shuffle(items);
  return {
    choices: shuffled.map((c) => fmt(c.value)),
    choiceMeta: shuffled.map((c) => ({ correct: c.correct, why: c.why })),
    answerIndex: shuffled.findIndex((c) => c.correct),
  };
}

function isSane(v) {
  if (typeof v !== 'number') return v !== null && v !== undefined && v !== '';
  return Number.isFinite(v);
}

// 解説の1ステップ。value を構造として持たせることで、
// 「解説の最終値と正解が一致するか」を機械検証できるようにする。
export function step(label, expr, value, unit = '') {
  return { label, expr, value, unit };
}

// 「教える解説」のブロック。
//
// steps だけだと式の羅列になり、公式を既に知っている人しか読めない。
// 実際に「今の実力では解説が分からない」というフィードバックを受けたため、
// 式の前に「何を聞かれているか」「なぜその式になるか」を日本語で置けるようにした。
//
// kind:
//   'ask'  … この問題は何を聞いているのか（1〜2文）
//   'why'  … なぜその考え方・式になるのか（理屈。ここが本体）
//   'calc' … 数字を追える形の計算（steps とは別に、途中を全部見せたいとき）
//   'trap' … つまずきポイント。混同しやすい相手を名指しする
export function explain(kind, title, body) {
  return { kind, title, body };
}

// --- 表示フォーマット ---------------------------------------------------

export function fmtNum(x, digits = 2) {
  if (!Number.isFinite(x)) return String(x);
  const r = round(x, digits);

  // 5桁以上には桁区切りを入れる。
  // 12500 と 125000 は、区切りが無いと桁を数えないと見分けられない。
  // （選択肢の比較で「10000MIPS / 12500MIPS」が並ぶ実例があった）
  //
  // 4桁までは入れない。2進数・年・小さな個数など、区切ると
  // かえって不自然になるものがこの範囲に集中するため。
  const sep = (n) =>
    Math.abs(n) >= 10000 ? n.toLocaleString('ja-JP', { maximumFractionDigits: 20 }) : String(n);

  // 整数なら小数点を出さない（「4」を「4.00」と書くと読みにくい）
  if (Number.isInteger(r)) return sep(r);

  const fixed = r.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  // 整数部だけ区切り、小数部はそのまま残す
  const [ip, fp] = fixed.split('.');
  const ipNum = Number(ip);
  return fp ? `${sep(ipNum)}.${fp}` : sep(ipNum);
}

export function fmtPct(x, digits = 1) {
  return `${fmtNum(x * 100, digits)}%`;
}

export function fmtYen(x) {
  return `${Math.round(x).toLocaleString('ja-JP')}円`;
}

// 大きな整数は必ず桁区切りを入れる。
// 1600000000 のような数は桁を数えないと読めず、選択肢の比較で確実に事故る。
export function fmtInt(x) {
  if (!Number.isFinite(x)) return String(x);
  return Math.round(x).toLocaleString('ja-JP');
}

// 極端に小さい率の表示。
//
// 0.00025001 のような数字は、桁を数えないと大小すら比較できない。
// 「何回に1回か」を併記すると、選択肢を意味で選べるようになる。
// （「単位が細かくて見づらい」というフィードバックを受けて追加）
export function fmtSmallRate(x) {
  if (!Number.isFinite(x) || x <= 0) return fmtNum(x, 8);
  // 1以上は率としてありえない値（分子分母を逆にしたミスなど）。
  // そのまま出すと 79998 のように桁区切りもなく並ぶので、整数として整える。
  if (x >= 1) return fmtInt(x);
  if (x >= 0.01) return `${fmtNum(x * 100, 2)}%`;
  const once = Math.round(1 / x);
  return `${fmtNum(x * 100, 4)}%（約${once.toLocaleString('ja-JP')}回に1回）`;
}

// 時間の読みやすい表示。ナノ秒の生値は桁が多くて比較できないので、
// 大きければミリ秒・マイクロ秒に繰り上げて併記する。
export function fmtNs(x) {
  if (!Number.isFinite(x)) return String(x);
  if (x >= 1e6) return `${fmtNum(x / 1e6, 3)}ミリ秒`;
  if (x >= 1e3) return `${fmtNum(x / 1e3, 3)}マイクロ秒`;
  return `${fmtNum(x, 1)}ナノ秒`;
}

export function fmtManYen(x) {
  return `${fmtNum(x, 1)}万円`;
}

// --- 登録 ---------------------------------------------------------------

const registry = [];

export function register(gen) {
  for (const k of ['id', 'name', 'category', 'gen']) {
    if (!gen[k]) throw new Error(`ジェネレータに ${k} がない`);
  }
  if (registry.some((g) => g.id === gen.id)) {
    throw new Error(`ジェネレータIDが重複: ${gen.id}`);
  }
  registry.push(gen);
  return gen;
}

// ジェネレータ本体は { question, answer, distractors, steps, ... } を返すだけでよく、
// 選択肢のシャッフル・重複除去・整形はここで一括して行う。
// UI も verify もこの関数だけを呼ぶ（＝出題経路が1本になる）。
export function generate(id, seed) {
  const g = getGenerator(id);
  if (!g) throw new Error(`未登録のジェネレータ: ${id}`);

  const rng = makeRng(seed);
  const raw = g.gen(rng);

  const { choices, choiceMeta, answerIndex } = buildChoices(
    rng,
    raw.answer,
    raw.distractors,
    raw.format
  );

  return {
    generatorId: g.id,
    generatorName: g.name,
    category: g.category,
    seed,
    question: raw.question,
    hint: raw.hint || null,
    choices,
    choiceMeta,
    answerIndex,
    answer: raw.answer,
    answerText: (raw.format || String)(raw.answer),
    steps: raw.steps || [],
    // explain は後付けなので、まだ書いていないジェネレータでは空配列になる。
    // UI 側は空なら従来どおり steps だけを出す。
    explain: raw.explain || [],
    note: raw.note || null,
    svg: raw.svg || null,
  };
}

export function allGenerators() {
  return registry.slice();
}

export function getGenerator(id) {
  return registry.find((g) => g.id === id) || null;
}
