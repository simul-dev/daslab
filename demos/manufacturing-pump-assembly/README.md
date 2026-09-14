# Industrial Pump Assembly & Test Line — v1

Independent static React + Vite SPA. Public base: `/demo/manufacturing/pump-assembly/`.
The engine is plain TypeScript with no React, Three.js, server, API, auth or framework-runtime dependency.
UI and 3D read the same engine instance. Rendering never advances the DES or allocates resources.

## Model assumptions (illustrative, not measured customer data)

One production shift is 08:00–16:00. Default plan: 64 pumps, 8 planned releases/hour, 25% High-Flow mix, random sequence, seed 42.
Plans waiting outside the finite release gate are not WIP. At 16:00 no new jobs are admitted; already released WIP drains to finished goods or scrap.
Material release and kit staging each have a finite capacity; both use the staging capacity input in v1.

| Process | Standard | High-Flow | Default resources |
| --- | ---: | ---: | ---: |
| CNC | 6 min | 9 min | 1 |
| Kitting | 2 min | 3 min | 1 |
| Assembly | 7 min | 10 min | 2 |
| Pressure test | 7 min | 11 min | 1 |
| Repair, only after first test failure | 6 min | 9 min | 1 |
| Final inspection | 2.5 min | 3.5 min | 1 |
| Packaging | 2 min | 3 min | 1 |

Process times use a reproducible triangular factor between 0.9 and 1.1 around these means.
First and second pressure tests use the product's test-failure probability: 5% Standard, 12% High-Flow, multiplied by the defect parameter (capped at 95%).
A first failure sends the pump through Repair, then into the **same FIFO** as first tests. There is no re-test priority.
A second failure scraps the pump; there is no third test, second repair or hidden quality-hold queue.

Default buffers: release/staging 12 each, CNC 8, kitting 6, assembly 8, test 8, repair 3, inspection 6, packaging 6.
Only CNC and pressure test have product-family changeovers: 180 s / 90 s respectively; no setup is charged for the first job on a unit.
CNC failures are off in Baseline. When enabled, exponentially sampled uptime accumulates only during machining; fixed MTTR pauses and then resumes the same remaining work.

## Transport and blocking

Every inter-process transfer takes 30 seconds by default. There is no AGV fleet, route competition, transport reservation or destination-slot booking.
The source owns the job until the destination FIFO actually accepts it. Its ordinary transfer occupancy is recorded separately from processing and blocking.
A completed job waits at its source if the next queue is already full; a transfer that later finds the destination full holds source ownership until accepted.
The in-flight counter is display/accounting only and is never subtracted from destination capacity.

Two mutually blocked test/repair resources can make a finite feedback loop deadlock. v1 explicitly permits a simultaneous FIFO handoff: both transfers complete their fixed travel, the oldest queued job starts on each freed unit, and arrivals join opposite queue tails. No queue is enlarged and no re-test jumps the queue.
This simple modeling convention is documented rather than presented as a physical transporter or advanced buffer reservation policy.

## KPIs and comparison

- Completed goods, pumps/elapsed hour, mean/min/max completed flow time, queue wait, WIP/peak WIP.
- First-pass yield and rework rate use completed first tests as their denominator; scrap rate uses the same tested cohort.
- State-time charts use scheduled resource-time: productive, setup, down, transport and blocked. The remainder is idle.
- Effective utilization = (productive + setup + transport) / (scheduled − down). Downtime is **not** counted as productive use.
- Bottleneck: trailing 60-minute queue occupancy, effective utilization and upstream blocking. A simple threshold/ordinal rule is used, not a weighted score.
- Five-minute samples drive charts. Off-grid trailing-window totals interpolate sample boundaries; this is a display approximation, not an alteration of event processing.
- Daily Summary freezes 16:00 output/WIP/unreleased plans, separately from final drain output/scrap/overtime.
- The last four completed runs are retained in the tab for comparison, including seed and input conditions. Reload clears run history.

Four presets:

| Seed 42 preset | Change from baseline | Completed by 16:00 | Mean final completed flow |
| --- | --- | ---: | ---: |
| Baseline | none | 47 | 105.5 min |
| High Mix | 70% High-Flow | 35 | 184.3 min |
| CNC Failure | failures on, MTBF 35 min, MTTR 18 min | 33 | 221.3 min |
| Add Test Station | 2 testers | 55 | 66.0 min |

These are demonstration assumptions, not calibrated pump-plant productivity, investment savings, prices or ROI.

## Implementation map

- `src/lib/simulation/`: deterministic event calendar, keyed random streams, product profiles, resources, finite queues, quality/reliability, metrics.
- `src/lib/scene/`: procedural plant geometry and read-only DES position projection.
- `src/components/PumpLineScene.tsx`: lazy-loaded Three.js viewport, orbit/reset/fullscreen, state lights and job selection.
- `src/components/Analytics.tsx`: KPIs, charts, state breakdown, events, daily summary and comparisons.
- `src/components/ParameterPanel.tsx`: bounded draft inputs; Apply & reset makes changes effective.
- `src/App.tsx`: Start/Pause/Reset/Finish, scenario selection, browser-only run loop, KO/EN presentation.

The overview includes every station and the repair loop. Resource count changes rebuild the scene.
Only the 12 latest terminal pumps are displayed; all live jobs and exact totals remain modeled.
Browser WebGL failure does not prevent the model controls or analytics from working.

## Test and run

From the homepage root:

```powershell
pnpm test:pump
pnpm dev:pump
pnpm check
pnpm preview
```

Engine tests cover seed/playback-step reproducibility, finite FIFO/ownership conservation, exact failure recovery, changeovers, one re-test/scrap, unreserved fixed transport, capacity-one cyclic BAS, release-close accounting, and scenario KPI direction.
Scene layout tests cover bounded placement and continuous transport projection. Final browser checks cover controls, all four presets, mobile layout, camera reset, asset paths and operation after network access is disabled.

See root `LOCAL-DEVELOPMENT.md` for the two-demo build and manual deployment output.

## Deliberately outside v1

Calibrated customer distributions, warm-up/stationarity analysis, P95 and replicated-seed confidence intervals; transport resource competition/path planning; advanced buffer reservation; re-test priority; additional reliability models; CAPEX/OPEX and ROI; larger scenario libraries; imported CAD/GLB assets and richer worker/AGV animation.
