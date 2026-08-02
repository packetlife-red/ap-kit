#!/bin/sh
# ジェネレータの出力を端末で目視する。
#   ./tools/preview.sh                  全分野を1問ずつ
#   ./tools/preview.sh reliability 5    指定分野を5問

DIR=$(cd "$(dirname "$0")/.." && pwd)
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc

if [ ! -x "$JSC" ]; then
  echo "jsc が見つかりません: $JSC" >&2
  exit 1
fi

# jsc は日本語を含む絶対パスを開けないため、プロジェクト直下から相対パスで呼ぶ。
cd "$DIR" || exit 1
exec "$JSC" --module-file=tools/preview.mjs -- "$@"
