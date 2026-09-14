import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULTS,
  SCENARIOS,
  SHIFT,
  STATION_IDS,
  Simulation,
  clock,
  jobID,
  validParameters,
} from '../src/lib/simulation/engine.ts';

const queueStage = {
  cnc: 'cncQueue',
  kitting: 'kittingQueue',
  assembly: 'assemblyQueue',
  test: 'testQueue',
  repair: 'repairQueue',
  inspection: 'inspectionQueue',
  packaging: 'packagingQueue',
};

function assertClose(actual, expected, tolerance = 1e-7, message = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
}

function assertRuntimeState(simulation) {
  const metrics = simulation.metrics();
  const snapshot = simulation.snapshot();
  const owners = [];
  const terminal = new Set();

  assert.equal(simulation.jobs.size, simulation.received, 'Only actually released plans become work orders');
  assert.ok(simulation.arrivalQueue.length <= simulation.params.supplyBufferCapacity, 'Release gate is finite');
  assert.ok(simulation.supplyBuffer.length <= simulation.params.supplyBufferCapacity, 'Supply buffer capacity');
  assert.equal(metrics.wip, simulation.received - simulation.completed - simulation.scrapped, 'WIP conservation');
  assert.equal(metrics.unreleased, simulation.params.jobs - simulation.received, 'Planned volume stays outside WIP');

  for (const id of simulation.arrivalQueue) {
    owners.push(id);
    assert.equal(simulation.jobs.get(id).stage, 'arrivalQueue');
  }
  for (const id of simulation.supplyBuffer) {
    owners.push(id);
    const stage = simulation.jobs.get(id).stage;
    assert.ok(stage === 'supplyBuffer' || stage === 'transportToCnc');
  }

  for (const station of STATION_IDS) {
    const state = simulation.stations[station];
    assert.ok(state.queue.length <= state.queueCapacity, `${station} finite queue capacity`);
    assert.ok(state.incoming >= 0, `${station} incoming transport count`);
    assert.equal(
      state.incoming,
      snapshot.transports.filter((transport) => transport.to === station).length,
      `${station} incoming registry`,
    );
    for (const transport of snapshot.transports.filter((item) => item.to === station)) {
      assertClose(
        transport.readyAt - transport.startedAt,
        simulation.params.transportSeconds,
        1e-7,
        `${transport.jobId} fixed transport time`,
      );
    }
    for (const id of state.queue) {
      owners.push(id);
      const job = simulation.jobs.get(id);
      assert.equal(job.stage, queueStage[station]);
      assert.equal(job.resourceId, null);
    }
    for (const resource of state.resources) {
      const accounted =
        resource.busyTime +
        resource.setupTime +
        resource.downTime +
        resource.transportTime +
        resource.blockedTime;
      assert.ok(accounted <= simulation.time + 1e-5, `${resource.id} state time cannot exceed elapsed time`);
      assert.ok(accounted >= -1e-8);
      if (resource.state === 'idle') {
        assert.equal(resource.jobId, null);
        continue;
      }
      assert.notEqual(resource.jobId, null, `${resource.id} non-idle owner`);
      owners.push(resource.jobId);
      const job = simulation.jobs.get(resource.jobId);
      assert.equal(job.resourceId, resource.id);
      if (resource.state === 'down') {
        assert.equal(resource.station, 'cnc');
        assert.equal(job.stage, 'cncDown');
      }
      if (resource.state === 'transporting') {
        assert.ok(job.stage.startsWith('transportTo'));
        assert.ok(snapshot.transports.some((transport) => transport.jobId === job.id));
      }
    }
  }

  for (const job of simulation.jobs.values()) {
    assert.ok(job.wait >= -1e-8);
    assert.ok(job.testAttempts >= 0 && job.testAttempts <= 2, 'At most one re-test');
    assert.ok(job.repairCount >= 0 && job.repairCount <= 1, 'At most one repair');
    if (job.completed !== undefined) {
      terminal.add(job.id);
      assert.equal(job.stage, 'completed');
      assert.ok(job.completed >= job.created);
    }
    if (job.scrappedAt !== undefined) {
      terminal.add(job.id);
      assert.equal(job.stage, 'scrapped');
      assert.equal(job.testAttempts, 2);
      assert.equal(job.repairCount, 1);
      assert.ok(job.scrappedAt >= job.created);
    }
  }

  assert.equal(new Set(owners).size, owners.length, 'Every live job has exactly one physical owner');
  assert.equal(owners.length, metrics.wip, 'Every WIP job is represented by one owner');
  for (const id of owners) assert.ok(!terminal.has(id), 'Terminal jobs leave all physical owners');
  assert.equal(terminal.size, simulation.completed + simulation.scrapped);

  for (const station of STATION_IDS) {
    for (const value of [
      metrics.utilization[station],
      metrics.setupUtilization[station],
      metrics.downUtilization[station],
      metrics.transportUtilization[station],
      metrics.blockedUtilization[station],
      metrics.effectiveUtilization[station],
    ]) {
      assert.ok(value >= -1e-7 && value <= 100.00001, `${station} utilization is bounded`);
    }
  }
}

function drain(parameters, options = {}) {
  const simulation = new Simulation({ ...DEFAULTS, ...parameters });
  let events = 0;
  while (!simulation.finished) {
    const next = simulation.calendar.peek();
    assert.ok(Number.isFinite(next), 'A live model must retain a future event');
    simulation.advance(next);
    if (events % (options.assertEvery ?? 25) === 0) assertRuntimeState(simulation);
    if (++events > (options.maxEvents ?? 250_000)) throw new Error('Model did not drain');
  }
  assertRuntimeState(simulation);
  assert.equal(simulation.completed + simulation.scrapped, simulation.received);
  assert.equal(simulation.metrics().wip, 0);
  assert.ok(simulation.closing);
  return simulation;
}

test('defaults, validation and public formatting contract', () => {
  assert.equal(DEFAULTS.jobs, 64);
  assert.equal(DEFAULTS.highFlowMix, 25);
  assert.equal(DEFAULTS.cncMachines, 1);
  assert.equal(DEFAULTS.testStations, 1);
  assert.equal(DEFAULTS.failureEnabled, false);
  assert.equal(SHIFT, 28_800);
  assert.deepEqual(SCENARIOS.map((scenario) => scenario.id), ['baseline', 'highMix', 'cncFailure', 'addTest']);
  assert.equal(clock(0), '08:00');
  assert.equal(clock(SHIFT, true), '16:00:00');
  assert.equal(jobID(7), 'PMP-0007');
  assert.throws(() => validParameters({ ...DEFAULTS, jobs: 0 }));
  assert.throws(() => validParameters({ ...DEFAULTS, testQueueCapacity: 0 }));
  assert.throws(() => validParameters({ ...DEFAULTS, sequenceMode: 'priority' }));
  assert.throws(() => validParameters({ ...DEFAULTS, failureEnabled: 1 }));
});

test('baseline drains deterministically with finite ownership and playback-step independence', () => {
  const eventwise = drain({});
  const stepped = new Simulation(DEFAULTS);
  let iterations = 0;
  while (!stepped.finished) {
    stepped.advance(stepped.time + 137);
    if (iterations % 40 === 0) assertRuntimeState(stepped);
    if (++iterations > 20_000) throw new Error('Stepped playback did not drain');
  }
  assert.equal(stepped.completed, eventwise.completed);
  assert.equal(stepped.scrapped, eventwise.scrapped);
  assertClose(stepped.time, eventwise.time, 1e-7, 'finish time');
  for (const [id, job] of eventwise.jobs) {
    const replica = stepped.jobs.get(id);
    assert.equal(replica.product, job.product);
    assertClose(replica.completed ?? replica.scrappedAt, job.completed ?? job.scrappedAt, 1e-7, `job ${id}`);
  }
});

test('the four scenarios change actual DES outcomes in the expected direction', () => {
  const runs = Object.fromEntries(
    SCENARIOS.map((scenario) => {
      const simulation = drain(scenario.params, { assertEvery: 100 });
      return [scenario.id, simulation.metrics()];
    }),
  );
  assert.ok(runs.highMix.dailyThroughput < runs.baseline.dailyThroughput, 'High-Flow mix lowers shift output');
  assert.ok(runs.highMix.flowAvg > runs.baseline.flowAvg, 'High-Flow mix raises flow time');
  assert.ok(runs.cncFailure.dailyThroughput < runs.baseline.dailyThroughput, 'CNC failures lower shift output');
  assert.ok(runs.cncFailure.flowAvg > runs.baseline.flowAvg, 'CNC failures raise flow time');
  assert.ok(runs.cncFailure.cncFailures > 0);
  assert.ok(runs.cncFailure.downUtilization.cnc > 0);
  assert.ok(runs.addTest.dailyThroughput > runs.baseline.dailyThroughput, 'Second tester increases shift output');
  assert.ok(runs.addTest.flowAvg < runs.baseline.flowAvg, 'Second tester lowers flow time');
  assert.ok(runs.addTest.averageQueues.test < runs.baseline.averageQueues.test, 'Second tester lowers test queue');
  assert.equal(runs.baseline.bottleneck, 'Pressure test');
  assert.equal(runs.cncFailure.bottleneck, 'CNC machining');
  assert.match(runs.baseline.bottleneckReason, /trailing 60 min/i);
});

test('CNC failures pause, repair and resume the same work order without stale completions', () => {
  const scenario = SCENARIOS.find((item) => item.id === 'cncFailure');
  const simulation = new Simulation(scenario.params);
  const histories = new Map();
  const initialCncDurations = new Map();
  const pendingFailures = new Map();
  let resumedFailures = 0;
  const originalSetStage = simulation.setStage.bind(simulation);
  simulation.setStage = (job, stage) => {
    if (!histories.has(job.id)) histories.set(job.id, []);
    histories.get(job.id).push(stage);
    if (stage === 'cncDown') {
      pendingFailures.set(job.id, { at: simulation.time, remaining: job.remainingProcess });
    } else if (stage === 'cncProcessing') {
      const failure = pendingFailures.get(job.id);
      if (failure) {
        assertClose(
          simulation.time - failure.at,
          simulation.params.cncMttrMinutes * 60,
          1e-7,
          `job ${job.id} fixed CNC repair time`,
        );
        assertClose(job.remainingProcess, failure.remaining, 1e-7, `job ${job.id} preserves remaining CNC work`);
        pendingFailures.delete(job.id);
        resumedFailures++;
      } else if (!initialCncDurations.has(job.id)) {
        initialCncDurations.set(job.id, job.processDuration);
      }
    }
    originalSetStage(job, stage);
  };
  while (!simulation.finished) simulation.advance(simulation.calendar.peek());
  assertRuntimeState(simulation);
  const failedJobs = [...simulation.jobs.values()].filter((job) => job.failures > 0);
  assert.ok(failedJobs.length > 0);
  assert.equal(failedJobs.reduce((sum, job) => sum + job.failures, 0), simulation.metrics().cncFailures);
  assert.equal(resumedFailures, simulation.metrics().cncFailures, 'Every failure receives exactly one repair completion');
  assert.equal(pendingFailures.size, 0);
  for (const job of failedJobs) {
    const history = histories.get(job.id);
    for (let index = 0; index < history.length; index++) {
      if (history[index] !== 'cncDown') continue;
      assert.ok(history.slice(index + 1).includes('cncProcessing'), `Job ${job.id} resumes after repair`);
    }
    assert.ok(job.completed !== undefined || job.scrappedAt !== undefined);
  }
  const expectedCncBusy = [...initialCncDurations.values()].reduce((sum, duration) => sum + duration, 0);
  const actualCncBusy = simulation.stations.cnc.resources.reduce((sum, resource) => sum + resource.busyTime, 0);
  assertClose(actualCncBusy, expectedCncBusy, 1e-5, 'Failure/resume consumes each original CNC duration exactly once');
});

test('shared FIFO test queue drains a capacity-one repair cycle with one re-test then scrap', () => {
  const parameters = {
    ...DEFAULTS,
    jobs: 40,
    highFlowMix: 100,
    arrivalRate: 20,
    supplyBufferCapacity: 1,
    cncQueueCapacity: 1,
    kittingQueueCapacity: 1,
    assemblyQueueCapacity: 1,
    testQueueCapacity: 1,
    repairQueueCapacity: 1,
    inspectionQueueCapacity: 1,
    packagingQueueCapacity: 1,
    defectRateMultiplier: 5,
    processTimeMultiplier: 0.3,
    cncChangeoverSeconds: 0,
    testChangeoverSeconds: 0,
  };
  const simulation = new Simulation(parameters);
  const systemMessages = [];
  const fifo = Object.fromEntries(STATION_IDS.map((station) => [station, []]));
  const originalFinishTransport = simulation.finishTransportToQueue.bind(simulation);
  simulation.finishTransportToQueue = (transport) => {
    originalFinishTransport(transport);
    fifo[transport.to].push(transport.jobId);
  };
  const originalStartJob = simulation.startJob.bind(simulation);
  simulation.startJob = (resource, job) => {
    assert.equal(fifo[resource.station].shift(), job.id, `${resource.station} dispatch remains FIFO`);
    originalStartJob(resource, job);
  };
  const originalLog = simulation.log.bind(simulation);
  simulation.log = (id, message, kind) => {
    if (kind === 'system') systemMessages.push(message);
    originalLog(id, message, kind);
  };
  let events = 0;
  let sawUnreservedIncoming = false;
  while (!simulation.finished) {
    simulation.advance(simulation.calendar.peek());
    assertRuntimeState(simulation);
    sawUnreservedIncoming ||= STATION_IDS.some((station) => {
      const state = simulation.stations[station];
      return state.queue.length + state.incoming > state.queueCapacity;
    });
    if (++events > 250_000) throw new Error('Capacity-one feedback model did not drain');
  }
  const metrics = simulation.metrics();
  assert.ok(metrics.reworkRate > 0);
  assert.ok(metrics.scrapped > 0, 'Probe forces a second test failure');
  assert.ok(systemMessages.some((message) => message.includes('Atomic FIFO handoff')));
  assert.ok(sawUnreservedIncoming, 'In-flight jobs are accounted but do not reserve downstream queue slots');
  assert.ok([...simulation.jobs.values()].some((job) => job.repairCount === 1 && job.testAttempts === 2));
  assert.ok([...simulation.jobs.values()].every((job) => job.repairCount <= 1 && job.testAttempts <= 2));
  assert.equal(simulation.stations.test.queue.length, 0);
  assert.equal(simulation.stations.repair.queue.length, 0);
  for (const station of STATION_IDS) assert.deepEqual(fifo[station], [], `${station} FIFO audit drains`);
});

test('sequence-dependent setup rewards batching without changing the exact 50/50 mix', () => {
  const shared = {
    ...DEFAULTS,
    jobs: 40,
    highFlowMix: 50,
    arrivalRate: 10,
    defectRateMultiplier: 0,
  };
  const alternating = drain({ ...shared, sequenceMode: 'alternating' }, { assertEvery: 100 });
  const batched = drain({ ...shared, sequenceMode: 'batched' }, { assertEvery: 100 });
  for (const simulation of [alternating, batched]) {
    assert.equal([...simulation.jobs.values()].filter((job) => job.product === 'highFlow').length, 20);
    assert.equal(simulation.scrapped, 0);
  }
  assert.ok(batched.metrics().changeovers < alternating.metrics().changeovers);
  assert.ok(batched.metrics().setupUtilization.cnc < alternating.metrics().setupUtilization.cnc);
});

test('material releases stop at shift close and unreleased plan volume never becomes WIP', () => {
  const simulation = drain({ jobs: 500, arrivalRate: 1 }, { assertEvery: 100 });
  const metrics = simulation.metrics();
  assert.equal(simulation.received, 8, 'One release per hour during the eight-hour shift');
  assert.equal(metrics.unreleased, 492);
  assert.equal(simulation.jobs.size, 8);
  assert.equal(simulation.closing.released, 8);
  assert.equal(simulation.closing.unreleased, 492);
  assert.equal(metrics.wip, 0);
});
