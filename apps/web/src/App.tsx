import { useCallback, useEffect, useState, type FormEvent } from "react";
import { env } from "./config/env";

type ApiStatus = "checking" | "online" | "offline";
type User = { id: string; name: string; email: string };
type Organization = { id: string; name: string; role: string; slug?: string };
type Session = { accessToken: string; user: User; organization: Organization };
type Overview = {
  period: { from: string; to: string };
  totalKgCo2e: string;
  calculationResultCount: number;
  truncated: boolean;
  byScope: Array<{ scope: string; kgCo2e: string }>;
  byCategory: Array<{ category: string; kgCo2e: string }>;
  byFacility: Array<{ facilityId: string; facilityName: string; kgCo2e: string }>;
  monthlyTrend: Array<{ month: string; kgCo2e: string }>;
  supplierCoverage: { activeSuppliers: number; suppliersWithSubmissions: number; submissionCount: number; coveragePercent: number };
  reductionTargets: Array<{ id: string; name: string; scope: string; baselineYear: number; targetYear: number; baselineKgCo2e: string; reductionPercent: string; latestScenario: null | { projectedKgCo2e: string; targetKgCo2e: string; targetMet: boolean } }>;
};

let accessToken: string | null = null;
const api = (path: string) => `${env.VITE_API_BASE_URL}${path}`;
async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response = await fetch(api(path), { ...init, headers, credentials: "include" });
  if (response.status === 401 && retry && path !== "/auth/refresh" && path !== "/auth/login" && path !== "/auth/register") {
    const refreshed = await fetch(api("/auth/refresh"), { method: "POST", credentials: "include" });
    if (refreshed.ok) {
      const data = await refreshed.json() as { accessToken: string };
      accessToken = data.accessToken;
      headers.set("Authorization", `Bearer ${accessToken}`);
      response = await fetch(api(path), { ...init, headers, credentials: "include" });
    }
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
function dateString(date: Date) { return date.toISOString().slice(0, 10); }
function number(value: string | number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(value));
}
function compact(value: string | number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
}
function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function Brand() {
  return <a className="brand" href="/" aria-label="CarbonLedger home"><span className="brand-mark">C</span><span>CarbonLedger</span><span className="brand-tag">ENTERPRISE</span></a>;
}
function Spinner() { return <span className="spinner" aria-label="Loading" />; }

function AuthScreen({ onSession }: { onSession: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { name, email, password, organizationName, organizationSlug };
      const session = await request<Session>(path, { method: "POST", body: JSON.stringify(body) }, false);
      accessToken = session.accessToken; onSession(session);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to authenticate"); }
    finally { setBusy(false); }
  }
  return <main className="auth-layout">
    <section className="auth-story">
      <Brand />
      <div className="story-content">
        <div className="eyebrow"><span className="pulse" /> SUSTAINABILITY INTELLIGENCE</div>
        <h1>Make every<br /><em>tonne count.</em></h1>
        <p>Bring emissions data, supplier accountability and climate action into one trusted operating system.</p>
        <div className="story-points"><span>01 <b>Measure</b> with traceable data</span><span>02 <b>Govern</b> every decision</span><span>03 <b>Reduce</b> with measurable action</span></div>
      </div>
      <div className="story-foot">BUILT FOR ACCOUNTABILITY · DESIGNED FOR PROGRESS</div>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        <div className="mobile-brand"><Brand /></div>
        <span className="section-kicker">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</span>
        <h2>{mode === "login" ? "Sign in to your workspace" : "Create your workspace"}</h2>
        <p className="muted">{mode === "login" ? "Access your organization's sustainability intelligence." : "Set up your organization and start governing emissions data."}</p>
        <form onSubmit={submit} className="auth-form">
          {mode === "register" && <>
            <label>Full name<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={100} required placeholder="Your name" /></label>
            <label>Organization name<input value={organizationName} onChange={e => { setOrganizationName(e.target.value); if (!slugEdited) setOrganizationSlug(slugify(e.target.value)); }} minLength={2} maxLength={160} required placeholder="Acme Industries" /></label>
            <label>Workspace slug<input value={organizationSlug} onChange={e => { setSlugEdited(true); setOrganizationSlug(slugify(e.target.value)); }} minLength={3} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required placeholder="acme-industries" /><small>Unique URL-friendly organization identifier.</small></label>
          </>}
          <label>Work email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required placeholder="you@company.com" /></label>
          <label>Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} minLength={mode === "register" ? 12 : 1} maxLength={128} required placeholder={mode === "register" ? "At least 12 characters" : "Enter your password"} /></label>
          {mode === "register" && <small className="password-hint">Use 12+ characters with uppercase, lowercase and a number.</small>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button" disabled={busy}>{busy ? <><Spinner /> Please wait</> : mode === "login" ? "Sign in" : "Create workspace"} <span aria-hidden="true">↗</span></button>
        </form>
        <p className="auth-switch">{mode === "login" ? "New to CarbonLedger?" : "Already have a workspace?"} <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}> {mode === "login" ? "Create an account" : "Sign in"}</button></p>
        <div className="secure-note"><span>◇</span> Protected by organization-level access controls</div>
      </div>
    </section>
  </main>;
}

function MetricCard({ label, value, detail, icon, accent }: { label: string; value: string; detail: string; icon: string; accent?: string }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${accent ?? ""}`}>{icon}</span></div><strong>{value}</strong><small>{detail}</small></article>;
}
function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const today = new Date();
  const [from, setFrom] = useState(dateString(new Date(today.getFullYear(), today.getMonth() - 11, 1)));
  const [to, setTo] = useState(dateString(today));
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeNav, setActiveNav] = useState("Overview");
  const [profileOpen, setProfileOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await request<Overview>(`/analytics/overview?from=${from}&to=${to}`);
      setOverview(data); setApiStatus("online");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load analytics"); setApiStatus("offline"); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);
  const maxMonth = Math.max(1, ...(overview?.monthlyTrend.map(item => Number(item.kgCo2e)) ?? []));
  const total = Number(overview?.totalKgCo2e ?? 0);
  const scopeTotal = (scope: string) => Number(overview?.byScope.find(item => item.scope === scope)?.kgCo2e ?? 0);
  const csvUrl = `${env.VITE_API_BASE_URL}/analytics/emissions.csv?from=${from}&to=${to}`;
  const csvDownload = async () => {
    try {
      const headers = new Headers({ Authorization: `Bearer ${accessToken ?? ""}` });
      let response = await fetch(csvUrl, { headers, credentials: "include" });
      if (response.status === 401) {
        const refreshed = await fetch(api("/auth/refresh"), { method: "POST", credentials: "include" });
        if (refreshed.ok) { accessToken = (await refreshed.json() as { accessToken: string }).accessToken; headers.set("Authorization", `Bearer ${accessToken}`); response = await fetch(csvUrl, { headers, credentials: "include" }); }
      }
      if (!response.ok) throw new Error("CSV export could not be generated");
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `carbonledger-emissions-${from}-to-${to}.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : "Export failed"); }
  };
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="workspace-switch"><span className="workspace-avatar">{session.organization.name.slice(0,1).toUpperCase()}</span><span><b>{session.organization.name}</b><small>{session.organization.role} WORKSPACE</small></span><span className="chevron">⌄</span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {["Overview", "Emissions", "Activity data", "Facilities", "Suppliers", "Reduction plans", "Audit & compliance"].map((item, index) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => setActiveNav(item)}><span className="nav-icon">{["◫","◌","↗","⌂","♧","◎","▤"][index]}</span>{item}{item === "Overview" ? <span className="nav-active-dot" /> : null}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">✳</span><b>Need a hand?</b><p>Explore the API and product documentation to get started.</p><a href="https://github.com/matiur25580/CarbonLedger-Enterprise-ESG-Carbon-Accounting-Platform/tree/main/docs" target="_blank" rel="noreferrer">View documentation ↗</a></div><div className="sidebar-status"><i className={apiStatus === "online" ? "green" : apiStatus === "offline" ? "red" : ""} /> API {apiStatus}</div></div>
    </aside>
    <main className="main-panel">
      <header className="main-header"><div className="breadcrumbs">Workspace <span>/</span> <b>{activeNav}</b></div><div className="header-actions"><span className="header-date">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(today)}</span><button className="icon-button" aria-label="Refresh analytics" onClick={() => void load()}>↻</button><div className="profile-wrap"><button className="profile-button" onClick={() => setProfileOpen(!profileOpen)}><span className="profile-avatar">{session.user.name.slice(0,1).toUpperCase()}</span><span className="profile-name">{session.user.name}</span><span>⌄</span></button>{profileOpen && <div className="profile-menu"><b>{session.user.name}</b><small>{session.user.email}</small><button onClick={onLogout}>Sign out</button></div>}</div></div></header>
      <section className="dashboard-content">
        <div className="page-heading"><div><div className="section-kicker">SUSTAINABILITY OVERVIEW</div><h1>Good {today.getHours() < 12 ? "morning" : today.getHours() < 18 ? "afternoon" : "evening"}, {session.user.name.split(" ")[0]}.</h1><p>Here’s your organization's emissions and climate performance at a glance.</p></div><button className="export-button" onClick={() => void csvDownload()}>↓ <span>Export emissions</span></button></div>
        <div className="filter-bar"><div className="filter-title"><span>◷</span> REPORTING PERIOD</div><label>From<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label><span className="filter-separator">—</span><label>To<input type="date" value={to} min={from} max={dateString(today)} onChange={e => setTo(e.target.value)} /></label><button onClick={() => void load()} disabled={loading}>{loading ? <Spinner /> : "Apply filters"}</button></div>
        {error && <div className="notice-error" role="alert">{error} <button onClick={() => void load()}>Retry</button></div>}
        {activeNav !== "Overview" && <div className="notice-info"><b>{activeNav}</b> workspace module is being built out. The overview below continues to show live, organization-scoped analytics from the API.</div>}
        <div className="metric-grid">
          <MetricCard label="TOTAL EMISSIONS" value={loading ? "—" : `${compact(total)}`} detail="kg CO₂e · selected period" icon="◉" accent="green" />
          <MetricCard label="CALCULATED RECORDS" value={loading ? "—" : number(overview?.calculationResultCount ?? 0)} detail={overview?.truncated ? "Result set capped at 10,000" : "Approved activity calculations"} icon="▤" />
          <MetricCard label="SUPPLIER COVERAGE" value={loading ? "—" : `${number(overview?.supplierCoverage.coveragePercent ?? 0)}%`} detail={`${overview?.supplierCoverage.suppliersWithSubmissions ?? 0} of ${overview?.supplierCoverage.activeSuppliers ?? 0} active suppliers`} icon="♧" accent="blue" />
          <MetricCard label="REDUCTION TARGETS" value={loading ? "—" : number(overview?.reductionTargets.length ?? 0)} detail="Targets configured for this organization" icon="◎" accent="amber" />
        </div>
        <div className="analytics-grid">
          <section className="panel trend-panel"><div className="panel-heading"><div><span className="section-kicker">PERFORMANCE</span><h2>Emissions trend</h2></div><span className="unit-label">kg CO₂e / month</span></div>
            {loading ? <div className="chart-loading"><Spinner /> Loading trend…</div> : (overview?.monthlyTrend.length ?? 0) === 0 ? <div className="empty-state"><span>◌</span><b>No calculated emissions yet</b><p>Once approved activity records are calculated, your monthly trend will appear here.</p></div> : <div className="bar-chart" role="img" aria-label="Monthly emissions bar chart">{overview!.monthlyTrend.map(item => <div className="bar-column" key={item.month}><span className="bar-value">{compact(item.kgCo2e)}</span><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(4, Number(item.kgCo2e) / maxMonth * 100)}%` }} /></div><span className="bar-label">{new Date(`${item.month}-02T00:00:00`).toLocaleDateString("en", { month: "short" })}</span></div>)}</div>}
          </section>
          <section className="panel scope-panel"><div className="panel-heading"><div><span className="section-kicker">EMISSIONS MIX</span><h2>By GHG scope</h2></div><span className="unit-label">kg CO₂e</span></div>
            <div className="scope-total"><strong>{loading ? "—" : compact(total)}</strong><span>Total emissions</span></div>
            <div className="scope-list">{["SCOPE_1","SCOPE_2","SCOPE_3"].map((scope,index) => { const value=scopeTotal(scope); const percent=total ? value/total*100 : 0; return <div className="scope-row" key={scope}><div className="scope-meta"><span><i className={`scope-dot scope-${index+1}`} />{scope.replace("_"," ")}</span><b>{loading ? "—" : `${number(percent)}%`}</b></div><div className="scope-track"><span className={`scope-fill scope-${index+1}`} style={{ width: `${percent}%` }} /></div><small>{loading ? "—" : number(value)} kg CO₂e</small></div>; })}</div>
          </section>
        </div>
        <div className="lower-grid">
          <section className="panel"><div className="panel-heading"><div><span className="section-kicker">OPERATIONAL FOOTPRINT</span><h2>Top facilities</h2></div><span className="subtle-link">By emissions</span></div>
            {loading ? <div className="chart-loading"><Spinner /></div> : (overview?.byFacility.length ?? 0) === 0 ? <div className="empty-inline">No facility emissions in this period.</div> : <div className="data-list">{overview!.byFacility.slice(0,5).map((facility,index) => <div className="facility-row" key={facility.facilityId}><span className="rank">{String(index+1).padStart(2,"0")}</span><span className="facility-symbol">⌂</span><span className="facility-name">{facility.facilityName}</span><b>{number(facility.kgCo2e)} <small>kg</small></b></div>)}</div>}
          </section>
          <section className="panel"><div className="panel-heading"><div><span className="section-kicker">CLIMATE STRATEGY</span><h2>Reduction targets</h2></div><span className="subtle-link">Latest scenario</span></div>
            {loading ? <div className="chart-loading"><Spinner /></div> : (overview?.reductionTargets.length ?? 0) === 0 ? <div className="empty-inline">No reduction targets configured yet.</div> : <div className="data-list">{overview!.reductionTargets.slice(0,4).map(target => <div className="target-row" key={target.id}><span className="target-symbol">◎</span><div className="target-name"><b>{target.name}</b><small>{target.scope.replace("_"," ")} · target year {target.targetYear}</small></div><span className={target.latestScenario?.targetMet ? "target-status met" : "target-status"}>{target.latestScenario ? target.latestScenario.targetMet ? "On track" : "In progress" : "No scenario"}</span></div>)}</div>}
          </section>
        </div>
        <footer className="dashboard-footer"><span>CARBONLEDGER · SUSTAINABILITY INTELLIGENCE</span><span>Data shown from saved calculation snapshots · {from} — {to}</span></footer>
      </section>
    </main>
  </div>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(api("/auth/refresh"), { method: "POST", credentials: "include", signal: controller.signal })
      .then(async response => {
        if (!response.ok) return null;
        return response.json() as Promise<{ accessToken: string }>;
      })
      .then(async result => {
        if (!result || controller.signal.aborted) return;
        accessToken = result.accessToken;
        const current = await request<{ user: User; organizationId: string; role: string }>("/auth/me");
        const organization = await request<{ organization: Organization }>("/auth/organization");
        if (!controller.signal.aborted) setSession({ accessToken: result.accessToken, user: current.user, organization: { ...organization.organization, role: current.role } });
      })
      .catch(() => { accessToken = null; })
      .finally(() => { if (!controller.signal.aborted) setRestoring(false); });
    return () => controller.abort();
  }, []);
  const handleLogout = async () => {
    try { await fetch(api("/auth/logout"), { method: "POST", credentials: "include" }); } finally { accessToken = null; setSession(null); }
  };
  if (restoring) return <div className="boot-screen"><Brand /><Spinner /><span>Restoring secure workspace…</span></div>;
  return session ? <Dashboard session={session} onLogout={() => void handleLogout()} /> : <AuthScreen onSession={setSession} />;
}
