import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import Library from './pages/Library.jsx';
import Source from './pages/Source.jsx';
import Notes from './pages/Notes.jsx';
import Ask from './pages/Ask.jsx';
import Search from './pages/Search.jsx';
import Review from './pages/Review.jsx';
import Settings from './pages/Settings.jsx';
import Topic from './pages/Topic.jsx';

const TopicsContext = createContext({ topics: [], reload: () => {} });
export const useTopics = () => useContext(TopicsContext);

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [topics, setTopics] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api('/auth/me').then(() => setAuthed(true)).catch(() => setAuthed(false));
    const onOut = () => setAuthed(false);
    window.addEventListener('rl:signed-out', onOut);
    return () => window.removeEventListener('rl:signed-out', onOut);
  }, []);

  const reload = useCallback(() => {
    api('/topics').then((d) => setTopics(d.topics)).catch(() => {});
  }, []);

  useEffect(() => {
    if (authed) reload();
  }, [authed, reload]);

  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  if (authed === null) return <div className="boot" aria-busy="true" />;
  if (!authed) return <Login onSignedIn={() => setAuthed(true)} />;

  const activeTopic = location.pathname.match(/^\/topics\/([^/]+)/)?.[1] || new URLSearchParams(location.search).get('topic');

  return (
    <TopicsContext.Provider value={{ topics, reload }}>
      <div className={`shell ${menuOpen ? 'menu-open' : ''}`}>
        <header className="topbar">
          <button className="menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
            Menu
          </button>
          <Link to="/" className="brand-small">Research library</Link>
        </header>
        <aside className="sidebar">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            Research library
          </Link>
          <nav className="nav">
            <NavLink to="/" end>Library</NavLink>
            <NavLink to="/ask">Ask your sources</NavLink>
            <NavLink to="/search">Search</NavLink>
            <NavLink to="/notes">Notes</NavLink>
            <NavLink to="/review">Review</NavLink>
          </nav>
          <div className="side-section">
            <h2 className="side-heading">Topics</h2>
            <ul className="topic-list">
              {topics.map((t) => (
                <li key={t.id}>
                  <Link to={`/topics/${t.id}`} className={activeTopic === t.id ? 'active' : ''}>
                    <span>{t.name}</span>
                    <span className="count">{t._count.sources}</span>
                  </Link>
                </li>
              ))}
              {!topics.length && <li className="muted small">Add topics in Settings or when saving a source.</li>}
            </ul>
          </div>
          <nav className="nav nav-bottom">
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/sources/:id" element={<Source />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/notes/:id" element={<Notes />} />
            <Route path="/topics/:id" element={<Topic />} />
            <Route path="/topics/:id/:tab" element={<Topic />} />
            <Route path="/ask" element={<Ask />} />
            <Route path="/search" element={<Search />} />
            <Route path="/review" element={<Review />} />
            <Route path="/settings" element={<Settings onSignedOut={() => setAuthed(false)} />} />
            <Route path="*" element={<p className="page">That page doesn’t exist. <Link to="/">Go to your library</Link>.</p>} />
          </Routes>
        </main>
      </div>
    </TopicsContext.Provider>
  );
}
