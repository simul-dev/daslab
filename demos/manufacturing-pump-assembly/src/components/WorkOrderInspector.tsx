import { Clock3, Factory, Gauge, RotateCcw, X } from "lucide-react";

import { clock, jobID, type WorkOrder } from "../lib/simulation/engine";

export type Language = "ko" | "en";

type Props = {
  job?: WorkOrder;
  now: number;
  lang: Language;
  onClose: () => void;
};

const STAGE_LABELS: Record<string, string> = {
  arrivalQueue: "Arrival queue",
  supplyBuffer: "Housing & impeller supply",
  supply: "Material release / kit staging",
  transportToCnc: "Transfer to CNC",
  cncQueue: "CNC queue",
  cncSetup: "CNC changeover",
  cncProcessing: "CNC machining",
  cncDown: "CNC down / repair",
  cncBlocked: "CNC output blocked",
  transportToKitting: "Transfer to kitting",
  kittingQueue: "Kitting queue",
  kittingProcessing: "Parts kitting",
  kittingBlocked: "Kitting output blocked",
  transportToAssembly: "Transfer to assembly",
  assemblyQueue: "Assembly queue",
  assemblyProcessing: "Assembly cell",
  assemblyBlocked: "Assembly output blocked",
  transportToTest: "Transfer to pressure test",
  testQueue: "Pressure-test queue",
  testSetup: "Test changeover",
  testProcessing: "Leak / pressure test",
  testBlocked: "Test output blocked",
  transportToRepair: "Transfer to repair",
  repairQueue: "Repair queue",
  repairProcessing: "Repair",
  repairBlocked: "Repair output blocked",
  transportToRetest: "Return to shared test queue",
  transportToInspection: "Transfer to inspection",
  inspectionQueue: "Inspection queue",
  inspectionProcessing: "Final inspection",
  inspectionBlocked: "Inspection output blocked",
  transportToPackaging: "Transfer to packaging",
  packagingQueue: "Packaging queue",
  packagingProcessing: "Packaging",
  packagingBlocked: "Packaging output blocked",
  transportToFinishedGoods: "Transfer to finished goods",
  completed: "Finished goods",
  finishedGoods: "Finished goods",
  scrapped: "Scrapped",
};

function titleCase(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function stageLabel(stage: string) {
  return STAGE_LABELS[stage] ?? titleCase(stage);
}

export default function WorkOrderInspector({ job, now, lang, onClose }: Props) {
  if (!job) return null;

  const elapsed = Math.max(0, (job.completed ?? job.scrappedAt ?? now) - job.created);
  const location = job.transportFrom && job.transportTo
    ? `${stageLabel(job.transportFrom)} → ${stageLabel(job.transportTo)}`
    : stageLabel(job.stage);

  return (
    <aside className="job-inspector" aria-label="Selected work order">
      <div className="job-inspector-main">
        <Factory size={18} aria-hidden="true" />
        <div>
          <span className="micro-label">SELECTED WORK ORDER</span>
          <strong>{jobID(job.id)}</strong>
          <small>{job.product === "highFlow" ? "High-Flow Pump" : "Standard Pump"}</small>
        </div>
      </div>

      <dl className="job-inspector-grid">
        <div>
          <dt><Gauge size={13} /> Current state</dt>
          <dd>{location}</dd>
        </div>
        <div>
          <dt><Clock3 size={13} /> Created / elapsed</dt>
          <dd>{clock(job.created, true)} · {(elapsed / 60).toFixed(1)} min</dd>
        </div>
        <div>
          <dt>Accumulated queue</dt>
          <dd>{(job.wait / 60).toFixed(1)} min</dd>
        </div>
        <div>
          <dt><RotateCcw size={13} /> Quality route</dt>
          <dd>Test {job.testAttempts}× · Repair {job.repairCount}×</dd>
        </div>
        <div>
          <dt>Changeovers / failures</dt>
          <dd>{job.changeovers} / {job.failures}</dd>
        </div>
        <div>
          <dt>Assigned resource</dt>
          <dd>{job.resourceId ?? (lang === "ko" ? "대기 중" : "Waiting")}</dd>
        </div>
      </dl>

      <button className="icon-button inspector-close" type="button" onClick={onClose} aria-label="Close work order details">
        <X size={17} />
      </button>
    </aside>
  );
}
