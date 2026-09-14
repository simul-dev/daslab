import { useMemo } from "react";
import { Settings2 } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { clock, type Metrics, type Simulation, type StationId } from "../lib/simulation/engine";
import { number } from "./Analytics";
import type { Language } from "./WorkOrderInspector";

const STATIONS: { id: StationId; short: string }[] = [
  { id: "cnc", short: "CNC" },
  { id: "kitting", short: "KIT" },
  { id: "assembly", short: "ASM" },
  { id: "test", short: "TEST" },
  { id: "repair", short: "RPR" },
  { id: "inspection", short: "QC" },
  { id: "packaging", short: "PACK" },
];

const chartTooltip = {
  backgroundColor: "#080d1a",
  border: "1px solid rgba(0,200,255,.32)",
  borderRadius: 0,
  color: "#c8d8e8",
  fontFamily: '"Share Tech Mono", Consolas, monospace',
  fontSize: 12,
};

export default function LiveCharts({ engine, metrics, lang }: { engine: Simulation; metrics: Metrics; lang: Language }) {
  const samples = useMemo(() => {
    const values = [...engine.samples];
    const last = values.at(-1);
    if (!last || metrics.time > last.time) values.push(engine.sample());
    return values.map((sample) => ({
      time: clock(sample.time),
      WIP: sample.wip,
      CNC: sample.queues.cnc,
      Assembly: sample.queues.assembly,
      Test: sample.queues.test,
      Repair: sample.queues.repair,
    }));
  }, [engine, metrics.time]);

  const hourly = useMemo(() => engine.hourly.map((count, index) => ({
    hour: clock(index * 3600),
    completed: count,
  })), [engine, metrics.completed]);

  const utilization = STATIONS.map((station) => ({
    name: station.short,
    processing: Number(metrics.utilization[station.id].toFixed(1)),
    setup: Number(metrics.setupUtilization[station.id].toFixed(1)),
    down: Number(metrics.downUtilization[station.id].toFixed(1)),
    transport: Number(metrics.transportUtilization[station.id].toFixed(1)),
    blocked: Number(metrics.blockedUtilization[station.id].toFixed(1)),
  }));

  return (
    <section className="charts-grid" aria-label="Live simulation charts">
      <article className="analysis-card">
        <header className="chart-heading">
          <div><span className="eyebrow">FLOW PERFORMANCE</span><h3>Hourly finished-goods output</h3></div>
          <strong>{number(metrics.throughputPerHour, 1)}<small> pumps / h</small></strong>
        </header>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourly} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke="rgba(0,200,255,.10)" vertical={false} strokeDasharray="3 4" />
              <XAxis dataKey="hour" stroke="#5a7080" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis stroke="#5a7080" tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltip} cursor={{ fill: "rgba(0,200,255,.05)" }} />
              <Bar dataKey="completed" name="Completed" fill="#00ff9d" radius={0} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-foot">{lang === "ko" ? "완제품 창고에 도착한 펌프만 집계합니다." : "Counts only pumps arriving at finished goods."}</p>
      </article>

      <article className="analysis-card">
        <header className="chart-heading">
          <div><span className="eyebrow">CONGESTION</span><h3>WIP and critical queues</h3></div>
          <strong>{number(metrics.wip)}<small> current WIP</small></strong>
        </header>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={samples} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <defs><linearGradient id="pumpWipFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#00c8ff" stopOpacity=".3" /><stop offset="1" stopColor="#00c8ff" stopOpacity=".02" /></linearGradient></defs>
              <CartesianGrid stroke="rgba(0,200,255,.10)" vertical={false} strokeDasharray="3 4" />
              <XAxis dataKey="time" stroke="#5a7080" tick={{ fontSize: 11 }} tickLine={false} minTickGap={25} />
              <YAxis stroke="#5a7080" tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltip} />
              <Area type="stepAfter" dataKey="WIP" stroke="#00c8ff" fill="url(#pumpWipFill)" strokeWidth={2} isAnimationActive={false} />
              <Area type="stepAfter" dataKey="CNC" stroke="#f6bc73" fill="transparent" strokeWidth={1.5} isAnimationActive={false} />
              <Area type="stepAfter" dataKey="Assembly" stroke="#00ff9d" fill="transparent" strokeWidth={1.5} isAnimationActive={false} />
              <Area type="stepAfter" dataKey="Test" stroke="#a8a0f7" fill="transparent" strokeWidth={1.5} isAnimationActive={false} />
              <Area type="stepAfter" dataKey="Repair" stroke="#ff8a7a" fill="transparent" strokeWidth={1.5} isAnimationActive={false} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#8297a5" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-foot">Five-minute snapshots · shared FIFO test queue includes re-tests.</p>
      </article>

      <article className="analysis-card utilization-chart-card">
        <header className="chart-heading">
          <div><span className="eyebrow">RESOURCE STATES</span><h3>Time allocation by station</h3></div>
          <Settings2 size={18} />
        </header>
        <div className="chart-body chart-body-wide">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={utilization} layout="vertical" margin={{ top: 5, right: 15, bottom: 0, left: 2 }}>
              <CartesianGrid stroke="rgba(0,200,255,.10)" horizontal={false} strokeDasharray="3 4" />
              <XAxis type="number" domain={[0, 100]} stroke="#5a7080" tick={{ fontSize: 11 }} tickFormatter={(value) => `${value}%`} />
              <YAxis type="category" dataKey="name" width={38} stroke="#8297a5" tick={{ fontSize: 11 }} tickLine={false} />
              <Tooltip contentStyle={chartTooltip} formatter={(value) => `${number(Number(value), 1)}%`} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#8297a5" }} />
              <Bar dataKey="processing" stackId="state" fill="#00ff9d" name="Processing" isAnimationActive={false} />
              <Bar dataKey="setup" stackId="state" fill="#a8a0f7" name="Setup" isAnimationActive={false} />
              <Bar dataKey="down" stackId="state" fill="#ff8a7a" name="Down" isAnimationActive={false} />
              <Bar dataKey="transport" stackId="state" fill="#00c8ff" name="Transport" isAnimationActive={false} />
              <Bar dataKey="blocked" stackId="state" fill="#f6bc73" name="Blocked" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-foot">Processing, setup, fixed transfer, failure and downstream blocking are reported separately.</p>
      </article>
    </section>
  );
}
