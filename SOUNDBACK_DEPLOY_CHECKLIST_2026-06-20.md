# Sound.back Deploy Checklist 2026-06-20

Sound.back の成長導線改善を安全に公開するためのチェックリスト。

対象は Sound.back。どるなる側のファイルや運用には触らない。

## 今回出す変更

- 未ログイン初回訪問者向けのトップ導線改善
- X/外部共有から来た未ログイン訪問者向けの案内パネル
- 投稿一覧途中/空状態から投稿へ戻す導線
- Sound.back本体の共有/紹介導線
- プロフィールページの共有/紹介導線
- マイページから自分の公開プロフィールを共有する導線
- プロフィール編集の自己紹介テンプレート
- 投稿詳細、投稿カード、作成完了後の X 相談募集導線
- コメント前の登録導線と、登録後にコメントフォームへ戻す流れ
- コメント/投稿テンプレート
- 投稿本文補助と投稿前の入力確認
- Firebase Analytics イベント追加
- `allowExternalFeature` による公式 X 紹介許可
- 管理画面の「公式紹介OK投稿」一覧、X文コピー、X下書き
- OGP、Twitter card、manifest、robots、sitemap

## デプロイ前に実行するコマンド

```bash
npm run check:predeploy
```

成功条件:

- ESLint エラーがない
- Vite build が通る
- 公開資材チェックで OGP/robots/sitemap/manifest/ルート別メタの必須項目が通る
- Firestore rules の dry-run が compile successful になる

2026-06-20 確認:

- `npm run check:public` 成功
- `npm run lint` 成功
- `npm run build` 成功
- `npx firebase deploy --only firestore:rules --dry-run` 成功
- `npm run check:predeploy` 成功
- `npm run check:live` 成功

## デプロイ後に実行するコマンド

```bash
npm run check:live
```

2026-06-20 現本番確認:

- デプロイ前は `npm run check:live` が失敗
- デプロイ前の本番は旧ビルドで、`title` が `soundback-web`
- デプロイ前は `/robots.txt`, `/sitemap.xml`, `/site.webmanifest`, `/og-image.png` がHTMLへrewriteされていた

2026-06-20 デプロイ結果:

- `npx firebase deploy --only hosting,firestore:rules` 成功
- Hosting URL: `https://sound-fix-ecfcf.web.app`
- `npm run check:live` 成功
- 2026-06-20: `/about` の相談例/返信例追加後、`npx firebase deploy --only hosting` 成功
- 2026-06-20: 追加後の `npm run check:live` 成功
- 2026-06-20: 公開済み AboutPage チャンクに「相談例」「返信例」「長文じゃなくても、相談できます。」が含まれることを確認
- 2026-06-20: 運営サンプル相談追加後、`npm run check:predeploy` 成功
- 2026-06-20: 運営サンプル相談追加後、`npx firebase deploy --only hosting` 成功
- 2026-06-20: 運営サンプル相談追加後、`npm run check:live` 成功
- 2026-06-20: 公開済み AdminDashboardPage / CreatePostPage チャンクに「運営サンプル相談」「post_sample_draft_apply」が含まれることを確認
- 2026-06-20: X相談募集文の秒数行/280字内短縮追加後、`npm run check:predeploy` 成功
- 2026-06-20: X相談募集文の秒数行/280字内短縮追加後、`npx firebase deploy --only hosting` 成功
- 2026-06-20: X相談募集文の秒数行/280字内短縮追加後、`npm run check:live` 成功
- 2026-06-20: 公開済み sharePost チャンクに「付近を聴いてもらえると助かります」が含まれることを確認
- 2026-06-20: `/about` の安心セクション追加後、`npm run check:predeploy` 成功
- 2026-06-20: `/about` の安心セクション追加後、`npx firebase deploy --only hosting` 成功
- 2026-06-20: `/about` の安心セクション追加後、`npm run check:live` 成功
- 2026-06-20: 公開済み AboutPage チャンクに「安心して使うために」「外部紹介は自分で選べます」が含まれることを確認
- 2026-06-20: 未返信カードの「返し方」ヒント追加後、`npm run check:predeploy` 成功
- 2026-06-20: 未返信カードの「返し方」ヒント追加後、`npx firebase deploy --only hosting` 成功
- 2026-06-20: 未返信カードの「返し方」ヒント追加後、`npm run check:live` 成功
- 2026-06-20: 公開済み投稿カードチャンクに「返し方」「良い点・気になった所」が含まれることを確認
- 2026-06-20: 管理画面の「今日の運用順」追加後、`npm run check:predeploy` 成功
- 2026-06-20: 管理画面の「今日の運用順」追加後、`npx firebase deploy --only hosting` 成功
- 2026-06-20: 管理画面の「今日の運用順」追加後、`npm run check:live` 成功
- 2026-06-20: 公開済み AdminDashboardPage チャンクに「今日の運用順」「admin_daily_action_click」が含まれることを確認
- 2026-06-20: Sound.back紹介投稿の関数側280字ガード追加後、`npm run check:predeploy` 成功
- 2026-06-20: Sound.back紹介投稿の関数側280字ガード追加後、`npx firebase deploy --only hosting` 成功
- 2026-06-20: Sound.back紹介投稿の関数側280字ガード追加後、`npm run check:live` 成功
- 2026-06-20: 公開済み AdminDashboardPage チャンクに「Sound.back紹介文が280字を超えています」が含まれることを確認
- 2026-06-20: `/about` のFAQ追加後、`npm run check:predeploy` 成功
- 2026-06-20: `/about` のFAQ追加後、`npx firebase deploy --only hosting` 成功
- 2026-06-20: `/about` のFAQ追加後、`npm run check:live` 成功
- 2026-06-20: 公開済み AboutPage チャンクに「よくある質問」「無料で使えますか」が含まれることを確認
- 2026-06-20: `/about` FAQPage JSON-LD追加後、`npm run check:predeploy` 成功
- 2026-06-20: `/about` FAQPage JSON-LD追加後、`npx firebase deploy --only hosting` 成功
- 2026-06-20: `/about` FAQPage JSON-LD追加後、`npm run check:live` 成功
- 2026-06-20: 公開済み index チャンクに「FAQPage」「soundback-route-structured-data」が含まれることを確認
- `/about`, `/search?source=about`, `/create`, `/post/__smoke__`, `/users/__smoke__` がアプリシェルを返る
- `/robots.txt` が `text/plain` で返る
- `/og-image.png` が `image/png` で返る
- `/sitemap.xml` に `/` と `/about` が含まれる
- `/site.webmanifest` の `name` が `Sound.back`

## デプロイ前の目視確認

- `/` の未ログイン表示で、Sound.back が「曲の悩みを音で相談できる場所」と伝わる
- `/` のヘッダー/サイドバーから「Sound.backとは」で `/about` へ進める
- `/about` でSound.backの説明ページが表示される
- `/about` の「相談を投稿」から投稿作成導線へ進める
- `/about` の「返信募集中を見る」から未返信一覧へ進める
- `/about` の「悩みを探す」から検索ページへ進める
- `/about` の相談例/返信例から、投稿作成と返信募集中一覧へ進める
- `/about` に「安心して使うために」が表示され、外部紹介の選択・短い返信・未完成相談について説明される
- `/about` に「よくある質問」が表示され、無料利用/投稿できる音源/外部紹介/返信の詳しさを確認できる
- `/about` のFAQPage JSON-LDが生成される
- `/about` の X下書き / URLコピー が動く
- 未ログインの「相談を投稿」が `/auth?mode=register` 経由で `/create` に戻る
- 未ログインの投稿/返信導線で、認証URLに `returnTo` が付く
- 認証画面をリロードしても、登録後に `/create` または `/post/:id?comment=1` へ戻れる
- `/auth?mode=register` で登録前の文脈パネルが表示される
- `/auth?mode=register` かつ `returnTo=/create` 相当の導線で、投稿作成に戻る説明が出る
- コメント目的の登録導線では、元の投稿に戻ってコメントできる説明が出る
- 未ログインの「投稿を見る」がフィードへスクロールする
- `/?utm_source=x&utm_medium=social&utm_campaign=app_intro&utm_content=home` で案内パネルが表示される
- `/?utm_source=x&utm_medium=social&utm_campaign=post_share&utm_content=test` で「返信募集中を見る」が表示される
- 案内パネルの「返信募集中を見る」で未返信表示へ切り替わる
- 案内パネルの「相談を投稿」で登録後 `/create` へ戻る導線になる
- 案内パネルの「閉じる」でその場から消える
- 未ログインのヒーローにある「Xで紹介」が X intent を開き、投稿ボタンは押されない
- 未ログインの投稿一覧途中に「相談を投稿」導線が出る
- 投稿一覧の空状態に投稿CTAが出る
- サイドバーの URL共有 / X下書き が動く
- サイドバーの統計が実データの投稿数/音源つき投稿数/返信合計として表示される
- プロフィールページの URL共有 / Xで紹介 が動く
- プロフィールページ内の投稿カードで返信数が表示され、「返信する」からコメントフォームへ進める
- プロフィール編集で自己紹介テンプレートを押すと、本文が200字以内で入力される
- プロフィール保存成功時にマイページへ戻る
- 投稿カードの共有ボタンが共有またはコピーとして動く
- 投稿カードの「相談募集」が X intent を開き、投稿ボタンは押されない
- 投稿詳細の共有/コピーと「Xで相談を募集」が動く
- 投稿詳細の投稿者カードから公開プロフィールへ進める
- 未ログインでコメントしようとすると登録へ進み、戻った後にコメントフォームが開く
- 未ログインの投稿詳細に「この投稿にコメント / 自分も相談する」導線が出る
- 投稿詳細の「自分も相談する」が `/auth?mode=register` 経由で `/create` に戻る
- ログイン済み閲覧者に返信スターターが表示される
- コメントフォームに投稿内容に合わせた返信下書き補助が表示される
- 返信下書き補助を押すとコメント本文へ挿入される
- コメント投稿成功時に `comment_submit_success` が流れる
- コメント投稿成功後に「返信募集中を見る」「ランキングを見る」が表示される
- ベストアンサー選択成功時に `best_answer_select_success` が流れる
- 投稿作成画面でテンプレートが入る
- 投稿作成画面で入力したタイトル/本文が、ページ再訪時に下書きとして復元される
- 下書きの「破棄」で本文/タイトルなどが消え、次回復元されない
- 下書き保存対象に音源/画像ファイルが含まれない
- 投稿作成画面で本文補助ボタンが本文に項目を追加する
- 投稿前の確認パネルがタイトル/本文/音源/秒数に反応する
- 投稿作成画面の「返信されやすさ」が本文/音源/秒数に反応する
- 「返信されやすさ」の追加ボタンで不足項目が本文に追加される
- `Sound.back公式Xなどで紹介されてもOK` は初期値 OFF
- 投稿成功後、作成した投稿詳細へ遷移し、X相談募集バナーが出る
- 自分の投稿詳細だけに「公式紹介OK」タグが出る
- 管理画面で「Sound.back紹介投稿」の X文コピー / X下書き が動く
- Sound.back紹介投稿に、初回紹介/見るだけ導線/投稿促進/返信募集/AI作曲/ミックス相談が表示される
- Sound.back紹介投稿の文字数が表示され、280字超過時はコピー/下書きが無効になる
- Sound.back紹介投稿は、関数側でも280字超過時にコピー/下書きを止める
- Sound.back紹介投稿URLに `utm_content=draft_id` が付く
- 返信募集の紹介投稿URLが `sort=unanswered` を含む
- 管理画面で「Xプロフィール素材」のプロフィール文/固定ポスト候補をコピーできる
- Xプロフィール素材は制限文字数を表示し、超過時はコピーが無効になる
- 管理画面で「運営サンプル相談」が表示される
- 運営サンプル相談の「投稿作成へ」から、タイトル/本文/ジャンル/DAW/気になる秒数が入った投稿作成画面へ進める
- 管理画面で「公式紹介OK投稿」が表示される
- 公式紹介OK投稿のX文文字数が表示され、280字超過時はコピー/下書きが無効になる
- 管理画面の「X文コピー」は文面コピーだけ、「X下書き」は X intent を開くだけ
- 管理画面の「公開前に走らせるコマンド」から `npm run check:predeploy` をコピーできる
- 管理画面の「公開後チェック」から公開トップ/説明ページ/OG画像/robots/sitemap/manifestを開ける
- 管理画面の「今日の運用順」から、説明ページ/プロフィール素材/サンプル相談/X下書き/計測ガイドへ進める
- 管理画面の「成長施策 計測ガイド」で、流入/初回閲覧/相談探し/登録/投稿/返信/再訪と通知/公式運用のイベントを確認できる
- 検索ページが投稿検索タブから始まり、クイック検索と空状態の投稿CTAが表示される
- `/search?source=about` で説明ページ経由向けの案内が表示され、ミックス/AI作曲/相談投稿へ進める
- ホームで「未返信」並び替えが使え、返信0件の投稿に「返信募集中」が表示される
- ホーム/検索の未返信カードに「返し方」ヒントが表示される
- ホームの「返信募集中」ピックアップから相談詳細/返信/未返信一覧へ進める
- ランキングページに概要と参加CTAが出て、「返信募集中を見る」から未返信一覧へ進める
- ホーム/検索結果の投稿カードから「返信する」でコメントフォームへ進める
- 投稿詳細でX文コピーができ、280字超過時は無効になる
- マイページに「次にやること」が表示され、初回投稿/未解決投稿/プロフィール編集へ進める
- マイページの「表示」から自分の公開プロフィールへ進める
- マイページの「共有」「Xで紹介」が動き、投稿ボタンは押されない

## URL / SEO 確認

- `VITE_PUBLIC_APP_URL` は `https://sound-fix-ecfcf.web.app`
- X 共有URLが `localhost` ではなく公開URLになる
- X 共有URLに `utm_source=x&utm_medium=social&utm_campaign=post_share&utm_content=投稿ID` が付く
- 通常共有URLに `utm_source=app_share&utm_medium=share&utm_campaign=post_share&utm_content=投稿ID` が付く
- 気になる秒数がある投稿のX相談募集文に `0:42付近` のような秒数行が入る
- 投稿IDやタイトルが長い場合でも、X相談募集文が280字以内に短縮される
- Sound.back本体共有URLに `utm_campaign=app_intro&utm_content=home` が付く
- プロフィール共有URLに `utm_campaign=profile_share&utm_content=ユーザーUID` が付く
- UTM付きURLで来た後の `auth_success` / `post_submit_success` に `acquisition_campaign` などが付く
- `/robots.txt` が開ける
- `/sitemap.xml` が開ける
- `/about` が開ける
- `/site.webmanifest` が開ける
- `/og-image.png` が1200x630のPNGとして開ける
- `/about`, `/search`, `/create` で title / description / canonical がページ内容に切り替わる
- Xカード確認で title / description / image が Sound.back になり、large image 表示になる

## Analytics 確認

Firebase Analytics の DebugView またはイベント一覧で、最低限以下が流れるか見る。

主要イベントには以下の流入元パラメータが付くかも確認する。

- `acquisition_source`
- `acquisition_medium`
- `acquisition_campaign`
- `acquisition_content`
- `acquisition_landing_path`

- `create_post_cta_click`
- `home_guest_browse_click`
- `home_about_click`
- `about_cta_click`
- `about_share_click`
- `home_landing_context_view`
- `home_landing_context_click`
- `home_landing_context_dismiss`
- `home_post_open`
- `home_guest_genre_filter`
- `home_feed_sort_change`
- `search_quick_filter_click`
- `search_about_context_view`
- `search_about_context_click`
- `search_post_submit`
- `search_post_open`
- `search_empty_create_click`
- `post_author_profile_open`
- `ranking_view`
- `ranking_cta_click`
- `home_feed_sort_deeplink`
- `app_share_click`
- `profile_share_click`
- `mypage_public_profile_open`
- `profile_bio_prompt_apply`
- `profile_update_success`
- `profile_update_failed`
- `comment_signup_cta_click`
- `home_reply_spotlight_click`
- `feed_reply_cta_click`
- `comment_start_cta_click`
- `comment_assist_apply`
- `comment_submit_success`
- `comment_submit_failed`
- `comment_success_next_action_click`
- `comment_intent_restored`
- `comment_template_apply`
- `comment_starter_click`
- `best_answer_select_success`
- `best_answer_select_failed`
- `notifications_view`
- `notification_open`
- `notification_comment_focus`
- `notifications_empty_cta_click`
- `auth_view`
- `auth_context_view`
- `auth_tab_change`
- `auth_success`
- `post_template_apply`
- `post_draft_restore`
- `post_draft_discard`
- `mypage_next_action_click`
- `post_body_prompt_apply`
- `post_reply_hint_apply`
- `post_submit_success`
- `post_share_click`
- `post_x_text_copy`
- `post_created_share_cta_click`
- `admin_app_intro_x_text_copy`
- `admin_app_intro_x_draft_open`
- `admin_x_profile_text_copy`
- `admin_daily_action_click`
- `admin_sample_post_draft_open`
- `post_sample_draft_apply`
- `admin_feature_post_x_text_copy`
- `admin_feature_post_x_draft_open`
- `admin_pre_deploy_checks_copy`
- `admin_public_check_open`

## Firestore Rules 注意点

- `posts` の schema に `allowExternalFeature` が含まれていること
- 新規投稿では `allowExternalFeature is bool` が必須
- 投稿者の編集では `allowExternalFeature` の bool 更新が許可される
- 既存投稿に `allowExternalFeature` が無い場合、管理画面の紹介OK一覧には出ない

## 公開後スモークチェック

- トップページ: `https://sound-fix-ecfcf.web.app/`
- 登録導線: `/auth?mode=register`
- 投稿作成: `/create`
- 投稿詳細: 既存投稿の `/post/:id`
- 管理画面: `/admin`
- 通知ページ: `/notifications`
- 静的ファイル:
  - `/robots.txt`
  - `/sitemap.xml`
  - `/site.webmanifest`

確認する流れ:

1. 未ログインでトップを開く
2. 投稿を見る
3. 投稿詳細を開く
4. コメントCTAから登録画面へ進む
5. ログイン後に投稿詳細へ戻る
6. 投稿作成テンプレートを使って下書き状態を確認する
7. プロフィール編集で自己紹介テンプレートを押して保存する
8. `allowExternalFeature` を ON にしたテスト投稿だけが管理画面候補に出ることを確認する
9. 管理画面から X 文コピー、X 下書きを確認する

## X 運用

- 使用アカウント: `@SoundBack_0510`
- 自動投稿はしない
- X intent を開いた場合も、最後の投稿ボタンはユーザーが押す
- 外部紹介に使う投稿は `allowExternalFeature=true` のものだけ
- 内容が曖昧、権利的に不安、本人の許可が読み取れない投稿は紹介しない
- 固定ポストやプロフィール変更は公開変更なので、実行前に明示確認を取る

## もし変なら見る場所

- X共有URLが `localhost` になる:
  - `.env` またはホスティング環境の `VITE_PUBLIC_APP_URL` を確認
- 管理画面の公式紹介OK投稿が空:
  - `allowExternalFeature=true` の投稿が存在するか確認
- 投稿作成で保存できない:
  - Firestore rules と送信payloadの `allowExternalFeature` を確認
- 登録後にコメントへ戻らない:
  - 認証URLに `returnTo=/post/:id?comment=1` が付いているか確認
  - リロード後も `returnTo` が維持されているか確認
- Analytics が見えない:
  - Firebase Analytics の設定、ブラウザの広告ブロック、DebugView を確認

## 今すぐは実行しないこと

- X API 自動投稿の有効化
- ユーザー投稿の無許可紹介
- どるなる側のデプロイや文言変更
- 固定ポストやプロフィールの無確認変更
