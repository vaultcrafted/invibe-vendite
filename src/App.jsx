/* IV_IMPORT */
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { supabase } from "./lib/supabase.js";
import {
  LayoutDashboard, Filter, ListChecks, BarChart3, LogOut, Search, ChevronRight,
  X, Users, UserCheck, CheckCircle2, Clock, XCircle, RefreshCw,
  Activity, ShieldCheck, TrendingUp, Zap, MapPin,
} from "lucide-react";

/* ============================================================
   INVIBE · Pannello Controllo Venditori
   Palette: blu #1E6BF1 su navy — colori app staff.
   ============================================================ */

const STORE_KEY = "iv_vendite_sess";

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
  { key: "Isola di Pag", short: "PAG" }, { key: "Corfù", short: "CORFÙ" },
  { key: "Zante", short: "ZANTE" }, { key: "Gallipoli", short: "GALLIPOLI" }, { key: "Sardegna", short: "SARDEGNA" },
];
const metaShort = (m) => (META.find((x) => x.key === m) || { short: m || "—" }).short;

function computeStats(leads) {
  const byStage = {}; STAGES.forEach((s) => (byStage[s.n] = { groups: 0, pax: 0 }));
  leads.forEach((r) => { const k = byStage[r.stage] || byStage[0]; k.groups++; k.pax += r.pax; });
  const g = (arr) => arr.reduce((a, n) => a + byStage[n].groups, 0);
  const p = (arr) => arr.reduce((a, n) => a + byStage[n].pax, 0);
  const active = g(ACTIVE), confirmed = byStage[6].groups, working = g(IN_LAV), disdette = byStage[7].groups;
  const meta = {}; leads.forEach((r) => { if (ACTIVE.includes(r.stage)) meta[r.meta] = (meta[r.meta] || 0) + r.pax; });
  const byMeta = Object.entries(meta).map(([k, v]) => ({ meta: k, pax: v })).sort((a, b) => b.pax - a.pax);
  return {
    totPax: p(ACTIVE), active, confirmed, working, disdette, byStage, byMeta,
    convPct: active ? Math.round((confirmed / active) * 1000) / 10 : 0,
  };
}

function useCountUp(target, dur = 500) {
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

function IVMark({ size = 30, onBlue = false }) {
  const dot = onBlue ? "#bcd3ff" : "#1E6BF1";
  return (
    <svg width={size} height={size} viewBox="0 0 44 32" fill="none" aria-hidden>
      <g transform="skewX(-11)">
        <rect x="6" y="12" width="5.4" height="16" rx="2.7" fill="#fff" />
        <circle cx="8.7" cy="6.4" r="3.1" fill={dot} />
        <path d="M18 12 L26 28 L34 12" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
function Wordmark() { return <div className="wordmark"><IVMark size={26} /><span>INVIBE</span></div>; }

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
        const { data } = await supabase.rpc("venditori_lista_login");
        if (Array.isArray(data)) setAccounts(data);
      } catch {}
      try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
        if (saved?.token) {
          const { data } = await supabase.rpc("venditore_me", { p_token: saved.token });
          if (data?.profilo) { setUser({ token: saved.token, ...data.profilo }); await fetchLeads(saved.token); }
          else localStorage.removeItem(STORE_KEY);
        }
      } catch {}
      setBooting(false);
    })();
  }, [fetchLeads]);

  const login = async (email, password) => {
    const { data, error } = await supabase.rpc("venditore_login", { p_email: email, p_password: password });
    if (error) return "Connessione non riuscita. Riprova.";
    if (data?.error) return data.error;
    localStorage.setItem(STORE_KEY, JSON.stringify({ token: data.token }));
    setUser({ token: data.token, ...data.profilo });
    await fetchLeads(data.token);
    return null;
  };
  const logout = async () => {
    try { await supabase.rpc("venditore_logout", { p_token: user?.token }); } catch {}
    localStorage.removeItem(STORE_KEY); setUser(null); setLeads([]);
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
      {dl.booting ? <Boot /> : dl.user ? <Panel dl={dl} /> : <Login onLogin={dl.login} accounts={dl.accounts} />}
    </>
  );
}
function Boot() { return <div className="boot"><div className="blogo"><IVMark size={30} /></div><span>Carico…</span></div>; }

// ---- animated flowing waves (canvas) ----
function WaveCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0, raf = 0, t0 = 0;
    const layers = [
      { y: 0.30, amp: 24, wl: 560, sp: 20,  c: "77,139,255", a: 0.08, lw: 1.4, glow: 10 },
      { y: 0.42, amp: 32, wl: 680, sp: -15, c: "30,107,241", a: 0.11, lw: 1.6, glow: 12 },
      { y: 0.55, amp: 28, wl: 500, sp: 26,  c: "77,139,255", a: 0.10, lw: 1.5, glow: 12 },
      { y: 0.68, amp: 40, wl: 760, sp: -19, c: "30,107,241", a: 0.14, lw: 1.8, glow: 16 },
      { y: 0.80, amp: 34, wl: 600, sp: 22,  c: "77,139,255", a: 0.14, lw: 1.6, glow: 15 },
      { y: 0.92, amp: 46, wl: 860, sp: -13, c: "30,107,241", a: 0.18, lw: 2.0, glow: 20 },
    ];
    const resize = () => {
      const r = cv.getBoundingClientRect(); w = r.width; h = r.height;
      cv.width = Math.max(1, w * dpr); cv.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); window.addEventListener("resize", resize);
    const drawFrame = (el) => {
      ctx.clearRect(0, 0, w, h);
      const step = 8;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      for (const L of layers) {
        const baseY = h * L.y + Math.sin(el * 0.32 + L.y * 6) * 12;
        const k = (Math.PI * 2) / L.wl, ph = el * L.sp * k;
        ctx.beginPath();
        for (let x = 0; x <= w + step; x += step) {
          const yy = baseY + Math.sin(x * k + ph) * L.amp + Math.sin(x * k * 0.5 + ph * 0.7 + 1.3) * L.amp * 0.35;
          x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
        }
        ctx.shadowColor = `rgba(${L.c},0.85)`;
        ctx.shadowBlur = L.glow;
        ctx.strokeStyle = `rgba(${L.c},${L.a})`;
        ctx.lineWidth = L.lw + 0.6;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(158,196,255,${Math.min(0.5, L.a + 0.07)})`;
        ctx.lineWidth = L.lw * 0.55;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 0;
    };
    if (reduce) { drawFrame(0); }
    else { const loop = (t) => { if (!t0) t0 = t; drawFrame((t - t0) / 1000); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="wave-canvas" aria-hidden />;
}

// ---- LOGIN (split) ----
function Login({ onLogin, accounts = [] }) {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [hint, setHint] = useState(false);
  const [q, setQ] = useState("");
  const submit = async () => { if (busy) return; setBusy(true); setErr(""); const e = await onLogin(email.trim(), pw); setBusy(false); if (e) setErr(e); };
  const onKey = (ev) => ev.key === "Enter" && submit();
  const pick = (a) => { setEmail(a.email); setPw("invibe"); setErr(""); };
  const feats = [
    [Activity, "Dati in tempo reale"], [ShieldCheck, "Prenotazioni sempre sotto controllo"],
    [TrendingUp, "Performance del funnel"], [Zap, "Gestione semplice e veloce"],
  ];
  const filtered = accounts.filter((a) =>
    !q || `${a.codice_pr || ""} ${a.nome || ""} ${a.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="login">
      <div className="login-bg" aria-hidden>
        <span className="glow g1" />
        <span className="glow g2" />
        <span className="glow g3" />
        <WaveCanvas />
      </div>
      <div className="login-hero">
        <Wordmark />
        <div className="eyebrow">Benvenuto su Invibe</div>
        <h1>Il tuo funnel,<br />sempre aggiornato.</h1>
        <p>Accedi per vedere i clienti sul tuo codice e a che punto sono.</p>
        <ul className="feats">
          {feats.map(([Ic, t]) => <li key={t}><span className="fic"><Ic size={15} /></span>{t}</li>)}
        </ul>
      </div>
      <div className="login-side">
        <div className="login-stack">
          <div className="login-card">
            <div className="lc-logo"><IVMark size={26} onBlue /></div>
            <h2>Accedi al tuo account</h2>
            <label className="fld"><span>Email</span>
              <input value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} onKeyDown={onKey}
                placeholder="nome@invibe.it" type="email" autoComplete="username" /></label>
            <label className="fld"><span>Password</span>
              <input value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} onKeyDown={onKey}
                placeholder="••••••••" type="password" autoComplete="current-password" /></label>
            <button className="linkbtn" onClick={() => setHint(!hint)}>Password dimenticata?</button>
            {hint && <div className="hint">La password la assegna l'ufficio. Scrivi a ufficio@invibe.it.</div>}
            {err && <div className="login-err">{err}</div>}
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? "Accesso…" : <>Entra <ChevronRight size={17} /></>}</button>
          </div>

          {accounts.length > 0 && (
            <div className="quick">
              <div className="quick-head">Accesso rapido — tocca un account per compilarlo</div>
              <div className="quick-search"><Search size={14} />
                <input placeholder="Filtra nome o codice…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <div className="quick-list">
                {filtered.map((a) => (
                  <button key={a.email} className="qchip" title={a.email} onClick={() => pick(a)}>
                    <span className="qcode">{a.codice_pr || "ALL"}</span>
                    <span className="qname">{a.nome || a.email}</span>
                  </button>
                ))}
                {filtered.length === 0 && <div className="quick-none">Nessun account.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const NAV = [
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "funnel", label: "Funnel", Icon: Filter },
  { key: "prenotazioni", label: "Prenotazioni", Icon: ListChecks },
  { key: "venditori", label: "Venditori", Icon: BarChart3, admin: true },
];
function Panel({ dl }) {
  const { user, leads, loading, logout, refresh, accounts } = dl;
  const isAdmin = user.ruolo === "admin";
  const [view, setView] = useState("dashboard");
  const [jump, setJump] = useState(null);
  const [sel, setSel] = useState(null);
  const go = (v, opts) => { setJump(opts || null); setView(v); };
  const items = NAV.filter((n) => !n.admin || isAdmin);
  const titleMap = {
    dashboard: ["Dashboard", "Panoramica generale del tuo funnel"],
    funnel: ["Funnel", "Dove si trovano i tuoi capigruppo"],
    prenotazioni: ["Prenotazioni", "Tutti i clienti sul tuo codice"],
    venditori: ["Venditori", "Quante prenotazioni ha portato ogni PR"],
  };
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-top"><Wordmark /></div>
        <nav className="side-nav">
          {items.map(({ key, label, Icon }) => (
            <button key={key} className={`snav ${view === key ? "on" : ""}`} onClick={() => go(key)}>
              <Icon size={18} /><span>{label}</span></button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="ucard">
            <div className="uav"><IVMark size={18} /></div>
            <div className="uinfo"><b>{user.nome || user.email}</b><span>{user.email}</span></div>
          </div>
          <button className="snav ghost" onClick={logout}><LogOut size={17} /><span>Esci</span></button>
        </div>
      </aside>
      <main className="main">
        <header className="top">
          <div><h1 className="top-h">{titleMap[view][0]}</h1><p className="top-sub">{titleMap[view][1]}</p></div>
          <div className="top-right">
            <span className="chip-badge">{isAdmin ? "TUTTI I CODICI" : (user.codice_pr || "—")}</span>
            <button className="rbtn" onClick={refresh} title="Aggiorna">
              <RefreshCw size={16} className={loading ? "spin" : ""} /></button>
          </div>
        </header>
        <div className="scroll">
          {view === "dashboard" && <Dashboard leads={leads} isAdmin={isAdmin} user={user} loading={loading} go={go} />}
          {view === "funnel" && <FunnelView leads={leads} isAdmin={isAdmin} onOpen={setSel} />}
          {view === "prenotazioni" && <Prenotazioni leads={leads} isAdmin={isAdmin} initial={jump} onOpen={setSel} />}
          {view === "venditori" && isAdmin && <Venditori leads={leads} accounts={accounts} />}
        </div>
      </main>
      {sel && <Drawer lead={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

const KPIS = [
  { key: "totPax",    label: "Totale pax",          Icon: Users,        color: "#4d8bff", sub: (s) => `su ${s.active} capigruppo`, jump: { stages: ACTIVE, label: "In gioco" } },
  { key: "active",    label: "Capigruppo in gioco", Icon: UserCheck,    color: "#1E6BF1", sub: () => "attivi nel funnel", jump: { stages: ACTIVE, label: "In gioco" } },
  { key: "confirmed", label: "Confermati",          Icon: CheckCircle2, color: "#10b981", sub: (s) => `${s.convPct}% del totale`, jump: { stage: 6 } },
  { key: "working",   label: "In lavorazione",      Icon: Clock,        color: "#f5a623", sub: () => "stadi 1–5", jump: { stages: IN_LAV, label: "In lavorazione" } },
  { key: "disdette",  label: "Disdette",            Icon: XCircle,      color: "#f0453e", sub: (s) => `${(s.active + s.disdette) ? Math.round(s.disdette / (s.active + s.disdette) * 100) : 0}% del totale`, jump: { stage: 7 } },
];
function Dashboard({ leads, isAdmin, user, loading, go }) {
  const s = useMemo(() => computeStats(leads), [leads]);
  const latest = leads.slice(0, 8);
  if (leads.length === 0 && !loading) return <div className="wrap"><Empty user={user} /></div>;
  return (
    <div className="wrap">
      <div className="kpis">
        {KPIS.map((k) => (
          <button className="kpi kpi-click" key={k.key} onClick={() => go("prenotazioni", k.jump)}>
            <div className="kpi-ic" style={{ "--c": k.color }}><k.Icon size={18} /></div>
            <div className="kpi-n"><Num n={s[k.key]} /></div>
            <div className="kpi-l">{k.label}</div>
            <div className="kpi-s">{k.sub(s)}</div>
          </button>
        ))}
      </div>
      <div className="grid2">
        <section className="card">
          <div className="card-head"><h3>Stato funnel</h3>
            <button className="link" onClick={() => go("funnel")}>Dettagli <ChevronRight size={13} /></button></div>
          <FunnelRail stats={s} onStage={(n) => go("prenotazioni", { stage: n })} />
        </section>
        <section className="card">
          <div className="card-head"><h3>Ultime prenotazioni</h3>
            <button className="link" onClick={() => go("prenotazioni")}>Vedi tutte <ChevronRight size={13} /></button></div>
          <RowList rows={latest} isAdmin={isAdmin} onOpen={() => go("prenotazioni")} dense />
        </section>
      </div>
      <div className="grid3">
        <section className="card mini"><h3>Top destinazioni</h3><TopDest byMeta={s.byMeta} /></section>
        <section className="card mini"><h3>Conversione funnel</h3>
          <div className="conv"><Donut pct={s.convPct} />
            <div className="conv-sub">{s.confirmed} confermati su {s.active} in gioco</div></div></section>
        <section className="card mini"><h3>Ripartizione pratiche</h3>
          <div className="split">
            <SplitRow label="Confermate" v={s.confirmed} tot={s.active} color="#10b981" />
            <SplitRow label="In lavorazione" v={s.working} tot={s.active} color="#f5a623" />
            <SplitRow label="Disdette" v={s.disdette} tot={s.active + s.disdette} color="#f0453e" />
          </div></section>
      </div>
    </div>
  );
}
function SplitRow({ label, v, tot, color }) {
  const pct = tot ? Math.round(v / tot * 100) : 0;
  return (<div className="sr"><div className="sr-top"><span>{label}</span><b>{v}</b></div>
    <div className="sr-track"><span style={{ width: `${pct}%`, background: color }} /></div></div>);
}
function TopDest({ byMeta }) {
  const max = Math.max(1, ...byMeta.map((m) => m.pax));
  if (byMeta.length === 0) return <div className="none">Nessun dato.</div>;
  return (
    <div className="td">
      {byMeta.slice(0, 5).map((m) => (
        <div className="td-row" key={m.meta}>
          <span className="td-ic"><MapPin size={13} /></span>
          <span className="td-name">{metaShort(m.meta)}</span>
          <div className="td-bar"><span style={{ width: `${m.pax / max * 100}%` }} /></div>
          <b className="td-v"><Num n={m.pax} /><em>pax</em></b>
        </div>
      ))}
    </div>
  );
}
function Donut({ pct }) {
  const r = 52, C = 2 * Math.PI * r, off = C * (1 - pct / 100);
  return (
    <div className="donut">
      <svg viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} className="d-track" />
        <circle cx="65" cy="65" r={r} className="d-fill" strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 65 65)" />
      </svg>
      <div className="d-label"><b><Num n={pct} />%</b><span>conferme</span></div>
    </div>
  );
}
function FunnelRail({ stats, onStage, selected }) {
  const maxPax = Math.max(1, ...STAGES.map((s) => stats.byStage[s.n].pax));
  return (
    <div className="rail-funnel">
      {STAGES.map((st, i) => {
        const c = stats.byStage[st.n]; const w = (c.pax / maxPax) * 100;
        return (
          <button key={st.n} className={`fstage ${selected === st.n ? "sel" : ""} ${c.groups === 0 ? "dim" : ""}`}
            style={{ "--sc": st.color }} onClick={() => onStage && onStage(st.n)}>
            <div className="fnode-col"><span className="fnode" />{i < STAGES.length - 1 && <span className="fpipe" />}</div>
            <div className="fbody">
              <div className="fhead"><span className="fnum">{st.n}</span><span className="flabel">{st.label}</span>
                <span className="fcount"><Num n={c.groups} /></span></div>
              <div className="ftrack"><span className="ffill" style={{ width: `${w}%` }} /></div>
              <div className="fpax">{c.pax} pax</div>
            </div>
          </button>);
      })}
    </div>
  );
}
function FunnelView({ leads, isAdmin, onOpen }) {
  const [stage, setStage] = useState(null);
  const s = useMemo(() => computeStats(leads), [leads]);
  const rows = useMemo(() => stage == null ? leads : leads.filter((r) => r.stage === stage), [leads, stage]);
  if (leads.length === 0) return <div className="wrap"><div className="none pad">Nessuna prenotazione.</div></div>;
  return (
    <div className="wrap">
      <div className="grid2 f">
        <section className="card"><div className="card-head"><h3>Stadi del funnel</h3>
          {stage != null && <button className="link" onClick={() => setStage(null)}>Mostra tutti</button>}</div>
          <FunnelRail stats={s} selected={stage} onStage={(n) => setStage(stage === n ? null : n)} /></section>
        <section className="card"><div className="card-head">
          <h3>{rows.length} {rows.length === 1 ? "prenotazione" : "prenotazioni"}{stage != null && <> · {stageOf(stage).label}</>}</h3></div>
          <RowList rows={rows} isAdmin={isAdmin} onOpen={onOpen} /></section>
      </div>
    </div>
  );
}
function Prenotazioni({ leads, isAdmin, initial, onOpen }) {
  const [f, setF] = useState({ meta: "", turno: "", stage: initial?.stage ?? null, stages: initial?.stages ?? null, label: initial?.label ?? "", q: "" });
  useEffect(() => { if (initial) setF((x) => ({ ...x, stage: initial.stage ?? null, stages: initial.stages ?? null, label: initial.label ?? "" })); }, [initial]);
  const turni = useMemo(() => [...new Set(leads.map((r) => r.turno).filter(Boolean))].sort(), [leads]);
  const rows = useMemo(() => leads.filter((r) => {
    if (f.meta && r.meta !== f.meta) return false;
    if (f.turno && r.turno !== f.turno) return false;
    if (f.stages && f.stages.length) { if (!f.stages.includes(r.stage)) return false; }
    else if (f.stage != null && r.stage !== f.stage) return false;
    if (f.q) { const q = f.q.toLowerCase(); if (!(`${r.cod} ${r.nome} ${r.can} ${r.city}`.toLowerCase().includes(q))) return false; }
    return true;
  }), [leads, f]);
  const dirty = f.meta || f.turno || f.stage != null || (f.stages && f.stages.length) || f.q;
  const reset = () => setF({ meta: "", turno: "", stage: null, stages: null, label: "", q: "" });
  if (leads.length === 0) return <div className="wrap"><div className="none pad">Nessuna prenotazione.</div></div>;
  return (
    <div className="wrap">
      <div className="toolbar">
        <div className="search"><Search size={15} /><input placeholder="Cerca codice, nome, città…"
          value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <select value={f.meta} onChange={(e) => setF({ ...f, meta: e.target.value })}>
          <option value="">Tutte le mete</option>{META.map((m) => <option key={m.key} value={m.key}>{m.short}</option>)}</select>
        <select value={f.turno} onChange={(e) => setF({ ...f, turno: e.target.value })}>
          <option value="">Tutti i turni</option>{turni.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select value={f.stage ?? ""} onChange={(e) => setF({ ...f, stage: e.target.value === "" ? null : +e.target.value, stages: null, label: "" })}>
          <option value="">Tutti gli stati</option>{STAGES.map((st) => <option key={st.n} value={st.n}>{st.n} · {st.short}</option>)}</select>
        {f.stages && f.label && <span className="active-chip">{f.label}<button onClick={() => setF({ ...f, stages: null, label: "" })} aria-label="Rimuovi filtro"><X size={13} /></button></span>}
        {dirty && <button className="clear" onClick={reset}>Azzera</button>}
      </div>
      <section className="card">
        <div className="card-head"><h3>{rows.length} {rows.length === 1 ? "prenotazione" : "prenotazioni"}</h3></div>
        <RowList rows={rows} isAdmin={isAdmin} onOpen={onOpen} />
      </section>
    </div>
  );
}
function RowList({ rows, isAdmin, onOpen, dense }) {
  if (rows.length === 0) return <div className="none pad">Nessuna prenotazione con questi filtri.</div>;
  return (
    <div className="rows">
      {rows.slice(0, 300).map((r, i) => {
        const st = stageOf(r.stage);
        return (
          <button key={r.cod + i} className={`row ${dense ? "dense" : ""} ${isAdmin ? "adm" : ""}`} onClick={() => onOpen(r)}>
            <span className="cod">{r.cod}</span>
            <span className="rnome">{r.nome || "—"}</span>
            <span className="chips"><span className="chip">{metaShort(r.meta)}</span>
              {r.turno && <span className="chip ghost">{r.turno}</span>}</span>
            <span className="rpax"><Num n={r.pax} /><em>pax</em></span>
            <span className="pill" style={{ "--sc": st.color }}>{st.short}</span>
            {isAdmin && <span className="rcan">{r.can}</span>}
            <ChevronRight size={15} className="rgo" />
          </button>);
      })}
      {rows.length > 300 && <div className="more">+{rows.length - 300} altre — restringi con i filtri</div>}
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
function Venditori({ leads, accounts = [] }) {
  const [sort, setSort] = useState("groups");   // groups | pax | conf
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [selected, setSelected] = useState(null);   // codice PR aperto nel dettaglio

  const data = useMemo(() => {
    const m = {};
    // seed da TUTTI i PR (anche a zero), con nome per esteso
    accounts.filter((a) => a.ruolo !== "admin" && a.codice_pr).forEach((a) => {
      m[a.codice_pr] = { code: a.codice_pr, nome: a.nome, canale: a.ruolo === "canale",
        groups: 0, pax: 0, conf: 0, confPax: 0, working: 0, disdette: 0 };
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

  const view = useMemo(() => {
    let a = data;
    if (onlyActive) a = a.filter((d) => d.groups > 0);
    if (q) a = a.filter((d) => `${d.code} ${d.nome}`.toLowerCase().includes(q.toLowerCase()));
    const key = sort === "pax" ? "pax" : sort === "conf" ? "conf" : "groups";
    return [...a].sort((x, y) => y[key] - x[key] || y.groups - x.groups);
  }, [data, sort, q, onlyActive]);

  const maxG = Math.max(1, ...data.map((d) => d.groups));
  const tot = data.reduce((a, d) => ({ g: a.g + d.groups, p: a.p + d.pax, c: a.c + d.conf }), { g: 0, p: 0, c: 0 });
  const attivi = data.filter((d) => d.groups > 0).length;

  return (
    <div className="wrap">
      <div className="kpis four">
        <div className="kpi"><div className="kpi-n"><Num n={attivi} /></div><div className="kpi-l">PR con prenotazioni</div><div className="kpi-s">su {data.length} totali</div></div>
        <div className="kpi"><div className="kpi-n"><Num n={tot.g} /></div><div className="kpi-l">Prenotazioni totali</div><div className="kpi-s">capigruppo</div></div>
        <div className="kpi"><div className="kpi-n"><Num n={tot.p} /></div><div className="kpi-l">Pax totali</div></div>
        <div className="kpi"><div className="kpi-n green"><Num n={tot.c} /></div><div className="kpi-l">Confermate</div><div className="kpi-s">{tot.g ? Math.round(tot.c / tot.g * 100) : 0}% del totale</div></div>
      </div>

      <div className="toolbar">
        <div className="search"><Search size={15} /><input placeholder="Cerca PR per nome o codice…"
          value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="groups">Ordina: prenotazioni</option>
          <option value="pax">Ordina: pax</option>
          <option value="conf">Ordina: confermate</option>
        </select>
        <button className={`toggle ${onlyActive ? "on" : ""}`} onClick={() => setOnlyActive(!onlyActive)}>
          {onlyActive ? "Solo chi ha prenotato" : "Tutti i PR"}
        </button>
      </div>

      <div className="vlegend">
        <span><i style={{ background: "#10b981" }} />Confermate</span>
        <span><i style={{ background: "#f5a623" }} />In lavorazione</span>
        <span><i style={{ background: "#f0453e" }} />Disdette</span>
      </div>

      <section className="card">
        <div className="vlist">
          {view.map((d, i) => (
            <button className={`vrow ${d.groups === 0 ? "zero" : ""}`} key={d.code}
              onClick={() => d.groups > 0 && setSelected(d.code)} disabled={d.groups === 0}>
              <span className="vrank">{i + 1}</span>
              <div className="vavatar">{initials(d.nome)}</div>
              <div className="vid">
                <div className="vname">{d.nome}{d.canale && <span className="vtag">canale</span>}</div>
                <span className="chip-badge sm">{d.code}</span>
              </div>
              <div className="vbar" title={`${d.conf} confermate · ${d.working} in lavorazione · ${d.disdette} disdette`}>
                <div className="vseg" style={{ width: `${d.conf / maxG * 100}%`, background: "#10b981" }} />
                <div className="vseg" style={{ width: `${d.working / maxG * 100}%`, background: "#f5a623" }} />
                <div className="vseg" style={{ width: `${d.disdette / maxG * 100}%`, background: "#f0453e" }} />
              </div>
              <div className="vgroups"><b><Num n={d.groups} /></b><span>prenotaz.</span></div>
              <div className="vpax"><b><Num n={d.pax} /></b><span>pax</span></div>
              <div className="vconv">{d.conv}%<span>conv.</span></div>
              {d.groups > 0 && <ChevronRight size={16} className="vchev" />}
            </button>
          ))}
          {view.length === 0 && <div className="none pad">Nessun PR con questi filtri.</div>}
        </div>
      </section>

      {selected && (
        <VenditoreDetail
          info={data.find((d) => d.code === selected)}
          leads={leads.filter((r) => r.can === selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
function VenditoreDetail({ info, leads, onClose }) {
  useEffect(() => { const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  if (!info) return null;

  const byStage = STAGES.map((s) => ({ ...s, n: s.n, count: leads.filter((r) => r.stage === s.n).length,
    pax: leads.filter((r) => r.stage === s.n).reduce((a, r) => a + r.pax, 0) })).filter((s) => s.count > 0);
  const byMeta = Object.values(leads.reduce((m, r) => {
    const k = r.meta || "—"; if (!m[k]) m[k] = { meta: k, count: 0, pax: 0 };
    m[k].count++; m[k].pax += r.pax; return m; }, {})).sort((a, b) => b.count - a.count);
  const rows = [...leads].sort((a, b) => (b.stage === 6) - (a.stage === 6) || b.pax - a.pax);

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer wide" onClick={(e) => e.stopPropagation()}>
        <header className="vd-head">
          <div className="vd-id">
            <div className="vavatar lg">{initials(info.nome)}</div>
            <div>
              <div className="vd-name">{info.nome}{info.canale && <span className="vtag">canale</span>}</div>
              <span className="chip-badge">{info.code}</span>
            </div>
          </div>
          <button className="x" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="vd-stats">
          <div className="vd-stat"><b><Num n={info.groups} /></b><span>prenotazioni</span></div>
          <div className="vd-stat"><b><Num n={info.pax} /></b><span>pax totali</span></div>
          <div className="vd-stat"><b className="green"><Num n={info.conf} /></b><span>confermate</span></div>
          <div className="vd-stat"><b className="green">{info.conv}%</b><span>conversione</span></div>
        </div>

        <div className="vd-sub">
          <div className="vd-mini"><b>{info.working}</b><span>in lavorazione</span></div>
          <div className="vd-mini"><b>{info.disdette}</b><span>disdette</span></div>
          <div className="vd-mini"><b><Num n={info.confPax} /></b><span>pax confermati</span></div>
        </div>

        <section className="vd-block">
          <h4>Per stato</h4>
          {byStage.map((s) => (
            <div className="vd-line" key={s.n}>
              <span className="vd-dot" style={{ background: s.color }} />
              <span className="vd-line-label">{s.label}</span>
              <span className="vd-line-val">{s.count} <em>· {s.pax} pax</em></span>
            </div>
          ))}
        </section>

        <section className="vd-block">
          <h4>Per destinazione</h4>
          {byMeta.map((m) => (
            <div className="vd-line" key={m.meta}>
              <span className="vd-line-label">{m.meta}</span>
              <span className="vd-line-val">{m.count} <em>· {m.pax} pax</em></span>
            </div>
          ))}
        </section>

        <section className="vd-block">
          <h4>Prenotazioni ({rows.length})</h4>
          <div className="vd-rows">
            {rows.map((r) => { const st = stageOf(r.stage); return (
              <div className="vd-row" key={r.cod}>
                <div className="vd-row-main">
                  <span className="vd-row-nome">{r.nome || r.cod}</span>
                  <span className="vd-row-meta">{r.meta}{r.turno ? ` · ${r.turno}` : ""}{r.city && r.city !== "-" ? ` · ${r.city}` : ""}</span>
                </div>
                <span className="vd-row-pax">{r.pax} pax</span>
                <span className="vd-badge" style={{ color: st.color, borderColor: st.color + "55", background: st.color + "18" }}>{st.short}</span>
              </div>
            ); })}
          </div>
        </section>
      </aside>
    </div>
  );
}
function initials(name) {
  const p = (name || "").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "—";
}
function Drawer({ lead, onClose }) {
  const s = stageOf(lead.stage);
  useEffect(() => { const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
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

function StyleTag() { return <style dangerouslySetInnerHTML={{ __html: CSS }} />; }
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
:root{--bg:#080f16;--bg2:#0b141d;--panel:#101d29;--line:rgba(255,255,255,.07);
--blue:#1E6BF1;--blue2:#4d8bff;--ink:#eef4ff;--muted:#8fa0b4;--faint:#5a6b7d;
--green:#10b981;--amber:#f5a623;--red:#f0453e;
--disp:'Space Grotesk',-apple-system,system-ui,sans-serif;--mono:'Space Mono',ui-monospace,monospace;}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body,#root{background:var(--bg);min-height:100dvh}
.shell,.login,.boot{font-family:var(--disp);color:var(--ink);font-variant-numeric:tabular-nums}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
input,select{font-family:inherit}
:focus-visible{outline:2px solid var(--blue2);outline-offset:2px;border-radius:6px}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
h1,h2,h3{font-weight:600;letter-spacing:-.01em}
.wordmark{display:flex;align-items:center;gap:9px;font-weight:700;letter-spacing:.16em;font-size:15px}
.boot{min-height:100dvh;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;color:var(--muted);font-size:13px}
.blogo,.lc-logo{width:52px;height:52px;border-radius:16px;background:var(--blue);display:grid;place-items:center;box-shadow:0 8px 26px -6px rgba(30,107,241,.7)}
.login{position:relative;min-height:100dvh;display:grid;grid-template-columns:1.05fr .95fr;overflow:hidden;background:linear-gradient(160deg,#0a1420,#060b12)}
.login-bg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.glow{position:absolute;border-radius:50%;filter:blur(50px);background:radial-gradient(circle,rgba(30,107,241,.55),transparent 62%);will-change:transform}
.glow.g1{width:760px;height:760px;top:-280px;left:-180px;opacity:.5;animation:drift1 19s ease-in-out infinite}
.glow.g2{width:640px;height:640px;bottom:-260px;right:-140px;opacity:.34;animation:drift2 23s ease-in-out infinite}
.glow.g3{width:520px;height:520px;top:35%;left:45%;opacity:.20;background:radial-gradient(circle,rgba(77,139,255,.5),transparent 62%);animation:drift3 27s ease-in-out infinite}
@keyframes drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(140px,90px) scale(1.14)}}
@keyframes drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-110px,-80px) scale(1.1)}}
@keyframes drift3{0%,100%{transform:translate(0,0)}50%{transform:translate(-90px,60px)}}
.login-hero{position:relative;z-index:1;padding:56px 60px;display:flex;flex-direction:column}
.login-hero .wordmark{margin-bottom:auto}
.eyebrow{color:var(--blue2);font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;margin:40px 0 16px}
.login-hero h1{font-size:44px;line-height:1.05;letter-spacing:-.03em}
.login-hero p{color:var(--muted);font-size:15px;margin:16px 0 30px;max-width:360px;line-height:1.5}
.feats{list-style:none;display:flex;flex-direction:column;gap:14px;margin-bottom:20px}
.feats li{display:flex;align-items:center;gap:12px;font-size:14px;color:#cbd6e4}
.fic{width:30px;height:30px;border-radius:9px;background:rgba(30,107,241,.14);color:var(--blue2);display:grid;place-items:center;flex-shrink:0}
.wave-canvas{position:absolute;inset:0;width:100%;height:100%}
.login-side{position:relative;z-index:1;display:grid;place-items:center;padding:24px}
.login-card{position:relative;width:100%;max-width:400px;background:linear-gradient(180deg,rgba(20,34,48,.9),rgba(13,26,37,.9));
border:1px solid rgba(30,107,241,.22);border-radius:22px;padding:40px 32px 32px;box-shadow:0 30px 80px -24px rgba(0,0,0,.7);backdrop-filter:blur(8px)}
.lc-logo{margin:-64px auto 18px;width:56px;height:56px;animation:pulse 3.6s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 8px 26px -6px rgba(30,107,241,.7)}50%{box-shadow:0 10px 46px 0 rgba(30,107,241,.95)}}
.login-card h2{text-align:center;font-size:20px;margin-bottom:24px}
.fld{display:block;margin-bottom:15px}
.fld span{display:block;font-size:12px;color:var(--muted);margin-bottom:6px}
.fld input{width:100%;background:#0a141d;border:1px solid var(--line);border-radius:12px;padding:12px 14px;color:var(--ink);font-size:14px;transition:border .15s}
.fld input:focus{border-color:var(--blue);outline:none}
.linkbtn{color:var(--blue2);font-size:13px;margin:-4px 0 14px}
.hint{font-size:12px;color:var(--muted);background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:12px}
.login-err{color:var(--red);font-size:13px;margin-bottom:12px}
.btn-primary{width:100%;background:var(--blue);color:#fff;font-weight:600;font-size:15px;padding:13px;border-radius:12px;
display:flex;align-items:center;justify-content:center;gap:6px;transition:transform .12s,background .15s}
.btn-primary:hover{background:#1657ce}.btn-primary:active{transform:translateY(1px)}.btn-primary:disabled{opacity:.6}
.login-stack{width:100%;max-width:400px;display:flex;flex-direction:column;gap:14px}
.login-stack .login-card{max-width:none}
.quick{background:linear-gradient(180deg,rgba(20,34,48,.7),rgba(13,26,37,.7));border:1px solid var(--line);border-radius:16px;padding:14px;backdrop-filter:blur(8px)}
.quick-head{font-size:11px;color:var(--faint);letter-spacing:.02em;margin-bottom:10px}
.quick-search{display:flex;align-items:center;gap:7px;background:#0a141d;border:1px solid var(--line);border-radius:10px;padding:0 10px;color:var(--faint);margin-bottom:10px}
.quick-search input{background:none;border:none;color:var(--ink);padding:8px 0;font-size:13px;width:100%;outline:none}
.quick-list{display:flex;flex-wrap:wrap;gap:6px;max-height:172px;overflow-y:auto}
.qchip{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:9px;padding:6px 9px;transition:border-color .13s,background .13s;max-width:100%}
.qchip:hover{border-color:rgba(30,107,241,.5);background:#13212f}
.qcode{font-family:var(--mono);font-size:10px;font-weight:700;color:var(--blue2);flex-shrink:0}
.qname{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.quick-none{font-size:12px;color:var(--faint);padding:6px}
.shell{display:flex;min-height:100dvh}
.side{width:236px;flex-shrink:0;background:var(--bg2);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:22px 16px;position:sticky;top:0;height:100dvh}
.side-top{padding:4px 8px 22px}
.side-nav{display:flex;flex-direction:column;gap:4px;flex:1}
.snav{display:flex;align-items:center;gap:12px;padding:11px 13px;border-radius:12px;color:var(--muted);font-size:14px;font-weight:500;transition:background .14s,color .14s}
.snav:hover{background:rgba(255,255,255,.04);color:var(--ink)}
.snav.on{background:rgba(30,107,241,.16);color:var(--blue2);font-weight:600}
.snav.ghost{color:var(--faint)}.snav.ghost:hover{color:var(--ink)}
.side-bottom{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:14px}
.ucard{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.03)}
.uav{width:34px;height:34px;border-radius:10px;background:var(--blue);display:grid;place-items:center;flex-shrink:0}
.uinfo{min-width:0}.uinfo b{display:block;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.uinfo span{font-size:11px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 32px 20px;border-bottom:1px solid var(--line)}
.top-h{font-size:24px}.top-sub{font-size:13px;color:var(--muted);margin-top:3px}
.top-right{display:flex;align-items:center;gap:12px}
.chip-badge{font-family:var(--mono);font-size:11px;font-weight:700;color:var(--blue2);background:rgba(30,107,241,.14);border:1px solid rgba(30,107,241,.3);padding:6px 11px;border-radius:9px;letter-spacing:.04em}
.chip-badge.sm{font-size:10px;padding:3px 8px}
.rbtn{width:38px;height:38px;border-radius:11px;background:var(--panel);border:1px solid var(--line);color:var(--muted);display:grid;place-items:center}
.rbtn:hover{color:var(--ink)}
.scroll{flex:1;overflow-y:auto}
.wrap{padding:26px 32px 44px;max-width:1240px;margin:0 auto;width:100%}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:22px}
.kpis.four{grid-template-columns:repeat(4,1fr)}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px 18px 16px}
.kpi-click{width:100%;text-align:left;cursor:pointer;transition:border-color .15s,background .15s,transform .12s,box-shadow .15s}
.kpi-click:hover{border-color:rgba(30,107,241,.55);background:#13212f;transform:translateY(-3px);box-shadow:0 14px 30px -14px rgba(30,107,241,.55)}
.kpi-click:hover .kpi-ic{transform:scale(1.06)}
.kpi-click:active{transform:translateY(-1px)}
.kpi-ic{transition:transform .15s}
.active-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--blue2);background:rgba(30,107,241,.14);border:1px solid rgba(30,107,241,.3);padding:8px 8px 8px 12px;border-radius:11px}
.active-chip button{display:grid;place-items:center;color:var(--blue2);opacity:.8}
.active-chip button:hover{opacity:1}
.kpi-ic{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;margin-bottom:14px;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent)}
.kpi-n{font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1}
.kpi-n.green{color:var(--green)}
.kpi-l{font-size:13px;color:var(--ink);margin-top:6px;font-weight:500}
.kpi-s{font-size:11.5px;color:var(--faint);margin-top:3px}
.grid2{display:grid;grid-template-columns:400px 1fr;gap:18px;margin-bottom:18px}
.grid2.f{grid-template-columns:400px 1fr}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.card.mini{padding:18px 20px}
.card-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--line)}
.card-head h3{font-size:15px}
.card.mini h3{font-size:14px;margin-bottom:16px}
.link{display:flex;align-items:center;gap:3px;font-size:12px;color:var(--blue2)}
.rail-funnel{display:flex;flex-direction:column;padding:8px 16px 4px}
.fstage{display:flex;gap:13px;text-align:left;padding:8px 6px;border-radius:12px;transition:background .15s;--sc:#888}
.fstage:hover{background:rgba(255,255,255,.03)}.fstage.sel{background:rgba(255,255,255,.06)}.fstage.dim{opacity:.4}
.fnode-col{display:flex;flex-direction:column;align-items:center;padding-top:5px}
.fnode{width:11px;height:11px;border-radius:50%;background:var(--sc);box-shadow:0 0 0 4px color-mix(in srgb,var(--sc) 22%,transparent);flex-shrink:0}
.fpipe{width:2px;flex:1;background:linear-gradient(var(--sc),rgba(255,255,255,.06));margin-top:4px;min-height:16px}
.fbody{flex:1;min-width:0;padding-bottom:5px}
.fhead{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}
.fnum{font-family:var(--mono);font-size:12px;color:var(--sc);font-weight:700}
.flabel{font-size:13px;font-weight:500;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fcount{font-size:15px;font-weight:700}
.ftrack{height:6px;background:rgba(255,255,255,.05);border-radius:99px;overflow:hidden}
.ffill{display:block;height:100%;background:var(--sc);border-radius:99px;transition:width .7s cubic-bezier(.2,.7,.2,1)}
.fpax{font-size:11px;color:var(--faint);margin-top:4px}
.rows{display:flex;flex-direction:column}
.row{display:grid;grid-template-columns:96px 1fr auto auto auto 15px;align-items:center;gap:14px;padding:13px 20px;border-bottom:1px solid var(--line);text-align:left;transition:background .12s}
.row.adm{grid-template-columns:96px minmax(0,1fr) auto auto auto auto 15px}
.row.dense{padding:11px 20px}
.row:last-child{border-bottom:none}.row:hover{background:rgba(255,255,255,.03)}
.cod{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--muted)}
.cod.big{font-size:16px;color:var(--blue2)}
.rnome{font-size:14px;font-weight:500;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chips{display:flex;gap:6px}
.chip{font-size:10.5px;font-weight:600;letter-spacing:.04em;color:var(--muted);background:rgba(255,255,255,.05);border-radius:6px;padding:3px 7px}
.chip.ghost{background:none;border:1px solid var(--line);color:var(--faint)}
.rpax{font-size:15px;font-weight:700;text-align:right}.rpax em{font-style:normal;font-size:9px;color:var(--faint);margin-left:3px;font-weight:400}
.pill{font-size:11px;font-weight:600;color:var(--sc);background:color-mix(in srgb,var(--sc) 15%,transparent);border:1px solid color-mix(in srgb,var(--sc) 34%,transparent);padding:4px 9px;border-radius:99px;white-space:nowrap}
.pill.lg{font-size:13px;padding:6px 13px;display:inline-block;margin:12px 0 4px}
.rcan{font-family:var(--mono);font-size:11px;color:var(--faint);min-width:38px;text-align:right}
.rgo{color:var(--faint)}
.more{padding:14px 20px;font-size:12px;color:var(--faint);text-align:center}
.none{color:var(--faint);font-size:13px}.none.pad{padding:30px 20px;text-align:center}
.toolbar{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:18px}
.search{display:flex;align-items:center;gap:7px;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:0 12px;color:var(--faint);min-width:230px;flex:1;max-width:340px}
.search input{background:none;border:none;color:var(--ink);padding:10px 0;font-size:13px;width:100%;outline:none}
.toolbar select{background:var(--panel);border:1px solid var(--line);color:var(--muted);border-radius:11px;padding:10px 12px;font-size:13px;cursor:pointer}
.clear{font-size:12px;color:var(--blue2);padding:0 8px}
.td{display:flex;flex-direction:column;gap:12px}
.td-row{display:grid;grid-template-columns:24px 70px 1fr auto;align-items:center;gap:10px}
.td-ic{width:24px;height:24px;border-radius:7px;background:rgba(30,107,241,.12);color:var(--blue2);display:grid;place-items:center}
.td-name{font-size:12px;font-weight:600;color:var(--muted)}
.td-bar{height:8px;background:rgba(255,255,255,.05);border-radius:99px;overflow:hidden}
.td-bar span{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--blue2));border-radius:99px;transition:width .8s cubic-bezier(.2,.7,.2,1)}
.td-v{font-size:14px;font-weight:700}.td-v em{font-style:normal;font-size:9px;color:var(--faint);margin-left:3px;font-weight:400}
.conv{display:flex;flex-direction:column;align-items:center;gap:12px;padding-top:4px}
.donut{position:relative;width:150px;height:150px}.donut svg{width:100%;height:100%}
.d-track{fill:none;stroke:rgba(255,255,255,.06);stroke-width:12}
.d-fill{fill:none;stroke:var(--green);stroke-width:12;stroke-linecap:round;transition:stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)}
.d-label{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.d-label b{font-size:28px;font-weight:700}.d-label span{font-size:11px;color:var(--faint)}
.conv-sub{font-size:12px;color:var(--muted);text-align:center}
.split{display:flex;flex-direction:column;gap:15px}
.sr-top{display:flex;justify-content:space-between;font-size:13px;color:var(--muted);margin-bottom:6px}
.sr-top b{color:var(--ink);font-size:14px}
.sr-track{height:8px;background:rgba(255,255,255,.05);border-radius:99px;overflow:hidden}
.sr-track span{display:block;height:100%;border-radius:99px;transition:width .8s cubic-bezier(.2,.7,.2,1)}
.empty{padding:70px 24px;text-align:center}
.empty-mark{width:52px;height:52px;border-radius:15px;background:rgba(30,107,241,.12);color:var(--blue2);display:grid;place-items:center;margin:0 auto 16px}
.empty-t{font-size:16px;font-weight:500;margin-bottom:6px}.empty-t b{font-family:var(--mono);color:var(--blue2)}
.empty-s{font-size:13px;color:var(--muted);max-width:340px;margin:0 auto;line-height:1.5}
.rk-list{display:flex;flex-direction:column}
.rk-row{display:grid;grid-template-columns:34px 64px 1fr auto;align-items:center;gap:16px;padding:15px 20px;border-bottom:1px solid var(--line)}
.rk-row:last-child{border-bottom:none}
.rk-pos{font-family:var(--mono);font-size:14px;color:var(--faint);font-weight:700}
.rk-bar{height:10px;background:rgba(255,255,255,.05);border-radius:99px;overflow:hidden}
.rk-bar span{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--green));border-radius:99px;transition:width .8s cubic-bezier(.2,.7,.2,1)}
.rk-nums{text-align:right;min-width:120px}.rk-nums b{font-size:18px;font-weight:700}.rk-nums em{font-style:normal;font-size:10px;color:var(--faint);margin-left:4px}
.rk-sub{display:block;font-size:11px;color:var(--faint);margin-top:2px}
.toggle{background:var(--panel);border:1px solid var(--line);color:var(--muted);border-radius:11px;padding:10px 14px;font-size:13px;font-weight:500}
.toggle.on{border-color:rgba(30,107,241,.4);color:var(--blue2);background:rgba(30,107,241,.1)}
.vlegend{display:flex;gap:18px;margin:2px 2px 14px;font-size:12px;color:var(--muted)}
.vlegend span{display:flex;align-items:center;gap:6px}
.vlegend i{width:10px;height:10px;border-radius:3px;display:inline-block}
.vlist{display:flex;flex-direction:column}
.vrow{display:grid;grid-template-columns:34px 40px minmax(0,1.3fr) 2fr 84px 64px 62px;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--line)}
.vrow:last-child{border-bottom:none}
.vrow.zero{opacity:.5}
.vrank{font-family:var(--mono);font-size:14px;font-weight:700;color:var(--faint)}
.vavatar{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;font-size:13px;font-weight:700;color:var(--blue2);background:rgba(30,107,241,.14);border:1px solid rgba(30,107,241,.22)}
.vid{min-width:0}
.vname{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:7px;margin-bottom:4px}
.vtag{font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);background:rgba(255,255,255,.06);border-radius:5px;padding:2px 5px}
.vbar{height:12px;background:rgba(255,255,255,.05);border-radius:99px;overflow:hidden;display:flex}
.vseg{height:100%;transition:width .8s cubic-bezier(.2,.7,.2,1)}
.vseg:first-child{border-radius:99px 0 0 99px}
.vgroups,.vpax,.vconv{text-align:right;line-height:1.1}
.vgroups b,.vpax b{font-size:19px;font-weight:700}
.vconv{font-size:16px;font-weight:700;color:var(--green)}
.vgroups span,.vpax span,.vconv span{display:block;font-size:10px;color:var(--faint);font-weight:400;margin-top:2px}
.vrow{width:100%;text-align:left;background:transparent;cursor:pointer;transition:background .12s}
.vrow:hover:not(.zero){background:rgba(255,255,255,.03)}
.vrow.zero{cursor:default}
.vchev{color:var(--faint);justify-self:end}
@media(max-width:820px){
.vrow{grid-template-columns:28px 1fr auto auto;gap:10px;row-gap:8px}
.vavatar,.vbar,.vchev{display:none}
.vpax{display:none}}
.drawer.wide{width:min(560px,96vw)}
.vd-head{display:flex;align-items:flex-start;justify-content:space-between;padding:22px 22px 16px;border-bottom:1px solid var(--line)}
.vd-id{display:flex;gap:14px;align-items:center}
.vavatar.lg{width:52px;height:52px;border-radius:14px;font-size:17px}
.vd-name{font-size:19px;font-weight:700;display:flex;align-items:center;gap:8px;margin-bottom:6px}
.vd-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:18px 22px 6px}
.vd-stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px;text-align:center}
.vd-stat b{display:block;font-size:22px;font-weight:700;line-height:1}
.vd-stat span{display:block;font-size:10px;color:var(--faint);margin-top:5px}
.vd-sub{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:8px 22px 6px}
.vd-mini{text-align:center;padding:8px}
.vd-mini b{display:block;font-size:16px;font-weight:700}
.vd-mini span{display:block;font-size:10px;color:var(--faint);margin-top:3px}
.vd-block{padding:16px 22px;border-top:1px solid var(--line)}
.vd-block h4{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 12px}
.vd-line{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:14px}
.vd-dot{width:9px;height:9px;border-radius:3px;flex:none}
.vd-line-label{flex:1;color:var(--text)}
.vd-line-val{font-weight:600;font-variant-numeric:tabular-nums}
.vd-line-val em{color:var(--faint);font-weight:400;font-style:normal;font-size:12px}
.vd-rows{display:flex;flex-direction:column;gap:8px;max-height:340px;overflow:auto}
.vd-row{display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--panel);border:1px solid var(--line);border-radius:10px}
.vd-row-main{flex:1;min-width:0}
.vd-row-nome{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vd-row-meta{display:block;font-size:11px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vd-row-pax{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;flex:none}
.vd-badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;border:1px solid;flex:none}
.drawer-scrim{position:fixed;inset:0;background:rgba(4,9,14,.6);backdrop-filter:blur(3px);z-index:30;display:flex;justify-content:flex-end;animation:fade .18s ease}
@keyframes fade{from{opacity:0}to{opacity:1}}
.drawer{width:min(400px,92vw);background:linear-gradient(180deg,var(--panel),#0c1824);border-left:1px solid var(--line);padding:24px 26px;overflow-y:auto;animation:slide .24s cubic-bezier(.2,.7,.2,1)}
@keyframes slide{from{transform:translateX(30px);opacity:.4}to{transform:translateX(0);opacity:1}}
.dr-head{display:flex;justify-content:space-between;align-items:center}
.dr-x{color:var(--muted);padding:6px;border-radius:8px}.dr-x:hover{background:rgba(255,255,255,.06);color:var(--ink)}
.dr-nome{font-size:22px;font-weight:600;margin-top:8px}
.dr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px;margin-top:22px;border-top:1px solid var(--line);padding-top:18px}
.dr-grid>div{padding:9px 0;border-bottom:1px solid var(--line)}
.dr-grid dt{font-size:11px;color:var(--faint);margin-bottom:3px}.dr-grid dd{font-size:15px;font-weight:500}
.dr-note{margin-top:20px;font-size:12px;color:var(--faint);line-height:1.5;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:11px;padding:12px 14px}
@media(max-width:1080px){.kpis{grid-template-columns:repeat(3,1fr)}.grid2,.grid2.f{grid-template-columns:1fr}.grid3{grid-template-columns:1fr}}
@media(max-width:900px){.login{grid-template-columns:1fr}.login-hero{display:none}.login-side{min-height:100dvh}
.row.adm{grid-template-columns:96px 1fr auto auto auto 15px}.row.adm .rcan{display:none}}
@media(max-width:720px){
.side{position:fixed;bottom:0;top:auto;left:0;right:0;width:100%;height:auto;flex-direction:row;border-right:none;border-top:1px solid var(--line);padding:8px;z-index:20;justify-content:space-around}
.side-top,.side-bottom .ucard{display:none}.side-nav{flex-direction:row;flex:none;gap:2px}
.snav span{display:none}.side-bottom{flex-direction:row;border:none;padding:0}
.main{padding-bottom:70px}.wrap{padding:18px 16px 30px}.top{padding:18px 16px 14px}
.kpis{grid-template-columns:1fr 1fr}.row,.row.adm{grid-template-columns:80px 1fr auto auto;gap:10px}.row .chips,.row .rcan,.row .rgo{display:none}
.rk-row{grid-template-columns:26px 54px 1fr auto}.rk-bar{display:none}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
