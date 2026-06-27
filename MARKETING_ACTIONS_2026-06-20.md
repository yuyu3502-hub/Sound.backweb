# Sound.back Growth Actions 2026-06-20

Sound.back を「音楽制作の悩みを音で相談できる場所」として広げるための実行メモ。

## X確認メモ

- 確認日: 2026-06-20
- アカウント: `@SoundBack_0510`
- プロフィールURL: `https://x.com/SoundBack_0510`
- 公開URL: `https://sound-fix-ecfcf.web.app/`
- プロフィール概要:
  - 23歳、音楽をやっている学生。
  - 音楽制作初心者が手軽に人に聞ける場所づくりを目指している。
  - 曲作りでAIに負けたくない、集合知で成長したい。
- 現在の数字:
  - 63 posts
  - 13 followers
  - 固定ポスト: 394 views / 5 likes / 1 repost
  - 直近DTM情報投稿: 20〜32 views程度

見立て:

- 固定ポストはプロフィール内では一番説明力がある。
- 直近投稿はDTMセール/無料素材ニュースが中心で、アプリ本体への導線が弱い。
- 「役立つ情報アカウント」として見られた後、Sound.backへ戻る理由を毎日1回は入れたい。

## 今日反映済み

- 投稿カードの共有ボタンを実動作化。
  - Web Share API 対応環境では共有シートを開く。
  - 非対応環境では投稿詳細 URL をクリップボードへコピーする。
- 投稿カードと投稿詳細ページに、X投稿画面を開く「相談募集」導線を追加。
  - 投稿ボタンはX側でユーザーが押す。
  - 本文は投稿タイトル、URL、`#DTM #DTMer` を含む。
  - 悩みジャンル/音楽ジャンル/DAWがある場合、相談文に文脈として入れる。
  - 気になる秒数がある投稿は、`0:42付近` のような秒数行を相談文に入れる。
  - 投稿IDやタイトルが長い場合は、X相談募集文を自動で短縮して280字以内に収める。
  - X共有URLには `utm_source=x&utm_medium=social&utm_campaign=post_share&utm_content=投稿ID` を付ける。
  - X共有URLは `VITE_PUBLIC_APP_URL` を優先し、ローカル管理画面からでも公開URLにする。
  - Firebase Analytics に `post_share_click` イベントを送る。
- 投稿詳細ページにも共有/コピー用ボタンを追加。
  - 通常共有/コピーURLには `utm_source=app_share&utm_medium=share&utm_campaign=post_share&utm_content=投稿ID` を付ける。
  - イベントパラメータは `post_id`, `channel`, `surface`, `result`。
- 投稿詳細ページに X文コピー導線を追加。
  - X投稿画面を開かず、相談募集文だけをコピーできる。
  - 280字の文字数を表示し、超過時はコピーを無効にする。
  - 投稿直後バナーにも X文コピーを追加する。
  - `post_x_text_copy` で `surface`, `result`, `char_count` を計測する。
- 投稿詳細ページのコメント欄上に、未ログイン向けの登録CTAを追加。
  - Firebase Analytics に `comment_signup_cta_click` イベントを送る。
  - イベントパラメータは `post_id`, `surface`。
  - 登録/ログイン後は元の投稿詳細へ戻り、コメントフォームを自動表示する。
  - フォーム復帰時に `comment_intent_restored` イベントを送る。
- 認証画面で、投稿へ戻れることを明示。
  - 認証画面表示時に `auth_view` イベントを送る。
  - 登録/ログイン成功時に `auth_success` イベントを送る。
  - イベントパラメータは `mode`, `has_return_to`, `return_to_type`。
  - `return_to_type` は `create_post`, `post_comment`, `post_detail`, `home`, `internal` に分類。
- 認証画面に登録前の文脈パネルを追加。
  - コメント目的、投稿作成目的、プロフィール共有/外部流入などで登録後の流れを出し分ける。
  - `returnTo=/create` の時に「この投稿に戻る」と出ていた文言を、投稿作成へ戻る説明に修正。
  - 表示時に `auth_context_view`、タブ変更時に `auth_tab_change` を送る。
  - `auth_success` に `context_id` と `campaign` を付け、どの登録前文脈が成功に繋がったか見られるようにする。
- 未ログイン導線の `returnTo` をURLにも保持するようにした。
  - ホーム/検索/投稿詳細/ランキング/プロフィール/マイページ/下部ナビの登録導線で `/auth?mode=register&returnTo=...` を使う。
  - 認証画面でリロードしても、登録後に `/create` や `/post/:id?comment=1` へ戻れる。
  - React Router の `state` も残し、既存の案内メッセージは維持する。
- 外部流入のUTM/参照元を保持し、主要イベントに付与するようにした。
  - `page_view` 時に `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` と外部referrerを保存する。
  - `auth_success`, `post_submit_success`, `post_share_click` など全カスタムイベントに `acquisition_*` パラメータを付ける。
  - `post_share`, `profile_share`, `app_intro` のどれが登録/投稿まで繋がったかを後から見られる。
  - 保存期間は90日。端末のlocalStorageが使えない場合はアプリ動作を優先して何もしない。
- 新規登録フォームに、登録後すぐできることを表示。
  - 投稿に戻ってコメントする
  - 自分の曲を音源つきで相談する
  - 返信やベストアンサーを受け取る
- マイページに「次にやること」パネルを追加。
  - 投稿0件の人には初回相談投稿を促す。
  - 未解決投稿がある人には、投稿詳細を開いてX募集やコピーに進める。
  - プロフィール未設定の人にはプロフィール編集を促す。
  - `mypage_next_action_click` で `action`, `destination`, `post_count`, `has_bio`, `has_photo` を計測する。
- マイページから自分の公開プロフィールを広げられるようにした。
  - プロフィール欄に「表示」「共有」「Xで紹介」を追加。
  - 共有URLはプロフィールページと同じ `utm_campaign=profile_share` を使う。
  - `profile_share_click(surface=mypage_profile)` で共有結果を計測する。
  - `mypage_public_profile_open` で自分の公開プロフィール表示を計測する。
- プロフィール編集に自己紹介テンプレートを追加。
  - ミックス相談 / AI作曲の手直し / 返信もします の3種類。
  - 外部共有された時に、何を相談したい人か・返信できる人かが伝わるようにする。
  - テンプレ使用時に `profile_bio_prompt_apply` を送る。
  - 保存成功時に `profile_update_success`、失敗時に `profile_update_failed` を送る。
  - `has_bio`, `has_photo`, `bio_length`, `photo_changed` を見て、プロフィール整備が共有や投稿に繋がるか確認できる。
- コメントフォームに返信テンプレートを追加。
  - 良い点＋直す点
  - 秒数つき
  - 質問する
  - テンプレ使用時に `comment_template_apply` イベントを送る。
- コメントフォームに投稿内容に合わせた返信下書き補助を追加。
  - 気になる秒数、ミックス、アレンジ、AI作曲などの文脈に合わせて候補を出す。
  - 候補使用時に `comment_assist_apply` を送る。
  - `suggestion_id`, `worry_genre`, `has_audio`, `has_focus_second` を見て、どの補助がコメント送信に繋がるか確認できる。
- 投稿詳細のコメント欄上に、ログイン済み閲覧者向けの返信スターターを追加。
  - 良い点を返す
  - 秒数で伝える
  - 質問する
  - フォームを開く前から返信の切り口を選べる。
  - クリック時に `comment_starter_click` イベントを送る。
- 投稿詳細の本文/音源直後に、コメント開始CTAを追加。
  - 未ログイン時は登録画面へ進み、投稿詳細へ戻ってコメントできる。
  - ログイン済み時はコメントフォームを開く。
  - ログイン済みクリック時に `comment_start_cta_click` イベントを送る。
- コメント投稿完了を計測できるようにした。
  - 投稿成功時に `comment_submit_success` を送る。
  - 失敗時に `comment_submit_failed` を送る。
  - `is_reply`, `has_image`, `body_length`, `post_comment_count_before` を見て、どの返信導線が投稿完了まで進むか確認できる。
- コメント投稿後の次アクションを追加。
  - 投稿成功後に「返信募集中を見る」「ランキングを見る」を表示する。
  - `comment_success_next_action_click` で、コメント後に続けて回遊するかを見る。
- ベストアンサー選択を計測できるようにした。
  - 成功時に `best_answer_select_success` を送る。
  - 失敗時に `best_answer_select_failed` を送る。
  - 返信が「解決体験」まで届いているかを確認できる。
- 投稿詳細の未ログイン向け次アクションを追加。
  - 共有URLから来た人に「この投稿にコメント」と「自分も相談する」を並べて出す。
  - コメント導線は `comment_signup_cta_click(surface=post_next_step_comment)` で計測する。
  - 投稿導線は `create_post_cta_click(surface=post_detail_next_step)` で計測する。
- 投稿詳細から投稿者プロフィールへ進みやすくした。
  - 投稿者名リンクに加えて、投稿者カードを表示する。
  - 「プロフィールを見る」から、その人の他の相談/解決済み投稿へ回遊できる。
  - `post_author_profile_open` で `surface`, `comment_count`, `is_post_author` を計測する。
- 通知からの再訪導線を改善。
  - コメントIDを持つ通知は、投稿詳細の該当コメントまで直接スクロールする。
  - 該当コメントを短時間ハイライトし、どの反応を見ればよいか分かりやすくする。
  - 通知ページの空状態から「投稿を見に行く」CTAを出す。
  - `notifications_view`, `notification_open`, `notification_comment_focus`, `notifications_empty_cta_click` で計測する。
- 投稿作成画面に、初回投稿用のテンプレートを追加。
  - ミックス相談
  - AI作曲の手直し
  - アレンジ相談
  - ホームの投稿CTAクリック時に `create_post_cta_click` イベントを送る。
  - 新規投稿の入力内容をこの端末に一時保存し、戻ってきた時に復元できるようにする。
  - 復元時に `post_draft_restore`、破棄時に `post_draft_discard` を送る。
  - 音源/画像ファイルは保存せず、タイトル/本文/ジャンル/DAW/秒数/公式紹介OKのみ保存する。
  - 投稿テンプレ使用時に `post_template_apply` イベントを送る。
  - 本文に「聴いてほしい所」「試したこと」「理想の雰囲気」「気になる秒数」を追加できる補助ボタンを追加。
  - 本文補助ボタン使用時に `post_body_prompt_apply` イベントを送る。
  - 投稿前の確認パネルを追加し、タイトル/本文/音源/秒数の入力状況を見えるようにする。
  - 返信されやすさチェックを追加し、聴いてほしい所/試したこと/聞きたいこと/音源/秒数を確認できるようにする。
  - 足りない本文項目を追加した時に `post_reply_hint_apply` を送る。
  - 投稿成功時に `post_submit_success` イベントを送る。
  - 投稿成功イベントに `reply_quality_percent` を含める。
  - 「Sound.back公式Xなどで紹介されてもOK」チェックを追加。
  - 投稿データに `allowExternalFeature` を保存する。
  - Firestore rules の投稿スキーマにも `allowExternalFeature` を追加。
  - 投稿成功イベントに `allow_external_feature` を含める。
  - 新規投稿後はホームではなく、作成した投稿詳細へ遷移する。
  - 投稿直後の詳細ページに、X相談募集を促す成功バナーを表示する。
  - バナーからX共有した時に `post_created_share_cta_click` イベントを送る。
- 投稿詳細で、自分の投稿にだけ「公式紹介OK」タグを表示。
- 運営ダッシュボードに「公式紹介OK投稿」を追加。
  - `allowExternalFeature=true` の投稿数をサマリー表示。
  - 直近の紹介許可済み投稿を一覧表示。
  - 投稿詳細へ移動して内容を確認できる。
  - 「X文コピー」から紹介文をクリップボードへコピーできる。
  - 「X下書き」からX投稿画面を開ける。投稿ボタンは押さない。
  - 投稿紹介文にも文字数を表示し、280字を超える場合はコピー/下書きを押せないようにする。
  - `admin_feature_post_x_text_copy` と `admin_feature_post_x_draft_open` で利用を計測。
- 運営ダッシュボードに「公開後チェック」を追加。
  - 公開前チェックコマンドをまとめてコピーできるカードを追加。
  - 公開前チェックは `npm run check:predeploy` に集約。
  - 公開トップ、OG画像、robots.txt、sitemap.xml、manifestをすぐ開ける。
  - `admin_pre_deploy_checks_copy` で公開前チェックコピーの利用を計測する。
  - `admin_public_check_open` で確認リンクの利用を計測する。
- 運営ダッシュボードに「成長施策 計測ガイド」を追加。
  - 流入/初回閲覧/相談探し/登録/投稿/返信/再訪と通知/公式運用ごとに、見るべきFirebase Analyticsイベントをまとめる。
  - 施策実行後にどのイベントを見るか迷わないよう、管理画面内で確認できるようにする。
- 運営ダッシュボードに「今日の運用順」を追加。
  - プロフィールURL、固定ポスト、運営サンプル相談、見るだけOK投稿、未返信誘導、24時間後の計測を順番に出す。
  - 各カードから説明ページ、Xプロフィール素材、サンプル相談作成、X下書き、計測ガイドへ進める。
  - `admin_daily_action_click` でどの運用カードが使われたかを見る。
- 運営ダッシュボードに「運営サンプル相談」を追加。
  - ミックス相談 / AI作曲 / 低音整理の3案から投稿作成画面へ進める。
  - タイトル、本文、ジャンル、DAW、気になる秒数を自動で下書き化し、音源添付だけ手動で進められる。
  - `admin_sample_post_draft_open` と `post_sample_draft_apply` で利用を計測する。
- 未ログインのファーストビュー文言を、音源つき相談の価値が伝わる内容へ変更。
- 未ログインのファーストビューに「相談を投稿」と「投稿を見る」の2段CTAを追加。
  - いきなり登録しない初回訪問者でも、先に投稿一覧を見られる。
  - 「投稿を見る」クリック時に `home_guest_browse_click` イベントを送る。
- ホームのフィード行動計測を追加。
  - 投稿詳細を開いた時に `home_post_open` イベントを送る。
  - ジャンルフィルター変更時に `home_guest_genre_filter` イベントを送る。
  - 並び替え変更時に `home_feed_sort_change` イベントを送る。
- ホームで返信が集まりやすい導線を追加。
  - 返信0件かつ未解決の投稿に「返信募集中」表示を付ける。
  - 投稿カード内にも「最初の返信を待っています」と表示する。
  - 未返信カードに「返し方」ヒントを追加し、良い点・気になった所・確認したいことだけでも返信できると伝える。
  - フィード並び替えに「未返信」を追加し、音源つき/新しい順で未返信投稿を見つけやすくする。
  - サイドバー統計に「返信募集中」件数を追加。
  - `home_feed_sort_change(sort_mode=unanswered)` と `home_post_open(reply_count=0)` で効果を見る。
- ホームに「返信募集中」ピックアップを追加。
  - 返信0件の投稿から、音源あり/気になる秒数あり/新しい順を優先して1件表示する。
  - 「相談を見る」「返信する」「もっと見る」から投稿詳細や未返信一覧へ進める。
  - `home_reply_spotlight_click` で `action`, `post_id`, `has_audio`, `has_focus_second` を計測する。
- ランキングページから参加へ進みやすくした。
  - ベストアンサー合計、掲載ユーザー、トップ回数を表示する。
  - 「返信募集中を見る」から `/?sort=unanswered&source=ranking` へ進める。
  - ホームは `sort=unanswered` のURLを受け取り、未返信一覧を開く。
  - `ranking_view`, `ranking_cta_click`, `home_feed_sort_deeplink` で流れを見る。
- 投稿カードから直接コメント開始できる導線を追加。
  - ホーム/検索結果の投稿カードに「返信する」CTAを表示する。
  - ログイン済みは `/post/:id?comment=1` に進み、コメントフォームを開く。
  - 未ログインは登録後に元の投稿コメントフォームへ戻る。
  - `feed_reply_cta_click` で、ホーム/検索どちらから返信意図が出ているかを見る。
- プロフィールページを紹介しやすくした。
  - プロフィールに URL共有 / Xで紹介 を追加。
  - プロフィール共有URLには `utm_source`, `utm_medium`, `utm_campaign=profile_share`, `utm_content=ユーザーUID` を付ける。
  - プロフィール内の投稿カードにも返信数と「返信する」導線を追加。
  - `profile_share_click` で channel / surface / result / post_count / unsolved_count を計測する。
  - プロフィール内の返信導線は `feed_reply_cta_click(surface=user_profile_card)` で計測する。
- 未ログインのフィード直前に、使い方の3ステップを追加。
  - 気になる投稿を聴く
  - 秒数つきで返す
  - 自分の曲も相談
  - Xから初めて来た人が、登録前に参加イメージを掴めるようにする。
- X/外部共有から来た未ログイン訪問者向けの案内パネルを追加。
  - `utm_campaign=post_share` では「返信募集中を見る」を主導線にする。
  - `utm_campaign=profile_share` では投稿閲覧と相談投稿へ案内する。
  - `utm_campaign=app_intro` やX referrerでは、見るだけ/短く返すだけでもよいことを伝える。
  - `sort=unanswered` のURLでは、返信募集中の相談を表示している理由を明示する。
  - 表示時に `home_landing_context_view`、クリック時に `home_landing_context_click`、閉じた時に `home_landing_context_dismiss` を送る。
- 未ログインの投稿一覧途中に、投稿参加CTAを追加。
  - 近い悩みを見たあとに、自分の曲でも相談できる流れを作る。
  - `create_post_cta_click(surface=feed_inline)` で計測する。
- 投稿一覧の空状態にも投稿CTAを追加。
  - 通常空状態は `surface=empty_feed`。
  - ジャンル絞り込み後の空状態は `surface=filtered_empty_feed`。
- 検索ページを「相談を探す」導線として改善。
  - 初期表示を投稿検索タブに変更。
  - ミックス相談 / AI作曲 / DAW操作 / アレンジ のクイック検索を追加。
  - 検索結果ゼロの時に、自分の相談投稿へ進めるCTAを追加。
  - 検索結果の投稿カード内操作と詳細遷移が干渉しないようにする。
  - `search_quick_filter_click`, `search_post_submit`, `search_post_open`, `search_empty_create_click`, `search_post_clear` で計測する。
- `/about` から検索ページへ来た人向けの案内を追加。
  - `source=about` の時だけ、ミックス/AI作曲/相談投稿へ進める案内を表示する。
  - `search_about_context_view` と `search_about_context_click` で利用を計測する。
- Sound.back本体を紹介しやすい共有導線を追加。
  - 未ログインのヒーローに「Xで紹介」を追加。
  - サイドバーに URL共有 / X下書き を追加。
  - アプリ本体共有URLには `utm_source`, `utm_medium`, `utm_campaign=app_intro`, `utm_content=home` を付ける。
  - `app_share_click` で channel / surface / result / signed_in を計測する。
- 管理画面に Sound.back 紹介投稿の運用導線を追加。
  - 初回紹介 / 見るだけ導線 / 投稿促進 / 返信募集 / AI作曲 / ミックス相談 の6種類を用意。
  - 「X文コピー」と「X下書き」だけを行い、自動投稿はしない。
  - 各紹介文に文字数を表示し、280字を超える場合はコピー/下書きを押せないようにする。
  - コピー/下書き関数側にも280字超過ガードを入れ、「今日の運用順」から呼んだ場合も止める。
  - 紹介URLの `utm_content` に `intro`, `browse`, `creator`, `reply_unanswered`, `ai_fix`, `mix_wall` などの draft_id を入れる。
  - 返信募集は `/?sort=unanswered&source=x_intro` へ誘導し、Xから来た人が返信対象をすぐ見られるようにする。
  - `admin_app_intro_x_text_copy` と `admin_app_intro_x_draft_open` で利用を計測する。
- 管理画面に Xプロフィール素材を追加。
  - プロフィール文と固定ポスト候補をコピーできる。
  - プロフィール文は160字、固定ポストは280字で文字数を表示し、超過時はコピーできない。
  - 実際のXプロフィール/固定ポスト変更は公開変更なので、ユーザー確認後に手動で行う。
  - `admin_x_profile_text_copy` で利用を計測する。
- ホームのコミュニティ統計を実データ表示に変更。
  - 水増しに見える「メンバー/週間投稿」ではなく、読み込めている投稿数、音源つき投稿数、返信合計を表示する。
  - 初期サービスの信頼感を落とさないため、説明できない数字は出さない。
- `index.html` の言語、title、description、OGP/Twitter card を Sound.back 向けに変更。
- `index.html` に公開URLの canonical / og:url を追加。
- 外部流入向けのメタ情報を追加。
  - `theme-color`, `application-name`, Twitter title/description を追加。
  - X/OGP用の `og-image.png` を追加し、`summary_large_image` に変更。
  - WebApplication の JSON-LD を追加。
  - `site.webmanifest` を追加。
  - `robots.txt` と `sitemap.xml` を追加。
  - ルート移動時に title / description / canonical / OGP / Twitter meta をページ内容に合わせて更新する。
  - `npm run check:public` で OGP/robots/sitemap/manifest/ルート別メタを公開前に検査できるようにした。
  - `npm run check:predeploy` で公開前の公開資材/lint/build/rules dry-runを一括実行できるようにした。
  - `npm run check:live` で公開URLの title / robots / sitemap / manifest / OGP画像が実際に出ているか確認できるようにした。
- Xプロフィールや固定ポストから使いやすい説明ページ `/about` を追加。
  - Sound.backの用途、相談の流れ、使いやすい悩み、共有導線を1ページにまとめる。
  - CTAは「相談を投稿」と「返信募集中を見る」。
  - 相談する/返信する/近い悩みを探す、の3つの次アクションを置く。
  - 相談例と返信例を追加し、初回訪問者が投稿文や返信文の粒度を想像しやすくした。
  - 例の下から「この形で相談する」「返せそうな相談を見る」へ進める。
  - 「安心して使うために」を追加し、外部紹介は自分で選べること、短い返信や未完成の相談でも参加できることを明示する。
  - よくある質問を追加し、無料利用、投稿できる音源、外部紹介、返信の詳しさについて登録前に確認できるようにする。
  - `/about` に FAQPage JSON-LD を追加し、検索側にもFAQ内容を伝えやすくする。
  - `about_cta_click` と `about_share_click` で利用を計測する。
  - sitemap に `/about` を追加。
- ホームから `/about` へ進める「Sound.backとは」導線を追加。
  - ヘッダーとサイドバーに入口を置き、初見ユーザーが用途を確認しやすくする。
  - `home_about_click` で surface / signed_in を計測する。

## Xプロフィール改善案

- 実行順と手動投稿手順は `X_GROWTH_ACTIONS_2026-06-20.md` に分けて整理した。
- 固定ポストはそのままでも説明力があるが、「見るだけでもOK」「音源つきで相談」「秒数つきで返せる」をもう少し前に出すと、初回訪問者が押す理由を作りやすい。
- DTM情報投稿のあと、1日1回は Sound.back 本体へ戻す投稿を入れる。
- プロフィールURLは `/about` 推奨。固定ポストから説明ページへ入り、そこから相談投稿/未返信閲覧/検索へ進める。
- 公開後に、Xのカード表示とGoogle Search Consoleのインデックス状況を確認する。
- 2026-06-20のデプロイ後、`npm run check:live` は成功。XプロフィールURL差し替えや固定ポスト投稿に進める状態。

## X 投稿案

### 固定ポスト候補

曲を作っていて、
「どこが悪いのか分からない」
「ミックスが一人だと詰まる」
「AI作曲を自然に直したい」
みたいな時に、音源つきで相談できる場所を作っています。

Sound.back
音楽制作の悩みを、音で相談するコミュニティ。

https://sound-fix-ecfcf.web.app/about
#DTM #DTMer

### 初回告知

ミックスやアレンジ、一人で聴き続けると判断が鈍る。

Sound.backは、曲の気になる秒数・DAW・ジャンルを添えて相談できる場所です。
聴いた人が「どこを直すと良さそうか」を返しやすい形にしています。

URL
#DTM #DTMer

### アプリ導線を戻す投稿

DTM情報を見て終わりじゃなくて、
自分の曲で詰まった時に聞ける場所も作っています。

Sound.backは、ミックス/AI作曲/DAW操作の悩みを音源つきで相談できるコミュニティです。

https://sound-fix-ecfcf.web.app/
#DTM #DTMer

### 見るだけ導線

いきなり投稿しなくても大丈夫です。

Sound.backは、他の人の相談を聴いて「良い点」「気になった秒数」「確認したいこと」から短く返せます。
DTMの壁打ち場所として育てています。

https://sound-fix-ecfcf.web.app/
#DTM #DTMer

### 検索/プロフィール向け短文

Sound.backは、曲の悩みを音源つきで相談できる場所です。

ミックス、AI作曲、DAW操作などで詰まった時に、気になる秒数や制作環境を添えて投稿できます。
見るだけ、短く返すだけでもOKです。

https://sound-fix-ecfcf.web.app/
#DTM #DTMer

### 相談募集投稿

曲の相談、聴いてもらえると助かります。
悩みジャンル / 音楽ジャンル / DAWの相談です。気になった秒数や良い点を返してもらえると助かります。

投稿タイトル
投稿URL

#DTM #DTMer

### 投稿参加を促す短文

「この曲、何か足りない」の正体を探したい人へ。

Sound.backでは、音源を添えて制作の悩みを投稿できます。
ミックス、AI作曲、DAW操作、コード進行あたりで詰まった時の壁打ち用にどうぞ。

URL
#DTM #DTMer

## 7日間の運用案

1. 1日目: 固定ポストを出す。プロフィールリンクを `/about` にする。
2. 2日目: 管理画面の「運営サンプル相談」から、音源つきのサンプル相談を1つ作る。
3. 3日目: その投稿詳細URLを共有し、「秒数指定で相談できる」ことを見せる。
4. 4日目: AI作曲の手直し相談に寄せた投稿を出す。
5. 5日目: DTMセール/無料素材投稿のあとに、アプリ導線を戻す投稿を1本出す。
6. 6日目: ミックス初心者向けの投稿例を出す。
7. 7日目: 返信がついた投稿を紹介する。個人情報や音源権利に注意。

## アプリ内X共有導線の使い方

1. 運営サンプルまたはユーザー許可済み投稿を開く。
2. 「Xで相談を募集」を押す。
3. X投稿画面で本文を確認し、必要なら一言だけ追記する。
4. 投稿後、投稿URLの閲覧数と返信数を見る。

外部SNSでユーザー投稿を紹介する時のルール:

- `allowExternalFeature=true` の投稿だけ候補にする。
- 運営ダッシュボードの「公式紹介OK投稿」から候補を探す。
- 「X文コピー」で文面をコピー、または「X下書き」でX投稿画面を開いて最終確認する。
- Xの投稿ボタンは必ず手動で押す。
- 音源や本文を長く引用しない。基本は投稿URLと相談概要に留める。
- 不安がある投稿は、投稿者へ追加確認してから扱う。

投稿文の基本形:

```text
曲の相談、聴いてもらえると助かります。
悩みジャンル / 音楽ジャンル / DAWの相談です。気になった秒数や良い点を返してもらえると助かります。

投稿タイトル
投稿URL

#DTM #DTMer
```

## すぐ試す計測

- 外部流入ファネル:
  - `page_view(utm_source=x)` → `home_guest_browse_click` → `home_post_open`
  - `page_view(utm_source=x)` → `create_post_cta_click` → `auth_success` → `post_submit_success`
  - `page_view(utm_source=x)` → `home_post_open` → `comment_signup_cta_click` → `auth_success`
  - `page_view(utm_source=x)` → 投稿詳細 → `comment_start_cta_click` → コメント送信
- Firebase Analytics の `post_share_click` 件数。
- `post_share_click` の `channel=x` と `channel=native_or_copy` の比率。
- `surface=feed_card` と `surface=post_detail` のどちらが押されるか。
- Firebase Analytics の `post_x_text_copy` 件数と `surface`, `result` 別の利用数。
- Firebase Analytics の `home_post_open` 件数。
- Firebase Analytics の `home_landing_context_view` 件数と `context_id` 別の表示数。
- Firebase Analytics の `home_landing_context_click` 件数と `action`, `context_id` 別のクリック数。
- `home_landing_context_click(action=show_unanswered)` 後に `home_post_open(reply_count=0)` が発生するか。
- `home_landing_context_click(action=create)` 後に `auth_success` / `post_submit_success` が発生するか。
- Firebase Analytics の `home_landing_context_dismiss` 件数。
- `home_post_open` の `signed_in=false`, `sort_mode`, `guest_genre`, `has_audio` 別の傾向。
- Firebase Analytics の `home_guest_genre_filter` 件数と `genre` 別の利用数。
- Firebase Analytics の `home_feed_sort_change` 件数と `sort_mode` 別の利用数。
- `home_feed_sort_change(sort_mode=unanswered)` 後に `home_post_open(reply_count=0)` が増えるか。
- 未返信投稿数が週次で減っているか。
- Firebase Analytics の `feed_reply_cta_click` 件数と `surface`, `reply_count` 別の利用数。
- Firebase Analytics の `home_reply_spotlight_click` 件数と `action` 別の利用数。
- Firebase Analytics の `ranking_cta_click` と `home_feed_sort_deeplink(source=ranking)`。
- `feed_reply_cta_click` 後に `comment_intent_restored` またはコメント投稿が発生するか。
- Firebase Analytics の `search_quick_filter_click` 件数と `preset_id` 別の利用数。
- Firebase Analytics の `search_about_context_view` 件数。
- Firebase Analytics の `search_about_context_click` 件数と `action` 別の利用数。
- Firebase Analytics の `search_post_submit` 件数と `result_count`。
- Firebase Analytics の `search_post_open` 件数。
- Firebase Analytics の `search_empty_create_click` 件数。
- Firebase Analytics の `post_author_profile_open` 件数と `surface` 別の利用数。
- Firebase Analytics の `comment_signup_cta_click` 件数。
- `comment_signup_cta_click` の `surface=post_body_inline`, `surface=comments_section`, `surface=floating_button` の比率。
- Firebase Analytics の `comment_start_cta_click` 件数。
- `comment_start_cta_click(surface=post_body_inline)` 後に同じ `post_id` の `comment_submit_success` が発生するか。
- Firebase Analytics の `auth_success` 件数。
- Firebase Analytics の `auth_view` 件数。
- Firebase Analytics の `auth_context_view` 件数と `context_id` 別の表示数。
- Firebase Analytics の `auth_tab_change` 件数と `from_mode` / `to_mode`。
- `auth_success` と `post_submit_success` の `acquisition_campaign` / `acquisition_content`。
- `auth_success` の `context_id` / `campaign` 別の登録完了数。
- `acquisition_campaign=post_share`, `profile_share`, `app_intro` の登録/投稿到達数。
- `auth_view` から `auth_success` まで進む割合。
- `auth_success` の `mode=register`, `has_return_to=true`, `return_to_type` 別の件数。
- `comment_signup_cta_click` または `create_post_cta_click` から `auth_success(mode=register)` まで進む割合。
- Firebase Analytics の `mypage_next_action_click` 件数と `action` 別の利用数。
- 登録直後の `mypage_next_action_click(action=create_first_post)` から `post_submit_success` まで進む割合。
- Firebase Analytics の `profile_bio_prompt_apply` 件数と `prompt_id` 別の利用数。
- Firebase Analytics の `profile_update_success` 件数と `has_bio`, `has_photo` 別の割合。
- `profile_update_success` 後に `profile_share_click`, `post_submit_success`, `comment_submit_success` が増えるか。
- Firebase Analytics の `comment_intent_restored` 件数。
- Firebase Analytics の `comment_template_apply` 件数と `template_id` 別の利用数。
- Firebase Analytics の `comment_assist_apply` 件数と `suggestion_id` 別の利用数。
- Firebase Analytics の `comment_starter_click` 件数と `starter_id` 別の利用数。
- Firebase Analytics の `comment_submit_success` 件数と `is_reply`, `has_image` 別の利用数。
- Firebase Analytics の `comment_success_next_action_click` 件数と `action` 別の利用数。
- Firebase Analytics の `best_answer_select_success` 件数。
- Firebase Analytics の `notifications_view` 件数と `unread_count`。
- Firebase Analytics の `notification_open` 件数と `notification_type` 別の利用数。
- Firebase Analytics の `notification_comment_focus` 件数。
- Firebase Analytics の `notifications_empty_cta_click` 件数。
- `comment_signup_cta_click` 後に同じ `post_id` のコメントが増えるか。
- `comment_signup_cta_click(surface=post_next_step_comment)` が登録後コメントにつながるか。
- `comment_starter_click` 後に同じ `post_id` の `comment_submit_success` が発生するか。
- `comment_template_apply` 後に `comment_submit_success` まで進む割合。
- `comment_assist_apply` 後に `comment_submit_success` まで進む割合。
- Xから共有した投稿URLの閲覧数。
- Firebase Analytics の `page_view` で `utm_source=x` の流入数。
- `utm_content` ごとの投稿詳細ページ流入数。
- Firebase Analytics の `app_share_click` 件数と `channel`, `surface` 別の比率。
- Firebase Analytics の `home_about_click` 件数と `surface` 別の比率。
- `utm_campaign=app_intro` のトップページ流入数。
- `utm_campaign=app_intro` の `utm_content` 別流入数。
- Firebase Analytics の `admin_app_intro_x_text_copy` 件数と `draft_id` 別の利用数。
- Firebase Analytics の `admin_app_intro_x_draft_open` 件数と `draft_id` 別の利用数。
- Firebase Analytics の `admin_x_profile_text_copy` 件数と `draft_id` 別の利用数。
- 投稿作成画面に到達した数。
- Firebase Analytics の `create_post_cta_click` 件数と `surface` 別の比率。
- `create_post_cta_click(surface=post_detail_next_step)` が共有投稿閲覧後の投稿作成につながるか。
- `create_post_cta_click(surface=feed_inline)` が、投稿詳細閲覧後の登録/投稿につながるか。
- `create_post_cta_click(surface=empty_feed|filtered_empty_feed)` が、空状態から投稿作成へ進ませているか。
- Firebase Analytics の `post_draft_restore` 件数。
- Firebase Analytics の `post_draft_discard` 件数。
- `post_draft_restore` 後に `post_submit_success` まで進む割合。
- Firebase Analytics の `post_template_apply` 件数と `template_id` 別の利用数。
- Firebase Analytics の `post_body_prompt_apply` 件数と `prompt_id` 別の利用数。
- Firebase Analytics の `post_reply_hint_apply` 件数と `hint_id` 別の利用数。
- Firebase Analytics の `post_submit_success` 件数。
- `post_submit_success` の `has_audio`, `has_focus_second`, `template_id` 別の投稿傾向。
- `post_submit_success` の `reply_quality_percent` と投稿後返信数の関係。
- `post_submit_success` の `allow_external_feature=true` の割合。
- 運営ダッシュボードの「公式紹介OK」件数。
- Firebase Analytics の `admin_feature_post_x_text_copy` 件数。
- Firebase Analytics の `admin_feature_post_x_draft_open` 件数。
- Firebase Analytics の `admin_public_check_open` 件数と `target` 別の利用数。
- Firebase Analytics の `admin_pre_deploy_checks_copy` 件数。
- 管理画面の「成長施策 計測ガイド」を見ながら、流入/初回閲覧/相談探し/登録/投稿/返信/再訪と通知/公式運用のどこで落ちているかを週次で確認する。
- `post_submit_success` 後に同じ `post_id` で `post_share_click` が発生するか。
- Firebase Analytics の `post_created_share_cta_click` 件数。
- Firebase Analytics の `home_guest_browse_click` 件数。
- `create_post_cta_click(surface=hero)` と `home_guest_browse_click(surface=hero)` の比率。
- X投稿後、未ログイン訪問者の直帰が下がるか。
- 未ログイン訪問者が `投稿を見る` を押したあと、投稿詳細へ進むか。
- デプロイ後、`/robots.txt`, `/sitemap.xml`, `/site.webmanifest` が200で返るか。
- デプロイ後、`/about` が開けるか。
- `/about`, `/search`, `/create` などでブラウザタイトルとdescriptionがページ内容に切り替わるか。
- X Card Validator相当の表示で title/description が Sound.back として出るか。
- テンプレート導入後の新規投稿数。
- 音源付き投稿の割合。
- 1投稿あたりの返信数。

## まだ実行できないこと

- Xプロフィール文や固定ポストの編集は、公開プロフィールへの変更になるため未実行。
- 投稿音源やユーザー投稿を外部SNSで紹介する場合、投稿者の許可ルールが必要。
