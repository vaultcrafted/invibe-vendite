/* IV_IMPORT */
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { supabase } from "./lib/supabase.js";
import {
  Home, Filter, ListChecks, Trophy, LogOut, Search, ChevronRight, X, RefreshCw,
  MapPin, CalendarDays, BellRing, Users, Crown, ArrowRight, Sparkles,
  UserRound, KeyRound, Copy, Check, Plus, History, Eye, LogIn, ShieldAlert, PenLine, FolderOpen, Phone, AtSign, Mail, ShieldCheck, MessageCircle, Lock, TrendingUp, Medal,
} from "lucide-react";

/* ============================================================
   INVIBE · Pannello Venditori — direzione "Energia Invibe"
   Chiaro, azzurro Invibe #1E6BF1 + arancio #F97316, mete colorate.
   ============================================================ */

const STORE_KEY = "iv_vendite_sess";

const STAGES = [
  { n: 1, label: "Posti bloccati",      short: "Bloccati",   color: "#64748B", soft: "#F1F5F9", ink: "#334155" },
  { n: 2, label: "Link Zoho inviato",   short: "Link Zoho",  color: "#2563EB", soft: "#DBEAFE", ink: "#1E40AF" },
  { n: 3, label: "Warning link Zoho",   short: "Warning",    color: "#D97706", soft: "#FEF3C7", ink: "#92400E" },
  { n: 4, label: "Pratica da inviare",  short: "Da inviare", color: "#EA580C", soft: "#FFEDD5", ink: "#9A3412" },
  { n: 5, label: "Pratica inviata",     short: "Inviata",    color: "#7C3AED", soft: "#EDE9FE", ink: "#5B21B6" },
  { n: 6, label: "Pratica confermata",  short: "Confermata", color: "#16A34A", soft: "#DCFCE7", ink: "#166534" },
  { n: 7, label: "Disdetta",            short: "Disdetta",   color: "#DC2626", soft: "#FEE2E2", ink: "#991B1B" },
  { n: 0, label: "Cancellati / errati", short: "Cancellati", color: "#A8A29E", soft: "#F5F5F4", ink: "#57534E" },
];
const stageOf = (n) => STAGES.find((s) => s.n === n) || STAGES[STAGES.length - 1];
const ACTIVE = [1, 2, 3, 4, 5, 6];
const IN_LAV = [1, 2, 3, 4, 5];
const DA_SOLLECITARE = [1, 2, 3];
const META = [
  { key: "Isola di Pag", short: "Pag",       soft: "#DCFCE7", ink: "#166534", dot: "#16A34A" },
  { key: "Corfù",        short: "Corfù",     soft: "#FEF3C7", ink: "#92400E", dot: "#D97706" },
  { key: "Zante",        short: "Zante",     soft: "#E0F2FE", ink: "#075985", dot: "#0284C7" },
  { key: "Gallipoli",    short: "Gallipoli", soft: "#FCE7F3", ink: "#9D174D", dot: "#DB2777" },
  { key: "Sardegna",     short: "Sardegna",  soft: "#CCFBF1", ink: "#115E59", dot: "#0D9488" },
];
const normMeta = (m) => {
  const s = (m || "").toLowerCase();
  if (s.includes("pag")) return "Isola di Pag";
  if (s.includes("corf")) return "Corfù";
  if (s.includes("zante")) return "Zante";
  if (s.includes("gallip")) return "Gallipoli";
  if (s.includes("sard")) return "Sardegna";
  return m || "—";
};
const metaInfo = (m) => META.find((x) => x.key === normMeta(m)) || { key: m, short: m || "—", soft: "#F1F5F9", ink: "#334155", dot: "#64748B" };
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MESI_LUNGHI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
// data_richiesta arriva come "gg-mm-aaaa"
function parseData(d) {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(d || "");
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const t = Date.parse(d || ""); return isNaN(t) ? null : new Date(t);
}
const meseKey = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
// Stagione = estate in cui si viaggia. Le vendite partono a settembre/ottobre:
// una richiesta da settembre in poi conta per l'estate dell'anno dopo.
const stagioneDi = (r) => { const dt = parseData(r.data); return dt ? (dt.getMonth() >= 8 ? dt.getFullYear() + 1 : dt.getFullYear()) : null; };

function computeStats(leads) {
  const byStage = {}; STAGES.forEach((s) => (byStage[s.n] = { groups: 0, pax: 0 }));
  leads.forEach((r) => { const k = byStage[r.stage] || byStage[0]; k.groups++; k.pax += r.pax; });
  const g = (arr) => arr.reduce((a, n) => a + byStage[n].groups, 0);
  const p = (arr) => arr.reduce((a, n) => a + byStage[n].pax, 0);
  const active = g(ACTIVE), confirmed = byStage[6].groups, working = g(IN_LAV), disdette = byStage[7].groups;
  const meta = {}; leads.forEach((r) => { if (ACTIVE.includes(r.stage)) { const k = normMeta(r.meta); meta[k] = meta[k] || { pax: 0, groups: 0 }; meta[k].pax += r.pax; meta[k].groups++; } });
  const byMeta = Object.entries(meta).map(([k, v]) => ({ meta: k, ...v })).sort((a, b) => b.groups - a.groups);
  return {
    totPax: p(ACTIVE), confPax: byStage[6].pax, active, confirmed, working, disdette, byStage, byMeta,
    sollecitare: g(DA_SOLLECITARE),
    convPct: active ? Math.round((confirmed / active) * 100) : 0,
  };
}
function computeMonths(leads) {
  const m = {};
  leads.forEach((r) => {
    if (!ACTIVE.includes(r.stage)) return;
    const dt = parseData(r.data); if (!dt) return;
    const k = meseKey(dt); m[k] = m[k] || { key: k, y: dt.getFullYear(), mo: dt.getMonth(), groups: 0, pax: 0 };
    m[k].groups++; m[k].pax += r.pax;
  });
  const keys = Object.keys(m).sort();
  if (!keys.length) return [];
  const out = []; let [y, mo] = keys[0].split("-").map(Number); mo -= 1;
  const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
  while (y < ly || (y === ly && mo <= lm - 1)) {
    const k = `${y}-${String(mo + 1).padStart(2, "0")}`;
    out.push(m[k] || { key: k, y, mo, groups: 0, pax: 0 });
    mo++; if (mo > 11) { mo = 0; y++; }
  }
  return out.slice(-12);
}
// da quanti giorni il gruppo è nello stato attuale. Se non lo sappiamo (fermo da prima
// che registrassimo i cambi, 6 ott 2026) usiamo la data della richiesta: "almeno N giorni".
const GIORNO = 86400000;
function giorniFermo(r) {
  if (r.stageDal) return { gg: Math.max(0, Math.floor((Date.now() - new Date(r.stageDal).getTime()) / GIORNO)), almeno: false };
  const d = parseData(r.data);
  return d ? { gg: Math.max(0, Math.floor((Date.now() - d.getTime()) / GIORNO)), almeno: true } : null;
}
const testoFermo = (g) => !g ? "" : g.gg === 0 ? "da oggi" : `da ${g.almeno ? "almeno " : ""}${g.gg} ${g.gg === 1 ? "giorno" : "giorni"}`;
const oraIt = (d) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const sortRecent = (rows) => [...rows].sort((a, b) => (parseData(b.data)?.getTime() || 0) - (parseData(a.data)?.getTime() || 0));

function useCountUp(target, dur = 550) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    let raf, t0;
    const step = (t) => { if (!t0) t0 = t; const p = Math.min(1, (t - t0) / dur);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}
function Num({ n }) { const v = useCountUp(n || 0); return <>{v.toLocaleString("it-IT")}</>; }

function Logo({ light }) {
  return (
    <div className={`logo ${light ? "light" : ""}`}>
      <span className="logo-tile"><img src="/icon-192.png" alt="" /></span><span>INVIBE</span>
    </div>
  );
}
function initials(name) {
  const p = (name || "").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "—";
}
const AV_TONES = [["#E3EEFF", "#1247B1"], ["#FFEDD5", "#9A3412"], ["#E0F2FE", "#075985"], ["#DCFCE7", "#166534"], ["#FCE7F3", "#9D174D"], ["#FEF3C7", "#92400E"]];
const avTone = (s) => { let h = 0; for (const c of s || "") h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_TONES[h % AV_TONES.length]; };
function Avatar({ name, size = 40 }) {
  const [bg, fg] = avTone(name);
  return <span className="avatar" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.36 }}>{initials(name)}</span>;
}
function MetaChip({ meta, count, onClick }) {
  const m = metaInfo(meta);
  const Tag = onClick ? "button" : "span";
  return (
    <Tag className="mchip" style={{ background: m.soft, color: m.ink }} onClick={onClick}>
      {m.short}{count != null && <b>{count}</b>}
    </Tag>
  );
}
function StagePill({ n }) {
  const s = stageOf(n);
  return <span className="spill" style={{ background: s.soft, color: s.ink }}><i style={{ background: s.color }} />{s.short}</span>;
}

/* <<<DATA_LAYER_START>>> */
function useDataLayer() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [lastSync, setLastSync] = useState(null);

  const mapRow = (r) => ({
    cod: r.cod, nome: r.nome, pax: r.pax || 0, meta: r.meta, turno: r.turno, can: r.canale,
    stage: r.stage == null ? 0 : r.stage, stato: r.stato,
    city: r.citta && r.citta !== "\\-" ? r.citta : "", data: r.data_richiesta,
    stageDal: r.stage_dal || null,
  });

  const fetchAccounts = useCallback(async (token, ruolo) => {
    if (ruolo !== "admin") { setAccounts([]); return; }
    try {
      const { data } = await supabase.rpc("venditori_lista", { p_token: token });
      if (Array.isArray(data)) setAccounts(data);
    } catch {}
  }, []);

  const fetchLeads = useCallback(async (token) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("prenotazioni_lista", { p_token: token });
    setLoading(false);
    if (error) return { error: error.message };
    setLeads((data || []).map(mapRow));
    try {
      const { data: ts } = await supabase.rpc("vendite_ultimo_sync", { p_token: token });
      setLastSync(ts ? new Date(ts) : null);
    } catch {}
    return { ok: true };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
        if (saved?.token) {
          const { data } = await supabase.rpc("venditore_me", { p_token: saved.token });
          if (data?.profilo) { setUser({ token: saved.token, ...data.profilo }); await Promise.all([fetchLeads(saved.token), fetchAccounts(saved.token, data.profilo.ruolo)]); }
          else localStorage.removeItem(STORE_KEY);
        }
      } catch {}
      setBooting(false);
    })();
  }, [fetchLeads, fetchAccounts]);

  const login = async (email, password) => {
    const { data, error } = await supabase.rpc("venditore_login", { p_email: email, p_password: password });
    if (error) return "Connessione non riuscita. Riprova.";
    if (data?.error) return data.error;
    localStorage.setItem(STORE_KEY, JSON.stringify({ token: data.token }));
    setUser({ token: data.token, ...data.profilo });
    await Promise.all([fetchLeads(data.token), fetchAccounts(data.token, data.profilo.ruolo)]);
    return null;
  };
  const logout = async () => {
    try { if (user?.ruolo !== "admin") await supabase.rpc("venditore_traccia", { p_token: user?.token, p_tipo: "uscita", p_dettaglio: {} }); } catch {}
    try { await supabase.rpc("venditore_logout", { p_token: user?.token }); } catch {}
    localStorage.removeItem(STORE_KEY); setUser(null); setLeads([]); setAccounts([]); setLastSync(null);
  };
  const refresh = () => user && fetchLeads(user.token);
  // chiamata a una funzione del database con il token della sessione
  const api = useCallback(async (fn, args = {}) => {
    const { data, error } = await supabase.rpc(fn, { p_token: user?.token, ...args });
    if (error) return { error: "Connessione non riuscita. Riprova." };
    return data;
  }, [user]);
  const updateUser = (profilo) => setUser((u) => ({ ...u, ...profilo }));
  const reloadAccounts = () => user && fetchAccounts(user.token, user.ruolo);
  return { booting, user, leads, loading, accounts, lastSync, login, logout, refresh, api, updateUser, reloadAccounts };
}
/* <<<DATA_LAYER_END>>> */

export default function App() {
  const dl = useDataLayer();
  return (
    <>
      <StyleTag />
      {dl.booting ? <Boot /> : dl.user ? <Panel dl={dl} /> : <Login onLogin={dl.login} />}
    </>
  );
}
function Boot() { return <div className="boot"><span className="logo-tile big"><img src="/icon-192.png" alt="" /></span><span>Carico…</span></div>; }

/* ---------------- LOGIN ---------------- */
function Login({ onLogin }) {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [hint, setHint] = useState(false);
  const submit = async () => { if (busy) return; setBusy(true); setErr(""); const e = await onLogin(email.trim(), pw); setBusy(false); if (e) setErr(e); };
  const onKey = (ev) => ev.key === "Enter" && submit();
  return (
    <div className="login">
      <section className="login-hero">
        <Logo light />
        <div className="hero-copy">
          <h1>Le tue vendite,<br /><span>in tempo reale.</span></h1>
          <p>Vedi chi ha prenotato col tuo codice, a che punto è ogni gruppo e quanto manca al prossimo obiettivo.</p>
        </div>
        <div className="hero-dest" aria-hidden>
          {META.map((m, i) => <span key={m.key} style={{ background: m.soft, color: m.ink, "--i": i }}>{m.short}</span>)}
        </div>
      </section>
      <section className="login-side">
        <div className="login-stack">
          <div className="login-card">
            <h2>Accedi</h2>
            <p className="login-sub">Usa l'email e la password che ti ha dato l'ufficio.</p>
            <label className="fld"><span>Email</span>
              <input value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} onKeyDown={onKey}
                placeholder="nome@invibe.it" type="email" autoComplete="username" /></label>
            <label className="fld"><span>Password</span>
              <input value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} onKeyDown={onKey}
                placeholder="••••••••" type="password" autoComplete="current-password" /></label>
            {err && <div className="login-err">{err}</div>}
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? "Accesso…" : <>Entra <ArrowRight size={17} /></>}</button>
            <button className="linkbtn" onClick={() => setHint(!hint)}>Password dimenticata?</button>
            {hint && <div className="hint">La password la assegna l'ufficio: scrivi a ufficio@invibe.it.</div>}
          </div>

        </div>
      </section>
    </div>
  );
}

/* ---------------- SHELL ---------------- */
const NAV = [
  { key: "dashboard", label: "Home", Icon: Home },
  { key: "funnel", label: "Funnel", Icon: Filter },
  { key: "prenotazioni", label: "Prenotazioni", short: "Gruppi", Icon: ListChecks },
  { key: "venditori", label: "Venditori", short: "PR", Icon: Trophy, admin: true },
  { key: "utenze", label: "Utenze", Icon: KeyRound, admin: true },
  { key: "cronologia", label: "Cronologia", short: "Storico", Icon: History, admin: true },
  { key: "profilo", label: "Profilo", Icon: UserRound, noTab: true },
];
function Panel({ dl }) {
  const { user, leads: allLeads, loading, logout, refresh, accounts, lastSync } = dl;
  const isAdmin = user.ruolo === "admin";
  const stagioni = useMemo(() => {
    const s = new Set(allLeads.map(stagioneDi).filter(Boolean));
    if (!s.size) s.add(new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear());
    return [...s].sort((a, b) => b - a);
  }, [allLeads]);
  const [stagione, setStagione] = useState(null);
  const stag = stagioni.includes(stagione) ? stagione : stagioni[0];
  // le richieste senza data restano nella stagione più recente
  const leads = useMemo(() => allLeads.filter((r) => (stagioneDi(r) ?? stagioni[0]) === stag), [allLeads, stag, stagioni]);
  const [view, setView] = useState("dashboard");
  const [jump, setJump] = useState(null);
  const [sel, setSel] = useState(null);
  const go = (v, opts) => { setJump(opts || null); setView(v); window.scrollTo?.({ top: 0 }); };
  // la cronologia dell'ufficio registra cosa guardano i PR (non l'ufficio)
  const traccia = dl.api;
  useEffect(() => { if (!isAdmin) traccia("venditore_traccia", { p_tipo: "vista", p_dettaglio: { pagina: view } }); }, [view, isAdmin, traccia]);
  const apri = (r) => { setSel(r); if (!isAdmin) traccia("venditore_traccia", { p_tipo: "scheda", p_dettaglio: { cod: r.cod, gruppo: r.nome } }); };
  const items = NAV.filter((n) => !n.admin || isAdmin);
  const titles = {
    dashboard: isAdmin ? "Panoramica" : "La tua stagione",
    funnel: "Funnel",
    prenotazioni: "Prenotazioni",
    venditori: "Venditori",
    utenze: "Utenze PR",
    cronologia: "Cronologia",
    profilo: isAdmin ? "Il tuo profilo" : "La tua area",
  };
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-top"><Logo /></div>
        <nav className="side-nav">
          {items.filter((n) => !n.noTab).map(({ key, label, Icon }) => (
            <button key={key} className={`snav ${view === key ? "on" : ""}`} onClick={() => go(key)}>
              <Icon size={18} /><span>{label}</span></button>
          ))}
        </nav>
        <div className="side-bottom">
          <button className={`ucard ${view === "profilo" ? "on" : ""}`} onClick={() => go("profilo")}>
            <Avatar name={user.nome || user.email} size={36} />
            <div className="uinfo"><b>{user.nome || user.email}</b><span>{isAdmin ? "Ufficio" : user.codice_pr}</span></div>
          </button>
          <button className="snav ghost" onClick={logout}><LogOut size={17} /><span>Esci</span></button>
        </div>
      </aside>

      <main className="main">
        <header className="top">
          <div className="top-left">
            <span className="top-logo"><span className="logo-tile sm"><img src="/icon-192.png" alt="" /></span></span>
            <div className="top-titles">
              <h1 className="top-h">{titles[view]}</h1>
              {lastSync && <span className="top-sync">Dati aggiornati alle {oraIt(lastSync)}</span>}
            </div>
          </div>
          <div className="top-right">
            {stagioni.length > 1 ? (
              <select className="season" value={stag} onChange={(e) => setStagione(+e.target.value)} aria-label="Stagione">
                {stagioni.map((s) => <option key={s} value={s}>Estate {s}</option>)}
              </select>
            ) : <span className="season static">Estate {stag}</span>}
            <span className="code-badge hide-mob">{isAdmin ? "Tutti i codici" : (user.codice_pr || "—")}</span>
            <button className="icon-btn" onClick={refresh} aria-label="Aggiorna">
              <RefreshCw size={16} className={loading ? "spin" : ""} /></button>
            <button className="me-btn mob-only" onClick={() => go("profilo")} aria-label="La tua area"><Avatar name={user.nome || user.email} size={34} /></button>
          </div>
        </header>
        <div className="content">
          {isAdmin && lastSync && Date.now() - lastSync.getTime() > 60 * 60000 && (
            <div className="sync-alert" role="alert">
              <b>Il Bloccaposti non si aggiorna da {Math.round((Date.now() - lastSync.getTime()) / 3600000)} ore.</b>
              <span>Controlla lo script "Sync Vendite Invibe" (account bobo.invibe) → Esecuzioni: l'ultimo aggiornamento è del {lastSync.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.</span>
            </div>
          )}
          {view === "dashboard" && <Dashboard leads={leads} isAdmin={isAdmin} user={user} loading={loading} go={go} onOpen={apri} stagione={stag} accounts={accounts} />}
          {view === "funnel" && <FunnelView leads={leads} isAdmin={isAdmin} onOpen={apri} />}
          {view === "prenotazioni" && <Prenotazioni leads={leads} isAdmin={isAdmin} initial={jump} onOpen={apri} />}
          {view === "venditori" && isAdmin && <Venditori leads={leads} accounts={accounts} />}
          {view === "cronologia" && isAdmin && <Cronologia api={dl.api} accounts={accounts} leads={allLeads} onOpen={apri} />}
          {view === "utenze" && isAdmin && <Utenze api={dl.api} onChange={dl.reloadAccounts} me={user} />}
          {view === "profilo" && <Profilo user={user} leads={leads} isAdmin={isAdmin} stagione={stag} api={dl.api} updateUser={dl.updateUser} logout={logout} onOpen={apri} go={go} />}
        </div>
      </main>

      <nav className="tabbar">
        {items.filter((n) => !n.noTab).map(({ key, label, Icon }) => (
          <button key={key} className={`tab ${view === key ? "on" : ""}`} onClick={() => go(key)}>
            <Icon size={20} /><span>{(isAdmin && NAV.find((n) => n.key === key).short) || label}</span></button>
        ))}
      </nav>
      {sel && <LeadSheet lead={sel} isAdmin={isAdmin} onClose={() => setSel(null)} />}
      {user.cambio_password && <PrimoAccesso user={user} api={dl.api} updateUser={dl.updateUser} logout={logout} />}
    </div>
  );
}

/* ---------------- DASHBOARD ---------------- */
function Dashboard({ leads, isAdmin, user, loading, go, onOpen, stagione, accounts }) {
  const s = useMemo(() => computeStats(leads), [leads]);
  const months = useMemo(() => computeMonths(leads), [leads]);
  const latest = useMemo(() => sortRecent(leads).slice(0, 6), [leads]);
  const piuFermo = useMemo(() => {
    const g = leads.filter((r) => DA_SOLLECITARE.includes(r.stage)).map(giorniFermo).filter(Boolean);
    return g.length ? g.reduce((a, b) => (b.gg > a.gg ? b : a)) : null;
  }, [leads]);
  if (leads.length === 0 && !loading) return <Empty user={user} />;
  const first = (user.nome || "").split(" ")[0];
  const now = new Date(); const thisKey = meseKey(now);
  const thisMonth = months.find((m) => m.key === thisKey);
  return (
    <div className="dash">
    <div className="stack">
      <section className="hero">
        <div className="hero-top">
          <div>
            <div className="hero-hi">{isAdmin ? "Ufficio Invibe" : `Ciao ${first || ""}`}</div>
            <div className="hero-n"><Num n={s.active} /><span>prenotazioni attive</span></div>
            <div className="hero-sub"><Num n={s.totPax} /> pax in gioco · {s.convPct}% confermate</div>
          </div>
          {stagione === (now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear()) ? (
            <div className="hero-month">
              <span>{MESI_LUNGHI[now.getMonth()]}</span>
              <b><Num n={thisMonth?.groups || 0} /></b>
              <em>nuove questo mese</em>
            </div>
          ) : (
            <div className="hero-month past">
              <span>Estate {stagione}</span>
              <b><Num n={s.confPax} /></b>
              <em>pax confermati</em>
            </div>
          )}
        </div>
        <div className="hero-stats">
          <button onClick={() => go("prenotazioni", { stage: 6 })}><b><Num n={s.confirmed} /></b><span>confermate</span></button>
          <button onClick={() => go("prenotazioni", { stages: IN_LAV, label: "In lavorazione" })}><b><Num n={s.working} /></b><span>in corso</span></button>
          <button onClick={() => go("prenotazioni", { stage: 7 })}><b><Num n={s.disdette} /></b><span>disdette</span></button>
        </div>
      </section>

      {s.sollecitare > 0 && (
        <button className="nudge" onClick={() => go("prenotazioni", { stages: DA_SOLLECITARE, label: "Da sollecitare" })}>
          <span className="nudge-ic"><BellRing size={18} /></span>
          <span className="nudge-t"><b>{s.sollecitare} {s.sollecitare === 1 ? "gruppo da sollecitare" : "gruppi da sollecitare"}</b>
            <em>hanno bloccato il posto ma non hanno ancora inviato la pratica{piuFermo && piuFermo.gg > 0 ? ` · il più vecchio è fermo ${testoFermo(piuFermo)}` : ""}</em></span>
          <ChevronRight size={18} />
        </button>
      )}

      {s.byMeta.length > 0 && (
        <section className="block">
          <div className="block-head"><h3>Destinazioni</h3></div>
          <div className="dest-row">
            {s.byMeta.map((m) => (
              <button key={m.meta} className="dest" style={{ background: metaInfo(m.meta).soft, color: metaInfo(m.meta).ink }}
                onClick={() => go("prenotazioni", { meta: m.meta })}>
                <span className="dest-name"><MapPin size={14} />{metaInfo(m.meta).short}</span>
                <b><Num n={m.groups} /></b><em>{m.pax} pax</em>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="grid2">
        <section className="card">
          <div className="block-head"><h3>Mese per mese</h3><span className="muted-s">prenotazioni attive</span></div>
          <MonthChart months={months} thisKey={thisKey} />
        </section>
        <section className="card">
          <div className="block-head"><h3>A che punto sono</h3>
            <button className="link" onClick={() => go("funnel")}>Funnel <ChevronRight size={14} /></button></div>
          <StageBars stats={s} onStage={(n) => go("prenotazioni", { stage: n })} />
        </section>
      </div>

      <section className="card">
        <div className="block-head"><h3>Ultime prenotazioni</h3>
          <button className="link" onClick={() => go("prenotazioni")}>Vedi tutte <ChevronRight size={14} /></button></div>
        <RowList rows={latest} isAdmin={isAdmin} onOpen={onOpen} />
      </section>
    </div>
    <DashRail leads={leads} isAdmin={isAdmin} accounts={accounts} go={go} onOpen={onOpen} />
    </div>
  );
}

/* colonna destra della home: chi va forte, chi chiamare, da dove arrivano */
function DashRail({ leads, isAdmin, accounts = [], go, onOpen }) {
  const topPR = useMemo(() => {
    if (!isAdmin) return [];
    const nomi = {}, canali = {};
    accounts.forEach((a) => { if (a.codice_pr) { nomi[a.codice_pr] = a.nome; if (a.ruolo === "canale") canali[a.codice_pr] = true; } });
    const m = {};
    leads.forEach((r) => {
      if (!ACTIVE.includes(r.stage) || !r.can || canali[r.can]) return;
      const d = m[r.can] = m[r.can] || { code: r.can, nome: nomi[r.can] || r.can, groups: 0, pax: 0 };
      d.groups++; d.pax += r.pax;
    });
    return Object.values(m).sort((a, b) => b.pax - a.pax || b.groups - a.groups).slice(0, 5);
  }, [leads, accounts, isAdmin]);
  const fermi = useMemo(() => leads.filter((r) => DA_SOLLECITARE.includes(r.stage))
    .map((r) => ({ r, g: giorniFermo(r) })).sort((a, b) => (b.g?.gg || 0) - (a.g?.gg || 0)), [leads]);
  const citta = useMemo(() => {
    const m = {};
    leads.forEach((r) => { if (ACTIVE.includes(r.stage) && r.city) { const k = r.city.trim(); m[k] = (m[k] || 0) + r.pax; } });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [leads]);
  const turni = useMemo(() => {
    const m = {};
    leads.forEach((r) => { if (ACTIVE.includes(r.stage) && r.turno) m[r.turno] = (m[r.turno] || 0) + r.pax; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [leads]);
  const maxTopPax = Math.max(1, ...topPR.map((d) => d.pax));
  const maxCity = Math.max(1, ...citta.map((c) => c[1]));
  const maxTurno = Math.max(1, ...turni.map((t) => t[1]));
  return (
    <aside className="rail">
      {isAdmin && topPR.length > 0 && (
        <section className="card">
          <div className="block-head"><h3>PR più forti</h3>
            <button className="link" onClick={() => go("venditori")}>Classifica <ChevronRight size={14} /></button></div>
          <div className="rlist">
            {topPR.map((d, i) => (
              <div className="rtop" key={d.code}>
                <span className={`rpos p${i + 1}`}>{i + 1}</span>
                <Avatar name={d.nome} size={34} />
                <span className="rtop-id"><b>{d.nome}</b>
                  <span className="rtop-bar"><span style={{ width: `${d.pax / maxTopPax * 100}%` }} /></span></span>
                <span className="rtop-n"><b>{d.pax}</b><em>{d.groups} gr.</em></span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="block-head"><h3>Da chiamare</h3>
          {fermi.length > 0 && <button className="link" onClick={() => go("prenotazioni", { stages: DA_SOLLECITARE, label: "Da sollecitare" })}>Tutti <ChevronRight size={14} /></button>}</div>
        {fermi.length === 0 ? <div className="rempty">Nessun gruppo fermo: tutte le pratiche sono partite.</div> : (
          <div className="rlist">
            {fermi.slice(0, 5).map(({ r, g }) => (
              <button className="rcall" key={r.cod} onClick={() => onOpen(r)}>
                <span className="rcall-id"><b>{r.nome || r.cod}</b><em>{r.cod}{isAdmin && r.can ? ` · ${r.can}` : ""}</em></span>
                <span className="rcall-g">{g ? (g.gg === 0 ? "oggi" : `${g.almeno ? "≥" : ""}${g.gg} gg`) : "—"}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {turni.length > 0 && (
        <section className="card">
          <div className="block-head"><h3>Pax per turno</h3><span className="muted-s">attivi</span></div>
          <div className="tbars">
            {turni.map(([t, n]) => (
              <div className="tbar" key={t}>
                <span className="tbar-v">{n}</span>
                <span className="tbar-c"><span style={{ height: `${n / maxTurno * 100}%` }} /></span>
                <span className="tbar-l">{t}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {citta.length > 0 && (
        <section className="card">
          <div className="block-head"><h3>Da dove partono</h3><span className="muted-s">pax attivi</span></div>
          <div className="rlist">
            {citta.map(([c, n]) => (
              <div className="rcity" key={c}>
                <span className="rcity-l">{c}</span>
                <span className="rcity-t"><span style={{ width: `${n / maxCity * 100}%` }} /></span>
                <b>{n}</b>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
function MonthChart({ months, thisKey }) {
  if (!months.length) return <div className="none">Ancora nessuna vendita da mostrare.</div>;
  const max = Math.max(1, ...months.map((m) => m.groups));
  return (
    <div className="mchart">
      {months.map((m) => {
        const cur = m.key === thisKey;
        return (
          <div className={`mbar ${cur ? "cur" : ""}`} key={m.key} title={`${MESI_LUNGHI[m.mo]} ${m.y}: ${m.groups} prenotazioni, ${m.pax} pax`}>
            <span className="mval">{m.groups || ""}</span>
            <span className="mcol"><span style={{ height: `${Math.max(m.groups ? 6 : 0, (m.groups / max) * 100)}%` }} /></span>
            <span className="mlab">{MESI[m.mo]}</span>
          </div>
        );
      })}
    </div>
  );
}
function StageBars({ stats, onStage, selected }) {
  const list = STAGES.filter((st) => st.n !== 0 || stats.byStage[0].groups > 0);
  const max = Math.max(1, ...list.map((st) => stats.byStage[st.n].groups));
  return (
    <div className="sbars">
      {list.map((st) => {
        const c = stats.byStage[st.n];
        return (
          <button key={st.n} className={`sbar ${selected === st.n ? "sel" : ""} ${c.groups === 0 ? "dim" : ""}`} onClick={() => onStage && onStage(st.n)}>
            <span className="sbar-l"><i style={{ background: st.color }} />{st.label}</span>
            <span className="sbar-t"><span style={{ width: `${(c.groups / max) * 100}%`, background: st.color }} /></span>
            <span className="sbar-v"><b><Num n={c.groups} /></b><em>{c.pax} pax</em></span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- FUNNEL ---------------- */
function FunnelView({ leads, isAdmin, onOpen }) {
  const [stage, setStage] = useState(null);
  const s = useMemo(() => computeStats(leads), [leads]);
  const rows = useMemo(() => sortRecent(stage == null ? leads : leads.filter((r) => r.stage === stage)), [leads, stage]);
  if (leads.length === 0) return <div className="none pad">Nessuna prenotazione.</div>;
  return (
    <div className="stack">
      <div className="stage-tabs">
        <button className={`stab ${stage == null ? "on" : ""}`} onClick={() => setStage(null)}>Tutti <b>{leads.length}</b></button>
        {STAGES.filter((st) => s.byStage[st.n].groups > 0).map((st) => (
          <button key={st.n} className={`stab ${stage === st.n ? "on" : ""}`} onClick={() => setStage(stage === st.n ? null : st.n)}
            style={stage === st.n ? { background: st.soft, color: st.ink, borderColor: st.color } : undefined}>
            <i style={{ background: st.color }} />{st.short} <b>{s.byStage[st.n].groups}</b>
          </button>
        ))}
      </div>
      <div className="grid2 funnel-grid">
        <section className="card hide-mob">
          <div className="block-head"><h3>Stadi</h3></div>
          <StageBars stats={s} selected={stage} onStage={(n) => setStage(stage === n ? null : n)} />
        </section>
        <section className="card">
          <div className="block-head"><h3>{rows.length} {rows.length === 1 ? "prenotazione" : "prenotazioni"}</h3>
            {stage != null && <StagePill n={stage} />}</div>
          <RowList rows={rows} isAdmin={isAdmin} onOpen={onOpen} />
        </section>
      </div>
    </div>
  );
}

/* ---------------- PRENOTAZIONI ---------------- */
function Prenotazioni({ leads, isAdmin, initial, onOpen }) {
  const blank = { meta: "", turno: "", stage: null, stages: null, label: "", q: "" };
  const fromJump = (j) => ({ ...blank, meta: j?.meta ?? "", stage: j?.stage ?? null, stages: j?.stages ?? null, label: j?.label ?? "" });
  const [f, setF] = useState(fromJump(initial));
  useEffect(() => { if (initial) setF(fromJump(initial)); }, [initial]);
  const turni = useMemo(() => [...new Set(leads.map((r) => r.turno).filter(Boolean))].sort(), [leads]);
  const perFermo = f.label === "Da sollecitare";
  const rows = useMemo(() => (perFermo ? (a) => [...a].sort((x, y) => (giorniFermo(y)?.gg ?? -1) - (giorniFermo(x)?.gg ?? -1)) : sortRecent)(leads.filter((r) => {
    if (f.meta && normMeta(r.meta) !== f.meta) return false;
    if (f.turno && r.turno !== f.turno) return false;
    if (f.stages && f.stages.length) { if (!f.stages.includes(r.stage)) return false; }
    else if (f.stage != null && r.stage !== f.stage) return false;
    if (f.q) { const q = f.q.toLowerCase(); if (!(`${r.cod} ${r.nome} ${r.can} ${r.city}`.toLowerCase().includes(q))) return false; }
    return true;
  })), [leads, f, perFermo]);
  const dirty = f.meta || f.turno || f.stage != null || (f.stages && f.stages.length) || f.q;
  if (leads.length === 0) return <div className="none pad">Nessuna prenotazione.</div>;
  return (
    <div className="stack">
      <div className="filters">
        <div className="search"><Search size={16} /><input placeholder="Cerca nome, codice o città"
          value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <div className="frow">
          <select value={f.meta} onChange={(e) => setF({ ...f, meta: e.target.value })}>
            <option value="">Tutte le mete</option>{META.map((m) => <option key={m.key} value={m.key}>{m.short}</option>)}</select>
          <select value={f.turno} onChange={(e) => setF({ ...f, turno: e.target.value })}>
            <option value="">Tutti i turni</option>{turni.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <select value={f.stage ?? ""} onChange={(e) => setF({ ...f, stage: e.target.value === "" ? null : +e.target.value, stages: null, label: "" })}>
            <option value="">Tutti gli stati</option>{STAGES.map((st) => <option key={st.n} value={st.n}>{st.short}</option>)}</select>
        </div>
        {(f.label || dirty) && (
          <div className="frow chips-row">
            {f.stages && f.label && <span className="fchip">{f.label}<button onClick={() => setF({ ...f, stages: null, label: "" })} aria-label="Rimuovi filtro"><X size={13} /></button></span>}
            {dirty && <button className="clear" onClick={() => setF(blank)}>Azzera filtri</button>}
          </div>
        )}
      </div>
      <section className="card">
        <div className="block-head"><h3>{rows.length} {rows.length === 1 ? "prenotazione" : "prenotazioni"}</h3>
          <span className="muted-s">{rows.reduce((a, r) => a + r.pax, 0).toLocaleString("it-IT")} pax</span></div>
        <RowList rows={rows} isAdmin={isAdmin} onOpen={onOpen} showFermo={perFermo} />
      </section>
    </div>
  );
}
function RowList({ rows, isAdmin, onOpen, showFermo }) {
  if (rows.length === 0) return <div className="none pad">Nessuna prenotazione con questi filtri.</div>;
  return (
    <div className="rows">
      {rows.slice(0, 300).map((r, i) => (
        <button key={r.cod + i} className="row" onClick={() => onOpen(r)}>
          <Avatar name={r.nome || r.cod} size={38} />
          <span className="row-main">
            <span className="row-name">{r.nome || "—"} <em>{r.cod}</em></span>
            <span className="row-meta">
              <MetaChip meta={r.meta} />
              {r.turno && <span className="tchip">{r.turno}</span>}
              {isAdmin && r.can && <span className="tchip pr">{r.can}</span>}
              {showFermo && giorniFermo(r) && <span className="tchip fermo">fermo {testoFermo(giorniFermo(r))}</span>}
            </span>
          </span>
          <span className="row-right">
            <span className="row-pax"><b>{r.pax}</b> pax</span>
            <StagePill n={r.stage} />
          </span>
        </button>
      ))}
      {rows.length > 300 && <div className="more">Altre {rows.length - 300}: restringi con i filtri</div>}
    </div>
  );
}
function Empty({ user }) {
  return (
    <div className="empty">
      <span className="empty-ic"><Sparkles size={24} /></span>
      <h3>La stagione parte da te</h3>
      <p>Appena un cliente prenota col codice <b>{user.codice_pr}</b>, lo vedi qui con il suo stato.</p>
    </div>
  );
}

/* ---------------- VENDITORI (ufficio) ---------------- */
function Venditori({ leads, accounts = [] }) {
  const [sort, setSort] = useState("groups");
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [selected, setSelected] = useState(null);

  const data = useMemo(() => {
    const m = {};
    accounts.filter((a) => a.ruolo !== "admin" && a.codice_pr).forEach((a) => {
      m[a.codice_pr] = { code: a.codice_pr, nome: a.nome, canale: a.ruolo === "canale", groups: 0, pax: 0, conf: 0, confPax: 0, working: 0, disdette: 0 };
    });
    leads.forEach((r) => {
      const k = r.can || "—";
      if (!m[k]) m[k] = { code: k, nome: k, canale: false, groups: 0, pax: 0, conf: 0, confPax: 0, working: 0, disdette: 0 };
      m[k].groups++; m[k].pax += r.pax;
      if (r.stage === 6) { m[k].conf++; m[k].confPax += r.pax; }
      else if (r.stage === 7) m[k].disdette++;
      else if (IN_LAV.includes(r.stage)) m[k].working++;
    });
    Object.values(m).forEach((d) => { d.conv = d.groups ? Math.round(d.conf / d.groups * 100) : 0; });
    return Object.values(m);
  }, [leads, accounts]);

  const key = sort === "pax" ? "pax" : sort === "conf" ? "conf" : "groups";
  const ranked = useMemo(() => [...data].sort((x, y) => y[key] - x[key] || y.groups - x.groups), [data, key]);
  // il podio è per i venditori: i canali (Social, Scuole) restano in elenco
  const podium = ranked.filter((d) => !d.canale && d[key] > 0).slice(0, 3);
  const view = useMemo(() => {
    let a = ranked;
    if (onlyActive) a = a.filter((d) => d.groups > 0);
    if (q) a = a.filter((d) => `${d.code} ${d.nome}`.toLowerCase().includes(q.toLowerCase()));
    return a;
  }, [ranked, q, onlyActive]);
  const maxG = Math.max(1, ...data.map((d) => d.groups));
  const tot = data.reduce((a, d) => ({ g: a.g + d.groups, p: a.p + d.pax, c: a.c + d.conf }), { g: 0, p: 0, c: 0 });
  const attivi = data.filter((d) => d.groups > 0).length;
  const unit = key === "pax" ? "pax" : key === "conf" ? "confermate" : "prenotazioni";

  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi"><b><Num n={attivi} /></b><span>PR con prenotazioni</span><em>su {data.length}</em></div>
        <div className="kpi"><b><Num n={tot.g} /></b><span>prenotazioni</span></div>
        <div className="kpi"><b><Num n={tot.p} /></b><span>pax</span></div>
        <div className="kpi"><b className="tx-green"><Num n={tot.c} /></b><span>confermate</span><em>{tot.g ? Math.round(tot.c / tot.g * 100) : 0}%</em></div>
      </div>

      {podium.length > 0 && !q && (
        <section className="podium">
          {[1, 0, 2].map((idx) => podium[idx] && (
            <button key={podium[idx].code} className={`pod p${idx + 1}`} onClick={() => setSelected(podium[idx].code)}>
              {idx === 0 && <Crown size={18} className="crown" />}
              <Avatar name={podium[idx].nome} size={idx === 0 ? 56 : 46} />
              <span className="pod-name">{podium[idx].nome}</span>
              <span className="pod-code">{podium[idx].code}</span>
              <span className="pod-step"><b>{podium[idx][key]}</b><em>{unit}</em><i>{idx + 1}</i></span>
            </button>
          ))}
        </section>
      )}

      <div className="filters">
        <div className="search"><Search size={16} /><input placeholder="Cerca PR per nome o codice"
          value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="frow">
          <div className="seg">
            {[["groups", "Prenotazioni"], ["pax", "Pax"], ["conf", "Confermate"]].map(([k, l]) => (
              <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{l}</button>
            ))}
          </div>
          <button className={`toggle ${onlyActive ? "on" : ""}`} onClick={() => setOnlyActive(!onlyActive)}>
            {onlyActive ? "Solo chi ha prenotato" : "Tutti i PR"}</button>
        </div>
      </div>

      <section className="card flush">
        <div className="vlegend">
          <span><i style={{ background: "#16A34A" }} />Confermate</span>
          <span><i style={{ background: "#F59E0B" }} />In corso</span>
          <span><i style={{ background: "#DC2626" }} />Disdette</span>
        </div>
        <div className="vlist">
          {view.map((d) => {
            const pos = ranked.indexOf(d) + 1;
            return (
              <button className={`vrow ${d.groups === 0 ? "zero" : ""}`} key={d.code}
                onClick={() => d.groups > 0 && setSelected(d.code)}>
                <span className={`vrank ${pos <= 3 && d.groups > 0 ? "hi" : ""}`}>{pos}</span>
                <Avatar name={d.nome} size={40} />
                <span className="vid">
                  <span className="vname">{d.nome}{d.canale && <span className="vtag">canale</span>}</span>
                  <span className="vcode">{d.code}</span>
                  <span className="vbar">
                    <span style={{ width: `${d.conf / maxG * 100}%`, background: "#16A34A" }} />
                    <span style={{ width: `${d.working / maxG * 100}%`, background: "#F59E0B" }} />
                    <span style={{ width: `${d.disdette / maxG * 100}%`, background: "#DC2626" }} />
                  </span>
                </span>
                <span className="vnums">
                  <span><b>{d.groups}</b><em>prenot.</em></span>
                  <span className="hide-mob"><b>{d.pax}</b><em>pax</em></span>
                  <span className="hide-mob"><b className="tx-green">{d.conv}%</b><em>conv.</em></span>
                </span>
                {d.groups > 0 && <ChevronRight size={16} className="vchev" />}
              </button>
            );
          })}
          {view.length === 0 && <div className="none pad">Nessun PR con questi filtri.</div>}
        </div>
      </section>

      {selected && (
        <VenditoreSheet info={data.find((d) => d.code === selected)}
          leads={leads.filter((r) => r.can === selected)} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

/* ---------------- AREA PERSONALE ---------------- */
async function copiaTesto(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try { const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); return true; } catch { return false; }
}
function Copiabile({ text, label = "Copia", className = "copy-btn" }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => { if (await copiaTesto(text)) { setOk(true); setTimeout(() => setOk(false), 1600); } }}>
      {ok ? <Check size={15} /> : <Copy size={15} />}<span>{ok ? "Copiato" : label}</span>
    </button>
  );
}
const mesePrima = (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1);

function Profilo({ user, leads, isAdmin, stagione, api, updateUser, logout, go }) {
  const s = useMemo(() => computeStats(leads), [leads]);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (isAdmin) return;
    let on = true;
    api("venditore_posizione", { p_stagione: stagione }).then((d) => on && setPos(d && !d.error ? d : null));
    return () => { on = false; };
  }, [api, stagione, isAdmin, leads]);
  const now = new Date();
  const paxMese = useMemo(() => {
    const m = {};
    leads.forEach((r) => { if (!ACTIVE.includes(r.stage)) return; const d = parseData(r.data); if (d) m[meseKey(d)] = (m[meseKey(d)] || 0) + r.pax; });
    return m;
  }, [leads]);
  const questo = paxMese[meseKey(now)] || 0, scorso = paxMese[meseKey(mesePrima(now))] || 0, delta = questo - scorso;
  const maxMeta = Math.max(1, ...s.byMeta.map((m) => m.pax));
  const inClassifica = pos && pos.mio > 0;

  return (
    <div className="stack">
      <section className="phero">
        <div className="phero-id">
          <span className="phero-av"><Avatar name={user.nome || user.email} size={92} /></span>
          <div className="phero-txt">
            <span className="phero-kick">{isAdmin ? "Ufficio Invibe" : "PR Invibe"} · Estate {stagione}</span>
            <h2>{user.nome || user.email}</h2>
            {!isAdmin && user.codice_pr && (
              <div className="phero-code">
                <span>il tuo codice</span><b>{user.codice_pr}</b>
                <Copiabile text={user.codice_pr} className="phero-copy" />
              </div>
            )}
          </div>
        </div>
        {!isAdmin && (
          <div className="phero-big">
            <b><Num n={s.totPax} /></b><span>pax in gioco</span>
            {inClassifica && <em><Medal size={14} /> {pos.pos}° in classifica</em>}
          </div>
        )}
      </section>

      {!isAdmin && (
        <>
          <div className="pstats">
            <div className="pstat"><span>Prenotazioni attive</span><b><Num n={s.active} /></b><em>{s.working} ancora in corso</em></div>
            <div className="pstat ok"><span>Confermate</span><b><Num n={s.confirmed} /></b><em>{s.confPax} pax confermati</em></div>
            <div className="pstat"><span>Conversione</span><b>{s.convPct}<small>%</small></b><em>prenotazioni diventate pratiche</em></div>
            <div className="pstat hot"><span>{MESI_LUNGHI[now.getMonth()]}</span><b><Num n={questo} /><small> pax</small></b>
              <em>{delta === 0 ? `come ${MESI_LUNGHI[mesePrima(now).getMonth()]}` : `${delta > 0 ? "+" : ""}${delta} rispetto a ${MESI_LUNGHI[mesePrima(now).getMonth()]}`}</em></div>
          </div>

          <div className="grid2">
            <section className="card prank">
              <div className="block-head"><h3>La tua classifica</h3><Trophy size={18} className="prank-ic" /></div>
              {inClassifica ? (
                <>
                  <div className="prank-row">
                    <div className="prank-n"><small>#</small>{pos.pos}</div>
                    <div className="prank-t"><b>su {pos.attivi} PR</b><span>con prenotazioni in Estate {stagione}</span></div>
                  </div>
                  <div className="prank-bar"><span style={{ width: `${Math.min(100, pos.mio / Math.max(1, pos.primo) * 100)}%` }} /></div>
                  <p className="prank-msg">{pos.pos === 1 ? "Sei in testa. Ora tienitela stretta." :
                    <>Ti mancano <b>{pos.distacco} pax</b> per superare chi ti sta davanti.</>}</p>
                </>
              ) : (
                <p className="prank-msg">Non sei ancora in classifica: alla prima prenotazione ci entri.</p>
              )}
            </section>
            <section className="card">
              <div className="block-head"><h3>Le tue mete</h3><span className="muted-s">pax in gioco</span></div>
              {s.byMeta.length === 0 ? <div className="none">Ancora nessuna prenotazione.</div> : (
                <div className="pmete">
                  {s.byMeta.map((m) => { const mi = metaInfo(m.meta); return (
                    <div className="pmeta" key={m.meta}>
                      <span className="pmeta-l" style={{ color: mi.ink }}><MapPin size={14} />{mi.short}</span>
                      <span className="pmeta-t"><span style={{ width: `${m.pax / maxMeta * 100}%`, background: mi.dot }} /></span>
                      <b>{m.pax}</b>
                    </div>); })}
                </div>
              )}
            </section>
          </div>

          {s.sollecitare > 0 && (
            <button className="nudge" onClick={() => go("prenotazioni", { stages: DA_SOLLECITARE, label: "Da sollecitare" })}>
              <span className="nudge-ic"><BellRing size={18} /></span>
              <span className="nudge-t"><b>{s.sollecitare} {s.sollecitare === 1 ? "gruppo aspetta" : "gruppi aspettano"} una tua chiamata</b>
                <em>hanno bloccato il posto ma non hanno ancora inviato la pratica</em></span>
              <ChevronRight size={18} />
            </button>
          )}
        </>
      )}

      <div className="grid2">
        <DatiPersonali user={user} api={api} updateUser={updateUser} />
        <section className="card">
          <div className="block-head"><h3>Password</h3><Lock size={17} className="muted-ic" /></div>
          <CambiaPassword api={api} updateUser={updateUser} />
        </section>
      </div>
      <button className="btn-out" onClick={logout}><LogOut size={16} />Esci dall'app</button>
    </div>
  );
}

function DatiPersonali({ user, api, updateUser }) {
  const [f, setF] = useState({ telefono: user.telefono || "", instagram: user.instagram || "", citta: user.citta || "" });
  const [st, setSt] = useState(null);
  const cambiato = f.telefono !== (user.telefono || "") || f.instagram !== (user.instagram || "") || f.citta !== (user.citta || "");
  const salva = async (e) => {
    e.preventDefault(); setSt("…");
    const d = await api("venditore_aggiorna_profilo", { p_telefono: f.telefono, p_instagram: f.instagram, p_citta: f.citta });
    if (d?.profilo) { updateUser(d.profilo); setF({ telefono: d.profilo.telefono || "", instagram: d.profilo.instagram || "", citta: d.profilo.citta || "" }); setSt("ok"); }
    else setSt(d?.error || "Non sono riuscito a salvare.");
  };
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setSt(null); };
  return (
    <section className="card">
      <div className="block-head"><h3>I tuoi dati</h3><UserRound size={17} className="muted-ic" /></div>
      <form onSubmit={salva} className="pform">
        <div className="pline"><Mail size={16} /><span><em>Email di accesso</em><b>{user.email}</b></span></div>
        <label className="pfld"><Phone size={16} /><span><em>Telefono</em><input value={f.telefono} onChange={set("telefono")} inputMode="tel" placeholder="Es. 333 123 4567" /></span></label>
        <label className="pfld"><AtSign size={16} /><span><em>Instagram</em><input value={f.instagram} onChange={set("instagram")} placeholder="il tuo profilo" autoCapitalize="none" /></span></label>
        <label className="pfld"><MapPin size={16} /><span><em>Città</em><input value={f.citta} onChange={set("citta")} placeholder="Dove vivi" /></span></label>
        {st && st !== "…" && st !== "ok" && <div className="login-err">{st}</div>}
        <button className="btn-primary" disabled={!cambiato || st === "…"}>
          {st === "ok" && !cambiato ? <><Check size={16} />Salvato</> : st === "…" ? "Salvo…" : "Salva i dati"}</button>
        <p className="pnote">Per cambiare email o codice scrivi all'ufficio.</p>
      </form>
    </section>
  );
}

function CambiaPassword({ api, updateUser, primo }) {
  const [f, setF] = useState({ a: "", n: "", c: "" });
  const [st, setSt] = useState(null);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setSt(null); };
  const invia = async (e) => {
    e.preventDefault();
    if (f.n.length < 8) return setSt("La nuova password deve avere almeno 8 caratteri.");
    if (f.n !== f.c) return setSt("Le due password nuove non coincidono.");
    setSt("…");
    const d = await api("venditore_cambia_password", { p_attuale: f.a, p_nuova: f.n });
    if (d?.ok) { setF({ a: "", n: "", c: "" }); setSt("ok"); updateUser(d.profilo); }
    else setSt(d?.error || "Non sono riuscito a cambiarla.");
  };
  return (
    <form onSubmit={invia} className="pform">
      <label className="fld"><span>{primo ? "Password provvisoria (quella che ti abbiamo mandato)" : "Password attuale"}</span>
        <input type="password" value={f.a} onChange={set("a")} autoComplete="current-password" required /></label>
      <label className="fld"><span>Nuova password (almeno 8 caratteri)</span>
        <input type="password" value={f.n} onChange={set("n")} autoComplete="new-password" required /></label>
      <label className="fld"><span>Ripeti la nuova password</span>
        <input type="password" value={f.c} onChange={set("c")} autoComplete="new-password" required /></label>
      {st && st !== "…" && st !== "ok" && <div className="login-err">{st}</div>}
      {st === "ok" && <div className="pok"><ShieldCheck size={16} />Password cambiata. Gli altri dispositivi dovranno rientrare.</div>}
      <button className="btn-primary" disabled={st === "…"}>{st === "…" ? "Cambio…" : primo ? "Scegli e entra" : "Cambia password"}</button>
    </form>
  );
}

function PrimoAccesso({ user, api, updateUser, logout }) {
  return (
    <div className="first">
      <div className="first-card">
        <span className="logo-tile big"><img src="/icon-192.png" alt="" /></span>
        <h2>Ciao {(user.nome || "").split(" ")[0]}!</h2>
        <p>La password che hai usato è provvisoria. Scegline una tua: da qui in poi entri con quella.</p>
        <CambiaPassword api={api} updateUser={updateUser} primo />
        <button className="linkbtn" onClick={logout}>Esci</button>
      </div>
    </div>
  );
}

/* ---------------- UTENZE (ufficio) ---------------- */
const RUOLI = [["venditore", "PR"], ["canale", "Canale (Social, Scuole)"], ["admin", "Ufficio"]];
function quando(ts) {
  if (!ts) return "mai entrato";
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / GIORNO);
  return d <= 0 ? "entrato oggi" : d === 1 ? "entrato ieri" : `entrato ${d} giorni fa`;
}
const FILTRI_U = [
  ["attive", "Attive", (u) => u.attivo],
  ["mai", "Mai entrati", (u) => u.attivo && !u.ultimo_accesso],
  ["provv", "Password provvisoria", (u) => u.attivo && u.cambio_password],
  ["off", "Disattivate", (u) => !u.attivo],
];
function Utenze({ api, onChange, me }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState("attive");
  const [edit, setEdit] = useState(null);
  const load = useCallback(async () => { const d = await api("venditori_admin_lista"); setList(Array.isArray(d) ? d : []); }, [api]);
  useEffect(() => { load(); }, [load]);
  const view = useMemo(() => {
    if (!list) return [];
    const fn = FILTRI_U.find((x) => x[0] === f)[2];
    const qq = q.trim().toLowerCase();
    return list.filter(fn).filter((u) => !qq || `${u.nome} ${u.email} ${u.codice_pr || ""} ${u.telefono || ""}`.toLowerCase().includes(qq));
  }, [list, f, q]);
  if (!list) return <div className="none pad">Carico le utenze…</div>;
  const conta = (fn) => list.filter(fn).length;
  return (
    <div className="stack">
      <div className="kpis">
        {FILTRI_U.map(([k, l, fn]) => (
          <button key={k} className={`kpi kbtn ${f === k ? "on" : ""}`} onClick={() => setF(k)}>
            <b>{conta(fn)}</b><span>{l === "Attive" ? "utenze attive" : l.toLowerCase()}</span></button>
        ))}
      </div>
      <div className="frow ubar">
        <div className="search grow"><Search size={16} /><input placeholder="Cerca per nome, email, codice o telefono" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn-new" onClick={() => setEdit({ ruolo: "venditore", attivo: true })}><Plus size={17} />Nuovo PR</button>
      </div>
      <section className="card flush">
        <div className="vlist">
          {view.map((u) => (
            <button key={u.id} className={`urow ${u.attivo ? "" : "off"}`} onClick={() => setEdit(u)}>
              <Avatar name={u.nome} size={40} />
              <span className="vid">
                <span className="vname">{u.nome}
                  {u.codice_pr && <span className="ucode">{u.codice_pr}</span>}
                  {u.ruolo !== "venditore" && <span className="vtag">{u.ruolo === "admin" ? "ufficio" : "canale"}</span>}</span>
                <span className="uemail">{u.email}{u.telefono ? ` · ${u.telefono}` : ""}</span>
              </span>
              <span className="ustate">
                {!u.attivo ? <span className="ust off">disattivata</span>
                  : u.cambio_password ? <span className="ust warn">password provvisoria</span>
                  : u.ultimo_accesso ? <span className="ust ok">attiva</span> : <span className="ust">da attivare</span>}
                <em>{quando(u.ultimo_accesso)}</em>
              </span>
              <ChevronRight size={16} className="vchev" />
            </button>
          ))}
          {view.length === 0 && <div className="none pad">Nessuna utenza con questi filtri.</div>}
        </div>
      </section>
      <p className="pnote">Le password non si possono leggere, nemmeno dall'ufficio: si genera una password provvisoria nuova, il PR la usa una volta e poi ne sceglie una sua.</p>
      {edit && <UtenzaSheet u={edit} api={api} me={me} onClose={() => setEdit(null)} onSaved={() => { load(); onChange?.(); }} />}
    </div>
  );
}

function messaggioAccesso(c) {
  return `Ciao ${(c.nome || "").split(" ")[0]}! Ecco il tuo accesso all'app Vendite Invibe: ${window.location.origin}\n\nEmail: ${c.email}\nPassword provvisoria: ${c.password}\n\nAl primo accesso ti chiede di sceglierne una tua. Dalla schermata Home puoi aggiungerla al telefono come un'app.`;
}
function waLink(tel, text) {
  let n = (tel || "").replace(/\D/g, "");
  if (!n) return null;
  if (n.startsWith("00")) n = n.slice(2);
  else if (n.length === 10 && n.startsWith("3")) n = "39" + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
function Credenziali({ c }) {
  const msg = messaggioAccesso(c);
  const wa = waLink(c.telefono, msg);
  return (
    <div className="cred">
      <div className="cred-head"><KeyRound size={18} /><b>Accesso pronto da mandare</b></div>
      <div className="cred-row"><span>Email</span><b>{c.email}</b></div>
      <div className="cred-row big"><span>Password provvisoria</span><b>{c.password}</b></div>
      <div className="cred-btns">
        <Copiabile text={msg} label="Copia messaggio" className="btn-primary" />
        {wa && <a className="btn-wa" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={16} />Manda su WhatsApp</a>}
      </div>
      <p className="cred-note">La password si vede solo adesso: copiala o mandala prima di chiudere.</p>
    </div>
  );
}

function UtenzaSheet({ u, api, me, onClose, onSaved }) {
  const nuovo = !u.id;
  const [f, setF] = useState({ nome: u.nome || "", email: u.email || "", codice_pr: u.codice_pr || "", ruolo: u.ruolo || "venditore", telefono: u.telefono || "", attivo: u.attivo !== false });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cred, setCred] = useState(null);
  const [conferma, setConferma] = useState(false);
  const isMe = u.id && u.id === me.id;
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }); setErr(null); };
  const salva = async (e) => {
    e.preventDefault(); setBusy(true);
    const d = await api("venditore_admin_salva", { p_id: u.id || null, p_nome: f.nome, p_email: f.email, p_codice_pr: f.codice_pr,
      p_ruolo: f.ruolo, p_telefono: f.telefono, p_attivo: f.attivo });
    setBusy(false);
    if (!d?.ok) return setErr(d?.error || "Non sono riuscito a salvare.");
    onSaved();
    if (d.password) setCred({ nome: f.nome, email: f.email.trim().toLowerCase(), password: d.password, telefono: f.telefono });
    else onClose();
  };
  const reset = async () => {
    setBusy(true);
    const d = await api("venditore_admin_reset_password", { p_id: u.id });
    setBusy(false); setConferma(false);
    if (!d?.ok) return setErr(d?.error || "Non sono riuscito a generarla.");
    setCred({ nome: d.nome, email: d.email, password: d.password, telefono: f.telefono }); onSaved();
  };
  return (
    <Sheet onClose={onClose}>
      <div className="sh-head">
        <Avatar name={f.nome || "?"} size={52} />
        <div><h2>{nuovo ? "Nuovo PR" : f.nome}</h2>
          {!nuovo && <span className="muted-s">{quando(u.ultimo_accesso)}{u.cambio_password ? " · password provvisoria" : ""}</span>}</div>
      </div>
      {cred ? (
        <>
          <Credenziali c={cred} />
          <button className="btn-out" onClick={onClose}>Fatto</button>
        </>
      ) : (
        <form onSubmit={salva} className="pform">
          <label className="fld"><span>Nome e cognome</span><input value={f.nome} onChange={set("nome")} required /></label>
          <label className="fld"><span>Email (serve per entrare)</span><input type="email" value={f.email} onChange={set("email")} autoCapitalize="none" required /></label>
          <div className="fld2">
            <label className="fld"><span>Codice PR</span><input value={f.codice_pr} onChange={set("codice_pr")} placeholder="es. EJ4" autoCapitalize="characters" disabled={f.ruolo === "admin"} /></label>
            <label className="fld"><span>Ruolo</span>
              <select value={f.ruolo} onChange={set("ruolo")} disabled={isMe}>{RUOLI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          <label className="fld"><span>Telefono (per mandargli l'accesso su WhatsApp)</span><input value={f.telefono} onChange={set("telefono")} inputMode="tel" /></label>
          {!nuovo && !isMe && (
            <label className="switch"><input type="checkbox" checked={f.attivo} onChange={set("attivo")} />
              <span className="switch-ui" /><span>{f.attivo ? "Può entrare nell'app" : "Accesso disattivato"}</span></label>
          )}
          {f.codice_pr && f.ruolo !== "admin" && (
            <p className="pnote">Vede solo le prenotazioni col codice <b>{f.codice_pr.toUpperCase()}</b> nella colonna Canale del Bloccaposti.</p>
          )}
          {err && <div className="login-err">{err}</div>}
          <button className="btn-primary" disabled={busy}>{busy ? "Salvo…" : nuovo ? "Crea e genera la password" : "Salva le modifiche"}</button>
          {!nuovo && !isMe && f.attivo && (
            conferma ? (
              <div className="confirm">
                <span>La password attuale smette di funzionare e il PR viene scollegato. Procedo?</span>
                <div><button type="button" className="btn-out sm" onClick={() => setConferma(false)}>Annulla</button>
                  <button type="button" className="btn-warn" onClick={reset} disabled={busy}>Sì, genera</button></div>
              </div>
            ) : (
              <button type="button" className="btn-out" onClick={() => setConferma(true)}><KeyRound size={16} />Genera nuova password</button>
            )
          )}
        </form>
      )}
    </Sheet>
  );
}

/* ---------------- CRONOLOGIA (ufficio) ---------------- */
const CATEGORIE = [
  [null, "Tutto"], ["accessi", "Accessi"], ["navigazione", "Cosa guardano"], ["vendite", "Vendite"], ["profilo", "Profilo e password"], ["ufficio", "Ufficio"],
];
const CAT_STILE = {
  accessi: { Icon: LogIn, bg: "#E3EEFF", fg: "#1247B1" },
  navigazione: { Icon: Eye, bg: "#F1F5F9", fg: "#475569" },
  vendite: { Icon: TrendingUp, bg: "#DCFCE7", fg: "#166534" },
  profilo: { Icon: PenLine, bg: "#FCE7F3", fg: "#9D174D" },
  ufficio: { Icon: KeyRound, bg: "#FFEDD5", fg: "#9A3412" },
  allarme: { Icon: ShieldAlert, bg: "#FEE2E2", fg: "#991B1B" },
};
const PAGINE = { dashboard: "la Home", funnel: "il Funnel", prenotazioni: "le prenotazioni", profilo: "la sua area personale" };
function giornoLabel(d) {
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const g = new Date(d); g.setHours(0, 0, 0, 0);
  const diff = Math.round((oggi - g) / GIORNO);
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Ieri";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}
function frase(e) {
  const chi = <b>{e.nome || e.codice_pr || "Utenza eliminata"}</b>;
  const d = e.dettaglio || {};
  const campi = (d.campi || []).join(", ");
  switch (e.tipo) {
    case "accesso": return <>{chi} è entrato nell'app{d.provvisoria ? " con la password provvisoria" : ""}</>;
    case "apertura": return <>{chi} ha aperto l'app</>;
    case "uscita": return <>{chi} è uscito dall'app</>;
    case "accesso_fallito": return <>{chi} ha provato a entrare con la password sbagliata</>;
    case "accesso_bloccato": return <>{chi} ha provato a entrare ma la sua utenza è disattivata</>;
    case "vista": return <>{chi} ha guardato {PAGINE[d.pagina] || d.pagina}</>;
    case "scheda": return <>{chi} ha aperto il gruppo <b className="tl-cap">{d.gruppo || ""}</b> <span className="tl-cod">{d.cod}</span></>;
    case "profilo": return <>{chi} ha aggiornato {campi || "il profilo"}</>;
    case "password_cambiata": return d.primo_accesso ? <>{chi} ha scelto la sua password (primo accesso)</> : <>{chi} ha cambiato la password</>;
    case "utenza_creata": return <>{e.autore || "L'ufficio"} ha creato l'utenza di {chi}{d.codice ? ` (${d.codice})` : ""}</>;
    case "utenza_modificata": return <>{e.autore || "L'ufficio"} ha modificato {campi} di {chi}</>;
    case "utenza_disattivata": return <>{e.autore || "L'ufficio"} ha disattivato l'utenza di {chi}</>;
    case "utenza_riattivata": return <>{e.autore || "L'ufficio"} ha riattivato l'utenza di {chi}</>;
    case "password_generata": return <>{e.autore || "L'ufficio"} ha generato una nuova password per {chi}</>;
    case "vendita_nuova": return <>Nuova prenotazione di {chi}: <b className="tl-cap">{d.gruppo}</b> · {d.pax} pax · {metaInfo(d.meta).short}</>;
    case "vendita_stato": return <>{chi}: <b className="tl-cap">{d.gruppo}</b> passa da {stageOf(d.da).short.toLowerCase()} a <b>{stageOf(d.a).short.toLowerCase()}</b></>;
    default: return <>{chi}: {e.tipo}</>;
  }
}
function Cronologia({ api, accounts = [], leads = [], onOpen }) {
  const [cat, setCat] = useState(null);
  const [cod, setCod] = useState("");
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rie, setRie] = useState(null);
  const LIM = 80;
  const load = useCallback(async (prima) => {
    setBusy(true);
    const d = await api("cronologia_lista", { p_prima: prima || null, p_codice: cod || null, p_categoria: cat, p_limite: LIM });
    const rows = Array.isArray(d) ? d : [];
    setItems((old) => (prima ? [...(old || []), ...rows] : rows));
    setMore(rows.length === LIM);
    setBusy(false);
  }, [api, cat, cod]);
  useEffect(() => { setItems(null); load(null); }, [load]);
  useEffect(() => { api("cronologia_riepilogo").then((d) => d && !d.error && setRie(d)); }, [api]);
  const perCod = useMemo(() => { const m = {}; leads.forEach((r) => { m[r.cod] = r; }); return m; }, [leads]);
  const persone = useMemo(() => accounts.filter((a) => a.codice_pr).sort((a, b) => (a.nome || "").localeCompare(b.nome || "")), [accounts]);
  const gruppi = useMemo(() => {
    const out = [];
    (items || []).forEach((e) => {
      const d = new Date(e.quando); const k = d.toDateString();
      if (!out.length || out[out.length - 1].k !== k) out.push({ k, label: giornoLabel(d), rows: [] });
      out[out.length - 1].rows.push(e);
    });
    return out;
  }, [items]);
  return (
    <div className="stack">
      {rie && (
        <div className="kpis">
          <div className="kpi"><b><Num n={rie.pr_oggi} /></b><span>PR entrati oggi</span></div>
          <div className="kpi"><b><Num n={rie.pr_7gg} /></b><span>PR attivi negli ultimi 7 giorni</span></div>
          <div className="kpi"><b className="tx-green"><Num n={rie.vendite_oggi} /></b><span>movimenti vendite oggi</span></div>
          <div className="kpi"><b style={rie.fallimenti_7gg ? { color: "var(--red)" } : null}><Num n={rie.fallimenti_7gg} /></b><span>accessi falliti in 7 giorni</span></div>
        </div>
      )}
      <div className="filters">
        <div className="stage-tabs">
          {CATEGORIE.map(([k, l]) => (
            <button key={l} className={`stab ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{l}</button>
          ))}
        </div>
        <div className="frow">
          <select value={cod} onChange={(e) => setCod(e.target.value)} aria-label="Filtra per PR">
            <option value="">Tutti i PR e l'ufficio</option>
            {persone.map((a) => <option key={a.codice_pr} value={a.codice_pr}>{a.nome} · {a.codice_pr}</option>)}
          </select>
          <button className="toggle" onClick={() => { setItems(null); load(null); }}><RefreshCw size={13} className={busy ? "spin" : ""} /> Aggiorna</button>
        </div>
      </div>
      {items === null ? <div className="none pad">Carico la cronologia…</div> : items.length === 0 ? (
        <div className="empty">
          <span className="empty-ic"><History size={24} /></span>
          <h3>Ancora niente da vedere</h3>
          <p>Da oggi qui compare tutto quello che fanno i PR nell'app e ogni movimento delle loro prenotazioni.</p>
        </div>
      ) : (
        <section className="card tl">
          {gruppi.map((g) => (
            <div key={g.k} className="tl-day">
              <h4 className="tl-dlabel">{g.label}</h4>
              {g.rows.map((e, i) => {
                const st = CAT_STILE[e.tipo === "accesso_fallito" || e.tipo === "accesso_bloccato" ? "allarme" : e.categoria] || CAT_STILE.navigazione;
                const lead = e.dettaglio?.cod && perCod[e.dettaglio.cod];
                const Tag = lead ? "button" : "div";
                return (
                  <Tag key={i} className={`tl-row ${lead ? "click" : ""}`} onClick={lead ? () => onOpen(lead) : undefined}>
                    <span className="tl-time">{oraIt(new Date(e.quando))}</span>
                    <span className="tl-ic" style={{ background: st.bg, color: st.fg }}><st.Icon size={15} /></span>
                    <span className="tl-txt">{frase(e)}</span>
                    {e.tipo.startsWith("vendita") && <StagePill n={e.dettaglio?.a} />}
                  </Tag>
                );
              })}
            </div>
          ))}
          {more && <button className="btn-out" disabled={busy} onClick={() => load(items[items.length - 1].quando)}>{busy ? "Carico…" : "Carica le precedenti"}</button>}
        </section>
      )}
    </div>
  );
}

/* ---------------- SHEETS ---------------- */
function Sheet({ onClose, wide, children }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <aside className={`sheet ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <span className="grab" aria-hidden />
        <button className="sheet-x" onClick={onClose} aria-label="Chiudi"><X size={18} /></button>
        {children}
      </aside>
    </div>
  );
}
function VenditoreSheet({ info, leads, onClose }) {
  const months = useMemo(() => computeMonths(leads), [leads]);
  if (!info) return null;
  const byStage = STAGES.map((s) => ({ ...s, count: leads.filter((r) => r.stage === s.n).length,
    pax: leads.filter((r) => r.stage === s.n).reduce((a, r) => a + r.pax, 0) })).filter((s) => s.count > 0);
  const byMeta = Object.values(leads.reduce((m, r) => {
    const k = normMeta(r.meta); if (!m[k]) m[k] = { meta: k, count: 0, pax: 0 };
    m[k].count++; m[k].pax += r.pax; return m; }, {})).sort((a, b) => b.count - a.count);
  const rows = sortRecent(leads);
  return (
    <Sheet onClose={onClose} wide>
      <div className="sh-head">
        <Avatar name={info.nome} size={56} />
        <div><h2>{info.nome}{info.canale && <span className="vtag">canale</span>}</h2><span className="code-badge">{info.code}</span></div>
      </div>
      <div className="sh-hero">
        <div><b><Num n={info.groups} /></b><span>prenotazioni</span></div>
        <div><b><Num n={info.pax} /></b><span>pax</span></div>
        <div><b><Num n={info.conf} /></b><span>confermate</span></div>
        <div><b>{info.conv}%</b><span>conversione</span></div>
      </div>
      <section className="sh-block">
        <h4>Mese per mese</h4>
        <MonthChart months={months} thisKey={meseKey(new Date())} />
      </section>
      <section className="sh-block">
        <h4>Destinazioni</h4>
        <div className="dest-chips">{byMeta.map((m) => <MetaChip key={m.meta} meta={m.meta} count={m.count} />)}</div>
      </section>
      <section className="sh-block">
        <h4>Stato delle pratiche</h4>
        {byStage.map((s) => (
          <div className="sh-line" key={s.n}><i style={{ background: s.color }} /><span>{s.label}</span><b>{s.count}</b><em>{s.pax} pax</em></div>
        ))}
      </section>
      <section className="sh-block">
        <h4>Prenotazioni ({rows.length})</h4>
        <div className="sh-rows">
          {rows.map((r) => (
            <div className="sh-row" key={r.cod}>
              <span className="row-main">
                <span className="row-name">{r.nome || r.cod} <em>{r.cod}</em></span>
                <span className="row-meta"><MetaChip meta={r.meta} />{r.turno && <span className="tchip">{r.turno}</span>}{r.city && r.city !== "-" && <span className="tchip">{r.city}</span>}</span>
              </span>
              <span className="row-right"><span className="row-pax"><b>{r.pax}</b> pax</span><StagePill n={r.stage} /></span>
            </div>
          ))}
        </div>
      </section>
    </Sheet>
  );
}
function LeadSheet({ lead, isAdmin, onClose }) {
  const s = stageOf(lead.stage);
  const step = ACTIVE.indexOf(lead.stage);
  return (
    <Sheet onClose={onClose}>
      <div className="sh-head">
        <Avatar name={lead.nome || lead.cod} size={52} />
        <div><h2>{lead.nome || "—"}</h2><span className="code-badge">{lead.cod}</span></div>
      </div>
      <div className="lead-status" style={{ background: s.soft, color: s.ink }}>
        <i style={{ background: s.color }} />{lead.stato || s.label}
      </div>
      {lead.stage !== 6 && lead.stage !== 0 && giorniFermo(lead) && (
        <p className="lead-since">In questo stato {testoFermo(giorniFermo(lead))}</p>
      )}
      {step >= 0 && (
        <div className="progress" aria-label={`Passo ${step + 1} di ${ACTIVE.length}`}>
          {ACTIVE.map((n, i) => <span key={n} className={i <= step ? "on" : ""} style={i <= step ? { background: s.color } : undefined} />)}
        </div>
      )}
      <dl className="lead-grid">
        <div><dt>Meta</dt><dd><MetaChip meta={lead.meta} /></dd></div>
        <div><dt>Turno</dt><dd>{lead.turno || "—"}</dd></div>
        <div><dt>Pax</dt><dd>{lead.pax}</dd></div>
        <div><dt>Città</dt><dd>{lead.city || "—"}</dd></div>
        <div><dt>Richiesta</dt><dd><CalendarDays size={14} /> {lead.data || "—"}</dd></div>
        {isAdmin && <div><dt>Codice PR</dt><dd>{lead.can || "—"}</dd></div>}
      </dl>
      <p className="lead-note">Lo stato arriva dal foglio bloccaposti e si aggiorna da solo.</p>
    </Sheet>
  );
}

function StyleTag() { return <style dangerouslySetInnerHTML={{ __html: CSS }} />; }
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
:root{
--bg:#F2F6FC;--surface:#FFFFFF;--line:#E4EBF5;--line2:#D5E0EF;
--ink:#0F1B33;--muted:#5A6882;--faint:#8F9BB2;
--violet:#1E6BF1;--violet2:#3B8CFF;--vsoft:#E3EEFF;--vink:#1247B1;--grad:linear-gradient(135deg,#2A7BFF 0%,#1E6BF1 45%,#1247B1 100%);--pale:#D3E4FF;
--orange:#F97316;--orange2:#FB923C;--osoft:#FFEDD5;--oink:#9A3412;
--green:#16A34A;--gsoft:#DCFCE7;--red:#DC2626;
--r:18px;--font:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif;
--tabh:68px;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body,#root{background:var(--bg);min-height:100dvh}
body{font-family:var(--font);color:var(--ink);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;text-align:left}
input,select{font-family:inherit;color:var(--ink)}
:focus-visible{outline:2px solid var(--violet2);outline-offset:2px;border-radius:10px}
h1,h2,h3,h4{letter-spacing:-.02em}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.tx-green{color:var(--green)}
.muted-s{font-size:12px;color:var(--faint);font-weight:500}
.none{font-size:13px;color:var(--faint);padding:14px 4px}.none.pad{padding:28px 16px;text-align:center}

/* logo */
.logo{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.16em;font-size:14px;color:var(--violet)}
.logo.light{color:#fff}
.logo-tile{width:34px;height:34px;border-radius:11px;background:var(--violet);display:grid;place-items:center;flex-shrink:0;overflow:hidden}
.logo-tile img{width:100%;height:100%;display:block}
.logo.light .logo-tile{box-shadow:0 0 0 2px rgba(255,255,255,.35)}
.logo-tile.big{width:58px;height:58px;border-radius:18px;animation:bob 1.6s ease-in-out infinite}
.logo-tile.sm{width:30px;height:30px;border-radius:10px}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.boot{min-height:100dvh;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;color:var(--muted);font-size:13px}

/* login */
.login{min-height:100dvh;display:grid;grid-template-columns:1.05fr .95fr}
.login-hero{position:relative;overflow:hidden;background:var(--grad);color:#fff;padding:48px 56px;display:flex;flex-direction:column}
.login-hero::before{content:"";position:absolute;width:520px;height:520px;border-radius:50%;background:rgba(255,255,255,.08);right:-200px;top:-160px}
.login-hero::after{content:"";position:absolute;width:300px;height:300px;border-radius:50%;background:var(--orange);left:-120px;bottom:-140px;opacity:.95}
.login-hero>*{position:relative;z-index:1}
.hero-copy{margin:auto 0}
.hero-copy h1{font-size:50px;line-height:1.02;font-weight:800;letter-spacing:-.035em}
.hero-copy h1 span{color:var(--orange2)}
.hero-copy p{font-size:16px;line-height:1.55;color:var(--pale);max-width:400px;margin-top:18px}
.hero-dest{display:flex;flex-wrap:wrap;gap:8px;max-width:420px}
.hero-dest span{font-size:13px;font-weight:700;padding:8px 14px;border-radius:999px;animation:pop .5s cubic-bezier(.2,.9,.3,1.3) both;animation-delay:calc(var(--i)*70ms + 150ms)}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.9)}to{opacity:1;transform:none}}
.login-side{display:grid;place-items:center;padding:28px 20px}
.login-stack{width:100%;max-width:400px;display:flex;flex-direction:column;gap:14px}
.login-card{background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:30px 26px 22px}
.login-card h2{font-size:26px;font-weight:800}
.login-sub{font-size:14px;color:var(--muted);margin:6px 0 22px}
.fld{display:block;margin-bottom:14px}
.fld span{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px}
.fld input{width:100%;background:var(--bg);border:1.5px solid transparent;border-radius:14px;padding:13px 14px;font-size:15px;transition:border .15s,background .15s}
.fld input:focus{border-color:var(--violet2);background:#fff;outline:none}
.login-err{color:var(--red);font-size:13px;margin-bottom:12px;font-weight:500}
.btn-primary{width:100%;background:var(--violet);color:#fff;font-weight:700;font-size:15px;padding:14px;border-radius:14px;display:flex;align-items:center;justify-content:center;gap:8px;transition:transform .12s,background .15s}
.btn-primary:hover{background:var(--vink)}.btn-primary:active{transform:scale(.98)}.btn-primary:disabled{opacity:.6}
.linkbtn{display:block;margin:14px auto 0;color:var(--violet2);font-size:13px;font-weight:600}
.hint{font-size:12px;color:var(--muted);background:var(--bg);border-radius:12px;padding:10px 12px;margin-top:10px}
.quick{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:14px}
.quick-head{font-size:12px;font-weight:700;color:var(--muted);margin-bottom:10px}
.quick-search{display:flex;align-items:center;gap:8px;background:var(--bg);border-radius:12px;padding:0 12px;color:var(--faint);margin-bottom:10px}
.quick-search input{background:none;border:none;padding:10px 0;font-size:14px;width:100%;outline:none}
.quick-list{display:flex;flex-wrap:wrap;gap:6px;max-height:168px;overflow-y:auto}
.qchip{display:inline-flex;align-items:center;gap:7px;background:var(--bg);border-radius:999px;padding:6px 11px 6px 6px;max-width:100%;transition:background .13s}
.qchip:hover{background:var(--vsoft)}
.qcode{font-size:10px;font-weight:800;color:var(--violet);background:#fff;border-radius:999px;padding:3px 7px;flex-shrink:0}
.qname{font-size:12px;font-weight:500;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.quick-none{font-size:12px;color:var(--faint);padding:6px}

/* shell */
.shell{display:flex;min-height:100dvh}
.side{width:240px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:22px 14px;position:sticky;top:0;height:100dvh}
.side-top{padding:4px 10px 26px}
.side-nav{display:flex;flex-direction:column;gap:4px;flex:1}
.snav{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;color:var(--muted);font-size:14px;font-weight:600;transition:background .14s,color .14s;width:100%}
.snav:hover{background:var(--bg);color:var(--ink)}
.snav.on{background:var(--vsoft);color:var(--violet)}
.side-bottom{display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--line);padding-top:14px}
.ucard{display:flex;align-items:center;gap:10px;padding:6px 8px}
.uinfo{min-width:0;display:flex;flex-direction:column}
.uinfo b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.uinfo span{font-size:11px;color:var(--faint);font-weight:600}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 32px;max-width:1760px;width:100%;background:rgba(242,246,252,.9);backdrop-filter:blur(10px)}
.top-left{display:flex;align-items:center;gap:10px;min-width:0}
.top-logo{display:none}
.top-h{font-size:26px;font-weight:800}
.top-titles{display:flex;flex-direction:column;min-width:0}
.top-sync{font-size:11px;font-weight:600;color:var(--faint);margin-top:1px}
.sync-alert{display:flex;flex-direction:column;gap:3px;background:#FEE2E2;color:#991B1B;border-radius:16px;padding:12px 16px;margin-bottom:16px;font-size:13px}
.tchip.fermo{color:var(--oink);background:var(--osoft);font-weight:700}
.lead-since{font-size:13px;font-weight:600;color:var(--oink);margin-top:10px}
.top-right{display:flex;align-items:center;gap:8px}
.code-badge{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.04em;color:var(--violet);background:var(--vsoft);padding:6px 11px;border-radius:999px;white-space:nowrap}
.season{font-size:12px;font-weight:800;color:var(--oink);background:var(--osoft);border:none;border-radius:999px;padding:7px 12px;white-space:nowrap}
select.season{appearance:none;-webkit-appearance:none;padding-right:28px;cursor:pointer;background:var(--osoft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239A3412' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center}
.icon-btn{width:38px;height:38px;border-radius:12px;background:var(--surface);border:1px solid var(--line);display:grid;place-items:center;color:var(--muted);transition:color .14s,border-color .14s}
.icon-btn:hover{color:var(--violet);border-color:var(--line2)}
.mob-only{display:none}
.content{padding:8px 32px 48px;max-width:1760px;width:100%}
.stack{display:flex;flex-direction:column;gap:20px}
.dash{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:20px;align-items:start}
.rail{display:flex;flex-direction:column;gap:20px;position:sticky;top:96px}
.rlist{display:flex;flex-direction:column}
.rtop{display:flex;align-items:center;gap:10px;padding:9px 0}
.rtop+.rtop,.rcall+.rcall,.rcity+.rcity{border-top:1px solid var(--line)}
.rpos{width:22px;height:22px;border-radius:8px;display:grid;place-items:center;font-size:11px;font-weight:800;background:var(--bg);color:var(--muted);flex-shrink:0}
.rpos.p1{background:var(--orange);color:#fff}.rpos.p2{background:var(--violet);color:#fff}.rpos.p3{background:var(--vsoft);color:var(--vink)}
.rtop-id{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.rtop-id b{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rtop-bar{height:5px;background:var(--bg);border-radius:99px;overflow:hidden}
.rtop-bar span{display:block;height:100%;background:var(--violet);border-radius:99px;transition:width .7s cubic-bezier(.2,.8,.2,1)}
.rtop-n{display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;min-width:44px}
.rtop-n b{font-size:15px;font-weight:800}.rtop-n em{font-style:normal;font-size:10px;color:var(--faint);font-weight:600}
.rcall{display:flex;align-items:center;gap:10px;padding:10px 6px;border-radius:12px;width:100%;transition:background .13s}
.rcall:hover{background:var(--bg)}
.rcall-id{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.rcall-id b{font-size:13px;font-weight:700;text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rcall-id em{font-style:normal;font-size:11px;color:var(--faint);font-weight:600}
.rcall-g{font-size:12px;font-weight:800;color:var(--oink);background:var(--osoft);border-radius:999px;padding:4px 9px;flex-shrink:0}
.rempty{font-size:13px;color:var(--muted);background:var(--bg);border-radius:14px;padding:14px}
.tbars{display:flex;align-items:flex-end;gap:8px;height:130px}
.tbar{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%}
.tbar-v{font-size:11px;font-weight:700;color:var(--muted)}
.tbar-c{flex:1;width:100%;max-width:30px;background:var(--bg);border-radius:9px;display:flex;align-items:flex-end;overflow:hidden}
.tbar-c span{width:100%;background:var(--violet2);border-radius:9px;animation:grow .7s cubic-bezier(.2,.8,.2,1) both;transform-origin:bottom}
.tbar-l{font-size:11px;font-weight:700;color:var(--faint)}
.rcity{display:grid;grid-template-columns:minmax(0,1fr) 90px 40px;align-items:center;gap:10px;padding:8px 0}
.rcity-l{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}
.rcity-t{height:6px;background:var(--bg);border-radius:99px;overflow:hidden}
.rcity-t span{display:block;height:100%;background:var(--violet2);border-radius:99px}
.rcity b{font-size:13px;font-weight:800;text-align:right}
.tabbar{display:none}

/* hero */
.hero{background:var(--grad);color:#fff;border-radius:26px;padding:24px;position:relative;overflow:hidden}
.hero::after{content:"";position:absolute;width:300px;height:300px;border-radius:50%;background:rgba(255,255,255,.08);right:-90px;top:-130px}
.hero>*{position:relative;z-index:1}
.hero-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.hero-hi{font-size:14px;color:var(--pale);font-weight:600}
.hero-n{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:4px}
.hero-n{font-size:56px;font-weight:800;letter-spacing:-.04em;line-height:1}
.hero-n span{font-size:15px;font-weight:600;letter-spacing:0;color:var(--pale)}
.hero-sub{font-size:13px;color:var(--pale);margin-top:8px;font-weight:500}
.hero-month{background:var(--orange);border-radius:18px;padding:12px 16px;min-width:120px;text-align:center;display:flex;flex-direction:column}
.hero-month.past{background:rgba(255,255,255,.14)}
.hero-month span{font-size:11px;font-weight:700;text-transform:capitalize;color:#FFEDD5}
.hero-month b{font-size:32px;font-weight:800;line-height:1.1}
.hero-month em{font-style:normal;font-size:11px;font-weight:600;color:#FFEDD5}
.hero-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:20px}
.hero-stats button{background:rgba(255,255,255,.12);border-radius:14px;padding:10px 12px;transition:background .14s}
.hero-stats button:hover{background:rgba(255,255,255,.2)}
.hero-stats b{display:block;font-size:22px;font-weight:800}
.hero-stats span{font-size:12px;color:var(--pale);font-weight:600}

.nudge{display:flex;align-items:center;gap:12px;background:var(--osoft);color:var(--oink);border-radius:18px;padding:14px 16px;width:100%;transition:transform .12s}
.nudge:active{transform:scale(.99)}
.nudge-ic{width:38px;height:38px;border-radius:12px;background:var(--orange);color:#fff;display:grid;place-items:center;flex-shrink:0}
.nudge-t{flex:1;display:flex;flex-direction:column;gap:2px}
.nudge-t b{font-size:14px}.nudge-t em{font-style:normal;font-size:12px;opacity:.85}

/* blocks */
.card{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:18px}
.card.flush{padding:0;overflow:hidden}
.block-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.block-head h3{font-size:16px;font-weight:800}
.block .block-head{padding:0 2px}
.link{display:inline-flex;align-items:center;gap:2px;color:var(--violet2);font-size:13px;font-weight:700}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid2>.card{display:flex;flex-direction:column}
.grid2>.card>.mchart{flex:1;min-height:180px}
.dest-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.dest{border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:2px;transition:transform .12s}
.dest:hover{transform:translateY(-2px)}
.dest-name{display:flex;align-items:center;gap:5px;font-size:13px;font-weight:700}
.dest b{font-size:28px;font-weight:800;letter-spacing:-.03em;margin-top:4px}
.dest em{font-style:normal;font-size:12px;font-weight:600;opacity:.8}
.mchip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:4px 9px;border-radius:999px;white-space:nowrap}
.mchip b{font-weight:800}
.tchip{display:inline-flex;font-size:11px;font-weight:600;color:var(--muted);background:var(--bg);padding:4px 8px;border-radius:999px;white-space:nowrap}
.tchip.pr{color:var(--violet);background:var(--vsoft);font-weight:700}
.spill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:5px 10px;border-radius:999px;white-space:nowrap}
.spill i{width:6px;height:6px;border-radius:50%}

/* month chart */
.mchart{display:flex;align-items:flex-end;gap:6px;height:180px;padding-top:6px}
.mbar{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%}
.mval{font-size:11px;font-weight:700;color:var(--muted);height:14px}
.mcol{flex:1;width:100%;max-width:34px;display:flex;align-items:flex-end;background:var(--bg);border-radius:10px;overflow:hidden}
.mcol span{width:100%;background:var(--violet2);border-radius:10px;opacity:.75;animation:grow .7s cubic-bezier(.2,.8,.2,1) both;transform-origin:bottom}
@keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.mbar.cur .mcol span{background:var(--orange);opacity:1}
.mbar.cur .mval,.mbar.cur .mlab{color:var(--oink)}
.mlab{font-size:11px;font-weight:600;color:var(--faint)}

/* stage bars */
.sbars{display:flex;flex-direction:column;gap:2px}
.sbar{display:grid;grid-template-columns:minmax(140px,auto) minmax(40px,1fr) auto;align-items:center;gap:12px;padding:9px 8px;border-radius:12px;transition:background .13s;width:100%}
.sbar:hover,.sbar.sel{background:var(--bg)}
.sbar.dim{opacity:.45}
.sbar-l{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sbar-l i{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.sbar-t{height:8px;background:var(--bg);border-radius:99px;overflow:hidden}
.sbar.sel .sbar-t,.sbar:hover .sbar-t{background:#fff}
.sbar-t span{display:block;height:100%;border-radius:99px;transition:width .7s cubic-bezier(.2,.8,.2,1)}
.sbar-v{display:flex;align-items:baseline;gap:6px;justify-content:flex-end;min-width:76px}
.sbar-v b{font-size:15px;font-weight:800}.sbar-v em{font-style:normal;font-size:11px;color:var(--faint);font-weight:600}

/* rows */
.rows{display:flex;flex-direction:column}
.row{display:flex;align-items:center;gap:12px;padding:11px 6px;border-radius:14px;width:100%;transition:background .13s}
.row+.row{border-top:1px solid var(--line)}
.row:hover{background:var(--bg)}
.avatar{border-radius:50%;display:grid;place-items:center;font-weight:800;flex-shrink:0;letter-spacing:.02em}
.row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.row-name{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}
.row-name em{font-style:normal;font-size:11px;font-weight:600;color:var(--faint);text-transform:none;margin-left:4px}
.row-meta{display:flex;gap:5px;flex-wrap:wrap}
.row-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}
.row-pax{font-size:12px;color:var(--muted);font-weight:600}.row-pax b{color:var(--ink);font-size:15px;font-weight:800}
.more{font-size:12px;color:var(--faint);text-align:center;padding:12px}

/* filters */
.filters{display:flex;flex-direction:column;gap:10px}
.search{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:0 14px;color:var(--faint)}
.search input{flex:1;background:none;border:none;padding:13px 0;font-size:15px;outline:none;min-width:0}
.frow{display:flex;gap:8px;flex-wrap:wrap}
.frow select{appearance:none;-webkit-appearance:none;background:var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6380' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 12px center;border:1px solid var(--line);border-radius:999px;padding:9px 32px 9px 14px;font-size:13px;font-weight:600;color:var(--ink)}
.chips-row{align-items:center}
.fchip{display:inline-flex;align-items:center;gap:6px;background:var(--vsoft);color:var(--violet);font-size:12px;font-weight:700;padding:6px 6px 6px 12px;border-radius:999px}
.fchip button{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:#fff}
.clear{font-size:13px;font-weight:700;color:var(--violet2);padding:6px 8px}
.stage-tabs{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.stage-tabs::-webkit-scrollbar{display:none}
.stab{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;background:var(--surface);border:1.5px solid var(--line);border-radius:999px;padding:8px 13px;font-size:13px;font-weight:600;color:var(--muted)}
.stab i{width:7px;height:7px;border-radius:50%}
.stab b{color:var(--ink);font-weight:800}
.stab.on{background:var(--violet);border-color:var(--violet);color:#fff}.stab.on b{color:inherit}
.funnel-grid{grid-template-columns:.9fr 1.1fr;align-items:start}
.funnel-grid>.card:first-child{position:sticky;top:84px}

/* venditori */
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:14px 16px;display:flex;flex-direction:column}
.kpi b{font-size:26px;font-weight:800;letter-spacing:-.03em}
.kpi span{font-size:12px;font-weight:600;color:var(--muted)}
.kpi em{font-style:normal;font-size:11px;color:var(--faint);font-weight:600}
.podium{display:grid;grid-template-columns:1fr 1.15fr 1fr;gap:10px;align-items:end}
.pod{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:14px 10px 0;border-radius:22px;background:var(--surface);border:1px solid var(--line);overflow:hidden;transition:transform .12s}
.pod:hover{transform:translateY(-2px)}
.pod.p1{background:var(--grad);border-color:var(--violet);color:#fff;padding-top:18px}
.crown{color:var(--orange2)}
.pod-name{font-size:13px;font-weight:800;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.pod-code{font-size:10px;font-weight:800;color:var(--violet);background:var(--vsoft);border-radius:999px;padding:3px 8px}
.pod.p1 .pod-code{background:rgba(255,255,255,.16);color:#fff}
.pod-step{width:calc(100% + 20px);margin-top:8px;padding:12px 6px 10px;background:var(--bg);display:flex;flex-direction:column;align-items:center;position:relative}
.pod.p1 .pod-step{background:var(--orange);padding:18px 6px 14px}
.pod.p2 .pod-step{padding-top:16px}
.pod-step b{font-size:24px;font-weight:800;line-height:1}
.pod-step em{font-style:normal;font-size:11px;font-weight:600;opacity:.75}
.pod-step i{position:absolute;right:10px;top:8px;font-style:normal;font-size:12px;font-weight:800;opacity:.4}
.seg{display:inline-flex;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:3px}
.seg button{font-size:13px;font-weight:600;color:var(--muted);padding:7px 13px;border-radius:999px}
.seg button.on{background:var(--violet);color:#fff}
.toggle{background:var(--surface);border:1px solid var(--line);color:var(--muted);border-radius:999px;padding:9px 14px;font-size:13px;font-weight:600}
.toggle.on{border-color:var(--vsoft);color:var(--violet);background:var(--vsoft)}
.vlegend{display:flex;gap:16px;padding:14px 18px 6px;font-size:12px;color:var(--muted);font-weight:600;flex-wrap:wrap}
.vlegend span{display:flex;align-items:center;gap:6px}.vlegend i{width:9px;height:9px;border-radius:3px}
.vlist{display:flex;flex-direction:column;padding:4px 8px 8px}
.vrow{display:flex;align-items:center;gap:12px;padding:12px 10px;border-radius:16px;width:100%;transition:background .13s}
.vrow+.vrow{border-top:1px solid var(--line)}
.vrow:hover:not(.zero){background:var(--bg)}
.vrow.zero{opacity:.45;cursor:default}
.vrank{width:24px;font-size:13px;font-weight:800;color:var(--faint);text-align:center;flex-shrink:0}
.vrank.hi{color:var(--orange)}
.vid{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.vname{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px}
.vtag{font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--oink);background:var(--osoft);border-radius:6px;padding:2px 6px}
.vcode{font-size:11px;font-weight:700;color:var(--violet)}
.vbar{display:flex;height:6px;background:var(--bg);border-radius:99px;overflow:hidden;margin-top:3px;max-width:340px}
.vbar span{height:100%;transition:width .8s cubic-bezier(.2,.7,.2,1)}
.vnums{display:flex;gap:16px;flex-shrink:0}
.vnums>span{display:flex;flex-direction:column;align-items:flex-end;min-width:44px}
.vnums b{font-size:17px;font-weight:800}.vnums em{font-style:normal;font-size:10px;color:var(--faint);font-weight:600}
.vchev{color:var(--faint);flex-shrink:0}

/* sheet */
.scrim{position:fixed;inset:0;z-index:60;background:rgba(15,27,51,.42);display:flex;justify-content:flex-end;animation:fade .18s ease}
@keyframes fade{from{opacity:0}}
.sheet{position:relative;width:min(440px,100vw);height:100dvh;background:var(--surface);overflow-y:auto;padding:26px 24px 32px;animation:slideL .26s cubic-bezier(.2,.8,.2,1)}
.sheet.wide{width:min(580px,100vw)}
@keyframes slideL{from{transform:translateX(40px);opacity:.4}}
.grab{display:none}
.sheet-x{position:absolute;top:18px;right:18px;width:36px;height:36px;border-radius:12px;background:var(--bg);display:grid;place-items:center;color:var(--muted)}
.sh-head{display:flex;align-items:center;gap:14px;padding-right:44px;margin-bottom:18px}
.sh-head h2{font-size:21px;font-weight:800;display:flex;align-items:center;gap:8px;flex-wrap:wrap;text-transform:capitalize;margin-bottom:6px}
.sh-hero{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:var(--grad);border-radius:20px;padding:14px 10px;color:#fff;text-align:center}
.sh-hero b{display:block;font-size:22px;font-weight:800}
.sh-hero span{font-size:11px;color:var(--pale);font-weight:600}
.sh-block{padding-top:20px}
.sh-block h4{font-size:13px;font-weight:800;color:var(--muted);margin-bottom:10px}
.dest-chips{display:flex;gap:6px;flex-wrap:wrap}
.dest-chips .mchip{font-size:12px;padding:6px 11px}
.sh-line{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:14px;font-weight:500}
.sh-line+.sh-line{border-top:1px solid var(--line)}
.sh-line i{width:9px;height:9px;border-radius:50%}
.sh-line span{flex:1}.sh-line b{font-weight:800}.sh-line em{font-style:normal;font-size:12px;color:var(--faint);min-width:52px;text-align:right}
.sh-rows{display:flex;flex-direction:column;gap:8px}
.sh-row{display:flex;align-items:center;gap:10px;background:var(--bg);border-radius:16px;padding:10px 12px}
.lead-status{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;padding:12px 14px;border-radius:16px}
.lead-status i{width:9px;height:9px;border-radius:50%}
.progress{display:flex;gap:5px;margin:12px 0 4px}
.progress span{flex:1;height:6px;border-radius:99px;background:var(--bg)}
.lead-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
.lead-grid div{background:var(--bg);border-radius:14px;padding:12px}
.lead-grid dt{font-size:11px;font-weight:700;color:var(--faint);margin-bottom:5px}
.lead-grid dd{font-size:15px;font-weight:700;display:flex;align-items:center;gap:5px}
.lead-note{font-size:12px;color:var(--faint);margin-top:16px}

.empty{background:var(--surface);border:1px solid var(--line);border-radius:26px;padding:48px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}
.empty-ic{width:56px;height:56px;border-radius:18px;background:var(--osoft);color:var(--orange);display:grid;place-items:center}
.empty h3{font-size:20px;font-weight:800}.empty p{font-size:14px;color:var(--muted);max-width:340px;line-height:1.5}


/* area personale */
.me-btn{border-radius:50%;padding:0}
.ucard{border-radius:14px;width:100%;transition:background .14s}.ucard:hover,.ucard.on{background:var(--vsoft)}
.phero{background:var(--grad);color:#fff;border-radius:28px;padding:28px;display:flex;align-items:center;justify-content:space-between;gap:24px;position:relative;overflow:hidden}
.phero::before{content:"";position:absolute;width:420px;height:420px;border-radius:50%;background:rgba(255,255,255,.07);right:-120px;top:-200px}
.phero::after{content:"";position:absolute;width:180px;height:180px;border-radius:50%;background:var(--orange);opacity:.9;right:34%;bottom:-130px}
.phero>*{position:relative;z-index:1}
.phero-id{display:flex;align-items:center;gap:20px;min-width:0}
.phero-av .avatar{box-shadow:0 0 0 5px rgba(255,255,255,.22)}
.phero-txt{min-width:0}
.phero-kick{font-size:13px;font-weight:700;color:var(--pale);letter-spacing:.02em}
.phero h2{font-size:38px;font-weight:800;letter-spacing:-.035em;line-height:1.05;margin:4px 0 12px;text-transform:capitalize}
.phero-code{display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.14);border-radius:16px;padding:8px 8px 8px 14px}
.phero-code span{font-size:11px;font-weight:700;color:var(--pale);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}
.phero-code b{font-size:24px;font-weight:800;letter-spacing:.04em}
.phero-copy{display:inline-flex;align-items:center;gap:6px;background:#fff;color:var(--violet);font-size:12px;font-weight:800;padding:8px 11px;border-radius:11px}
.phero-code .phero-copy span{color:var(--violet);text-transform:none;letter-spacing:0;font-size:12px;font-weight:800}
.phero-big{text-align:right;display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0}
.phero-big b{font-size:84px;font-weight:800;letter-spacing:-.05em;line-height:.95}
.phero-big span{font-size:15px;font-weight:700;color:var(--pale)}
.phero-big em{font-style:normal;display:inline-flex;align-items:center;gap:5px;margin-top:10px;background:var(--orange);font-size:13px;font-weight:800;padding:6px 12px;border-radius:999px}
.pstats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.pstat{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:18px 20px;display:flex;flex-direction:column;gap:2px}
.pstat span{font-size:13px;font-weight:700;color:var(--muted)}
.pstat.hot span{text-transform:capitalize}
.pstat b{font-size:44px;font-weight:800;letter-spacing:-.04em;line-height:1.1}
.pstat b small{font-size:18px;letter-spacing:0;color:var(--muted)}
.pstat em{font-style:normal;font-size:12px;font-weight:600;color:var(--faint)}
.pstat.ok b{color:var(--green)}
.pstat.hot{background:var(--osoft);border-color:var(--osoft)}.pstat.hot span,.pstat.hot em{color:var(--oink)}.pstat.hot b{color:var(--oink)}
.prank-ic{color:var(--orange)}
.prank-row{display:flex;align-items:center;gap:16px}
.prank-n{font-size:76px;font-weight:800;letter-spacing:-.05em;line-height:1;color:var(--violet)}
.prank-n small{font-size:34px;color:var(--violet2);margin-right:2px}
.prank-t{display:flex;flex-direction:column}.prank-t b{font-size:18px;font-weight:800}.prank-t span{font-size:13px;color:var(--muted);font-weight:500}
.prank-bar{height:10px;background:var(--bg);border-radius:99px;overflow:hidden;margin:16px 0 12px}
.prank-bar span{display:block;height:100%;background:linear-gradient(90deg,var(--violet2),var(--violet));border-radius:99px;transition:width .8s cubic-bezier(.2,.8,.2,1)}
.prank-msg{font-size:14px;color:var(--muted);line-height:1.5}.prank-msg b{color:var(--ink)}
.pmete{display:flex;flex-direction:column;gap:12px;padding-top:4px}
.pmeta{display:grid;grid-template-columns:100px minmax(0,1fr) 48px;align-items:center;gap:12px}
.pmeta-l{display:flex;align-items:center;gap:5px;font-size:13px;font-weight:700}
.pmeta-t{height:12px;background:var(--bg);border-radius:99px;overflow:hidden}
.pmeta-t span{display:block;height:100%;border-radius:99px;transition:width .7s cubic-bezier(.2,.8,.2,1)}
.pmeta b{font-size:16px;font-weight:800;text-align:right}
.muted-ic{color:var(--faint)}
.pform{display:flex;flex-direction:column;gap:4px}
.pform .btn-primary{margin-top:8px}
.pline,.pfld{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:var(--bg);margin-bottom:8px;color:var(--faint)}
.pline span,.pfld span{display:flex;flex-direction:column;flex:1;min-width:0}
.pline em,.pfld em{font-style:normal;font-size:11px;font-weight:700;color:var(--faint)}
.pline b{font-size:15px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis}
.pfld input{background:none;border:none;outline:none;font-size:15px;font-weight:600;padding:2px 0;width:100%}
.pfld:focus-within{box-shadow:inset 0 0 0 1.5px var(--violet2);background:#fff}
.pnote{font-size:12px;color:var(--faint);line-height:1.5;margin-top:4px}
.pok{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--green);margin-bottom:6px}
.btn-out{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;border-radius:14px;border:1.5px solid var(--line2);background:var(--surface);font-size:14px;font-weight:700;color:var(--muted);margin-top:8px;transition:color .14s,border-color .14s}
.btn-out:hover{color:var(--ink);border-color:var(--faint)}
.btn-out.sm{width:auto;padding:9px 14px;margin:0}
.first{position:fixed;inset:0;z-index:80;background:var(--grad);display:grid;place-items:center;padding:20px;overflow-y:auto}
.first-card{background:#fff;border-radius:28px;padding:30px 26px 22px;width:100%;max-width:420px;display:flex;flex-direction:column;align-items:center;text-align:center}
.first-card h2{font-size:28px;font-weight:800;margin-top:16px}
.first-card p{font-size:14px;color:var(--muted);line-height:1.5;margin:8px 0 20px}
.first-card form{width:100%;text-align:left}
/* utenze */
.kbtn{text-align:left;transition:border-color .14s,background .14s}
.kbtn:hover{border-color:var(--line2)}
.kbtn.on{border-color:var(--violet);background:var(--vsoft)}.kbtn.on b{color:var(--violet)}
.ubar{flex-wrap:nowrap}.search.grow{flex:1}
.btn-new{display:inline-flex;align-items:center;gap:6px;background:var(--violet);color:#fff;font-size:14px;font-weight:700;padding:0 18px;border-radius:16px;white-space:nowrap;transition:background .14s}
.btn-new:hover{background:var(--vink)}
.urow{display:flex;align-items:center;gap:12px;padding:12px 10px;border-radius:16px;width:100%;transition:background .13s}
.urow+.urow{border-top:1px solid var(--line)}
.urow:hover{background:var(--bg)}
.urow.off{opacity:.5}
.ucode{font-size:10px;font-weight:800;color:var(--violet);background:var(--vsoft);border-radius:999px;padding:2px 8px}
.uemail{font-size:12px;color:var(--muted);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ustate{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.ustate em{font-style:normal;font-size:11px;color:var(--faint);font-weight:600}
.ust{font-size:11px;font-weight:700;padding:4px 9px;border-radius:999px;background:var(--bg);color:var(--muted)}
.ust.ok{background:var(--gsoft);color:#166534}.ust.warn{background:var(--osoft);color:var(--oink)}.ust.off{background:#FEE2E2;color:#991B1B}
.fld select{width:100%;background:var(--bg);border:1.5px solid transparent;border-radius:14px;padding:13px 14px;font-size:15px;appearance:none;-webkit-appearance:none}
.fld input:disabled,.fld select:disabled{opacity:.55}
.fld2{display:grid;grid-template-columns:1fr 1.3fr;gap:10px}
.switch{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;margin:4px 0 10px;cursor:pointer}
.switch input{position:absolute;opacity:0;pointer-events:none}
.switch-ui{width:42px;height:24px;border-radius:99px;background:var(--line2);position:relative;transition:background .15s;flex-shrink:0}
.switch-ui::after{content:"";position:absolute;width:18px;height:18px;border-radius:50%;background:#fff;left:3px;top:3px;transition:transform .15s}
.switch input:checked+.switch-ui{background:var(--green)}.switch input:checked+.switch-ui::after{transform:translateX(18px)}
.confirm{background:var(--osoft);color:var(--oink);border-radius:16px;padding:14px;margin-top:8px;font-size:13px;font-weight:600;display:flex;flex-direction:column;gap:10px}
.confirm div{display:flex;gap:8px;justify-content:flex-end}
.btn-warn{background:var(--orange);color:#fff;font-weight:800;font-size:13px;padding:9px 14px;border-radius:12px}
.cred{background:var(--vsoft);border-radius:22px;padding:18px;display:flex;flex-direction:column;gap:10px}
.cred-head{display:flex;align-items:center;gap:8px;color:var(--violet)}.cred-head b{font-size:15px;color:var(--ink)}
.cred-row{background:#fff;border-radius:14px;padding:10px 14px;display:flex;flex-direction:column}
.cred-row span{font-size:11px;font-weight:700;color:var(--faint)}
.cred-row b{font-size:15px;font-weight:700;word-break:break-all}
.cred-row.big b{font-size:26px;font-weight:800;letter-spacing:.02em;color:var(--violet);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.cred-btns{display:flex;flex-direction:column;gap:8px}
.cred-btns .btn-primary{margin:0}
.btn-wa{display:flex;align-items:center;justify-content:center;gap:8px;background:#16A34A;color:#fff;font-weight:700;font-size:15px;padding:14px;border-radius:14px;text-decoration:none}
.cred-note{font-size:12px;color:var(--oink);font-weight:600}

/* cronologia */
.tl{padding:6px 18px 18px}
.tl-day+.tl-day{margin-top:6px}
.tl-dlabel{position:sticky;top:76px;z-index:2;background:var(--surface);font-size:12px;font-weight:800;color:var(--muted);text-transform:capitalize;padding:14px 4px 8px;letter-spacing:.02em}
.tl-row{display:flex;align-items:center;gap:12px;padding:9px 6px;border-radius:12px;width:100%;position:relative}
.tl-row.click:hover{background:var(--bg)}
.tl-row+.tl-row::before{content:"";position:absolute;left:68px;top:-9px;height:18px;width:2px;background:var(--line)}
.tl-time{width:40px;flex-shrink:0;font-size:12px;font-weight:700;color:var(--faint);text-align:right}
.tl-ic{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex-shrink:0}
.tl-txt{flex:1;min-width:0;font-size:14px;line-height:1.4;color:var(--muted)}
.tl-txt b{color:var(--ink);font-weight:700}
.tl-cap{text-transform:capitalize}
.tl-cod{font-size:11px;font-weight:700;color:var(--faint)}
/* responsive */
@media(max-width:1280px){.dash{grid-template-columns:1fr}.rail{position:static;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:start}}
@media(max-width:1100px){.kpis{grid-template-columns:repeat(2,1fr)}}
@media(max-width:900px){
.login{grid-template-columns:1fr}
.login-hero{padding:28px 22px 30px}
.hero-copy{margin:34px 0 22px}.hero-copy h1{font-size:36px}.hero-copy p{font-size:14px}
.login-hero::before{width:300px;height:300px;right:-120px;top:-120px}
.login-hero::after{width:180px;height:180px;left:auto;right:-60px;bottom:-90px}
.login-side{padding:18px 16px 32px;place-items:start center}
.side{display:none}
.top{padding:12px 16px}
.top-logo{display:block}
.top-h{font-size:21px}
.mob-only{display:grid}
.content{padding:4px 16px calc(var(--tabh) + 24px + env(safe-area-inset-bottom))}
.stack,.dash,.rail{gap:14px}.rail{display:flex;align-items:stretch}
.grid2,.funnel-grid{grid-template-columns:1fr}
.hide-mob{display:none!important}
.tabbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:40;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-top:1px solid var(--line);padding:6px 8px calc(6px + env(safe-area-inset-bottom))}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 4px;border-radius:14px;color:var(--faint);font-size:11px;font-weight:700;text-align:center}
.tab.on{color:var(--violet);background:var(--vsoft)}
.hero{padding:20px 18px;border-radius:24px}
.hero-n{font-size:48px}
.hero-month{min-width:96px;padding:10px 12px}.hero-month b{font-size:26px}
.dest-row{grid-template-columns:repeat(2,1fr)}
.card{padding:14px;border-radius:20px}
.mchart{height:150px;gap:4px}
.sbar{grid-template-columns:minmax(0,1fr) 70px auto;gap:8px}
.podium{gap:6px}
.pod-name{font-size:12px}
.scrim{align-items:flex-end}
.sheet,.sheet.wide{width:100vw;height:auto;max-height:90dvh;border-radius:26px 26px 0 0;padding:14px 18px calc(28px + env(safe-area-inset-bottom));animation:slideU .28s cubic-bezier(.2,.8,.2,1)}
@keyframes slideU{from{transform:translateY(60px);opacity:.4}}
.grab{display:block;width:42px;height:5px;border-radius:99px;background:var(--line2);margin:0 auto 14px}
.sheet-x{top:22px}
.sh-hero{grid-template-columns:repeat(2,1fr);row-gap:12px}
.phero{flex-direction:column;align-items:stretch;padding:22px 20px;border-radius:24px;gap:18px}
.phero-id{gap:14px}.phero-av .avatar{width:64px!important;height:64px!important;font-size:22px!important}
.phero h2{font-size:26px;margin-bottom:10px}
.phero-big{align-items:flex-start;text-align:left;background:rgba(255,255,255,.12);border-radius:20px;padding:14px 16px}
.phero-big b{font-size:60px}
.pstats{grid-template-columns:repeat(2,1fr);gap:10px}
.pstat{padding:14px;border-radius:18px}.pstat b{font-size:32px}
.prank-n{font-size:60px}
.ubar{flex-wrap:wrap}.btn-new{padding:12px 18px;width:100%;justify-content:center}
.ustate em{display:none}
.tl{padding:4px 10px 12px}.tl-dlabel{top:62px}.tl-row{align-items:flex-start;gap:9px}.tl-time{width:34px;padding-top:7px}.tl-row .spill{display:none}.tl-row+.tl-row::before{left:58px}
.tab{font-size:10px;padding:7px 2px}
}
@media(max-width:420px){.hero-top{flex-direction:column}.hero-month{flex-direction:row;align-items:baseline;gap:8px;width:100%;justify-content:center}.row-meta .tchip.pr{display:none}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
