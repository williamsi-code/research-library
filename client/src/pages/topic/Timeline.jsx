import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import RefLink from '../../components/RefLink.jsx';

const EMPTY = { dateLabel: '', title: '', description: '', sourceId: '' };

function gapLabel(years) {
  if (years >= 2) return `${Math.round(years).toLocaleString()} years later`;
  if (years >= 1) return 'A year later';
  return null;
}

export default function Timeline({ topicId, sources, onChange }) {
  const [events, setEvents] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [extracting, setExtracting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const base = `/topics/${topicId}/timeline`;

  const load = () => api(base).then((d) => setEvents(d.events)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [topicId]);

  function startEdit(ev) {
    setEditingId(ev.id);
    setForm({ dateLabel: ev.dateLabel, title: ev.title, description: ev.description || '', sourceId: ev.sourceId || '' });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setForm(EMPTY);
    setEditingId(null);
    setShowForm(false);
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const body = { ...form };
      if (editingId) {
        const current = events.find((x) => x.id === editingId);
        if (form.sourceId !== (current?.sourceId || '')) Object.assign(body, { startPos: null, endPos: null, location: null });
        await api(`${base}/${editingId}`, { method: 'PATCH', body });
      } else {
        await api(base, { method: 'POST', body });
      }
      resetForm();
      await load();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this event?')) return;
    await api(`${base}/${id}`, { method: 'DELETE' });
    setEvents((list) => list.filter((x) => x.id !== id));
    onChange();
  }

  async function extract() {
    setExtracting(true);
    setError('');
    try {
      const { events: found } = await api(`${base}/extract`, { method: 'POST' });
      setCandidates(found);
      setPicked(new Set(found.map((_, i) => i)));
    } catch (e) {
      setError(e.message);
    } finally {
      setExtracting(false);
    }
  }

  async function addPicked() {
    setAdding(true);
    try {
      for (const [i, c] of candidates.entries()) {
        if (!picked.has(i)) continue;
        const { sourceTitle, sortValue, ...body } = c;
        await api(base, { method: 'POST', body: { ...body, aiExtracted: true } });
      }
      setCandidates(null);
      await load();
      onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  if (!events) return <p className="muted">{error || 'Loading…'}</p>;

  return (
    <div className="tool">
      <p className="lede">Dated events from this topic, in order. Each one can link back to the passage it came from.</p>
      <div className="tool-actions">
        <button className="small-btn" onClick={() => (showForm ? resetForm() : setShowForm(true))}>
          {showForm ? 'Close form' : 'Add an event'}
        </button>
        <button className="small-btn" onClick={extract} disabled={extracting || !sources.length}>
          {extracting ? 'Reading your sources…' : 'Find dates in my sources'}
        </button>
        {!sources.length && <span className="hint">Add sources to this topic to find dates in them.</span>}
      </div>
      {error && <p className="error">{error}</p>}

      {showForm && (
        <form className="panel event-form" onSubmit={save}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="ev-date">Date</label>
              <input id="ev-date" value={form.dateLabel} onChange={(e) => setForm({ ...form, dateLabel: e.target.value })} placeholder="1914, March 1917, 300 BCE, 1990s" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="ev-title">What happened</label>
              <input id="ev-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="ev-desc">Details (optional)</label>
            <textarea id="ev-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ev-src">Source (optional)</label>
            <select id="ev-src" value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })}>
              <option value="">No source</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <div className="row-actions">
            <button className="primary" disabled={!form.dateLabel.trim() || !form.title.trim()}>{editingId ? 'Save event' : 'Add event'}</button>
            <button type="button" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {candidates && (
        <section className="panel candidates">
          <div className="side-block-head">
            <h2>Dates found in your sources</h2>
            <button className="link small" onClick={() => setCandidates(null)}>Close</button>
          </div>
          <p className="ai-label">Found by AI. Untick anything that’s wrong or unimportant, then add the rest.</p>
          {!candidates.length && <p className="muted small">No new dated events were found.</p>}
          <ul className="plain-list">
            {candidates.map((c, i) => (
              <li key={i} className="candidate">
                <label>
                  <input
                    type="checkbox"
                    checked={picked.has(i)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      e.target.checked ? next.add(i) : next.delete(i);
                      setPicked(next);
                    }}
                  />
                  <span>
                    <strong>{c.dateLabel}</strong> {c.title}
                    {c.description && <span className="small muted"> {c.description}</span>}
                  </span>
                </label>
                {c.sourceId && <span className="small"><RefLink {...c} /></span>}
              </li>
            ))}
          </ul>
          {candidates.length > 0 && (
            <button className="primary" onClick={addPicked} disabled={adding || !picked.size}>
              {adding ? 'Adding…' : `Add ${picked.size} to timeline`}
            </button>
          )}
        </section>
      )}

      {!events.length && !candidates && (
        <div className="empty">
          <p>No events yet. Add one yourself, or let the AI find dates mentioned in this topic’s sources.</p>
        </div>
      )}

      {events.length > 0 && (
        <ol className="timeline">
          {events.map((ev, i) => {
            const prev = events[i - 1];
            const gap = prev && prev.sortValue != null && ev.sortValue != null ? ev.sortValue - prev.sortValue : 0;
            const label = gapLabel(gap);
            return (
              <li key={ev.id} className="tl-item">
                {label && <div className="tl-gap" style={{ height: `${Math.min(64, 10 + Math.log2(gap + 1) * 7)}px` }}><span>{label}</span></div>}
                <div className="tl-row">
                  <div className="tl-date">{ev.dateLabel}</div>
                  <div className="tl-dot" aria-hidden="true" />
                  <div className="tl-body">
                    <h3>{ev.title}</h3>
                    {ev.description && <p>{ev.description}</p>}
                    <div className="row-actions small">
                      {ev.source && <RefLink sourceId={ev.source.id} sourceTitle={ev.source.title} location={ev.location} startPos={ev.startPos} endPos={ev.endPos} />}
                      <button className="link small" onClick={() => startEdit(ev)}>Edit</button>
                      <button className="link danger small" onClick={() => remove(ev.id)}>Delete</button>
                      {ev.aiExtracted && <span className="muted">Found by AI</span>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
