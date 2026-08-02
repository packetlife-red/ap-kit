// 磁気ディスクのアクセス時間・RAIDの実効容量
// 落とし穴：回転待ち時間は「1回転の半分」（平均だから）。
// RAIDは方式ごとに「使える容量」と「壊れても平気な台数」が違う。

import { register, step, fmtNum } from '../genkit.js';
import { round } from '../rng.js';

register({
  id: 'disk',
  name: 'ディスクアクセス・RAID',
  category: 'テクノロジ系',
  tags: ['アクセス時間', '回転待ち', 'シーク', 'RAID'],

  gen(rng) {
    return rng.pick([genAccess, genRaidCapacity, genThroughput])(rng);
  },
});

// --- アクセス時間 -------------------------------------------------------
function genAccess(rng) {
  // 回転数から1回転の時間を出す。実機に近い値を使う。
  const rpm = rng.pick([3600, 4200, 5400, 7200, 10000, 15000]);
  const rotMs = round(60000 / rpm, 4); // 1回転（ミリ秒）
  const halfRot = round(rotMs / 2, 4); // 平均回転待ち

  const seek = rng.pick([3, 4, 5, 8, 10, 12]); // 平均シーク時間（ミリ秒）
  const blockKB = rng.pick([4, 8, 16, 32]); // 1ブロックのサイズ
  const transferRate = rng.pick([20, 40, 50, 80, 100]); // Mバイト/秒

  // 転送時間(ms) = ブロックサイズ(KB) / 転送速度(MB/s) → KB/(1000KB/ms相当)
  const transfer = round((blockKB / 1024 / transferRate) * 1000, 4);

  const answer = round(seek + halfRot + transfer, 4);

  const fullRot = round(seek + rotMs + transfer, 4); // 回転待ちを1回転ぶんにする
  const noRot = round(seek + transfer, 4); // 回転待ちを忘れる
  const noSeek = round(halfRot + transfer, 4); // シークを忘れる
  const noTransfer = round(seek + halfRot, 4); // 転送時間を忘れる

  return {
    question:
      `回転数 ${rpm.toLocaleString('ja-JP')} 回転/分、平均シーク時間 ${seek} ミリ秒の磁気ディスクがある。\n` +
      `データ転送速度は ${transferRate} Mバイト/秒で、${blockKB} Kバイトのブロックを1つ読み出す。\n` +
      `平均アクセス時間は何ミリ秒か。`,
    hint: 'アクセス時間 = シーク時間 + 平均回転待ち時間 + 転送時間。回転待ちは1回転の半分。',
    answer,
    distractors: [
      { value: fullRot, why: '回転待ちを1回転ぶんにしている。「平均」なので半回転で計算する。' },
      { value: noRot, why: '回転待ち時間が抜けている。目的のセクタが来るまで待つ時間が必要。' },
      { value: noSeek, why: 'シーク時間が抜けている。まず目的のトラックまでヘッドを動かす。' },
      { value: noTransfer, why: '転送時間が抜けている。データを読み出す時間もかかる。' },
    ],
    format: (v) => `${fmtNum(v, 3)}ミリ秒`,
    steps: [
      step('1回転の時間', `60000 / ${rpm}`, rotMs, 'ミリ秒'),
      step('平均回転待ち', `${fmtNum(rotMs, 3)} / 2`, halfRot, 'ミリ秒'),
      step('転送時間', `${blockKB}KB / ${transferRate}MB/s`, transfer, 'ミリ秒'),
      step('合計', `${seek} + ${fmtNum(halfRot, 3)} + ${fmtNum(transfer, 3)}`, answer, 'ミリ秒'),
    ],
    note:
      '回転待ちが「半分」なのは、目的のセクタがどこにあるかは運次第で、' +
      '平均すると半回転ぶん待つことになるから。ここを1回転で計算するのが最頻出のミス。',
  };
}

// --- RAIDの実効容量 -----------------------------------------------------
function genRaidCapacity(rng) {
  const level = rng.pick(['RAID0', 'RAID1', 'RAID5', 'RAID6', 'RAID10']);
  const diskTB = rng.pick([1, 2, 4, 6, 8]);

  // 方式ごとに必要な最小台数と、使える容量の割合が違う。
  // 台数は3台以上にする（n=2 だと n−2=0 や n/2=n−1 になり誤答が潰れる）。
  const spec = {
    RAID0: { n: rng.int(3, 6), usable: (n) => n, desc: 'ストライピング（冗長性なし）' },
    RAID1: { n: 2, usable: () => 1, desc: 'ミラーリング（同じ内容を2台に書く）' },
    RAID5: { n: rng.int(3, 6), usable: (n) => n - 1, desc: 'パリティを1台ぶん分散' },
    RAID6: { n: rng.int(4, 7), usable: (n) => n - 2, desc: 'パリティを2台ぶん分散' },
    RAID10: { n: rng.pick([4, 6, 8]), usable: (n) => n / 2, desc: 'ミラーリング＋ストライピング' },
  }[level];

  const n = spec.n;
  const usable = spec.usable(n);
  const answer = round(usable * diskTB, 4);

  // 「他の方式だと思って計算した値」を誤答にする。
  // RAID0 は全ディスクが使えるため「合計を答えるミス」が正解と一致してしまうので、
  // 各候補は正解と異なるものだけが buildChoices に採用される（重複は自動で捨てられる）。
  const allDisks = round(n * diskTB, 4); // 冗長性を考えない（RAID0の答え）
  const halfAll = round((n / 2) * diskTB, 4); // 全部ミラーだと思う（RAID10の答え）
  const minusTwo = round((n - 2) * diskTB, 4); // パリティ2台ぶん（RAID6の答え）
  const minusOne = round((n - 1) * diskTB, 4); // パリティ1台ぶん（RAID5の答え）
  const oneDisk = round(diskTB, 4); // ミラーだと思う（RAID1の答え）
  const doubled = round(n * diskTB * 2, 4); // 容量を二重に数える

  return {
    question:
      `容量 ${diskTB} Tバイトのディスク ${n} 台で ${level} を構成する。\n` +
      `実際にデータを格納できる容量は何Tバイトか。`,
    hint: `${level} は${spec.desc}。冗長性のために使われるぶんは差し引く。`,
    answer,
    distractors: [
      { value: allDisks, why: '全ディスクの合計を答えている。冗長性のために使われるぶんが引かれていない。' },
      { value: minusOne, why: 'パリティを1台ぶんとして計算している（RAID5の考え方）。方式ごとの冗長分を確認する。' },
      { value: minusTwo, why: 'パリティを2台ぶんとして計算している（RAID6の考え方）。方式ごとの冗長分を確認する。' },
      { value: halfAll, why: '全体をミラーリングとして半分にしている（RAID10の考え方）。方式ごとに割合が違う。' },
      { value: oneDisk, why: '1台ぶんしか使えないと考えている（RAID1の考え方）。方式ごとの冗長分を確認する。' },
      { value: doubled, why: '容量を二重に数えている。実効容量が総容量を超えることはない。' },
    ],
    format: (v) => `${fmtNum(v, 2)}Tバイト`,
    steps: [
      step('方式', `${level}：${spec.desc}`, null),
      step('使えるディスク数', `${n}台のうち`, spec.usable(n), '台ぶん'),
      step('実効容量', `${spec.usable(n)} × ${diskTB}`, answer, 'Tバイト'),
    ],
    note:
      'RAID0＝全部使えるが冗長性ゼロ、RAID1＝半分、RAID5＝1台ぶん減、' +
      'RAID6＝2台ぶん減、RAID10＝半分。「何台まで壊れても大丈夫か」とセットで覚える。',
  };
}

// --- 単位時間あたりの処理件数 -------------------------------------------
function genThroughput(rng) {
  const rpm = rng.pick([5400, 7200, 10000, 15000]);
  const rotMs = round(60000 / rpm, 4);
  const halfRot = round(rotMs / 2, 4);
  const seek = rng.pick([4, 5, 8, 10]);
  const transfer = rng.pick([0.5, 1, 2]);

  const accessMs = round(seek + halfRot + transfer, 4);
  const answer = round(1000 / accessMs, 4); // 1秒あたりの処理件数

  const perMinute = round(60000 / accessMs, 4); // 分あたりで答える
  const inverted = round(accessMs / 1000, 4); // 逆数を取り違える
  const noHalf = round(1000 / (seek + rotMs + transfer), 4); // 回転待ちを1回転に

  return {
    question:
      `回転数 ${rpm.toLocaleString('ja-JP')} 回転/分、平均シーク時間 ${seek} ミリ秒、` +
      `1回の転送時間 ${fmtNum(transfer, 1)} ミリ秒のディスクがある。\n` +
      `このディスクは1秒間に最大何回のアクセスを処理できるか。`,
    hint: 'まず1回のアクセスにかかる時間を出し、1000ミリ秒をそれで割る。',
    answer,
    distractors: [
      { value: perMinute, why: '1分あたりの回数を答えている。設問は1秒あたり。' },
      { value: noHalf, why: '回転待ちを1回転ぶんで計算している。平均は半回転。' },
      { value: inverted, why: '割る向きが逆。1回にかかる時間ではなく、1秒に何回できるかを聞かれている。' },
    ],
    format: (v) => `${fmtNum(v, 1)}回`,
    steps: [
      step('平均回転待ち', `60000 / ${rpm} / 2`, halfRot, 'ミリ秒'),
      step('1回のアクセス時間', `${seek} + ${fmtNum(halfRot, 3)} + ${fmtNum(transfer, 1)}`, accessMs, 'ミリ秒'),
      step('1秒あたりの回数', `1000 / ${fmtNum(accessMs, 3)}`, answer, '回'),
    ],
    note: '「1回にかかる時間」から「1秒に何回できるか」を出すには、1000ミリ秒をその時間で割る。',
  };
}
