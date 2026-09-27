(() => {
  "use strict";

  const ideas = window.RANDOM_IDEAS || [];
  const grid = document.querySelector("#idea-grid");
  const search = document.querySelector("#idea-search");
  const filters = [...document.querySelectorAll(".filter")];
  const dialog = document.querySelector("#idea-dialog");
  const randomButton = document.querySelector("#random-button");
  let category = "All";
  let lastOpenedId = null;
  let returnFocus = null;
  let openedFromPage = false;

  const illustrations = {
    bear: `<image href="assets/bear-with-me-preview.3a13ace8de4b.webp" width="360" height="210"/>`,
    palette: `<rect x="91" y="41" width="116" height="133" rx="6" fill="#b6c995" stroke="#687e4a" stroke-width=".7" transform="rotate(-17 149 108)"/><rect x="121" y="34" width="116" height="133" rx="6" fill="#f9f8ec" stroke="#9b9f87" stroke-width=".7" transform="rotate(4 179 100)"/><g transform="rotate(14 205 112)"><rect x="151" y="44" width="116" height="133" rx="6" fill="#faf7eb" stroke="#a6aa93" stroke-width=".7"/><path d="M157 44h104q6 0 6 6v28H151V50q0-6 6-6" fill="#3e573c"/><path d="M151 78h116v29H151" fill="#97ab77"/><path d="M151 107h116v29H151" fill="#dae6b5"/><path d="M151 136h116v29H151" fill="#e7b899"/><text x="163" y="173" font-family="monospace" font-size="5" fill="#526444">A LITTLE COLOR GOES A LONG WAY</text></g><path d="M286 56v19m-9-9h19M66 136v12m-6-6h12" stroke="#82956c" stroke-width="1"/>`,
    map: `<defs><pattern id="map-grid" width="27" height="27" patternUnits="userSpaceOnUse"><path d="M27 0H0v27" fill="none" stroke="#c8d0bc" stroke-width=".5"/></pattern></defs><rect width="360" height="210" fill="url(#map-grid)"/><path d="M-10 162C77 89 88 217 154 158S200 45 266 71s70 13 105-40" fill="none" stroke="#d0dabe" stroke-width="30"/><path d="M-10 162C77 89 88 217 154 158S200 45 266 71s70 13 105-40" fill="none" stroke="#f3f4e9" stroke-width="2"/><path d="M59 145c27-34 58-54 92-49s32 44 63 27 46-48 66-48" fill="none" stroke="#657d4d" stroke-width="2" stroke-dasharray="4 5"/><circle cx="59" cy="145" r="6" fill="#8d9f72" stroke="#f8f9f0" stroke-width="3"/><g transform="translate(260 39)"><path d="M20 0C8 0 1 9 1 19c0 14 19 33 19 33s19-19 19-33C39 9 32 0 20 0" fill="#4a633e"/><circle cx="20" cy="18" r="6" fill="#ecf1df"/></g><g transform="rotate(-8 145 55)"><rect x="94" y="39" width="112" height="26" rx="2" fill="#f8f7ec" stroke="#d7dccb"/><text x="108" y="56" fill="#6c795c" font-family="monospace" font-size="8">TAKE THE LONG WAY.</text></g>`,
    note: `<g transform="rotate(-7 180 105)"><rect x="91" y="21" width="176" height="177" rx="2" fill="#c9c3af" opacity=".25" transform="translate(4 4)"/><rect x="91" y="21" width="176" height="177" rx="2" fill="#faf8ee"/><path d="M109 65h140M109 87h140M109 109h140M109 131h140M109 153h140M109 175h140" stroke="#d9ded0" stroke-width=".7"/><path d="M113 94h124v18H113" fill="#d9e8a8"/><text x="112" y="63" font-family="Georgia,serif" font-size="18" fill="#5b634d">a smaller web.</text><text x="112" y="107" font-family="Georgia,serif" font-size="18" font-style="italic" fill="#5b634d">a little more us.</text><path d="M111 136q37-6 65 0m-65 21q56-5 107 0" stroke="#adb59c" stroke-width="1.4" fill="none"/><rect x="149" y="9" width="58" height="24" fill="#d9ddc5" opacity=".85"/></g>`,
    prompt: `<g transform="rotate(-5 180 105)"><rect x="66" y="42" width="231" height="132" rx="7" fill="#f9faf6" stroke="#a8b5c5" stroke-width=".8"/><path d="M66 63h231" stroke="#c4cdda" stroke-width=".8"/><circle cx="78" cy="52" r="2" fill="#c0c9d7"/><circle cx="86" cy="52" r="2" fill="#c0c9d7"/><circle cx="94" cy="52" r="2" fill="#c0c9d7"/><text x="91" y="92" font-family="monospace" font-size="7" fill="#7c8898">YOUR NEXT SMALL ADVENTURE</text><text x="91" y="117" font-family="Georgia,serif" font-size="19" fill="#4e6071">What if you tried...</text><rect x="91" y="136" width="76" height="20" rx="3" fill="#d9e2ee"/><text x="101" y="149" font-family="monospace" font-size="7" fill="#536a82">one more ↗</text></g><path d="M299 33v20m-10-10h20M49 158v15m-7-7h14" stroke="#899bb1"/>`,
    shapes: `<circle cx="132" cy="90" r="52" fill="#c9b69b"/><path d="M185 39h87v87h-87z" fill="#4d654b" transform="rotate(13 228 82)"/><path d="m138 181 52-96 54 96z" fill="#e4b898"/><path d="M81 134h56v56H81z" fill="#d6dfbd" transform="rotate(-13 109 162)"/><circle cx="253" cy="153" r="34" fill="none" stroke="#6a7760" stroke-width="1.5"/><path d="M62 43v16m-8-8h16m230 121v16m-8-8h16" stroke="#889573"/><circle cx="183" cy="45" r="4" fill="#73845e"/>`,
    list: `<g transform="rotate(6 180 105)"><rect x="96" y="15" width="168" height="186" rx="4" fill="#f9faf1" stroke="#c5ceb6" stroke-width=".7"/><text x="120" y="49" font-family="Georgia,serif" font-style="italic" font-size="24" fill="#536747">someday, maybe.</text><path d="M117 62h126" stroke="#dbe0ce"/><g fill="none" stroke="#a0ad8d" stroke-width=".8"><rect x="119" y="80" width="8" height="8" rx="1"/><rect x="119" y="108" width="8" height="8" rx="1"/><rect x="119" y="136" width="8" height="8" rx="1"/><rect x="119" y="164" width="8" height="8" rx="1"/><path d="M137 84h81m-81 28h94m-94 28h66m-66 28h85"/></g></g><path d="m264 144 11 19 22-9-11 21 16 14-23-2-6 21-6-21-22 3 16-15-10-20z" fill="#d1dda9" stroke="#879a62" stroke-width=".6"/>`
  };

  const art = (name, suffix) => {
    const source = illustrations[name] || illustrations.shapes;
    // Texture ids stay unique between cards and the dialog.
    return `<svg viewBox="0 0 360 210" aria-hidden="true" focusable="false">${source.replaceAll("map-grid", `map-grid-${suffix}`)}</svg>`;
  };

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createCard(idea, index) {
    const link = makeElement("a", "idea-card");
    const directUrl = idea.direct && safeProjectUrl(idea.url);
    link.href = directUrl || `#idea/${encodeURIComponent(idea.id)}`;
    link.setAttribute("aria-labelledby", `idea-title-${index}`);
    const artwork = makeElement("div", `card-art art-${idea.artwork}`);
    artwork.setAttribute("aria-hidden", "true");
    artwork.innerHTML = art(idea.artwork, `card-${index}`);
    if (idea.sample) artwork.append(makeElement("span", "sample-badge", "SAMPLE IDEA"));
    const figure = makeElement("figure", "card-figure");
    figure.append(artwork);
    if (idea.caption) figure.append(makeElement("figcaption", "card-caption", idea.caption));
    const content = makeElement("div", "card-content");
    const entryNumber = String(ideas.indexOf(idea) + 1).padStart(3, "0");
    const kicker = makeElement("p", "card-kicker", `Entry ${entryNumber} / ${idea.category}`);
    const title = makeElement("h3", "", idea.title);
    title.id = `idea-title-${index}`;
    const description = makeElement("p", "card-description", idea.description);
    const footer = makeElement("div", "card-footer");
    const tags = makeElement("span", "tags");
    (idea.tags || []).forEach(tag => tags.append(makeElement("span", "tag", tag)));
    const action = makeElement("span", "card-action ink-link", idea.actionLabel || (directUrl ? "Open entry" : "Read the entry"));
    const arrow = makeElement("span", "card-arrow", "↗");
    arrow.setAttribute("aria-hidden", "true");
    action.append(arrow);
    footer.append(action, tags);
    content.append(kicker, title, description, footer);
    link.append(content, figure);
    link.addEventListener("click", event => {
      if (directUrl) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openFromPage(idea, link);
    });
    return link;
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = ideas.filter(idea => {
      const matchesCategory = category === "All" || idea.category === category;
      const haystack = [idea.title, idea.description, idea.category, ...(idea.tags || [])].join(" ").toLocaleLowerCase();
      return matchesCategory && haystack.includes(query);
    });
    grid.replaceChildren(...visible.map(createCard));
    const emptyState = document.querySelector("#empty-state");
    emptyState.hidden = visible.length !== 0;
    if (ideas.length) {
      emptyState.querySelector("h3").textContent = "Nothing here. Yet.";
      emptyState.querySelector("p").textContent = "Try another word or make a little more room with a different filter.";
    }
    document.querySelector("#reset-filters").hidden = !ideas.length;
    document.querySelector("#result-count").textContent = `${visible.length} ${visible.length === 1 ? "idea" : "ideas"}${query || category !== "All" ? " found" : " and counting"}`;
    filters.forEach(button => {
      const active = button.dataset.category === category;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function safeProjectUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value, document.baseURI);
      return ["http:", "https:"].includes(url.protocol) || (url.protocol === "file:" && location.protocol === "file:") ? url.href : null;
    } catch {
      return null;
    }
  }

  function showIdea(idea) {
    lastOpenedId = idea.id;
    document.querySelector("#dialog-title").textContent = idea.title;
    document.querySelector("#dialog-category").textContent = [idea.category, idea.status].filter(Boolean).join(" / ");
    document.querySelector("#dialog-description").textContent = idea.description;
    document.querySelector("#dialog-body").replaceChildren(...(idea.body || []).map(paragraph => makeElement("p", "", paragraph)));
    document.querySelector("#sample-note").hidden = !idea.sample;
    const artwork = document.querySelector("#dialog-art");
    artwork.className = `dialog-art art-${idea.artwork}`;
    artwork.innerHTML = art(idea.artwork, "dialog");
    const projectLink = document.querySelector("#project-link");
    const projectUrl = safeProjectUrl(idea.url);
    projectLink.hidden = !projectUrl;
    if (projectUrl) projectLink.href = projectUrl;
    else projectLink.removeAttribute("href");
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    document.body.classList.add("dialog-open");
  }

  function openFromPage(idea, trigger) {
    if (idea.direct && safeProjectUrl(idea.url)) {
      location.href = safeProjectUrl(idea.url);
      return;
    }
    returnFocus = trigger;
    openedFromPage = true;
    history.pushState(null, "", `#idea/${encodeURIComponent(idea.id)}`);
    showIdea(idea);
  }

  function closeIdea() {
    if (!dialog.open) return;
    dialog.close();
    if (location.hash.startsWith("#idea/")) {
      // Remove the modal's history entry so Back returns to the preceding page.
      if (openedFromPage) history.back();
      else history.replaceState(null, "", location.pathname + location.search + "#ideas");
    }
  }

  function syncHash() {
    if (!location.hash.startsWith("#idea/")) {
      if (dialog.open) dialog.close();
      return;
    }
    let id;
    try { id = decodeURIComponent(location.hash.slice(6)); } catch { return; }
    const idea = ideas.find(entry => entry.id === id);
    if (idea) showIdea(idea);
  }

  filters.forEach(button => button.addEventListener("click", () => {
    category = button.dataset.category;
    render();
  }));
  search.addEventListener("input", render);
  document.querySelector("#reset-filters").addEventListener("click", () => {
    category = "All";
    search.value = "";
    render();
    search.focus();
  });
  randomButton.disabled = ideas.length === 0;
  randomButton.hidden = ideas.length === 0;
  randomButton.addEventListener("click", () => {
    const pool = ideas.length > 1 ? ideas.filter(idea => idea.id !== lastOpenedId) : ideas;
    if (pool.length) openFromPage(pool[Math.floor(Math.random() * pool.length)], randomButton);
  });
  document.querySelector("#dialog-close").addEventListener("click", closeIdea);
  dialog.addEventListener("cancel", event => { event.preventDefault(); closeIdea(); });
  dialog.addEventListener("click", event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeIdea();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  window.addEventListener("hashchange", syncHash);
  document.querySelector("#back-top").addEventListener("click", event => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    document.querySelector(".site-header .wordmark").focus({ preventScroll: true });
    history.replaceState(null, "", location.pathname + location.search);
  });
  document.querySelectorAll("[data-count]").forEach(counter => {
    counter.textContent = counter.dataset.count === "All" ? ideas.length : ideas.filter(idea => idea.category === counter.dataset.count).length;
  });
  const sampleLabel = document.querySelector(".collection-meta > span:last-child");
  sampleLabel.hidden = !ideas.some(idea => idea.sample);
  document.querySelector(".collection-controls").hidden = ideas.length === 0;
  document.querySelector(".collection-meta").hidden = ideas.length === 0;
  document.querySelector(".collection").classList.toggle("is-empty", ideas.length === 0);
  render();
  syncHash();
})();
