import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { api, statusLabel, formatDate } from '../api.js';
import { useTopics } from '../App.jsx';
import ResearchNext from './topic/ResearchNext.jsx';
import Timeline from './topic/Timeline.jsx';
import MapView from './topic/MapView.jsx';
import Quiz from './topic/Quiz.jsx';
import Understanding from './topic/Understanding.jsx';

const TABS = [
  ['', 'Overview'],
  ['explain', 'Explain it'],
  ['research', 'Research next'],
  ['timeline', 'Timeline'],
  ['map', 'Map'],
  ['quiz', 'Quiz'],
];

export default function Topic() {
  const { id, tab = '' } = useParams();
  const { reload: reloadTopics } = useTopics();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    return api(`/topics/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    setData(null);
    setError('');
    load();
  }, [load]);

  async function rename() {
    const name = window.prompt('Rename topic', data.topic.name);
    if (!name?.trim() || name === data.topic.name) return;
    try {
      await api(`/topics/${id}`, { method: 'PATCH', body: { name } });
      reloadTopics();
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function saveDescription(description) {
    await api(`/topics/${id}`, { method: 'PATCH', body: { description } });
    setData((d) => ({ ...d, topic: { ...d.topic, description } }));
  }

  if (error) return <div className="page"><p className="error">{error}</p><Link to="/">Back to library</Link></div>;
  if (!data) return <div className="page"><p className="muted">Loading…</p></div>;

  return (
    <div className="page topic-page">
      <div className="page-head">
        <h1>{data.topic.name}</h1>
        <button className="small-btn" onClick={rename}>Rename</button>
      </div>
      <Description value={data.topic.description || ''} onSave={saveDescription} />

      <nav className="topic-tabs" aria-label="Topic sections">
        {TABS.map(([key, label]) => (
          <NavLink key={key} to={`/topics/${id}${key ? `/${key}` : ''}`} end className={({ isActive }) => (isActive ? 'active' : '')}>
            {label}
            {key === 'research' && data.stats.openResearch > 0 && <span className="count"> {data.stats.openResearch}</span>}
          </NavLink>
        ))}
      </nav>

      {tab === '' && <Overview id={id} data={data} />}
      {tab === 'explain' && <Understanding topicId={id} topicName={data.topic.name} hasSources={data.sources.length > 0} />}
      {tab === 'research' && <ResearchNext topicId={id} onChange={load} />}
      {tab === 'timeline' && <Timeline topicId={id} sources={data.sources} onChange={load} />}
      {tab === 'map' && <MapView topicId={id} hasSources={data.sources.length > 0} />}
      {tab === 'quiz' && <Quiz topicId={id} hasSources={data.sources.length > 0} onChange={load} />}
    </div>
  );
}

function Description({ value, onSave }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <textarea
      className="topic-description"
      rows={1}
      value={v}
      placeholder="What do you want to understand about this topic?"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      aria-label="Topic description"
    />
  );
}

function Overview({ id, data }) {
  const navigate = useNavigate();
  const { sources, notes, stats } = data;

  async function newNote() {
    const { note } = await api('/notes', { method: 'POST', body: { title: 'Untitled note', topicId: id } });
    navigate(`/notes/${note.id}`);
  }

  const facts = [
    `${sources.length} source${sources.length === 1 ? '' : 's'}`,
    `${notes.length} note${notes.length === 1 ? '' : 's'}`,
    stats.openResearch ? `${stats.openResearch} thing${stats.openResearch === 1 ? '' : 's'} to research next` : null,
    stats.timelineEvents ? `${stats.timelineEvents} timeline event${stats.timelineEvents === 1 ? '' : 's'}` : null,
    stats.quizQuestions
      ? `${stats.quizQuestions} quiz question${stats.quizQuestions === 1 ? '' : 's'}${stats.quizAccuracy != null ? `, ${stats.quizAccuracy}% answered correctly` : ''}`
      : null,
  ].filter(Boolean);

  return (
    <div className="overview">
      <p className="facts">{facts.join('. ')}.</p>
      <div className="overview-cols">
        <section>
          <div className="side-block-head">
            <h2>Sources</h2>
            <Link to={`/?topic=${id}`} className="small">Add or filter sources</Link>
          </div>
          {!sources.length && <p className="muted small">No sources in this topic yet. Save a source and choose this topic for it.</p>}
          <ul className="plain-list overview-list">
            {sources.map((s) => (
              <li key={s.id}>
                <Link to={`/sources/${s.id}`}>{s.title}</Link>
                <span className="muted small">
                  {statusLabel(s.status)}
                  {s._count.highlights ? `, ${s._count.highlights} highlight${s._count.highlights === 1 ? '' : 's'}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <div className="side-block-head">
            <h2>Notes</h2>
            <button className="small-btn" onClick={newNote}>New note</button>
          </div>
          {!notes.length && <p className="muted small">Notes you file under this topic appear here.</p>}
          <ul className="plain-list overview-list">
            {notes.map((n) => (
              <li key={n.id}>
                <Link to={`/notes/${n.id}`}>{n.title}</Link>
                <span className="muted small">{formatDate(n.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
