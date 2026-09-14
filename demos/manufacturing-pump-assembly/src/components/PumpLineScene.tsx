import { useEffect, useRef, useState } from 'react';
import { Expand, RotateCcw, MoveUpRight } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Simulation, StationId } from '../lib/simulation/engine';
import { STATION_IDS } from '../lib/simulation/engine';
import { FLOOR, NODES, statusColor, workOrderPoint } from '../lib/scene/layout';
import { disposeScene, equipment, factoryFloor, label, stateColor } from '../lib/scene/primitives';
import './pump-scene.css';

type Props = { engine:Simulation; revision:number; onSelect:(id:number)=>void; lang:'ko'|'en' };
type PumpPart = {mesh:THREE.InstancedMesh; offset:THREE.Vector3; rotation:THREE.Euler; status?:boolean};

export default function PumpLineScene({engine,revision,onSelect,lang}:Props) {
  const host=useRef<HTMLDivElement>(null);
  const shell=useRef<HTMLDivElement>(null);
  const reset=useRef<()=>void>(()=>{});
  const select=useRef(onSelect);select.current=onSelect;
  const [failure,setFailure]=useState('');
  useEffect(()=>{
    const element=host.current;if(!element) return;
    let renderer:THREE.WebGLRenderer;
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}); }
    catch { setFailure('WebGL is unavailable. All simulation controls and analytics remain available.');return; }
    setFailure('');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.setClearColor('#9db8bb');
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label','Interactive 3D pump production line');
    element.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    scene.background=new THREE.Color('#afc4c7');
    const camera=new THREE.OrthographicCamera(-40,40,25,-25,.1,500);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.dampingFactor=.12;controls.maxPolarAngle=Math.PI*.47;
    controls.minZoom=.45;controls.maxZoom=5;controls.enablePan=true;
    scene.add(new THREE.HemisphereLight('#f3faf3','#59737a',2.7));
    const light=new THREE.DirectionalLight('#fff7df',3);
    light.position.set(-22,42,24);light.castShadow=true;
    Object.assign(light.shadow.camera,{left:-55,right:55,top:42,bottom:-42,near:1,far:130});
    light.shadow.mapSize.set(2048,2048);light.shadow.bias=-.00025;scene.add(light);
    factoryFloor(scene);
    const lamps=new Map<string,THREE.Mesh>();
    const counterLabels=new Map<StationId,ReturnType<typeof label>>();
    for(const station of STATION_IDS) {
      const state=engine.stations[station];
      state.resources.forEach((unit,index)=>lamps.set(unit.id,equipment(scene,station,index,state.resources.length)));
      const p=NODES[station];
      counterLabels.set(station,label(scene,'Q 0 / '+state.queueCapacity,[p[0],.9,p[2]+3.1],3.7,'#526f79','#e0ece6'));
    }
    const goodsLabel=label(scene,'0 GOOD / 0 SCRAP',[31,1,4.3],5.3);
    const matrix=new THREE.Matrix4(), quaternion=new THREE.Quaternion(), vector=new THREE.Vector3();
    const scale=new THREE.Vector3(1,1,1), color=new THREE.Color();
    const parts:PumpPart[]=[];
    const capacity=500;
    function part(geometry:THREE.BufferGeometry,offset:[number,number,number],rotation:[number,number,number],status=false) {
      const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.55,metalness:.25}),capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow=true;mesh.receiveShadow=true;mesh.count=0;
      // Moving instances can leave the bounding sphere cached by the first frame.
      mesh.frustumCulled=false;scene.add(mesh);
      parts.push({mesh,offset:new THREE.Vector3(...offset),rotation:new THREE.Euler(...rotation),status});
    }
    part(new THREE.BoxGeometry(1.14,.13,.88),[0,-.06,0],[0,0,0],true);
    part(new THREE.CylinderGeometry(.31,.31,.5,16),[0,.31,0],[Math.PI/2,0,0]);
    part(new THREE.CylinderGeometry(.23,.23,.55,12),[.41,.29,0],[0,0,Math.PI/2]);
    part(new THREE.CylinderGeometry(.39,.39,.13,16),[0,.31,.28],[Math.PI/2,0,0]);
    part(new THREE.CylinderGeometry(.12,.12,.3,10),[0,.68,0],[0,0,0]);
    const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
    let visibleIds:number[]=[];
    let width=1,height=1,initial=true,frameId=0,lastDraw=0,lastCounter=-Infinity,lastTime=-Infinity;
    const bounds=new THREE.Box3(new THREE.Vector3(...FLOOR.min),new THREE.Vector3(...FLOOR.max));
    function fitCamera() {
      controls.enableDamping=false;controls.update();
      const center=bounds.getCenter(new THREE.Vector3());
      camera.position.copy(center).add(new THREE.Vector3(30,42,58));
      camera.up.set(0,1,0);camera.lookAt(center);camera.zoom=1;camera.updateMatrixWorld(true);
      const projected=new THREE.Box3();
      for(const x of [bounds.min.x,bounds.max.x]) for(const y of [bounds.min.y,bounds.max.y]) for(const z of [bounds.min.z,bounds.max.z])
        projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
      const half=Math.max((projected.max.y-projected.min.y)/2,(projected.max.x-projected.min.x)/2/(width/height))*1.08;
      const mid=projected.getCenter(new THREE.Vector3());
      const shift=new THREE.Vector3(mid.x,mid.y,0).transformDirection(camera.matrixWorld);
      const worldRight=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(mid.x);
      const worldUp=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).multiplyScalar(mid.y);
      shift.copy(worldRight).add(worldUp);center.add(shift);camera.position.add(shift);
      controls.target.copy(center);camera.left=-half*width/height;camera.right=half*width/height;camera.top=half;camera.bottom=-half;
      camera.updateProjectionMatrix();controls.update();controls.saveState();controls.enableDamping=true;
      // Read-only camera-fit diagnostics used by local viewport regression tests.
      const projectedCorners=[];
      for(const x of [bounds.min.x,bounds.max.x]) for(const y of [bounds.min.y,bounds.max.y]) for(const z of [bounds.min.z,bounds.max.z])
        projectedCorners.push(new THREE.Vector3(x,y,z).project(camera).toArray());
      element!.dataset.cameraFit=String(Math.max(...projectedCorners.flatMap(p=>[Math.abs(p[0]),Math.abs(p[1])]))<1);
    }
    reset.current=fitCamera;
    function resize() {
      const rectangle=element!.getBoundingClientRect();
      width=Math.max(1,rectangle.width);height=Math.max(1,rectangle.height);
      renderer.setSize(width,height);
      if(initial){fitCamera();initial=false;} else {
        const half=camera.top;camera.left=-half*width/height;camera.right=half*width/height;
        // Fit after aspect changes so the complete line is also available on mobile/fullscreen.
        fitCamera();
      }
    }
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    const down={x:0,y:0};
    function onDown(event:PointerEvent){down.x=event.clientX;down.y=event.clientY;}
    function onUp(event:PointerEvent) {
      if(Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
      const rect=renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(pointer,camera);
      for(const item of parts)item.mesh.computeBoundingSphere();
      const hit=raycaster.intersectObjects(parts.map(item=>item.mesh),false)[0];
      if(hit?.instanceId!==undefined && visibleIds[hit.instanceId]!==undefined)select.current(visibleIds[hit.instanceId]);
    }
    renderer.domElement.addEventListener('pointerdown',onDown);
    renderer.domElement.addEventListener('pointerup',onUp);
    function frame(now:number) {
      frameId=requestAnimationFrame(frame);
      if(now-lastDraw<1000/30 || document.hidden)return;
      lastDraw=now;
      if(engine.time!==lastTime) {
        lastTime=engine.time;
        const all=[...engine.jobs.values()];
        const terminal=all.filter(job=>job.stage==='completed'||job.stage==='scrapped').slice(-12);
        const live=all.filter(job=>job.stage!=='completed'&&job.stage!=='scrapped');
        const visible=[...live,...terminal].slice(0,capacity);
        visibleIds=visible.map(job=>job.id);
        for(const item of parts)item.mesh.count=visible.length;
        visible.forEach((job,index)=>{
          const position=workOrderPoint(job,engine);
          for(const item of parts) {
            vector.set(...position).add(item.offset);quaternion.setFromEuler(item.rotation);
            matrix.compose(vector,quaternion,scale);item.mesh.setMatrixAt(index,matrix);
            color.set(item.status?statusColor(job):job.product==='standard'?'#1794a6':'#9b87c2');
            item.mesh.setColorAt(index,color);
          }
        });
        for(const item of parts) {
          item.mesh.instanceMatrix.needsUpdate=true;
          if(item.mesh.instanceColor)item.mesh.instanceColor.needsUpdate=true;
        }
        element!.dataset.visibleJobs=String(visible.length);
        for(const station of STATION_IDS)for(const unit of engine.stations[station].resources) {
          const mat=lamps.get(unit.id)!.material as THREE.MeshStandardMaterial;
          mat.color.set(stateColor(unit.state));mat.emissive.copy(mat.color);
        }
      }
      if(now-lastCounter>250) {
        lastCounter=now;
        for(const station of STATION_IDS) {
          const state=engine.stations[station];
          const value='Q '+state.queue.length+' / '+state.queueCapacity+'  ·  '+state.resources.length+' UNIT'+(state.resources.length>1?'S':'');
          const counter=counterLabels.get(station)!;
          if(counter.sprite.userData.text!==value){counter.update(value);counter.sprite.userData.text=value;}
        }
        const value=engine.completed+' GOOD / '+engine.scrapped+' SCRAP';
        if(goodsLabel.sprite.userData.text!==value){goodsLabel.update(value);goodsLabel.sprite.userData.text=value;}
      }
      controls.update();renderer.render(scene,camera);
    }
    frameId=requestAnimationFrame(frame);
    return ()=>{
      cancelAnimationFrame(frameId);observer.disconnect();controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointerup',onUp);
      disposeScene(scene);renderer.dispose();renderer.domElement.remove();reset.current=()=>{};
    };
  },[engine,revision]);
  async function fullscreen() {
    if(document.fullscreenElement)await document.exitFullscreen();
    else await shell.current?.requestFullscreen?.();
  }
  return <div className="scene-wrap pump-scene" ref={shell}>
    <div className="pump-scene-viewport" ref={host} />
    {failure && <div className="pump-scene-fallback" role="status">{failure}</div>}
    <div className="pump-scene-tag"><i /> LIVE MODEL <span>/ 1 KIT = 1 PUMP</span></div>
    <div className="pump-scene-actions">
      <button type="button" aria-label="Reset camera" title="Reset camera" onClick={()=>reset.current()}><RotateCcw size={17}/></button>
      <button type="button" aria-label="Fullscreen 3D scene" title="Fullscreen 3D scene" onClick={()=>{void fullscreen().catch(()=>setFailure('Fullscreen is unavailable in this browser. The 3D view is still usable.'));}}><Expand size={17}/></button>
    </div>
    <div className="pump-product-key"><span><i className="standard" />Standard</span><span><i className="high-flow" />High-Flow</span></div>
    <div className="pump-scene-help"><MoveUpRight size={12}/>{lang==='ko'?'드래그: 회전 · 스크롤: 확대 · 펌프 선택':'Drag to orbit · Scroll to zoom · Select a pump'}</div>
    <div className="pump-status-key"><span><i style={{background:'#f0c45b'}}/>Queue</span><span><i style={{background:'#29cbe2'}}/>Transfer</span><span><i style={{background:'#8cda80'}}/>Process</span><span><i style={{background:'#a994e7'}}/>Setup</span><span><i style={{background:'#f39755'}}/>Blocked</span><span><i style={{background:'#f2686b'}}/>Down / Scrap</span></div>
  </div>;
}
