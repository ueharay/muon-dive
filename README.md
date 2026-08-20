# 禅 ZEN DIVE Manila

（旧名: 無音 MUON — ディレクトリ名 `muon/` と GitHub リポジトリ名にのみ旧名が残る）

マニラ在住の日本人ビジネスパーソン向け、スキューバダイビングのコンセプト LP。
「別世界は、飛行機の先ではなく、水面の下にある。」——音も電波も重力も届かない
別次元へ、最短で脳をリセットする体験を売る、Awwwards 級のイマーシブなランディングページ。

参考トーン: Cartier Watches & Wonders / Floema / lightweight.info

## コンセプト

スクロール＝潜降。ページ全体がひとつのダイビング。単一の `depth` 値（0＝海面〜1＝深淵）が
WebGL の水中光、カラーグレード、深度計をすべて同時に駆動し、「賑やかな海面 → 静寂の深淵 → 光へ還る」
という感情の弧を体で感じさせる。

## 技術スタック（ビルド不要・静的）

- **Vanilla HTML / CSS / JS**（フレームワーク無し）
- **Lenis** — スムーススクロール（CDN）
- **GSAP + ScrollTrigger** — スクロール連動アニメーション（CDN）
- **自作 WebGL シェーダー**（`js/ocean.js`, 依存なし）— カースティクス＋ゴッドレイ＋マリンスノー＋深度カラーグレード
- **Google Fonts** — Shippori Mincho（明朝）/ Cormorant Garamond / Zen Kaku Gothic New / Marcellus / Inter
- 画像は Unsplash（Unsplash License・商用可）

## ファイル構成

```
muon/
├── index.html      # マークアップ・コピー・構造化データ(JSON-LD)・メタ
├── css/style.css   # アートディレクション一式（パレット/タイポ/モーション/レスポンシブ/reduced-motion）
└── js/
    ├── ocean.js    # WebGL 水中光フィールド（30fps / DPR1.0 / 低スペック時はCSSフォールバック）
    └── main.js     # Lenis⇄GSAP同期・潜降プリローダー・深度エンジン・リビール・カスタムカーソル・フォーム
```

## ローカルで見る

ES モジュールや fetch を使っていないので `index.html` を直接開いても動くが、フォント/画像 CDN と
相性を良くするため簡易サーバー推奨:

```bash
cd muon
python3 -m http.server 8123
# → http://localhost:8123
```

## 設計上の配慮

- **パフォーマンス**: WebGL は 30fps 上限・DPR 1.0・低スペック/モバイル（`pointer:coarse` 等）では
  シェーダーを無効化して CSS グラデーションにフォールバック。深度更新は量子化＋アイドル時停止。
- **アクセシビリティ**: スキップリンク、`prefers-reduced-motion` 完全対応（モーション無し・即時表示）、
  `<noscript>` フォールバック、キーボードフォーカス表示、装飾要素は AT から隠蔽。
- **堅牢性**: JS/CDN が失敗しても内容は表示され、プリローダーは CSS フェイルセーフでページを塞がない。
- **CJK 組版**: `line-break:strict`（禁則処理）＋作字レベルの `<br>` で行末の孤立文字を排除。

## メモ

- 予約フォームはフロントエンドのみ（バックエンド未接続）。実運用では送信先を接続する。
- ブランド名・コピー・オファーはコンセプト提案。実データに合わせて調整可能。
