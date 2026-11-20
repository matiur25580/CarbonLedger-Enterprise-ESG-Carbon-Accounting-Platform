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


type Facility = { id: string; code: string; name: string; countryCode: string; region?: string | null; city?: string | null; timezone: string; isActive: boolean };
type ActivityRecord = { id: string; facilityId: string; category: string; scope: string; quantity: string; unit: string; periodStart: string; periodEnd: string; sourceName: string; sourceReference?: string | null; notes?: string | null; status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED"; createdByUserId: string; createdBy?: { id: string; name: string }; facility?: { id: string; code: string; name: string }; createdAt: string };
type ImportPreview = { totalRows: number; validRows: number; duplicateRows: number; errorRows: number; qualityScore: number; canCommit: boolean; issues: Array<{ rowNumber: number; code: string; message: string }>; duplicateDetails: Array<{ rowNumber: number; duplicateOf?: number; reason: string }>; contentSha256: string; fileName: string };
const ACTIVITY_CATEGORIES = ["ELECTRICITY","NATURAL_GAS","DIESEL","PETROL","LPG","REFRIGERANTS","COMPANY_VEHICLES","BUSINESS_TRAVEL","WASTE","WATER","PURCHASED_GOODS","FREIGHT","OTHER"] as const;
const categoryScope: Record<string,string> = { ELECTRICITY:"SCOPE_2", NATURAL_GAS:"SCOPE_1", DIESEL:"SCOPE_1", PETROL:"SCOPE_1", LPG:"SCOPE_1", REFRIGERANTS:"SCOPE_1", COMPANY_VEHICLES:"SCOPE_1", BUSINESS_TRAVEL:"SCOPE_3", WASTE:"SCOPE_3", WATER:"SCOPE_3", PURCHASED_GOODS:"SCOPE_3", FREIGHT:"SCOPE_3", OTHER:"SCOPE_3" };
const dateInput = () => new Date().toISOString().slice(0,10);
function downloadText(name: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
function ActivityWorkspace({ session, activeNav }: { session: Session; activeNav: string }) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [imports, setImports] = useState<Array<{id:string;fileName:string;totalRows:number;importedRows:number;status:string;createdAt:string}>>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showEntry, setShowEntry] = useState(false);
  const [category, setCategory] = useState<string>("ELECTRICITY");
  const [facilityId, setFacilityId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("kWh");
  const [periodStart, setPeriodStart] = useState(dateInput());
  const [periodEnd, setPeriodEnd] = useState(dateInput());
  const [sourceName, setSourceName] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [notes, setNotes] = useState("");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [calculation, setCalculation] = useState<{recordId:string;kgCo2e:string;factorCode:string}|null>(null);
  const canReview = ["OWNER","ADMIN","AUDITOR"].includes(session.organization.role);
  const canManageFacilities = ["OWNER","ADMIN"].includes(session.organization.role);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [facilityData, recordData, importData] = await Promise.all([
        request<{facilities:Facility[]}>("/facilities"),
        request<{records:ActivityRecord[]}>("/activity-records?limit=100"),
        request<{batches:Array<{id:string;fileName:string;totalRows:number;importedRows:number;status:string;createdAt:string}>}>("/activity-imports?limit=10")
      ]);
      setFacilities(facilityData.facilities); setRecords(recordData.records); setImports(importData.batches);
      setFacilityId(current => current || facilityData.facilities.find(item => item.isActive)?.id || "");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load activity workspace"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visibleRecords = records.filter(record => statusFilter === "ALL" || record.status === statusFilter);
  const activeFacilities = facilities.filter(item => item.isActive);
  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await request("/activity-records", { method:"POST", body:JSON.stringify({ facilityId, category, scope:categoryScope[category] ?? "SCOPE_3", quantity:Number(quantity), unit, periodStart, periodEnd, sourceName, ...(sourceReference ? {sourceReference} : {}), ...(notes ? {notes} : {}) }) });
      setNotice("Activity record saved as a draft. Review the details, then submit it for approval.");
      setShowEntry(false); setSourceName(""); setSourceReference(""); setNotes(""); setQuantity("1"); await load();
    } catch(err) { setError(err instanceof Error ? err.message : "Unable to create activity record"); }
    finally { setBusy(false); }
  }
  async function submitRecord(id: string) {
    setBusy(true); setError(""); setNotice("");
    try { await request(`/activity-records/${id}/submit`, {method:"POST"}); setNotice("Record submitted for review."); await load(); }
    catch(err) { setError(err instanceof Error ? err.message : "Submission failed"); }
    finally { setBusy(false); }
  }
  async function reviewRecord(id: string, decision: "APPROVED"|"REJECTED") {
    setBusy(true); setError(""); setNotice("");
    try { await request(`/activity-records/${id}/review`, {method:"POST",body:JSON.stringify({decision})}); setNotice(`Record ${decision.toLowerCase()}.`); await load(); }
    catch(err) { setError(err instanceof Error ? err.message : "Review failed"); }
    finally { setBusy(false); }
  }
  async function calculateRecord(id: string) {
    setBusy(true); setError(""); setCalculation(null);
    try {
      const result = await request<{run:{results:Array<{activityRecordId:string;kgCo2e:string;factor:{code:string;version:number}}>};reused:boolean}>("/calculations",{method:"POST",body:JSON.stringify({activityRecordIds:[id]})});
      const item=result.run.results[0]; if(item) setCalculation({recordId:id,kgCo2e:item.kgCo2e,factorCode:`${item.factor.code} v${item.factor.version}`});
      setNotice(result.reused ? "Existing deterministic calculation snapshot reused." : "Calculation snapshot created successfully.");
    } catch(err) { setError(err instanceof Error ? err.message : "Calculation could not be completed"); }
    finally { setBusy(false); }
  }
  async function createPreview() {
    if (!csvText || !fileName) return;
    setBusy(true); setError(""); setNotice(""); setPreview(null);
    try { const result=await request<{preview:ImportPreview}>("/activity-imports/preview",{method:"POST",body:JSON.stringify({fileName,csvText})}); setPreview(result.preview); }
    catch(err) { setError(err instanceof Error ? err.message : "CSV preview failed"); }
    finally { setBusy(false); }
  }
  async function commitImport() {
    if (!preview?.canCommit) return;
    setBusy(true); setError(""); setNotice("");
    try { const result=await request<{batch:{importedRows:number};reused:boolean}>("/activity-imports/commit",{method:"POST",body:JSON.stringify({fileName,csvText})}); setNotice(result.reused ? "This CSV was already imported; the original batch was returned." : `${result.batch.importedRows} activity rows imported as drafts.`); setPreview(null); setCsvText(""); setFileName(""); await load(); }
    catch(err) { setError(err instanceof Error ? err.message : "CSV import failed"); }
    finally { setBusy(false); }
  }
  if (activeNav === "Facilities") return <div className="dashboard-content">
    <div className="page-heading"><div><div className="section-kicker">OPERATING FOOTPRINT</div><h1>Facilities</h1><p>Manage the locations that anchor your organization's activity records.</p></div><button className="export-button" onClick={() => void load()}>↻ Refresh</button></div>
    {error && <div className="notice-error" role="alert">{error}</div>}{notice && <div className="notice-success" role="status">{notice}</div>}
    {canManageFacilities && <form className="panel facility-create" onSubmit={async e=>{e.preventDefault();const formElement=e.currentTarget;const form=new FormData(formElement);setBusy(true);setError("");try{await request("/facilities",{method:"POST",body:JSON.stringify({code:String(form.get("code")),name:String(form.get("name")),countryCode:String(form.get("countryCode")),city:String(form.get("city")||""),region:String(form.get("region")||""),timezone:String(form.get("timezone")||"UTC")})});setNotice("Facility created.");formElement.reset();await load();}catch(err){setError(err instanceof Error?err.message:"Facility creation failed");}finally{setBusy(false);}}}>
      <div className="panel-heading"><div><span className="section-kicker">NEW LOCATION</span><h2>Add a facility</h2></div><span className="unit-label">OWNER / ADMIN</span></div>
      <div className="form-grid"><label>Facility code<input name="code" required minLength={2} maxLength={40} pattern="[A-Za-z0-9_-]+" placeholder="PLANT-01"/></label><label>Facility name<input name="name" required minLength={2} maxLength={160} placeholder="Kolkata manufacturing site"/></label><label>Country code<input name="countryCode" required minLength={2} maxLength={2} defaultValue="IN" pattern="[A-Za-z]{2}"/></label><label>City<input name="city" maxLength={120} placeholder="Kolkata"/></label><label>Region / state<input name="region" maxLength={120} placeholder="West Bengal"/></label><label>Timezone<input name="timezone" defaultValue="Asia/Kolkata" maxLength={80}/></label></div>
      <button className="primary-button form-submit" disabled={busy}>{busy?<Spinner/>:"Create facility"}</button>
    </form>}
    <section className="panel workspace-panel"><div className="panel-heading"><div><span className="section-kicker">FACILITY REGISTER</span><h2>{facilities.length} locations</h2></div><span className="unit-label">ORGANIZATION SCOPED</span></div>
      {loading?<div className="chart-loading"><Spinner/></div>:facilities.length===0?<div className="empty-inline">No facilities yet. Add your first location to begin collecting activity data.</div>:<div className="table-scroll"><table className="workspace-table"><thead><tr><th>Facility</th><th>Code</th><th>Location</th><th>Status</th><th>Action</th></tr></thead><tbody>{facilities.map(item=><tr key={item.id}><td><b>{item.name}</b><small>{item.timezone}</small></td><td><code>{item.code}</code></td><td>{[item.city,item.region,item.countryCode].filter(Boolean).join(", ")}</td><td><span className={item.isActive?"status-pill approved":"status-pill rejected"}>{item.isActive?"Active":"Inactive"}</span></td><td>{canManageFacilities&&<button className="table-action" disabled={busy} onClick={async()=>{setBusy(true);try{await request(`/facilities/${item.id}/status`,{method:"PATCH",body:JSON.stringify({isActive:!item.isActive})});setNotice("Facility status updated.");await load();}catch(err){setError(err instanceof Error?err.message:"Status update failed");}finally{setBusy(false);}}}>{item.isActive?"Deactivate":"Activate"}</button>}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
  return <div className="dashboard-content">
    <div className="page-heading"><div><div className="section-kicker">EMISSIONS DATA OPERATIONS</div><h1>Activity data</h1><p>Capture source evidence, validate submissions and calculate traceable emissions.</p></div><button className="export-button" onClick={()=>{setShowEntry(!showEntry);setError("");}}>＋ <span>New activity</span></button></div>
    {error && <div className="notice-error" role="alert">{error} <button onClick={()=>void load()}>Refresh</button></div>}{notice && <div className="notice-success" role="status">{notice}</div>}
    {calculation && <div className="calculation-result"><span>CALCULATION SNAPSHOT CREATED</span><b>{number(calculation.kgCo2e)} kg CO₂e</b><small>Factor {calculation.factorCode} · immutable result for record {calculation.recordId.slice(0,8)}</small></div>}
    {showEntry && <form className="panel entry-panel" onSubmit={createRecord}><div className="panel-heading"><div><span className="section-kicker">SOURCE DATA CAPTURE</span><h2>New activity record</h2></div><button type="button" className="close-button" onClick={()=>setShowEntry(false)}>×</button></div>
      {activeFacilities.length===0?<div className="notice-info">Create and activate a facility before recording activity. Open Facilities from the sidebar.</div>:<><div className="form-grid"><label>Facility<select value={facilityId} onChange={e=>setFacilityId(e.target.value)} required>{activeFacilities.map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label>Activity category<select value={category} onChange={e=>setCategory(e.target.value)}>{ACTIVITY_CATEGORIES.map(item=><option key={item}>{item.replaceAll("_"," ")}</option>)}</select></label><label>GHG scope<input value={categoryScope[category]??"SCOPE_3"} readOnly aria-label="Derived GHG scope"/></label><label>Quantity<input type="number" value={quantity} onChange={e=>setQuantity(e.target.value)} min="0.000001" max="1000000000000" step="any" required/></label><label>Unit<input value={unit} onChange={e=>setUnit(e.target.value)} maxLength={40} required placeholder="kWh, L, kg, tonne-km"/></label><label>Source name<input value={sourceName} onChange={e=>setSourceName(e.target.value)} minLength={2} maxLength={160} required placeholder="Utility invoice / fuel receipt"/></label><label>Period start<input type="date" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} required/></label><label>Period end<input type="date" value={periodEnd} min={periodStart} onChange={e=>setPeriodEnd(e.target.value)} required/></label><label>Source reference<input value={sourceReference} onChange={e=>setSourceReference(e.target.value)} maxLength={240} placeholder="Invoice number (optional)"/></label><label className="span-two">Notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000} rows={2} placeholder="Context for reviewer (optional)"/></label></div><div className="form-actions"><span>New records are saved as DRAFT and must be submitted for review.</span><button className="primary-button" disabled={busy||!facilityId}>{busy?<Spinner/>:"Save draft"}</button></div></>}
    </form>}
    <div className="workspace-columns">
      <section className="panel import-panel"><div className="panel-heading"><div><span className="section-kicker">BULK DATA INGESTION</span><h2>Import activity CSV</h2></div><span className="unit-label">1 MB · 500 ROWS MAX</span></div>
        <p className="panel-copy">Upload a structured CSV. The server validates facilities, categories, units, dates and duplicates before any rows are committed.</p>
        <div className="import-controls"><label className="file-picker">Choose CSV<input type="file" accept=".csv,text/csv" onChange={async e=>{const file=e.target.files?.[0];setPreview(null);setError("");if(!file)return;if(file.size>1024*1024){setError("CSV must not exceed 1 MiB.");return;}setFileName(file.name);setCsvText(await file.text());}}/></label><button className="text-button" onClick={()=>downloadText("carbonledger-activity-template.csv","facilityCode,category,scope,quantity,unit,periodStart,periodEnd,sourceName,sourceReference,notes\nPLANT-01,ELECTRICITY,SCOPE_2,12500,kWh,2026-01-01,2026-01-31,Utility invoice,INV-100,Monthly electricity")}>↓ Download template</button><button className="primary-button compact-button" disabled={busy||!csvText} onClick={()=>void createPreview()}>{busy?<Spinner/>:"Validate CSV"}</button></div>
        {fileName&&<div className="selected-file">▤ {fileName} · {(new TextEncoder().encode(csvText).length/1024).toFixed(1)} KB <button onClick={()=>{setFileName("");setCsvText("");setPreview(null);}}>Remove</button></div>}
        {preview&&<div className="preview-box"><div className="preview-stats"><div><b>{preview.qualityScore}%</b><small>Quality score</small></div><div><b>{preview.validRows}</b><small>Valid rows</small></div><div><b>{preview.duplicateRows}</b><small>Duplicates</small></div><div><b>{preview.errorRows}</b><small>Error rows</small></div></div><div className="quality-track"><span style={{width:`${preview.qualityScore}%`}}/></div>{preview.issues.slice(0,8).map((issue,index)=><div className="issue-row" key={index}>Row {issue.rowNumber}: {issue.message}</div>)}{preview.duplicateDetails.slice(0,5).map((item,index)=><div className="issue-row" key={index}>Row {item.rowNumber}: {item.reason}</div>)}<button className="primary-button compact-button" disabled={busy||!preview.canCommit} onClick={()=>void commitImport()}>{busy?<Spinner/>:preview.canCommit?"Commit import as drafts":"Resolve all issues to commit"}</button></div>}
      </section>
      <section className="panel import-history"><div className="panel-heading"><div><span className="section-kicker">INGESTION HISTORY</span><h2>Recent imports</h2></div></div>{imports.length===0?<div className="empty-inline">No imports recorded yet.</div>:imports.map(item=><div className="import-history-row" key={item.id}><span className="file-symbol">CSV</span><div><b>{item.fileName}</b><small>{item.importedRows} / {item.totalRows} rows · {new Date(item.createdAt).toLocaleDateString()}</small></div><span className="status-pill">{item.status}</span></div>)}</section>
    </div>
    <section className="panel workspace-panel"><div className="panel-heading"><div><span className="section-kicker">ACTIVITY REGISTER</span><h2>{records.length} records loaded</h2></div><div className="record-tools"><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All statuses</option><option value="DRAFT">Draft</option><option value="SUBMITTED">Awaiting review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select><button className="table-action" onClick={()=>void load()}>↻ Refresh</button></div></div>
      {loading?<div className="chart-loading"><Spinner/> Loading records…</div>:visibleRecords.length===0?<div className="empty-inline">No activity records match this filter. Add a record or import a CSV to get started.</div>:<div className="table-scroll"><table className="workspace-table"><thead><tr><th>Activity / facility</th><th>Period</th><th>Quantity</th><th>Scope</th><th>Status</th><th>Workflow</th></tr></thead><tbody>{visibleRecords.map(record=><tr key={record.id}><td><b>{record.category.replaceAll("_"," ")}</b><small>{record.facility?.code} · {record.facility?.name} · {record.sourceName}</small></td><td>{record.periodStart.slice(0,10)}<small>to {record.periodEnd.slice(0,10)}</small></td><td><b>{number(record.quantity)}</b><small>{record.unit}</small></td><td>{record.scope.replace("_"," ")}</td><td><span className={`status-pill ${record.status.toLowerCase()}`}>{record.status}</span></td><td><div className="row-actions">{(record.status==="DRAFT"||record.status==="REJECTED")&&record.createdByUserId===session.user.id&&<button className="table-action" disabled={busy} onClick={()=>void submitRecord(record.id)}>Submit</button>}{record.status==="SUBMITTED"&&canReview&&record.createdByUserId!==session.user.id&&<><button className="table-action approve-action" disabled={busy} onClick={()=>void reviewRecord(record.id,"APPROVED")}>Approve</button><button className="table-action reject-action" disabled={busy} onClick={()=>void reviewRecord(record.id,"REJECTED")}>Reject</button></>}{record.status==="APPROVED"&&<button className="table-action" disabled={busy} onClick={()=>void calculateRecord(record.id)}>Calculate</button>}</div></td></tr>)}</tbody></table></div>}
    </section>
    <div className="workspace-footnote">Activity data is tenant-scoped. Only approved records can be calculated; calculations require a published, date-valid emission factor with a supported unit conversion.</div>
  </div>;
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
      {activeNav === "Activity data" || activeNav === "Facilities" ? <ActivityWorkspace session={session} activeNav={activeNav} /> : <section className="dashboard-content">
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
      </section>}
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
