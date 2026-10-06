/* IV_IMPORT */
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { supabase } from "./lib/supabase.js";
import {
  Home, Filter, ListChecks, Trophy, LogOut, Search, ChevronRight, X, RefreshCw,
  MapPin, CalendarDays, BellRing, Users, Crown, ArrowRight, Sparkles,
} from "lucide-react";

/* ============================================================
   INVIBE · Pannello Venditori — direzione "Energia Invibe"
   Chiaro, viola #5B21B6 + arancio #F97316, mete colorate.
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

function IVMark({ size = 30, color = "#fff", dot = "#FB923C" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 32" fill="none" aria-hidden>
      <g transform="skewX(-11)">
        <rect x="6" y="12" width="5.4" height="16" rx="2.7" fill={color} />
        <circle cx="8.7" cy="6.4" r="3.1" fill={dot} />
        <path d="M18 12 L26 28 L34 12" stroke={color} strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
function Logo({ light }) {
  return (
    <div className={`logo ${light ? "light" : ""}`}>
      <span className="logo-tile"><IVMark size={20} /></span><span>INVIBE</span>
    </div>
  );
}
function initials(name) {
  const p = (name || "").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "—";
}
const AV_TONES = [["#EDE9FE", "#5B21B6"], ["#FFEDD5", "#9A3412"], ["#E0F2FE", "#075985"], ["#DCFCE7", "#166534"], ["#FCE7F3", "#9D174D"], ["#FEF3C7", "#92400E"]];
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

  const mapRow = (r) => ({
    cod: r.cod, nome: r.nome, pax: r.pax || 0, meta: r.meta, turno: r.turno, can: r.canale,
    stage: r.stage == null ? 0 : r.stage, stato: r.stato,
    city: r.citta && r.citta !== "\\-" ? r.citta : "", data: r.data_richiesta,
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
    try { await supabase.rpc("venditore_logout", { p_token: user?.token }); } catch {}
    localStorage.removeItem(STORE_KEY); setUser(null); setLeads([]); setAccounts([]);
  };
  const refresh = () => user && fetchLeads(user.token);
  return { booting, user, leads, loading, accounts, login, logout, refresh };
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
function Boot() { return <div className="boot"><span className="logo-tile big"><IVMark size={30} /></span><span>Carico…</span></div>; }

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
  { key: "prenotazioni", label: "Prenotazioni", Icon: ListChecks },
  { key: "venditori", label: "Venditori", Icon: Trophy, admin: true },
];
function Panel({ dl }) {
  const { user, leads: allLeads, loading, logout, refresh, accounts } = dl;
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
  const items = NAV.filter((n) => !n.admin || isAdmin);
  const titles = {
    dashboard: isAdmin ? "Panoramica" : "La tua stagione",
    funnel: "Funnel",
    prenotazioni: "Prenotazioni",
    venditori: "Venditori",
  };
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-top"><Logo /></div>
        <nav className="side-nav">
          {items.map(({ key, label, Icon }) => (
            <button key={key} className={`snav ${view === key ? "on" : ""}`} onClick={() => go(key)}>
              <Icon size={18} /><span>{label}</span></button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="ucard">
            <Avatar name={user.nome || user.email} size={36} />
            <div className="uinfo"><b>{user.nome || user.email}</b><span>{isAdmin ? "Ufficio" : user.codice_pr}</span></div>
          </div>
          <button className="snav ghost" onClick={logout}><LogOut size={17} /><span>Esci</span></button>
        </div>
      </aside>

      <main className="main">
        <header className="top">
          <div className="top-left">
            <span className="top-logo"><span className="logo-tile sm"><IVMark size={16} /></span></span>
            <h1 className="top-h">{titles[view]}</h1>
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
            <button className="icon-btn mob-only" onClick={logout} aria-label="Esci"><LogOut size={16} /></button>
          </div>
        </header>
        <div className="content">
          {view === "dashboard" && <Dashboard leads={leads} isAdmin={isAdmin} user={user} loading={loading} go={go} onOpen={setSel} stagione={stag} />}
          {view === "funnel" && <FunnelView leads={leads} isAdmin={isAdmin} onOpen={setSel} />}
          {view === "prenotazioni" && <Prenotazioni leads={leads} isAdmin={isAdmin} initial={jump} onOpen={setSel} />}
          {view === "venditori" && isAdmin && <Venditori leads={leads} accounts={accounts} />}
        </div>
      </main>

      <nav className="tabbar">
        {items.map(({ key, label, Icon }) => (
          <button key={key} className={`tab ${view === key ? "on" : ""}`} onClick={() => go(key)}>
            <Icon size={20} /><span>{label}</span></button>
        ))}
      </nav>
      {sel && <LeadSheet lead={sel} isAdmin={isAdmin} onClose={() => setSel(null)} />}
    </div>
  );
}

/* ---------------- DASHBOARD ---------------- */
function Dashboard({ leads, isAdmin, user, loading, go, onOpen, stagione }) {
  const s = useMemo(() => computeStats(leads), [leads]);
  const months = useMemo(() => computeMonths(leads), [leads]);
  const latest = useMemo(() => sortRecent(leads).slice(0, 6), [leads]);
  if (leads.length === 0 && !loading) return <Empty user={user} />;
  const first = (user.nome || "").split(" ")[0];
  const now = new Date(); const thisKey = meseKey(now);
  const thisMonth = months.find((m) => m.key === thisKey);
  return (
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
            <em>hanno bloccato il posto ma non hanno ancora inviato la pratica</em></span>
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
  const rows = useMemo(() => sortRecent(leads.filter((r) => {
    if (f.meta && normMeta(r.meta) !== f.meta) return false;
    if (f.turno && r.turno !== f.turno) return false;
    if (f.stages && f.stages.length) { if (!f.stages.includes(r.stage)) return false; }
    else if (f.stage != null && r.stage !== f.stage) return false;
    if (f.q) { const q = f.q.toLowerCase(); if (!(`${r.cod} ${r.nome} ${r.can} ${r.city}`.toLowerCase().includes(q))) return false; }
    return true;
  })), [leads, f]);
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
        <RowList rows={rows} isAdmin={isAdmin} onOpen={onOpen} />
      </section>
    </div>
  );
}
function RowList({ rows, isAdmin, onOpen }) {
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
--bg:#F6F4FB;--surface:#FFFFFF;--line:#ECE8F4;--line2:#E2DDEE;
--ink:#1C1530;--muted:#6B6380;--faint:#9E97B0;
--violet:#5B21B6;--violet2:#7C3AED;--vsoft:#EDE9FE;--vink:#4C1D95;
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
.logo-tile{width:34px;height:34px;border-radius:11px;background:var(--violet);display:grid;place-items:center;flex-shrink:0}
.logo.light .logo-tile{background:rgba(255,255,255,.16)}
.logo-tile.big{width:58px;height:58px;border-radius:18px;animation:bob 1.6s ease-in-out infinite}
.logo-tile.sm{width:30px;height:30px;border-radius:10px}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.boot{min-height:100dvh;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;color:var(--muted);font-size:13px}

/* login */
.login{min-height:100dvh;display:grid;grid-template-columns:1.05fr .95fr}
.login-hero{position:relative;overflow:hidden;background:var(--violet);color:#fff;padding:48px 56px;display:flex;flex-direction:column}
.login-hero::before{content:"";position:absolute;width:520px;height:520px;border-radius:50%;background:var(--violet2);right:-200px;top:-160px}
.login-hero::after{content:"";position:absolute;width:300px;height:300px;border-radius:50%;background:var(--orange);left:-120px;bottom:-140px;opacity:.95}
.login-hero>*{position:relative;z-index:1}
.hero-copy{margin:auto 0}
.hero-copy h1{font-size:50px;line-height:1.02;font-weight:800;letter-spacing:-.035em}
.hero-copy h1 span{color:var(--orange2)}
.hero-copy p{font-size:16px;line-height:1.55;color:#DDD6FE;max-width:400px;margin-top:18px}
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
.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 32px;background:rgba(246,244,251,.88);backdrop-filter:blur(10px)}
.top-left{display:flex;align-items:center;gap:10px;min-width:0}
.top-logo{display:none}
.top-h{font-size:26px;font-weight:800}
.top-right{display:flex;align-items:center;gap:8px}
.code-badge{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.04em;color:var(--violet);background:var(--vsoft);padding:6px 11px;border-radius:999px;white-space:nowrap}
.season{font-size:12px;font-weight:800;color:var(--oink);background:var(--osoft);border:none;border-radius:999px;padding:7px 12px;white-space:nowrap}
select.season{appearance:none;-webkit-appearance:none;padding-right:28px;cursor:pointer;background:var(--osoft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239A3412' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center}
.icon-btn{width:38px;height:38px;border-radius:12px;background:var(--surface);border:1px solid var(--line);display:grid;place-items:center;color:var(--muted);transition:color .14s,border-color .14s}
.icon-btn:hover{color:var(--violet);border-color:var(--line2)}
.mob-only{display:none}
.content{padding:6px 32px 48px;max-width:1180px;width:100%}
.stack{display:flex;flex-direction:column;gap:16px}
.tabbar{display:none}

/* hero */
.hero{background:var(--violet);color:#fff;border-radius:26px;padding:24px;position:relative;overflow:hidden}
.hero::after{content:"";position:absolute;width:260px;height:260px;border-radius:50%;background:var(--violet2);right:-80px;top:-110px}
.hero>*{position:relative;z-index:1}
.hero-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.hero-hi{font-size:14px;color:#DDD6FE;font-weight:600}
.hero-n{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:4px}
.hero-n{font-size:56px;font-weight:800;letter-spacing:-.04em;line-height:1}
.hero-n span{font-size:15px;font-weight:600;letter-spacing:0;color:#DDD6FE}
.hero-sub{font-size:13px;color:#DDD6FE;margin-top:8px;font-weight:500}
.hero-month{background:var(--orange);border-radius:18px;padding:12px 16px;min-width:120px;text-align:center;display:flex;flex-direction:column}
.hero-month.past{background:rgba(255,255,255,.14)}
.hero-month span{font-size:11px;font-weight:700;text-transform:capitalize;color:#FFEDD5}
.hero-month b{font-size:32px;font-weight:800;line-height:1.1}
.hero-month em{font-style:normal;font-size:11px;font-weight:600;color:#FFEDD5}
.hero-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:20px}
.hero-stats button{background:rgba(255,255,255,.12);border-radius:14px;padding:10px 12px;transition:background .14s}
.hero-stats button:hover{background:rgba(255,255,255,.2)}
.hero-stats b{display:block;font-size:22px;font-weight:800}
.hero-stats span{font-size:12px;color:#DDD6FE;font-weight:600}

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
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.dest-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
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
.sbar{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto;align-items:center;gap:12px;padding:9px 8px;border-radius:12px;transition:background .13s;width:100%}
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
.pod.p1{background:var(--violet);border-color:var(--violet);color:#fff;padding-top:18px}
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
.scrim{position:fixed;inset:0;z-index:60;background:rgba(28,21,48,.42);display:flex;justify-content:flex-end;animation:fade .18s ease}
@keyframes fade{from{opacity:0}}
.sheet{position:relative;width:min(440px,100vw);height:100dvh;background:var(--surface);overflow-y:auto;padding:26px 24px 32px;animation:slideL .26s cubic-bezier(.2,.8,.2,1)}
.sheet.wide{width:min(580px,100vw)}
@keyframes slideL{from{transform:translateX(40px);opacity:.4}}
.grab{display:none}
.sheet-x{position:absolute;top:18px;right:18px;width:36px;height:36px;border-radius:12px;background:var(--bg);display:grid;place-items:center;color:var(--muted)}
.sh-head{display:flex;align-items:center;gap:14px;padding-right:44px;margin-bottom:18px}
.sh-head h2{font-size:21px;font-weight:800;display:flex;align-items:center;gap:8px;flex-wrap:wrap;text-transform:capitalize;margin-bottom:6px}
.sh-hero{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:var(--violet);border-radius:20px;padding:14px 10px;color:#fff;text-align:center}
.sh-hero b{display:block;font-size:22px;font-weight:800}
.sh-hero span{font-size:11px;color:#DDD6FE;font-weight:600}
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

/* responsive */
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
}
@media(max-width:420px){.hero-top{flex-direction:column}.hero-month{flex-direction:row;align-items:baseline;gap:8px;width:100%;justify-content:center}.row-meta .tchip.pr{display:none}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
