import { DEFAULTS } from './parameters.ts';
import type { Scenario } from './types.ts';

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'baseline',
    label: 'Baseline',
    description: '25% High-Flow mix · one CNC · one pressure-test station',
    params: { ...DEFAULTS },
  },
  {
    id: 'highMix',
    label: 'High Mix',
    description: '70% High-Flow pumps increase machining, assembly and test load',
    params: { ...DEFAULTS, highFlowMix: 70 },
  },
  {
    id: 'cncFailure',
    label: 'CNC Failure',
    description: 'CNC failures with 35 min MTBF and 18 min fixed repair time',
    params: { ...DEFAULTS, failureEnabled: true, cncMtbfMinutes: 35, cncMttrMinutes: 18 },
  },
  {
    id: 'addTest',
    label: 'Add Test Station',
    description: 'Adds a second independent pressure-test station',
    params: { ...DEFAULTS, testStations: 2 },
  },
] as const;

