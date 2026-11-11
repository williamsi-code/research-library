import { useEffect, useRef, useState } from 'react';
import { api, formatDate } from '../api.js';
import { useTopics } from '../App.jsx';

function bookmarkletCode(origin, token) {
  const js = `(()=>{const f=document.createElement('form');f.method='POST';f.action=${JSON.stringify(origin + '/api/clip')};f.target='_blank';f.acceptCharset='UTF-8';f.style.display='none';const a=(n,v)=>{const t=document.createElement('textarea');t.name=n;t.value=v;f.appendChild(t)};a('token',${JSON.stringify(token)});a('url',location.href);a('title',document.title);a('selection',String(window.getSelection()||''));a('html',document.documentElement.outerHTML);document.body.appendChild(f);f.submit();f.remove()})()`;
  return 'javascript:' + encodeURIComponent(js);
}

export default function Settings({ onSignedOut }) {
  const [settings, setSettings] = useState(null);
  const { topics, reload } = useTopics();
  const [newTopic, setNewTopic] = useState('');
  const [copied, setCopied] = useState(false);
  const linkRef = useRef(null);

  useEffect(() => {
    api('/settings').then(setSettings).catch(() => {});
  }, []);

  const code = settings?.clipToken ? bookmarkletCode(window.location.origin, settings.clipToken) : null;

  // React warns about javascript: URLs in JSX, so set it directly.
  useEffect(() => {
    if (code && linkRef.current) linkRef.current.setAttribute('href', code);
  }, [code]);

  async function addTopic(e) {
    e.preventDefault();
    if (!newTopic.trim()) return;
    await api('/topics', { method: 'POST', body: { name: newTopic } });
    setNewTopic('');
    reload();
  }

  async function renameTopic(t) {
    const name = window.prompt('Rename topic', t.name);
    if (!name?.trim() || name === t.name) return;
    await api(`/topics/${t.id}`, { method: 'PATCH', body: { name } }).catch((e) => alert(e.message));
    reload();
  }

  async function deleteTopic(t) {
    if (!window.confirm(`Delete the topic “${t.name}”? Its sources and notes stay in your library without a topic. Its research list, timeline, map and quiz questions are deleted.`)) return;
    await api(`/topics/${t.id}`, { method: 'DELETE' });
    reload();
  }

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    onSignedOut();
  }

  return (
    <div className="page narrow">
      <h1>Settings</h1>

      <section className="settings-block">
        <h2>Save pages from your browser</h2>
        {code ? (
          <>
            <p>Drag this button to your bookmarks bar. On any page, click it to save the page to your library. Any text you’ve selected is saved as a highlight.</p>
            <p>
              <a ref={linkRef} className="bookmarklet" onClick={(e) => e.preventDefault()}>Save to library</a>
            </p>
            <p className="hint">
              On a phone or tablet, copy the code below, create any bookmark, then edit it and paste the code in place of its address.
              A few sites block this kind of saving. For those, copy the link and use Add source.
            </p>
            <button
              className="small-btn"
              onClick={() => navigator.clipboard.writeText(code).then(() => setCopied(true))}
            >
              {copied ? 'Copied' : 'Copy bookmarklet code'}
            </button>
          </>
        ) : (
          <p>Add a <code>CLIP_TOKEN</code> variable in Railway (any long random text), redeploy, then come back here for your bookmarklet.</p>
        )}
      </section>

      <section className="settings-block">
        <h2>Topics</h2>
        <ul className="plain-list topic-admin">
          {topics.map((t) => (
            <li key={t.id}>
              <span>{t.name} <span className="muted small">{t._count.sources} sources, {t._count.notes} notes</span></span>
              <span className="row-actions">
                <button className="link small" onClick={() => renameTopic(t)}>Rename</button>
                <button className="link danger small" onClick={() => deleteTopic(t)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={addTopic}>
          <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="New topic name" aria-label="New topic name" />
          <button className="primary" disabled={!newTopic.trim()}>Add topic</button>
        </form>
      </section>

      <section className="settings-block">
        <h2>AI</h2>
        {settings ? (
          <ul className="plain-list">
            <li>
              Questions and summaries: {settings.ai ? <strong>on</strong> : <span>off. Add <code>ANTHROPIC_API_KEY</code> in Railway.</span>}
              {settings.ai && <span className="muted small"> ({settings.model})</span>}
            </li>
            <li>
              Search by meaning: {settings.embeddings ? <strong>on</strong> : <span>off, so search matches exact words only. Add <code>OPENAI_API_KEY</code> in Railway.</span>}
            </li>
          </ul>
        ) : (
          <p className="muted">Loading…</p>
        )}
        <p className="hint">Asking a question sends only the passages most relevant to it. Summarize sends that one source.</p>
      </section>

      <PhoneSection />

      <BackupSection />

      <section className="settings-block">
        <h2>Export</h2>
        <p>Download everything: sources, highlights, notes and topics.</p>
        <p className="row-actions">
          <a className="button-like" href="/api/export/markdown" download>Download as Markdown</a>
          <a className="button-like" href="/api/export/json" download>Download as JSON</a>
        </p>
      </section>

      <section className="settings-block">
        <button onClick={signOut}>Sign out</button>
      </section>
    </div>
  );
}

function PhoneSection() {
  const shareBase = `${window.location.origin}/share?url=`;
  const [copied, setCopied] = useState(false);
  return (
    <section className="settings-block">
      <h2>Save from your phone</h2>
      <h3 className="small">Android</h3>
      <ol className="steps">
        <li>Open this site in Chrome on your phone and sign in.</li>
        <li>Tap the ⋮ menu, then <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li>
        <li>From now on, tap <strong>Share</strong> in any app and choose <strong>Research</strong>.</li>
      </ol>
      <h3 className="small">iPhone</h3>
      <p>iPhones don’t let web apps appear in the Share menu, so use a Shortcut. You only set this up once.</p>
      <ol className="steps">
        <li>Open the <strong>Shortcuts</strong> app and tap <strong>+</strong> to make a new shortcut. Name it “Save to library”.</li>
        <li>Tap the <strong>ⓘ</strong> (or the name at the top) and turn on <strong>Show in Share Sheet</strong>. Set it to receive <strong>URLs</strong> and <strong>Safari web pages</strong>.</li>
        <li>Add the action <strong>URL Encode</strong>. It encodes the Shortcut Input.</li>
        <li>Add the action <strong>Text</strong>, paste the address below, then insert the <strong>URL Encoded Text</strong> variable right after it.</li>
        <li>Add the action <strong>Open URLs</strong>, using the Text from the step before.</li>
      </ol>
      <p className="code-line"><code>{shareBase}</code></p>
      <button className="small-btn" onClick={() => navigator.clipboard.writeText(shareBase).then(() => setCopied(true))}>
        {copied ? 'Copied' : 'Copy address'}
      </button>
      <p className="hint">Then in Safari, or any app, tap Share and choose “Save to library”. Sign in once in Safari so the app knows it’s you. To get an app icon too, open this site in Safari, tap Share, then Add to Home Screen.</p>
    </section>
  );
}

function BackupSection() {
  const [data, setData] = useState(null);
  const [running, setRunning] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => api('/backup').then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function runNow() {
    setRunning(true);
    setError('');
    try {
      await api('/backup/run', { method: 'POST' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  async function restore(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('Restore from this backup? Anything in it that’s missing here is added. Nothing you have now is changed or removed.')) return;
    setRestoring(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api('/backup/restore', { method: 'POST', form });
      setMessage(`Restored from the backup of ${formatDate(result.backupDate)}. ${result.sourcesAdded} source${result.sourcesAdded === 1 ? ' was' : 's were'} added and ${result.sourcesAdded === 1 ? 'is' : 'are'} being re-indexed for search.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoring(false);
    }
  }

  const last = data?.last;
  const size = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <section className="settings-block">
      <h2>Backups</h2>
      <p>
        A full backup is made automatically once a week: every source’s text, your highlights, notes, topics, timelines, quizzes and explanations.
        The last 8 are kept on the server, and you can download one at any time.
      </p>
      {data && (
        <p className={last ? '' : 'notice warn'}>
          {last
            ? `Last backup: ${formatDate(last.at)} (${last.counts.sources} sources, ${last.counts.highlights} highlights, ${last.counts.notes} notes).`
            : 'No backup has been made yet. The first one runs a couple of minutes after the app starts, or make one now.'}
          {last?.emailed && ` Emailed to ${data.email}.`}
          {last?.emailError && ` The email didn’t send: ${last.emailError}`}
        </p>
      )}
      {data && !data.email && (
        <p className="hint">
          Backups stored on the server don’t protect you if the server itself is lost. To get each weekly backup by email, sign up at resend.com (free), then add
          <code>RESEND_API_KEY</code> and <code>BACKUP_EMAIL</code> (the address you signed up with) in Railway variables. Or download a backup here every so often.
        </p>
      )}
      <p className="row-actions">
        <a className="button-like" href="/api/backup/download" download>Download a backup now</a>
        <button onClick={runNow} disabled={running}>{running ? 'Backing up…' : 'Back up now'}</button>
        <label className="button-like file-button">
          {restoring ? 'Restoring…' : 'Restore from a backup'}
          <input type="file" accept=".gz,.json,application/gzip,application/json" onChange={restore} disabled={restoring} hidden />
        </label>
      </p>
      {message && <p className="notice">{message}</p>}
      {error && <p className="error">{error}</p>}
      {data?.files?.length > 0 && (
        <details className="more">
          <summary>Backups stored on the server ({data.files.length})</summary>
          <ul className="plain-list small">
            {data.files.map((f) => (
              <li key={f.name}>
                <a href={`/api/backup/files/${encodeURIComponent(f.name)}`} download>{formatDate(f.createdAt)}</a>
                <span className="muted"> {size(f.size)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="hint">Original uploaded files (PDFs, photos, audio) aren’t included, but the text read from them is.</p>
    </section>
  );
}
