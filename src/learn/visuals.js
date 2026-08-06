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


// ネットワーク部とホスト部の区切り、そして予約席の2つ。
// 「なぜ2を引くのか」は文章だと流されるので、実際に2枠を潰して見せる。
function hostBits(prefix) {
  const hostBits = 32 - prefix;
  const total = Math.pow(2, hostBits);
  const usable = total - 2;

  // 32ビットを8個ずつ4段に分けると詰まって見えるので、割合の帯で表す
  const netPct = (prefix / 32) * 100;
  return `
    <div class="sbn">
      <div class="sbn-bar">
        <span class="sbn-net" style="width:${netPct}%">ネットワーク部</span>
        <span class="sbn-host" style="width:${100 - netPct}%">ホスト部</span>
      </div>
      <div class="sbn-calc">
        <div class="sbn-line" style="--i:0">
          <span class="sbn-k">ホスト部のビット数</span>
          <span class="sbn-v">32 − ${prefix} = ${hostBits}ビット</span>
        </div>
        <div class="sbn-line" style="--i:0">
          <span class="sbn-k">表せる数</span>
          <span class="sbn-v">2<sup>${hostBits}</sup> = ${total}</span>
        </div>
        <div class="sbn-line res" style="--i:1">
          <span class="sbn-k">予約席</span>
          <span class="sbn-v">
            <span class="sbn-chip">全部0<br><small>ネットワーク</small></span>
            <span class="sbn-chip">全部1<br><small>ブロードキャスト</small></span>
          </span>
        </div>
        <div class="sbn-line sum" style="--i:2">
          <span class="sbn-k">使える台数</span>
          <span class="sbn-v"><b>${total} − 2 = ${usable}台</b></span>
        </div>
      </div>
    </div>`;
}


// 加重平均を「100回のうち何回か」で見せる。
// 式（h×Tc + (1-h)×Tm）を先に出すと手が止まるので、まず点を数えさせる。
function cacheMix(hitPct, tc, tm) {
  const hits = hitPct;
  const misses = 100 - hits;
  const hitTotal = hits * tc;
  const missTotal = misses * tm;
  const avg = (hitTotal + missTotal) / 100;

  // 「100回のうち何回か」を1本の帯で見せる。
  // 100個のマス目でも試したが、最終行の個数が少ないとその行だけセルが広がり、
  // CSSで揃えるのに手こずった。帯なら1本なので崩れようがない。
  return `
    <div class="cachemix">
      <div class="cm-head">100回アクセスしたら…</div>
      <div class="cm-band">
        <span class="cm-hit" style="width:${hits}%">${hits}回</span>
        <span class="cm-miss" style="width:${misses}%">${misses}回</span>
      </div>
      <div class="cm-legend">
        <span><i class="cm-sw cm-sw-hit"></i>キャッシュで済んだ（${tc}ナノ秒）</span>
        <span><i class="cm-sw cm-sw-miss"></i>主記憶まで行った（${tm}ナノ秒）</span>
      </div>
      <div class="cm-calc">
        <div class="cm-line" style="--i:0">
          <span class="cm-k">当たり</span>
          <span class="cm-v">${hits} × ${tc} = ${hitTotal.toLocaleString('ja-JP')}</span>
        </div>
        <div class="cm-line" style="--i:1">
          <span class="cm-k">外れ</span>
          <span class="cm-v">${misses} × ${tm} = ${missTotal.toLocaleString('ja-JP')}</span>
        </div>
        <div class="cm-line sum" style="--i:2">
          <span class="cm-k">100回の平均</span>
          <span class="cm-v"><b>${(hitTotal + missTotal).toLocaleString('ja-JP')} ÷ 100 = ${avg}ナノ秒</b></span>
        </div>
      </div>
    </div>`;
}


// 利用率と待ち時間の関係。
// 「なだらかに増えるのではなく、あるところから跳ね上がる」を棒の高さで見せる。
// 数式の ρ/(1−ρ) を先に出しても意味が入らないので、まず形を見せる。
function queueRho(ts) {
  const points = [0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 0.95];
  const waits = points.map((r) => (ts * r) / (1 - r));
  const max = Math.max(...waits);

  const bars = points
    .map((r, i) => {
      const w = waits[i];
      const h = Math.max(4, Math.round((w / max) * 100));
      // 0.9以上は「跳ね上がった」ことが分かるよう色を変える
      const hot = r >= 0.9 ? ' hot' : '';
      return `
        <div class="qr-col${hot}" style="--i:${i};--h:${h}%">
          <div class="qr-wait">${Math.round(w)}</div>
          <div class="qr-bar"><span></span></div>
          <div class="qr-rho">${r}</div>
        </div>`;
    })
    .join('');

  return `
    <div class="queuerho">
      <div class="qr-head">サービス時間 ${ts}秒 のときの<b>待ち時間（秒）</b></div>
      <div class="qr-chart">${bars}</div>
      <div class="qr-foot">↑ 利用率 ρ（混み具合）</div>
      <div class="qr-note">
        0.5 → 0.8 では ${Math.round(waits[2])}秒 → ${Math.round(waits[4])}秒。
        <b>0.8 → 0.95 では ${Math.round(waits[4])}秒 → ${Math.round(waits[6])}秒。</b>
        同じ「0.15の増加」でも、伸び方がまるで違う。
      </div>
    </div>`;
}


// 損益分岐点。売上が伸びるにつれて、固定費の「穴」が埋まっていく様子。
// 交点を境に赤字→黒字に変わることを、色で分かるようにする。
function breakEven(fixed, marginRate) {
  const bep = fixed / marginRate;
  // 損益分岐点の手前・ちょうど・その先、の3点を並べる
  const points = [bep * 0.5, bep, bep * 1.5];
  const rows = points
    .map((sales, i) => {
      const margin = sales * marginRate; // 固定費に充てられる額
      const profit = margin - fixed;
      const fillPct = Math.min(100, (margin / fixed) * 100);
      const state = profit < 0 ? 'ng' : profit > 0 ? 'ok' : 'even';
      const label = profit < 0 ? '赤字' : profit > 0 ? '黒字' : 'ちょうど0';
      return `
        <div class="be-row" style="--i:${i}">
          <div class="be-sales">売上 ${Math.round(sales / 10000).toLocaleString('ja-JP')}万</div>
          <div class="be-track">
            <span class="be-fill ${state}" style="width:${fillPct}%"></span>
            <span class="be-goal">固定費 ${Math.round(fixed / 10000).toLocaleString('ja-JP')}万</span>
          </div>
          <div class="be-state ${state}">${label}</div>
        </div>`;
    })
    .join('');

  return `
    <div class="breakeven">
      <div class="be-head">売上の<b>${Math.round(marginRate * 100)}%</b>が固定費を埋めていく</div>
      ${rows}
      <div class="be-note">
        ちょうど埋まる売上が <b>${Math.round(bep / 10000).toLocaleString('ja-JP')}万円</b>
        ＝ 損益分岐点。ここを超えたぶんが利益になる。
      </div>
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

  // --- 損益分岐点 ---
  'breakeven': () => breakEven(3000000, 0.6),

  // --- 待ち行列 ---
  'queue-rho': () => queueRho(2),

  // --- キャッシュ ---
  'cache-mix': () => cacheMix(90, 10, 100),

  // --- サブネット ---
  'hostbits': () => hostBits(24),

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
