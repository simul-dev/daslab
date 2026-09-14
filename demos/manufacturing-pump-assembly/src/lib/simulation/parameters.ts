import { STATION_IDS, type Parameters, type ProcessProfile, type StationId } from './types.ts';

/** One 08:00–16:00 production shift. All engine times are seconds from 08:00. */
export const SHIFT = 8 * 3600;
export const SAMPLE_INTERVAL = 5 * 60;
export const BOTTLENECK_WINDOW = 60 * 60;

/** Illustrative cycle-time assumptions, deliberately different by product family. */
export const PROCESS_PROFILES: Record<'standard' | 'highFlow', ProcessProfile> = {
  standard: {
    cnc: 360,
    kitting: 120,
    assembly: 420,
    test: 420,
    repair: 360,
    inspection: 150,
    packaging: 120,
    testFailRate: 0.05,
  },
  highFlow: {
    cnc: 540,
    kitting: 180,
    assembly: 600,
    test: 660,
    repair: 540,
    inspection: 210,
    packaging: 180,
    testFailRate: 0.12,
  },
};

export const DEFAULTS: Parameters = {
  jobs: 64,
  highFlowMix: 25,
  sequenceMode: 'random',
  arrivalRate: 8,
  cncMachines: 1,
  kittingWorkers: 1,
  assemblyWorkers: 2,
  testStations: 1,
  repairWorkers: 1,
  inspectors: 1,
  packers: 1,
  supplyBufferCapacity: 12,
  cncQueueCapacity: 8,
  kittingQueueCapacity: 6,
  assemblyQueueCapacity: 8,
  testQueueCapacity: 8,
  repairQueueCapacity: 3,
  inspectionQueueCapacity: 6,
  packagingQueueCapacity: 6,
  transportSeconds: 30,
  cncChangeoverSeconds: 180,
  testChangeoverSeconds: 90,
  cncMtbfMinutes: 120,
  cncMttrMinutes: 15,
  failureEnabled: false,
  processTimeMultiplier: 1,
  defectRateMultiplier: 1,
  seed: 42,
};

export const STATION_LABELS: Record<StationId, string> = {
  cnc: 'CNC machining',
  kitting: 'Parts kitting',
  assembly: 'Assembly cells',
  test: 'Pressure test',
  repair: 'Repair',
  inspection: 'Final inspection',
  packaging: 'Packaging',
};

export function stationResourceCount(params: Parameters, station: StationId) {
  const counts: Record<StationId, number> = {
    cnc: params.cncMachines,
    kitting: params.kittingWorkers,
    assembly: params.assemblyWorkers,
    test: params.testStations,
    repair: params.repairWorkers,
    inspection: params.inspectors,
    packaging: params.packers,
  };
  return counts[station];
}

export function stationQueueCapacity(params: Parameters, station: StationId) {
  const capacities: Record<StationId, number> = {
    cnc: params.cncQueueCapacity,
    kitting: params.kittingQueueCapacity,
    assembly: params.assemblyQueueCapacity,
    test: params.testQueueCapacity,
    repair: params.repairQueueCapacity,
    inspection: params.inspectionQueueCapacity,
    packaging: params.packagingQueueCapacity,
  };
  return capacities[station];
}

export function validParameters(raw: Parameters): Parameters {
  const params = { ...raw };
  const limits: Partial<Record<keyof Parameters, readonly [number, number]>> = {
    jobs: [10, 500],
    highFlowMix: [0, 100],
    arrivalRate: [1, 30],
    cncMachines: [1, 4],
    kittingWorkers: [1, 4],
    assemblyWorkers: [1, 6],
    testStations: [1, 4],
    repairWorkers: [1, 3],
    inspectors: [1, 4],
    packers: [1, 4],
    supplyBufferCapacity: [1, 40],
    cncQueueCapacity: [1, 40],
    kittingQueueCapacity: [1, 40],
    assemblyQueueCapacity: [1, 40],
    testQueueCapacity: [1, 40],
    repairQueueCapacity: [1, 20],
    inspectionQueueCapacity: [1, 40],
    packagingQueueCapacity: [1, 40],
    transportSeconds: [1, 600],
    cncChangeoverSeconds: [0, 1800],
    testChangeoverSeconds: [0, 1800],
    cncMtbfMinutes: [1, 1440],
    cncMttrMinutes: [1, 480],
    processTimeMultiplier: [0.25, 3],
    defectRateMultiplier: [0, 5],
    seed: [1, 999999],
  };
  const integerKeys = new Set<keyof Parameters>([
    'jobs',
    'cncMachines',
    'kittingWorkers',
    'assemblyWorkers',
    'testStations',
    'repairWorkers',
    'inspectors',
    'packers',
    'supplyBufferCapacity',
    'cncQueueCapacity',
    'kittingQueueCapacity',
    'assemblyQueueCapacity',
    'testQueueCapacity',
    'repairQueueCapacity',
    'inspectionQueueCapacity',
    'packagingQueueCapacity',
    'seed',
  ]);

  for (const [key, range] of Object.entries(limits) as [keyof Parameters, readonly [number, number]][]) {
    const value = params[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1]) {
      throw new Error(`Invalid ${key}`);
    }
    if (integerKeys.has(key) && !Number.isInteger(value)) throw new Error(`Integer required: ${key}`);
  }

  if (!['random', 'alternating', 'batched'].includes(params.sequenceMode)) {
    throw new Error('Invalid sequenceMode');
  }
  if (typeof params.failureEnabled !== 'boolean') throw new Error('Invalid failureEnabled');

  for (const station of STATION_IDS) {
    if (stationResourceCount(params, station) < 1 || stationQueueCapacity(params, station) < 1) {
      throw new Error(`Invalid capacity for ${station}`);
    }
  }
  return params;
}

