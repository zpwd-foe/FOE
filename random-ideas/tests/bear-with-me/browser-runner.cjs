/* Dependency-free Chrome runner. Usage: node tests/bear-with-me/browser-runner.cjs /private/tmp/bear-audit */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const siteRoot = process.argv.includes('--dist') ? path.join(root, 'dist') : root;
const output = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'bear-layer-audit'));
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function main() {
  fs.mkdirSync(output,{recursive:true});
  const server = http.createServer((req,res)=>{
    const file = path.resolve(siteRoot, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if (!file.startsWith(siteRoot + path.sep)) { res.writeHead(403).end(); return; }
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.json':'application/json'};
    fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bear-audit-'));
  const child=spawn(chrome,['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let socket;
  try {
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;i<100&&!fs.existsSync(portFile);i++)await pause(100);
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
    const pages=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
    const pending=new Map();let id=0;
    socket.onmessage=event=>{const reply=JSON.parse(event.data);if(!reply.id)return;const item=pending.get(reply.id);pending.delete(reply.id);if(reply.error)item.reject(new Error(reply.error.message));else item.resolve(reply.result);};
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
    const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
    await send('Page.enable');await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1650,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/projects/bear-with-me/index.html`});
    for(let i=0;i<100;i++){if(await evaluate('Boolean(window.bearMachine)'))break;await pause(100);}
    if(process.argv.includes('--preview')) {
      const png=await evaluate(fs.readFileSync(path.join(root,'scripts/bear-preview.js'),'utf8'));
      fs.writeFileSync(path.join(output,'bear-with-me-preview.png'),Buffer.from(png.split(',')[1],'base64'));
      console.log('Exported bear-with-me-preview.png from the current SVG renderer');
      return;
    }
    await evaluate(fs.readFileSync(path.join(__dirname,'browser-audit.js'),'utf8'));
    if(process.argv.includes('--box-review')) {
      await evaluate(fs.readFileSync(path.join(__dirname,'browser-box-review.js'),'utf8'));
      await pause(250);
      await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
      const png=await send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'box-comparison.png'),Buffer.from(png.data,'base64'));
      console.log('Captured approved reference and native front panel');
      return;
    }
    const report=await evaluate('BearAudit.run()');
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    fs.writeFileSync(path.join(output,'frames.json'),JSON.stringify(await evaluate('BearAudit.frames')));
    console.log(JSON.stringify({scenes:report.results.length,frames:report.frameCount,snapshots:report.snapshots,failures:report.failures.length}));
    const sceneIds = await evaluate('BearScenes.map(s => s.id)');
    for(let start=1;!process.argv.includes('--no-gallery')&&start<=sceneIds.length;start+=5){
      const first = sceneIds[start - 1], last = sceneIds[Math.min(start + 3, sceneIds.length - 1)];
      await evaluate(`BearAudit.gallery(${start},5)`);await pause(150);
      const png=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      fs.writeFileSync(path.join(output,`scenes-${String(first).padStart(2,'0')}-${last}.png`),Buffer.from(png.data,'base64'));
      console.log(`Captured scenes ${first}–${last}`);
    }
    if(fs.existsSync(path.join(__dirname,'browser-pixels.js'))) {
      await evaluate(fs.readFileSync(path.join(__dirname,'browser-pixels.js'),'utf8'));
      report.pixels=await evaluate('BearPixelTests()');fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
      console.log(`Pixel checks: ${report.pixels.filter(t=>t.pass).length}/${report.pixels.length} passed`);
    }
    // Actual pointer input at the visible stem, across responsive layouts.
    await evaluate(`window.clickProbe={count:0,play:bearMachine.play,audio:bearMachine.resumeAudio};bearMachine.cancelIdle();bearMachine.play=function(){clickProbe.count++;return Promise.resolve(true)};bearMachine.resumeAudio=()=>{};bearMachine.busy=false;`);
    report.clickTargets=[];
    for(const width of [320,390,768,1440]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});await pause(80);
      for(const on of [false,true]) {
        const point=await evaluate(`(() => {const r=bearMachine.renderer;r.reset();r.switch(${on});const el=document.getElementById('lever-tip'),p=new DOMPoint(0,+el.getAttribute('cy')).matrixTransform(el.getScreenCTM());return {x:p.x,y:p.y,count:clickProbe.count,hit:document.elementFromPoint(p.x,p.y)?.id};})()`);
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
        const count=await evaluate('clickProbe.count');
        report.clickTargets.push({width,on,pass:point.hit==='machine-switch'&&count===point.count+1});
      }
    }
    await evaluate('bearMachine.play=clickProbe.play;bearMachine.resumeAudio=clickProbe.audio;delete window.clickProbe;bearMachine.cancelIdle();bearMachine.renderer.reset();');
    console.log(`Pointer checks: ${report.clickTargets.filter(t=>t.pass).length}/${report.clickTargets.length} passed`);
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    if(!process.argv.includes('--no-gallery')) {
      await evaluate(`document.querySelector('.audit-gallery')?.remove();document.querySelector('.page').style.display='';BearAudit.restore(BearAudit.frames.find(f=>f.scene===15&&f.props.some(p=>p.type==='cloth')&&f.state.rightInside===0&&f.state.ry>330));`);
      for(const [name,width,height,mobile] of [['desktop',1440,1000,false],['mobile',390,844,true]]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await pause(150);
        const png=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`${name}.png`),Buffer.from(png.data,'base64'));
      }
    }
    process.exitCode=report.failures.length || report.pixels?.some(t=>!t.pass) || report.clickTargets.some(t=>!t.pass) ? 1 : 0;
  } finally {
    socket?.close();
    const exited = new Promise(resolve => {
      if(child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once('exit', resolve);
    });
    child.kill();
    await new Promise(resolve=>server.close(resolve));
    await Promise.race([exited, pause(3000)]);
    // Chrome may still be flushing its profile after the parent exits. Cleanup
    // must not hide a more useful test or browser-startup error.
    try { fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100}); }
    catch(error) { console.warn(`Could not clean temporary Chrome profile: ${error.message}`); }
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
