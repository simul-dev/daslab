import { BOTTLENECK_WINDOW, SHIFT, STATION_LABELS } from './parameters.ts';
import {
  STATION_IDS,
  type ClosingSummary,
  type Metrics,
  type ProductMetrics,
  type ProductType,
  type ResourceTotals,
  type Sample,
  type StationId,
  type StationState,
  type WorkOrder,
  type Parameters,
} from './types.ts';

export type MetricsSource = {
  params: Parameters;
  time: number;
  received: number;
  completed: number;
  scrapped: number;
  jobs: Map<number, WorkOrder>;
  stations: Record<StationId, StationState>;
  samples: Sample[];
  closing: ClosingSummary | null;
  finished: boolean;
  peakWip: number;
  maxSystemQueue: number;
};

function stationRecord<T>(factory: (station: StationId) => T) {
  return Object.fromEntries(STATION_IDS.map((station) => [station, factory(station)])) as Record<StationId, T>;
}

export function resourceTotals(stations: Record<StationId, StationState>) {
  return stationRecord<ResourceTotals>((station) =>
    stations[station].resources.reduce(
      (total, resource) => ({
        busy: total.busy + resource.busyTime,
        setup: total.setup + resource.setupTime,
        down: total.down + resource.downTime,
        transport: total.transport + resource.transportTime,
        blocked: total.blocked + resource.blockedTime,
      }),
      { busy: 0, setup: 0, down: 0, transport: 0, blocked: 0 },
    ),
  );
}

export function makeSample(source: MetricsSource): Sample {
  return {
    time: source.time,
    wip: source.received - source.completed - source.scrapped,
    completed: source.completed,
    scrapped: source.scrapped,
    queues: stationRecord((station) => source.stations[station].queue.length),
    resourceTotals: resourceTotals(source.stations),
  };
}

type BottleneckRecord = {
  station: StationId;
  queueRatio: number;
  effective: number;
  upstreamBlocked: number;
};

function interpolateSample(before: Sample, after: Sample, time: number): Sample {
  if (Math.abs(after.time - before.time) < 1e-9 || time <= before.time) return before;
  if (time >= after.time) return after;
  const fraction = (time - before.time) / (after.time - before.time);
  const blend = (left: number, right: number) => left + (right - left) * fraction;
  return {
    time,
    wip: blend(before.wip, after.wip),
    completed: blend(before.completed, after.completed),
    scrapped: blend(before.scrapped, after.scrapped),
    queues: stationRecord((station) => blend(before.queues[station], after.queues[station])),
    resourceTotals: stationRecord((station) => ({
      busy: blend(before.resourceTotals[station].busy, after.resourceTotals[station].busy),
      setup: blend(before.resourceTotals[station].setup, after.resourceTotals[station].setup),
      down: blend(before.resourceTotals[station].down, after.resourceTotals[station].down),
      transport: blend(before.resourceTotals[station].transport, after.resourceTotals[station].transport),
      blocked: blend(before.resourceTotals[station].blocked, after.resourceTotals[station].blocked),
    })),
  };
}

function rollingBottleneck(source: MetricsSource, current: Sample) {
  const zeroScores = stationRecord(() => 0);
  if (current.time <= 0) {
    return {
      bottleneck: 'Awaiting production flow',
      bottleneckReason: 'The rolling 60-minute window starts after the first event.',
      bottleneckScores: zeroScores,
    };
  }

  const windowStart = Math.max(0, current.time - BOTTLENECK_WINDOW);
  let before = source.samples[0] ?? current;
  let after = current;
  for (const sample of source.samples) {
    if (sample.time <= windowStart) before = sample;
    if (sample.time >= windowStart) {
      after = sample;
      break;
    }
  }
  const base = interpolateSample(before, after, windowStart);
  const history = [
    base,
    ...source.samples.filter((sample) => sample.time > windowStart && sample.time < current.time),
  ];
  if (history.at(-1)?.time !== current.time) history.push(current);
  const elapsed = Math.max(1, current.time - base.time);

  const predecessor: Partial<Record<StationId, readonly StationId[]>> = {
    kitting: ['cnc'],
    assembly: ['kitting'],
    test: ['assembly', 'repair'],
    repair: ['test'],
    inspection: ['test'],
    packaging: ['inspection'],
  };

  const records: BottleneckRecord[] = STATION_IDS.map((station) => {
    const state = source.stations[station];
    const averageQueue = history.reduce((sum, sample) => sum + sample.queues[station], 0) / Math.max(1, history.length);
    const queueRatio = averageQueue / Math.max(1, state.queueCapacity);
    const totals = current.resourceTotals[station];
    const old = base.resourceTotals[station];
    const capacityTime = elapsed * Math.max(1, state.resources.length);
    const down = totals.down - old.down;
    const availableTime = Math.max(1, capacityTime - down);
    const effective =
      (totals.busy + totals.setup + totals.transport - old.busy - old.setup - old.transport) /
      availableTime;
    const upstream = predecessor[station] ?? [];
    const upstreamBlocked = upstream.length
      ? Math.max(...upstream.map((sourceStation) => {
          const sourceTotals = current.resourceTotals[sourceStation];
          const sourceOld = base.resourceTotals[sourceStation];
          return (sourceTotals.blocked - sourceOld.blocked) /
            (elapsed * Math.max(1, source.stations[sourceStation].resources.length));
        }))
      : 0;
    return {
      station,
      queueRatio: Math.max(0, queueRatio),
      effective: Math.max(0, effective),
      upstreamBlocked: Math.max(0, upstreamBlocked),
    };
  });

  const ordinalSort = (left: BottleneckRecord, right: BottleneckRecord) =>
    right.queueRatio - left.queueRatio ||
    right.effective - left.effective ||
    right.upstreamBlocked - left.upstreamBlocked ||
    STATION_IDS.indexOf(left.station) - STATION_IDS.indexOf(right.station);
  const qualified = records.filter(
    (record) => record.effective >= 0.75 && (record.queueRatio > 0 || record.upstreamBlocked >= 0.05),
  );
  const queued = records.filter((record) => record.queueRatio > 0);
  const candidates = qualified.length ? qualified : queued.length ? queued : records;
  // Deliberately ordinal rather than an opaque weighted score: sustained queue,
  // then effective occupancy, then evidence that the upstream process is blocked.
  candidates.sort(ordinalSort);
  const leader = candidates[0];
  const bottleneckScores = stationRecord((station) => {
    const record = records.find((candidate) => candidate.station === station)!;
    return Math.max(record.queueRatio, record.effective, record.upstreamBlocked) * 100;
  });
  return {
    bottleneck: STATION_LABELS[leader.station],
    bottleneckReason:
      `${qualified.length ? 'Constrained resource' : queued.length ? 'Queue fallback' : 'Utilization fallback'} · ` +
      `trailing ${Math.min(60, current.time / 60).toFixed(0)} min queue ${(leader.queueRatio * 100).toFixed(0)}% of buffer, ` +
      `effective utilization ${(leader.effective * 100).toFixed(0)}%, ` +
      `upstream blocked ${(leader.upstreamBlocked * 100).toFixed(0)}%.`,
    bottleneckScores,
  };
}

function productMetrics(jobs: Iterable<WorkOrder>, product: ProductType): ProductMetrics {
  const selected = [...jobs].filter((job) => job.product === product);
  const completed = selected.filter((job) => job.completed !== undefined);
  return {
    received: selected.length,
    completed: completed.length,
    scrapped: selected.filter((job) => job.scrappedAt !== undefined).length,
    flowAvg: completed.length
      ? completed.reduce((sum, job) => sum + (job.completed! - job.created), 0) / completed.length / 60
      : 0,
  };
}

export function calculateMetrics(source: MetricsSource): Metrics {
  const time = Math.max(1, source.time);
  const jobs = [...source.jobs.values()];
  const completedJobs = jobs.filter((job) => job.completed !== undefined);
  const terminalJobs = jobs.filter((job) => job.completed !== undefined || job.scrappedAt !== undefined);
  const completedFlows = completedJobs.map((job) => job.completed! - job.created);
  const initialTests = jobs.filter((job) => job.firstTestPassed !== null);
  const firstPasses = initialTests.filter((job) => job.firstTestPassed === true).length;
  const reworked = initialTests.filter((job) => job.firstTestPassed === false).length;
  const totals = resourceTotals(source.stations);
  const utilization = stationRecord((station) => {
    const denominator = time * Math.max(1, source.stations[station].resources.length);
    return (totals[station].busy / denominator) * 100;
  });
  const setupUtilization = stationRecord((station) => {
    const denominator = time * Math.max(1, source.stations[station].resources.length);
    return (totals[station].setup / denominator) * 100;
  });
  const downUtilization = stationRecord((station) => {
    const denominator = time * Math.max(1, source.stations[station].resources.length);
    return (totals[station].down / denominator) * 100;
  });
  const blockedUtilization = stationRecord((station) => {
    const denominator = time * Math.max(1, source.stations[station].resources.length);
    return (totals[station].blocked / denominator) * 100;
  });
  const transportUtilization = stationRecord((station) => {
    const denominator = time * Math.max(1, source.stations[station].resources.length);
    return (totals[station].transport / denominator) * 100;
  });
  const effectiveUtilization = stationRecord(
    (station) => {
      const scheduled = time * Math.max(1, source.stations[station].resources.length);
      const available = Math.max(1, scheduled - totals[station].down);
      return Math.min(
        100,
        ((totals[station].busy + totals[station].setup + totals[station].transport) / available) * 100,
      );
    },
  );
  const queues = stationRecord((station) => source.stations[station].queue.length);
  const averageQueues = stationRecord((station) => source.stations[station].queueArea / time);
  const currentSample = makeSample(source);
  // Once a run is complete, the result card reports the last operating-hour
  // constraint at shift close instead of incorrectly naming a tail-drain step.
  const closingSample = source.finished && source.closing
    ? [...source.samples].reverse().find((sample) => sample.time <= SHIFT + 1e-7)
    : undefined;
  const bottleneck = rollingBottleneck(source, closingSample ?? currentSample);
  const stageWip: Record<string, number> = {};
  for (const job of jobs) {
    if (job.completed !== undefined || job.scrappedAt !== undefined) continue;
    stageWip[job.stage] = (stageWip[job.stage] ?? 0) + 1;
  }
  const changeovers = STATION_IDS.reduce(
    (sum, station) => sum + source.stations[station].resources.reduce((part, unit) => part + unit.changeovers, 0),
    0,
  );
  const cncFailures = source.stations.cnc.resources.reduce((sum, unit) => sum + unit.failures, 0);

  return {
    time: source.time,
    planned: source.params.jobs,
    unreleased: Math.max(0, source.params.jobs - source.received),
    received: source.received,
    completed: source.completed,
    scrapped: source.scrapped,
    wip: source.received - source.completed - source.scrapped,
    throughputPerHour: source.completed / (time / 3600),
    dailyThroughput: source.closing?.completed ?? source.completed,
    flowAvg: completedFlows.length ? completedFlows.reduce((sum, value) => sum + value, 0) / completedFlows.length / 60 : 0,
    flowMin: completedFlows.length ? Math.min(...completedFlows) / 60 : 0,
    flowMax: completedFlows.length ? Math.max(...completedFlows) / 60 : 0,
    waitAvg: terminalJobs.length ? terminalJobs.reduce((sum, job) => sum + job.wait, 0) / terminalJobs.length / 60 : 0,
    firstPassYield: initialTests.length ? (firstPasses / initialTests.length) * 100 : 0,
    reworkRate: initialTests.length ? (reworked / initialTests.length) * 100 : 0,
    scrapRate: initialTests.length ? (source.scrapped / initialTests.length) * 100 : 0,
    changeovers,
    cncFailures,
    completionRate: source.params.jobs ? (source.completed / source.params.jobs) * 100 : 0,
    peakWip: source.peakWip,
    maxSystemQueue: source.maxSystemQueue,
    utilization,
    effectiveUtilization,
    setupUtilization,
    downUtilization,
    transportUtilization,
    blockedUtilization,
    queues,
    averageQueues,
    stageWip,
    ...bottleneck,
    closing: source.closing,
    finished: source.finished,
    overtime: Math.max(0, source.time - SHIFT),
    product: {
      standard: productMetrics(source.jobs.values(), 'standard'),
      highFlow: productMetrics(source.jobs.values(), 'highFlow'),
    },
  };
}
