/* Runs against the real SVG, renderer and scene director in Chrome. */
window.BearAudit = (() => {
  const r = bearMachine.renderer, m = bearMachine;
  const frames = [], results = [], failures = [];
  let active = false, current, action = "", frameCount = 0;
  const recordFailure = (kind, details) => failures.push({ scene: current?.scene, kind, ...details });
  function capture() {
    if (!active) return;
    const props = [...r.props.values()].map(({ node, ...p }) => ({ ...p }));
    const frame = { scene: current.scene, emotion: current.emotion, accepted:current.accepted, reduced:current.reduced, returning:current.returning, action, state: { ...r.state }, face: r.faceMode,
      headwear: r.nodes['head-accessory'].innerHTML, outfit: r.nodes['body-accessory'].innerHTML, backOutfit:r.backOutfit?.innerHTML || '', props, on: m.on };
    const previous = frames.at(-1);
    if (previous?.scene === frame.scene && previous.reduced===frame.reduced && JSON.stringify(previous.state) === JSON.stringify(frame.state) && JSON.stringify(previous.props) === JSON.stringify(props)) return;
    frames.push(frame);
  }
  async function run() {
    await r.assetsReady; m.cancelIdle();
    const originals = { raf: window.requestAnimationFrame, cancel: window.cancelAnimationFrame,
      render: r.render, tween: r.tween, wait: r.wait, anchor: r.anchorProp, offer: m.offer, sound: m.sound, save: m.save, setSwitch: m.setSwitch };
    let clock = 0, token = 0; const cancelled = new Set();
    // Keep the production interpolation and hand-lift arc; advance its real
    // RAF callbacks on a deterministic 50 ms clock instead of wall time.
    window.requestAnimationFrame = callback => { const id = ++token; queueMicrotask(() => { if (!cancelled.has(id)) callback(clock += 50); }); return id; };
    window.cancelAnimationFrame = id => cancelled.add(id);
    r.render = function () {
      originals.render.call(this); if (!active) return; frameCount++; current.frames++;
      for (const [key, value] of Object.entries(this.state)) if (!Number.isFinite(value)) recordFailure('non-finite pose', { key, value });
    };
    r.tween = async function (target, values, ...args) {
      action = Object.entries(values).map(([k,v]) => `${k}=${Number(v.toFixed(2))}`).join(' ');
      await originals.tween.call(this, target, values, ...args); capture();
    };
    r.wait = async () => { capture(); };
    r.anchorProp = function (id, anchor) {
      const p = this.props.get(id), before = p.node.getCTM();
      originals.anchor.call(this, id, anchor); const after = p.node.getCTM();
      const shift = Math.hypot(before.e - after.e, before.f - after.f);
      if (shift > .05) recordFailure('prop jumps on depth change', { id, anchor, shift });
      capture();
    };
    m.sound = () => {}; m.save = () => {}; m.offer = async () => current.accepted;
    m.setSwitch = function(on) {
      if (active && !on && this.on) {
        const s = r.state, shoulder = BearRenderer.shoulderPosition('right'), offset = s.x + r.layout.offsetX;
        const hand = BearRenderer.armPose(shoulder.x + offset, shoulder.y + s.rise, s.rx + offset, s.ry + s.rise, 1, s.rr);
        const touch = BearRenderer.hardwareGeometry().contact;
        const distance = Math.hypot(hand.x - touch.x, hand.y - touch.y);
        if (distance > .1 || s.rightInside) recordFailure('paw misses new toggle', { distance, hand, touch, inside: s.rightInside });
        current.contacts = (current.contacts || 0) + 1;
      }
      originals.setSwitch.call(this, on);
    };
    try {
      const offers = [21, 41].map(id => ({ index: BearScenes.findIndex(s => s.id === id), accepted: true }));
      for (const reduced of [false,true]) for (const { index, accepted, returning } of [...BearScenes.map((_,index) => ({ index, accepted: false })), { index:0, accepted:false, returning:true }, ...offers]) {
        if(!returning){r.reset(); m.progress.retired = false;}
        r.reduced=reduced;
        current = { scene:BearScenes[index].id, emotion:BearScenes[index].emotion, accepted, reduced, returning:!!returning, frames:0 };
        active = true; current.completed = await m.play(index); capture(); active = false;
        current.closed = !m.on && r.state.lid === 0 && r.state.rise === 260 && r.state.leftInside === 1 && r.state.rightInside === 1;
        if (!current.completed || !current.closed) recordFailure('incomplete retreat', {});
        current.remainingProps = [...r.props.values()].map(p=>p.id);
        if (current.scene !== 50 && current.remainingProps.length) recordFailure('prop survives scene', { props:current.remainingProps });
        results.push(current); m.cancelIdle();
      }
    } finally {
      active = false; window.requestAnimationFrame = originals.raf; window.cancelAnimationFrame = originals.cancel;
      r.render = originals.render; r.tween = originals.tween; r.wait = originals.wait; r.anchorProp = originals.anchor;
      m.offer = originals.offer; m.sound = originals.sound; m.save = originals.save; m.setSwitch = originals.setSwitch; r.reduced=false; r.reset(); m.cancelIdle();
    }
    return { results, failures, frameCount, snapshots:frames.length };
  }
  function restore(frame) {
    r.reset(); Object.assign(r.state, frame.state); r.expression(frame.face);
    r.nodes['head-accessory'].innerHTML = frame.headwear; r.nodes['body-accessory'].innerHTML = frame.outfit;if(r.backOutfit)r.backOutfit.innerHTML=frame.backOutfit || '';
    for (const p of frame.props) r.prop(p.id, p.type, p);
    r.switch(frame.on); r.render(); document.getElementById('invitation').setAttribute('opacity','0');
  }
  function cloneArt(prefix) {
    const svg = document.getElementById('machine-art').cloneNode(true); svg.removeAttribute('id'); svg.setAttribute('viewBox','240 90 380 360');
    for(const el of svg.querySelectorAll('*')) {
      if(el.id) el.id=prefix+el.id;
      for(const a of Array.from(el.attributes)) {
        if(a.name==='id')continue;
        let value=a.value.replace(/url\(#([^)]+)\)/g,(_,id)=>'url(#'+prefix+id+')');
        if((a.name==='href'||a.name==='xlink:href')&&value.startsWith('#'))value='#'+prefix+value.slice(1);
        el.setAttribute(a.name,value);
      }
    }
    return svg;
  }
  function gallery(start = 1, count = 5) {
    document.querySelector('.audit-gallery')?.remove();
    document.querySelector('.page').style.display='none';
    const gallery=document.createElement('main');gallery.className='audit-gallery';
    gallery.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0;padding:12px;max-width:none';
    for(const { id: scene } of BearScenes.slice(start - 1, start - 1 + count)) {
      const choices=frames.filter(f=>f.scene===scene && !f.accepted && !f.reduced && !f.returning && (f.state.rise<120 || f.props.some(p=>p.anchor==='inside'&&p.y<350)) && f.state.eye>.2);
      const picks=[.15,.5,.82].map(t=>choices[Math.min(choices.length-1,Math.floor(choices.length*t))]);
      for(const [i,frame] of picks.entries()) {
        if(!frame)continue;restore(frame);const svg=cloneArt(`audit-${scene}-${i}-`);svg.style.cssText='width:100%;height:280px';
        const cell=document.createElement('section'),p=document.createElement('div');p.style.cssText='font:12px/1.2 monospace;height:32px';p.textContent=`${scene}. ${frame.emotion} · ${frame.action}`;
        cell.append(p,svg);gallery.append(cell);
      }
    }
    document.body.append(gallery);return { width:1440,height:gallery.scrollHeight+24 };
  }
  return { run, gallery, restore, frames, results, failures, cloneArt };
})();
