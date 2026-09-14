import { EventCalendar } from './calendar.ts';
import { calculateMetrics, makeSample } from './metrics.ts';
import {
  DEFAULTS,
  PROCESS_PROFILES,
  SAMPLE_INTERVAL,
  SHIFT,
  STATION_LABELS,
  stationQueueCapacity,
  stationResourceCount,
  validParameters,
} from './parameters.ts';
import { keyedDurationFactor, keyedExponential, keyedRandom } from './random.ts';
import { SCENARIOS } from './scenarios.ts';
import {
  STATION_IDS,
  type ClosingSummary,
  type EventKind,
  type EventLog,
  type JobStage,
  type Metrics,
  type Parameters,
  type ProductType,
  type ResourceState,
  type ResourceUnit,
  type Sample,
  type SimulationSnapshot,
  type StationId,
  type StationState,
  type TransportSnapshot,
  type WorkOrder,
} from './types.ts';

export { DEFAULTS, PROCESS_PROFILES, SHIFT, validParameters } from './parameters.ts';
export { SCENARIOS } from './scenarios.ts';
export { STATION_IDS } from './types.ts';
export type {
  ClosingSummary,
  EventKind,
  EventLog,
  JobStage,
  Metrics,
  Parameters,
  ProductType,
  ResourceState,
  ResourceUnit,
  Sample,
  Scenario,
  ScenarioId,
  SequenceMode,
  SimulationSnapshot,
  StationId,
  StationState,
  TransportSnapshot,
  WorkOrder,
} from './types.ts';

type Destination = StationId | 'finishedGoods';

type UnitRuntime = {
  token: number;
  destination: Destination | null;
  remainingUptime: number;
  failureCycle: number;
  segmentStartedAt: number;
};

type ActiveTransport = TransportSnapshot & {
  sourceResourceId: string | null;
  ready: boolean;
};

const EPSILON = 1e-8;

const QUEUE_STAGES: Record<StationId, JobStage> = {
  cnc: 'cncQueue',
  kitting: 'kittingQueue',
  assembly: 'assemblyQueue',
  test: 'testQueue',
  repair: 'repairQueue',
  inspection: 'inspectionQueue',
  packaging: 'packagingQueue',
};

const PROCESS_STAGES: Record<StationId, JobStage> = {
  cnc: 'cncProcessing',
  kitting: 'kittingProcessing',
  assembly: 'assemblyProcessing',
  test: 'testProcessing',
  repair: 'repairProcessing',
  inspection: 'inspectionProcessing',
  packaging: 'packagingProcessing',
};

const BLOCKED_STAGES: Record<StationId, JobStage> = {
  cnc: 'cncBlocked',
  kitting: 'kittingBlocked',
  assembly: 'assemblyBlocked',
  test: 'testBlocked',
  repair: 'repairBlocked',
  inspection: 'inspectionBlocked',
  packaging: 'packagingBlocked',
};

function transportStage(from: StationId | 'supply', to: Destination): JobStage {
  if (from === 'supply') return 'transportToCnc';
  if (from === 'cnc') return 'transportToKitting';
  if (from === 'kitting') return 'transportToAssembly';
  if (from === 'assembly') return 'transportToTest';
  if (from === 'test' && to === 'repair') return 'transportToRepair';
  if (from === 'repair') return 'transportToRetest';
  if (from === 'test' && to === 'inspection') return 'transportToInspection';
  if (from === 'inspection') return 'transportToPackaging';
  return 'transportToFinishedGoods';
}

function nextDestination(station: Exclude<StationId, 'test'>): Destination {
  const destinations: Record<Exclude<StationId, 'test'>, Destination> = {
    cnc: 'kitting',
    kitting: 'assembly',
    assembly: 'test',
    repair: 'test',
    inspection: 'packaging',
    packaging: 'finishedGoods',
  };
  return destinations[station];
}

function makeResource(station: StationId, index: number): ResourceUnit {
  return {
    id: `${station}-${String(index + 1).padStart(2, '0')}`,
    station,
    state: 'idle',
    jobId: null,
    lastProduct: null,
    stateAt: 0,
    busyTime: 0,
    setupTime: 0,
    downTime: 0,
    transportTime: 0,
    blockedTime: 0,
    failures: 0,
    changeovers: 0,
  };
}

function makeStations(params: Parameters) {
  return Object.fromEntries(
    STATION_IDS.map((station) => [
      station,
      {
        id: station,
        label: STATION_LABELS[station],
        queue: [],
        queueCapacity: stationQueueCapacity(params, station),
        resources: Array.from({ length: stationResourceCount(params, station) }, (_, index) =>
          makeResource(station, index),
        ),
        incoming: 0,
        queueArea: 0,
        maxQueue: 0,
      } satisfies StationState,
    ]),
  ) as unknown as Record<StationId, StationState>;
}

/**
 * Browser-only discrete-event model of an industrial pump assembly and test line.
 * A job's `created` timestamp is its actual material release time; unreleased plan
 * volume is kept outside WIP and is reported separately after the shift closes.
 */
export class Simulation {
  params: Parameters;
  time = 0;
  calendar = new EventCalendar();
  jobs = new Map<number, WorkOrder>();
  stations: Record<StationId, StationState>;
  arrivalQueue: number[] = [];
  supplyBuffer: number[] = [];
  logs: EventLog[] = [];
  samples: Sample[] = [];
  hourly: number[] = Array(8).fill(0);
  received = 0;
  completed = 0;
  scrapped = 0;
  peakWip = 0;
  maxSystemQueue = 0;
  closing: ClosingSummary | null = null;
  finished = false;
  finishTime = 0;

  private scheduledReleases: number;
  private runtimes = new Map<string, UnitRuntime>();
  private resources = new Map<string, ResourceUnit>();
  private transports = new Map<number, ActiveTransport>();
  private pumping = false;
  private releaseOpen = true;
  private pendingReleases: { id: number; product: ProductType }[] = [];

  constructor(parameters: Parameters = DEFAULTS) {
    this.params = validParameters(parameters);
    this.stations = makeStations(this.params);
    for (const station of STATION_IDS) {
      for (const resource of this.stations[station].resources) {
        this.resources.set(resource.id, resource);
        this.runtimes.set(resource.id, {
          token: 0,
          destination: null,
          remainingUptime:
            station === 'cnc' && this.params.failureEnabled ? this.drawCncUptime(resource, 0) : Infinity,
          failureCycle: 0,
          segmentStartedAt: 0,
        });
      }
    }

    const releaseInterval = 3600 / this.params.arrivalRate;
    const shiftReleaseCapacity = Math.max(1, Math.ceil(SHIFT / releaseInterval - EPSILON));
    this.scheduledReleases = Math.min(this.params.jobs, shiftReleaseCapacity);
    for (let index = 0; index < this.scheduledReleases; index++) {
      const at = index * releaseInterval;
      const product = this.productFor(index, this.scheduledReleases);
      this.calendar.push(at, () => this.planRelease(index + 1, product));
    }
    this.calendar.push(SHIFT, () => this.closeShift());
    const recordSample = () => {
      this.samples.push(this.sample());
      if (!this.finished) this.calendar.push(this.time + SAMPLE_INTERVAL, recordSample, 'sample');
    };
    this.samples.push(this.sample());
    this.calendar.push(SAMPLE_INTERVAL, recordSample, 'sample');
  }

  private productFor(index: number, count: number): ProductType {
    const mix = this.params.highFlowMix / 100;
    if (this.params.sequenceMode === 'random') {
      return keyedRandom(this.params.seed, 'product', index + 1) < mix ? 'highFlow' : 'standard';
    }
    if (this.params.sequenceMode === 'batched') {
      const highFlowCount = Math.round(count * mix);
      return index >= count - highFlowCount ? 'highFlow' : 'standard';
    }
    const before = Math.floor(index * mix + EPSILON);
    const after = Math.floor((index + 1) * mix + EPSILON);
    return after > before ? 'highFlow' : 'standard';
  }

  private planRelease(id: number, product: ProductType) {
    if (!this.releaseOpen) return;
    this.pendingReleases.push({ id, product });
    this.pump();
  }

  private admitPlannedReleases() {
    let changed = false;
    // The material-release gate is finite. Plans that cannot enter this queue
    // remain outside factory WIP and are reported as unreleased at shift close.
    while (
      this.releaseOpen &&
      this.pendingReleases.length > 0 &&
      this.arrivalQueue.length < this.params.supplyBufferCapacity
    ) {
      const release = this.pendingReleases.shift()!;
      this.releaseJob(release.id, release.product);
      changed = true;
    }
    return changed;
  }

  private releaseJob(id: number, product: ProductType) {
    const job: WorkOrder = {
      id,
      product,
      created: this.time,
      stage: 'arrivalQueue',
      stageAt: this.time,
      queueEnteredAt: this.time,
      wait: 0,
      resourceId: null,
      transportFrom: null,
      transportTo: null,
      transportStartedAt: null,
      transportReadyAt: null,
      processStartedAt: null,
      processDuration: 0,
      remainingProcess: 0,
      testAttempts: 0,
      repairCount: 0,
      changeovers: 0,
      failures: 0,
      firstTestPassed: null,
    };
    this.jobs.set(id, job);
    this.arrivalQueue.push(id);
    this.received++;
    this.log(id, `${product === 'standard' ? 'Standard' : 'High-Flow'} pump material released`);
  }

  private closeShift() {
    this.releaseOpen = false;
    this.closing = {
      planned: this.params.jobs,
      released: this.received,
      unreleased: Math.max(0, this.params.jobs - this.received),
      completed: this.completed,
      scrapped: this.scrapped,
      unfinished: this.params.jobs - this.completed - this.scrapped,
      wip: this.received - this.completed - this.scrapped,
      rate: this.params.jobs ? (this.completed / this.params.jobs) * 100 : 0,
    };
    this.log(null, '16:00 shift closed · no further material releases', 'system');
  }

  log(jobId: number | null, message: string, kind: EventKind = 'flow') {
    this.logs.unshift({ time: this.time, jobId, message, kind });
    if (this.logs.length > 240) this.logs.length = 240;
  }

  setStage(job: WorkOrder, stage: JobStage) {
    job.stage = stage;
    job.stageAt = this.time;
  }

  private setResourceState(resource: ResourceUnit, state: ResourceState) {
    resource.state = state;
    resource.stateAt = this.time;
  }

  private integrate(to: number) {
    const elapsed = to - this.time;
    if (elapsed < -EPSILON) throw new Error('Simulation time cannot move backwards');
    if (elapsed <= 0) {
      this.time = to;
      return;
    }
    for (const station of STATION_IDS) {
      const state = this.stations[station];
      state.queueArea += state.queue.length * elapsed;
      for (const resource of state.resources) {
        if (resource.state === 'processing') resource.busyTime += elapsed;
        else if (resource.state === 'setup') resource.setupTime += elapsed;
        else if (resource.state === 'down') resource.downTime += elapsed;
        else if (resource.state === 'transporting') resource.transportTime += elapsed;
        else if (resource.state === 'blocked') resource.blockedTime += elapsed;
      }
    }
    this.time = to;
  }

  advance(target: number) {
    if (!Number.isFinite(target) || target < this.time - EPSILON) throw new Error('Invalid advance target');
    if (this.finished) return;
    let processed = 0;
    while (this.calendar.peek() <= target + EPSILON && !this.finished) {
      if (++processed > 1_000_000) throw new Error('Event limit exceeded');
      const event = this.calendar.pop();
      this.integrate(event.at);
      event.action();
      this.updatePeaks();
      this.checkEnd();
    }
    if (!this.finished && target > this.time) this.integrate(target);
  }

  runToEnd() {
    let processed = 0;
    while (!this.finished) {
      if (!this.calendar.hasModelEvent()) throw new Error('Model deadlocked with unfinished jobs');
      const next = this.calendar.peek();
      if (!Number.isFinite(next)) throw new Error('Model deadlocked with unfinished jobs');
      this.advance(next);
      if (++processed > 1_000_000) throw new Error('Model did not drain');
    }
    return this.metrics();
  }

  sample() {
    return makeSample(this);
  }

  metrics() {
    return calculateMetrics(this);
  }

  snapshot(): SimulationSnapshot {
    const stations = Object.fromEntries(
      STATION_IDS.map((station) => [
        station,
        {
          ...this.stations[station],
          queue: [...this.stations[station].queue],
          resources: this.stations[station].resources.map((resource) => ({ ...resource })),
        },
      ]),
    ) as Record<StationId, StationState>;
    return {
      time: this.time,
      finished: this.finished,
      planned: this.params.jobs,
      unreleased: Math.max(0, this.params.jobs - this.received),
      received: this.received,
      completed: this.completed,
      scrapped: this.scrapped,
      jobs: [...this.jobs.values()].map((job) => ({ ...job })),
      stations,
      arrivalQueue: [...this.arrivalQueue],
      supplyBuffer: [...this.supplyBuffer],
      transports: [...this.transports.values()].map(({ sourceResourceId: _source, ready: _ready, ...transport }) => ({
        ...transport,
      })),
    };
  }

  private updatePeaks() {
    const wip = this.received - this.completed - this.scrapped;
    this.peakWip = Math.max(this.peakWip, wip);
    this.maxSystemQueue = Math.max(
      this.maxSystemQueue,
      this.arrivalQueue.length,
      this.supplyBuffer.length,
      ...STATION_IDS.map((station) => this.stations[station].queue.length),
    );
    for (const station of STATION_IDS) {
      const state = this.stations[station];
      state.maxQueue = Math.max(state.maxQueue, state.queue.length);
    }
  }

  private checkEnd() {
    if (
      !this.finished &&
      this.closing !== null &&
      this.completed + this.scrapped === this.received
    ) {
      this.finished = true;
      this.finishTime = this.time;
      if (this.samples.at(-1)?.time !== this.time) this.samples.push(this.sample());
      this.log(null, 'Simulation completed · all released work orders reached a terminal state', 'system');
    }
  }

  private pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      let changed = true;
      let iterations = 0;
      while (changed) {
        if (++iterations > 10_000) throw new Error('Dispatch fixed point did not converge');
        changed = false;
        changed = this.admitPlannedReleases() || changed;
        changed = this.moveArrivalsToSupply() || changed;
        changed = this.acceptReadyTransports() || changed;
        changed = this.dispatchIdleResources() || changed;
        changed = this.acceptReadyTransports() || changed;
        changed = this.resolveReworkCycle() || changed;
        changed = this.startBlockedTransports() || changed;
        changed = this.startSupplyTransports() || changed;
      }
    } finally {
      this.pumping = false;
    }
  }

  private moveArrivalsToSupply() {
    let changed = false;
    while (this.arrivalQueue.length && this.supplyBuffer.length < this.params.supplyBufferCapacity) {
      const id = this.arrivalQueue.shift()!;
      const job = this.jobs.get(id)!;
      if (job.queueEnteredAt !== null) job.wait += this.time - job.queueEnteredAt;
      job.queueEnteredAt = this.time;
      this.supplyBuffer.push(id);
      this.setStage(job, 'supplyBuffer');
      this.log(id, 'Housing and impeller available in supply buffer');
      changed = true;
    }
    return changed;
  }

  private startSupplyTransports() {
    if (this.stations.cnc.queue.length >= this.stations.cnc.queueCapacity) return false;
    let changed = false;
    for (const id of this.supplyBuffer) {
      const job = this.jobs.get(id)!;
      if (job.stage !== 'supplyBuffer' || this.transports.has(id)) continue;
      if (job.queueEnteredAt !== null) job.wait += this.time - job.queueEnteredAt;
      job.queueEnteredAt = null;
      this.beginTransport(job, 'supply', 'cnc', null);
      changed = true;
    }
    return changed;
  }

  private dispatchIdleResources() {
    let changed = false;
    for (const station of STATION_IDS) {
      const state = this.stations[station];
      for (const resource of state.resources) {
        if (resource.state !== 'idle' || resource.jobId !== null || state.queue.length === 0) continue;
        const id = state.queue.shift()!;
        this.startJob(resource, this.jobs.get(id)!);
        changed = true;
      }
    }
    return changed;
  }

  private startJob(resource: ResourceUnit, job: WorkOrder) {
    if (resource.state !== 'idle' || resource.jobId !== null) throw new Error(`${resource.id} is not idle`);
    if (job.queueEnteredAt !== null) job.wait += this.time - job.queueEnteredAt;
    job.queueEnteredAt = null;
    job.resourceId = resource.id;
    job.transportFrom = null;
    job.transportTo = null;
    job.transportStartedAt = null;
    job.transportReadyAt = null;
    resource.jobId = job.id;
    const runtime = this.runtimes.get(resource.id)!;
    runtime.destination = null;

    const changeover =
      (resource.station === 'cnc' || resource.station === 'test') &&
      resource.lastProduct !== null &&
      resource.lastProduct !== job.product;
    const setupSeconds = resource.station === 'cnc' ? this.params.cncChangeoverSeconds : this.params.testChangeoverSeconds;
    if (changeover && setupSeconds > 0) {
      resource.changeovers++;
      job.changeovers++;
      this.setResourceState(resource, 'setup');
      this.setStage(job, resource.station === 'cnc' ? 'cncSetup' : 'testSetup');
      this.log(job.id, `${STATION_LABELS[resource.station]} changeover started`, 'process');
      this.scheduleOwned(resource, setupSeconds, 'setup', () => this.beginProcessing(resource, job));
      return;
    }
    this.beginProcessing(resource, job);
  }

  private beginProcessing(resource: ResourceUnit, job: WorkOrder) {
    if (resource.jobId !== job.id) throw new Error('Resource ownership changed before processing');
    if (resource.station === 'test') job.testAttempts++;
    if (resource.station === 'repair') job.repairCount++;
    const visit = resource.station === 'test' ? job.testAttempts : resource.station === 'repair' ? job.repairCount : 1;
    const profile = PROCESS_PROFILES[job.product];
    const base = profile[resource.station];
    const duration =
      base *
      this.params.processTimeMultiplier *
      keyedDurationFactor(this.params.seed, 'duration', job.id, resource.station, visit);
    job.processStartedAt = this.time;
    job.processDuration = duration;
    job.remainingProcess = duration;
    this.setResourceState(resource, 'processing');
    this.setStage(job, PROCESS_STAGES[resource.station]);
    this.log(job.id, `${STATION_LABELS[resource.station]} started`, 'process');
    if (resource.station === 'cnc') this.scheduleCncSegment(resource, job);
    else this.scheduleOwned(resource, duration, 'processing', () => this.completeProcessing(resource, job));
  }

  private scheduleOwned(
    resource: ResourceUnit,
    delay: number,
    expectedState: ResourceState,
    action: () => void,
  ) {
    const runtime = this.runtimes.get(resource.id)!;
    const token = ++runtime.token;
    const jobId = resource.jobId;
    this.calendar.push(this.time + delay, () => {
      if (runtime.token !== token || resource.jobId !== jobId || resource.state !== expectedState) return;
      action();
    });
  }

  private drawCncUptime(resource: ResourceUnit, cycle: number) {
    return keyedExponential(
      this.params.cncMtbfMinutes * 60,
      this.params.seed,
      'cnc-uptime',
      resource.id,
      cycle,
    );
  }

  private scheduleCncSegment(resource: ResourceUnit, job: WorkOrder) {
    const runtime = this.runtimes.get(resource.id)!;
    runtime.segmentStartedAt = this.time;
    const failureFirst =
      this.params.failureEnabled && runtime.remainingUptime + EPSILON < job.remainingProcess;
    if (failureFirst) {
      this.scheduleOwned(resource, runtime.remainingUptime, 'processing', () => this.failCnc(resource, job));
    } else {
      this.scheduleOwned(resource, job.remainingProcess, 'processing', () => {
        const elapsed = this.time - runtime.segmentStartedAt;
        if (Number.isFinite(runtime.remainingUptime)) {
          runtime.remainingUptime = Math.max(0, runtime.remainingUptime - elapsed);
        }
        job.remainingProcess = 0;
        this.completeProcessing(resource, job);
      });
    }
  }

  private failCnc(resource: ResourceUnit, job: WorkOrder) {
    const runtime = this.runtimes.get(resource.id)!;
    const elapsed = this.time - runtime.segmentStartedAt;
    job.remainingProcess = Math.max(0, job.remainingProcess - elapsed);
    runtime.remainingUptime = 0;
    resource.failures++;
    job.failures++;
    this.setResourceState(resource, 'down');
    this.setStage(job, 'cncDown');
    this.log(job.id, `${resource.id} failed · machining paused with ${Math.ceil(job.remainingProcess)} s remaining`, 'failure');
    this.scheduleOwned(resource, this.params.cncMttrMinutes * 60, 'down', () => {
      runtime.failureCycle++;
      runtime.remainingUptime = this.drawCncUptime(resource, runtime.failureCycle);
      this.setResourceState(resource, 'processing');
      this.setStage(job, 'cncProcessing');
      this.log(job.id, `${resource.id} repaired · machining resumed`, 'failure');
      this.scheduleCncSegment(resource, job);
    });
  }

  private completeProcessing(resource: ResourceUnit, job: WorkOrder) {
    if (resource.jobId !== job.id) throw new Error('Processing completion ownership mismatch');
    job.remainingProcess = 0;
    if (resource.station === 'cnc' || resource.station === 'test') resource.lastProduct = job.product;

    if (resource.station === 'test') {
      const failRate = Math.min(0.95, PROCESS_PROFILES[job.product].testFailRate * this.params.defectRateMultiplier);
      const failed = keyedRandom(this.params.seed, 'quality', job.id, job.testAttempts) < failRate;
      if (job.testAttempts === 1) job.firstTestPassed = !failed;
      if (failed && job.testAttempts >= 2) {
        this.log(job.id, 'Pressure re-test failed · pump scrapped after the permitted rework', 'quality');
        this.scrapJob(resource, job);
        this.pump();
        return;
      }
      const destination: Destination = failed ? 'repair' : 'inspection';
      this.log(
        job.id,
        failed ? 'Pressure test failed · routed to repair' : `${job.testAttempts > 1 ? 'Re-test' : 'Pressure test'} passed`,
        'quality',
      );
      this.blockAfterService(resource, job, destination);
      this.pump();
      return;
    }

    const destination = nextDestination(resource.station);
    this.log(job.id, `${STATION_LABELS[resource.station]} completed`, 'process');
    this.blockAfterService(resource, job, destination);
    this.pump();
  }

  private blockAfterService(resource: ResourceUnit, job: WorkOrder, destination: Destination) {
    const runtime = this.runtimes.get(resource.id)!;
    runtime.destination = destination;
    this.setResourceState(resource, 'blocked');
    this.setStage(job, BLOCKED_STAGES[resource.station]);
  }

  private scrapJob(resource: ResourceUnit, job: WorkOrder) {
    job.scrappedAt = this.time;
    job.resourceId = null;
    job.transportFrom = null;
    job.transportTo = null;
    this.setStage(job, 'scrapped');
    this.scrapped++;
    this.releaseResource(resource);
  }

  private startBlockedTransports() {
    let changed = this.startCyclicReworkTransports();
    for (const station of STATION_IDS) {
      for (const resource of this.stations[station].resources) {
        if (resource.state !== 'blocked' || resource.jobId === null) continue;
        const job = this.jobs.get(resource.jobId)!;
        if (this.transports.has(job.id)) continue;
        const destination = this.runtimes.get(resource.id)!.destination;
        if (!destination) throw new Error('Blocked resource has no destination');
        if (destination !== 'finishedGoods') {
          const target = this.stations[destination];
          if (target.queue.length >= target.queueCapacity) continue;
        }
        this.beginTransport(job, station, destination, resource.id);
        changed = true;
      }
    }
    return changed;
  }

  /** Let both legs physically travel before the atomic FIFO cycle handoff. */
  private startCyclicReworkTransports() {
    const testState = this.stations.test;
    const repairState = this.stations.repair;
    if (testState.queue.length < testState.queueCapacity || repairState.queue.length < repairState.queueCapacity) {
      return false;
    }
    const activeTestToRepair = [...this.transports.values()].some(
      (transport) => transport.from === 'test' && transport.to === 'repair',
    );
    const activeRepairToTest = [...this.transports.values()].some(
      (transport) => transport.from === 'repair' && transport.to === 'test',
    );
    const blockedTest = testState.resources.find((resource) => {
      const destination = this.runtimes.get(resource.id)!.destination;
      return resource.state === 'blocked' && resource.jobId !== null && destination === 'repair' &&
        !this.transports.has(resource.jobId);
    });
    const blockedRepair = repairState.resources.find((resource) => {
      const destination = this.runtimes.get(resource.id)!.destination;
      return resource.state === 'blocked' && resource.jobId !== null && destination === 'test' &&
        !this.transports.has(resource.jobId);
    });
    if ((!activeTestToRepair && !blockedTest) || (!activeRepairToTest && !blockedRepair)) return false;
    let changed = false;
    if (!activeTestToRepair && blockedTest && blockedTest.jobId !== null) {
      this.beginTransport(this.jobs.get(blockedTest.jobId)!, 'test', 'repair', blockedTest.id);
      changed = true;
    }
    if (!activeRepairToTest && blockedRepair && blockedRepair.jobId !== null) {
      this.beginTransport(this.jobs.get(blockedRepair.jobId)!, 'repair', 'test', blockedRepair.id);
      changed = true;
    }
    if (changed) this.log(null, 'Finite rework cycle released both fixed-time transfers', 'system');
    return changed;
  }

  private beginTransport(
    job: WorkOrder,
    from: StationId | 'supply',
    to: Destination,
    sourceResourceId: string | null,
  ) {
    if (this.transports.has(job.id)) throw new Error(`Job ${job.id} already has an active transport`);
    const readyAt = this.time + this.params.transportSeconds;
    const transport: ActiveTransport = {
      jobId: job.id,
      from,
      to,
      startedAt: this.time,
      readyAt,
      sourceResourceId,
      ready: false,
    };
    this.transports.set(job.id, transport);
    if (to !== 'finishedGoods') this.stations[to].incoming++;
    job.transportFrom = from;
    job.transportTo = to;
    job.transportStartedAt = this.time;
    job.transportReadyAt = readyAt;
    this.setStage(job, transportStage(from, to));
    if (sourceResourceId) this.setResourceState(this.resources.get(sourceResourceId)!, 'transporting');
    this.log(job.id, `Transport started: ${from} → ${to}`);
    this.calendar.push(readyAt, () => {
      const active = this.transports.get(job.id);
      if (active !== transport) return;
      active.ready = true;
      if (active.sourceResourceId) this.setResourceState(this.resources.get(active.sourceResourceId)!, 'blocked');
      this.pump();
    });
  }

  private acceptReadyTransports() {
    let changed = false;
    const ready = [...this.transports.values()]
      .filter((transport) => transport.ready)
      .sort((left, right) => left.readyAt - right.readyAt || left.jobId - right.jobId);
    for (const transport of ready) {
      if (!this.transports.has(transport.jobId)) continue;
      if (transport.to === 'finishedGoods') {
        this.finishTransportToGoods(transport);
        changed = true;
        continue;
      }
      const target = this.stations[transport.to];
      if (target.queue.length >= target.queueCapacity) continue;
      this.finishTransportToQueue(transport);
      changed = true;
    }
    return changed;
  }

  private finishTransportToQueue(transport: ActiveTransport) {
    if (transport.to === 'finishedGoods') throw new Error('Finished goods is not a station queue');
    const target = this.stations[transport.to];
    if (target.queue.length >= target.queueCapacity) throw new Error(`${transport.to} queue capacity exceeded`);
    const job = this.jobs.get(transport.jobId)!;
    this.removeTransport(transport);
    this.releaseTransportSource(transport);
    target.queue.push(job.id);
    target.maxQueue = Math.max(target.maxQueue, target.queue.length);
    job.queueEnteredAt = this.time;
    job.resourceId = null;
    job.transportFrom = null;
    job.transportTo = null;
    job.transportStartedAt = null;
    job.transportReadyAt = null;
    this.setStage(job, QUEUE_STAGES[transport.to]);
    this.log(job.id, `Entered ${STATION_LABELS[transport.to]} queue`);
  }

  private finishTransportToGoods(transport: ActiveTransport) {
    const job = this.jobs.get(transport.jobId)!;
    this.removeTransport(transport);
    this.releaseTransportSource(transport);
    job.resourceId = null;
    job.transportFrom = null;
    job.transportTo = null;
    job.transportStartedAt = null;
    job.transportReadyAt = null;
    job.completed = this.time;
    this.setStage(job, 'completed');
    this.completed++;
    const hour = Math.floor(this.time / 3600);
    while (this.hourly.length <= hour) this.hourly.push(0);
    this.hourly[hour]++;
    this.log(job.id, 'Pump accepted into finished goods', 'complete');
  }

  private removeTransport(transport: ActiveTransport) {
    if (!this.transports.delete(transport.jobId)) throw new Error('Transport ownership mismatch');
    if (transport.to !== 'finishedGoods') {
      this.stations[transport.to].incoming--;
      if (this.stations[transport.to].incoming < 0) throw new Error('Negative incoming transport count');
    }
  }

  private releaseTransportSource(transport: ActiveTransport) {
    if (transport.sourceResourceId) {
      this.releaseResource(this.resources.get(transport.sourceResourceId)!);
      return;
    }
    const index = this.supplyBuffer.indexOf(transport.jobId);
    if (index < 0) throw new Error('Supply transport lost its buffer owner');
    this.supplyBuffer.splice(index, 1);
  }

  private releaseResource(resource: ResourceUnit) {
    const runtime = this.runtimes.get(resource.id)!;
    runtime.token++;
    runtime.destination = null;
    resource.jobId = null;
    this.setResourceState(resource, 'idle');
  }

  /**
   * Finite BAS queues can create a two-node test/repair deadlock. There is no
   * reservation and no retest priority: when both completed transports have
   * already travelled and both FIFO queues are full, atomically start each
   * queue's oldest job on the newly freed opposite source and append both
   * arrivals at the tails. Capacities and FIFO order are preserved.
   */
  private resolveReworkCycle() {
    const ready = [...this.transports.values()]
      .filter((transport) => transport.ready)
      .sort((left, right) => left.readyAt - right.readyAt || left.jobId - right.jobId);
    const testToRepair = ready.find((transport) => transport.from === 'test' && transport.to === 'repair');
    const repairToTest = ready.find((transport) => transport.from === 'repair' && transport.to === 'test');
    if (!testToRepair || !repairToTest) return false;
    const testState = this.stations.test;
    const repairState = this.stations.repair;
    if (
      testState.queue.length < testState.queueCapacity ||
      repairState.queue.length < repairState.queueCapacity ||
      !testToRepair.sourceResourceId ||
      !repairToTest.sourceResourceId
    ) {
      return false;
    }
    const testUnit = this.resources.get(testToRepair.sourceResourceId)!;
    const repairUnit = this.resources.get(repairToTest.sourceResourceId)!;
    const oldestTest = this.jobs.get(testState.queue.shift()!)!;
    const oldestRepair = this.jobs.get(repairState.queue.shift()!)!;
    this.finishTransportToQueue(testToRepair);
    this.finishTransportToQueue(repairToTest);
    this.log(null, 'Atomic FIFO handoff cleared the finite test/repair BAS cycle', 'system');
    this.startJob(testUnit, oldestTest);
    this.startJob(repairUnit, oldestRepair);
    return true;
  }
}

export function clock(seconds: number, withSeconds = false) {
  const value = Math.max(0, Math.floor(seconds)) + 8 * 3600;
  const day = Math.floor(value / 86400);
  const hour = Math.floor(value / 3600) % 24;
  const minute = Math.floor(value / 60) % 60;
  const second = value % 60;
  return `${day ? `D+${day} ` : ''}${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}${
    withSeconds ? `:${String(second).padStart(2, '0')}` : ''
  }`;
}

export function jobID(id: number) {
  return `PMP-${String(id).padStart(4, '0')}`;
}
