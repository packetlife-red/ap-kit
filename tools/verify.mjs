// 全ジェネレータの自動検証。
//
// 実行:  ./tools/verify.sh        （macOS標準の jsc を使う。node不要）
//
// 「推定より実測」に従い、目視ではなくここで機械的に潰す。
// 生成器のロジックそのものの正しさ（公式が合っているか）は検出できないので、
// それは README の手計算チェックリストで別途担保する。

import { allGenerators, generate } from '../src/core/generators/index.js';

// 200回では「1000問に1問しか出ない生成失敗」を取りこぼす。
// 実際、radix / probability / os / evm / finance の5分野で
// 0.1〜0.4% の確率で「distractorが足りない」例外が起きていたのを
// 200回では検出できていなかった（利用者は250〜1000問で1回踏む頻度）。
const ITERATIONS = 5000;

// ui/app.js の fmtStepValue と同じ実装。
// あちらは DOM 層なので import できないため、表示の検査用にここへ複製している。
// 片方だけ直すと検査が意味を失うので、変更時は必ず両方を合わせること。
function fmtStepValue(v) {
  if (typeof v !== 'number') return String(v);
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return v.toLocaleString('ja-JP');
  const abs = Math.abs(v);
  if (abs < 0.01) {
    const digits = Math.min(12, Math.ceil(-Math.log10(abs)) + 2);
    return v.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  }
  const r = Math.round(v * 10000) / 10000;
  return r.toLocaleString('ja-JP', { maximumFractionDigits: 4 });
}

let failures = 0;
let checks = 0;

function fail(genId, seed, msg) {
  failures++;
  print(`  ✗ [${genId}] seed=${seed}: ${msg}`);
}

function assert(cond, genId, seed, msg) {
  checks++;
  if (!cond) fail(genId, seed, msg);
  return cond;
}

// 分野固有の範囲チェック。ここに書いた分だけ守られる。
const RANGE_RULES = {
  reliability: (q) => {
    if (typeof q.answer !== 'number') return '稼働率が数値でない';
    if (q.answer < 0 || q.answer > 1) return `稼働率が0〜1の外: ${q.answer}`;
    return null;
  },
  queue: (q) => {
    if (q.answer < 0) return `待ち時間が負: ${q.answer}`;
    return null;
  },
  cache: (q) => {
    if (q.answer <= 0) return `実効アクセス時間が0以下: ${q.answer}`;
    return null;
  },
};

print('=== ジェネレータ検証 ===');

const gens = allGenerators();
if (gens.length === 0) {
  print('ジェネレータが1つも登録されていない');
  throw new Error('no generators');
}

for (const g of gens) {
  let genFailures = failures;

  for (let i = 0; i < ITERATIONS; i++) {
    const seed = (i * 2654435761) >>> 0;
    let q;
    try {
      q = generate(g.id, seed);
    } catch (e) {
      fail(g.id, seed, `生成が例外: ${e && e.message ? e.message : e}`);
      continue;
    }

    // 1. 選択肢は必ず4つ
    assert(q.choices.length === 4, g.id, seed, `選択肢が${q.choices.length}個`);

    // 2. 選択肢に重複がない（表示文字列で判定＝ユーザーから見て同じなら重複）
    const uniq = new Set(q.choices);
    assert(uniq.size === 4, g.id, seed, `選択肢が重複: ${JSON.stringify(q.choices)}`);

    // 3. 正解のindexが妥当で、その中身が answerText と一致する
    assert(
      q.answerIndex >= 0 && q.answerIndex < 4,
      g.id,
      seed,
      `answerIndexが範囲外: ${q.answerIndex}`
    );
    assert(
      q.choices[q.answerIndex] === q.answerText,
      g.id,
      seed,
      `正解の選択肢が answerText と不一致: "${q.choices[q.answerIndex]}" vs "${q.answerText}"`
    );

    // 4. 正解フラグはちょうど1つ
    const correctCount = q.choiceMeta.filter((m) => m.correct).length;
    assert(correctCount === 1, g.id, seed, `正解フラグが${correctCount}個`);

    // 5. 誤答には必ず「なぜそう間違えるか」がある（学習効果の中核）
    for (let k = 0; k < 4; k++) {
      if (q.choiceMeta[k].correct) continue;
      assert(
        typeof q.choiceMeta[k].why === 'string' && q.choiceMeta[k].why.length > 0,
        g.id,
        seed,
        `誤答[${k}]に why がない`
      );
    }

    // 6. 数値が壊れていない
    if (typeof q.answer === 'number') {
      assert(isFinite(q.answer), g.id, seed, `answerが有限でない: ${q.answer}`);
    }

    // 7. 問題文・解説が空でない
    assert(q.question && q.question.length > 10, g.id, seed, '問題文が短すぎる');
    assert(q.steps.length > 0, g.id, seed, '解説ステップがない');

    // 8. 解説の最終ステップの値が正解と一致する
    //    （解説と答えがズレている問題は、間違いに気づけないので最悪）
    //
    //    答えが文字列の問題（2進数のビット列、IPアドレス等）は数値を持たないため、
    //    この一致チェックの対象外。代わりに「解説のどこかに答えが現れる」ことを見る。
    if (typeof q.answer === 'number') {
      const lastValued = [...q.steps]
        .reverse()
        .find((s) => typeof s.value === 'number');
      if (assert(lastValued !== undefined, g.id, seed, '値を持つ解説ステップがない')) {
        const diff = Math.abs(lastValued.value - q.answer);
        const tol = Math.max(1e-6, Math.abs(q.answer) * 1e-6);
        assert(
          diff <= tol,
          g.id,
          seed,
          `解説の最終値(${lastValued.value})と正解(${q.answer})が不一致`
        );
      }
    } else {
      const shown = q.steps.some(
        (s) => String(s.expr).indexOf(String(q.answer)) >= 0 || String(s.value) === String(q.answer)
      );
      assert(shown, g.id, seed, `解説のどこにも正解(${q.answer})が現れない`);
    }

    // 9. 分野固有の範囲
    const rule = RANGE_RULES[g.id];
    if (rule) {
      const msg = rule(q);
      assert(msg === null || msg === undefined, g.id, seed, String(msg));
    }

    // 10. 選択肢が「読める」形式になっていること。
    //     0.00025001 のような小数8桁や、桁区切りのない 1600000000 は、
    //     桁を数えないと大小すら比較できず、実際に「単位が細かくて見づらい」
    //     という指摘を受けた。fmtSmallRate / fmtNs / fmtInt で整えている。
    //     radix は2進数のビット列（1101…）を出すので対象外。
    if (g.id !== 'radix') {
      for (const c of q.choices) {
        const s = String(c);
        assert(
          !/\.\d{5,}/.test(s),
          g.id,
          seed,
          `選択肢の小数が細かすぎる（5桁以上）: ${s}`
        );
        assert(
          !(/(?:^|[^\d,.])\d{6,}(?!\d)/.test(s) && s.indexOf(',') < 0),
          g.id,
          seed,
          `選択肢の大きな数に桁区切りがない: ${s}`
        );
      }
    }

    // 10b. 指数表記（5e-7 のような形）がどこにも出ていないこと。
    //      初学者にはこの表記自体が読めない。実際にページフォールト率の解説で
    //      steps の値が "5e-7" と表示されていた（UI側の丸めが原因）。
    //      問題文・ヒント・選択肢・解説本文・stepsの値まで、まとめて見る。
    {
      const texts = [q.question, q.hint || '', ...q.choices.map(String)];
      for (const st of q.steps || []) {
        texts.push(String(st.expr || ''));
        // step の値は UI 側の fmtStepValue を通してから画面に出る。
        // 検査すべきは生値ではなく「利用者が実際に見る文字列」なので、
        // 同じ整形を通した結果を見る（この関数は ui/app.js と同じ実装）。
        if (st.value !== null && st.value !== undefined) {
          const shown = fmtStepValue(st.value);
          texts.push(shown);
          // 0 でない値が "0" と表示されたら、丸めで情報が消えている
          assert(
            !(st.value !== 0 && /^-?0$/.test(shown)),
            g.id,
            seed,
            `解説の値が丸めで消えている: ${st.value} が "${shown}" と表示される`
          );
        }
      }
      for (const b of q.explain || []) texts.push(String(b.body || ''));
      for (const t of texts) {
        assert(
          !/\d[eE][+-]\d/.test(t),
          g.id,
          seed,
          `指数表記が露出している（初学者に読めない）: ${t.slice(0, 70)}`
        );
      }
    }

    // 11. 「教える解説」(explain) の健全性。
    //     steps と違って本文が手書きの日本語なので、テンプレートの穴埋めミスが
    //     そのまま利用者に見えてしまう。最低限ここで潰す。
    if (q.explain && q.explain.length) {
      const kinds = q.explain.map((b) => b.kind);
      assert(
        kinds.indexOf('calc') >= 0,
        g.id,
        seed,
        'explain に calc ブロックがない（計算過程が読めない）'
      );

      for (const b of q.explain) {
        assert(
          ['ask', 'why', 'calc', 'trap'].indexOf(b.kind) >= 0,
          g.id,
          seed,
          `explain の kind が不正: ${b.kind}`
        );
        assert(
          typeof b.title === 'string' && b.title.length > 0,
          g.id,
          seed,
          'explain に見出しがない'
        );
        // 変数の埋め込みミスは undefined / NaN として本文に出る
        assert(
          typeof b.body === 'string' && !/undefined|NaN|Infinity/.test(b.body),
          g.id,
          seed,
          `explain 本文に未定義値が混入: ${String(b.body).slice(0, 60)}`
        );
        assert(
          b.body.length >= 20,
          g.id,
          seed,
          `explain 本文が短すぎる（${b.body.length}字）: ${b.title}`
        );
        // ** が奇数個だと太字マークアップが閉じずに崩れる
        const stars = (b.body.match(/\*\*/g) || []).length;
        assert(stars % 2 === 0, g.id, seed, `explain の ** が閉じていない: ${b.title}`);
      }

      // calc ブロックには正解の値が文字列として現れているはず。
      // 「解説の途中式は合っているのに、書いてある結論が違う」を防ぐ。
      const calc = q.explain.filter((b) => b.kind === 'calc').map((b) => b.body).join('\n');
      assert(
        calc.indexOf(String(q.answerText)) >= 0 || calc.indexOf(String(q.answer)) >= 0,
        g.id,
        seed,
        `calcブロックに正解(${q.answerText})が書かれていない`
      );
    }
  }

  // 12. 同じseedなら必ず同じ問題（seed共有・再挑戦が成立する条件）
  const a = generate(g.id, 12345);
  const b = generate(g.id, 12345);
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    g.id,
    12345,
    '同じseedで異なる問題が生成された（再現性なし）'
  );

  // 13. 種類のばらつき（同じ問題ばかり出ないこと）
  const variety = new Set();
  for (let i = 0; i < 50; i++) variety.add(generate(g.id, (i * 7919) >>> 0).question);
  assert(variety.size >= 10, g.id, 0, `50回中${variety.size}種類しか出ていない（単調すぎる）`);

  const ok = failures === genFailures;
  print(`${ok ? '✓' : '✗'} ${g.id.padEnd(14)} ${g.name}`);
}

print('');
print(`検査数: ${checks} / 失敗: ${failures} / ジェネレータ: ${gens.length}`);
if (failures > 0) {
  print('=== 失敗あり ===');
  throw new Error(`${failures} 件の検証に失敗`);
}
print('=== 全て通過 ===');
