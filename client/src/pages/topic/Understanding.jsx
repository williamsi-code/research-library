import { useEffect, useRef, useState } from 'react';
import { api, formatDate } from '../../api.js';
import RefLink from '../../components/RefLink.jsx';

const VERDICTS = {
  supported: { label: 'Supported', cls: 'v-supported' },
  partly: { label: 'Partly right', cls: 'v-partly' },
  contradicted: { label: 'Sources disagree', cls: 'v-contradicted' },
  not_in_sources: { label: 'Not in your sources', cls: 'v-none' },
};

export default function Understanding({ topicId, topicName, hasSources }) {
  const [draft, setDraft] = useState(null);
  const [checks, setChecks] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const loaded = useRef(false);
  const base = `/topics/${topicId}/understanding`;

  useEffect(() => {
    loaded.current = false;
    api(base)
      .then((d) => {
        setDraft(d.draft);
        setChecks(d.checks);
        setViewing(d.checks[0]?.id || null);
        loaded.current = true;
      })
      .catch((e) => setError(e.message));
  }, [topicId]);

  // Save the draft a moment after typing stops.
  useEffect(() => {
    if (!loaded.current || saveState !== 'dirty') return;
    const t = setTimeout(async () => {
      setSaveState('saving');
      await api(`${base}/draft`, { method: 'PUT', body: { body: draft } }).catch(() => {});
      setSaveState('saved');
    }, 1000);
    return () => clearTimeout(t);
  }, [draft, saveState]);

  async function check() {
    setChecking(true);
    setError('');
    try {
      const { check } = await api(`${base}/check`, { method: 'POST', body: { body: draft } });
      setChecks((list) => [check, ...list]);
      setViewing(check.id);
      setSaveState('saved');
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }

  async function removeCheck(id) {
    await api(`${base}/checks/${id}`, { method: 'DELETE' });
    setChecks((list) => list.filter((c) => c.id !== id));
    if (viewing === id) setViewing(null);
  }

  if (draft === null) return <p className="muted">{error || 'Loading…'}</p>;
  const current = checks.find((c) => c.id === viewing);
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  return (
    <div className="tool understanding">
      <p className="lede">
        Explain {topicName} as if teaching a friend, from memory and without looking at your sources. Then check it against what you’ve collected
        to find what you’ve got right, what’s off, and what you’ve missed.
      </p>
      <textarea
        className="explain-box"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaveState('dirty');
        }}
        placeholder="In my own words…"
        aria-label="Your explanation"
      />
      <div className="tool-actions">
        <button className="primary" onClick={check} disabled={checking || words < 8 || !hasSources}>
          {checking ? 'Checking against your sources…' : 'Check against my sources'}
        </button>
        <span className="hint">
          {words} word{words === 1 ? '' : 's'}. {saveState === 'saved' ? 'Draft saved.' : saveState === 'saving' ? 'Saving…' : ''}
          {!hasSources && ' Add sources to this topic to check your explanation.'}
        </span>
      </div>
      {error && <p className="error">{error}</p>}

      {checks.length > 1 && (
        <div className="check-history">
          <label htmlFor="check-pick" className="small">Earlier checks</label>
          <select id="check-pick" value={viewing || ''} onChange={(e) => setViewing(e.target.value)}>
            {checks.map((c) => {
              const counts = countVerdicts(c.result.claims);
              return (
                <option key={c.id} value={c.id}>
                  {formatDate(c.createdAt)}: {counts.supported} supported, {counts.partly + counts.contradicted} to fix
                </option>
              );
            })}
          </select>
        </div>
      )}

      {current && <CheckResult check={current} isLatest={current.id === checks[0]?.id} onUseText={() => { setDraft(current.body); setSaveState('dirty'); }} onDelete={() => removeCheck(current.id)} />}
    </div>
  );
}

function countVerdicts(claims) {
  const counts = { supported: 0, partly: 0, contradicted: 0, not_in_sources: 0 };
  for (const c of claims) counts[c.verdict] = (counts[c.verdict] || 0) + 1;
  return counts;
}

function CheckResult({ check, isLatest, onUseText, onDelete }) {
  const { summary, claims, gaps } = check.result;
  const counts = countVerdicts(claims);
  return (
    <section className="check">
      <div className="side-block-head">
        <h2>Check from {formatDate(check.createdAt)}</h2>
        <span className="row-actions small">
          {!isLatest && <button className="link small" onClick={onUseText}>Load this version’s text</button>}
          <button className="link danger small" onClick={onDelete}>Delete check</button>
        </span>
      </div>
      <p className="ai-label">Checked by AI against your sources. It can be wrong, so follow the links when something surprises you.</p>
      {summary && <p className="check-summary">{summary}</p>}
      <p className="small muted">
        {counts.supported} supported, {counts.partly} partly right, {counts.contradicted} where your sources disagree, {counts.not_in_sources} not covered by your sources.
      </p>

      <ol className="claims">
        {claims.map((c, i) => {
          const v = VERDICTS[c.verdict] || VERDICTS.not_in_sources;
          return (
            <li key={i} className={`claim ${v.cls}`}>
              <span className="verdict">{v.label}</span>
              <p className="claim-text">“{c.text}”</p>
              {c.comment && <p className="claim-comment">{c.comment}</p>}
              {c.refs.length > 0 && (
                <p className="small refs">
                  {c.refs.map((r, j) => <span key={j}>{j > 0 && '; '}<RefLink {...r} /></span>)}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {gaps.length > 0 && (
        <>
          <h3 className="gaps-head">What your sources cover that you didn’t mention</h3>
          <ul className="gaps">
            {gaps.map((g, i) => (
              <li key={i}>
                {g.point}
                {g.refs.length > 0 && (
                  <span className="small refs"> ({g.refs.map((r, j) => <span key={j}>{j > 0 && '; '}<RefLink {...r} /></span>)})</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
