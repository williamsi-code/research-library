import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, formatDate } from '../api.js';

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!q) {
      setResults(null);
      return;
    }
    setError('');
    api(`/search?q=${encodeURIComponent(q)}`).then(setResults).catch((e) => setError(e.message));
  }, [q]);

  const total = results ? results.passages.length + results.highlights.length + results.notes.length : 0;

  return (
    <div className="page narrow">
      <h1>Search</h1>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(input.trim() ? { q: input.trim() } : {});
        }}
      >
        <input type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Words, “an exact phrase”, or an idea" aria-label="Search" autoFocus />
        <button className="primary">Search</button>
      </form>
      <p className="hint">Searches the full text of every source, plus your highlights and notes. Put a phrase in quotes to match it exactly.</p>
      {error && <p className="error">{error}</p>}
      {results && total === 0 && <p className="muted">Nothing found for “{q}”.</p>}

      {results?.highlights.length > 0 && (
        <section className="results">
          <h2>Your highlights</h2>
          <ul className="plain-list">
            {results.highlights.map((h) => (
              <li key={h.id} className="result">
                <Link to={h.startPos != null ? `/sources/${h.source.id}?at=${h.startPos}&end=${h.endPos}` : `/sources/${h.source.id}`}>
                  <mark className="static">{h.quote.slice(0, 300)}</mark>
                </Link>
                <span className="result-src">{h.source.title}{h.location ? `, ${h.location}` : ''}</span>
                {h.note && <p className="small">{h.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {results?.notes.length > 0 && (
        <section className="results">
          <h2>Your notes</h2>
          <ul className="plain-list">
            {results.notes.map((n) => (
              <li key={n.id} className="result">
                <Link to={`/notes/${n.id}`} className="result-title">{n.title}</Link>
                <p className="small muted">{n.body}</p>
                <span className="result-src">{formatDate(n.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results?.passages.length > 0 && (
        <section className="results">
          <h2>In your sources</h2>
          <ul className="plain-list">
            {results.passages.map((p) => (
              <li key={p.id} className="result">
                <Link to={`/sources/${p.source.id}?at=${p.startPos}&end=${p.endPos}`} className="result-title">{p.source.title}</Link>
                {p.location && <span className="hl-loc">{p.location}</span>}
                <p className="small">{p.text.length > 360 ? p.text.slice(0, 360) + '…' : p.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
