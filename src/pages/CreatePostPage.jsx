import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import './CreatePostPage.css';

const WORRY_GENRES = [
  'ミックス', 'アレンジ', 'マスタリング', 'DAW操作',
  'メロディ', 'コード進行', 'リズム', 'その他',
];
const MUSIC_GENRES = [
  'J-POP', 'Rock', 'Hip-Hop', 'EDM',
  'Lo-fi', 'Ballad', 'Anime', 'その他',
];

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const AUDIO_MAX_SEC = 90;

// 音源の長さをチェックするユーティリティ
function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('音源の読み込みに失敗しました'));
    };
  });
}

export function CreatePostPage() {
  const { firebaseUser, userData } = useAuth();
  const navigate = useNavigate();

  const [body, setBody] = useState('');
  const [worryGenre, setWorryGenre] = useState('');
  const [musicGenre, setMusicGenre] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [audioName, setAudioName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);

  // 未ログイン時は認証画面へ（読み込み中は何もしない）
  if (firebaseUser === undefined) return null;
  if (!firebaseUser) {
    navigate('/auth');
    return null;
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type) || file.size > IMAGE_MAX_BYTES) {
      setError('画像の形式またはサイズが不正です。');
      e.target.value = '';
      return;
    }
    setError('');
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleImageRemove = () => {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleAudioChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'audio/mpeg' || file.size > AUDIO_MAX_BYTES) {
      setError('音源の形式、サイズ、または長さが不正です。');
      e.target.value = '';
      return;
    }
    try {
      const duration = await getAudioDuration(file);
      if (duration > AUDIO_MAX_SEC) {
        setError('音源の形式、サイズ、または長さが不正です。');
        e.target.value = '';
        return;
      }
      setError('');
      setAudioFile(file);
      setAudioName(file.name);
    } catch {
      setError('音源の形式、サイズ、または長さが不正です。');
      e.target.value = '';
    }
  };

  const handleAudioRemove = () => {
    setAudioFile(null);
    setAudioName('');
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!body.trim()) {
      setError('本文を入力してください。');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const uid = firebaseUser.uid;
      let imageUrl = null;
      let audioUrl = null;
      let audioDurationSec = null;

      // 画像アップロード
      if (imageFile) {
        const imgRef = ref(storage, `posts/images/${uid}/${Date.now()}_${imageFile.name}`);
        await uploadBytes(imgRef, imageFile);
        imageUrl = await getDownloadURL(imgRef);
      }

      // 音源アップロード
      if (audioFile) {
        const audRef = ref(storage, `posts/audio/${uid}/${Date.now()}_${audioFile.name}`);
        await uploadBytes(audRef, audioFile);
        audioUrl = await getDownloadURL(audRef);
        audioDurationSec = await getAudioDuration(audioFile);
      }

      // Firestore に投稿ドキュメントを追加
      await addDoc(collection(db, 'posts'), {
        authorUid: uid,
        authorDisplayName: userData?.displayName ?? '',
        authorPhotoUrl: userData?.photoUrl ?? null,
        body: body.trim(),
        worryGenre: worryGenre || null,
        musicGenre: musicGenre || null,
        imageUrl,
        audioUrl,
        audioDurationSec: audioDurationSec ? Math.floor(audioDurationSec) : null,
        isSolved: false,
        bestAnswerCommentId: null,
        deleted: false,
        // --- 将来機能用フィールド ---
        questionType: 'open',      // 'open'=野良質問 | 'matching'=継続質問
        isPriority: false,         // 優先表示フラグ（質問者課金）
        likeCount: 0,              // 投稿へのいいね数
        // ---------------------------
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      navigate('/');
    } catch {
      setError('投稿に失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-page">
      <header className="create-header">
        <button className="create-back-btn" onClick={() => navigate('/')}>
          ← ホームへ
        </button>
        <h1 className="create-title">投稿する</h1>
      </header>

      <main className="create-main">
        <form className="create-form" onSubmit={handleSubmit}>

          {/* 本文 */}
          <label className="create-label">
            解決したいこと <span className="create-required">必須</span>
          </label>
          <div className="create-body-wrap">
            <textarea
              className="create-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 300))}
              rows={5}
              placeholder="悩んでいることを書いてください..."
            />
            <span className={`create-char-count ${body.length >= 300 ? 'create-char-count--max' : ''}`}>
              {body.length}/300
            </span>
          </div>

          {/* 悩みジャンル */}
          <label className="create-label">
            悩みジャンル <span className="create-optional">任意</span>
          </label>
          <select
            className="create-select"
            value={worryGenre}
            onChange={(e) => setWorryGenre(e.target.value)}
          >
            <option value="">選択してください</option>
            {WORRY_GENRES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          {/* 音楽ジャンル */}
          <label className="create-label">
            音楽ジャンル <span className="create-optional">任意</span>
          </label>
          <select
            className="create-select"
            value={musicGenre}
            onChange={(e) => setMusicGenre(e.target.value)}
          >
            <option value="">選択してください</option>
            {MUSIC_GENRES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          {/* 画像添付 */}
          <label className="create-label">
            画像 <span className="create-optional">任意 / jpg・png・webp / 5MB以内</span>
          </label>
          {imagePreview ? (
            <div className="create-image-preview">
              <img src={imagePreview} alt="プレビュー" />
              <button type="button" className="create-remove-btn" onClick={handleImageRemove}>
                削除
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="create-file-btn"
              onClick={() => imageInputRef.current?.click()}
            >
              画像を選択
            </button>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageChange}
            hidden
          />

          {/* 音源添付 */}
          <label className="create-label">
            音源 <span className="create-optional">任意 / mp3 / 1分30秒・10MB以内</span>
          </label>
          {audioName ? (
            <div className="create-audio-preview">
              <span className="create-audio-name">🎵 {audioName}</span>
              <button type="button" className="create-remove-btn" onClick={handleAudioRemove}>
                削除
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="create-file-btn"
              onClick={() => audioInputRef.current?.click()}
            >
              音源を選択
            </button>
          )}
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/mpeg"
            onChange={handleAudioChange}
            hidden
          />

          {error && <p className="create-error">{error}</p>}

          <button className="create-submit" type="submit" disabled={loading}>
            {loading ? '投稿中です...' : '投稿する'}
          </button>
        </form>
      </main>

      <BottomNav active="" />
    </div>
  );
}
