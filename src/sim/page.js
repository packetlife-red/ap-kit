// ページ置換アルゴリズムの比較（FIFO / LRU / OPT）
//
// 狙い：同じ参照列に対して3方式を横並びで動かし、フォールト数の差を目で見る。
// OPT（最適・未来を知っている前提）が理論上の下限であること、
// LRUがそれにどれだけ近いかが分かると、キャッシュ設計の話が腑に落ちる。

export const pageSim = {
  id: 'page',
  name: 'ページ置換',
  drillId: null, // 対応するドリル分野は今回のスコープ外（拡張候補）

  html: `
    <p class="muted">
      同じ参照列を FIFO・LRU・OPT の3方式に流し、ページフォールトの起き方を比べる。
      OPT は「未来の参照を知っている」理想の方式で、これ以上は減らせないという下限を示す。
    </p>
    <div class="ctrl">
      <label>
        <span>フレーム数</span>
        <input type="range" id="pgsim-frames" min="2" max="5" step="1" value="3">
        <span class="v" id="pgsim-frames-v">3</span>
      </label>
      <label>
        <span>参照列</span>
        <input type="text" id="pgsim-seq" value="7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1"
               inputmode="numeric" spellcheck="false"
               style="font:inherit;padding:8px 10px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--text);width:100%">
        <span class="v"><button class="btn" id="pgsim-rand" style="padding:4px 10px;font-size:13px">ランダム</button></span>
      </label>
    </div>
    <div class="row" style="margin-top:4px">
      <button class="btn" id="pgsim-prev">◀ 戻る</button>
      <button class="btn primary" id="pgsim-play">▶ 再生</button>
      <button class="btn" id="pgsim-next">進む ▶</button>
      <button class="btn" id="pgsim-reset">最初から</button>
      <span class="muted" id="pgsim-pos"></span>
    </div>
    <div class="sim-stage" id="pgsim-stage"></div>
    <div class="readout" id="pgsim-readout"></div>
    <div class="note" id="pgsim-note"></div>
  `,

  mount(root) {
    const $ = (s) => root.querySelector(s);

    let seq = [];
    let frames = 3;
    let step = 0; // 何個目まで処理したか
    let timer = null;

    // --- 各アルゴリズムを step 個目まで実行した状態を返す（純関数） -----
    //
    // 毎回最初から計算し直している。参照列はせいぜい数十個なので速度は問題なく、
    // 「戻る」を実装するときに履歴を持たなくて済むぶん確実。
    function simulate(algo, upto) {
      const mem = []; // フレームの中身
      const meta = []; // FIFO: 入った順、LRU: 最終参照時刻
      let faults = 0;
      let lastEvicted = null;
      let lastFault = false;

      for (let t = 0; t < upto; t++) {
        const page = seq[t];
        const hit = mem.indexOf(page) >= 0;
        lastFault = !hit;
        lastEvicted = null;

        if (hit) {
          if (algo === 'LRU') meta[mem.indexOf(page)] = t;
          continue;
        }

        faults++;

        if (mem.length < frames) {
          mem.push(page);
          meta.push(t);
          continue;
        }

        let victim = 0;
        if (algo === 'FIFO' || algo === 'LRU') {
          // FIFO: 入った時刻が最小 / LRU: 最終参照が最小
          for (let i = 1; i < mem.length; i++) if (meta[i] < meta[victim]) victim = i;
        } else {
          // OPT: 次に使われるのが最も先（または二度と使われない）ページを追い出す
          let farthest = -1;
          for (let i = 0; i < mem.length; i++) {
            let nextUse = Infinity;
            for (let k = t + 1; k < seq.length; k++) {
              if (seq[k] === mem[i]) {
                nextUse = k;
                break;
              }
            }
            if (nextUse > farthest) {
              farthest = nextUse;
              victim = i;
            }
          }
        }

        lastEvicted = mem[victim];
        mem[victim] = page;
        meta[victim] = t;
      }

      return { mem: mem.slice(), faults, lastEvicted, lastFault };
    }

    const ALGOS = [
      { id: 'FIFO', label: 'FIFO（入った順に追い出す）' },
      { id: 'LRU', label: 'LRU（最後に使ったのが古い順）' },
      { id: 'OPT', label: 'OPT（最適・未来を知っている）' },
    ];

    function render() {
      $('#pgsim-frames-v').textContent = String(frames);
      $('#pgsim-pos').textContent = `${step} / ${seq.length} 件目まで`;

      // 参照列の表示（現在位置を強調）
      let seqHtml =
        '<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;margin-bottom:12px;white-space:nowrap">';
      seq.forEach((p, i) => {
        const isCur = i === step - 1;
        const done = i < step;
        seqHtml +=
          `<span style="display:inline-block;width:26px;text-align:center;border-radius:4px;` +
          (isCur
            ? 'background:var(--accent);color:#fff;font-weight:700;'
            : done
            ? 'opacity:.45;'
            : 'opacity:.85;') +
          `">${p}</span>`;
      });
      seqHtml += '</div>';

      let body = seqHtml;
      const results = {};

      for (const a of ALGOS) {
        const r = simulate(a.id, step);
        results[a.id] = r;

        const cells = [];
        for (let i = 0; i < frames; i++) {
          const v = r.mem[i];
          const filled = v !== undefined;
          cells.push(
            `<div style="width:44px;height:38px;border-radius:6px;display:grid;place-items:center;` +
              `font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700;` +
              `border:1px solid var(--line);background:${filled ? 'var(--panel)' : 'transparent'};` +
              `color:${filled ? 'var(--text)' : 'var(--muted)'}">${filled ? v : '·'}</div>`
          );
        }

        body +=
          `<div style="margin-bottom:14px">` +
          `<div style="font-size:13px;color:var(--muted);margin-bottom:5px">${a.label}` +
          (step > 0 && r.lastFault
            ? ` <span style="color:var(--ng);font-weight:700">フォールト</span>` +
              (r.lastEvicted !== null && r.lastEvicted !== undefined
                ? `<span style="color:var(--muted)">（${r.lastEvicted} を追い出し）</span>`
                : '')
            : step > 0
            ? ` <span style="color:var(--ok);font-weight:700">ヒット</span>`
            : '') +
          `</div>` +
          `<div style="display:flex;gap:6px">${cells.join('')}</div>` +
          `</div>`;
      }

      $('#pgsim-stage').innerHTML = body;

      $('#pgsim-readout').innerHTML = ALGOS.map((a) => {
        const f = results[a.id].faults;
        const isBest = f === Math.min(...ALGOS.map((x) => results[x.id].faults));
        return (
          `<div class="stat${isBest ? ' accent' : ''}">` +
          `<div class="k">${a.id} のフォールト数</div><div class="v">${f}</div></div>`
        );
      }).join('');

      const fifo = results.FIFO.faults;
      const lru = results.LRU.faults;
      const opt = results.OPT.faults;
      $('#pgsim-note').textContent =
        step < seq.length
          ? '「進む」で1件ずつ、「再生」で自動的に進む。フレームが埋まったあとの追い出し方の違いに注目。'
          : `最後まで実行：FIFO ${fifo}回、LRU ${lru}回、OPT ${opt}回。` +
            `OPTは未来を知っている前提なので実装できないが、「これ以上は減らせない」下限を示す。` +
            (lru <= fifo
              ? ' LRUは直近の使用履歴を使う分、FIFOより賢く振る舞うことが多い。'
              : ' この参照列ではFIFOのほうが良い結果になった。LRUが常に勝つとは限らない。');
    }

    function setSeq(text) {
      const parsed = String(text)
        .split(/[^0-9]+/)
        .filter((s) => s !== '')
        .map(Number)
        .slice(0, 30);
      seq = parsed.length ? parsed : [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
      step = 0;
      stop();
      render();
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      $('#pgsim-play').textContent = '▶ 再生';
    }

    $('#pgsim-frames').addEventListener('input', (e) => {
      frames = Number(e.target.value);
      step = 0;
      stop();
      render();
    });
    $('#pgsim-seq').addEventListener('input', (e) => setSeq(e.target.value));
    $('#pgsim-rand').addEventListener('click', () => {
      const n = 20;
      const out = [];
      for (let i = 0; i < n; i++) out.push(Math.floor(Math.random() * 6));
      $('#pgsim-seq').value = out.join(' ');
      setSeq(out.join(' '));
    });
    $('#pgsim-next').addEventListener('click', () => {
      if (step < seq.length) step++;
      stop();
      render();
    });
    $('#pgsim-prev').addEventListener('click', () => {
      if (step > 0) step--;
      stop();
      render();
    });
    $('#pgsim-reset').addEventListener('click', () => {
      step = 0;
      stop();
      render();
    });
    $('#pgsim-play').addEventListener('click', () => {
      if (timer) {
        stop();
        return;
      }
      if (step >= seq.length) step = 0;
      $('#pgsim-play').textContent = '❚❚ 停止';
      timer = setInterval(() => {
        if (step >= seq.length) {
          stop();
          render();
          return;
        }
        step++;
        render();
      }, 700);
    });

    setSeq($('#pgsim-seq').value);

    return () => stop();
  },
};
