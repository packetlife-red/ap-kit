// 伝送時間・回線速度・データ量
// 落とし穴：バイトとビットの8倍、伝送効率の掛け忘れ、
// 「Mビット/秒」の M が10⁶ なのに 1024² で計算してしまう。

import { register, step, fmtNum, fmtPct } from '../genkit.js';
import { round } from '../rng.js';

register({
  id: 'transfer',
  name: '伝送時間・データ量',
  category: 'テクノロジ系',
  tags: ['伝送時間', '回線速度', '伝送効率', '標本化定理'],

  gen(rng) {
    return rng.pick([genTransferTime, genSampling, genCapacity])(rng);
  },
});

// --- 伝送時間 -----------------------------------------------------------
function genTransferTime(rng) {
  const mbMB = rng.pick([2, 5, 10, 20, 50, 100]); // Mバイト
  const mbps = rng.pick([8, 20, 40, 50, 80, 100, 200]); // Mビット/秒
  const eff = rng.pick([0.5, 0.6, 0.7, 0.8]); // 伝送効率

  // 時間 = データ量(ビット) / (回線速度 × 伝送効率)
  const bits = mbMB * 8; // Mビット
  const answer = round(bits / (mbps * eff), 4);

  const noEff = round(bits / mbps, 4); // 伝送効率を忘れる
  const noByte = round(mbMB / (mbps * eff), 4); // バイト→ビットを忘れる
  const divEff = round((bits / mbps) * eff, 4); // 効率を掛けてしまう

  return {
    question:
      `${mbMB} Mバイトのデータを、伝送速度 ${mbps} Mビット/秒、` +
      `伝送効率 ${fmtPct(eff, 0)} の回線で送信する。\n` +
      `伝送にかかる時間は何秒か。`,
    hint: 'バイトとビットの単位を揃えてから、実効速度（速度×効率）で割る。',
    answer,
    distractors: [
      { value: noEff, why: '伝送効率を掛け忘れている。効率が悪いほど時間はかかる。' },
      { value: noByte, why: 'バイトをビットに直していない。1バイト＝8ビット。' },
      { value: divEff, why: '効率を掛けている。実効速度は「速度×効率」で、それで割る。' },
    ],
    format: (v) => `${fmtNum(v, 2)}秒`,
    steps: [
      step('データ量をビットへ', `${mbMB} Mバイト × 8`, bits, 'Mビット'),
      step('実効速度', `${mbps} × ${fmtNum(eff, 1)}`, round(mbps * eff, 4), 'Mビット/秒'),
      step('伝送時間', `${bits} / ${fmtNum(mbps * eff, 2)}`, answer, '秒'),
    ],
    note: 'この手の問題は「単位を揃える」が全て。Mバイト→Mビットの×8を落とすと8倍ずれる。',
  };
}

// --- 標本化定理・音声データ量 -------------------------------------------
function genSampling(rng) {
  const khz = rng.pick([8, 11, 16, 22, 44, 48]); // 標本化周波数 kHz
  const bits = rng.pick([8, 16, 24]); // 量子化ビット数
  const ch = rng.pick([1, 2]); // チャネル数
  const sec = rng.pick([10, 30, 60, 120, 300]);

  // データ量(バイト) = 標本化周波数 × 量子化ビット数 × ch × 秒 / 8
  const answer = round((khz * 1000 * bits * ch * sec) / 8 / 1e6, 4); // Mバイト

  const inBits = round((khz * 1000 * bits * ch * sec) / 1e6, 4); // 8で割り忘れ
  const doubleDiv = round((khz * 1000 * (bits / 8) * ch * sec) / 8 / 1e6, 4); // 8で二重に割る
  const kiloAs1024 = round((khz * 1024 * bits * ch * sec) / 8 / 1e6, 4); // kを1024として計算
  // チャネル数の扱いを誤るミス。
  // ch=1 のとき「掛け忘れ」は正解と一致し、ch=2 のとき「半分にするミス」と同値になるため、
  // それぞれで成立する側だけを誤答に使う。
  const chMistake =
    ch === 1
      ? round((khz * 1000 * bits * 2 * sec) / 8 / 1e6, 4) // モノラルなのに2倍している
      : round((khz * 1000 * bits * sec) / 8 / 1e6, 4); // ステレオなのに1ch分で計算

  const chName = ch === 1 ? 'モノラル（1チャネル）' : 'ステレオ（2チャネル）';

  return {
    question:
      `音声を標本化周波数 ${khz} kHz、量子化ビット数 ${bits} ビット、${chName} で ` +
      `${sec} 秒間録音する。\n圧縮しない場合のデータ量はおよそ何Mバイトか。` +
      `なお 1Mバイト＝10⁶ バイトとする。`,
    hint: '1秒あたりのビット数 ＝ 標本化周波数 × 量子化ビット数 × チャネル数。',
    answer,
    distractors: [
      { value: inBits, why: 'ビットのまま答えている。バイトにするには8で割る。' },
      {
        value: chMistake,
        why:
          ch === 1
            ? 'モノラルなのに2チャネル分で計算している。1チャネルならそのまま。'
            : 'ステレオなのに1チャネル分で計算している。2チャネルは2倍のデータ量。',
      },
      { value: doubleDiv, why: '8で二重に割っている。ビット→バイトの変換は1回だけ。' },
      { value: kiloAs1024, why: 'kHzのkを1024として計算している。周波数のkは10³。' },
    ],
    format: (v) => `${fmtNum(v, 2)}Mバイト`,
    steps: [
      step(
        '1秒あたり',
        `${khz}k × ${bits}ビット × ${ch}ch`,
        round((khz * 1000 * bits * ch) / 1000, 2),
        'kビット/秒'
      ),
      step('全体のビット数', `× ${sec}秒`, round(khz * 1000 * bits * ch * sec, 0), 'ビット'),
      step('バイトへ', `÷ 8 ÷ 10⁶`, answer, 'Mバイト'),
    ],
    note:
      '標本化定理（原音の最高周波数の2倍で標本化する）は「録音の設定を決める」話。' +
      'データ量計算では設定された周波数をそのまま使う。',
  };
}

// --- 必要な回線速度 -----------------------------------------------------
function genCapacity(rng) {
  const mbMB = rng.pick([50, 100, 200, 500, 1000]);
  const min = rng.pick([2, 5, 10, 20]);
  const eff = rng.pick([0.4, 0.5, 0.625, 0.8]);

  const sec = min * 60;
  const bits = mbMB * 8; // Mビット
  // 必要速度 = データ量 / (時間 × 効率)
  const answer = round(bits / sec / eff, 4);

  const noEff = round(bits / sec, 4);
  const withEff = round((bits / sec) * eff, 4);
  const noByte = round(mbMB / sec / eff, 4);

  return {
    question:
      `${mbMB} Mバイトのデータを ${min} 分以内に転送したい。` +
      `回線の伝送効率が ${fmtPct(eff, 1)} のとき、\n少なくとも何Mビット/秒の回線が必要か。`,
    hint: '必要な実効速度を出してから、効率で割り戻して「回線の公称速度」にする。',
    answer,
    distractors: [
      { value: noEff, why: '伝送効率を考慮していない。効率が悪い分、公称速度は余分に必要。' },
      { value: withEff, why: '効率を掛けている。割り戻さないと必要な公称速度にならない。' },
      { value: noByte, why: 'バイトをビットに直していない。1バイト＝8ビット。' },
    ],
    format: (v) => `${fmtNum(v, 2)}Mビット/秒`,
    steps: [
      step('データ量をビットへ', `${mbMB} × 8`, bits, 'Mビット'),
      step('制限時間', `${min}分 = ${sec}秒`, null),
      step('必要な実効速度', `${bits} / ${sec}`, round(bits / sec, 4), 'Mビット/秒'),
      step('効率で割り戻す', `${fmtNum(bits / sec, 4)} / ${fmtNum(eff, 3)}`, answer, 'Mビット/秒'),
    ],
    note: '「効率で割る」のは、実効速度から公称速度へ戻す操作。掛けると逆方向になるので注意。',
  };
}
