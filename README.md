# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## n8n で日次サンプル投稿・コメントを自動化する

このリポジトリには、n8n から安全に呼び出せる Cloud Functions エンドポイント `seedDailySamples` を追加しています。

### 1. Functions の環境変数を設定

`functions/.env` または Firebase Functions の環境変数に以下を設定します。

- `N8N_AUTOMATION_KEY`: n8n から送る共有シークレット
- `SAMPLE_POST_AUTHOR_UID`: サンプル投稿者の Firebase Auth UID
- `SAMPLE_COMMENT_AUTHOR_UID`: サンプルコメント投稿者の Firebase Auth UID（省略時は投稿者と同じ）

サンプル投稿/コメントの表示名・アイコンは `users/{uid}` の内容を使用します。

### 2. API 仕様

HTTP POST:

`https://<region>-<project-id>.cloudfunctions.net/seedDailySamples`

Header:

- `Content-Type: application/json`
- `x-automation-key: <N8N_AUTOMATION_KEY>`

Body 例:

```json
{
	"postDrafts": [
		{
			"body": "AIで作ったメロを人間っぽく直したい。どこから手を付けるべき？",
			"worryGenre": "AI作曲",
			"musicGenre": "J-POP",
			"daw": "Logic Pro"
		},
		{
			"body": "低音が濁る。キックとベースの住み分けで最初に見るポイントは？",
			"worryGenre": "ミックス",
			"musicGenre": "EDM",
			"daw": "Ableton Live"
		},
		{
			"body": "サビだけ弱い。コード進行の持ち上げ方を知りたい。",
			"worryGenre": "コード進行",
			"musicGenre": "Anime",
			"daw": "Cubase"
		}
	],
	"commentDrafts": [
		{
			"body": "メロ先なら、まずリズム密度を整えると自然になります。"
		},
		{
			"body": "キックは 50-80Hz、ベースは 90-140Hz に主役帯域を分けると改善しやすいです。"
		},
		{
			"body": "サビ前でテンションを 1 段上げると、持ち上がりが出やすいです。"
		}
	]
}
```

注意:

- `postDrafts` と `commentDrafts` はそれぞれ最大 3 件まで処理されます。
- `commentDrafts[].postId` を指定しない場合は、今回作成した投稿または直近投稿に自動で紐づきます。
- `dryRun: true` を渡すと保存せず件数検証だけ行えます。

### 3. n8n ワークフロー例（毎日 1 回）

1. Cron ノード
	 - 毎日 09:00（Asia/Tokyo）

2. Firestore/HTTP 取得ノード（悩みの察知）
	 - 例: 直近 24 時間の `posts` と `comments` を取得
	 - 追加で Reddit / X / Discord など外部コミュニティを取得しても可

3. AI ノード（OpenAI 等）
	 - 入力: 収集した投稿・コメント本文
	 - 出力フォーマットを JSON 固定で指示:

```json
{
	"postDrafts": [
		{"body": "...", "worryGenre": "...", "musicGenre": "...", "daw": "..."},
		{"body": "...", "worryGenre": "...", "musicGenre": "...", "daw": "..."},
		{"body": "...", "worryGenre": "...", "musicGenre": "...", "daw": "..."}
	],
	"commentDrafts": [
		{"body": "..."},
		{"body": "..."},
		{"body": "..."}
	]
}
```

4. Function ノード（JSON 整形・上限保証）
	 - 3 件を超える場合は先頭 3 件に切り詰め
	 - body の空文字を除外

5. HTTP Request ノード（投稿実行）
	 - Method: POST
	 - URL: `seedDailySamples` の URL
	 - Header: `x-automation-key`
	 - Body: AI ノードの JSON

6. Slack/Discord 通知ノード（任意）
	 - 作成件数と作成IDを運営チャンネルへ通知

### 4. まずは手動テスト

`dryRun: true` で 200 が返ることを確認後、`dryRun` を外して本投入してください。
