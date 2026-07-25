#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "index.html" ] || [ ! -f "manual.html" ] || [ ! -f "css/q-room.css" ] || [ ! -f "css/manual.css" ]; then
  echo "エラー: index.html / manual.html / css/q-room.css / css/manual.css が見つかりません。リポジトリのルートで実行してください。"
  exit 1
fi

cp index.html index.html.bak2
cp manual.html manual.html.bak2
cp css/q-room.css css/q-room.css.bak2
cp css/manual.css css/manual.css.bak2

python3 << 'PYEOF'
import pathlib
import re
import sys

# ---------- index.html: 価値提案セクション + 3ステップ導線を追加 (#2 / #3 / #10) ----------
html_path = pathlib.Path("index.html")
html = html_path.read_text(encoding="utf-8")

old_index = '''    <p class="hero-tagline">友だちとリアルタイムで遊べるオンラインクイズ対戦ツール。名前とルームIDを決めるだけで、Discord・Zoom通話をしながらすぐに始められます。</p>
  </div>

  <div class="form-wrap">'''

new_index = '''    <p class="hero-tagline">友だちとリアルタイムで遊べるオンラインクイズ対戦ツール。名前とルームIDを決めるだけで、Discord・Zoom通話をしながらすぐに始められます。</p>
  </div>

  <div class="value-section">
    <div class="value-grid">
      <div class="value-item">
        <span class="value-icon" aria-hidden="true">⚡</span>
        <div class="value-text"><b>リアルタイム同期</b>全員の画面がその場で揃う</div>
      </div>
      <div class="value-item">
        <span class="value-icon" aria-hidden="true">🎯</span>
        <div class="value-text"><b>16種類のルール</b>NewYork・アップダウンなど自由に選択</div>
      </div>
      <div class="value-item">
        <span class="value-icon" aria-hidden="true">👥</span>
        <div class="value-text"><b>フレンド・履歴</b>アカウント登録で成績を記録・共有</div>
      </div>
    </div>
    <ol class="how-it-works">
      <li><span class="how-num" aria-hidden="true">1</span>名前とルームIDを決める</li>
      <li><span class="how-num" aria-hidden="true">2</span>Discord・Zoomなどで友だちを招待</li>
      <li><span class="how-num" aria-hidden="true">3</span>◯✕ボタンでリアルタイム対戦</li>
    </ol>
  </div>

  <div class="form-wrap">'''

count = html.count(old_index)
if count != 1:
    print(f"警告: index.html の挿入対象が {count} 回一致しました（想定=1）。スキップします。", file=sys.stderr)
else:
    html = html.replace(old_index, new_index, 1)
    html_path.write_text(html, encoding="utf-8")
    print("index.html に価値提案セクション（特徴3点+3ステップ導線）を追加しました。")

# ---------- manual.html: ルールカードを折りたたみ式(<details>)に変換 (#7) ----------
manual_path = pathlib.Path("manual.html")
manual = manual_path.read_text(encoding="utf-8")

pattern = re.compile(
    r'<div class="rule-card">\s*<span class="rule-name (tag-\w)">([^<]+)</span>\s*'
    r'<div class="rule-summary">(.*?)</div>\s*<div class="rule-formula">(.*?)</div>\s*</div>',
    re.DOTALL
)

def to_details(m):
    tag_cls, name, summary, formula = m.groups()
    return (
        f'<details class="rule-card">\n'
        f'        <summary class="rule-name {tag_cls}">{name}</summary>\n'
        f'        <div class="rule-summary">{summary}</div>\n'
        f'        <div class="rule-formula">{formula}</div>\n'
        f'      </details>'
    )

new_manual, n = pattern.subn(to_details, manual)
if n == 0:
    print("警告: manual.html でルールカードが1件も一致しませんでした（既に修正済みの可能性）。", file=sys.stderr)
else:
    manual_path.write_text(new_manual, encoding="utf-8")
    print(f"manual.html のルールカード {n} 件を折りたたみ式に変換しました。")

# ---------- css/q-room.css に価値提案セクションのスタイルを追記 ----------
css_path = pathlib.Path("css/q-room.css")
css = css_path.read_text(encoding="utf-8")
marker = "/* === q-room-fixes-2: value section === */"
if marker not in css:
    css += """

""" + marker + """
.value-section {
  padding: 0 24px 8px;
  margin-bottom: 8px;
}
.value-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}
.value-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--surface-color);
  backdrop-filter: var(--glass-blur);
}
.value-icon {
  font-size: 1.3rem;
  flex-shrink: 0;
}
.value-text {
  font-family: var(--font-ja);
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--text-muted);
}
.value-text b {
  display: block;
  font-family: var(--font-en);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: var(--text-main);
  margin-bottom: 2px;
}
.how-it-works {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px dashed var(--border-color);
  border-radius: 14px;
}
.how-it-works li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-ja);
  font-size: 0.82rem;
  color: var(--text-main);
}
.how-num {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(6,182,212,0.15);
  color: var(--cyan);
  border: 1px solid rgba(6,182,212,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-en);
  font-size: 0.75rem;
  font-weight: 700;
}
"""
    css_path.write_text(css, encoding="utf-8")
    print("css/q-room.css に価値提案セクションのスタイルを追記しました。")
else:
    print("css/q-room.css は既に追記済みのため、追記をスキップしました。")

# ---------- css/manual.css にdetails/summary用スタイルを追記 ----------
manual_css_path = pathlib.Path("css/manual.css")
manual_css = manual_css_path.read_text(encoding="utf-8")
marker2 = "/* === q-room-fixes-2: collapsible rule cards === */"
if marker2 not in manual_css:
    manual_css += """

""" + marker2 + """
.rule-card { cursor: pointer; }
.rule-card summary {
  list-style: none;
  cursor: pointer;
}
.rule-card summary::-webkit-details-marker { display: none; }
.rule-card summary::after {
  content: "▾";
  float: right;
  color: var(--muted);
  transition: transform 0.25s ease;
}
.rule-card[open] summary::after {
  transform: rotate(180deg);
}
.rule-card[open] .rule-summary,
.rule-card[open] .rule-formula {
  animation: rule-card-fade 0.2s ease;
}
@keyframes rule-card-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
"""
    manual_css_path.write_text(manual_css, encoding="utf-8")
    print("css/manual.css に折りたたみカード用のスタイルを追記しました。")
else:
    print("css/manual.css は既に追記済みのため、追記をスキップしました。")
PYEOF

echo "---"
echo "変更差分（index.html）:"
diff -u index.html.bak2 index.html || true
echo "---"
echo "変更差分（manual.html）: 冒頭3ルール分のみ表示"
diff -u manual.html.bak2 manual.html | head -60 || true
echo "---"
echo "バックアップ: index.html.bak2 / manual.html.bak2 / css/q-room.css.bak2 / css/manual.css.bak2"
echo "問題なければ削除: rm index.html.bak2 manual.html.bak2 css/q-room.css.bak2 css/manual.css.bak2"
