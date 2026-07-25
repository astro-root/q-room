#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "apply_qroom_fixes_2.sh" ]; then
  echo "エラー: apply_qroom_fixes_2.sh が見つかりません。このスクリプトと同じディレクトリに置いてから実行してください。"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "エラー: 未コミットの変更があります。先に commit するか、変更を退避してから実行してください。"
  git status --short
  exit 1
fi

BRANCH="fix/value-prop-and-rules"

git checkout main
git pull origin main
git checkout -b "$BRANCH"

bash apply_qroom_fixes_2.sh

git add index.html manual.html css/q-room.css css/manual.css
git commit -m "価値提案セクション追加とルール一覧の折りたたみ化"
git push -u origin "$BRANCH"

echo "---"
echo "ブランチ '$BRANCH' にコミット・プッシュしました。"
echo "GitHub上でPull Requestを作成し、実機確認後にmergeしてください。"
