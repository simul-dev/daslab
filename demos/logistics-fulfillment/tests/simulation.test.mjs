import assert from 'node:assert/strict';
import {
  Simulation,
  DEFAULTS,
  IN_CAP,
  OUT_CAP,
  PICK_LOOP_CAP,
  DOCK_BUFFER,
  TROLLEY_CAP,
  SHIPPING_LOADERS,
  TROLLEY_STORE,
  LOADER_PICKUP,
  LOADING,
  LOADER_RETURN,
  LOADER_CYCLE,
  TOTAL_CONVEYOR_CAP,
  validParameters,
} from '../src/lib/simulation/engine.ts';
import {
  BOX_CLEARANCE,
  BOX_DEPTH,
  BOX_WIDTH,
  IN_PATH,
  LOADER_DROP,
  LOADER_HOME,
  OUT_PATH,
  PICK_STATION_PATH,
  PICK_LOOP_INFEED,
  PICK_LOOP_ENTRY,
  PICK_LOOP_PATH,
  PICK_ENTRY,
  PICK_EXIT,
  PICK_LANE_Z,
  PICK_LOOP_FRONT_Z,
  PICK_LOOP_EXIT_SLOT,
  PICK_LOOP_PITCH,
  TROLLEY_COLUMNS,
  TROLLEY_ENTRY,
  TROLLEY_ROWS,
  TROLLEY_SLOT_PITCH,
  TRUCK_CENTER,
  beltFraction,
  loaderCarryPath,
  loopFraction,
  loopStepSeconds,
  pathLength,
  pointOnPath,
  stationGateSlots,
  stationLayout,
  stationMergeSlots,
  stationTravelSeconds,
  trolleySlotPoint,
  trolleyStowPath,
} from '../src/lib/simulation/layout.ts';
import { ORDER_COLORS, orderPosition, shippingLoaderPosition } from '../src/lib/simulation/position.ts';

const livePositionStages=new Set(['inbound','pickingLoop','toStation','picking','pickBlocked','toMerge','mergeWaiting','toPassing','pickedLoop','outbound','trolleyQueue','manualLoading']);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z,(a.y??0)-(b.y??0));
const sorted=values=>[...values].sort((a,b)=>a-b);

function assertRectilinearPath(path,label){
  for(let index=1;index<path.length;index++){
    const dx=Math.abs(path[index][0]-path[index-1][0]),dz=Math.abs(path[index][1]-path[index-1][1]);
    assert.ok(dx>1e-9||dz>1e-9,`${label} must not contain a zero-length segment`);
    assert.ok(dx<=1e-9||dz<=1e-9,`${label} must turn only at right angles`);
  }
}

function assertRuntimeState(simulation){
  const metrics=simulation.metrics();
  const loopIds=simulation.pickingLoop.filter(id=>id!==null);
  const stationIds=simulation.workers.map(worker=>worker.order).filter(id=>id!==null);
  const trolleyIds=simulation.trolleySlots.filter(id=>id!==null);
  const loadingIds=simulation.shippingLoaders.map(loader=>loader.order).filter(id=>id!==null);
  const locations=[
    ...simulation.inductionQueue,
    ...simulation.inbound,
    ...simulation.pickingLoop,
    ...simulation.outbound,
    ...simulation.trolleySlots,
    ...loadingIds,
    simulation.induction,
    ...stationIds,
  ].filter(value=>value!==null);

  assert.equal(metrics.received-metrics.completed,Object.values(metrics.stageWip).reduce((sum,count)=>sum+count,0),'WIP conservation');
  assert.equal(new Set(locations).size,locations.length,'Every live order occupies one physical location');
  assert.equal(locations.length,metrics.wip);
  assert.equal(simulation.pickingLoop.length,PICK_LOOP_CAP);
  assert.deepEqual(sorted(loopIds),sorted(simulation.loopOrders),'Loop registry matches physical slots');
  assert.equal(new Set(simulation.loopOrders).size,simulation.loopOrders.length);
  assert.equal(metrics.stageWip.pickingLoop,loopIds.length);
  assert.equal(metrics.loopWip,loopIds.length);
  assert.equal(metrics.stageWip.outbound,simulation.outbound.filter(id=>id!==null).length);
  assert.equal(metrics.stageWip.picking,stationIds.length);
  assert.equal(metrics.stageWip.dock,trolleyIds.length+loadingIds.length);
  assert.ok(loopIds.length+stationIds.length<=PICK_LOOP_CAP,'Every station box preserves one loop hole');

  simulation.pickingLoop.forEach((id,slot)=>{
    if(id===null)return;
    const order=simulation.orders.get(id);
    assert.ok(order.stage==='pickingLoop'||order.stage==='pickedLoop','Only pre/post-pick loop stages occupy the passing loop');
    assert.equal(order.slot,slot);
    assert.equal(order.worker,(order.id-1)%simulation.params.workers);
    const delta=(order.slot-order.previousSlot+PICK_LOOP_CAP)%PICK_LOOP_CAP;
    assert.ok(delta===0||delta===1,'A loop box advances one circular slot at a time');
    assert.ok(Number.isInteger(order.recirculations)&&order.recirculations>=0);
    const projected=orderPosition(order,simulation);
    const expectedColor=(order.stage==='pickingLoop'&&order.previousSlot===-1)||projected.z>PICK_LOOP_FRONT_Z+1e-7?ORDER_COLORS.waiting:ORDER_COLORS.moving;
    assert.equal(projected.color,expectedColor,'Only loop infeed and the physical recirculation return use the waiting color');
  });

  for(const [slot,reservation] of simulation.mergeReservations){
    assert.equal(slot,reservation.slot);
    assert.equal(simulation.pickingLoop[slot],null,'A reserved merge slot stays empty during perpendicular transfer');
    const order=simulation.orders.get(reservation.id),worker=simulation.workers[reservation.station];
    assert.equal(order.stage,'toPassing');
    assert.equal(order.worker,reservation.station);
    assert.equal(worker.order,order.id);
    assert.equal(worker.phase,'transfer');
    assert.equal(stationLayout(reservation.station,simulation.params.workers).mergeSlot,slot);
  }

  assert.equal(simulation.trolleySlots.length,TROLLEY_CAP);
  assert.equal(simulation.trolleyQueue.length,trolleyIds.length,'Trolley FIFO registry matches occupied physical cells');
  assert.deepEqual(sorted(simulation.trolleyQueue),sorted(trolleyIds),'Trolley FIFO and slot owners agree');
  assert.equal(new Set(simulation.trolleyQueue).size,simulation.trolleyQueue.length,'Trolley FIFO has unique owners');
  for(const id of simulation.trolleyQueue){
    const order=simulation.orders.get(id);
    assert.equal(order.stage,'trolleyQueue');
    assert.ok(Number.isInteger(order.trolleySlot)&&order.trolleySlot>=0&&order.trolleySlot<TROLLEY_CAP);
    assert.equal(simulation.trolleySlots[order.trolleySlot],id,'Order retains its stable physical trolley cell');
    assert.equal(order.loader,-1,'A trolley order is not owned by a loader');
  }
  const activelyStowing=simulation.trolleyQueue.map(id=>simulation.orders.get(id)).filter(order=>simulation.time+1e-9<order.stageAt+TROLLEY_STORE);
  assert.ok(activelyStowing.length<=1,'The powered auto-stow trolley handles one box at a time');
  if(activelyStowing.length){
    assert.ok(Math.abs(simulation.trolleyStowingUntil-(activelyStowing[0].stageAt+TROLLEY_STORE))<1e-7);
    assert.equal(simulation.trolleyQueue.at(-1),activelyStowing[0].id,'The active stow is the newest FIFO arrival');
  }

  assert.equal(simulation.shippingLoaders.length,SHIPPING_LOADERS);
  simulation.shippingLoaders.forEach((loader,index)=>{
    assert.ok(loader.phaseAt<=simulation.time+1e-9);
    assert.ok(loader.busy>=0&&loader.boxes>=0);
    if(loader.phase==='idle'){
      assert.equal(loader.order,null);
      assert.equal(loader.trolleySlot,-1);
    }else if(loader.phase==='loading'){
      assert.notEqual(loader.order,null);
      const order=simulation.orders.get(loader.order);
      assert.equal(order.stage,'manualLoading');
      assert.equal(order.loader,index);
      assert.equal(order.trolleySlot,loader.trolleySlot);
      assert.ok(loader.trolleySlot>=0&&loader.trolleySlot<TROLLEY_CAP);
      assert.notEqual(simulation.trolleySlots[loader.trolleySlot],loader.order,'A loader removes its box from the trolley cell');
    }else{
      assert.equal(loader.phase,'returning');
      assert.equal(loader.order,null,'A delivered box is released while its loader returns');
      assert.ok(loader.trolleySlot>=0&&loader.trolleySlot<TROLLEY_CAP);
    }
    const loaderPosition=shippingLoaderPosition(index,simulation);
    assert.ok(Number.isFinite(loaderPosition.x)&&Number.isFinite(loaderPosition.z));
  });

  assert.equal(simulation.shippingLoaders.reduce((sum,loader)=>sum+loader.boxes,0),simulation.completed,'Every completed order was delivered by exactly one loader');
  assert.ok(loopIds.length<=PICK_LOOP_CAP&&simulation.trolleyQueue.length<=TROLLEY_CAP);
  assert.equal(DOCK_BUFFER,TROLLEY_CAP,'The compatibility dock capacity is the physical trolley capacity');
  assert.ok(metrics.inWip<=IN_CAP&&metrics.outWip<=OUT_CAP);
  assert.equal(metrics.loopCapacity,PICK_LOOP_CAP);
  assert.equal(metrics.conveyorCapacity,TOTAL_CONVEYOR_CAP);
  assert.equal(TOTAL_CONVEYOR_CAP,92,'The removed third feed line contributes no phantom capacity');
  for(const utilization of Object.values(metrics.utilization))assert.ok(utilization>=0&&utilization<=100.00001,'Utilization bounded');
  assert.ok(simulation.truckLoad<=simulation.params.truckCapacity);
  assert.ok(simulation.truckLoad+loadingIds.length<=simulation.params.truckCapacity,'In-flight loader work reserves truck capacity');
  if(!simulation.truckAvailable){
    assert.equal(loadingIds.length,0,'No box may be loaded into a departed truck');
    assert.ok(simulation.shippingLoaders.every(loader=>loader.phase==='idle'),'Truck dispatch waits for both loaders to clear');
    assert.equal(simulation.truckDispatchDue,false);
  }
  assert.equal(simulation.truckLoad===0,simulation.truckFirstLoadedAt===null,'Truck first-load timer follows its current load');
  if(simulation.truckDispatchDue)assert.ok(simulation.truckAvailable&&simulation.truckLoad>0,'A pending dispatch belongs to the present loaded truck');
  assert.equal(metrics.shippingLoaders.length,SHIPPING_LOADERS);

  simulation.workers.forEach((worker,index)=>{
    if(worker.order===null){assert.equal(worker.phase,'idle');return;}
    const order=simulation.orders.get(worker.order);
    assert.equal(order.worker,index);
    const expected=order.stage==='picking'?'picking':order.stage==='pickBlocked'||order.stage==='mergeWaiting'?'blocked':'transfer';
    assert.equal(worker.phase,expected);
  });
}

function run(parameters,step=113){
  const simulation=new Simulation({...DEFAULTS,...parameters});
  let iterations=0;
  while(!simulation.finished){simulation.advance(simulation.time+step);assertRuntimeState(simulation);if(++iterations>30000)throw new Error('No drain');}
  assert.equal(simulation.completed,simulation.params.orders);
  assert.equal(simulation.metrics().wip,0);
  assert.ok(simulation.closing);
  assert.equal(simulation.closing.unfinished,simulation.params.orders-simulation.closing.completed);
  assert.equal(simulation.orders.size,simulation.params.orders);
  assert.equal(simulation.pickedSKU,[...simulation.orders.values()].reduce((sum,order)=>sum+order.sku,0));
  assert.equal(simulation.pickingLoop.every(id=>id===null),true);
  assert.equal(simulation.loopOrders.length,0);
  assert.equal(simulation.mergeReservations.size,0);
  assert.ok(simulation.workers.every(worker=>worker.order===null&&worker.phase==='idle'));
  assert.equal(simulation.trolleyQueue.length,0);
  assert.ok(simulation.trolleySlots.every(id=>id===null));
  assert.ok(simulation.shippingLoaders.every(loader=>loader.order===null&&loader.phase==='idle'&&loader.trolleySlot===-1));
  assert.equal(simulation.shippingLoaders.reduce((sum,loader)=>sum+loader.boxes,0),simulation.params.orders);
  assert.equal(simulation.truckLoad,0,'The final partial truck is dispatched before the model finishes');
  assert.equal(simulation.truckDispatchDue,false);
  for(const order of simulation.orders.values()){assert.ok(order.completed>=order.created);assert.ok(order.wait>=0);assert.ok(order.wait<=order.completed-order.created);}
  return simulation;
}

function runEventwise(){
  const simulation=new Simulation({...DEFAULTS,orders:100,workers:2,basePick:120,skuPick:60,conveyorSpeed:1.5,truckCapacity:20,seed:7});
  const histories=new Map(),trolleyArrivals=[],trolleyArrivalTimes=[],loadingStarts=[],originalSetStage=simulation.setStage.bind(simulation);
  simulation.setStage=(order,stage)=>{
    if(!histories.has(order.id))histories.set(order.id,[]);
    histories.get(order.id).push(stage);
    if(stage==='trolleyQueue'){
      if(trolleyArrivalTimes.length)assert.ok(simulation.time-trolleyArrivalTimes.at(-1)>=TROLLEY_STORE-1e-7,'Auto-stow operations never overlap');
      trolleyArrivals.push(order.id);trolleyArrivalTimes.push(simulation.time);
    }
    if(stage==='manualLoading'){
      assert.equal(order.stage,'trolleyQueue');
      assert.ok(simulation.time-order.stageAt>=TROLLEY_STORE-1e-7,'A loader waits for auto-stow to finish');
      loadingStarts.push(order.id);
    }
    originalSetStage(order,stage);
  };
  let events=0,sawEntryWaiting=false,sawRecirculationWaiting=false,sawFrontMoving=false;
  while(!simulation.finished){
    const next=simulation.calendar.peek();assert.ok(Number.isFinite(next),'Live model must retain a future event');
    simulation.advance(Math.max(simulation.time,next-1e-7));
    const before=new Map([...simulation.orders.values()].filter(order=>order.stage!=='completed').map(order=>[order.id,{stage:order.stage,slot:order.slot,trolleySlot:order.trolleySlot,position:orderPosition(order,simulation)}]));
    simulation.advance(next);assertRuntimeState(simulation);
    for(const order of simulation.orders.values()){
      const prior=before.get(order.id);if(!prior||order.stage==='completed')continue;
      if(livePositionStages.has(prior.stage)||livePositionStages.has(order.stage))assert.ok(distance(prior.position,orderPosition(order,simulation))<1e-4,`Material-flow position discontinuity for ${order.id}: ${prior.stage} -> ${order.stage}`);
      if((prior.stage==='pickingLoop'||prior.stage==='pickedLoop')&&(order.stage==='pickingLoop'||order.stage==='pickedLoop')){const delta=(order.slot-prior.slot+PICK_LOOP_CAP)%PICK_LOOP_CAP;assert.ok(delta===0||delta===1,'Loop movement is modular and single-slot');}
      if(prior.stage==='trolleyQueue'&&order.stage==='trolleyQueue')assert.equal(order.trolleySlot,prior.trolleySlot,'A queued box never jumps to another trolley cell');
    }
    for(const id of simulation.pickingLoop){
      if(id===null)continue;
      const order=simulation.orders.get(id),projected=orderPosition(order,simulation),atEntry=order.stage==='pickingLoop'&&order.previousSlot===-1,onRecirculation=projected.z>PICK_LOOP_FRONT_Z+1e-7;
      if(atEntry){sawEntryWaiting=true;assert.equal(projected.color,ORDER_COLORS.waiting);}
      else if(onRecirculation){sawRecirculationWaiting=true;assert.equal(projected.color,ORDER_COLORS.waiting);}
      else{sawFrontMoving=true;assert.equal(projected.color,ORDER_COLORS.moving);}
    }
    if(++events>300000)throw new Error('Eventwise model did not drain');
  }
  const expected=['induction','inbound','pickingLoop','toStation','picking','pickBlocked','toMerge','mergeWaiting','toPassing','pickedLoop','outbound','trolleyQueue','manualLoading','completed'];
  for(const [id,history] of histories)assert.deepEqual(history,expected,`Allowed stage sequence for order ${id}`);
  assert.equal(histories.size,simulation.params.orders);
  assert.deepEqual(loadingStarts,trolleyArrivals,'The two loaders preserve auto-stow trolley FIFO order');
  assert.ok(sawEntryWaiting&&sawRecirculationWaiting&&sawFrontMoving,'The probe observes waiting entry/recirculation boxes and moving boxes on the front passing line');
  assert.ok(simulation.recirculations>0,'Busy target stations force physical recirculation');
  return simulation;
}

function assertNoDpsOverlap(simulation){
  const ids=[...simulation.inbound,...simulation.pickingLoop,...simulation.workers.map(worker=>worker.order),...simulation.outbound].filter(id=>id!==null),unique=[...new Set(ids)];
  for(let left=0;left<unique.length;left++)for(let right=left+1;right<unique.length;right++){
    const a=simulation.orders.get(unique[left]),b=simulation.orders.get(unique[right]),pa=orderPosition(a,simulation),pb=orderPosition(b,simulation),dx=Math.abs(pa.x-pb.x),dz=Math.abs(pa.z-pb.z);
    assert.ok(dx>=BOX_WIDTH-1e-7||dz>=BOX_DEPTH-1e-7,`DPS box footprints overlap at ${simulation.time}: ${a.id}/${a.stage} and ${b.id}/${b.stage}`);
  }
}

function runSaturationProbe(){
  const simulation=new Simulation({...DEFAULTS,orders:1000,workers:1,basePick:120,skuPick:60,conveyorSpeed:.1,truckCapacity:20});
  let sawReservedHole=false,sawFullInvariant=false,sawWrap=false,sawMergeAfterFull=false,wasFull=false,events=0;
  while(!simulation.finished){
    const next=simulation.calendar.peek();assert.ok(Number.isFinite(next));simulation.advance(next);
    if(events%100===0){assertRuntimeState(simulation);assertNoDpsOverlap(simulation);}
    const stationCount=simulation.workers.filter(worker=>worker.order!==null).length,total=simulation.loopOrders.length+stationCount;
    if(total===PICK_LOOP_CAP){sawFullInvariant=true;wasFull=true;}
    if(simulation.mergeReservations.size){sawReservedHole=true;for(const slot of simulation.mergeReservations.keys())assert.equal(simulation.pickingLoop[slot],null);}
    if(wasFull&&[...simulation.orders.values()].some(order=>order.stage==='pickedLoop'))sawMergeAfterFull=true;
    sawWrap||=simulation.pickingLoop[0]!==null&&simulation.orders.get(simulation.pickingLoop[0]).previousSlot===PICK_LOOP_CAP-1;
    if(++events>500000)throw new Error('Saturation probe did not drain');
  }
  assert.ok(sawFullInvariant&&sawReservedHole&&sawWrap&&sawMergeAfterFull,'Saturated loop preserved a hole, merged and drained');
  assert.equal(simulation.completed,simulation.params.orders);
  return simulation;
}

function runParallelAndBackpressureProbe(){
  const simulation=new Simulation({...DEFAULTS,orders:3000,workers:6,basePick:5,skuPick:5,conveyorSpeed:1.5,racks:5,truckCapacity:20,seed:19});
  const trolleyArrivals=[],trolleyArrivalTimes=[],loadingStarts=[],dispatchLoads=[];
  const originalSetStage=simulation.setStage.bind(simulation),originalTryDispatch=simulation.tryDispatch.bind(simulation);
  simulation.setStage=(order,stage)=>{
    if(stage==='trolleyQueue'){
      if(trolleyArrivalTimes.length)assert.ok(simulation.time-trolleyArrivalTimes.at(-1)>=TROLLEY_STORE-1e-7,'The auto-stow trolley remains single-cycle');
      trolleyArrivals.push(order.id);trolleyArrivalTimes.push(simulation.time);
    }
    if(stage==='manualLoading'){
      assert.equal(order.stage,'trolleyQueue');assert.ok(simulation.time-order.stageAt>=TROLLEY_STORE-1e-7);
      loadingStarts.push(order.id);
    }
    originalSetStage(order,stage);
  };
  simulation.tryDispatch=(force=false)=>{
    const trips=simulation.truckTrips,load=simulation.truckLoad,activeWorkers=simulation.shippingLoaders.filter(loader=>loader.phase!=='idle').length;
    const dispatched=originalTryDispatch(force);
    if(simulation.truckTrips>trips){assert.equal(activeWorkers,0,'Truck cannot depart before both loaders clear');assert.ok(load>0&&load<=simulation.params.truckCapacity);dispatchLoads.push(load);}
    return dispatched;
  };
  let maxConcurrentTransfers=0,maxConcurrentLoaders=0,sawTrolleyFull=false,sawTruckAwayWithQueue=false,sawTruckReturn=false,sawResumeAfterReturn=false,sawProjectedFull=false,wasTruckAvailable=true,events=0;
  while(!simulation.finished){
    simulation.advance(simulation.calendar.peek());
    maxConcurrentTransfers=Math.max(maxConcurrentTransfers,simulation.workers.filter(worker=>worker.phase==='transfer').length);
    const activeLoads=simulation.shippingLoaders.filter(loader=>loader.phase==='loading').length;
    maxConcurrentLoaders=Math.max(maxConcurrentLoaders,activeLoads);
    assert.ok(simulation.truckLoad+activeLoads<=simulation.params.truckCapacity,'Concurrent loaders never overbook the truck');
    sawProjectedFull||=simulation.truckLoad+activeLoads===simulation.params.truckCapacity;
    sawTrolleyFull||=simulation.trolleyQueue.length===TROLLEY_CAP;
    sawTruckAwayWithQueue||=!simulation.truckAvailable&&simulation.trolleyQueue.length>0;
    if(!wasTruckAvailable&&simulation.truckAvailable)sawTruckReturn=true;
    if(sawTruckReturn&&simulation.truckAvailable&&activeLoads>0)sawResumeAfterReturn=true;
    wasTruckAvailable=simulation.truckAvailable;
    if(events%250===0)assertRuntimeState(simulation);
    if(++events>500000)throw new Error('Backpressure probe did not drain');
  }
  assert.ok(maxConcurrentTransfers>1,'Independent station transfers can operate concurrently');
  assert.equal(maxConcurrentLoaders,SHIPPING_LOADERS,'Both fast shipping loaders work concurrently');
  assert.ok(simulation.shippingLoaders.every(loader=>loader.boxes>0),'Both shipping loaders receive work');
  assert.deepEqual(loadingStarts,trolleyArrivals,'Parallel loading preserves trolley FIFO order');
  assert.equal(dispatchLoads.reduce((sum,load)=>sum+load,0),simulation.params.orders,'Every loaded box leaves on exactly one truck');
  assert.equal(dispatchLoads.length,simulation.truckTrips);
  assert.ok(sawProjectedFull,'The probe exercises truck-capacity reservation with concurrent loaders');
  assert.ok(sawTrolleyFull&&sawTruckAwayWithQueue&&sawResumeAfterReturn,'Trolley backpressure clears after the replacement truck arrives');
  assert.equal(simulation.completed,simulation.params.orders);
  return simulation;
}

function runEgressInterlockProbe(){
  const simulation=new Simulation({...DEFAULTS,orders:100,workers:4,basePick:5,skuPick:5,conveyorSpeed:1.5,racks:5,truckCapacity:20,seed:31});
  const originalBeltEntryOpen=simulation.beltEntryOpen.bind(simulation);
  simulation.beltEntryOpen=type=>type==='outbound'?false:originalBeltEntryOpen(type);
  let sawPickedPassExit=false,events=0;
  while(!sawPickedPassExit){
    const next=simulation.calendar.peek();assert.ok(Number.isFinite(next),'A blocked egress must retain a loop event');simulation.advance(next);
    sawPickedPassExit=simulation.pickingLoop.some((id,slot)=>id!==null&&slot>PICK_LOOP_EXIT_SLOT&&simulation.orders.get(id).stage==='pickedLoop');
    if(events%100===0)assertRuntimeState(simulation);
    if(++events>100000)throw new Error('Egress interlock was not exercised');
  }
  simulation.beltEntryOpen=originalBeltEntryOpen;
  while(!simulation.finished){simulation.advance(simulation.time+211);assertRuntimeState(simulation);if(++events>300000)throw new Error('Released egress did not drain');}
  assert.equal(simulation.completed,simulation.params.orders,'A recirculated picked box exits after downstream reopens');
  return simulation;
}

const baseline=run({});
const replica=run({},997);
const moreWorkers=run({workers:6});
const highDemand=run({orders:2000});
const slowConveyor=run({conveyorSpeed:.05});
const light=run({orders:100,workers:6,basePick:5,skuPick:5,seed:1},271);
const eventwise=runEventwise();
const saturation=runSaturationProbe();
const backpressure=runParallelAndBackpressureProbe();
const egressInterlock=runEgressInterlockProbe();

assert.equal(DEFAULTS.basePick,15);
assert.equal(DEFAULTS.skuPick,5);
assert.equal(OUT_CAP,10);
assert.equal(TROLLEY_CAP,16);
assert.equal(SHIPPING_LOADERS,2);
assert.equal(TROLLEY_STORE,2);
assert.equal(LOADER_PICKUP,1);
assert.equal(LOADING,6);
assert.equal(LOADER_RETURN,2);
assert.equal(LOADER_CYCLE,8);
assert.equal(baseline.metrics().leadAvg,replica.metrics().leadAvg,'Playback-step independent results');
assert.equal(baseline.time,replica.time);
assert.ok(moreWorkers.metrics().leadAvg<baseline.metrics().leadAvg);
assert.ok(highDemand.metrics().leadAvg>baseline.metrics().leadAvg);
assert.ok(slowConveyor.metrics().conveyorOccupancy>baseline.metrics().conveyorOccupancy);
assert.ok(slowConveyor.metrics().leadAvg>baseline.metrics().leadAvg);
assert.ok(light.metrics().overtime<180);
assert.ok(light.closing.unfinished<=1);
assert.equal(saturation.metrics().maxQueue,PICK_LOOP_CAP);
assert.ok(saturation.metrics().recirculations>0);

for(const order of baseline.orders.values()){
  const other=moreWorkers.orders.get(order.id);assert.equal(order.created,other.created);assert.equal(order.sku,other.sku);assert.equal(order.pickDuration,other.pickDuration);assert.equal(order.worker,(order.id-1)%baseline.params.workers);
}
const stationCounts=baseline.workers.map(worker=>worker.orders);assert.ok(Math.max(...stationCounts)-Math.min(...stationCounts)<=1);

const reset=new Simulation(DEFAULTS);assert.equal(reset.time,0);assert.equal(reset.received,0);assert.equal(reset.samples.length,1);
assert.throws(()=>validParameters({...DEFAULTS,workers:0}));assert.throws(()=>validParameters({...DEFAULTS,conveyorSpeed:Number.NaN}));

assert.ok(BOX_CLEARANCE>Math.max(BOX_WIDTH,BOX_DEPTH));
for(const [path,capacity] of [[IN_PATH,IN_CAP],[OUT_PATH,OUT_CAP]])assert.ok(pathLength(path)/(capacity-1)>BOX_WIDTH+BOX_DEPTH,'Linear conveyor pitch clears corner footprints');
assert.ok(Math.abs(pathLength(OUT_PATH)/(OUT_CAP-1)-1.2)<1e-9,'Straight outbound keeps the physical 1.2 m pitch');
assert.ok(PICK_LOOP_PITCH>BOX_WIDTH+BOX_DEPTH);
assert.ok(Math.abs(PICK_LOOP_PITCH-1.2)<1e-9);
assert.equal(beltFraction(0,IN_CAP),0);assert.equal(beltFraction(IN_CAP-1,IN_CAP),1);assert.equal(loopFraction(0,PICK_LOOP_CAP),0);assert.equal(loopFraction(PICK_LOOP_CAP,PICK_LOOP_CAP),0);
const loopColorProbe=(stage,slot,previousSlot=slot)=>orderPosition({stage,slot,previousSlot,moveAt:0,stageAt:0},{time:0,params:DEFAULTS});
assert.equal(loopColorProbe('pickingLoop',0,-1).color,ORDER_COLORS.waiting,'Loop infeed is waiting');
assert.equal(loopColorProbe('pickingLoop',PICK_LOOP_EXIT_SLOT-1).color,ORDER_COLORS.moving,'Pre-pick box on front passing line is moving');
assert.equal(loopColorProbe('pickedLoop',PICK_LOOP_EXIT_SLOT-1).color,ORDER_COLORS.moving,'Picked box on front passing line is moving');
assert.equal(loopColorProbe('pickingLoop',PICK_LOOP_EXIT_SLOT+1).color,ORDER_COLORS.waiting,'Pre-pick box on recirculation return is waiting');
assert.equal(loopColorProbe('pickedLoop',PICK_LOOP_EXIT_SLOT+1).color,ORDER_COLORS.waiting,'Picked box on recirculation return is waiting');
assert.deepEqual(pointOnPath(IN_PATH,0),IN_PATH[0]);assert.deepEqual(pointOnPath(IN_PATH,1),PICK_LOOP_INFEED);
assert.deepEqual(PICK_LOOP_PATH[0],PICK_LOOP_ENTRY);assert.deepEqual(PICK_LOOP_PATH.at(-1),PICK_LOOP_ENTRY);assert.deepEqual(OUT_PATH[0],PICK_EXIT);assert.deepEqual(OUT_PATH.at(-1),TROLLEY_ENTRY);
assert.equal(OUT_PATH.length,2,'Outbound is one straight conveyor with no doglegs');
assert.ok(OUT_PATH.every(point=>Math.abs(point[1]-OUT_PATH[0][1])<1e-9),'Outbound remains horizontal from loop to trolley');
for(let index=1;index<OUT_PATH.length;index++)assert.ok(OUT_PATH[index][0]>OUT_PATH[index-1][0],'Outbound moves monotonically toward the trolley');
assert.deepEqual(PICK_STATION_PATH,[[PICK_ENTRY[0],PICK_LANE_Z],[PICK_EXIT[0],PICK_LANE_Z]]);
assertRectilinearPath(PICK_LOOP_PATH,'Passing / recirculation loop');assertRectilinearPath(PICK_STATION_PATH,'Station picking conveyor');assertRectilinearPath(OUT_PATH,'Outbound route');
assert.ok(loopStepSeconds(PICK_LOOP_PATH,PICK_LOOP_CAP,.6)>0);assert.throws(()=>loopStepSeconds(PICK_LOOP_PATH,PICK_LOOP_CAP,0));
assert.deepEqual(pointOnPath(PICK_LOOP_PATH,loopFraction(PICK_LOOP_EXIT_SLOT,PICK_LOOP_CAP)),PICK_EXIT,'Outbound diverter is an exact loop slot');

assert.equal(TROLLEY_COLUMNS*TROLLEY_ROWS,TROLLEY_CAP);
assert.ok(TROLLEY_SLOT_PITCH>Math.max(BOX_WIDTH,BOX_DEPTH),'Trolley cells clear each box footprint');
const trolleyPoints=Array.from({length:TROLLEY_CAP},(_,slot)=>trolleySlotPoint(slot));
assert.equal(new Set(trolleyPoints.map(point=>point.join(','))).size,TROLLEY_CAP,'Every trolley cell has a unique physical position');
for(let left=0;left<trolleyPoints.length;left++)for(let right=left+1;right<trolleyPoints.length;right++){
  const dx=Math.abs(trolleyPoints[left][0]-trolleyPoints[right][0]),dz=Math.abs(trolleyPoints[left][1]-trolleyPoints[right][1]);
  assert.ok(dx>=BOX_WIDTH||dz>=BOX_DEPTH,'Trolley cell footprints remain separated');
}
for(let slot=0;slot<TROLLEY_CAP;slot++){
  const stow=trolleyStowPath(slot);assert.deepEqual(stow[0],TROLLEY_ENTRY);assert.deepEqual(stow.at(-1),trolleySlotPoint(slot));assertRectilinearPath(stow,`Trolley stow path ${slot}`);
  for(let loader=0;loader<SHIPPING_LOADERS;loader++){
    const carry=loaderCarryPath(slot,loader);assert.deepEqual(carry[0],trolleySlotPoint(slot));assert.deepEqual(carry.at(-1),LOADER_DROP[loader]);
    for(let index=1;index<carry.length;index++)assert.ok(Math.hypot(carry[index][0]-carry[index-1][0],carry[index][1]-carry[index-1][1])>0,'Loader carry route has no zero-length leg');
  }
}
assert.equal(LOADER_HOME.length,SHIPPING_LOADERS);assert.equal(LOADER_DROP.length,SHIPPING_LOADERS);
assert.equal(new Set(LOADER_HOME.map(point=>point.join(','))).size,SHIPPING_LOADERS);assert.equal(new Set(LOADER_DROP.map(point=>point.join(','))).size,SHIPPING_LOADERS);
assert.ok(TRUCK_CENTER[1]>Math.max(...LOADER_DROP.map(point=>point[1])),'Loader drops terminate at the truck apron');
assert.throws(()=>trolleySlotPoint(-1));assert.throws(()=>trolleySlotPoint(TROLLEY_CAP));assert.throws(()=>loaderCarryPath(0,SHIPPING_LOADERS));

const loopPoints=Array.from({length:PICK_LOOP_CAP},(_,index)=>pointOnPath(PICK_LOOP_PATH,loopFraction(index,PICK_LOOP_CAP)));
assert.equal(new Set(loopPoints.map(point=>point.join(','))).size,PICK_LOOP_CAP);
for(let left=0;left<loopPoints.length;left++)for(let right=left+1;right<loopPoints.length;right++){const dx=Math.abs(loopPoints[left][0]-loopPoints[right][0]),dz=Math.abs(loopPoints[left][1]-loopPoints[right][1]);assert.ok(dx>=BOX_WIDTH||dz>=BOX_DEPTH,'Loop slot footprints remain separated');}

const expectedGateSlots=[[11],[8,14],[5,11,17],[2,8,14,20],[2,7,12,17,22],[2,6,10,14,18,22]];
const expectedMergeSlots=[[15],[12,18],[9,15,21],[6,12,18,24],[5,10,15,20,24],[4,8,12,16,20,24]];
for(let count=1;count<=6;count++){
  const stations=Array.from({length:count},(_,index)=>stationLayout(index,count));
  assert.deepEqual(stationGateSlots(count),expectedGateSlots[count-1]);assert.deepEqual(stationMergeSlots(count),expectedMergeSlots[count-1]);
  assert.equal(new Set(stations.map(station=>station.gateSlot)).size,count);assert.equal(new Set(stations.map(station=>station.mergeSlot)).size,count);
  for(let index=0;index<count;index++){
    const station=stations[index];
    assert.deepEqual(station.gate,pointOnPath(PICK_LOOP_PATH,loopFraction(station.gateSlot,PICK_LOOP_CAP)));
    assert.deepEqual(station.merge,pointOnPath(PICK_LOOP_PATH,loopFraction(station.mergeSlot,PICK_LOOP_CAP)));
    assert.equal(station.gate[1],PICK_LOOP_FRONT_Z);assert.equal(station.merge[1],PICK_LOOP_FRONT_Z);
    assert.equal(station.stationEntry[0],station.gate[0]);assert.equal(station.stationEntry[1],PICK_LANE_Z);
    assert.equal(station.stationExit[0],station.merge[0]);assert.equal(station.stationExit[1],PICK_LANE_Z);
    assert.equal(Math.abs(station.stationEntry[1]-station.gate[1]),Math.abs(PICK_LANE_Z-PICK_LOOP_FRONT_Z),'Entry transfer deck spans the complete lane gap');
    assert.equal(Math.abs(station.merge[1]-station.stationExit[1]),Math.abs(PICK_LANE_Z-PICK_LOOP_FRONT_Z),'Return transfer deck spans the complete lane gap');
    assert.ok(station.gate[0]<station.pick[0]&&station.pick[0]<station.merge[0]);
    assert.deepEqual(station.approach,[station.gate,station.stationEntry,station.pick]);
    assert.deepEqual(station.localDeparture,[station.pick,station.stationExit]);
    assert.deepEqual(station.mergeTransfer,[station.stationExit,station.merge]);
    assert.deepEqual(station.departure,[station.pick,station.stationExit,station.merge]);
    assert.deepEqual(station.branch,[station.gate,station.stationEntry,station.pick,station.stationExit,station.merge],'Every branch is fully covered by two transfer decks and one station conveyor');
    assert.deepEqual([...new Set(station.branch.map(point=>point[1]))].sort((a,b)=>a-b),[PICK_LANE_Z,PICK_LOOP_FRONT_Z],'Station-front topology contains exactly two adjacent lane elevations');
    for(const [path,label] of [[station.branch,'branch'],[station.approach,'approach'],[station.localDeparture,'local departure'],[station.mergeTransfer,'merge transfer'],[station.departure,'departure']])assertRectilinearPath(path,`Station ${index+1} ${label}`);
    for(const speed of [.05,.6,1.5])for(const direction of ['approach','localDeparture','mergeTransfer','departure'])assert.equal(stationTravelSeconds(index,count,direction,speed),pathLength(station[direction])/speed);
  }
  for(let index=0;index<stations.length-1;index++)assert.ok(stations[index].merge[0]+BOX_CLEARANCE<=stations[index+1].gate[0]);
}

const defaultStations=Array.from({length:4},(_,index)=>stationLayout(index,4));
assert.deepEqual(defaultStations.map(station=>station.gate.map(value=>+value.toFixed(1))),[[-11.2,0],[-4,0],[3.2,0],[10.4,0]]);
assert.deepEqual(defaultStations.map(station=>station.pick.map(value=>+value.toFixed(1))),[[-8.8,-1.2],[-1.6,-1.2],[5.6,-1.2],[12.8,-1.2]]);
assert.deepEqual(defaultStations.map(station=>station.merge.map(value=>+value.toFixed(1))),[[-6.4,0],[.8,0],[8,0],[15.2,0]]);
for(let index=1;index<defaultStations.length;index++)assert.ok(Math.abs(defaultStations[index].zoneCenter-defaultStations[index-1].zoneCenter-7.2)<1e-9);

console.log('PASS: two adjacent DPS lanes, deck-covered orthogonal transfers, shared passing-loop merge, straight outbound, stable auto-stow trolley slots, two concurrent loaders, safe truck reservations and dispatch, material-flow continuity, backpressure recovery, WIP conservation, deterministic replay, final drain, and input validation.');
for(const [name,simulation] of Object.entries({baseline,moreWorkers,highDemand,slowConveyor,light,eventwise,saturation,backpressure,egressInterlock})){
  const metrics=simulation.metrics();console.log(JSON.stringify({name,orders:metrics.received,completedAtClose:metrics.dailyThroughput,leadMin:+metrics.leadAvg.toFixed(2),peakWip:metrics.peakWip,loopPeak:metrics.maxQueue,recirculations:metrics.recirculations,workerPct:+metrics.workerUtil.toFixed(2),loaderPct:metrics.shippingLoaders.map(loader=>+loader.util.toFixed(2)),finishSec:metrics.time}));
}
