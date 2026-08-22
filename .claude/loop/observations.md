# Observations — zen-dive-manila

`task-observer` が追記する。消化は `harness-audit`（消化した項目は削除する）。
タグは `[repeat] [rework] [rule] [verify] [waste]` の5つのみ。

---

## 2026-08-22 ロゴ形状で5往復させた件（ハーネス再設計の直接の原因）

- [verify] verify.sh に**見た目の合否を判定するものが1つも無かった**。構文・秘密情報・
  アセット参照・疎通しか見ておらず、画面が2倍に崩れていても緑。見た目は全部私の主観だった
  → `[6/6] appearance` を追加。`tests/logo-lockup.spec.mjs`（実描画インク幅の形状フィンガープリント）
  ＋ `tests/__screenshots__/`（ピクセル基準画像）。**消化済み**
- [verify] 代理指標で合格にした。`getBoundingClientRect()` のボックス幅 232.9 vs 232.8 を
  「一致」と報告したが、人が見るインクは 112 vs 231。→ `Range.getClientRects()` に統一。**消化済み**
- [verify] 検証が**落ちることを一度も確認していなかった**。→ `scripts/self-test.sh` で
  ミューテーション6件（今回の実バグ含む）が全て赤になることを自動確認。**消化済み**
- [verify] 基準画像を**空**で記録しかけた（ナビが `is-hidden` で画面外）。空の基準画像は
  永久に通る。→ `assertHasInk()` ＋ verify 側で std<8 の基準画像を落とす。**消化済み**
- [rework] ユーザーのスクショを**眺めて推測**し、自分の仮説（比率）を検証しに行った。
  画像を直接ピクセル計測したら1手で真因（幅2.06倍）に到達した。
  → POLICY.md §2a「ユーザーの成果物からまず再現する」。**消化済み**
- [rule] `loop-init` に「見た目のゲート」「落ちることの証明」を必須手順として追加。
  他プロジェクトで同じ穴が空かないようにした。**消化済み**

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
