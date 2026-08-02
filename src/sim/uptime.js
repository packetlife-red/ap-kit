// 稼働率シミュレータ。
//
// ねらいは「なぜその式なのかが納得できない」を解くこと。
// 公式を見せる前に、**実際に何台が生き残るかを数える**。
//
//   直列の掛け算  … 100台のうちAが生きた台数のうち、さらにBも生きた台数 → 掛け算そのもの
//   並列の余事象  … 全部壊れた台数を数えて、残りが生きている台数 → 1から引く意味
//
// スライダーで数字を動かすと即座に台数が変わるので、
// 「予想 → 実際 → ズレ」を何度も繰り返せる。ここが腹落ちの入口。

import { fmtNum, fmtPct } from '../core/genkit.js';

const N = 100; // 並べる装置の数。100だと「％＝台数」で読めるので直感的

// 1年 = 8760時間。稼働率を「年間何時間止まるか」に翻訳するために使う。
const HOURS_PER_YEAR = 8760;

export const uptimeSim = {
  id: 'uptime',
  name: '稼働率',

  html: `
    <p class="muted">
      装置を100台ぶん並べて、実際に何台が動いているかを数えます。<br>
      <b>式を覚える前に、なぜその式になるのかを目で確かめてください。</b>
    </p>

    <div class="ctrl">
      <label>
        つなぎ方
        <span class="seg" id="up-mode">
          <button type="button" class="chip" data-mode="serial" aria-pressed="true">直列（全部必要）</button>
          <button type="button" class="chip" data-mode="parallel" aria-pressed="false">並列（1つでOK）</button>
        </span>
        <span class="v"></span>
      </label>
      <label>
        1台の稼働率
        <input type="range" id="up-a" min="50" max="99" step="1" value="90">
        <span class="v" id="up-a-v">0.90</span>
      </label>
      <label>
        つなぐ台数
        <input type="range" id="up-n" min="2" max="5" step="1" value="2">
        <span class="v" id="up-n-v">2台</span>
      </label>
    </div>

    <div class="sim-stage">
      <div id="up-grid" class="up-grid" aria-label="100台のシステムの状態"></div>
      <div class="up-legend">
        <span><i class="sw ok"></i>動いている</span>
        <span><i class="sw ng"></i>止まっている</span>
      </div>
    </div>

    <div class="readout">
      <div class="stat"><div class="k">動いているシステム</div><div class="v" id="up-alive">—</div></div>
      <div class="stat accent"><div class="k">システム全体の稼働率</div><div class="v" id="up-rate">—</div></div>
      <div class="stat"><div class="k">1年で止まる時間</div><div class="v" id="up-down">—</div></div>
    </div>

    <div class="up-why" id="up-why"></div>

    <div class="row" style="margin-top:14px">
      <button class="btn" id="up-reroll">もう一度ふり直す</button>
      <span class="spacer"></span>
      <button class="btn primary" data-drill="reliability">この分野の問題を解く</button>
    </div>
  `,

  mount(host) {
    const $ = (s) => host.querySelector(s);
    const grid = $('#up-grid');
    const aEl = $('#up-a');
    const nEl = $('#up-n');

    let mode = 'serial';
    // 各システム(100個)が持つ、装置ごとの「生きているか」の判定結果。
    // スライダーを動かすたびに引き直すと画面がチカチカするので、
    // 0〜1の乱数を保持しておき、しきい値との比較だけを更新する。
    let rolls = [];

    function reroll() {
      const maxN = Number(nEl.max);
      rolls = [];
      for (let i = 0; i < N; i++) {
        const row = [];
        for (let k = 0; k < maxN; k++) row.push(Math.random());
        rolls.push(row);
      }
    }

    // 100個のセルを1度だけ作る（毎回作り直すとスライダー操作が重い）
    const cells = [];
    for (let i = 0; i < N; i++) {
      const c = document.createElement('i');
      c.className = 'up-cell';
      grid.appendChild(c);
      cells.push(c);
    }

    function render() {
      const a = Number(aEl.value) / 100;
      const n = Number(nEl.value);

      $('#up-a-v').textContent = fmtNum(a, 2);
      $('#up-n-v').textContent = `${n}台`;

      // 実際に数える。ここが本体。
      let alive = 0;
      for (let i = 0; i < N; i++) {
        const devices = rolls[i].slice(0, n).map((r) => r < a); // true = その装置は動いている
        const ok =
          mode === 'serial'
            ? devices.every((d) => d) // 直列：全部動いていること
            : devices.some((d) => d); // 並列：1つでも動いていること
        if (ok) alive++;
        cells[i].className = 'up-cell ' + (ok ? 'ok' : 'ng');
      }

      const theory =
        mode === 'serial' ? Math.pow(a, n) : 1 - Math.pow(1 - a, n);
      const downH = (1 - theory) * HOURS_PER_YEAR;

      $('#up-alive').textContent = `${alive} / ${N}`;
      $('#up-rate').textContent = fmtNum(theory, 4);
      $('#up-down').textContent = fmtDown(downH);
      $('#up-why').innerHTML = explainHtml(mode, a, n, theory, alive);
    }

    // 「1年で止まる時間」は単位を変えたほうが実感が湧く。
    // 0.9999 を「52分」と読み替えられて初めて、桁の違いが体に入る。
    function fmtDown(h) {
      if (h >= 24) return `${fmtNum(h / 24, 1)}日（${Math.round(h)}時間）`;
      if (h >= 1) return `${fmtNum(h, 1)}時間`;
      return `${Math.round(h * 60)}分`;
    }

    function explainHtml(m, a, n, theory, alive) {
      const pct = Math.round(a * 100);
      if (m === 'serial') {
        // 掛け算を「段階的に絞り込む」話として見せる。
        const steps = [];
        let remain = N;
        for (let k = 1; k <= n; k++) {
          const next = remain * a;
          steps.push(
            `　${k}台目まで見て、まだ全部動いている：${fmtNum(remain, 1)}台 × ${fmtNum(a, 2)} = <b>${fmtNum(next, 1)}台</b>`
          );
          remain = next;
        }
        return `
          <h4>なぜ掛け算なのか</h4>
          <p>
            100台のシステムから始めます。1台目の装置が動いているのは、そのうち約${pct}台。<br>
            <b>その${pct}台の中から</b>、さらに2台目も動いているものを数える——これが「${pct}%のさらに${pct}%」、つまり掛け算です。
          </p>
          <div class="up-calc">${steps.join('<br>')}</div>
          <p>
            計算では <b>${fmtNum(theory * N, 1)}台</b>、実際に数えたら <b>${alive}台</b>。
            ふり直すたびに多少ずれますが、だいたい一致します。<br>
            <b>絞り込むたびに減る。</b>だから直列はつなぐほど弱くなります。
          </p>`;
      }
      const allFail = Math.pow(1 - a, n);
      return `
        <h4>なぜ「1から引く」のか</h4>
        <p>
          並列は「1台でも動いていればOK」。正面から数えると、1台だけ動く場合・2台動く場合…と全部足すことになって大変です。<br>
          <b>そこで裏返します。</b>止まるのは<b>全部が同時に壊れたとき、そのときだけ</b>。
        </p>
        <div class="up-calc">
          　1台が壊れている確率：1 − ${fmtNum(a, 2)} = <b>${fmtNum(1 - a, 2)}</b><br>
          　${n}台とも壊れる：${Array(n).fill(fmtNum(1 - a, 2)).join(' × ')} = <b>${fmtNum(allFail, 5)}</b><br>
          　100台のうち全滅するのは <b>${fmtNum(allFail * N, 2)}台</b>だけ
        </div>
        <p>
          残りは全部動いているので、<b>1 − ${fmtNum(allFail, 5)} = ${fmtNum(theory, 4)}</b>。<br>
          実際に数えたら <b>${alive}台</b>が動いていました。
          1台だと${pct}%しか動かないのに、${n}台並べるだけで<b>${fmtPct(theory, 1)}</b>まで上がります。
        </p>`;
    }

    // --- イベント ---
    host.querySelectorAll('#up-mode .chip').forEach((b) => {
      b.addEventListener('click', () => {
        mode = b.dataset.mode;
        host.querySelectorAll('#up-mode .chip').forEach((x) =>
          x.setAttribute('aria-pressed', String(x.dataset.mode === mode))
        );
        render();
      });
    });

    aEl.addEventListener('input', render);
    nEl.addEventListener('input', render);
    $('#up-reroll').addEventListener('click', () => {
      reroll();
      render();
    });

    reroll();
    render();

    // このシミュレータはタイマーを持たないので、後始末は不要
    return null;
  },
};
