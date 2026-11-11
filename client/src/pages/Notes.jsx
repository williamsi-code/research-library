import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatDate } from '../api.js';
import TopicSelect from '../components/TopicSelect.jsx';
import TagsField from '../components/TagsField.jsx';

export default function Notes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [notes, setNotes] = useState(null);
  const [q, setQ] = useState('');

  const loadList = () => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return api('/notes' + qs).then((d) => setNotes(d.notes)).catch(() => setNotes([]));
  };

  useEffect(() => {
    const t = setTimeout(loadList, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  async function create() {
    const { note } = await api('/notes', { method: 'POST', body: { title: 'Untitled note' } });
    await loadList();
    navigate(`/notes/${note.id}`);
  }

  return (
    <div className={`notes-layout ${id ? 'has-note' : ''}`}>
      <div className="notes-list-col">
        <div className="page-head">
          <h1>Notes</h1>
          <button className="primary" onClick={create}>New note</button>
        </div>
        <input type="search" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
        {notes && !notes.length && (
          <p className="muted small">
            {q ? 'No notes match.' : 'Notes are your own thinking: summaries, questions, and what you’ve concluded. Start one here or from any source.'}
          </p>
        )}
        <ul className="notes-list">
          {(notes || []).map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} className={n.id === id ? 'active' : ''}>
                <span className="note-title">{n.title}</span>
                <span className="note-preview">{n.body || 'Empty note'}</span>
                <span className="note-date">{formatDate(n.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="note-editor-col">
        {id ? <NoteEditor key={id} id={id} onChanged={loadList} /> : <p className="muted center-hint">Choose a note, or start a new one.</p>}
      </div>
    </div>
  );
}

function NoteEditor({ id, onChanged }) {
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [draft, setDraft] = useState(null);
  const [allSources, setAllSources] = useState([]);
  const [state, setState] = useState('saved'); // saved | dirty | saving | error
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/notes/${id}`)
      .then(({ note }) => {
        setNote(note);
        setDraft({
          title: note.title,
          body: note.body,
          tags: note.tags,
          topicId: note.topicId,
          sourceIds: note.sources.map((s) => s.source.id),
        });
      })
      .catch((e) => setError(e.message));
    api('/sources').then((d) => setAllSources(d.sources)).catch(() => {});
  }, [id]);

  function change(patch) {
    setDraft((d) => ({ ...d, ...patch }));
    setState('dirty');
  }

  async function save() {
    setState('saving');
    try {
      const { note: saved } = await api(`/notes/${id}`, { method: 'PATCH', body: draft });
      setNote(saved);
      setState('saved');
      onChanged();
    } catch (e) {
      setError(e.message);
      setState('error');
    }
  }

  // Save a moment after typing stops.
  useEffect(() => {
    if (state !== 'dirty') return;
    const t = setTimeout(save, 1200);
    return () => clearTimeout(t);
  }, [draft, state]);

  async function remove() {
    if (!window.confirm('Delete this note?')) return;
    await api(`/notes/${id}`, { method: 'DELETE' });
    onChanged();
    navigate('/notes');
  }

  if (error && !note) return <p className="error">{error}</p>;
  if (!draft) return <p className="muted">Loading…</p>;

  const linked = draft.sourceIds.map((sid) => allSources.find((s) => s.id === sid) || note.sources.find((x) => x.source.id === sid)?.source).filter(Boolean);
  const unlinked = allSources.filter((s) => !draft.sourceIds.includes(s.id));

  return (
    <div className="note-editor">
      <div className="note-toolbar">
        <Link to="/notes" className="back only-mobile">All notes</Link>
        <span className={`save-state ${state}`}>
          {state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : state === 'error' ? 'Not saved' : 'Unsaved changes'}
        </span>
        <button className="link danger small" onClick={remove}>Delete note</button>
      </div>
      <input
        className="note-title-input"
        value={draft.title}
        onChange={(e) => change({ title: e.target.value })}
        aria-label="Note title"
      />
      <textarea
        className="note-body"
        value={draft.body}
        onChange={(e) => change({ body: e.target.value })}
        placeholder="What did you learn? What do you think? What’s still unclear?"
        aria-label="Note text"
      />
      <div className="field-row">
        <div className="field">
          <label htmlFor="note-topic">Topic</label>
          <TopicSelect id="note-topic" value={draft.topicId} onChange={(v) => change({ topicId: v })} />
        </div>
        <div className="field">
          <label htmlFor="note-tags">Tags</label>
          <TagsField id="note-tags" value={draft.tags} onChange={(tags) => change({ tags })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="note-link">Sources this note draws on</label>
        <div className="tags">
          {linked.map((s) => (
            <span key={s.id} className="chip linked">
              <Link to={`/sources/${s.id}`}>{s.title}</Link>
              <button onClick={() => change({ sourceIds: draft.sourceIds.filter((x) => x !== s.id) })} aria-label={`Unlink ${s.title}`}>×</button>
            </span>
          ))}
        </div>
        <select id="note-link" value="" onChange={(e) => e.target.value && change({ sourceIds: [...draft.sourceIds, e.target.value] })}>
          <option value="">Link a source…</option>
          {unlinked.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
