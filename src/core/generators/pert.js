// PERT / アローダイアグラム（クリティカルパス）
// 落とし穴：最早結合点時刻は「入ってくる作業の最大値」、最遅は「出ていく作業の最小値」。
// ここを取り違えると全部ずれる。

import { register, step, fmtNum } from '../genkit.js';

register({
  id: 'pert',
  name: 'PERT・クリティカルパス',
  category: 'マネジメント系',
  tags: ['PERT', 'アローダイアグラム', 'クリティカルパス', '余裕日数'],

  gen(rng) {
    return rng.pick([genCritical, genFloat, genDelay])(rng);
  },
});

// ネットワークの形は固定し、日数だけを乱数にする。
// 図の描画とロジックを毎回作り直さずに済み、かつ「同じ形でも答えが変わる」ので暗記が効かない。
//
//        B
//   A →(2)→   D
//  (1)  ↓    (4)
//        C  ↗
//       (3)
//
// ノード: 1 → 2 → {3, 4} → 5
// 作業: A(1→2), B(2→3), C(2→4), D(3→5), E(4→5)
function buildNetwork(rng) {
  // 各作業の日数。パスの合計が一意に決まる（同着にならない）よう後で確認する。
  const d = {
    A: rng.int(2, 8),
    B: rng.int(2, 10),
    C: rng.int(2, 10),
    D: rng.int(2, 8),
    E: rng.int(2, 8),
  };

  // 2本のパス: A→B→D と A→C→E
  const path1 = d.A + d.B + d.D;
  const path2 = d.A + d.C + d.E;

  return { d, path1, path2 };
}

// 同着のネットワークは「クリティカルパスはどれか」の答えが一意にならないので引き直す。
function buildDistinctNetwork(rng, minGap = 1) {
  for (let i = 0; i < 40; i++) {
    const net = buildNetwork(rng);
    if (Math.abs(net.path1 - net.path2) >= minGap) return net;
  }
  return { d: { A: 3, B: 8, C: 4, D: 6, E: 5 }, path1: 17, path2: 12 };
}

const TASKS = [
  { id: 'A', from: 1, to: 2 },
  { id: 'B', from: 2, to: 3 },
  { id: 'C', from: 2, to: 4 },
  { id: 'D', from: 3, to: 5 },
  { id: 'E', from: 4, to: 5 },
];

function taskTable(d) {
  return TASKS.map((t) => `　作業${t.id}：${t.from}→${t.to}、所要日数 ${d[t.id]}日`).join('\n');
}

// アローダイアグラムのSVG。UI側でそのまま埋め込む。
// 色は currentColor 系にして、ダークモードでも見えるようにする。
function diagram(d, highlight) {
  const on = (id) => (highlight && highlight.indexOf(id) >= 0 ? 'crit' : 'norm');
  return `<svg viewBox="0 0 420 200" class="pert-svg" role="img" aria-label="アローダイアグラム">
  <defs>
    <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <g class="edges" marker-end="url(#ah)">
    <line class="${on('A')}" x1="42"  y1="100" x2="118" y2="100"/>
    <line class="${on('B')}" x1="142" y1="88"  x2="198" y2="50"/>
    <line class="${on('C')}" x1="142" y1="112" x2="198" y2="150"/>
    <line class="${on('D')}" x1="242" y1="50"  x2="298" y2="88"/>
    <line class="${on('E')}" x1="242" y1="150" x2="298" y2="112"/>
  </g>
  <g class="labels">
    <text x="80"  y="92">A(${d.A})</text>
    <text x="160" y="62">B(${d.B})</text>
    <text x="160" y="148">C(${d.C})</text>
    <text x="272" y="62">D(${d.D})</text>
    <text x="272" y="148">E(${d.E})</text>
  </g>
  <g class="nodes">
    <circle cx="30"  cy="100" r="14"/><text x="30"  y="105" class="nd">1</text>
    <circle cx="130" cy="100" r="14"/><text x="130" y="105" class="nd">2</text>
    <circle cx="220" cy="40"  r="14"/><text x="220" y="45"  class="nd">3</text>
    <circle cx="220" cy="160" r="14"/><text x="220" y="165" class="nd">4</text>
    <circle cx="310" cy="100" r="14"/><text x="310" y="105" class="nd">5</text>
  </g>
</svg>`;
}

// --- 最短所要日数（クリティカルパス） -----------------------------------
function genCritical(rng) {
  const { d, path1, path2 } = buildDistinctNetwork(rng);

  const answer = Math.max(path1, path2);
  const shorter = Math.min(path1, path2);
  const sumAll = d.A + d.B + d.C + d.D + d.E; // 全作業を足す
  const withoutA = answer - d.A; // 共通部分を忘れる
  const avg = Math.round((path1 + path2) / 2);

  const critPath = path1 > path2 ? ['A', 'B', 'D'] : ['A', 'C', 'E'];

  return {
    question:
      `次のアローダイアグラムで表される作業がある。\n${taskTable(d)}\n` +
      `全ての作業を完了するのに必要な最短の日数は何日か。`,
    hint: 'すべての経路の所要日数を出し、その中で最も長いものが答え。',
    answer,
    distractors: [
      { value: shorter, why: '短いほうの経路を答えている。全作業の完了には長いほうを待つ必要がある。' },
      { value: sumAll, why: '全作業の日数を単純に合計している。並行して進む作業がある。' },
      { value: withoutA, why: '共通の作業Aを含めていない。すべての経路が作業Aを通る。' },
      { value: avg, why: '2つの経路の平均を取っている。最短所要日数は最長経路で決まる。' },
    ],
    format: (v) => `${fmtNum(v, 0)}日`,
    svg: diagram(d, critPath),
    steps: [
      step('経路1（A→B→D）', `${d.A} + ${d.B} + ${d.D}`, path1, '日'),
      step('経路2（A→C→E）', `${d.A} + ${d.C} + ${d.E}`, path2, '日'),
      step('最長の経路がクリティカルパス', `max(${path1}, ${path2})`, answer, '日'),
    ],
    note:
      `クリティカルパスは ${critPath.join('→')}（${answer}日）。` +
      `この経路上の作業が1日でも遅れると、全体が同じだけ遅れる。`,
  };
}

// --- 余裕日数（フロート） -----------------------------------------------
function genFloat(rng) {
  const { d, path1, path2 } = buildDistinctNetwork(rng, 2);

  const total = Math.max(path1, path2);
  const slack = Math.abs(path1 - path2);
  const answer = slack;

  const nonCrit = path1 > path2 ? ['C', 'E'] : ['B', 'D'];
  const nonCritLen = Math.min(path1, path2);

  const asTotal = total; // 全体日数を答える
  const asPath = nonCritLen; // 非クリティカル経路の長さ
  const halfSlack = Math.floor(slack / 2);
  const plusOne = slack + 1;

  return {
    question:
      `次のアローダイアグラムで表される作業がある。\n${taskTable(d)}\n` +
      `作業${nonCrit[0]}の余裕日数（トータルフロート）は何日か。`,
    hint: '全体の所要日数を変えずに、その作業をあと何日遅らせられるか。',
    answer,
    distractors: [
      { value: asPath, why: `作業${nonCrit[0]}を含む経路の所要日数を答えている。余裕はクリティカルパスとの差。` },
      { value: asTotal, why: '全体の所要日数を答えている。余裕日数は経路間の差。' },
      { value: plusOne, why: '1日多く見積もっている。差はちょうど経路長の引き算。' },
      { value: halfSlack, why: '差を半分にしている。余裕はそのまま差の分だけある。' },
    ],
    format: (v) => `${fmtNum(v, 0)}日`,
    svg: diagram(d, path1 > path2 ? ['A', 'B', 'D'] : ['A', 'C', 'E']),
    steps: [
      step('経路1（A→B→D）', `${d.A} + ${d.B} + ${d.D}`, path1, '日'),
      step('経路2（A→C→E）', `${d.A} + ${d.C} + ${d.E}`, path2, '日'),
      step('クリティカルパス', `max(${path1}, ${path2})`, total, '日'),
      step('余裕日数', `${total} − ${nonCritLen}`, answer, '日'),
    ],
    note:
      `作業${nonCrit.join('・')}のある経路は${nonCritLen}日で、クリティカルパスより${slack}日短い。` +
      `その分だけ遅らせても全体には影響しない。クリティカルパス上の作業の余裕は常に0。`,
  };
}

// --- 遅延の影響 ---------------------------------------------------------
function genDelay(rng) {
  const { d, path1, path2 } = buildDistinctNetwork(rng, 2);

  const total = Math.max(path1, path2);
  const critFirst = path1 > path2 ? 'B' : 'C'; // クリティカルパス上の作業
  const delay = rng.int(2, 5);

  const answer = total + delay; // クリティカルパス上なのでそのまま延びる
  const noChange = total; // 影響しないと考える
  const slack = Math.abs(path1 - path2);
  // 「もう一方の経路の余裕日数の分だけ吸収される」と誤解するミス。
  // 注：もう一方の経路＋遅延（Math.min(path1,path2)+delay）は total と一致しやすいので誤答に使わない。
  const absorbed = total + Math.max(1, delay - slack);
  const doubled = total + delay * 2; // 遅延を二重に数える
  const justDelay = delay; // 遅延日数そのものを答える

  return {
    question:
      `次のアローダイアグラムで表される作業がある。\n${taskTable(d)}\n` +
      `作業${critFirst}が予定より ${delay} 日遅れた場合、全体の所要日数は何日になるか。`,
    hint: 'まず遅れた作業がクリティカルパス上にあるかを確認する。',
    answer,
    distractors: [
      { value: noChange, why: `作業${critFirst}はクリティカルパス上にあるため、遅れはそのまま全体に響く。` },
      { value: absorbed, why: '余裕日数で吸収されると考えている。クリティカルパス上の作業に余裕は0。' },
      { value: doubled, why: '遅延を二重に数えている。延びるのは遅れた日数分だけ。' },
      { value: justDelay, why: '遅延日数そのものを答えている。設問は全体の所要日数。' },
    ],
    format: (v) => `${fmtNum(v, 0)}日`,
    svg: diagram(d, path1 > path2 ? ['A', 'B', 'D'] : ['A', 'C', 'E']),
    steps: [
      step('元のクリティカルパス', `max(${path1}, ${path2})`, total, '日'),
      step(`作業${critFirst}は クリティカルパス上`, '余裕日数は0', null),
      step('全体の所要日数', `${total} + ${delay}`, answer, '日'),
    ],
    note:
      'クリティカルパス上の作業は余裕が0なので、遅れがそのまま全体の遅れになる。' +
      '逆に余裕のある作業なら、余裕の範囲内の遅れは全体に影響しない。',
  };
}
