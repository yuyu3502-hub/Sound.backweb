import { useState, useRef, useEffect } from 'react';
import './PostCard.css';

export function PostCard({
  post,
  isPlaying,
  onPlay,
  showSolvedBadge = false,
  authorPhotoUrlOverride = null,
  isSpecialAvatar = false,
  replyCount = 0,
}) {
  const audioRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [lastSeekReturnTime, setLastSeekReturnTime] = useState(null);
  const hasAllGenres = Boolean(post.worryGenre && post.musicGenre && post.daw);
  const isSolved = Boolean(post.isSolved || post.bestAnswerCommentId);
  const authorPhotoUrl = authorPhotoUrlOverride || post.authorPhotoUrl || null;
  const durationSec = Number(post.audioDurationSec ?? 0);
  const focusSecondSec = Number(post.focusSecondSec ?? -1);
  const hasFocusSecond = Number.isFinite(focusSecondSec) && focusSecondSec >= 0;
  const safeReplyCount = Math.max(0, Number(replyCount) || 0);

  const formatSeconds = (value) => {
    const sec = Math.max(0, Math.floor(value));
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  };

  const handleEnded = () => {
    setProgress(0);
    setLastSeekReturnTime(null);
    onPlay(null);
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio * 100);
  };

  const handlePlayToggle = (e) => {
    e.stopPropagation();
    onPlay(isPlaying ? null : post.id);
  };

  const handleFocusSecondJump = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !audio.duration || !hasFocusSecond) return;

    const clampedTarget = Math.min(Math.max(focusSecondSec, 0), Math.floor(audio.duration));

    if (lastSeekReturnTime != null && Math.abs(audio.currentTime - clampedTarget) < 1) {
      audio.currentTime = Math.min(Math.max(lastSeekReturnTime, 0), audio.duration);
      setProgress((audio.currentTime / audio.duration) * 100);
      setLastSeekReturnTime(null);
      if (!isPlaying) onPlay(post.id);
      return;
    }

    setLastSeekReturnTime(audio.currentTime);
    audio.currentTime = clampedTarget;
    setProgress((audio.currentTime / audio.duration) * 100);
    if (!isPlaying) onPlay(post.id);
  };

  const initial = post.authorDisplayName?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="post-card">
      <div className="post-card__header">
        <span className={`post-card__avatar-shell ${isSpecialAvatar ? 'post-card__avatar-shell--special' : ''}`}>
          {authorPhotoUrl ? (
            <img
              className="post-card__avatar"
              src={authorPhotoUrl}
              alt=""
              loading="lazy"
              fetchPriority="low"
              decoding="async"
            />
          ) : (
            <div className="post-card__avatar-fallback">{initial}</div>
          )}
        </span>
        <span className="post-card__display-name">{post.authorDisplayName}</span>
        {showSolvedBadge && isSolved && (
          <span className="post-card__solved-badge">解決済み</span>
        )}
      </div>

      <p className="post-card__body">{post.body}</p>

      <div className="post-card__meta-row">
        <span className="post-card__reply-count">返信 {safeReplyCount}件</span>
        {post.imageUrl && (
          <img
            className="post-card__thumb"
            src={post.imageUrl}
            alt=""
            loading="lazy"
            fetchPriority="low"
            decoding="async"
          />
        )}
      </div>

      {hasAllGenres && (
        <div className="post-card__tags">
          <span className="post-card__tag">{post.worryGenre}</span>
          <span className="post-card__tag">{post.musicGenre}</span>
          <span className="post-card__tag">{post.daw}</span>
        </div>
      )}

      {post.audioUrl && (
        <div className="post-card__audio">
          <button
            className={`post-card__play-btn ${isPlaying ? 'is-playing' : ''}`}
            onClick={handlePlayToggle}
            aria-label={isPlaying ? '一時停止' : '再生'}
          >
            <span className="post-card__play-icon" aria-hidden="true" />
          </button>
          {durationSec > 0 && (
            <span className="post-card__duration">{formatSeconds(durationSec)}</span>
          )}
          {hasFocusSecond && (
            <button
              type="button"
              className="post-card__focus-chip"
              onClick={handleFocusSecondJump}
            >
              {lastSeekReturnTime != null ? '元に戻る' : `${formatSeconds(focusSecondSec)}へ`}
            </button>
          )}
          <div
            className={`post-card__progress-bar${isPlaying ? ' is-playing' : ''}`}
            onClick={handleSeek}
            onTouchStart={handleSeek}
            role="slider"
            aria-label="再生位置"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="post-card__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <audio
            ref={audioRef}
            src={post.audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
          />
        </div>
      )}
    </div>
  );
}
