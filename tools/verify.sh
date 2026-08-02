#!/bin/sh
# 全ジェネレータの自動検証を走らせる。
#
# macOS標準の JavaScriptCore(jsc) を使うので、Node.js のインストールは不要。
# jsc は Xcode ではなく OS 同梱のフレームワークに入っているため、素のMacで動く。

DIR=$(cd "$(dirname "$0")/.." && pwd)
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc

if [ ! -x "$JSC" ]; then
  echo "jsc が見つかりません: $JSC" >&2
  echo "（macOS以外の環境なら node tools/verify.mjs でも同じ検証が走ります）" >&2
  exit 1
fi

# jsc は日本語を含む絶対パスを開けないため、プロジェクト直下から相対パスで呼ぶ。
cd "$DIR" || exit 1

# ジェネレータ（ドリル）とレッスン（はじめから）の両方を検証する。
# 片方が落ちたら全体を失敗にしたいので、終了コードを引き継ぐ。
"$JSC" --module-file=tools/verify.mjs || exit $?
echo ""
exec "$JSC" --module-file=tools/verify-lessons.mjs
