import type { StationId, WorkOrder } from '../simulation/types.ts';

export type Point = [number, number, number];
export type LayoutSource = {
  time: number;
  arrivalQueue: number[];
  supplyBuffer: number[];
  stations: Record<StationId, { queue: number[]; resources: {id: string}[] }>;
};
export const FLOOR = { min: [-35, -0.8, -15] as Point, max: [37, 6, 17] as Point };
export const NODES: Record<StationId | 'supply' | 'finishedGoods', Point> = {
  supply: [-29, 0.9, 0], cnc: [-20, 0.9, 0], kitting: [-12, 0.9, 0],
  assembly: [-4, 0.9, 0], test: [5, 0.9, 0], inspection: [14, 0.9, 0],
  packaging: [23, 0.9, 0], finishedGoods: [32, 0.9, 0], repair: [5, 0.9, 11],
};
export const TITLES: Record<keyof typeof NODES, string> = {
  supply: '01  MATERIAL RELEASE', cnc: '02  CNC MACHINING', kitting: '03  KIT STAGING',
  assembly: '04  ASSEMBLY', test: '05  PRESSURE TEST', repair: 'REPAIR / ONE RE-TEST',
  inspection: '06  FINAL INSPECTION', packaging: '07  PACKAGING', finishedGoods: '08  FINISHED GOODS',
};
export function resourcePoint(station: StationId, index: number, count: number): Point {
  const node = NODES[station];
  if (station === 'repair') return [node[0] + (index - (count-1)/2) * 3.3, 1.25, 7];
  return [node[0] + (count > 1 ? (index % 2 === 0 ? -1.65 : 1.65) : 0), 1.25,
    node[2] - 4 - Math.floor(index / 2) * 3.8];
}
export function queuePoint(station: keyof typeof NODES, index = 0): Point {
  const node = NODES[station];
  const slot = Math.max(0, index);
  return [node[0] - 1.8 + (slot % 4) * 1.1, 0.32 + Math.floor(slot / 12) * 0.85,
    node[2] + Math.floor((slot % 12) / 4) * 1.15];
}
export function interpolateRoute(points: Point[], progress: number): Point {
  if (!points.length) return [0,0,0];
  const lengths = points.slice(1).map((point, i) => Math.hypot(...point.map((value, axis) => value - points[i][axis])));
  let travel = lengths.reduce((sum, value) => sum + value, 0) * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (travel <= lengths[i] && lengths[i] > 0) return points[i].map((value, axis) => value + (points[i+1][axis]-value) * travel / lengths[i]) as Point;
    travel -= lengths[i];
  }
  return [...points[points.length - 1]];
}
function ownedPoint(job: WorkOrder, source: LayoutSource): Point {
  if (job.resourceId && job.transportFrom && job.transportFrom !== 'supply') {
    const state = source.stations[job.transportFrom];
    const index = state.resources.findIndex(unit => unit.id === job.resourceId);
    if (index >= 0) return resourcePoint(job.transportFrom, index, state.resources.length);
  }
  return queuePoint('supply', Math.max(0, source.supplyBuffer.indexOf(job.id)));
}
export function transportRoute(job: WorkOrder, source: LayoutSource): Point[] {
  const from = ownedPoint(job, source);
  const to = queuePoint(job.transportTo ?? 'cnc');
  const laneZ = job.transportFrom === 'repair' || job.transportTo === 'repair' ? 6 : 4;
  return [from, [from[0], from[1], laneZ], [to[0], to[1], laneZ], to];
}
/** Presentation reads DES state only. It never advances time, allocates resources or reserves buffers. */
export function workOrderPoint(job: WorkOrder, source: LayoutSource): Point {
  if (job.transportStartedAt !== null && job.transportReadyAt !== null && job.transportTo) {
    const fraction = (source.time-job.transportStartedAt) / Math.max(1, job.transportReadyAt-job.transportStartedAt);
    return interpolateRoute(transportRoute(job, source), fraction);
  }
  if (job.stage === 'completed') return queuePoint('finishedGoods', job.id % 12);
  if (job.stage === 'scrapped') return [12 + (job.id%3)*0.8, 0.55, 12+Math.floor(job.id%6/3)*0.8];
  if (job.stage === 'arrivalQueue') return [-32+(Math.max(0,source.arrivalQueue.indexOf(job.id))%3), 0.35, 7+Math.floor(Math.max(0,source.arrivalQueue.indexOf(job.id))/3)*0.4];
  if (job.stage === 'supplyBuffer') return queuePoint('supply', source.supplyBuffer.indexOf(job.id));
  for (const [station, state] of Object.entries(source.stations)) {
    const index = state.resources.findIndex(resource => resource.id === job.resourceId);
    if (index >= 0) return resourcePoint(station as StationId, index, state.resources.length);
    const queueIndex = state.queue.indexOf(job.id);
    if (queueIndex >= 0) return queuePoint(station as StationId, queueIndex);
  }
  return [...NODES.supply];
}
export function statusColor(job: WorkOrder): string {
  if (job.stage === 'scrapped' || job.stage.endsWith('Down')) return '#f2686b';
  if (job.stage.endsWith('Blocked')) return '#f39755';
  if (job.stage.endsWith('Setup')) return '#a994e7';
  if (job.stage.includes('Processing')) return '#8cda80';
  if (job.transportTo) return '#29cbe2';
  if (job.stage === 'completed') return '#75d3ac';
  return '#f0c45b';
}
