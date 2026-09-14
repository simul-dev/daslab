import { useState } from "react";
import { Check, ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";

import type { Parameters, SequenceMode } from "../lib/simulation/engine";
import type { Language } from "./WorkOrderInspector";

type NumericParameterKey = {
  [Key in keyof Parameters]: Parameters[Key] extends number ? Key : never;
}[keyof Parameters];

type NumericField = {
  key: NumericParameterKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  digits?: number;
};

type Props = {
  draft: Parameters;
  dirty: boolean;
  disabled: boolean;
  lang: Language;
  onChange: <Key extends keyof Parameters>(key: Key, value: Parameters[Key]) => void;
  onApply: () => void;
};

const DEMAND_FIELDS: NumericField[] = [
  { key: "jobs", label: "Production orders", min: 10, max: 500, step: 1, unit: "jobs" },
  { key: "highFlowMix", label: "High-Flow product mix", min: 0, max: 100, step: 5, unit: "%" },
  { key: "arrivalRate", label: "Release rate", min: 1, max: 30, step: 1, unit: "jobs/h" },
];

const CAPACITY_FIELDS: NumericField[] = [
  { key: "cncMachines", label: "CNC machines", min: 1, max: 4, step: 1, unit: "units" },
  { key: "assemblyWorkers", label: "Assembly workers", min: 1, max: 6, step: 1, unit: "people" },
  { key: "testStations", label: "Pressure-test stations", min: 1, max: 4, step: 1, unit: "units" },
  { key: "inspectors", label: "Final inspectors", min: 1, max: 4, step: 1, unit: "people" },
  { key: "kittingWorkers", label: "Kitting workers", min: 1, max: 4, step: 1, unit: "people" },
  { key: "repairWorkers", label: "Repair technicians", min: 1, max: 3, step: 1, unit: "people" },
  { key: "packers", label: "Packaging workers", min: 1, max: 4, step: 1, unit: "people" },
];

const BUFFER_FIELDS: NumericField[] = [
  { key: "supplyBufferCapacity", label: "Material release / kit staging", min: 1, max: 40, step: 1, unit: "jobs" },
  { key: "cncQueueCapacity", label: "CNC input buffer", min: 1, max: 40, step: 1, unit: "jobs" },
  { key: "kittingQueueCapacity", label: "Kitting buffer", min: 1, max: 40, step: 1, unit: "jobs" },
  { key: "assemblyQueueCapacity", label: "Assembly buffer", min: 1, max: 40, step: 1, unit: "jobs" },
  { key: "testQueueCapacity", label: "Shared test / re-test buffer", min: 1, max: 40, step: 1, unit: "jobs" },
  { key: "repairQueueCapacity", label: "Repair buffer", min: 1, max: 20, step: 1, unit: "jobs" },
  { key: "inspectionQueueCapacity", label: "Inspection buffer", min: 1, max: 40, step: 1, unit: "jobs" },
  { key: "packagingQueueCapacity", label: "Packaging buffer", min: 1, max: 40, step: 1, unit: "jobs" },
];

const BEHAVIOR_FIELDS: NumericField[] = [
  { key: "transportSeconds", label: "Fixed inter-process transfer", min: 1, max: 600, step: 1, unit: "sec" },
  { key: "cncChangeoverSeconds", label: "CNC product changeover", min: 0, max: 1800, step: 30, unit: "sec" },
  { key: "testChangeoverSeconds", label: "Test product changeover", min: 0, max: 1800, step: 30, unit: "sec" },
  { key: "processTimeMultiplier", label: "All process-time multiplier", min: 0.25, max: 3, step: 0.05, unit: "×", digits: 2 },
  { key: "defectRateMultiplier", label: "Pressure-test defect multiplier", min: 0, max: 5, step: 0.05, unit: "×", digits: 2 },
  { key: "cncMtbfMinutes", label: "CNC MTBF", min: 1, max: 1440, step: 1, unit: "min" },
  { key: "cncMttrMinutes", label: "CNC MTTR", min: 1, max: 480, step: 1, unit: "min" },
  { key: "seed", label: "Common random seed", min: 1, max: 999999, step: 1, unit: "" },
];

const sequenceLabels: Record<SequenceMode, string> = {
  random: "Random release",
  alternating: "Alternating products",
  batched: "Batched by product",
};

const INTEGER_FIELDS = new Set<NumericParameterKey>([
  "jobs",
  "cncMachines",
  "kittingWorkers",
  "assemblyWorkers",
  "testStations",
  "repairWorkers",
  "inspectors",
  "packers",
  "supplyBufferCapacity",
  "cncQueueCapacity",
  "kittingQueueCapacity",
  "assemblyQueueCapacity",
  "testQueueCapacity",
  "repairQueueCapacity",
  "inspectionQueueCapacity",
  "packagingQueueCapacity",
  "seed",
]);

function NumericControl({ field, value, disabled, onValue }: {
  field: NumericField;
  value: number;
  disabled: boolean;
  onValue: (value: number) => void;
}) {
  const formatted = value.toFixed(field.digits ?? 0);
  const normalize = (raw: number) => {
    const bounded = Math.min(field.max, Math.max(field.min, raw));
    return INTEGER_FIELDS.has(field.key) ? Math.round(bounded) : Number(bounded.toFixed(field.digits ?? 3));
  };
  return (
    <div className="parameter-control">
      <div className="parameter-label">
        <label htmlFor={`param-${field.key}`}>{field.label}</label>
        <output htmlFor={`param-${field.key}`}>
          <b>{formatted}</b> {field.unit}
        </output>
      </div>
      <div className="parameter-inputs">
        <input
          id={`param-${field.key}`}
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          disabled={disabled}
          onChange={(event) => onValue(normalize(Number(event.target.value)))}
        />
        <input
          aria-label={`${field.label} exact value`}
          className="number-input"
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          value={formatted}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value === "") return;
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onValue(normalize(next));
          }}
        />
      </div>
    </div>
  );
}

function ParameterGroup({ title, caption, fields, draft, disabled, onChange, open = false }: {
  title: string;
  caption: string;
  fields: NumericField[];
  draft: Parameters;
  disabled: boolean;
  open?: boolean;
  onChange: Props["onChange"];
}) {
  const [expanded, setExpanded] = useState(open);
  return (
    <details className="parameter-group" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        <span><b>{title}</b><small>{caption}</small></span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="parameter-group-body">
        {fields.map((field) => (
          <NumericControl
            key={field.key}
            field={field}
            value={draft[field.key]}
            disabled={disabled}
            onValue={(value) => onChange(field.key, value)}
          />
        ))}
      </div>
    </details>
  );
}

export default function ParameterPanel({ draft, dirty, disabled, lang, onChange, onApply }: Props) {
  return (
    <aside className="control-panel">
      <div className="control-heading">
        <h2><SlidersHorizontal size={17} /> Model parameters</h2>
        <span>DES INPUTS</span>
      </div>
      <p className="control-caption">
        {lang === "ko"
          ? "제품 믹스·순서·설비·인력·신뢰성 조건을 바꾸고 동일 Seed로 결과를 비교하세요."
          : "Change mix, sequence, capacity and reliability; compare runs with the same seed."}
      </p>

      <div className="parameter-summary" aria-label="Current parameter summary">
        <span>HF <b>{draft.highFlowMix}%</b></span>
        <span>CNC <b>{draft.cncMachines}</b></span>
        <span>TEST <b>{draft.testStations}</b></span>
        <span>ASM <b>{draft.assemblyWorkers}</b></span>
      </div>

      <ParameterGroup title="Demand & mix" caption="Volume, mix and release sequence" fields={DEMAND_FIELDS} draft={draft} disabled={disabled} onChange={onChange} open />

      <div className="select-control">
        <label htmlFor="sequence-mode">Product sequence</label>
        <select
          id="sequence-mode"
          value={draft.sequenceMode}
          disabled={disabled}
          onChange={(event) => onChange("sequenceMode", event.target.value as SequenceMode)}
        >
          {(Object.keys(sequenceLabels) as SequenceMode[]).map((mode) => <option key={mode} value={mode}>{sequenceLabels[mode]}</option>)}
        </select>
        <small>{lang === "ko" ? "제품 순서가 CNC와 시험기의 Changeover 횟수를 바꿉니다." : "Sequence changes CNC and tester changeover frequency."}</small>
      </div>

      <ParameterGroup title="Resources" caption="Finite equipment and labor" fields={CAPACITY_FIELDS} draft={draft} disabled={disabled} onChange={onChange} />
      <ParameterGroup title="Finite buffers" caption="Blocking occurs when the next queue is full" fields={BUFFER_FIELDS} draft={draft} disabled={disabled} onChange={onChange} />
      <ParameterGroup title="Time, quality & reliability" caption="Processing, changeover, defects and CNC failures" fields={BEHAVIOR_FIELDS} draft={draft} disabled={disabled} onChange={onChange} />

      <label className="failure-toggle">
        <input
          type="checkbox"
          checked={draft.failureEnabled}
          disabled={disabled}
          onChange={(event) => onChange("failureEnabled", event.target.checked)}
        />
        <span><b>CNC breakdowns enabled</b><small>MTBF / MTTR stochastic failure model</small></span>
      </label>

      <button className={`apply-button ${dirty ? "dirty" : ""}`} type="button" disabled={disabled || !dirty} onClick={onApply}>
        {dirty ? <RotateCcw size={15} /> : <Check size={15} />}
        {dirty ? "Apply & reset model" : "Parameters applied"}
      </button>

      <p className="parameter-footnote">
        {lang === "ko"
          ? "변경값은 Apply 이후 새 Run에만 적용됩니다. 모든 이동은 고정 시간이 적용되며 AGV 예약은 모델링하지 않습니다."
          : "Changes apply to a new run. Transfers use fixed travel time; AGV reservations are outside this model."}
      </p>
    </aside>
  );
}
