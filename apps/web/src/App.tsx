import { useEffect, useState } from "react";

type ApiStatus = "checking" | "online" | "offline";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";

export default function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBaseUrl}/health/live`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        setApiStatus("online");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setApiStatus("offline");
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="shell">
      <nav className="topbar">
        <a className="brand" href="/" aria-label="CarbonLedger home">
          <span className="brand-mark">C</span>
          <span>CarbonLedger</span>
        </a>
        <span className="topbar-label">SUSTAINABILITY INTELLIGENCE</span>
      </nav>
      <section className="hero">
        <div className="eyebrow"><span className="pulse" /> ENTERPRISE CARBON ACCOUNTING</div>
        <h1>Make every tonne<br /><em>count.</em></h1>
        <p className="intro">
          A single source of truth for emissions data, accountable decisions,
          and measurable climate progress.
        </p>
        <div className="status-card">
          <div>
            <span className="status-label">PLATFORM FOUNDATION</span>
            <strong>Development environment</strong>
          </div>
          <span className={`status-pill ${apiStatus}`}>
            <i /> API {apiStatus}
          </span>
        </div>
      </section>
      <footer>
        <span>CARBONLEDGER</span>
        <span>Measure precisely. Act responsibly.</span>
      </footer>
    </main>
  );
}
