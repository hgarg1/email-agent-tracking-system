const metrics = [
  { label: "Avg. response", value: "3m 42s" },
  { label: "Inbox health", value: "98%" },
  { label: "Live threads", value: "26" },
  { label: "Auto routing", value: "12 rules" }
];

const flow = [
  {
    title: "Inbound capture",
    detail: "Gmail API ingest + thread normalization for dream-x.app and playerxchange.org."
  },
  {
    title: "Routing brain",
    detail: "Rules prioritize board versus general, tags, SLA, and VIP status."
  },
  {
    title: "Agent orchestration",
    detail: "Assigns owners, queues, and escalations with timeline visibility."
  },
  {
    title: "Outbound rewrite",
    detail: "Replies always send as the shared address with perfect threading."
  }
];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="hero-card">
          <div className="gradient-orb orb-one" />
          <span className="badge">Unified Gmail Orchestration</span>
          <h1>One inbox face. Zero leaks. Full control.</h1>
          <p>
            Dream-X and PlayerXchange feel like a single, polished support desk. Customers only
            see board@dream-x.app or general@playerxchange.org, while your routing engine handles
            the rest.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="/inbox">Open Mission Control</a>
            <a className="button secondary" href="#architecture">See the flow</a>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-card">
            <strong>Status</strong>
            <h3>Live inbox pulse</h3>
            <p>Gmail watch hooks keep every thread in sync within seconds.</p>
          </div>
          <div className="panel-card">
            <strong>Routing</strong>
            <h3>Board and General are isolated</h3>
            <p>Separate SLAs and escalation policies without exposing staff identities.</p>
          </div>
          <div className="panel-card">
            <strong>Compliance</strong>
            <h3>Audit trail by design</h3>
            <p>Every reply is stored with headers, references, and assignment metadata.</p>
          </div>
        </div>
      </section>

      <section id="architecture">
        <div className="section-title">
          <h2>End-to-end orchestration</h2>
          <p>Designed for Gmail OAuth with domain-wide delegation.</p>
        </div>
        <div className="flow-grid">
          {flow.map((item) => (
            <div key={item.title} className="flow-card">
              <span>{item.title}</span>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="section-title">
          <h2>Signal without noise</h2>
          <p>Instant snapshots of your operation, ready for scale.</p>
        </div>
        <div className="metric-grid">
          {metrics.map((metric) => (
            <div key={metric.label} className="metric">
              <h4>{metric.label}</h4>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
