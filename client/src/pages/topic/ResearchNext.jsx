import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import RefLink from '../../components/RefLink.jsx';

export default function ResearchNext({ topicId, onChange }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState('');
  const base = `/topics/${topicId}/research`;

  const load = () => api(base).then((d) => setItems(d.items)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [topicId]);

  async function add(itemText, aiSuggested = false) {
    if (!itemText.trim()) return;
    const { item } = await api(base, { method: 'POST', body: { text: itemText, aiSuggested } });
    setItems((list) => [...list.filter((i) => !i.done), item, ...list.filter((i) => i.done)]);
    onChange();
  }

  async function update(id, data) {
    const { item } = await api(`${base}/${id}`, { method: 'PATCH', body: data });
    setItems((list) => {
      const next = list.map((i) => (i.id === id ? item : i));
      return [...next.filter((i) => !i.done), ...next.filter((i) => i.done)];
    });
    if ('done' in data) onChange();
  }

  async function remove(id) {
    await api(`${base}/${id}`, { method: 'DELETE' });
    setItems((list) => list.filter((i) => i.id !== id));
    onChange();
  }

  async function suggest() {
    setSuggesting(true);
    setError('');
    try {
      const { suggestions } = await api(`${base}/suggest`, { method: 'POST' });
      setSuggestions(suggestions);
    } catch (e) {
      setError(e.message);
    } finally {
      setSuggesting(false);
    }
  }

  if (!items) return <p className="muted">{error || 'Loading…'}</p>;
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <div className="tool">
      <p className="lede">Questions to answer and things to look into next. Tick them off as you go.</p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          add(text);
          setText('');
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="A question or something to look into" aria-label="New research item" />
        <button className="primary" disabled={!text.trim()}>Add</button>
      </form>

      <div className="tool-actions">
        <button className="small-btn" onClick={suggest} disabled={suggesting}>
          {suggesting ? 'Reading your sources…' : 'Suggest what to research next'}
        </button>
        <span className="hint">Looks for gaps, open questions and disagreements in this topic’s sources and notes.</span>
      </div>
      {error && <p className="error">{error}</p>}

      {suggestions && (
        <section className="suggestions">
          <div className="side-block-head">
            <h2>Suggestions</h2>
            <button className="link small" onClick={() => setSuggestions(null)}>Close</button>
          </div>
          <p className="ai-label">Written by AI from your sources. Add the ones that are useful.</p>
          {!suggestions.length && <p className="muted small">No new suggestions this time.</p>}
          <ul className="plain-list">
            {suggestions.map((s, i) => (
              <li key={i} className="suggestion">
                <div>
                  <p className="suggestion-text">{s.text}</p>
                  {s.why && <p className="small muted">{s.why}</p>}
                  {s.refs.length > 0 && (
                    <p className="small refs">
                      Based on {s.refs.map((r, j) => <span key={j}>{j > 0 && '; '}<RefLink {...r} /></span>)}
                    </p>
                  )}
                </div>
                <button
                  className="small-btn"
                  onClick={() => {
                    add(s.text, true);
                    setSuggestions((list) => list.filter((_, k) => k !== i));
                  }}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!open.length && !done.length && <p className="muted">Nothing on the list yet.</p>}
      <ul className="research-list">
        {open.map((item) => (
          <ResearchRow key={item.id} item={item} topicId={topicId} onUpdate={update} onRemove={remove} />
        ))}
      </ul>
      {done.length > 0 && (
        <details className="more">
          <summary>{done.length} done</summary>
          <ul className="research-list">
            {done.map((item) => (
              <ResearchRow key={item.id} item={item} topicId={topicId} onUpdate={update} onRemove={remove} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ResearchRow({ item, topicId, onUpdate, onRemove }) {
  const [text, setText] = useState(item.text);
  const [note, setNote] = useState(item.note || '');
  const [showNote, setShowNote] = useState(Boolean(item.note));
  useEffect(() => {
    setText(item.text);
    setNote(item.note || '');
  }, [item.text, item.note]);

  return (
    <li className={`research-item ${item.done ? 'done' : ''}`}>
      <input type="checkbox" checked={item.done} onChange={(e) => onUpdate(item.id, { done: e.target.checked })} aria-label={`Mark “${item.text}” as done`} />
      <div className="research-body">
        <input
          className="research-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() && text !== item.text && onUpdate(item.id, { text })}
          aria-label="Research item"
        />
        {showNote && (
          <textarea
            rows={2}
            value={note}
            placeholder="What you found, or where to look"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (item.note || '') && onUpdate(item.id, { note })}
            aria-label="Notes on this item"
          />
        )}
        <div className="row-actions small">
          <Link to={`/ask?q=${encodeURIComponent(item.text)}&topic=${topicId}`}>Ask your sources</Link>
          {!showNote && <button className="link small" onClick={() => setShowNote(true)}>Add notes</button>}
          <button className="link danger small" onClick={() => onRemove(item.id)}>Delete</button>
          {item.aiSuggested && <span className="muted">Suggested by AI</span>}
        </div>
      </div>
    </li>
  );
}
