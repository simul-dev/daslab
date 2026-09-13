/** Shared 2D conveyor geometry for the DES and the Three.js scene. */
export type Point = readonly [x:number,z:number];
export type ConveyorPath = readonly Point[];

export const PICK_LOOP_INFEED:Point=[-14.8,0];
export const PICK_LOOP_ENTRY:Point=[-13.6,0];
export const PICK_ENTRY:Point=[-12.4,0];
export const PICK_EXIT:Point=[16.4,0];
export const PICK_LOOP_FRONT_Z=0,PICK_LANE_Z=-1.2,PICK_LOOP_RETURN_Z=7.2;
export const TROLLEY_ENTRY:Point=[27.2,0];
export const TROLLEY_CENTER:Point=[28.7,0];
export const TROLLEY_COLUMNS=4,TROLLEY_ROWS=4,TROLLEY_SLOT_PITCH=.64;
export const LOADER_HOME:readonly Point[]=[[27.9,1.75],[29.35,1.75]];
export const LOADER_DROP:readonly Point[]=[[28.15,5.7],[29.25,5.7]];
export const TRUCK_CENTER:Point=[28.7,8.35];
export const BOX_WIDTH=.57,BOX_DEPTH=.52,BOX_CLEARANCE=.6;
export const PICK_LOOP_CAP=62;

// The route pitch is wider than the box footprint through every 90° corner.
export const IN_PATH:ConveyorPath=[[-17,4],[-17,10],[-23,10],[-23,0],PICK_LOOP_INFEED];
// Shipping is a straight belt ending at the auto-stow trolley. From there,
// loaders carry boxes to the truck; there is deliberately no truck conveyor.
export const OUT_PATH:ConveyorPath=[PICK_EXIT,TROLLEY_ENTRY];
export const PICK_LOOP_INFEED_PATH:ConveyorPath=[PICK_LOOP_INFEED,PICK_LOOP_ENTRY];
export const PICK_STATION_PATH:ConveyorPath=[[PICK_ENTRY[0],PICK_LANE_Z],[PICK_EXIT[0],PICK_LANE_Z]];
// One closed 62-slot racetrack. Its front leg is the passing conveyor itself;
// picked and unpicked boxes share it, while the adjacent station conveyor is
// reached only through the perpendicular transfer decks.
export const PICK_LOOP_PATH:ConveyorPath=[PICK_LOOP_ENTRY,PICK_EXIT,[PICK_EXIT[0],PICK_LOOP_RETURN_Z],[PICK_LOOP_ENTRY[0],PICK_LOOP_RETURN_Z],PICK_LOOP_ENTRY];
export const PICK_LOOP_PITCH=pathLength(PICK_LOOP_PATH)/PICK_LOOP_CAP;
export const PICK_LOOP_FRONT_START_SLOT=Math.round((PICK_ENTRY[0]-PICK_LOOP_ENTRY[0])/PICK_LOOP_PITCH);
export const PICK_LOOP_EXIT_SLOT=Math.round((PICK_EXIT[0]-PICK_LOOP_ENTRY[0])/PICK_LOOP_PITCH);

export function pathLength(path:ConveyorPath){
  let total=0;
  for(let i=1;i<path.length;i++)total+=Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]);
  return total;
}

export function pointOnPath(path:ConveyorPath,fraction:number):Point {
  if(fraction<=0)return path[0];
  if(fraction>=1)return path[path.length-1];
  const lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));
  let distance=Math.min(1,Math.max(0,fraction))*lengths.reduce((a,b)=>a+b,0);
  for(let i=0;i<lengths.length;i++){
    if(distance<=lengths[i]||i===lengths.length-1){
      const f=lengths[i]===0?0:distance/lengths[i];
      return [path[i][0]+(path[i+1][0]-path[i][0])*f,path[i][1]+(path[i+1][1]-path[i][1])*f];
    }
    distance-=lengths[i];
  }
  return path[0];
}

export function beltFraction(slot:number,capacity:number){
  if(capacity<=1)return 0;
  return Math.min(1,Math.max(0,slot/(capacity-1)));
}

/** A circular belt has no duplicated endpoint: slot capacity wraps to slot 0. */
export function loopFraction(slot:number,capacity:number){
  if(capacity<1)throw new Error('Loop capacity must be positive');
  return ((slot%capacity)+capacity)%capacity/capacity;
}

/** Seconds needed to move one rendered slot at the configured physical speed. */
export function beltStepSeconds(path:ConveyorPath,capacity:number,speed:number){
  if(capacity<=1)throw new Error('Conveyor capacity must exceed one slot');
  if(!(speed>0))throw new Error('Conveyor speed must be positive');
  return pathLength(path)/(capacity-1)/speed;
}

export function loopStepSeconds(path:ConveyorPath,capacity:number,speed:number){
  if(capacity<1)throw new Error('Loop capacity must be positive');
  if(!(speed>0))throw new Error('Conveyor speed must be positive');
  return pathLength(path)/capacity/speed;
}

export function trolleySlotPoint(slot:number):Point {
  if(!Number.isInteger(slot)||slot<0||slot>=TROLLEY_COLUMNS*TROLLEY_ROWS)throw new Error('Invalid trolley slot');
  const column=slot%TROLLEY_COLUMNS,row=Math.floor(slot/TROLLEY_COLUMNS);
  return [
    TROLLEY_CENTER[0]+(column-(TROLLEY_COLUMNS-1)/2)*TROLLEY_SLOT_PITCH,
    TROLLEY_CENTER[1]+(row-(TROLLEY_ROWS-1)/2)*TROLLEY_SLOT_PITCH,
  ];
}

/** The trolley's compact powered stow path; this is not a conveyor to truck. */
export function trolleyStowPath(slot:number):ConveyorPath {
  const target=trolleySlotPoint(slot);
  return [TROLLEY_ENTRY,[target[0],TROLLEY_ENTRY[1]],target];
}

/** Hand-carry route from one trolley cell, via the loader aisle, to the truck. */
export function loaderCarryPath(slot:number,loader:number):ConveyorPath {
  if(!Number.isInteger(loader)||loader<0||loader>=LOADER_HOME.length)throw new Error('Invalid shipping loader');
  return [trolleySlotPoint(slot),LOADER_HOME[loader],LOADER_DROP[loader]];
}

export type StationLayout={
  index:number;
  zoneCenter:number;
  zoneWidth:number;
  gate:Point;
  gateSlot:number;
  divert:Point;
  stationEntry:Point;
  pick:Point;
  stationExit:Point;
  merge:Point;
  mergeSlot:number;
  branch:ConveyorPath;
  approach:ConveyorPath;
  localDeparture:ConveyorPath;
  mergeTransfer:ConveyorPath;
  departure:ConveyorPath;
};

/**
 * Snap each active station's desired upstream divert to a unique front-lane
 * slot. Gates stay one slot inside the straight front lane so every off-ramp
 * remains clear of a box wrapping around either loop corner.
 */
export function stationGateSlots(count:number){
  if(!Number.isInteger(count)||count<1||count>6)throw new Error('Station count must be between 1 and 6');
  const fullWidth=PICK_EXIT[0]-PICK_ENTRY[0],zoneWidth=fullWidth/Math.max(4,count);
  const activeStart=PICK_ENTRY[0]+(fullWidth-zoneWidth*count)/2;
  const pitch=PICK_LOOP_PITCH;
  const frontStart=PICK_LOOP_FRONT_START_SLOT;
  const frontEnd=frontStart+Math.round(fullWidth/pitch);
  const first=frontStart+1,last=frontEnd-1,slots:number[]=[];
  for(let i=0;i<count;i++){
    const start=activeStart+zoneWidth*i;
    const margin=Math.min(1.2,zoneWidth*.24),desiredX=start+margin;
    // Always snap downstream into the station's own zone. Nearest-slot
    // rounding can place an off-ramp inside the preceding station's return.
    const desired=frontStart+(desiredX-PICK_ENTRY[0])/pitch;
    const low=(slots.at(-1)??first-1)+1,high=last-(count-i-1);
    slots.push(Math.max(low,Math.min(high,Math.ceil(desired-1e-9))));
  }
  return slots;
}

/**
 * Align every return merge with the same passing-loop grid. One clear loop
 * slot remains between neighbouring U-shaped branches and the final merge is
 * one slot upstream of PICK_EXIT.
 */
export function stationMergeSlots(count:number){
  const gateSlots=stationGateSlots(count);
  return gateSlots.map((slot,index)=>{
    const next=gateSlots[index+1]??PICK_LOOP_EXIT_SLOT+1;
    return Math.min(slot+4,next-2,PICK_LOOP_EXIT_SLOT-1);
  });
}

/**
 * Builds one rectilinear U-shaped bypass lane per active picker. A box exits
 * the front recirculation lane at its own gate, turns 90 degrees into the
 * station, travels horizontally past the operator, then turns 90 degrees back.
 */
export function stationLayout(index:number,count:number):StationLayout {
  if(!Number.isInteger(count)||count<1)throw new Error('Station count must be positive');
  if(!Number.isInteger(index)||index<0||index>=count)throw new Error('Invalid station index');
  const fullWidth=PICK_EXIT[0]-PICK_ENTRY[0],zoneWidth=fullWidth/Math.max(4,count);
  const activeStart=PICK_ENTRY[0]+(fullWidth-zoneWidth*count)/2,start=activeStart+zoneWidth*index;
  const x=start+zoneWidth*.5;
  const gateSlot=stationGateSlots(count)[index],gate=pointOnPath(PICK_LOOP_PATH,loopFraction(gateSlot,PICK_LOOP_CAP));
  const mergeSlot=stationMergeSlots(count)[index],merge=pointOnPath(PICK_LOOP_PATH,loopFraction(mergeSlot,PICK_LOOP_CAP));
  const divert=gate,stationEntry:Point=[gate[0],PICK_LANE_Z],pick:Point=[x,PICK_LANE_Z],stationExit:Point=[merge[0],PICK_LANE_Z];
  const approach:ConveyorPath=[gate,stationEntry,pick];
  const localDeparture:ConveyorPath=[pick,stationExit];
  const mergeTransfer:ConveyorPath=[stationExit,merge];
  const branch:ConveyorPath=[...approach,...localDeparture.slice(1),...mergeTransfer.slice(1)];
  return {
    index,
    zoneCenter:start+zoneWidth/2,
    zoneWidth,
    gate,
    gateSlot,
    divert,
    stationEntry,
    pick,
    stationExit,
    merge,
    mergeSlot,
    branch,
    approach,
    localDeparture,
    mergeTransfer,
    departure:[...localDeparture,...mergeTransfer.slice(1)],
  };
}

export function stationTravelSeconds(index:number,count:number,direction:'approach'|'departure'|'localDeparture'|'mergeTransfer',speed:number){
  if(!(speed>0))throw new Error('Conveyor speed must be positive');
  return pathLength(stationLayout(index,count)[direction])/speed;
}

