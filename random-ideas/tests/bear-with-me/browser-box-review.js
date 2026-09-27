/* Compare the approved reference and native front panel at inspection scale. */
(async () => {
  const m = bearMachine, r = m.renderer;
  await r.assetsReady; m.cancelIdle(); m.busy = true; r.reset();
  Object.assign(r.state, { lid: 1, rise: 0 }); r.render();
  document.getElementById('invitation').setAttribute('opacity', '0');
  document.querySelector('.page').style.display = 'none';
  const gallery = document.createElement('main');
  gallery.className = 'audit-gallery'; gallery.style.cssText = 'padding:20px;font:16px monospace';
  gallery.innerHTML = '<p>Approved v7 — front panel and joinery</p><svg width="1380" height="460" viewBox="390 690 650 215"><image href="../../previews/japanese-box-v7.png" width="1515" height="1038"/></svg><p>Native animation — same details</p>';
  const art = BearAudit.cloneArt('box-review-');
  art.setAttribute('viewBox', '296 350 251 82');
  art.setAttribute('width', '1380'); art.setAttribute('height', '460');
  gallery.append(art); document.body.append(gallery);
})();
