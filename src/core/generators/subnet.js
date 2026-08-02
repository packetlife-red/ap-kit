// サブネッティング（CIDR）
// 落とし穴：収容ホスト数で「−2」（ネットワークアドレスとブロードキャスト）を忘れる、
// ブロードキャストアドレスの計算、プレフィクス長とサブネットマスクの往復。

import { register, step, fmtNum } from '../genkit.js';

register({
  id: 'subnet',
  name: 'サブネット・CIDR',
  category: 'テクノロジ系',
  tags: ['サブネット', 'CIDR', 'IPアドレス', 'ブロードキャスト'],
  simId: 'subnet', // 対応するシミュレータ

  gen(rng) {
    return rng.pick([genHosts, genNetworkAddr, genBroadcast, genMask])(rng);
  },
});

// --- IPアドレスのユーティリティ（32bit整数として扱う） -------------------

function ipToInt(o) {
  return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
}

function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function maskInt(prefix) {
  // prefix=0 のとき 32bitシフトは未定義なので分岐する
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

function maskToDotted(prefix) {
  return intToIp(maskInt(prefix));
}

// プライベートアドレス空間からランダムなアドレスを作る。
// prefixに対して「ホスト部が0でない」＝ネットワークアドレスそのものにならないようにする。
function randomHost(rng, prefix) {
  const base = rng.pick([
    ipToInt([192, 168, rng.int(0, 255), 0]),
    ipToInt([172, rng.int(16, 31), rng.int(0, 255), 0]),
    ipToInt([10, rng.int(0, 255), rng.int(0, 255), 0]),
  ]);
  const hostBits = 32 - prefix;
  const size = Math.pow(2, hostBits);
  const network = (base & maskInt(prefix)) >>> 0;
  // ホスト部は 1 〜 size-2 の範囲（ネットワーク／ブロードキャストを避ける）
  const offset = rng.int(1, Math.max(1, size - 2));
  return (network + offset) >>> 0;
}

// --- 収容ホスト数 -------------------------------------------------------
function genHosts(rng) {
  const prefix = rng.int(20, 30);
  const hostBits = 32 - prefix;

  const answer = Math.pow(2, hostBits) - 2;
  const noMinus2 = Math.pow(2, hostBits); // −2を忘れる
  const minus1 = Math.pow(2, hostBits) - 1; // −1しかしない
  const netBits = Math.pow(2, prefix % 8 === 0 ? 8 : 8 - (prefix % 8)); // ネットワーク部で数える
  const half = Math.pow(2, hostBits - 1) - 2;

  return {
    question:
      `サブネットマスクが /${prefix}（${maskToDotted(prefix)}）のネットワークがある。\n` +
      `このサブネットに割り当てられるホストは最大何台か。`,
    hint: 'ホスト部のビット数から2のべき乗を出し、使えない2つを引く。',
    answer,
    distractors: [
      { value: noMinus2, why: 'ネットワークアドレスとブロードキャストアドレスの2つを引いていない。' },
      { value: minus1, why: '1つしか引いていない。使えないのはネットワークとブロードキャストの2つ。' },
      { value: half, why: 'ホスト部のビット数を1つ少なく数えている。32−プレフィクス長で計算する。' },
      { value: netBits, why: 'ネットワーク部側のビットで数えている。ホスト数はホスト部のビット数で決まる。' },
    ],
    format: (v) => `${fmtNum(v, 0)}台`,
    steps: [
      step('ホスト部のビット数', `32 − ${prefix}`, hostBits, 'ビット'),
      step('アドレスの総数', `2^${hostBits}`, Math.pow(2, hostBits), '個'),
      step('使えない2つを引く', `${Math.pow(2, hostBits)} − 2`, answer, '台'),
    ],
    note:
      'ネットワークアドレス（ホスト部が全0）とブロードキャストアドレス（全1）はホストに割り当てられない。' +
      'この「−2」が最頻出の落とし穴。',
  };
}

// --- ネットワークアドレス -----------------------------------------------
function genNetworkAddr(rng) {
  // /24 は計算せずに答えが見えてしまうので避ける
  const prefix = rng.pick([20, 21, 22, 23, 25, 26, 27, 28, 29]);
  const ip = randomHost(rng, prefix);
  const mask = maskInt(prefix);

  const network = (ip & mask) >>> 0;
  const broadcast = (network + Math.pow(2, 32 - prefix) - 1) >>> 0;

  const answer = intToIp(network);
  const asBroadcast = intToIp(broadcast);
  const asIs = intToIp(ip);
  // 典型ミス：オクテット境界（/24）で切ってしまう。
  // ネットワークアドレスが .0 で終わる場合は正解と一致するので自動的に捨てられる。
  const at24 = intToIp((ip & maskInt(24)) >>> 0);
  const firstHost = intToIp((network + 1) >>> 0);
  const prevBroadcast = intToIp((network - 1) >>> 0); // 1つ手前のサブネットの末尾
  const lastHost = intToIp((broadcast - 1) >>> 0);

  return {
    question:
      `IPアドレス ${intToIp(ip)}/${prefix} が割り当てられたホストがある。\n` +
      `このホストが属するネットワークのネットワークアドレスはどれか。`,
    hint: 'IPアドレスとサブネットマスクのビットANDを取る。',
    answer,
    distractors: [
      { value: asBroadcast, why: 'ブロードキャストアドレス（ホスト部が全1）を答えている。' },
      { value: at24, why: '/24（オクテット境界）で区切っている。プレフィクス長どおりに区切る。' },
      { value: firstHost, why: '最初に使えるホストアドレスを答えている。ネットワークアドレスはその1つ前。' },
      { value: asIs, why: '与えられたIPアドレスをそのまま答えている。マスクとのANDが必要。' },
      { value: prevBroadcast, why: '1つ手前のサブネットのブロードキャストアドレス。区切りを1つ手前で取っている。' },
      { value: lastHost, why: '最後に使えるホストアドレスを答えている。これはサブネットの終端側。' },
    ],
    steps: [
      step('サブネットマスク', `/${prefix} = ${maskToDotted(prefix)}`, null),
      step('ホスト部のビット数', `32 − ${prefix}`, 32 - prefix, 'ビット'),
      step('IPとマスクのAND', `${intToIp(ip)} AND ${maskToDotted(prefix)}`, null),
      step('ネットワークアドレス', answer, null),
    ],
    note:
      `このサブネットの範囲は ${intToIp(network)} 〜 ${intToIp(broadcast)}。` +
      `境界がオクテットの途中に来るときほど間違えやすい。`,
  };
}

// --- ブロードキャストアドレス -------------------------------------------
function genBroadcast(rng) {
  const prefix = rng.pick([20, 21, 22, 26, 27, 28, 29]);
  const ip = randomHost(rng, prefix);
  const mask = maskInt(prefix);

  const network = (ip & mask) >>> 0;
  const size = Math.pow(2, 32 - prefix);
  const broadcast = (network + size - 1) >>> 0;

  const answer = intToIp(broadcast);
  const asNetwork = intToIp(network);
  const lastHost = intToIp((broadcast - 1) >>> 0);
  const nextNetwork = intToIp((broadcast + 1) >>> 0);
  // /24で切るミス。ブロードキャストが .255 で終わる場合は正解と一致するので自動的に捨てられる。
  const at24 = intToIp(((ip & maskInt(24)) + 255) >>> 0);
  const firstHost = intToIp((network + 1) >>> 0);
  const asIs = intToIp(ip);

  return {
    question:
      `IPアドレス ${intToIp(ip)}/${prefix} が割り当てられたホストがある。\n` +
      `このホストが属するサブネットのブロードキャストアドレスはどれか。`,
    hint: 'ネットワークアドレスを求めてから、ホスト部を全部1にする。',
    answer,
    distractors: [
      { value: lastHost, why: '最後に使えるホストアドレスを答えている。ブロードキャストはその1つ後。' },
      { value: nextNetwork, why: '次のサブネットの先頭を答えている。1つ行き過ぎている。' },
      { value: at24, why: '/24（オクテット境界）で区切っている。プレフィクス長どおりに区切る。' },
      { value: asNetwork, why: 'ネットワークアドレス（ホスト部が全0）を答えている。' },
      { value: firstHost, why: '最初に使えるホストアドレスを答えている。ブロードキャストは終端側。' },
      { value: asIs, why: '与えられたIPアドレスをそのまま答えている。ホスト部を全1にする必要がある。' },
    ],
    steps: [
      step('ネットワークアドレス', `${intToIp(ip)} AND ${maskToDotted(prefix)}`, null),
      step('　', asNetwork, null),
      step('サブネットのサイズ', `2^(32−${prefix})`, size, '個'),
      step('ブロードキャスト', `ネットワークアドレス + ${size} − 1`, null),
      step('　', answer, null),
    ],
    note: `使えるホストは ${intToIp((network + 1) >>> 0)} 〜 ${lastHost} の ${size - 2} 台。`,
  };
}

// --- 必要なプレフィクス長 -----------------------------------------------
function genMask(rng) {
  const needed = rng.pick([10, 20, 30, 50, 60, 100, 200, 300, 500, 1000]);

  // needed台を収容できる最小のホストビット数
  let hostBits = 1;
  while (Math.pow(2, hostBits) - 2 < needed) hostBits++;
  const prefix = 32 - hostBits;

  const answer = prefix;
  const oneOff = prefix + 1; // 1つ足りないプレフィクス
  const tooWide = prefix - 1; // 1つ大きすぎる
  const asHostBits = hostBits; // プレフィクス長とホストビット数を取り違える
  const twoOff = prefix + 2; // ホスト部が2ビット足りない
  // 注：「−2を忘れる」ミスは、切り上げの都合でほとんどの場合プレフィクス長が
  // 正解と同じになるため誤答として成立しない（2^n−2 と 2^n が同じnに落ちる）。

  return {
    question:
      `1つのサブネットに最大 ${needed} 台のホストを収容したい。\n` +
      `これを満たす最小のサブネット（＝最も大きいプレフィクス長）はどれか。`,
    hint: '2^ホストビット数 − 2 ≧ 必要台数 を満たす最小のホストビット数を探す。',
    answer,
    distractors: [
      { value: oneOff, why: `ホスト部が1ビット足りない。2^${hostBits - 1}−2＝${Math.pow(2, hostBits - 1) - 2}台では ${needed} 台に届かない。` },
      { value: tooWide, why: 'ホスト部を1ビット多く取っている。条件は満たすが「最小のサブネット」ではない。' },
      { value: asHostBits, why: `ホスト部のビット数（${hostBits}）を答えている。プレフィクス長は32からそれを引いた値。` },
      { value: twoOff, why: 'ホスト部が2ビット足りない。収容台数が4分の1になってしまう。' },
    ],
    format: (v) => `/${v}`,
    steps: [
      step('必要なホストビット数', `2^n − 2 ≧ ${needed} を満たす最小のn`, hostBits, 'ビット'),
      step('収容できる台数', `2^${hostBits} − 2`, Math.pow(2, hostBits) - 2, '台'),
      step('プレフィクス長', `32 − ${hostBits}`, answer),
    ],
    note:
      `/${prefix} なら ${Math.pow(2, hostBits) - 2} 台。` +
      `1つ小さい /${prefix + 1} だと ${Math.pow(2, hostBits - 1) - 2} 台で足りない。`,
  };
}
