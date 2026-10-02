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
    { id: "mons", n: "Pokémon", on: 1, z: 2 },
    { id: "items", n: "Items", on: 1, z: 3 },
    { id: "hidden", n: "Hidden items", on: 1, z: 3 },
    { id: "obstacles", n: "Cut trees, boulders, rocks", on: 1, z: 3 },
    { id: "warps", n: "Doors & warps", on: 0, z: 4 },
    { id: "trainers", n: "Trainers", on: 0, z: 4 },
    { id: "npcs", n: "People", on: 0, z: 4 },
  ];
  const METHOD = { land: "Grass / walking", surf: "Surfing", rock: "Rock Smash", old_rod: "Old Rod", good_rod: "Good Rod", super_rod: "Super Rod" };

  let loading = null, map = null, W = null, group = null, tileSet = null, pending = null;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const prefs = ls.get("lgdex.map", { layers: Object.fromEntries(LAYERS.map((l) => [l.id, l.on])), hideGot: 0 });

  function addCss(href) { return new Promise((res) => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = res; l.onerror = res; document.head.appendChild(l); }); }
  function addJs(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function load() {
    if (!loading) loading = Promise.all([addCss(LEAFLET_CSS), addJs(LEAFLET_JS), addJs("map/markers.js")]);
    return loading;
  }

  const ll = (x, y) => map.unproject([x, y], W.maxZoom);
  const itemKey = (m) => "item:" + m[0] + "," + m[1];

  function icon(html, cls, size) {
    return L.divIcon({ html, className: "mk " + cls, iconSize: size || [0, 0], iconAnchor: size ? [size[0] / 2, size[1] / 2] : [0, 0] });
  }

  function draw() {
    if (!map) return;
    group.clearLayers();
    const z = map.getZoom();
    const b = map.getBounds().pad(0.15);
    const tl = map.project(b.getNorthWest(), W.maxZoom), br = map.project(b.getSouthEast(), W.maxZoom);
    const inView = (x, y) => x >= tl.x && x <= br.x && y >= tl.y && y <= br.y;
    map.getContainer().style.setProperty("--s", Math.pow(2, z - W.maxZoom));
    const A = window.APP;
    LAYERS.forEach((L0) => {
      if (!prefs.layers[L0.id] || z < L0.z) return;
      const list = W[L0.id];
      list.forEach((m) => {
        let x, y;
        if (L0.id === "labels") { [, x, y] = m; if (!m[3] && z < 3) return; }
        else [x, y] = m;
        if (!inView(x, y)) return;
        let mk;
        if (L0.id === "labels") {
          mk = L.marker(ll(x, y), { icon: icon(`<span>${esc(m[0])}</span>`, "mk-label " + (m[3] ? "out" : "in")), interactive: false, keyboard: false });
        } else if (L0.id === "items" || L0.id === "hidden") {
          const got = A && A.flag(itemKey(m));
          if (got && prefs.hideGot) return;
          const src = m[3] ? ITEM + m[3] + ".png" : ITEM + (m[2].startsWith("HM") ? "hm-normal" : "tm-normal") + ".png";
          mk = L.marker(ll(x, y), { icon: icon(`<img src="${src}" alt="">`, `mk-item ${L0.id === "hidden" ? "hid" : ""} ${got ? "got" : ""}`, [28, 28]) });
          mk.on("click", () => itemPopup(mk, m, L0.id === "hidden"));
        } else if (L0.id === "obstacles" || L0.id === "npcs" || L0.id === "trainers") {
          const spr = m[3] ? `<img src="map/obj/${m[3]}.png" alt="">` : `<i></i>`;
          mk = L.marker(ll(x, y), { icon: icon(spr + (L0.id === "trainers" ? "<b>!</b>" : ""), "mk-obj " + L0.id), keyboard: false });
          mk.bindPopup(`<b>${esc(m[2])}</b><br><span class="muted">${esc(m[4])}</span>${L0.id === "obstacles" ? `<br>${esc(obstacleHint(m[2]))}` : ""}`);
        } else if (L0.id === "warps") {
          mk = L.marker(ll(x, y), { icon: icon("<i></i>", "mk-warp", [14, 14]) });
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
        } else if (L0.id === "mons") {
          const rows = m[3];
          const caught = (id) => A && A.monS(id) === 2;
          const left = rows.filter((r) => !caught(r[0]));
          const show = (left.length ? left : rows).slice(0, 3);
          const html = `<span class="tag">${esc(METHOD[m[2]] || m[2])}</span>` + show.map((r) => `<img class="${caught(r[0]) ? "c" : ""}" src="${SPRITE + r[0]}.png" alt="">`).join("") + (rows.length > 3 ? `<em>+${rows.length - 3}</em>` : "") + (!left.length ? `<em class="ok">✓</em>` : "");
          mk = L.marker(ll(x, y), { icon: icon(html, "mk-mons " + m[2]), riseOnHover: true });
          mk.on("click", () => monsPopup(mk, m));
        }
        if (mk) group.addLayer(mk);
      });
    });
  }

  function obstacleHint(n) {
    return n === "Cut tree" ? "Needs Cut (HM01) and the Cascade Badge." : n === "Strength boulder" ? "Needs Strength (HM04) and the Rainbow Badge." : n === "Rock Smash rock" ? "Needs Rock Smash (HM06). Smashing can start a wild battle." : n === "Snorlax" ? "Wake it with the Poké Flute." : "";
  }

  function itemPopup(mk, m, hidden) {
    const A = window.APP;
    const d = document.createElement("div");
    const render = () => {
      const got = A && A.flag(itemKey(m));
      d.innerHTML = `<b>${esc(m[2])}</b>${hidden ? ` <span class="muted">(hidden)</span>` : ""}<br><span class="muted">${esc(m[4])}</span>${hidden ? `<br>Press A facing this spot, or use the Itemfinder.` : ""}<br>`;
      const btn = document.createElement("button");
      btn.className = "btn " + (got ? "on" : "primary") + " mk-go";
      btn.textContent = got ? "Picked up ✓" : "Mark picked up";
      btn.onclick = () => { A.setFlag(itemKey(m), got ? 0 : 1); render(); draw(); };
      d.appendChild(btn);
    };
    render();
    L.popup({ offset: [0, -6] }).setLatLng(mk.getLatLng()).setContent(d).openOn(map);
  }

  function monsPopup(mk, m) {
    const A = window.APP;
    const d = document.createElement("div");
    d.className = "mk-pop";
    d.innerHTML = `<b>${esc(m[4])}</b> · ${esc(METHOD[m[2]] || m[2])}<div class="mk-rows">` + m[3].map((r) => {
      const c = A && A.monS(r[0]) === 2;
      return `<button data-id="${r[0]}" class="${c ? "c" : ""}"><img src="${SPRITE + r[0]}.png" alt=""><span>${esc(A && A.name(r[0]) || r[1])}<small>Lv ${r[3] === r[4] ? r[3] : r[3] + "–" + r[4]}${c ? " · caught" : ""}</small></span><b>${r[2]}%</b></button>`;
    }).join("") + `</div>`;
    d.addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (b && A) A.openMon(+b.dataset.id); });
    L.popup({ maxWidth: 280, offset: [0, -10] }).setLatLng(mk.getLatLng()).setContent(d).openOn(map);
  }

  function fitRegion(r) {
    const [x0, y0, x1, y1] = W.regions[r];
    map.fitBounds(L.latLngBounds(ll(x0, y0), ll(x1, y1)), { padding: [10, 10] });
  }
  function focusPlace(name) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const q = norm(name);
    const hit = W.maps.find((m) => norm(m[1]) === q) || W.maps.find((m) => norm(m[1]).startsWith(q)) || W.maps.find((m) => norm(m[1]).includes(q));
    if (!hit) return false;
    const [, , x, y, w, h] = hit;
    map.fitBounds(L.latLngBounds(ll(x, y), ll(x + w, y + h)), { padding: [16, 16], maxZoom: W.maxZoom });
    return true;
  }

  function panel(root) {
    const p = root.querySelector(".mv-panel");
    p.innerHTML = `<div class="mv-head"><h3>Layers</h3><button class="x" data-mv="close" aria-label="Close">✕</button></div>` +
      LAYERS.map((l) => `<label class="mv-row"><input type="checkbox" data-layer="${l.id}" ${prefs.layers[l.id] ? "checked" : ""}><span>${esc(l.n)}</span><small>${W[l.id].length}</small></label>`).join("") +
      `<label class="mv-row"><input type="checkbox" data-hidegot ${prefs.hideGot ? "checked" : ""}><span>Hide items I've picked up</span></label>
       <p class="muted small" style="margin:8px 0 0">Zoom in to see smaller markers. Tap a door to jump inside.</p>`;
  }

  async function show(root, focus) {
    root.innerHTML = `<div class="mv">
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
    root.querySelector("#mv-places").innerHTML = [...new Set(W.maps.map((m) => m[1]))].sort().map((n) => `<option value="${esc(n)}">`).join("");
    const el = root.querySelector("#mvmap");
    const fit = () => { el.style.height = Math.max(320, window.innerHeight - el.getBoundingClientRect().top - window.scrollY) + "px"; if (map) map.invalidateSize(); };
    fit();
    window.removeEventListener("resize", window.__mvfit || (() => {}));
    window.__mvfit = fit;
    window.addEventListener("resize", fit);
    el.innerHTML = "";
    el.style.background = W.bg;
    if (map) { map.remove(); map = null; }
    map = L.map(el, { crs: L.CRS.Simple, minZoom: 0, maxZoom: W.maxZoom + 2, zoomSnap: 0.5, attributionControl: false, zoomControl: true, tap: true });
    const bounds = L.latLngBounds(ll(0, 0), ll(W.w, W.h));
    const Tiles = L.TileLayer.extend({
      getTileUrl(c) { return tileSet.has(`${c.z}/${c.x}/${c.y}`) ? `map/tiles/${c.z}/${c.x}/${c.y}.webp` : BLANK; },
    });
    new Tiles("", { maxNativeZoom: W.maxZoom, maxZoom: W.maxZoom + 2, tileSize: W.tile, bounds, noWrap: true, keepBuffer: 3, className: "mv-tiles" }).addTo(map);
    map.setMaxBounds(bounds.pad(0.25));
    group = L.layerGroup().addTo(map);
    map.on("moveend zoomend", draw);
    const saved = ls.get("lgdex.mapview", null);
    if (focus && focusPlace(decodeURIComponent(focus))) {}
    else if (saved) map.setView(L.latLng(saved.lat, saved.lng), saved.z);
    else fitRegion("kanto");
    map.on("moveend", () => { const c = map.getCenter(); ls.set("lgdex.mapview", { lat: c.lat, lng: c.lng, z: map.getZoom() }); });
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
      if (t.dataset.layer) { prefs.layers[t.dataset.layer] = t.checked ? 1 : 0; ls.set("lgdex.map", prefs); draw(); }
      if (t.hasAttribute("data-hidegot")) { prefs.hideGot = t.checked ? 1 : 0; ls.set("lgdex.map", prefs); draw(); }
    });
  }

  window.MAPVIEW = { show, redraw: () => draw() };
})();
