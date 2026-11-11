import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../../api.js';
import ForceGraph from '../../components/ForceGraph.jsx';
import RefLink from '../../components/RefLink.jsx';

export default function MapView({ topicId, hasSources }) {
  const [view, setView] = useState('concepts');
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/topics/${topicId}/graph`)
      .then((d) => {
        setData(d);
        if (!d.concepts) setView('connections');
      })
      .catch((e) => setError(e.message));
  }, [topicId]);

  useEffect(() => setSelected(null), [view]);

  async function generate() {
    setGenerating(true);
    setError('');
    try {
      const { concepts, conceptsAt } = await api(`/topics/${topicId}/concepts`, { method: 'POST' });
      setData((d) => ({ ...d, concepts, conceptsAt }));
      setView('concepts');
      setSelected(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  const conceptGraph = useMemo(() => {
    if (!data?.concepts) return null;
    return {
      nodes: data.concepts.concepts.map((c) => ({ id: c.id, label: c.label, type: 'concept' })),
      links: data.concepts.links.map((l) => ({ source: l.source, target: l.target, label: l.label })),
    };
  }, [data?.concepts]);

  if (!data) return <p className="muted">{error || 'Loading…'}</p>;

  return (
    <div className="tool">
      <div className="map-toolbar">
        <div className="segmented" role="tablist" aria-label="Map type">
          <button role="tab" aria-selected={view === 'concepts'} className={view === 'concepts' ? 'active' : ''} onClick={() => setView('concepts')}>
            Concepts
          </button>
          <button role="tab" aria-selected={view === 'connections'} className={view === 'connections' ? 'active' : ''} onClick={() => setView('connections')}>
            Your sources and notes
          </button>
        </div>
        {view === 'concepts' && (
          <button className="small-btn" onClick={generate} disabled={generating || !hasSources}>
            {generating ? 'Mapping your sources…' : data.concepts ? 'Redraw from sources' : 'Draw a concept map'}
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}

      {view === 'concepts' && (
        <>
          <p className="hint">
            {data.concepts
              ? `Key ideas in this topic and how they connect. Drawn by AI from your sources on ${formatDate(data.conceptsAt)}. Select a concept to see where it comes from.`
              : 'The AI reads this topic’s sources and highlights, picks out the key ideas, and draws how they connect, with links to the passages behind each one.'}
          </p>
          {!hasSources && <p className="muted">Add sources to this topic first.</p>}
          {conceptGraph && (
            <div className="map-layout">
              <div className="graph-wrap">
                <ForceGraph nodes={conceptGraph.nodes} links={conceptGraph.links} selectedId={selected} onSelect={setSelected} showLinkLabels />
              </div>
              <ConceptPanel concepts={data.concepts} selected={selected} />
            </div>
          )}
        </>
      )}

      {view === 'connections' && (
        <>
          <p className="hint">How the sources and notes in this topic link together. Notes connect to the sources they draw on, and tags used more than once become hubs.</p>
          {data.connections.nodes.length === 0 ? (
            <p className="muted">Nothing to map yet.</p>
          ) : (
            <div className="map-layout">
              <div className="graph-wrap">
                <ForceGraph nodes={data.connections.nodes} links={data.connections.links} selectedId={selected} onSelect={setSelected} />
                <div className="legend small">
                  <span><i className="lg t-source" /> Source</span>
                  <span><i className="lg t-note" /> Note</span>
                  <span><i className="lg t-tag" /> Tag</span>
                </div>
              </div>
              <ConnectionPanel topicId={topicId} graph={data.connections} selected={selected} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ConceptPanel({ concepts, selected }) {
  const c = concepts.concepts.find((x) => x.id === selected);
  if (!c) return <aside className="map-panel muted small">Select a concept to see its summary and sources.</aside>;
  const byId = new Map(concepts.concepts.map((x) => [x.id, x.label]));
  const related = concepts.links.filter((l) => l.source === c.id || l.target === c.id);
  return (
    <aside className="map-panel">
      <h2>{c.label}</h2>
      <p>{c.summary}</p>
      {c.refs.length > 0 && (
        <>
          <h3 className="small">From</h3>
          <ul className="plain-list small">
            {c.refs.map((r, i) => <li key={i}><RefLink {...r} /></li>)}
          </ul>
        </>
      )}
      {related.length > 0 && (
        <>
          <h3 className="small">Connections</h3>
          <ul className="plain-list small">
            {related.map((l, i) => (
              <li key={i}>
                {byId.get(l.source)} <em>{l.label}</em> {byId.get(l.target)}
                {l.refs[0] && <> (<RefLink {...l.refs[0]}>source</RefLink>)</>}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="ai-label">Written by AI. Check it against the sources.</p>
    </aside>
  );
}

function ConnectionPanel({ topicId, graph, selected }) {
  const node = graph.nodes.find((n) => n.id === selected);
  if (!node) return <aside className="map-panel muted small">Select a circle to see what it is and what it connects to.</aside>;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const neighbours = graph.links
    .filter((l) => l.source === node.id || l.target === node.id)
    .map((l) => byId.get(l.source === node.id ? l.target : l.source))
    .filter(Boolean);
  const href = node.type === 'source' ? `/sources/${node.refId}` : node.type === 'note' ? `/notes/${node.refId}` : `/?topic=${topicId}&tag=${encodeURIComponent(node.refId)}`;
  return (
    <aside className="map-panel">
      <p className="small muted">{node.type === 'source' ? (node.outside ? 'Source in another topic' : 'Source') : node.type === 'note' ? 'Note' : 'Tag'}</p>
      <h2><Link to={href}>{node.label}</Link></h2>
      {neighbours.length > 0 ? (
        <>
          <h3 className="small">Connected to</h3>
          <ul className="plain-list small">
            {neighbours.map((n) => <li key={n.id}>{n.label}</li>)}
          </ul>
        </>
      ) : (
        <p className="small muted">Not connected to anything yet. Link notes to sources, or share tags, to connect items.</p>
      )}
    </aside>
  );
}
