import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase.js";
import { LogOut, Search, BarChart3, Filter, Users, X, ChevronRight, RefreshCw } from "lucide-react";

/* ============================================================
   INVIBE · Pannello Controllo Venditori
   Dati da Supabase (RPC). Login email+password (bcrypt).
   Palette: blu #1E6BF1 su navy — colori app staff.
   ============================================================ */

const STORE_KEY = "iv_vendite_sess";

// stadi funnel (colonna Q) — ordine = progressione poi uscite
const STAGES = [
  { n: 1, label: "Posti bloccati",     short: "Bloccati",   color: "#6b7c8f" },
  { n: 2, label: "Link Zoho inviato",  short: "Link Zoho",  color: "#4d8bff" },
  { n: 3, label: "Warning link Zoho",  short: "Warning",    color: "#f0b429" },
  { n: 4, label: "Pratica da inviare", short: "Da inviare", color: "#ff8f3c" },
  { n: 5, label: "Pratica inviata",    short: "Inviata",    color: "#7b6ef6" },
  { n: 6, label: "Pratica confermata", short: "Confermata", color: "#10b981" },
  { n: 7, label: "Disdetta",           short: "Disdetta",   color: "#f0453e" },
  { n: 0, label: "Cancellati / errati",short: "Cancellati", color: "#46586b" },
];
const stageOf = (n) => STAGES.find((s) => s.n === n) || STAGES[STAGES.length - 1];
const ACTIVE = [1, 2, 3, 4, 5, 6];
const IN_LAV = [1, 2, 3, 4, 5];

const META = [
  { key: "Isola di Pag", short: "PAG" },
  { key: "Corfù",        short: "CORFÙ" },
  { key: "Zante",        short: "ZANTE" },
  { key: "Gallipoli",    short: "GALLIPOLI" },
  { key: "Sardegna",     short: "SARDEGNA" },
];
const metaShort = (m) => (META.find((x) => x.key === m) || { short: m || "—" }).short;

// mappa riga DB -> forma UI
const mapRow = (r) => ({
  cod: r.cod, nome: r.nome, pax: r.pax || 0, meta: r.meta, turno: r.turno,
  can: r.canale, stage: r.stage == null ? 0 : r.stage, stato: r.stato,
  city: r.citta && r.citta !== "\\-" ? r.citta : "", data: r.data_richiesta,
});

// ---- animated counter -------------------------------------------------
function useCountUp(target, dur = 420) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    let raf, t0;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / dur);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}
function Num({ n }) { const v = useCountUp(n || 0); return <>{v.toLocaleString("it-IT")}</>; }

// =====================================================================
export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);   // { token, nome, email, codice_pr, ruolo }
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLeads = useCallback(async (token) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("prenotazioni_lista", { p_token: token });
    setLoading(false);
    if (error) return { error: error.message };
    setLeads((data || []).map(mapRow));
    return { ok: true };
  }, []);

  // restore session
  useEffect(() => {
    (async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
        if (saved?.token) {
          const { data } = await supabase.rpc("venditore_me", { p_token: saved.token });
          if (data?.profilo) {
            const u = { token: saved.token, ...data.profilo };
            setUser(u);
            await fetchLeads(saved.token);
          } else {
            localStorage.removeItem(STORE_KEY);
          }
        }
      } catch { /* ignore */ }
      setBooting(false);
    })();
  }, [fetchLeads]);

  const login = async (email, password) => {
    const { data, error } = await supabase.rpc("venditore_login", { p_email: email, p_password: password });
    if (error) return "Connessione non riuscita. Riprova.";
    if (data?.error) return data.error;
    const u = { token: data.token, ...data.profilo };
    localStorage.setItem(STORE_KEY, JSON.stringify({ token: data.token }));
    setUser(u);
    await fetchLeads(data.token);
    return null;
  };

  const logout = async () => {
    try { await supabase.rpc("venditore_logout", { p_token: user?.token }); } catch {}
    localStorage.removeItem(STORE_KEY);
    setUser(null); setLeads([]);
  };

  return (
    <>
      <StyleTag />
      {booting ? <Boot />
        : user ? <Panel user={user} leads={leads} loading={loading}
                        onRefresh={() => fetchLeads(user.token)} onLogout={logout} />
        : <Login onLogin={login} />}
    </>
  );
}

function Boot() {
  return <div className="boot"><div className="logo-tile lg">IV</div><span>Carico…</span></div>;
}

// ---- LOGIN ----------------------------------------------------------
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    const e = await onLogin(email.trim(), pw);
    setBusy(false);
    if (e) setErr(e);
  };
  const onKey = (ev) => ev.key === "Enter" && submit();

  return (
    <div className="login-wrap">
      <div className="login-glow" aria-hidden />
      <div className="login-card">
        <div className="brand-row">
          <div className="logo-tile">IV</div>
          <div><div className="brand-name">INVIBE</div><div className="brand-sub">Pannello venditori</div></div>
        </div>
        <h1 className="login-h1">Il tuo funnel,<br />sempre aggiornato.</h1>
        <p className="login-p">Accedi per vedere i clienti sul tuo codice e a che punto sono.</p>

        <label className="fld"><span>Email</span>
          <input value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }}
                 onKeyDown={onKey} placeholder="nome@invibe.it" type="email" autoComplete="username" /></label>
        <label className="fld"><span>Password</span>
          <input value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }}
                 onKeyDown={onKey} placeholder="••••••••" type="password" autoComplete="current-password" /></label>
        {err && <div className="login-err">{err}</div>}
        <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? "Accesso…" : "Entra"}</button>
      </div>
    </div>
  );
}

// ---- PANEL ----------------------------------------------------------
function Panel({ user, leads, loading, onRefresh, onLogout }) {
  const isAdmin = user.ruolo === "admin";
  const [view, setView] = useState("funnel");
  const [filters, setFilters] = useState({ meta: "", turno: "", stage: null, q: "" });
  const [sel, setSel] = useState(null);

  const rows = useMemo(() => leads.filter((r) => {
    if (filters.meta && r.meta !== filters.meta) return false;
    if (filters.turno && r.turno !== filters.turno) return false;
    if (filters.stage != null && r.stage !== filters.stage) return false;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      if (!(`${r.cod} ${r.nome} ${r.can} ${r.city}`.toLowerCase().includes(q))) return false;
    }
    return true;
  }), [leads, filters]);

  const turni = useMemo(() => [...new Set(leads.map((r) => r.turno).filter(Boolean))].sort(), [leads]);

  return (
    <div className="shell">
      <nav className="rail">
        <div className="logo-tile sm" title="INVIBE">IV</div>
        <button className={`rail-item ${view === "funnel" ? "on" : ""}`} onClick={() => setView("funnel")}>
          <Filter size={20} /><span>Funnel</span></button>
        {isAdmin && (
          <button className={`rail-item ${view === "ranking" ? "on" : ""}`} onClick={() => setView("ranking")}>
            <BarChart3 size={20} /><span>Classifica</span></button>)}
        <div className="rail-spacer" />
        <button className="rail-item" onClick={onRefresh} title="Aggiorna">
          <RefreshCw size={19} className={loading ? "spin" : ""} /><span>Aggiorna</span></button>
        <button className="rail-item" onClick={onLogout}><LogOut size={20} /><span>Esci</span></button>
      </nav>

      <main className="main">
        <IdentityBar user={user} isAdmin={isAdmin} filters={filters} setFilters={setFilters}
                     turni={turni} view={view} />
        {view === "ranking" && isAdmin
          ? <Ranking rows={rows} />
          : <Funnel user={user} isAdmin={isAdmin} leads={leads} rows={rows}
                    filters={filters} setFilters={setFilters} onOpen={setSel} loading={loading} />}
      </main>

      {sel && <Drawer lead={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function IdentityBar({ user, isAdmin, filters, setFilters, turni, view }) {
  return (
    <header className="idbar">
      <div className="idbar-left">
        <div className="who">{isAdmin ? "Ufficio" : user.ruolo === "canale" ? "Canale" : "Venditore"}</div>
        <div className="who-name">{user.nome || user.email}</div>
      </div>
      {view === "funnel" && (
        <div className="filters">
          <div className="search"><Search size={15} />
            <input placeholder="Cerca codice, nome, città…" value={filters.q}
                   onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></div>
          <select value={filters.meta} onChange={(e) => setFilters({ ...filters, meta: e.target.value })}>
            <option value="">Tutte le mete</option>
            {META.map((m) => <option key={m.key} value={m.key}>{m.short}</option>)}</select>
          <select value={filters.turno} onChange={(e) => setFilters({ ...filters, turno: e.target.value })}>
            <option value="">Tutti i turni</option>
            {turni.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </div>)}
      <div className="user-chip"><span className="code-badge">{isAdmin ? "ALL" : user.codice_pr || "—"}</span></div>
    </header>
  );
}

// ---- FUNNEL ---------------------------------------------------------
function Funnel({ user, isAdmin, leads, rows, filters, setFilters, onOpen, loading }) {
  const forCounts = useMemo(() => leads.filter((r) => {
    if (filters.meta && r.meta !== filters.meta) return false;
    if (filters.turno && r.turno !== filters.turno) return false;
    if (filters.q) { const q = filters.q.toLowerCase();
      if (!(`${r.cod} ${r.nome} ${r.can} ${r.city}`.toLowerCase().includes(q))) return false; }
    return true;
  }), [leads, filters.meta, filters.turno, filters.q]);

  const byStage = useMemo(() => {
    const m = {}; STAGES.forEach((s) => (m[s.n] = { groups: 0, pax: 0 }));
    forCounts.forEach((r) => { const k = m[r.stage] || m[0]; k.groups++; k.pax += r.pax; });
    return m;
  }, [forCounts]);

  const maxPax = Math.max(1, ...STAGES.map((s) => byStage[s.n].pax));
  const activeGroups = ACTIVE.reduce((a, n) => a + byStage[n].groups, 0);
  const activePax    = ACTIVE.reduce((a, n) => a + byStage[n].pax, 0);
  const confirmed    = byStage[6].groups;
  const working      = IN_LAV.reduce((a, n) => a + byStage[n].groups, 0);
  const disdette     = byStage[7].groups;
  const firstName = (user.nome || "").split(" ")[0];
  const empty = leads.length === 0 && !loading;

  return (
    <div className="funnel-view">
      <section className="hero">
        <p className="hero-line">
          {isAdmin ? <>Su tutti i codici, </> : user.ruolo === "canale" ? <>Sul canale {user.nome}, </> : <>Ciao {firstName}, </>}
          hai <b className="hl blue"><Num n={activeGroups} /></b> capigruppo per{" "}
          <b className="hl blue"><Num n={activePax} /></b> pax in gioco —{" "}
          <b className="hl green"><Num n={confirmed} /></b> confermati,{" "}
          <b className="hl amber"><Num n={working} /></b> in lavorazione
          {disdette > 0 && <>, <b className="hl red"><Num n={disdette} /></b> disdette</>}.
        </p>
      </section>

      {empty ? <Empty user={user} /> : (
        <div className="cols">
          <aside className="rail-funnel" aria-label="Stadi del funnel">
            {STAGES.map((s, i) => {
              const c = byStage[s.n];
              const w = (c.pax / maxPax) * 100;
              const selected = filters.stage === s.n;
              return (
                <button key={s.n} className={`fstage ${selected ? "sel" : ""} ${c.groups === 0 ? "dim" : ""}`}
                  style={{ "--sc": s.color }}
                  onClick={() => setFilters({ ...filters, stage: selected ? null : s.n })}>
                  <div className="fnode-col"><span className="fnode" />
                    {i < STAGES.length - 1 && <span className="fpipe" />}</div>
                  <div className="fbody">
                    <div className="fhead"><span className="fnum">{s.n}</span>
                      <span className="flabel">{s.label}</span>
                      <span className="fcount">{c.groups}<em> gr</em></span></div>
                    <div className="ftrack"><span className="ffill" style={{ width: `${w}%` }} /></div>
                    <div className="fpax">{c.pax} pax</div>
                  </div>
                </button>);
            })}
          </aside>

          <section className="list">
            <div className="list-head">
              <span>{rows.length} {rows.length === 1 ? "prenotazione" : "prenotazioni"}
                {filters.stage != null && <> · {stageOf(filters.stage).label}</>}</span>
              {(filters.stage != null || filters.meta || filters.turno || filters.q) &&
                <button className="clear" onClick={() => setFilters({ meta: "", turno: "", stage: null, q: "" })}>
                  Azzera filtri</button>}
            </div>
            {rows.length === 0 ? <div className="none">Nessuna prenotazione con questi filtri.</div> : (
              <div className="rows">
                {rows.slice(0, 300).map((r, i) => {
                  const s = stageOf(r.stage);
                  return (
                    <button key={r.cod + i} className="row" onClick={() => onOpen(r)}>
                      <span className="cod">{r.cod}</span>
                      <span className="rnome">{r.nome || "—"}</span>
                      <span className="chips"><span className="chip">{metaShort(r.meta)}</span>
                        {r.turno && <span className="chip ghost">{r.turno}</span>}</span>
                      <span className="rpax">{r.pax}<em>pax</em></span>
                      <span className="pill" style={{ "--sc": s.color }}>{s.short}</span>
                      {isAdmin && <span className="rcan">{r.can}</span>}
                      <ChevronRight size={15} className="rgo" />
                    </button>);
                })}
                {rows.length > 300 && <div className="more">+{rows.length - 300} altre — restringi con i filtri</div>}
              </div>)}
          </section>
        </div>)}
    </div>
  );
}

function Empty({ user }) {
  return (
    <div className="empty">
      <div className="empty-mark"><Users size={22} /></div>
      <div className="empty-t">Ancora nessuna prenotazione sul codice <b>{user.codice_pr}</b></div>
      <div className="empty-s">Appena un cliente compila il tuo link, comparirà qui con il suo stato.</div>
    </div>);
}

// ---- RANKING --------------------------------------------------------
function Ranking({ rows }) {
  const data = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const k = r.can || "—";
      if (!m[k]) m[k] = { code: k, groups: 0, pax: 0, conf: 0, confPax: 0 };
      m[k].groups++; m[k].pax += r.pax;
      if (r.stage === 6) { m[k].conf++; m[k].confPax += r.pax; }
    });
    return Object.values(m).sort((a, b) => b.confPax - a.confPax);
  }, [rows]);
  const max = Math.max(1, ...data.map((d) => d.confPax));
  const tot = data.reduce((a, d) => ({ g: a.g + d.groups, p: a.p + d.pax, cp: a.cp + d.confPax }), { g: 0, p: 0, cp: 0 });

  return (
    <div className="ranking">
      <div className="rk-totals">
        <div><b><Num n={tot.g} /></b><span>capigruppo totali</span></div>
        <div><b><Num n={tot.p} /></b><span>pax totali</span></div>
        <div><b className="green"><Num n={tot.cp} /></b><span>pax confermati</span></div>
        <div><b>{data.length}</b><span>codici attivi</span></div>
      </div>
      <div className="rk-list">
        {data.map((d, i) => (
          <div className="rk-row" key={d.code}>
            <span className="rk-pos">{i + 1}</span>
            <div className="rk-id"><span className="code-badge sm">{d.code}</span></div>
            <div className="rk-bar"><span style={{ width: `${(d.confPax / max) * 100}%` }} /></div>
            <div className="rk-nums"><b>{d.confPax}</b><em>pax conf.</em>
              <span className="rk-sub">{d.conf}/{d.groups} gruppi</span></div>
          </div>))}
      </div>
    </div>);
}

// ---- DRAWER ---------------------------------------------------------
function Drawer({ lead, onClose }) {
  const s = stageOf(lead.stage);
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="dr-head"><span className="cod big">{lead.cod}</span>
          <button className="dr-x" onClick={onClose} aria-label="Chiudi"><X size={18} /></button></div>
        <div className="dr-nome">{lead.nome || "—"}</div>
        <div className="pill lg" style={{ "--sc": s.color }}>{lead.stato || `${s.n} · ${s.label}`}</div>
        <dl className="dr-grid">
          <div><dt>Meta</dt><dd>{lead.meta || "—"}</dd></div>
          <div><dt>Turno</dt><dd>{lead.turno || "—"}</dd></div>
          <div><dt>Pax</dt><dd>{lead.pax}</dd></div>
          <div><dt>Codice PR</dt><dd>{lead.can || "—"}</dd></div>
          <div><dt>Città</dt><dd>{lead.city || "—"}</dd></div>
          <div><dt>Richiesta</dt><dd>{lead.data || "—"}</dd></div>
        </dl>
        <div className="dr-note">Lo stato arriva dal foglio funnel (colonna Q). Qui è in sola lettura.</div>
      </aside>
    </div>);
}

// ---- STYLES ---------------------------------------------------------
function StyleTag() { return <style dangerouslySetInnerHTML={{ __html: CSS }} />; }
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
:root{--bg:#0b141d;--panel:#101d29;--line:rgba(255,255,255,.08);--blue:#1E6BF1;--blue2:#4d8bff;
--ink:#eef4ff;--muted:#8fa0b4;--faint:#5a6b7d;--green:#10b981;--amber:#f5a623;--red:#f0453e;
--disp:'Space Grotesk',-apple-system,system-ui,sans-serif;--mono:'Space Mono',ui-monospace,monospace;}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body,#root{background:var(--bg);min-height:100dvh}
.shell,.login-wrap,.boot{font-family:var(--disp);color:var(--ink);font-variant-numeric:tabular-nums}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
input,select{font-family:inherit}
:focus-visible{outline:2px solid var(--blue2);outline-offset:2px;border-radius:6px}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.boot{min-height:100dvh;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;color:var(--muted);font-size:13px}
.logo-tile{width:44px;height:44px;border-radius:13px;background:var(--blue);display:grid;place-items:center;
font-weight:700;font-size:15px;color:#fff;box-shadow:0 6px 20px -4px rgba(30,107,241,.6)}
.logo-tile.sm{width:38px;height:38px;font-size:13px;border-radius:11px}
.logo-tile.lg{width:54px;height:54px;font-size:18px;border-radius:16px}

.login-wrap{min-height:100dvh;display:grid;place-items:center;padding:24px;position:relative;overflow:hidden}
.login-glow{position:absolute;width:680px;height:680px;border-radius:50%;
background:radial-gradient(circle,rgba(30,107,241,.28),transparent 62%);top:-180px;right:-160px;filter:blur(20px);animation:float 14s ease-in-out infinite}
@keyframes float{0%,100%{transform:translate(0,0)}50%{transform:translate(-40px,40px)}}
.login-card{position:relative;width:100%;max-width:400px;background:linear-gradient(180deg,var(--panel),#0d1a25);
border:1px solid var(--line);border-radius:22px;padding:34px 30px 30px;box-shadow:0 30px 80px -20px rgba(0,0,0,.6)}
.brand-row{display:flex;align-items:center;gap:12px;margin-bottom:26px}
.brand-name{font-weight:700;letter-spacing:.14em;font-size:14px}
.brand-sub{color:var(--muted);font-size:12px;letter-spacing:.04em}
.login-h1{font-size:29px;line-height:1.1;font-weight:600;letter-spacing:-.02em;margin-bottom:10px}
.login-p{color:var(--muted);font-size:14px;margin-bottom:22px;line-height:1.5}
.fld{display:block;margin-bottom:14px}
.fld span{display:block;font-size:12px;color:var(--muted);margin-bottom:6px}
.fld input{width:100%;background:#0a141d;border:1px solid var(--line);border-radius:12px;padding:12px 14px;color:var(--ink);font-size:14px;transition:border .15s}
.fld input:focus{border-color:var(--blue);outline:none}
.login-err{color:var(--red);font-size:13px;margin:-4px 0 12px}
.btn-primary{width:100%;background:var(--blue);color:#fff;font-weight:600;font-size:15px;padding:13px;border-radius:12px;transition:transform .12s,background .15s;margin-top:4px}
.btn-primary:hover{background:#1657ce}.btn-primary:active{transform:translateY(1px)}
.btn-primary:disabled{opacity:.6;cursor:default}

.shell{display:flex;min-height:100dvh}
.rail{width:76px;background:#0a121a;border-right:1px solid var(--line);display:flex;flex-direction:column;
align-items:center;padding:16px 0 18px;gap:6px;flex-shrink:0;position:sticky;top:0;height:100dvh}
.rail .logo-tile{margin-bottom:16px}
.rail-item{width:54px;height:52px;border-radius:14px;display:flex;flex-direction:column;align-items:center;
justify-content:center;gap:3px;color:var(--faint);font-size:9px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;transition:background .15s,color .15s}
.rail-item:hover{background:rgba(255,255,255,.05);color:var(--muted)}
.rail-item.on{background:rgba(30,107,241,.16);color:var(--blue2)}
.rail-spacer{flex:1}
.main{flex:1;min-width:0;display:flex;flex-direction:column;max-width:1180px;margin:0 auto;width:100%}

.idbar{display:flex;align-items:center;gap:16px;padding:20px 28px;border-bottom:1px solid var(--line);
position:sticky;top:0;background:rgba(11,20,29,.86);backdrop-filter:blur(10px);z-index:5}
.idbar-left{min-width:150px}
.who{font-size:11px;color:var(--faint);letter-spacing:.08em;text-transform:uppercase}
.who-name{font-size:16px;font-weight:600;letter-spacing:-.01em}
.filters{display:flex;gap:9px;flex:1;justify-content:flex-end;flex-wrap:wrap}
.search{display:flex;align-items:center;gap:7px;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:0 12px;color:var(--faint);min-width:210px}
.search input{background:none;border:none;color:var(--ink);padding:9px 0;font-size:13px;width:100%;outline:none}
.filters select{background:var(--panel);border:1px solid var(--line);color:var(--muted);border-radius:11px;padding:9px 12px;font-size:13px;cursor:pointer}
.code-badge{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--blue2);background:rgba(30,107,241,.14);border:1px solid rgba(30,107,241,.3);padding:6px 10px;border-radius:9px}
.code-badge.sm{font-size:10px;padding:3px 7px}

.funnel-view{padding:26px 28px 40px}
.hero{margin-bottom:26px;max-width:840px}
.hero-line{font-size:27px;line-height:1.32;font-weight:500;letter-spacing:-.015em;color:#cdd8e6}
.hl{font-weight:700}.hl.blue{color:var(--blue2)}.hl.green{color:var(--green)}.hl.amber{color:var(--amber)}.hl.red{color:var(--red)}
.cols{display:grid;grid-template-columns:352px 1fr;gap:26px;align-items:start}

.rail-funnel{display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:10px 16px 4px}
.fstage{display:flex;gap:14px;text-align:left;padding:9px 6px;border-radius:12px;transition:background .15s;--sc:#888}
.fstage:hover{background:rgba(255,255,255,.03)}.fstage.sel{background:rgba(255,255,255,.06)}.fstage.dim{opacity:.42}
.fnode-col{display:flex;flex-direction:column;align-items:center;padding-top:5px}
.fnode{width:12px;height:12px;border-radius:50%;background:var(--sc);box-shadow:0 0 0 4px color-mix(in srgb,var(--sc) 22%,transparent);flex-shrink:0}
.fpipe{width:2px;flex:1;background:linear-gradient(var(--sc),rgba(255,255,255,.06));margin-top:4px;min-height:20px}
.fbody{flex:1;min-width:0;padding-bottom:6px}
.fhead{display:flex;align-items:baseline;gap:8px;margin-bottom:7px}
.fnum{font-family:var(--mono);font-size:12px;color:var(--sc);font-weight:700}
.flabel{font-size:13.5px;font-weight:500;color:var(--ink);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fcount{font-size:15px;font-weight:700}.fcount em{font-style:normal;font-size:10px;color:var(--faint);font-weight:400}
.ftrack{height:7px;background:rgba(255,255,255,.05);border-radius:99px;overflow:hidden}
.ffill{display:block;height:100%;background:var(--sc);border-radius:99px;transition:width .7s cubic-bezier(.2,.7,.2,1)}
.fpax{font-size:11px;color:var(--faint);margin-top:4px}

.list{background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.list-head{display:flex;justify-content:space-between;align-items:center;padding:15px 18px;border-bottom:1px solid var(--line);font-size:13px;color:var(--muted)}
.clear{font-size:12px;color:var(--blue2)}
.none{padding:30px 18px;text-align:center;color:var(--faint);font-size:13px}
.rows{display:flex;flex-direction:column}
.row{display:grid;grid-template-columns:96px 1fr auto auto auto 15px;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--line);text-align:left;transition:background .12s}
.row:last-child{border-bottom:none}.row:hover{background:rgba(255,255,255,.03)}
.cod{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--muted)}
.cod.big{font-size:16px;color:var(--blue2)}
.rnome{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chips{display:flex;gap:6px}
.chip{font-size:10.5px;font-weight:600;letter-spacing:.04em;color:var(--muted);background:rgba(255,255,255,.05);border-radius:6px;padding:3px 7px}
.chip.ghost{background:none;border:1px solid var(--line);color:var(--faint)}
.rpax{font-size:15px;font-weight:700;text-align:right}.rpax em{font-style:normal;font-size:9px;color:var(--faint);margin-left:3px;font-weight:400}
.pill{font-size:11px;font-weight:600;color:var(--sc);background:color-mix(in srgb,var(--sc) 15%,transparent);border:1px solid color-mix(in srgb,var(--sc) 34%,transparent);padding:4px 9px;border-radius:99px;white-space:nowrap}
.pill.lg{font-size:13px;padding:6px 13px;display:inline-block;margin:12px 0 4px}
.rcan{font-family:var(--mono);font-size:11px;color:var(--faint);min-width:38px;text-align:right}
.rgo{color:var(--faint)}
.more{padding:14px 18px;font-size:12px;color:var(--faint);text-align:center}

.empty{padding:60px 24px;text-align:center}
.empty-mark{width:52px;height:52px;border-radius:15px;background:rgba(30,107,241,.12);color:var(--blue2);display:grid;place-items:center;margin:0 auto 16px}
.empty-t{font-size:16px;font-weight:500;margin-bottom:6px}.empty-t b{font-family:var(--mono);color:var(--blue2)}
.empty-s{font-size:13px;color:var(--muted);max-width:340px;margin:0 auto;line-height:1.5}

.ranking{padding:26px 28px 40px}
.rk-totals{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:26px}
.rk-totals>div{background:var(--panel);border:1px solid var(--line);border-radius:15px;padding:18px 20px}
.rk-totals b{display:block;font-size:30px;font-weight:700;letter-spacing:-.02em}.rk-totals b.green{color:var(--green)}
.rk-totals span{font-size:12px;color:var(--muted)}
.rk-list{background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.rk-row{display:grid;grid-template-columns:34px 90px 1fr auto;align-items:center;gap:16px;padding:15px 20px;border-bottom:1px solid var(--line)}
.rk-row:last-child{border-bottom:none}
.rk-pos{font-family:var(--mono);font-size:14px;color:var(--faint);font-weight:700}
.rk-bar{height:10px;background:rgba(255,255,255,.05);border-radius:99px;overflow:hidden}
.rk-bar span{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--green));border-radius:99px;transition:width .8s cubic-bezier(.2,.7,.2,1)}
.rk-nums{text-align:right;min-width:120px}
.rk-nums b{font-size:18px;font-weight:700}.rk-nums em{font-style:normal;font-size:10px;color:var(--faint);margin-left:4px}
.rk-sub{display:block;font-size:11px;color:var(--faint);margin-top:2px}

.drawer-scrim{position:fixed;inset:0;background:rgba(4,9,14,.6);backdrop-filter:blur(3px);z-index:30;display:flex;justify-content:flex-end;animation:fade .18s ease}
@keyframes fade{from{opacity:0}to{opacity:1}}
.drawer{width:min(400px,92vw);background:linear-gradient(180deg,var(--panel),#0c1824);border-left:1px solid var(--line);padding:24px 26px;overflow-y:auto;animation:slide .24s cubic-bezier(.2,.7,.2,1)}
@keyframes slide{from{transform:translateX(30px);opacity:.4}to{transform:translateX(0);opacity:1}}
.dr-head{display:flex;justify-content:space-between;align-items:center}
.dr-x{color:var(--muted);padding:6px;border-radius:8px}.dr-x:hover{background:rgba(255,255,255,.06);color:var(--ink)}
.dr-nome{font-size:22px;font-weight:600;letter-spacing:-.01em;margin-top:8px}
.dr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px;margin-top:22px;border-top:1px solid var(--line);padding-top:18px}
.dr-grid>div{padding:9px 0;border-bottom:1px solid var(--line)}
.dr-grid dt{font-size:11px;color:var(--faint);margin-bottom:3px}
.dr-grid dd{font-size:15px;font-weight:500}
.dr-note{margin-top:20px;font-size:12px;color:var(--faint);line-height:1.5;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:11px;padding:12px 14px}

@media(max-width:860px){
.cols{grid-template-columns:1fr}.hero-line{font-size:22px}.idbar{flex-wrap:wrap}
.filters{justify-content:flex-start;order:3;width:100%}
.row{grid-template-columns:84px 1fr auto auto;gap:10px}.row .chips,.row .rcan,.row .rgo{display:none}
.rk-totals{grid-template-columns:1fr 1fr}.rk-row{grid-template-columns:26px 1fr auto;gap:10px}.rk-bar{display:none}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
