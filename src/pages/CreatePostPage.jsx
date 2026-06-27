import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, logAppEvent, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { buildAuthPath } from '../utils/authLinks';
import './CreatePostPage.css';

const WORRY_GENRES = [
  'ミックス', 'アレンジ', 'マスタリング', 'DAW操作', 'AI作曲',
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

const POST_TEMPLATES = [
  {
    id: 'mix',
    label: 'ミックス相談',
    title: 'サビでボーカルが埋もれます',
    body: '気になる箇所:\n直したいこと:\n試したこと:\n聴いてほしいポイント:',
    worryGenre: 'ミックス',
  },
  {
    id: 'ai',
    label: 'AI作曲の手直し',
    title: 'AIで作ったメロディを自然にしたいです',
    body: '違和感がある箇所:\n目指している雰囲気:\n手直ししたいポイント:\n使ったツールやDAW:',
    worryGenre: 'AI作曲',
  },
  {
    id: 'arrange',
    label: 'アレンジ相談',
    title: '2番以降の展開が単調に聞こえます',
    body: '曲の流れ:\n単調に感じる箇所:\n残したい雰囲気:\nアドバイスが欲しいこと:',
    worryGenre: 'アレンジ',
  },
];

const SAMPLE_POST_DRAFTS = {
  mix_vocal: {
    id: 'mix_vocal',
    title: 'サビでボーカルが少し埋もれて聴こえます',
    body: '聴いてほしい所: 0:42からのサビ頭\n試したこと: ボーカルを2dB上げて、低域を少し削りました\n聞きたいこと: ボーカルを前に出すならEQ、コンプ、音量のどこから直すのが良さそうですか？',
    worryGenre: 'ミックス',
    musicGenre: 'J-POP',
    daw: 'Logic Pro',
    focusSecondInput: '42',
  },
  ai_arrange: {
    id: 'ai_arrange',
    title: 'AIで作った曲の2番以降が単調に感じます',
    body: '聴いてほしい所: 1:05以降の展開\n試したこと: ドラムを足して、コードを少し変えました\n聞きたいこと: AIっぽさを減らすなら、メロディ、ベース、展開のどこから直すのが良さそうですか？',
    worryGenre: 'AI作曲',
    musicGenre: 'Anime',
    daw: 'Studio One',
    focusSecondInput: '65',
  },
  low_end: {
    id: 'low_end',
    title: 'キックとベースが重なって低音が膨らみます',
    body: '聴いてほしい所: 0:30からのドロップ\n試したこと: ベースの低域を削って、キックを少し短くしました\n聞きたいこと: 低音を軽くしすぎずに整理するなら、どの帯域から確認すると良さそうですか？',
    worryGenre: 'ミックス',
    musicGenre: 'EDM',
    daw: 'Ableton Live',
    focusSecondInput: '30',
  },
};

const BODY_PROMPTS = [
  {
    id: 'listen-point',
    label: '聴いてほしい所',
    text: '聴いてほしい所:',
  },
  {
    id: 'tried',
    label: '試したこと',
    text: '試したこと:',
  },
  {
    id: 'goal',
    label: '理想の雰囲気',
    text: '理想の雰囲気:',
  },
  {
    id: 'time',
    label: '気になる秒数',
    text: '気になる秒数:',
  },
];

const REPLY_HINTS = [
  {
    id: 'listen-point',
    label: '聴いてほしい所',
    pattern: /聴いてほしい|見てほしい|聞いてほしい|確認してほしい/,
    text: '聴いてほしい所:',
  },
  {
    id: 'tried',
    label: '試したこと',
    pattern: /試した|やってみた|調整した/,
    text: '試したこと:',
  },
  {
    id: 'goal',
    label: '理想の雰囲気',
    pattern: /理想|目指して|参考|雰囲気/,
    text: '理想の雰囲気:',
  },
  {
    id: 'specific-question',
    label: '聞きたいこと',
    pattern: /聞きたい|知りたい|教えて|アドバイス|質問/,
    text: '聞きたいこと:',
  },
];

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const AUDIO_MAX_SEC = 90;
const CREATE_DRAFT_KEY = 'soundback_create_post_draft_v1';

function readCreateDraft() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(CREATE_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCreateDraft(draft) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Draft restore is helpful, but should never block posting.
  }
}

function clearCreateDraft() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(CREATE_DRAFT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function hasCreateDraftContent(draft) {
  return Boolean(
    draft?.title?.trim()
      || draft?.body?.trim()
      || draft?.worryGenre
      || draft?.musicGenre
      || draft?.daw
      || draft?.focusSecondInput
      || draft?.allowExternalFeature
  );
}

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
  const location = useLocation();
  const { postId } = useParams();
  const isEditMode = Boolean(postId);

  const [title, setTitle] = useState('');
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
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [allowExternalFeature, setAllowExternalFeature] = useState(false);
  const [draftStatus, setDraftStatus] = useState('idle');

  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const bodyTextareaRef = useRef(null);
  const previewAudioRef = useRef(null);
  const draftHydratedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  useEffect(() => {
    if (!isLoading && !firebaseUser) {
      navigate(buildAuthPath({ returnTo: '/create' }), {
        replace: true,
        state: { message: '投稿するには無料登録が必要です。', returnTo: '/create' },
      });
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

        setTitle(postData.title ?? '');
        setBody(postData.body ?? '');
        setWorryGenre(postData.worryGenre ?? '');
        setMusicGenre(postData.musicGenre ?? '');
        setDaw(postData.daw ?? '');
        setAllowExternalFeature(Boolean(postData.allowExternalFeature));

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

  useEffect(() => {
    if (isLoading || !firebaseUser || isEditMode || draftHydratedRef.current) return;

    draftHydratedRef.current = true;
    const sampleId = new URLSearchParams(location.search).get('sample');
    const libraryBody = new URLSearchParams(location.search).get('body');
    const libraryWorry = new URLSearchParams(location.search).get('worry');
    const source = new URLSearchParams(location.search).get('source') || 'unknown';
    const sampleDraft = sampleId ? SAMPLE_POST_DRAFTS[sampleId] : null;

    if (sampleDraft) {
      setTitle(sampleDraft.title);
      setBody(sampleDraft.body);
      setWorryGenre(sampleDraft.worryGenre);
      setMusicGenre(sampleDraft.musicGenre);
      setDaw(sampleDraft.daw);
      setFocusSecondInput(sampleDraft.focusSecondInput);
      setAllowExternalFeature(true);
      setSelectedTemplateId(`sample_${sampleDraft.id}`);
      setDraftStatus('restored');
      logAppEvent('post_sample_draft_apply', {
        sample_id: sampleDraft.id,
        source,
      });
      return;
    }

    if (source === 'library' && (libraryBody || libraryWorry)) {
      setTitle(String(libraryWorry || '制作の悩みを相談したい').slice(0, 80));
      setBody(String(libraryBody || libraryWorry || '').slice(0, 300));
      setDraftStatus('restored');
      setSelectedTemplateId('library');
      logAppEvent('post_library_draft_apply', {
        has_body: Boolean(libraryBody),
        has_worry: Boolean(libraryWorry),
      });
      return;
    }

    const draft = readCreateDraft();
    if (!hasCreateDraftContent(draft)) return;

    setTitle(String(draft.title ?? '').slice(0, 80));
    setBody(String(draft.body ?? '').slice(0, 300));
    setWorryGenre(draft.worryGenre ?? '');
    setMusicGenre(draft.musicGenre ?? '');
    setDaw(draft.daw ?? '');
    setFocusSecondInput(String(draft.focusSecondInput ?? '').replace(/[^\d]/g, '').slice(0, 3));
    setAllowExternalFeature(Boolean(draft.allowExternalFeature));
    setSelectedTemplateId(draft.selectedTemplateId ?? null);
    setDraftStatus('restored');
    logAppEvent('post_draft_restore', {
      has_title: Boolean(draft.title?.trim()),
      has_body: Boolean(draft.body?.trim()),
      has_focus_second: Boolean(draft.focusSecondInput),
      allow_external_feature: Boolean(draft.allowExternalFeature),
    });
  }, [firebaseUser, isEditMode, isLoading, location.search]);

  useEffect(() => {
    if (isLoading || !firebaseUser || isEditMode || !draftHydratedRef.current) return undefined;

    const draft = {
      title,
      body,
      worryGenre,
      musicGenre,
      daw,
      focusSecondInput,
      allowExternalFeature,
      selectedTemplateId,
      updatedAt: Date.now(),
    };

    const timeoutId = window.setTimeout(() => {
      if (hasCreateDraftContent(draft)) {
        writeCreateDraft(draft);
        setDraftStatus((current) => (current === 'restored' ? current : 'saved'));
      } else {
        clearCreateDraft();
        setDraftStatus('idle');
      }
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [
    allowExternalFeature,
    body,
    daw,
    firebaseUser,
    focusSecondInput,
    isEditMode,
    isLoading,
    musicGenre,
    selectedTemplateId,
    title,
    worryGenre,
  ]);

  useEffect(() => {
    if (draftStatus === 'idle') return undefined;
    const timeoutId = window.setTimeout(() => {
      setDraftStatus((current) => (current === 'restored' ? 'saved' : current));
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [draftStatus]);

  const formatSeconds = (value) => {
    const sec = Math.max(0, Math.floor(value));
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  // 未ログイン時は認証画面へ移動する。空白画面にしない。
  if (isLoading) {
    return (
      <div className="create-page">
        <p className="create-state">認証状態を確認しています...</p>
      </div>
    );
  }
  if (!firebaseUser) {
    return (
      <div className="create-page">
        <p className="create-state">ログイン画面へ移動しています...</p>
      </div>
    );
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

  const applyTemplate = (template) => {
    if (!title.trim()) setTitle(template.title);
    if (!body.trim()) setBody(template.body);
    if (!worryGenre) setWorryGenre(template.worryGenre);
    setSelectedTemplateId(template.id);
    logAppEvent('post_template_apply', {
      template_id: template.id,
    });
  };

  const applyBodyPrompt = (prompt) => {
    setBody((currentBody) => {
      const normalizedBody = currentBody.trimEnd();
      if (normalizedBody.includes(prompt.text)) return currentBody;
      const separator = normalizedBody ? '\n' : '';
      return `${normalizedBody}${separator}${prompt.text}`.slice(0, 300);
    });
    window.setTimeout(() => bodyTextareaRef.current?.focus(), 0);
    logAppEvent('post_body_prompt_apply', {
      prompt_id: prompt.id,
      template_id: selectedTemplateId ?? 'none',
    });
  };

  const applyReplyHint = (hint) => {
    setBody((currentBody) => {
      const normalizedBody = currentBody.trimEnd();
      if (normalizedBody.includes(hint.text)) return currentBody;
      const separator = normalizedBody ? '\n' : '';
      return `${normalizedBody}${separator}${hint.text}`.slice(0, 300);
    });
    window.setTimeout(() => bodyTextareaRef.current?.focus(), 0);
    logAppEvent('post_reply_hint_apply', {
      hint_id: hint.id,
      template_id: selectedTemplateId ?? 'none',
      has_audio: hasDraftAudio,
      has_focus_second: Boolean(focusSecondInput),
    });
  };

  const handleDiscardDraft = () => {
    clearCreateDraft();
    setTitle('');
    setBody('');
    setWorryGenre('');
    setMusicGenre('');
    setDaw('');
    setFocusSecondInput('');
    setAllowExternalFeature(false);
    setSelectedTemplateId(null);
    setDraftStatus('idle');
    logAppEvent('post_draft_discard');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      setError('タイトルを入力してください。');
      return;
    }
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
        title: trimmedTitle,
        body: trimmedBody,
        worryGenre: worryGenre || null,
        musicGenre: musicGenre || null,
        daw: daw || null,
        imageUrl,
        audioUrl,
        audioDurationSec: resolvedAudioDurationSec ?? null,
        focusSecondSec: Number.isFinite(normalizedFocusSecond) ? normalizedFocusSecond : null,
        allowExternalFeature,
        updatedAt: serverTimestamp(),
      };

      if (isEditMode) {
        await updateDoc(doc(db, 'posts', postId), basePayload);
        logAppEvent('post_submit_success', {
          mode: 'edit',
          has_audio: Boolean(audioUrl),
          has_image: Boolean(imageUrl),
          has_focus_second: Number.isFinite(normalizedFocusSecond),
          template_id: selectedTemplateId ?? 'none',
          allow_external_feature: allowExternalFeature,
          reply_quality_percent: replyQualityPercent,
        });
        clearCreateDraft();
        navigate(`/post/${postId}`);
      } else {
        // Firestore に投稿ドキュメントを追加
        const newPostRef = await addDoc(collection(db, 'posts'), {
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

        logAppEvent('post_submit_success', {
          mode: 'create',
          post_id: newPostRef.id,
          has_audio: Boolean(audioUrl),
          has_image: Boolean(imageUrl),
          has_focus_second: Number.isFinite(normalizedFocusSecond),
          template_id: selectedTemplateId ?? 'none',
          allow_external_feature: allowExternalFeature,
          reply_quality_percent: replyQualityPercent,
        });
        clearCreateDraft();
        navigate(`/post/${newPostRef.id}`, {
          state: { justCreated: true },
        });
      }
    } catch {
      setError(isEditMode ? '投稿の更新に失敗しました。もう一度お試しください。' : '投稿に失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="create-page">
        <p className="create-state">読み込み中...</p>
      </div>
    );
  }

  const hasDraftAudio = Boolean(audioFile || (existingAudioUrl && !removeAudio));
  const bodyForChecks = body.trim();
  const titleForChecks = title.trim();
  const missingReplyHints = REPLY_HINTS.filter((hint) => !hint.pattern.test(bodyForChecks));
  const replyQualityItems = [
    {
      id: 'clear-title',
      label: 'タイトルだけで悩みが分かる',
      done: titleForChecks.length >= 10 && /ミックス|アレンジ|音|声|ボーカル|展開|コード|リズム|AI|DAW|サビ|メロディ|低音|高音/.test(titleForChecks),
    },
    {
      id: 'listen-point',
      label: '聴いてほしい所が書いてある',
      done: REPLY_HINTS[0].pattern.test(bodyForChecks),
    },
    {
      id: 'tried',
      label: '試したことが書いてある',
      done: REPLY_HINTS[1].pattern.test(bodyForChecks),
    },
    {
      id: 'specific-question',
      label: '聞きたいことが具体的',
      done: REPLY_HINTS[3].pattern.test(bodyForChecks),
    },
    {
      id: 'audio',
      label: '音源で確認できる',
      done: hasDraftAudio,
    },
    {
      id: 'focus',
      label: '気になる秒数がある',
      done: Boolean(focusSecondInput),
    },
  ];
  const replyQualityDoneCount = replyQualityItems.filter((item) => item.done).length;
  const replyQualityPercent = Math.round((replyQualityDoneCount / replyQualityItems.length) * 100);
  const nextReplyHint = missingReplyHints[0] ?? null;
  const readinessItems = [
    {
      id: 'title',
      label: '悩みがタイトルで分かる',
      done: Boolean(title.trim()),
    },
    {
      id: 'body',
      label: '本文に聴いてほしい所がある',
      done: /聴いてほしい|気になる|直したい|試した|秒数|箇所/.test(body),
    },
    {
      id: 'audio',
      label: '音源を添付して聴ける',
      done: hasDraftAudio,
    },
    {
      id: 'focus',
      label: '気になる秒数を示せる',
      done: Boolean(focusSecondInput),
    },
  ];
  const readinessDoneCount = readinessItems.filter((item) => item.done).length;
  const readinessPercent = Math.round((readinessDoneCount / readinessItems.length) * 100);

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
          {!isEditMode && draftStatus !== 'idle' && (
            <section className="create-draft-status" aria-label="下書きの状態">
              <div>
                <strong>{draftStatus === 'restored' ? '下書きを復元しました' : '下書きを自動保存しています'}</strong>
                <p>タイトルや本文はこの端末に一時保存されます。音源と画像は保存されません。</p>
              </div>
              <button type="button" onClick={handleDiscardDraft}>
                破棄
              </button>
            </section>
          )}

          {!isEditMode && (
            <section className="create-template-panel" aria-label="投稿テンプレート">
              <div>
                <h2>何を書けばいいか迷ったら</h2>
                <p>返信が返ってきやすい形で下書きを入れます。</p>
              </div>
              <div className="create-template-panel__chips">
                {POST_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="create-template-panel__chip"
                    onClick={() => applyTemplate(template)}
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* タイトル */}
          <label className="create-label">
            タイトル <span className="create-required">必須</span>
          </label>
          <div className="create-input-wrap">
            <input
              className="create-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="例: サビのミックスでボーカルが埋もれます"
            />
            <span className={`create-char-count ${title.length >= 80 ? 'create-char-count--max' : ''}`}>
              {title.length}/80
            </span>
          </div>

          {/* 本文 */}
          <label className="create-label">
            解決したいこと <span className="create-required">必須</span>
          </label>
          <div className="create-body-wrap">
            <textarea
              ref={bodyTextareaRef}
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

          <div className="create-body-prompts" aria-label="本文に追加する項目">
            {BODY_PROMPTS.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                className="create-body-prompts__button"
                onClick={() => applyBodyPrompt(prompt)}
              >
                {prompt.label}
              </button>
            ))}
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

          <label className="create-external-feature">
            <input
              type="checkbox"
              checked={allowExternalFeature}
              onChange={(e) => setAllowExternalFeature(e.target.checked)}
            />
            <span>
              <strong>Sound.back公式Xなどで紹介されてもOK</strong>
              <small>投稿URLやタイトルを紹介する場合があります。音源や本文の扱いは必要に応じて確認します。</small>
            </span>
          </label>

          <section className="create-readiness" aria-label="投稿前の確認">
            <div className="create-readiness__header">
              <div>
                <h2>投稿前の確認</h2>
                <p>{readinessDoneCount}/{readinessItems.length} 完了</p>
              </div>
              <span className="create-readiness__score">{readinessPercent}%</span>
            </div>
            <div className="create-readiness__bar" aria-hidden="true">
              <span style={{ width: `${readinessPercent}%` }} />
            </div>
            <ul className="create-readiness__list">
              {readinessItems.map((item) => (
                <li key={item.id} className={item.done ? 'is-done' : ''}>
                  <span aria-hidden="true">{item.done ? '✓' : '・'}</span>
                  {item.label}
                </li>
              ))}
            </ul>
          </section>

          <section className="create-reply-quality" aria-label="返信されやすさの確認">
            <div className="create-reply-quality__header">
              <div>
                <h2>返信されやすさ</h2>
                <p>{replyQualityDoneCount}/{replyQualityItems.length} 項目</p>
              </div>
              <span className="create-reply-quality__score">{replyQualityPercent}%</span>
            </div>
            <ul className="create-reply-quality__list">
              {replyQualityItems.map((item) => (
                <li key={item.id} className={item.done ? 'is-done' : ''}>
                  <span aria-hidden="true">{item.done ? '✓' : '・'}</span>
                  {item.label}
                </li>
              ))}
            </ul>
            {nextReplyHint && (
              <button
                type="button"
                className="create-reply-quality__hint-btn"
                onClick={() => applyReplyHint(nextReplyHint)}
              >
                「{nextReplyHint.label}」を本文に追加
              </button>
            )}
          </section>

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
