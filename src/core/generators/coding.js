// 符号化・圧縮（ハフマン符号、平均符号長、圧縮率）
// 落とし穴：平均符号長は「出現率×符号長」の加重平均。
// 圧縮率は「圧縮後÷圧縮前」か「削減した割合」か、設問の定義を確認する。

import { register, step, fmtNum, fmtPct } from '../genkit.js';
import { round } from '../rng.js';

register({
  id: 'coding',
  name: 'ハフマン符号・圧縮率',
  category: 'テクノロジ系',
  tags: ['ハフマン符号', '平均符号長', '圧縮率', '符号化'],

  gen(rng) {
    return rng.pick([genAvgLength, genCompression, genFixedVsVariable])(rng);
  },
});

// ハフマン木を実際に構築して符号長を求める。
// 手で木を書かなくても答えが出せるよう、結果だけを使う。
function huffmanLengths(freqs) {
  // ノード: { w, len } — len はそのノード配下の全記号の符号長を後で加算する
  const nodes = freqs.map((w, i) => ({ w, leaves: [i] }));
  const lengths = new Array(freqs.length).fill(0);

  const pool = nodes.slice();
  while (pool.length > 1) {
    // 重みの小さい2つを取り出す（同値なら添字の小さい方＝決定的にする）
    pool.sort((a, b) => a.w - b.w || a.leaves[0] - b.leaves[0]);
    const x = pool.shift();
    const y = pool.shift();
    // この2つをまとめる＝配下の全記号の符号長が1ずつ伸びる
    for (const i of x.leaves) lengths[i]++;
    for (const i of y.leaves) lengths[i]++;
    pool.push({ w: x.w + y.w, leaves: x.leaves.concat(y.leaves) });
  }
  return lengths;
}

// 出現率の組を作る。合計が1になり、ハフマン木が一意に決まりやすい形にする。
function makeFreqs(rng) {
  // 分母を100にして、偏りのある分布を作る（ハフマンが効く形）。
  //
  // 均等に近い分布（例 35/30/25/10）は全記号の符号長が同じになり、
  // 平均符号長＝単純平均＝最大＝最小＝固定長 と全て一致して誤答が作れない。
  // ハフマンを使う意味自体が薄い分布なので、出題としても外す。
  const patterns = [
    [50, 25, 13, 12],
    [40, 30, 20, 10],
    [45, 25, 20, 10],
    [55, 20, 15, 10],
    [60, 20, 12, 8],
    [50, 20, 15, 10, 5],
    [40, 25, 15, 12, 8],
    [45, 20, 15, 12, 8],
    [55, 15, 12, 10, 8],
  ];
  const p = rng.pick(patterns);
  const names = ['A', 'B', 'C', 'D', 'E'].slice(0, p.length);
  return names.map((name, i) => ({ name, pct: p[i] }));
}

// --- 平均符号長 ---------------------------------------------------------
function genAvgLength(rng) {
  const freqs = makeFreqs(rng);
  const lens = huffmanLengths(freqs.map((f) => f.pct));

  const answer = round(
    freqs.reduce((s, f, i) => s + (f.pct / 100) * lens[i], 0),
    4
  );

  const n = freqs.length;
  const fixedBits = Math.ceil(Math.log2(n)); // 固定長で表す場合のビット数
  const simpleAvg = round(lens.reduce((s, l) => s + l, 0) / n, 4); // 単純平均
  const maxLen = Math.max(...lens);
  const minLen = Math.min(...lens);

  const table = freqs
    .map((f, i) => `　${f.name}：出現率 ${f.pct}%、符号長 ${lens[i]}ビット`)
    .join('\n');

  return {
    question:
      `ある文字列を、次のハフマン符号で符号化した。\n${table}\n` +
      `1文字あたりの平均符号長は何ビットか。`,
    hint: '出現率を重みとした加重平均。よく出る文字ほど短い符号が割り当てられている。',
    answer,
    distractors: [
      { value: simpleAvg, why: '符号長の単純平均を取っている。出現率という重みを使っていない。' },
      { value: fixedBits, why: `${n}種類を固定長で表した場合のビット数。ハフマンは可変長なので短くなる。` },
      { value: maxLen, why: '最も長い符号の長さを答えている。平均は全体の重み付き和。' },
      { value: minLen, why: '最も短い符号の長さを答えている。平均は全体の重み付き和。' },
    ],
    format: (v) => `${fmtNum(v, 3)}ビット`,
    steps: [
      step('公式', '平均符号長 = Σ(出現率 × 符号長)', null),
      step(
        '代入',
        freqs.map((f, i) => `${fmtNum(f.pct / 100, 2)}×${lens[i]}`).join(' + '),
        answer,
        'ビット'
      ),
    ],
    note:
      `${n}種類を固定長で表すと${fixedBits}ビット必要だが、ハフマン符号なら平均${fmtNum(answer, 3)}ビット。` +
      `よく出る文字に短い符号を割り当てることで縮んでいる。`,
  };
}

// --- 圧縮率 -------------------------------------------------------------
function genCompression(rng) {
  // before=100 は避ける。削減量（Mバイト）と削減率（%）が同じ数値になり、
  // 「単位を取り違えるミス」が正解と区別できなくなる。
  const before = rng.pick([120, 150, 200, 240, 300, 400, 500, 600, 750, 800]);
  // ratio=0.5 も避ける。「圧縮後の割合」と「削減した割合」がどちらも50%で一致してしまう。
  const ratio = rng.pick([0.2, 0.25, 0.3, 0.4, 0.6, 0.75]);
  const after = round(before * ratio, 4);

  // 「圧縮率」の定義は問題文で明示する（曖昧さを残さない）
  const answer = round((1 - ratio) * 100, 4); // 削減した割合(%)

  const asRatio = round(ratio * 100, 4); // 圧縮後の割合を答える
  const asTimes = round((1 / ratio) * 100, 4); // 何倍縮んだかを%にする
  // 削減量（Mバイト）。before×(1−ratio) が ratio×100 と偶然一致する組があるため、
  // そのときは buildChoices 側で自動的に捨てられる。
  const asDiff = round(before - after, 4);
  const overAfter = round(((before - after) / after) * 100, 4); // 分母を圧縮後にする

  return {
    question:
      `${before} Mバイトのファイルを圧縮したところ、${fmtNum(after, 1)} Mバイトになった。\n` +
      `このときの圧縮率（元のサイズからどれだけ削減できたかの割合）は何%か。`,
    hint: '削減できた量が元のサイズの何%にあたるかを求める。',
    answer,
    distractors: [
      { value: asRatio, why: '圧縮後のサイズが元の何%かを答えている。設問は「削減できた割合」。' },
      { value: asDiff, why: '削減した量（Mバイト）を答えている。設問は割合（%）。' },
      { value: overAfter, why: '圧縮後のサイズを分母にしている。基準は圧縮前のサイズ。' },
      { value: asTimes, why: '元のサイズが圧縮後の何倍かを計算している。削減率とは別の指標。' },
    ],
    format: (v) => `${fmtNum(v, 1)}%`,
    steps: [
      step('削減できた量', `${before} − ${fmtNum(after, 1)}`, round(before - after, 4), 'Mバイト'),
      step('元のサイズに対する割合', `${fmtNum(before - after, 1)} / ${before}`, round(1 - ratio, 4)),
      step('%表記', `${fmtNum(1 - ratio, 4)} × 100`, answer, '%'),
    ],
    note:
      '「圧縮率」は文脈によって「圧縮後の割合」を指すこともある。' +
      '設問がどちらの定義かを必ず確認する（この問題は削減した割合）。',
  };
}

// --- 固定長との比較 -----------------------------------------------------
function genFixedVsVariable(rng) {
  const freqs = makeFreqs(rng);
  const lens = huffmanLengths(freqs.map((f) => f.pct));
  const n = freqs.length;

  const avg = freqs.reduce((s, f, i) => s + (f.pct / 100) * lens[i], 0);
  const fixedBits = Math.ceil(Math.log2(n));
  const chars = rng.int(10, 90) * 100; // 文字数

  // 削減できるビット数
  const answer = round(chars * (fixedBits - avg), 0);

  const totalHuffman = round(chars * avg, 0); // ハフマンでの総ビット数
  const totalFixed = round(chars * fixedBits, 0); // 固定長での総ビット数
  const perChar = round(fixedBits - avg, 4); // 1文字あたりの削減

  const table = freqs
    .map((f, i) => `　${f.name}：出現率 ${f.pct}%、符号長 ${lens[i]}ビット`)
    .join('\n');

  return {
    question:
      `${n}種類の文字からなる ${chars.toLocaleString('ja-JP')} 文字のデータがある。\n` +
      `固定長で符号化した場合と、次のハフマン符号を使った場合を比べる。\n${table}\n` +
      `ハフマン符号を使うと、全体で何ビット削減できるか。`,
    hint: `${n}種類なら固定長は${fixedBits}ビット。1文字あたりの差に文字数を掛ける。`,
    answer,
    distractors: [
      { value: totalHuffman, why: 'ハフマン符号での総ビット数を答えている。設問は削減できるビット数（差）。' },
      { value: totalFixed, why: '固定長での総ビット数を答えている。設問は削減できるビット数（差）。' },
      { value: perChar, why: '1文字あたりの削減ビット数で止まっている。文字数を掛ける。' },
    ],
    format: (v) => `${fmtNum(v, 0)}ビット`,
    steps: [
      step('固定長のビット数', `${n}種類 → 2^${fixedBits} ≧ ${n}`, fixedBits, 'ビット'),
      step('ハフマンの平均符号長', 'Σ(出現率 × 符号長)', round(avg, 4), 'ビット'),
      step('1文字あたりの削減', `${fixedBits} − ${fmtNum(avg, 4)}`, round(fixedBits - avg, 4), 'ビット'),
      step('全体の削減', `${chars} × ${fmtNum(fixedBits - avg, 4)}`, answer, 'ビット'),
    ],
    note:
      `固定長なら${totalFixed.toLocaleString('ja-JP')}ビット、ハフマンなら${totalHuffman.toLocaleString('ja-JP')}ビット。` +
      `出現率に偏りがあるほどハフマンの効果が大きくなる。`,
  };
}
