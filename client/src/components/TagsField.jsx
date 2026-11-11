import { useEffect, useState } from 'react';
import { parseTags } from '../api.js';

// Comma-separated tags; commits on blur or Enter.
export default function TagsField({ value = [], onChange, id, placeholder = 'e.g. memory, learning' }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value.join(',')]);

  const commit = () => {
    const tags = parseTags(text);
    if (tags.join(',') !== value.join(',')) onChange(tags);
  };

  return (
    <input
      id={id}
      type="text"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}
