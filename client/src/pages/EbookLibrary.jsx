import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import EbookCard from '../components/EbookCard.jsx';
import GroupCard from '../components/GroupCard.jsx';
import GroupDetailModal from '../components/GroupDetailModal.jsx';
import MergeGroupsModal from '../components/MergeGroupsModal.jsx';
import useBulkSelection from '../hooks/useBulkSelection.js';
import BulkActionsMenu from '../components/BulkActionsMenu.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Same reasoning as Library.jsx/AudiobookLibrary.jsx: scroll position is a
// DOM concern this page still has to track itself, even though q/sort/dir
// now live in App.
let savedScrollY = 0;

function letterFor(str) {
  const ch = (str || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

// A book can have more than one author; grouping uses just the first
// listed, same convention as AudiobookLibrary.jsx.
function primaryAuthor(book) {
  return (book.authors && book.authors[0]) || null;
}

function groupByAuthorName(ebooks) {
  const map = new Map();
  for (const book of ebooks) {
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

// Ebooks have no series column at all (unlike audiobooks' series/
// series_sequence) — nothing to sort by within an author yet, so this is
// just a title sort for now, isolated in its own function so it's a clear
// single spot to extend if series data is ever captured for ebooks.
function sortWithinAuthor(books) {
  return [...books].sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
}

export default function EbookLibrary({ q, sort, dir, onSortChange, groupByAuthor }) {
  const [ebooks, setEbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingJump, setPendingJump] = useState(null);
  const hasRestoredScroll = useRef(false);
  const sel = useBulkSelection();
  const groupSel = useBulkSelection();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [openAuthor, setOpenAuthor] = useState(null);
  const [authorImages, setAuthorImages] = useState({});
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  const refreshEbooks = useCallback(() => {
    setLoading(true);
    api
      .listEbooks({ q, sort, dir })
      .then(setEbooks)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, sort, dir]);

  const refreshAuthorImages = useCallback(() => {
    api.listEbookAuthorImages().then(setAuthorImages).catch(() => {});
  }, []);

  useEffect(() => {
    refreshAuthorImages();
  }, [refreshAuthorImages]);

  async function renameAuthor(oldName, newName) {
    await api.renameEbookAuthors([oldName], newName);
    if (openAuthor === oldName) setOpenAuthor(newName);
    refreshEbooks();
    refreshAuthorImages();
  }

  async function uploadAuthorCover(authorName, file) {
    await api.uploadEbookAuthorCover(authorName, file);
    refreshAuthorImages();
  }

  async function setAuthorCoverUrl(authorName, url) {
    await api.setEbookAuthorCover(authorName, url);
    refreshAuthorImages();
  }

  async function deleteAuthorCover(authorName) {
    await api.deleteEbookAuthorCover(authorName);
    refreshAuthorImages();
  }

  function authorImageSearchTabs(authorName) {
    return [
      { key: 'openlibrary', label: 'Open Library', sourceLabel: "Via Open Library's author database.", fetchOptions: () => api.searchEbookAuthorImages(authorName) },
      { key: 'wikipedia', label: 'Wikipedia', sourceLabel: 'A general fallback — works for almost any well-known author.', fetchOptions: () => api.searchEbookAuthorImages(authorName, 'wikipedia') },
    ];
  }

  async function mergeAuthors(targetName) {
    await api.renameEbookAuthors([...groupSel.selectedIds], targetName);
    groupSel.exitSelectMode();
    setMergeModalOpen(false);
    refreshEbooks();
    refreshAuthorImages();
  }

  useEffect(() => {
    function handleScroll() {
      savedScrollY = window.scrollY;
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    refreshEbooks();
  }, [refreshEbooks]);

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
  }, [ebooks, loading, sort, groupByAuthor, pendingJump]);

  function jumpTo(letter) {
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
    refreshEbooks();
  }

  function bulkDelete() {
    const ids = [...sel.selectedIds];
    if (!confirm(`Delete ${ids.length} ebook${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    runBulk(ids, api.deleteEbook, 'Deleting');
  }

  function bulkRefresh() {
    runBulk([...sel.selectedIds], api.refreshEbook, 'Refreshing');
  }

  const groups = groupByAuthor ? groupByAuthorName(ebooks) : null;
  const openGroup = openAuthor && groups ? groups.find((g) => g.author === openAuthor) : null;
  const availableLetters = new Set(
    groupByAuthor ? groups.map((g) => g.letter) : ebooks.map((e) => letterFor(e.title))
  );
  const seenLetters = new Set();

  function renderCard(e, anchorId) {
    if (sel.selectMode) {
      return (
        <EbookCard
          key={e.id}
          id={anchorId}
          ebook={e}
          selectMode
          selected={sel.selectedIds.has(e.id)}
          onToggleSelect={() => sel.toggle(e.id)}
        />
      );
    }
    return (
      <Link key={e.id} to={`/ebooks/${e.id}`} id={anchorId}>
        <EbookCard ebook={e} />
      </Link>
    );
  }

  return (
    <div className="library-page">
      {groupByAuthor ? (
        <groupSel.Portal>
          <button
            type="button"
            className={`toolbar-toggle${groupSel.selectMode ? ' active' : ''}`}
            onClick={() => (groupSel.selectMode ? groupSel.exitSelectMode() : groupSel.setSelectMode(true))}
          >
            Select Groups
          </button>
          {groupSel.selectMode && groupSel.selectedIds.size >= 2 && (
            <button type="button" onClick={() => setMergeModalOpen(true)}>
              Merge {groupSel.selectedIds.size} Groups
            </button>
          )}
        </groupSel.Portal>
      ) : (
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
      )}

      {bulkProgress && (
        <p className="muted">{bulkProgress.label}... ({bulkProgress.done}/{bulkProgress.total})</p>
      )}
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : ebooks.length === 0 ? (
        <p className="empty">
          No ebooks yet. Use "Add Ebook" to search by title, or "Scan Library" to import from your ebook folder.
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
                coverUrls={g.books.map((e) => e.cover_url)}
                customImageUrl={authorImages[g.author]}
                onClick={() => setOpenAuthor(g.author)}
                selectMode={groupSel.selectMode}
                selected={groupSel.selectedIds.has(g.author)}
                onToggleSelect={() => groupSel.toggle(g.author)}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid">
          {ebooks.map((e) => {
            const letter = letterFor(e.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            return renderCard(e, isFirst ? `letter-${letter}` : undefined);
          })}
        </div>
      )}
      <p className="count">{ebooks.length} ebook{ebooks.length === 1 ? '' : 's'}</p>

      {ebooks.length > 0 && (
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

      {openGroup && (
        <GroupDetailModal
          label={openGroup.author}
          count={openGroup.books.length}
          countLabel="book"
          coverUrls={openGroup.books.map((e) => e.cover_url)}
          customImageUrl={authorImages[openGroup.author]}
          onClose={() => setOpenAuthor(null)}
          onRename={(newName) => renameAuthor(openGroup.author, newName)}
          onUploadCover={(file) => uploadAuthorCover(openGroup.author, file)}
          onSetCoverUrl={(url) => setAuthorCoverUrl(openGroup.author, url)}
          onDeleteCover={() => deleteAuthorCover(openGroup.author)}
          imageSearchTabs={authorImageSearchTabs(openGroup.author)}
        >
          {sortWithinAuthor(openGroup.books).map((e) => renderCard(e, undefined))}
        </GroupDetailModal>
      )}

      {mergeModalOpen && (
        <MergeGroupsModal
          sourceNames={[...groupSel.selectedIds]}
          onMerge={mergeAuthors}
          onClose={() => setMergeModalOpen(false)}
        />
      )}
    </div>
  );
}
