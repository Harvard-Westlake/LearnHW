(() => {
  "use strict";

  const hardnessTbody = document.getElementById("hardnessTbody");
  const directoryTbody = document.getElementById("directoryTbody");
  const emptyNotice = document.getElementById("emptyNotice");
  const searchInput = document.getElementById("searchInput");
  const lusterFilter = document.getElementById("lusterFilter");
  const cleavageFilter = document.getElementById("cleavageFilter");

  /** @type {Array<{id:string,name:string,hardness:number,luster:string,cleavagePlanes:number,color:string,colorName:string,magnetism:string,acid:string,lamellae:boolean}>} */
  let MINERALS = [];

  // Expanded color notes for directory display
  /** @type {Record<string, string[]>} */
  const COLOR_VARIANT_NAMES = {
    quartz: ["colorless", "white", "gray", "pink"],
    hematite: ["red", "brown", "black", "gray"],
    magnetite: ["black", "gray"],
    /* pyrite: keep specific single descriptor from dataset ('brassy yellow') */
    /* galena: keep specific single descriptor from dataset ('lead gray') */
    graphite: ["gray", "black"],
    malachite: ["green"],
    plagioclase: ["white", "gray"],
    kfeldspar: ["pink", "orange"],
    halite: ["colorless", "white", "pink"],
    calcite: ["colorless", "white", "amber", "pink"],
    gypsum: ["white"],
    kernite: ["white", "gray"],
    fluorite: ["purple", "green", "blue", "yellow"],
    muscovite: ["silver", "tan", "gray"],
    biotite: ["black", "brown", "olive"],
    sulfur: ["yellow"],
    talc: ["white", "green"],
    clay: ["brown", "tan", "white"],
    azurite: ["blue"],
    augite: ["green", "black"],
    hornblende: ["green", "black"],
    olivine: ["green", "yellow-green"]
  };

  function unique(values) {
    return Array.from(new Set(values));
  }

  function loadFilters() {
    const existingValues = new Set(
      Array.from(lusterFilter.querySelectorAll("option")).map(o => o.value)
    );
    const lusters = unique(MINERALS.map(m => m.luster)).sort();
    lusters.forEach(l => {
      if (l && !existingValues.has(l)) {
        const opt = document.createElement("option");
        opt.value = l;
        opt.textContent = l[0].toUpperCase() + l.slice(1);
        lusterFilter.appendChild(opt);
      }
    });
  }

  function renderHardnessChart(list) {
    if (!hardnessTbody) return;
    const sorted = (list || MINERALS).slice().sort((a, b) => a.hardness - b.hardness);
    hardnessTbody.innerHTML = "";
    sorted.forEach(m => {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      const tdHard = document.createElement("td");
      tdName.textContent = m.name;
      tdHard.textContent = String(m.hardness);
      tr.appendChild(tdName);
      tr.appendChild(tdHard);
      hardnessTbody.appendChild(tr);
    });
  }

  function mineralRow(m) {
    const tr = document.createElement("tr");
    tr.id = `mineral-${m.id}`;
    const tdName = document.createElement("td");
    const tdHard = document.createElement("td");
    const tdLuster = document.createElement("td");
    const tdCleavage = document.createElement("td");
    const tdMagnetism = document.createElement("td");
    const tdAcid = document.createElement("td");
    const tdColor = document.createElement("td");

    tdName.textContent = m.name;

    tdHard.textContent = String(m.hardness);
    tdLuster.textContent = m.luster;
    tdCleavage.textContent = String(m.cleavagePlanes);
    tdMagnetism.textContent = m.magnetism;
    tdAcid.textContent = m.acid;
    const swatch = document.createElement("span");
    swatch.className = "color-swatch";
    swatch.style.background = m.color;
    tdColor.appendChild(swatch);
    const variants = COLOR_VARIANT_NAMES[m.id];
    if (Array.isArray(variants) && variants.length) {
      tdColor.appendChild(document.createTextNode(variants.join(", ")));
    } else {
      tdColor.appendChild(document.createTextNode(m.colorName));
    }

    tr.appendChild(tdName);
    tr.appendChild(tdHard);
    tr.appendChild(tdLuster);
    tr.appendChild(tdCleavage);
    tr.appendChild(tdMagnetism);
    tr.appendChild(tdAcid);
    tr.appendChild(tdColor);
    return tr;
  }

  function applyFilters() {
    const term = (searchInput.value || "").trim().toLowerCase();
    const luster = lusterFilter.value;
    const cleavage = cleavageFilter.value;
    let list = MINERALS.slice();
    if (term) {
      list = list.filter(m => m.name.toLowerCase().includes(term));
    }
    if (luster) {
      list = list.filter(m => m.luster === luster);
    }
    if (cleavage !== "") {
      const n = Number(cleavage);
      list = list.filter(m => m.cleavagePlanes === n);
    }
    // Sort by hardness ascending (least to most)
    list.sort((a, b) => a.hardness - b.hardness);
    directoryTbody.innerHTML = "";
    list.forEach(m => directoryTbody.appendChild(mineralRow(m)));
    emptyNotice.hidden = list.length > 0;
    if (hardnessTbody) renderHardnessChart(list);
  }

  function hydrateFromHash() {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function init() {
    // Preferred: inline JSON embedded in the page
    try {
      const inline = document.getElementById("mineralsData");
      if (inline && inline.textContent) {
        const data = JSON.parse(inline.textContent);
        if (Array.isArray(data) && data.length) {
          MINERALS = data;
        }
      }
    } catch (_e) {}

    try {
      if (!Array.isArray(MINERALS) || MINERALS.length === 0) {
        const res = await fetch("minerals.json", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            MINERALS = data;
          }
        }
      }
    } catch (e) {
      // Ignore fetch errors; we'll try fallback below
    }

    // Fallback: read from parent game's dataset if available (same-origin iframe)
    if ((!Array.isArray(MINERALS) || MINERALS.length === 0) && window.parent && Array.isArray(window.parent.MINERALS_DATA)) {
      MINERALS = window.parent.MINERALS_DATA.slice();
    }

    // If still empty, show empty state; otherwise build UI
    if (!Array.isArray(MINERALS) || MINERALS.length === 0) {
      directoryTbody.innerHTML = "";
      if (hardnessTbody) hardnessTbody.innerHTML = "";
      emptyNotice.hidden = false;
      return;
    }

    loadFilters();
    applyFilters();
    hydrateFromHash();
  }

  // Events
  searchInput.addEventListener("input", applyFilters);
  lusterFilter.addEventListener("change", applyFilters);
  cleavageFilter.addEventListener("change", applyFilters);
  window.addEventListener("hashchange", hydrateFromHash);

  // Start
  init();
})();


