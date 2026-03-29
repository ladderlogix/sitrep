import React, { useState, useEffect, useCallback } from 'react';

// ─── API Config ───
const API_BASE = window.SITREP_API || '';

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  return res.json();
}

// ─── App ───
export default function App() {
  const [page, setPage] = useState('dashboard');
  const [selectedId, setSelectedId] = useState(null);

  const navigate = (p, id = null) => {
    setPage(p);
    setSelectedId(id);
  };

  const navItems = [
    { id: 'dashboard', icon: '\u2302', label: 'Dashboard' },
    { id: 'findings', icon: '\uD83D\uDD0D', label: 'Findings' },
    { id: 'notes', icon: '\uD83D\uDCDD', label: 'Agent Notes' },
    { id: 'search', icon: '\u2315', label: 'Search' },
    { id: 'prompt', icon: '\uD83E\uDD16', label: 'Agent Prompt' },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="fire">{'\uD83D\uDD25'}</span>
          <div>
            <h1>SitRep</h1>
            <span>Incident Response Hub</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <div
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        {page === 'dashboard' && <Dashboard navigate={navigate} />}
        {page === 'findings' && !selectedId && <FindingsPage navigate={navigate} />}
        {page === 'findings' && selectedId && <FindingDetail id={selectedId} navigate={navigate} />}
        {page === 'notes' && !selectedId && <NotesPage navigate={navigate} />}
        {page === 'notes' && selectedId && <NoteDetail id={selectedId} navigate={navigate} />}
        {page === 'search' && <SearchPage navigate={navigate} />}
        {page === 'prompt' && <AgentPromptPage />}
      </main>
    </div>
  );
}

// ─── Dashboard ───
function Dashboard({ navigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/stats').then(setStats).catch(() => setStats(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const s = stats || {};

  return (
    <div>
      <div className="page-header">
        <h2>Mission Control</h2>
      </div>

      <div className="stats-grid">
        <StatCard icon={'\uD83D\uDD0D'} value={s.total_findings || 0} label="Total Findings" color="orange" />
        <StatCard icon={'\uD83C\uDFF4'} value={s.flags_found || 0} label="Flags Captured" color="green" />
        <StatCard icon={'\uD83C\uDFAF'} value={s.total_challenges || 0} label="Challenges" color="blue" />
        <StatCard icon={'\uD83E\uDD16'} value={s.active_agents || 0} label="Active Agents" color="purple" />
        <StatCard icon={'\uD83D\uDCDD'} value={s.total_notes || 0} label="Agent Notes" color="cyan" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Findings by Category</h3>
          {s.categories && Object.keys(s.categories).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(s.categories).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ textTransform: 'capitalize', fontSize: '14px' }}>{cat}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: `${Math.min(count * 30, 200)}px`, height: '8px',
                      background: 'linear-gradient(90deg, #f97316, #ef4444)',
                      borderRadius: '4px',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent)' }}>{count}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyMini text="No findings yet" />}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Status Breakdown</h3>
          {s.statuses && Object.keys(s.statuses).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(s.statuses).map(([status, count]) => (
                <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge badge-${status}`}>{status}</span>
                  <span style={{ fontSize: '20px', fontWeight: 700 }}>{count}</span>
                </div>
              ))}
            </div>
          ) : <EmptyMini text="No data yet" />}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Active Challenges</h3>
          {s.challenges && s.challenges.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {s.challenges.filter(Boolean).map((ch) => (
                <div key={ch}
                  onClick={() => navigate('findings')}
                  style={{ padding: '8px 12px', background: 'var(--bg-input)', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
                >
                  {ch}
                </div>
              ))}
            </div>
          ) : <EmptyMini text="No challenges tracked" />}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Agent Activity</h3>
          {s.agents && s.agents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {s.agents.filter(Boolean).map((ag) => (
                <div key={ag} style={{
                  padding: '8px 12px', background: 'var(--bg-input)',
                  borderRadius: '6px', fontSize: '14px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span style={{ color: 'var(--success)' }}>{'\u25CF'}</span> {ag}
                </div>
              ))}
            </div>
          ) : <EmptyMini text="No agents active" />}
        </div>
      </div>
    </div>
  );
}

// ─── Findings Page ───
function FindingsPage({ navigate }) {
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filters, setFilters] = useState({ category: '', status: '', finding_type: '' });

  const load = useCallback(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    api(`/api/findings?${params}`).then((d) => setFindings(d.findings || [])).finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-header">
        <h2>Findings</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Finding</button>
      </div>

      <div className="filters">
        <select className="filter-select" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
          <option value="">All Categories</option>
          {['forensics', 'web', 'crypto', 'reversing', 'pwn', 'misc', 'network', 'osint', 'steganography'].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select className="filter-select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Statuses</option>
          {['confirmed', 'investigating', 'dead_end'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="filter-select" value={filters.finding_type} onChange={(e) => setFilters({ ...filters, finding_type: e.target.value })}>
          <option value="">All Types</option>
          {['flag', 'clue', 'artifact', 'timeline_event', 'ioc', 'vulnerability'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {loading ? <Loading /> : findings.length === 0 ? (
        <div className="empty-state">
          <div className="icon">{'\uD83D\uDD0D'}</div>
          <h3>No findings yet</h3>
          <p>Add your first finding or have an agent submit one via the API</p>
        </div>
      ) : (
        <div className="findings-list">
          {findings.map((f) => (
            <div key={f.id} className="finding-card" onClick={() => navigate('findings', f.id)}>
              <div className="finding-header">
                <span className="finding-title">{f.title}</span>
                <span className={`badge badge-${f.status}`}>{f.status}</span>
              </div>
              <div className="finding-content">{f.content}</div>
              <div className="finding-meta">
                <span className={`badge badge-${f.finding_type}`}>{f.finding_type}</span>
                <span className="badge badge-category">{f.category}</span>
                <span className="badge badge-category">{'\uD83E\uDD16'} {f.agent_id}</span>
                <span className="badge badge-category">{'\uD83C\uDFAF'} {f.challenge_name}</span>
                {f.tags && f.tags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <FindingModal onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

// ─── Finding Detail ───
function FindingDetail({ id, navigate }) {
  const [finding, setFinding] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/api/findings/${id}`).then((d) => setFinding(d.finding)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loading />;
  if (!finding) return <div>Finding not found</div>;

  const ts = finding.timestamp ? new Date(finding.timestamp * 1000).toLocaleString() : '';

  return (
    <div className="detail-view">
      <div className="back-btn" onClick={() => navigate('findings')}>{'\u2190'} Back to Findings</div>
      <div className="card">
        <div className="detail-header">
          <div className="finding-meta" style={{ marginBottom: '12px' }}>
            <span className={`badge badge-${finding.finding_type}`}>{finding.finding_type}</span>
            <span className={`badge badge-${finding.status}`}>{finding.status}</span>
            <span className="badge badge-category">{finding.category}</span>
          </div>
          <h2>{finding.title}</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>
            Agent: <strong>{finding.agent_id}</strong> {'\u00B7'} Challenge: <strong>{finding.challenge_name}</strong> {'\u00B7'} {ts}
          </div>
        </div>

        <div className="detail-body">{finding.content}</div>

        {finding.tags && finding.tags.length > 0 && (
          <div className="detail-section">
            <h3>Tags</h3>
            <div className="tags-display">
              {finding.tags.map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
          </div>
        )}

        {finding.evidence && finding.evidence.length > 0 && (
          <div className="detail-section">
            <h3>Evidence</h3>
            {finding.evidence.map((e, i) => (
              <div key={i} style={{ padding: '8px 12px', background: 'var(--bg-input)', borderRadius: '6px', marginBottom: '6px', fontFamily: 'var(--font-mono)', fontSize: '13px', wordBreak: 'break-all' }}>
                {e}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Notes Page ───
function NotesPage({ navigate }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(() => {
    api('/api/notes').then((d) => setNotes(d.notes || [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-header">
        <h2>Agent Investigation Notes</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Note</button>
      </div>

      {loading ? <Loading /> : notes.length === 0 ? (
        <div className="empty-state">
          <div className="icon">{'\uD83D\uDCDD'}</div>
          <h3>No investigation notes yet</h3>
          <p>Agent notes will appear here as agents document their investigation paths</p>
        </div>
      ) : (
        <div className="findings-list">
          {notes.map((n) => (
            <div key={n.id} className="finding-card" onClick={() => navigate('notes', n.id)}>
              <div className="finding-header">
                <span className="finding-title">{n.title}</span>
                {n.flag_found && <span className="badge badge-flag">{'\uD83C\uDFF4'} FLAG</span>}
              </div>
              <div className="finding-content">{n.methodology}</div>
              <div className="finding-meta">
                <span className="badge badge-category">{'\uD83E\uDD16'} {n.agent_id}</span>
                <span className="badge badge-category">{'\uD83C\uDFAF'} {n.challenge_name}</span>
                {n.tools_used && n.tools_used.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}
                {n.query_path && <span className="badge badge-clue">{n.query_path.length} steps</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <NoteModal onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

// ─── Note Detail ───
function NoteDetail({ id, navigate }) {
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/api/notes/${id}`).then((d) => setNote(d.note)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loading />;
  if (!note) return <div>Note not found</div>;

  const ts = note.timestamp ? new Date(note.timestamp * 1000).toLocaleString() : '';

  return (
    <div className="detail-view">
      <div className="back-btn" onClick={() => navigate('notes')}>{'\u2190'} Back to Notes</div>
      <div className="card">
        <div className="detail-header">
          <h2>{note.title}</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>
            Agent: <strong>{note.agent_id}</strong> {'\u00B7'} Challenge: <strong>{note.challenge_name}</strong> {'\u00B7'} {ts}
          </div>
        </div>

        {note.flag_found && (
          <div style={{
            padding: '16px', marginTop: '16px',
            background: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.3)',
            borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '16px',
            color: 'var(--accent)', fontWeight: 700,
          }}>
            {'\uD83C\uDFF4'} {note.flag_found}
          </div>
        )}

        {note.methodology && (
          <div className="detail-section">
            <h3>Methodology</h3>
            <div className="detail-body">{note.methodology}</div>
          </div>
        )}

        {note.query_path && note.query_path.length > 0 && (
          <div className="detail-section">
            <h3>Investigation Path</h3>
            <div className="query-path">
              {note.query_path.map((step, i) => (
                <div key={i} className="query-step">
                  <div className="step-number">{step.step || i + 1}</div>
                  <div className="step-content">
                    <div className="step-action">{step.action}</div>
                    <div className="step-result">{step.result}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {note.tools_used && note.tools_used.length > 0 && (
          <div className="detail-section">
            <h3>Tools Used</h3>
            <div className="tags-display">
              {note.tools_used.map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
          </div>
        )}

        {note.commands_run && note.commands_run.length > 0 && (
          <div className="detail-section">
            <h3>Commands Run</h3>
            {note.commands_run.map((cmd, i) => (
              <div key={i} style={{ padding: '8px 12px', background: 'var(--bg-input)', borderRadius: '6px', marginBottom: '6px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                $ {cmd}
              </div>
            ))}
          </div>
        )}

        {note.key_observations && note.key_observations.length > 0 && (
          <div className="detail-section">
            <h3>Key Observations</h3>
            <ul style={{ paddingLeft: '20px' }}>
              {note.key_observations.map((obs, i) => (
                <li key={i} style={{ marginBottom: '8px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{obs}</li>
              ))}
            </ul>
          </div>
        )}

        {note.dead_ends && note.dead_ends.length > 0 && (
          <div className="detail-section">
            <h3 style={{ color: 'var(--danger)' }}>Dead Ends</h3>
            <ul style={{ paddingLeft: '20px' }}>
              {note.dead_ends.map((de, i) => (
                <li key={i} style={{ marginBottom: '8px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{de}</li>
              ))}
            </ul>
          </div>
        )}

        {note.next_steps && note.next_steps.length > 0 && (
          <div className="detail-section">
            <h3 style={{ color: 'var(--info)' }}>Next Steps</h3>
            <ul style={{ paddingLeft: '20px' }}>
              {note.next_steps.map((ns, i) => (
                <li key={i} style={{ marginBottom: '8px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{ns}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Search Page ───
function SearchPage({ navigate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const doSearch = () => {
    if (!query.trim()) return;
    setLoading(true);
    api(`/api/search?q=${encodeURIComponent(query)}`).then(setResults).finally(() => setLoading(false));
  };

  return (
    <div>
      <div className="page-header"><h2>Search</h2></div>
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search findings, notes, flags, agents..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
        />
        <button className="btn btn-primary" onClick={doSearch}>Search</button>
      </div>

      {loading && <Loading />}

      {results && !loading && (
        <div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
            {results.total} result{results.total !== 1 ? 's' : ''} for "<strong>{results.query}</strong>"
          </p>

          {results.findings && results.findings.length > 0 && (
            <>
              <h3 style={{ marginBottom: '12px' }}>Findings ({results.findings.length})</h3>
              <div className="findings-list" style={{ marginBottom: '24px' }}>
                {results.findings.map((f) => (
                  <div key={f.id} className="finding-card" onClick={() => navigate('findings', f.id)}>
                    <div className="finding-header">
                      <span className="finding-title">{f.title}</span>
                      <span className={`badge badge-${f.finding_type}`}>{f.finding_type}</span>
                    </div>
                    <div className="finding-content">{f.content}</div>
                    <div className="finding-meta">
                      <span className="badge badge-category">{f.challenge_name}</span>
                      <span className="badge badge-category">{f.agent_id}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {results.notes && results.notes.length > 0 && (
            <>
              <h3 style={{ marginBottom: '12px' }}>Notes ({results.notes.length})</h3>
              <div className="findings-list">
                {results.notes.map((n) => (
                  <div key={n.id} className="finding-card" onClick={() => navigate('notes', n.id)}>
                    <div className="finding-header">
                      <span className="finding-title">{n.title}</span>
                      {n.flag_found && <span className="badge badge-flag">FLAG</span>}
                    </div>
                    <div className="finding-content">{n.methodology}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {results.total === 0 && (
            <div className="empty-state">
              <div className="icon">{'\uD83D\uDD0D'}</div>
              <h3>No results found</h3>
              <p>Try different search terms</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Agent Prompt Page ───
function AgentPromptPage() {
  const [prompt, setPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api('/api/agent-prompt').then(setPrompt).finally(() => setLoading(false));
  }, []);

  const copyPrompt = () => {
    if (prompt?.system_prompt) {
      navigator.clipboard.writeText(prompt.system_prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="prompt-page">
      <div className="page-header">
        <h2>Agent System Prompt</h2>
        <button className="btn btn-primary" onClick={copyPrompt}>
          {copied ? '\u2713 Copied!' : 'Copy Prompt'}
        </button>
      </div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.6 }}>
        Give this prompt to your AI agents so they know how to interact with SitRep.
        The prompt includes the API reference and best practices for collaborative CTF investigation.
      </p>
      <div className="prompt-box">{prompt?.system_prompt || 'No prompt configured'}</div>

      {prompt?.api_reference && (
        <div className="card" style={{ marginTop: '24px' }}>
          <h3 style={{ marginBottom: '16px' }}>API Reference</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '10px', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Method</th>
                <th style={{ textAlign: 'left', padding: '10px', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Path</th>
                <th style={{ textAlign: 'left', padding: '10px', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {prompt.api_reference.endpoints.map((ep, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      background: ep.method === 'GET' ? 'rgba(34,197,94,0.2)' : ep.method === 'POST' ? 'rgba(59,130,246,0.2)' : ep.method === 'PUT' ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)',
                      color: ep.method === 'GET' ? '#4ade80' : ep.method === 'POST' ? '#60a5fa' : ep.method === 'PUT' ? '#fbbf24' : '#f87171',
                    }}>{ep.method}</span>
                  </td>
                  <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{ep.path}</td>
                  <td style={{ padding: '10px', color: 'var(--text-secondary)', fontSize: '13px' }}>{ep.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Finding Modal ───
function FindingModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    challenge_name: '', agent_id: '', title: '', content: '',
    finding_type: 'clue', category: 'general', status: 'investigating',
    severity: 'medium', tags: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    await api('/api/findings', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
      }),
    });
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New Finding</h3>
        <div className="form-group">
          <label>Challenge Name *</label>
          <input value={form.challenge_name} onChange={(e) => setForm({ ...form, challenge_name: e.target.value })} placeholder="e.g. Incident Response 101" />
        </div>
        <div className="form-group">
          <label>Agent ID *</label>
          <input value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })} placeholder="e.g. forensics-agent-1" />
        </div>
        <div className="form-group">
          <label>Title *</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Brief description of finding" />
        </div>
        <div className="form-group">
          <label>Content *</label>
          <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Detailed description..." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label>Type</label>
            <select value={form.finding_type} onChange={(e) => setForm({ ...form, finding_type: e.target.value })}>
              {['flag', 'clue', 'artifact', 'timeline_event', 'ioc', 'vulnerability'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {['general', 'forensics', 'web', 'crypto', 'reversing', 'pwn', 'misc', 'network', 'osint', 'steganography'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {['investigating', 'confirmed', 'dead_end'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Severity</label>
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {['critical', 'high', 'medium', 'low', 'info'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Tags (comma-separated)</label>
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="e.g. dns, exfiltration, malware" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save Finding'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Note Modal ───
function NoteModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    challenge_name: '', agent_id: '', title: '', methodology: '',
    tools_used: '', flag_found: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    await api('/api/notes', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        tools_used: form.tools_used ? form.tools_used.split(',').map((t) => t.trim()) : [],
      }),
    });
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New Investigation Note</h3>
        <div className="form-group">
          <label>Challenge Name *</label>
          <input value={form.challenge_name} onChange={(e) => setForm({ ...form, challenge_name: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Agent ID *</label>
          <input value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Title *</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Investigation of X via Y approach" />
        </div>
        <div className="form-group">
          <label>Methodology</label>
          <textarea value={form.methodology} onChange={(e) => setForm({ ...form, methodology: e.target.value })} placeholder="Describe your investigation approach..." />
        </div>
        <div className="form-group">
          <label>Tools Used (comma-separated)</label>
          <input value={form.tools_used} onChange={(e) => setForm({ ...form, tools_used: e.target.value })} placeholder="e.g. wireshark, volatility, ghidra" />
        </div>
        <div className="form-group">
          <label>Flag Found</label>
          <input value={form.flag_found} onChange={(e) => setForm({ ...form, flag_found: e.target.value })} placeholder="flag{...}" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───
function StatCard({ icon, value, label, color }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Loading() {
  return <div className="loading"><div className="spinner" /></div>;
}

function EmptyMini({ text }) {
  return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>{text}</div>;
}
