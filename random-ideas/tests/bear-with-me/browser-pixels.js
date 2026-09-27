/* Pixel-level regressions: real SVG masks, clipping, ordering and source alpha. */
window.BearPixelTests = async () => {
  const r=bearMachine.renderer, NS='http://www.w3.org/2000/svg', results=[], assets=new Map();
  document.querySelector('.audit-gallery')?.remove();document.querySelector('.page').style.display='';
  const test=async(name,fn)=>{try{const details=await fn();results.push({name,pass:true,...details});}catch(e){results.push({name,pass:false,error:e.message});}};
  const assert=(yes,message)=>{if(!yes)throw new Error(message);};
  const pose=values=>{r.reset();Object.assign(r.state,{lid:1,rise:0,...values});r.render();document.getElementById('invitation').setAttribute('opacity','0');};
  async function raster({ids,box=[200,110,480,340],scale=2,remove=[],unclip=[]}={}) {
    const source=document.getElementById('machine-art');
    const svg=ids?document.createElementNS(NS,'svg'):source.cloneNode(true);
    svg.setAttribute('xmlns',NS);svg.setAttribute('viewBox',box.join(' '));svg.setAttribute('width',Math.round(box[2]*scale));svg.setAttribute('height',Math.round(box[3]*scale));svg.removeAttribute('id');
    if(ids){svg.append(source.querySelector('defs').cloneNode(true));for(const side of ['left','right'])svg.querySelector('defs').append(document.getElementById(`${side}-arm-surface`).cloneNode(true));for(const id of ids)svg.append(document.getElementById(id).cloneNode(true));}
    for(const selector of remove)svg.querySelectorAll(selector).forEach(el=>el.remove());
    for(const selector of unclip)svg.querySelectorAll(selector).forEach(el=>el.removeAttribute('clip-path'));
    // One embedded copy of each PNG keeps the standalone SVG compact.
    const sources=new Map();
    for(const im of [...svg.querySelectorAll('image')]) {
      const href=im.getAttribute('href');if(!href||href.startsWith('#')||href.startsWith('data:'))continue;
      if(!assets.has(href)){const blob=await(await fetch(href)).blob();assets.set(href,await new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.readAsDataURL(blob);}));}
      const key=[href,im.getAttribute('width'),im.getAttribute('height'),im.getAttribute('preserveAspectRatio')].join('|');
      if(!sources.has(key)){const asset=document.createElementNS(NS,'image');asset.id=`pixel-asset-${sources.size}`;asset.setAttribute('href',assets.get(href));asset.setAttribute('width',im.getAttribute('width'));asset.setAttribute('height',im.getAttribute('height'));asset.setAttribute('preserveAspectRatio',im.getAttribute('preserveAspectRatio')||'xMidYMid meet');svg.querySelector('defs').append(asset);sources.set(key,asset.id);}
      const use=document.createElementNS(NS,'use');for(const a of im.attributes)if(a.name!=='href')use.setAttribute(a.name,a.value);use.setAttribute('href','#'+sources.get(key));im.replaceWith(use);
    }
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
    try{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return {data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};}finally{URL.revokeObjectURL(url);}
  }
  const different=(a,b,tolerance=2)=>{let n=0;for(let i=0;i<a.data.length;i+=4)if([0,1,2,3].some(k=>Math.abs(a.data[i+k]-b.data[i+k])>tolerance))n++;return n;};
  await test('inside paw stays in front of the face above the rim',async()=>{
    pose({lx:373,ly:236,leftInside:1});const box=[373+r.layout.offsetX-3,238,6,5];
    const actual=await raster({box,scale:4}),reference=await raster({box,scale:4,remove:['#bear-head']});
    const pixels=different(actual,reference);assert(pixels===0,`${pixels} paw-pad pixels were replaced by the head`);return {pixels:actual.width*actual.height};
  });
  await test('inside props remain in front of the face while being stowed',async()=>{
    pose({});r.prop('paper','retired',{anchor:'inside',x:407,y:248,s:.8});const box=[407+r.layout.offsetX-12,240,24,10];
    const pixels=different(await raster({box}),await raster({box,remove:['#bear-head']}));assert(!pixels,`${pixels} paper pixels hidden by face`);
  });
  await test('head cannot paint over the switch during a low peek',async()=>{
    pose({rise:82});const tip=BearRenderer.hardwareGeometry(false).tip,box=[tip.x-1,tip.y+2,2,8];
    const pixels=different(await raster({box,scale:4}),await raster({box,scale:4,remove:['#bear-head']}));assert(!pixels,`${pixels} iron stem pixels replaced by fur`);
  });
  await test('toggle stays centred in its socket and inside the accessible target in both states',async()=>{
    pose({});
    for(const on of [false,true]) {
      r.switch(on);const tip=document.getElementById('lever-tip'),socket=document.getElementById('toggle-socket');
      const button=document.getElementById('machine-switch').getBoundingClientRect();
      const point=(node,x,y)=>new DOMPoint(x,y).matrixTransform(node.getScreenCTM());
      const a=point(tip,+tip.getAttribute('cx'),+tip.getAttribute('cy')),b=point(socket,0,-4);
      assert(Math.abs(a.x-b.x)<.01,'stem drifts sideways in the socket');
      assert(a.x>button.left&&a.x<button.right&&a.y>button.top&&a.y<button.bottom,'switch tip outside button');
      assert(document.elementFromPoint(a.x,a.y)?.id==='machine-switch','visible tip does not receive the pointer');
      assert(button.width>=44&&button.height>=44,'target too small');
    }
  });
  await test('indicator inset and matching finger joints survive the production SVG transforms',async()=>{
    pose({}); const lamp=document.getElementById('indicator-bezel'),front=document.getElementById('box-front');
    const a=new DOMPoint(0,2.5).matrixTransform(lamp.getCTM()),b=new DOMPoint(420,353).matrixTransform(front.getCTM());
    const stage=document.getElementById('machine-art').getCTM().a;
    assert((b.y-a.y)/stage>=4,'indicator sits on the front edge');
    const joints=[...document.querySelectorAll('#front-finger-joints path')].map(el=>el.getBBox());
    assert(joints.length===12,'expected six joints at each front corner');
    for(let i=0;i<12;i+=2){assert(joints[i].y===joints[i+1].y&&joints[i].height===joints[i+1].height,'joint heights differ');assert(Math.abs(joints[i].x+joints[i+1].x+joints[i].width-840)<.001,'joint widths are not mirrored');}
  });
  await test('closed and hovering lids do not paint over either hardware fitting',async()=>{
    const {mount,indicator}=BearRenderer.hardwareGeometry();
    for(const lid of [0,.035,.2]) for(const on of [false,true]) {
      pose({lid,rise:260});r.switch(on);
      for(const [name,box] of [['toggle',[mount.x-8.5,325,17,27]],['indicator',[indicator.x-5.5,340,11,9]]]) {
        const actual=await raster({box,scale:4}),reference=await raster({box,scale:4,remove:['#lid']});
        // The lid may be behind the tall stem; compare only hardware's opaque pixels.
        const fitting=await raster({ids:[name==='toggle'?'toggle-switch':'indicator-lamp'],box,scale:4});
        let samples=0;for(let i=0;i<fitting.data.length;i+=4)if(fitting.data[i+3]===255){assert([0,1,2].every(k=>actual.data[i+k]===reference.data[i+k]),`${name} covered by lid`);samples++;}
        assert(samples>50,'no solid hardware sampled');
      }
    }
  });
  await test('forward paw and cloth are not sliced at y=353',async()=>{
    pose({rx:420-r.layout.offsetX,ry:338,rightInside:0});r.prop('cloth','cloth',{anchor:'right',y:0,s:.8});
    const actual=await raster({ids:['reaching-hands'],box:[380,353,85,22]});
    const count=Array.from(actual.data).filter((v,i)=>i%4===3&&v>200).length;
    assert(count>200,`only ${count} opaque pixels survive below the old clip boundary`);return {visiblePixels:count};
  });
  await test('the showmanship cover conceals the resized toggle',async()=>{
    pose({});r.switch(true);const toggle=BearRenderer.hardwareGeometry().tip;r.prop('cover','cover',{anchor:'world',x:toggle.x,y:toggle.y+1,s:.75});
    const tip=BearRenderer.hardwareGeometry().tip,box=[tip.x-2,tip.y-1,4,17];
    const pixels=different(await raster({box,scale:4}),await raster({box,scale:4,remove:['#toggle-switch']}));
    assert(!pixels,`${pixels} stem pixels protrude through the cover`);
  });
  await test('identical crossed-arm poses have deterministic paint order',async()=>{
    const state={lx:433,ly:291,rx:379,ry:302};pose(state);r.state.leftInside=0;r.render();r.state.rightInside=0;r.render();const a=await raster({box:[365,265,110,78]});
    pose(state);r.state.rightInside=0;r.render();r.state.leftInside=0;r.render();const b=await raster({box:[365,265,110,78]});
    const pixels=different(a,b,0);assert(!pixels,`${pixels} pixels depend on which hand moved first`);
  });
  await test('a crossed forearm cannot cover the other paw',async()=>{
    pose({lx:433,ly:305,rx:379,ry:302,leftInside:0,rightInside:0});
    const box=[433+r.layout.offsetX-4,307,8,7];
    const pixels=different(await raster({box,scale:4}),await raster({box,scale:4,remove:['#right-arm']}));
    assert(!pixels,`${pixels} left paw-pad pixels were covered by the right sleeve`);
  });
  await test('the placed chair sits behind the bear',async()=>{
    pose({});r.prop('seat','chair',{anchor:'inside',x:415,y:318,s:.7,depth:'back'});const box=[435,306,12,20];
    const pixels=different(await raster({box}),await raster({box,remove:['[data-prop="seat"]']}));assert(!pixels,`${pixels} chair pixels cover the belly`);
  });
  await test('plush pad interiors are opaque',async()=>{
    pose({rx:451,ry:314,rightInside:0});
    const image=await raster({ids:['right-paw'],box:[451+r.layout.offsetX-3,318,6,6],scale:4});
    const alpha=Array.from(image.data).filter((_,i)=>i%4===3);const min=Math.min(...alpha);assert(min===255,`minimum pad alpha is ${min}, exposing the background`);
  });
  await test('paper, food and fabric props block the layers behind their solid interiors',async()=>{
    const tested=[];
    for(const type of ['cloth','cover','retired','cookie','clipboard','cushion','cape']){
      pose({});const p=r.prop('solid-prop',type,{anchor:'world',x:420,y:270,s:1});p.node.id='pixel-prop';
      const image=await raster({ids:['pixel-prop'],box:[419,269,2,2],scale:4});
      const min=Math.min(...Array.from(image.data).filter((_,i)=>i%4===3));assert(min===255,`${type} interior alpha is ${min}`);tested.push(type);
    }return {tested};
  });
  await test('the cape stays behind the torso instead of covering the belly',async()=>{
    pose({});r.outfit('cape');r.render();const box=[425,310,14,18];
    const actual=await raster({box});r.outfit();r.render();const pixels=different(actual,await raster({box}));assert(!pixels,`${pixels} cape pixels cover the belly`);
  });
  await test('folded and extended forearm fabric remains opaque',async()=>{
    let samples=0;
    for(const state of [{rise:27,rx:409-r.layout.offsetX,ry:298},{rise:0,rx:479,ry:260},{rise:0,rx:449,ry:311}]) {
      pose({...state,rightInside:0});const s=r.state,shoulder=BearRenderer.shoulderPosition('right'),sx=shoulder.x+r.layout.offsetX,sy=shoulder.y+s.rise;
      const hand=BearRenderer.armPose(sx,sy,s.rx+r.layout.offsetX,s.ry+s.rise,1),mesh=BearRenderer.armSurface(sx,sy,hand,1);
      // Test material opacity separately from intentional box-wall occlusion.
      const image=await raster({ids:['right-arm'],box:[200,110,480,340],scale:3,unclip:['#right-arm']});
      for(const p of mesh.slice(13,30))for(const fraction of [-.45,0,.45]){const edge=fraction<0?p.top:p.bottom,x=p.x+(edge.x-p.x)*Math.abs(fraction),y=p.y+(edge.y-p.y)*Math.abs(fraction);const at=(Math.round((y-110)*3)*image.width+Math.round((x-200)*3))*4;assert(image.data[at+3]===255,`forearm alpha ${image.data[at+3]} at ${x},${y}`);samples++;}
    }return {samples};
  });
  await test('a submerged shoulder cannot show through the front panel',async()=>{
    pose({rise:90,rx:420-r.layout.offsetX,ry:235,rightInside:0});
    const image=await raster({ids:['reaching-hands'],box:[440,370,60,48]});
    const max=Math.max(...Array.from(image.data).filter((_,i)=>i%4===3));assert(max===0,`submerged sleeve alpha ${max}`);
  });
  await test('neighbouring paw pixels are excluded from the head atlas crop',async()=>{
    pose({});const head=document.getElementById('bear-head');const transform=head.getAttribute('transform');head.removeAttribute('transform');
    try{const image=await raster({ids:['bear-head'],box:[468,303.6,18,5.3],scale:6});const max=Math.max(...Array.from(image.data).filter((_,i)=>i%4===3));assert(max===0,`stray fur alpha ${max}`);}finally{head.setAttribute('transform',transform);}
  });
  await test('all costumes disappear fully before the lid closes',async()=>{
    const leaked=[];for(const costume of ['nightcap','hat','disguise','glasses','headband']){r.reset();r.wear(costume);r.state.lid=.04;r.render();document.getElementById('invitation').setAttribute('opacity','0');const box=[250,285,350,80];const pixels=different(await raster({box}),await raster({box,remove:['#bear-head','#bear-body','#shoulders','#arms','#reaching-hands']}));if(pixels)leaked.push({costume,pixels});}
    assert(!leaked.length,JSON.stringify(leaked));
  });
  await test('glasses leave both eye apertures unobstructed',async()=>{
    pose({});
    for(const cx of [373,439]) {
      const box=[cx+r.layout.offsetX-10,223,20,20];
      r.wear();const bare=await raster({box,scale:3});
      r.wear('glasses');const pixels=different(bare,await raster({box,scale:3}));
      assert(!pixels,`${pixels} eye pixels were covered by a lens or folded temple`);
    }
  });
  await test('eye animation cannot draw into the cream muzzle',async()=>{
    pose({});const transform=r.nodes['bear-head'].getAttribute('transform');r.nodes['bear-head'].removeAttribute('transform');const box=[366,237,77,58],base=await raster({ids:['bear-head'],box,scale:3});
    const mask=document.createElement('canvas');mask.width=base.width;mask.height=base.height;const ctx=mask.getContext('2d');ctx.scale(3,3);ctx.translate(-box[0],-box[1]);ctx.fill(new Path2D(document.getElementById('muzzle-boundary').getAttribute('d')));const data=ctx.getImageData(0,0,mask.width,mask.height).data;let samples=0;
    for(const [eye,gazeX,gazeY] of [[.5,-7,7],[.2,7,-7],[0,0,0],[1,7,7]]){Object.assign(r.state,{eye,gazeX,gazeY});r.renderEyes();const next=await raster({ids:['bear-head'],box,scale:3});for(let i=0;i<data.length;i+=4)if(data[i+3]===255){assert(![0,1,2,3].some(k=>base.data[i+k]!==next.data[i+k]),`muzzle changed at pixel ${i/4}`);samples++;}}
    r.nodes['bear-head'].setAttribute('transform',transform);return {samples};
  });
  r.reset();return results;
};
