import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, STATUSES, statusLabel, formatDate, kindLabel, shrinkImage } from '../api.js';
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
        <h1>
          {topic ? topic.name : 'Library'}
          {topic && <Link to={`/topics/${topic.id}`} className="h1-link">Open topic page</Link>}
        </h1>
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
                  <span className={`kind kind-${s.kind}`}>{kindLabel(s.kind)}</span>
                  {(s.author || s.siteName) && <span>{[s.author, s.siteName].filter(Boolean).join(', ')}</span>}
                  <span>{formatDate(s.createdAt)}</span>
                  {s._count.highlights > 0 && <span>{s._count.highlights} highlight{s._count.highlights === 1 ? '' : 's'}</span>}
                  {s.processing !== 'ready' && <span className={`processing p-${s.processing}`}>{s.processing === 'failed' ? 'Processing failed' : s.processing === 'transcribing' ? 'Reading' : 'Processing'}</span>}
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
  const [photos, setPhotos] = useState([]);
  const [startPage, setStartPage] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
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
      else if (mode === 'photos') {
        const form = new FormData();
        for (const p of photos) form.append('photos', await shrinkImage(p));
        form.append('title', title);
        form.append('startPage', startPage);
        if (topicId) form.append('topicId', topicId);
        form.append('tags', tags.join(','));
        form.append('whySaved', whySaved);
        result = await api('/sources/photos', { method: 'POST', form });
      } else if (mode === 'media' && mediaFile) {
        const form = new FormData();
        form.append('file', mediaFile);
        if (topicId) form.append('topicId', topicId);
        form.append('tags', tags.join(','));
        form.append('whySaved', whySaved);
        result = await api('/sources/upload', { method: 'POST', form });
      } else if (mode === 'media') {
        result = await api('/sources/youtube', { method: 'POST', body: { url: videoUrl, transcript, title, ...common } });
      } else {
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

  const ready =
    mode === 'url' ? url.trim() :
    mode === 'file' ? file :
    mode === 'photos' ? photos.length > 0 :
    mode === 'media' ? mediaFile || videoUrl.trim() || transcript.trim() :
    text.trim();

  return (
    <form className="panel add-source" onSubmit={submit}>
      <div className="tabs" role="tablist">
        {[['url', 'Web page'], ['file', 'Upload file'], ['photos', 'Photos of pages'], ['media', 'Video or audio'], ['text', 'Paste text']].map(([k, l]) => (
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
      {mode === 'photos' && (
        <>
          <div className="field">
            <label htmlFor="add-photos">Photos</label>
            <input id="add-photos" type="file" accept="image/*" multiple onChange={(e) => setPhotos([...e.target.files])} />
            <p className="hint">
              Take or choose photos of book pages, in page order (up to 40). The AI reads the text, and anything you’ve underlined or highlighted on paper becomes a highlight.
              {photos.length > 0 && ` ${photos.length} photo${photos.length === 1 ? '' : 's'} chosen.`}
            </p>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="add-ptitle">Book or chapter title</label>
              <input id="add-ptitle" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="add-pstart">First page number (optional)</label>
              <input id="add-pstart" inputMode="numeric" value={startPage} onChange={(e) => setStartPage(e.target.value.replace(/\D/g, ''))} />
            </div>
          </div>
        </>
      )}
      {mode === 'media' && (
        <>
          <div className="field">
            <label htmlFor="add-video">YouTube link</label>
            <input id="add-video" type="url" placeholder="https://www.youtube.com/watch?v=…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} disabled={Boolean(mediaFile)} />
          </div>
          <details className="more" open={Boolean(transcript)}>
            <summary>Paste a transcript instead</summary>
            <p className="hint">YouTube sometimes blocks the app from fetching transcripts. If that happens, open the video, choose “Show transcript” under the description, select it all, copy, and paste it here. Podcast transcripts work here too, with or without a link. Timestamps are kept.</p>
            <div className="field">
              <label htmlFor="add-vtitle">Title</label>
              <input id="add-vtitle" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="add-transcript">Transcript</label>
              <textarea id="add-transcript" rows={6} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
            </div>
          </details>
          <div className="field">
            <label htmlFor="add-audio">Or upload an audio file</label>
            <input id="add-audio" type="file" accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg,.vtt,.srt" onChange={(e) => setMediaFile(e.target.files[0] || null)} />
            <p className="hint">Podcasts and recordings up to 25 MB are transcribed with timestamps. Subtitle files (VTT, SRT) work too.</p>
          </div>
        </>
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
