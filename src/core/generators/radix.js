// 基数変換・2の補数・情報量
// 落とし穴：2の補数で「ビット反転して+1」の+1を忘れる、
// 負数の表現範囲が正負で非対称（−2^(n−1) 〜 2^(n−1)−1）であること。

import { register, step, fmtNum } from '../genkit.js';

register({
  id: 'radix',
  name: '基数変換・2の補数',
  category: 'テクノロジ系',
  tags: ['基数変換', '2進数', '16進数', '2の補数', 'ビット'],

  gen(rng) {
    return rng.pick([genConvert, genComplement, genRange, genShift])(rng);
  },
});

const RADIX_NAME = { 2: '2進数', 8: '8進数', 10: '10進数', 16: '16進数' };

// --- 基数変換 -----------------------------------------------------------
function genConvert(rng) {
  const from = rng.pick([2, 8, 10, 16]);
  const to = rng.pick([2, 8, 10, 16].filter((r) => r !== from));

  // 桁を取り違えるミスが成立するよう、ある程度大きい値にする
  const value = rng.int(40, 4000);

  const answer = value.toString(to).toUpperCase();
  const src = value.toString(from).toUpperCase();

  // 典型ミス：変換先を間違える（別の基数で答える）
  const others = [2, 8, 10, 16].filter((r) => r !== to);
  const wrongRadix = others.map((r) => ({
    value: value.toString(r).toUpperCase(),
    why: `${RADIX_NAME[r]}に変換している。設問は${RADIX_NAME[to]}。`,
  }));

  // 典型ミス：桁を1つずらす（末尾に0を足す＝基数倍してしまう）
  const shifted = (value * to).toString(to).toUpperCase();
  // 典型ミス：変換の向きを逆にする（元の表記をそのまま別基数として読む）
  const reversed = parseInt(src, to).toString(to).toUpperCase();

  return {
    question:
      `${RADIX_NAME[from]}の ${src} を${RADIX_NAME[to]}で表すと、どれになるか。`,
    hint:
      from === 10 || to === 10
        ? '10進数を経由して考える。2進⇔16進なら4ビットずつまとめられる。'
        : '2進数を経由すると確実。16進1桁＝2進4桁、8進1桁＝2進3桁。',
    answer,
    distractors: [
      ...wrongRadix,
      { value: shifted, why: `末尾に0を足している（${to}倍になっている）。桁の位置を確認する。` },
      { value: reversed, why: '元の表記を変換先の基数として読み直している。まず元の基数で値を求める。' },
    ],
    steps: [
      step(`${RADIX_NAME[from]}表記`, src, null),
      step('10進数に直すと', String(value), value),
      step(`${RADIX_NAME[to]}表記`, answer, null),
    ],
    note:
      '2進⇔16進は4ビット区切り、2進⇔8進は3ビット区切りで一気に変換できる。' +
      '10進が絡むときだけ地道に割り算する。',
  };
}

// --- 2の補数 ------------------------------------------------------------
function genComplement(rng) {
  const bits = rng.pick([8, 8, 16]);
  const n = rng.int(1, Math.pow(2, bits - 1) - 1);

  const twos = (Math.pow(2, bits) - n) % Math.pow(2, bits); // −n の2の補数表現
  const ones = Math.pow(2, bits) - 1 - n; // 1の補数（ビット反転のみ）

  const pad = (v) => v.toString(2).padStart(bits, '0');

  const answer = pad(twos);
  const asOnes = pad(ones); // +1を忘れる
  const asIs = pad(n); // 符号を付け忘れる
  const plusTwo = pad((twos + 1) % Math.pow(2, bits)); // +2してしまう

  return {
    question:
      `${bits}ビットの2進数で、10進数の −${n} を2の補数表現で表すと、どれになるか。`,
    hint: '絶対値のビットを全反転して1を足す。',
    answer,
    distractors: [
      { value: asOnes, why: 'ビット反転だけで止まっている（1の補数）。最後に1を足す。' },
      { value: asIs, why: `+${n} をそのまま表している。負数は補数表現にする必要がある。` },
      { value: plusTwo, why: '1ではなく2を足している。足すのは1だけ。' },
    ],
    steps: [
      step(`+${n} の${bits}ビット表現`, pad(n), null),
      step('全ビットを反転', pad(ones), null),
      step('1を足す', `${pad(ones)} + 1`, null),
      step('2の補数表現', answer, null),
    ],
    note:
      `最上位ビットが1なら負数。検算は「元の数 + 補数 = 2^${bits}」で確かめられる（${n} + ${twos} = ${Math.pow(2, bits)}）。`,
  };
}

// --- 表現範囲 -----------------------------------------------------------
function genRange(rng) {
  const bits = rng.pick([8, 16, 32]);
  const signed = rng.bool();

  const answer = signed ? -Math.pow(2, bits - 1) : 0;
  const maxV = signed ? Math.pow(2, bits - 1) - 1 : Math.pow(2, bits) - 1;

  if (signed) {
    // 「最小値」を問う
    const noSign = 0;
    const offByOne = -(Math.pow(2, bits - 1) - 1); // 正負を対称だと思う
    const full = -(Math.pow(2, bits) - 1);
    const halfWrong = -Math.pow(2, bits - 2);

    return {
      question:
        `${bits}ビットで符号付き整数を2の補数表現で表すとき、表せる最小の値はいくらか。`,
      hint: '2の補数では負の側が1つ多く表せる（0が正の側に入るため）。',
      answer,
      distractors: [
        { value: offByOne, why: `正負が対称だと考えている。2の補数の負側は1つ多く、−2^${bits - 1} まで表せる。` },
        { value: full, why: '符号ビットを考慮していない。1ビットは符号に使われる。' },
        { value: halfWrong, why: 'ビット数の数え方を1つ間違えている。符号を除くと残りは' + (bits - 1) + 'ビット。' },
        { value: noSign, why: '符号なしとして考えている。設問は符号付き。' },
      ],
      format: (v) => String(v),
      steps: [
        step('符号を除いたビット数', `${bits} − 1`, bits - 1, 'ビット'),
        step('表せる範囲', `−2^${bits - 1} 〜 2^${bits - 1} − 1`, null),
        step('最小値', `−2^${bits - 1}`, answer),
      ],
      note: `範囲は ${answer} 〜 ${maxV}。負側が1つ多いのは、0が正の側に含まれるため。`,
    };
  }

  // 符号なしの「最大値」を問う
  const answerMax = Math.pow(2, bits) - 1;
  const noMinus1 = Math.pow(2, bits);
  const asSigned = Math.pow(2, bits - 1) - 1;
  const asSignedNoMinus = Math.pow(2, bits - 1);

  return {
    question: `${bits}ビットで符号なし整数を表すとき、表せる最大の値はいくらか。`,
    hint: '全ビットが1のときが最大。2^ビット数 は「個数」であって最大値ではない。',
    answer: answerMax,
    distractors: [
      { value: noMinus1, why: '1を引いていない。0から数え始めるので最大値は 2^n − 1。' },
      { value: asSigned, why: '符号付きとして考えている。設問は符号なしなので符号ビットは不要。' },
      { value: asSignedNoMinus, why: '符号付きとして考えたうえに1も引いていない。' },
    ],
    format: (v) => fmtNum(v, 0),
    steps: [
      step('表せる個数', `2^${bits}`, Math.pow(2, bits), '通り'),
      step('0から数えるので', `2^${bits} − 1`, answerMax),
    ],
    note: `範囲は 0 〜 ${answerMax}。「個数」と「最大値」が1ずれることに注意。`,
  };
}

// --- シフト演算 ---------------------------------------------------------
function genShift(rng) {
  const shift = rng.int(1, 4);
  const left = rng.bool();

  // 右シフトのとき、元の値が小さいと答えが0に潰れる。
  // 「シフト数を1つ多く数える」ミスの値まで0になり、誤答が作れなくなるため、
  // 右シフトでは 2^(shift+1) より十分大きい値だけを使う（結果が必ず2以上になる）。
  const min = left ? 3 : Math.pow(2, shift + 1) * 2;
  const value = rng.int(min, min + 200);

  const answer = left ? value * Math.pow(2, shift) : Math.floor(value / Math.pow(2, shift));

  const opposite = left ? Math.floor(value / Math.pow(2, shift)) : value * Math.pow(2, shift);
  const byShift = left ? value * shift : Math.floor(value / shift); // 2^nでなくnを掛ける
  const offByOne = left ? value * Math.pow(2, shift + 1) : Math.floor(value / Math.pow(2, shift + 1));
  // シフト数を1つ少なく数えるミス。上の offByOne と逆方向なので、片方が潰れても残る
  const offByOneUnder = left
    ? value * Math.pow(2, Math.max(1, shift - 1))
    : Math.floor(value / Math.pow(2, Math.max(1, shift - 1)));
  // 10進の桁をずらすミス（2進なのに10倍・1/10で考える）
  const decimalShift = left ? value * 10 : Math.floor(value / 10);

  return {
    question:
      `10進数の ${value} を2進数で表し、${left ? '左' : '右'}に ${shift} ビット` +
      `${left ? '論理シフト' : '算術シフト'}した。結果を10進数で表すといくらか。` +
      `${left ? 'なお、桁あふれは起こらないものとする。' : 'なお、あふれたビットは切り捨てる。'}`,
    hint: `1ビット${left ? '左' : '右'}シフトは${left ? '2倍' : '2で割る'}のと同じ。`,
    answer,
    distractors: [
      { value: opposite, why: `シフトの向きが逆。${left ? '左シフトは大きく' : '右シフトは小さく'}なる。` },
      { value: byShift, why: `ビット数そのものを${left ? '掛けて' : '割って'}いる。正しくは2のシフト数乗。` },
      { value: offByOne, why: 'シフト数を1つ多く数えている。' },
      { value: offByOneUnder, why: 'シフト数を1つ少なく数えている。' },
      { value: decimalShift, why: '10進数の桁でずらしている。2進数のシフトは2倍・1/2。' },
    ],
    format: (v) => fmtNum(v, 0),
    steps: [
      step('2進数表記', value.toString(2), null),
      step(`${shift}ビット${left ? '左' : '右'}シフト`, answer.toString(2), null),
      step('10進数に戻す', `${value} ${left ? '×' : '÷'} 2^${shift}`, answer),
    ],
    note: `nビットの${left ? '左' : '右'}シフトは2^n${left ? '倍' : 'で割る'}のと同じ。掛け算・割り算の高速化に使われる。`,
  };
}
