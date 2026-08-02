// 稼働率（システムの信頼性）
// 科目Aの定番。直列は掛け算、並列は「両方止まる確率の余事象」。
// 落とし穴：並列をうっかり掛け算してしまう／MTBFとMTTRを取り違える。

import { register, step, explain, fmtNum, fmtPct } from '../genkit.js';
import { round } from '../rng.js';

register({
  id: 'reliability',
  name: '稼働率・信頼性',
  category: 'テクノロジ系',
  tags: ['稼働率', 'MTBF', 'MTTR', '直列', '並列'],

  gen(rng) {
    const kind = rng.pick(['serial', 'parallel', 'mixed', 'mtbf']);
    if (kind === 'mtbf') return genMtbf(rng);
    if (kind === 'serial') return genSerial(rng);
    if (kind === 'parallel') return genParallel(rng);
    return genMixed(rng);
  },
});

// --- 直列 ---------------------------------------------------------------
function genSerial(rng) {
  const n = rng.int(2, 3);
  // 装置の稼働率は互いに異なる値にする。同じ値が並ぶと問題として不自然なうえ、
  // 「平均を取るミス」と「最小値を答えるミス」が同じ値に潰れて誤答が作れなくなる。
  const as = rng.sample(
    [0.8, 0.82, 0.85, 0.87, 0.88, 0.9, 0.92, 0.93, 0.95, 0.96, 0.98],
    n
  );

  const answer = round(as.reduce((p, a) => p * a, 1), 6);

  // 典型ミス：直列なのに並列の式（1-Π(1-a)）を使ってしまう
  const asParallel = round(1 - as.reduce((p, a) => p * (1 - a), 1), 6);
  // 典型ミス：平均を取ってしまう
  const asAvg = round(as.reduce((s, a) => s + a, 0) / n, 6);
  // 典型ミス：一番低い装置の値をそのまま答える
  const asMin = round(Math.min(...as), 6);

  const list = as.map((a, i) => `装置${String.fromCharCode(65 + i)}：${fmtNum(a, 3)}`).join('、');

  return {
    question:
      `次の装置をすべて直列に接続したシステムがある。\n${list}\n` +
      `このシステム全体の稼働率はいくらか。`,
    hint: '直列は「全部が同時に動いていないと止まる」。',
    answer,
    distractors: [
      { value: asParallel, why: '並列の式（1−(1−a₁)(1−a₂)…）を使っている。直列は単純な積。' },
      { value: asAvg, why: '各装置の稼働率を平均している。稼働率は平均ではなく積で伝わる。' },
      { value: asMin, why: '一番弱い装置の値をそのまま答えている。直列では全体は最小値よりさらに下がる。' },
    ],
    format: (v) => fmtNum(v, 4),
    explain: [
      explain(
        'ask',
        'まず、稼働率とは何か',
        `「その装置が動いている時間の割合」です。稼働率 ${fmtNum(as[0], 3)} なら、` +
          `100回中およそ ${Math.round(as[0] * 100)} 回は動いている、という意味。1に近いほど優秀です。`
      ),
      explain(
        'why',
        'なぜ掛け算になるのか',
        `直列は「全部が動いていないとダメ」なつなぎ方です。1本の道に装置が順番に並んでいて、` +
          `どれか1つでも壊れたら通れなくなる。\n` +
          `装置Aが動いている確率が ${fmtNum(as[0], 3)}、そのうえで装置Bも動いている確率が ${fmtNum(as[1], 3)}。` +
          `「AもBも動いている」は確率の掛け算になります。サイコロで1が出て、かつ次も1が出る確率を掛け算で出すのと同じ理屈です。`
      ),
      explain(
        'calc',
        '実際に計算する',
        as.map((a, i) => `装置${String.fromCharCode(65 + i)}：${fmtNum(a, 3)}`).join('\n') +
          `\n\nすべて掛ける：\n${as.map((a) => fmtNum(a, 3)).join(' × ')} = ${fmtNum(answer, 4)}`
      ),
      explain(
        'trap',
        'ここを間違えやすい',
        `答えの ${fmtNum(answer, 4)} は、一番弱い装置の ${fmtNum(Math.min(...as), 3)} よりさらに低くなっています。\n` +
          `直列は「つなげばつなぐほど弱くなる」のが特徴。1より小さい数を掛け続けるので、必ず下がります。\n` +
          `逆に「つなぐほど強くなる」のが並列（冗長化）で、こちらは掛け算では解けません。`
      ),
    ],
    steps: [
      step('直列の公式', 'A = a₁ × a₂ × …', null),
      step(
        '代入',
        as.map((a) => fmtNum(a, 3)).join(' × '),
        answer
      ),
    ],
    note:
      '直列は掛けるほど必ず下がる。装置を増やすと信頼性が落ちるのが直列、上がるのが並列。',
  };
}

// --- 並列（冗長化） -----------------------------------------------------
function genParallel(rng) {
  const n = rng.int(2, 3);
  const a = rng.float(0.7, 0.95, 0.01);

  const answer = round(1 - Math.pow(1 - a, n), 6);

  const asSerial = round(Math.pow(a, n), 6);
  // 典型ミス：余事象を取り忘れる（「全部止まる確率」をそのまま答える）
  const asFail = round(Math.pow(1 - a, n), 6);
  // 典型ミス：1から引く相手を間違える（1 − aⁿ）
  const asInverted = round(1 - Math.pow(a, n), 6);
  // 典型ミス：n重化なのに台数を1つ間違える。n=2のときは正解と一致してしまうため、
  // n=3のときだけ誤答として使う（buildChoices側でも重複は弾かれるが、意図を明示しておく）
  const asWrongN = n === 2
    ? round(1 - Math.pow(1 - a, 3), 6)
    : round(1 - Math.pow(1 - a, 2), 6);

  return {
    question:
      `稼働率 ${fmtNum(a, 3)} の装置を ${n} 台並列に接続し、` +
      `${n} 台のうち1台でも動いていればシステムは稼働するものとする。\n` +
      `このシステム全体の稼働率はいくらか。`,
    hint: '「1台でも動けばよい」＝「全部が同時に止まる」の余事象。',
    answer,
    distractors: [
      { value: asSerial, why: '直列の式（積）を使っている。並列は余事象で考える。' },
      {
        value: asWrongN,
        why: `台数が${n}台なのに${n === 2 ? 3 : 2}台分の式で計算している。指数は台数と一致させる。`,
      },
      { value: asInverted, why: '1から引く相手を間違えている（1−aⁿ）。引くのは「全部止まる確率」。' },
      { value: asFail, why: '「全部同時に止まる確率」で止まっている。最後に1から引く必要がある。' },
    ],
    format: (v) => fmtNum(v, 4),
    explain: [
      explain(
        'ask',
        'この問題が聞いていること',
        `同じ装置を ${n} 台用意して、そのうち1台でも生きていればシステムは動く、という状況です。` +
          `いわゆる予備機（冗長化）。このとき、システム全体としてどれくらいの割合で動いているかを聞かれています。`
      ),
      explain(
        'why',
        '「1台でも動けばOK」を、どう計算するか',
        `正面から数えると場合分けが大変です。1台だけ動く場合、2台動く場合…と全部足すことになる。\n\n` +
          `そこで裏返します。システムが止まるのは **${n}台が全部同時に壊れたとき、そのときだけ** です。\n` +
          `つまり「全部壊れる確率」さえ出せば、残りは全部「動いている」。だから最後に 1 から引けば答えになります。\n\n` +
          `これを余事象（よじしょう）といいます。「少なくとも1つ」と来たら裏返す、と覚えてしまってよいです。`
      ),
      explain(
        'calc',
        '実際に計算する',
        `1台が壊れている確率：1 − ${fmtNum(a, 3)} = ${fmtNum(1 - a, 3)}\n` +
          `${n}台が同時に壊れる確率：${Array(n).fill(fmtNum(1 - a, 3)).join(' × ')} = ${fmtNum(Math.pow(1 - a, n), 6)}\n\n` +
          `動いている確率は、その残り：\n1 − ${fmtNum(Math.pow(1 - a, n), 6)} = ${fmtNum(answer, 4)}`
      ),
      explain(
        'trap',
        'ここを間違えやすい',
        `1台のときの稼働率が ${fmtNum(a, 3)} だったのに、${n}台にしたら ${fmtNum(answer, 4)} まで上がりました。` +
          `**並列はつなぐほど強くなる**。ここが直列と正反対です。\n\n` +
          `よくある間違いは2つ。掛け算してしまう（それは直列の式）。もう1つは ${fmtNum(Math.pow(1 - a, n), 6)} で計算を止めてしまうこと。` +
          `これは「全部壊れる確率」なので、最後に1から引き忘れないこと。`
      ),
    ],
    steps: [
      step('全部止まる確率', `(1 − ${fmtNum(a, 3)})^${n}`, round(Math.pow(1 - a, n), 6)),
      step('その余事象', `1 − ${fmtNum(Math.pow(1 - a, n), 6)}`, answer),
    ],
    note: '並列は「全部同時に落ちる確率」を出してから1から引く。これが冗長化の効果。',
  };
}

// --- 直列＋並列の複合 ---------------------------------------------------
function genMixed(rng) {
  const a = rng.float(0.8, 0.95, 0.01); // 単体
  const b = rng.float(0.7, 0.9, 0.01); // 並列にする装置

  const par = 1 - Math.pow(1 - b, 2);
  const answer = round(a * par, 6);

  const allSerial = round(a * b * b, 6);
  const allParallel = round(1 - (1 - a) * (1 - b) * (1 - b), 6);
  const forgotPar = round(a * b, 6);

  return {
    question:
      `装置A（稼働率 ${fmtNum(a, 3)}）の後段に、装置B（稼働率 ${fmtNum(b, 3)}）を2台並列に接続したシステムがある。\n` +
      `Aは1台のみで、B側は2台のうち1台でも動いていればよい。\n` +
      `このシステム全体の稼働率はいくらか。`,
    hint: '並列部分を1つの装置にまとめてから、Aと直列で掛ける。',
    answer,
    distractors: [
      { value: allSerial, why: 'B2台を直列として掛けている。並列は余事象で先にまとめる。' },
      { value: allParallel, why: '全体を並列として計算している。AとB群は直列の関係。' },
      { value: forgotPar, why: 'Bを1台としてしか計算していない。2台並列の効果が入っていない。' },
    ],
    format: (v) => fmtNum(v, 4),
    explain: [
      explain(
        'ask',
        'この問題が聞いていること',
        `直列と並列が混ざった形です。Aは1台きり（ここが壊れたら終わり）。` +
          `その後ろにBが2台並んでいて、B側はどちらか1台生きていればよい。全体としての稼働率を求めます。`
      ),
      explain(
        'why',
        '混ざっているときの解き方は1つだけ',
        `**並列の部分を先に計算して、1台の装置とみなす。** これだけです。\n\n` +
          `B2台の並列は、まとめると稼働率 ${fmtNum(par, 4)} の「1台のB群」と考えられます。\n` +
          `そうすると、残るのは「A（${fmtNum(a, 3)}）とB群（${fmtNum(par, 4)}）が直列に並んでいる」というシンプルな形。あとは掛けるだけです。\n\n` +
          `複雑に見える回路も、内側の並列から順に潰していけば必ず1本の直列に戻ります。`
      ),
      explain(
        'calc',
        '実際に計算する',
        `【手順1】B群をまとめる（並列なので余事象）\n` +
          `　B1台が壊れる確率：1 − ${fmtNum(b, 3)} = ${fmtNum(1 - b, 3)}\n` +
          `　2台とも壊れる確率：${fmtNum(1 - b, 3)} × ${fmtNum(1 - b, 3)} = ${fmtNum(Math.pow(1 - b, 2), 4)}\n` +
          `　B群の稼働率：1 − ${fmtNum(Math.pow(1 - b, 2), 4)} = ${fmtNum(par, 4)}\n\n` +
          `【手順2】AとB群を直列で掛ける\n` +
          `　${fmtNum(a, 3)} × ${fmtNum(par, 4)} = ${fmtNum(answer, 4)}`
      ),
      explain(
        'trap',
        'ここを間違えやすい',
        `B単体は ${fmtNum(b, 3)} と低めですが、2台並べたことで ${fmtNum(par, 4)} まで上がっています。` +
          `弱い装置ほど二重化の効果が大きい、というのがこの計算から読み取れることです。\n\n` +
          `全体の答え ${fmtNum(answer, 4)} が A単体の ${fmtNum(a, 3)} より低いのは、Aと直列だから。` +
          `**どれだけB側を強くしても、A単体の稼働率は超えられません。**`
      ),
    ],
    steps: [
      step('B群（並列）', `1 − (1 − ${fmtNum(b, 3)})²`, round(par, 6)),
      step('Aと直列', `${fmtNum(a, 3)} × ${fmtNum(par, 6)}`, answer),
    ],
    note: '複合系は「並列を先に1つへ潰す→残りを直列で掛ける」の順で必ず解ける。',
  };
}

// --- MTBF / MTTR --------------------------------------------------------
function genMtbf(rng) {
  const mtbf = rng.int(20, 60) * 10; // 200〜600時間
  // MTTRはMTBFの1/50〜1/10の範囲に収める。
  // 比が大きすぎる（例 550時間 : 2時間）と稼働率が0.996…に張り付き、
  // 典型ミスの値まで小数4桁では正解と区別できなくなって選択肢が成立しない。
  // 実務的にも稼働率98〜99%台のほうが問題として現実的。
  const mttr = rng.int(Math.ceil(mtbf / 50), Math.floor(mtbf / 10));

  const answer = round(mtbf / (mtbf + mttr), 6);

  const inverted = round(mttr / (mtbf + mttr), 6); // 「止まっている割合」と取り違え
  const half = round(mtbf / (mtbf + mttr * 2), 6); // 修理時間を二重に数える
  // 分母をMTTRだけにするミス。値が1を超えて明らかにおかしくなるので、
  // 稼働率として成立する範囲に収まるときだけ誤答に使う。
  const wrongDenom = round(mttr / mtbf, 6); // MTBFとMTTRを逆に代入
  // 修理時間を単純に引くミス。MTBF≫MTTR のときは正解と丸めで一致してしまう
  // （実際そう近似できる）ので、そのときは自動的に捨てられて次の誤答が使われる。
  const noRepair = round(1 - mttr / mtbf, 6);
  const plusOne = round((mtbf + mttr) / (mtbf + mttr * 2), 6); // 分子を1サイクル全体にする

  return {
    question:
      `あるシステムの MTBF が ${mtbf} 時間、MTTR が ${mttr} 時間である。\n` +
      `このシステムの稼働率はいくらか。`,
    hint: 'MTBFは「動いている平均時間」、MTTRは「直すのにかかる平均時間」。',
    answer,
    distractors: [
      { value: noRepair, why: '修理時間を単純に引いている（1 − MTTR/MTBF）。分母は1サイクル全体。' },
      { value: half, why: '分母のMTTRを二重に数えている。1サイクルに修理は1回。' },
      { value: plusOne, why: '分子に1サイクル全体を置いている。分子は「動いている時間」＝MTBFだけ。' },
      { value: inverted, why: 'MTTR/(MTBF+MTTR) を求めている。これは稼働率ではなく「止まっている割合」。' },
      { value: wrongDenom, why: 'MTBFとMTTRを逆に代入している。分子は「動いている時間」のほう。' },
    ],
    format: (v) => fmtNum(v, 4),
    explain: [
      explain(
        'ask',
        'まず、MTBFとMTTRが何なのか',
        `どちらも略語なので、まずここを押さえます。\n\n` +
          `**MTBF（平均故障間隔）＝ 壊れずに動き続ける平均時間。** この問題では ${mtbf}時間。\n` +
          `　→ 動き出してから次に壊れるまで、平均 ${mtbf}時間もつということ。\n\n` +
          `**MTTR（平均修理時間）＝ 壊れてから直るまでの平均時間。** この問題では ${mttr}時間。\n` +
          `　→ 壊れたら平均 ${mttr}時間で復旧する、ということ。\n\n` +
          `Rが「Repair（修理）」のRだと覚えると取り違えません。`
      ),
      explain(
        'why',
        'なぜ MTBF ÷ (MTBF + MTTR) なのか',
        `このシステムの一生は、こういう繰り返しです。\n\n` +
          `　${mtbf}時間 動く → ${mttr}時間 修理 → ${mtbf}時間 動く → ${mttr}時間 修理 → …\n\n` +
          `この「動く＋直す」のワンセットが1サイクルで、長さは ${mtbf} + ${mttr} = ${mtbf + mttr}時間。\n\n` +
          `稼働率は「そのうち動いている割合」なので、\n` +
          `　動いている時間 ÷ サイクル全体 ＝ ${mtbf} ÷ ${mtbf + mttr}\n\n` +
          `公式を暗記するより、この時間の帯を思い浮かべるほうが確実です。`
      ),
      explain(
        'calc',
        '実際に計算する',
        `1サイクルの長さ：${mtbf} + ${mttr} = ${mtbf + mttr}時間\n` +
          `そのうち動いている時間：${mtbf}時間\n\n` +
          `稼働率 = ${mtbf} ÷ ${mtbf + mttr} = ${fmtNum(answer, 4)}\n\n` +
          `割合でいうと ${fmtPct(answer, 2)} の時間は動いている、ということになります。`
      ),
      explain(
        'trap',
        'ここを間違えやすい',
        `**分母を MTBF だけにしない。** 分母はあくまで「動く時間＋直す時間」の合計です。\n\n` +
          `また、${mttr} ÷ ${mtbf + mttr} = ${fmtNum(mttr / (mtbf + mttr), 4)} を答えてしまう間違いも多いです。` +
          `これは「止まっている割合」で、稼働率のちょうど裏側。\n` +
          `稼働率は普通1に近い値（0.9〜0.999あたり）になるので、**答えが0.5より小さくなったら、まず逆にしていないか疑う**とよいです。`
      ),
    ],
    steps: [
      step('公式', '稼働率 = MTBF / (MTBF + MTTR)', null),
      step('1サイクルの長さ', `${mtbf} + ${mttr}`, mtbf + mttr, '時間'),
      step('代入', `${mtbf} / ${mtbf + mttr}`, answer),
    ],
    note: `稼働率 ${fmtPct(answer, 2)}。「1サイクル＝動く時間＋直す時間」のうち動いている割合、と読めば迷わない。`,
  };
}
