import type { Order, Simulation } from './engine.ts';
import { IN_CAP, LOADER_PICKUP, LOADER_RETURN, LOADING, OUT_CAP, TROLLEY_STORE } from './engine.ts';
import {
  IN_PATH,
  LOADER_DROP,
  LOADER_HOME,
  OUT_PATH,
  PICK_LOOP_CAP,
  PICK_LOOP_INFEED,
  PICK_LOOP_ENTRY,
  PICK_LOOP_FRONT_Z,
  PICK_LOOP_PATH,
  beltFraction,
  beltStepSeconds,
  loopFraction,
  loopStepSeconds,
  loaderCarryPath,
  pointOnPath,
  stationLayout,
  stationTravelSeconds,
  trolleySlotPoint,
  trolleyStowPath,
} from './layout.ts';

export const ORDER_COLORS={waiting:0xe9ac5b,moving:0x42a4b5,picking:0xc6f367,shipping:0xa5a0de} as const;

/** Pure render projection of DES state; stage endpoints share the same geometry. */
export function orderPosition(o:Order,e:Simulation):{x:number;z:number;y:number;color:number}{
  let x=-17,z=4,y=1.35,color:number=ORDER_COLORS.waiting;
  const dt=e.time-o.stageAt;
  if(o.stage==='inductionQueue'){
    const i=e.inductionQueue.indexOf(o.id);x=-19-(i%4)*.65;z=3-Math.floor(i/4)*.65;y=.58;
  }else if(o.stage==='inbound'||o.stage==='outbound'){
    const isIn=o.stage==='inbound',path=isIn?IN_PATH:OUT_PATH,capacity=isIn?IN_CAP:OUT_CAP;
    const f=Math.min(1,(e.time-o.moveAt)/beltStepSeconds(path,capacity,e.params.conveyorSpeed));
    const slot=o.previousSlot+(o.slot-o.previousSlot)*f;
    [x,z]=pointOnPath(path,beltFraction(slot,capacity));color=ORDER_COLORS.moving;
  }else if(o.stage==='pickingLoop'||o.stage==='pickedLoop'){
    const f=Math.min(1,(e.time-o.moveAt)/loopStepSeconds(PICK_LOOP_PATH,PICK_LOOP_CAP,e.params.conveyorSpeed));
    if(o.previousSlot===-1){[x,z]=pointOnPath([PICK_LOOP_INFEED,PICK_LOOP_ENTRY],f);color=o.stage==='pickingLoop'?ORDER_COLORS.waiting:ORDER_COLORS.moving;}
    else{const slot=o.previousSlot===PICK_LOOP_CAP-1&&o.slot===0?o.previousSlot+f:o.previousSlot+(o.slot-o.previousSlot)*f;[x,z]=pointOnPath(PICK_LOOP_PATH,loopFraction(slot,PICK_LOOP_CAP));color=z>PICK_LOOP_FRONT_Z+1e-7?ORDER_COLORS.waiting:ORDER_COLORS.moving;}
  }else if(o.stage==='toStation'){
    const route=stationLayout(o.worker,e.params.workers);
    const duration=stationTravelSeconds(o.worker,e.params.workers,'approach',e.params.conveyorSpeed);
    [x,z]=pointOnPath(route.approach,dt/duration);color=ORDER_COLORS.moving;
  }else if(o.stage==='picking'||o.stage==='pickBlocked'){
    [x,z]=stationLayout(o.worker,e.params.workers).pick;color=ORDER_COLORS.picking;
  }else if(o.stage==='toMerge'){
    const route=stationLayout(o.worker,e.params.workers);
    const duration=stationTravelSeconds(o.worker,e.params.workers,'localDeparture',e.params.conveyorSpeed);
    [x,z]=pointOnPath(route.localDeparture,dt/duration);color=ORDER_COLORS.moving;
  }else if(o.stage==='mergeWaiting'){
    [x,z]=stationLayout(o.worker,e.params.workers).stationExit;color=ORDER_COLORS.picking;
  }else if(o.stage==='toPassing'){
    const route=stationLayout(o.worker,e.params.workers);
    const duration=stationTravelSeconds(o.worker,e.params.workers,'mergeTransfer',e.params.conveyorSpeed);
    [x,z]=pointOnPath(route.mergeTransfer,dt/duration);color=ORDER_COLORS.moving;
  }else if(o.stage==='trolleyQueue'){
    const f=Math.min(1,dt/TROLLEY_STORE);[x,z]=pointOnPath(trolleyStowPath(o.trolleySlot),f);y=1.35-(.77*f);color=ORDER_COLORS.shipping;
  }else if(o.stage==='manualLoading'){
    const slot=trolleySlotPoint(o.trolleySlot);
    if(dt<=LOADER_PICKUP){[x,z]=slot;y=.58;}
    else{const f=Math.min(1,(dt-LOADER_PICKUP)/(LOADING-LOADER_PICKUP));[x,z]=pointOnPath(loaderCarryPath(o.trolleySlot,o.loader),f);y=.58+Math.min(1,f*3)*.77;}
    color=ORDER_COLORS.shipping;
  }
  return {x,z,y,color};
}

/** Walking projection for the two manual shipping loaders. */
export function shippingLoaderPosition(index:number,e:Simulation){
  const loader=e.shippingLoaders[index],home=LOADER_HOME[index]??LOADER_HOME[0];
  if(!loader||loader.phase==='idle')return {x:home[0],z:home[1],carrying:false};
  const dt=e.time-loader.phaseAt;
  if(loader.phase==='returning'){
    const [x,z]=pointOnPath([LOADER_DROP[index],home],Math.min(1,dt/LOADER_RETURN));return {x,z,carrying:false};
  }
  if(dt<=LOADER_PICKUP){const [x,z]=pointOnPath([home,trolleySlotPoint(loader.trolleySlot)],dt/LOADER_PICKUP);return {x,z,carrying:false};}
  const [x,z]=pointOnPath(loaderCarryPath(loader.trolleySlot,index),Math.min(1,(dt-LOADER_PICKUP)/(LOADING-LOADER_PICKUP)));return {x,z,carrying:true};
}
