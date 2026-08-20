# ZEN DIVE Manila — チャットボット バックエンド（Vercel版）

静的サイト（`../index.html` / `../js/chat.js`）と同じプロジェクトに、
`api/chat.js` を1本置くだけの最小構成。Vercelはこのフォルダを自動で
サーバーレス関数として認識し、`/api/chat` というURLでデプロイします。
静的ファイルと同じオリジンなので、CORSの設定は一切不要です。

ベクトルDBもRAGも使わない — サイトの内容が `system-prompt.txt` に収まる分量なので、
毎回まるごとシステムプロンプトとして渡すだけで十分。

```
[サイトの chatw ウィジェット] → fetch('/api/chat') → [同じVercelプロジェクト内の関数] → Gemini API
```

## デプロイ手順

### 1. Gemini APIキーを取得
[aistudio.google.com](https://aistudio.google.com) にGoogleアカウントでログイン →
「Get API key」→「Create API key」（無料）。

### 2. GitHubにこのプロジェクトを置く
まだであれば、`muon/` フォルダ全体をGitHubリポジトリにpushします。
Vercelはリポジトリ連携で自動デプロイする作りなので、これが一番簡単です。

### 3. Vercelでプロジェクトを作成
1. [vercel.com](https://vercel.com) にGitHubアカウントでサインアップ（無料）
2. 「Add New」→「Project」
3. 先ほどのGitHubリポジトリを選択して「Import」
4. Framework Preset は **「Other」** のままでOK（静的サイト＋`api/`フォルダを自動認識します）
5. 「Deploy」をクリック

数十秒で `https://あなたのプロジェクト名.vercel.app` が発行され、サイトとチャットAPIが両方公開されます。

### 4. APIキーを環境変数として登録
1. Vercelのダッシュボードで、今作ったプロジェクトを開く
2. 「Settings」タブ →「Environment Variables」
3. Key: `GEMINI_API_KEY` / Value: 手順1で取得したキーを貼り付け
4. 「Save」
5. **「Deployments」タブ → 最新のデプロイの「...」メニュー →「Redeploy」**
   （環境変数は追加しただけでは反映されないので、再デプロイが必要です）

これで完了です。`js/chat.js` 側の変更は不要です（`/api/chat` は同じサイト内の相対パスなので、
デプロイ先のURLがどこであっても自動的に正しい場所を指します）。

## サイト内容を更新したら

`system-prompt.txt` が人間が読む・編集する側の原本です。内容を変えたら、
**`chat.js` 内の `SYSTEM_PROMPT` 定数にも同じ内容を反映してから** GitHubにpushしてください
（Vercelと連携していれば、pushするだけで自動的に再デプロイされます）。

## ローカルで動作確認したい場合

```bash
npm install -g vercel
cd muon
vercel dev
```

`.env.local` ファイルを `muon/` 直下に作り、`GEMINI_API_KEY=あなたのキー` と書いておくと、
ローカルでも `/api/chat` が動きます。**`.env.local` は `.gitignore` に入れて、絶対にpushしないでください。**

## コスト目安

- Gemini 2.5 Flash-Lite（最も安価な階層）を使用。個人サイトの問い合わせ程度の量なら
  無料枠に収まることが多いですが、モデル名・料金・無料枠は変わるので
  [Google AI Studio](https://aistudio.google.com) の Models ページで最新情報を確認してください。
- Vercel の Hobby プランは無料で、この規模のサイト＋API呼び出しなら基本無料で収まります。

## 動作しない時に確認すること

- ブラウザのコンソールに `[chat] request failed:` が出ていないか
- 環境変数 `GEMINI_API_KEY` を登録した後、**再デプロイ**したか
- Vercelの「Deployments」→ 該当デプロイの「Functions」ログにエラーが出ていないか
- ローカル確認時は `.env.local` が正しく置かれているか
