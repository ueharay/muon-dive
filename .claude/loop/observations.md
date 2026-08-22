# Observations — zen-dive-manila

`task-observer` が追記する。消化は `harness-audit`（消化した項目は削除する）。
タグは `[repeat] [rework] [rule] [verify] [waste]` の5つのみ。

---

## 2026-08-22 (harness 立ち上げ直後の実インシデント)

- [verify] フッターロゴの比率修正を `getBoundingClientRect()` で数値検証し「完了」と報告したが、
  本番URLへのデプロイを忘れており、ユーザー確認時は旧CSSのままだった → `scripts/check-live.sh`
  を追加済み（prod と local の主要ファイルを diff し in-sync/DRIFT を返す）。verify.sh には
  混ぜていない（ネットワーク依存・prod URL依存でローカル反復の速さを壊すため）。CLAUDE.md に
  「見た目/配線修正は check-live.sh を通してから『見れます』と言う」ルールを追記済み。
- [rule] harness.json の `goal` は「ローカルで正しい」しか書いておらず、「ユーザーに見える」条件が
  抜けていた → goal 文言に check-live.sh の合格を明記する形に修正済み。今後 harness を作る他プロジェクト
  （デプロイ先を持つもの全般）でも `loop-init` 時にこの区別を確認する項目にすべき
  （`~/.claude/loop/HARNESS.md` と `inner-loop` SKILL.md 側で汎用ルール化済み）。

---
