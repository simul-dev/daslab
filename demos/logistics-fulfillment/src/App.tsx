import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, ArrowUpRight, ArrowRight, Box, Layers3, SlidersHorizontal, FastForward, CircleCheck, CircleAlert, Timer, ChevronRight, X, Info, Check, Truck, Activity } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Scene, { STAGE_LABELS } from '@/components/simulation/Scene';
import { Charts, KPICards, Performance, Summary, number, type Run } from '@/components/simulation/Analytics';
import { Simulation, DEFAULTS, DAY, clock, orderID, validParameters, type Parameters } from '@/lib/simulation/engine';
type Status='ready'|'running'|'paused'|'completed';
const PRESETS=[{id:'baseline',label:'Baseline',detail:'1,250 orders · 4 workers',params:DEFAULTS},{id:'demand',label:'High demand',detail:'2,000 orders · 4 workers',params:{...DEFAULTS,orders:2000}},{id:'workers',label:'+2 workers',detail:'1,250 orders · 6 workers',params:{...DEFAULTS,workers:6}},{id:'conveyor',label:'Slow conveyor',detail:'1,250 orders · 0.05 m/s',params:{...DEFAULTS,conveyorSpeed:.05}}];
const paramFields:{key:keyof Parameters;label:string;min:number;max:number;step:number;unit:string}[]=[{key:'orders',label:'Orders per day',min:100,max:3000,step:50,unit:'orders'},{key:'workers',label:'Picking workers',min:1,max:6,step:1,unit:'workers'},{key:'basePick',label:'Base picking time',min:5,max:120,step:5,unit:'sec'},{key:'skuPick',label:'Time per SKU',min:5,max:60,step:1,unit:'sec'},{key:'conveyorSpeed',label:'Conveyor speed',min:.05,max:1.5,step:.05,unit:'m/s'},{key:'racks',label:'Number of racks',min:5,max:10,step:1,unit:'racks'},{key:'truckCapacity',label:'Truck capacity',min:20,max:200,step:10,unit:'boxes'}];
export default function Home(){
 const [initialEngine]=useState(()=>new Simulation(DEFAULTS));const engineRef=useRef<Simulation>(initialEngine);const [revision,setRevision]=useState(0),[metrics,setMetrics]=useState(()=>engineRef.current.metrics());
 const [params,setParams]=useState<Parameters>({...DEFAULTS}),[status,setStatus]=useState<Status>('ready'),[speed,setSpeed]=useState(10),[preset,setPreset]=useState('baseline'),[selected,setSelected]=useState<number|null>(null),[tab,setTab]=useState('performance'),[runs,setRuns]=useState<Run[]>([]),[notice,setNotice]=useState(''),[fast,setFast]=useState(false);
 const statusRef=useRef(status),speedRef=useRef(speed),nameRef=useRef('Baseline'),recorded=useRef(false),runId=useRef(0);statusRef.current=status;speedRef.current=speed;
 const paramsRef=useRef(params);paramsRef.current=params;
 const dirty=JSON.stringify(params)!==JSON.stringify(engineRef.current.params);const sim=engineRef.current;
 function saveRun(){if(recorded.current)return;recorded.current=true;const e=engineRef.current;setRuns(old=>[{id:++runId.current,name:nameRef.current,params:{...e.params},metrics:e.metrics()},...old].slice(0,4));}
 function refresh(){setMetrics(engineRef.current.metrics());}
 function changeStatus(s:Status){statusRef.current=s;setStatus(s)}
 function reset(p:Parameters=paramsRef.current){const valid=validParameters(p);nameRef.current=PRESETS.find(item=>JSON.stringify(item.params)===JSON.stringify(valid))?.label??'Custom scenario';engineRef.current=new Simulation(valid);recorded.current=false;changeStatus('ready');setSelected(null);setRevision(v=>v+1);setMetrics(engineRef.current.metrics());setNotice('조건이 적용되었습니다. Start로 새 실험을 시작하세요.');}
 function start(){if(engineRef.current.finished||JSON.stringify(paramsRef.current)!==JSON.stringify(engineRef.current.params))reset(paramsRef.current);changeStatus('running');setNotice('');}
 function applyPreset(id:string){const p=PRESETS.find(p=>p.id===id)!;setPreset(id);setParams({...p.params});paramsRef.current={...p.params};nameRef.current=p.label;reset(p.params);}
 function changeParam(key:keyof Parameters,value:number){const next={...paramsRef.current,[key]:value};paramsRef.current=next;setParams(next);setPreset('custom');}
 async function finish(){if(engineRef.current.finished)return;if(dirty){setNotice('변경한 조건을 먼저 Apply & reset으로 적용하세요.');return;}setFast(true);changeStatus('paused');await new Promise<void>(resolve=>setTimeout(resolve,20));try{engineRef.current.runToEnd();refresh();changeStatus('completed');saveRun();setTab('summary');setNotice('전체 주문 처리가 완료되었습니다. 하루 운영 결과를 확인하세요.');}catch{setNotice('시뮬레이션 계산 중 문제가 발생했습니다. Reset 후 다시 실행하세요.');}finally{setFast(false);}}
 useEffect(()=>{let raf=0,last=0,lastPublish=0;function frame(now:number){if(!last)last=now;const delta=Math.min((now-last)/1000,.25);last=now;if(statusRef.current==='running'){const e=engineRef.current;e.advance(e.time+delta*speedRef.current);if(e.finished){changeStatus('completed');setMetrics(e.metrics());saveRun();setNotice('모든 주문 출하 완료. Daily summary에서 결과를 확인하세요.');}else if(now-lastPublish>120){setMetrics(e.metrics());lastPublish=now;}}raf=requestAnimationFrame(frame);}raf=requestAnimationFrame(frame);return()=>cancelAnimationFrame(raf)},[]);
 const order=selected===null?undefined:sim.orders.get(selected);const statusLabel={ready:'READY TO RUN',running:metrics.time>=DAY?'DRAINING ORDERS':'SIMULATION RUNNING',paused:'PAUSED',completed:'RUN COMPLETED'}[status];
 return <main className="lab-shell">
<header className="topbar">
<a className="brand" href="https://daslab.co.kr" aria-label="DAS Lab home">DAS<span>LAB</span>
<span className="brand-divider"/>
<small>WORK / SIMULATION</small>
</a>
<a href="https://daslab.co.kr">Back to DAS Lab <ArrowUpRight size={15}/>
</a>
</header>
 <section className="project-heading">
<div>
<div className="eyebrow">OPERATIONS LAB <span>/</span> 01 — FULFILLMENT</div>
<h1>Fulfillment Automation<span className="title-dot">.</span>
</h1>
<p>주문에서 출하까지, 물류 시스템의 흐름과 병목을 직접 실험합니다.</p>
</div>
<div className="project-labels">
<span className="project-badge">
<Layers3 size={15}/> DISCRETE EVENT SIMULATION</span>
<span className="project-subtag">DIGITAL TWIN / INTERACTIVE CASE STUDY</span>
</div>
</section>
 <div className="experiment-bar">
<div className="experiment-title">
<SlidersHorizontal size={16}/>
<span>Experiment</span>
</div>
<div className="preset-buttons">{PRESETS.map(p=>
<button disabled={fast} className={preset===p.id?'active':''} onClick={()=>applyPreset(p.id)} key={p.id} title={p.detail}>{p.label}</button>)}</div>
<span className="seed-note">Common random seed <b>{params.seed}</b>
</span>
</div>
 <div className="workspace">
<div className="main-workspace">
<section className="viewer-panel">
<div className="panel-heading">
<span>
<Box size={17}/> Fulfillment center <small className="viewer-model-id">FC–01</small>
</span>
<span className={`run-status ${status}`}>
<i/>{statusLabel}</span>
</div>
<Scene engineRef={engineRef} revision={revision} onSelect={setSelected}/>
<div className="playback-bar">
<div className="play-controls">
<button className="play-button" disabled={fast} onClick={()=>status==='running'?changeStatus('paused'):start()} aria-label={status==='running'?'Pause simulation':status==='paused'?'Resume simulation':'Start simulation'}>{status==='running'?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}<span>{status==='running'?'Pause':status==='paused'?'Resume':status==='completed'?'Run again':'Start'}</span>
</button>
<button className="icon-button" onClick={()=>reset()} disabled={fast} aria-label="Reset simulation" title="Reset simulation">
<RotateCcw size={17}/>
</button>
<Select value={String(speed)} onValueChange={v=>setSpeed(Number(v))}>
<SelectTrigger aria-label="Simulation playback speed" className="speed-select">
<SelectValue/>
</SelectTrigger>
<SelectContent>{[1,10,60,300,900].map(v=>
<SelectItem key={v} value={String(v)}>{v}× speed</SelectItem>)}</SelectContent>
</Select>
</div>
<div className="sim-clock">
<Timer size={17}/>
<strong>{clock(metrics.time,true)}</strong>
<span>SIM TIME</span>
</div>
<button className="finish-button" onClick={finish} disabled={fast||status==='completed'||dirty}>
<FastForward size={15}/>{fast?'Calculating…':'Finish run'}</button>
</div>
<div className="day-progress">
<div className="day-track">
<i style={{width:`${Math.min(100,metrics.time/DAY*100)}%`}}/>
</div>
<div>
<span>08:00 <small>OPEN</small>
</span>
<span>{metrics.time>DAY?`Overtime +${number(metrics.overtime/60,1)} min`:'10-hour operating day'} <span className="day-end">18:00 <small>CLOSE</small>
</span>
</span>
</div>
</div>
 {order&&<div className="order-inspector">
<Box size={18}/>
<div>
<strong>{orderID(order.id)}</strong>
<span>{STAGE_LABELS[order.stage]}</span>
</div>
<div>
<small>Required SKU</small>
<b>{order.sku}</b>
</div>
<div>
<small>Created</small>
<b>{clock(order.created,true)}</b>
</div>
<div>
<small>{order.completed?'Lead time':'Elapsed'}</small>
<b>{number(((order.completed??metrics.time)-order.created)/60,1)} min</b>
</div>
<button className="icon-button" onClick={()=>setSelected(null)} aria-label="Close order details">
<X size={17}/>
</button>
</div>}
 </section>
<KPICards m={metrics}/>
<div className="flow-strip">{[['Induction',metrics.stageWip.induction],['Inbound',metrics.stageWip.inbound],['DPS loop',metrics.stageWip.pickingLoop],['Picking',metrics.stageWip.picking],['Outbound',metrics.stageWip.outbound],['Trolley / loading',metrics.stageWip.dock]].map(([label,count],i)=>
<div key={label}>
<span>{label}</span>
<strong>{count}</strong>{i<5&&<ChevronRight size={13}/>}</div>)}</div>
</div>
 <aside className="control-panel">
<div className="control-heading">
<h2>
<SlidersHorizontal size={16}/> Model parameters</h2>
<span>INPUTS</span>
</div>
<p className="control-caption">조건을 바꾸고 운영 성과를 비교하세요.</p>
<div className="parameters">{paramFields.map(f=>
<div className="parameter" key={f.key}>
<div className="parameter-label">
<label id={`param-${f.key}`}>{f.label}</label>
<span>
<b>{number(params[f.key],f.key==='conveyorSpeed'?2:0)}</b> {f.unit}</span>
</div>
<Slider aria-labelledby={`param-${f.key}`} value={[params[f.key]]} onValueChange={([v])=>changeParam(f.key,Number(v.toFixed(2)))} min={f.min} max={f.max} step={f.step} disabled={fast}/>
</div>)}</div>
<div className="seed-input">
<label htmlFor="random-seed">Random seed</label>
<Input id="random-seed" type="number" min={1} max={999999} value={params.seed} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=999999)changeParam('seed',n)}} disabled={fast}/>
</div>
<button className={`apply-button ${dirty?'dirty':''}`} onClick={()=>reset()} disabled={fast||!dirty}>{dirty?<RotateCcw size={14}/>:<Check size={14}/>} {dirty?'Apply & reset':'Parameters applied'}</button>
<div className={`bottleneck-card ${metrics.bottleneckQueue>0?'congested':''}`}>
<div>
<CircleAlert size={16}/>
<span>CURRENT BOTTLENECK</span>
</div>
<strong>{metrics.bottleneck}</strong>
<p>{metrics.time===0?'실행 후 대기열과 점유율을 분석합니다.':metrics.bottleneckQueue>0?`${number(metrics.bottleneckQueue)} orders waiting · Highest occupancy`:'Highest cumulative occupancy'}</p>
</div>
<div className="truck-info">
<Truck size={16}/>
<span>{sim.truckAvailable?'Truck at manual-loading bay':'Truck changeover'}</span>
<b>{metrics.truckLoad} <small>/ {sim.params.truckCapacity}</small>
</b>
</div>
</aside>
</div>
 <div className="model-notice" role="status" aria-live="polite">{notice?<>
<CircleCheck size={14}/>{notice}</>:<>
<Info size={14}/> 동일한 Seed에서는 주문 도착과 SKU가 같습니다. 입력 조건을 변경한 뒤 Apply & reset으로 다시 실행하세요.</>}</div>
 <div className="section-divider">
<h2>Operational intelligence<span>실시간 운영 분석</span>
</h2>
<span>
<Activity size={14}/> EVENT-DRIVEN METRICS</span>
</div>
<Charts engine={sim} m={metrics}/>
 <section className="details-panel">
<Tabs value={tab} onValueChange={setTab}>
<div className="details-tabs">
<TabsList variant="line">
<TabsTrigger value="performance">Performance</TabsTrigger>
<TabsTrigger value="events">Event log <span className="tab-count">{sim.logs.length}</span>
</TabsTrigger>
<TabsTrigger value="summary">Daily summary {runs.length>0&&<span className="tab-count">{runs.length}</span>}</TabsTrigger>
<TabsTrigger value="model">Model & assumptions</TabsTrigger>
</TabsList>
<span className="detail-caption">{metrics.finished?'FINAL RESULTS':'LIVE ANALYSIS'}</span>
</div>
<TabsContent value="performance">
<Performance m={metrics}/>
</TabsContent>
<TabsContent value="events">
<div className="event-heading">
<div>
<h3>Simulation event stream</h3>
<p>최근 120개 이벤트 · Order ID를 선택하면 객체 정보를 확인할 수 있습니다.</p>
</div>
<span>{sim.logs.length} events</span>
</div>{sim.logs.length?<div className="event-table">
<Table>
<TableHeader>
<TableRow>
<TableHead>Simulation time</TableHead>
<TableHead>Order ID</TableHead>
<TableHead>Event</TableHead>
</TableRow>
</TableHeader>
<TableBody>{sim.logs.map((log,i)=>
<TableRow key={`${log.time}-${i}`}>
<TableCell className="mono muted">{clock(log.time,true)}</TableCell>
<TableCell>{log.id!==null?<button className="order-link" onClick={()=>{setSelected(log.id);document.querySelector('.viewer-panel')?.scrollIntoView({behavior:'smooth',block:'center'})}}>{orderID(log.id)}</button>:<span className="muted">SYSTEM</span>}</TableCell>
<TableCell>
<span className={`log-kind ${log.kind}`}/>{log.message}</TableCell>
</TableRow>)}</TableBody>
</Table>
</div>:<div className="empty-state">
<Activity size={28}/>
<h3>Ready for the first event.</h3>
<p>Start를 누르면 주문 생성부터 출하까지의 이벤트가 기록됩니다.</p>
</div>}</TabsContent>
<TabsContent value="summary">
<Summary m={metrics} runs={runs}/>
</TabsContent>
<TabsContent value="model">
<div className="model-document">
<div className="model-intro">
<span className="eyebrow">MODEL LOGIC / V1.6</span>
<h3>Arrival → Recirculation → Resource → Process → Transport → Completion</h3>
<p>가상 소규모 풀필먼트 센터의 개념 실험 모델입니다. 특정 고객의 실제 설비 데이터로 보정한 모델은 아닙니다.</p>
</div>
<div className="assumptions-grid">
<div>
<h4>주문과 시간</h4>
<p>08–18시 사이에 설정한 N건이 균등한 난수 시각에 도착합니다. 고정된 일일 주문 건수를 조건으로 한 Poisson 도착 모델이며, 각 주문은 1–5개 SKU와 1개의 출고 박스를 가집니다. 18시 이후 신규 주문은 중단하고 잔여 주문을 모두 처리합니다.</p>
<h4>피킹과 이송</h4>
<p>피킹 시간 = (기본시간 + SKU 수 × SKU당 시간 + (랙 수 − 5) × 2초) × 0.85–1.15 난수 계수입니다. 기본 시나리오는 기본시간 15초와 SKU당 5초(평균 약 36초/주문)를 사용합니다. 작업대 앞에는 passing/recirculation conveyor와 station picking conveyor 두 줄만 나란히 배치됩니다. 목표 박스는 전용 pop-up transfer에서 90도로 station 라인에 진입해 작업자 앞을 수평 이동하고, 피킹 후 별도의 90도 transfer로 같은 passing 라인에 복귀합니다. 작업대가 사용 중이면 게이트에서 멈추지 않고 loop를 한 바퀴 더 돌며, 피킹 완료 박스도 하류 outbound가 막혀 있으면 같은 loop로 재순환합니다. 각 작업대의 transfer는 독립 설비로 동시 동작할 수 있습니다.</p>
<h4>차량 배차</h4>
<p>직선 outbound belt 끝에서 박스를 16칸 auto-stow trolley에 수납한 뒤, 상차 작업자 2명이 한 개씩 트럭으로 운반합니다. 작업자 1명당 상차 6초와 복귀 2초의 빠른 8초 주기이며, 완료된 박스를 Shipment Completed로 집계합니다. 차량은 만차 또는 첫 적재 후 30분이 지나면 진행 중 상차와 작업자 복귀를 마치고 출발합니다. 다음 차량 도착에는 2분이 소요됩니다.</p>
</div>
<div>
<h4>용량과 대기 규칙</h4>
<Table>
<TableHeader>
<TableRow>
<TableHead>Process</TableHead>
<TableHead>Capacity / time</TableHead>
</TableRow>
</TableHeader>
<TableBody>{[['Box induction','1 machine · 9 sec / box'],['Inbound conveyor','20 slots · route pitch / speed'],['Passing / recirculation loop','62 slots · 1.2 m pitch'],['Station picking conveyor','1 adjacent horizontal lane'],['Station transfer units','2 per station · independent 90° transfer'],['Picking resources','1–6 workers · 1 order / worker'],['Outbound conveyor','10 slots · straight 1.2 m pitch'],['Auto-stow trolley','16 fixed slots · FIFO'],['Manual truck loading','2 loaders · 6 sec load + 2 sec return']].map(([a,b])=>
<TableRow key={a}>
<TableCell>{a}</TableCell>
<TableCell>{b}</TableCell>
</TableRow>)}</TableBody>
</Table>
<p>인바운드·passing loop·아웃바운드 컨베이어는 유한 슬롯이며 추월하지 않습니다. Station으로 빠진 박스 한 개마다 loop의 빈 슬롯 한 개를 보존하므로, 신규 박스가 복귀 공간을 먼저 차지해 교착되는 일이 없습니다. 완료 박스는 정렬된 merge 슬롯이 도착할 때까지 local transfer deck에서 기다린 뒤 같은 passing loop에 합류합니다. 하류 outbound가 열리면 빠져나가고, 닫혀 있으면 통로를 막지 않고 loop를 계속 순환합니다.</p>
</div>
</div>
<div className="metric-definitions">
<h4>KPI 읽는 법</h4>
<p>
<b>WIP</b> = 접수 − 적재 완료. <b>리드타임 / Flow time</b> = 주문 생성부터 적재 완료까지입니다. <b>평균 대기시간</b>에는 접수 대기, 목표 작업대 재순환, merge deck 대기와 도크 FIFO 대기가 포함됩니다. 각 컨베이어 내부 체류는 운송시간입니다. <b>재순환</b>은 미피킹 박스가 목표 작업대 사용 중으로 게이트를 통과한 횟수입니다.</p>
<p>
<b>작업자 가동률</b> = 순수 피킹 시간 / (작업자 수 × 경과 시간). <b>작업대 점유율</b>은 진입·피킹·station 이송·merge 대기를 모두 포함합니다. <b>Transfer 가동률</b>은 작업대별 직교 이송시간을 전체 transfer 설비시간으로 나눈 값입니다. <b>컨베이어 점유율</b>은 92개 물리 슬롯의 시간 가중 평균이며, 상차 가동률은 2명 작업자의 합산 가동시간 기준입니다. <b>병목</b>은 누적 점유율, 동률이면 현재 대기 주문 수 순으로 표시합니다.</p>
<p>
<b>실험 비교</b>는 동일한 Seed의 도착·SKU·피킹 변동 난수를 사용합니다. 단일 일자 결과이며 장기 정상상태 분석이나 통계적 신뢰구간은 제공하지 않습니다. 3D 화면은 개념 배치로, 컨베이어 처리 용량은 위의 모델 길이를 기준으로 계산합니다.</p>
</div>
</div>
</TabsContent>
</Tabs>
</section>
 <footer className="footer">
<div>
<strong>DAS LAB</strong>
<span>Digital Twin · Simulation · AI</span>
</div>
<span>Turning operational complexity into better decisions.</span>
<a href="https://daslab.co.kr">Explore DAS Lab <ArrowRight size={14}/>
</a>
</footer>
</main>
}

