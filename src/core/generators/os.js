// OS（ターンアラウンドタイム・ページング）
// 落とし穴：ターンアラウンドタイムは「到着から完了まで」で待ち時間を含む。
// ページングの実効アクセス時間は、フォールト率が極小でも影響が大きい。

import { register, step, fmtNum, fmtPct, fmtInt, fmtNs, fmtSmallRate } from '../genkit.js';
import { round } from '../rng.js';

register({
  id: 'os',
  name: 'ターンアラウンド・ページング',
  category: 'テクノロジ系',
  tags: ['ターンアラウンドタイム', 'スケジューリング', 'ページフォールト', '仮想記憶'],

  gen(rng) {
    return rng.pick([genTurnaround, genPageFault, genFaultRate])(rng);
  },
});

// --- ターンアラウンドタイム（到着順） -----------------------------------
function genTurnaround(rng) {
  // ジョブは到着時刻と処理時間を持つ。到着順（FCFS）で処理する。
  const n = 3;

  // 誤答（処理時間・待ち時間・完了時刻・平均）が正解と衝突しない組が出るまで引き直す。
  // 待ち時間0や、たまたま処理時間＝ターンアラウンドになる組が実際に発生する。
  let jobs, target, answer, asBurst, asWait, asFinish, avgTurn;
  for (let attempt = 0; attempt < 40; attempt++) {
    jobs = [];
    let t = 0;
    for (let i = 0; i < n; i++) {
      jobs.push({
        name: String.fromCharCode(65 + i),
        arrive: t,
        burst: rng.int(2, 12),
      });
      t += rng.int(1, 5); // 次のジョブは少しあとに到着
    }

    // FCFSで実行し、各ジョブの完了時刻を求める
    let clock = 0;
    for (const j of jobs) {
      clock = Math.max(clock, j.arrive) + j.burst;
      j.finish = clock;
      j.turnaround = j.finish - j.arrive;
      j.wait = j.turnaround - j.burst;
    }

    target = jobs[rng.int(1, n - 1)]; // 2番目以降（待ちが発生するもの）を問う
    answer = target.turnaround;

    asBurst = target.burst; // 処理時間だけを答える
    asWait = target.wait; // 待ち時間だけを答える
    asFinish = target.finish; // 完了時刻をそのまま答える
    avgTurn = round(jobs.reduce((s, j) => s + j.turnaround, 0) / n, 4);

    // 待ちが実際に発生していて、かつ4つの値が互いに異なることを求める
    const vs = [answer, asBurst, asWait, asFinish, avgTurn];
    if (target.wait > 0 && new Set(vs.map((v) => Number(v).toFixed(4))).size === vs.length) break;
  }

  const table = jobs
    .map((j) => `　ジョブ${j.name}：到着時刻 ${j.arrive}秒、処理時間 ${j.burst}秒`)
    .join('\n');

  return {
    question:
      `1つのCPUで、次の3つのジョブを到着順に処理する。\n${table}\n` +
      `ジョブ${target.name}のターンアラウンドタイムは何秒か。`,
    hint: 'ターンアラウンドタイム ＝ 完了時刻 − 到着時刻。待たされた時間も含む。',
    answer,
    distractors: [
      { value: asBurst, why: '処理時間だけを答えている。前のジョブを待った時間も含める。' },
      { value: asFinish, why: '完了時刻をそのまま答えている。到着時刻を引く必要がある。' },
      { value: asWait, why: '待ち時間だけを答えている。ターンアラウンドは待ち時間＋処理時間。' },
      { value: avgTurn, why: '3つのジョブの平均を答えている。設問は特定のジョブ。' },
    ],
    format: (v) => `${fmtNum(v, 1)}秒`,
    steps: [
      ...jobs.map((j) =>
        step(
          `ジョブ${j.name}`,
          `到着${j.arrive}秒 → 開始${j.finish - j.burst}秒 → 完了${j.finish}秒`,
          null
        )
      ),
      step(
        `ジョブ${target.name}のターンアラウンド`,
        `${target.finish} − ${target.arrive}`,
        answer,
        '秒'
      ),
    ],
    note:
      `ジョブ${target.name}は ${target.wait}秒 待たされてから ${target.burst}秒 かけて処理された。` +
      `到着順（FCFS）では、先に長いジョブが来ると後続が大きく待たされる。`,
  };
}

// --- ページングの実効アクセス時間 ---------------------------------------
function genPageFault(rng) {
  const memNs = rng.pick([50, 80, 100, 120]); // 主記憶アクセス時間（ナノ秒）
  const faultMs = rng.pick([2, 5, 8, 10]); // ページフォールト処理時間（ミリ秒）
  const faultRate = rng.pick([0.0001, 0.0005, 0.001, 0.002]); // フォールト率

  const faultNs = faultMs * 1e6; // ミリ秒 → ナノ秒
  const answer = round((1 - faultRate) * memNs + faultRate * faultNs, 2);

  // 「単位変換を忘れる」と「フォールトを無視する」は、フォールト率が極小のため
  // どちらも主記憶時間とほぼ同値になり、誤答として区別できない。
  // 代わりに、桁を取り違える／加重を掛け忘れるといった区別できるミスを使う。
  const swapped = round(faultRate * memNs + (1 - faultRate) * faultNs, 2); // 率を逆に
  const noWeight = round(memNs + faultNs, 2); // 確率を掛けずに単純に足す
  const kiloOnly = round((1 - faultRate) * memNs + faultRate * faultMs * 1e3, 2); // ミリ→マイクロ止まり
  const tenFold = round((1 - faultRate) * memNs + faultRate * faultNs * 10, 2); // 桁を1つ多く
  const onlyFault = round(faultRate * faultNs, 2); // 主記憶側を足し忘れ

  return {
    question:
      `主記憶のアクセス時間が ${memNs} ナノ秒、ページフォールト1回の処理に ${faultMs} ミリ秒かかる仮想記憶システムがある。\n` +
      `ページフォールト率が ${fmtNum(faultRate * 100, 4)}%（${faultRate}）のとき、実効アクセス時間は何ナノ秒か。`,
    hint: '加重平均。ただしミリ秒とナノ秒の単位を揃えてから計算する（1ミリ秒＝10⁶ナノ秒）。',
    answer,
    distractors: [
      { value: kiloOnly, why: 'ミリ秒→マイクロ秒までしか直していない。1ミリ秒＝1,000,000ナノ秒。' },
      { value: swapped, why: 'フォールト率とヒット率を逆に掛けている。ほとんどはフォールトしない。' },
      { value: onlyFault, why: 'フォールト側だけを計算している。フォールトしない大多数のアクセスも含める。' },
      { value: noWeight, why: '確率を掛けずに単純に足している。加重平均なのでそれぞれの発生率を掛ける。' },
      { value: tenFold, why: '桁を1つ多く見積もっている。1ミリ秒は10⁶ナノ秒。' },
    ],
    // 1998000.1ナノ秒 のような桁では比較できないので、大きければミリ秒に繰り上げる
    format: (v) => fmtNs(v),
    steps: [
      // 式の中に既に「= …ナノ秒」と書いているので、value は持たせない（二重表示になる）
      step('フォールト時間を揃える', `${faultMs} ミリ秒 = ${fmtInt(faultNs)} ナノ秒`, null),
      // 選択肢は fmtNs でマイクロ秒・ミリ秒に繰り上がる。
      // 解説の最終行もその表記で締めないと「解説の値と正解が違う」ように見えるため、
      // ナノ秒での計算結果を出したうえで、最後に単位を直した値を正解として置く。
      step(
        '加重平均',
        `${fmtNum(1 - faultRate, 5)}×${memNs} + ${faultRate}×${fmtInt(faultNs)}`,
        round(answer, 2),
        'ナノ秒'
      ),
      // 式の中に変換後の値を書いてあるので value は持たせない（持たせると二重表示になる）。
      // ただし検証は「値を持つ最後のstepが正解と一致すること」を見るので、
      // 上の加重平均ステップが answer と一致していることでその条件を満たしている。
      step('読みやすい単位に直す', `${fmtNum(answer, 2)} ナノ秒 = ${fmtNs(answer)}`, null),
    ],
    note:
      `フォールト率がわずか${fmtNum(faultRate * 100, 4)}%でも、実効アクセス時間は主記憶単体の` +
      `${fmtNum(answer / memNs, 1)}倍になる。フォールト1回のコストが桁違いに大きいため。`,
  };
}

// --- 許容できるフォールト率を逆算 ---------------------------------------
function genFaultRate(rng) {
  const memNs = rng.pick([50, 100]);
  const faultMs = rng.pick([2, 5, 10]);
  const faultNs = faultMs * 1e6;
  const targetRatio = rng.pick([1.1, 1.2, 1.5, 2.0]); // 実効時間を主記憶の何倍以内に収めたいか

  const targetNs = memNs * targetRatio;
  // targetNs = (1-f)*mem + f*fault  →  f = (targetNs - mem) / (fault - mem)
  const answer = round((targetNs - memNs) / (faultNs - memNs), 8);

  // (target−mem)/faultNs は、faultNs ≫ memNs のため正解とほぼ同値になり誤答にならない。
  // 桁や向きを取り違えるミスのうち、値がはっきり異なるものだけを使う。
  const inverted = round((faultNs - memNs) / (targetNs - memNs), 8); // 分子分母が逆
  const simple = round(memNs / faultNs, 8); // 目標値を使わない
  const noSub = round(targetNs / faultNs, 8); // 分子からmemを引き忘れ
  const tenFold = round(((targetNs - memNs) / (faultNs - memNs)) * 10, 8); // 桁を1つ間違える
  const asRatio = round(targetRatio, 8); // 倍率をそのまま答える

  return {
    question:
      `主記憶のアクセス時間が ${memNs} ナノ秒、ページフォールト1回の処理に ${faultMs} ミリ秒かかる。\n` +
      `実効アクセス時間を主記憶単体の ${fmtNum(targetRatio, 1)} 倍（${fmtNum(targetNs, 0)} ナノ秒）以内に抑えたい。\n` +
      `ページフォールト率はいくら以下であればよいか。`,
    hint: '実効 = (1−f)×主記憶 + f×フォールト を f について解く。',
    answer,
    distractors: [
      { value: noSub, why: '分子から主記憶時間を引いていない。増やせるのは「目標 − 主記憶」のぶんだけ。' },
      { value: tenFold, why: '桁が1つ大きい。この率ではフォールトが多すぎて目標を超えてしまう。' },
      { value: inverted, why: '分子と分母が逆。フォールト率は非常に小さい値になるはず。' },
      { value: simple, why: '主記憶時間をフォールト時間で割っただけ。目標値を使っていない。' },
      { value: asRatio, why: '目標の倍率をそのまま答えている。求めるのは率（非常に小さい値）。' },
    ],
    // 0.00025001 のような生値では大小の比較すらできないので、
    // 「%」と「何回に1回か」を併記して意味で選べるようにする。
    format: (v) => fmtSmallRate(v),
    steps: [
      step('目標の実効時間', `${memNs} × ${fmtNum(targetRatio, 1)}`, round(targetNs, 2), 'ナノ秒'),
      step('式を立てる', `${fmtInt(targetNs)} = (1−f)×${memNs} + f×${fmtInt(faultNs)}`, null),
      step('fについて解く', `(${fmtInt(targetNs)} − ${memNs}) / (${fmtInt(faultNs)} − ${memNs})`, answer),
    ],
    note:
      `許容できるフォールト率は${fmtNum(answer * 100, 6)}%。` +
      `${fmtInt(1 / answer)}回に1回しかフォールトしてはいけない計算になる。` +
      `仮想記憶ではフォールトをいかに減らすかが性能を決める。`,
  };
}
