(function () {
  "use strict";
  const D = window.DEX;
  const SP = D.species;
  const SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/firered-leafgreen/";
  const ITEM = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/";
  const OAK = "https://play.pokemonshowdown.com/sprites/trainers/oak-gen3.png";
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const spr = (id) => SPRITE + id + ".png";

  // ---------------- state ----------------
  const KEY = "lgdex.v1";
  const UIKEY = "lgdex.ui";
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let S = ls.get(KEY, null) || { v: 1, mons: {}, flags: {} };
  S.mons = S.mons || {}; S.flags = S.flags || {};
  const UI = ls.get(UIKEY, { open: {}, map: "kanto", dexFilter: "all", natl: false });

  const save = () => { ls.set(KEY, S); SYNC.changed(); };
  const saveUI = () => ls.set(UIKEY, UI);
  const monS = (id) => (S.mons[id] ? S.mons[id].s : 0);
  const flag = (k) => (S.flags[k] ? S.flags[k].v : 0);
  function setMon(id, s) { S.mons[id] = { s, t: Date.now() }; save(); refreshMon(id); }
  function setFlag(k, v) { S.flags[k] = { v, t: Date.now() }; save(); }

  // ---------------- derived data ----------------
  const CH = D.chapters; // [{id,name,blurb}]
  const chIndex = Object.fromEntries(CH.map((c, i) => [c.id, i]));
  const UNL = D.unlocks; // {id:{name,group,chapter,where}}
  const METHOD_UNLOCK = { surf: "surf", "old-rod": "old-rod", "good-rod": "good-rod", "super-rod": "super-rod", "rock-smash": "rock-smash", pokeflute: "poke-flute" };
  const METHOD_LABEL = {
    walk: "Wild", surf: "Surfing", "old-rod": "Old Rod", "good-rod": "Good Rod", "super-rod": "Super Rod",
    "rock-smash": "Rock Smash", pokeflute: "Poké Flute", static: "One-time encounter", gift: "Gift",
    "gift-egg": "Egg", "npc-trade": "In-game trade", "roaming-grass": "Roaming",
  };
  const LOCS = D.locations;
  LOCS.forEach((l, i) => { l.i = i; l.ci = chIndex[l.chapter]; });
  const LOC = Object.fromEntries(LOCS.map((l) => [l.id, l]));
  UI.filter = Object.assign({ land: 1, surf: 1, fish: 1, rock: 1, other: 1, battle: 1, hideLocked: 0 }, UI.filter || {});
  const CAT = (m) => (m === "walk" ? "land" : m === "surf" ? "surf" : m.endsWith("-rod") ? "fish" : m === "rock-smash" ? "rock" : "other");
  const FILTERS = [["land", "Grass & caves"], ["surf", "Surfing"], ["fish", "Fishing"], ["rock", "Rock Smash"], ["other", "Gifts & trades"], ["battle", "In battle"]];

  // match a world-map area name ("Five Island Lost Cave Room1") to a checklist location
  const words = (s) => " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
  const BASES = LOCS.map((l) => [l, words(l.name.replace(/\s*\(.*\)$/, "")), words(l.mapName || l.name)]);
  const mapCache = {};
  function locForMap(name) {
    if (name in mapCache) return mapCache[name];
    const w = words(name);
    let best = null, bestIdx = -1, bestLen = 0;
    BASES.forEach(([l, base, mn]) => {
      [base, mn].forEach((b) => {
        const i = w.indexOf(b);
        if (i >= 0 && (i > bestIdx || (i === bestIdx && b.length > bestLen))) { best = l; bestIdx = i; bestLen = b.length; }
      });
    });
    return (mapCache[name] = best);
  }
  const KIND_UNLOCK = { surf: "surf", old_rod: "old-rod", good_rod: "good-rod", super_rod: "super-rod", rock: "rock-smash" };
  function mapNeeds(name, kind) {
    const l = locForMap(name);
    const need = new Set(l ? l.req || [] : []);
    if (KIND_UNLOCK[kind]) need.add(KIND_UNLOCK[kind]);
    if (l) {
      if (kind === "land") (l.walkReq || []).forEach((r) => need.add(r));
      const w = words(name);
      l.floors.forEach((f) => { if (f.label && f.req && w.includes(words(f.label))) f.req.forEach((r) => need.add(r)); });
    }
    return [...need].filter((u) => u !== "coin-case");
  }

  // which unlocks a table needs
  function tableNeeds(loc, floor, t) {
    const need = new Set(loc.req || []);
    (floor.req || []).forEach((r) => need.add(r));
    if (METHOD_UNLOCK[t.m]) need.add(METHOD_UNLOCK[t.m]);
    if (t.m === "walk") (loc.walkReq || []).forEach((r) => need.add(r));
    (t.req || []).forEach((r) => need.add(r));
    return [...need];
  }
  const has = (u) => (u === "hof" ? flag("hof") : u.startsWith("badge") ? flag("badges") >= +u.slice(5) : !!flag(u));
  const needsMet = (needs) => needs.every(has);
  const unlockName = (u) => (UNL[u] ? UNL[u].name : u.startsWith("badge") ? u.slice(5) + " badges" : u === "hof" ? "Hall of Fame" : u);

  // species -> appearances
  const WHERE = {};
  LOCS.forEach((l) => l.floors.forEach((f, fi) => f.tables.forEach((t) => t.mons.forEach((m) => {
    (WHERE[m.id] = WHERE[m.id] || []).push({ l, f, fi, t, m });
  }))));
  const locMons = (l) => {
    const s = new Set();
    l.floors.forEach((f) => f.tables.forEach((t) => t.mons.forEach((m) => s.add(m.id))));
    return [...s];
  };
  LOCS.forEach((l) => { l.mons = locMons(l); });
  const CHILDREN = {};
  Object.entries(SP).forEach(([id, s]) => { if (s.f) (CHILDREN[s.f] = CHILDREN[s.f] || []).push(+id); });

  const KANTO_MAX = 151;
  const counts = (max) => {
    let seen = 0, caught = 0;
    for (let i = 1; i <= max; i++) { const s = monS(i); if (s >= 1) seen++; if (s === 2) caught++; }
    return { seen, caught };
  };

  // ---------------- catch maths (Gen 3) ----------------
  function catchP(rate, ball, hpFrac, status) {
    const a = Math.floor(((3 - 2 * hpFrac) * rate * ball) / 3) * status;
    if (a >= 255) return 1;
    if (a <= 0) return 0;
    const b = Math.floor(1048560 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(16711680 / a))))));
    return Math.pow(b / 65536, 4);
  }
  const BALLS = {
    poke: { n: "Poké Ball", img: "poke-ball", cost: 200, mult: () => 1 },
    great: { n: "Great Ball", img: "great-ball", cost: 600, mult: () => 1.5 },
    ultra: { n: "Ultra Ball", img: "ultra-ball", cost: 1200, mult: () => 2 },
    net: { n: "Net Ball", img: "net-ball", cost: 1000, mult: (sp) => (sp.t.includes("water") || sp.t.includes("bug") ? 3 : 1) },
    nest: { n: "Nest Ball", img: "nest-ball", cost: 1000, mult: (sp, lv) => Math.max(1, (40 - lv) / 10) },
    safari: { n: "Safari Ball", img: "safari-ball", cost: 0, mult: () => 1.5 },
  };
  const pct = (p) => (p >= 0.995 ? "99%" : p < 0.01 ? "<1%" : Math.round(p * 100) + "%");
  function ballsAt(ci) {
    return Object.entries(D.balls).filter(([, ch]) => chIndex[ch] <= ci).map(([b]) => b).filter((b) => BALLS[b]);
  }
  function recommend(sp, lv, ci, safari) {
    if (safari) {
      const p = catchP(sp.c, 1.5, 1, 1);
      return { ball: "safari", text: `${pct(p)} a throw` + (sp.c <= 45 ? ", Rock first doubles it" : "") };
    }
    const avail = ballsAt(ci);
    const opts = avail.map((b) => ({ b, m: BALLS[b].mult(sp, lv) })).sort((x, y) => BALLS[x.b].cost - BALLS[y.b].cost);
    let pick = null;
    for (const o of opts) { if (catchP(sp.c, o.m, 0.05, 1) >= 0.33) { pick = o; break; } }
    if (!pick) pick = opts.reduce((best, o) => (o.m > best.m ? o : best), opts[0]);
    const low = catchP(sp.c, pick.m, 0.05, 1);
    const slp = catchP(sp.c, pick.m, 0.05, 2);
    let text = `${pct(low)} at red HP`;
    if (low < 0.5) text += `, ${pct(slp)} asleep`;
    return { ball: pick.b, text };
  }

  // ---------------- small renderers ----------------
  const TYPE_COL = { normal: "#9a9a6a", fire: "#e2742f", water: "#5b84e6", grass: "#5fae3d", electric: "#d8b524", ice: "#6cc4c4", fighting: "#b5322b", poison: "#94409a", ground: "#c9a556", flying: "#8c7fe0", psychic: "#e4547c", bug: "#97a51f", rock: "#a8913a", ghost: "#6a5592", dragon: "#6a3ef0", dark: "#6a5546", steel: "#a0a0be" };
  const typeTag = (t) => `<span class="type" style="background:${TYPE_COL[t] || "#888"}">${t}</span>`;
  const lvText = (m) => (m.lo === m.hi ? `Lv ${m.lo}` : `Lv ${m.lo}–${m.hi}`);
  function condText(c) {
    if (!c) return "";
    return c.split(",").map((x) => {
      if (x.startsWith("trade-")) return "for your " + (SP[idByName(x.slice(6))] || { n: x.slice(6) }).n;
      if (x.startsWith("coins-")) return x.slice(6) + " coins";
      if (x.startsWith("item-")) return "from the " + x.slice(5).replace(/-/g, " ").replace(/\b\w/g, (q) => q.toUpperCase());
      if (x.startsWith("starter-")) return "if you chose " + x.slice(8)[0].toUpperCase() + x.slice(9);
      if (x === "first-party-pokemon-high-friendship") return "hatches with high friendship";
      if (x.startsWith("story-progress")) return "after the Elite Four";
      return x.replace(/-/g, " ");
    }).join(", ");
  }
  const NAME_IDX = {};
  Object.entries(SP).forEach(([id, s]) => { NAME_IDX[s.n.toLowerCase().replace(/[^a-z0-9]/g, "")] = +id; });
  function idByName(slug) { return NAME_IDX[slug.replace(/-f$/, "♀").replace(/-m$/, "♂").replace(/[^a-z0-9]/g, "")] || NAME_IDX[slug.replace(/[^a-z0-9]/g, "")]; }

  const EYE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3.2"/></svg>`;
  const seenBtn = (id) => `<button class="seen ${monS(id) >= 1 ? "on" : ""}" data-mon="${id}" data-act="seen" aria-pressed="${monS(id) >= 1}" aria-label="Seen ${esc(SP[id].n)}" title="Seen">${EYE}</button>`;
  const checkBtn = (id) => `<button class="check ${monS(id) === 2 ? "c" : ""}" data-mon="${id}" data-act="catch" aria-label="Caught ${esc(SP[id].n)}" aria-pressed="${monS(id) === 2}"></button>`;

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 1600);
  }

  // ---------------- location status ----------------
  function locStatus(l) {
    const all = l.mons;
    const caught = all.filter((id) => monS(id) === 2).length;
    const seen = all.filter((id) => monS(id) >= 1).length;
    return { total: all.length, caught, seen, done: all.length > 0 && caught === all.length };
  }
  const WILD = new Set(["walk", "surf", "old-rod", "good-rod", "super-rod", "rock-smash"]);
  function availableUncaught(l, wildOnly) {
    const out = new Set();
    l.floors.forEach((f) => f.tables.forEach((t) => {
      if (wildOnly && !WILD.has(t.m)) return;
      if (!needsMet(tableNeeds(l, f, t))) return;
      t.mons.forEach((m) => { if (monS(m.id) !== 2) out.add(m.id); });
    }));
    return [...out];
  }
  function progressChapter() {
    const b = flag("badges");
    if (flag("hof")) return CH.length - 1;
    const found = CH.findIndex((c) => c.badges === b);
    return found >= 0 ? found : 0;
  }
  function comebacks() {
    const cur = progressChapter();
    const out = [];
    LOCS.forEach((l) => {
      if (l.ci >= cur) return;
      const ids = new Set();
      l.floors.forEach((f) => f.tables.forEach((t) => {
        const needs = tableNeeds(l, f, t);
        if (!needs.length || !needsMet(needs)) return;
        t.mons.forEach((m) => { if (monS(m.id) !== 2) ids.add(m.id); });
      }));
      if (ids.size) out.push({ l, ids: [...ids] });
    });
    return out;
  }
  function mapMarks(which) {
    const marks = {};
    LOCS.forEach((l) => {
      if (!l.map || !l.map.startsWith(which + ":")) return;
      const k = l.map.split(":")[1];
      const st = locStatus(l);
      const s = st.total === 0 ? "none" : st.done ? "done" : st.caught ? "part" : "todo";
      // a map key can be shared (town + its buildings); worst status wins
      const rank = { todo: 0, part: 1, done: 2, none: 3 };
      if (!marks[k] || rank[s] < rank[marks[k]]) marks[k] = s;
    });
    return marks;
  }

  // ---------------- ROUTES PAGE ----------------
  function renderRoutes(focusId) {
    const app = $("#app");
    const k = counts(KANTO_MAX);
    const nextLoc = LOCS.find((l) => (!l.req || needsMet(l.req)) && availableUncaught(l, true).length);
    const cb = comebacks();

    let h = `<section class="hero">
      <div class="box">
        <div class="stats">
          <div class="stat"><b id="kCaught">${k.caught}</b><span>caught of 151</span></div>
          <div class="stat"><b id="kSeen">${k.seen}</b><span>seen</span></div>
          ${flag("national-dex") ? `<div class="stat"><b id="nCaught">${counts(386).caught}</b><span>National caught</span></div>` : ""}
        </div>
        <div class="bar"><i id="kBar" style="width:${(k.caught / 151) * 100}%"></i></div>
      </div>`;
    if (nextLoc) {
      const un = availableUncaught(nextLoc, true);
      h += `<div class="box next"><span class="kicker">Next stop</span>
        <a class="go" href="#/routes/${nextLoc.id}">${esc(nextLoc.name)} →</a>
        <span class="why">${un.length} you can catch here now: ${un.slice(0, 6).map((id) => esc(SP[id].n)).join(", ")}${un.length > 6 ? "…" : ""}</span></div>`;
    }
    if (cb.length) {
      h += `<div class="box"><h3>Come back to</h3><p class="muted small" style="margin:4px 0 8px">You've unlocked something new for these spots and there's still something to catch.</p><div class="comeback">` +
        cb.slice(0, 8).map(({ l, ids }) => `<a href="#/routes/${l.id}"><b>${esc(l.name)}</b><span class="muted small">${ids.length} left</span><span class="sprites">${ids.slice(0, 5).map((id) => `<img src="${spr(id)}" alt="${esc(SP[id].n)}" loading="lazy">`).join("")}</span></a>`).join("") +
        `</div></div>`;
    }
    h += renderTeam();
    h += renderBag();
    h += `<div class="box filters"><div class="badges" style="margin:0">${FILTERS.map(([k, n]) => `<button class="chip ${UI.filter[k] ? "on" : ""}" data-act="filt" data-v="${k}">${n}</button>`).join("")}
      <button class="chip ${UI.filter.hideLocked ? "on" : ""}" data-act="filt" data-v="hideLocked">Hide locked</button></div></div>`;
    const split = isSplit();
    if (!split) h += `<div class="box mapwrap"><div class="tabs-mini">
        <button class="chip ${UI.map === "kanto" ? "on" : ""}" data-act="map" data-v="kanto">Kanto</button>
        <button class="chip ${UI.map === "sevii" ? "on" : ""}" data-act="map" data-v="sevii">Sevii Islands</button>
        <span class="muted small" style="margin-left:auto;align-self:center">Tap a spot to jump</span></div>
        <div id="bigmap">${MAPS.svg(UI.map, mapMarks(UI.map), { labels: true })}</div></div>`;
    h += `</section>`;

    let lastCh = null;
    LOCS.forEach((l, i) => {
      if (l.chapter !== lastCh) {
        const c = CH[l.ci];
        const inCh = LOCS.filter((x) => x.chapter === l.chapter);
        const done = inCh.filter((x) => locStatus(x).done || !x.mons.length).length;
        h += `<div class="chapter"><div><h2>${esc(c.name)}</h2>${c.blurb ? `<p class="muted small">${esc(c.blurb)}</p>` : ""}</div><span class="count" data-chcount="${c.id}">${done}/${inCh.length}</span></div>`;
        (PLAN_FOR_CHAPTER[c.id] || []).forEach((pid) => { const pm = (D.extra.plan || []).find((x) => x.id === pid); if (pm) h += planCard(pm, true); });
        lastCh = l.chapter;
      }
      h += renderLoc(l, i);
    });
    h += `<p class="foot">Encounter odds from PokeAPI's LeafGreen tables. Sprites from the PokeAPI sprite archive. Fan-made, not affiliated with Nintendo or Game Freak.</p>`;
    app.innerHTML = split ? `<div class="split"><div class="split-l">${h}</div><div class="split-r"><div id="splitmap"></div></div></div>` : h;
    document.body.classList.toggle("is-split", split);
    if (split) startSplit(focusId);

    if (focusId && LOC[focusId]) {
      const el = document.getElementById("loc-" + focusId);
      if (el) { el.open = true; UI.open[focusId] = 1; saveUI(); fillLoc(el); requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" })); }
    }
    $$("details.loc[open]").forEach(fillLoc);
  }

  // ---------------- desktop split: routes on the left, world map on the right ----------------
  const SPLIT_MQ = window.matchMedia("(min-width: 1100px)");
  const isSplit = () => SPLIT_MQ.matches;
  let activeLoc = null, suppressScroll = 0, focusTimer = null;
  function setActive(id) {
    if (activeLoc === id) return false;
    activeLoc = id;
    $$("details.loc.active").forEach((e) => e.classList.remove("active"));
    const el = document.getElementById("loc-" + id);
    if (el) el.classList.add("active");
    return true;
  }
  function onSplitScroll() {
    if (!document.body.classList.contains("is-split") || Date.now() < suppressScroll) return;
    const line = $(".tabs").getBoundingClientRect().bottom + 80;
    const cards = $$("details.loc");
    const hit = cards.find((c) => c.getBoundingClientRect().bottom > line);
    if (!hit || !setActive(hit.dataset.loc)) return;
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => { const l = LOC[activeLoc]; if (l && MAPVIEW.ready) MAPVIEW.focusPlace(l.mapName || l.name, true); }, 220);
  }
  let scrollRaf = 0;
  window.addEventListener("scroll", () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; onSplitScroll(); }); }, { passive: true });
  function startSplit(focusId) {
    const top = $(".tabs").getBoundingClientRect().bottom;
    document.documentElement.style.setProperty("--split-top", top + "px");
    activeLoc = null;
    MAPVIEW.show($("#splitmap"), focusId ? (LOC[focusId].mapName || LOC[focusId].name) : null, {
      embed: true,
      onUserMove(name) {
        const l = locForMap(name);
        if (!l || l.id === activeLoc) return;
        setActive(l.id);
        suppressScroll = Date.now() + 1200;
        const el = document.getElementById("loc-" + l.id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    }).then(() => { if (!focusId) onSplitScroll(); });
  }
  SPLIT_MQ.addEventListener("change", () => { if ((location.hash || "#/routes").startsWith("#/routes")) route(); });

  function renderTeam() {
    const C = D.extra.crewLines || [];
    if (!C.length) return "";
    const joined = C.filter((c) => c.line.some((id) => monS(id) === 2)).length;
    return `<div class="box team-box"><div class="team-hd"><h3>Straw Hat crew</h3><span class="muted small">${joined}/${C.length} aboard</span></div><div class="crew-row">` +
      C.map((c, i) => {
        const have = c.line.filter((id) => monS(id) === 2);
        const id = have.length ? have[have.length - 1] : c.line[c.line.length - 1];
        const final = c.line[c.line.length - 1];
        const on = have.length > 0;
        const next = on && id !== final ? `Next: ${SP[final].n}` : on ? SP[id].n : c.where;
        return `<button class="crew-slot ${on ? "on" : ""}" data-act="dex" data-id="${on ? id : c.line[0]}"><span class="slot">${i + 1}</span><img src="${spr(id)}" alt="" width="56" height="56" class="${on ? "" : "sil"}"><b>${esc(c.nick)}</b><span class="small">${esc(next)}</span></button>`;
      }).join("") + `</div></div>`;
  }

  function renderBag() {
    const b = flag("badges");
    const groups = {};
    Object.entries(UNL).forEach(([id, u]) => { (groups[u.group] = groups[u.group] || []).push([id, u]); });
    return `<details class="box bag" ${UI.bagOpen ? "open" : ""} data-act="bag">
      <summary><h3>Your bag</h3><span class="muted small">${b} badge${b === 1 ? "" : "s"}${flag("hof") ? ", Champion" : ""}</span><span class="caret">▸</span></summary>
      <p class="muted small" style="margin:8px 0 0">Tick what you have. Locked tables open up and "Come back to" fills in.</p>
      <div class="grp"><span>Badges</span><div class="badges">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<button class="chip ${b === n ? "on" : ""}" data-act="badges" data-v="${n}">${n}</button>`).join("")}
        <button class="chip ${flag("hof") ? "on" : ""}" data-act="flag" data-v="hof">Hall of Fame</button></div></div>
      ${Object.entries(groups).map(([g, list]) => `<div class="grp"><span>${esc(g)}</span><div class="badges">${list.map(([id, u]) => `<button class="chip ${flag(id) ? "on" : ""}" data-act="flag" data-v="${id}" title="${esc(u.where || "")}">${esc(u.name)}</button>`).join("")}</div></div>`).join("")}
    </details>`;
  }

  const progHtml = (st) => st.total ? `${st.caught}/${st.total}<small>caught · <span class="sn">${st.seen} seen</span></small>` : `–<small>no wild</small>`;

  function renderLoc(l, i) {
    const st = locStatus(l);
    const reqs = (l.req || []).map((r) => `<span class="lock ${has(r) ? "ok" : ""}">${has(r) ? "✓" : "🔒"} ${esc(unlockName(r))}</span>`).join("");
    const strip = l.mons.map((id) => `<img src="${spr(id)}" alt="${esc(SP[id].n)}" title="${esc(SP[id].n)}" data-mon="${id}" class="${monS(id) === 2 ? "c" : monS(id) === 1 ? "s" : ""}" loading="lazy" width="40" height="40">`).join("");
    return `<details class="box loc ${st.done ? "done" : ""}" id="loc-${l.id}" data-loc="${l.id}" data-mons="${l.mons.join(",")}" ${UI.open[l.id] ? "open" : ""}>
      <summary>
        <span class="num">${st.done ? "✓" : i + 1}</span>
        <span class="name">${esc(l.name)}</span>
        <span class="prog" data-prog>${progHtml(st)}</span>
        <span class="meta">${reqs}${(l.gates || []).length ? `<span>${l.gates.length} locked part${l.gates.length > 1 ? "s" : ""}</span>` : ""}</span>
        ${strip ? `<span class="strip">${strip}</span>` : ""}
      </summary>
      <div class="loc-body" data-body></div>
    </details>`;
  }

  function fillLoc(el) {
    const body = $("[data-body]", el);
    if (body.dataset.filled) return;
    const l = LOC[el.dataset.loc];
    const which = l.map ? l.map.split(":")[0] : "kanto";
    const focus = l.map ? l.map.split(":")[1] : null;
    let h = `<div class="loc-top"><div>${MAPS.svg(which, mapMarks(which), { focus })}</div><div class="notes">`;
    if (l.blurb) h += `<p>${esc(l.blurb)}</p>`;
    (l.gates || []).forEach((g) => {
      const ok = (g.need || []).every(has);
      h += `<div class="gate"><span class="lock ${ok ? "ok" : ""}">${ok ? "✓" : "🔒"} ${esc((g.need || []).map(unlockName).join(" + "))}</span><b>${esc(g.what)}</b>${g.when ? `<span>${esc(g.when)}</span>` : ""}</div>`;
    });
    if (l.back) h += `<div class="back"><b>Come back:</b> ${esc(l.back)}</div>`;
    if (l.notes) h += `<p>${esc(l.notes)}</p>`;
    h += `<p><a class="btn" style="display:inline-block;text-decoration:none" href="#/map/${encodeURIComponent(l.mapName || l.name)}">Open on the full map</a></p>`;
    h += `</div></div>`;

    const multi = l.floors.length > 1;
    let shown = 0;
    l.floors.forEach((f, fi) => {
      const inner = f.tables.map((t) => renderTable(l, f, t)).join("");
      if (!inner) return;
      shown++;
      if (multi) h += `<h3 style="margin-top:4px">${esc(f.label || "Area " + (fi + 1))}</h3>`;
      h += inner;
    });
    const hasWild = l.floors.some((f) => f.tables.length);
    if (!hasWild && !(l.battles || []).length) h += `<p class="muted">No Pokémon to catch here.</p>`;
    else if (hasWild && !shown && !UI.filter.battle) h += `<p class="muted">Everything here is hidden by your filters.</p>`;
    if (UI.filter.battle && (l.battles || []).length) h += renderBattles(l);
    body.innerHTML = h;
    body.dataset.filled = 1;
  }

  // Pokémon trainers use here: mark them seen (trainer Pokémon can't be caught)
  function renderBattles(l) {
    const by = new Map();
    l.battles.forEach((b) => b.p.forEach(([id, lv]) => {
      if (!SP[id]) return;
      const e = by.get(id) || { lo: lv, hi: lv, who: [] };
      e.lo = Math.min(e.lo, lv); e.hi = Math.max(e.hi, lv);
      if (!e.who.includes(b.n)) e.who.push(b.n);
      by.set(id, e);
    }));
    const rows = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([id, e]) => `<div class="row brow ${monS(id) >= 1 ? "seenrow" : ""}" data-row="${id}">
        ${seenBtn(id)}
        <img class="spr" src="${spr(id)}" alt="" loading="lazy" width="52" height="52">
        <div class="who"><b>${esc(SP[id].n)}</b><span class="lv">${e.lo === e.hi ? `Lv ${e.lo}` : `Lv ${e.lo}–${e.hi}`}</span>
          <div class="tip">${esc(e.who.slice(0, 3).join(", "))}${e.who.length > 3 ? ` +${e.who.length - 3} more` : ""}</div></div>
        <div></div></div>`).join("");
    const seen = [...by.keys()].filter((id) => monS(id) >= 1).length;
    return `<div class="tbl battle"><div class="tbl-head"><h4>In battle</h4><span class="muted small">${seen}/${by.size} seen · ${l.battles.length} trainer${l.battles.length > 1 ? "s" : ""}</span></div>${rows}
      <details class="trainers"><summary class="small">Trainers and their teams</summary>${l.battles.map((b) => `<div class="tr-row ${b.L ? "boss" : ""}"><b>${esc(b.n)}</b><span class="tr-party">${b.p.filter(([id]) => SP[id]).map(([id, lv]) => `<button class="pmon ${monS(id) >= 1 ? "on" : ""}" data-act="seen" data-mon="${id}" aria-pressed="${monS(id) >= 1}" aria-label="Seen ${esc(SP[id].n)}"><img src="${spr(id)}" alt="" loading="lazy" width="40" height="40"><small>${lv}</small></button>`).join("")}</span></div>`).join("")}</details></div>`;
  }

  function renderTable(l, f, t) {
    const needs = tableNeeds(l, f, t);
    const ok = needsMet(needs);
    if (!UI.filter[CAT(t.m)] || (UI.filter.hideLocked && !ok)) return "";
    const missing = needs.filter((n) => !has(n));
    const ci = Math.max(l.ci, ...needs.map((n) => (UNL[n] && UNL[n].chapter ? chIndex[UNL[n].chapter] : 0)));
    const showOdds = !["gift", "gift-egg", "npc-trade", "static", "pokeflute", "roaming-grass"].includes(t.m);
    let h = `<div class="tbl ${ok ? "" : "locked"}"><div class="tbl-head"><h4>${esc(METHOD_LABEL[t.m] || t.m)}</h4>${missing.length ? `<span class="lock">🔒 ${esc(missing.map(unlockName).join(" + "))}</span>` : ""}</div>`;
    t.mons.forEach((m) => {
      const sp = SP[m.id];
      let ballHtml = "";
      if (t.m === "npc-trade") ballHtml = `Trade ${esc(condText(m.c).replace(/^for /, ""))}`;
      else if (t.m === "gift" || t.m === "gift-egg") ballHtml = `Gift${m.c ? ", " + esc(condText(m.c)) : ""}`;
      else {
        const lv = m.lo;
        const r = recommend(sp, lv, ci, l.safari && t.m !== "surf" ? true : !!l.safari);
        ballHtml = `<img src="${ITEM + BALLS[r.ball].img}.png" alt="">${BALLS[r.ball].n} · ${r.text}`;
        if (m.c) ballHtml += ` · ${esc(condText(m.c))}`;
      }
      const tip = D.extra.tips && D.extra.tips[m.id];
      const rare = showOdds && m.p <= 5;
      h += `<div class="row ${monS(m.id) === 2 ? "caught" : ""}" data-row="${m.id}">
        ${checkBtn(m.id)}${seenBtn(m.id)}
        <img class="spr" src="${spr(m.id)}" alt="" loading="lazy" width="52" height="52">
        <div class="who"><b>${esc(sp.n)}</b><span class="lv">${t.m === "npc-trade" ? "" : lvText(m)}</span>
          <div class="ball">${ballHtml}</div>
          ${tip ? `<div class="tip">${esc(tip)}</div>` : ""}
        </div>
        <div class="odds ${rare ? "rare" : ""}">${showOdds ? `<b>${m.p}%</b><div class="ob"><i style="width:${Math.min(100, m.p)}%"></i></div>` : `<b>${t.m === "static" || t.m === "pokeflute" ? "1×" : "–"}</b>`}</div>
      </div>`;
    });
    return h + `</div>`;
  }

  function refreshMon(id) {
    const s = monS(id);
    $$(`.check[data-mon="${id}"]`).forEach((b) => { b.classList.toggle("c", s === 2); b.setAttribute("aria-pressed", s === 2); });
    $$(`.seen[data-mon="${id}"], .pmon[data-mon="${id}"]`).forEach((b) => { b.classList.toggle("on", s >= 1); b.setAttribute("aria-pressed", s >= 1); });
    $$(`[data-row="${id}"]`).forEach((r) => r.classList.toggle("caught", s === 2));
    $$(`.strip img[data-mon="${id}"]`).forEach((im) => { im.className = s === 2 ? "c" : s === 1 ? "s" : ""; });
    $$(`details.loc`).forEach((el) => {
      if (!el.dataset.mons.split(",").includes(String(id))) return;
      const st = locStatus(LOC[el.dataset.loc]);
      $("[data-prog]", el).innerHTML = progHtml(st);
      el.classList.toggle("done", st.done);
      $(".num", el).textContent = st.done ? "✓" : LOC[el.dataset.loc].i + 1;
    });
    const k = counts(KANTO_MAX);
    if ($("#kCaught")) { $("#kCaught").textContent = k.caught; $("#kSeen").textContent = k.seen; $("#kBar").style.width = (k.caught / 151) * 100 + "%"; }
    if ($("#nCaught")) $("#nCaught").textContent = counts(386).caught;
    if ($("#bigmap")) $("#bigmap").innerHTML = MAPS.svg(UI.map, mapMarks(UI.map), { labels: true });
    const tb = $(".team-box");
    if (tb) tb.outerHTML = renderTeam();
    if (window.MAPVIEW && MAPVIEW.ready) MAPVIEW.redraw();
    $$(`.dex-cell[data-id="${id}"]`).forEach((c) => { c.classList.toggle("c", s === 2); c.classList.toggle("s", s === 1); });
  }

  // ---------------- DEX PAGE ----------------
  function obtainNote(id) {
    const sp = SP[id];
    const notes = D.extra.notes || {};
    if (notes[id]) return notes[id];
    if (WHERE[id]) return null;
    // walk down the chain to find a catchable ancestor
    let cur = id, path = [];
    while (SP[cur] && SP[cur].f) { path.unshift(cur); cur = SP[cur].f; if (WHERE[cur]) break; }
    if (WHERE[cur] && cur !== id) return `Evolve ${SP[cur].n}: ${path.map((p) => SP[p].n + " (" + (SP[p].e || "?") + ")").join(" → ")}.`;
    if ((D.extra.lgMissing || []).includes(id)) return "Not in LeafGreen. Trade it over from FireRed (or Ruby/Sapphire/Emerald after the National Dex).";
    if (sp.e === undefined && id > 151) return "Not found in LeafGreen. Trade from Ruby, Sapphire, Emerald or Colosseum/XD.";
    return "Not found wild in LeafGreen.";
  }

  function renderDex() {
    const app = $("#app");
    const max = UI.natl ? 386 : 151;
    const k = counts(max);
    app.innerHTML = `<div class="dex-tools">
      <div class="box"><div class="stats">
        <div class="stat"><b>${k.caught}</b><span>caught of ${max}</span></div>
        <div class="stat"><b>${k.seen}</b><span>seen</span></div>
        <div class="stat"><b>${max - k.caught}</b><span>to go</span></div></div>
        <div class="bar"><i style="width:${(k.caught / max) * 100}%"></i></div></div>
      <input type="search" id="dexq" placeholder="Search name or number" value="${esc(UI.dexQ || "")}" autocomplete="off">
      <div class="badges" style="margin:0">
        ${["all", "missing", "seen", "caught"].map((f) => `<button class="chip ${UI.dexFilter === f ? "on" : ""}" data-act="dexf" data-v="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join("")}
        <button class="chip ${UI.natl ? "on" : ""}" data-act="natl" style="margin-left:auto">National (386)</button>
      </div></div>
      <div class="dex-grid" id="dexgrid"></div>`;
    fillDexGrid();
    $("#dexq").addEventListener("input", (e) => { UI.dexQ = e.target.value; saveUI(); fillDexGrid(); });
  }
  function fillDexGrid() {
    const max = UI.natl ? 386 : 151;
    const q = (UI.dexQ || "").trim().toLowerCase();
    let h = "";
    for (let id = 1; id <= max; id++) {
      const sp = SP[id], s = monS(id);
      if (UI.dexFilter === "missing" && s === 2) continue;
      if (UI.dexFilter === "seen" && s !== 1) continue;
      if (UI.dexFilter === "caught" && s !== 2) continue;
      if (q && !sp.n.toLowerCase().includes(q) && String(id) !== q.replace(/^#?0*/, "")) continue;
      const odd = !WHERE[id] && !obtainNote(id).startsWith("Evolve");
      h += `<div class="dex-cell ${s === 2 ? "c" : s === 1 ? "s" : ""} ${odd ? "x" : ""}" data-id="${id}" data-act="dex" role="button" tabindex="0" aria-label="${esc(sp.n)}">
        <span class="no">#${String(id).padStart(3, "0")}</span>
        <span class="dex-tg">${seenBtn(id)}${checkBtn(id)}</span>
        <img src="${spr(id)}" alt="" loading="lazy" width="72" height="72"><div class="nm">${esc(sp.n)}</div></div>`;
    }
    $("#dexgrid").innerHTML = h || `<p class="muted">Nothing here.</p>`;
  }

  function openMon(id) {
    const sp = SP[id];
    const s = monS(id);
    const where = (WHERE[id] || []).slice().sort((a, b) => a.l.i - b.l.i || b.m.p - a.m.p);
    // collapse duplicates by location + method
    const seenKey = new Set();
    const rows = [];
    where.forEach((w) => {
      const key = w.l.id + w.t.m;
      if (seenKey.has(key)) return; seenKey.add(key);
      const best = where.filter((x) => x.l.id === w.l.id && x.t.m === w.t.m).reduce((a, b) => (b.m.p > a.m.p ? b : a));
      rows.push(best);
    });
    let root = id; while (SP[root].f) root = SP[root].f;
    const chain = [];
    (function walk(x, depth) { chain.push([x, depth]); (CHILDREN[x] || []).forEach((c) => walk(c, depth + 1)); })(root, 0);
    const note = obtainNote(id);
    const tip = D.extra.tips && D.extra.tips[id];
    const lv = rows.length ? rows[0].m.lo : 20;
    const ballRow = (b, m) => `<tr><td><img src="${ITEM + BALLS[b].img}.png" alt=""> ${BALLS[b].n}</td><td>${pct(catchP(sp.c, m, 1, 1))}</td><td>${pct(catchP(sp.c, m, 0.05, 1))}</td><td>${pct(catchP(sp.c, m, 0.05, 2))}</td></tr>`;

    const html = `<div class="in">
      <div class="hd"><img src="${spr(id)}" alt="">
        <div><span class="muted small">#${String(id).padStart(3, "0")}</span><h2>${esc(sp.n)}</h2><div class="types">${sp.t.map(typeTag).join("")}</div></div>
        <button class="x" data-act="close" aria-label="Close" autofocus>✕</button></div>
      <div class="actions">
        <button class="btn ${s === 2 ? "on" : "primary"}" data-act="sheet-catch" data-mon="${id}">${s === 2 ? "Caught ✓" : "Mark caught"}</button>
        <button class="btn ${s >= 1 ? "on" : ""}" data-act="sheet-seen" data-mon="${id}">${s >= 1 ? "Seen ✓" : "Mark seen"}</button>
      </div>
      ${note ? `<div class="note ${note.startsWith("Not") ? "warn" : ""}">${esc(note)}</div>` : ""}
      ${tip ? `<div class="note">${esc(tip)}</div>` : ""}
      ${rows.length ? `<div><h3 style="margin-bottom:6px">Where to find it</h3><div class="where">${rows.map((w) => `<a href="#/routes/${w.l.id}" data-act="close-go"><b class="pc">${esc(w.l.name)}${w.l.floors.length > 1 && w.f.label ? " · " + esc(w.f.label) : ""}</b><b>${["gift", "gift-egg", "npc-trade", "static", "pokeflute", "roaming-grass"].includes(w.t.m) ? "" : w.m.p + "%"}</b><span>${esc(METHOD_LABEL[w.t.m] || w.t.m)}${w.t.m === "npc-trade" ? "" : " · " + lvText(w.m)}${w.m.c ? " · " + esc(condText(w.m.c)) : ""}</span><span>${esc(CH[w.l.ci].name)}</span></a>`).join("")}</div></div>` : ""}
      ${chain.length > 1 ? `<div><h3 style="margin-bottom:6px">Evolution</h3><div class="evo">${chain.map(([x, d], i) => `${i ? `<span>→ ${esc(SP[x].e || "")}</span>` : ""}<button data-act="dex" data-id="${x}"><img src="${spr(x)}" alt="">${esc(SP[x].n)}</button>`).join("")}</div></div>` : ""}
      <div><h3 style="margin-bottom:4px">Catch odds per throw</h3><p class="muted small" style="margin:0 0 6px">Catch rate ${sp.c}. Gen 3 formula.</p>
        <table class="ctab"><thead><tr><th>Ball</th><th>Full HP</th><th>Red HP</th><th>Red + asleep</th></tr></thead><tbody>
        ${ballRow("poke", 1)}${ballRow("great", 1.5)}${ballRow("ultra", 2)}${BALLS.net.mult(sp) > 1 ? ballRow("net", 3) : ""}${lv < 30 ? ballRow("nest", BALLS.nest.mult(sp, lv)) : ""}
        </tbody></table></div>
    </div>`;
    const dlg = $("#sheet");
    dlg.innerHTML = html;
    dlg.dataset.mon = id;
    if (!dlg.open) dlg.showModal();
  }

  // ---------------- OAK PAGE ----------------
  function oakLine() {
    const o = D.extra.oak;
    const n = o.basis === "seen" ? counts(151).seen : counts(151).caught;
    const tier = o.tiers.find((t) => n >= t.min && n <= t.max) || o.tiers[o.tiers.length - 1];
    return { n, tier };
  }
  function renderOak() {
    const o = D.extra.oak;
    if (!o) { $("#app").innerHTML = `<div class="box"><p>Professor Oak is still on his way to the lab.</p></div>`; return; }
    const { n, tier } = oakLine();
    const k = counts(151);
    const aides = (D.extra.aides || []).map((a) => {
      const ok = k.caught >= a.need;
      return `<div class="aide ${ok ? "ok" : ""}"><b>${esc(a.where)}</b><span class="st">${ok ? "Ready" : `${k.caught}/${a.need}`}</span><span class="muted small">${esc(a.reward)} for ${a.need} caught</span></div>`;
    }).join("");
    $("#app").innerHTML = `<div class="lab">
      <div class="pc"><div class="screen"><img src="${OAK}" alt="Professor Oak">
        <div class="readout">PROF. OAK'S PC<b>${n}</b>${o.basis === "seen" ? "Pokémon seen" : "Pokémon caught"} · Kanto<br><span style="opacity:.7">${k.caught} caught · ${k.seen} seen</span></div></div>
        <div class="ctrl"><button class="call" data-act="call">Call Prof. Oak</button><span class="small" style="color:#3b4b5a">${esc(o.how || "")}</span></div></div>
      <div class="dialog" id="oakSays" aria-live="polite"><span id="oakText">Press the button. He's usually by the phone.</span><span class="more">▼</span></div>
      <div class="box"><h3>Where you stand</h3><div class="tiers" style="margin-top:8px">${o.tiers.map((t) => `<div class="${t === tier ? "now" : ""}"><b>${t.min}${t.max >= 999 ? "+" : "–" + t.max}</b><span>${esc(t.short)}</span></div>`).join("")}</div></div>
      ${aides ? `<div class="box"><h3>Oak's aides</h3><p class="muted small" style="margin:4px 0 10px">They check your caught count and hand over a reward.</p><div class="aides">${aides}</div></div>` : ""}
      ${o.extra ? `<div class="box"><h3>Also worth knowing</h3><div class="notes" style="margin-top:8px">${o.extra.map((x) => `<p>${esc(x)}</p>`).join("")}</div></div>` : ""}
    </div>`;
  }
  let typing = null;
  function callOak() {
    const { n, tier } = oakLine();
    const o = D.extra.oak;
    const lines = [`Ah, it's you! Let me look at your Pokédex…`, `You've ${o.basis === "seen" ? "seen" : "caught"} ${n} kinds of Pokémon.`, ...tier.say];
    const box = $("#oakSays"), out = $("#oakText");
    let li = 0;
    clearInterval(typing);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function next() {
      if (li >= lines.length) { box.classList.remove("wait"); box.onclick = null; return; }
      const text = lines[li++];
      box.classList.remove("wait");
      if (reduce) { out.textContent = text; box.classList.add("wait"); return; }
      let c = 0; out.textContent = "";
      typing = setInterval(() => {
        out.textContent = text.slice(0, ++c);
        if (c >= text.length) { clearInterval(typing); typing = null; box.classList.toggle("wait", li < lines.length); }
      }, 22);
    }
    box.onclick = () => { if (typing) { clearInterval(typing); typing = null; out.textContent = lines[li - 1]; box.classList.toggle("wait", li < lines.length); } else next(); };
    next();
    if (li < lines.length) box.classList.add("wait");
  }

  // ---------------- PLAN PAGE ----------------
  const PLAN_FOR_CHAPTER = { misty: ["misty"], surge: ["surge"], erika: ["erika"], koga: ["koga"], sabrina: ["sabrina"], blaine: ["blaine"], sevii: ["sevii", "giovanni"], league: ["league"] };
  // badges you hold once a stop is behind you (sevii has no gym, so it only finishes by checklist or button)
  const PLAN_BADGES_AFTER = { misty: 2, surge: 3, erika: 4, koga: 5, sabrina: 6, blaine: 7, giovanni: 8 };
  function planDone(m) {
    if (flag("plandone:" + m.id)) return true;
    if (m.id === "league") return !!flag("hof");
    if (PLAN_BADGES_AFTER[m.id] && flag("badges") >= PLAN_BADGES_AFTER[m.id]) return true;
    return m.prep.length > 0 && m.prep.every(({ k }) => flag(`plan:${m.id}:${k}`));
  }
  function planState() {
    const P = D.extra.plan || [];
    const curM = P.find((m) => !planDone(m));
    const cur = curM ? curM.id : null;
    const ci = cur ? P.indexOf(curM) : P.length;
    return { P, cur, ci };
  }
  const planSprite = (id, cls) => `<img class="${cls || ""}" src="${spr(id)}" alt="" loading="lazy" width="56" height="56">`;
  function planCard(m, inline) {
    const { P, cur, ci } = planState();
    const isCur = m.id === cur;
    const done = planDone(m) || P.indexOf(m) < ci;
    // each item keeps a fixed key, so removing one never moves someone's tick onto another line
    const prep = m.prep.map(({ k: pk, t }) => {
      const k = `plan:${m.id}:${pk}`;
      return `<label class="prep ${flag(k) ? "on" : ""}"><input type="checkbox" data-act="plan" data-k="${k}" ${flag(k) ? "checked" : ""}><span>${esc(t)}</span></label>`;
    }).join("");
    const left = m.prep.filter(({ k }) => !flag(`plan:${m.id}:${k}`)).length;
    const kicker = (inline ? "Team plan · " : "") + (isCur ? "You are here" : done ? "Done" : "Up next");
    const open = inline ? isCur && !done : isCur || UI.plan === m.id;
    return `<details class="box plan ${inline ? "inline" : ""} ${isCur ? "now" : ""} ${done ? "past" : ""}" ${open ? "open" : ""} data-plan="${m.id}">
      <summary><span class="kicker">${kicker}</span><h2>${esc(m.title)}</h2><span class="muted small">Target ${esc(m.target)}${left ? ` · ${left} to do` : " · all set"}</span></summary>
      <div class="plan-body">
        ${m.bosses.length ? `<div class="bosses">${m.bosses.map((bo) => `<div class="boss"><div class="boss-h"><b>${esc(bo.name)}</b><span class="muted small">${esc(bo.where)}</span></div><div class="party">${bo.party.map(([id, lv]) => `<button data-act="dex" data-id="${id}">${planSprite(id)}<small>${lv}</small></button>`).join("")}</div></div>`).join("")}</div>` : ""}
        <h3>Your team</h3>
        <div class="team">${m.team.map(([id, nick, note]) => `<div class="tm">${planSprite(id, monS(id) === 2 ? "" : "sil")}<div><b>${esc(nick)}</b> <span class="muted small">${esc(SP[id].n)}</span>${note ? `<div class="small">${esc(note)}</div>` : ""}</div></div>`).join("")}</div>
        <h3>Before you go</h3>
        <div class="preps">${prep}</div>
        <button class="btn ${flag("plandone:" + m.id) ? "on" : "primary"} plan-done" data-act="plandone" data-v="${m.id}">${flag("plandone:" + m.id) ? "Marked done ✓ (tap to undo)" : "Mark this stop done"}</button>
      </div></details>`;
  }
  function renderPlan() {
    const { P } = planState();
    let h = `<div class="box plan-crew"><h2>The crew</h2><p class="muted small" style="margin:4px 0 10px">Party order follows the order the Straw Hats joined. Tap one for its Pokédex page.</p><div class="crew">` +
      (D.extra.crew || []).map(([id, nick, sp, moves], i) => `<button class="crew-m" data-act="dex" data-id="${id}"><span class="slot">${i + 1}</span>${planSprite(id)}<b>${esc(nick)}</b><span class="muted small">${esc(sp)}</span><span class="small">${esc(moves)}</span></button>`).join("") + `</div></div>`;
    P.forEach((m) => { h += planCard(m, false); });
    $("#app").innerHTML = `<div class="planpage">${h}</div>`;
  }

  // ---------------- SYNC SHEET ----------------
  function openSync() {
    const dlg = $("#sheet");
    const on = SYNC.connected;
    dlg.dataset.mon = "";
    dlg.innerHTML = `<div class="in">
      <div class="hd" style="grid-template-columns:1fr auto"><div><h2>Sync</h2><p class="muted small" style="margin:2px 0 0">Your checks save on this device straight away. Connect GitHub to share them between phone and laptop through a private Gist.</p></div><button class="x" data-act="close" aria-label="Close" autofocus>✕</button></div>
      ${on ? `<div class="note">Connected${SYNC.gistId ? `. Saving to <a href="https://gist.github.com/${esc(SYNC.gistId)}" target="_blank" rel="noopener">your private gist</a>` : ""}.</div>
        <p class="small muted" id="syncStatus"></p>
        <div class="actions"><button class="btn primary" data-act="sync-now">Sync now</button><button class="btn" data-act="sync-off">Disconnect</button></div>`
      : `<ol class="steps">
          <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → new fine-grained token</a>.</li>
          <li>Name it "LeafGreen Dex", pick an expiry.</li>
          <li>Under <b>Account permissions</b>, set <b>Gists</b> to <b>Read and write</b>. Nothing else.</li>
          <li>Generate, copy, paste it below. Do the same paste on your other device.</li>
        </ol>
        <label class="field"><span class="small muted">Token (stays on this device)</span><input type="password" id="tok" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
        <p class="small muted" id="syncStatus"></p>
        <div class="actions"><button class="btn primary" data-act="sync-connect">Connect</button></div>`}
      <details><summary class="small muted" style="cursor:pointer">Backup code (copy progress by hand)</summary>
        <p class="small muted">Copy this to back up, or paste one from another device and press Import. Import merges, it never deletes.</p>
        <textarea class="code" id="bk">${esc(btoa(unescape(encodeURIComponent(JSON.stringify(S)))))}</textarea>
        <div class="actions" style="margin-top:8px"><button class="btn" data-act="bk-import">Import</button></div></details>
    </div>`;
    if (!dlg.open) dlg.showModal();
    updateSyncStatus();
  }
  function updateSyncStatus(st, err) {
    const el = $("#syncStatus");
    if (!el) return;
    st = st || window.__syncS;
    el.textContent = st === "syncing" ? "Syncing…" : st === "error" ? err || window.__syncE : st === "offline" ? "Offline. Will sync when you're back online." : st === "idle" ? "Up to date." : "";
  }

  // ---------------- router + events ----------------
  function route() {
    const [, page, arg] = (location.hash || "#/routes").split("/");
    $$(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === (page || "routes")));
    document.body.classList.toggle("on-map", page === "map");
    document.body.classList.remove("is-split");
    if (page === "dex") { renderDex(); if (arg) openMon(+arg); }
    else if (page === "oak") renderOak();
    else if (page === "plan") renderPlan();
    else if (page === "map") { MAPVIEW.show($("#app"), arg); return; }
    else renderRoutes(arg);
    if (!arg) window.scrollTo(0, 0);
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) {
      const k = e.target.closest(".map [data-k]");
      if (k) {
        const which = e.target.closest("svg").classList.contains("sevii") ? "sevii" : "kanto";
        const hit = LOCS.find((l) => l.map === which + ":" + k.dataset.k);
        if (hit) location.hash = "#/routes/" + hit.id;
      }
      return;
    }
    const act = t.dataset.act;
    const id = +t.dataset.mon;
    if (act === "catch") {
      e.preventDefault();
      const next = monS(id) === 2 ? 1 : 2;
      setMon(id, next);
      if (next === 2) { t.classList.add("pop"); setTimeout(() => t.classList.remove("pop"), 400); toast(`Gotcha! ${SP[id].n} was caught!`); }
    } else if (act === "seen") {
      e.preventDefault();
      if (monS(id) === 2) { toast(`${SP[id].n} is caught, so it's already seen`); return; }
      setMon(id, monS(id) >= 1 ? 0 : 1);
      if (monS(id) === 1) toast(`${SP[id].n} marked seen`);
    } else if (act === "badges") { setFlag("badges", +t.dataset.v); route(); }
    else if (act === "flag") { setFlag(t.dataset.v, flag(t.dataset.v) ? 0 : 1); route(); }
    else if (act === "map") { UI.map = t.dataset.v; saveUI(); route(); }
    else if (act === "plan") return;
    else if (act === "plandone") {
      const id = t.dataset.v, on = !flag("plandone:" + id);
      setFlag("plandone:" + id, on ? 1 : 0);
      if (on && PLAN_BADGES_AFTER[id] && flag("badges") < PLAN_BADGES_AFTER[id]) { setFlag("badges", PLAN_BADGES_AFTER[id]); toast(`Bag updated: ${PLAN_BADGES_AFTER[id]} badges`); }
      if (on && id === "league") setFlag("hof", 1);
      route();
      const nxt = $(".plan.now"); if (nxt) nxt.scrollIntoView({ behavior: "smooth", block: "start" });
    } // handled on "change" below, so a tap on the label counts once
    else if (act === "filt") { UI.filter[t.dataset.v] = UI.filter[t.dataset.v] ? 0 : 1; saveUI(); route(); }
    else if (act === "dexf") { UI.dexFilter = t.dataset.v; saveUI(); renderDex(); }
    else if (act === "natl") { UI.natl = !UI.natl; saveUI(); renderDex(); }
    else if (act === "dex") { openMon(+t.dataset.id); }
    else if (act === "close") { $("#sheet").close(); }
    else if (act === "close-go") { $("#sheet").close(); }
    else if (act === "sheet-catch") { setMon(id, monS(id) === 2 ? 1 : 2); openMon(id); if (monS(id) === 2) toast(`Gotcha! ${SP[id].n} was caught!`); }
    else if (act === "sheet-seen") { if (monS(id) === 2) { toast("Caught counts as seen"); return; } setMon(id, monS(id) >= 1 ? 0 : 1); openMon(id); }
    else if (act === "call") callOak();
    else if (act === "sync-connect") {
      const tok = $("#tok").value.trim();
      if (!tok) return;
      SYNC.connect(tok).then((ok) => { if (ok) { toast("Synced with GitHub"); openSync(); route(); } });
    } else if (act === "sync-now") SYNC.syncNow().then(() => route());
    else if (act === "sync-off") { SYNC.disconnect(); openSync(); }
    else if (act === "bk-import") {
      try {
        const data = JSON.parse(decodeURIComponent(escape(atob($("#bk").value.trim()))));
        S = SYNC.merge(S, data); save(); toast("Imported"); $("#sheet").close(); route();
      } catch { toast("That code didn't work"); }
    }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("dex-cell")) { e.preventDefault(); openMon(+e.target.dataset.id); }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!t.matches || !t.matches('input[data-act="plan"]')) return;
    const k = t.dataset.k;
    const before = planState().cur;
    setFlag(k, t.checked ? 1 : 0);
    $$(`[data-act="plan"][data-k="${k}"]`).forEach((c) => { c.checked = t.checked; c.closest(".prep").classList.toggle("on", t.checked); });
    if (planState().cur !== before) { route(); toast("Stop done. On to the next one!"); const nxt = $(".plan.now"); if (nxt) nxt.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
  document.addEventListener("toggle", (e) => {
    const el = e.target;
    if (el.matches && el.matches("details.loc")) {
      if (el.open) { UI.open[el.dataset.loc] = 1; fillLoc(el); } else delete UI.open[el.dataset.loc];
      saveUI();
    } else if (el.matches && el.matches("details.bag")) { UI.bagOpen = el.open; saveUI(); }
  }, true);
  $("#sheet").addEventListener("click", (e) => { if (e.target === $("#sheet")) $("#sheet").close(); });
  $("#sheet").addEventListener("close", () => { if (location.hash.startsWith("#/dex/")) history.replaceState(null, "", "#/dex"); });
  $("#syncPill").addEventListener("click", openSync);
  window.addEventListener("hashchange", route);

  SYNC.on((st, err) => {
    window.__syncS = st; window.__syncE = err;
    const pill = $("#syncPill");
    pill.dataset.s = st;
    $("span", pill).textContent = { off: "Local", idle: "Synced", syncing: "Syncing", error: "Sync error", offline: "Offline" }[st];
    updateSyncStatus(st, err);
  });
  SYNC.init(() => S, (merged) => {
    const before = JSON.stringify(S);
    S = merged; ls.set(KEY, S);
    if (before !== JSON.stringify(S)) route();
  });
  window.APP = {
    flag, setFlag: (k, v) => { setFlag(k, v); }, monS, toast,
    name: (id) => (SP[id] ? SP[id].n : null),
    openMon: (id) => openMon(id),
    toggleSeen: (id) => { if (monS(id) === 2) return 2; setMon(id, monS(id) >= 1 ? 0 : 1); return monS(id); },
    canReach: (name, kind) => needsMet(mapNeeds(name, kind)),
    lockText: (name, kind) => "Needs " + mapNeeds(name, kind).filter((u) => !has(u)).map(unlockName).join(" + "),
  };
  route();

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js");
})();
