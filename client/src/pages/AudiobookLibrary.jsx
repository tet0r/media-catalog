import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AudiobookCard from '../components/AudiobookCard.jsx';
import GroupCard from '../components/GroupCard.jsx';
import useBulkSelection from '../hooks/useBulkSelection.js';
import BulkActionsMenu from '../components/BulkActionsMenu.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Same reasoning as Library.jsx: scroll position is a DOM concern this page
// still has to track itself, even though q/sort/dir now live in App.
let savedScrollY = 0;

function letterFor(str) {
  const ch = (str || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

// A book can have more than one author; grouping uses just the first
// listed (the primary/credited one), same convention as how a shelf of
// physical audiobooks would be sorted by whoever's name is on the spine.
function primaryAuthor(book) {
  return (book.authors && book.authors[0]) || null;
}

// Author groups sorted A-Z by name, with "Unknown Author" (no author data
// at all — e.g. a manually-added book that didn't resolve one) always last
// and bucketed under '#' rather than wherever "U" would otherwise fall, so
// it doesn't get confused for a real name.
function groupByAuthorName(audiobooks) {
  const map = new Map();
  for (const book of audiobooks) {
    const author = primaryAuthor(book) || 'Unknown Author';
    if (!map.has(author)) map.set(author, []);
    map.get(author).push(book);
  }
  const groups = [...map.entries()].map(([author, books]) => ({
    author,
    books,
    letter: author === 'Unknown Author' ? '#' : letterFor(author),
  }));
  groups.sort((a, b) => {
    if (a.author === 'Unknown Author') return 1;
    if (b.author === 'Unknown Author') return -1;
    return a.author.localeCompare(b.author, undefined, { sensitivity: 'base' });
  });
  return groups;
}

// Within one author's expanded books: series first (alphabetical), then
// by position within that series, so a multi-book series reads in the
// right order rather than however the library's own sort happened to
// return them. A book with no series data at all sorts after every book
// that has one, then falls back to title.
function sortBySeries(books) {
  return [...books].sort((a, b) => {
    const aSeries = a.series || '';
    const bSeries = b.series || '';
    if (aSeries !== bSeries) {
      if (!aSeries) return 1;
      if (!bSeries) return -1;
      return aSeries.localeCompare(bSeries, undefined, { sensitivity: 'base' });
    }
    const aSeq = Number(a.series_sequence) || 0;
    const bSeq = Number(b.series_sequence) || 0;
    if (aSeq !== bSeq) return aSeq - bSeq;
    return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
  });
}

export default function AudiobookLibrary({ q, sort, dir, onSortChange, groupByAuthor }) {
  const [audiobooks, setAudiobooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingJump, setPendingJump] = useState(null);
  const hasRestoredScroll = useRef(false);
  const sel = useBulkSelection();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [expandedAuthors, setExpandedAuthors] = useState(new Set());

  function toggleAuthor(author) {
    setExpandedAuthors((prev) => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });
  }

  const refreshAudiobooks = useCallback(() => {
    setLoading(true);
    api
      .listAudiobooks({ q, sort, dir })
      .then(setAudiobooks)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, sort, dir]);

  useEffect(() => {
    function handleScroll() {
      savedScrollY = window.scrollY;
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    refreshAudiobooks();
  }, [refreshAudiobooks]);

  useEffect(() => {
    if (loading) return;

    if (!hasRestoredScroll.current) {
      hasRestoredScroll.current = true;
      if (savedScrollY > 0) window.scrollTo(0, savedScrollY);
      return;
    }

    if (pendingJump && (groupByAuthor || sort === 'title')) {
      const el = document.getElementById(`letter-${pendingJump}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingJump(null);
    }
  }, [audiobooks, loading, sort, groupByAuthor, pendingJump]);

  function jumpTo(letter) {
    // Author groups are always alphabetical regardless of the sort field
    // (grouping is a separate axis from item-level sort), so jumping while
    // grouped never needs to force a sort change the way title-jumping
    // does in flat mode.
    if (!groupByAuthor && sort !== 'title') {
      setPendingJump(letter);
      onSortChange('title', 'asc');
      return;
    }
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Sequential, not Promise.all — a burst of concurrent requests against
  // the same sqlite connection is worth avoiding regardless of count.
  async function runBulk(ids, actionFn, label) {
    setBulkBusy(true);
    for (let i = 0; i < ids.length; i++) {
      setBulkProgress({ done: i, total: ids.length, label });
      try { await actionFn(ids[i]); } catch { /* keep going for the rest */ }
    }
    setBulkProgress(null);
    setBulkBusy(false);
    sel.exitSelectMode();
    refreshAudiobooks();
  }

  function bulkDelete() {
    const ids = [...sel.selectedIds];
    if (!confirm(`Delete ${ids.length} audiobook${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    runBulk(ids, api.deleteAudiobook, 'Deleting');
  }

  function bulkRefresh() {
    runBulk([...sel.selectedIds], api.refreshAudiobook, 'Refreshing');
  }

  const groups = groupByAuthor ? groupByAuthorName(audiobooks) : null;
  const availableLetters = new Set(
    groupByAuthor ? groups.map((g) => g.letter) : audiobooks.map((a) => letterFor(a.title))
  );
  const seenLetters = new Set();

  function renderCard(a, anchorId) {
    if (sel.selectMode) {
      return (
        <AudiobookCard
          key={a.id}
          id={anchorId}
          audiobook={a}
          selectMode
          selected={sel.selectedIds.has(a.id)}
          onToggleSelect={() => sel.toggle(a.id)}
        />
      );
    }
    return (
      <Link key={a.id} to={`/audiobooks/${a.id}`} id={anchorId}>
        <AudiobookCard audiobook={a} />
      </Link>
    );
  }

  return (
    <div className="library-page">
      <sel.Portal>
        <button
          type="button"
          className={`toolbar-toggle${sel.selectMode ? ' active' : ''}`}
          onClick={() => (sel.selectMode ? sel.exitSelectMode() : sel.setSelectMode(true))}
        >
          Select
        </button>
        {sel.selectMode && sel.selectedIds.size > 0 && (
          <BulkActionsMenu
            count={sel.selectedIds.size}
            disabled={bulkBusy}
            actions={[
              { key: 'refresh', label: 'Refresh Metadata', onClick: bulkRefresh },
              { key: 'delete', label: 'Delete Selected', onClick: bulkDelete, danger: true },
            ]}
          />
        )}
      </sel.Portal>

      {bulkProgress && (
        <p className="muted">{bulkProgress.label}... ({bulkProgress.done}/{bulkProgress.total})</p>
      )}
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : audiobooks.length === 0 ? (
        <p className="empty">
          No audiobooks yet. Use "Add Audiobook" to search by title, or "Scan Library" to import from your audiobook folder.
        </p>
      ) : groupByAuthor ? (
        <div className="grid">
          {groups.map((g) => {
            const isFirst = !seenLetters.has(g.letter);
            if (isFirst) seenLetters.add(g.letter);
            return (
              <GroupCard
                key={g.author}
                id={isFirst ? `letter-${g.letter}` : undefined}
                label={g.author}
                count={g.books.length}
                countLabel="book"
                coverUrls={g.books.map((a) => a.cover_url)}
                expanded={expandedAuthors.has(g.author)}
                onToggle={() => toggleAuthor(g.author)}
              >
                {sortBySeries(g.books).map((a) => renderCard(a, undefined))}
              </GroupCard>
            );
          })}
        </div>
      ) : (
        <div className="grid">
          {audiobooks.map((a) => {
            const letter = letterFor(a.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            return renderCard(a, isFirst ? `letter-${letter}` : undefined);
          })}
        </div>
      )}
      <p className="count">{audiobooks.length} audiobook{audiobooks.length === 1 ? '' : 's'}</p>

      {audiobooks.length > 0 && (
        <nav className="alpha-index" aria-label="Jump to letter">
          {LETTERS.map((letter) => (
            <button
              key={letter}
              type="button"
              disabled={!availableLetters.has(letter)}
              onClick={() => jumpTo(letter)}
            >
              {letter}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
