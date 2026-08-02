// 待ち行列シミュレータ（M/M/1）
//
// 狙い：ρが1に近づくと待ち時間が「急に」爆発することを体感させる。
// 公式 Tw=ρ/(1−ρ)·Ts を暗記しても、この非線形さは実感しにくい。
// 実測値と理論値を並べて出すことで、公式が現実の挙動と一致することも同時に見せる。

export const queueSim = {
  id: 'queue',
  name: '待ち行列',
  drillId: 'queue', // 「この分野を解く」の飛び先

  html: `
    <p class="muted">
      窓口が1つの行列（M/M/1）。客はランダムに到着し、処理時間もばらつく。
      利用率 ρ を上げていくと、待ち時間がどう変わるかを見る。
    </p>
    <div class="sim-stage">
      <svg id="qsim-canvas" viewBox="0 0 600 130" style="width:100%;min-width:360px;height:auto">
        <g id="qsim-queue"></g>
        <rect x="470" y="40" width="70" height="50" rx="8" fill="none" stroke="currentColor" stroke-width="2"/>
        <text x="505" y="70" text-anchor="middle" font-size="13" fill="currentColor">窓口</text>
        <circle id="qsim-serving" cx="505" cy="65" r="11" fill="#2f6fd0" opacity="0"/>
        <text x="20" y="110" font-size="12" fill="currentColor" opacity="0.6">← 待っている客</text>
      </svg>
    </div>
    <div class="ctrl">
      <label>
        <span>到着の多さ ρ</span>
        <input type="range" id="qsim-rho" min="10" max="95" step="5" value="50">
        <span class="v" id="qsim-rho-v">0.50</span>
      </label>
      <label>
        <span>再生速度</span>
        <input type="range" id="qsim-speed" min="1" max="80" step="1" value="30">
        <span class="v" id="qsim-speed-v">×30</span>
      </label>
    </div>
    <div class="readout">
      <div class="stat"><div class="k">行列の長さ</div><div class="v" id="qsim-len">0</div></div>
      <div class="stat"><div class="k">平均待ち時間（実測）</div><div class="v" id="qsim-measured">–</div></div>
      <div class="stat accent"><div class="k">平均待ち時間（理論値）</div><div class="v" id="qsim-theory">–</div></div>
      <div class="stat"><div class="k">処理した客</div><div class="v" id="qsim-done">0</div></div>
    </div>
    <div class="row" style="margin-top:12px">
      <button class="btn" id="qsim-reset">統計をリセット</button>
      <span class="spacer"></span>
      <button class="btn primary" data-drill="queue">この分野の問題を解く</button>
    </div>
    <div class="note" id="qsim-note"></div>
  `,

  mount(root) {
    const $ = (s) => root.querySelector(s);

    const TS = 1.0; // 平均サービス時間（秒・シミュレーション内時間）
    let rho = 0.5;
    // 既定は×30。等倍だと実測平均が出るまで（20人処理）に数十秒かかって
    // 「動いていない」ように見えるため、最初から実測値が出る速さにしておく。
    let speed = 30;

    let queue = []; // 待っている客の到着時刻
    let serving = null; // { finishAt }
    let now = 0;
    let nextArrival = 0;
    let doneCount = 0;
    let waitSum = 0;
    let raf = null; // setInterval のハンドル

    // 指数分布に従う乱数（M/M/1の到着間隔・サービス時間はこれ）
    const expRand = (mean) => -Math.log(1 - Math.random()) * mean;

    function reset(keepParams) {
      queue = [];
      serving = null;
      now = 0;
      nextArrival = expRand(TS / rho);
      doneCount = 0;
      waitSum = 0;
      if (!keepParams) render();
    }

    function stepSim(dt) {
      // dt 秒ぶん進める。イベントは順に処理する。
      let remaining = dt;
      while (remaining > 0) {
        const tArrival = nextArrival - now;
        const tFinish = serving ? serving.finishAt - now : Infinity;
        const tNext = Math.min(tArrival, tFinish, remaining);

        now += tNext;
        remaining -= tNext;

        if (serving && now >= serving.finishAt - 1e-9) {
          waitSum += serving.waited;
          doneCount++;
          serving = null;
        }
        if (now >= nextArrival - 1e-9) {
          queue.push(now);
          nextArrival = now + expRand(TS / rho);
        }
        // 窓口が空いていれば次の客を取る
        if (!serving && queue.length) {
          const arrivedAt = queue.shift();
          serving = { finishAt: now + expRand(TS), waited: now - arrivedAt };
        }
        if (tNext === 0 && remaining > 0) {
          // 同時刻イベントの処理が終わったら次へ（無限ループ防止）
          if (tArrival > 0 && tFinish > 0) break;
        }
      }
    }

    function theory() {
      return (rho / (1 - rho)) * TS;
    }

    function render() {
      // 行列の描画（最大18人まで。それ以上は「+N」で示す）
      const g = $('#qsim-queue');
      const shown = Math.min(queue.length, 18);
      let s = '';
      for (let i = 0; i < shown; i++) {
        const x = 440 - i * 24;
        s += `<circle cx="${x}" cy="65" r="9" fill="currentColor" opacity="0.55"/>`;
      }
      if (queue.length > shown) {
        s += `<text x="${440 - shown * 24 - 14}" y="70" text-anchor="end" font-size="13" fill="currentColor">+${
          queue.length - shown
        }</text>`;
      }
      g.innerHTML = s;
      $('#qsim-serving').setAttribute('opacity', serving ? '1' : '0');

      $('#qsim-len').textContent = String(queue.length);
      $('#qsim-done').textContent = String(doneCount);
      $('#qsim-theory').textContent = theory().toFixed(2) + '秒';
      // 実測は数がたまるまで出さない（少数だと理論値から大きくずれて誤解を生む）
      $('#qsim-measured').textContent =
        doneCount >= 20 ? (waitSum / doneCount).toFixed(2) + '秒' : '計測中…';

      const t = theory();
      let msg =
        `ρ=${rho.toFixed(2)} では、待ち時間は処理時間の ${(rho / (1 - rho)).toFixed(2)} 倍（${t.toFixed(2)}秒）。`;
      if (rho >= 0.85) {
        // 実測が理論値へ収束するのに時間がかかる領域。
        // 「値が合わない＝バグ」と誤解されないよう、性質として説明しておく。
        msg +=
          ' ρが0.9に近づくと待ち時間が急激に伸びる。これが「混雑すると急に遅くなる」正体。' +
          'この領域は待ち時間のばらつきも大きく、実測値が理論値に近づくまでかなりの客数を要する。';
      } else {
        msg += ' ρを0.9以上に上げてみると、待ち時間の伸び方が急になるのが分かる。';
      }
      $('#qsim-note').textContent = msg;
    }

    // requestAnimationFrame ではなく setInterval で回す。
    // rAF はタブが裏に回ると停止し、戻ってきたときに一気に時間が飛ぶ。
    // ここでは「一定間隔で少しずつ進める」ほうが挙動が素直で、裏に回しても破綻しない。
    const TICK_MS = 50;

    function loop() {
      const dtReal = TICK_MS / 1000;
      stepSim(dtReal * speed);
      render();
    }

    $('#qsim-rho').addEventListener('input', (e) => {
      rho = Number(e.target.value) / 100;
      $('#qsim-rho-v').textContent = rho.toFixed(2);
      // ρを変えたら実測値は意味を失うのでリセットする
      reset(true);
      render();
    });
    $('#qsim-speed').addEventListener('input', (e) => {
      speed = Number(e.target.value);
      $('#qsim-speed-v').textContent = '×' + speed;
    });
    $('#qsim-reset').addEventListener('click', () => reset());

    reset();
    raf = setInterval(loop, TICK_MS);

    // シミュレータを切り替えたら必ず止める（放置すると裏で回り続ける）
    return () => {
      if (raf) clearInterval(raf);
      raf = null;
    };
  },
};
