import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
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
    if (!window.confirm(`Delete the topic “${t.name}”? Its sources and notes stay in your library without a topic.`)) return;
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
