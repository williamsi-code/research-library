import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import TopicSelect from '../components/TopicSelect.jsx';

const passageLink = (c) =>
  `/sources/${c.sourceId}?at=${c.startPos}&end=${c.endPos}`;

export default function Ask() {
  const [params] = useSearchParams();
  const [question, setQuestion] = useState(params.get('q') || '');
  const [topicId, setTopicId] = useState(params.get('topic') || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  async function ask(e) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/ask', { method: 'POST', body: { question, topicId } });
      setHistory((h) => [{ id: Date.now(), question: question.trim(), topicId, ...result }, ...h]);
      setQuestion('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <h1>Ask your sources</h1>
      <p className="lede">Answers come only from what you’ve saved, with a link to every passage used.</p>
      <form className="ask-form" onSubmit={ask}>
        <textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What do my sources say about…"
          aria-label="Your question"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(e);
          }}
        />
        <div className="ask-controls">
          <label className="inline-label">
            Search in
            <TopicSelect value={topicId} onChange={setTopicId} allowAll allLabel="Whole library" />
          </label>
          <button className="primary" disabled={busy || !question.trim()}>{busy ? 'Reading your sources…' : 'Ask'}</button>
        </div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {history.map((item) => <Answer key={item.id} item={item} />)}
    </div>
  );
}

function Answer({ item }) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const cited = new Set([...item.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const usedCitations = item.citations.filter((c) => cited.has(c.n));
  const otherCitations = item.citations.filter((c) => !cited.has(c.n));
  const byN = new Map(item.citations.map((c) => [c.n, c]));

  async function saveAsNote() {
    setSaving(true);
    const refs = usedCitations.map((c) => `[${c.n}] ${c.sourceTitle}${c.location ? `, ${c.location}` : ''}`).join('\n');
    const body = `AI draft from your sources. Check it against the passages before relying on it.\n\n${item.answer}${refs ? `\n\nSources\n${refs}` : ''}`;
    const { note } = await api('/notes', {
      method: 'POST',
      body: {
        title: item.question.slice(0, 200),
        body,
        topicId: item.topicId,
        sourceIds: [...new Set(usedCitations.map((c) => c.sourceId))],
      },
    });
    navigate(`/notes/${note.id}`);
  }

  return (
    <section className="answer">
      <h2 className="answer-q">{item.question}</h2>
      <div className="answer-body">
        {item.answer.split(/\n{2,}/).map((para, i) => (
          <p key={i}>
            {para.split(/(\[\d+\])/g).map((part, j) => {
              const m = part.match(/^\[(\d+)\]$/);
              const c = m && byN.get(Number(m[1]));
              return c ? (
                <Link key={j} to={passageLink(c)} className="cite" title={`${c.sourceTitle}${c.location ? `, ${c.location}` : ''}`}>
                  {c.n}
                </Link>
              ) : (
                <span key={j}>{part}</span>
              );
            })}
          </p>
        ))}
      </div>
      {usedCitations.length > 0 && (
        <>
          <h3 className="cites-head">Passages cited</h3>
          <ol className="cites">
            {usedCitations.map((c) => <Citation key={c.n} c={c} />)}
          </ol>
        </>
      )}
      {otherCitations.length > 0 && (
        <details className="more">
          <summary>{otherCitations.length} more passage{otherCitations.length === 1 ? '' : 's'} were read but not cited</summary>
          <ol className="cites">
            {otherCitations.map((c) => <Citation key={c.n} c={c} />)}
          </ol>
        </details>
      )}
      <button className="small-btn" onClick={saveAsNote} disabled={saving}>{saving ? 'Saving…' : 'Save as note'}</button>
    </section>
  );
}

function Citation({ c }) {
  return (
    <li value={c.n}>
      <Link to={passageLink(c)} className="cite-source">{c.sourceTitle}</Link>
      {c.location && <span className="hl-loc">{c.location}</span>}
      <p className="cite-text">{c.text.length > 400 ? c.text.slice(0, 400) + '…' : c.text}</p>
    </li>
  );
}
