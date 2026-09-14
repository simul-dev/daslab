import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLOOR,
  NODES,
  interpolateRoute,
  queuePoint,
  resourcePoint,
  transportRoute,
  workOrderPoint,
} from '../src/lib/scene/layout.ts';
import { STATION_IDS } from '../src/lib/simulation/types.ts';

const EPSILON = 1e-7;
const MAX_RESOURCES = {
  cnc: 4,
  kitting: 4,
  assembly: 6,
  test: 4,
  repair: 3,
  inspection: 4,
  packaging: 4,
};

function assertPointClose(actual, expected, message, tolerance = EPSILON) {
  assert.equal(actual.length, 3, `${message} is a 3D point`);
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(
      Math.abs(actual[axis] - expected[axis]) <= tolerance,
      `${message}, axis ${axis}: ${actual[axis]} != ${expected[axis]}`,
    );
  }
}

function distance(left, right) {
  return Math.hypot(...left.map((value, axis) => value - right[axis]));
}

function assertInsideFloor(point, message) {
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(
      point[axis] >= FLOOR.min[axis] - EPSILON && point[axis] <= FLOOR.max[axis] + EPSILON,
      `${message}, axis ${axis}=${point[axis]} is outside ${FLOOR.min[axis]}..${FLOOR.max[axis]}`,
    );
  }
}

function makeSource(resourceCounts = MAX_RESOURCES) {
  return {
    time: 60,
    arrivalQueue: [],
    supplyBuffer: [],
    stations: Object.fromEntries(
      STATION_IDS.map((station) => [
        station,
        {
          queue: [],
          resources: Array.from({ length: resourceCounts[station] }, (_, index) => ({
            id: `${station}-${String(index + 1).padStart(2, '0')}`,
          })),
        },
      ]),
    ),
  };
}

function makeJob(overrides = {}) {
  return {
    id: 7,
    product: 'standard',
    created: 0,
    stage: 'assemblyProcessing',
    stageAt: 0,
    queueEnteredAt: null,
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
    ...overrides,
  };
}

test('interpolateRoute clamps endpoints and stays continuous through segment boundaries', () => {
  const route = [
    [0, 0, 0],
    [3, 0, 0],
    [3, 4, 0],
    [3, 4, 12],
  ];
  assertPointClose(interpolateRoute(route, -2), route[0], 'negative progress clamps to the start');
  assertPointClose(interpolateRoute(route, 0), route[0], 'zero progress starts at the first point');
  assertPointClose(interpolateRoute(route, 1), route.at(-1), 'unit progress reaches the final point');
  assertPointClose(interpolateRoute(route, 3), route.at(-1), 'progress above one clamps to the end');
  assert.deepEqual(interpolateRoute([], 0.5), [0, 0, 0]);
  assertPointClose(interpolateRoute([[2, 3, 4]], 0.5), [2, 3, 4], 'a one-point route is stable');

  const totalLength = 3 + 4 + 12;
  for (const boundary of [3 / totalLength, 7 / totalLength]) {
    const atBoundary = interpolateRoute(route, boundary);
    const justBefore = interpolateRoute(route, boundary - 1e-7);
    const justAfter = interpolateRoute(route, boundary + 1e-7);
    assert.ok(distance(justBefore, atBoundary) < 1e-4, `route is continuous before ${boundary}`);
    assert.ok(distance(justAfter, atBoundary) < 1e-4, `route is continuous after ${boundary}`);
  }
});

test('maximum configured resource, queue and release layouts remain inside the scene floor', () => {
  for (const station of STATION_IDS) {
    const count = MAX_RESOURCES[station];
    const points = Array.from({ length: count }, (_, index) => resourcePoint(station, index, count));
    assert.equal(new Set(points.map((point) => point.join(','))).size, count, `${station} resources do not overlap`);
    points.forEach((point, index) => assertInsideFloor(point, `${station} resource ${index + 1}`));
  }

  const repairPoints = Array.from({ length: MAX_RESOURCES.repair }, (_, index) =>
    resourcePoint('repair', index, MAX_RESOURCES.repair));
  assert.equal(new Set(repairPoints.map((point) => point[2])).size, 1, 'repair resources share their dedicated row');
  assert.ok(repairPoints.every((point) => point[2] === 7), 'repair row remains in front of its queue node');

  const maxQueueSlots = {
    supply: 40,
    cnc: 40,
    kitting: 40,
    assembly: 40,
    test: 40,
    repair: 20,
    inspection: 40,
    packaging: 40,
    finishedGoods: 12,
  };
  for (const [station, count] of Object.entries(maxQueueSlots)) {
    for (let index = 0; index < count; index++) {
      assertInsideFloor(queuePoint(station, index), `${station} queue slot ${index}`);
    }
  }

  const source = makeSource();
  source.arrivalQueue = Array.from({ length: 40 }, (_, index) => index + 1);
  for (const id of source.arrivalQueue) {
    const point = workOrderPoint(makeJob({ id, stage: 'arrivalQueue' }), source);
    assertInsideFloor(point, `arrival release slot ${id - 1}`);
  }
  for (const node of Object.values(NODES)) assertInsideFloor(node, 'process node');
});

test('transport paths use orthogonal x/z legs and workOrderPoint is a pure clamped projection', () => {
  const source = makeSource();
  const job = makeJob({
    stage: 'transportToTest',
    resourceId: 'assembly-01',
    transportFrom: 'assembly',
    transportTo: 'test',
    transportStartedAt: 40,
    transportReadyAt: 80,
  });
  const originalJob = structuredClone(job);
  const originalSource = structuredClone(source);
  const route = transportRoute(job, source);

  assertPointClose(route[0], resourcePoint('assembly', 0, MAX_RESOURCES.assembly), 'transport starts at its owner');
  assertPointClose(route.at(-1), queuePoint('test', 0), 'transport ends at the target queue inlet');
  for (let index = 1; index < route.length; index++) {
    const dx = route[index][0] - route[index - 1][0];
    const dz = route[index][2] - route[index - 1][2];
    assert.ok(Math.abs(dx) <= EPSILON || Math.abs(dz) <= EPSILON, `leg ${index} is orthogonal in x/z`);
    assert.ok(Math.abs(dx) > EPSILON || Math.abs(dz) > EPSILON, `leg ${index} has planar length`);
  }
  for (let index = 1; index < route.length - 1; index++) {
    const incoming = [route[index][0] - route[index - 1][0], route[index][2] - route[index - 1][2]];
    const outgoing = [route[index + 1][0] - route[index][0], route[index + 1][2] - route[index][2]];
    assert.ok(Math.abs(incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) <= EPSILON, `turn ${index} is 90 degrees in x/z`);
  }

  assertPointClose(workOrderPoint(job, source), interpolateRoute(route, 0.5), 'mid-transport projection');
  assertPointClose(workOrderPoint(job, { ...source, time: 0 }), route[0], 'pre-start projection clamps to source');
  assertPointClose(workOrderPoint(job, { ...source, time: 120 }), route.at(-1), 'post-arrival projection clamps to target');
  assert.deepEqual(job, originalJob, 'layout projection does not mutate the work order');
  assert.deepEqual(source, originalSource, 'layout projection does not mutate simulation state');
});
