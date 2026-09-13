import {
  BOX_CLEARANCE,
  IN_PATH,
  OUT_PATH,
  PICK_LOOP_CAP,
  PICK_LOOP_EXIT_SLOT,
  PICK_LOOP_PATH,
  beltStepSeconds,
  loopStepSeconds,
  stationLayout,
  stationTravelSeconds,
} from './layout.ts';

export { IN_PATH, OUT_PATH, PICK_LOOP_CAP } from './layout.ts';

/** DAS Lab fulfillment DES. Time unit: seconds from 08:00. */
export type Parameters={orders:number;workers:number;basePick:number;skuPick:number;conveyorSpeed:number;racks:number;truckCapacity:number;seed:number};
export const DEFAULTS:Parameters={orders:1250,workers:4,basePick:15,skuPick:5,conveyorSpeed:.6,racks:8,truckCapacity:80,seed:42};
export const DAY=36000,IN_CAP=20,OUT_CAP=10,TROLLEY_CAP=16,DOCK_BUFFER=TROLLEY_CAP,INDUCTION=9,TRUCK_WAIT=1800,TRUCK_SWAP=120;
export const SHIPPING_LOADERS=2,TROLLEY_STORE=2,LOADER_PICKUP=1,LOADING=6,LOADER_RETURN=2,LOADER_CYCLE=LOADING+LOADER_RETURN;
export const TOTAL_CONVEYOR_CAP=IN_CAP+PICK_LOOP_CAP+OUT_CAP;

export type Stage=
  |'inductionQueue'|'induction'|'inbound'
  |'pickingLoop'|'toStation'|'picking'|'pickBlocked'
  |'toMerge'|'mergeWaiting'|'toPassing'|'pickedLoop'
  |'outbound'|'trolleyQueue'|'manualLoading'|'completed';
export type Order={id:number;sku:number;created:number;stage:Stage;stageAt:number;wait:number;pickDuration:number;worker:number;completed?:number;slot:number;previousSlot:number;moveAt:number;recirculations:number;trolleySlot:number;loader:number};
type CalendarEvent={at:number;seq:number;action:()=>void};
export type Sample={time:number;wip:number;queue:number;completed:number;worker:number;conveyor:number;dock:number};
export type EventLog={time:number;id:number|null;message:string;kind:'flow'|'complete'|'system'};
export type Worker={order:number|null;phase:'idle'|'transfer'|'picking'|'blocked';busy:number;blocked:number;occupied:number;picks:number;orders:number};
export type ShippingLoader={order:number|null;phase:'idle'|'loading'|'returning';phaseAt:number;busy:number;boxes:number;trolleySlot:number};
export type MergeReservation={slot:number;id:number;station:number};
export type Metrics=ReturnType<Simulation['metrics']>;

class Calendar{
  events:CalendarEvent[]=[];seq=0;
  push(at:number,action:()=>void){const event={at,seq:this.seq++,action};this.events.push(event);let index=this.events.length-1;while(index){const parent=(index-1)>>1;if(this.before(this.events[parent],event))break;this.events[index]=this.events[parent];index=parent;}this.events[index]=event;}
  before(a:CalendarEvent,b:CalendarEvent){return a.at<b.at||(a.at===b.at&&a.seq<b.seq)}
  pop(){const root=this.events[0],last=this.events.pop()!;if(this.events.length){let index=0;while(index*2+1<this.events.length){let child=index*2+1;if(child+1<this.events.length&&this.before(this.events[child+1],this.events[child]))child++;if(this.before(last,this.events[child]))break;this.events[index]=this.events[child];index=child;}this.events[index]=last;}return root;}
  peek(){return this.events[0]?.at??Infinity}
}

function random(seed:number){let value=seed>>>0;return ()=>{value+=0x6D2B79F5;let result=value;result=Math.imul(result^(result>>>15),result|1);result^=result+Math.imul(result^(result>>>7),result|61);return ((result^(result>>>14))>>>0)/4294967296;};}

export function validParameters(raw:Parameters):Parameters{
  const params={...raw};
  const limits:Record<keyof Parameters,[number,number]>={orders:[100,3000],workers:[1,6],basePick:[5,120],skuPick:[5,60],conveyorSpeed:[.05,1.5],racks:[5,10],truckCapacity:[20,200],seed:[1,999999]};
  for(const key of Object.keys(limits) as (keyof Parameters)[]){const [minimum,maximum]=limits[key];if(!Number.isFinite(params[key])||params[key]<minimum||params[key]>maximum)throw new Error(`Invalid ${key}`);if(['orders','workers','racks','truckCapacity','seed'].includes(key)&&!Number.isInteger(params[key]))throw new Error(`Integer required: ${key}`);}
  return params;
}

export class Simulation{
  params:Parameters;time=0;calendar=new Calendar();orders=new Map<number,Order>();workers:Worker[];shippingLoaders:ShippingLoader[];
  inductionQueue:number[]=[];induction:number|null=null;inductionReady=false;
  inbound:(number|null)[]=Array(IN_CAP).fill(null);pickingLoop:(number|null)[]=Array(PICK_LOOP_CAP).fill(null);outbound:(number|null)[]=Array(OUT_CAP).fill(null);
  inScheduled=false;inEntryClearAt=0;loopScheduled=false;outScheduled=false;outEntryClearAt=0;loopOrders:number[]=[];mergeReservations=new Map<number,MergeReservation>();trolleyQueue:number[]=[];trolleySlots:(number|null)[]=Array(TROLLEY_CAP).fill(null);trolleyStowingUntil=0;
  received=0;completed=0;pickedSKU=0;truckLoad=0;truckAvailable=true;truckTrips=0;truckGeneration=0;truckAwayAt=-Infinity;truckReturnAt=0;truckFirstLoadedAt:number|null=null;truckDispatchDue=false;nextShippingLoader=0;
  logs:EventLog[]=[];samples:Sample[]=[{time:0,wip:0,queue:0,completed:0,worker:0,conveyor:0,dock:0}];hourly:number[]=Array(10).fill(0);
  peakWip=0;maxQueue=0;maxSystemQueue=0;inArea=0;loopArea=0;outArea=0;transferArea=0;dockBusy=0;inductionBusy=0;inBlocked=0;outBlocked=0;recirculations=0;
  leadSum=0;leadMin=Infinity;leadMax=0;waitSum=0;pickSum=0;pickedOrders=0;
  closing:null|{completed:number;unfinished:number;wip:number;rate:number}=null;finished=false;finishTime=0;
  private pumping=false;private processingLoop=false;

  constructor(params:Parameters=DEFAULTS){
    this.params=validParameters(params);this.workers=Array.from({length:params.workers},()=>({order:null,phase:'idle',busy:0,blocked:0,occupied:0,picks:0,orders:0}));this.shippingLoaders=Array.from({length:SHIPPING_LOADERS},()=>({order:null,phase:'idle',phaseAt:0,busy:0,boxes:0,trolleySlot:-1}));
    const arrivals=random(params.seed),attributes=random(params.seed+1024);const times=Array.from({length:params.orders},()=>arrivals()*DAY).sort((a,b)=>a-b);
    times.forEach((at,index)=>{const sku=1+Math.floor(attributes()*5),variation=.85+attributes()*.3;const pickDuration=(params.basePick+sku*params.skuPick+(params.racks-5)*2)*variation;this.calendar.push(at,()=>{const order:Order={id:index+1,sku,created:at,stage:'inductionQueue',stageAt:at,wait:0,pickDuration,worker:-1,slot:0,previousSlot:0,moveAt:at,recirculations:0,trolleySlot:-1,loader:-1};this.orders.set(order.id,order);this.received++;this.inductionQueue.push(order.id);this.log(order.id,'Order Created');this.pump();});});
    this.calendar.push(DAY,()=>{this.closing={completed:this.completed,unfinished:this.received-this.completed,wip:this.received-this.completed,rate:this.completed/this.params.orders*100};this.log(null,'18:00 · 주문 접수 종료 / 잔여 주문 처리','system');});
    const sample=()=>{this.samples.push(this.sample());if(!this.finished)this.calendar.push(this.time+300,sample);};this.calendar.push(300,sample);
  }

  log(id:number|null,message:string,kind:EventLog['kind']='flow'){this.logs.unshift({time:this.time,id,message,kind});if(this.logs.length>120)this.logs.length=120;}
  setStage(order:Order,stage:Stage){order.stage=stage;order.stageAt=this.time;}
  enqueueWait(order:Order){order.wait+=this.time-order.stageAt;}
  private stationWip(){return this.workers.filter(worker=>worker.order!==null).length;}
  private loopHasCapacity(){return this.loopOrders.length+this.stationWip()<PICK_LOOP_CAP;}
  private trolleyHasCapacity(){return this.time+1e-9>=this.trolleyStowingUntil&&this.trolleyQueue.length<TROLLEY_CAP&&this.trolleySlots.some(id=>id===null);}
  private activeLoads(){return this.shippingLoaders.filter(loader=>loader.order!==null).length;}
  private activeShippingWorkers(){return this.shippingLoaders.filter(loader=>loader.phase!=='idle').length;}
  private idleShippingLoader(){for(let offset=0;offset<SHIPPING_LOADERS;offset++){const index=(this.nextShippingLoader+offset)%SHIPPING_LOADERS;if(this.shippingLoaders[index].phase==='idle')return index;}return -1;}

  private integrate(to:number){
    const dt=to-this.time;if(dt<0)throw new Error('Time reversal');
    this.inArea+=this.inbound.filter(id=>id!==null).length*dt;this.loopArea+=this.pickingLoop.filter(id=>id!==null).length*dt;this.outArea+=this.outbound.filter(id=>id!==null).length*dt;this.transferArea+=this.workers.filter(worker=>worker.phase==='transfer').length*dt;
    this.dockBusy+=this.activeShippingWorkers()*dt;if(this.induction!==null&&!this.inductionReady)this.inductionBusy+=dt;
    if(this.inbound[IN_CAP-1]!==null&&(!this.loopEntryOpen()||!this.loopHasCapacity()))this.inBlocked+=dt;if(this.outbound[OUT_CAP-1]!==null&&!this.trolleyHasCapacity())this.outBlocked+=dt;
    for(const worker of this.workers)if(worker.order!==null){worker.occupied+=dt;if(worker.phase==='blocked')worker.blocked+=dt;if(worker.phase==='picking')worker.busy+=dt;}
    for(const loader of this.shippingLoaders)if(loader.phase!=='idle')loader.busy+=dt;
    this.time=to;
  }

  advance(target:number){if(this.finished)return;let processed=0;while(this.calendar.peek()<=target&&!this.finished){if(++processed>1000000)throw new Error('Event limit exceeded');const event=this.calendar.pop();this.integrate(event.at);event.action();this.peakWip=Math.max(this.peakWip,this.received-this.completed);this.maxQueue=Math.max(this.maxQueue,this.loopOrders.length);const stationQueue=this.workers.filter(worker=>worker.phase==='blocked').length;this.maxSystemQueue=Math.max(this.maxSystemQueue,this.inductionQueue.length,this.loopOrders.length,this.trolleyQueue.length,stationQueue);this.checkEnd();}if(!this.finished)this.integrate(target);}
  runToEnd(){let chunks=0;while(!this.finished){this.advance(this.time+DAY);if(++chunks>200)throw new Error('Model did not drain');}return this.metrics();}
  private checkEnd(){if(this.received===this.params.orders&&this.completed===this.received&&this.time>=DAY&&!this.finished&&this.activeShippingWorkers()===0){if(this.truckLoad>0)this.tryDispatch(true);this.finished=true;this.finishTime=this.time;this.samples.push(this.sample());this.log(null,'Simulation Completed · all orders shipped','system');}}

  private stowInTrolley(order:Order){
    const slot=this.trolleySlots.indexOf(null);if(slot<0||this.trolleyQueue.length>=TROLLEY_CAP)throw new Error('Outbound trolley has no free slot');
    this.trolleySlots[slot]=order.id;this.trolleyQueue.push(order.id);order.trolleySlot=slot;this.setStage(order,'trolleyQueue');this.trolleyStowingUntil=this.time+TROLLEY_STORE;this.log(order.id,'Auto-stowed in outbound trolley');
    this.calendar.push(this.trolleyStowingUntil,()=>{this.pump();this.startBelt('outbound');});
  }

  private startBelt(type:'inbound'|'outbound'){
    const isInbound=type==='inbound';if(isInbound?this.inScheduled:this.outScheduled)return;if(!this[type].some(id=>id!==null))return;if(isInbound)this.inScheduled=true;else this.outScheduled=true;
    const capacity=isInbound?IN_CAP:OUT_CAP,step=beltStepSeconds(isInbound?IN_PATH:OUT_PATH,capacity,this.params.conveyorSpeed);
    this.calendar.push(this.time+step,()=>{if(isInbound)this.inScheduled=false;else this.outScheduled=false;const belt=this[type],end=belt.length-1,id=belt[end];
      if(id!==null&&(isInbound?this.canAdmitLoopImmediately():this.trolleyHasCapacity())){const order=this.orders.get(id)!;belt[end]=null;if(isInbound)this.enterPickLoop(order);else this.stowInTrolley(order);}
      for(let slot=end;slot>0;slot--){if(belt[slot]!==null||belt[slot-1]===null)continue;const order=this.orders.get(belt[slot-1]!)!;belt[slot]=belt[slot-1];belt[slot-1]=null;order.previousSlot=order.slot;order.slot=slot;order.moveAt=this.time;if(slot===1){if(isInbound)this.inEntryClearAt=this.time+BOX_CLEARANCE/this.params.conveyorSpeed;else this.outEntryClearAt=this.time+BOX_CLEARANCE/this.params.conveyorSpeed;this.calendar.push(this.time+BOX_CLEARANCE/this.params.conveyorSpeed,()=>this.pump());}}
      this.pump();this.startBelt(type);
    });
  }
  private beltEntryOpen(type:'inbound'|'outbound'){const entryClear=this.time+1e-9>=(type==='inbound'?this.inEntryClearAt:this.outEntryClearAt);return this[type][0]===null&&entryClear&&(type==='inbound'||this.outbound[1]===null);}
  private enterBelt(order:Order,type:'inbound'|'outbound'){
    const isInbound=type==='inbound';if(!this.beltEntryOpen(type))throw new Error(`${type} entry clearance was not reserved`);
    if(isInbound){this.inbound[0]=order.id;order.slot=0;order.previousSlot=0;}
    else{this.outbound[1]=order.id;order.slot=1;order.previousSlot=0;this.outEntryClearAt=this.time+BOX_CLEARANCE/this.params.conveyorSpeed;this.calendar.push(this.outEntryClearAt,()=>this.pump());}
    this.setStage(order,type);order.moveAt=this.time;this.startBelt(type);if(isInbound)this.log(order.id,'Box Inducted');
  }

  private loopEntryOpen(){return this.pickingLoop[0]===null&&!this.mergeReservations.has(0);}
  private canAdmitLoopImmediately(){return !this.loopScheduled&&!this.processingLoop&&this.loopOrders.length===0&&this.stationWip()===0&&this.loopEntryOpen()&&this.loopHasCapacity();}
  private assignStation(order:Order){order.worker=(order.id-1)%this.workers.length;}
  private enterPickLoop(order:Order){if(!this.loopEntryOpen()||!this.loopHasCapacity())throw new Error('DPS passing loop entry was not available');if(order.worker<0)this.assignStation(order);this.pickingLoop[0]=order.id;this.loopOrders.push(order.id);this.setStage(order,'pickingLoop');order.slot=0;order.previousSlot=-1;order.moveAt=this.time;this.log(order.id,`Entered DPS Passing Loop · target P${String(order.worker+1).padStart(2,'0')}`);this.startPickLoop();}
  private admitInboundToLoop(){const id=this.inbound[IN_CAP-1];if(id===null||!this.loopEntryOpen()||!this.loopHasCapacity())return false;const order=this.orders.get(id)!,step=beltStepSeconds(IN_PATH,IN_CAP,this.params.conveyorSpeed);if(this.time+1e-9<order.moveAt+step)return false;this.inbound[IN_CAP-1]=null;this.enterPickLoop(order);return true;}

  private releasePickedAtExit(){const id=this.pickingLoop[PICK_LOOP_EXIT_SLOT];if(id===null)return;const order=this.orders.get(id)!;if(order.stage!=='pickedLoop'||!this.beltEntryOpen('outbound'))return;this.pickingLoop[PICK_LOOP_EXIT_SLOT]=null;const index=this.loopOrders.indexOf(id);if(index<0)throw new Error('DPS loop ownership mismatch at outbound exit');this.loopOrders.splice(index,1);this.enterBelt(order,'outbound');this.log(id,'Diverted from Passing Loop to Outbound');}

  private divertAtStationGates(){
    for(let station=0;station<this.workers.length;station++){const route=stationLayout(station,this.workers.length),id=this.pickingLoop[route.gateSlot];if(id===null)continue;const order=this.orders.get(id)!,worker=this.workers[station];if(order.stage!=='pickingLoop'||order.worker!==station||worker.order!==null)continue;
      this.pickingLoop[route.gateSlot]=null;const index=this.loopOrders.indexOf(id);if(index<0)throw new Error('DPS loop ownership mismatch at station gate');this.loopOrders.splice(index,1);this.enqueueWait(order);worker.order=id;worker.phase='transfer';this.setStage(order,'toStation');this.log(id,`90° transfer to P${String(station+1).padStart(2,'0')}`);
      const approach=stationTravelSeconds(station,this.workers.length,'approach',this.params.conveyorSpeed);this.calendar.push(this.time+approach,()=>{if(worker.order!==id||order.stage!=='toStation')throw new Error('Station approach ownership mismatch');this.setStage(order,'picking');worker.phase='picking';this.log(id,'Picking Started');this.calendar.push(this.time+order.pickDuration,()=>{this.pickedSKU+=order.sku;this.pickSum+=order.pickDuration;this.pickedOrders++;worker.picks+=order.sku;worker.orders++;worker.phase='blocked';this.setStage(order,'pickBlocked');this.log(id,'Picking Completed');this.pump();});});
    }
  }
  private countGateMisses(){for(let station=0;station<this.workers.length;station++){const route=stationLayout(station,this.workers.length),id=this.pickingLoop[route.gateSlot];if(id===null)continue;const order=this.orders.get(id)!;if(order.stage!=='pickingLoop'||order.worker!==station)continue;order.recirculations++;this.recirculations++;if(order.recirculations<=3||order.recirculations%5===0)this.log(order.id,`Passing Loop Recirculated · P${String(station+1).padStart(2,'0')} busy · lap ${order.recirculations}`);}}
  private rotatePickLoop(){const next:(number|null)[]=Array(PICK_LOOP_CAP).fill(null);for(let slot=0;slot<PICK_LOOP_CAP;slot++){const id=this.pickingLoop[slot];if(id===null)continue;const destination=(slot+1)%PICK_LOOP_CAP;if(next[destination]!==null)throw new Error('DPS passing-loop slot collision');next[destination]=id;const order=this.orders.get(id)!;order.previousSlot=slot;order.slot=destination;order.moveAt=this.time;}this.pickingLoop=next;}

  /** Return transfers begin on a loop boundary and last exactly one loop step. */
  private startMergeTransfers(step:number){
    for(let station=0;station<this.workers.length;station++){const worker=this.workers[station];if(worker.order===null)continue;const order=this.orders.get(worker.order)!;if(order.stage!=='mergeWaiting')continue;const route=stationLayout(station,this.workers.length),slot=route.mergeSlot;if(this.pickingLoop[slot]!==null||this.mergeReservations.has(slot))continue;
      this.enqueueWait(order);this.mergeReservations.set(slot,{slot,id:order.id,station});worker.phase='transfer';this.setStage(order,'toPassing');this.log(order.id,`90° transfer back to Passing Loop · P${String(station+1).padStart(2,'0')}`);
      this.calendar.push(this.time+step,()=>{const reservation=this.mergeReservations.get(slot);if(reservation?.id!==order.id||reservation.station!==station)throw new Error('DPS merge reservation mismatch');if(this.pickingLoop[slot]!==null)throw new Error('Reserved passing-loop merge slot was occupied');this.pickingLoop[slot]=order.id;this.loopOrders.push(order.id);order.previousSlot=slot;order.slot=slot;order.moveAt=this.time;this.setStage(order,'pickedLoop');worker.order=null;worker.phase='idle';this.mergeReservations.delete(slot);this.log(order.id,'Merged onto DPS Passing Loop');this.pump();this.startPickLoop();});
    }
  }

  private startPickLoop(){
    if(this.loopScheduled||this.processingLoop)return;if(!this.pickingLoop.some(id=>id!==null)&&this.stationWip()===0&&this.mergeReservations.size===0)return;this.loopScheduled=true;const step=loopStepSeconds(PICK_LOOP_PATH,PICK_LOOP_CAP,this.params.conveyorSpeed);
    this.calendar.push(this.time+step,()=>{this.loopScheduled=false;this.processingLoop=true;try{if(this.mergeReservations.size)throw new Error('A merge transfer did not finish before the next loop tick');this.releasePickedAtExit();this.divertAtStationGates();this.countGateMisses();this.rotatePickLoop();this.admitInboundToLoop();this.pump();this.startMergeTransfers(step);}finally{this.processingLoop=false;}this.startPickLoop();});
  }

  private startManualLoad(loaderIndex:number){
    const id=this.trolleyQueue.shift();if(id===undefined)throw new Error('Trolley queue unexpectedly empty');
    const order=this.orders.get(id)!,loader=this.shippingLoaders[loaderIndex],slot=order.trolleySlot;
    if(loader.phase!=='idle'||loader.order!==null)throw new Error('Shipping loader was not idle');
    if(slot<0||this.trolleySlots[slot]!==id)throw new Error('Trolley slot ownership mismatch');
    this.trolleySlots[slot]=null;this.enqueueWait(order);order.loader=loaderIndex;this.setStage(order,'manualLoading');
    loader.order=id;loader.phase='loading';loader.phaseAt=this.time;loader.trolleySlot=slot;
    this.nextShippingLoader=(loaderIndex+1)%SHIPPING_LOADERS;
    this.log(id,`Manual truck loading started · loader ${loaderIndex+1}`);
    this.calendar.push(this.time+LOADING,()=>this.finishManualLoad(id,loaderIndex));
    this.startBelt('outbound');
  }

  private pump(){
    if(this.pumping)return;this.pumping=true;try{
      while(this.truckAvailable&&!this.truckDispatchDue&&this.trolleyQueue.length){const loaderIndex=this.idleShippingLoader();if(loaderIndex<0||this.truckLoad+this.activeLoads()>=this.params.truckCapacity)break;const order=this.orders.get(this.trolleyQueue[0])!;if(this.time+1e-9<order.stageAt+TROLLEY_STORE)break;this.startManualLoad(loaderIndex);}
      // Each station owns its branch transfer, so different stations move concurrently.
      for(let station=0;station<this.workers.length;station++){const worker=this.workers[station];if(worker.order===null)continue;const order=this.orders.get(worker.order)!;if(order.stage!=='pickBlocked')continue;this.enqueueWait(order);worker.phase='transfer';this.setStage(order,'toMerge');this.log(order.id,`Leaving P${String(station+1).padStart(2,'0')} on station conveyor`);const departure=stationTravelSeconds(station,this.workers.length,'localDeparture',this.params.conveyorSpeed);this.calendar.push(this.time+departure,()=>{if(worker.order!==order.id||order.stage!=='toMerge')throw new Error('Station departure ownership mismatch');worker.phase='blocked';this.setStage(order,'mergeWaiting');this.log(order.id,'Waiting at local 90° merge deck');this.startPickLoop();});}
      if(this.inductionReady&&this.induction!==null&&this.beltEntryOpen('inbound')){const order=this.orders.get(this.induction)!;order.wait+=Math.max(0,this.time-order.stageAt-INDUCTION);this.enterBelt(order,'inbound');this.induction=null;this.inductionReady=false;}
      if(this.induction===null&&this.inductionQueue.length){const id=this.inductionQueue.shift()!,order=this.orders.get(id)!;this.enqueueWait(order);this.setStage(order,'induction');this.induction=id;this.calendar.push(this.time+INDUCTION,()=>{this.inductionReady=true;this.pump();});}
    }finally{this.pumping=false;}
  }

  private finishManualLoad(id:number,loaderIndex:number){
    const order=this.orders.get(id)!,loader=this.shippingLoaders[loaderIndex];
    if(loader.order!==id||loader.phase!=='loading'||order.stage!=='manualLoading')throw new Error('Shipping loader ownership mismatch');
    loader.order=null;loader.phase='returning';loader.phaseAt=this.time;loader.boxes++;
    this.setStage(order,'completed');order.completed=this.time;this.completed++;
    const lead=this.time-order.created;this.leadSum+=lead;this.leadMin=Math.min(this.leadMin,lead);this.leadMax=Math.max(this.leadMax,lead);this.waitSum+=order.wait;this.truckLoad++;
    const hour=Math.floor(this.time/3600);while(this.hourly.length<=hour)this.hourly.push(0);this.hourly[hour]++;this.log(id,`Shipment completed · loader ${loaderIndex+1}`,'complete');
    if(this.truckFirstLoadedAt===null){this.truckFirstLoadedAt=this.time;const generation=this.truckGeneration,firstLoadedAt=this.truckFirstLoadedAt;this.calendar.push(firstLoadedAt+TRUCK_WAIT,()=>{if(this.truckGeneration===generation&&this.truckAvailable&&this.truckFirstLoadedAt===firstLoadedAt&&this.truckLoad>0){this.truckDispatchDue=true;this.tryDispatch();}});}
    if(this.truckLoad>=this.params.truckCapacity)this.truckDispatchDue=true;
    this.calendar.push(this.time+LOADER_RETURN,()=>{if(loader.phase!=='returning'||loader.order!==null)throw new Error('Shipping loader return mismatch');loader.phase='idle';loader.phaseAt=this.time;loader.trolleySlot=-1;if(!this.tryDispatch())this.pump();});
    this.tryDispatch();this.pump();
  }

  private tryDispatch(force=false){
    if(force&&this.truckLoad>0)this.truckDispatchDue=true;
    if(!this.truckAvailable||this.truckLoad===0)return false;
    if(!this.truckDispatchDue&&this.truckLoad<this.params.truckCapacity)return false;
    if(this.activeShippingWorkers()>0)return false;
    this.log(null,`Truck dispatched · ${this.truckLoad} boxes`,'system');this.truckLoad=0;this.truckAvailable=false;this.truckTrips++;this.truckGeneration++;this.truckDispatchDue=false;this.truckFirstLoadedAt=null;this.truckAwayAt=this.time;this.truckReturnAt=this.time+TRUCK_SWAP;
    this.calendar.push(this.truckReturnAt,()=>{this.truckAvailable=true;this.log(null,'Replacement truck arrived','system');this.pump();this.startBelt('outbound');});return true;
  }

  sample():Sample{const time=Math.max(1,this.time);return {time:this.time,wip:this.received-this.completed,queue:this.loopOrders.length,completed:this.completed,worker:this.workers.reduce((sum,worker)=>sum+worker.busy,0)/(time*this.params.workers)*100,conveyor:(this.inArea+this.loopArea+this.outArea)/(time*TOTAL_CONVEYOR_CAP)*100,dock:this.dockBusy/(time*SHIPPING_LOADERS)*100};}
  metrics(){
    const time=Math.max(this.time,1),completed=this.completed,wip=this.received-this.completed,inWip=this.inbound.filter(id=>id!==null).length,outWip=this.outbound.filter(id=>id!==null).length;
    const workerUtil=this.workers.reduce((sum,worker)=>sum+worker.busy,0)/(time*this.params.workers)*100,stationUtil=this.workers.reduce((sum,worker)=>sum+worker.occupied,0)/(time*this.params.workers)*100,transferUtil=this.transferArea/(time*this.params.workers)*100;
    const utilization={induction:this.inductionBusy/time*100,inbound:this.inArea/(time*IN_CAP)*100,loop:this.loopArea/(time*PICK_LOOP_CAP)*100,picking:stationUtil,transfer:transferUtil,outbound:this.outArea/(time*OUT_CAP)*100,dock:this.dockBusy/(time*SHIPPING_LOADERS)*100};
    const gateQueue=this.workers.reduce((sum,_,station)=>{const id=this.pickingLoop[stationLayout(station,this.workers.length).gateSlot];return sum+(id!==null&&this.orders.get(id)?.stage==='pickingLoop'&&this.orders.get(id)?.worker===station?1:0);},0),transferQueue=this.workers.filter(worker=>worker.phase==='blocked').length+gateQueue;
    const candidates=[{name:'Induction',queue:this.inductionQueue.length,util:utilization.induction},{name:'Inbound conveyor',queue:this.inbound[IN_CAP-1]!==null&&(!this.loopEntryOpen()||!this.loopHasCapacity())?inWip:0,util:utilization.inbound},{name:'Picking station',queue:this.loopOrders.filter(id=>this.orders.get(id)?.stage==='pickingLoop').length,util:stationUtil},{name:'DPS transfers',queue:transferQueue,util:transferUtil},{name:'Outbound conveyor',queue:this.outbound[OUT_CAP-1]!==null&&!this.trolleyHasCapacity()?outWip:0,util:utilization.outbound},{name:'Shipping loaders',queue:this.trolleyQueue.length,util:utilization.dock}];
    candidates.sort((a,b)=>b.util-a.util||b.queue-a.queue);const bottleneck=this.time===0?'—':candidates[0].name;
    return {time:this.time,received:this.received,completed,wip,inWip,outWip,ordersPerHour:completed/(time/3600),dailyThroughput:this.closing?.completed??completed,leadAvg:completed?this.leadSum/completed/60:0,leadMin:completed?this.leadMin/60:0,leadMax:this.leadMax/60,waitAvg:completed?this.waitSum/completed/60:0,pickAvg:this.pickedOrders?this.pickSum/this.pickedOrders/60:0,pickedSKU:this.pickedSKU,picksPerWorker:this.pickedSKU/this.params.workers,picksPerHour:this.pickedSKU/(time/3600),throughputPerWorker:completed/this.params.workers,workerUtil,stationUtil,utilization,conveyorUtil:(this.inArea+this.loopArea+this.outArea)/(time*TOTAL_CONVEYOR_CAP)*100,conveyorOccupancy:(this.inArea+this.loopArea+this.outArea)/time,conveyorCapacity:TOTAL_CONVEYOR_CAP,loopCapacity:PICK_LOOP_CAP,loopWip:this.loopOrders.length,recirculations:this.recirculations,recirculationAvg:this.pickedOrders?this.recirculations/this.pickedOrders:0,peakWip:this.peakWip,maxQueue:this.maxQueue,maxSystemQueue:this.maxSystemQueue,completionRate:this.received?completed/this.received*100:0,bottleneck,bottleneckQueue:candidates[0].queue,closing:this.closing,finished:this.finished,overtime:Math.max(0,this.time-DAY),truckLoad:this.truckLoad,truckTrips:this.truckTrips,inBlocked:this.inBlocked/time*100,outBlocked:this.outBlocked/time*100,workers:this.workers.map(worker=>({picks:worker.picks,orders:worker.orders,util:worker.busy/time*100,blocked:worker.blocked/time*100,occupied:worker.occupied/time*100})),shippingLoaders:this.shippingLoaders.map(loader=>({boxes:loader.boxes,util:loader.busy/time*100})),stageWip:{induction:this.inductionQueue.length+(this.induction!==null?1:0),inbound:inWip,pickingLoop:this.loopOrders.length,picking:this.stationWip(),outbound:outWip,dock:this.trolleyQueue.length+this.activeLoads()}};
  }
}

export function clock(seconds:number,withSeconds=false){const value=Math.floor(seconds)+8*3600,day=Math.floor(value/86400),hour=Math.floor(value/3600)%24,minute=Math.floor(value/60)%60,second=value%60;return `${day?`D+${day} `:''}${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}${withSeconds?':'+String(second).padStart(2,'0'):''}`;}
export function orderID(id:number){return `ORD-${String(id).padStart(4,'0')}`;}

