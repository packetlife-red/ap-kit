// 「はじめから」モードのレッスン検証。
//
// ドリルと違ってレッスンは全文が手書きなので、機械で守れることを守る。
// とくに重要なのが「初学者が間違えたときに正解を漏らさない」こと。
// hint / hint2 に答えを書いてしまうと、モードの意味そのものが消える。
// （実際、当初 2回目のヒントに after を流用していて答えが漏れていた）

import { LESSONS } from '../src/learn/lessons.js';
import { visualHtml, visualNames } from '../src/learn/visuals.js';

const VISUAL_NAMES = visualNames();

let failures = 0;
let checks = 0;

function fail(where, msg) {
  failures++;
  print(`  ✗ [${where}] ${msg}`);
}

function assert(cond, where, msg) {
  checks++;
  if (!cond) fail(where, msg);
  return cond;
}

// 本文に紛れ込むと表示が壊れるもの
function textSane(s) {
  return typeof s === 'string' && s.length > 0 && !/undefined|NaN|\[object/.test(s);
}

// ** が閉じているか（太字マークアップが崩れると読めなくなる）
function starsBalanced(s) {
  return ((s.match(/\*\*/g) || []).length) % 2 === 0;
}

print('=== レッスン検証 ===');

assert(LESSONS.length > 0, 'all', 'レッスンが1つもない');

const seenIds = new Set();

// --- 触れる図（mount を持つもの）の健全性 ---
// お題として出す数が「4桁の2進数で作れる範囲」に収まっているか。
// 16以上や負の数を混ぜると、どう押しても正解にならず利用者が詰む。
// また 0 と 15 は「全部0／全部1」で偶然当たるので、お題に向かない。
{
  // bits-play のお題は visuals.js 内に閉じているため、
  // ここでは HTML から桁の重みを読み、4桁ぶんの表現範囲だけを確認する。
  const html = visualHtml('bits-play');
  const ws = (html.match(/data-w="(\d+)"/g) || []).map((m) => Number(m.match(/\d+/)[0]));
  assert(ws.length === 4, 'visual:bits-play', `桁が4つでない（${ws.length}）`);
  assert(
    ws.join(',') === '8,4,2,1',
    'visual:bits-play',
    `重みが左から 8,4,2,1 でない: ${ws.join(',')}（図と本文の説明がずれる）`
  );
  // 初期状態は全部0であること（お題を出す前に正解になっていたら意味がない）
  const zeros = (html.match(/class="bit-b">0</g) || []).length;
  assert(zeros === 4, 'visual:bits-play', '初期状態が全部0になっていない');
}

// --- 図そのものの健全性 ---
// 登録済みの図が、実際にHTMLを返すか。空を返すと本文だけになり、
// 「図を入れたつもりが出ていない」に気づけない。
for (const name of VISUAL_NAMES) {
  const html = visualHtml(name);
  const vw = `visual:${name}`;
  assert(typeof html === 'string' && html.length > 30, vw, 'HTMLが空または短すぎる');
  assert(!/undefined|NaN|\[object/.test(html), vw, 'HTMLに undefined / NaN が混ざっている');
  // タグの開閉が釣り合っているか（雑だが、閉じ忘れは検出できる）
  const open = (html.match(/<div/g) || []).length;
  const close = (html.match(/<\/div>/g) || []).length;
  assert(open === close, vw, `divの開閉が合わない（開${open} / 閉${close}）`);
}

for (const l of LESSONS) {
  const w = `lesson:${l.id}`;
  const before = failures;

  // --- メタ ---
  assert(textSane(l.id), w, 'id がない');
  assert(!seenIds.has(l.id), w, `id が重複: ${l.id}`);
  seenIds.add(l.id);
  assert(textSane(l.title), w, 'title がない');
  assert(textSane(l.subtitle), w, 'subtitle がない');
  assert(typeof l.minutes === 'number' && l.minutes > 0, w, 'minutes が不正');
  // 修了後に「本番の問題を解く」で飛ぶ先。存在しないIDだとボタンが無反応になる
  assert(textSane(l.drillId), w, 'drillId がない');

  // --- ① 読む ---
  assert(Array.isArray(l.read) && l.read.length >= 2, w, 'read が2ページ未満');
  l.read.forEach((p, i) => {
    const pw = `${w} read[${i}]`;
    assert(textSane(p.h), pw, '見出しがない');
    assert(textSane(p.b), pw, '本文がない');
    assert(p.b.length >= 40, pw, `本文が短すぎる（${p.b.length}字）`);
    assert(starsBalanced(p.b), pw, '** が閉じていない');

    // 図の名前が visuals.js に実在するか。
    // visualHtml() は未知の名前を静かに無視する（本文だけは必ず読める）作りなので、
    // 名前をタイプミスしても画面上は「図が出ないだけ」で気づけない。ここで止める。
    if (p.v !== undefined) {
      assert(
        VISUAL_NAMES.indexOf(p.v) >= 0,
        pw,
        `図 '${p.v}' が visuals.js に定義されていない`
      );
    }
  });

  // --- ② 一緒に解く ---
  const wk = l.walk;
  assert(wk && typeof wk === 'object', w, 'walk がない');
  if (wk) {
    assert(textSane(wk.intro), `${w} walk`, 'intro がない');
    assert(textSane(wk.question), `${w} walk`, 'question がない');
    assert(textSane(wk.wrap), `${w} walk`, 'wrap（まとめ）がない');
    assert(starsBalanced(wk.wrap), `${w} walk`, 'wrap の ** が閉じていない');
    assert(Array.isArray(wk.steps) && wk.steps.length >= 2, `${w} walk`, 'steps が2未満');

    (wk.steps || []).forEach((s, i) => {
      const sw = `${w} walk.steps[${i}]`;
      assert(textSane(s.ask), sw, '問いかけがない');
      assert(Array.isArray(s.choices) && s.choices.length >= 2, sw, '選択肢が2未満');
      assert(new Set(s.choices).size === s.choices.length, sw, '選択肢が重複');
      assert(
        Number.isInteger(s.ok) && s.ok >= 0 && s.ok < s.choices.length,
        sw,
        `ok が範囲外: ${s.ok}`
      );
      assert(textSane(s.why), sw, '解説(why)がない');
      assert(starsBalanced(s.why), sw, 'why の ** が閉じていない');
    });
  }

  // --- ③ 自分で解く ---
  assert(Array.isArray(l.try) && l.try.length >= 2, w, 'try が2問未満');
  (l.try || []).forEach((t, i) => {
    const tw = `${w} try[${i}]`;
    assert(textSane(t.q), tw, '問題文がない');
    assert(Array.isArray(t.choices) && t.choices.length === 4, tw, '選択肢が4つでない');
    assert(new Set(t.choices).size === 4, tw, '選択肢が重複');
    assert(
      Number.isInteger(t.ok) && t.ok >= 0 && t.ok < 4,
      tw,
      `ok が範囲外: ${t.ok}`
    );
    assert(textSane(t.hint), tw, 'hint がない（初学者モードはヒント常時表示が前提）');
    assert(textSane(t.hint2), tw, 'hint2 がない（2回目に出すヒント）');
    assert(textSane(t.after), tw, 'after（正解後の解説）がない');

    for (const [k, v] of [['hint', t.hint], ['hint2', t.hint2], ['after', t.after], ['q', t.q]]) {
      assert(starsBalanced(v), tw, `${k} の ** が閉じていない`);
    }

    // ★最重要★ 間違えている間に出る文言（hint / hint2）に正解が書かれていないこと。
    // ここが漏れると「間違えても答えを教えない」という設計が成立しない。
    const answer = String(t.choices[t.ok]);
    assert(
      t.hint.indexOf(answer) < 0,
      tw,
      `hint に正解「${answer}」が書かれている（答えが漏れる）`
    );
    assert(
      t.hint2.indexOf(answer) < 0,
      tw,
      `hint2 に正解「${answer}」が書かれている（答えが漏れる）`
    );

    // 逆に、正解後の解説には答えが出ていてほしい
    assert(
      t.after.indexOf(answer) >= 0,
      tw,
      `after に正解「${answer}」が現れない（何が正しかったか分からない）`
    );
  });

  assert(textSane(l.done), w, 'done（修了メッセージ）がない');
  assert(starsBalanced(l.done), w, 'done の ** が閉じていない');

  print(`${failures === before ? '✓' : '✗'} ${String(l.id).padEnd(12)} ${l.title}`);
}

print('');
print(`検査数: ${checks} / 失敗: ${failures} / レッスン: ${LESSONS.length}`);
if (failures > 0) {
  print('=== 失敗あり ===');
  throw new Error(`${failures} 件の検証に失敗`);
}
print('=== 全て通過 ===');
