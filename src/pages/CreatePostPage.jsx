import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
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
const DAW_OPTIONS = [
  'Logic Pro', 'Ableton Live', 'FL Studio', 'Cubase',
  'Studio One', 'Pro Tools', 'GarageBand', 'Reaper',
  'Cakewalk', 'その他',
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
  const { firebaseUser, userData, isLoading } = useAuth();
  const navigate = useNavigate();
  const { postId } = useParams();
  const isEditMode = Boolean(postId);

  const [body, setBody] = useState('');
  const [worryGenre, setWorryGenre] = useState('');
  const [musicGenre, setMusicGenre] = useState('');
  const [daw, setDaw] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [audioName, setAudioName] = useState('');
  const [audioDurationSec, setAudioDurationSec] = useState(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState('');
  const [audioCurrentSec, setAudioCurrentSec] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [focusSecondInput, setFocusSecondInput] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [removeAudio, setRemoveAudio] = useState(false);
  const [existingImageUrl, setExistingImageUrl] = useState(null);
  const [existingAudioUrl, setExistingAudioUrl] = useState(null);
  const [pageLoading, setPageLoading] = useState(isEditMode);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const previewAudioRef = useRef(null);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  useEffect(() => {
    if (!isLoading && !firebaseUser) {
      navigate('/auth', { replace: true });
    }
  }, [isLoading, firebaseUser, navigate]);

  useEffect(() => {
    if (!isEditMode || !firebaseUser) {
      setPageLoading(false);
      return;
    }

    let cancelled = false;

    const loadPost = async () => {
      setPageLoading(true);
      try {
        const postSnap = await getDoc(doc(db, 'posts', postId));
        if (!postSnap.exists()) {
          navigate('/mypage');
          return;
        }

        const postData = postSnap.data();
        if (postData.authorUid !== firebaseUser.uid) {
          navigate('/mypage');
          return;
        }

        if (cancelled) return;

        setBody(postData.body ?? '');
        setWorryGenre(postData.worryGenre ?? '');
        setMusicGenre(postData.musicGenre ?? '');
        setDaw(postData.daw ?? '');

        const nextImageUrl = postData.imageUrl ?? null;
        const nextAudioUrl = postData.audioUrl ?? null;
        const nextDuration = Number(postData.audioDurationSec ?? 0) || null;

        setImagePreview(nextImageUrl);
        setExistingImageUrl(nextImageUrl);
        setAudioPreviewUrl(nextAudioUrl ?? '');
        setExistingAudioUrl(nextAudioUrl);
        setAudioName(nextAudioUrl ? '既存の音源' : '');
        setAudioDurationSec(nextDuration);
        setFocusSecondInput(
          Number.isFinite(Number(postData.focusSecondSec))
            ? String(Math.max(0, Math.floor(Number(postData.focusSecondSec))))
            : ''
        );

        setAudioCurrentSec(0);
        setAudioProgress(0);
        setIsAudioPlaying(false);
        setRemoveImage(false);
        setRemoveAudio(false);
      } catch {
        navigate('/mypage');
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    };

    loadPost();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, postId, firebaseUser, navigate]);

  const formatSeconds = (value) => {
    const sec = Math.max(0, Math.floor(value));
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  // 未ログイン時は認証画面へ（読み込み中は何もしない）
  if (isLoading) return null;
  if (!firebaseUser) return null;

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
    setRemoveImage(false);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleImageRemove = () => {
    setRemoveImage(true);
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

      if (audioPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(audioPreviewUrl);
      const localPreviewUrl = URL.createObjectURL(file);
      setAudioFile(file);
      setAudioName(file.name);
      setAudioDurationSec(Math.floor(duration));
      setAudioPreviewUrl(localPreviewUrl);
      setRemoveAudio(false);
      setAudioCurrentSec(0);
      setAudioProgress(0);
      setIsAudioPlaying(false);
      setFocusSecondInput('');
    } catch {
      setError('音源の形式、サイズ、または長さが不正です。');
      e.target.value = '';
    }
  };

  const handleAudioRemove = () => {
    if (audioPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(audioPreviewUrl);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setRemoveAudio(true);
    setAudioFile(null);
    setAudioName('');
    setAudioDurationSec(null);
    setAudioPreviewUrl('');
    setAudioCurrentSec(0);
    setAudioProgress(0);
    setIsAudioPlaying(false);
    setFocusSecondInput('');
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const handleAudioPlayToggle = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (isAudioPlaying) {
      audio.pause();
      setIsAudioPlaying(false);
      return;
    }
    audio.play().then(() => setIsAudioPlaying(true)).catch(() => {});
  };

  const handlePreviewTimeUpdate = () => {
    const audio = previewAudioRef.current;
    if (!audio || !audio.duration) return;
    const current = audio.currentTime;
    setAudioCurrentSec(current);
    setAudioProgress((current / audio.duration) * 100);
  };

  const handlePreviewEnded = () => {
    setIsAudioPlaying(false);
    setAudioCurrentSec(0);
    setAudioProgress(0);
  };

  const handlePreviewLoadedMetadata = () => {
    const audio = previewAudioRef.current;
    if (!audio || !audio.duration) return;
    const duration = Math.floor(audio.duration);
    if (!audioDurationSec || Math.abs(audioDurationSec - duration) > 1) {
      setAudioDurationSec(duration);
    }
  };

  const handlePreviewSeek = (e) => {
    const audio = previewAudioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const nextSecond = ratio * audio.duration;
    audio.currentTime = nextSecond;
    setAudioCurrentSec(nextSecond);
    setAudioProgress(ratio * 100);
  };

  const handleUseCurrentTime = () => {
    setFocusSecondInput(String(Math.floor(audioCurrentSec)));
  };

  const handleFocusSecondChange = (e) => {
    const value = e.target.value;
    if (value === '') {
      setFocusSecondInput('');
      return;
    }

    if (!/^\d+$/.test(value)) return;
    const numeric = Number(value);
    const max = audioDurationSec ?? AUDIO_MAX_SEC;
    setFocusSecondInput(String(Math.min(numeric, max)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setError('本文を入力してください。');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const uid = firebaseUser.uid;
      let imageUrl = isEditMode ? existingImageUrl : null;
      let audioUrl = isEditMode ? existingAudioUrl : null;
      let resolvedAudioDurationSec = isEditMode ? audioDurationSec : null;

      if (isEditMode && removeImage) imageUrl = null;
      if (isEditMode && removeAudio) {
        audioUrl = null;
        resolvedAudioDurationSec = null;
      }

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
        resolvedAudioDurationSec = audioDurationSec ?? Math.floor(await getAudioDuration(audioFile));
      }

      const normalizedFocusSecond =
        audioUrl && focusSecondInput !== ''
          ? Math.min(Number(focusSecondInput), resolvedAudioDurationSec ?? AUDIO_MAX_SEC)
          : null;

      const basePayload = {
        body: trimmedBody,
        worryGenre: worryGenre || null,
        musicGenre: musicGenre || null,
        daw: daw || null,
        imageUrl,
        audioUrl,
        audioDurationSec: resolvedAudioDurationSec ?? null,
        focusSecondSec: Number.isFinite(normalizedFocusSecond) ? normalizedFocusSecond : null,
        updatedAt: serverTimestamp(),
      };

      if (isEditMode) {
        await updateDoc(doc(db, 'posts', postId), basePayload);
        navigate(`/post/${postId}`);
      } else {
        // Firestore に投稿ドキュメントを追加
        await addDoc(collection(db, 'posts'), {
          authorUid: uid,
          authorDisplayName: userData?.displayName ?? '',
          authorPhotoUrl: userData?.photoUrl ?? null,
          ...basePayload,
          isSolved: false,
          bestAnswerCommentId: null,
          deleted: false,
          // --- 将来機能用フィールド ---
          questionType: 'open',      // 'open'=野良質問 | 'matching'=継続質問
          isPriority: false,         // 優先表示フラグ（質問者課金）
          likeCount: 0,              // 投稿へのいいね数
          // ---------------------------
          createdAt: serverTimestamp(),
        });

        navigate('/');
      }
    } catch {
      setError(isEditMode ? '投稿の更新に失敗しました。もう一度お試しください。' : '投稿に失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return <div className="detail-state">読み込み中...</div>;
  }

  return (
    <div className="create-page">
      <header className="create-header">
        <button className="create-back-btn" onClick={() => navigate(isEditMode ? `/post/${postId}` : '/')}>
          ← {isEditMode ? '投稿へ' : 'ホームへ'}
        </button>
        <h1 className="create-title">{isEditMode ? '投稿を編集' : '投稿する'}</h1>
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

          {/* 使用DAW */}
          <label className="create-label">
            使用DAW <span className="create-optional">任意</span>
          </label>
          <select
            className="create-select"
            value={daw}
            onChange={(e) => setDaw(e.target.value)}
          >
            <option value="">選択してください</option>
            {DAW_OPTIONS.map((dawOption) => (
              <option key={dawOption} value={dawOption}>{dawOption}</option>
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

          {audioPreviewUrl && (
            <div className="create-audio-meta">
              <div className="create-audio-player">
                <button
                  type="button"
                  className={`create-audio-player__play-btn ${isAudioPlaying ? 'is-playing' : ''}`}
                  onClick={handleAudioPlayToggle}
                  aria-label={isAudioPlaying ? '一時停止' : '再生'}
                >
                  <span className="create-audio-player__play-icon" aria-hidden="true" />
                </button>
                <div
                  className={`create-audio-player__progress-bar${isAudioPlaying ? ' is-playing' : ''}`}
                  onClick={handlePreviewSeek}
                  onTouchStart={handlePreviewSeek}
                  role="slider"
                  aria-label="再生位置"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(audioProgress)}
                >
                  <div
                    className="create-audio-player__progress-fill"
                    style={{ width: `${audioProgress}%` }}
                  />
                </div>
                <span className="create-audio-player__time">
                  {formatSeconds(audioCurrentSec)} / {formatSeconds(audioDurationSec ?? 0)}
                </span>
                <audio
                  ref={previewAudioRef}
                  src={audioPreviewUrl}
                  onLoadedMetadata={handlePreviewLoadedMetadata}
                  onTimeUpdate={handlePreviewTimeUpdate}
                  onEnded={handlePreviewEnded}
                />
              </div>
              <p className="create-audio-meta__duration">
                音源長さ: {audioDurationSec ?? '--'}秒
              </p>
              <label className="create-audio-meta__label" htmlFor="focus-second-input">
                気になる秒数（任意）
              </label>
              <div className="create-audio-meta__row">
                <input
                  id="focus-second-input"
                  className="create-audio-meta__input"
                  type="number"
                  min={0}
                  max={audioDurationSec ?? AUDIO_MAX_SEC}
                  step={1}
                  value={focusSecondInput}
                  onChange={handleFocusSecondChange}
                  placeholder="例: 37"
                />
                <button
                  type="button"
                  className="create-audio-meta__use-current-btn"
                  onClick={handleUseCurrentTime}
                >
                  現在位置を入力
                </button>
              </div>
            </div>
          )}

          {error && <p className="create-error">{error}</p>}

          <button className="create-submit" type="submit" disabled={loading}>
            {loading ? (isEditMode ? '更新中です...' : '投稿中です...') : (isEditMode ? '更新する' : '投稿する')}
          </button>
        </form>
      </main>

      <BottomNav active="" />
    </div>
  );
}
