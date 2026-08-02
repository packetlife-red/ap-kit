// 保存層の抽象化。
// localStorage を直接叩かないのは、将来アプリ化・サーバ同期に切り替えるとき
// ここだけ差し替えれば済むようにするため。UI側は必ずこの API を経由する。

const KEY = 'ap-kit:v1';

// localStorage が使えない環境（file:// のSafari、プライベートモード等）でも
// 落ちずに動くよう、メモリへフォールバックする。
let memory = null;

function backend() {
  if (memory) return null;
  try {
    const t = '__ap_kit_probe__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    memory = new Map();
    return null;
  }
}

function readAll() {
  const b = backend();
  const raw = b ? b.getItem(KEY) : memory.get(KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeAll(obj) {
  const raw = JSON.stringify(obj);
  const b = backend();
  if (b) {
    try {
      b.setItem(KEY, raw);
      return true;
    } catch {
      // 容量超過など。データを失うよりメモリで継続する。
      memory = new Map();
    }
  }
  memory.set(KEY, raw);
  return false;
}

export const store = {
  get(key, fallback = null) {
    const all = readAll();
    return key in all ? all[key] : fallback;
  },
  set(key, value) {
    const all = readAll();
    all[key] = value;
    return writeAll(all);
  },
  update(key, fn, fallback = null) {
    const cur = store.get(key, fallback);
    const nextValue = fn(cur);
    store.set(key, nextValue);
    return nextValue;
  },
  clear() {
    writeAll({});
  },
};

// --- 成績の記録 ---------------------------------------------------------
// 形: { [generatorId]: { correct, total, recent: [{ ts, ok, seed }] } }

const STATS = 'stats';
const RECENT_MAX = 30;

export function recordAnswer({ generatorId, ok, seed, ts = Date.now() }) {
  return store.update(
    STATS,
    (stats) => {
      const s = stats || {};
      const e = s[generatorId] || { correct: 0, total: 0, recent: [] };
      e.total += 1;
      if (ok) e.correct += 1;
      e.recent.unshift({ ts, ok, seed });
      e.recent = e.recent.slice(0, RECENT_MAX);
      s[generatorId] = e;
      return s;
    },
    {}
  );
}

export function getStats() {
  return store.get(STATS, {}) || {};
}

export function resetStats() {
  store.set(STATS, {});
}
