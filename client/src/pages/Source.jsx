import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, STATUSES, formatDate } from '../api.js';
import { useTopics } from '../App.jsx';
import Reader, { offsetWithin } from '../components/Reader.jsx';
import TopicSelect from '../components/TopicSelect.jsx';
import TagsField from '../components/TagsField.jsx';

export default function Source() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { reload: reloadTopics } = useTopics();
  const [source, setSource] = useState(null);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState(null);
  const [selNote, setSelNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [suggested, setSuggested] = useState([]);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const readerRef = useRef(null);
  const focusRef = useRef(null);

  const focus = useMemo(() => {
    const at = parseInt(params.get('at'), 10);
    const end = parseInt(params.get('end'), 10);
    return Number.isFinite(at) && Number.isFinite(end) && end > at ? { start: at, end } : null;
  }, [params]);

  const load = useCallback(() => {
    return api(`/sources/${id}`)
      .then((d) => setSource(d.source))
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    setSource(null);
    setError('');
    setSelection(null);
    setSuggested([]);
    load();
  }, [load]);

  // Keep checking while the source is being processed in the background.
  useEffect(() => {
    if (!source || !['pending', 'processing', 'transcribing'].includes(source.processing)) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [source, load]);

  useEffect(() => {
    if (source && focus && focusRef.current) {
      focusRef.current.scrollIntoView({ block: 'center' });
    }
  }, [source?.id, focus]);

  // Track text selections inside the reader.
  useEffect(() => {
    function onSelectionChange() {
      const sel = window.getSelection();
      const container = readerRef.current;
      if (!sel || sel.isCollapsed || !sel.rangeCount || !container || !source) return;
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      let start = offsetWithin(container, range.startContainer, range.startOffset);
      let end = offsetWithin(container, range.endContainer, range.endOffset);
      const text = source.text;
      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;
      if (end - start < 2) return;
      setSelection({ start, end, quote: text.slice(start, end) });
    }
    let timer;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(onSelectionChange, 150);
    };
    document.addEventListener('selectionchange', debounced);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', debounced);
    };
  }, [source]);

  async function patch(data) {
    const { source: updated } = await api(`/sources/${id}`, { method: 'PATCH', body: data });
    setSource((s) => ({ ...s, ...updated, topic: updated.topic }));
    if ('topicId' in data) reloadTopics();
  }

  async function saveHighlight() {
    if (!selection) return;
    setSaving(true);
    try {
      const { highlight } = await api('/highlights', {
        method: 'POST',
        body: { sourceId: id, quote: selection.quote, startPos: selection.start, endPos: selection.end, note: selNote },
      });
      setSource((s) => ({
        ...s,
        highlights: [...s.highlights, highlight].sort((a, b) => (a.startPos ?? 1e12) - (b.startPos ?? 1e12)),
      }));
      setSelection(null);
      setSelNote('');
      window.getSelection()?.removeAllRanges();
      setActiveId(highlight.id);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateHighlight(hid, data) {
    const { highlight } = await api(`/highlights/${hid}`, { method: 'PATCH', body: data });
    setSource((s) => ({ ...s, highlights: s.highlights.map((h) => (h.id === hid ? highlight : h)) }));
  }

  async function deleteHighlight(hid) {
    if (!window.confirm('Delete this highlight?')) return;
    await api(`/highlights/${hid}`, { method: 'DELETE' });
    setSource((s) => ({ ...s, highlights: s.highlights.filter((h) => h.id !== hid) }));
  }

  function jumpToHighlight(hid) {
    setActiveId(hid);
    document.querySelector(`mark[data-hid="${hid}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function onMarkClick(hid) {
    setActiveId(hid);
    document.getElementById(`hl-${hid}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function summarize() {
    setSummarizing(true);
    setSummaryError('');
    try {
      const { summary, suggestedTags } = await api(`/sources/${id}/summarize`, { method: 'POST' });
      setSource((s) => ({ ...s, summary }));
      setSuggested(suggestedTags);
    } catch (e) {
      setSummaryError(e.message);
    } finally {
      setSummarizing(false);
    }
  }

  async function newNote() {
    const { note } = await api('/notes', {
      method: 'POST',
      body: { title: `Notes on ${source.title}`.slice(0, 200), sourceIds: [id], topicId: source.topicId },
    });
    navigate(`/notes/${note.id}`);
  }

  async function remove() {
    if (!window.confirm('Delete this source, its highlights and its stored file? Notes stay but lose the link.')) return;
    await api(`/sources/${id}`, { method: 'DELETE' });
    reloadTopics();
    navigate('/');
  }

  async function reprocess() {
    await api(`/sources/${id}/reprocess`, { method: 'POST' });
    load();
  }

  if (error) return <div className="page"><p className="error">{error}</p><Link to="/">Back to library</Link></div>;
  if (!source) return <div className="page"><p className="muted">Loading…</p></div>;

  const busy = ['pending', 'processing', 'transcribing'].includes(source.processing);
  const ytId = source.kind === 'video' && source.url ? youtubeIdFromUrl(source.url) : null;
  const timeHref = ytId
    ? (sec) => `https://www.youtube.com/watch?v=${ytId}&t=${sec}s`
    : source.kind === 'audio' && source.filePath
    ? (sec) => `/api/sources/${id}/file#t=${sec}`
    : null;

  return (
    <div className="reader-layout">
      <article className="reader">
        <Link to="/" className="back">Library</Link>
        {params.get('duplicate') && <p className="notice">This link was already in your library, so you’re looking at the saved copy.</p>}
        <h1 className="reader-title">{source.title}</h1>
        <p className="reader-meta">
          {[source.author, source.siteName, source.publishedAt && formatDate(source.publishedAt), `Saved ${formatDate(source.createdAt)}`]
            .filter(Boolean)
            .join(', ')}
        </p>
        {source.processing === 'transcribing' && (
          <p className="notice">{source.processingError || 'Reading the pages'}. The text appears here when it’s done. You can leave this page and come back.</p>
        )}
        {busy && source.processing !== 'transcribing' && <p className="notice">Preparing this source for search. You can read and highlight while that happens.</p>}
        {source.processing === 'failed' && (
          <p className="notice warn">
            Search preparation failed: {source.processingError}{' '}
            <button className="link" onClick={reprocess}>Try again</button>
          </p>
        )}
        {source.whySaved && <p className="why"><span className="why-label">Why you saved it</span>{source.whySaved}</p>}
        <Reader
          ref={readerRef}
          focusRef={focusRef}
          text={source.text}
          segments={source.segments}
          highlights={source.highlights}
          focus={focus}
          activeId={activeId}
          onMarkClick={onMarkClick}
          timeHref={timeHref}
        />
      </article>

      <aside className="reader-side">
        <section className="side-block">
          <div className="field-row tight">
            <div className="field">
              <label htmlFor="src-status">Status</label>
              <select id="src-status" value={source.status} onChange={(e) => patch({ status: e.target.value })}>
                {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="src-topic">Topic</label>
              <TopicSelect id="src-topic" value={source.topicId} onChange={(v) => patch({ topicId: v })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="src-tags">Tags</label>
            <TagsField id="src-tags" value={source.tags} onChange={(tags) => patch({ tags })} />
          </div>
          <div className="field">
            <label htmlFor="src-why">Why you saved it</label>
            <BlurTextarea id="src-why" rows={2} value={source.whySaved || ''} onSave={(v) => patch({ whySaved: v })} />
          </div>
          <details className="more">
            <summary>Edit details</summary>
            <div className="field">
              <label htmlFor="src-title">Title</label>
              <BlurInput id="src-title" value={source.title} onSave={(v) => v.trim() && patch({ title: v })} />
            </div>
            <div className="field">
              <label htmlFor="src-author">Author</label>
              <BlurInput id="src-author" value={source.author || ''} onSave={(v) => patch({ author: v })} />
            </div>
            <div className="field">
              <label htmlFor="src-url">Link</label>
              <BlurInput id="src-url" value={source.url || ''} onSave={(v) => patch({ url: v })} />
            </div>
            <div className="field">
              <label htmlFor="src-date">Published</label>
              <BlurInput id="src-date" value={source.publishedAt || ''} onSave={(v) => patch({ publishedAt: v })} />
            </div>
          </details>
          <div className="actions">
            {source.url && <a href={source.url} target="_blank" rel="noreferrer">Open original page</a>}
            {source.filePath && <a href={`/api/sources/${id}/file`} target="_blank" rel="noreferrer">Open original file</a>}
          </div>
        </section>

        <section className="side-block">
          <div className="side-block-head">
            <h2>AI summary</h2>
            <button className="small-btn" onClick={summarize} disabled={summarizing}>
              {summarizing ? 'Summarizing…' : source.summary ? 'Summarize again' : 'Summarize'}
            </button>
          </div>
          {summaryError && <p className="error small">{summaryError}</p>}
          {source.summary ? (
            <>
              <p className="ai-label">Written by AI. Check it against the text.</p>
              <div className="summary">{source.summary}</div>
            </>
          ) : (
            !summaryError && <p className="muted small">A short summary and the main claims, generated from this source.</p>
          )}
          {suggested.length > 0 && (
            <div className="suggested">
              <p className="small">Suggested tags. Click to add:</p>
              <div className="tags">
                {suggested.map((t) => (
                  <button
                    key={t}
                    className="chip add"
                    onClick={() => {
                      patch({ tags: [...source.tags, t] });
                      setSuggested((s) => s.filter((x) => x !== t));
                    }}
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="side-block">
          <h2>Highlights {source.highlights.length > 0 && <span className="count">{source.highlights.length}</span>}</h2>
          {!source.highlights.length && <p className="muted small">Select any text in the source to highlight it.</p>}
          <ul className="hl-list">
            {source.highlights.map((h) => (
              <li key={h.id} id={`hl-${h.id}`} className={h.id === activeId ? 'hl active' : 'hl'}>
                <button className="hl-quote" onClick={() => jumpToHighlight(h.id)} disabled={h.startPos == null}>
                  {h.quote.length > 280 ? h.quote.slice(0, 280) + '…' : h.quote}
                </button>
                {h.location && <span className="hl-loc">{h.location}</span>}
                <BlurTextarea
                  rows={h.note ? 2 : 1}
                  placeholder="Add a note"
                  value={h.note || ''}
                  onSave={(v) => updateHighlight(h.id, { note: v })}
                  aria-label="Note for this highlight"
                />
                <button className="link danger small" onClick={() => deleteHighlight(h.id)}>Delete highlight</button>
              </li>
            ))}
          </ul>
        </section>

        <Related id={id} ready={source.processing === 'ready'} />

        <section className="side-block">
          <div className="side-block-head">
            <h2>Notes</h2>
            <button className="small-btn" onClick={newNote}>Write a note</button>
          </div>
          {source.noteLinks.length ? (
            <ul className="plain-list">
              {source.noteLinks.map(({ note }) => (
                <li key={note.id}><Link to={`/notes/${note.id}`}>{note.title}</Link></li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Notes that cite this source appear here.</p>
          )}
        </section>

        <section className="side-block quiet">
          {source.processing === 'ready' && <button className="link small" onClick={reprocess}>Rebuild search index for this source</button>}
          {source.processingError && source.processing === 'ready' && <p className="muted small">{source.processingError}</p>}
          <button className="link danger small" onClick={remove}>Delete source</button>
        </section>
      </aside>

      {selection && (
        <div className="selection-bar" role="dialog" aria-label="New highlight">
          <p className="selection-quote">“{selection.quote.length > 160 ? selection.quote.slice(0, 160) + '…' : selection.quote}”</p>
          <div className="selection-controls">
            <input
              value={selNote}
              onChange={(e) => setSelNote(e.target.value)}
              placeholder="Why this matters (optional)"
              onKeyDown={(e) => e.key === 'Enter' && saveHighlight()}
              aria-label="Note for this highlight"
            />
            <button className="primary" onClick={saveHighlight} disabled={saving}>{saving ? 'Saving…' : 'Save highlight'}</button>
            <button onClick={() => { setSelection(null); setSelNote(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BlurInput({ value, onSave, ...rest }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input {...rest} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />;
}

function BlurTextarea({ value, onSave, ...rest }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <textarea {...rest} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />;
}

function youtubeIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1);
    return u.searchParams.get('v') || u.pathname.match(/\/(shorts|embed|live)\/([\w-]+)/)?.[2] || null;
  } catch {
    return null;
  }
}

function Related({ id, ready }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!ready) return;
    api(`/sources/${id}/related`).then(setData).catch(() => setData({ related: [] }));
  }, [id, ready]);
  if (!ready || !data) return null;
  if (data.reason === 'needs-embeddings') return null;
  return (
    <section className="side-block">
      <h2>Related in other topics</h2>
      {!data.related.length && <p className="muted small">Nothing similar elsewhere in your library yet.</p>}
      <ul className="plain-list related-list">
        {data.related.map((r) => (
          <li key={r.sourceId}>
            <Link to={`/sources/${r.sourceId}?at=${r.startPos}&end=${r.endPos}`} className="related-title">{r.sourceTitle}</Link>
            <span className="hl-loc">{[r.topicName || 'No topic', r.location].filter(Boolean).join(', ')}</span>
            <p className="related-text">{r.text}</p>
            <Link to={`/sources/${id}?at=${r.mine.startPos}&end=${r.mine.endPos}`} className="small">
              Similar to {r.mine.location || 'a passage'} here
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
