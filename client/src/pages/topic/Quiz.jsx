import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import RefLink from '../../components/RefLink.jsx';

export default function Quiz({ topicId, hasSources, onChange }) {
  const [questions, setQuestions] = useState(null);
  const [session, setSession] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const base = `/topics/${topicId}/quiz`;

  const load = () => api(base).then((d) => setQuestions(d.questions)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [topicId]);

  async function generate(count) {
    setGenerating(true);
    setError('');
    try {
      await api(`${base}/generate`, { method: 'POST', body: { count } });
      await load();
      onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function start() {
    const { questions } = await api(`${base}/session?n=5`);
    setSession({ questions, index: 0, correct: 0 });
  }

  async function remove(id) {
    if (!window.confirm('Delete this question?')) return;
    await api(`${base}/${id}`, { method: 'DELETE' });
    setQuestions((list) => list.filter((q) => q.id !== id));
    onChange();
  }

  if (!questions) return <p className="muted">{error || 'Loading…'}</p>;

  if (session) {
    const done = session.index >= session.questions.length;
    if (done) {
      return (
        <div className="tool quiz-done">
          <h2>{session.correct} of {session.questions.length} right</h2>
          <p className="muted">Questions you miss come back sooner next time.</p>
          <div className="row-actions">
            <button className="primary" onClick={start}>Another round</button>
            <button onClick={() => { setSession(null); load(); onChange(); }}>Back to questions</button>
          </div>
        </div>
      );
    }
    return (
      <QuestionCard
        key={session.questions[session.index].id}
        q={session.questions[session.index]}
        position={`${session.index + 1} of ${session.questions.length}`}
        onAnswered={(correct) => api(`${base}/${session.questions[session.index].id}/answer`, { method: 'POST', body: { correct } }).catch(() => {})}
        onNext={(correct) => setSession((s) => ({ ...s, index: s.index + 1, correct: s.correct + (correct ? 1 : 0) }))}
        onQuit={() => { setSession(null); load(); onChange(); }}
      />
    );
  }

  return (
    <div className="tool">
      <p className="lede">Questions written from your sources and highlights to check what you’ve understood. Each answer links to the passage it’s based on.</p>
      <div className="tool-actions">
        {questions.length > 0 && <button className="primary" onClick={start}>Start a quiz</button>}
        <button className="small-btn" onClick={() => generate(5)} disabled={generating || !hasSources}>
          {generating ? 'Writing questions…' : questions.length ? 'Write 5 more questions' : 'Write 5 questions'}
        </button>
        {!hasSources && <span className="hint">Add sources to this topic first.</span>}
      </div>
      {error && <p className="error">{error}</p>}

      {questions.length > 0 && (
        <>
          <h2 className="list-heading">All questions</h2>
          <ul className="plain-list question-list">
            {questions.map((q) => (
              <li key={q.id}>
                <p>{q.question}</p>
                <div className="row-actions small">
                  <span className="muted">{q.kind === 'multiple_choice' ? 'Multiple choice' : 'Recall'}</span>
                  <span className="muted">
                    {q.timesAsked ? `${q.timesCorrect} of ${q.timesAsked} right` : 'Not asked yet'}
                  </span>
                  {q.source && <RefLink sourceId={q.source.id} sourceTitle={q.source.title} location={q.location} startPos={q.startPos} endPos={q.endPos} />}
                  <button className="link danger small" onClick={() => remove(q.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function QuestionCard({ q, position, onAnswered, onNext, onQuit }) {
  const [choice, setChoice] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState(null);

  function choose(i) {
    if (choice != null) return;
    const correct = i === q.answerIndex;
    setChoice(i);
    setResult(correct);
    onAnswered(correct);
  }

  function selfMark(correct) {
    setResult(correct);
    onAnswered(correct);
  }

  const answered = result != null;

  return (
    <div className="tool quiz-card">
      <div className="quiz-top">
        <span className="muted small">Question {position}</span>
        <button className="link small" onClick={onQuit}>End quiz</button>
      </div>
      <h2 className="quiz-question">{q.question}</h2>

      {q.kind === 'multiple_choice' ? (
        <ol className="options" type="A">
          {q.options.map((opt, i) => {
            const state = choice == null ? '' : i === q.answerIndex ? 'correct' : i === choice ? 'wrong' : 'faded';
            return (
              <li key={i}>
                <button className={`option ${state}`} onClick={() => choose(i)} disabled={choice != null}>
                  {opt}
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="recall">
          {!revealed ? (
            <>
              <p className="muted small">Answer in your head or out loud first, then check.</p>
              <button className="primary" onClick={() => setRevealed(true)}>Show answer</button>
            </>
          ) : (
            <>
              <p className="recall-answer">{q.answer}</p>
              {!answered && (
                <div className="row-actions">
                  <button className="primary" onClick={() => selfMark(true)}>I got it</button>
                  <button onClick={() => selfMark(false)}>I missed it</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {answered && (
        <div className={`feedback ${result ? 'good' : 'bad'}`}>
          <p className="feedback-verdict">{result ? 'Correct.' : q.kind === 'multiple_choice' ? 'Not quite.' : 'Worth another look.'}</p>
          {q.explanation && <p>{q.explanation}</p>}
          {q.source && (
            <p className="small">
              See <RefLink newTab sourceId={q.source.id} sourceTitle={q.source.title} location={q.location} startPos={q.startPos} endPos={q.endPos} /> (opens in a new tab)
            </p>
          )}
          <button className="primary" onClick={() => onNext(result)}>Next question</button>
        </div>
      )}
    </div>
  );
}
