(function() {
  function createTrackCourse(THREE, scene, config) {
    const TW = config.trackWidth;
    const KW = config.kerbWidth;
    const RW = config.runoffWidth;
    const WALLD = TW + KW + RW;
    const CAR_HW = config.carWidth / 2;
    const CAR_LEN = config.carLength;
    const CP = [
      [-334,-619],[10,-348],[-67,-24],[114,198],[85,275],[60,345],[95,405],[165,395],[205,335],
      [619,-167],[690,-306],[600,-444],[590,-516],[672,-510],[786,-474],
      [982,-382],[1038,-24],[1001,358],[677,462],[396,552],[336,636],[276,720],
      [72,702],[-144,732],[-200,510],[-619,191],[-1025,-95],[-996,-216],[-905,-334],
      [-762,-520],[-738,-634],[-524,-767]
    ].map(point => new THREE.Vector3(point[0],0,point[1]));
    const curve = new THREE.CatmullRomCurve3(CP,true,'catmullrom',0.5);
    const NW = 3600;
    const wp = [];
    const WP_SP = curve.getLength() / NW;
    for(let i=0;i<NW;i++)wp.push(curve.getPointAt(i/NW));

    const scA = new Float32Array(NW);
    for(let i=0;i<NW;i++){
      const current=curve.getTangentAt(i/NW);
      const ahead=curve.getTangentAt(((i+10)%NW)/NW);
      scA[i]=Math.atan2(current.x*ahead.z-current.z*ahead.x,current.dot(ahead));
    }
    for(let pass=0;pass<6;pass++){
      for(let i=0;i<NW;i++)scA[i]=(scA[(i-1+NW)%NW]+scA[i]*2+scA[(i+1)%NW])/4;
    }
    let scMax=1e-6;
    for(let i=0;i<NW;i++)scMax=Math.max(scMax,Math.abs(scA[i]));

    const Rad=new Float32Array(NW),ins=new Int8Array(NW);
    for(let i=0;i<NW;i++){
      const curvature=Math.abs(scA[i])/(10*WP_SP);
      Rad[i]=1/Math.max(curvature,1e-5);
      ins[i]=scA[i]>0?1:-1;
    }
    for(let pass=0;pass<3;pass++){
      for(let i=0;i<NW;i++)Rad[i]=Math.min(Rad[i],Rad[(i-1+NW)%NW],Rad[(i+1)%NW]);
    }

    const prox=new Float32Array(NW),sNear=new Int8Array(NW);
    for(let i=0;i<NW;i++){
      let best=1e9,bestIndex=0;
      for(let j=0;j<NW;j+=4){
        const distance=Math.abs(i-j),wrappedDistance=Math.min(distance,NW-distance);
        if(wrappedDistance<250)continue;
        const separation=Math.hypot(wp[i].x-wp[j].x,wp[i].z-wp[j].z);
        if(separation<best){best=separation;bestIndex=j;}
      }
      prox[i]=best;
      const tangent=curve.getTangentAt(i/NW);
      sNear[i]=((wp[bestIndex].x-wp[i].x)*(-tangent.z)
        +(wp[bestIndex].z-wp[i].z)*tangent.x)>=0?1:-1;
    }
    for(let pass=0;pass<2;pass++){
      for(let i=0;i<NW;i++)prox[i]=Math.min(
        prox[i],prox[(i-4+NW)%NW],prox[(i+4)%NW]
      );
    }

    function isOpen(index,side){
      if(side===sNear[index]&&prox[index]<WALLD+TW+4)return true;
      if(side===ins[index]&&Rad[index]<TW+KW+10)return true;
      return false;
    }
    function limAt(index,side){
      if(isOpen(index,side))return 400;
      if(side===ins[index])return Math.min(
        WALLD,Math.max(TW+KW+CAR_LEN*0.45+3.6,Rad[index]*0.85)
      );
      return WALLD;
    }
    function nearest(position,hint){
      let minimumDistance=1e9,closestPoint=null,closestIndex=hint;
      const range=420,start=(hint-range+NW)%NW;
      for(let offset=0;offset<range*2;offset++){
        const index=(start+offset)%NW,point=wp[index];
        const distance=Math.hypot(position.x-point.x,position.z-point.z);
        if(distance<minimumDistance){
          minimumDistance=distance;closestPoint=point;closestIndex=index;
        }
      }
      return{d:minimumDistance,p:closestPoint,i:closestIndex};
    }

    function makeRibbon(widthAt,y,options){
      const segments=1100,positions=[],colors=[],indices=[];
      for(let i=0;i<=segments;i++){
        const t=(i/segments)%1,index=Math.floor(t*NW)%NW;
        const point=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize();
        const normal=new THREE.Vector3(-tangent.z,0,tangent.x);
        const left=widthAt(index,-1),right=widthAt(index,1);
        positions.push(
          point.x+normal.x*left,point.y+y,point.z+normal.z*left,
          point.x+normal.x*right,point.y+y,point.z+normal.z*right
        );
        if(options&&options.vertexColor){
          const factor=Math.min(1,Math.abs(scA[index])/(scMax*0.5));
          const color=options.vertexColor(factor,index);
          colors.push(...color,...color);
        }
      }
      for(let i=0;i<segments;i++){
        const a=i*2,b=a+1,c=(i+1)*2,d=c+1;
        indices.push(a,c,b,b,c,d);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setIndex(indices);
      if(options&&options.vertexColor){
        geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      }
      geometry.computeVertexNormals();
      const material=options.vertexColor
        ?new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide})
        :new THREE.MeshBasicMaterial({color:options.color,side:THREE.DoubleSide});
      scene.add(new THREE.Mesh(geometry,material));
      return material;
    }

    const groundMaterial=new THREE.MeshBasicMaterial({color:0x47823a});
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(20000,20000),groundMaterial);
    ground.rotation.x=-Math.PI/2;ground.position.y=-0.9;scene.add(ground);
    const trackMaterial=makeRibbon((index,side)=>side*TW,0,{color:0x565a5c});
    const kerbColor=(factor,index)=>{
      const color=Math.floor(index/45)%2===0?0.88:0.10;
      return[color,color,color];
    };
    makeRibbon((index,side)=>side<0?-(TW+KW):-TW,0.05,{vertexColor:kerbColor});
    makeRibbon((index,side)=>side<0?TW:TW+KW,0.05,{vertexColor:kerbColor});
    makeRibbon((index,side)=>side*1.7,0.09,{
      vertexColor:factor=>{const color=0.30+(0.10-0.30)*factor;return[color,color,color];}
    });

    const wallSpacing=curve.getLength()/1100*2+0.6;
    const wallGeometry=new THREE.BoxGeometry(1.0,1.5,wallSpacing);
    const wallMaterials=[
      new THREE.MeshBasicMaterial({color:0x8a2f23}),
      new THREE.MeshBasicMaterial({color:0xdddddd})
    ];
    for(let side=-1;side<=1;side+=2){
      for(let i=0;i<1100;i+=2){
        const index=Math.floor(i/1100*NW)%NW;
        if(isOpen(index,side))continue;
        const boundary=limAt(index,side),t=i/1100;
        const point=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize();
        const normal=new THREE.Vector3(-tangent.z,0,tangent.x);
        const wall=new THREE.Mesh(wallGeometry,wallMaterials[Math.floor(i/8)%2]);
        wall.position.set(point.x+normal.x*side*boundary,0.7,point.z+normal.z*side*boundary);
        wall.rotation.y=Math.atan2(tangent.x,tangent.z);
        scene.add(wall);
      }
    }

    const startPoint=curve.getPointAt(0),startTangent=curve.getTangentAt(0).normalize();
    const checker=document.createElement('canvas');
    checker.width=128;checker.height=32;
    const context=checker.getContext('2d');
    for(let x=0;x<16;x++)for(let y=0;y<4;y++){
      context.fillStyle=(x+y)%2===0?'#fff':'#000';
      context.fillRect(x*8,y*8,8,8);
    }
    const startLine=new THREE.Mesh(
      new THREE.PlaneGeometry(TW*2,3),
      new THREE.MeshBasicMaterial({
        map:new THREE.CanvasTexture(checker),side:THREE.DoubleSide
      })
    );
    startLine.rotation.x=-Math.PI/2;
    startLine.position.set(startPoint.x,0.09,startPoint.z);
    startLine.rotation.z=-Math.atan2(startTangent.x,startTangent.z);
    scene.add(startLine);

    return {
      TW,KW,RW,WALLD,CAR_HW,CAR_LEN,CP,curve,NW,wp,WP_SP,scA,scMax,Rad,ins,prox,sNear,
      isOpen,limAt,nearest,trackLength:curve.getLength(),
      groundMaterial,trackMaterial
    };
  }

  window.GameModules = window.GameModules || {};
  window.GameModules.createTrackCourse = createTrackCourse;
})();
