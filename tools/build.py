#!/usr/bin/env python3
"""src/ を束ねて dist/ap_drill.html（単一ファイル）を作る。

このMacには Node.js が無いので、バンドラは使わずPython標準ライブラリだけで組む。
やることは単純で、ESモジュールの import を依存順に並べ替えて連結し、
import/export 文を取り除いてひとつのスクリプトにするだけ。

    python3 tools/build.py

前提（このプロジェクトのコードが守っているルール）:
  - import は必ず相対パスで、名前付き import のみ（default export は使わない）
  - 同名のトップレベル識別子を別ファイルで定義しない
  - 動的 import は使わない
"""

import os
import re
import sys
import base64
import struct
import zlib
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')

ENTRY = os.path.join(SRC, 'ui', 'main.js')

# import 行 / export 修飾子を落とすための正規表現
RE_IMPORT = re.compile(r'^\s*import\s+[^;]*?from\s+[\'"]([^\'"]+)[\'"]\s*;?\s*$', re.M)
RE_IMPORT_BARE = re.compile(r'^\s*import\s+[\'"]([^\'"]+)[\'"]\s*;?\s*$', re.M)
RE_EXPORT_FROM = re.compile(r'^\s*export\s+\{[^}]*\}\s+from\s+[\'"]([^\'"]+)[\'"]\s*;?\s*$', re.M)
RE_EXPORT_DECL = re.compile(r'^(\s*)export\s+(const|let|var|function|class|async)\b', re.M)
RE_EXPORT_LIST = re.compile(r'^\s*export\s+\{[^}]*\}\s*;?\s*$', re.M)


def resolve(base_file, spec):
    """相対 import 先を実ファイルパスに直す。"""
    path = os.path.normpath(os.path.join(os.path.dirname(base_file), spec))
    if os.path.isfile(path):
        return path
    for cand in (path + '.js', os.path.join(path, 'index.js')):
        if os.path.isfile(cand):
            return cand
    raise SystemExit(f'import を解決できません: {spec}（{base_file} から）')


def collect(entry):
    """依存を深さ優先でたどり、葉から順に並べたファイル一覧を返す。"""
    order = []
    seen = set()
    stack = set()  # 循環参照の検出用

    def visit(path):
        if path in seen:
            return
        if path in stack:
            raise SystemExit(f'循環 import: {path}')
        stack.add(path)

        text = read(path)
        specs = (
            RE_IMPORT.findall(text)
            + RE_IMPORT_BARE.findall(text)
            + RE_EXPORT_FROM.findall(text)
        )
        for spec in specs:
            if not spec.startswith('.'):
                raise SystemExit(f'外部モジュールは使えません: {spec}（{path}）')
            visit(resolve(path, spec))

        stack.discard(path)
        seen.add(path)
        order.append(path)

    visit(entry)
    return order


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def strip_module_syntax(text):
    """import/export を取り除いて、そのまま連結できる素のスクリプトにする。"""
    text = RE_IMPORT.sub('', text)
    text = RE_IMPORT_BARE.sub('', text)
    text = RE_EXPORT_FROM.sub('', text)
    text = RE_EXPORT_LIST.sub('', text)
    text = RE_EXPORT_DECL.sub(r'\1\2', text)
    return text


RE_TOPLEVEL_DECL = re.compile(
    r'^(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)', re.M
)


def check_collisions(files):
    """ファイルをまたぐトップレベル識別子の衝突を検出する。

    全ファイルを1つのスコープに連結する方式なので、別ファイルに同名の関数があると
    `Identifier 'x' has already been declared` で**実行時に**落ちる。
    ブラウザのconsoleにも出にくく発見が遅れるため、ビルドの時点で止める。
    （実際に cpu.js と transfer.js の genTime が衝突して画面が真っ白になった）
    """
    decl = {}
    for path in files:
        for m in RE_TOPLEVEL_DECL.finditer(read(path)):
            decl.setdefault(m.group(1), []).append(os.path.relpath(path, ROOT))

    dups = {k: v for k, v in decl.items() if len(v) > 1}
    if dups:
        print('エラー: トップレベル識別子が複数ファイルで重複しています。', file=sys.stderr)
        print('（全ファイルを1スコープに連結するため、名前が衝突すると実行時に落ちます）', file=sys.stderr)
        for name, paths in sorted(dups.items()):
            print(f'  {name}: {", ".join(paths)}', file=sys.stderr)
        raise SystemExit(1)


def bundle():
    files = collect(ENTRY)
    check_collisions(files)
    parts = []
    for path in files:
        rel = os.path.relpath(path, ROOT)
        parts.append(f'// ===== {rel} ' + '=' * max(0, 58 - len(rel)))
        parts.append(strip_module_syntax(read(path)).strip())
        parts.append('')
    return '\n'.join(parts)


# --- PWA アイコン --------------------------------------------------------

def png_icon(size, bg=(0x2f, 0x6f, 0xd0)):
    """単色の角丸っぽい正方形アイコンをPNGとして生成する。

    外部の画像ファイルを持たずに済ませるため、zlib と struct だけで最小のPNGを組む。
    中央に白い横棒を2本置いて、のっぺりした単色に見えないようにする。
    """
    px = []
    for y in range(size):
        row = bytearray([0])  # フィルタタイプ 0
        for x in range(size):
            # 中央付近に白い帯を2本（ドリルの「線」のイメージ）
            in_bar = (
                size * 0.30 <= y <= size * 0.40 and size * 0.22 <= x <= size * 0.78
            ) or (
                size * 0.56 <= y <= size * 0.66 and size * 0.22 <= x <= size * 0.60
            )
            row += bytes((255, 255, 255) if in_bar else bg)
        px.append(bytes(row))
    raw = b''.join(px)

    def chunk(tag, data):
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )


MANIFEST = """{
  "name": "応用情報ドリル",
  "short_name": "AP\\u30c9\\u30ea\\u30eb",
  "description": "応用情報技術者試験・科目Aの計算問題ジェネレータと可視化シミュレータ",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f6f7f9",
  "theme_color": "#2f6fd0",
  "lang": "ja",
  "icons": [
    { "src": "./icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "./icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
"""


def service_worker(version):
    """オフラインで開けるようにするService Worker。

    キャッシュ名にビルド時刻を含めるので、再ビルドすれば古いキャッシュは捨てられる。
    """
    return f"""// 応用情報ドリル — オフライン用 Service Worker（ビルド生成物）
const CACHE = 'ap-drill-{version}';
// './' と './index.html' の両方を入れる。ホスティングによってどちらで参照されるか変わるため。
const ASSETS = ['./', './index.html', './ap_drill.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {{
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
}});

self.addEventListener('activate', (e) => {{
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
}});

// キャッシュ優先。ネットワークが無くても動くことを最優先にする
// （出題は全てローカル生成なので、新しいデータを取りに行く必要がない）。
self.addEventListener('fetch', (e) => {{
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('./index.html') || caches.match('./ap_drill.html')))
  );
}});
"""


SW_REGISTER = """<script>
// Service Worker は file:// では動かない（登録しようとすると例外になる）ので、
// http(s) で開かれたときだけ登録する。file:// で開いてもドリルは通常どおり動く。
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  });
}
</script>"""


def main():
    if not os.path.isfile(ENTRY):
        raise SystemExit(f'エントリが見つかりません: {ENTRY}')

    os.makedirs(DIST, exist_ok=True)

    jst = timezone(timedelta(hours=9))
    now = datetime.now(jst)
    version = now.strftime('%Y%m%d-%H%M')

    html = read(os.path.join(SRC, 'index.html'))
    css = read(os.path.join(SRC, 'style.css'))
    js = bundle()

    html = html.replace('/*BUILD:CSS*/', css)
    html = html.replace('/*BUILD:JS*/', js)
    html = html.replace(
        '<!--BUILD:MANIFEST-->',
        '<link rel="manifest" href="./manifest.webmanifest">\n'
        '<link rel="icon" href="./icon-192.png">\n'
        '<link rel="apple-touch-icon" href="./icon-192.png">',
    )
    html = html.replace('<!--BUILD:SW-->', SW_REGISTER)
    html = html.replace(
        '<!--BUILD:VERSION-->', f'build {version}（JST）'
    )

    out_html = os.path.join(DIST, 'ap_drill.html')
    with open(out_html, 'w', encoding='utf-8') as f:
        f.write(html)

    # index.html にも同じ内容を書き出す。
    # GitHub Pages などのホスティングはディレクトリを開いたとき index.html を探すため、
    # これが無いとURLの末尾に /ap_drill.html を付けないと開けない。
    # ap_drill.html を残しているのは「1ファイルだけ人に渡す」用途を壊さないため。
    with open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)

    with open(os.path.join(DIST, 'manifest.webmanifest'), 'w', encoding='utf-8') as f:
        f.write(MANIFEST)

    with open(os.path.join(DIST, 'sw.js'), 'w', encoding='utf-8') as f:
        f.write(service_worker(version))

    for size in (192, 512):
        with open(os.path.join(DIST, f'icon-{size}.png'), 'wb') as f:
            f.write(png_icon(size))

    # 外部参照が残っていないかを機械的に確認する（オフライン動作の担保）。
    bad = []
    for m in re.finditer(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', html):
        url = m.group(1)
        if url.startswith(('http://', 'https://', '//')):
            bad.append(url)
    if bad:
        print('警告: 外部参照が残っています:', file=sys.stderr)
        for u in sorted(set(bad)):
            print('  ' + u, file=sys.stderr)
        return 1

    # GitHub Pages 用に docs/ へも同じものを置く。
    #
    # Pages が公開フォルダとして選べるのは「/(root)」か「/docs」の2つだけで、
    # /dist は選択肢に出てこない（実際に設定画面で確認済み）。
    # dist/ を残しているのは、ローカルでの配布物という位置づけを変えないため。
    docs = os.path.join(ROOT, 'docs')
    os.makedirs(docs, exist_ok=True)
    for name in os.listdir(DIST):
        src_path = os.path.join(DIST, name)
        if os.path.isfile(src_path):
            with open(src_path, 'rb') as rf, open(os.path.join(docs, name), 'wb') as wf:
                wf.write(rf.read())

    # Jekyll の処理を丸ごと飛ばす。
    # 素のHTMLしか置かないので Jekyll を通す意味がなく、通すと
    # アンダースコア始まりのファイルが無視されるなどの事故だけが増える。
    with open(os.path.join(docs, '.nojekyll'), 'w') as f:
        f.write('')

    size_kb = os.path.getsize(out_html) / 1024
    print(f'ビルド完了: dist/index.html ＋ dist/ap_drill.html  ({size_kb:.0f} KB, {len(collect(ENTRY))} ファイルを結合)')
    print(f'  docs/ にも複製（GitHub Pages 用）')
    print(f'  version: {version}')
    print('  外部参照: なし（オフラインで動作します）')
    print('')
    print('PWAとして使うにはローカルサーバ経由で開いてください:')
    print('  cd dist && python3 -m http.server 8765')
    print('  → http://localhost:8765/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
