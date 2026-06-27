# iPhoneアプリ化ロードマップ

Sound.backをiPhoneで使いやすくするための現実的な順番。

## Phase 1: ホーム画面追加できるPWA

完了したこと:
- `site.webmanifest` にiPhone/Android向けの基本情報を追加
- 192px/512pxのPWAアイコンを追加
- 180pxのApple touch iconを追加
- iOSのホーム画面起動用メタタグを追加
- production時だけService Workerを登録

確認すること:
- iPhone Safariで `https://sound-fix-ecfcf.web.app/` を開く
- 共有メニューから「ホーム画面に追加」
- ホーム画面のアイコン、アプリ名、単独表示の見え方を確認
- ログイン、投稿、音源再生、図書館、検索の主要導線を確認

## Phase 2: iOS向けUX調整

優先したいこと:
- ホーム画面から開いた時の初回導線をわかりやすくする
- iPhoneの下部ナビとセーフエリアの見え方を確認する
- 投稿作成、音源アップロード、再生UIを片手操作で見直す
- Safari/PWA上での通知、共有、音声再生制限を確認する

## Phase 3: App Store向けネイティブ化

候補:
- Capacitorで既存React/ViteアプリをiOSラッパー化
- Firebase Auth/Firestore/Storageは既存構成を活かす
- Xcodeで署名、Bundle ID、App Icon、Launch Screenを設定

必要になりそうなもの:
- Apple Developer Program
- App Store用スクリーンショット
- プライバシーポリシー
- 音源アップロード、ユーザー投稿、通報/ブロック、削除導線の審査対策
- Firebaseの認証ドメイン、Dynamic Links/Universal Linksの確認

## 判断

まずはPWAとしてiPhoneホーム画面に入れて使ってもらい、利用感や離脱ポイントを見る。その後、継続利用や通知の必要性が高ければCapacitorでApp Store化を進める。
