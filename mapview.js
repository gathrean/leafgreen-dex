// Full world map: Leaflet over the tiles rendered by tools/render_map.py.
(function () {
  const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
  const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
  const ITEM = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/";
  const SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/firered-leafgreen/";
  const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const LAYERS = [
    { id: "labels", n: "Place names", on: 1, z: 1 },
    { id: "specials", n: "Gifts, fossils & legendaries", on: 1, z: 2 },
    { id: "trainers", n: "Trainer battles", on: 1, z: 3.5 },
    { id: "mons", n: "Pokémon", on: 1, z: 3 },
    { id: "items", n: "Items", on: 1, z: 4 },
    { id: "hidden", n: "Hidden items", on: 1, z: 4 },
    { id: "obstacles", n: "Cut trees, boulders, rocks", on: 1, z: 4 },
    { id: "warps", n: "Doors & warps", on: 0, z: 4 },
    { id: "npcs", n: "People", on: 0, z: 4 },
  ];
  const KINDS = [
    { id: "land", n: "Grass & caves" },
    { id: "surf", n: "Surfing" },
    { id: "fish", n: "Fishing" },
    { id: "rock", n: "Rock Smash" },
  ];
  const kindOf = (k) => (k.endsWith("_rod") ? "fish" : k);
  const METHOD = { land: "Grass / walking", surf: "Surfing", rock: "Rock Smash", old_rod: "Old Rod", good_rod: "Good Rod", super_rod: "Super Rod" };
  const SPECIAL_NOTE = {
    "Dome Fossil": "Pick ONE fossil here: Dome (Kabuto) or Helix (Omanyte). The other is gone. Revive it at the Cinnabar Lab.",
    "Helix Fossil": "Pick ONE fossil here: Helix (Omanyte) or Dome (Kabuto). The other is gone. Revive it at the Cinnabar Lab.",
    "Old Amber": "From the scientist in the museum's back room (needs Cut). Revives into Aerodactyl at the Cinnabar Lab, on top of your Mt. Moon fossil.",
    Hitmonlee: "Beat the Dojo, then choose Hitmonlee OR Hitmonchan.",
    Hitmonchan: "Beat the Dojo, then choose Hitmonlee OR Hitmonchan.",
    Electrode: "Looks like an item. It's a Lv 34 Electrode that can Self-Destruct. Save first.",
    Snorlax: "Lv 30, wake it with the Poké Flute. One chance. Save first.",
    Eevee: "Free Eevee on the roof room table. Back entrance of Celadon Mansion.",
  };

  let placedSpecials = [];
  let loading = null, map = null, W = null, group = null, tileSet = null, opts = {}, programmatic = 0;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const prefs = ls.get("lgdex.map", {});
  prefs.layers = Object.assign(Object.fromEntries(LAYERS.map((l) => [l.id, l.on])), prefs.layers || {});
  if (!prefs.v2) { prefs.layers.trainers = 1; prefs.v2 = 1; }
  prefs.kinds = Object.assign(Object.fromEntries(KINDS.map((k) => [k.id, 1])), prefs.kinds || {});
  const savePrefs = () => ls.set("lgdex.map", prefs);

  function addCss(href) { return new Promise((res) => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = res; l.onerror = res; document.head.appendChild(l); }); }
  function addJs(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function load() {
    if (!loading) loading = Promise.all([addCss(LEAFLET_CSS), addJs(LEAFLET_JS), addJs("map/markers.js?t=" + Date.now().toString(36).slice(0, -4))]);
    return loading;
  }

  const ll = (x, y) => map.unproject([x, y], W.maxZoom);
  const itemKey = (m) => "item:" + m[0] + "," + m[1];
  const icon = (html, cls, size) => L.divIcon({ html, className: "mk " + cls, iconSize: size || [0, 0], iconAnchor: size ? [size[0] / 2, size[1] / 2] : [0, 0] });

  function draw() {
    if (!map) return;
    group.clearLayers();
    const z = map.getZoom();
    const b = map.getBounds().pad(0.15);
    const tl = map.project(b.getNorthWest(), W.maxZoom), br = map.project(b.getSouthEast(), W.maxZoom);
    const inView = (x, y) => x >= tl.x && x <= br.x && y >= tl.y && y <= br.y;
    map.getContainer().style.setProperty("--s", Math.pow(2, z - W.maxZoom));
    const A = window.APP;
    placedSpecials = [];
    // labels: most important first, skip any that would overlap one already shown
    const boxes = [];
    const fits = (x, y, text, size) => {
      const p = map.latLngToContainerPoint(ll(x, y));
      const w = text.length * size * 0.62 + 6, h = size + 6;
      const b = [p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2];
      if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) return false;
      boxes.push(b);
      return true;
    };
    W.labelsSorted = W.labelsSorted || W.labels.slice().sort((a, b) => [3, 0, 2, 1][a[3]] - [3, 0, 2, 1][b[3]]);
    LAYERS.forEach((L0) => {
      if (!prefs.layers[L0.id] || z < L0.z) return;
      (L0.id === "mons" ? W.monsM : L0.id === "labels" ? W.labelsSorted : W[L0.id]).forEach((m) => {
        const x = L0.id === "labels" ? m[1] : m[0], y = L0.id === "labels" ? m[2] : m[1];
        if (L0.id === "labels") {
          const minZ = [4.5, 1, 4.5, 3][m[3]];
          if (z < minZ) return;
        }
        if (!inView(x, y)) return;
        if (L0.id === "labels" && !fits(x, y, m[0], [11, 15, 14, 15][m[3]])) return;
        const mk = build(L0.id, m, z, A);
        if (mk) group.addLayer(mk);
      });
    });
  }

  function build(layer, m, z, A) {
    const [x, y] = layer === "labels" ? [m[1], m[2]] : m;
    if (layer === "labels") return L.marker(ll(x, y), { icon: icon(`<span>${esc(m[0])}</span>`, "mk-label " + ["in", "out", "floor", "title"][m[3]]), interactive: false, keyboard: false });
    if (layer === "items" || layer === "hidden") {
      const got = A && A.flag(itemKey(m));
      if (got && prefs.hideGot) return null;
      const src = m[3] ? ITEM + m[3] + ".png" : ITEM + (m[2].startsWith("HM") ? "hm-normal" : "tm-normal") + ".png";
      const mk = L.marker(ll(x, y), { icon: icon(`<img src="${src}" alt="">${m[5] ? "<i>?</i>" : ""}`, `mk-item ${layer === "hidden" ? "hid" : ""} ${m[5] ? "renew" : ""} ${got ? "got" : ""}`, [28, 28]) });
      mk.on("click", () => itemPopup(mk, m, layer === "hidden"));
      return mk;
    }
    if (layer === "specials") {
      const dex = m[5];
      const src = dex ? SPRITE + dex + ".png" : m[3] ? `map/obj/${m[3]}.png` : ITEM + "poke-ball.png";
      const caught = dex && A && A.monS(dex) === 2;
      // neighbours (the two Mt. Moon fossils, the Dojo pair) put their label above instead of below
      const near = placedSpecials.some(([px, py]) => Math.abs(px - x) < 64 && Math.abs(py - y) < 32);
      placedSpecials.push([x, y]);
      const mk = L.marker(ll(x, y), { icon: icon(`<img src="${src}" alt=""><span>${esc(m[2])}</span>`, "mk-special " + (caught ? "c " : "") + (near ? "up" : "")), riseOnHover: true });
      mk.bindPopup(() => {
        const d = document.createElement("div");
        d.innerHTML = `<b>${esc(m[2])}</b><br><span class="muted">${esc(m[4])}</span>${SPECIAL_NOTE[m[2]] ? `<p style="margin:6px 0 0">${esc(SPECIAL_NOTE[m[2]])}</p>` : ""}`;
        if (dex && A) {
          const btn = document.createElement("button"); btn.className = "btn primary mk-go"; btn.textContent = "Open in Pokédex";
          btn.onclick = () => A.openMon(dex); d.appendChild(btn);
        }
        return d;
      });
      return mk;
    }
    if (layer === "trainers") {
      // m = [x, y, "Bug Catcher Rick", sprite, place, [[dex, lv]...], leader]
      const beat = A && A.flag("tr:" + x + "," + y);
      if (beat && prefs.hideBeaten) return null;
      const big = z >= W.maxZoom - 0.5;
      const spr = big && m[3] ? `<img src="map/obj/${m[3]}.png" alt="">` : "";
      const top = m[5].length ? Math.max(...m[5].map((p) => p[1])) : "";
      const mk = L.marker(ll(x, y), { icon: icon(spr + `<b class="${m[6] ? "gym" : ""}">${beat ? "✓" : m[6] ? "GYM" : "!"}${!beat && top ? `<small>${top}</small>` : ""}</b>`, `mk-obj mk-tr ${beat ? "beat" : ""} ${big ? "big" : ""}`), keyboard: false, riseOnHover: true });
      mk.on("click", () => trainerPopup(mk, m, x, y));
      return mk;
    }
    if (layer === "obstacles" || layer === "npcs") {
      const spr = m[3] ? `<img src="map/obj/${m[3]}.png" alt="">` : `<i></i>`;
      const mk = L.marker(ll(x, y), { icon: icon(spr + (layer === "trainers" ? "<b>!</b>" : ""), "mk-obj " + layer), keyboard: false });
      mk.bindPopup(`<b>${esc(m[2])}</b><br><span class="muted">${esc(m[4])}</span>${layer === "obstacles" ? `<br>${esc(obstacleHint(m[2]))}` : ""}`);
      return mk;
    }
    if (layer === "warps") {
      const mk = L.marker(ll(x, y), { icon: icon("<i></i>", "mk-warp", [14, 14]) });
      mk.bindPopup(() => {
        const d = document.createElement("div");
        d.innerHTML = `<b>To ${esc(m[2])}</b><br><span class="muted">from ${esc(m[5])}</span><br>`;
        if (m[3] != null) {
          const btn = document.createElement("button"); btn.className = "btn primary mk-go"; btn.textContent = "Go inside";
          btn.onclick = () => { map.closePopup(); map.flyTo(ll(m[3], m[4]), W.maxZoom, { duration: 0.8 }); };
          d.appendChild(btn);
        }
        return d;
      });
      return mk;
    }
    if (layer === "mons") {
      // m = [x, y, group, subs[{k, rows}], name]
      const subs = m[3].filter((sb) => prefs.kinds[kindOf(sb.k)]).map((sb) => ({ ...sb, ok: !A || A.canReach(m[4], sb.k) })).filter((sb) => sb.ok || !prefs.hideLocked);
      if (!subs.length) return null;
      const reachable = subs.some((sb) => sb.ok);
      const caught = (id) => A && A.monS(id) === 2;
      const ids = [...new Set(subs.flatMap((sb) => sb.rows.map((r) => r[0])))];
      const left = ids.filter((id) => !caught(id));
      const show = (left.length ? left : ids).slice(0, 3);
      const html = show.map((id) => `<img class="${caught(id) ? "c" : ""}" src="${SPRITE + id}.png" alt="">`).join("") +
        (ids.length > 3 ? `<em>+${ids.length - 3}</em>` : "") + (!left.length ? `<em class="ok">✓</em>` : "") + (!reachable ? `<em class="lk">🔒</em>` : "");
      const mk = L.marker(ll(x, y), { icon: icon(html, `mk-mons ${m[2]} ${reachable ? "" : "locked"}`), riseOnHover: true });
      mk.on("click", () => monsPopup(mk, m, subs));
      return mk;
    }
    return null;
  }

  function obstacleHint(n) {
    return n === "Cut tree" ? "Needs Cut (HM01) and the Cascade Badge." : n === "Strength boulder" ? "Needs Strength (HM04) and the Rainbow Badge." : n === "Rock Smash rock" ? "Needs Rock Smash (HM06). Smashing can start a wild battle." : "";
  }

  function trainerPopup(mk, m, x, y) {
    const A = window.APP;
    const d = document.createElement("div");
    d.className = "mk-pop";
    const render = () => {
      const beat = A && A.flag("tr:" + x + "," + y);
      d.innerHTML = `<b>${esc(m[2])}</b><br><span class="muted">${esc(m[4])}</span>` +
        (m[5].length ? `<div class="mk-party">${m[5].map(([id, lv]) => { const st = A ? A.monS(id) : 0; return `<button data-seen="${id}" class="${st >= 1 ? "on" : ""}"><img src="${SPRITE + id}.png" alt=""><span>${esc((A && A.name(id)) || "#" + id)}</span><small>Lv ${lv} · ${st === 2 ? "caught" : st === 1 ? "seen ✓" : "tap: seen"}</small></button>`; }).join("")}</div>` : `<p class="muted">Team not listed.</p>`);
      const btn = document.createElement("button");
      btn.className = "btn " + (beat ? "on" : "primary") + " mk-go";
      btn.textContent = beat ? "Beaten ✓" : "Mark beaten";
      btn.onclick = () => { A.setFlag("tr:" + x + "," + y, beat ? 0 : 1); render(); draw(); };
      d.appendChild(btn);
    };
    render();
    d.addEventListener("click", (e) => { const b = e.target.closest("button[data-seen]"); if (b && A) { A.toggleSeen(+b.dataset.seen); render(); } });
    L.popup({ maxWidth: 300, offset: [0, -14] }).setLatLng(mk.getLatLng()).setContent(d).openOn(map);
  }

  function itemPopup(mk, m, hidden) {
    const A = window.APP;
    const d = document.createElement("div");
    const render = () => {
      const got = A && A.flag(itemKey(m));
      d.innerHTML = `<b>${esc(m[2])}</b>${hidden ? ` <span class="muted">(hidden)</span>` : ""}<br><span class="muted">${esc(m[4])}</span>${hidden ? (m[5] ? `<p class="mk-renew">Random respawn. These start out empty. After every 1,500 steps, entering this area rerolls them, and they often stay empty.</p>` : `<br>Face this spot and press A. The Itemfinder helps you find it.`) : ""}<br>`;
      const btn = document.createElement("button");
      btn.className = "btn " + (got ? "on" : "primary") + " mk-go";
      btn.textContent = got ? "Picked up ✓" : "Mark picked up";
      btn.onclick = () => { A.setFlag(itemKey(m), got ? 0 : 1); render(); draw(); };
      d.appendChild(btn);
    };
    render();
    L.popup({ offset: [0, -6] }).setLatLng(mk.getLatLng()).setContent(d).openOn(map);
  }

  function monsPopup(mk, m, subs) {
    const A = window.APP;
    const d = document.createElement("div");
    d.className = "mk-pop";
    d.innerHTML = `<b>${esc(m[4])}</b>` + subs.map((sb) => {
      const lock = !sb.ok && A ? A.lockText(m[4], sb.k) : "";
      return `<div class="mk-sec">${esc(METHOD[sb.k] || sb.k)}${lock ? ` <span class="mk-lock">🔒 ${esc(lock)}</span>` : ""}</div><div class="mk-rows">` + sb.rows.map((r) => {
        const c = A && A.monS(r[0]) === 2;
        return `<button data-id="${r[0]}" class="${c ? "c" : ""}"><img src="${SPRITE + r[0]}.png" alt=""><span>${esc((A && A.name(r[0])) || r[1])}<small>Lv ${r[3] === r[4] ? r[3] : r[3] + "–" + r[4]}${c ? " · caught" : ""}</small></span><b>${r[2]}%</b></button>`;
      }).join("") + `</div>`;
    }).join("");
    d.addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (b && A) A.openMon(+b.dataset.id); });
    L.popup({ maxWidth: 290, offset: [0, -10] }).setLatLng(mk.getLatLng()).setContent(d).openOn(map);
  }

  function fitRegion(r) {
    const [x0, y0, x1, y1] = W.regions[r];
    map.fitBounds(L.latLngBounds(ll(x0, y0), ll(x1, y1)), { padding: [10, 10] });
  }
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  function findPlace(name) {
    const q = norm(name);
    return W.maps.find((m) => norm(m[1]) === q) || W.maps.find((m) => norm(m[1]).startsWith(q)) || W.maps.find((m) => norm(m[1]).includes(q));
  }
  function focusPlace(name, animate) {
    if (!W || !map) return false;
    const hit = findPlace(name);
    if (!hit) return false;
    const [, , x, y, w, h] = hit;
    const bb = L.latLngBounds(ll(x, y), ll(x + w, y + h));
    programmatic = Date.now() + (animate ? 1500 : 600);
    if (animate) map.flyToBounds(bb, { padding: [24, 24], maxZoom: W.maxZoom - 1, duration: 0.6 });
    else map.fitBounds(bb, { padding: [16, 16], maxZoom: W.maxZoom });
    return true;
  }
  function centerMap() {
    const c = map.project(map.getCenter(), W.maxZoom);
    let best = null;
    W.maps.forEach((m) => {
      const [, , x, y, w, h] = m;
      if (c.x >= x && c.x <= x + w && c.y >= y && c.y <= y + h) best = m;
    });
    return best ? best[1] : null;
  }

  function panel(root) {
    const p = root.querySelector(".mv-panel");
    p.innerHTML = `<div class="mv-head"><h3>Layers</h3><button class="x" data-mv="close" aria-label="Close">✕</button></div>` +
      LAYERS.map((l) => `<label class="mv-row"><input type="checkbox" data-layer="${l.id}" ${prefs.layers[l.id] ? "checked" : ""}><span>${esc(l.n)}</span><small>${W[l.id].length}</small></label>` +
        (l.id === "mons" ? `<div class="mv-sub">${KINDS.map((k) => `<label class="mv-row"><input type="checkbox" data-kind="${k.id}" ${prefs.kinds[k.id] ? "checked" : ""}><span>${esc(k.n)}</span></label>`).join("")}
          <label class="mv-row"><input type="checkbox" data-hidelocked ${prefs.hideLocked ? "checked" : ""}><span>Hide what my bag can't reach yet</span></label></div>` : "")).join("") +
      `<label class="mv-row"><input type="checkbox" data-hidegot ${prefs.hideGot ? "checked" : ""}><span>Hide items I've picked up</span></label>
       <label class="mv-row"><input type="checkbox" data-hidebeaten ${prefs.hideBeaten ? "checked" : ""}><span>Hide trainers I've beaten</span></label>
       <p class="muted small" style="margin:8px 0 0">Locks follow "Your bag" on the Routes tab. Zoom in for smaller markers. Tap a door to jump inside.</p>`;
  }

  async function show(root, focus, o) {
    opts = o || {};
    root.innerHTML = `<div class="mv ${opts.embed ? "embed" : ""}">
      <div class="mv-bar">
        <input type="search" list="mv-places" placeholder="Find a place" aria-label="Find a place" class="mv-search">
        <datalist id="mv-places"></datalist>
        <button class="chip" data-mv="kanto">Kanto</button><button class="chip" data-mv="sevii">Sevii</button><button class="chip" data-mv="inside">Inside</button>
        <button class="chip" data-mv="layers">Layers</button>
      </div>
      <div class="mv-map" id="mvmap"><p class="muted" style="padding:16px">Loading map…</p></div>
      <div class="mv-panel box" hidden></div>
    </div>`;
    try { await load(); } catch { root.querySelector("#mvmap").innerHTML = `<p style="padding:16px">Couldn't load the map. Check your connection and reload.</p>`; return; }
    W = window.WORLD;
    tileSet = tileSet || new Set(W.tiles.split(" "));
    if (!W.monsM) {
      // one bubble per area for land, one for all water methods, one for Rock Smash
      const byKey = new Map();
      W.mons.forEach(([x, y, k, rows, name]) => {
        const g = k === "land" ? "land" : k === "rock" ? "rock" : "water";
        const key = name + "|" + g;
        if (!byKey.has(key)) byKey.set(key, [x, y, g, [], name]);
        const e = byKey.get(key);
        if (k === "surf") { e[0] = x; e[1] = y; }
        e[3].push({ k, rows });
      });
      const order = ["surf", "old_rod", "good_rod", "super_rod"];
      W.monsM = [...byKey.values()].map((e) => { e[3].sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k)); return e; });
    }
    root.querySelector("#mv-places").innerHTML = [...new Set(W.maps.map((m) => m[1]))].sort().map((n) => `<option value="${esc(n)}">`).join("");
    const el = root.querySelector("#mvmap");
    if (!opts.embed) {
      const fit = () => { el.style.height = Math.max(320, window.innerHeight - el.getBoundingClientRect().top - window.scrollY) + "px"; if (map) map.invalidateSize(); };
      fit();
      window.removeEventListener("resize", window.__mvfit || (() => {}));
      window.__mvfit = fit;
      window.addEventListener("resize", fit);
    }
    el.innerHTML = "";
    el.style.background = W.bg;
    if (map) { map.remove(); map = null; }
    map = L.map(el, { crs: L.CRS.Simple, minZoom: 0, maxZoom: W.maxZoom + 2, zoomSnap: 0.5, attributionControl: false, zoomControl: true });
    const bounds = L.latLngBounds(ll(0, 0), ll(W.w, W.h));
    const Tiles = L.TileLayer.extend({
      getTileUrl(c) { return tileSet.has(`${c.z}/${c.x}/${c.y}`) ? `map/tiles/${c.z}/${c.x}/${c.y}.webp?v=${W.ver}` : BLANK; },
    });
    new Tiles("", { maxNativeZoom: W.maxZoom, maxZoom: W.maxZoom + 2, tileSize: W.tile, bounds, noWrap: true, keepBuffer: 3, className: "mv-tiles" }).addTo(map);
    map.setMaxBounds(bounds.pad(0.25));
    group = L.layerGroup().addTo(map);
    map.on("moveend zoomend", draw);
    const saved = ls.get("lgdex.mapview", null);
    if (focus && focusPlace(decodeURIComponent(focus))) {}
    else if (saved) map.setView(L.latLng(saved.lat, saved.lng), saved.z);
    else fitRegion("kanto");
    map.on("moveend", () => {
      const c = map.getCenter();
      ls.set("lgdex.mapview", { lat: c.lat, lng: c.lng, z: map.getZoom() });
      if (Date.now() < programmatic) return;
      if (opts.onUserMove) { const n = centerMap(); if (n) opts.onUserMove(n); }
    });
    panel(root);
    draw();

    root.querySelector(".mv-search").addEventListener("change", (e) => { if (!focusPlace(e.target.value)) window.APP && window.APP.toast("No place by that name"); e.target.blur(); });
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-mv]"); if (!b) return;
      const v = b.dataset.mv;
      const pn = root.querySelector(".mv-panel");
      if (v === "layers") pn.hidden = !pn.hidden;
      else if (v === "close") pn.hidden = true;
      else fitRegion(v);
    });
    root.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.layer) prefs.layers[t.dataset.layer] = t.checked ? 1 : 0;
      else if (t.dataset.kind) prefs.kinds[t.dataset.kind] = t.checked ? 1 : 0;
      else if (t.hasAttribute("data-hidegot")) prefs.hideGot = t.checked ? 1 : 0;
      else if (t.hasAttribute("data-hidelocked")) prefs.hideLocked = t.checked ? 1 : 0;
      else if (t.hasAttribute("data-hidebeaten")) prefs.hideBeaten = t.checked ? 1 : 0;
      else return;
      savePrefs(); draw();
    });
  }

  window.MAPVIEW = {
    show,
    redraw: () => draw(),
    focusPlace,
    invalidate: () => map && map.invalidateSize(),
    get ready() { return !!map; },
  };
})();
