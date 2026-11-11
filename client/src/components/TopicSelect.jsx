import { api } from '../api.js';
import { useTopics } from '../App.jsx';

export default function TopicSelect({ value, onChange, allowAll = false, allLabel = 'All topics', id }) {
  const { topics, reload } = useTopics();

  async function handle(e) {
    const v = e.target.value;
    if (v === '__new') {
      const name = window.prompt('Name for the new topic');
      if (!name?.trim()) return;
      const { topic } = await api('/topics', { method: 'POST', body: { name } });
      reload();
      onChange(topic.id);
      return;
    }
    onChange(v || null);
  }

  return (
    <select id={id} value={value || ''} onChange={handle}>
      <option value="">{allowAll ? allLabel : 'No topic'}</option>
      {topics.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
      <option value="__new">New topic…</option>
    </select>
  );
}
