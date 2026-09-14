import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  CircleAlert,
  FastForward,
  Factory,
  Info,
  Languages,
  Layers3,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Timer,
} from "lucide-react";

import {
  DEFAULTS,
  SCENARIOS,
  SHIFT,
  Simulation,
  clock,
  validParameters,
  type Parameters,
  type ScenarioId,
} from "./lib/simulation/engine";
import {
  BottleneckCard,
  DailySummary,
  EventLogPanel,
  KPICards,
  PerformancePanel,
  ResourceStateBreakdown,
  type RunRecord,
} from "./components/Analytics";
import ParameterPanel from "./components/ParameterPanel";
import WorkOrderInspector, { type Language } from "./components/WorkOrderInspector";

const PumpLineScene = lazy(() => import("./components/PumpLineScene"));
const LiveCharts = lazy(() => import("./components/Charts"));

type RunStatus = "ready" | "running" | "paused" | "completed";
type DetailTab = "performance" | "events" | "summary" | "model";

const SPEEDS = [1, 10, 60, 300, 900];

const FLOW_STEPS = [
  { label: "Material release", keys: ["arrivalQueue", "supplyBuffer"] },
  { label: "CNC", keys: ["transportToCnc", "cncQueue", "cncSetup", "cncProcessing", "cncDown", "cncBlocked"] },
  { label: "Kitting", keys: ["transportToKitting", "kittingQueue", "kittingProcessing", "kittingBlocked"] },
  { label: "Assembly", keys: ["transportToAssembly", "assemblyQueue", "assemblyProcessing", "assemblyBlocked"] },
  { label: "Test / repair", keys: ["transportToTest", "testQueue", "testSetup", "testProcessing", "testBlocked", "transportToRepair", "repairQueue", "repairProcessing", "repairBlocked", "transportToRetest"] },
  { label: "Inspection", keys: ["transportToInspection", "inspectionQueue", "inspectionProcessing", "inspectionBlocked"] },
  { label: "Packaging", keys: ["transportToPackaging", "packagingQueue", "packagingProcessing", "packagingBlocked", "transportToFinishedGoods"] },
] as const;

const COPY = {
  ko: {
    intro: "산업용 펌프 생산라인의 제품 믹스, Changeover, 설비 고장, 유한 버퍼와 재작업이 병목에 미치는 영향을 직접 비교합니다.",
    experiment: "미리 정의된 조건을 선택하거나 우측 입력값을 조정해 동일 Seed로 Run을 비교하세요.",
    notice: "이 모델은 설명용 가정을 사용하는 의사결정 실험입니다. 실제 투자비·매출·ROI를 산정하지 않습니다.",
    dirty: "변경한 입력값이 아직 모델에 적용되지 않았습니다. Apply & reset model을 눌러주세요.",
    complete: "모든 투입 작업이 완성 또는 폐기 처리되었습니다. Daily Summary에서 교대 종료와 최종 Drain 결과를 확인하세요.",
    shift: "08:00–16:00 생산 교대",
  },
  en: {
    intro: "Compare how product mix, changeovers, equipment failures, finite buffers and rework shape an industrial pump line bottleneck.",
    experiment: "Choose a defined condition or adjust inputs, then compare runs under a common random seed.",
    notice: "This decision experiment uses illustrative assumptions and does not estimate investment cost, revenue or ROI.",
    dirty: "Draft inputs are not applied. Select Apply & reset model before running.",
    complete: "Every released job is complete or scrapped. Review shift-close and final-drain results in Daily Summary.",
    shift: "08:00–16:00 production shift",
  },
} as const;

function sameParameters(a: Parameters, b: Parameters) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function statusLabel(status: RunStatus, closing: boolean) {
  if (status === "ready") return "READY TO RUN";
  if (status === "paused") return "SIMULATION PAUSED";
  if (status === "completed") return "RUN COMPLETED";
  return closing ? "DRAINING RELEASED WIP" : "SIMULATION RUNNING";
}

function stageTotal(stageWip: Record<string, number>, keys: readonly string[]) {
  return keys.reduce((sum, key) => sum + (stageWip[key] ?? 0), 0);
}

export default function App() {
  const [initialEngine] = useState(() => new Simulation(DEFAULTS));
  const engineRef = useRef(initialEngine);
  const statusRef = useRef<RunStatus>("ready");
  const speedRef = useRef(60);
  const draftRef = useRef<Parameters>({ ...DEFAULTS });
  const runNameRef = useRef("Baseline");
  const recordedRef = useRef(false);
  const nextRunId = useRef(0);

  const [metrics, setMetrics] = useState(() => initialEngine.metrics());
  const [draft, setDraft] = useState<Parameters>({ ...DEFAULTS });
  const [status, setStatus] = useState<RunStatus>("ready");
  const [speed, setSpeed] = useState(60);
  const [scenario, setScenario] = useState<ScenarioId | "custom">("baseline");
  const [revision, setRevision] = useState(0);
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("performance");
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [notice, setNotice] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [lang, setLang] = useState<Language>(() => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    if (requested === "en" || requested === "ko") return requested;
    try {
      return window.localStorage.getItem("daslab-lang") === "en" ? "en" : "ko";
    } catch {
      return "ko";
    }
  });

  statusRef.current = status;
  speedRef.current = speed;
  draftRef.current = draft;
  const engine = engineRef.current;
  const dirty = !sameParameters(draft, engine.params);
  const text = COPY[lang];

  function setRunStatus(next: RunStatus) {
    statusRef.current = next;
    setStatus(next);
  }

  function recordRun() {
    if (recordedRef.current) return;
    recordedRef.current = true;
    const current = engineRef.current;
    setRuns((previous) => [{
      id: ++nextRunId.current,
      name: runNameRef.current,
      params: { ...current.params },
      metrics: current.metrics(),
    }, ...previous].slice(0, 4));
  }

  function resetModel(next: Parameters = draftRef.current, nextName?: string) {
    try {
      const valid = validParameters(next);
      engineRef.current = new Simulation(valid);
      setDraft({ ...valid });
      draftRef.current = { ...valid };
      recordedRef.current = false;
      setRunStatus("ready");
      setSelectedJob(null);
      setMetrics(engineRef.current.metrics());
      setRevision((value) => value + 1);
      runNameRef.current = nextName ?? (scenario === "custom" ? "Custom scenario" : SCENARIOS.find((item) => item.id === scenario)?.label ?? "Custom scenario");
      setNotice(lang === "ko" ? "입력 조건이 새 모델에 적용되었습니다. Start로 Run을 시작하세요." : "Inputs applied to a fresh model. Select Start to begin the run.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Invalid model parameters.");
    }
  }

  function applyScenario(id: ScenarioId) {
    const preset = SCENARIOS.find((item) => item.id === id);
    if (!preset) return;
    const next = { ...preset.params };
    setScenario(id);
    setDraft(next);
    draftRef.current = next;
    resetModel(next, preset.label);
  }

  function changeParameter<Key extends keyof Parameters>(key: Key, value: Parameters[Key]) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      draftRef.current = next;
      return next;
    });
    setScenario("custom");
    runNameRef.current = "Custom scenario";
    setNotice("");
  }

  function startOrPause() {
    if (dirty) {
      setNotice(text.dirty);
      return;
    }
    if (engineRef.current.finished) resetModel(engineRef.current.params, runNameRef.current);
    if (statusRef.current === "running") setRunStatus("paused");
    else {
      setNotice("");
      setRunStatus("running");
    }
  }

  async function finishRun() {
    if (dirty) {
      setNotice(text.dirty);
      return;
    }
    if (engineRef.current.finished || finishing) return;
    setFinishing(true);
    setRunStatus("paused");
    setNotice(lang === "ko" ? "잔여 작업을 계산하고 있습니다…" : "Calculating the remaining released work…");
    try {
      const current = engineRef.current;
      let chunks = 0;
      while (!current.finished) {
        current.advance(current.time + 15 * 60);
        chunks += 1;
        if (chunks % 8 === 0) {
          setMetrics(current.metrics());
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
        if (chunks > 2000) throw new Error("The model did not drain within the safety limit.");
      }
      setMetrics(current.metrics());
      setRunStatus("completed");
      recordRun();
      setDetailTab("summary");
      setNotice(text.complete);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The run could not be completed.");
    } finally {
      setFinishing(false);
    }
  }

  function selectJob(id: number) {
    setSelectedJob(id);
    window.setTimeout(() => document.querySelector(".viewer-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem("daslab-lang", lang);
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }
  }, [lang]);

  useEffect(() => {
    let frameId = 0;
    let previous = 0;
    let lastPublish = 0;
    const frame = (now: number) => {
      if (!previous) previous = now;
      const delta = Math.min((now - previous) / 1000, 0.25);
      previous = now;
      if (statusRef.current === "running") {
        const current = engineRef.current;
        current.advance(current.time + delta * speedRef.current);
        if (current.finished) {
          setMetrics(current.metrics());
          setRunStatus("completed");
          recordRun();
          setDetailTab("summary");
          setNotice(COPY[document.documentElement.lang === "en" ? "en" : "ko"].complete);
        } else if (now - lastPublish >= 120) {
          setMetrics(current.metrics());
          lastPublish = now;
        }
      }
      frameId = window.requestAnimationFrame(frame);
    };
    frameId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const selected = selectedJob === null ? undefined : engine.jobs.get(selectedJob);
  const cncDown = engine.stations.cnc.resources.filter((resource) => resource.state === "down").length;
  const shiftProgress = Math.min(100, (metrics.time / SHIFT) * 100);

  return (
    <main className="lab-shell">
      <header className="topbar">
        <a className="brand" href="https://daslab.co.kr" aria-label="DAS Lab home">
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}daslab_logo_dark_simple.png`} alt="DAS Lab" />
          <span className="brand-divider" />
          <span className="brand-context"><small>INTERACTIVE DEMO</small><b>MANUFACTURING / PUMP LINE</b></span>
        </a>
        <div className="topbar-actions">
          <div className="language-switch" aria-label="Language"><Languages size={14} /><button className={lang === "ko" ? "active" : ""} onClick={() => setLang("ko")}>KO</button><span>/</span><button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button></div>
          <a className="back-link" href="/demo.html#manufacturing"><span>Demo hub</span><ArrowUpRight size={15} /></a>
        </div>
      </header>

      <section className="project-heading">
        <div>
          <span className="eyebrow">OPERATIONS LAB / 02 · MANUFACTURING</span>
          <h1>Industrial Pump<br />Assembly & Test Line<span>.</span></h1>
          <p>{text.intro}</p>
        </div>
        <div className="project-labels">
          <span className="project-badge"><Layers3 size={16} /> DISCRETE EVENT SIMULATION</span>
          <span className="project-subtag">DIGITAL TWIN / CAPACITY & MIX EXPERIMENT</span>
        </div>
      </section>

      <section className="experiment-bar" aria-label="Scenario presets">
        <div className="experiment-title"><Settings2 size={16} /><span>Experiment</span></div>
        <div className="preset-buttons">
          {SCENARIOS.map((preset) => (
            <button key={preset.id} className={scenario === preset.id ? "active" : ""} disabled={finishing} title={preset.description} onClick={() => applyScenario(preset.id)}>{preset.label}</button>
          ))}
        </div>
        <span className="experiment-copy">{text.experiment}</span>
        <span className="seed-note">COMMON SEED <b>{draft.seed}</b></span>
      </section>

      <div className="workspace">
        <div className="main-workspace">
          <section className="viewer-panel">
            <header className="panel-heading">
              <span><Factory size={17} /> Pump production line <small>PL-01</small></span>
              <span className={`run-status ${status}`}><i />{statusLabel(status, metrics.time >= SHIFT && !metrics.finished)}</span>
            </header>
            <Suspense fallback={<div className="scene-loading"><Factory size={28} /><p>Loading 3D production line…</p></div>}>
              <PumpLineScene engine={engine} revision={revision} onSelect={selectJob} lang={lang} />
            </Suspense>
            <div className="live-signal-bar">
              <span className={cncDown ? "signal-down" : "signal-up"}><i /> CNC {cncDown ? `${cncDown} DOWN` : "AVAILABLE"}</span>
              <span>Shared test FIFO <b>{engine.stations.test.queue.length}/{engine.stations.test.queueCapacity}</b></span>
              <span>Repair loop <b>{engine.stations.repair.queue.length}</b></span>
              <span>Finished / scrap <b>{metrics.completed} / {metrics.scrapped}</b></span>
            </div>
            <div className="playback-bar">
              <div className="play-controls">
                <button className="play-button" type="button" onClick={startOrPause} disabled={finishing || dirty}>
                  {status === "running" ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
                  {status === "running" ? "Pause" : status === "paused" ? "Resume" : status === "completed" ? "Run again" : "Start"}
                </button>
                <button className="icon-button" type="button" onClick={() => resetModel()} disabled={finishing} title="Reset simulation" aria-label="Reset simulation"><RotateCcw size={17} /></button>
                <label className="speed-control"><span className="sr-only">Playback speed</span><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{SPEEDS.map((value) => <option value={value} key={value}>{value}× speed</option>)}</select></label>
              </div>
              <div className="sim-clock"><Timer size={17} /><strong>{clock(metrics.time, true)}</strong><span>SIM TIME</span></div>
              <button className="finish-button" type="button" onClick={finishRun} disabled={finishing || status === "completed" || dirty}><FastForward size={16} />{finishing ? "Calculating…" : "Finish run"}</button>
            </div>
            <div className="shift-progress"><div><i style={{ width: `${shiftProgress}%` }} /></div><p><span>08:00 <small>SHIFT START</small></span><span>{metrics.time > SHIFT ? `Overtime +${(metrics.overtime / 60).toFixed(1)} min` : text.shift}</span><span>16:00 <small>RELEASE CLOSE</small></span></p></div>
            <WorkOrderInspector job={selected} now={metrics.time} lang={lang} onClose={() => setSelectedJob(null)} />
          </section>

          <KPICards metrics={metrics} />
          <section className="flow-strip" aria-label="Work in process by stage">
            {FLOW_STEPS.map((step, index) => <div key={step.label}><span>{step.label}</span><strong>{stageTotal(metrics.stageWip, step.keys)}</strong>{index < FLOW_STEPS.length - 1 && <ArrowRight size={13} />}</div>)}
            <div className="flow-complete"><span>Finished goods</span><strong>{metrics.completed}</strong></div>
          </section>
        </div>

        <div className="control-column">
          <ParameterPanel draft={draft} dirty={dirty} disabled={finishing} lang={lang} onChange={changeParameter} onApply={() => resetModel(draftRef.current, "Custom scenario")} />
          <BottleneckCard metrics={metrics} lang={lang} />
        </div>
      </div>

      <div className="model-notice" role="status" aria-live="polite">
        {notice ? <><CircleAlert size={15} />{notice}</> : <><Info size={15} />{text.notice}</>}
      </div>

      <section className="section-divider"><div><span className="eyebrow">OPERATIONAL INTELLIGENCE</span><h2>Live evidence, not a scripted animation.</h2></div><span><Activity size={14} /> EVENT-DRIVEN METRICS</span></section>
      <Suspense fallback={<div className="charts-loading"><Activity size={20} /> Loading live analytics…</div>}>
        <LiveCharts engine={engine} metrics={metrics} lang={lang} />
      </Suspense>
      <ResourceStateBreakdown engine={engine} metrics={metrics} lang={lang} />

      <section className="details-panel">
        <header className="details-tabs">
          <div role="tablist" aria-label="Simulation details">
            {(["performance", "events", "summary", "model"] as DetailTab[]).map((tab) => <button key={tab} role="tab" aria-selected={detailTab === tab} className={detailTab === tab ? "active" : ""} onClick={() => setDetailTab(tab)}>{tab === "summary" ? "Daily Summary" : tab === "model" ? "Model & assumptions" : tab}{tab === "events" && <small>{engine.logs.length}</small>}{tab === "summary" && runs.length > 0 && <small>{runs.length}</small>}</button>)}
          </div>
          <span>{metrics.finished ? "FINAL RESULTS" : "LIVE ANALYSIS"}</span>
        </header>
        <div role="tabpanel">
          {detailTab === "performance" && <PerformancePanel metrics={metrics} lang={lang} />}
          {detailTab === "events" && <EventLogPanel engine={engine} metrics={metrics} lang={lang} onSelectJob={selectJob} />}
          {detailTab === "summary" && <DailySummary metrics={metrics} runs={runs} lang={lang} />}
          {detailTab === "model" && <ModelAssumptions lang={lang} />}
        </div>
      </section>

      <footer className="footer"><div><img src={`${import.meta.env.BASE_URL}daslab_logo_dark_simple.png`} alt="DAS Lab" /><span>Digital Twin · Simulation · AI</span></div><span>Turning operational complexity into better decisions.</span><a href="/demo.html#manufacturing">Explore Demo Hub <ArrowRight size={14} /></a></footer>
    </main>
  );
}

function ModelAssumptions({ lang }: { lang: Language }) {
  return (
    <div className="model-document">
      <header><span className="eyebrow">MODEL LOGIC / V1.0</span><h3>Arrival → Queue → Resource → Process → Transport → Completion</h3><p>{lang === "ko" ? "고객 데이터가 아닌 설명용 확률·공정시간 가정으로 구성한 유한 Capacity DES입니다." : "A finite-capacity DES using illustrative distributions and process-time assumptions, not customer data."}</p></header>
      <div className="assumptions-grid">
        <article><h4>Product profiles</h4><p><b>Standard Pump</b>: CNC 6 min, kitting 2 min, assembly 7 min, pressure test 7 min, inspection 2.5 min, packaging 2 min; first-test fail probability 5%.</p><p><b>High-Flow Pump</b>: CNC 9 min, kitting 3 min, assembly 10 min, pressure test 11 min, inspection 3.5 min, packaging 3 min; first-test fail probability 12%.</p></article>
        <article><h4>Finite resources & buffers</h4><p>Every station owns a finite FIFO input queue and one or more finite-capacity resources. A completed resource remains blocked when the next buffer cannot accept the job. Material release pauses when supply staging is full.</p></article>
        <article><h4>Mix, sequence & changeover</h4><p>Standard and High-Flow jobs use different process profiles. CNC and pressure-test resources incur product changeover when consecutive assigned products differ. Random, alternating and batched release sequences therefore change realized setup load.</p></article>
        <article><h4>CNC reliability</h4><p>When enabled, each CNC follows an MTBF-driven failure clock. A failure pauses active machining, enters a fixed repair interval based on MTTR, then resumes the remaining operation. Downtime is reported separately from processing.</p></article>
        <article><h4>Pressure-test rework</h4><p>A first pressure-test failure routes the pump to Repair and then back to the same shared FIFO test queue. There is no re-test priority. One repair/re-test is allowed; a second failure is scrapped.</p></article>
        <article><h4>Fixed transport scope</h4><p>Inter-process transfers take the configured fixed time. Animated movement communicates flow, but AGV fleet size, dispatching, reservation conflicts and path congestion are intentionally outside v1.</p></article>
      </div>
      <div className="model-warning"><Check size={17} /><p>Parameter changes affect event timing, queues, blocking, utilization, quality and output. The model compares operational behavior only; it does not infer equipment cost, financial benefit or ROI.</p></div>
    </div>
  );
}
