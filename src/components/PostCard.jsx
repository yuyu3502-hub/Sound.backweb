import { useState, useRef, useEffect } from 'react';
import './PostCard.css';

export function PostCard({ post, isPlaying, onPlay }) {
  const audioRef = useRef(null);
  const [progress, setProgress] = useState(0);

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
    onPlay(null);
  };

  const handlePlayToggle = (e) => {
    e.stopPropagation();
    onPlay(isPlaying ? null : post.id);
  };

  const initial = post.authorDisplayName?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="post-card">
      <div className="post-card__header">
        {post.authorPhotoUrl ? (
          <img
            className="post-card__avatar"
            src={post.authorPhotoUrl}
            alt=""
          />
        ) : (
          <div className="post-card__avatar-fallback">{initial}</div>
        )}
        <span className="post-card__display-name">{post.authorDisplayName}</span>
      </div>

      <p className="post-card__body">{post.body}</p>

      {post.audioUrl && (
        <div className="post-card__audio">
          <button
            className="post-card__play-btn"
            onClick={handlePlayToggle}
            aria-label={isPlaying ? '一時停止' : '再生'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <div className="post-card__progress-bar" aria-hidden="true">
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
