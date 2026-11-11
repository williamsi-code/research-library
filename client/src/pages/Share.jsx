import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import TopicSelect from '../components/TopicSelect.jsx';
import TagsField from '../components/TagsField.jsx';

// Opened by your phone's Share menu (Android) or the iPhone Shortcut.
export default function Share() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sharedText = params.get('text') || '';
  const url = params.get('url') || sharedText.match(/https?:\/\/\S+/)?.[0] || '';
  const extraText = url ? sharedText.replace(url, '').trim() : sharedText.trim();
  const [title, setTitle] = useState(params.get('title') || '');
  const [topicId, setTopicId] = useState(null);
  const [tags, setTags] = useState([]);
  const [whySaved, setWhySaved] = useState(url && extraText && extraText !== title ? extraText.slice(0, 300) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const common = { topicId, tags, whySaved };
      const result = url
        ? await api('/sources/url', { method: 'POST', body: { url, ...common } })
        : await api('/sources/text', { method: 'POST', body: { title, text: extraText, ...common } });
      navigate(`/sources/${result.source.id}${result.duplicate ? '?duplicate=1' : ''}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!url && !extraText) {
    return (
      <div className="page narrow">
        <h1>Nothing to save</h1>
        <p>Nothing was shared to the app. Share a web page or some text from another app to save it here.</p>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <h1>Save to library</h1>
      <form className="panel" onSubmit={save}>
        {url ? (
          <div className="field">
            <span className="field-label">Link</span>
            <p className="shared-url">{url}</p>
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="sh-title">Title</label>
              <input id="sh-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <span className="field-label">Text</span>
              <p className="shared-text">{extraText.length > 400 ? extraText.slice(0, 400) + '…' : extraText}</p>
            </div>
          </>
        )}
        <div className="field-row">
          <div className="field">
            <label htmlFor="sh-topic">Topic</label>
            <TopicSelect id="sh-topic" value={topicId} onChange={setTopicId} />
          </div>
          <div className="field">
            <label htmlFor="sh-tags">Tags</label>
            <TagsField id="sh-tags" value={tags} onChange={setTags} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="sh-why">Why are you saving this?</label>
          <input id="sh-why" value={whySaved} onChange={(e) => setWhySaved(e.target.value)} placeholder="One line for future you" />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save to library'}</button>
      </form>
    </div>
  );
}
