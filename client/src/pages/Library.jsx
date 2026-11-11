import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, STATUSES, statusLabel, formatDate } from '../api.js';
import { useTopics } from '../App.jsx';
import TopicSelect from '../components/TopicSelect.jsx';
import TagsField from '../components/TagsField.jsx';

export default function Library() {
  const [params, setParams] = useSearchParams();
  const topicId = params.get('topic') || '';
  const status = params.get('status') || '';
  const tag = params.get('tag') || '';
  const [q, setQ] = useState('');
  const [sources, setSources] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const { topics } = useTopics();
  const topic = topics.find((t) => t.id === topicId);

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  useEffect(() => {
    const qs = new URLSearchParams();
    if (topicId) qs.set('topicId', topicId);
    if (status) qs.set('status', status);
    if (tag) qs.set('tag', tag);
    if (q) qs.set('q', q);
    const t = setTimeout(() => {
      api('/sources?' + qs.toString())
        .then((d) => setSources(d.sources))
        .catch((e) => setError(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [topicId, status, tag, q]);

  const empty = sources && !sources.length && !topicId && !status && !tag && !q;

  return (
    <div className="page">
      <div className="page-head">
        <h1>{topic ? topic.name : 'Library'}</h1>
        <button className="primary" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
          {adding ? 'Close' : 'Add source'}
        </button>
      </div>

      {adding && <AddSource defaultTopic={topicId} />}

      <div className="filters">
        <input type="search" placeholder="Filter by title" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter by title" />
        <TopicSelect value={topicId} onChange={(v) => setParam('topic', v)} allowAll />
        <select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Reading status">
          <option value="">Any status</option>
          {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {tag && (
          <button className="chip removable" onClick={() => setParam('tag', '')}>
            #{tag} <span aria-hidden="true">×</span><span className="sr-only">Remove tag filter</span>
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {!sources && !error && <p className="muted">Loading…</p>}

      {empty && !adding && (
        <div className="empty">
          <p>Your library is empty. Save a web page, upload a PDF, or paste some text to start.</p>
          <button className="primary" onClick={() => setAdding(true)}>Add your first source</button>
        </div>
      )}
      {sources && !sources.length && !empty && <p className="muted">No sources match these filters.</p>}

      {sources && sources.length > 0 && (
        <ul className="source-list">
          {sources.map((s) => (
            <li key={s.id} className="source-row">
              <div className="source-row-main">
                <Link to={`/sources/${s.id}`} className="source-title">{s.title}</Link>
                <div className="source-meta">
                  <span className={`kind kind-${s.kind}`}>{s.kind === 'web' ? 'Web page' : s.kind === 'pdf' ? 'PDF' : 'Text'}</span>
                  {(s.author || s.siteName) && <span>{[s.author, s.siteName].filter(Boolean).join(', ')}</span>}
                  <span>{formatDate(s.createdAt)}</span>
                  {s._count.highlights > 0 && <span>{s._count.highlights} highlight{s._count.highlights === 1 ? '' : 's'}</span>}
                  {s.processing !== 'ready' && <span className={`processing p-${s.processing}`}>{s.processing === 'failed' ? 'Processing failed' : 'Processing'}</span>}
                </div>
                {s.tags.length > 0 && (
                  <div className="tags">
                    {s.tags.map((t) => (
                      <button key={t} className="chip" onClick={() => setParam('tag', t)}>#{t}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="source-row-side">
                <span className={`status s-${s.status}`}>{statusLabel(s.status)}</span>
                {s.topic && !topicId && <span className="muted small">{s.topic.name}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddSource({ defaultTopic }) {
  const [mode, setMode] = useState('url');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [topicId, setTopicId] = useState(defaultTopic || null);
  const [tags, setTags] = useState([]);
  const [whySaved, setWhySaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let result;
      const common = { topicId, tags, whySaved };
      if (mode === 'url') result = await api('/sources/url', { method: 'POST', body: { url, ...common } });
      else if (mode === 'text') result = await api('/sources/text', { method: 'POST', body: { title, text, ...common } });
      else {
        const form = new FormData();
        form.append('file', file);
        if (topicId) form.append('topicId', topicId);
        form.append('tags', tags.join(','));
        form.append('whySaved', whySaved);
        result = await api('/sources/upload', { method: 'POST', form });
      }
      navigate(`/sources/${result.source.id}${result.duplicate ? '?duplicate=1' : ''}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const ready = mode === 'url' ? url.trim() : mode === 'file' ? file : text.trim();

  return (
    <form className="panel add-source" onSubmit={submit}>
      <div className="tabs" role="tablist">
        {[['url', 'Web page'], ['file', 'Upload file'], ['text', 'Paste text']].map(([k, l]) => (
          <button type="button" role="tab" aria-selected={mode === k} key={k} className={mode === k ? 'tab active' : 'tab'} onClick={() => setMode(k)}>{l}</button>
        ))}
      </div>

      {mode === 'url' && (
        <div className="field">
          <label htmlFor="add-url">Link</label>
          <input id="add-url" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
          <p className="hint">Works for articles and PDF links. For pages behind a login, use the bookmarklet from Settings.</p>
        </div>
      )}
      {mode === 'file' && (
        <div className="field">
          <label htmlFor="add-file">File</label>
          <input id="add-file" type="file" accept=".pdf,.txt,.md,.markdown,.html,.htm" onChange={(e) => setFile(e.target.files[0] || null)} />
          <p className="hint">PDF, Markdown, plain text or saved HTML, up to 50 MB.</p>
        </div>
      )}
      {mode === 'text' && (
        <>
          <div className="field">
            <label htmlFor="add-title">Title</label>
            <input id="add-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="add-text">Text</label>
            <textarea id="add-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        </>
      )}

      <div className="field-row">
        <div className="field">
          <label htmlFor="add-topic">Topic</label>
          <TopicSelect id="add-topic" value={topicId} onChange={setTopicId} />
        </div>
        <div className="field">
          <label htmlFor="add-tags">Tags</label>
          <TagsField id="add-tags" value={tags} onChange={setTags} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="add-why">Why are you saving this?</label>
        <input id="add-why" value={whySaved} onChange={(e) => setWhySaved(e.target.value)} placeholder="One line for future you" />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || !ready}>{busy ? 'Saving…' : 'Save to library'}</button>
    </form>
  );
}
