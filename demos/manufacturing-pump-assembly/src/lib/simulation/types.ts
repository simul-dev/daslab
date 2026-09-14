/** Public domain contract for the Industrial Pump Assembly & Test Line DES. */
export type ProductType = 'standard' | 'highFlow';

export type SequenceMode = 'random' | 'alternating' | 'batched';

export const STATION_IDS = [
  'cnc',
  'kitting',
  'assembly',
  'test',
  'repair',
  'inspection',
  'packaging',
] as const;

export type StationId = (typeof STATION_IDS)[number];

export type JobStage =
  | 'arrivalQueue'
  | 'supplyBuffer'
  | 'transportToCnc'
  | 'cncQueue'
  | 'cncSetup'
  | 'cncProcessing'
  | 'cncDown'
  | 'cncBlocked'
  | 'transportToKitting'
  | 'kittingQueue'
  | 'kittingProcessing'
  | 'kittingBlocked'
  | 'transportToAssembly'
  | 'assemblyQueue'
  | 'assemblyProcessing'
  | 'assemblyBlocked'
  | 'transportToTest'
  | 'testQueue'
  | 'testSetup'
  | 'testProcessing'
  | 'testBlocked'
  | 'transportToRepair'
  | 'repairQueue'
  | 'repairProcessing'
  | 'repairBlocked'
  | 'transportToRetest'
  | 'transportToInspection'
  | 'inspectionQueue'
  | 'inspectionProcessing'
  | 'inspectionBlocked'
  | 'transportToPackaging'
  | 'packagingQueue'
  | 'packagingProcessing'
  | 'packagingBlocked'
  | 'transportToFinishedGoods'
  | 'completed'
  | 'scrapped';

export type ResourceState = 'idle' | 'setup' | 'processing' | 'down' | 'transporting' | 'blocked';

export type Parameters = {
  jobs: number;
  highFlowMix: number;
  sequenceMode: SequenceMode;
  arrivalRate: number;
  cncMachines: number;
  kittingWorkers: number;
  assemblyWorkers: number;
  testStations: number;
  repairWorkers: number;
  inspectors: number;
  packers: number;
  supplyBufferCapacity: number;
  cncQueueCapacity: number;
  kittingQueueCapacity: number;
  assemblyQueueCapacity: number;
  testQueueCapacity: number;
  repairQueueCapacity: number;
  inspectionQueueCapacity: number;
  packagingQueueCapacity: number;
  transportSeconds: number;
  cncChangeoverSeconds: number;
  testChangeoverSeconds: number;
  cncMtbfMinutes: number;
  cncMttrMinutes: number;
  failureEnabled: boolean;
  processTimeMultiplier: number;
  defectRateMultiplier: number;
  seed: number;
};

export type ProcessProfile = {
  cnc: number;
  kitting: number;
  assembly: number;
  test: number;
  repair: number;
  inspection: number;
  packaging: number;
  testFailRate: number;
};

export type WorkOrder = {
  id: number;
  product: ProductType;
  created: number;
  stage: JobStage;
  stageAt: number;
  queueEnteredAt: number | null;
  wait: number;
  resourceId: string | null;
  transportFrom: StationId | 'supply' | null;
  transportTo: StationId | 'finishedGoods' | null;
  transportStartedAt: number | null;
  transportReadyAt: number | null;
  processStartedAt: number | null;
  processDuration: number;
  remainingProcess: number;
  testAttempts: number;
  repairCount: number;
  changeovers: number;
  failures: number;
  firstTestPassed: boolean | null;
  completed?: number;
  scrappedAt?: number;
};

export type ResourceUnit = {
  id: string;
  station: StationId;
  state: ResourceState;
  jobId: number | null;
  lastProduct: ProductType | null;
  stateAt: number;
  busyTime: number;
  setupTime: number;
  downTime: number;
  transportTime: number;
  blockedTime: number;
  failures: number;
  changeovers: number;
};

export type StationState = {
  id: StationId;
  label: string;
  queue: number[];
  queueCapacity: number;
  resources: ResourceUnit[];
  incoming: number;
  queueArea: number;
  maxQueue: number;
};

export type ResourceTotals = {
  busy: number;
  setup: number;
  down: number;
  transport: number;
  blocked: number;
};

export type Sample = {
  time: number;
  wip: number;
  completed: number;
  scrapped: number;
  queues: Record<StationId, number>;
  resourceTotals: Record<StationId, ResourceTotals>;
};

export type EventKind = 'flow' | 'process' | 'failure' | 'quality' | 'complete' | 'system';

export type EventLog = {
  time: number;
  jobId: number | null;
  message: string;
  kind: EventKind;
};

export type ClosingSummary = {
  planned: number;
  released: number;
  unreleased: number;
  completed: number;
  scrapped: number;
  unfinished: number;
  wip: number;
  rate: number;
};

export type ProductMetrics = {
  received: number;
  completed: number;
  scrapped: number;
  flowAvg: number;
};

export type Metrics = {
  time: number;
  planned: number;
  unreleased: number;
  received: number;
  completed: number;
  scrapped: number;
  wip: number;
  throughputPerHour: number;
  dailyThroughput: number;
  flowAvg: number;
  flowMin: number;
  flowMax: number;
  waitAvg: number;
  firstPassYield: number;
  reworkRate: number;
  scrapRate: number;
  changeovers: number;
  cncFailures: number;
  completionRate: number;
  peakWip: number;
  maxSystemQueue: number;
  utilization: Record<StationId, number>;
  effectiveUtilization: Record<StationId, number>;
  setupUtilization: Record<StationId, number>;
  downUtilization: Record<StationId, number>;
  transportUtilization: Record<StationId, number>;
  blockedUtilization: Record<StationId, number>;
  queues: Record<StationId, number>;
  averageQueues: Record<StationId, number>;
  stageWip: Record<string, number>;
  bottleneck: string;
  bottleneckReason: string;
  bottleneckScores: Record<StationId, number>;
  closing: ClosingSummary | null;
  finished: boolean;
  overtime: number;
  product: Record<ProductType, ProductMetrics>;
};

export type ScenarioId = 'baseline' | 'highMix' | 'cncFailure' | 'addTest';

export type Scenario = {
  id: ScenarioId;
  label: string;
  description: string;
  params: Parameters;
};

export type TransportSnapshot = {
  jobId: number;
  from: StationId | 'supply';
  to: StationId | 'finishedGoods';
  startedAt: number;
  readyAt: number;
};

export type SimulationSnapshot = {
  time: number;
  finished: boolean;
  planned: number;
  unreleased: number;
  received: number;
  completed: number;
  scrapped: number;
  jobs: WorkOrder[];
  stations: Record<StationId, StationState>;
  arrivalQueue: number[];
  supplyBuffer: number[];
  transports: TransportSnapshot[];
};
