// Splits a source's text into passages of roughly 1,200 characters, keeping exact
// character offsets so every passage (and every AI citation) can be traced back
// to the precise spot in the original.

const TARGET = 1200;
const MAX = 2000;

export function paragraphSpans(text) {
  const spans = [];
  const re = /\n{2,}/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) spans.push([last, m.index]);
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push([last, text.length]);
  return spans;
}

function splitLong(text, a, b) {
  const pieces = [];
  let s = a;
  while (b - s > MAX) {
    let cut = text.lastIndexOf('. ', s + MAX);
    cut = cut > s + MAX * 0.5 ? cut + 1 : s + MAX;
    pieces.push([s, cut]);
    s = cut;
    while (text[s] === ' ') s++;
  }
  if (b > s) pieces.push([s, b]);
  return pieces;
}

export function makeLocator(text, segments = []) {
  const paras = paragraphSpans(text);
  const pages = segments.filter((s) => s.kind === 'page' || s.kind === 'time').sort((x, y) => x.start - y.start);
  const headings = segments.filter((s) => s.kind === 'heading').sort((x, y) => x.start - y.start);

  const lastBefore = (list, pos) => {
    let found = null;
    for (const s of list) {
      if (s.start <= pos) found = s;
      else break;
    }
    return found;
  };

  return function locate(pos) {
    const page = lastBefore(pages, pos);
    if (page) return page.label;
    let para = 1;
    for (let i = 0; i < paras.length; i++) {
      if (paras[i][0] <= pos) para = i + 1;
      else break;
    }
    const heading = lastBefore(headings, pos);
    return heading ? `${heading.label}, ¶ ${para}` : `¶ ${para}`;
  };
}

export function chunkText(text, segments = []) {
  const pieces = paragraphSpans(text).flatMap(([a, b]) => splitLong(text, a, b));
  const groups = [];
  let cur = null;
  for (const [a, b] of pieces) {
    if (!cur) cur = [a, b];
    else if (b - cur[0] <= TARGET) cur[1] = b;
    else {
      groups.push(cur);
      cur = [a, b];
    }
  }
  if (cur) groups.push(cur);

  const locate = makeLocator(text, segments);
  return groups.map(([startPos, endPos], idx) => ({
    idx,
    startPos,
    endPos,
    text: text.slice(startPos, endPos),
    location: locate(startPos),
  }));
}
