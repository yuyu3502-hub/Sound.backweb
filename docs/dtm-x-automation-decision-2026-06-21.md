# DTM/X投稿自動化 方針 2026-06-21

対象は Sound.back 周辺のDTM/X運用。どるなるではなく Sound.back。

## 結論

現時点では、主軸はローカルn8nのままが良い。

Codex Automationは、n8nの代替ではなく「編集レビュー」「日次の候補確認」「運用品質の改善提案」に使う。

理由は、今のn8n構成がすでに以下を持っているため。

- 複数ソース取得
- LLM投稿文生成
- 品質ゲート
- queued / needs_review / exclude の保存
- ntfyスマホ通知
- X API自動投稿ノード無効化による誤投稿防止

Codex Automationへ完全移行すると、常時稼働、通知、保存、再実行、外部連携の安定性を作り直す必要がある。ローカルn8nを使う前提なら、ここを捨てるメリットは小さい。

## 比較

| 観点 | ローカルn8n | Codex Automation |
| --- | --- | --- |
| 定期実行 | 強い。Cron/Manual Triggerで管理しやすい | できる。ただしCodexアプリと対象プロジェクトが使える状態に依存 |
| 複数ソース取得 | 強い。HTTP/RSS/Codeノードで可視化しやすい | できるが、ワークフローの見通しはn8nより落ちる |
| 通知 | ntfyなどと相性が良い | Inbox/Triage中心。スマホ通知は別途工夫が必要 |
| 下書き保存 | JSON/Markdown/HTML保存済み | ファイル保存は可能だが、定常運用としては設計が必要 |
| 投稿文の品質改善 | LLMノードで可能。ただしプロンプト管理が重くなる | 強い。会話しながら修正方針を反映しやすい |
| 誤投稿防止 | ノード無効化で明示できる | 可能。ただしGUI/外部操作は権限設計が重要 |
| 監査性 | 実行結果とノード構成が見える | 会話ログには強いが、バッチ結果一覧は設計が必要 |
| 運用コスト | n8nを起動しておく必要あり | Codex側のAutomation設定が必要 |
| 変更しやすさ | 分岐/保存/通知は強い | 文章ルールや判断基準の変更に強い |

## 採用構成

### n8nでやる

- DTMネタの定期取得
- 複数ソースの統合
- ルールベース抽出
- LLM生成
- queued / needs_review / exclude 分類
- ローカル保存
- ntfy通知

### Codex Automationでやる

- 直近queued候補のレビュー
- その日のベスト1本の選定
- 投稿文の自然さチェック
- NG表現、分類ミス、根拠不足の指摘
- Sound.back本体投稿との比率確認
- 週次で「反応が出そうな切り口」を改善

### やらない

- X API自動投稿
- Codexによる投稿ボタン押下
- maker/product_name/deal_typeが弱い候補の自動投稿
- article / unknown の自動投稿

## 追加した共通品質ゲート

`scripts/check_dtm_x_draft.mjs` を追加。

n8nのExecute Commandノード、Codex Automation、手元確認のどれからでも使える。

チェック内容:

- 280字以内
- 140〜220字目安から外れた場合の警告
- URL必須
- `#DTM #DTMer` 必須
- 禁止表現
- maker / product_name 必須
- 投稿文内にmakerまたはproduct_nameが自然に入っているか
- product_typeの混同
- article / unknown 除外
- deal_type unknown 除外
- confidence 90未満レビュー
- 「過去最安値」など根拠が必要な表現の警告

実行例:

```bash
node scripts/check_dtm_x_draft.mjs /path/to/draft.json
```

stdinでも使える。

```bash
cat /path/to/draft.json | node scripts/check_dtm_x_draft.mjs
```

## n8n側のブラッシュアップ案

次にn8nへ反映するなら、`Build Kontaktina Style Drafts` の直後、または `Quality Gate Summary` の直前に、この品質ゲート相当のCodeノードを入れる。

2026-06-21時点で、ローカルn8nの workflowId `23DYYOsoZqYNREw4` には `Check DTM X Draft Text Gate` ノードを挿入済み。

最小構成:

1. `Build Kontaktina Style Drafts`
2. `Check DTM X Draft Text Gate`
3. `Quality Gate Summary`
4. 保存/通知

`Check DTM X Draft Text Gate` では、各draftに以下を追加する。

- `charCount`
- `automationFlags`
- `automationWarnings`
- `automationGate`

`automationGate` が `needs_review` または `exclude` なら、既存statusをqueuedへ戻さない。

## Codex Automation用プロンプト

```text
毎日9:00に、ローカルn8nのDTM/X下書き結果をレビューしてください。

対象:
/Users/yamadayuusuke/Documents/Codex/2026-06-15/files-mentioned-by-the-user-sysdiagnose/x_draft_store/latest.json

目的:
queued候補から、今日スマホで手動投稿する価値がある1本を選ぶ。

必ず確認:
- article / unknownではない
- deal_type unknownではない
- makerとproduct_nameがある
- 無料/セール/期限/価格表現に根拠がある
- URLがある
- 280字以内
- 禁止表現がない
- sample_packをプラグイン/音源と書いていない
- preset_packをプラグインと書いていない
- effectをソフト音源と書いていない
- FreeKontaktina由来で古すぎない
- Sound.backではなくDTM情報投稿として自然

出力:
1. 今日の投稿候補1本
2. 文字数
3. ソースURL
4. 選んだ理由
5. 他候補を落とした理由

X API投稿や投稿ボタン押下はしない。
```

## 運用判断

今は「n8nで生成、Codexで選定/監査、ユーザーがスマホで投稿」が最適。

Codex Automation単体へ寄せるのは、以下が揃ってからでよい。

- n8nを起動し続けるのが負担になった
- ntfy通知が不要になった
- 投稿候補が1日1本で十分になった
- 保存HTMLやJSONL履歴が不要になった
- Codex側のAutomation結果だけで運用できると確認できた
