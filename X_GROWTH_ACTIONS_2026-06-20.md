# Sound.back X Growth Actions 2026-06-20

対象は Sound.back。どるなる側の運用には触らない。

## 確認状況

- `https://x.com/SoundBack_0510` と `https://twitter.com/SoundBack_0510` を確認しようとした。
- Web取得ではXページのHTMLは開けたが、プロフィール文や直近投稿本文は読めなかった。
- そのため、現在のXプロフィール文/固定ポストの実内容を断定して変更判断しない。
- Xプロフィール編集、固定ポスト変更、投稿ボタン押下は手動作業として残す。
- 2026-06-20: 固定ポスト候補をSafariのX intentで投稿直前まで開いた。投稿ボタンは押していない。

## 今日やる順番

管理画面 `/admin` の「今日の運用順」から進める。

1. Sound.back本体を公開する。
2. 公開後チェックを通す。
   - `npm run check:predeploy`
   - デプロイ後に `npm run check:live`
   - 管理画面の公開後チェックリンクで、公開トップ/説明ページ/OG画像/robots/sitemap/manifestを開く。
3. XプロフィールURLを `https://sound-fix-ecfcf.web.app/about` にする。
4. 固定ポスト候補を投稿する。
5. 固定ポスト後、1本だけ「見るだけOK」導線の投稿を出す。
6. 24時間後に以下を見る。
   - `page_view` の `utm_source=x`
   - `about_cta_click`
   - `home_about_click`
   - `home_guest_browse_click`
   - `home_post_open`
   - `create_post_cta_click`
   - `admin_daily_action_click`

## プロフィール文候補

```text
Sound.back｜曲の悩みを音源つきで相談できる場所。ミックス/AI作曲/DAW操作など、気になる秒数を添えて壁打ちできます。#DTM
```

160字以内。プロフィールURLは `/about` 推奨。

## 固定ポスト候補

```text
曲を作っていて、
「どこが悪いのか分からない」
「ミックスが一人だと詰まる」
「AI作曲を自然に直したい」
みたいな時に、音源つきで相談できる場所を作っています。

Sound.back
音楽制作の悩みを、音で相談するコミュニティ。

https://sound-fix-ecfcf.web.app/about
#DTM #DTMer
```

投稿前に280字以内を再確認する。

## 固定ポスト直後の投稿候補

```text
いきなり投稿しなくても大丈夫です。

Sound.backは、他の人の相談を聴いて「良い点」「気になった秒数」「確認したいこと」から短く返せる場所です。
DTMの壁打ち場所として育てています。

https://sound-fix-ecfcf.web.app/?utm_source=x&utm_medium=social&utm_campaign=app_intro&utm_content=browse
#DTM #DTMer
```

## 2本目以降の運用

- DTM情報投稿を2〜3本出したら、Sound.back本体へ戻す投稿を1本入れる。
- セール/無料配布投稿だけに偏らせず、以下を混ぜる。
  - 未返信相談を見る投稿
  - AI作曲の手直し相談に寄せた投稿
  - ミックス相談に寄せた投稿
  - 公式紹介OK投稿の相談募集

## 手動投稿手順

1. 管理画面の「Sound.back紹介投稿」から文面をコピーする。
2. 文字数が280字以内であることを確認する。
3. `X下書き` でX intentを開く。
4. 投稿本文とURLを目視確認する。
5. 最後の投稿ボタンだけ手動で押す。

## 実行しないこと

- X APIの自動投稿はしない。
- 投稿ボタンはCodexが押さない。
- ユーザー投稿を紹介する時は `allowExternalFeature=true` の投稿だけを使う。
- 音源本文の長い引用はしない。

## 未確認/あとで見ること

- 現在のXプロフィール文。
- 現在の固定ポスト。
- 直近投稿で反応が出ているテーマ。
- Xカードが実際に large image 表示になるか。
- `npm run check:live` はデプロイ後に成功済み。
- 公開後の `/about` と `/` のクリック率差。
