import { Link } from 'react-router-dom';

// Link to a source, jumping to the exact passage when its position is known.
export default function RefLink({ sourceId, sourceTitle, location, startPos, endPos, children, newTab = false }) {
  if (!sourceId) return null;
  const to = startPos != null && endPos != null ? `/sources/${sourceId}?at=${startPos}&end=${endPos}` : `/sources/${sourceId}`;
  return (
    <Link to={to} className="ref-link" target={newTab ? '_blank' : undefined} rel={newTab ? 'noreferrer' : undefined}>
      {children || (
        <>
          {sourceTitle}
          {location ? `, ${location}` : ''}
        </>
      )}
    </Link>
  );
}
