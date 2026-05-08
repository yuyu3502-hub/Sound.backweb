import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  doc, updateDoc, serverTimestamp,
  collection, query, where, getDocs, writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import './ProfileEditPage.css';

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MAX_SIZE = 128;
const AVATAR_QUALITY = 0.5;

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
    image.src = dataUrl;
  });
}

async function compressAvatarImage(file) {
  const dataUrl = await readImageFile(file);
  const image = await loadImage(dataUrl);

  const scale = Math.min(1, AVATAR_MAX_SIZE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('画像の圧縮に失敗しました。');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) {
          resolve(value);
          return;
        }
        reject(new Error('画像の圧縮に失敗しました。'));
      },
      'image/webp',
      AVATAR_QUALITY
    );
  });

  const fileBaseName = file.name.replace(/\.[^.]+$/, '') || 'avatar';
  return new File([blob], `${fileBaseName}.webp`, { type: 'image/webp' });
}

export function ProfileEditPage() {
  const { firebaseUser, userData, setUserData, isLoading } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const imageInputRef = useRef(null);

  useEffect(() => {
    if (isLoading) return;
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    if (userData) {
      setDisplayName(userData.displayName ?? '');
      setBio(userData.bio ?? '');
      setImagePreview(userData.photoUrl ?? null);
    }
  }, [firebaseUser, userData, isLoading, navigate]);

  if (isLoading) return null;
  if (!firebaseUser) return null;

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type) || file.size > IMAGE_MAX_BYTES) {
      setError('画像の形式またはサイズが不正です。');
      e.target.value = '';
      return;
    }
    try {
      const optimizedFile = await compressAvatarImage(file);
      setError('');
      setImageFile(optimizedFile);
      setImagePreview(URL.createObjectURL(optimizedFile));
      setRemovePhoto(false);
    } catch {
      setError('画像の圧縮に失敗しました。別の画像でお試しください。');
      e.target.value = '';
    }
  };

  const handleImageRemove = () => {
    setImageFile(null);
    setImagePreview(null);
    setRemovePhoto(true);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('表示名を入力してください。');
      return;
    }
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      let photoUrl = userData?.photoUrl ?? null;

      // 既存の画像を削除する場合
      if (removePhoto && userData?.photoUrl) {
        try {
          const oldRef = ref(storage, userData.photoUrl);
          await deleteObject(oldRef);
        } catch {
          // 削除失敗は無視
        }
        photoUrl = null;
      }

      // 新しい画像をアップロード
      if (imageFile) {
        const imgRef = ref(
          storage,
          `users/avatars/${firebaseUser.uid}/${Date.now()}_${imageFile.name}`
        );
        await uploadBytes(imgRef, imageFile);
        photoUrl = await getDownloadURL(imgRef);
      }

      const updated = {
        displayName: displayName.trim(),
        bio: bio.trim(),
        photoUrl,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'users', firebaseUser.uid), updated);

      // 自分の全投稿の authorDisplayName / authorPhotoUrl を一括更新
      const postsSnap = await getDocs(
        query(collection(db, 'posts'), where('authorUid', '==', firebaseUser.uid))
      );
      if (!postsSnap.empty) {
        const batch = writeBatch(db);
        postsSnap.docs.forEach((d) => {
          batch.update(d.ref, {
            authorDisplayName: updated.displayName,
            authorPhotoUrl: updated.photoUrl,
          });
        });
        await batch.commit();
      }

      setUserData((prev) => ({ ...prev, ...updated }));
      setSuccessMsg('プロフィールを更新しました。');

      setTimeout(() => navigate('/mypage'), 800);
    } catch {
      setError('プロフィールの更新に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-edit-page">
      <header className="profile-edit-header">
        <button className="profile-edit-back-btn" onClick={() => navigate('/mypage')}>
          ← マイページ
        </button>
        <h1 className="profile-edit-title">プロフィール設定</h1>
      </header>

      <main className="profile-edit-main">
        <form className="profile-edit-form" onSubmit={handleSubmit}>

          {/* アバター */}
          <div className="profile-edit-avatar-section">
            {imagePreview ? (
              <img className="profile-edit-avatar" src={imagePreview} alt="" />
            ) : (
              <div className="profile-edit-avatar-fallback">
                {displayName?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div className="profile-edit-avatar-btns">
              <button
                type="button"
                className="profile-edit-file-btn"
                onClick={() => imageInputRef.current?.click()}
              >
                画像を変更
              </button>
              {imagePreview && (
                <button
                  type="button"
                  className="profile-edit-remove-btn"
                  onClick={handleImageRemove}
                >
                  削除
                </button>
              )}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              hidden
            />
          </div>

          {/* 表示名 */}
          <label className="profile-edit-label">
            表示名 <span className="profile-edit-required">必須</span>
          </label>
          <div className="profile-edit-input-wrap">
            <input
              className="profile-edit-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
              required
            />
            <span className={`profile-edit-count ${displayName.length >= 20 ? 'profile-edit-count--max' : ''}`}>
              {displayName.length}/20
            </span>
          </div>

          {/* 自己紹介 */}
          <label className="profile-edit-label">
            自己紹介 <span className="profile-edit-optional">任意</span>
          </label>
          <div className="profile-edit-input-wrap">
            <textarea
              className="profile-edit-textarea"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 200))}
              rows={4}
              placeholder="自己紹介を書いてください..."
            />
            <span className={`profile-edit-count ${bio.length >= 200 ? 'profile-edit-count--max' : ''}`}>
              {bio.length}/200
            </span>
          </div>

          {error && <p className="profile-edit-error">{error}</p>}
          {successMsg && <p className="profile-edit-success">{successMsg}</p>}

          <button className="profile-edit-submit" type="submit" disabled={loading}>
            {loading ? '更新中です...' : '保存する'}
          </button>
        </form>
      </main>

      <BottomNav active="" />
    </div>
  );
}
