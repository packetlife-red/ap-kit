// 「はじめから」モードの画面。
//
// ドリル側（ui/app.js）とは方針が正反対なので、あえて別ファイルにしてある。
//   ドリル … 即採点し、正誤を記録し、次の問題へ流す
//   ここ　 … read/walk は採点しない。try で間違えても答えを出さず、
//            ヒントを足して同じ問題をもう一度やらせる
//
// 「間違い＝罰」にしないための作りなので、成績（store の stats）には一切書かない。
// 記録するのは「どのレッスンをどこまで進んだか」だけ。

import { LESSONS, getLesson } from './lessons.js';
import { store } from '../core/store.js';

// ui/app.js と同名にすると単一スコープで衝突するため、learn層は接頭辞を付ける
const $l = (sel, root = document) => root.querySelector(sel);

function lesc(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// 本文の軽量マークアップ。**太字** と改行のみ（ui/app.js と同じ方針）。
function md(s) {
  return lesc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}

// --- 進捗の保存 ---------------------------------------------------------
// 形: { [lessonId]: { read: bool, walk: bool, done: bool } }

const PROGRESS = 'learn-progress';

function getProgress() {
  return store.get(PROGRESS, {}) || {};
}

function markProgress(lessonId, key) {
  store.update(
    PROGRESS,
    (p) => {
      const all = p || {};
      all[lessonId] = Object.assign({}, all[lessonId], { [key]: true });
      return all;
    },
    {}
  );
}

// --- 画面状態 -----------------------------------------------------------

const view = {
  lesson: null, // 開いているレッスン
  stage: 'read', // read / walk / try / done
  page: 0, // read の何ページ目か
  walkStep: 0, // walk の何問目か
  tryIndex: 0, // try の何問目か
  tryMisses: 0, // 今の問題で何回間違えたか（ヒントの出し方を変える）
};

function host() {
  return $l('#learn-host');
}

// =======================================================================
// 一覧
// =======================================================================

function renderList() {
  const p = getProgress();

  const cards = LESSONS.map((l, i) => {
    const st = p[l.id] || {};
    const label = st.done ? 'もう一度' : st.read || st.walk ? 'つづきから' : 'はじめる';
    const badge = st.done
      ? '<span class="lc-done">修了</span>'
      : `<span class="lc-min">${l.minutes}分</span>`;

    return `
      <button class="lesson-card${st.done ? ' is-done' : ''}" data-lesson="${lesc(l.id)}">
        <span class="lc-no">${i + 1}</span>
        <span class="lc-main">
          <span class="lc-title">${lesc(l.title)}</span>
          <span class="lc-sub">${lesc(l.subtitle)}</span>
        </span>
        <span class="lc-right">${badge}<span class="lc-go">${label}</span></span>
      </button>`;
  }).join('');

  host().innerHTML = `
    <div class="panel learn-intro">
      <h2>はじめから</h2>
      <p>
        用語をひとつも知らない状態から読み始められます。<br>
        <b>読む → 一緒に解く → 自分で解く</b> の順に進むので、いきなり問題は出ません。
      </p>
      <p class="muted">
        ここでの正誤は成績に記録されません。間違えても大丈夫です。
      </p>
    </div>
    <div class="lesson-list">${cards}</div>
    <p class="muted" style="margin-top:18px;text-align:center">
      ひととおり終えたら「ドリル」タブで本番の問題に挑戦してみてください。
    </p>
  `;

  host()
    .querySelectorAll('[data-lesson]')
    .forEach((b) => b.addEventListener('click', () => openLesson(b.dataset.lesson)));
}

function openLesson(id) {
  view.lesson = getLesson(id);
  view.stage = 'read';
  view.page = 0;
  view.walkStep = 0;
  view.tryIndex = 0;
  view.tryMisses = 0;
  render();
}

// =======================================================================
// 共通の枠
// =======================================================================

const STAGE_LABEL = { read: '読む', walk: '一緒に解く', try: '自分で解く', done: '修了' };

function frame(inner) {
  const l = view.lesson;
  const order = ['read', 'walk', 'try'];
  const at = order.indexOf(view.stage);

  const dots = order
    .map((s, i) => {
      const cls = view.stage === 'done' || i < at ? 'ok' : i === at ? 'now' : '';
      return `<span class="pg-step ${cls}">${STAGE_LABEL[s]}</span>`;
    })
    .join('<span class="pg-line" aria-hidden="true"></span>');

  return `
    <div class="panel">
      <div class="lesson-head">
        <button class="btn back" id="learn-back">← 一覧</button>
        <div class="lh-title">
          <strong>${lesc(l.title)}</strong>
          <span class="muted">${lesc(l.subtitle)}</span>
        </div>
      </div>
      <div class="progress-bar" role="group" aria-label="進み具合">${dots}</div>
      ${inner}
    </div>`;
}

function render() {
  if (!view.lesson) return renderList();
  if (view.stage === 'read') renderRead();
  else if (view.stage === 'walk') renderWalk();
  else if (view.stage === 'try') renderTry();
  else renderDone();

  const back = $l('#learn-back');
  if (back) back.addEventListener('click', () => renderList());
  window.scrollTo({ top: 0 });
}

// =======================================================================
// ① 読む
// =======================================================================

function renderRead() {
  const l = view.lesson;
  const total = l.read.length;
  const pageData = l.read[view.page];
  const last = view.page === total - 1;

  host().innerHTML = frame(`
    <div class="read-page">
      <div class="read-count">${view.page + 1} / ${total}</div>
      <h3>${lesc(pageData.h)}</h3>
      <div class="read-body">${md(pageData.b)}</div>
    </div>
    <div class="row" style="margin-top:18px">
      ${view.page > 0 ? '<button class="btn" id="read-prev">戻る</button>' : ''}
      <span class="spacer"></span>
      <button class="btn primary" id="read-next">${last ? '一緒に解いてみる →' : '次へ'}</button>
    </div>
  `);

  const prev = $l('#read-prev');
  if (prev) prev.addEventListener('click', () => { view.page--; render(); });

  $l('#read-next').addEventListener('click', () => {
    if (last) {
      markProgress(l.id, 'read');
      view.stage = 'walk';
    } else {
      view.page++;
    }
    render();
  });
}

// =======================================================================
// ② 一緒に解く（採点しない）
// =======================================================================

function renderWalk() {
  const l = view.lesson;
  const w = l.walk;
  const total = w.steps.length;
  const s = w.steps[view.walkStep];
  const finished = view.walkStep >= total;

  if (finished) {
    host().innerHTML = frame(`
      <div class="walk-wrap">
        <div class="walk-q">${md(w.question)}</div>
        <div class="ex trap" style="margin-top:16px">
          <h4><span class="ex-icon" aria-hidden="true">✓</span>まとめ</h4>
          <div class="ex-body">${md(w.wrap)}</div>
        </div>
      </div>
      <div class="row" style="margin-top:18px">
        <span class="spacer"></span>
        <button class="btn primary" id="walk-done">自分で解いてみる →</button>
      </div>
    `);
    $l('#walk-done').addEventListener('click', () => {
      markProgress(l.id, 'walk');
      view.stage = 'try';
      view.tryIndex = 0;
      view.tryMisses = 0;
      render();
    });
    return;
  }

  host().innerHTML = frame(`
    <div class="walk-wrap">
      ${view.walkStep === 0 ? `<div class="walk-intro">${md(w.intro)}</div>` : ''}
      <div class="walk-q">${md(w.question)}</div>
      <div class="walk-step">
        <div class="ws-count">ステップ ${view.walkStep + 1} / ${total}</div>
        <div class="ws-ask">${md(s.ask)}</div>
        <div class="choices" id="walk-choices"></div>
        <div class="row" style="margin-top:10px">
          <button class="btn subtle" id="walk-peek">答えを見る</button>
        </div>
        <div class="walk-why hidden" id="walk-why"></div>
      </div>
    </div>
  `);

  const box = $l('#walk-choices');
  s.choices.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.type = 'button';
    b.setAttribute('aria-label', c);
    b.innerHTML = `<span class="val">${lesc(c)}</span>`;
    b.addEventListener('click', () => revealWalk(i));
    box.appendChild(b);
  });

  $l('#walk-peek').addEventListener('click', () => revealWalk(null));
}

// walk では「不正解」を出さない。選んだものが違っていても、
// 正解を示して理由を読ませ、そのまま次へ進ませる（ここは練習ではなく解説）。
function revealWalk(picked) {
  const s = view.lesson.walk.steps[view.walkStep];
  const btns = Array.from(host().querySelectorAll('#walk-choices .choice'));
  btns.forEach((b, i) => {
    b.disabled = true;
    if (i === s.ok) b.classList.add('correct');
    else if (i === picked) b.classList.add('dim');
  });

  const peek = $l('#walk-peek');
  if (peek) peek.classList.add('hidden');

  const why = $l('#walk-why');
  why.classList.remove('hidden');
  why.innerHTML = `
    <div class="ws-why">${md(s.why)}</div>
    <div class="row" style="margin-top:12px">
      <span class="spacer"></span>
      <button class="btn primary" id="walk-next">次へ</button>
    </div>`;
  $l('#walk-next').addEventListener('click', () => { view.walkStep++; render(); });
}

// =======================================================================
// ③ 自分で解く（間違えても答えを出さない）
// =======================================================================

function renderTry() {
  const l = view.lesson;
  const total = l.try.length;
  const t = l.try[view.tryIndex];

  host().innerHTML = frame(`
    <div class="try-wrap">
      <div class="try-count">${view.tryIndex + 1} 問目 / ${total}</div>
      <div class="try-q">${md(t.q)}</div>
      <div class="try-hint"><b>ヒント</b><br>${md(t.hint)}</div>
      <div class="choices" id="try-choices"></div>
      <div class="try-result hidden" id="try-result"></div>
    </div>
  `);

  const box = $l('#try-choices');
  t.choices.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.type = 'button';
    b.setAttribute('aria-label', c);
    b.innerHTML = `<span class="val">${lesc(c)}</span>`;
    b.addEventListener('click', () => judgeTry(i));
    box.appendChild(b);
  });
}

function judgeTry(picked) {
  const l = view.lesson;
  const t = l.try[view.tryIndex];
  const box = $l('#try-result');

  if (picked !== t.ok) {
    // 間違えたときは正解を出さない。選んだ肢だけ落として、もう一度選ばせる。
    // 初学者にとって「不正解です、正解はイでした」は学習ではなく通告になるため。
    //
    // 2回目以降は hint2（答えを含まない、より噛み砕いた誘導）に切り替える。
    // ここで t.after を出すと答えそのものが漏れる（実際にそのバグを踏んだ）。
    view.tryMisses++;
    const b = host().querySelectorAll('#try-choices .choice')[picked];
    b.disabled = true;
    b.classList.add('dim');

    const guide = view.tryMisses === 1 ? t.hint : t.hint2 || t.hint;

    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="try-again">
        <b>${view.tryMisses === 1 ? 'おしい。もう一度考えてみましょう。' : 'あと少しです。'}</b><br>
        ${md(guide)}
      </div>`;
    return;
  }

  // 正解
  const btns = host().querySelectorAll('#try-choices .choice');
  btns.forEach((b, i) => {
    b.disabled = true;
    if (i === t.ok) b.classList.add('correct');
  });

  const last = view.tryIndex === l.try.length - 1;
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="try-ok">${view.tryMisses === 0 ? 'そのとおりです' : 'できました'}</div>
    <div class="try-after">${md(t.after)}</div>
    <div class="row" style="margin-top:14px">
      <span class="spacer"></span>
      <button class="btn primary" id="try-next">${last ? 'まとめを見る →' : '次の問題 →'}</button>
    </div>`;

  $l('#try-next').addEventListener('click', () => {
    if (last) {
      markProgress(l.id, 'done');
      view.stage = 'done';
    } else {
      view.tryIndex++;
      view.tryMisses = 0;
    }
    render();
  });
}

// =======================================================================
// ④ 修了
// =======================================================================

function renderDone() {
  const l = view.lesson;
  const idx = LESSONS.findIndex((x) => x.id === l.id);
  const nextLesson = LESSONS[idx + 1];

  host().innerHTML = frame(`
    <div class="done-wrap">
      <div class="done-mark">修了</div>
      <div class="done-body">${md(l.done)}</div>
      <div class="done-actions">
        <button class="btn primary" id="done-drill">本番の問題を解いてみる</button>
        ${nextLesson ? `<button class="btn" id="done-next">次のレッスン：${lesc(nextLesson.subtitle)}</button>` : ''}
        <button class="btn subtle" id="done-list">一覧に戻る</button>
      </div>
    </div>
  `);

  $l('#done-drill').addEventListener('click', () => {
    // ドリルタブへ渡す。ui/app.js が拾って分野を絞り込む。
    window.dispatchEvent(new CustomEvent('ap:drill', { detail: { genId: l.drillId } }));
  });

  const nx = $l('#done-next');
  if (nx) nx.addEventListener('click', () => openLesson(nextLesson.id));

  $l('#done-list').addEventListener('click', () => renderList());
}

// =======================================================================

export function mountLearn() {
  renderList();
}
