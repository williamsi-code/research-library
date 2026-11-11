import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Review() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/review').then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  function done(id) {
    setData((d) => ({ ...d, highlights: d.highlights.filter((h) => h.id !== id) }));
  }

  return (
    <div className="page narrow">
      <h1>Review</h1>
      <p className="lede">A few older highlights, back for a second look. Revisiting is what makes them stick.</p>
      {error && <p className="error">{error}</p>}
      {data && data.highlights.length === 0 && (
        <div className="empty">
          {data.total === 0 ? (
            <p>Nothing to review yet. Highlights come back here a couple of days after you save them.</p>
          ) : (
            <>
              <p>You’re caught up. Check back tomorrow.</p>
              <button onClick={load}>Look for more</button>
            </>
          )}
        </div>
      )}
      {data?.highlights.map((h) => <ReviewCard key={h.id} h={h} onDone={done} />)}
    </div>
  );
}

function ReviewCard({ h, onDone }) {
  const [reflection, setReflection] = useState('');
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    await api(`/review/${h.id}`, { method: 'POST', body: { reflection } }).catch(() => {});
    onDone(h.id);
  }

  return (
    <article className="review-card">
      <blockquote><mark className="static">{h.quote}</mark></blockquote>
      <p className="result-src">
        <Link to={h.startPos != null ? `/sources/${h.source.id}?at=${h.startPos}&end=${h.endPos}` : `/sources/${h.source.id}`}>{h.source.title}</Link>
        {h.location ? `, ${h.location}` : ''}
      </p>
      {h.note && <p className="review-note">{h.note}</p>}
      <label htmlFor={`refl-${h.id}`} className="small">What do you think about this now?</label>
      <textarea id={`refl-${h.id}`} rows={2} value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="Optional. Saved to this highlight’s note with today’s date." />
      <button className="primary" onClick={finish} disabled={busy}>{reflection.trim() ? 'Save and next' : 'Next'}</button>
    </article>
  );
}
