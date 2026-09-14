import * as THREE from 'three';
import type { ResourceState, StationId } from '../simulation/types.ts';
import { NODES, TITLES, resourcePoint, type Point } from './layout';

export const PALETTE = { navy: '#213943', steel: '#66828a', pale: '#c4d8d7', cyan: '#20b7cb', yellow: '#e9c967', floor: '#dbe6e5' };
const materials = new Map<string, THREE.MeshStandardMaterial>();
export function material(color: string) {
  let mat = materials.get(color);
  if (!mat) { mat = new THREE.MeshStandardMaterial({color, roughness:0.72, metalness:0.16}); materials.set(color,mat); }
  return mat;
}
export function box(parent: THREE.Object3D, size: Point, at: Point, color: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
  mesh.position.set(...at); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function cylinder(parent: THREE.Object3D, radius: number, height:number, at:Point, color:string) {
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,16),material(color));
  mesh.position.set(...at);mesh.castShadow=true;parent.add(mesh);return mesh;
}
export function label(parent:THREE.Object3D, text:string, at:Point, width=6, foreground='#29454f', background='#e8f1ed') {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=100;
  const context=canvas.getContext('2d')!;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true});
  const sprite=new THREE.Sprite(mat);sprite.position.set(...at);sprite.scale.set(width,width/7.68,1);sprite.renderOrder=8;parent.add(sprite);
  function update(value:string) {
    context.clearRect(0,0,768,100);context.fillStyle=background;context.fillRect(0,0,768,100);
    context.fillStyle=foreground;context.font='bold 37px monospace';context.textBaseline='middle';context.textAlign='center';context.fillText(value,384,50,730);
    texture.needsUpdate=true;
  }
  update(text);return {sprite,update};
}
function worker(parent:THREE.Object3D,x=0,z=-1.9) {
  box(parent,[.46,.76,.33],[x,1.2,z],PALETTE.cyan);
  cylinder(parent,.21,.36,[x,1.84,z],'#ddbea0');
  cylinder(parent,.28,.12,[x,2.06,z],PALETTE.yellow);
  for(const side of [-1,1]) {
    box(parent,[.17,.58,.2],[x+side*.14,.49,z],PALETTE.navy);
    box(parent,[.16,.58,.18],[x+side*.33,1.12,z+.18],PALETTE.cyan);
  }
}
export function stateColor(state:ResourceState) {
  return ({idle:'#5c8a8b',processing:'#89d576',setup:'#a890de',down:'#f26a6a',transporting:'#27c4d8',blocked:'#eaa35a'})[state];
}
export function equipment(parent:THREE.Object3D,station:StationId,index:number,count:number) {
  const group=new THREE.Group(); const position=resourcePoint(station,index,count);
  group.position.set(position[0],0,position[2]);parent.add(group);
  box(group,[3,.14,2.8],[0,.08,0],station==='repair'?'#f0dcc2':'#c4d9d5');
  box(group,[2.4,.85,1.65],[0,.62,0],PALETTE.steel);
  box(group,[2.55,.14,1.85],[0,1.12,0],PALETTE.pale);
  if(station==='cnc') {
    box(group,[2.65,2.3,.22],[0,1.38,-.82],PALETTE.pale);
    for(const side of [-1,1]) box(group,[.28,2.3,1.8],[side*1.2,1.38,0],PALETTE.steel);
    box(group,[2.65,.28,1.9],[0,2.64,0],PALETTE.pale);
    box(group,[1.5,.9,.12],[-.15,1.95,-.65],'#385962');
    box(group,[.42,.76,.32],[1.33,1.9,.7],PALETTE.navy);
    box(group,[.26,.3,.04],[1.33,2,.89],PALETTE.cyan);
    cylinder(group,.24,.47,[-.2,2.08,-.18],'#8ca4a5');
  } else if(station==='test') {
    for(const side of [-1,1]) box(group,[.12,1.55,.13],[side*1.15,1.8,-.55],PALETTE.navy);
    box(group,[2.45,.12,.13],[0,2.58,-.55],PALETTE.navy);
    const gauge=cylinder(group,.3,.14,[.6,2.15,-.4],'#eff5f1');gauge.rotation.x=Math.PI/2;
    box(group,[.025,.3,.02],[.6,2.18,-.30],'#d96762');
    const shield=new THREE.Mesh(new THREE.BoxGeometry(2.15,1.14,.045),new THREE.MeshStandardMaterial({color:'#55c7d6',transparent:true,opacity:.2,roughness:.2,depthWrite:false}));
    shield.position.set(0,1.83,.77);group.add(shield);
    box(group,[.5,.65,.36],[1.3,1.84,.1],PALETTE.navy);
    box(group,[.34,.35,.03],[1.3,1.9,.3],PALETTE.cyan);
  } else {
    worker(group);
    box(group,[.65,.5,.08],[.83,1.61,-.62],PALETTE.navy);
    box(group,[.53,.35,.02],[.83,1.63,-.566],station==='repair'?'#edb06b':PALETTE.cyan);
    if(station==='kitting') for(let i=0;i<3;i++) box(group,[.34,.3,.35],[-.86+i*.5,1.34,-.48],i%2?PALETTE.pale:PALETTE.yellow);
    if(station==='packaging') box(group,[.62,.55,.65],[-.73,1.46,.08],'#c7a577');
    if(station==='inspection') {
      box(group,[.08,.8,.1],[-.8,1.57,-.6],PALETTE.navy);
      box(group,[.65,.12,.35],[-.57,1.97,-.5],PALETTE.pale);
    }
  }
  const lamp=cylinder(group,.12,.23,[1.05,3.06,-.66],'#5c8a8b');
  lamp.material=new THREE.MeshStandardMaterial({color:stateColor('idle'),emissive:stateColor('idle'),emissiveIntensity:.22});
  label(group,String(index+1).padStart(2,'0'),[0,.77,1.06],.72,PALETTE.pale,PALETTE.navy);
  return lamp;
}
export function factoryFloor(parent:THREE.Object3D) {
  box(parent,[72,.65,32],[1,-.38,1],PALETTE.floor);
  const gridVertices:number[]=[];
  for(let x=-35;x<=37;x++)gridVertices.push(x,-.025,-15,x,-.025,17);
  for(let z=-15;z<=17;z++)gridVertices.push(-35,-.025,z,37,-.025,z);
  const grid=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(gridVertices,3)),new THREE.LineBasicMaterial({color:'#bfd2d0'}));parent.add(grid);
  box(parent,[71,.03,2.4],[1,0.01,4.1],'#bfd0d0');
  for(let x=-33;x<36;x+=2) box(parent,[1,.035,.075],[x,.04,5.4],PALETTE.yellow);
  for(let x=-33;x<36;x+=7) {
    const arrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(x,.065,4),1.2,0x76949b,.35,.28);
    parent.add(arrow);
  }
  // Safety boundary and an open-backed factory: no wall obscures the entire process.
  for(let x=-33;x<36;x+=9) {
    box(parent,[.18,3.7,.18],[x,1.85,-13.4],PALETTE.steel);
    box(parent,[.5,.35,.5],[x,.18,-13.4],PALETTE.yellow);
  }
  box(parent,[70,.10,.10],[1,3.65,-13.4],PALETTE.steel);
  for (const key of Object.keys(NODES) as (keyof typeof NODES)[]) {
    const node=NODES[key];
    box(parent,[6.9,.04,3.7],[node[0],.025,node[2]+.8],key==='repair'?'#e1cbae':key==='finishedGoods'?'#b5d8c6':'#c4dad6');
    label(parent,TITLES[key],[node[0],3.8,key==='repair'?14:-1.6],6.8);
  }
  for(const x of [-31,-28,30,33]) {
    for(const z of [-6,-8]) {
      box(parent,[2.15,.2,1.6],[x,.22,z],PALETTE.navy);
      for(let row=0;row<2;row++) for(let col=0;col<2;col++)
        box(parent,[.8,.55,.63],[x-.47+col*.95,.64+row*.6,z],x<0?'#acc4c5':'#bd9e78');
    }
  }
  box(parent,[3,.7,2],[13,.35,12.5],'#b78474');
  label(parent,'SCRAP',[13,1.6,13],3,'#fde4db','#835851');
  label(parent,'FIXED TRANSFER · NO AGV RESOURCE',[22,.6,10.5],8,'#5d7a83','#cedfdd');
}
export function disposeScene(scene:THREE.Scene) {
  const seen=new Set<THREE.Material>();
  scene.traverse(object=>{
    const drawable=object as THREE.Mesh;
    drawable.geometry?.dispose();
    if(drawable.material) for(const mat of Array.isArray(drawable.material)?drawable.material:[drawable.material]) {
      if(seen.has(mat)) continue;seen.add(mat);
      const mapped=mat as THREE.MeshStandardMaterial;if(mapped.map) mapped.map.dispose();mat.dispose();
    }
  });
  materials.clear();
}
