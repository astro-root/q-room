#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "index.html" ] || [ ! -f "css/q-room.css" ]; then
  echo "エラー: index.html または css/q-room.css が見つかりません。リポジトリのルートで実行してください。"
  exit 1
fi

cp index.html index.html.bak
cp css/q-room.css css/q-room.css.bak

python3 << 'PYEOF'
import pathlib
import sys

html_path = pathlib.Path("index.html")
html = html_path.read_text(encoding="utf-8")

replacements = []

replacements.append((
'    <button class="hero-theme-btn" id="theme-toggle-btn" onclick="toggleTheme()" title="ダーク/ライトモード切替">',
'    <button class="hero-theme-btn" id="theme-toggle-btn" onclick="toggleTheme()" title="ダーク/ライトモード切替" aria-label="ダーク/ライトモード切替">'
))

replacements.append((
'    <button class="hero-account-btn" id="hero-account-btn" onclick="showAccountPage()" title="アカウント">',
'    <button class="hero-account-btn" id="hero-account-btn" onclick="showAccountPage()" title="アカウント" aria-label="アカウント">'
))

replacements.append((
'    <button class="hero-bell-btn" id="top-bell-btn" onclick="currentUser ? toggleTopNotifDrawer() : showAccountPage()" title="通知" style="display:none;">',
'    <button class="hero-bell-btn" id="top-bell-btn" onclick="currentUser ? toggleTopNotifDrawer() : showAccountPage()" title="通知" aria-label="通知" style="display:none;">'
))

replacements.append((
'''    <div class="logo">Q-Room</div>
    <div class="logo-sub">Online QUIZ Room</div>
  </div>''',
'''    <h1 class="logo">Q-Room</h1>
    <p class="logo-sub">Online QUIZ Room</p>
    <p class="hero-tagline">友だちとリアルタイムで遊べるオンラインクイズ対戦ツール。名前とルームIDを決めるだけで、Discord・Zoom通話をしながらすぐに始められます。</p>
  </div>'''
))

replacements.append((
'''    <div id="top-err" class="err"></div>
    <button class="btn btn-pri" onclick="handleCreate()" style="margin-bottom:20px;">CREATE ROOM</button>
    <button class="btn btn-sec" onclick="handleJoin()">JOIN ROOM</button>''',
'''    <p class="hero-trust-note">🔒 得点は自己申告制です。知り合い同士など、信頼できるメンバーでの利用を想定しています。</p>
    <div id="top-err" class="err"></div>
    <button class="btn btn-pri" onclick="handleCreate()" style="margin-bottom:20px;">CREATE ROOM</button>
    <button class="btn btn-sec" onclick="handleJoin()">JOIN ROOM</button>'''
))

replacements.append((
'    <div style="display:flex; justify-content:center; align-items:center; gap:8px; margin-top:28px; padding-bottom:8px; flex-wrap:wrap;">',
'''    <details class="hero-more">
      <summary class="hero-more-summary">その他のメニュー <span class="hero-more-caret">▾</span></summary>
      <div class="hero-more-list">'''
))

replacements.append((
'''        <span style="font-family:var(--font-en);font-size:0.75rem;letter-spacing:0.12em;font-weight:700;">INSTALL</span>
      </button>
    </div>
  </div>
</div>''',
'''        <span style="font-family:var(--font-en);font-size:0.75rem;letter-spacing:0.12em;font-weight:700;">INSTALL</span>
      </button>
      </div>
    </details>
  </div>
</div>'''
))

replacements.append((
'<link rel="stylesheet" href="css/q-room.css">',
'''<link rel="stylesheet" href="css/q-room.css">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Q-Room",
  "alternateName": "Online QUIZ Room",
  "applicationCategory": "GameApplication",
  "operatingSystem": "Web",
  "description": "Discord・Zoomと併用して遊ぶ、リアルタイム進行のオンラインクイズ対戦システム。複数のスコアリングルールに対応し、部屋を作成してすぐに対戦を始められる。",
  "url": "https://astro-root.com/q-room/",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "JPY"
  }
}
</script>'''
))

errors = []
for old, new in replacements:
    count = html.count(old)
    if count != 1:
        errors.append((count, old[:60]))
    else:
        html = html.replace(old, new, 1)

if errors:
    print("以下の置換対象が想定通り1回だけ一致しませんでした（0回=既に修正済みの可能性、2回以上=手動確認が必要）:", file=sys.stderr)
    for count, snippet in errors:
        print(f"  一致数={count}: {snippet!r}...", file=sys.stderr)
    print("一致した箇所のみ適用しました。バックアップは index.html.bak / css/q-room.css.bak にあります。", file=sys.stderr)

html_path.write_text(html, encoding="utf-8")

css_path = pathlib.Path("css/q-room.css")
css = css_path.read_text(encoding="utf-8")

addition_marker = "/* === q-room-fixes: added by apply_qroom_fixes.sh === */"
if addition_marker not in css:
    css += """

""" + addition_marker + """
:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}
.hero-tagline {
  max-width: 420px;
  margin: 14px auto 0;
  font-family: var(--font-ja);
  font-size: 0.92rem;
  line-height: 1.7;
  color: var(--text-muted);
}
.hero-trust-note {
  max-width: 420px;
  margin: 0 auto 16px;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--surface-color);
  backdrop-filter: var(--glass-blur);
  font-family: var(--font-ja);
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text-muted);
  text-align: center;
}
.hero-more {
  margin-top: 24px;
  padding-bottom: 8px;
}
.hero-more-summary {
  cursor: pointer;
  list-style: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-en);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  font-weight: 700;
  color: var(--text-muted);
  padding: 8px 16px;
  border-radius: 12px;
  transition: 0.3s;
}
.hero-more-summary::-webkit-details-marker { display: none; }
.hero-more-summary:hover, .hero-more-summary:focus-visible {
  color: var(--cyan);
}
.hero-more-caret {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.hero-more[open] .hero-more-caret {
  transform: rotate(180deg);
}
.hero-more-list {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-bottom: 8px;
  flex-wrap: wrap;
}
"""
    css_path.write_text(css, encoding="utf-8")
    print("CSSを追記しました。")
else:
    print("CSSは既に追記済みのため、追記をスキップしました。")

print("index.html / css/q-room.css の修正が完了しました。")
PYEOF

echo "---"
echo "変更差分（index.html）:"
diff -u index.html.bak index.html || true
echo "---"
echo "バックアップ: index.html.bak / css/q-room.css.bak"
echo "問題なければバックアップは削除して構いません: rm index.html.bak css/q-room.css.bak"
