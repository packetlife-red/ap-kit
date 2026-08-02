// シミュレータの登録と切り替え。
// 表示中のものだけ mount し、切り替え時に unmount する
// （待ち行列は requestAnimationFrame を回し続けるため、放置すると電池を食う）。

import { queueSim } from './queue.js';
import { subnetSim } from './subnet.js';
import { pageSim } from './page.js';

const SIMS = [queueSim, subnetSim, pageSim];

export function mountSimulators() {
  const nav = document.querySelector('#sim-nav');
  const host = document.querySelector('#sim-host');
  if (!nav || !host) return;

  let unmount = null;
  let currentId = null;

  function show(id) {
    if (currentId === id) return;
    if (unmount) {
      unmount();
      unmount = null;
    }
    const sim = SIMS.find((s) => s.id === id) || SIMS[0];
    currentId = sim.id;

    Array.from(nav.children).forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.sim === sim.id))
    );

    host.innerHTML = sim.html;

    // 「この分野の問題を解く」ボタンはドリルタブへの遷移イベントを投げる
    host.querySelectorAll('[data-drill]').forEach((b) => {
      b.addEventListener('click', () => {
        window.dispatchEvent(
          new CustomEvent('ap:drill', { detail: { genId: b.dataset.drill } })
        );
      });
    });

    unmount = sim.mount(host) || null;
  }

  nav.innerHTML = '';
  for (const s of SIMS) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.sim = s.id;
    b.textContent = s.name;
    b.addEventListener('click', () => show(s.id));
    nav.appendChild(b);
  }

  show(SIMS[0].id);
}
