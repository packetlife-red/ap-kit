// サブネット・ビット可視化
//
// 狙い：プレフィクス長を動かすと32ビットのどこで線が引かれるかを目で見る。
// 「/26 は第4オクテットの上位2ビット」という感覚が付けば、
// ネットワークアドレスの計算は暗算でできるようになる。

export const subnetSim = {
  id: 'subnet',
  name: 'サブネット',
  drillId: 'subnet',

  html: `
    <p class="muted">
      プレフィクス長を動かすと、32ビットのどこでネットワーク部とホスト部が分かれるかが見える。
      オクテットの途中で切れる感覚をつかむのが目的。
    </p>
    <div class="ctrl">
      <label>
        <span>IPアドレス</span>
        <input type="text" id="snsim-ip" value="192.168.10.200"
               inputmode="decimal" spellcheck="false"
               style="font:inherit;padding:8px 10px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--text);width:100%">
        <span class="v" id="snsim-ipmsg"></span>
      </label>
      <label>
        <span>プレフィクス長</span>
        <input type="range" id="snsim-prefix" min="8" max="30" step="1" value="26">
        <span class="v" id="snsim-prefix-v">/26</span>
      </label>
    </div>
    <div class="sim-stage">
      <div id="snsim-bits" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:2.1;white-space:nowrap"></div>
    </div>
    <div class="readout">
      <div class="stat"><div class="k">サブネットマスク</div><div class="v" id="snsim-mask" style="font-size:15px">–</div></div>
      <div class="stat"><div class="k">ネットワークアドレス</div><div class="v" id="snsim-net" style="font-size:15px">–</div></div>
      <div class="stat"><div class="k">ブロードキャスト</div><div class="v" id="snsim-bc" style="font-size:15px">–</div></div>
      <div class="stat accent"><div class="k">収容ホスト数</div><div class="v" id="snsim-hosts">–</div></div>
    </div>
    <div class="row" style="margin-top:12px">
      <span class="spacer"></span>
      <button class="btn primary" data-drill="subnet">この分野の問題を解く</button>
    </div>
    <div class="note" id="snsim-note"></div>
  `,

  mount(root) {
    const $ = (s) => root.querySelector(s);

    const parseIp = (s) => {
      const m = String(s).trim().split('.');
      if (m.length !== 4) return null;
      const o = m.map((x) => Number(x));
      if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
      return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
    };
    const toIp = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
    const maskOf = (p) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);

    function render() {
      const prefix = Number($('#snsim-prefix').value);
      $('#snsim-prefix-v').textContent = '/' + prefix;

      const ip = parseIp($('#snsim-ip').value);
      if (ip === null) {
        $('#snsim-ipmsg').textContent = '形式が不正';
        return;
      }
      $('#snsim-ipmsg').textContent = '';

      const mask = maskOf(prefix);
      const net = (ip & mask) >>> 0;
      const size = Math.pow(2, 32 - prefix);
      const bc = (net + size - 1) >>> 0;
      const hosts = Math.max(0, size - 2);

      // ビット列を色分けして描く。オクテット区切りに空白を入れる。
      const bits = ip.toString(2).padStart(32, '0');
      let html = '';
      for (let i = 0; i < 32; i++) {
        if (i > 0 && i % 8 === 0) html += '<span style="opacity:.35"> . </span>';
        const isNet = i < prefix;
        const color = isNet ? 'var(--accent)' : 'var(--warn)';
        const weight = isNet ? '700' : '400';
        // プレフィクス境界に縦線を入れる
        const border =
          i === prefix ? 'border-left:2px solid var(--ng);margin-left:-1px;padding-left:2px;' : '';
        html += `<span style="color:${color};font-weight:${weight};${border}">${bits[i]}</span>`;
      }
      html +=
        `<div style="margin-top:6px;font-size:12px;font-family:inherit">` +
        `<span style="color:var(--accent);font-weight:700">■</span> ネットワーク部 ${prefix}ビット　` +
        `<span style="color:var(--warn);font-weight:700">■</span> ホスト部 ${32 - prefix}ビット</div>`;
      $('#snsim-bits').innerHTML = html;

      $('#snsim-mask').textContent = toIp(mask);
      $('#snsim-net').textContent = toIp(net);
      $('#snsim-bc').textContent = toIp(bc);
      $('#snsim-hosts').textContent = hosts.toLocaleString('ja-JP') + '台';

      $('#snsim-note').textContent =
        `このサブネットの範囲は ${toIp(net)} 〜 ${toIp(bc)}（全${size.toLocaleString('ja-JP')}個）。` +
        `先頭のネットワークアドレスと末尾のブロードキャストアドレスは使えないので、割り当てられるのは ${hosts.toLocaleString(
          'ja-JP'
        )} 台。`;
    }

    $('#snsim-prefix').addEventListener('input', render);
    $('#snsim-ip').addEventListener('input', render);
    render();

    return () => {};
  },
};
