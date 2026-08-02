// seed付き擬似乱数。同じseedなら必ず同じ問題が出る＝「この問題をもう一度」が成立する。
// mulberry32: 32bit・高速・分布が素直。暗号用途ではない（学習ツールなので十分）。

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ジェネレータに渡すヘルパ一式。gen(rng) の rng はこの形。
export function makeRng(seed) {
  const next = mulberry32(seed);

  const r = {
    seed,
    next,
    // min以上max以下の整数
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // min以上max未満の実数を step 刻みで
    float(min, max, step = 0.01) {
      const n = Math.round((max - min) / step);
      return round(min + r.int(0, n) * step, 10);
    },
    pick(arr) {
      return arr[r.int(0, arr.length - 1)];
    },
    // 重複なしでn個選ぶ
    sample(arr, n) {
      const pool = arr.slice();
      const out = [];
      for (let i = 0; i < n && pool.length; i++) {
        out.push(pool.splice(r.int(0, pool.length - 1), 1)[0]);
      }
      return out;
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = r.int(0, i);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    bool() {
      return next() < 0.5;
    },
  };
  return r;
}

// 浮動小数点の丸め。0.1+0.2問題で選択肢が重複判定を誤らないように、
// 生成側で必ずこれを通す。
export function round(x, digits = 4) {
  const p = Math.pow(10, digits);
  return Math.round((x + Number.EPSILON) * p) / p;
}

// 乱数seedの既定値。URLの ?seed= があればそれを使う想定（UI側で解決）。
export function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
