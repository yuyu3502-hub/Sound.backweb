import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { useAuth } from '../context/AuthContext';
import { logAppEvent } from '../firebase';
import { buildAuthPath } from '../utils/authLinks';
import {
  DTM_PAIN_LIBRARY,
  PAIN_CATEGORIES,
  buildPainEntryUrl,
  buildPainShareText,
  getPainEntry,
  getPainCategory,
  getPopularPainTags,
  searchPainLibrary,
} from '../data/dtmPainLibrary';
import './LibraryPage.css';

export function LibraryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { firebaseUser } = useAuth();
  const initialEntry = useMemo(() => {
    const entryId = new URLSearchParams(location.search).get('entry');
    return entryId ? getPainEntry(entryId) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(initialEntry?.category ?? 'all');
  const [selectedTag, setSelectedTag] = useState('');
  const [expandedId, setExpandedId] = useState(initialEntry?.id ?? null);
  const [copyStateById, setCopyStateById] = useState({});

  const popularTags = useMemo(() => getPopularPainTags(), []);
  const results = useMemo(() => searchPainLibrary(DTM_PAIN_LIBRARY, {
    query,
    category,
    tag: selectedTag,
  }), [category, query, selectedTag]);

  const categoryCounts = useMemo(() => {
    const counts = new Map(PAIN_CATEGORIES.map((item) => [item.id, 0]));
    DTM_PAIN_LIBRARY.forEach((entry) => {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    });
    return counts;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const entryId = params.get('entry');
    if (!entryId) return;

    const entry = getPainEntry(entryId);
    if (!entry) return;

    window.setTimeout(() => {
      document.getElementById(`library-entry-${entry.id}`)?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    }, 80);

    logAppEvent('library_entry_deeplink_view', {
      entry_id: entry.id,
      category: entry.category,
      source: params.get('source') || 'unknown',
    });
  }, [location.search]);

  const getPublicOrigin = () => {
    if (typeof window === 'undefined') return 'https://sound-fix-ecfcf.web.app';
    return window.location.origin;
  };

  const setEntryCopyState = (entryId, state) => {
    setCopyStateById((current) => ({ ...current, [entryId]: state }));
    window.setTimeout(() => {
      setCopyStateById((current) => {
        if (current[entryId] !== state) return current;
        return { ...current, [entryId]: 'idle' };
      });
    }, 1600);
  };

  const handleCategoryChange = (nextCategory) => {
    setCategory(nextCategory);
    setExpandedId(null);
    logAppEvent('library_category_click', {
      category: nextCategory,
      selected_tag: selectedTag || 'none',
      has_query: Boolean(query.trim()),
    });
  };

  const handleTagClick = (tag) => {
    const nextTag = selectedTag === tag ? '' : tag;
    setSelectedTag(nextTag);
    setExpandedId(null);
    logAppEvent('library_tag_click', {
      tag,
      enabled: nextTag === tag,
      category,
    });
  };

  const handleEntryOpen = (entry) => {
    const nextId = expandedId === entry.id ? null : entry.id;
    setExpandedId(nextId);
    if (nextId) {
      const params = new URLSearchParams(location.search);
      params.set('entry', entry.id);
      params.set('source', params.get('source') || 'library');
      navigate(`/library?${params.toString()}`, { replace: true });
    }
    logAppEvent('library_entry_toggle', {
      entry_id: entry.id,
      category: entry.category,
      open: nextId === entry.id,
    });
  };

  const handleCopyEntryUrl = async (entry) => {
    const url = buildPainEntryUrl(entry, getPublicOrigin());
    try {
      await navigator.clipboard.writeText(url);
      setEntryCopyState(entry.id, 'copied');
      logAppEvent('library_entry_url_copy', {
        entry_id: entry.id,
        category: entry.category,
        result: 'copied',
      });
    } catch {
      setEntryCopyState(entry.id, 'failed');
      logAppEvent('library_entry_url_copy', {
        entry_id: entry.id,
        category: entry.category,
        result: 'failed',
      });
    }
  };

  const handleOpenEntryOnX = (entry) => {
    const shareText = buildPainShareText(entry, getPublicOrigin());
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    const opened = window.open(intentUrl, '_blank', 'noopener,noreferrer');
    logAppEvent('library_entry_x_draft_open', {
      entry_id: entry.id,
      category: entry.category,
      result: opened ? 'opened' : 'failed',
      char_count: Array.from(shareText).length,
    });
  };

  const handleCreateFromEntry = (entry) => {
    logAppEvent('library_create_click', {
      entry_id: entry.id,
      category: entry.category,
      signed_in: Boolean(firebaseUser),
    });

    const params = new URLSearchParams({
      source: 'library',
      worry: entry.title,
      body: entry.prompt,
    });
    const returnTo = `/create?${params.toString()}`;

    if (firebaseUser) {
      navigate(returnTo);
      return;
    }

    navigate(buildAuthPath({ returnTo }), {
      state: {
        message: '相談を投稿するには無料登録が必要です。',
        returnTo,
      },
    });
  };

  const handleClear = () => {
    setQuery('');
    setCategory('all');
    setSelectedTag('');
    setExpandedId(null);
    logAppEvent('library_clear_click');
  };

  return (
    <div className="library-page">
      <header className="library-header">
        <div className="library-header__inner">
          <p className="library-eyebrow">Sound.back Library</p>
          <h1>制作の悩みを探す</h1>
          <p>Redditなどで繰り返し出るDTMの悩みを、相談しやすい言葉に整理しています。</p>
        </div>
      </header>

      <main className="library-main">
        <section className="library-search" aria-label="悩み検索">
          <div className="library-search__row">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例: 低音、ボーカル、完成しない、AI"
              className="library-search__input"
            />
            {(query || category !== 'all' || selectedTag) && (
              <button type="button" className="library-clear" onClick={handleClear}>
                クリア
              </button>
            )}
          </div>

          <div className="library-categories" aria-label="カテゴリ">
            <button
              type="button"
              className={`library-category ${category === 'all' ? 'is-active' : ''}`}
              onClick={() => handleCategoryChange('all')}
            >
              <span>すべて</span>
              <strong>{DTM_PAIN_LIBRARY.length}</strong>
            </button>
            {PAIN_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`library-category ${category === item.id ? 'is-active' : ''}`}
                onClick={() => handleCategoryChange(item.id)}
              >
                <span>{item.label}</span>
                <strong>{categoryCounts.get(item.id) ?? 0}</strong>
              </button>
            ))}
          </div>

          <div className="library-tags" aria-label="よく出るタグ">
            {popularTags.map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                className={`library-tag ${selectedTag === tag ? 'is-active' : ''}`}
                onClick={() => handleTagClick(tag)}
              >
                {tag}
                <span>{count}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="library-summary" aria-label="検索結果">
          <div>
            <h2>{results.length}件の悩み</h2>
            <p>
              自分に近いものを開くと、そのまま相談投稿に使える下書きが見られます。
            </p>
          </div>
          <button type="button" onClick={() => navigate('/search?source=library')}>
            実際の相談を見る
          </button>
        </section>

        <div className="library-list">
          {results.map((entry) => {
            const entryCategory = getPainCategory(entry.category);
            const isOpen = expandedId === entry.id;

            return (
              <article
                key={entry.id}
                id={`library-entry-${entry.id}`}
                className={`library-entry ${isOpen ? 'is-open' : ''}`}
              >
                <button
                  type="button"
                  className="library-entry__head"
                  onClick={() => handleEntryOpen(entry)}
                  aria-expanded={isOpen}
                >
                  <span className="library-entry__category">{entryCategory.label}</span>
                  <span className="library-entry__title">{entry.title}</span>
                  <span className="library-entry__toggle">{isOpen ? '閉じる' : '見る'}</span>
                </button>

                {isOpen && (
                  <div className="library-entry__body">
                    <p>{entry.summary}</p>
                    <div className="library-entry__tags">
                      {entry.tags.map((tag) => (
                        <button key={tag} type="button" onClick={() => handleTagClick(tag)}>
                          {tag}
                        </button>
                      ))}
                    </div>
                    {entry.operationGuide && (
                      <div className="library-entry__operation">
                        <div>
                          <span>まず見る場所</span>
                          <ul>
                            {entry.operationGuide.where.map((text) => (
                              <li key={text}>{text}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <span>ショートカット</span>
                          <ul>
                            {entry.operationGuide.shortcuts.map((text) => (
                              <li key={text}>{text}</li>
                            ))}
                          </ul>
                        </div>
                        {entry.operationGuide.firstCheck?.length > 0 && (
                          <div>
                            <span>最初の確認</span>
                            <ul>
                              {entry.operationGuide.firstCheck.map((text) => (
                                <li key={text}>{text}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p>ショートカットやメニュー名は、OS/DAWバージョン/個別設定で変わることがあります。</p>
                      </div>
                    )}
                    <div className="library-entry__prompt">
                      <span>相談文の例</span>
                      <p>{entry.prompt}</p>
                    </div>
                    {entry.aiAnswer && (
                      <div className="library-entry__answer">
                        <span>AIによる回答</span>
                        <p>{entry.aiAnswer}</p>
                      </div>
                    )}
                    <div className="library-entry__actions">
                      <button type="button" onClick={() => handleCreateFromEntry(entry)}>
                        この悩みで相談する
                      </button>
                      <button type="button" onClick={() => navigate(`/search?source=library&keyword=${encodeURIComponent(entry.title)}`)}>
                        近い投稿を探す
                      </button>
                      <button type="button" onClick={() => handleCopyEntryUrl(entry)}>
                        {copyStateById[entry.id] === 'copied' ? 'URLコピー済み' : copyStateById[entry.id] === 'failed' ? 'コピー失敗' : 'URLコピー'}
                      </button>
                      <button type="button" onClick={() => handleOpenEntryOnX(entry)}>
                        X下書き
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </main>

      <BottomNav active="library" />
    </div>
  );
}
