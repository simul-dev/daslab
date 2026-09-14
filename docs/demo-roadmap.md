# DAS Lab Interactive Simulation Demo Roadmap

작성 기준: 2026-09-14 · 설계 문서 / 구현 승인 전  
대상 저장소: `C:/Users/USER/OneDrive/daslab/daslabhp`

## 0. 현재 구조와 설계 원칙

### 0.1 현재 파일에서 확인한 사실

이 문서는 실제 작업 폴더의 `demo.html`, `demo_en.html`, 루트와 두 앱의 `package.json`, `pnpm-workspace.yaml`, `scripts/demo-manifest.mjs`, `scripts/assemble-site.mjs`, `scripts/verify-static-build.mjs`, 두 데모의 `src/`·`tests/`·Vite 설정을 읽고 작성했다. 배포 인프라나 도메인의 제공 사업자는 조사하지 않았다.

- 홈페이지는 정적 HTML이고, 메뉴는 서비스 → 클라이언트 → 소개 → 자료실 → 데모이다. Demo Hub는 `demo.html`의 9개 산업 앵커로 구성된다.
- 한국어·영문 내용은 같은 `demo.html` 안의 `lang` 속성으로 전환한다. `demo_en.html`은 `demo.html?lang=en`으로 이동하는 기존 진입점이다. 언어 저장 키는 `daslab-lang`이다.
- 현재 Hub와 manifest에는 Fulfillment, Pump가 LIVE로 연결되어 있다. 여기서 LIVE는 **현재 저장소의 구현·카드 상태**이며, 이 문서가 원격 배포 완료를 확인했다는 의미는 아니다.
- workspace는 `demos/*`이다. 실제 폴더는 `demos/logistics-fulfillment/`, `demos/manufacturing-pump-assembly/`이다. URL의 다단계 경로와 달리 앱 소스 폴더는 한 단계로 둔다.
- 두 앱은 React + TypeScript + Vite + Three.js + Recharts이다. Fulfillment는 Tailwind/Radix 계열 UI를 포함하지만 Pump는 일반 CSS 기반이다. 새 데모는 더 작은 Pump 앱 구성을 기본으로 삼는다.
- `build:demos`는 workspace 앱을 순차 빌드한다. `build:site`는 manifest의 `source/base`를 읽어 홈페이지와 앱 결과를 **루트 `dist/` 하나**로 조립한다. 경로 이탈·중복·겹침 검사도 이미 있다.
- 현재 `check`는 두 앱 테스트 → 전체 build → 정적 파일·Hub 링크 검증이다. 현재 검증기는 HTML의 직접 asset 참조를 검사하며, JS 동적 import나 CSS 안의 모든 URL까지 정적으로 추적하지는 않는다.
- Fulfillment는 슬롯형 DPS 컨베이어, 합류, 트롤리, 상차가 엔진에 결합되어 있다. Pump는 calendar/random/parameters/types/metrics가 분리되어 있지만 공정 ID와 상태는 여전히 펌프 전용이다. **공용 산업 엔진이 이미 완성된 상태는 아니다.**
- 기존 홈페이지·데모의 외부 Google Fonts 참조는 현재 코드의 특징이다. 신규 데모는 폰트·로고·필요 asset을 자체 포함하거나 시스템 폰트를 사용해 외부 네트워크가 없어도 읽고 실행할 수 있게 설계한다. 기존 참조를 이번 작업에서 수정하지 않는다.

### 0.2 포트폴리오의 공통 메시지

“설비가 움직인다”가 아니라 **조건을 바꾸면 대기·자원 점유·완료량이 왜 달라지는지 확인한다**가 모든 카드의 약속이다. 공장·창고 이후 운반 순환, 항만의 결합 자원, 재고 보충, 신호 제어, 열차 점유, 정비 작업 승인·자재 지원으로 문제 유형을 넓힌다.

모든 신규 데모의 약속:

1. 독립 React + Vite 정적 SPA, `/demo/<domain>/<model>/`. API·DB·로그인·SSR·RSC·Vinext·Sites 없이 엔진과 UI가 브라우저에서 실행된다.
2. 합성 입력 데이터와 고정 seed를 앱에 포함한다. 시나리오 변경은 엔진 입력을 실제 변경한다. 실제 산업의 표준 처리량·고장률·안전 기준이라고 제시하지 않는다.
3. Arrival → Queue → Resource → Process → Transport → Completion을 구분한다. Entity와 이를 운반하는 Resource는 동일시하지 않는다.
4. UI는 Start / Pause / Reset / Finish run, 파라미터 draft→Apply & reset, 3개 안팎의 비교 프리셋, KPI 4–6개, 차트 2개, Event Log, 기간 종료 Summary를 갖는다. 기존 용어 Daily Summary는 일별 표에 사용하고 장기/단기 모델에는 Period Summary도 병기한다.
5. 계산은 이벤트 시각 기준이다. 3D는 계산된 위치·점유·상태를 표시할 뿐 사건이나 KPI를 만들지 않는다. 3D 로딩 실패 시에도 KPI와 조작은 유지한다.
6. 유한 버퍼가 꽉 찼을 때 대기·출발 차단·접수 보류·수요 손실 중 무엇이 발생하는지 명시한다. 소실·중복·무한 비가시 큐로 문제를 숨기지 않는다.
7. 비교는 같은 수요·seed·평가 기간을 사용한다. 완료한 Entity의 평균 시간과 미완료 backlog를 함께 표시한다. 미완료를 제외한 평균만으로 개선을 주장하지 않는다.
8. 첫 화면·Reset camera·모바일 overview에서 전체 모델을 볼 수 있어야 한다. 색상과 텍스트로 queued / processing / moving / blocked / unavailable / completed를 구분한다.

“Digital Twin”은 여기서는 **운영 디지털 트윈의 설명용 모델**이다. 실시간 설비 연결·실측 보정·예측 AI가 탑재되었다고 광고하지 않는다. AI는 2차의 선택 항목이며, 도입해도 브라우저 내 작은 예측 모델과 검증 가능한 비교로 제한한다. 외부 AI API가 필수가 되어서는 안 된다.

### 0.3 1–2일 MVP의 의미와 공통 완료 게이트

기간은 **각 도메인마다**, 기존 UI를 활용하는 개발자 1명의 집중 작업 8–16시간을 가정한 설계 추정이다. 실측 데이터 수집, 전문가 인증, CAD 제작, 생산 수준 최적화는 포함하지 않는다. 제3 데모 전의 공통 템플릿 정리는 별도 최대 반일이며, 범용 플랫폼 개발로 확대하지 않는다.

- 1일차 전반: 상태·이벤트·종료 조건·불변조건 정의.
- 1일차 후반: 엔진, 결정론·수량 보존·capacity·정책 검증, 프리셋 KPI 방향성 확인.
- 2일차 전반: 재사용 UI, 절차형 저폴리곤 3D와 읽기 전용 위치 투영.
- 2일차 후반: 입력·로그·Summary, 데스크톱/모바일, base URL 직접 접속·새로고침·오프라인 실행·404/Console 검사.
- 최초 개발 시 엔진 검증보다 애니메이션을 먼저 고도화하지 않는다. 일정이 부족하면 세부 3D 소품·추가 프리셋을 줄이되 도메인 핵심 제약을 삭제하지 않는다.

검증 공통 기준:

- 동일 seed에서 같은 사건 결과; 재생 배속/advance 간격을 바꿔도 동일한 완료·점유 결과. 시간 적분값은 부동소수점 허용 오차를 명시한다.
- 계획/접수/미접수, WIP, 완료, 취소·손실 등 terminal 상태의 보존식; 한 Entity의 중복 자원 점유 금지.
- finite buffer/resource 초과 금지, 이동 중 Entity 보존, 잘못된 오래된 완료 이벤트 방지.
- 각 모델의 양성 방향 테스트 2개와 “다른 병목이면 추가 투자 효과가 제한됨” 테스트 1개. 모든 seed에서 무조건 좋아진다고 보장하는 단조성 주장은 하지 않는다.
- 모든 미완료가 처리되지 않는 공급 부족·운행 중단 모델은 horizon에 종료하고 미완료를 보고한다. 정당한 정책 대기와 실제 교착을 구분하며 Finish run이 무한 반복하지 않게 한다.
- 이후 구현 승인을 받으면 기존 Fulfillment/Pump 테스트와 루트 `pnpm check`를 함께 수행한다. **이번 문서 작업에서는 build·소스 수정·push·배포를 수행하지 않는다.**

### 0.4 재사용 위치 표

아래 약칭은 각 도메인의 8번 항목에서 사용한다. “재사용”은 명시된 작은 기능을 신규 앱에 복사·변환하는 뜻이다. 기존 데모의 파일을 옮기거나, 신규 앱이 형제 앱의 내부 엔진을 직접 import하는 뜻이 아니다.

| 약칭 | 현재 실제 파일 | 재사용 가능 범위 / 그대로 가져오면 안 되는 것 |
| --- | --- | --- |
| P-Core | `demos/manufacturing-pump-assembly/src/lib/simulation/calendar.ts`, `random.ts` | 안정적 동시 사건 순서, model/sample 구분, keyed RNG. domain 상태와 정책은 포함하지 않음 |
| P-Engine | 같은 폴더의 `engine.ts`, `types.ts`, `metrics.ts`, `parameters.ts` | 자원 상태 시간 적분, 검증·snapshot·BAS 구현 패턴. StationId, 펌프 repair loop, 08–16시 clock은 도메인별 교체 |
| P-UI | `demos/manufacturing-pump-assembly/src/App.tsx`, `globals.css`, `components/ParameterPanel.tsx`, `Analytics.tsx`, `Charts.tsx`, `WorkOrderInspector.tsx` | 브랜드·실행 제어·draft/apply·비교·차트·로그 틀. Props/항목명/KPI 분모는 모델별 adapter 필요 |
| P-Scene | `demos/manufacturing-pump-assembly/src/components/PumpLineScene.tsx`, `src/lib/scene/primitives.ts`, `layout.ts` | renderer·camera fit·선택·cleanup, 단순 mesh와 경로 보간. 공장 배치·펌프 모양은 재사용하지 않음 |
| F-Flow | `demos/logistics-fulfillment/src/lib/simulation/engine.ts`, `layout.ts`, `position.ts` | 유한 이동·회차·트럭 상태·경로 투영의 참고 패턴. 컨베이어 slot/merge 예약을 도로·철도 규칙으로 그대로 사용하지 않음 |
| F-Scene | `demos/logistics-fulfillment/src/components/simulation/Scene.tsx` | 박스·차량·작업자 형상 제작 패턴. 항만·굴착·철도 설비는 새로 제작 |
| Tests | 두 앱의 `tests/simulation.test.mjs`, Pump의 `tests/layout.test.mjs` | 결정론·보존식·점유·운반·카메라 범위 테스트 패턴. 기대값과 도메인 불변조건은 신규 작성 |


## 1. Port Terminal — 컨테이너 하역·야드·게이트 병목

### 1.1 구체적 데모 제목과 배포 위치

**Compact Container Terminal: Quay-to-Gate Simulation**  
한국어: **소형 컨테이너 터미널 하역·반출 시뮬레이션**

- 소스 후보: `demos/ports-quay-to-gate/`
- URL: `/demo/ports/quay-to-gate/`
- Hub 앵커: `#ports` · 현재 PLANNED
- 선석 1개·선박 방문 1건, 수입 컨테이너만 취급하는 합성 터미널을 선택한다. 다선박 접안 대기는 2차로 미룬다.

### 1.2 고객의 의사결정 질문

1. 안벽 크레인을 추가하는 것과 터미널 트랙터를 추가하는 것 중 무엇이 선박 체류시간을 줄이는가?
2. 야드가 차면 안벽 하역은 얼마나 막히며, 야드 공간 확대와 반출 능력 개선 중 무엇이 유효한가?
3. 한 선박의 하역 물량이 늘면 기존 운반·야드·gate 능력으로 평가 기간 내 반출을 끝낼 수 있는가?

### 1.3 시뮬레이션 범위

| 구분 | MVP 모델 |
| --- | --- |
| Entity | 선박 방문 1건과 해당 선박에 소속된 개별 컨테이너. 트랙터는 별도의 재사용 자원 |
| Arrival / Demand | 시작 시 선박 1척이 도착하고 예시 120개 상자를 하역하는 8시간 모델. seed는 합성 처리시간에 사용; 운항·조석 데이터 연동 없음 |
| Queue / Buffer | 안벽 handoff 4개 slot, 유한 트랙터 대기, 야드 40개 slot, 반출 대기 10건. 외항 queue·접안 우선순위는 제외 |
| Resource | 선석 1, QC 1–2, 트랙터 2–5, 야드 크레인 1–2, gate 처리 창구 1–2 |
| Process | 접안 → QC 하역 → 트랙터 적재 → 야드 적치 → 고정 반출 준비 대기 → 야드 인출 → gate 처리 |
| Transport | 안벽↔야드는 고정 왕복 경로이며 트랙터는 적재·운반·하차 대기·빈차 복귀 동안 점유. 야드 인출→gate는 고정 이동시간, 별도 운반 자원 경쟁 없음 |
| Completion | 컨테이너는 gate 반출 시 완료. 선박은 마지막 상자가 선박에서 내려졌을 때 선석 해제. 선박 출항과 컨테이너 최종 반출을 혼동하지 않음 |
| 제약·병목 | QC는 트랙터 확보와 독립적으로 하역하고 안벽 buffer가 차면 BAS로 상자를 보유. 트랙터는 buffer FIFO 인수; 야드 만차 시 적치 불가 및 상류 blocking. 야드 크레인은 적치/인출의 실행 가능한 작업 중 FIFO로 처리 |

QC 하역 완료 상자가 안벽 buffer로 인계되면 QC가 해제되고, 빈 트랙터는 가장 오래된 상자를 인수한다. buffer가 가득 차면 QC가 완료 상자를 보유한 채 blocked가 된다. **직접 QC→트랙터 동시 확보 정책과 혼용하지 않는다.** QC 여러 대의 간섭·hatch 배치는 생략한다.

야드 내부의 실제 stacking/rehandle은 하지 않는다. slot 점유 수량만 추적한다. 반출 준비 시각은 모델 내부 사건으로 생성하며 외부 트럭 예약 API는 없다. 크레인을 잡은 채 불가능한 적치를 기다리는 구조를 피하고, 가능 작업 판정으로 인출이 야드 공간을 회복할 수 있게 한다.

### 1.4 변경 파라미터

공통 horizon·seed 외에 선박 상자 수, QC 수/사이클 시간, 트랙터 수/왕복시간, 야드 용량, 야드 크레인 수, 반출 준비 대기시간, gate 처리시간을 노출한다. 기본값은 연산 결과를 보여주기 위한 예시이며 실제 터미널 생산성 수치가 아니다.

프리셋: Baseline / Higher Discharge Volume / Add Tractor / Add Yard Capacity.

### 1.5 KPI·차트·병목 지표

- 선박 1척의 체류시간, 시간당 반출 상자 수, 선박 내 미하역 상자·야드 잔량, 컨테이너 체류시간. 기간말 미출항이면 경과 체류시간과 미완료 상태를 표시한다.
- QC productive/idle/blocked 시간, 트랙터 적재·빈차·하차 대기, 야드 점유율.
- 차트 2개: 시간별 반출·하역량 / 야드 점유와 QC blocking.
- 최근 60분 동안 대기열 증가와 높은 자원 점유, 상류 blocking을 함께 보여준다. QC blocked의 직접 원인은 “안벽 buffer full”로 표시하고, 연결된 트랙터 부족 / 야드 만차는 하류 원인으로 구분한다.
- 테스트: 충분한 야드·gate 조건에서 트랙터 추가 효과, 반출을 느리게 했을 때 야드 및 QC blocking 증가. 야드가 병목이면 QC 추가만으로 개선되지 않는 사례.

### 1.6 3D Scene

선박·선석·QC, 컨테이너, 왕복 트랙터, 야드 slot 격자, gate를 한 화면에 배치한다. 크레인은 서비스 중에만 동작하고, 트랙터는 실제 busy 상태에 따라 적재·빈차 이동한다. yard-full, crane-blocked, vessel-unloading/departed 상태와 상자 선택 이력을 표시한다. 실제 항만 지형이나 운영 위치를 복제하지 않는다.

### 1.7 MVP와 2차

- **MVP 2일:** 1선박·1선석·수입만·고정 왕복 경로·동일 크기 컨테이너·slot 수량 야드. 1일차 선박/상자 보존과 차량 순환·blocking, 2일차 scene/UI/비교 검증.
- **2차:** 다선박 방문·외항/접안 대기·수출 혼재·다선석, 적치 위치·재취급, 외부 트럭 appointment, 크레인 고장, route conflict, 장비 배정 최적화·학습.
- 축소 가능: 크레인 세부 기구 애니메이션. 축소 불가: 선박/컨테이너 종료 차이, 트랙터 재사용, 야드 만차의 상류 영향.

### 1.8 재사용 / 신규 DES

P-Core, P-UI, P-Scene, Tests와 F-Flow/F-Scene의 차량·상자 제작 패턴을 재사용한다. **신규**는 VesselVisit↔Container 관계, 선석 release 조건, QC→유한 안벽 buffer→트랙터 FIFO 인수, 적치·인출 공유 자원, 야드 inventory 및 gate 준비 사건이다. Fulfillment truck 출하 완료 로직을 선박 출항에 그대로 연결하지 않는다.

### 1.9 평가

난이도 **3/5**, 포트폴리오 임팩트 **5/5**, 개발 우선순위 **5/5**. 새 분야라는 시각적 인상이 강하고, 단일 선석으로 제한하면 결합 자원 병목을 2일 범위에 담을 수 있다. 전체 제작 순서는 **4번째**, 신규 분야 중 2번째로 권장한다.


## 2. Supply Chain — 가전 지역 DC 재고보충과 고객 납기

### 2.1 구체적 데모 제목과 배포 위치

**Air Purifier Distribution & Replenishment Simulation**  
한국어: **공기청정기 지역 DC 재고보충·배송 시뮬레이션**

- 소스 후보: `demos/supply-chain-inventory-replenishment/`
- URL: `/demo/supply-chain/inventory-replenishment/`
- Hub 앵커: `#supply-chain` · 현재 PLANNED
- 공급사 1곳 → 지역 DC 1곳 → 고객 2권역, 공기청정기 1 SKU, 28일 모델이다. 고객 권역에는 별도 점포 재고 정책을 두지 않는다.

### 2.2 고객의 의사결정 질문

1. 재주문점을 올리면 주문 충족률은 얼마나 좋아지고 평균 재고는 얼마나 늘어나는가?
2. 공급 리드타임 증가와 수요 급증 중 어느 쪽이 stockout과 납기 지연을 더 크게 만드는가?
3. 출고차량 적재량을 늘리는 것만으로 상품 부족에 의한 지연까지 해결되는가?

### 2.3 시뮬레이션 범위

| 구분 | MVP 모델 |
| --- | --- |
| Entity | 고객 주문(1대)과 수량을 가진 보충 Shipment를 분리. 재고는 수량 ledger로 관리 |
| Arrival / Demand | seed 기반 주문, 예시 평균 12대/일. 공급 발주는 재고 상태 변경 사건에서 생성 |
| Queue / Buffer | DC backorder 40건, 공급사 처리 queue 10건, DC 저장 120대, 유한 출하 대기. 초과 고객 수요는 lost demand |
| Resource | 공급사 출고 처리대 1, DC 입고/피킹 작업자 각 1, 하루 고정 회차의 배송차량 1대와 유한 적재량 |
| Process | 재고 검토 → 발주 → 공급사 처리 → DC 입고 → 고객 주문 할당·피킹 → 정기 출하 → 고객 인도 |
| Transport | 공급사→DC 고정 리드타임, DC→두 고객권역의 고정 순회. 배송차량은 적재·배송·복귀 동안 점유; route 최적화 없음 |
| Completion | 주문은 실제 고객 인도 시 완료. 보충 Shipment의 DC 입고는 주문 완료와 별개 |
| 제약·병목 | 재고 부족, 공급·입고·피킹 capacity, 적재량, 출발 cutoff, 저장 한도. 운송 중 수량은 재고와 중복 집계하지 않음 |

정책은 **재주문점 s와 고정 발주량 Q 한 가지**로 고정한다. available과 reserved는 분리하며 physical stock = available + reserved이다. 이 문서의 inventory position = available + onOrder − 아직 할당되지 않은 backlog이다. onOrder에는 고유 ID로 생성된 pendingPO부터 공급사 접수·처리·운송 중 물량까지 포함하며, 실제 입고 때 한 번만 차감한다. 기존 발주를 onOrder에 반영해 중복 발주를 막고, 한 상품을 두 주문에 할당하지 않는다. DC 수량 검증은 초기재고 + 입고 − 출하 = available + reserved이다. 예시로 s=30, Q=40, 초기재고=60이며 s+Q가 저장 capacity를 넘지 않도록 입력을 검증한다. 이 조건만으로 실제 만차를 방지했다고 보지 않는다. 입고 시 available + reserved + incomingQty ≤ capacity를 별도로 검사하고, 공간이 없으면 Shipment를 유한 입고 대기에서 보류하며 onOrder에서 빼지 않는다. 입고 대기까지 꽉 차면 공급사 출발을 보류한다.

출발 cutoff에 못 실은 주문은 다음 회차를 기다린다. 공급사 발주 queue가 꽉 차면 고유 ID의 pendingPO 하나를 보존하고 다음 처리 가능 사건에서 같은 ID로 재시도한다. pendingPO가 있는 동안 동일 목적의 추가 보류 발주를 생성하지 않는다. 공급사 접수 성공 시 pending→accepted 상태만 바꾸고 onOrder를 다시 더하지 않는다. 슬롯을 확보하지 못한 보충 물량을 수령한 것으로 집계하지 않는다. 재시도는 상태가 바뀌는 사건에서만 수행해 시각이 진행되지 않는 무한 반복을 막는다.

### 2.4 변경 파라미터

수요 배율, 재주문점 s, 발주량 Q, 초기 재고, 공급 리드타임(예시 2일), DC 처리시간, 차량 적재량(예시 20대), 출하 주기(1–2일). seed·기간은 공통 입력이다.

프리셋: Baseline / Demand Surge / Longer Supply Lead Time / Higher Reorder Point.

### 2.5 KPI·차트·병목 지표

- 즉시 할당률 = 주문 발생 시 재고를 전량 할당한 주문 / 전체 발생 주문. 고객 배송 완료율과 구분한다.
- 납기 충족률 = 약속시각 내 인도한 주문 / 평가시점까지 납기가 도래한 모든 주문; 미완료 연체 주문도 분모에 포함.
- 평균 physical/in-transit 재고, backlog 수·age, lost demand, 고객 리드타임, 차량 적재율.
- 차트 2개: 재고·backlog·보충 입고 추이 / 일별 수요·인도량·납기 충족률.
- 최근 7일의 stockout 대기, 공급 지연, DC 서비스 대기, 출발 cutoff 대기를 분리한다. 재고 부족을 작업자 가동률만으로 판정하지 않는다.
- 테스트: 같은 수요·초기재고에서 s 증가의 service/inventory trade-off; 공급 지연으로 결품 노출 증가. 재고 부족이면 차량 증설 효과가 제한됨을 확인한다.

### 2.6 3D Scene

지도 API 대신 공급사·DC·두 고객권역의 저폴리곤 네트워크를 사용한다. 선반 수량, backorder 배지, 차량 적재·이동·복귀, 도착 시 인도 수량을 표시한다. 일 단위 lead time은 가속된 시뮬레이션 시간임을 명시한다.

### 2.7 MVP와 2차

- **MVP 1.5–2일:** 1 SKU·DC 재고 한 곳·단일 s,Q 정책·고정 출하 경로. 1일차 주문/보충 이중 흐름과 ledger 테스트, 2일차 UI·scene·기간 종료 검증.
- **2차:** 다 SKU, 판매점별 재고와 다계층 정책, 대체 공급사, 반품, MOQ, forecast error, 운송 차질, 브라우저 내 예측·발주 최적화.
- 28일 종료 snapshot을 고정한다. 선택적 drain에서는 추가 수요·자동 재발주를 멈추며, 공급 부족으로 처리 불가능한 backlog를 무한 drain하지 않는다.
- 실제 원가·매출·ROI는 MVP에 넣지 않는다.

### 2.8 재사용 / 신규 DES

P-Core, P-UI의 비교·차트·Summary, P-Scene/F-Scene의 박스·차량 표현을 재사용한다. **신규**는 InventoryLedger, s,Q trigger, quantity Shipment, onOrder/available/reserved 분리, 주문 할당/backlog/lost-demand, 출발 cutoff이다. 펌프 routing을 재고 정책으로 이름만 바꾸지 않는다.

### 2.9 평가

난이도 **3/5**, 임팩트 **4/5**, 우선순위 **4/5**. 초·분 단위 설비 문제에서 일 단위 서비스·재고 문제로 확장한다. 전체 **5번째**, 신규 중 3번째로 권장한다.


## 3. Urban Traffic — 두 신호교차로의 차량 대기와 연동

### 3.1 구체적 데모 제목과 배포 위치

**Two-Junction Urban Signal Coordination Simulation**  
한국어: **도심 2개 교차로 신호연동·대기행렬 시뮬레이션**

- 소스 후보: `demos/traffic-signal-corridor/`
- URL: `/demo/traffic/signal-corridor/`
- Hub 앵커: `#transportation-systems` · 현재 PLANNED
- 간선 2개 교차로, 교차로 사이 유한 link, 각 교차로의 교차 방향 수요를 가진 축소 도로망이다.

### 3.2 고객의 의사결정 질문

1. 같은 신호 주기에서 간선/교차 방향 green split을 바꾸면 전체 지연과 방향별 불균형은 어떻게 달라지는가?
2. 두 교차로의 offset을 맞추면 정차 횟수와 통과시간이 줄어드는가?
3. 다음 교차로의 짧은 저장공간이 꽉 차면 앞 교차로의 green 시간을 늘려도 처리량이 늘어나는가?

### 3.3 시뮬레이션 범위

| 구분 | MVP 모델 |
| --- | --- |
| Entity | 동일한 점유 길이를 가진 개별 차량. 보행자·버스·차로변경·회전 차량은 제외 |
| Arrival / Demand | 60분 동안 방향별 seed 도착; peak는 같은 입력 구조의 수요 배율로 표현 |
| Queue / Buffer | 접근로별 유한 FIFO, 교차로 사이 link의 차량 수 한도. 외부 접근로가 차면 진입 보류 차량을 따로 집계 |
| Resource | 차로의 방출 service token과 충돌구역. 간선/교차 방향 2개 phase가 service 가능 시간을 제한 |
| Process | stop-line 진입 → 적색/대기 → 녹색일 때 headway마다 출발 → 충돌구역 통과 → 다음 link 진입 |
| Transport | 고정 자유주행시간을 갖는 link 이동. 차량은 링크를 실제 벗어날 때 점유 해제 |
| Completion | 마지막 modeled exit를 차량 후미가 통과했을 때 완료. 화면 밖으로 감췄다고 완료하지 않음 |
| 제약·병목 | red에서는 신규 방출 금지, clearance 동안 새 진입 금지, downstream 저장공간 없으면 green에도 방출 차단(spillback) |

MVP는 **고정 2-phase·직진만**이다. phase 변경과 discharge 사건으로 계산하는 queue/link DES이며 연속 car-following 모델이 아니다. 도로 밖 보류량도 수요 보존식에 포함하되 modeled link WIP와 분리한다. green 시작 시 동시에 모든 차가 출발하지 않고 고정 headway를 사용한다. 안전 관련 실제 신호 운용값을 추천하는 도구는 아니다.

### 3.4 변경 파라미터

간선 수요, 교차 방향 수요, cycle, 간선 green 비율, 두 번째 교차로 offset, link 저장대수, 자유주행시간, 방출 headway. 모든 시간값은 설명용 입력으로 표시한다. phase clearance는 고정 예시값으로 별도 표시하고 실도로 적용을 금지한다.

프리셋: Baseline / Peak Demand / Coordinated Offset / Short Downstream Link. offset은 기본 자유주행시간에 맞춘 고정 비교안이며 최적화 결과라고 부르지 않는다.

### 3.5 KPI·차트·병목 지표

- 통과 대수/시간, 평균 지체 = 통행시간 − 해당 경로 자유주행시간, 차량별 정차 횟수.
- 방향별 평균/최대 queue, spillback 시간, 외부 진입 보류·기간말 미완료 차량.
- 차트 2개: 방향별 대기행렬 / 시간대별 방출량·신호 phase band.
- 최근 5분 green 기회 중 실제 discharge, 적색 대기와 downstream-blocked 시간을 분리한다. 적색을 설비 고장이나 작업자 유휴로 집계하지 않는다.
- 테스트: red/clearance 진입 없음, link capacity·차량 보존, offset 효과가 있는 수요 조건, 짧은 downstream link의 spillback. 과포화에서는 offset만으로 전체 지연이 해결되지 않는 사례.

### 3.6 3D Scene

도로·2개 교차로·신호등·stop line·실제 차간 순서를 보여준다. 차량은 queue 위치에 정렬하고 green/headway 사건에 맞춰 이동한다. link occupancy와 차단된 교차로를 overlay로 표시한다. 초록 신호인데 움직이지 않는 이유를 “downstream full”로 설명한다. 보행자 횡단보도는 MVP에서 제거해 미모델링 신호 참여자를 오해시키지 않는다.

### 3.7 MVP와 2차

- **MVP 2일:** 2교차로·직진·동일 차량·고정 phase·유한 link. 1일차 신호 gate/점유/보존, 2일차 scene·차트·입력·QA.
- **2차:** 회전·보행·버스, incident·차로 폐쇄, 다교차로, 수요별 신호 탐색, 연속 추종·차로변경, calibrated traffic model, 브라우저 내 예측.
- 실제 신호제어기 연결, 실도로 안전 검증은 본 포트폴리오 MVP와 별도 프로젝트다. P95와 multi-seed 통계도 2차다.

### 3.8 재사용 / 신규 DES

P-Core, P-UI, P-Scene의 camera/선택/cleanup, F-Flow의 순수 경로 보간과 Tests를 재사용한다. **신규**는 Vehicle, finite Link/Approach, PhaseSchedule, discharge headway, clearance/conflict gate, downstream admission, 교통 지연 분모와 위치 투영이다. Pump station utilization·08:00 clock을 그대로 사용하지 않는다.

### 3.9 평가

난이도 **3/5**, 임팩트 **5/5**, 우선순위 **4/5**. 일반 고객이 즉시 이해하고 공장 밖의 동적 네트워크 역량을 보여준다. 다만 signal timing과 finite link 결합 테스트가 필요하므로 전체 **6번째**, 신규 중 4번째다.


## 4. Railway — 통근열차 종착역 회차와 플랫폼 용량

### 4.1 구체적 데모 제목과 배포 위치

**Commuter Rail Terminus Turnback & Platform Capacity Simulation**  
한국어: **통근열차 종착역 회차·플랫폼 용량 시뮬레이션**

- 소스 후보: `demos/railway-terminus-turnback/`
- URL: `/demo/railway/terminus-turnback/`
- Hub 앵커: `#rail` · 현재 PLANNED
- 종착역 1곳, 플랫폼 기본 2개, 진입·출발이 함께 사용하는 throat(역 입구 공유 구간) 1개이다.

### 4.2 고객의 의사결정 질문

1. 열차 도착 간격을 줄이면 어느 시점부터 종착역 회차 지연이 누적되는가?
2. 플랫폼 추가와 회차 작업조 추가 중 어느 쪽이 정시 출발을 개선하는가?
3. 출발·진입이 공유하는 throat의 점유시간이 길면 플랫폼을 늘려도 효과가 제한되는가?

### 4.3 시뮬레이션 범위

| 구분 | MVP 모델 |
| --- | --- |
| Entity | 예정 도착·출발 시각을 가진 동일 길이 통근열차 편성. 승객 개별 행위·차량기지 전 운용은 제외 |
| Arrival / Demand | 4시간의 고정 timetable + seed 도착 지연. 예시 36편, 기본 간격 6분 |
| Queue / Buffer | 역 외부 진입 FIFO 8편, 플랫폼별 1편. 외부 queue 초과 열차는 경계 밖 보류로 별도 계수 |
| Resource | throat 1, 플랫폼 1–3, 회차 작업조 1–3. 플랫폼은 도착부터 출발 clear까지 점유 |
| Process | 진입 대기 → 플랫폼+진입 경로 확보 → 진입 → 회차 service → 출발 대기 → throat 출발 통과 |
| Transport | 고정 진입/출발 이동시간. 열차 후미 clear 사건에서 관련 구간을 해제 |
| Completion | modeled exit의 후미 clear 시 완료. 회차 작업 완료와 실제 출발을 구분 |
| 제약·병목 | throat에서 반대 방향 동시 통과 금지. 플랫폼 없이 진입로만 선점 금지. 작업조 대기·출발 점유가 다음 도착에 지연을 전파 |

MVP의 경로 규칙은 고정이다. 진입 시 throat와 빈 플랫폼을 **원자적으로 확인·배정**한다. 할당 불가능한 진입 요청은 throat를 잡지 않으며, 출발 가능한 열차는 공유 요청 목록의 가장 오래된 실행 가능 요청 순으로 처리한다. 출발 시 throat를 확보하고 후미 clear까지 플랫폼을 유지하는 보수적 점유 가정이다. 실제 연동장치·신호 안전 설계나 제동곡선을 구현했다는 주장은 하지 않는다.

### 4.4 변경 파라미터

열차 수/도착 간격, 도착 지연 배율, 플랫폼 수, 회차 작업조 수, 회차 시간(예시 10분), throat 이동·점유시간, 예정 출발 여유시간, 진입 queue 한도. timetable이 horizon을 넘는 편성은 미도착 계획으로 분리한다.

프리셋: Baseline / Tighter Headway / Add Platform / Add Turnback Crew.

### 4.5 KPI·차트·병목 지표

- 실제 출발 대수, 예정 대비 평균 출발 지연, 정시 출발률(허용 지연은 설명용 기준).
- 플랫폼 대기·회차 작업조 대기·throat 대기를 따로 측정; 플랫폼과 throat 점유율.
- 차트 2개: 예정/실제 출발 시각·지연 / 플랫폼·throat 점유 timeline.
- 최근 30분의 입구 queue, throat 충돌 대기, 플랫폼 체류를 함께 표시한다. 정시율 분모에는 기간 내 출발 예정이었으나 아직 못 나간 열차를 포함한다.
- 테스트: throat 동시 점유 없음, 플랫폼 중복 배정 없음, 진입이 출발을 교착시키지 않음. 플랫폼 부족 조건의 추가 플랫폼 효과, 작업조 부족 조건의 추가 인력 효과, throat 병목의 투자 효과 제한.

### 4.6 3D Scene

설정값과 같은 한 개에서 세 개 플랫폼·대기 열차·단순 분기 선로·입구 신호를 표현한다. 열차 길이와 후미 clear를 시각적으로 일치시키고, reserved/occupied/clear 상태를 구분한다. 열차 선택 시 예정·실제 도착/출발과 지연 사유가 보인다. 전체 노선 지도·실제 역은 사용하지 않는다.

### 4.7 MVP와 2차

- **MVP 2일:** 역 한 곳·고정 throat·동일 편성·FIFO 실행 가능 요청·고정 회차 작업. 1일차 점유/해제/교착 테스트, 2일차 scene·timetable 차트·시나리오·QA.
- **2차:** 단선 구간과 passing loop, 다역·다방향 route, 승객/화물 혼합, dispatch 우선순위, 차량·승무원 순환, 지연 전파 통계, 최적 운행계획.
- MVP에 5개 block·복수 passing loop·동적 경로 예약을 동시에 넣지 않는다. 단순 승강장 장식 위의 펌프 engine 재명명도 하지 않는다.

### 4.8 재사용 / 신규 DES

P-Core, P-UI의 실행·비교·로그, P-Scene, Tests를 재사용한다. **신규**는 TrainTimetable, throat/platform 점유권, atomic admission, rear-clear release, 회차 service와 출발 요청의 결합, 예정 대비 지연 지표다. Fulfillment의 슬롯 합류 예약은 철도 경로 안전 규칙으로 재사용하지 않는다.

### 4.9 평가

난이도 **4/5**, 임팩트 **4/5**, 우선순위 **3/5**. 공유 구간과 시간표의 결합이 차별점이지만 보존식뿐 아니라 충돌·교착 불변조건 검증이 필요하다. 전체 **7번째**, 신규 중 5번째다.


## 5. Construction — 굴삭기·덤프트럭 토공 순환

### 5.1 구체적 데모 제목과 배포 위치

**Earthwork Excavator–Dump Truck Cycle Simulation**  
한국어: **굴삭기·덤프트럭 토공 운반 사이클 시뮬레이션**

- 소스 후보: `demos/construction-earthwork-haul/`
- URL: `/demo/construction/earthwork-haul/`
- Hub 앵커: `#civil-construction` · 현재 PLANNED
- 굴착장 1곳과 반입/성토장 1곳, 고정 왕복로의 토사 운반을 선택한다.

### 5.2 고객의 의사결정 질문

1. 덤프트럭을 몇 대까지 늘릴 때 실제 일일 운반량이 증가하며, 언제부터 굴삭기 앞 대기만 늘어나는가?
2. 굴삭기를 추가하는 것과 운반 왕복시간을 줄이는 것 중 무엇이 생산량을 개선하는가?
3. 하차장이 느리면 상차 능력 증설만으로 목표 토량을 달성할 수 있는가?

### 5.3 시뮬레이션 범위

| 구분 | MVP 모델 |
| --- | --- |
| Entity | 토사 Load/Trip. 덤프트럭은 ID를 유지하며 반복 사용하는 폐쇄형 fleet resource |
| Arrival / Demand | 8시간 근무, 예시 목표 1,200m³. 최초 빈 트럭 투입 후 복귀 트럭이 다음 상차 요청을 발생 |
| Queue / Buffer | 유한 빈차·상차·하차 대기구역. 한도는 fleet보다 작게 설정 가능; 꽉 찬 경우 이전 안전 대기구역에 보류 |
| Resource | 굴삭기 1–2, 덤프트럭 2–6, 하차 bay 1–2. 트럭은 상차부터 빈차 복귀까지 한 cycle 동안 점유 |
| Process | 빈차 배차 → 굴삭기 상차 → 적재 운반 → 하차 대기 → 하차/정리 → 빈차 복귀 |
| Transport | 고정 왕복 경로, loaded/empty 시간이 각각 존재. route choice·도로 위 상호 혼잡은 제외 |
| Completion | 하차 완료 시 Load의 m³만 생산량으로 집계. 트럭의 복귀는 자원 가용화 사건이며 생산량을 다시 더하지 않음 |
| 제약·병목 | 굴삭기·fleet·하차 bay·유한 대기장. 하차 대기 중인 트럭은 새 상차에 사용 불가 |

기계적인 처리 공정이 아니라 **닫힌 fleet의 순환**이 핵심이다. 상차 시작 시 payload = min(truckCapacity, target − delivered − committedInFlight)를 **원자적으로 예약**하고 committedInFlight에 더한다. 그래야 굴삭기 여러 대가 같은 잔여 토량을 중복 적재하지 않는다. 하차 완료 때 예약 물량을 delivered로 이전하며 target = unreleasedRemaining + committedInFlight + delivered를 유지한다.

근무 종료 후 새 상차를 금지하고 이미 시작한 cycle만 완료·복귀시킨다. 빈차·미착수 대기 트럭은 작업 queue에서 해제하여 fleet 수만큼의 주차 capacity로 전환하고, 진행 cycle의 복귀 차량도 주차한다. 종료된 상차 queue가 empty-return drain을 막지 않게 한다. 목표 미달 토량과 근무 후 추가 하차량을 구분한다.

### 5.4 변경 파라미터

목표 토량, 트럭 수, 적재량(예시 10m³), 굴삭기 수, 상차시간(예시 4분), 적재 이동/빈차 복귀(각 예시 7분), 하차시간(예시 2분), 하차 bay 수·대기 capacity. 실제 토질·법정 적재량·도로 속도 기준을 뜻하지 않는다.

프리셋: Baseline / Add Trucks / Add Excavator / Longer Haul.

### 5.5 KPI·차트·병목 지표

- 근무 내 하차 m³, m³/hour, 목표 달성률과 미달 토량, 완료 Load 수.
- 평균 cycle time, 트럭의 상차·적재 이동·하차 대기·빈차 복귀 비중, 굴삭기 idle/working/blocked 시간.
- 차트 2개: 누적 하차 토량/목표 / 장비별 대기·작업 시간.
- 최근 60분 빈차 대기가 길고 굴삭기 가동률이 높으면 상차 병목, 굴삭기 유휴와 이동 중 fleet이 많으면 차량/운반 제약, 하차 대기 집중이면 bay 병목으로 설명한다.
- 테스트: truck ID 단일 소유, 동시 상차의 m³ 원자적 예약·보존, 근무 종료 후 상차 금지 및 주차까지 drain 종료. 부족한 fleet의 추가 효과, 긴 왕복의 처리량 감소, 굴삭기 포화 이후 추가 트럭의 효과 제한.

### 5.6 3D Scene

굴삭기·작은 절토면·덤프트럭·운반로·하차장을 배치한다. 실제 토사 지형 변형 대신 누적 m³에 비례한 단순 토사 더미 높이와 progress overlay를 사용한다. 적재 트럭/빈차, loading/dumping/waiting 상태를 구분하며 왕복 화살표와 대기장 점유를 표시한다.

### 5.7 MVP와 2차

- **MVP 1–1.5일:** 단일 재료·한 왕복로·폐쇄 fleet·근무 cutoff·잔여 토량. 첫날 engine/불변조건, 남은 반일 기본 3D/UI/QA.
- **2차:** 다중 굴착장·토질, 날씨·장비 고장, route congestion, 작업구역 선후행, 일정·원가, 배차 최적화와 생산량 예측.
- 굴삭기 상세 유압/물리·토사 입자·실제 지형 mesh는 MVP에서 제외한다.

### 5.8 재사용 / 신규 DES

P-Core, P-Engine의 상태 시간 적분·유한 queue 패턴, P-UI, P-Scene/F-Scene 차량 표현, F-Flow 순수 경로 보간과 Tests를 재사용한다. **신규**는 closed fleet cycle, Load와 truck 분리, m³ ledger, empty return, shift cutoff 후 park, 목표 토량 종료 조건이다. Fulfillment의 “새 주문마다 새 상자” 모델을 트럭 발생 모델로 사용하지 않는다.

### 5.9 평가

난이도 **2/5**, 임팩트 **4/5**, 우선순위 **5/5**. 기본 도형과 작은 상태 모델로도 직관적인 장비 투자 비교가 가능하다. 전체 **3번째**, 신규 분야 중 첫 번째로 권장한다. 건설 전 공정을 한 번에 구현한다는 뜻은 아니다.


## 6. Nuclear Facility Maintenance — 계획정비 작업패키지 조정

### 6.1 구체적 데모 제목과 배포 위치

**Nuclear Outage Valve & Pump Work-Pack Coordination Simulation**  
한국어: **원전 계획정비 밸브·펌프 작업패키지 조정 시뮬레이션**

- 소스 후보: `demos/nuclear-outage-work-packages/`
- URL: `/demo/nuclear/outage-work-packages/`
- Hub 앵커: `#nuclear` · 현재 PLANNED
- 실제 발전소가 아닌 합성 정비 지원구역의 밸브 점검·보조 펌프 정비 작업을 선택한다.

IAEA SSG-74는 정비 작업계획·통제, 인력, 자재와 작업지시서의 관리 맥락을 다룬다. 이 문서는 그 **높은 수준의 작업 조정 주제만 참고**한다. 아래 공정·수치·우선순위는 가상의 데모 가정이며 해당 지침의 구현·인증을 의미하지 않는다. [IAEA SSG-74: Maintenance, Testing, Surveillance and Inspection in Nuclear Power Plants](https://nucleus.iaea.org/sites/nss-oui/Published%20Collections/m_1e0220c3-ffe5-45e1-b63b-95924b6b900f/m_1e0220c3-ffe5-45e1-b63b-95924b6b900f__2_0.Html)

### 6.2 고객의 의사결정 질문

1. 정비조를 추가할 때 작업 완료가 빨라지는가, 공용 공구나 QA 검사 대기만 늘어나는가?
2. 작업패키지를 일괄 release하는 것과 시간대별로 나누는 것 중 대기와 일정 지연을 줄이는 방식은 무엇인가?
3. 준비 자재의 지연이 전체 일정에 미치는 영향은 무엇이며, 자재 준비와 인력 중 어디가 현재 제약인가?

### 6.3 시뮬레이션 범위

| 구분 | MVP 모델 |
| --- | --- |
| Entity | Valve Inspection / Auxiliary Pump Maintenance의 두 유형 WorkPack. 실제 정비 절차가 아니라 작업량 단위 |
| Arrival / Demand | 예시 24시간 계획창에 24개 작업. release 시각·납기·자재 ready 시각은 합성 입력 |
| Queue / Buffer | 문서 확인 대기, 자재/선행조건 대기, 작업 대기, QA 대기의 유한 capacity. 접수 불가는 원래 계획목록에 보류 |
| Resource | 문서 확인자 1, 정비조 1–3, 작업공간 2, 공용 공구세트 1–2, QA 검사자 1–2 |
| Process | Planned release → 문서 준비 확인 → Kit Ready → 작업 배정 → 정비 → QA → WorkPack Close |
| Transport | 자재 staging에서 작업구역까지 고정 시간. 작업조는 배정 후 이동·작업까지 점유, QA 대기에는 계속 붙잡지 않음 |
| Completion | 합성 작업패키지의 QA 단계 완료·기록 종료. 발전소의 실제 재가동 승인과 다름 |
| 제약·병목 | 자재·선행조건, 정비조/공간/공구 동시 확보, 유한 후속 QA buffer. 완료 후 buffer가 차면 BAS로 실제 보유 자원과 막힌 이유를 명시 |

작업 시작 시 **조건이 충족된 요청 중 FIFO**로 조·공구·공간을 원자적으로 배정한다. 일부 자원을 선점한 채 나머지를 무한 대기시키지 않는다. QA buffer로 인계되면 조·공구·작업공간을 해제한다. 조건 미충족 작업은 가용 작업의 시작을 막지 않는다.

안전한 작업허가·격리 상태는 **전문가가 이미 확정한 외부 입력 조건**으로 가정하며 모델이 판단하지 않는다. 원자로 물리, 방사선/선량, 연료, 운전 설정값, 실제 안전계통·격리·복귀 절차는 모델링하지 않는다. 인력 증설 비교를 위해 필수 안전 확인을 생략하거나 단축하는 조작도 제공하지 않는다.

### 6.4 변경 파라미터

작업 수/유형 믹스, 일괄/간격 release, 정비조 수, 공구 수, 작업공간 수, 합성 작업시간, QA 인원, 자재 준비 지연, 각 대기 capacity. 예시 두 유형 작업시간은 30분/60분이며 산업 기준이 아니다. 문서 확인·QA 시간은 합성 고정값으로 표시하고 “안전검사 단축” 투자 대안으로 제공하지 않는다.

프리셋: Baseline / Staggered Release / Add Maintenance Crew / Delayed Kits.

### 6.5 KPI·차트·병목 지표

- 완료 WorkPack 수/계획 대비 진척, 납기 도래 cohort의 정시 완료율, 미완료·기한 초과 작업.
- 자재 대기·자원 대기·QA 대기 시간, 정비조 effective utilization, 공구/공간 점유율.
- 차트 2개: 계획/실제 누적 완료 / 대기 원인별 시간과 backlog.
- 최근 60분 조건 미충족 대기가 주면 material/prerequisite constraint, 조건 충족 대기와 공구 고점유가 겹치면 tool constraint, QA queue와 상류 BAS가 겹치면 QA constraint로 설명한다.
- 검증: prerequisite 전 작업 금지, 동시 자원 capacity, 자재 ready 지연의 영향, 공구 포화 시 조 추가 효과 제한. 계획창 종료 시 미완료 이유를 반드시 보고한다.

### 6.6 3D Scene

일반화한 정비 홀, 밸브 모형·보조 펌프, 자재 staging, 공구 cart, 작업구역 2개, QA 테이블을 보여준다. WorkPack 표식이 준비→대기→작업→QA→완료로 이동한다. 공구 점유·자재 미도착은 별도 아이콘으로 표현한다. 실제 발전소 평면·보안 설비·계통도를 재현하지 않는다.

### 6.7 MVP와 2차

- **MVP 1.5–2일:** 두 작업 유형, 고정 선행 단계, 자재 ready 이벤트, 단일 FIFO 정책, 동시 자원 확보와 QA BAS. engine/대기 원인 검증을 먼저 완료한다.
- **2차:** 전문가 검토를 거친 복수 선후행 작업, 인력 자격·교대, 상세 자재 조달, 일정 리스크 분석. 실제 운영 적용은 별도 현장 데이터·전문가 검증 과제이다.
- 허가 적합성 자동판정, 원전 안전성 평가, 실설비 제어·재가동 판단은 본 포트폴리오 데모 범위가 아니다.

### 6.8 재사용 / 신규 DES

P-Core, P-Engine의 자원 시간 적분·BAS 패턴, P-UI와 WorkOrderInspector의 작업 이력 UI, P-Scene, Tests를 재사용한다. **신규**는 WorkPack prerequisite readiness, 조건 충족 FIFO, 복수 자원 원자적 배정, release/kit/QA 대기 원인 구분과 납기 cohort이다. Pump의 압력시험 불량·repair loop나 작업시간을 원전 정비 사실로 전용하지 않는다.

### 6.9 평가

난이도 **4/5**, 임팩트 **4/5**, 우선순위 **2/5**. 엔진 크기보다 작업 조건·동시 자원과 안전 관련 오해를 막는 설명의 정확도가 어렵다. 전체 **8번째**로 두고 일반 제조·건설·운송에서 검증한 작업/대기 표시를 활용한다. 공개 포트폴리오에서는 설명용 합성 모델임을 명확히 한다.

## 7. Defense Maintenance & Supply Support — 지원차량 정비·부품 보급

### 7.1 구체적 데모 제목과 배포 위치

**Support-Vehicle Maintenance & Spare-Parts Depot Simulation**  
한국어: **지원차량 정비·예비부품 보급센터 시뮬레이션**

- 소스 후보: `demos/defense-vehicle-maintenance/`
- URL: `/demo/defense/vehicle-maintenance/`
- Hub 앵커: `#defense` · 현재 PLANNED
- 무장하지 않은 일반 지원차량의 정비와 부품 공급을 선택한다. 전술·교전·표적·무기 성능을 다루지 않는다.

### 7.2 고객의 의사결정 질문

1. 정비인력과 정비 bay 중 어느 자원을 늘려야 복귀 차량이 증가하는가?
2. 예비부품 재고를 늘리는 것과 보충 lead time을 줄이는 것 중 부품 대기 차량을 줄이는 대안은 무엇인가?
3. 예정 정비와 비예정 수리의 믹스가 대기·차량 서비스 가용률에 어떤 영향을 주는가?

### 7.3 시뮬레이션 범위

| 구분 | MVP 모델 |
| --- | --- |
| Entity | ID가 있는 지원차량 20대와 MaintenanceJob. 차량당 평가 기간 중 요청 최대 1건 |
| Arrival / Demand | 예시 5일의 합성 예정 정비/비예정 수리 요청 시각. 군 부대 실제 운용 일정과 무관 |
| Queue / Buffer | 접수/진단, 부품 대기 주차, 정비, 최종 검사 대기 유한 capacity. 넘친 요청은 외부 접수 보류로 표시 |
| Resource | 진단자 1, 정비 bay 1–3, 정비사 1–3, 부품 담당자 1, 최종 검사자 1 |
| Process | 정비 요청 → 진단 → 필요 부품 확보 → 정비 배정 → 정비 → 최종 검사 → 차량 복귀 |
| Transport | 부품창고→작업장 공급과 차량 구역 이동에 고정 시간. 별도 운반 자원 경쟁·경로계획 없음 |
| Completion | Job 종료와 동일 차량의 서비스 가능 상태 복귀. 새 차량을 생성하지 않음 |
| 제약·병목 | 두 부품 SKU의 재고/보충, 유한 대기 주차, 정비사+bay 동시 확보, 후속 검사 queue의 BAS |

예정 정비는 필터 kit, 비예정 수리는 배터리 kit를 요구하는 **가상의 단순 대응**으로 정한다. 부품 미확보 차량은 주차 구역에서 대기하며 정비 bay와 정비사를 선점하지 않는다. 부품 예약과 bay+정비사 확보는 실행 가능한 요청 중 FIFO 한 정책만 사용한다. 재고 예약·사용·보충을 분리하여 음수 재고·중복 할당을 방지한다.

각 SKU는 고정 lead time의 단순 재주문점/수량 정책만 쓴다. 미래 고장 예측·정비 진단·실제 차량 부품 BOM은 없다. Vehicle unavailable은 정비 요청 시점부터 복귀까지로 가정하고, 접수 보류도 unavailable 기간에서 누락하지 않는다.

### 7.4 변경 파라미터

예정/비예정 요청 믹스, 정비사 수, bay 수, 검사자 수, 두 유형 합성 작업시간, 초기 부품 재고, 재주문점/보충량, 보충 lead time, 대기 주차 capacity. 파라미터는 실제 군 장비 성능값이 아니며 공개 합성 예제로 고정한다.

프리셋: Baseline / Parts Shortage / Add Mechanics / Faster Replenishment.

### 7.5 KPI·차트·병목 지표

- 복귀 차량 수, 평균 turnaround와 미완료 작업 age, 납기 도래 cohort 기준 정시 복귀율.
- **서비스 가용률** = 평가 기간 서비스 가능 차량 수의 시간 적분 ÷ (fleet 수 × 기간). 전투 준비태세나 임무 성공률로 부르지 않는다.
- 부품 부족 대기, 정비사/bay/검사 점유, 접수 보류·기간말 backlog.
- 차트 2개: 서비스 가능/정비 중 차량 수 / 부품 재고·부품 대기 작업 추이.
- 최근 1일 부품 미확보가 주면 supply constraint, 부품 확보된 작업 대기와 bay/인력 고점유가 겹치면 workshop constraint, 검사 대기·상류 BAS면 inspection constraint.
- 검증: 차량 상태 보존과 중복 요청 금지, SKU 수량 보존, 부품 미확보 시 bay 미점유, 공급 lead time 효과, 부품 부족 중 인력 추가 효과 제한.

### 7.6 3D Scene

일반 지원 트럭/밴, 입고 주차, 부품 선반, 진단 위치, 정비 bay, 검사·복귀 구역을 구성한다. 부품 상자 이동과 차량 available / waiting for parts / servicing / inspection 상태를 표시한다. 실부대 배치·실제 위치·무장·전술 지도를 포함하지 않는다.

### 7.7 MVP와 2차

- **MVP 1.5–2일:** fleet 20대·차량별 단일 요청, 두 작업 유형/두 SKU, 단일 depot, 고정 공급, 하나의 FIFO 정책. 앞선 Supply Chain의 재고 ledger 검증 경험을 활용한다.
- **2차:** 반복 예방정비·수명 고장, 수리 가능한 교환품, 다단계 보급, 정비 교대·자격, 부품 수요 예측과 비전술적 정비계획 비교.
- 실제 군 장비 기술 정비 절차·무기 개량·작전 배차·보급로 전술 최적화는 범위 밖이다.

### 7.8 재사용 / 신규 DES

P-Core, P-Engine의 유한 queue/자원 적분, P-UI, F-Scene 차량/부품 형상, P-Scene 카메라·선택, Tests를 재사용한다. 앞선 Supply Chain의 available/reserved/on-order ledger는 새 앱의 두 SKU 입력에 맞춰 **검증 후** 재사용한다. **신규**는 차량 가용/불가 시간 적분, 부품 준비 기반 job eligibility, bay+정비사 동시 확보, SKU 예약 소비와 차량 복귀의 연결이다. Fulfillment의 truck shipping 완료량을 fleet 가용률로 바꾸어 표기하는 방식은 금지한다.

### 7.9 평가

난이도 **3/5**, 임팩트 **4/5**, 우선순위 **2/5**. 재고와 정비의 상호 작용을 보여줄 가치가 있으나 재고·작업·차량 ledger 세 개를 맞춰야 한다. 전체 **9번째**로 배치해 Supply Chain과 원전의 비안전핵심 작업 조정 패턴이 검증된 뒤 제작한다.

## A. 권장 제작 순서

점수는 1–5점이다. **난이도 5 = 가장 어려움, 임팩트 5 = 가장 큼, 우선순위 5 = 가장 먼저 고려**이다. 점수와 실제 제작 순번은 다르다. 동점은 선행 모델에서 얻을 재사용 경험과 모델 검증 부담으로 정렬했다. 점수는 기획 판단이며 시장 조사 결과가 아니다.

| 제작 순서 | 모델 | 난이도 | 임팩트 | 우선순위 | 순서의 이유 |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | Fulfillment Automation | 기준 모델 | 기준 모델 | 유지 | 현재 LIVE 구현. 컨베이어·작업자·출고·브랜드/배포 기준을 보존 |
| 2 | Pump Assembly & Test | 기준 모델 | 기준 모델 | 유지 | 현재 LIVE 구현. event calendar·불량/재작업·KPI 테스트의 다음 기준 |
| 3 | Construction: Excavator–Dump Truck | 2 | 4 | 5 | 단순 폐쇄 운반 사이클로 다른 산업의 설비 투자 효과를 빠르게 증명 |
| 4 | Port: Quay-to-Gate | 3 | 5 | 5 | 운반 fleet 경험을 재사용하고 crane/yard/gate 결합 병목으로 확장 |
| 5 | Supply Chain: Inventory Replenishment | 3 | 4 | 4 | 공정 처리량에서 재고·납기로 의사결정 범위를 넓힘 |
| 6 | Urban Traffic: Two-Junction Corridor | 3 | 5 | 4 | 신호·spillback이라는 새로운 제어 문제를 시각적으로 제시 |
| 7 | Railway: Terminus Turnback | 4 | 4 | 3 | timetable·공유 구간의 원자적 점유와 지연 KPI 검증이 필요 |
| 8 | Nuclear: Outage Work-Pack Coordination | 4 | 4 | 2 | 조건부 작업 배정과 안전 관련 설명의 정확성이 중요 |
| 9 | Defense: Vehicle Maintenance & Supply | 3 | 4 | 2 | 재고 ledger·정비 배정·fleet 가용률을 결합; 선행 경험 활용 |

첫 확장 릴리스는 **Construction 하나**로 제한한다. 이후 Port → Supply Chain까지 확보하면 물류·제조·건설·항만·공급망 다섯 사례가 생긴다. 교통·철도는 별도의 신호/점유 엔진 검증이 필요한 두 번째 묶음, 원전·국방 정비는 전문 용어와 모델 한계를 검토하는 마지막 묶음으로 둔다.

1–2일은 각 MVP의 범위를 잘랐을 때의 추정이다. 7개를 병렬로 복사하여 동일 engine에 이름만 바꾸지 않는다. 각 모델의 검증 게이트가 끝난 뒤 다음 모델을 시작하고, 실제 고객 요구로 상세 공정이 늘어나면 별도 범위·일정을 승인받는다.

## B. Demo Hub 카드 문구

영문 제목을 프로젝트명으로 사용하고 설명·질문은 기존 Hub 언어 전환 방식으로 한국어/영문을 제공한다. 각 카드의 primary KPI는 실제 엔진의 집계값과 같아야 한다. 아래는 **문구 제안**이며 이번 문서 작성으로 카드나 링크 상태를 바꾸지 않는다.

| Project title | One-line description · KO / EN | Primary KPI / Decision question · KO / EN | 상태 · 앵커 |
| --- | --- | --- | --- |
| Fulfillment Automation Simulation | 주문부터 피킹·컨베이어·출고까지 물류 흐름과 병목을 비교합니다.<br>Explore bottlenecks from order release through picking, conveying and shipping. | 시간당 출고량 · 피킹 처리능력과 컨베이어 중 현재 제약은?<br>Shipments/hour · Is picking capacity or conveyor flow limiting output? | LIVE · `#fulfillment` |
| Industrial Pump Assembly & Test Line Simulation | 두 펌프 제품의 가공·조립·시험과 재작업을 비교합니다.<br>Compare machining, assembly, testing and rework for two pump variants. | 양품 완료량 · 시험기 추가가 실제 생산량을 늘릴까요?<br>Good units completed · Will another test station increase output? | LIVE · `#manufacturing` |
| Compact Container Terminal: Quay-to-Gate Simulation | 선박 하역부터 야드·게이트까지 컨테이너 흐름을 확인합니다.<br>Follow import containers from vessel unloading through the yard to the gate. | 게이트 반출량 · 크레인, 트랙터, 야드 중 어디를 늘릴까요?<br>Gate-out volume · Should you add crane, tractor or yard capacity? | PLANNED · `#ports` |
| Air Purifier Distribution & Replenishment Simulation | 공기청정기 DC의 재고보충과 고객 배송 지연을 비교합니다.<br>Balance air-purifier inventory replenishment against customer delivery delays. | 정시 배송률 · 재주문점을 높이면 품절과 재고가 어떻게 달라질까요?<br>On-time delivery · How does a higher reorder point change shortages and stock? | PLANNED · `#supply-chain` |
| Two-Junction Urban Signal Coordination Simulation | 두 교차로의 신호와 유한 도로 저장공간이 대기에 미치는 영향을 봅니다.<br>See how signal coordination and limited road storage affect traffic queues. | 평균 지체 · 신호 offset을 맞추면 정체가 줄어들까요?<br>Mean delay · Will coordinating signal offsets reduce queues? | PLANNED · `#transportation-systems` |
| Commuter Rail Terminus Turnback & Platform Capacity Simulation | 종착역의 플랫폼·회차 인력·진출입 구간이 출발 지연에 미치는 영향을 비교합니다.<br>Compare departure delays caused by platforms, turnback crews and a shared station throat. | 정시 출발률 · 플랫폼 추가와 회차 인력 증원 중 무엇이 효과적일까요?<br>On-time departures · Would an extra platform or turnback crew help more? | PLANNED · `#rail` |
| Earthwork Excavator–Dump Truck Cycle Simulation | 굴삭기·덤프트럭·하차장의 순환 운반량을 비교합니다.<br>Compare earthmoving output across excavators, dump trucks and unloading bays. | 근무 내 하차 m³ · 트럭을 늘리면 운반량도 늘어날까요?<br>Shift-delivered m³ · Will more trucks move more earth? | PLANNED · `#civil-construction` |
| Nuclear Outage Valve & Pump Work-Pack Coordination Simulation | 합성 정비 작업의 인력·자재·공구·QA 대기를 비교합니다.<br>Explore crew, material, tool and QA constraints in illustrative maintenance work packs. | 정시 작업 완료율 · 인력과 공구 중 무엇이 작업 일정을 막고 있나요?<br>On-time work-pack completion · Are crews or shared tools delaying work? | PLANNED · `#nuclear` |
| Support-Vehicle Maintenance & Spare-Parts Depot Simulation | 일반 지원차량의 정비와 예비부품 대기가 복귀에 미치는 영향을 확인합니다.<br>Explore how workshop capacity and spare-parts delays affect support-vehicle returns. | 서비스 가용률 · 정비사 증원과 부품 확보 중 무엇이 효과적일까요?<br>Service availability · Would more mechanics or better parts availability help more? | PLANNED · `#defense` |

- LIVE 버튼: **데모 실행 / Open interactive demo**. Fulfillment/Pump의 기존 고객 URL은 유지한다.
- PLANNED 버튼 대신: **준비 중 / In development**. 아직 존재하지 않는 URL로 이동하는 활성 실행 링크를 만들지 않는다. 상단 산업 메뉴는 현재처럼 Hub의 모델 설명 앵커로 이동한다.
- 원전·국방 카드에는 “합성 입력 기반 운영 설명용 모델 / Illustrative operations model with synthetic inputs”를 보조 문구로 병기한다.
- 공개 카드에서 실제 검증하지 않은 최적화·실시간 데이터 연계·AI 추천·현장 인증을 주장하지 않는다.

## C. 공통 플랫폼 개선 제안

### C.1 세 번째 데모 전에 정리할 것 — 최대 반일, 별도 승인 후

| 최소 공통 항목 | 제안 | 기존 코드 보호 방식 |
| --- | --- | --- |
| 실행·snapshot 계약 | model ID, schemaVersion, seed, validated parameters, simulatedTime, run status, KPI, events, render entities를 문서화. UI action은 start/pause/reset/finish/apply로 제한 | 기존 두 엔진 API를 강제 변경하지 않고 신규 앱 adapter에서 맞춤 |
| 결정론·검증 체크리스트 | 안정적 event tie-break, RNG stream/key, 보존식, capacity, horizon/drain, KPI 분모·window를 템플릿화 | P-Core의 작은 유틸리티를 검토 후 신규 앱에 복사; 기존 engine migration 금지 |
| 브랜드/화면 틀 | DAS Lab 로고·컬러·폰트, header/controls/KPI/chart/log/Summary, responsive layout·camera fit·loading/error 상태 | Pump의 작은 UI를 기반으로 신규 template 작성. 기존 Fulfillment의 CSS/Tailwind 전면 통합 금지 |
| 기본 테스트 scaffold | seed/배속 독립성, pause/reset/apply, queue conservation, 2개 방향성+1개 효과 제한, base asset/browser smoke | 새 모델 expectation만 추가. 기존 테스트 fixture·기대값을 새 모델 때문에 변경하지 않음 |
| 시간·단위 표현 | minutes/hours/days, units/m³/vehicles 등 formatter와 label 계약 | Pump의 08:00 시작 clock을 공통 엔진 규칙으로 만들지 않음 |

처음에는 **문서화한 계약 + 복사 가능한 작은 template**면 충분하다. 첫 3개 모델에서 실제로 동일한 코드가 확인될 때 별도 공용 package 후보를 좁힌다. 지금 공용 engine 패키지를 먼저 만들 필요는 없다. 향후 `packages/*`를 추가할 때만 `pnpm-workspace.yaml`의 현재 `demos/*` glob을 명시적으로 확장하고 두 기존 앱 회귀 검증을 선행한다.

### C.2 너무 일찍 공통화하지 말 것

- 범용 “모든 산업의 Queue/Resource/Station” 클래스: 재고 예약, 신호 gate, 철도 throat, 원전 작업조건은 같은 서비스 대기가 아니다.
- 단일 대형 engine, 전역 mutable state/RNG, 형제 데모 내부 import, 하나의 모든 모델용 parameters form.
- Fulfillment slot/merge 예약을 모든 교통수단의 통행 규칙으로 사용하는 추상화.
- 일괄 bottleneck 가중치/한 가지 utilization 분모: 신호 red, platform 점유, 부품 부족, 생산설비 downtime은 의미가 다르다.
- 공용 3D scene graph 안의 모든 도메인 설비와 대용량 asset, 중복을 없애기 위한 복잡한 renderer framework.
- 범용 AI optimizer, multi-agent dispatch, 학습 시스템, 20-seed 통계 플랫폼. 우선 수작업 비교 프리셋과 설명 가능한 KPI를 완성한다.
- 모든 데모의 dependency 버전을 한꺼번에 변경하는 정리 작업. 새 모델에 필요한 최소 dependencies만 추가한다.

### C.3 manifest와 build의 개선 방향

**현재 유지할 기준:** `scripts/demo-manifest.mjs`의 `id/source/base`와 조립기의 경로 검증, 루트 단일 `dist/`, 기존 두 고객 URL이다.

현재 manifest는 등록된 모든 항목의 app build 산출물이 있다고 가정한다. 따라서 **7개 PLANNED 모델을 지금 build manifest에 추가하면 안 된다.** 실행 가능한 앱·tests·Vite base가 준비될 때 해당 LIVE 항목을 하나씩 등록한다.

승인 후 단계적 개선:

1. Hub용 catalog에는 `id, domain, anchor, title/description/question(ko/en), status`를 둔다. build 대상 manifest는 검증된 LIVE 앱만 가진다. 둘을 통합한다면 PLANNED의 source/base 부재를 허용하고 **build/assemble/verify가 동일 LIVE 집합을 사용**하도록 함께 설계한다.
2. 현재 workspace glob build는 미등록 실험 앱도 빌드할 수 있는 반면 assembler는 manifest만 읽는다. 모델 수가 늘면 manifest 기반 build/test runner로 대상 집합을 일치시키거나, workspace와 manifest 불일치 검사를 추가한다.
3. 중복 id, source 폴더, base URL, Hub 앵커와 활성 링크를 검사한다. `source`는 저장소 안 앱만 허용하고 `base`는 선행·후행 slash 및 경로 이탈/겹침을 기존 수준 이상으로 검증한다.
4. 앱별 Vite `base`와 manifest `base`의 불일치를 CI/로컬 검사에서 실패 처리한다. manifest를 import할 경우 타입/실행 환경 차이를 해결하고 검증 없는 문자열 중복을 줄인다.
5. 각 앱은 자기 `dist/`를 생성하고 assembler가 `dist/demo/<domain>/<model>/`에 복사한다. 루트 build는 홈페이지와 LIVE 앱을 한 산출물로 조립한다. `dist/`를 소스 프로젝트로 취급하지 않는다.
6. 기존 HTML asset 검증에 더해 실제 브라우저에서 JS dynamic import·CSS url·모델/texture/font 로딩, base 직접 접속·새로고침, Console/404를 확인한다. 빌드 통과를 화면 실행 성공과 동일시하지 않는다.
7. 3D/차트는 필요한 경우 앱 내부 lazy chunk로 분리하고 bounded log/chart history, scene dispose, hidden-tab update 감소를 적용한다. engine 테스트의 재현성과 logical time은 화면 FPS에 묶지 않는다.

**URL/asset 공통 원칙:** 신규 7개 앱의 `base`는 각 도메인 1번에 명시한 경로로 고정한다. src asset은 Vite import를 우선하고, public asset은 `import.meta.env.BASE_URL`과 조합한다. 절대 `/assets/...`나 `/favicon...`를 새 앱에서 하드코딩하지 않는다. 내부 모델 선택은 SPA root 또는 hash 상태로 한정해 서버 rewrite에 의존하지 않는다. `demo.html#<anchor>`는 Hub 링크이며 앱 경로와 다르다.

### C.4 향후 구현 때의 로컬 명령·승인 범위

기존 `pnpm dev:home`, `pnpm dev:demo`, `pnpm dev:pump`, `pnpm build`, `pnpm preview`, `pnpm check`는 유지한다. 신규 앱 개발은 우선 `pnpm --dir demos/<app-folder> dev`로 수행하고 포트 충돌을 피하도록 각 앱의 strictPort를 정한다. 편의용 root alias는 실제 모델 구현 승인 시만 추가한다.

승인된 모델마다 독립 test/build → 기존 두 데모 test → 루트 `pnpm check` → `pnpm preview`의 해당 base URL 직접 접속·새로고침으로 검증한다. 실제 배포/푸시는 별도 사용자 권한이다. 기존 원본 `E:/이현호/daslab/das-fulfillment`와 현재 다른 원본 작업 폴더는 읽기 전용으로 유지한다.

**이번 작업의 변경 대상은 이 문서 하나다.** 위 catalog/template/runner/검증 확장은 제안이며 아직 구현하지 않는다.

## D. 도메인별 구현 착수용 프롬프트 초안

다음 프롬프트는 **설계 검토부터 시작하는 별도 요청**이다. 문서의 제안만으로 코드 변경이 승인되는 것은 아니다. 공통적으로 현재 `demo.html`, package/workspace, manifest/build/verify, 기존 Fulfillment/Pump의 변경 상태를 먼저 읽고 사용자 수정사항을 보존한다. 원본 시뮬레이터는 읽기 전용이며 새 ZIP·프로젝트 교체·push·실제 배포는 하지 않는다.

### D.1 Port Terminal

> DAS Lab의 다음 독립 React + Vite 정적 데모인 “Compact Container Terminal: Quay-to-Gate Simulation”의 구현 설계를 먼저 제시해줘. docs/demo-roadmap.md의 Port 범위를 기준으로 1개 berth·선박 1회 방문, 수입 컨테이너, quay crane, 순환 tractor, 유한 yard와 gate를 모델링한다. Arrival → Queue → Resource → Process → Transport → Completion을 실제 DES로 만들되 선박 출항과 gate-out을 별도 완료 기준으로 정의하고, yard crane putaway/retrieval 경쟁과 tractor empty return을 포함해라. QC→유한 안벽 buffer→트랙터 FIFO 인수를 사용하며 QC와 트랙터의 직접 동시 확보 정책은 제외한다. 고정 운반시간·FIFO만 사용하고 다선박/외항 대기·적층 재취급·수출·다중 선석·최적화는 제외한다. 목표 폴더는 demos/ports-quay-to-gate/, base는 /demo/ports/quay-to-gate/이다. 결정론·수량/점유 보존·BAS·crane와tractor 투자 효과를 engine 테스트로 먼저 검증한 뒤 3D/KPI/차트/로그/Summary를 연결하는 2일 MVP 계획을 작성해라. 기존 소스 재사용 범위, 신규 상태/events, 파라미터, KPI 분모, 정확한 수정 파일 목록을 먼저 보고해라. **내가 설계를 명시적으로 승인하기 전에는 파일 수정·새 앱 생성·코딩을 하지 마라.** 승인 후에도 기존 Fulfillment/Pump와 홈페이지의 사용자 수정사항을 보존하고 로컬 회귀검증만 하며 push/배포는 하지 마라.

### D.2 Supply Chain

> “Air Purifier Distribution & Replenishment Simulation”의 2일 MVP 설계를 먼저 작성해줘. 공급자 1곳, 공기청정기 단일 SKU의 DC 1곳, 고객 수요 2지역을 선택하고 28일 동안 고객 주문·재고 보충·DC 작업·고정 배송을 DES로 모델링해라. 매장별 재고·다중 SKU·복수 정책·예측/최적화는 제외하고 단일 (s,Q) 정책, 유한 재고/백로그, available/reserved/on-order 분리, 배송 완료 기준, 기간 종료 미완료 주문과 lost demand를 명확히 해라. 폴더 demos/supply-chain-inventory-replenishment/, base /demo/supply-chain/inventory-replenishment/를 사용한다. 동일 seed와 SKU 보존, 중복 발주 금지, lead time/재주문점 변화와 정시배송·재고의 관계를 3D 전에 테스트하는 계획을 제시해라. 신규 엔진과 기존 UI 재사용, KPI cohort/기간 분모, Hub/manifest/build 변경 후보를 먼저 보고해라. **설계 승인 전에는 코드나 파일을 수정하거나 새 프로젝트를 만들지 마라.** 승인 이후에도 기존 두 데모와 홈페이지를 덮어쓰지 않고 기존 테스트/루트 build/preview를 검증하며 Git push·배포는 하지 마라.

### D.3 Urban Traffic

> “Two-Junction Urban Signal Coordination Simulation”을 docs/demo-roadmap.md 기준으로 설계해줘. 두 교차로, 직진 차량만, 2-phase 신호, 유한 접근로/연결 link, 고정 free-flow transport, headway 기반 출발과 spillback을 갖는 2일 DES MVP로 제한한다. 회전·보행자·차로변경·미시 추종·adaptive AI는 제외한다. green split/offset/downstream capacity의 효과를 사용자가 비교하도록 하고 외부 진입 보류 차량을 KPI에서 숨기지 마라. 폴더 demos/traffic-signal-corridor/, base /demo/traffic/signal-corridor/이다. 신호 충돌 금지·link occupancy·vehicle conservation·seed/배속 독립성을 먼저 검증하고 green opportunity와 red delay를 구분하는 지표, 2개 차트, 기본 3D와 이벤트 로그를 계획해라. 실제 도로 신호 안전 기준을 제시하는 모델이 아님을 명시해라. **내 설계 승인 전에는 파일 수정·코딩·앱 생성을 하지 말고 상태/events와 수정 대상 파일부터 보고해라.** 기존 Fulfillment/Pump·홈페이지는 보존하고 승인 후 로컬 회귀검증만 하며 push/실제 배포는 금지한다.

### D.4 Railway

> “Commuter Rail Terminus Turnback & Platform Capacity Simulation”의 구현 설계부터 작성해줘. 하나의 종착역, 동일 유형 열차, 유한 도착 대기, 공유 진출입 throat 1개, 플랫폼·회차조, timetable과 fixed travel/clearance로 제한한다. 다중 역·본선 경로탐색·단선 교행·실제 interlocking 인증은 제외한다. platform과 throat 원자적 확보, 후미 통과 후 해제, 가능한 요청 중 FIFO, 회차 후 진출 요청이 진입 대기 때문에 교착되지 않도록 하는 규칙을 명시해라. demos/railway-terminus-turnback/와 /demo/railway/terminus-turnback/를 사용한다. 2일 MVP 안에서 occupancy/교착/seed/정시율 due cohort 테스트를 먼저 만들고 platform vs crew 투자 비교를 KPI·운행 timeline·3D로 표시할 계획을 보고해라. **설계에 대한 내 명시적 승인 전에는 어떤 파일도 수정하거나 새 앱을 만들지 마라.** 승인 후에도 기존 소스 수정사항을 보존하고 두 데모 및 홈페이지 build/preview 회귀를 확인하며 push/배포하지 마라.

### D.5 Construction

> DAS Lab의 세 번째 데모로 “Earthwork Excavator–Dump Truck Cycle Simulation”의 설계를 먼저 작성해줘. docs/demo-roadmap.md의 Construction 범위를 따라 굴착장 1곳, 하차장 1곳, 고정 왕복로, 유한 대기장, excavator/truck/unloading bay capacity와 폐쇄형 truck fleet을 갖는 1–1.5일 MVP로 한정한다. Load와 truck을 분리하고 적재/빈차 이동시간, 하차 시 m³ completion, 마지막 잔여 적재량, 근무 종료 신규 상차 금지 및 진행 cycle drain을 정의해라. 폴더 demos/construction-earthwork-haul/, base /demo/construction/earthwork-haul/이다. truck ID/m³ 보존과 fleet·굴삭기·왕복시간의 KPI 방향을 3D 전에 테스트하고 Add Trucks/Add Excavator/Longer Haul, KPI·2개 차트·Event Log·Summary로 연결할 계획을 제시해라. 물리 토사·다중 현장·route congestion·배차 optimizer는 제외한다. **내가 설계를 승인하기 전에는 새 프로젝트 생성이나 파일 수정·코딩을 하지 마라.** 기존 manifest/build의 안전한 확장 및 정확한 수정 파일을 먼저 보고하고, 승인 후에도 기존 두 앱·홈페이지 사용자 수정사항 보존과 회귀 검증을 수행하되 push/배포는 하지 마라.

### D.6 Nuclear Facility Maintenance

> “Nuclear Outage Valve & Pump Work-Pack Coordination Simulation”의 1.5–2일 MVP 설계부터 제시해줘. 합성 밸브 점검/보조 펌프 작업패키지, 계획 release, 이미 승인된 prerequisite 입력, kit readiness, 정비조·공용 공구·작업공간 동시 확보, 유한 QA queue와 완료를 다뤄라. 원전 운전·원자로 물리·방사선·연료·격리/재가동 판단·안전 허가 자동화는 모델 범위가 아니며 실제 안전 기준을 구현하거나 인증했다고 주장하지 마라. demos/nuclear-outage-work-packages/ 및 /demo/nuclear/outage-work-packages/로 설계한다. 한 가지 eligible FIFO, 고정 transport, finite capacity/BAS와 자재 대기 원인만 포함하고 복잡한 선후행·자격·최적화는 2차로 분리해라. prerequisite 전 작업 금지·자원 점유·납기 cohort·공구 포화 시 인력 추가 효과 제한을 먼저 검증한 뒤 UI/3D를 구현하는 계획과 수정 파일 목록을 보고해라. **내 설계 승인 전에는 파일 수정·코딩·새 앱 생성 금지.** 기존 소스를 되돌리지 말고 승인 후에도 로컬 테스트/루트 build/preview 회귀검증만 하며 Git push나 실제 배포는 하지 마라.

### D.7 Defense Maintenance & Supply Support

> “Support-Vehicle Maintenance & Spare-Parts Depot Simulation”의 구현 설계부터 작성해줘. 무장하지 않은 일반 지원차량 20대, 5일, 차량별 정비 요청 최대 1건, 예정 정비/비예정 수리 두 유형, 필터/배터리 kit 두 SKU, 단일 정비센터와 고정 공급 lead time의 1.5–2일 MVP로 제한한다. 진단→부품 준비→bay+정비사→검사→차량 복귀를 유한 queue/resource DES로 표현하고 부품 미확보 차량이 bay/정비사를 선점하지 않게 해라. 신규 앱 demos/defense-vehicle-maintenance/, base /demo/defense/vehicle-maintenance/를 사용한다. 차량 상태·재고 보존, request에서 return까지 unavailable 시간 적분, 부품 부족 시 인력 추가 효과 제한을 먼저 검증해라. 서비스 가용률을 전투 준비태세로 표기하지 말고 실제 군 배치·무기·전술 경로/작전 최적화는 다루지 마라. 3D/KPI/2개 차트/로그/Summary, 기존 재사용 코드와 신규 ledger, 정확한 변경 파일을 포함한 설계를 먼저 보고해라. **설계 승인 전에는 파일 수정·새 앱 생성·코딩을 하지 마라.** 승인 이후에도 기존 데모와 홈페이지 사용자 수정사항을 보존하고 로컬 회귀검증만 하며 push/배포는 금지한다.
