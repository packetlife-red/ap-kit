// 画面まわり。ここだけがDOMに触る層。
// 将来React等へ載せ替えるときは、このファイルを捨てて core/ をそのまま使う。

import { allGenerators, generate } from '../core/generators/index.js';
import { randomSeed } from '../core/rng.js';
import { store, recordAnswer, getStats, resetStats } from '../core/store.js';
import { mountSimulators } from '../sim/index.js';
import { mountLearn } from '../learn/app.js';

const CHOICE_LABELS = ['ア', 'イ', 'ウ', 'エ'];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// XSS対策というより、問題文に <> が入っても壊れないようにするため。
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// --- 状態 ---------------------------------------------------------------

const state = {
  current: null, // 現在の問題
  answered: false,
  selected: new Set(), // 有効な分野ID
};

// --- タブ ---------------------------------------------------------------

let currentTab = null;

function showTab(name) {
  $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
  if (name === 'stats') renderStats();
  // 実際にタブが変わったときだけ先頭へ戻す。
  // 初回表示や同じタブの再描画でスクロール位置を動かすと、読んでいる途中で飛んでしまう。
  if (currentTab !== null && currentTab !== name) window.scrollTo({ top: 0 });
  currentTab = name;
  store.set('last-tab', name);
}

// --- 分野フィルタ -------------------------------------------------------

function loadSelection() {
  const saved = store.get('filters', null);
  const ids = allGenerators().map((g) => g.id);
  if (Array.isArray(saved) && saved.length) {
    const valid = saved.filter((id) => ids.indexOf(id) >= 0);
    state.selected = new Set(valid.length ? valid : ids);
  } else {
    state.selected = new Set(ids);
  }
}

function saveSelection() {
  store.set('filters', Array.from(state.selected));
}

function renderFilters() {
  const box = $('#filters');
  box.innerHTML = '';

  const all = document.createElement('button');
  all.className = 'chip';
  all.textContent = 'すべて';
  all.setAttribute('aria-pressed', String(state.selected.size === allGenerators().length));
  all.addEventListener('click', () => {
    const gens = allGenerators();
    state.selected = state.selected.size === gens.length ? new Set([gens[0].id]) : new Set(gens.map((g) => g.id));
    saveSelection();
    renderFilters();
  });
  box.appendChild(all);

  for (const g of allGenerators()) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = g.name;
    b.setAttribute('aria-pressed', String(state.selected.has(g.id)));
    b.addEventListener('click', () => {
      if (state.selected.has(g.id)) {
        // 最後の1つは外させない（出題できなくなるため）
        if (state.selected.size > 1) state.selected.delete(g.id);
      } else {
        state.selected.add(g.id);
      }
      saveSelection();
      renderFilters();
    });
    box.appendChild(b);
  }
}

// --- 出題 ---------------------------------------------------------------

function pickGeneratorId() {
  const ids = allGenerators()
    .map((g) => g.id)
    .filter((id) => state.selected.has(id));
  const pool = ids.length ? ids : allGenerators().map((g) => g.id);
  return pool[Math.floor(Math.random() * pool.length)];
}

function nextQuestion(fixed) {
  const genId = (fixed && fixed.genId) || pickGeneratorId();
  const seed = (fixed && fixed.seed) != null ? fixed.seed : randomSeed();

  try {
    state.current = generate(genId, seed);
  } catch (e) {
    // 1つのジェネレータが失敗しても画面全体は止めない
    $('#question').innerHTML =
      `<p class="verdict ng">問題の生成に失敗しました（${esc(genId)}）</p>` +
      `<p class="muted">${esc(e && e.message ? e.message : e)}</p>`;
    return;
  }
  state.answered = false;
  renderQuestion();
}

function renderQuestion() {
  const q = state.current;
  const el = $('#question');

  el.innerHTML = `
    <div class="qmeta">
      <span class="badge">${esc(q.generatorName)}</span>
      <span>${esc(q.category)}</span>
      <span class="spacer"></span>
      <span title="この番号を控えると同じ問題を再現できます">seed: ${q.seed}</span>
    </div>
    ${q.svg ? `<div class="figure">${q.svg}</div>` : ''}
    <div class="qtext">${esc(q.question)}</div>
    ${q.hint ? `<div class="hint">ヒント：${esc(q.hint)}</div>` : ''}
    <div class="choices" id="choices"></div>
    <div class="result hidden" id="result"></div>
  `;

  const box = $('#choices');
  q.choices.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.type = 'button';
    // 選択肢の中身は span で組んでいるが、それだけだとスクリーンリーダーや
    // 自動テストから「名前のないボタン」に見えるので、明示的にラベルを付ける。
    b.setAttribute('aria-label', `${CHOICE_LABELS[i]}、${c}`);
    b.innerHTML = `<span class="mark" aria-hidden="true">${CHOICE_LABELS[i]}</span><span class="val">${esc(c)}</span>`;
    b.addEventListener('click', () => answer(i));
    box.appendChild(b);
  });

  $('#next').textContent = '次の問題';
}

function answer(index) {
  if (state.answered) return;
  state.answered = true;

  const q = state.current;
  const ok = index === q.answerIndex;

  recordAnswer({ generatorId: q.generatorId, ok, seed: q.seed });

  // 選択肢の見た目を確定させ、誤答には「なぜ間違えるか」を出す。
  // 正解しても他の選択肢の理由を読めるようにしておく（ここが復習の中心）。
  $$('#choices .choice').forEach((b, i) => {
    b.disabled = true;
    const meta = q.choiceMeta[i];
    if (i === q.answerIndex) {
      b.classList.add('correct');
    } else if (i === index) {
      b.classList.add('wrong');
    } else {
      b.classList.add('dim');
    }
    if (!meta.correct && meta.why) {
      const why = document.createElement('span');
      why.className = 'why';
      why.textContent = meta.why;
      b.querySelector('.val').appendChild(why);
    }
  });

  const r = $('#result');
  r.classList.remove('hidden');

  // 式だけを並べたブロック。explain がある分野では折りたたみに退避する
  // （公式を知っている人の確認用であって、これから覚える人の読み物ではないため）。
  const stepsHtml = `
    <ul class="steps">
      ${q.steps
        .map((s) => {
          const v =
            s.value === null || s.value === undefined
              ? ''
              : `<span class="eq">= ${esc(fmtStepValue(s.value))}${esc(s.unit || '')}</span>`;
          return `<li><span class="lbl">${esc(s.label)}</span><span class="expr">${esc(s.expr)}</span>${v}</li>`;
        })
        .join('')}
    </ul>`;

  const hasExplain = q.explain && q.explain.length;

  r.innerHTML = `
    <div class="verdict ${ok ? 'ok' : 'ng'}">${ok ? '正解' : `不正解　正解は ${CHOICE_LABELS[q.answerIndex]}：${esc(q.answerText)}`}</div>
    ${hasExplain ? renderExplain(q.explain) : stepsHtml}
    ${
      hasExplain
        ? `<details class="formula"><summary>式だけを見る</summary>${stepsHtml}</details>`
        : ''
    }
    ${q.note ? `<div class="note">${esc(q.note)}</div>` : ''}
  `;

  // 解説を読ませたいので、ここでフォーカスやスクロールを動かさない。
  // 以前 $('#next').focus() を呼んでいたが、ブラウザがボタン位置まで
  // 自動スクロールしてしまい、答え合わせの直後に画面が飛んでいた。
}

// --- 教える解説 ---------------------------------------------------------

const EXPLAIN_KIND = {
  ask: { icon: '?', cls: 'ask' },
  why: { icon: '!', cls: 'why-block' },
  calc: { icon: '=', cls: 'calc' },
  trap: { icon: '×', cls: 'trap' },
};

// 解説本文の軽量マークアップ。**太字** と改行だけを通す。
// esc() を通したあとに置換するので、本文に <b> と書かれていても実体参照のまま残る。
function fmtExplainBody(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}

function renderExplain(blocks) {
  return `<div class="explain">${blocks
    .map((b) => {
      const k = EXPLAIN_KIND[b.kind] || EXPLAIN_KIND.why;
      return `
        <section class="ex ${k.cls}">
          <h4><span class="ex-icon" aria-hidden="true">${k.icon}</span>${esc(b.title)}</h4>
          <div class="ex-body">${fmtExplainBody(b.body)}</div>
        </section>`;
    })
    .join('')}</div>`;
}

// 解説中の数値表示。桁が多いときだけ丸める（元の値を壊さない範囲で）。
function fmtStepValue(v) {
  if (typeof v !== 'number') return String(v);
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return v.toLocaleString('ja-JP');

  // 極端に小さい値をそのまま String() に渡すと "5e-7" になる。
  // 初学者にはこの表記自体が読めないので、必ず小数で書き下す。
  // （ページフォールト率の解説で実際に 5e-7 が出ていた）
  const abs = Math.abs(v);
  if (abs < 0.01) {
    // 有効数字が消えない桁数まで伸ばす。toFixed は指数表記にならない
    const digits = Math.min(12, Math.ceil(-Math.log10(abs)) + 2);
    return v.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  }

  // 4桁で丸めたうえで、桁区切りを入れる（12345.6789 → 12,345.6789）
  const r = Math.round(v * 10000) / 10000;
  return r.toLocaleString('ja-JP', { maximumFractionDigits: 4 });
}

// --- 成績 ---------------------------------------------------------------

function renderStats() {
  const stats = getStats();
  const gens = allGenerators();

  let total = 0;
  let correct = 0;
  for (const id in stats) {
    total += stats[id].total;
    correct += stats[id].correct;
  }

  $('#stats-summary').innerHTML = `
    <div class="readout">
      <div class="stat"><div class="k">解いた問題</div><div class="v">${total}</div></div>
      <div class="stat"><div class="k">正解</div><div class="v">${correct}</div></div>
      <div class="stat accent"><div class="k">正答率</div><div class="v">${
        total ? Math.round((correct / total) * 100) : 0
      }%</div></div>
    </div>
  `;

  const rows = gens
    .map((g) => {
      const s = stats[g.id] || { correct: 0, total: 0 };
      const rate = s.total ? s.correct / s.total : null;
      return { g, s, rate };
    })
    // 正答率が低い順（＝苦手な分野）を上に。未挑戦は最後。
    .sort((a, b) => {
      if (a.rate === null && b.rate === null) return 0;
      if (a.rate === null) return 1;
      if (b.rate === null) return -1;
      return a.rate - b.rate;
    });

  $('#stats-table').innerHTML = `
    <table class="stats">
      <thead><tr><th>分野</th><th>正解 / 出題</th><th>正答率</th></tr></thead>
      <tbody>
        ${rows
          .map(
            ({ g, s, rate }) => `
          <tr>
            <td>${esc(g.name)}<span class="bar"><span style="width:${
              rate === null ? 0 : Math.round(rate * 100)
            }%"></span></span></td>
            <td class="num">${s.correct} / ${s.total}</td>
            <td class="num">${rate === null ? '—' : Math.round(rate * 100) + '%'}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

// --- 起動 ---------------------------------------------------------------

export function boot() {
  loadSelection();
  renderFilters();

  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#next').addEventListener('click', () => nextQuestion());
  $('#retry').addEventListener('click', () => {
    if (state.current) nextQuestion({ genId: state.current.generatorId, seed: state.current.seed });
  });
  $('#reset-stats').addEventListener('click', () => {
    if (confirm('成績をすべて消去します。よろしいですか？')) {
      resetStats();
      renderStats();
    }
  });

  // シミュレータから「この分野を解く」で飛んでくる
  window.addEventListener('ap:drill', (e) => {
    const genId = e.detail && e.detail.genId;
    if (genId) {
      state.selected = new Set([genId]);
      saveSelection();
      renderFilters();
      nextQuestion({ genId });
    }
    showTab('drill');
  });

  mountSimulators();
  mountLearn();
  nextQuestion();

  // 初回は「はじめから」で開く。いきなり4択が飛んでくると、まだ習っていない人には
  // 当てずっぽうしかできず、間違いを突きつけられるだけになるため。
  // 一度でもドリルを使った人には、以前見ていたタブを復元する。
  const lastTab = store.get('last-tab', null);
  showTab(lastTab === 'drill' || lastTab === 'sim' || lastTab === 'stats' ? lastTab : 'learn');
}
