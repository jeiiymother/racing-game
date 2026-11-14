const { loadThree, createOperationLogger } = window.GameModules;
const { AI_ROSTER, AI_SKILLS, assignAISkills } = window.GameModules.ai;
const { aeroPresets, aerodynamics, suspension, tires } = window.GameModules.vehiclePhysics;
const vehicleTransmission = window.GameModules.vehicleTransmission;
const vehicleControls = window.GameModules.vehicleControls;

function initGame(){
document.getElementById('loading').style.display='none';
let R;try{R=new THREE.WebGLRenderer({antialias:true});}catch(e){document.getElementById('em').textContent='No WebGL support';document.getElementById('err').style.display='block';return;}
R.setSize(innerWidth,innerHeight);document.body.appendChild(R.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x9db8c8);scene.fog=new THREE.Fog(0x9db8c8,500,3600);
const cam=new THREE.PerspectiveCamera(78,innerWidth/innerHeight,0.1,8000);

const keys={a:false,d:false,w:false,s:false,t:false,b:false,q:false};
const ms={ld:false,rd:false,lp:null,rp:null,brk:0,thr:0};

const trackCourse=window.GameModules.createTrackCourse(THREE,scene,{
  trackWidth:12,kerbWidth:2.4,runoffWidth:55,carWidth:1.95*1.45,carLength:4.5*1.45
});
const {
  TW,KW,RW,WALLD,CAR_HW,CAR_LEN,CP,curve,NW,wp,WP_SP,scA,scMax,Rad,ins,prox,sNear,
  isOpen,limAt,nearest,trackLength,groundMaterial:gndMat,trackMaterial:trackMat
}=trackCourse;

// ===== SKID MARKS =====
const MAXSEG=2600;
const segPos=new Float32Array(MAXSEG*12);
let segPtr=0,segCount=0;
const trk=[{x:0,z:0,has:false},{x:0,z:0,has:false},{x:0,z:0,has:false},{x:0,z:0,has:false}];
const marksG=new THREE.BufferGeometry();
const marksAttr=new THREE.BufferAttribute(segPos,3);marksAttr.setUsage(THREE.DynamicDrawUsage);
marksG.setAttribute('position',marksAttr);
(function(){const idx=[];for(let q=0;q<MAXSEG;q++){const b=q*4;idx.push(b,b+1,b+2,b,b+2,b+3);}marksG.setIndex(idx);})();
marksG.setDrawRange(0,0);
const marksMesh=new THREE.Mesh(marksG,new THREE.MeshBasicMaterial({color:0x141414,transparent:true,opacity:0.5,depthWrite:false,side:THREE.DoubleSide}));
marksMesh.frustumCulled=false;scene.add(marksMesh);
function pushSeg(x0,z0,x1,z1){
  const dx=x1-x0,dz=z1-z0,L=Math.hypot(dx,dz);
  if(L<0.1||L>4)return;
  const px=-dz/L*0.18,pz=dx/L*0.18,o=segPtr*12;
  segPos[o]=x0+px;segPos[o+1]=0.07;segPos[o+2]=z0+pz;
  segPos[o+3]=x0-px;segPos[o+4]=0.07;segPos[o+5]=z0-pz;
  segPos[o+6]=x1-px;segPos[o+7]=0.07;segPos[o+8]=z1-pz;
  segPos[o+9]=x1+px;segPos[o+10]=0.07;segPos[o+11]=z1+pz;
  segPtr=(segPtr+1)%MAXSEG;segCount=Math.min(segCount+1,MAXSEG);
  marksAttr.needsUpdate=true;marksG.setDrawRange(0,segCount*6);
}
function clearMarks(){segPtr=0;segCount=0;marksG.setDrawRange(0,0);trk.forEach(t=>t.has=false);}
function updMarks(){
  const fx=Math.sin(u.heading),fz=Math.cos(u.heading),rx=Math.cos(u.heading),rz=-Math.sin(u.heading);
  const vT=Math.hypot(u.vf,u.vl);
  const rearOn=vT>6&&(u._lockR>0.45||u._satS>0.5)&&u.surf!=='grass';
  const frontOn=vT>6&&u._lockF>0.45&&u.surf!=='grass';
  const offs=[[-1.45,-2.175,rearOn],[1.45,-2.175,rearOn],[-1.45,2.175,frontOn],[1.45,2.175,frontOn]];
  for(let i=0;i<4;i++){
    const wx=car.position.x+rx*offs[i][0]+fx*offs[i][1];
    const wz=car.position.z+rz*offs[i][0]+fz*offs[i][1];
    if(offs[i][2]){
      if(trk[i].has)pushSeg(trk[i].x,trk[i].z,wx,wz);
      trk[i].x=wx;trk[i].z=wz;trk[i].has=true;
    }else trk[i].has=false;
  }
}

// ===== RAIN =====
const RN=1400,rainArr=new Float32Array(RN*3);
for(let i=0;i<RN;i++){rainArr[i*3]=(Math.random()-0.5)*150;rainArr[i*3+1]=Math.random()*40;rainArr[i*3+2]=(Math.random()-0.5)*150;}
const rainG=new THREE.BufferGeometry();
const rainAttr=new THREE.BufferAttribute(rainArr,3);rainAttr.setUsage(THREE.DynamicDrawUsage);
rainG.setAttribute('position',rainAttr);
const rain=new THREE.Points(rainG,new THREE.PointsMaterial({color:0xbfd4e6,size:0.14,transparent:true,opacity:0.55}));
rain.visible=false;rain.frustumCulled=false;scene.add(rain);

const gates=[];
function makeGate(idx){
  const p=curve.getPointAt(idx/NW),tn=curve.getTangentAt(idx/NW).normalize(),n=new THREE.Vector3(-tn.z,0,tn.x);
  const g=new THREE.Group();const mats=[];
  for(let s=-1;s<=1;s+=2){
    const m=new THREE.MeshBasicMaterial({color:0xff6a00});mats.push(m);
    const cone=new THREE.Mesh(new THREE.ConeGeometry(0.5,1.4,10),m);
    cone.position.set(p.x+n.x*s*(TW-1.5),0.7,p.z+n.z*s*(TW-1.5));g.add(cone);
    const band=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.32,0.25,10),new THREE.MeshBasicMaterial({color:0xffffff}));
    band.position.set(cone.position.x,0.85,cone.position.z);g.add(band);
  }
  g.visible=false;scene.add(g);
  gates.push({idx:idx,group:g,mats:mats,passed:false});
}
makeGate(420);

// ===== SIM v6.1 =====
const D2R=Math.PI/180;
const MASS=1230, WB=2.8, LF=1.35, LR=1.45, CGH=0.35;
const YAW_INERTIA=MASS*(4.5*4.5+1.95*1.95)/12;
const TRACK_WIDTH=1.62, TIRE_LOAD_SENSITIVITY=0.10, REFERENCE_WHEEL_LOAD=3000;
const MAXBRK=20000, BRK_BIAS_F=0.62;
const ROLL=0.013, MAXSPD=78;
const AERO_CONFIG={
  airDensity:1.225,downforceArea:2.6,dragArea:0.95,referenceArea:2.2,
  inducedDrag:0.045,frontShare:0.42,preset:aeroPresets.balanced
};
let AERO_MODE='balanced';
const SUSPENSION_INPUT={
  mass:MASS,unsprungMass:38,frontAxleDistance:LF,rearAxleDistance:LR,
  trackWidth:TRACK_WIDTH,cgHeight:CGH
};
const suspensionState=suspension.createState();
const TRANSMISSION_CONFIG={
  gearRatios:[2.90,2.10,1.63,1.34,1.12,0.91],finalDrive:4.15,reverseRatio:3.10,
  wheelRadius:0.33,idleRpm:1500,shiftUpRpm:8000,shiftDownRpm:4800,
  maximumDownshiftRpm:8150,kickdownRpm:6200,kickdownThrottle:0.85,
  shiftDuration:0.14,torqueCutFraction:0.48,torqueRecoveryFraction:0.28
};
const STEERING_CONFIG={
  maximumAngle:360*D2R,turnRateDegrees:120,returnRateDegrees:90
};
const MU_DRY={track:1.75,kerb:1.55,edge:1.05,grass:0.60};
const MU_WET={track:1.05,kerb:0.90,edge:0.68,grass:0.45};
const SMAX=360*D2R,MWA=30*D2R,SR=12;
const WHEEL_R=0.33, IDLE=1500, REDLINE=8500;
const REV_FORCE=4000, REV_MAXV=5.5;
const TPEAK=560, PPEAK=430000, EB_TQ=70;
const TCS_FRAC=[1.0,0.94,0.87,0.79,0.71,0.62];
const TCS_CUT =[0.0,0.20,0.35,0.50,0.65,0.80];
const ABS_CUT =[0.0,0.13,0.26,0.39,0.52,0.65];
let TCS_LVL=2, ABS_LVL=3, WET=false;

const D2RAD=D2R;
const SETUPS=[
 {tag:'ST',name:'🛡 STABLE 轻微转向不足',
  CF:128000, CR:136000, REL_F:0.45, REL_R:0.55,
  TOE_F:0.10*D2RAD, TOE_R:0.18*D2RAD,CAM_F:-2.4, CAM_R:-2.8,
  springFront:100000,springRear:108000,damperFront:8200,damperRear:9200,
  antiRollFront:26000,antiRollRear:20000,antiRollDamping:1300},
 {tag:'BA',name:'⚖ BALANCED 适中',
  CF:135000, CR:130000, REL_F:0.45, REL_R:0.55,
  TOE_F:-0.05*D2RAD, TOE_R:0.10*D2RAD,CAM_F:-3.0, CAM_R:-2.0,
  springFront:95000,springRear:105000,damperFront:7800,damperRear:8600,
  antiRollFront:22000,antiRollRear:22000,antiRollDamping:1200},
 {tag:'AG',name:'🔥 AGILE 轻微转向过度',
  CF:140000, CR:124000, REL_F:0.45, REL_R:0.55,
  TOE_F:-0.12*D2RAD, TOE_R:0.04*D2RAD,CAM_F:-3.5, CAM_R:-1.5,
  springFront:90000,springRear:112000,damperFront:7400,damperRear:9600,
  antiRollFront:16000,antiRollRear:32000,antiRollDamping:1200}
];
SETUPS.forEach(s=>{
  s.frontShare=0.485;
  s.camberGripFront=Math.max(0.9,Math.min(1,1-0.012*(s.CAM_F+2.5)**2));
  s.camberGripRear=Math.max(0.9,Math.min(1,1-0.012*(s.CAM_R+2.5)**2));
});
let SU_IDX=1, SU=SETUPS[1];
function selectAeroMode(mode){
  if(!Object.prototype.hasOwnProperty.call(aeroPresets,mode))throw new Error(`Unknown aero preset: ${mode}`);
  AERO_MODE=mode;AERO_CONFIG.preset=aeroPresets[mode];
  document.getElementById('aeroMode').value=mode;
}
function applySetup(i){
  SU_IDX=(i+3)%3;SU=SETUPS[SU_IDX];
  document.querySelectorAll('.scard').forEach((el,k)=>el.classList.toggle('sel',k===SU_IDX));
}
function torqueN(rpm){
  if(rpm<1500)return 0.55+0.45*(rpm/1500);
  if(rpm<4000)return 0.85+0.15*(rpm-1500)/2500;
  if(rpm<7500)return 1.0;
  if(rpm<8500)return 1.0-0.25*(rpm-7500)/1000;
  return 0.75;
}
function pN(rpm){
  if(rpm<1500)return 0.30;
  if(rpm<5500)return 0.30+0.70*(rpm-1500)/4000;
  if(rpm<8300)return 1.0;
  return Math.max(0.8,1.0-0.2*(rpm-8300)/300);
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function muOf(s){
  const base=WET?MU_WET[s]:MU_DRY[s];
  return base*(0.72+0.28*clamp((u.tireWear??100)/100,0,1));
}

const car=new THREE.Group();
const chassis=new THREE.Group();
car.add(chassis);
(function(){
  const B=(w,h,d,c,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color:c}));m.position.set(x,y,z);chassis.add(m);return m;};
  B(1.95,0.5,4.5,0x1faa3c,0,0.5,0);B(1.6,0.42,1.8,0x0d0d0d,0,0.92,-0.35);B(2.0,0.07,0.55,0x111111,0,1.12,-2.0);B(2.05,0.12,0.7,0x111111,0,0.28,2.1);
  B(0.12,0.5,2.2,0x141414,-0.98,0.55,0);B(0.12,0.5,2.2,0x141414,0.98,0.55,0);
  const cyl=new THREE.CylinderGeometry(0.36,0.36,0.32,12),wm=new THREE.MeshBasicMaterial({color:0x141414});
  car.userData.w=[];car.userData.pv=[];
  [[-1,0.36,-1.5],[1,0.36,-1.5]].forEach(p=>{const m=new THREE.Mesh(cyl,wm);m.rotation.z=Math.PI/2;m.position.set(p[0],p[1],p[2]);car.add(m);car.userData.w.push(m);});
  [[-1,0.36,1.5],[1,0.36,1.5]].forEach(p=>{const g2=new THREE.Group();g2.position.set(p[0],p[1],p[2]);const m=new THREE.Mesh(cyl,wm);m.rotation.z=Math.PI/2;g2.add(m);car.add(g2);car.userData.pv.push(g2);car.userData.w.push(m);});
  const sh=new THREE.Mesh(new THREE.PlaneGeometry(2.6,5),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.3,side:THREE.DoubleSide}));
  sh.rotation.x=-Math.PI/2;sh.position.y=0.03;car.add(sh);
})();
car.scale.setScalar(1.45);
car.rotation.order='YXZ';
const s0=curve.getPointAt(0),t0=curve.getTangentAt(0).normalize();
const u=car.userData;
scene.add(car);

function makeAICar(driver){
  const group=new THREE.Group(),paint=new THREE.MeshBasicMaterial({color:driver.color});
  const dark=new THREE.MeshBasicMaterial({color:0x101318}),glass=new THREE.MeshBasicMaterial({color:0x182b3c});
  const addBox=(w,h,d,mat,x,y,z)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);group.add(mesh);};
  addBox(driver.width,0.62,driver.length,paint,0,0.48,0);
  addBox(driver.width*0.72,0.48,driver.length*0.40,glass,0,0.92,-driver.length*0.06);
  addBox(driver.width*1.04,0.09,0.72,dark,0,1.02,-driver.length*0.38);
  addBox(driver.width*1.05,0.12,0.62,dark,0,0.24,driver.length*0.40);
  const wheelGeo=new THREE.CylinderGeometry(0.34,0.34,0.3,10),wheelMat=new THREE.MeshBasicMaterial({color:0x111111});
  for(const x of [-driver.width*0.49,driver.width*0.49])for(const z of [-driver.length*0.32,driver.length*0.32]){
    const wheel=new THREE.Mesh(wheelGeo,wheelMat);wheel.rotation.z=Math.PI/2;wheel.position.set(x,0.34,z);group.add(wheel);
  }
  group.name=driver.id;group.visible=false;
  scene.add(group);
  return group;
}
const aiDrivers=AI_ROSTER.map((driver,index)=>({
  ...driver,index,mesh:makeAICar(driver),progress:0,speed:0,laps:0,
  lapElapsed:0,bestLap:0,lastLap:0,lane:0,preferredLane:0,skill:null,
  lateralVelocity:0,yawAngle:0,yawRate:0,damage:0,tireWear:100,mistakeTime:0,mistakeSide:1,
  finished:false,attacking:false,started:false,startAt:0,raceStarted:false
}));
let bestDry=0,bestWet=0;
try{bestDry=parseFloat(localStorage.getItem('silv2_best')||'0')||0;bestWet=parseFloat(localStorage.getItem('silv2_best_wet')||'0')||0;}catch(e){}
function curBest(){return WET?bestWet:bestDry;}
function setBest(v){if(WET){bestWet=v;try{localStorage.setItem('silv2_best_wet',String(v));}catch(e){}}else{bestDry=v;try{localStorage.setItem('silv2_best',String(v));}catch(e){}}}
let lapStart=0,prevLap=0,prevValid=true,elapsed=0,timerOn=false;
let mode='menu';
let eventMode='free',eventStage='free',eventActive=false,eventFinished=false,eventLaps=0,eventPlayerBest=0;
let eventDurationSeconds=0,eventElapsed=0,eventTimeExpired=false,boardRefreshAt=0,eventPlayerDamage=0;
let DAMAGE_ENABLED=true;
let weekendQualOrder=[];
const QUALIFYING_START_INTERVAL=20, FORMATION_SPEED=27.8, FORMATION_GAP=9;
let raceStartState='none',raceGridOrder=[],racePlayerProgress=0,playerRaceStarted=false;
function qualifyingStartOffset(index){return (index+1)*QUALIFYING_START_INTERVAL;}
let tutPhase='pages',tutPage=0,tutTime=0,tutPassed=false;
const operationLogger=createOperationLogger({
  getState:()=>({
    wet:WET,damageEnabled:DAMAGE_ENABLED,setup:SU.tag,aeroSetup:AERO_MODE,tcs:TCS_LVL,abs:ABS_LVL,
    car,vehicleState:u,mouse:ms,playerBest:eventPlayerBest,previousLap:prevLap,
    playerDamage:eventPlayerDamage,eventLaps
  }),
  documentRef:document,navigatorRef:navigator,performanceRef:performance
});
const {
  action:logAction,
  finish:finishOperationLog,
  isActive:hasOperationLog,
  exportLatest:exportLatestOperationLog,
  sample:sampleOperationLog,
  start:startOperationLog
}=operationLogger;

function setLevel(wet){
  WET=wet;
  const sky=wet?0x66707c:0x9db8c8;
  scene.background.set(sky);scene.fog.color.set(sky);
  scene.fog.near=wet?300:500;scene.fog.far=wet?1800:3600;
  gndMat.color.set(wet?0x3c5a33:0x47823a);
  trackMat.color.set(wet?0x3d4348:0x565a5c);
  rain.visible=wet;
  document.getElementById('trackName').textContent=wet?'SILVERSTONE 🌧 WET · 488 GT3 · 无限圈':'SILVERSTONE · 488 GT3 · 无限圈';
}
function resetCar(){
  car.position.set(s0.x,0.1,s0.z);
  u.heading=Math.atan2(t0.x,t0.z);
  u.wpi=25;u.lap=1;
  u.vf=0;u.vl=0;u.yaw=0;u.steer=0;u.latG=0;u.slipR=0;u.surf='track';u.prevSurf='track';
  u._satS=0;u._aLon=0;u._ay=0;u._ar=0;u._FyF=0;u._FyR=0;u._tc=false;
  u._lockF=0;u._lockR=0;u._wheelOmegaF=0;u._wheelOmegaR=0;u._wheelSlipF=0;u._wheelSlipR=0;
  u._impact=0;u._dPrev=0;u._aero=0;
  u.tireWear=100;
  u.gear=1;u.rpm=IDLE;u.shiftT=0;u.shiftElapsed=0;u.shiftDuration=0;u.shiftStartRpm=IDLE;u._shiftTorqueFactor=1;
  Object.assign(suspensionState,suspension.createState());
  u.lapValid=true;u._wallT=0;
  car.rotation.set(0,u.heading,0);chassis.rotation.set(0,0,0);chassis.position.y=0;
  elapsed=0;timerOn=false;lapStart=0;prevLap=0;prevValid=true;
  ms.brk=0;ms.thr=0;ms.ld=false;ms.rd=false;
  gates.forEach(g=>g.passed=false);
  tutTime=0;tutPassed=false;
  clearMarks();
}
setLevel(false);applySetup(1);resetCar();

const PAGES=[
 {t:'🎮 油门',d:`<span class="key">鼠标右键</span> 按住并<b>向下拖拽</b> = 油门。<br>· 6速<b>序列式自动变速箱</b>：按发动机转速换挡，降挡受超转保护。<br>· <b>TCS</b>（T键 0-5档）：0=全关，后轮可完全打滑。<br><b>→ 试试：右键拖拽加油到 80 km/h。</b>`},
 {t:'🛑 刹车',d:`<span class="key">鼠标左键</span> 按住并<b>向下拖拽</b> = 刹车。<br>· <b>ABS</b>（B键 0-5档）：0=全关，重刹会抱死🔒丧失部分转向。<br>· 刹车载荷前移+下压力加成→高速制动更强。<br><b>→ 试试：150 km/h 刹停。</b>`},
 {t:'🎯 转向/调教/规则',d:`<span class="key">A</span>=左 · <span class="key">D</span>=右 · <span class="key">W</span>=回正/冻结 · <span class="key">Q</span>=切换调教方案。<br>· 三方案(仅悬挂/底盘)：🛡轻推头 / ⚖均衡 / 🔥轻甩尾。<br>· <b style="color:#f66">四轮完全出赛道=该圈不计最佳；无限圈。</b><br>· 菜单可选<b>雨天关卡</b>。<br><b>→ 试试：A/D 转向，Q 换调教感受差异。</b>`}
];
function startTutorial(){
  eventActive=false;eventFinished=false;
  aiDrivers.forEach(ai=>ai.mesh.visible=false);
  document.getElementById('eventResults').style.display='none';
  document.getElementById('raceInfo').style.display='none';
  setLevel(false);
  DAMAGE_ENABLED=document.getElementById('damageEnabled').checked;
  eventPlayerDamage=0;eventLaps=0;eventPlayerBest=0;
  resetCar();mode='tutorial';tutPhase='pages';tutPage=0;
  document.getElementById('menu').style.display='none';
  document.getElementById('congrats').style.display='none';
  document.getElementById('setupBox').style.display='none';
  document.getElementById('tut').style.display='block';
  gates.forEach(g=>g.group.visible=false);
  startOperationLog('新手教程');
  renderPage();
}
function renderPage(){
  const p=PAGES[tutPage];
  document.getElementById('tutStep').textContent=`新手教程 · 教学 ${tutPage+1}/${PAGES.length}`;
  document.getElementById('tutTitle').textContent=p.t;
  document.getElementById('tutDesc').innerHTML=p.d;
  document.getElementById('tutProg').textContent='边看边练：车辆已可操作';
  document.getElementById('tutBtns').style.display='flex';
  document.getElementById('tutPrev').style.visibility=tutPage===0?'hidden':'visible';
  const nx=document.getElementById('tutNext');
  nx.textContent=tutPage===PAGES.length-1?'开始检查点挑战 →':'下一页 →';
  nx.className=tutPage===PAGES.length-1?'go':'';
}
function startGatePhase(){
  tutPhase='gate';tutTime=0;
  gates.forEach(g=>g.group.visible=true);
  document.getElementById('tutBtns').style.display='none';
  document.getElementById('tutStep').textContent='新手教程 · 检查点挑战';
  document.getElementById('tutTitle').textContent='🚧 穿过检查点';
  document.getElementById('tutDesc').innerHTML='沿赛道行驶，穿过前方<b style="color:#ffdd00">闪烁的橙色锥桶门</b>（小地图黄点）。';
}
function wrappedProgress(progress){
  return ((progress%trackLength)+trackLength)%trackLength;
}
function formationTargetSpeed(gridKey,progress){
  const position=raceGridOrder.indexOf(gridKey);
  let nearestAhead=Infinity;
  for(let index=0;index<position;index++){
    const key=raceGridOrder[index];
    const ahead=key==='PLAYER'?racePlayerProgress:aiDrivers.find(driver=>driver.id===key)?.progress;
    if(ahead===undefined)continue;
    const gap=ahead-progress;
    if(gap>2&&gap<nearestAhead)nearestAhead=gap;
  }
  const gap=Number.isFinite(nearestAhead)?nearestAhead:FORMATION_GAP;
  return clamp(FORMATION_SPEED+(gap-FORMATION_GAP)*0.35,FORMATION_SPEED-5,FORMATION_SPEED+2);
}
function aiRacingLine(progress){
  const index=Math.floor(wrappedProgress(progress)/trackLength*NW)%NW;
  const span=Math.max(1,Math.floor(110/WP_SP));
  let ahead=0,behind=0;
  for(let offset=0;offset<=span;offset+=4){
    const weight=1-offset/(span+4);
    const a=(index+offset)%NW,b=(index-offset+NW)%NW;
    ahead+=ins[a]*clamp(75/Math.max(Rad[a],1),0,1)*weight;
    behind+=ins[b]*clamp(75/Math.max(Rad[b],1),0,1)*weight;
  }
  const total=Math.abs(ahead)+Math.abs(behind),signed=ahead+behind;
  if(total<0.45||Math.abs(signed)<0.20)return 0;
  const balance=1-Math.abs(Math.abs(ahead)-Math.abs(behind))/total;
  return Math.sign(signed)*3.4*(2*balance-1);
}
function setTrackPosition(group,progress,lane){
  const t=wrappedProgress(progress)/trackLength;
  const point=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize();
  group.position.set(point.x-tangent.z*lane,0.12,point.z+tangent.x*lane);
  group.rotation.y=Math.atan2(tangent.x,tangent.z);
}
function placeOnGrid(group,slot){
  const row=Math.floor((slot-1)/2),progress=-row*9;
  const lane=slot%2===1?-2.5:2.5;
  setTrackPosition(group,progress,lane);
  return progress;
}
function eventStandings(qualifying){
  const entries=[{
    key:'PLAYER',name:'你',player:true,bestLap:eventPlayerBest,
    vehicle:'488 GT3',skill:'玩家',damage:eventPlayerDamage,tireWear:u.tireWear,speed:Math.hypot(u.vf,u.vl),
    progress:eventLaps*trackLength+(u.wpi/NW)*trackLength,laps:eventLaps
  }];
  aiDrivers.forEach(ai=>entries.push({
    key:ai.id,name:ai.name,vehicle:ai.vehicle,skill:ai.skill?.label||'AI',damage:ai.damage,tireWear:ai.tireWear,bestLap:ai.bestLap,
    speed:Math.abs(ai.speed),progress:ai.laps*trackLength+Math.max(0,ai.progress),laps:ai.laps
  }));
  if(qualifying)entries.sort((a,b)=>(a.bestLap||Infinity)-(b.bestLap||Infinity));
  else entries.sort((a,b)=>b.progress-a.progress);
  return entries;
}
function showEventResults(qualifying){
  eventActive=false;eventFinished=true;
  const standings=eventStandings(qualifying);
  const weekendQualifying=eventMode==='weekend'&&eventStage==='qualifying';
  if(weekendQualifying)weekendQualOrder=standings.map(entry=>entry.key);
  document.getElementById('resultTitle').textContent=qualifying?'排位赛成绩':'正赛成绩';
  document.getElementById('resultSubtitle').textContent=weekendQualifying
    ?'排位完成，以下名次将作为正赛发车顺序。'
    :`${WET?'雨地':'干地'} · ${fmt(eventDurationSeconds)} · ${standings.findIndex(entry=>entry.player)+1} / ${standings.length} 位`;
  document.getElementById('resultRows').innerHTML=standings.map((entry,index)=>{
    const metric=qualifying?fmt(entry.bestLap):`${entry.laps} 圈 · ${Math.max(0,Math.floor(entry.progress%trackLength))} m`;
    return `<div class="resultRow${entry.player?' player':''}"><span class="pos">P${index+1}</span><span>${entry.name} · ${entry.skill}<br><small>${entry.vehicle}</small></span><span class="time">${metric}</span></div>`;
  }).join('');
  document.getElementById('resultAction').textContent=weekendQualifying?'按排位发车 · 开始正赛':'返回菜单';
  document.getElementById('eventResults').style.display='flex';
}
function finishPlayerLap(lapTime,valid){
  eventLaps++;
  if(valid&&lapTime>5&&(!eventPlayerBest||lapTime<eventPlayerBest))eventPlayerBest=lapTime;
  if(eventTimeExpired)showEventResults(eventStage==='qualifying');
}
function aiTargetSpeed(ai){
  const idx=Math.floor(wrappedProgress(ai.progress)/trackLength*NW)%NW;
  const skill=ai.skill||AI_SKILLS.pro;
  const wearGrip=0.76+0.24*ai.tireWear/100;
  let limit=ai.pace*skill.pace*(WET?0.94:1)*(1+skill.aggression*0.035)
    *wearGrip*(DAMAGE_ENABLED?Math.max(0.65,1-ai.damage*0.35):1);
  for(let ahead=0;ahead<=100;ahead+=20){
    const sample=(idx+Math.floor(ahead/WP_SP))%NW;
    const grip=skill.grip*wearGrip*(WET?0.84:1);
    const curveLimit=Math.sqrt(Math.max(0,1.75*9.81*Rad[sample]*grip));
    limit=Math.min(limit,curveLimit);
  }
  return Math.min(MAXSPD,Math.max(20,limit));
}
function updateAI(dt){
  if(!eventActive||!timerOn)return;
  aiDrivers.forEach(ai=>{
    if(ai.finished)return;
    if(eventStage==='qualifying'&&!ai.started&&eventElapsed>=ai.startAt){
      ai.started=true;ai.lapElapsed=0;ai.mesh.visible=true;
      logAction('qualifying-release',{driver:ai.id,offsetSeconds:ai.startAt});
    }
    if(eventStage==='qualifying'&&!ai.started)return;
    const skill=ai.skill||AI_SKILLS.pro;
    if(ai.mistakeTime>0)ai.mistakeTime=Math.max(0,ai.mistakeTime-dt);
    else if(skill.errorChance>0&&Math.random()<skill.errorChance*dt){
      ai.mistakeTime=0.8+Math.random()*1.2;
      ai.mistakeSide=Math.random()<0.5?-1:1;
    }
    let target=Math.min(MAXSPD,aiTargetSpeed(ai)*(ai.mistakeTime>0?0.78:1)*(ai.attacking?1.06:1));
    if(eventStage==='race'&&raceStartState==='formation'){
      target=formationTargetSpeed(ai.id,ai.progress);
      ai.attacking=false;
    }
    const rate=target<ai.speed?skill.brake:skill.accel;
    ai.speed+=clamp(target-ai.speed,-rate*dt,rate*dt);
    ai.progress+=ai.speed*dt;
    if(eventStage==='qualifying'||(eventStage==='race'&&ai.raceStarted))ai.lapElapsed+=dt;
    const index=Math.floor(wrappedProgress(ai.progress)/trackLength*NW)%NW;
    const lateralG=clamp(ai.speed*ai.speed/(Math.max(Rad[index],8)*9.81),0,3.2);
    ai.tireWear=Math.max(0,ai.tireWear-dt*(0.003+0.009*lateralG+0.002*Math.abs(ai.lateralVelocity)));
    if(ai.progress>=trackLength){
      ai.progress-=trackLength;ai.laps++;
      if(eventStage==='race'&&raceStartState==='formation'){
        ai.laps=0;ai.lapElapsed=0;
        if(raceGridOrder[0]===ai.id)startRaceGreen();
        ai.raceStarted=true;
      }else if(eventStage==='race'&&!ai.raceStarted){
        ai.laps=0;ai.lapElapsed=0;ai.raceStarted=true;
      }else{
        ai.lastLap=ai.lapElapsed;ai.lapElapsed=0;
        if(ai.lastLap>5&&(!ai.bestLap||ai.lastLap<ai.bestLap))ai.bestLap=ai.lastLap;
        if(eventTimeExpired)ai.finished=true;
      }
    }
    const tangent=curve.getTangentAt(wrappedProgress(ai.progress)/trackLength).normalize();
    let laneTarget=aiRacingLine(ai.progress)+(ai.mistakeTime>0?ai.mistakeSide*2.4:0);
    ai.attacking=false;
    if(eventStage==='race'&&raceStartState==='formation')laneTarget=ai.preferredLane;
    const opponents=eventStage==='qualifying'||(eventStage==='race'&&raceStartState==='formation')
      ?[]:[{mesh:car},...aiDrivers.filter(other=>other!==ai&&other.mesh.visible).map(other=>({mesh:other.mesh}))];
    let nearestThreat=Infinity;
    opponents.forEach(opponent=>{
      const dx=opponent.mesh.position.x-ai.mesh.position.x,dz=opponent.mesh.position.z-ai.mesh.position.z;
      const along=dx*tangent.x+dz*tangent.z;
      const across=dx*(-tangent.z)+dz*tangent.x;
      if(along>-14&&along<24&&Math.abs(across)<5&&along<nearestThreat){
        nearestThreat=along;
        const passingSide=across>=0?-4.6:4.6;
        if(along>0){laneTarget=passingSide;ai.attacking=true;}
        else laneTarget=skill.aggression>0.96?aiRacingLine(ai.progress):aiRacingLine(ai.progress)+(across>=0?-1.8:1.8);
      }
    });
    const laneRate=3+skill.aggression*6;
    ai.lane+=clamp(laneTarget-ai.lane,-laneRate*dt,laneRate*dt);
    ai.lane+=ai.lateralVelocity*dt;
    ai.lateralVelocity*=Math.exp(-dt*2.4);
    ai.yawRate*=Math.exp(-dt*2.1);
    ai.yawAngle=clamp(ai.yawAngle+ai.yawRate*dt,-0.5,0.5);
    setTrackPosition(ai.mesh,ai.progress,ai.lane);
    ai.mesh.rotation.y+=ai.yawAngle;
  });
}
function startRaceGreen(){
  if(raceStartState!=='formation')return;
  raceStartState='green';
  eventElapsed=0;eventTimeExpired=false;playerRaceStarted=raceGridOrder[0]==='PLAYER';
  if(playerRaceStarted)lapStart=elapsed;
  aiDrivers.forEach(ai=>{ai.lapElapsed=0;});
  logAction('race-green-flag',{startOrder:raceGridOrder});
}
function solveAIContacts(){
  if(!eventActive||eventStage==='qualifying')return;
  const playerForward={x:Math.sin(u.heading),z:Math.cos(u.heading)};
  const playerRight={x:Math.cos(u.heading),z:-Math.sin(u.heading)};
  const playerAxes=[playerForward,playerRight];
  const playerInertia=MASS*(CAR_LEN*CAR_LEN+CAR_HW*CAR_HW*4)/12;
  const inversePlayerMass=1/MASS;
  aiDrivers.forEach(ai=>{
    if(!ai.mesh.visible)return;
    const aiHeading=ai.mesh.rotation.y;
    const aiForward={x:Math.sin(aiHeading),z:Math.cos(aiHeading)};
    const aiRight={x:Math.cos(aiHeading),z:-Math.sin(aiHeading)};
    const aiAxes=[aiForward,aiRight];
    const dx=ai.mesh.position.x-car.position.x,dz=ai.mesh.position.z-car.position.z;
    let minOverlap=Infinity,normal=null;
    for(const axis of [...playerAxes,...aiAxes]){
      const playerRadius=Math.abs(axis.x*playerForward.x+axis.z*playerForward.z)*CAR_LEN/2
        +Math.abs(axis.x*playerRight.x+axis.z*playerRight.z)*CAR_HW;
      const aiRadius=Math.abs(axis.x*aiForward.x+axis.z*aiForward.z)*ai.length/2
        +Math.abs(axis.x*aiRight.x+axis.z*aiRight.z)*ai.width/2;
      const projected=dx*axis.x+dz*axis.z;
      const overlap=playerRadius+aiRadius-Math.abs(projected);
      if(overlap<=0){minOverlap=0;break;}
      if(overlap<minOverlap){
        minOverlap=overlap;
        normal={x:axis.x*(projected>=0?1:-1),z:axis.z*(projected>=0?1:-1)};
      }
    }
    if(minOverlap<=0||!normal)return;
    const inverseAIMass=1/ai.mass,inverseMassSum=inversePlayerMass+inverseAIMass;
    const correction=Math.min(minOverlap+0.015,1.25);
    const playerMove={x:-normal.x*correction*inversePlayerMass/inverseMassSum,z:-normal.z*correction*inversePlayerMass/inverseMassSum};
    const aiMove={x:normal.x*correction*inverseAIMass/inverseMassSum,z:normal.z*correction*inverseAIMass/inverseMassSum};
    car.position.x+=playerMove.x;car.position.z+=playerMove.z;
    ai.mesh.position.x+=aiMove.x;ai.mesh.position.z+=aiMove.z;
    const trackTangent=curve.getTangentAt(wrappedProgress(ai.progress)/trackLength).normalize();
    const trackNormal={x:-trackTangent.z,z:trackTangent.x};
    ai.progress+=aiMove.x*trackTangent.x+aiMove.z*trackTangent.z;
    ai.lane+=aiMove.x*trackNormal.x+aiMove.z*trackNormal.z;

    let playerVx=playerForward.x*u.vf+playerRight.x*u.vl;
    let playerVz=playerForward.z*u.vf+playerRight.z*u.vl;
    let aiVx=trackTangent.x*ai.speed+trackNormal.x*ai.lateralVelocity;
    let aiVz=trackTangent.z*ai.speed+trackNormal.z*ai.lateralVelocity;
    const tangent={x:-normal.z,z:normal.x};
    const relativeNormal=(aiVx-playerVx)*normal.x+(aiVz-playerVz)*normal.z;
    if(relativeNormal<0){
      const restitution=0.10;
      const normalImpulse=-(1+restitution)*relativeNormal/inverseMassSum;
      const relativeTangent=(aiVx-playerVx)*tangent.x+(aiVz-playerVz)*tangent.z;
      const tangentImpulse=clamp(-relativeTangent/inverseMassSum,-0.55*normalImpulse,0.55*normalImpulse);
      const impulseX=normal.x*normalImpulse+tangent.x*tangentImpulse;
      const impulseZ=normal.z*normalImpulse+tangent.z*tangentImpulse;
      playerVx-=impulseX*inversePlayerMass;playerVz-=impulseZ*inversePlayerMass;
      aiVx+=impulseX*inverseAIMass;aiVz+=impulseZ*inverseAIMass;
      u.vf=playerVx*playerForward.x+playerVz*playerForward.z;
      u.vl=playerVx*playerRight.x+playerVz*playerRight.z;
      ai.speed=clamp(aiVx*trackTangent.x+aiVz*trackTangent.z,-8,MAXSPD);
      ai.lateralVelocity=clamp(aiVx*trackNormal.x+aiVz*trackNormal.z,-12,12);
      const playerAlong=clamp(dx*playerForward.x+dz*playerForward.z,-CAR_LEN/2,CAR_LEN/2);
      const playerAcross=clamp(dx*playerRight.x+dz*playerRight.z,-CAR_HW,CAR_HW);
      const playerArm={x:playerForward.x*playerAlong+playerRight.x*playerAcross,z:playerForward.z*playerAlong+playerRight.z*playerAcross};
      const playerTorque=playerArm.z*(-impulseX)-playerArm.x*(-impulseZ);
      u.yaw=clamp(u.yaw+playerTorque/playerInertia,-2.2,2.2);
      const aiDx=-dx,aiDz=-dz;
      const aiAlong=clamp(aiDx*aiForward.x+aiDz*aiForward.z,-ai.length/2,ai.length/2);
      const aiAcross=clamp(aiDx*aiRight.x+aiDz*aiRight.z,-ai.width/2,ai.width/2);
      const aiArm={x:aiForward.x*aiAlong+aiRight.x*aiAcross,z:aiForward.z*aiAlong+aiRight.z*aiAcross};
      const aiInertia=ai.mass*(ai.length*ai.length+ai.width*ai.width)/12;
      ai.yawRate=clamp(ai.yawRate+(aiArm.z*impulseX-aiArm.x*impulseZ)/aiInertia,-1.8,1.8);
      const severity=clamp(normalImpulse/(Math.min(MASS,ai.mass)*12),0,1);
      u._impact=Math.max(u._impact||0,severity);
      if(DAMAGE_ENABLED){
        eventPlayerDamage=clamp(eventPlayerDamage+normalImpulse/(MASS*55),0,1);
        ai.damage=clamp(ai.damage+normalImpulse/(ai.mass*55),0,1);
      }
    }
  });
}
function beginEvent(type,fromWeekendQualifying=false,restarting=false){
  const previousStage=eventStage;
  if(!fromWeekendQualifying){eventMode=type;weekendQualOrder=[];}
  eventStage=type==='weekend'?(fromWeekendQualifying?'race':'qualifying'):type;
  raceStartState=eventStage==='race'?'grid':'none';
  raceGridOrder=[];racePlayerProgress=0;playerRaceStarted=false;
  eventDurationSeconds=Number(document.getElementById(eventStage==='qualifying'?'qualDuration':'raceDuration').value);
  eventElapsed=0;eventTimeExpired=false;eventLaps=0;eventPlayerBest=0;
  eventPlayerDamage=0;eventActive=true;eventFinished=false;boardRefreshAt=0;
  DAMAGE_ENABLED=document.getElementById('damageEnabled').checked;
  document.getElementById('damageLabel').textContent=DAMAGE_ENABLED?'开启':'关闭';
  if(!fromWeekendQualifying)assignAISkills(aiDrivers);
  document.getElementById('eventResults').style.display='none';
  setLevel(document.getElementById('eventWeather').value==='wet');
  resetCar();mode='race';
  document.getElementById('menu').style.display='none';
  document.getElementById('tut').style.display='none';
  document.getElementById('ctrlBox').style.display='none';
  document.getElementById('congrats').style.display='none';
  document.getElementById('setupBox').style.display='none';
  gates.forEach(g=>g.group.visible=false);
  const defaultGrid=eventStage==='race'
    ?['ai-1','ai-2','ai-3','PLAYER','ai-4','ai-5','ai-6','ai-7']
    :['PLAYER',...aiDrivers.map(ai=>ai.id)];
  const grid=eventStage==='qualifying'
    ?['PLAYER',...aiDrivers.map(ai=>ai.id)]
    :fromWeekendQualifying&&weekendQualOrder.length?weekendQualOrder:defaultGrid;
  raceGridOrder=eventStage==='race'?[...grid]:[];
  grid.forEach((key,index)=>{
    const slot=index+1;
    if(key==='PLAYER'){
      const progress=eventStage==='qualifying'?0:placeOnGrid(car,slot);
      if(eventStage==='qualifying')setTrackPosition(car,0,0);
      racePlayerProgress=progress;
      const tangent=curve.getTangentAt(wrappedProgress(progress)/trackLength);
      u.heading=Math.atan2(tangent.x,tangent.z);
      u.wpi=(NW+Math.round(progress/trackLength*NW))%NW;
    }else{
      const ai=aiDrivers.find(driver=>driver.id===key);
      if(!ai)return;
      ai.progress=eventStage==='qualifying'?0:placeOnGrid(ai.mesh,slot);
      if(eventStage==='qualifying')setTrackPosition(ai.mesh,0,0);
      ai.lane=eventStage==='qualifying'?0:slot%2===1?-2.5:2.5;
      ai.preferredLane=ai.lane;
      ai.speed=0;ai.laps=0;ai.lapElapsed=0;ai.bestLap=0;ai.lastLap=0;
      ai.lateralVelocity=0;ai.yawAngle=0;ai.yawRate=0;ai.damage=0;ai.tireWear=100;ai.mistakeTime=0;ai.finished=false;ai.attacking=false;
      ai.started=eventStage!=='qualifying';ai.startAt=eventStage==='qualifying'?qualifyingStartOffset(index):0;
      ai.raceStarted=false;ai.mesh.visible=eventStage!=='qualifying';
    }
  });
  document.getElementById('raceInfo').style.display='block';
  document.getElementById('trackName').textContent=`SILVERSTONE · ${WET?'雨地':'干地'} · ${eventMode==='weekend'?(eventStage==='qualifying'?'比赛周排位':'比赛周正赛'):(eventStage==='qualifying'?'排位赛':'正赛')}`;
  if(restarting)logAction('restart',{from:previousStage,to:eventStage});
  else if(fromWeekendQualifying)logAction('phase-start',{stage:eventStage,grid:weekendQualOrder});
  else startOperationLog(eventMode==='weekend'?'比赛周·排位赛':eventStage==='qualifying'?'排位赛':'正赛');
}
function beginRace(wet){
  if(hasOperationLog())finishOperationLog();
  eventMode='free';eventStage='free';eventActive=false;eventFinished=false;
  eventPlayerDamage=0;eventLaps=0;eventPlayerBest=0;
  aiDrivers.forEach(ai=>ai.mesh.visible=false);
  document.getElementById('eventResults').style.display='none';
  document.getElementById('raceInfo').style.display='none';
  setLevel(wet);
  DAMAGE_ENABLED=document.getElementById('damageEnabled').checked;
  eventPlayerDamage=0;
  resetCar();mode='race';
  document.getElementById('menu').style.display='none';
  document.getElementById('tut').style.display='none';
  document.getElementById('ctrlBox').style.display='none';
  document.getElementById('congrats').style.display='none';
  document.getElementById('setupBox').style.display='none';
  gates.forEach(g=>g.group.visible=false);
  startOperationLog(`自由驾驶·${wet?'雨地':'干地'}`);
}
function openMenu(){
  finishOperationLog();
  eventActive=false;eventFinished=false;
  aiDrivers.forEach(ai=>ai.mesh.visible=false);
  document.getElementById('eventResults').style.display='none';
  document.getElementById('raceInfo').style.display='none';
  resetCar();mode='menu';
  document.getElementById('menu').style.display='flex';
  document.getElementById('tut').style.display='none';
  document.getElementById('ctrlBox').style.display='none';
  document.getElementById('congrats').style.display='none';
  document.getElementById('setupBox').style.display='none';
  gates.forEach(g=>g.group.visible=false);
  document.getElementById('menuBest').textContent=`BEST 干: ${fmt(bestDry)} · 雨: ${fmt(bestWet)}`;
}
function tutComplete(){
  tutPassed=true;
  gates.forEach(g=>g.group.visible=false);
  document.getElementById('tut').style.display='none';
  document.getElementById('cgTime').textContent='检查点用时 '+tutTime.toFixed(1)+' s';
  document.getElementById('congrats').style.display='flex';
}
function wrapDist(a,b){const d=Math.abs(a-b);return Math.min(d,NW-d);}
function updateTutorial(dt){
  if(tutPassed)return;
  if(tutPhase==='pages'){
    document.getElementById('tutProg').textContent=`教学页 ${tutPage+1}/${PAGES.length} · 车辆可自由练习 · 准备好后点"${tutPage===PAGES.length-1?'开始检查点挑战':'下一页'}"`;
    return;
  }
  tutTime+=dt;
  if(!gates[0].passed&&wrapDist(u.wpi,gates[0].idx)<20){
    gates[0].passed=true;tutComplete();return;
  }
  const dist=Math.round(wrapDist(u.wpi,gates[0].idx)*WP_SP);
  document.getElementById('tutProg').textContent=`距检查点: ${dist} m · 用时 ${tutTime.toFixed(1)}s`;
  const pulse=Math.sin(performance.now()*0.012)>0?0xffdd00:0xff6a00;
  gates[0].mats.forEach(m=>m.color.setHex(pulse));
}

addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(k==='escape'){
    if(document.getElementById('setupBox').style.display==='block'){document.getElementById('setupBox').style.display='none';return;}
    if(mode==='tutorial')beginRace(WET);
    else if(mode==='race'){logAction('return-to-menu');openMenu();}
    return;
  }
  if(mode==='menu')return;
  if(!e.repeat)logAction('key-down',{key:k});
  if(k==='a')keys.a=true;
  if(k==='d')keys.d=true;
  if(k==='w'&&!keys.w){keys.w=true;if(!keys.a&&!keys.d)u.steer=0;}
  if(k==='s'&&!keys.s){keys.s=true;if(Math.abs(u.vf)<0.8&&u.shiftT<=0)vehicleTransmission.requestGear(u,u.gear===0?1:0,TRANSMISSION_CONFIG);}
  if(k==='t'&&!keys.t){keys.t=true;TCS_LVL=(TCS_LVL+1)%6;}
  if(k==='b'&&!keys.b){keys.b=true;ABS_LVL=(ABS_LVL+1)%6;}
  if(k==='q'&&!keys.q){keys.q=true;applySetup(SU_IDX+1);}
  if(k==='r'&&mode==='race'){
    if(eventMode!=='free')beginEvent(eventMode,eventMode==='weekend'&&eventStage==='race',true);
    else{logAction('reset');resetCar();}
  }
});
addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(!e.repeat)logAction('key-up',{key:k});if(k==='a')keys.a=false;if(k==='d')keys.d=false;if(k==='w')keys.w=false;if(k==='s')keys.s=false;if(k==='t')keys.t=false;if(k==='b')keys.b=false;if(k==='q')keys.q=false;});
addEventListener('mousedown',e=>{if(mode==='menu'||e.target.closest?.('#eventResults,#setupBox,#tut,#congrats,#ctrlBox'))return;if(e.button===0){ms.ld=true;ms.lp={x:e.clientX,y:e.clientY};ms.brk=0;logAction('brake-press');}if(e.button===2){ms.rd=true;ms.rp={x:e.clientX,y:e.clientY};ms.thr=0;logAction('throttle-press');}});
addEventListener('mouseup',e=>{if(e.button===0){if(ms.ld)logAction('brake-release');ms.ld=false;ms.brk=0;}if(e.button===2){if(ms.rd)logAction('throttle-release');ms.rd=false;ms.thr=0;}});
addEventListener('mousemove',e=>{if(ms.ld&&ms.lp)ms.brk=Math.min(1,Math.hypot(e.clientX-ms.lp.x,e.clientY-ms.lp.y)/150);if(ms.rd&&ms.rp)ms.thr=Math.min(1,Math.hypot(e.clientX-ms.rp.x,e.clientY-ms.rp.y)/150);});
addEventListener('contextmenu',e=>e.preventDefault());
document.getElementById('btnRace').onclick=()=>beginRace(false);
document.getElementById('btnRaceWet').onclick=()=>beginRace(true);
document.getElementById('btnSprint').onclick=()=>beginEvent('race');
document.getElementById('btnQualifying').onclick=()=>beginEvent('qualifying');
document.getElementById('btnWeekend').onclick=()=>beginEvent('weekend');
document.getElementById('btnExportLog').onclick=()=>exportLatestOperationLog();
document.getElementById('damageEnabled').addEventListener('change',e=>{
  document.getElementById('damageLabel').textContent=e.target.checked?'开启':'关闭';
});
document.getElementById('aeroMode').addEventListener('change',e=>{
  selectAeroMode(e.target.value);
  logAction('aero-setup-change',{setup:AERO_MODE});
});
document.getElementById('resultAction').onclick=()=>{
  if(eventMode==='weekend'&&eventStage==='qualifying')beginEvent('weekend',true);
  else openMenu();
};
document.getElementById('btnTut').onclick=startTutorial;
document.getElementById('btnSetup').onclick=()=>{const b=document.getElementById('setupBox');b.style.display=b.style.display==='block'?'none':'block';};
document.getElementById('setupClose').onclick=()=>{document.getElementById('setupBox').style.display='none';};
[0,1,2].forEach(i=>{document.getElementById('sc'+i).onclick=()=>applySetup(i);});
document.getElementById('btnCtrl').onclick=()=>{document.getElementById('ctrlBox').style.display='block';};
document.getElementById('btnCtrlClose').onclick=()=>{document.getElementById('ctrlBox').style.display='none';};
document.getElementById('tutSkip').onclick=()=>beginRace(false);
document.getElementById('cgBtn').onclick=openMenu;
document.getElementById('tutPrev').onclick=()=>{if(tutPage>0){tutPage--;renderPage();}};
document.getElementById('tutNext').onclick=()=>{if(tutPage<PAGES.length-1){tutPage++;renderPage();}else startGatePhase();};

function gearRatio(){return vehicleTransmission.ratioForGear(u.gear,TRANSMISSION_CONFIG);}
function gearbox(dt){
  vehicleTransmission.update(u,dt,u._wheelOmegaR*WHEEL_R,ms.thr,TRANSMISSION_CONFIG);
}
function driveForce(){
  if(u._shiftTorqueFactor<=0||ms.thr<=0)return 0;
  if(eventActive&&eventStage==='race'&&raceStartState==='formation'
    &&u.vf>=formationTargetSpeed('PLAYER',racePlayerProgress))return 0;
  if(u.rpm>REDLINE+120)return 0;
  const gr=gearRatio();
  const fT=TPEAK*torqueN(u.rpm)*gr/WHEEL_R*0.9;
  const fP=PPEAK*pN(u.rpm)*0.9/Math.max(Math.abs(u.vf),3);
  const damageFactor=eventActive&&DAMAGE_ENABLED?Math.max(0.65,1-eventPlayerDamage*0.35):1;
  const F=Math.min(fT,fP)*damageFactor*u._shiftTorqueFactor;
  if(u.gear===0){
    if(u.vf>-REV_MAXV)return -Math.min(REV_FORCE,F)*ms.thr;
    return 0;
  }
  return F*ms.thr;
}
function engineBrake(){
  if(u._shiftTorqueFactor<=0||ms.thr>0||Math.abs(u.vf)<1)return 0;
  return -Math.sign(u.vf)*EB_TQ*gearRatio()/WHEEL_R*0.9*u._shiftTorqueFactor;
}

function step(H,now){
  const wa=clamp(u.steer/SR,-MWA,MWA);
  const cl=nearest(car.position,u.wpi);
  const tn=curve.getTangentAt((cl.i%NW)/NW).normalize();
  const sOff=(car.position.x-cl.p.x)*(-tn.z)+(car.position.z-cl.p.z)*(tn.x);
  const d=Math.abs(sOff);
  const wLim=limAt(cl.i%NW,sOff>=0?1:-1);
  if(mode==='race'&&u.lapValid&&d>TW+KW+CAR_HW){u.lapValid=false;u._wallT=2.5;}
  let surf,dragK=0;
  if(d>TW+KW+1.8){surf='grass';dragK=0.10;}
  else if(d>TW+KW){surf='edge';dragK=0.03;}
  else if(d>TW){surf='kerb';}
  else surf='track';
  if(d>45)dragK=Math.max(dragK,0.25);
  if(d>80)dragK=Math.max(dragK,0.50);
  if(surf==='grass'&&u.prevSurf!=='grass'){u.vl-=Math.sign(sOff)*Math.abs(u.vf)*0.08;}
  u.prevSurf=surf;u.surf=surf;
  const mu=muOf(surf);
  car.position.y=0.1;
  if(surf==='kerb'&&Math.abs(u.vf)>10)car.position.y+=Math.sin(now*0.045)*0.02;
  u._dPrev=d;

  let vf=u.vf,vl=u.vl,r=u.yaw;
  const v=Math.abs(vf);
  const vT=Math.hypot(vf,vl);
  const sr=clamp(vf/0.5,-1,1);
  const aero=aerodynamics.compute(vT,AERO_CONFIG);
  const dragF=aero.drag;
  u._aero=aero.total;
  const wheelLoads=suspension.step(suspensionState,{
    ...SUSPENSION_INPUT,aero,longitudinalAcceleration:u._aLon,lateralAcceleration:u._ay
  },H,SU);
  const frontWheelLoads=wheelLoads.front;
  const rearWheelLoads=wheelLoads.rear;
  const muF=mu*SU.camberGripFront;
  const muR=mu*SU.camberGripRear;
  const capFLong=tires.computeAxleGrip(frontWheelLoads,muF,REFERENCE_WHEEL_LOAD,TIRE_LOAD_SENSITIVITY);
  const capRLong=tires.computeAxleGrip(rearWheelLoads,muR,REFERENCE_WHEEL_LOAD,TIRE_LOAD_SENSITIVITY);
  let driveDemand=driveForce();
  const driveLimit=capRLong*TCS_FRAC[TCS_LVL];
  if(TCS_LVL>0&&driveDemand>driveLimit){driveDemand=driveLimit;u._tc=true;}
  else u._tc=false;
  if(TCS_LVL>0&&driveDemand>0&&u._lockR>0.35){
    driveDemand*=(1-TCS_CUT[TCS_LVL]*Math.min(1,u._lockR));
    u._tc=true;
  }
  let brkIn=ms.brk;
  if(eventActive&&eventStage==='race'&&raceStartState==='formation'){
    const targetSpeed=formationTargetSpeed('PLAYER',racePlayerProgress);
    if(u.vf>targetSpeed)brkIn=Math.max(brkIn,clamp((u.vf-targetSpeed)*0.12,0,0.65));
  }
  if(ABS_LVL>0&&u._lockF>0.3)brkIn*=(1-ABS_CUT[ABS_LVL]*Math.min(1,u._lockF));
  const frontWheelSpeed=vf*Math.cos(wa)+(vl+r*LF)*Math.sin(wa);
  const slipF=(u._wheelOmegaF*WHEEL_R-frontWheelSpeed)/Math.max(Math.abs(frontWheelSpeed),1);
  const slipR=(u._wheelOmegaR*WHEEL_R-vf)/Math.max(Math.abs(vf),1);
  const brakeForce=MAXBRK*brkIn;
  const frontDriveTorque=0;
  const rearDriveTorque=(driveDemand+engineBrake())*WHEEL_R/2;
  const frontBrakeTorque=brakeForce*BRK_BIAS_F*WHEEL_R/2;
  const rearBrakeTorque=brakeForce*(1-BRK_BIAS_F)*WHEEL_R/2;
  const tireStiffnessF=CF_WET(WET?0.85:1,SU.CF);
  const tireStiffnessR=CR_WET(WET?0.85:1,SU.CR);
  const FxF=tires.computeAxleLongitudinalForce(
    slipF,frontWheelLoads,muF,REFERENCE_WHEEL_LOAD,TIRE_LOAD_SENSITIVITY,tireStiffnessF
  );
  const FxR=tires.computeAxleLongitudinalForce(
    slipR,rearWheelLoads,muR,REFERENCE_WHEEL_LOAD,TIRE_LOAD_SENSITIVITY,tireStiffnessR
  );
  const wheelInertia=1.2;
  const brakeSignF=Math.sign(u._wheelOmegaF||frontWheelSpeed);
  const brakeSignR=Math.sign(u._wheelOmegaR||vf);
  u._wheelOmegaF+=(
    frontDriveTorque-frontBrakeTorque*brakeSignF-FxF*WHEEL_R
  )/wheelInertia*H;
  u._wheelOmegaR+=(
    rearDriveTorque-rearBrakeTorque*brakeSignR-FxR*WHEEL_R
  )/wheelInertia*H;
  if(brakeForce>0&&u._wheelOmegaF*frontWheelSpeed<0)u._wheelOmegaF=0;
  if(brakeForce>0&&u._wheelOmegaR*vf<0)u._wheelOmegaR=0;
  u._wheelSlipF=slipF;u._wheelSlipR=slipR;
  const lockTarget=brkIn>0?clamp((-slipF-0.08)/0.18,0,1):0;
  const spinTarget=driveDemand>0?clamp((slipR-0.08)/0.22,0,1):0;
  u._lockF+=(lockTarget-u._lockF)*Math.min(1,25*H);
  u._lockR+=(spinTarget-u._lockR)*Math.min(1,25*H);
  const fade=clamp(vT/2,0,1);
  // FIX: toe bias scaled by fade => no constant pull at standstill/low speed
  const af=(Math.atan2(vl+r*LF,Math.max(vf,0.8)) - wa + SU.TOE_F)*fade;
  const ar=(Math.atan2(vl-r*LR,Math.max(vf,0.8)) - SU.TOE_R*0.6)*fade;
  const capF=tires.computeLateralCapacity(capFLong,FxF);
  const capR=tires.computeLateralCapacity(capRLong,FxR);
  const CW=WET?0.85:1;
  const FyFt=tires.lateralTireForce(af,capF,CF_WET(CW,SU.CF));
  const FyRt=tires.lateralTireForce(ar,capR,CR_WET(CW,SU.CR));
  const aF=1-Math.exp(-Math.max(vT,1)/SU.REL_F*H);
  const aR=1-Math.exp(-Math.max(vT,1)/SU.REL_R*H);
  u._FyF+=(FyFt-u._FyF)*aF;
  u._FyR+=(FyRt-u._FyR)*aR;
  const FyF=u._FyF,FyR=u._FyR;
  // Rear-axle saturation feeds wear and skid-mark state without adding artificial yaw torque.
  const satR=clamp((Math.abs(SU.CR*ar)-capR)/(capR*0.5+1),0,1)*clamp((Math.abs(ar)-0.03)/0.05,0,1);
  u._satS+=(satR-u._satS)*Math.min(1,10*H);
  const ay=(FyF*Math.cos(wa)+FyR)/MASS;
  const vSafe=Math.max(vT,1);
  const ax=(FxF+FxR)/MASS - dragF*(vf/vSafe)/MASS - ROLL*9.81*sr - dragK*vf;
  let rdot=(LF*FyF*Math.cos(wa)-LR*FyR)/YAW_INERTIA;
  vf+=(ax+vl*r)*H;
  vl+=(ay-vf*r)*H;
  vl-=dragF*(vl/vSafe)/MASS*H;
  r+=rdot*H;
  if(brkIn>0.3&&Math.abs(vf)<0.35&&ms.thr===0)vf=0;
  if(ms.thr===0&&vT<0.9){
    const k=Math.min(1,12*H);
    vl-=vl*k;r-=r*k;
  }
  vf=clamp(vf,-8,MAXSPD);vl=clamp(vl,-22,22);r=clamp(r,-2.2,2.2);
  if(!isFinite(vf)||!isFinite(vl)||!isFinite(r)||!isFinite(u.heading)){vf=0;vl=0;r=0;}
  u._aLon=ax;u._ay=ay;u._ar=ar;
  const wearRate=0.003+Math.min(3,Math.abs(ay)/9.81)*0.012
    +clamp(Math.abs(u.steer)/SMAX,0,1)*0.004+ms.brk*0.006+(u._satS||0)*0.012;
  u.tireWear=Math.max(0,u.tireWear-wearRate*H);
  u.vf=vf;u.vl=vl;u.yaw=r;
  u.heading+=r*H;

  if(d>wLim){
    const toC=new THREE.Vector3(cl.p.x-car.position.x,0,cl.p.z-car.position.z).normalize();
    car.position.add(toC.clone().multiplyScalar(d-wLim));
    const fx=Math.sin(u.heading),fz=Math.cos(u.heading),rx=Math.cos(u.heading),rz=-Math.sin(u.heading);
    let vx=fx*u.vf+rx*u.vl,vz=fz*u.vf+rz*u.vl;
    const vn=vx*toC.x+vz*toC.z;
    if(vn<0){
      const sev=Math.min(1,-vn/22);
      u._impact=Math.max(u._impact||0,sev);
      vx-=toC.x*vn*1.25;vz-=toC.z*vn*1.25;
      const tx2=-toC.z,tz2=toC.x;
      const vt=vx*tx2+vz*tz2;
      vx-=tx2*vt*0.30*sev;vz-=tz2*vt*0.30*sev;
      u.yaw+=Math.sign(sOff)*0.25*sev;
    }
    u.vf=vx*fx+vz*fz;u.vl=vx*rx+vz*rz;u.yaw*=0.9;
  }
  const fx=Math.sin(u.heading),fz=Math.cos(u.heading),rx=Math.cos(u.heading),rz=-Math.sin(u.heading);
  car.position.x+=(fx*u.vf+rx*u.vl)*H;
  car.position.z+=(fz*u.vf+rz*u.vl)*H;
  if(eventActive)solveAIContacts();
  const rRate=u.vf*(1+1.0*u._lockR),fRate=u.vf*(1-0.85*u._lockF);
  u.w[0].rotation.x+=rRate*H*2.5;u.w[1].rotation.x+=rRate*H*2.5;
  u.w[2].rotation.x+=fRate*H*2.5;u.w[3].rotation.x+=fRate*H*2.5;
}
function CF_WET(cw,c){return c*cw;}
function CR_WET(cw,c){return c*cw;}
function updPlayer(dt,now){
  u.steer=vehicleControls.stepSteering(u.steer,keys,dt,STEERING_CONFIG);
  u.pv.forEach(p=>p.rotation.y=clamp(u.steer/SR,-MWA,MWA));
  gearbox(dt);
  acc+=dt;const H=1/240;let n=0;
  while(acc>=H&&n<10){step(H,now);acc-=H;n++;}
  if(n>=10)acc=0;
  u.latG=Math.abs(u._ay)/9.81;
  u.slipR=Math.abs(u._ar)/D2R;
  if(u._wallT>0)u._wallT-=dt;
  if(u._impact>0)u._impact=Math.max(0,u._impact-dt*2.2);
  car.rotation.y=u.heading;
  chassis.rotation.z=clamp(suspensionState.roll,-0.11,0.11);
  chassis.rotation.x=clamp(suspensionState.pitch,-0.07,0.06);
  chassis.position.y=clamp(-suspensionState.heave,-0.12,0);
  updMarks();
}
let acc=0;

function lapCheck(count){
  const wpn=wp[u.wpi];
  if(Math.hypot(car.position.x-wpn.x,car.position.z-wpn.z)<35){
    const nx2=(u.wpi+1)%NW;u.wpi=nx2;
    if(nx2===0){
      if(eventActive&&eventStage==='race'&&raceStartState==='green'&&!playerRaceStarted){
        playerRaceStarted=true;u.lap=1;lapStart=elapsed;
        logAction('race-start-line');
        return;
      }
      if(!count)return;
      const lt2=elapsed-lapStart;
      u.lap++;
      prevLap=lt2;prevValid=u.lapValid;
      if(u.lapValid&&lt2>5){
        const cb=curBest();
        if(cb===0||lt2<cb)setBest(lt2);
      }
      u.lapValid=true;
      lapStart=elapsed;
      if(eventActive)finishPlayerLap(lt2,prevValid);
    }
  }
}
function fmt(t){if(!t||t<=0)return'--:--.---';const m=Math.floor(t/60),s=Math.floor(t%60),mss=Math.floor((t%1)*1000);return`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(mss).padStart(3,'0')}`;}

const $=id=>document.getElementById(id);
const tE=$('timer'),lE=$('lap'),spE=$('spd'),grE=$('gr'),gfE=$('gf'),sfE=$('sf'),ltE=$('lt'),bsE=$('best'),bfE=$('bf'),tfE=$('tf'),aidE=$('aid'),swC=$('sw'),swX=swC.getContext('2d'),mC=$('mm'),mX=mC.getContext('2d'),wwE=$('wallWarn');
function hud(){
  tE.textContent=eventActive?`剩余 ${fmt(Math.max(0,eventDurationSeconds-eventElapsed))}`:fmt(timerOn?elapsed:0);
  lE.textContent=`VUELTA ${u.lap}`+(prevLap?` · PREV ${fmt(prevLap)} ${prevValid?'✓':'✗废'}`:'')+(u.lapValid?'':' · ⛔本圈废');
  lE.style.color=u.lapValid?'#fff':'#f66';
  spE.innerHTML=Math.round(Math.hypot(u.vf,u.vl)*3.6)+' <small>km/h</small>';
  const g=u.gear===0?'R':(Math.abs(u.vf)<0.6&&ms.thr===0?'N':String(u.gear));
  grE.textContent=`SEQ · ${g} · ${Math.round(u.rpm)}rpm`+(u.shiftT>0?' ⇄':'')+(u._tc?' TC':'');
  grE.style.color=(u.rpm>8000||u.gear===0)?'#f33':'#fa0';
  gfE.textContent='G: '+u.latG.toFixed(2)+(u.slipR>6?` · β${u.slipR.toFixed(0)}°`:'')+((u._satS||0)>0.3?' ⚠️':'')+((u._lockR||0)>0.4?' 💨':((u._lockF||0)>0.4?' 🔒':''));
  gfE.style.color=u.latG>2.6?'#f33':(u.latG>1.6?'#fa0':'#0df');
  const damageText=eventActive&&DAMAGE_ENABLED?` · DAMAGE:${Math.round(eventPlayerDamage*100)}%`:'';
  aidE.textContent=`TCS:${TCS_LVL} ABS:${ABS_LVL} · SET:${SU.tag} · TIRE:${Math.round(u.tireWear)}% · ${AERO_MODE}:${Math.round((u._aero||0)/9.81)}kg${WET?' 🌧':''}${damageText}`;
  aidE.style.color=(TCS_LVL===0&&ABS_LVL===0)?'#f66':'#8cf';
  ltE.textContent='LAP: '+fmt(timerOn?Math.max(0,elapsed-lapStart):0);
  bsE.textContent='BEST(干净圈): '+fmt(curBest());
  const names={track:'🟢 PISTA',kerb:'⬛ RUMBLE',edge:'⚠️ 2 RUEDAS FUERA',grass:'🟩 CÉSPED ¡DERRAPE!'};
  sfE.textContent=names[u.surf];
  sfE.style.color=u.surf==='track'?'#0f0':(u.surf==='kerb'?'#fff':(u.surf==='edge'?'#fa0':'#f55'));
  bfE.style.height=(ms.brk*100)+'%';tfE.style.height=(ms.thr*100)+'%';
  wwE.style.display=u._wallT>0?'block':'none';
  const raceInfo=$('raceInfo');
  if(eventActive&&performance.now()-boardRefreshAt>250){
    boardRefreshAt=performance.now();
    const qualifying=eventStage==='qualifying';
    const standings=eventStandings(qualifying);
    const leader=standings[0];
    const label=eventMode==='weekend'?(qualifying?'比赛周 · 排位':'比赛周 · 正赛')
      :(qualifying?'排位赛':'正赛');
    const remaining=Math.max(0,eventDurationSeconds-eventElapsed);
    const nextRelease=aiDrivers.find(ai=>eventStage==='qualifying'&&!ai.started);
    const status=eventTimeExpired?'<span class="flag">方格旗已出 · 完成当前圈</span>'
      :eventStage==='qualifying'&&nextRelease?`分开发车 · 间隔20s · 下一车 ${Math.max(0,nextRelease.startAt-eventElapsed).toFixed(1)}s`
      :eventStage==='race'&&raceStartState!=='green'?'编队圈 · 100km/h限速 · 禁止超车'
      :`剩余 ${fmt(remaining)}`;
    const rows=standings.map((entry,index)=>{
      let gap='LEADER';
      if(index>0){
        if(qualifying){
          gap=entry.bestLap?`+${(entry.bestLap-leader.bestLap).toFixed(3)}s`:'--';
        }else{
          const meters=Math.max(0,leader.progress-entry.progress);
          const lapsBehind=Math.floor(meters/trackLength);
          const seconds=(meters%trackLength)/Math.max(20,(leader.speed+entry.speed)*0.5);
          gap=`${lapsBehind?`+${lapsBehind}L `:''}+${seconds.toFixed(1)}s`;
        }
      }
      const damage=entry.damage>0.01?` · 伤${Math.round(entry.damage*100)}%`:'';
      return `<div class="boardRow${entry.player?' player':''}"><span>P${index+1}</span><span class="driver">${entry.name}<small> · ${entry.skill} · ${entry.vehicle} · 胎${Math.round(entry.tireWear)}%${damage}</small></span><span class="boardLap">${entry.laps}L</span><span class="boardGap">${gap}</span></div>`;
    }).join('');
    raceInfo.innerHTML=`<div class="boardTitle"><strong>${label}</strong><span>${status}</span></div>${rows}`;
  }else if(!eventActive&&!eventFinished)raceInfo.style.display='none';
  swX.clearRect(0,0,120,120);swX.save();swX.translate(60,60);swX.rotate(-u.steer);
  swX.strokeStyle='#aaa';swX.lineWidth=8;swX.beginPath();swX.arc(0,0,44,0,Math.PI*2);swX.stroke();
  swX.fillStyle='#333';swX.beginPath();swX.arc(0,0,12,0,Math.PI*2);swX.fill();
  swX.strokeStyle='#888';swX.lineWidth=6;swX.beginPath();
  swX.moveTo(-39,0);swX.lineTo(-12,0);swX.moveTo(39,0);swX.lineTo(12,0);swX.moveTo(0,39);swX.lineTo(0,12);swX.stroke();
  swX.fillStyle='#f00';swX.beginPath();swX.arc(0,-39,4,0,Math.PI*2);swX.fill();swX.restore();
}
function mmap(){
  mX.clearRect(0,0,150,150);
  let a=1e9,b=-1e9,c=1e9,d2=-1e9;
  for(let i=0;i<NW;i+=30){const p=wp[i];a=Math.min(a,p.x);b=Math.max(b,p.x);c=Math.min(c,p.z);d2=Math.max(d2,p.z);}
  const s2=Math.min(130/(b-a),130/(d2-c)),ox=(150-(b-a)*s2)/2,oz=(150-(d2-c)*s2)/2;
  const tx=x=>ox+(x-a)*s2,tz=z=>oz+(z-c)*s2;
  mX.strokeStyle='#666';mX.lineWidth=9;mX.lineCap='round';mX.beginPath();
  for(let i=0;i<=NW;i+=30){const p=wp[i%NW];i===0?mX.moveTo(tx(p.x),tz(p.z)):mX.lineTo(tx(p.x),tz(p.z));}
  mX.closePath();mX.stroke();
  if(mode==='tutorial'&&!tutPassed&&tutPhase==='gate'){
    const p=wp[gates[0].idx];
    mX.fillStyle='#ff0';
    mX.beginPath();mX.arc(tx(p.x),tz(p.z),5,0,Math.PI*2);mX.fill();
  }
  aiDrivers.forEach((ai,index)=>{
    if(!ai.mesh.visible)return;
    const p=ai.mesh.position;
    mX.fillStyle=['#f66','#59f','#fd5','#c8f','#fa6','#5dd','#def'][index];
    mX.beginPath();mX.arc(tx(p.x),tz(p.z),3.5,0,Math.PI*2);mX.fill();
  });
  mX.fillStyle='#4f4';mX.beginPath();mX.arc(tx(car.position.x),tz(car.position.z),5,0,Math.PI*2);mX.fill();
}

const CAM_OFF=new THREE.Vector3(0,2.9,-9.2);
const CAM_LOOK=new THREE.Vector3(0,1.0,4.5);
let lt=performance.now(),menuAng=0;
function loop(){
  requestAnimationFrame(loop);
  const now=performance.now();let dt=Math.min((now-lt)/1000,0.05);lt=now;
  if(WET){
    for(let i=0;i<RN;i++){
      rainArr[i*3+1]-=36*dt;
      if(rainArr[i*3+1]<0)rainArr[i*3+1]+=40;
    }
    rainAttr.needsUpdate=true;
    rain.position.set(car.position.x,0,car.position.z);
  }
  if(mode==='menu'){
    menuAng+=dt*0.25;
    cam.position.set(car.position.x+Math.sin(menuAng)*14,4.5,car.position.z+Math.cos(menuAng)*14);
    cam.lookAt(car.position.clone().add(new THREE.Vector3(0,1,0)));
    hud();mmap();R.render(scene,cam);
    return;
  }
  if(mode==='race'){
    if(eventFinished){hud();mmap();R.render(scene,cam);return;}
    if(!timerOn&&(keys.a||keys.d||ms.thr>0||ms.brk>0)){
      timerOn=true;lapStart=0;elapsed=0;
      if(eventActive&&eventStage==='race'&&raceStartState==='grid'){
        raceStartState='formation';
        logAction('formation-lap-start',{speedLimitMps:FORMATION_SPEED});
      }
    }
    if(timerOn){
      elapsed+=dt;
      if(eventActive){
        if(eventStage==='qualifying'||raceStartState==='green'){
          eventElapsed+=dt;
          if(eventElapsed>=eventDurationSeconds)eventTimeExpired=true;
        }
      }
    }
    updPlayer(dt,now);
    if(eventActive&&eventStage==='race'&&raceStartState==='formation'){
      racePlayerProgress+=Math.max(0,u.vf)*dt;
      if(raceGridOrder[0]==='PLAYER'&&racePlayerProgress>=trackLength)startRaceGreen();
    }
    updateAI(dt);
    if(timerOn)lapCheck(!eventActive||eventStage==='qualifying'||(raceStartState==='green'&&playerRaceStarted));
  }else{
    updPlayer(dt,now);
    lapCheck(false);
    updateTutorial(dt);
  }
  sampleOperationLog(dt);
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),u.heading);
  cam.position.copy(car.position).add(CAM_OFF.clone().applyQuaternion(q));
  if((u._impact||0)>0.02){
    cam.position.x+=(Math.random()-0.5)*0.35*u._impact;
    cam.position.y+=(Math.random()-0.5)*0.22*u._impact;
  }
  cam.lookAt(car.position.clone().add(CAM_LOOK.clone().applyQuaternion(q)));
  hud();mmap();R.render(scene,cam);
}
addEventListener('resize',()=>{cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();R.setSize(innerWidth,innerHeight);});
openMenu();
loop();
} // end initGame

loadThree(0, initGame, function(){
  document.getElementById('loading').style.display='none';
  document.getElementById('em').innerHTML='Three.js 所有CDN源均加载失败<br>请检查网络连接后重试';
  document.getElementById('err').style.display='block';
});
