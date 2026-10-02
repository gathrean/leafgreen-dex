// Hand-drawn schematic maps of Kanto and the Sevii Islands, laid out like the
// in-game Town Map. Coordinates are grid units; the SVG scales them.
(function () {
  const KANTO = {
    w: 22, h: 21,
    land: [[-1, -1], [23, -1], [23, 15.4], [17.2, 15.4], [17.2, 17.1], [8.6, 17.1], [8.6, 15.4], [5.4, 15.4], [5.4, 13.0], [2.6, 13.0], [2.6, 15.4], [-1, 15.4]],
    islands: [[4, 19, 1.5], [7.4, 19.2, 0.75]],
    peaks: [[8.6, 2.2], [9.9, 2.0], [0.2, 5.2], [1.9, 6.0], [19.6, 4.1], [12.5, 1.6]],
    trees: [[3.0, 6.1], [5.0, 6.8], [3.2, 7.6], [11.2, 13.8], [9.8, 13.9], [11.5, 15.0], [20.6, 10.0], [21.0, 12.2]],
    towns: {
      pallet: [4, 14, "Pallet Town"], viridian: [4, 10.5, "Viridian City"], pewter: [4, 4, "Pewter City"],
      cerulean: [14, 3, "Cerulean City"], saffron: [14, 7.5, "Saffron City"], celadon: [9.5, 7.5, "Celadon City"],
      lavender: [18.5, 7.5, "Lavender Town"], vermilion: [14, 12, "Vermilion City"], fuchsia: [10.5, 16, "Fuchsia City"],
      cinnabar: [4, 19, "Cinnabar Island"], indigo: [1, 1.6, "Indigo Plateau"],
    },
    routes: {
      r1: [[4, 14], [4, 10.5]], r2: [[4, 10.5], [4, 4]], r3: [[4, 4], [8.4, 4], [8.4, 3]],
      r4: [[10.2, 3], [14, 3]], r5: [[14, 3], [14, 7.5]], r6: [[14, 7.5], [14, 12]],
      r7: [[9.5, 7.5], [14, 7.5]], r8: [[14, 7.5], [18.5, 7.5]], r9: [[14, 3], [18.5, 3]],
      r10: [[18.5, 3], [18.5, 7.5]], r11: [[14, 12], [18.5, 12]], r12: [[18.5, 7.5], [18.5, 13.6]],
      r13: [[18.5, 13.6], [15.6, 13.6]], r14: [[15.6, 13.6], [15.6, 16]], r15: [[15.6, 16], [10.5, 16]],
      r16: [[9.5, 7.5], [6.6, 7.5]], r17: [[6.6, 7.5], [6.6, 14.4]], r18: [[6.6, 14.4], [6.6, 16], [10.5, 16]],
      r19: [[10.5, 16], [10.5, 19.2]], r20: [[10.5, 19.2], [4, 19.2]], r21: [[4, 19], [4, 14]],
      r22: [[4, 10.5], [1, 10.5]], r23: [[1, 10.5], [1, 1.6]], r24: [[14, 3], [14, 0.6]], r25: [[14, 0.6], [18.8, 0.6]],
    },
    spots: {
      "viridian-forest": [4, 6.6], "mt-moon": [9.3, 2.8], "cerulean-cave": [12.4, 2.4], "digletts-cave": [17.2, 12],
      "rock-tunnel": [18.5, 4.4], "power-plant": [19.9, 4.9], "pokemon-tower": [19.4, 8.3], "underground-path": [14.6, 5.2],
      "safari-zone": [10.5, 14.4], seafoam: [7.4, 19.2], mansion: [3.1, 18.3], "victory-road": [1, 3.8],
      "ss-anne": [14.6, 13.2], dojo: [13.3, 6.9],
    },
  };

  const SEVII = {
    w: 17, h: 13,
    land: null,
    isles: [
      [3, 4.2, 1.1, "1"], [1.4, 6.8, 0.9, "2"], [4.6, 9.2, 1.0, "3"], [8.6, 2.2, 1.0, "4"],
      [9.3, 6.4, 0.9, "5"], [13.4, 4.3, 1.0, "6"], [13.6, 9.0, 1.1, "7"],
    ],
    towns: {
      one: [3, 4.2, "One Island"], two: [1.4, 6.8, "Two Island"], three: [4.6, 9.2, "Three Island"], four: [8.6, 2.2, "Four Island"],
      five: [9.3, 6.4, "Five Island"], six: [13.4, 4.3, "Six Island"], seven: [13.6, 9.0, "Seven Island"],
    },
    routes: {
      kindle: [[3, 3.1], [3, 1.2]], treasure: [[3, 5.3], [3.4, 6.4]], bond: [[5.6, 9.2], [6.9, 8.4]],
      meadow: [[10.2, 6.1], [11.1, 5.4]], memorial: [[10.2, 6.9], [11.2, 7.9]], "water-lab": [[8.6, 3.2], [8.6, 5.1]],
      "water-path": [[14.4, 4.6], [15.0, 6.2]], "green-path": [[12.4, 4.1], [11.4, 3.2]], outcast: [[11.4, 3.2], [11.0, 1.6]],
      canyon: [[14.6, 9.4], [15.1, 10.5]], sevault: [[15.1, 10.5], [14.4, 11.6]],
    },
    spots: {
      "mt-ember": [3, 0.9], "cape-brink": [0.8, 5.6], "berry-forest": [7.4, 7.8], "three-isle-port": [4.0, 10.4],
      "icefall-cave": [7.6, 1.4], "resort-gorgeous": [7.6, 4.6], "lost-cave": [6.8, 4.6], "ruin-valley": [15.4, 6.9],
      "pattern-bush": [12.0, 3.6], "altering-cave": [14.6, 3.6], "trainer-tower": [12.4, 9.6], tanoby: [13.6, 12.1],
    },
  };

  const S = 24; // px per grid unit
  const pt = ([x, y]) => `${(x * S).toFixed(1)},${(y * S).toFixed(1)}`;

  function decor(m) {
    let out = "";
    if (m.land) out += `<polygon class="m-land" points="${m.land.map(pt).join(" ")}"/>`;
    (m.islands || []).forEach(([x, y, r]) => (out += `<circle class="m-land" cx="${x * S}" cy="${y * S}" r="${r * S}"/>`));
    (m.isles || []).forEach(([x, y, r]) => (out += `<circle class="m-land" cx="${x * S}" cy="${y * S}" r="${r * S}"/>`));
    (m.peaks || []).forEach(([x, y]) => {
      const X = x * S, Y = y * S;
      out += `<path class="m-peak" d="M${X - 11},${Y + 8} L${X},${Y - 10} L${X + 11},${Y + 8} Z"/><path class="m-snow" d="M${X - 4},${Y - 3} L${X},${Y - 10} L${X + 4},${Y - 3} Z"/>`;
    });
    (m.trees || []).forEach(([x, y]) => (out += `<circle class="m-tree" cx="${x * S}" cy="${y * S}" r="6"/><circle class="m-tree" cx="${x * S + 8}" cy="${y * S + 3}" r="5"/>`));
    return out;
  }

  // marks: { key: "done" | "part" | "todo" | "here" }
  function svg(which, marks, opts) {
    const m = which === "sevii" ? SEVII : KANTO;
    opts = opts || {};
    const focus = opts.focus;
    let routes = "", spots = "", towns = "";
    for (const [k, line] of Object.entries(m.routes)) {
      const st = marks[k] || "";
      routes += `<polyline class="m-route ${st} ${focus === k ? "focus" : ""}" data-k="${k}" points="${line.map(pt).join(" ")}"/>`;
      if (focus === k) routes += `<polyline class="m-pulse" points="${line.map(pt).join(" ")}"/>`;
    }
    for (const [k, [x, y]] of Object.entries(m.spots)) {
      const st = marks[k] || "";
      spots += `<g class="m-spot ${st} ${focus === k ? "focus" : ""}" data-k="${k}"><circle cx="${x * S}" cy="${y * S}" r="7"/></g>`;
      if (focus === k) spots += `<circle class="m-pulse-dot" cx="${x * S}" cy="${y * S}" r="12"/>`;
    }
    for (const [k, [x, y, name]] of Object.entries(m.towns)) {
      const st = marks[k] || "";
      towns += `<g class="m-town ${st} ${focus === k ? "focus" : ""}" data-k="${k}"><rect x="${x * S - 9}" y="${y * S - 9}" width="18" height="18" rx="3"/>` +
        (opts.labels ? `<text x="${x * S}" y="${y * S + 24}">${name}</text>` : "") + `</g>`;
      if (focus === k) towns += `<circle class="m-pulse-dot" cx="${x * S}" cy="${y * S}" r="16"/>`;
    }
    const pad = 12;
    return `<svg class="map ${which}" viewBox="${-pad} ${-pad} ${m.w * S + pad * 2} ${m.h * S + pad * 2}" role="img" aria-label="${which === "sevii" ? "Sevii Islands" : "Kanto"} map">` +
      `<rect class="m-sea" x="${-pad}" y="${-pad}" width="${m.w * S + pad * 2}" height="${m.h * S + pad * 2}" rx="10"/>` +
      decor(m) + routes + spots + towns + `</svg>`;
  }

  window.MAPS = { svg, KANTO, SEVII };
})();
