// Progress sync through a private GitHub Gist.
// Every checkmark carries a timestamp, so two devices merge key by key:
// the newest change to each Pokémon or flag wins.
(function () {
  const FILE = "leafgreen-dex.json";
  const DESC = "LeafGreen Dex progress (leafgreen-dex)";
  const API = "https://api.github.com";
  const K_TOKEN = "lgdex.token";
  const K_GIST = "lgdex.gist";

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };

  let status = "off"; // off | idle | syncing | error | offline
  let lastError = "";
  let lastSync = 0;
  let timer = null;
  let listeners = [];

  function emit() { listeners.forEach((f) => f(status, lastError, lastSync)); }
  function set(s, err) { status = s; lastError = err || ""; emit(); }

  async function gh(path, opts) {
    const token = store.get(K_TOKEN);
    const res = await fetch(API + path, {
      ...opts,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts && opts.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const msg = res.status === 401 ? "Token rejected. Check it has Gists read/write." : res.status === 404 ? "Gist not found." : "GitHub said " + res.status;
      const e = new Error(msg); e.status = res.status; throw e;
    }
    return res.status === 204 ? null : res.json();
  }

  function merge(a, b) {
    const out = { v: 1, mons: {}, flags: {} };
    for (const part of ["mons", "flags"]) {
      const keys = new Set([...Object.keys((a && a[part]) || {}), ...Object.keys((b && b[part]) || {})]);
      keys.forEach((k) => {
        const x = a && a[part] && a[part][k], y = b && b[part] && b[part][k];
        out[part][k] = !x ? y : !y ? x : (y.t > x.t ? y : x);
      });
    }
    return out;
  }

  async function findGist() {
    for (let page = 1; page <= 5; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const hit = list.find((g) => g.files && g.files[FILE]);
      if (hit) return hit.id;
      if (list.length < 100) break;
    }
    return null;
  }

  async function readGist(id) {
    const g = await gh("/gists/" + id);
    const f = g.files[FILE];
    if (!f) return null;
    let text = f.content;
    if (f.truncated) text = await (await fetch(f.raw_url)).text();
    try { return JSON.parse(text); } catch { return null; }
  }

  // getLocal(): state; setLocal(state): void
  let getLocal = null, setLocal = null;

  async function syncNow() {
    if (!store.get(K_TOKEN)) { set("off"); return; }
    if (!navigator.onLine) { set("offline"); return; }
    set("syncing");
    try {
      let id = store.get(K_GIST);
      if (!id) id = await findGist();
      const local = getLocal();
      if (!id) {
        const g = await gh("/gists", {
          method: "POST",
          body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content: JSON.stringify(local) } } }),
        });
        store.set(K_GIST, g.id);
      } else {
        store.set(K_GIST, id);
        let remote;
        try { remote = await readGist(id); } catch (e) {
          if (e.status === 404) { store.set(K_GIST, null); return syncNow(); }
          throw e;
        }
        const merged = merge(local, remote);
        setLocal(merged);
        if (JSON.stringify(merged) !== JSON.stringify(remote)) {
          await gh("/gists/" + id, { method: "PATCH", body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(merged) } } }) });
        }
      }
      lastSync = Date.now();
      set("idle");
    } catch (e) {
      set("error", e.message || String(e));
    }
  }

  function schedule() {
    if (!store.get(K_TOKEN)) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, 1500);
  }

  window.SYNC = {
    init(get, put) {
      getLocal = get; setLocal = put;
      status = store.get(K_TOKEN) ? "idle" : "off";
      if (status !== "off") syncNow();
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
      window.addEventListener("online", syncNow);
    },
    async connect(token) {
      store.set(K_TOKEN, token.trim());
      store.set(K_GIST, null);
      await syncNow();
      if (status === "error") { store.set(K_TOKEN, null); }
      return status !== "error";
    },
    disconnect() { store.set(K_TOKEN, null); store.set(K_GIST, null); set("off"); },
    changed: schedule,
    syncNow,
    merge,
    on(f) { listeners.push(f); f(status, lastError, lastSync); },
    get connected() { return !!store.get(K_TOKEN); },
    get gistId() { return store.get(K_GIST); },
  };
})();
