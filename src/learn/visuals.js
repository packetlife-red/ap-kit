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

const VISUALS = {
  // --- 2進数 ---
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
  return `<div class="lv" data-v="${name}">${fn()}</div>`;
}

// 検証用：定義済みの図の名前一覧
export function visualNames() {
  return Object.keys(VISUALS);
}
