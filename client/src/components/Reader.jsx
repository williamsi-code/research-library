import { forwardRef, memo, useMemo } from 'react';

// Renders a source's stored text exactly, character for character, so selection
// offsets map straight back to the database. Headings, page markers, highlights
// and the "jumped to" passage are layered on as spans without adding any text.

function buildPieces(text, segments, highlights, focus) {
  const points = new Set([0, text.length]);
  const marks = [];
  let lastEnd = -1;
  for (const h of highlights) {
    if (h.startPos == null || h.endPos == null || h.startPos < lastEnd || h.endPos > text.length) continue;
    marks.push(h);
    lastEnd = h.endPos;
    points.add(h.startPos);
    points.add(h.endPos);
  }
  const headings = segments.filter((s) => s.kind === 'heading' && s.end > s.start);
  headings.forEach((s) => {
    points.add(s.start);
    points.add(s.end);
  });
  const pageAt = new Map(segments.filter((s) => s.kind === 'page').map((s) => [s.start, s.label]));
  pageAt.forEach((_, pos) => points.add(pos));
  if (focus) {
    points.add(focus.start);
    points.add(focus.end);
  }

  const sorted = [...points].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const pieces = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    pieces.push({
      a,
      b,
      page: pageAt.get(a),
      mark: marks.find((m) => m.startPos <= a && m.endPos >= b),
      heading: headings.some((s) => s.start <= a && s.end >= b),
      focus: focus && focus.start <= a && focus.end >= b,
      focusStart: focus && focus.start === a,
    });
  }
  return pieces;
}

const Reader = forwardRef(function Reader({ text, segments, highlights, focus, activeId, onMarkClick, focusRef }, ref) {
  const pieces = useMemo(() => buildPieces(text, segments || [], highlights || [], focus), [text, segments, highlights, focus]);

  return (
    <div className="reader-text" ref={ref}>
      {pieces.map((p) => {
        const content = text.slice(p.a, p.b);
        const cls = [p.heading && 'r-heading', p.focus && 'r-focus'].filter(Boolean).join(' ') || undefined;
        let node = content;
        if (p.mark) {
          node = (
            <mark
              data-hid={p.mark.id}
              className={p.mark.id === activeId ? 'active' : undefined}
              onClick={() => onMarkClick?.(p.mark.id)}
            >
              {content}
            </mark>
          );
        }
        return (
          <span key={p.a} className={cls} ref={p.focusStart ? focusRef : undefined}>
            {p.page && <span className="page-mark" data-label={p.page} aria-label={p.page} />}
            {node}
          </span>
        );
      })}
    </div>
  );
});

export default memo(Reader);

// Character offset of a DOM position inside the reader container.
export function offsetWithin(container, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, offset);
  return range.toString().length;
}
