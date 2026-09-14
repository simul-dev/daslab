import { useState, type CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  Factory,
  Gauge,
  PackageCheck,
  RotateCcw,
  Search,
  Wrench,
} from "lucide-react";

import {
  clock,
  jobID,
  type EventKind,
  type Metrics,
  type Parameters,
  type Simulation,
  type StationId,
} from "../lib/simulation/engine";
import type { Language } from "./WorkOrderInspector";

export type RunRecord = {
  id: number;
  name: string;
  params: Parameters;
  metrics: Metrics;
};

type CommonProps = {
  engine: Simulation;
  metrics: Metrics;
  lang: Language;
};

const STATIONS: { id: StationId; label: string; short: string; color: string }[] = [
  { id: "cnc", label: "CNC machining", short: "CNC", color: "#00c8ff" },
  { id: "kitting", label: "Parts kitting", short: "KIT", color: "#54d6c7" },
  { id: "assembly", label: "Assembly cells", short: "ASM", color: "#00ff9d" },
  { id: "test", label: "Pressure test", short: "TEST", color: "#a8a0f7" },
  { id: "repair", label: "Repair / rework", short: "RPR", color: "#ff8a7a" },
  { id: "inspection", label: "Final inspection", short: "QC", color: "#f6bc73" },
  { id: "packaging", label: "Packaging", short: "PACK", color: "#7aaee6" },
];

const EVENT_KINDS: (EventKind | "all")[] = ["all", "failure", "quality", "process", "complete", "flow", "system"];

export function number(value: number, digits = 0) {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function MetricCard({ label, value, unit, tone = "cyan", icon: Icon }: {
  label: string;
  value: string;
  unit: string;
  tone?: "cyan" | "green" | "amber" | "violet";
  icon: typeof Activity;
}) {
  return (
    <article className={`kpi-card tone-${tone}`}>
      <div className="kpi-label"><span>{label}</span><Icon size={16} /></div>
      <strong className="kpi-value">{value}</strong>
      <span className="kpi-unit">{unit}</span>
    </article>
  );
}

export function KPICards({ metrics }: { metrics: Metrics }) {
  return (
    <section className="kpi-strip" aria-label="Live production KPIs">
      <MetricCard label="Completed pumps" value={number(metrics.completed)} unit={`/ ${number(metrics.received)} released`} tone="green" icon={PackageCheck} />
      <MetricCard label="Throughput" value={number(metrics.throughputPerHour, 1)} unit="pumps / elapsed hour" icon={Gauge} />
      <MetricCard label="Average flow time" value={metrics.completed ? number(metrics.flowAvg, 1) : "—"} unit="minutes · release to finished goods" icon={Clock3} />
      <MetricCard label="First-pass yield" value={metrics.completed || metrics.scrapped ? number(metrics.firstPassYield, 1) : "—"} unit="% · first pressure test" tone="violet" icon={CheckCircle2} />
      <MetricCard label="System WIP" value={number(metrics.wip)} unit={`peak ${number(metrics.peakWip)} jobs`} tone="amber" icon={Boxes} />
      <MetricCard label="Rework rate" value={metrics.completed || metrics.scrapped ? number(metrics.reworkRate, 1) : "—"} unit={`% · ${number(metrics.scrapped)} scrapped`} tone="amber" icon={RotateCcw} />
    </section>
  );
}

export function BottleneckCard({ metrics, lang }: { metrics: Metrics; lang: Language }) {
  const congested = metrics.maxSystemQueue > 0 && metrics.time > 0;
  return (
    <section className={`bottleneck-card ${congested ? "congested" : ""}`}>
      <div className="bottleneck-kicker"><AlertTriangle size={15} /><span>CURRENT BOTTLENECK</span></div>
      <strong>{metrics.time ? metrics.bottleneck : "Awaiting first events"}</strong>
      <p>
        {metrics.time
          ? metrics.bottleneckReason
          : lang === "ko"
            ? "Run을 시작하면 큐, 가동·셋업·고장·Blocking 시간을 함께 평가합니다."
            : "Start a run to score queue, busy, setup, downtime and blocking evidence."}
      </p>
      {metrics.time > 0 && (
        <div className="bottleneck-facts">
          <span>Peak queue <b>{metrics.maxSystemQueue}</b></span>
          <span>Changeovers <b>{metrics.changeovers}</b></span>
          <span>CNC failures <b>{metrics.cncFailures}</b></span>
        </div>
      )}
    </section>
  );
}

export function ResourceStateBreakdown({ engine, metrics }: CommonProps) {
  return (
    <section className="resource-grid" aria-label="Resource state breakdown">
      {STATIONS.map((station) => {
        const state = engine.stations[station.id];
        const counts = state.resources.reduce<Record<string, number>>((sum, resource) => {
          sum[resource.state] = (sum[resource.state] ?? 0) + 1;
          return sum;
        }, {});
        return (
          <article className="resource-card" key={station.id} style={{ "--station-color": station.color } as CSSProperties}>
            <header><span>{station.short}</span><b>{station.label}</b><strong>{number(metrics.effectiveUtilization[station.id], 1)}%</strong></header>
            <div className="resource-state-strip">
              {state.resources.map((resource) => (
                <i key={resource.id} className={`state-${resource.state}`} title={`${resource.id}: ${resource.state}`} aria-label={`${resource.id}: ${resource.state}`} />
              ))}
            </div>
            <footer>
              <span>Queue <b>{state.queue.length}/{state.queueCapacity}</b></span>
              <span>Run <b>{counts.processing ?? 0}</b></span>
              <span>Setup <b>{counts.setup ?? 0}</b></span>
              <span>Down <b>{counts.down ?? 0}</b></span>
              <span>Move <b>{counts.transporting ?? 0}</b></span>
              <span>Blocked <b>{counts.blocked ?? 0}</b></span>
            </footer>
          </article>
        );
      })}
    </section>
  );
}

export function PerformancePanel({ metrics, lang }: { metrics: Metrics; lang: Language }) {
  const groups = [
    {
      title: "Flow performance",
      icon: Activity,
      rows: [
        ["Average flow time", `${number(metrics.flowAvg, 2)} min`],
        ["Minimum / maximum", `${number(metrics.flowMin, 1)} / ${number(metrics.flowMax, 1)} min`],
        ["Average queue waiting", `${number(metrics.waitAvg, 2)} min`],
        ["Shift completion rate", `${number(metrics.closing?.rate ?? metrics.completionRate, 1)} %`],
      ],
    },
    {
      title: "Quality loop",
      icon: RotateCcw,
      rows: [
        ["First-pass yield", `${number(metrics.firstPassYield, 1)} %`],
        ["Rework rate", `${number(metrics.reworkRate, 1)} %`],
        ["Scrap rate", `${number(metrics.scrapRate, 1)} %`],
        ["Scrapped after one re-test", number(metrics.scrapped)],
      ],
    },
    {
      title: "Operating behavior",
      icon: Wrench,
      rows: [
        ["Product changeovers", number(metrics.changeovers)],
        ["CNC failures", number(metrics.cncFailures)],
        ["Peak system WIP", number(metrics.peakWip)],
        ["Maximum station queue", number(metrics.maxSystemQueue)],
      ],
    },
  ];

  return (
    <div className="performance-content">
      <div className="performance-grid">
        {groups.map(({ title, icon: Icon, rows }) => (
          <article className="metric-group" key={title}>
            <h3><Icon size={16} /> {title}</h3>
            <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          </article>
        ))}
      </div>
      <div className="product-breakdown">
        <div><span className="product-chip standard" /> <b>Standard Pump</b><strong>{metrics.product.standard.completed}</strong><small>completed · {number(metrics.product.standard.flowAvg, 1)} min avg flow</small></div>
        <div><span className="product-chip high-flow" /> <b>High-Flow Pump</b><strong>{metrics.product.highFlow.completed}</strong><small>completed · {number(metrics.product.highFlow.flowAvg, 1)} min avg flow</small></div>
        <p>{lang === "ko" ? "제품별 공정시간·시험 불합격률 차이가 Mix와 순서 효과에 반영됩니다." : "Product-specific process times and test-failure rates drive mix and sequence effects."}</p>
      </div>
    </div>
  );
}

export function EventLogPanel({ engine, lang, onSelectJob }: CommonProps & { onSelectJob: (id: number) => void }) {
  const [kind, setKind] = useState<EventKind | "all">("all");
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const logs = engine.logs.filter((log) => {
    if (kind !== "all" && log.kind !== kind) return false;
    if (!normalized) return true;
    return log.message.toLowerCase().includes(normalized) || (log.jobId !== null && jobID(log.jobId).toLowerCase().includes(normalized));
  });

  return (
    <div className="event-content">
      <header className="event-heading">
        <div><span className="eyebrow">EVENT STREAM</span><h3>Trace every state transition</h3><p>{lang === "ko" ? "설비 고장, Changeover, 품질 판정과 재작업 경로를 추적합니다." : "Trace breakdowns, changeovers, quality decisions and the rework route."}</p></div>
        <span>{logs.length} / {engine.logs.length} EVENTS</span>
      </header>
      <div className="event-toolbar">
        <div className="event-filters" aria-label="Filter events by type">
          {EVENT_KINDS.map((eventKind) => <button type="button" className={kind === eventKind ? "active" : ""} onClick={() => setKind(eventKind)} key={eventKind}>{eventKind}</button>)}
        </div>
        <label className="event-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Job ID or event" /></label>
      </div>
      {logs.length ? (
        <div className="event-table-wrap">
          <table className="event-table">
            <thead><tr><th>Simulation time</th><th>Work order</th><th>Type</th><th>Event</th></tr></thead>
            <tbody>{logs.map((log, index) => (
              <tr key={`${log.time}-${log.jobId}-${index}`}>
                <td className="mono muted">{clock(log.time, true)}</td>
                <td>{log.jobId === null ? <span className="muted">SYSTEM</span> : <button className="job-link" onClick={() => onSelectJob(log.jobId!)}>{jobID(log.jobId)}</button>}</td>
                <td><span className={`event-kind kind-${log.kind}`}>{log.kind}</span></td>
                <td>{log.message}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state"><Activity size={28} /><h3>No matching events.</h3><p>Change the filter or start the simulation.</p></div>
      )}
    </div>
  );
}

export function DailySummary({ metrics, runs, lang }: { metrics: Metrics; runs: RunRecord[]; lang: Language }) {
  const closing = metrics.closing;
  return (
    <div className="summary-content">
      <header className="summary-intro">
        <div><span className="eyebrow">SHIFT & FINAL DRAIN</span><h3>{metrics.finished ? "All released work orders resolved." : closing ? "Shift closed; remaining WIP is draining." : "Run the model to create a daily summary."}</h3><p>{lang === "ko" ? "교대 종료 성과와 잔여 WIP가 모두 처리된 최종 결과를 구분합니다." : "Shift-close performance is separated from the final drained result."}</p></div>
        <span className={`result-tag ${metrics.finished ? "done" : closing ? "draining" : ""}`}>{metrics.finished ? "RUN COMPLETED" : closing ? "DRAINING WIP" : "AWAITING RUN"}</span>
      </header>

      <div className="summary-numbers">
        <div><span>Planned orders</span><strong>{number(closing?.planned ?? metrics.planned)}<small> jobs</small></strong></div>
        <div><span>Released by shift end</span><strong>{number(closing?.released ?? metrics.received)}<small>{number(closing?.unreleased ?? metrics.unreleased)} unreleased</small></strong></div>
        <div><span>Completed by shift end</span><strong>{number(closing?.completed ?? metrics.completed)}<small>{number(closing?.rate ?? metrics.completionRate, 1)}% of plan</small></strong></div>
        <div><span>WIP at shift end</span><strong>{number(closing?.wip ?? metrics.wip)}<small>jobs in system</small></strong></div>
        <div><span>Final completed / scrap</span><strong>{number(metrics.completed)} / {number(metrics.scrapped)}<small>one re-test maximum</small></strong></div>
        <div><span>Final drain overtime</span><strong>{number(metrics.overtime / 60, 1)}<small>min after release close</small></strong></div>
      </div>

      <div className="summary-insight"><Factory size={19} /><p><b>{metrics.bottleneck || "Bottleneck pending"}</b> — {metrics.bottleneckReason || "Queue and state evidence will appear after events are processed."}</p></div>

      <section className="run-history">
        <h4>Scenario comparison <span>same logic · input assumptions shown per run</span></h4>
        {runs.length ? (
          <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Scenario</th><th>Mix / sequence</th><th>Shift output</th><th>Final output</th><th>Flow time</th><th>FPY</th><th>Rework</th><th>Bottleneck</th></tr></thead><tbody>{runs.map((run) => (
            <tr key={run.id}>
              <td><b>{run.name}</b><small>Seed {run.params.seed}</small></td>
              <td>{run.params.highFlowMix}% HF<small>{run.params.sequenceMode}</small></td>
              <td>{number(run.metrics.dailyThroughput)}</td>
              <td>{number(run.metrics.completed)}<small>{number(run.metrics.overtime / 60, 1)} min OT</small></td>
              <td>{number(run.metrics.flowAvg, 1)} min</td>
              <td>{number(run.metrics.firstPassYield, 1)}%</td>
              <td>{number(run.metrics.reworkRate, 1)}%</td>
              <td>{run.metrics.bottleneck}</td>
            </tr>
          ))}</tbody></table></div>
        ) : <div className="empty-state compact"><Gauge size={25} /><p>Finish a run to pin it here. Up to four recent runs are retained in this browser session.</p></div>}
      </section>

      <p className="model-caveat">Illustrative operational model — no investment cost, revenue, economic ROI or financial recommendation is inferred.</p>
    </div>
  );
}
