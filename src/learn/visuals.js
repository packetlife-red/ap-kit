// レッスン本文に差し込む「動く図」。
//
// 作った理由は、利用者からの
//   「画面がずっと同じで、考えるのにも同じ内容に見えて頭に入りづらかった」
// というフィードバック。文章は良くても、**紙芝居が1枚も動かない**のが問題だった。
//
// 方針は2つ。
//   1. 図そのものが順番に組み上がる（一度に全部出さない）。読む速度に絵が付いてくる
//   2. ページごとに絵が違う。「別の話に入った」ことが目で分かる
//
// レッスン側は `v: 'bits-101'` のように文字列で指定するだけにしてある。
// 図の実装をレッスン本文（lessons.js）に持ち込まないため。

// 図はすべて「箱を並べて、順番に光らせる」で表現する。
// 追加のライブラリは使わない（外部依存ゼロの方針）。

// ---------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------

// 桁の重み（1・2・4・8…）を並べたビット列。
// bits: '1011' のような文字列。weights を出すかどうかを opts で切り替える。
function bitRow(bits, opts = {}) {
  const arr = String(bits).split('');
  const n = arr.length;
  const cells = arr
    .map((b, i) => {
      const w = Math.pow(2, n - 1 - i); // 左の桁ほど重い
      const on = b === '1';
      // data-step は「何番目に光るか」。CSSのアニメーション遅延に使う。
      return `
        <div class="bit ${on ? 'on' : 'off'}" style="--i:${i}">
          ${opts.weight === false ? '' : `<div class="bit-w">${w}</div>`}
          <div class="bit-b">${b}</div>
          ${opts.sum && on ? `<div class="bit-plus">+${w}</div>` : ''}
        </div>`;
    })
    .join('');
  return `<div class="bit-row${opts.sum ? ' with-sum' : ''}">${cells}</div>`;
}

// 電球のならび（スイッチが2状態しかない、の説明用）
function lampRow(pattern) {
  const cells = String(pattern)
    .split('')
    .map((b, i) => {
      const on = b === '1';
      return `
        <div class="lamp ${on ? 'on' : 'off'}" style="--i:${i}">
          <div class="lamp-bulb"></div>
          <div class="lamp-cap">${on ? '入' : '切'}</div>
          <div class="lamp-num">${b}</div>
        </div>`;
    })
    .join('');
  return `<div class="lamp-row">${cells}</div>`;
}

// 桁の重みが2倍ずつ伸びていく階段。
function ladder(values, opts = {}) {
  const max = Math.max(...values);
  const cells = values
    .map((v, i) => {
      const h = Math.max(8, Math.round((v / max) * 100));
      return `
        <div class="lad" style="--i:${i};--h:${h}%">
          <div class="lad-bar"><span></span></div>
          <div class="lad-v">${v}</div>
        </div>`;
    })
    .join('');
  return `
    <div class="ladder">
      ${cells}
      ${opts.note ? `<div class="lad-note">${opts.note}</div>` : ''}
    </div>`;
}

// 10進数の位取りを分解して見せる（347 = 300 + 40 + 7）
function decimalBreak(num) {
  const digits = String(num).split('');
  const n = digits.length;
  const rows = digits
    .map((d, i) => {
      const w = Math.pow(10, n - 1 - i);
      return `
        <div class="dec-row" style="--i:${i}">
          <span class="dec-d">${d}</span>
          <span class="dec-x">×</span>
          <span class="dec-w">${w}</span>
          <span class="dec-eq">=</span>
          <span class="dec-v">${Number(d) * w}</span>
        </div>`;
    })
    .join('');
  return `
    <div class="dec-break">
      ${rows}
      <div class="dec-sum" style="--i:${n}">合計 ${num}</div>
    </div>`;
}

// バイトとビットの大きさの違い（1バイト＝8ビット）
function byteBit() {
  const bits = Array.from({ length: 8 }, (_, i) => `<span class="bb-bit" style="--i:${i}"></span>`).join('');
  return `
    <div class="bytebit">
      <div class="bb-side">
        <div class="bb-label">1バイト</div>
        <div class="bb-box byte">B</div>
      </div>
      <div class="bb-eq">=</div>
      <div class="bb-side">
        <div class="bb-label">8ビット</div>
        <div class="bb-box bits">${bits}</div>
      </div>
    </div>`;
}

// 帯グラフで「送るデータ量」と「1秒で送れる量」を比べる
function pipe(dataMbit, speedMbps) {
  const sec = dataMbit / speedMbps;
  const chunks = Array.from(
    { length: Math.min(Math.round(sec), 12) },
    (_, i) => `<span class="pp-chunk" style="--i:${i}"></span>`
  ).join('');
  return `
    <div class="pipe">
      <div class="pp-line"><span class="pp-label">送るデータ</span><b>${dataMbit} Mビット</b></div>
      <div class="pp-line"><span class="pp-label">1秒で送れる量</span><b>${speedMbps} Mビット</b></div>
      <div class="pp-track">${chunks}</div>
      <div class="pp-foot">1秒ぶんの塊が <b>${sec}</b> 個 → <b>${sec}秒</b></div>
    </div>`;
}

// ---------------------------------------------------------------------
// 登録表
// ---------------------------------------------------------------------
//
// レッスン本文からは、この名前で呼ぶ。
// 存在しない名前が来たら「図なし」として静かに無視する（本文は必ず読める）。

// 触れる2進数。桁をタップして0/1を切り替えると、合計が即座に変わる。
//
// 見るだけの図との違いは「自分で作れる」こと。
// 「10を作ってみて」と言われて自分で組めたときに、初めて手が覚える。
// お題を出して、当たったらその場で褒める（採点はしない・記録もしない）。
const bitsPlay = {
  html() {
    const cells = [8, 4, 2, 1]
      .map(
        (w, i) => `
        <button type="button" class="bit bp-cell off" data-w="${w}" style="--i:${i}"
                aria-pressed="false" aria-label="${w}の桁">
          <span class="bit-w">${w}</span>
          <span class="bit-b">0</span>
        </button>`
      )
      .join('');
    return `
      <div class="bitplay">
        <div class="bp-task" id="bp-task"></div>
        <div class="bit-row bp-row" id="bp-row">${cells}</div>
        <div class="bp-sum" id="bp-sum"></div>
        <div class="bp-msg" id="bp-msg"></div>
        <div class="row bp-actions">
          <button type="button" class="btn subtle" id="bp-clear">ぜんぶ0に戻す</button>
          <span class="spacer"></span>
          <button type="button" class="btn" id="bp-next">別のお題</button>
        </div>
      </div>`;
  },

  mount(root) {
    const q = (s) => root.querySelector(s);
    const cells = Array.from(root.querySelectorAll('.bp-cell'));
    if (!cells.length) return null;

    // お題は暗算できる範囲だけ。0と15は「全部0／全部1」で当たってしまうので入れない。
    const TASKS = [10, 5, 13, 6, 9, 12, 3, 7, 11, 14];
    let taskIndex = 0;
    let cleared = false;

    function value() {
      return cells.reduce(
        (sum, c) => sum + (c.classList.contains('on') ? Number(c.dataset.w) : 0),
        0
      );
    }

    function render() {
      const v = value();
      const bits = cells.map((c) => (c.classList.contains('on') ? '1' : '0')).join('');
      const parts = cells
        .filter((c) => c.classList.contains('on'))
        .map((c) => c.dataset.w);

      q('#bp-sum').innerHTML = parts.length
        ? `<b>${bits}</b> ＝ ${parts.join(' + ')} ＝ <b class="bp-v">${v}</b>`
        : `<b>${bits}</b> ＝ <b class="bp-v">0</b>　<span class="muted">（1が1つも立っていない）</span>`;

      const target = TASKS[taskIndex];
      const msg = q('#bp-msg');
      if (v === target && !cleared) {
        cleared = true;
        msg.className = 'bp-msg ok';
        msg.textContent = `そのとおり。${target} は ${bits} です。`;
      } else if (v !== target) {
        cleared = false;
        msg.className = 'bp-msg';
        msg.textContent = '';
      }
    }

    function setTask(i) {
      taskIndex = i % TASKS.length;
      cleared = false;
      q('#bp-task').innerHTML = `<b>${TASKS[taskIndex]}</b> を2進数で作ってみてください`;
      render();
    }

    cells.forEach((c) => {
      c.addEventListener('click', () => {
        const on = c.classList.toggle('on');
        c.classList.toggle('off', !on);
        c.setAttribute('aria-pressed', String(on));
        c.querySelector('.bit-b').textContent = on ? '1' : '0';
        render();
      });
    });

    q('#bp-clear').addEventListener('click', () => {
      cells.forEach((c) => {
        c.classList.remove('on');
        c.classList.add('off');
        c.setAttribute('aria-pressed', 'false');
        c.querySelector('.bit-b').textContent = '0';
      });
      render();
    });

    q('#bp-next').addEventListener('click', () => setTask(taskIndex + 1));

    setTask(0);
    return null; // タイマーを持たないので後始末は不要
  },
};

const VISUALS = {
  // --- 2進数 ---
  'bits-play': bitsPlay,
  'lamp-switch': () => lampRow('10110'),
  'dec-347': () => decimalBreak(347),
  'ladder-2x': () =>
    ladder([1, 2, 4, 8, 16, 32, 64, 128], { note: '左へ1桁ごとに2倍' }),
  'bits-1011': () => bitRow('1011', { sum: true }),
  'bits-weights': () => bitRow('00000000'),

  // --- 伝送時間 ---
  'byte-bit': () => byteBit(),
  'pipe-80-20': () => pipe(80, 20),

  // --- 稼働率 ---
  'chain-serial': () => `
    <div class="chain">
      <div class="ch-node" style="--i:0">装置A</div>
      <div class="ch-link" style="--i:1"></div>
      <div class="ch-node" style="--i:2">装置B</div>
      <div class="ch-cap" style="--i:3">どちらか1つ止まれば、全体が止まる</div>
    </div>`,
  'chain-parallel': () => `
    <div class="chain parallel">
      <div class="ch-branch">
        <div class="ch-node" style="--i:0">装置A</div>
        <div class="ch-node" style="--i:1">装置B</div>
      </div>
      <div class="ch-cap" style="--i:2">どちらか1つ動いていれば、全体は動く</div>
    </div>`,
};

// 図のHTMLを返す。未定義なら空文字（本文だけが出る）。
export function visualHtml(name) {
  const fn = VISUALS[name];
  if (!fn) return '';
  const html = typeof fn === 'function' ? fn() : fn.html();
  return `<div class="lv" data-v="${name}">${html}</div>`;
}

// 図に動きを付ける。
// 触れる図（bits-play など）は mount を持ち、描画後に呼ぶ必要がある。
// 見るだけの図は mount を持たないので、ここは何もしない。
export function visualMount(name, root) {
  const fn = VISUALS[name];
  if (!fn || typeof fn === 'function' || !fn.mount) return null;
  return fn.mount(root) || null;
}

// 検証用：定義済みの図の名前一覧
export function visualNames() {
  return Object.keys(VISUALS);
}
