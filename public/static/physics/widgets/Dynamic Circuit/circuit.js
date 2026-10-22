(function () {
  "use strict";

  // DOM
  const elV = document.getElementById("voltage");
  const elVVal = document.getElementById("voltageVal");
  const elMode = Array.from(document.querySelectorAll('input[name="mode"]'));
  const elAddMode = Array.from(document.querySelectorAll('input[name="addmode"]'));
  const svg = document.getElementById("circuit");
  if (svg) svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
  const elNewR = document.getElementById("newR");
  const elAdd = document.getElementById("addRes");
  const elNewType = document.getElementById("newType");
  const elAddResistor = document.getElementById("addResistor");
  const elAddBulb = document.getElementById("addBulb");
  const elRemove = document.getElementById("removeSel");
  const elReset = document.getElementById("resetAll");
  const elAddComponentBtn = document.getElementById("addComponentBtn");
  let currentType = "resistor";

  const elTotalR = document.getElementById("totalR");
  const elTotalI = document.getElementById("totalI");
  const elTotalP = document.getElementById("totalP");
  // Removed R1/R2 specific inputs and readouts

  // New Add-Mode buttons (toggle between Series/Parallel)
  const elSeriesBtn = document.getElementById("addAsSeriesBtn");
  const elParallelBtn = document.getElementById("addAsParallelBtn");
  const elAddModeSeries = document.querySelector('input[name="addmode"][value="series"]');
  const elAddModeParallel = document.querySelector('input[name="addmode"][value="parallel"]');
  function setAddModeBtn(mode) {
    if (!elAddModeSeries || !elAddModeParallel || !elSeriesBtn || !elParallelBtn) return;
    if (mode === "series") {
      elAddModeSeries.checked = true;
      elSeriesBtn.classList.add("btn--selected");
      elParallelBtn.classList.remove("btn--selected");
    } else {
      elAddModeParallel.checked = true;
      elParallelBtn.classList.add("btn--selected");
      elSeriesBtn.classList.remove("btn--selected");
    }
  }
  if (elSeriesBtn) elSeriesBtn.addEventListener("click", () => setAddModeBtn("series"));
  if (elParallelBtn) elParallelBtn.addEventListener("click", () => setAddModeBtn("parallel"));
  // Initialize default state
  setAddModeBtn("series");
  // Default type selection: Basic Resistor
  if (elAddResistor) {
    elAddResistor.classList.add("btn--selected");
  }

  // Geometry (dynamic height)
  let W = 900, H = 478; // base canvas size
  const BASE_H = 478;
  const margin = 110; // more white space around the circuit
  let leftX, rightX, topY, bottomY, centerX, centerY;
  function recalcLayout() {
    leftX = margin; rightX = W - margin;
    topY = margin; bottomY = H - margin;
    centerX = (leftX + rightX) / 2;
    centerY = (topY + bottomY) / 2;
  }
  recalcLayout();

  // Selection state (multi-select)
  const selectedIds = new Set(); // values: 'r1', 'r2'
  // Use a centralized selection panel instead of inline SVG popups
  const USE_EXTERNAL_PANEL = true;

  // Dynamic resistor list
  const resistors = [];
  let nextId = 1;
  // Toast helper
  let toastTimer = null;
  // Centered alert modal for errors / unsuccessful adds
  let alertOverlay = null;
  let alertMsg = null;
  let alertOkBtn = null;
  function ensureAlertOverlay() {
    if (alertOverlay) return alertOverlay;
    // Overlay
    alertOverlay = document.createElement("div");
    alertOverlay.id = "alertOverlay";
    Object.assign(alertOverlay.style, {
      position: "fixed",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(17,24,39,0.45)",
      zIndex: 9998
    });
    // Card (reuse ohm-card styling)
    const card = document.createElement("div");
    card.className = "ohm-card";
    const title = document.createElement("div");
    title.className = "ohm-title";
    title.textContent = "Notice";
    const body = document.createElement("div");
    body.className = "ohm-body";
    alertMsg = document.createElement("div");
    alertMsg.className = "label";
    alertMsg.style.fontWeight = "500";
    const actions = document.createElement("div");
    actions.className = "ohm-actions";
    alertOkBtn = document.createElement("button");
    alertOkBtn.type = "button";
    alertOkBtn.className = "btn";
    alertOkBtn.textContent = "OK";
    actions.appendChild(alertOkBtn);
    body.appendChild(alertMsg);
    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(actions);
    alertOverlay.appendChild(card);
    document.body.appendChild(alertOverlay);
    // Events
    alertOkBtn.addEventListener("click", () => { alertOverlay.style.display = "none"; });
    alertOverlay.addEventListener("click", (e) => {
      if (e.target === alertOverlay) alertOverlay.style.display = "none";
    });
    document.addEventListener("keydown", (e) => {
      if (alertOverlay && alertOverlay.style.display === "flex" && e.key === "Escape") {
        e.preventDefault();
        alertOverlay.style.display = "none";
      }
    });
    return alertOverlay;
  }
  function showToast(message) {
    ensureAlertOverlay();
    alertMsg.textContent = message;
    alertOverlay.style.display = "flex";
  }
  // Simple HTML context menu overlay
  let ctxMenu = null;
  let ohmModal = null;
  let ohmInput = null;
  let ohmSaveBtn = null;
  let ohmCancelBtn = null;
  let pendingAdjustId = null;
  function ensureContextMenu() {
    if (ctxMenu) return ctxMenu;
    ctxMenu = document.createElement("div");
    ctxMenu.id = "ctxMenu";
    Object.assign(ctxMenu.style, {
      position: "absolute",
      display: "none",
      background: "#fff",
      border: "1px solid #c9d2e3",
      borderRadius: "8px",
      boxShadow: "0 6px 18px rgba(16,24,40,0.18)",
      padding: "6px",
      zIndex: "9999",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "14px",
      color: "#111",
      minWidth: "160px"
    });
    const btn = (text) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      Object.assign(b.style, {
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "0",
        padding: "8px 10px",
        cursor: "pointer",
        borderRadius: "6px"
      });
      b.onmouseenter = () => b.style.background = "#f2f4f7";
      b.onmouseleave = () => b.style.background = "transparent";
      return b;
    };
    const bAdjust = btn("Adjust ohmage");
    const bRemove = btn("Remove");
    ctxMenu.appendChild(bAdjust);
    ctxMenu.appendChild(bRemove);
    document.body.appendChild(ctxMenu);
    // handlers set at show-time
    return ctxMenu;
  }
  function ensureOhmModal() {
    if (ohmModal) return ohmModal;
    // Overlay
    ohmModal = document.createElement("div");
    ohmModal.id = "ohmModal";
    // Card
    const card = document.createElement("div");
    card.className = "ohm-card";
    const title = document.createElement("div");
    title.className = "ohm-title";
    title.textContent = "Adjust Resistance";
    const body = document.createElement("div");
    body.className = "ohm-body";
    const label = document.createElement("label");
    label.className = "label";
    label.htmlFor = "ohmInput";
    label.textContent = "Resistance (Ω)";
    ohmInput = document.createElement("input");
    ohmInput.id = "ohmInput";
    ohmInput.type = "number";
    ohmInput.min = "0.01";
    ohmInput.step = "0.01";
    ohmInput.className = "input";
    const actions = document.createElement("div");
    actions.className = "ohm-actions";
    ohmCancelBtn = document.createElement("button");
    ohmCancelBtn.type = "button";
    ohmCancelBtn.className = "btn btn--outline";
    ohmCancelBtn.textContent = "Cancel";
    ohmSaveBtn = document.createElement("button");
    ohmSaveBtn.type = "button";
    ohmSaveBtn.className = "btn";
    ohmSaveBtn.textContent = "Save";
    actions.appendChild(ohmCancelBtn);
    actions.appendChild(ohmSaveBtn);
    body.appendChild(label);
    body.appendChild(ohmInput);
    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(actions);
    ohmModal.appendChild(card);
    document.body.appendChild(ohmModal);
    // Events
    ohmCancelBtn.addEventListener("click", () => closeOhmModal());
    ohmSaveBtn.addEventListener("click", () => {
      const comp = pendingAdjustId ? findComponentRef(pendingAdjustId) : null;
      if (!comp) return closeOhmModal();
      const val = Math.max(0.01, parseFloat(ohmInput.value || "0"));
      if (isFinite(val)) { comp.R = val; update(); }
      closeOhmModal();
    });
    ohmModal.addEventListener("click", (e) => {
      if (e.target === ohmModal) closeOhmModal();
    });
    document.addEventListener("keydown", (e) => {
      if (ohmModal && ohmModal.classList.contains("is-open")) {
        if (e.key === "Escape") { e.preventDefault(); closeOhmModal(); }
        if (e.key === "Enter") { e.preventDefault(); ohmSaveBtn.click(); }
      }
    });
    return ohmModal;
  }
  function openOhmModal(resistorId, currentR) {
    ensureOhmModal();
    pendingAdjustId = resistorId;
    ohmInput.value = String(currentR ?? 10);
    ohmModal.classList.add("is-open");
    setTimeout(() => { try { ohmInput.focus(); ohmInput.select(); } catch (_) {} }, 0);
  }
  function closeOhmModal() {
    if (!ohmModal) return;
    ohmModal.classList.remove("is-open");
    pendingAdjustId = null;
  }
  function showContextMenu(clientX, clientY, resistorId) {
    const m = ensureContextMenu();
    m.dataset.resistorId = resistorId;
    m.style.left = `${clientX + window.scrollX + 6}px`;
    m.style.top = `${clientY + window.scrollY + 6}px`;
    m.style.display = "block";
    // wire buttons
    const [bAdjust, bRemove] = m.querySelectorAll("button");
    bAdjust.onclick = (e) => {
      e.stopPropagation();
      const comp = findComponentRef(resistorId);
      if (!comp) { hideContextMenu(); return; }
      hideContextMenu();
      openOhmModal(resistorId, comp.R);
    };
    bRemove.onclick = (e) => {
      e.stopPropagation();
      removeById(resistorId);
      hideContextMenu();
      update();
    };
  }
  function hideContextMenu() {
    if (ctxMenu) ctxMenu.style.display = "none";
  }
  document.addEventListener("click", () => hideContextMenu());
  window.addEventListener("resize", () => hideContextMenu());

  // Helpers
  function findComponentRef(id) {
    for (const it of resistors) {
      if (it && it.kind === "comp" && it.id === id) return it;
      if (it && it.kind === "parallel" && Array.isArray(it.children)) {
        for (const ch of it.children) {
          if (ch.kind === "comp" && ch.id === id) return ch;
          if (ch.kind === "series" && Array.isArray(ch.children)) {
            const hit = ch.children.find(cc => cc.id === id);
            if (hit) return hit;
          }
        }
      }
    }
    return null;
  }
  function findSelectionInfo(selId) {
    for (let i = 0; i < resistors.length; i++) {
      const it = resistors[i];
      if (it.kind === "comp" && it.id === selId) {
        return { level: "top", idx: i };
      }
      if (it.kind === "parallel") {
        for (let j = 0; j < it.children.length; j++) {
          const ch = it.children[j];
          if (ch.kind === "comp" && ch.id === selId) {
            return { level: "parallel", idx: i, childIndex: j, child: ch };
          }
          if (ch.kind === "series") {
            const si = ch.children.findIndex(cc => cc.id === selId);
            if (si !== -1) {
              return { level: "parallel-series", idx: i, childIndex: j, seriesIndex: si, child: ch };
            }
          }
        }
      }
    }
    return null;
  }
  function clampPos(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function fmt(n, digits = 3) {
    if (!isFinite(n)) return "—";
    const v = Math.abs(n) < 1e-6 ? 0 : n;
    return Number(v.toFixed(digits)).toString();
  }
  function fmtR(r) { return `${fmt(r, 3)} Ω`; }
  function fmtI(i) { return `${fmt(i, 3)} A`; }
  function fmtV(v) { return `${fmt(v, 3)} V`; }
  function fmtP(p) { return `${fmt(p, 3)} W`; }

  // Stable selection ordering and index mapping (r1, r2, r3 …)
  function sortIds(ids) {
    return ids.slice().sort((a, b) => {
      const na = parseInt(String(a).replace(/^\D+/, ""), 10);
      const nb = parseInt(String(b).replace(/^\D+/, ""), 10);
      if (!isFinite(na) || !isFinite(nb)) return String(a).localeCompare(String(b));
      return na - nb;
    });
  }
  function getSelectionIndexMap() {
    const arr = sortIds(Array.from(selectedIds));
    const map = {};
    arr.forEach((id, i) => { map[id] = i + 1; });
    return map;
  }

  // Centralized selection panel renderer
  function updateSelectionPanel(res) {
    if (!USE_EXTERNAL_PANEL) return;
    const panel = document.getElementById("selectionPanel");
    if (!panel) return;
    const header = '<div class="h3" style="margin:0 0 .25rem;">Selection</div>';
    if (selectedIds.size === 0) {
      panel.innerHTML = `${header}<div class="muted">Click a resistor or bulb to see its values here.</div>`;
      return;
    }
    const idxMap = getSelectionIndexMap();
    const ids = sortIds(Array.from(selectedIds));
    if (ids.length === 1) {
      const id = ids[0];
      const comp = findComponentRef(id);
      const p = (res && res.per && res.per[id]) ? res.per[id] : { V: 0, I: 0, P: 0 };
      const rVal = comp && typeof comp.R === "number" ? comp.R : 0;
      panel.innerHTML =
        header +
        `<div class="stat"><span><span class="badge-num">${idxMap[id] || 1}</span>&nbsp;Resistance</span><span>${fmtR(rVal)}</span></div>` +
        `<div class="stat"><span>Voltage</span><span>${fmtV(p.V || 0)}</span></div>` +
        `<div class="stat"><span>Current</span><span>${fmtI(p.I || 0)}</span></div>` +
        `<div class="stat"><span>Power</span><span>${fmtP(p.P || 0)}</span></div>`;
      return;
    }
    // Multiple selection: show up to first 4 items plus count
    const lines = [];
    const maxShow = 4;
    for (let i = 0; i < Math.min(ids.length, maxShow); i++) {
      const id = ids[i];
      const comp = findComponentRef(id);
      const p = (res && res.per && res.per[id]) ? res.per[id] : { V: 0, I: 0, P: 0 };
      const rVal = comp && typeof comp.R === "number" ? comp.R : 0;
      lines.push(
        `<div class="stat"><span><span class="badge-num">${idxMap[id] || (i+1)}</span>&nbsp;${id}</span><span>R: ${fmtR(rVal)}, V: ${fmtV(p.V || 0)}, I: ${fmtI(p.I || 0)}, P: ${fmtP(p.P || 0)}</span></div>`
      );
    }
    const more = ids.length > maxShow ? `<div class="muted">${ids.length - maxShow} more selected…</div>` : "";
    panel.innerHTML = header + lines.join("") + more;
  }

  // Physics for N resistors
  function computeSeriesN(V, list) {
    // Support components and parallel groups at the top level
    if (list.length === 0) {
      return { Rtot: Infinity, Itot: 0, Ptot: 0, per: {} };
    }
    const per = {};
    function eqRNode(node) {
      if (node && node.kind === "parallel" && Array.isArray(node.children) && node.children.length > 0) {
        let sumG = 0;
        for (const ch of node.children) {
          const Rc = eqRNode(ch);
          if (Rc > 0) sumG += 1 / Rc;
        }
        return sumG > 0 ? 1 / sumG : Infinity;
      }
      if (node && node.kind === "series" && Array.isArray(node.children) && node.children.length > 0) {
        return node.children.reduce((acc, ch) => acc + eqRNode(ch), 0);
      }
      // default: component
      return Math.max(0.01, node.R || 0); // guard
    }
    const itemReq = list.map(eqRNode);
    const Rtot = itemReq.reduce((a, b) => a + b, 0);
    const Itot = Rtot > 0 && isFinite(Rtot) ? V / Rtot : 0;
    function fillSeries(Vdrop, node) {
      if (node && node.kind === "parallel" && Array.isArray(node.children) && node.children.length > 0) {
        for (const ch of node.children) {
          const Rc = eqRNode(ch);
          const I = Rc > 0 && isFinite(Rc) ? Vdrop / Rc : 0;
          fillSeries(Vdrop, ch);
        }
        return;
      }
      if (node && node.kind === "series" && Array.isArray(node.children) && node.children.length > 0) {
        const Rseries = node.children.reduce((acc, ch) => acc + eqRNode(ch), 0);
        const Ibranch = Rseries > 0 && isFinite(Rseries) ? Vdrop / Rseries : 0;
        for (const ch of node.children) {
          const Rc = eqRNode(ch);
          const Vc = Ibranch * Rc;
          fillSeries(Vc, ch);
        }
        return;
      }
      // component
      const R = Math.max(0.01, node.R || 0);
      const I = Vdrop / R;
      per[node.id] = { V: Vdrop, I, P: Vdrop * I };
    }
    // Distribute along top-level series
    for (let i = 0; i < list.length; i++) {
      const Vdrop = Itot * itemReq[i];
      fillSeries(Vdrop, list[i]);
    }
    return { Rtot, Itot, Ptot: V * Itot, per };
  }

  // ===== Multi-select grouping helpers =====
  function findPathToComponent(id) {
    for (let topIndex = 0; topIndex < resistors.length; topIndex++) {
      const node = resistors[topIndex];
      if (node && node.kind === "comp" && node.id === id) {
        return { topIndex, parallelNode: null, branchIndex: null, seriesNode: null, seriesIndex: 0 };
      }
      if (node && node.kind === "parallel" && Array.isArray(node.children)) {
        for (let branchIndex = 0; branchIndex < node.children.length; branchIndex++) {
          const ch = node.children[branchIndex];
          if (ch.kind === "comp" && ch.id === id) {
            return { topIndex, parallelNode: node, branchIndex, seriesNode: null, seriesIndex: 0 };
          }
          if (ch.kind === "series" && Array.isArray(ch.children)) {
            const si = ch.children.findIndex(cc => cc.id === id);
            if (si !== -1) {
              return { topIndex, parallelNode: node, branchIndex, seriesNode: ch, seriesIndex: si };
            }
          }
        }
      }
    }
    return null;
  }

  function computeSelectionGroup(selIds) {
    const paths = selIds.map(findPathToComponent).filter(Boolean);
    if (paths.length === 0) return null;
    if (paths.length === 1) {
      const p = paths[0];
      if (p.parallelNode) {
        // Single in a branch
        return {
          kind: "branch-series",
          topIndex: p.topIndex,
          parallelNode: p.parallelNode,
          branchIndex: p.branchIndex,
          seriesNode: p.seriesNode,
          seriesSpan: [p.seriesIndex, p.seriesIndex]
        };
      }
      // Single at top level
      return { kind: "top-series", topSpan: [p.topIndex, p.topIndex] };
    }
    // Check if all share the same nearest parallel ancestor
    const allHaveParallel = paths.every(p => !!p.parallelNode);
    if (allHaveParallel) {
      const ref = paths[0].parallelNode;
      const sameParallel = paths.every(p => p.parallelNode === ref);
      if (sameParallel) {
        // How many distinct branches touched?
        const branchSet = new Set(paths.map(p => p.branchIndex));
        if (branchSet.size >= 2) {
          return { kind: "parallel-group", topIndex: paths[0].topIndex, parallelNode: ref };
        }
        // Same branch -> branch-series span
        const branchIndex = paths[0].branchIndex;
        const indices = paths.map(p => (p.seriesNode ? p.seriesIndex : 0));
        const lo = Math.min(...indices);
        const hi = Math.max(...indices);
        const seriesNode = paths.find(p => p.seriesNode)?.seriesNode || null;
        return {
          kind: "branch-series",
          topIndex: paths[0].topIndex,
          parallelNode: ref,
          branchIndex,
          seriesNode,
          seriesSpan: [lo, hi]
        };
      }
    }
    // Fall back to top-level series segment
    const topIdx = paths.map(p => p.topIndex);
    const lo = Math.min(...topIdx);
    const hi = Math.max(...topIdx);
    return { kind: "top-series", topSpan: [lo, hi] };
  }

  function insertSeriesAfterTopIndex(comp, idx) {
    resistors.splice(idx + 1, 0, comp);
  }
  function ensureBranchSeriesNode(parallelNode, branchIndex) {
    const child = parallelNode.children[branchIndex];
    if (child && child.kind === "series") return child;
    // Convert single component (or unexpected) into series node
    const asComp = child.kind === "comp" ? child : { kind: "comp", id: child.id, R: child.R, type: child.type };
    const seriesNode = { kind: "series", children: [asComp] };
    parallelNode.children[branchIndex] = seriesNode;
    return seriesNode;
  }
  function insertIntoBranchSeries(comp, parallelNode, branchIndex, seriesNode, insertAfterIndex) {
    const ser = seriesNode || ensureBranchSeriesNode(parallelNode, branchIndex);
    const pos = Math.max(0, Math.min(insertAfterIndex + 1, ser.children.length));
    ser.children.splice(pos, 0, comp);
  }
  function addBranchToParallel(comp, parallelNode) {
    parallelNode.children.push(comp);
  }
  function wrapTopSeriesSegmentAsParallel(lo, hi, newBranchComp) {
    const count = hi - lo + 1;
    if (count <= 0) return;
    const segment = resistors.slice(lo, hi + 1);
    let branchA = null;
    if (segment.length === 1) {
      branchA = segment[0];
    } else {
      branchA = { kind: "series", children: segment };
    }
    const parallelNode = { kind: "parallel", children: [branchA, newBranchComp] };
    // Replace the segment with the new parallel node
    resistors.splice(lo, count, parallelNode);
  }

  // Localized parallel group renderers on top/bottom and left/right edges
  function drawLocalParallelGroupTop(cx, yMain, children, pMax, res, brightnessMap, selIndexMap) {
    // Filter out empty branches to avoid blank lanes
    const filtered = (children || []).filter(ch =>
      ch && (
        (ch.kind === "comp") ||
        (ch.kind === "series" && Array.isArray(ch.children) && ch.children.length > 0)
      )
    );
    const BASE_WIDTH_FOR_TWO = (2 * RES_RENDER_LEN) + 14; // minimal room for two series elements
    const MIN_SERIES_GAP = 14; // minimum spacing between series elements

    // Longest series run across branches
    let maxSeries = 0;
    for (const ch of filtered) {
      if (ch && ch.kind === "series" && Array.isArray(ch.children)) {
        maxSeries = Math.max(maxSeries, ch.children.length);
      }
    }

    // Desired group width with clamp to rails:
    // - Minimal width sized just enough for two elements or the exact series span if >2
    //   width_for_m = m*RES_RENDER_LEN + (m-1)*MIN_SERIES_GAP
    let desiredWidth = BASE_WIDTH_FOR_TWO;
    if (maxSeries > 2) desiredWidth = Math.max(BASE_WIDTH_FOR_TWO, (maxSeries * RES_RENDER_LEN) + ((maxSeries - 1) * MIN_SERIES_GAP));
    const railPad = 28;
    const minX = leftX + railPad;
    const maxX = rightX - railPad;
    const maxWidth = Math.max(0, maxX - minX);
    const groupWidth = Math.min(desiredWidth, maxWidth);
    let xL = cx - groupWidth / 2;
    xL = Math.max(minX, Math.min(xL, maxX - groupWidth)); // shift away from corner if needed
    const xR = xL + groupWidth;
    // Mask the main horizontal wire between bus taps to avoid a short across the group
    const hwMask = line(xL, yMain, xR, yMain);
    hwMask.setAttribute("stroke", "#fff");
    hwMask.setAttribute("stroke-width", "6");
    hwMask.setAttribute("pointer-events", "none");
    svg.appendChild(hwMask);

    // Lanes above/below
    const n = filtered.length;
    const nAbove = Math.floor(n / 2);
    const nBelow = n - nAbove;
    const laneGap = 22;
    const aboveYs = Array.from({ length: nAbove }, (_, i) => yMain - laneGap * (i + 1));
    const belowYs = Array.from({ length: nBelow }, (_, i) => yMain + laneGap * (i + 1));
    // bus bars
    if (aboveYs.length) { svg.appendChild(line(xL, yMain, xL, aboveYs[aboveYs.length - 1])); svg.appendChild(line(xR, yMain, xR, aboveYs[aboveYs.length - 1])); }
    if (belowYs.length) { svg.appendChild(line(xL, yMain, xL, belowYs[belowYs.length - 1])); svg.appendChild(line(xR, yMain, xR, belowYs[belowYs.length - 1])); }
    // render children
    let idx = 0;
    const lanes = [];
    for (let i = 0; i < nAbove && idx < n; i++, idx++) lanes.push({ comp: filtered[idx], y: aboveYs[i], pos: "above" });
    for (let i = 0; i < nBelow && idx < n; i++, idx++) lanes.push({ comp: filtered[idx], y: belowYs[i], pos: "below" });
    const groupLen = xR - xL;
    lanes.forEach(l => {
      const c = l.comp;
      if (c.kind === "series" && Array.isArray(c.children)) {
        const m = c.children.length;
        const halfLen = RES_RENDER_LEN / 2;
        // Total span we would like (bodies + minimal gaps)
        const baseSpan = m * RES_RENDER_LEN + (m - 1) * MIN_SERIES_GAP;
        // Clamp span to fit within groupLen
        const span = Math.min(baseSpan, groupLen);
        const availableForGaps = Math.max(span - m * RES_RENDER_LEN, 0);
        const gap = m > 1 ? availableForGaps / (m - 1) : 0;
        const centersStart = xL + (groupLen - span) / 2 + halfLen;
        const centers = Array.from({ length: m }, (_, k) => centersStart + k * (RES_RENDER_LEN + gap));

        // Left bus to first element
        if (m > 0) {
          const firstLeft = centers[0] - halfLen;
          svg.appendChild(line(xL, l.y, firstLeft, l.y));
        }
        // Between consecutive elements
        for (let k = 0; k < m - 1; k++) {
          const rightPrev = centers[k] + halfLen;
          const leftNext = centers[k + 1] - halfLen;
          svg.appendChild(line(rightPrev, l.y, leftNext, l.y));
        }
        // Last element to right bus
        if (m > 0) {
          const lastRight = centers[m - 1] + halfLen;
          svg.appendChild(line(lastRight, l.y, xR, l.y));
        }
        c.children.forEach((cc, k) => {
          const px = centers[k];
          const sel = selectedIds.has(cc.id);
          const powRaw = Math.max(0, (res.per[cc.id]?.P || 0));
          const pow = brightnessMap ? brightnessMap(powRaw) : powRaw;
          const g = componentHorizontal(cc.type || "resistor", px, l.y, RES_RENDER_LEN, pow, sel);
          g.dataset.resistorId = cc.id;
          g.addEventListener("click", (e) => { e.stopPropagation(); if (sel) selectedIds.delete(cc.id); else selectedIds.add(cc.id); update(); });
          g.addEventListener("contextmenu", (e) => { e.preventDefault(); showContextMenu(e.clientX, e.clientY, cc.id); });
          svg.appendChild(g);
          if (sel && USE_EXTERNAL_PANEL && selIndexMap && selIndexMap[cc.id] != null) {
            svg.appendChild(selectionBadge(px, l.y, selIndexMap[cc.id], l.pos === "above" ? "above" : "below"));
          }
        if (sel && !USE_EXTERNAL_PANEL) {
            svg.appendChild(popupBox(px, l.y, [
              `R = ${fmtR(cc.R)}`,
              `V = ${fmtV(res.per[cc.id]?.V || 0)}`,
              `I = ${fmtI(res.per[cc.id]?.I || 0)}`,
              `P = ${fmtP(res.per[cc.id]?.P || 0)}`
            ], l.pos === "above" ? "above" : "below", () => { selectedIds.delete(cc.id); update(); }, cc.id));
          }
        });
      } else {
        const sel = selectedIds.has(c.id);
        const powRaw = Math.max(0, (res.per[c.id]?.P || 0));
        const pow = brightnessMap ? brightnessMap(powRaw) : powRaw;
        // Single element: span full group to connect bus bars
        const g = componentHorizontal(c.type || "resistor", (xL + xR) / 2, l.y, groupLen, pow, sel);
        g.dataset.resistorId = c.id;
        g.addEventListener("click", (e) => { e.stopPropagation(); if (sel) selectedIds.delete(c.id); else selectedIds.add(c.id); update(); });
        g.addEventListener("contextmenu", (e) => { e.preventDefault(); showContextMenu(e.clientX, e.clientY, c.id); });
        svg.appendChild(g);
        if (sel && USE_EXTERNAL_PANEL && selIndexMap && selIndexMap[c.id] != null) {
          svg.appendChild(selectionBadge((xL + xR) / 2, l.y, selIndexMap[c.id], l.pos === "above" ? "above" : "below"));
        }
        if (sel && !USE_EXTERNAL_PANEL) {
          svg.appendChild(popupBox((xL + xR) / 2, l.y, [
            `R = ${fmtR(c.R)}`,
            `V = ${fmtV(res.per[c.id]?.V || 0)}`,
            `I = ${fmtI(res.per[c.id]?.I || 0)}`,
            `P = ${fmtP(res.per[c.id]?.P || 0)}`
          ], l.pos === "above" ? "above" : "below", () => { selectedIds.delete(c.id); update(); }, c.id));
        }
      }
    });
  }

  function drawLocalParallelGroupLeft(xMain, cy, children, pMax, res, brightnessMap, selIndexMap) {
    // Filter out empty branches
    const filtered = (children || []).filter(ch =>
      ch && (
        (ch.kind === "comp") ||
        (ch.kind === "series" && Array.isArray(ch.children) && ch.children.length > 0)
      )
    );
    const BASE_HEIGHT_FOR_TWO = (2 * RES_RENDER_LEN) + 14;
    const MIN_SERIES_GAP = 14;

    // Longest series run across branches
    let maxSeries = 0;
    for (const ch of filtered) {
      if (ch && ch.kind === "series" && Array.isArray(ch.children)) {
        maxSeries = Math.max(maxSeries, ch.children.length);
      }
    }

    // Desired group height with clamp to rails; shift away from corners if needed
    let desiredHeight = BASE_HEIGHT_FOR_TWO;
    if (maxSeries > 2) desiredHeight = Math.max(BASE_HEIGHT_FOR_TWO, (maxSeries * RES_RENDER_LEN) + ((maxSeries - 1) * MIN_SERIES_GAP));
    const railPad = 28;
    const minY = topY + railPad;
    const maxY = bottomY - railPad;
    const maxHeight = Math.max(0, maxY - minY);
    const groupHeight = Math.min(desiredHeight, maxHeight);
    let yT = cy - groupHeight / 2;
    yT = Math.max(minY, Math.min(yT, maxY - groupHeight)); // shift away from corner if needed
    const yB = yT + groupHeight;
    // Mask the main vertical wire between bus taps to avoid a short across the group
    const vwMask = line(xMain, yT, xMain, yB);
    vwMask.setAttribute("stroke", "#fff");
    vwMask.setAttribute("stroke-width", "6");
    vwMask.setAttribute("pointer-events", "none");
    svg.appendChild(vwMask);

    // Lanes left/right
    const n = filtered.length;
    const nLeft = Math.floor(n / 2);
    const nRight = n - nLeft;
    const laneGap = 22;
    const leftXs = Array.from({ length: nLeft }, (_, i) => xMain - laneGap * (i + 1));
    const rightXs = Array.from({ length: nRight }, (_, i) => xMain + laneGap * (i + 1));
    // bus bars
    if (leftXs.length) { svg.appendChild(line(xMain, yT, leftXs[leftXs.length - 1], yT)); svg.appendChild(line(xMain, yB, leftXs[leftXs.length - 1], yB)); }
    if (rightXs.length) { svg.appendChild(line(xMain, yT, rightXs[rightXs.length - 1], yT)); svg.appendChild(line(xMain, yB, rightXs[rightXs.length - 1], yB)); }
    // render children
    let idx = 0;
    const lanes = [];
    for (let i = 0; i < nLeft && idx < n; i++, idx++) lanes.push({ comp: filtered[idx], x: leftXs[i], pos: "left" });
    for (let i = 0; i < nRight && idx < n; i++, idx++) lanes.push({ comp: filtered[idx], x: rightXs[i], pos: "right" });
    const groupLen = yB - yT;
    lanes.forEach(l => {
      const c = l.comp;
      if (c.kind === "series" && Array.isArray(c.children)) {
        const m = c.children.length;
        const halfLen = RES_RENDER_LEN / 2;
        const baseSpan = m * RES_RENDER_LEN + (m - 1) * MIN_SERIES_GAP;
        const span = Math.min(baseSpan, groupLen);
        const availableForGaps = Math.max(span - m * RES_RENDER_LEN, 0);
        const gap = m > 1 ? availableForGaps / (m - 1) : 0;
        const centersStart = yT + (groupLen - span) / 2 + halfLen;
        const centers = Array.from({ length: m }, (_, k) => centersStart + k * (RES_RENDER_LEN + gap));

        // Top bus to first element
        if (m > 0) {
          const firstTop = centers[0] - halfLen;
          svg.appendChild(line(l.x, yT, l.x, firstTop));
        }
        // Between consecutive elements
        for (let k = 0; k < m - 1; k++) {
          const bottomPrev = centers[k] + halfLen;
          const topNext = centers[k + 1] - halfLen;
          svg.appendChild(line(l.x, bottomPrev, l.x, topNext));
        }
        // Last element to bottom bus
        if (m > 0) {
          const lastBottom = centers[m - 1] + halfLen;
          svg.appendChild(line(l.x, lastBottom, l.x, yB));
        }
        c.children.forEach((cc, k) => {
          const py = centers[k];
          const sel = selectedIds.has(cc.id);
          const powRaw = Math.max(0, (res.per[cc.id]?.P || 0));
          const pow = brightnessMap ? brightnessMap(powRaw) : powRaw;
          const g = componentVertical(cc.type || "resistor", l.x, py, RES_RENDER_LEN, pow, sel);
          g.dataset.resistorId = cc.id;
          g.addEventListener("click", (e) => { e.stopPropagation(); if (sel) selectedIds.delete(cc.id); else selectedIds.add(cc.id); update(); });
          g.addEventListener("contextmenu", (e) => { e.preventDefault(); showContextMenu(e.clientX, e.clientY, cc.id); });
          svg.appendChild(g);
          if (sel && USE_EXTERNAL_PANEL && selIndexMap && selIndexMap[cc.id] != null) {
            svg.appendChild(selectionBadge(l.x, py, selIndexMap[cc.id], l.pos === "left" ? "left" : "right"));
          }
        if (sel && !USE_EXTERNAL_PANEL) {
            svg.appendChild(popupBox(l.x, py, [
              `R = ${fmtR(cc.R)}`,
              `V = ${fmtV(res.per[cc.id]?.V || 0)}`,
              `I = ${fmtI(res.per[cc.id]?.I || 0)}`,
              `P = ${fmtP(res.per[cc.id]?.P || 0)}`
            ], l.pos === "left" ? "left" : "right", () => { selectedIds.delete(cc.id); update(); }, cc.id));
          }
        });
      } else {
        const sel = selectedIds.has(c.id);
        const powRaw = Math.max(0, (res.per[c.id]?.P || 0));
        const pow = brightnessMap ? brightnessMap(powRaw) : powRaw;
        // Single element: span full group to connect bus bars
        const g = componentVertical(c.type || "resistor", l.x, (yT + yB) / 2, groupLen, pow, sel);
        g.dataset.resistorId = c.id;
        g.addEventListener("click", (e) => { e.stopPropagation(); if (sel) selectedIds.delete(c.id); else selectedIds.add(c.id); update(); });
        g.addEventListener("contextmenu", (e) => { e.preventDefault(); showContextMenu(e.clientX, e.clientY, c.id); });
        svg.appendChild(g);
        if (sel && USE_EXTERNAL_PANEL && selIndexMap && selIndexMap[c.id] != null) {
          svg.appendChild(selectionBadge(l.x, (yT + yB) / 2, selIndexMap[c.id], l.pos === "left" ? "left" : "right"));
        }
        if (sel && !USE_EXTERNAL_PANEL) {
          svg.appendChild(popupBox(l.x, (yT + yB) / 2, [
            `R = ${fmtR(c.R)}`,
            `V = ${fmtV(res.per[c.id]?.V || 0)}`,
            `I = ${fmtI(res.per[c.id]?.I || 0)}`,
            `P = ${fmtP(res.per[c.id]?.P || 0)}`
          ], l.pos === "left" ? "left" : "right", () => { selectedIds.delete(c.id); update(); }, c.id));
        }
      }
    });
  }
  function computeParallelN(V, list) {
    if (list.length === 0) {
      return { Rtot: Infinity, Itot: 0, Ptot: 0, per: {} };
    }
    const G = list.reduce((s, r) => s + 1 / r.R, 0);
    const Rtot = 1 / G;
    const per = {};
    let Itot = 0;
    for (const r of list) {
      const Ir = V / r.R;
      const Pr = V * Ir;
      per[r.id] = { V, I: Ir, P: Pr };
      Itot += Ir;
    }
    return { Rtot, Itot, Ptot: V * Itot, per };
  }

  // SVG helpers
  function clear(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }
  function line(x1, y1, x2, y2, cls = "wire") {
    const e = document.createElementNS("http://www.w3.org/2000/svg", "line");
    e.setAttribute("x1", x1); e.setAttribute("y1", y1);
    e.setAttribute("x2", x2); e.setAttribute("y2", y2);
    e.setAttribute("stroke", "#333"); e.setAttribute("stroke-width", "4");
    e.setAttribute("stroke-linecap", "round");
    if (cls) e.setAttribute("class", cls);
    return e;
  }
  function dot(x, y) {
    // Dots disabled for cleaner appearance
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    return g;
  }
  const RES_BODY = 60; // constant symbol length for zig-zag body
  const RES_AMP = 8;
  const RES_SEGS = 6;
  const BULB_D = 24;
  const RES_LEAD = 12; // desired minimum lead length on each side
  const RES_RENDER_LEN = RES_BODY + 2 * RES_LEAD; // standard total symbol span

  function drawZigZagHorizontal(cx, cy, length, selected = false) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const left = cx - length / 2, right = cx + length / 2;
    const bodyLen = Math.min(RES_BODY, Math.max(16, length - 16));
    const lead = (length - bodyLen) / 2;
    const x1 = left + lead, x2 = right - lead;

    const lead1 = line(left, cy, x1, cy);
    const lead2 = line(x2, cy, right, cy);
    // leads keep default style; only body highlights
    g.appendChild(lead1); g.appendChild(lead2);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    const step = bodyLen / RES_SEGS;
    const points = [];
    for (let i = 0; i <= RES_SEGS; i++) {
      const x = x1 + i * step;
      const y = cy + (i % 2 === 0 ? -RES_AMP : RES_AMP);
      points.push(`${x},${y}`);
    }
    path.setAttribute("points", points.join(" "));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", selected ? "#c8102e" : "#111");
    path.setAttribute("stroke-width", selected ? "3.5" : "2.5");
    g.appendChild(path);
    // Larger, invisible hit area for easy selection
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hit.setAttribute("x", left - 8);
    hit.setAttribute("y", cy - 22);
    hit.setAttribute("width", length + 16);
    hit.setAttribute("height", 44);
    hit.setAttribute("fill", "#000");
    hit.setAttribute("opacity", "0");
    hit.setAttribute("pointer-events", "all");
    g.appendChild(hit);
    g.style.cursor = "pointer";
    // Attach dataset for hit forwarding convenience (optional)
    g.dataset.hit = "1";
    return g;
  }

  function drawZigZagVertical(cx, cy, length, selected = false) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const top = cy - length / 2, bottom = cy + length / 2;
    const bodyLen = Math.min(RES_BODY, Math.max(16, length - 16));
    const lead = (length - bodyLen) / 2;
    const y1 = top + lead, y2 = bottom - lead;

    const lead1 = line(cx, top, cx, y1);
    const lead2 = line(cx, y2, cx, bottom);
    // leads keep default style; only body highlights
    g.appendChild(lead1); g.appendChild(lead2);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    const step = bodyLen / RES_SEGS;
    const points = [];
    for (let i = 0; i <= RES_SEGS; i++) {
      const y = y1 + i * step;
      const x = cx + (i % 2 === 0 ? -RES_AMP : RES_AMP);
      points.push(`${x},${y}`);
    }
    path.setAttribute("points", points.join(" "));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", selected ? "#c8102e" : "#111");
    path.setAttribute("stroke-width", selected ? "3.5" : "2.5");
    g.appendChild(path);
    // Larger, invisible hit area for easy selection
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hit.setAttribute("x", cx - 22);
    hit.setAttribute("y", top - 8);
    hit.setAttribute("width", 44);
    hit.setAttribute("height", length + 16);
    hit.setAttribute("fill", "#000");
    hit.setAttribute("opacity", "0");
    hit.setAttribute("pointer-events", "all");
    g.appendChild(hit);
    g.style.cursor = "pointer";
    g.dataset.hit = "1";
    return g;
  }

  function drawBulbHorizontal(cx, cy, length, powerFrac, selected = false) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const left = cx - length / 2, right = cx + length / 2;
    const lead = Math.max(8, (length - BULB_D) / 2);
    const x1 = left + lead, x2 = right - lead;
    const lead1 = line(left, cy, x1, cy);
    const lead2 = line(x2, cy, right, cy);
    // leads keep default style; only body highlights
    g.appendChild(lead1); g.appendChild(lead2);
    // Brightness mapping (power in watts):
    //  - 0–0.05W: hold at lightest shade (intensity 0)
    //  - 0.05–4.5W: linear ramp to brightest shade (intensity 1 at 4.5W)
    //  - ≥4.5W: clamp to brightest
    let intensity = 0;
    if (powerFrac >= 4.5) intensity = 1;
    else if (powerFrac > 0.05) intensity = (powerFrac - 0.05) / 4.45;
    intensity = clampPos(intensity, 0, 1);
    // Glow halo (subtle outer light) scales with intensity
    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("cx", cx); halo.setAttribute("cy", cy);
    halo.setAttribute("r", (BULB_D / 2) + 10 + 16 * intensity);
    halo.setAttribute("fill", `rgba(255, 200, 0, ${0.06 + 0.22 * intensity})`);
    halo.setAttribute("stroke", "none");
    g.appendChild(halo);
    // Bulb body
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", BULB_D / 2);
    // Color ramp: slightly deeper gold at low power so it stands out on white
    //   low:  #FFD45A  (richer gold)
    //   high: #FF8C00 (bright orange)
    const r0 = 255, g0 = 212, b0 = 90;
    const r1 = 255, g1 = 140, b1 = 0;
    const cr = Math.round(r0 + (r1 - r0) * intensity);
    const cg = Math.round(g0 + (g1 - g0) * intensity);
    const cb = Math.round(b0 + (b1 - b0) * intensity);
    c.setAttribute("fill", `rgb(${cr}, ${cg}, ${cb})`);
    c.setAttribute("stroke", selected ? "#c8102e" : "#111");
    c.setAttribute("stroke-width", selected ? "3" : "2");
    g.appendChild(c);
    // Larger, invisible hit area for easy selection
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hit.setAttribute("x", left - 8);
    hit.setAttribute("y", cy - (BULB_D / 2) - 16);
    hit.setAttribute("width", length + 16);
    hit.setAttribute("height", BULB_D + 32);
    hit.setAttribute("fill", "#000");
    hit.setAttribute("opacity", "0");
    hit.setAttribute("pointer-events", "all");
    g.appendChild(hit);
    g.style.cursor = "pointer";
    g.dataset.hit = "1";
    return g;
  }

  function drawBulbVertical(cx, cy, length, powerFrac, selected = false) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const top = cy - length / 2, bottom = cy + length / 2;
    const lead = Math.max(8, (length - BULB_D) / 2);
    const y1 = top + lead, y2 = bottom - lead;
    const lead1 = line(cx, top, cx, y1);
    const lead2 = line(cx, y2, cx, bottom);
    g.appendChild(lead1); g.appendChild(lead2);
    // Brightness mapping (power in watts):
    //  - 0–0.05W: hold at lightest shade (intensity 0)
    //  - 0.05–4.5W: linear ramp to brightest shade (intensity 1 at 4.5W)
    //  - ≥4.5W: clamp to brightest
    let intensity = 0;
    if (powerFrac >= 4.5) intensity = 1;
    else if (powerFrac > 0.05) intensity = (powerFrac - 0.05) / 4.45;
    intensity = clampPos(intensity, 0, 1);
    // Glow halo scales with intensity
    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("cx", cx); halo.setAttribute("cy", cy);
    halo.setAttribute("r", (BULB_D / 2) + 10 + 16 * intensity);
    halo.setAttribute("fill", `rgba(255, 200, 0, ${0.06 + 0.22 * intensity})`);
    halo.setAttribute("stroke", "none");
    g.appendChild(halo);
    // Bulb body
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", BULB_D / 2);
    // Color ramp: slightly deeper gold at low power so it stands out on white
    //   low:  #FFD45A
    //   high: #FF8C00
    const r0 = 255, g0 = 212, b0 = 90;
    const r1 = 255, g1 = 140, b1 = 0;
    const cr = Math.round(r0 + (r1 - r0) * intensity);
    const cg = Math.round(g0 + (g1 - g0) * intensity);
    const cb = Math.round(b0 + (b1 - b0) * intensity);
    c.setAttribute("fill", `rgb(${cr}, ${cg}, ${cb})`);
    c.setAttribute("stroke", selected ? "#c8102e" : "#111");
    c.setAttribute("stroke-width", selected ? "3" : "2");
    g.appendChild(c);
    // Larger, invisible hit area for easy selection
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hit.setAttribute("x", cx - (BULB_D / 2) - 16);
    hit.setAttribute("y", top - 8);
    hit.setAttribute("width", BULB_D + 32);
    hit.setAttribute("height", length + 16);
    hit.setAttribute("fill", "#000");
    hit.setAttribute("opacity", "0");
    hit.setAttribute("pointer-events", "all");
    g.appendChild(hit);
    g.style.cursor = "pointer";
    g.dataset.hit = "1";
    return g;
  }

  function componentHorizontal(kind, cx, cy, length, powerFrac, selected) {
    if (kind === "bulb") return drawBulbHorizontal(cx, cy, length, powerFrac, selected);
    return drawZigZagHorizontal(cx, cy, length, selected);
  }
  function componentVertical(kind, cx, cy, length, powerFrac, selected) {
    if (kind === "bulb") return drawBulbVertical(cx, cy, length, powerFrac, selected);
    return drawZigZagVertical(cx, cy, length, selected);
  }
  function label(text, x, y, anchor = "middle") {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", x); t.setAttribute("y", y);
    t.setAttribute("text-anchor", anchor);
    t.setAttribute("font-size", "14");
    t.setAttribute("font-family", "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif");
    t.setAttribute("fill", "#222");
    t.textContent = text;
    return t;
  }

  // Small SVG popup showing lines of text near a resistor
  function popupBox(x, y, lines, position = "above", onToggle = null, resistorId = null) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    // Allow clicks on popup to toggle selection off
    g.style.cursor = onToggle ? "pointer" : "default";
    const maxChars = Math.max(0, ...lines.map(s => s.length));
    const width = Math.max(100, Math.min(220, maxChars * 7 + 16));
    const height = lines.length * 16 + 12;
    let px = x, py = y;
    if (position === "above") { px = x - width / 2; py = y - height - 8; }
    else if (position === "below") { px = x - width / 2; py = y + 8; }
    else if (position === "left") { px = x - width - 8; py = y - height / 2; }
    else if (position === "right") { px = x + 8; py = y - height / 2; }

    // Clamp within SVG viewport
    px = Math.max(8, Math.min(px, W - width - 8));
    py = Math.max(8, Math.min(py, H - height - 8));

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", px); rect.setAttribute("y", py);
    rect.setAttribute("width", width); rect.setAttribute("height", height);
    rect.setAttribute("rx", "6"); rect.setAttribute("ry", "6");
    rect.setAttribute("fill", "#ffffff");
    rect.setAttribute("stroke", "#c8102e");
    rect.setAttribute("stroke-width", "1.5");
    g.appendChild(rect);

    lines.forEach((text, i) => {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", px + 8); t.setAttribute("y", py + 18 + i * 16);
      t.setAttribute("text-anchor", "start");
      t.setAttribute("font-size", "14");
      t.setAttribute("font-family", "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif");
      t.setAttribute("fill", "#111");
      t.textContent = text;
      g.appendChild(t);
    });
    if (onToggle) {
      g.addEventListener("click", (e) => {
        e.stopPropagation();
        onToggle();
      });
    }
    if (resistorId) {
      g.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, resistorId);
      });
    }
    return g;
  }

  // Small numeric badge to link selected item to the panel list
  function selectionBadge(x, y, label, position = "above") {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const padX = 6, padY = 3;
    const fontSize = 12;
    let px = x, py = y;
    const dx = 0, dy = 0;
    const offset = 16;
    if (position === "above") { py = y - offset; }
    else if (position === "below") { py = y + offset; }
    else if (position === "left") { px = x - offset; }
    else if (position === "right") { px = x + offset; }
    // Background rect sized to text: approximate width for 2 chars
    const w = 16, h = 16;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", px - w / 2); rect.setAttribute("y", py - h / 2);
    rect.setAttribute("width", w); rect.setAttribute("height", h);
    rect.setAttribute("rx", "8"); rect.setAttribute("ry", "8");
    rect.setAttribute("fill", "#c8102e");
    g.appendChild(rect);
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", px); t.setAttribute("y", py + 4); // baseline tweak
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-size", String(fontSize));
    t.setAttribute("font-family", "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif");
    t.setAttribute("fill", "#fff");
    t.textContent = String(label);
    g.appendChild(t);
    g.setAttribute("pointer-events", "none");
    return g;
  }
  function drawRectangleLoop(opts = {}) {
    const topGap = opts.topGap || null; // [x1, x2] to skip drawing top segment
    // Top
    if (topGap && Array.isArray(topGap) && topGap.length === 2) {
      const [gx1, gx2] = topGap;
      if (gx1 > leftX) svg.appendChild(line(leftX, topY, gx1, topY));
      if (gx2 < rightX) svg.appendChild(line(gx2, topY, rightX, topY));
    } else {
      svg.appendChild(line(leftX, topY, rightX, topY)); // full top
    }
    // Right, Bottom
    svg.appendChild(line(rightX, topY, rightX, bottomY));
    svg.appendChild(line(rightX, bottomY, leftX, bottomY));
    // Battery symbol centered on left wire: two perpendicular lines centered on the rail,
    // and the left rail has a small gap between the two terminals.
    const plateLong = 46;
    const plateShort = 26;
    const plateGap = 26; // vertical distance between plates
    const yPlus = centerY - plateGap / 2;
    const yMinus = centerY + plateGap / 2;
    // Left rail segments with gap between terminals
    svg.appendChild(line(leftX, topY, leftX, yPlus));
    svg.appendChild(line(leftX, yMinus, leftX, bottomY));
    // Plates (centered on the wire)
    const plateP = line(leftX - plateLong / 2, yPlus, leftX + plateLong / 2, yPlus);
    const plateN = line(leftX - plateShort / 2, yMinus, leftX + plateShort / 2, yMinus);
    svg.appendChild(plateP);
    svg.appendChild(plateN);
    // Labels near the right ends of plates
    const tPlus = document.createElementNS("http://www.w3.org/2000/svg", "text");
    tPlus.setAttribute("x", leftX + plateLong / 2 + 8); tPlus.setAttribute("y", yPlus + 5);
    tPlus.setAttribute("text-anchor", "start");
    tPlus.setAttribute("font-size", "18");
    tPlus.setAttribute("font-family", "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif");
    tPlus.setAttribute("fill", "#d00");
    tPlus.textContent = "+";
    svg.appendChild(tPlus);
    const tMinus = document.createElementNS("http://www.w3.org/2000/svg", "text");
    tMinus.setAttribute("x", leftX + plateShort / 2 + 8); tMinus.setAttribute("y", yMinus + 5);
    tMinus.setAttribute("text-anchor", "start");
    tMinus.setAttribute("font-size", "18");
    tMinus.setAttribute("font-family", "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif");
    tMinus.setAttribute("fill", "#111");
    tMinus.textContent = "-";
    svg.appendChild(tMinus);
  }

  function render(mode, V, list, res) {
    clear(svg);

    // Normalize power for brightness across all components in 'per'
    let pMax = 1e-9;
    for (const k in res.per) {
      if (Object.prototype.hasOwnProperty.call(res.per, k)) {
        pMax = Math.max(pMax, Math.max(0, res.per[k].P));
      }
    }

    // Use a consistent, monotonic brightness transform so intensity increases
    // smoothly with power as voltage rises.
    let brightnessMap = (p) => p;
    const selIndexMap = getSelectionIndexMap();

    if (mode === "series") {
      drawRectangleLoop();
      // Series: distribute evenly around all four edges, colinear with the local edge
      const n = list.length;
      const width = rightX - leftX;
      const height = bottomY - topY;
      const perimeter = 2 * (width + height);
      const arcGap = perimeter / (n + 1);
      const cornerPad = 18; // keep clear of corners so wires stay visually connected

      function positionAlongPerimeter(s) {
        // s: distance from left-top corner along top→right→bottom→left
        let d = s % perimeter;
        if (d < width) {
          // top edge (left→right)
          return { x: leftX + d, y: topY, edge: "top" };
        }
        d -= width;
        if (d < height) {
          // right edge (top→bottom)
          return { x: rightX, y: topY + d, edge: "right" };
        }
        d -= height;
        if (d < width) {
          // bottom edge (right→left)
          return { x: rightX - d, y: bottomY, edge: "bottom" };
        }
        d -= width;
        // left edge (bottom→top)
        return { x: leftX, y: bottomY - d, edge: "left" };
      }

      list.forEach((item, i) => {
        const s = arcGap * (i + 1);
        const pos = positionAlongPerimeter(s);
        // Nudge away from corners to avoid too-short bodies
        let px = pos.x, py = pos.y;
        const guard = 28;
        if (pos.edge === "top" || pos.edge === "bottom") {
          if (px - leftX < guard) px = leftX + guard;
          else if (rightX - px < guard) px = rightX - guard;
        } else {
          if (py - topY < guard) py = topY + guard;
          else if (bottomY - py < guard) py = bottomY - guard;
        }

        // Use a standard symbol span everywhere
        const rLen = RES_RENDER_LEN;

        if (pos.edge === "top" || pos.edge === "bottom") {
          const y = py;
          // Keep away from corners: clamp center so the full symbol fits with margin
          const half = rLen / 2;
          px = clampPos(px, leftX + cornerPad + half, rightX - cornerPad - half);
          const x1 = px - half;
          const x2 = px + half;
          if (item && item.kind === "parallel" && Array.isArray(item.children)) {
            // Localized parallel group on top/bottom edge
            drawLocalParallelGroupTop(px, y, item.children, pMax, res, brightnessMap, selIndexMap);
          } else {
            const r = item;
            const sel = selectedIds.has(r.id);
            const fRaw = Math.max(0, (res.per[r.id]?.P || 0));
            const f = brightnessMap(fRaw);
            svg.appendChild(dot(x1, y));
            svg.appendChild(dot(x2, y));
            const g = componentHorizontal(r.type || "resistor", px, y, rLen, f, sel);
            g.dataset.resistorId = r.id;
            g.addEventListener("click", (e) => {
              e.stopPropagation();
              if (selectedIds.has(r.id)) selectedIds.delete(r.id); else selectedIds.add(r.id);
              update();
            });
            g.addEventListener("contextmenu", (e) => {
              e.preventDefault();
              showContextMenu(e.clientX, e.clientY, r.id);
            });
            svg.appendChild(g);
            if (sel && USE_EXTERNAL_PANEL && selIndexMap && selIndexMap[r.id] != null) {
              const badgePos = pos.edge === "top" ? "below" : "above";
              svg.appendChild(selectionBadge(px, y, selIndexMap[r.id], badgePos));
            }
            if (sel && !USE_EXTERNAL_PANEL) {
              const popupPos = pos.edge === "top" ? "below" : "above";
              svg.appendChild(popupBox(px, y, [
                `R = ${fmtR(r.R)}`,
                `V = ${fmtV(res.per[r.id].V)}`,
                `I = ${fmtI(res.per[r.id].I)}`,
                `P = ${fmtP(res.per[r.id].P)}`
              ], popupPos, () => { selectedIds.delete(r.id); update(); }, r.id));
            }
          }
        } else {
          const x = px;
          // Keep away from corners: clamp center so the full symbol fits with margin
          let half = rLen / 2;
          py = clampPos(py, topY + cornerPad + half, bottomY - cornerPad - half);
          // Avoid overlapping the left-rail battery: reserve a vertical band
          const plateGap = 26;
          const reserveMargin = 18;
          const clearTop = centerY - plateGap / 2 - reserveMargin;
          const clearBottom = centerY + plateGap / 2 + reserveMargin;
          if (x === leftX) {
            let y1 = py - half;
            let y2 = py + half;
            if (!(y2 < clearTop || y1 > clearBottom)) {
            // Nudge above or below the reserved band
              if (py <= centerY) py = clearTop - half - 2;
              else py = clearBottom + half + 2;
              // Clamp within bounds after nudge
              py = clampPos(py, topY + cornerPad + half, bottomY - cornerPad - half);
            }
          }
          const y1 = py - half;
          const y2 = py + half;
          if (item && item.kind === "parallel" && Array.isArray(item.children)) {
            drawLocalParallelGroupLeft(x, py, item.children, pMax, res, brightnessMap, selIndexMap);
          } else {
            const r = item;
            const sel = selectedIds.has(r.id);
            const fRaw = Math.max(0, (res.per[r.id]?.P || 0));
            const f = brightnessMap(fRaw);
            svg.appendChild(dot(x, y1));
            svg.appendChild(dot(x, y2));
            const g = componentVertical(r.type || "resistor", x, py, rLen, f, sel);
            g.dataset.resistorId = r.id;
            g.addEventListener("click", (e) => {
              e.stopPropagation();
              if (selectedIds.has(r.id)) selectedIds.delete(r.id); else selectedIds.add(r.id);
              update();
            });
            g.addEventListener("contextmenu", (e) => {
              e.preventDefault();
              showContextMenu(e.clientX, e.clientY, r.id);
            });
            svg.appendChild(g);
            if (sel && USE_EXTERNAL_PANEL && selIndexMap && selIndexMap[r.id] != null) {
              const badgePos = pos.edge === "right" ? "right" : "left";
              svg.appendChild(selectionBadge(x, py, selIndexMap[r.id], badgePos));
            }
            if (sel && !USE_EXTERNAL_PANEL) {
              const popupPos = pos.edge === "right" ? "right" : "left";
              svg.appendChild(popupBox(x, py, [
                `R = ${fmtR(r.R)}`,
                `V = ${fmtV(res.per[r.id].V)}`,
                `I = ${fmtI(res.per[r.id].I)}`,
                `P = ${fmtP(res.per[r.id].P)}`
              ], popupPos, () => { selectedIds.delete(r.id); update(); }, r.id));
            }
          }
        }
      });
    } else {
      // Parallel (legacy global view) - not used; kept for reference
      const n = list.length;
      if (n === 0) {
        // With no branches, render intact rectangle (no fork gap)
        drawRectangleLoop();
        return;
      }
      const busInset = Math.min(320, (rightX - leftX) * 0.42); // bring buses further inward to shorten branches
      const xL = leftX + busInset;
      const xR = rightX - busInset;
      const yMain = topY;
      // Break the top wire between fork and rejoin to avoid bypass
      drawRectangleLoop({ topGap: [xL, xR] });

      // Fork/rejoin markers on the main wire
      svg.appendChild(dot(xL, yMain));
      svg.appendChild(dot(xR, yMain));

      // Determine lanes above and below
      const nAbove = Math.floor(n / 2);
      const nBelow = n - nAbove;
      const laneGap = 24; // even shorter vertical runs
      const aboveYs = Array.from({ length: nAbove }, (_, i) => yMain - laneGap * (i + 1));
      const belowYs = Array.from({ length: nBelow }, (_, i) => yMain + laneGap * (i + 1));

      const yTopMost = aboveYs.length ? aboveYs[aboveYs.length - 1] : yMain;
      const yBottomMost = belowYs.length ? belowYs[belowYs.length - 1] : yMain;

      // Draw compact bus bars up and down from the main wire to the extreme lanes
      if (yTopMost !== yMain) {
        svg.appendChild(line(xL, yMain, xL, yTopMost));
        svg.appendChild(line(xR, yMain, xR, yTopMost));
      }
      if (yBottomMost !== yMain) {
        svg.appendChild(line(xL, yMain, xL, yBottomMost));
        svg.appendChild(line(xR, yMain, xR, yBottomMost));
      }

      // Assign resistors to lanes: fill above first, then below
      let idx = 0;
      const lanes = [];
      for (let i = 0; i < nAbove && idx < n; i++, idx++) lanes.push({ id: list[idx].id, y: aboveYs[i], pos: "above" });
      for (let i = 0; i < nBelow && idx < n; i++, idx++) lanes.push({ id: list[idx].id, y: belowYs[i], pos: "below" });

      // Render each branch as a horizontal resistor between bus bars
      const length = xR - xL;
      lanes.forEach(l => {
        const rId = l.id;
        const comp = list.find(x => x.id === rId);
        const sel = selectedIds.has(rId);
        const f = brightnessMap(Math.max(0, res.per[rId].P));
        const g = componentHorizontal(comp?.type || "resistor", (xL + xR) / 2, l.y, length, f, sel);
        g.dataset.resistorId = rId;
        g.addEventListener("click", (e) => {
          e.stopPropagation();
          if (selectedIds.has(rId)) selectedIds.delete(rId); else selectedIds.add(rId);
          update();
        });
        g.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          showContextMenu(e.clientX, e.clientY, rId);
        });
        svg.appendChild(g);

        if (sel && !USE_EXTERNAL_PANEL) {
          svg.appendChild(popupBox((xL + xR) / 2, l.y, [
            `R = ${fmtR(comp?.R ?? 0)}`,
            `V = ${fmtV(res.per[rId].V)}`,
            `I = ${fmtI(res.per[rId].I)}`,
            `P = ${fmtP(res.per[rId].P)}`
          ], l.pos === "above" ? "above" : "below", () => { selectedIds.delete(rId); update(); }, rId));
        }
      });
    }
  }

  function update() {
    const V = parseFloat(elV.value);
    // Always render with localized-parallel series layout; add-mode is separate
    const mode = "series";

    elVVal.textContent = fmt(V, 1);

    let res = computeSeriesN(V, resistors);

    // Dynamically expand vertical size based on effective series width
    // Units: comp=1; series=sum; parallel=1+max(branch)
    function unitsOf(node) {
      if (!node) return 0;
      if (node.kind === "comp") return 1;
      if (node.kind === "series" && Array.isArray(node.children)) {
        return node.children.reduce((s, ch) => s + unitsOf(ch), 0);
      }
      if (node.kind === "parallel" && Array.isArray(node.children)) {
        const branchUnits = node.children.map(ch => unitsOf(ch));
        const longest = branchUnits.length ? Math.max(...branchUnits) : 0;
        return 1 + longest;
      }
      return 0;
    }
    function totalUnitsTopLevel(list) {
      return (list || []).reduce((s, n) => s + unitsOf(n), 0);
    }
    const totalUnits = totalUnitsTopLevel(resistors);
    const extraRows = Math.max(0, totalUnits - 13); // start expanding at 14
    // After threshold, expand downward by 0.5 × resistor length per extra unit
    const extraPx = extraRows * (RES_RENDER_LEN / 2);
    H = BASE_H + extraPx;
    // Update SVG viewBox and height only when threshold reached (avoid initial shift)
    if (svg && extraRows > 0) {
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      // Use a stable base ratio so height growth is linear (no compounding)
      const baseViewH = BASE_H;
      let baseCssH = parseFloat(svg.dataset.baseCssH || svg.getAttribute("height") || "436");
      if (!svg.dataset.baseCssH) {
        svg.dataset.baseCssH = String(baseCssH);
      }
      const ratio = baseCssH / baseViewH;
      const newCssH = Math.max(baseCssH, Math.round(H * ratio));
      svg.setAttribute("height", String(newCssH));
    }
    recalcLayout();

    elTotalR.textContent = fmtR(res.Rtot);
    elTotalI.textContent = fmtI(res.Itot);
    elTotalP.textContent = fmtP(res.Ptot);

    // R1/R2 side cards removed

    render(mode, V, resistors, res);
    updateSelectionPanel(res);
    // Toggle remove button availability
    if (elRemove) {
      elRemove.disabled = selectedIds.size === 0;
    }
  }

  [elV, ...elMode].forEach(input => {
    input.addEventListener("input", update);
    input.addEventListener("change", update);
  });

  // Removed R1/R2 input bindings

  function handleAdd(type) {
    const R = Math.max(0.01, parseFloat(elNewR.value || "0"));
    const addMode = (elAddMode.find(r => r.checked)?.value) || "series";
    const sel = Array.from(selectedIds);
    const id = `r${nextId++}`;
    const comp = { kind: "comp", id, R, type };
    if (sel.length === 0) {
      // Fallback behavior when nothing selected
      if (addMode === "series") {
        resistors.push(comp);
        update();
      } else {
        showToast("Select components within the same series row or the same parallel group to add in parallel.");
      }
      return;
    }
    const group = computeSelectionGroup(sel);
    if (!group) { showToast("Couldn't resolve selection."); return; }
    if (addMode === "series") {
      if (group.kind === "parallel-group") {
        insertSeriesAfterTopIndex(comp, group.topIndex);
      } else if (group.kind === "branch-series") {
        const insertAfter = group.seriesSpan ? group.seriesSpan[1] : 0;
        insertIntoBranchSeries(comp, group.parallelNode, group.branchIndex, group.seriesNode, insertAfter);
      } else if (group.kind === "top-series") {
        insertSeriesAfterTopIndex(comp, group.topSpan[1]);
      }
      update();
      return;
    }
    // addMode === 'parallel'
    if (group.kind === "parallel-group") {
      addBranchToParallel(comp, group.parallelNode);
      update();
      return;
    }
    if (group.kind === "branch-series") {
      addBranchToParallel(comp, group.parallelNode);
      update();
      return;
    }
    // top-series: allow wrapping a single top-level component into a new parallel group
    if (group.kind === "top-series") {
      if (sel.length === 1) {
        const path = findPathToComponent(sel[0]);
        if (!path || typeof path.topIndex !== "number") {
          showToast("Couldn't resolve selection.");
          return;
        }
        const target = resistors[path.topIndex];
        if (!target) {
          showToast("Couldn't locate the selected component.");
          return;
        }
        if (target.kind === "parallel") {
          // Selected a top-level parallel group (edge case): add a new branch
          addBranchToParallel(comp, target);
        } else {
          // Wrap top-level component with a new parallel group
          const oldComp = target.kind === "comp" ? target : { kind: "comp", id: target.id, R: target.R, type: target.type };
          resistors.splice(path.topIndex, 1, { kind: "parallel", children: [oldComp, comp] });
        }
        update();
        return;
      }
      // Multiple top-level items selected: allow wrapping a contiguous series segment
      const paths = sel.map(findPathToComponent).filter(Boolean);
      if (paths.length !== sel.length) {
        showToast("Couldn't resolve selection.");
        return;
      }
      // All must be top-level comps (no parallel ancestor)
      if (!paths.every(p => p.parallelNode === null)) {
        showToast("Select components within the same series row or the same parallel group to add in parallel.");
        return;
      }
      const topIdx = paths.map(p => p.topIndex).sort((a,b)=>a-b);
      const lo = topIdx[0];
      const hi = topIdx[topIdx.length - 1];
      // Check contiguity and that all items in [lo..hi] are selected and are comps
      const selectedTopIndexSet = new Set(topIdx);
      for (let k = lo; k <= hi; k++) {
        const node = resistors[k];
        if (!node || node.kind !== "comp" || !selectedTopIndexSet.has(k)) {
          showToast("Select a contiguous set of resistors in one series row.");
          return;
        }
      }
      wrapTopSeriesSegmentAsParallel(lo, hi, comp);
      update();
      return;
    }
    // Fallback
    showToast("Select components within the same series row or the same parallel group to add in parallel.");
  }
  // Type selection toggles (persistent)
  if (elAddResistor) {
    elAddResistor.addEventListener("click", () => {
      currentType = "resistor";
      elAddResistor.classList.add("btn--selected");
      if (elAddBulb) elAddBulb.classList.remove("btn--selected");
      if (elAddComponentBtn) elAddComponentBtn.textContent = "Add Resistor";
    });
  }
  if (elAddBulb) {
    elAddBulb.addEventListener("click", () => {
      currentType = "bulb";
      elAddBulb.classList.add("btn--selected");
      if (elAddResistor) elAddResistor.classList.remove("btn--selected");
      if (elAddComponentBtn) elAddComponentBtn.textContent = "Add Bulb";
    });
  }
  // Add component action
  if (elAddComponentBtn) {
    elAddComponentBtn.textContent = "Add Resistor"; // default
    elAddComponentBtn.addEventListener("click", () => handleAdd(currentType));
  }
  if (elRemove) {
    elRemove.addEventListener("click", () => {
      if (selectedIds.size === 0) return;
      const ids = Array.from(selectedIds);
      ids.forEach(removeById);
      selectedIds.clear();
      update();
    });
  }
  if (elReset) {
    elReset.addEventListener("click", () => {
      resistors.length = 0;
      selectedIds.clear();
      nextId = 1;
      update();
    });
  }

  function removeById(id) {
    const idx = resistors.findIndex(r => r.id === id);
    if (idx >= 0) {
      resistors.splice(idx, 1);
      selectedIds.delete(id);
      return;
    }
    // search inside parallel groups
    for (let i = 0; i < resistors.length; i++) {
      const it = resistors[i];
      if (it.kind === "parallel") {
        for (let j = 0; j < it.children.length; j++) {
          const ch = it.children[j];
          if (ch.kind === "comp" && ch.id === id) {
            it.children.splice(j, 1);
            selectedIds.delete(id);
            if (it.children.length === 1) {
              // collapse to single component
              resistors.splice(i, 1, it.children[0]);
            }
            return;
          }
          if (ch.kind === "series") {
            const si = ch.children.findIndex(cc => cc.id === id);
            if (si !== -1) {
              ch.children.splice(si, 1);
              selectedIds.delete(id);
              if (ch.children.length === 1) {
                it.children[j] = ch.children[0];
              }
              if (it.children.length === 1) {
                resistors.splice(i, 1, it.children[0]);
              }
              return;
            }
          }
        }
      }
    }
  }

  update();
})();

/**
 * Circuit Simulator - Core Logic and Physics Calculations
 * Handles circuit model, component management, and electrical calculations
 */

class Component {
    constructor(id, type, resistance, position = null) {
        this.id = id;
        this.type = type; // 'resistor', 'bulb-10', 'bulb-15', 'bulb-20'
        this.resistance = resistance; // in Ohms
        this.current = 0; // in Amperes
        this.voltage = 0; // in Volts
        this.power = 0; // in Watts
        this.position = position; // {seriesIndex, parallelIndex}
    }

    isBulb() {
        return this.type.startsWith('bulb');
    }

    getDisplayName() {
        if (this.type === 'resistor') {
            return `Resistor (${this.resistance}Ω)`;
        } else if (this.type.startsWith('bulb')) {
            return `Light Bulb (${this.resistance}Ω)`;
        }
        return 'Component';
    }
}

class CircuitSimulator {
    constructor() {
        this.voltage = 12; // Default 12V
        this.components = [];
        this.nextId = 1;
        
        // Circuit topology: array of series positions, each can have parallel components
        // Structure: [ [comp1], [comp2, comp3], [comp4] ]
        // Represents: comp1 --- (comp2 || comp3) --- comp4
        this.topology = [];
        
        // Overall circuit values
        this.totalResistance = 0;
        this.totalCurrent = 0;
        this.totalPower = 0;
        
        // Initialize with default circuit (12V, 10Ω resistor)
        this.initializeDefaultCircuit();
    }

    initializeDefaultCircuit() {
        const defaultResistor = new Component(
            this.nextId++,
            'resistor',
            10,
            { seriesIndex: 0, parallelIndex: 0 }
        );
        this.components.push(defaultResistor);
        this.topology = [[defaultResistor]];
        this.calculateCircuit();
    }

    setVoltage(voltage) {
        this.voltage = parseFloat(voltage);
        this.calculateCircuit();
    }

    addComponent(type, resistance, placementMode = 'series', targetPosition = null) {
        const component = new Component(this.nextId++, type, resistance);
        this.components.push(component);

        if (placementMode === 'series') {
            // Insert as a new series position after target (if provided), else at end
            let insertIndex = this.topology.length;
            if (targetPosition && typeof targetPosition.seriesIndex === 'number') {
                insertIndex = Math.min(targetPosition.seriesIndex + 1, this.topology.length);
            }
            this.topology.splice(insertIndex, 0, [component]);
            component.position = { seriesIndex: insertIndex, parallelIndex: 0 };
            // Reindex positions after insertion
            this.updatePositions();
        } else {
            // Add in parallel to a target series position if provided, else to the last
            if (this.topology.length === 0) {
                // No components yet, add as first series position
                component.position = { seriesIndex: 0, parallelIndex: 0 };
                this.topology.push([component]);
            } else {
                const seriesIndex = (targetPosition && typeof targetPosition.seriesIndex === 'number')
                    ? Math.max(0, Math.min(targetPosition.seriesIndex, this.topology.length - 1))
                    : this.topology.length - 1;
                // Insert after the target parallelIndex if provided, else at end
                const afterIndex = (targetPosition && typeof targetPosition.parallelIndex === 'number')
                    ? Math.max(0, Math.min(targetPosition.parallelIndex + 1, this.topology[seriesIndex].length))
                    : this.topology[seriesIndex].length;
                this.topology[seriesIndex].splice(afterIndex, 0, component);
                component.position = { seriesIndex, parallelIndex: afterIndex };
                // Reindex positions after insertion
                this.updatePositions();
            }
        }

        this.calculateCircuit();
        return component;
    }
    
    addComponentToSelected(type, resistance, placementMode, selectedComponentIds) {
        if (selectedComponentIds.length === 0) {
            // Fallback to old behavior
            return this.addComponent(type, resistance, placementMode);
        }
        
        const newComponent = new Component(this.nextId++, type, resistance);
        this.components.push(newComponent);
        
        // Get the first selected component to determine position
        const selectedComponent = this.getComponentById(selectedComponentIds[0]);
        if (!selectedComponent) {
            // Fallback
            this.topology.push([newComponent]);
            newComponent.position = { seriesIndex: this.topology.length - 1, parallelIndex: 0 };
            this.calculateCircuit();
            return newComponent;
        }
        
        const { seriesIndex, parallelIndex } = selectedComponent.position;
        
        if (placementMode === 'series') {
            // Insert new series position after the selected component
            const newSeriesIndex = seriesIndex + 1;
            this.topology.splice(newSeriesIndex, 0, [newComponent]);
            newComponent.position = { seriesIndex: newSeriesIndex, parallelIndex: 0 };
            
            // Update positions of all components after the insertion
            this.updatePositions();
        } else {
            // Add in parallel to the selected component(s) directly adjacent to selection
            // Insert right after the selected component within the same series position
            const insertIndex = parallelIndex + 1;
            this.topology[seriesIndex].splice(insertIndex, 0, newComponent);
            newComponent.position = { seriesIndex, parallelIndex: insertIndex };
            // Update positions for all components in that series group
            this.updatePositions();
        }
        
        this.calculateCircuit();
        return newComponent;
    }

    removeComponent(componentId) {
        const component = this.components.find(c => c.id === componentId);
        if (!component) return false;

        const { seriesIndex, parallelIndex } = component.position;
        
        // Remove from topology
        this.topology[seriesIndex].splice(parallelIndex, 1);
        
        // If series position is now empty, remove it
        if (this.topology[seriesIndex].length === 0) {
            this.topology.splice(seriesIndex, 1);
        }
        
        // Remove from components array
        const index = this.components.findIndex(c => c.id === componentId);
        this.components.splice(index, 1);
        
        // Update positions for all remaining components
        this.updatePositions();
        
        // Recalculate if there are still components
        if (this.components.length > 0) {
            this.calculateCircuit();
        } else {
            this.resetCircuitValues();
        }
        
        return true;
    }

    moveComponent(componentId, newSeriesIndex, newParallelIndex) {
        const component = this.components.find(c => c.id === componentId);
        if (!component) return false;

        const { seriesIndex, parallelIndex } = component.position;
        
        // Remove from old position
        this.topology[seriesIndex].splice(parallelIndex, 1);
        if (this.topology[seriesIndex].length === 0) {
            this.topology.splice(seriesIndex, 1);
        }
        
        // Adjust indices if necessary
        if (newSeriesIndex > seriesIndex) {
            newSeriesIndex--;
        }
        
        // Ensure series position exists
        while (this.topology.length <= newSeriesIndex) {
            this.topology.push([]);
        }
        
        // Add to new position
        if (newParallelIndex >= this.topology[newSeriesIndex].length) {
            this.topology[newSeriesIndex].push(component);
        } else {
            this.topology[newSeriesIndex].splice(newParallelIndex, 0, component);
        }
        
        // Update all positions
        this.updatePositions();
        this.calculateCircuit();
        
        return true;
    }

    updatePositions() {
        this.topology.forEach((seriesGroup, seriesIndex) => {
            seriesGroup.forEach((component, parallelIndex) => {
                component.position = { seriesIndex, parallelIndex };
            });
        });
    }

    calculateCircuit() {
        if (this.components.length === 0) {
            this.resetCircuitValues();
            return;
        }

        // Step 1: Calculate equivalent resistance for each series position
        const seriesResistances = [];
        this.topology.forEach(parallelGroup => {
            if (parallelGroup.length === 1) {
                // Single component, use its resistance
                seriesResistances.push(parallelGroup[0].resistance);
            } else {
                // Multiple components in parallel: 1/R_eq = 1/R1 + 1/R2 + ...
                const reciprocalSum = parallelGroup.reduce(
                    (sum, comp) => sum + (1 / comp.resistance),
                    0
                );
                seriesResistances.push(1 / reciprocalSum);
            }
        });

        // Step 2: Calculate total resistance (sum of series resistances)
        this.totalResistance = seriesResistances.reduce((sum, r) => sum + r, 0);

        // Step 3: Calculate total current using Ohm's Law: I = V / R
        this.totalCurrent = this.voltage / this.totalResistance;

        // Step 4: Calculate total power: P = V * I
        this.totalPower = this.voltage * this.totalCurrent;

        // Step 5: Calculate voltage and current for each component
        this.topology.forEach((parallelGroup, seriesIndex) => {
            // Voltage drop across this series position
            const seriesVoltage = this.totalCurrent * seriesResistances[seriesIndex];
            
            parallelGroup.forEach(component => {
                // In parallel, voltage is the same across all components
                component.voltage = seriesVoltage;
                
                // Current through each component: I = V / R
                component.current = component.voltage / component.resistance;
                
                // Power dissipated: P = I^2 * R (or V * I)
                component.power = component.current * component.current * component.resistance;
            });
        });
    }

    resetCircuitValues() {
        this.totalResistance = 0;
        this.totalCurrent = 0;
        this.totalPower = 0;
        this.components.forEach(comp => {
            comp.current = 0;
            comp.voltage = 0;
            comp.power = 0;
        });
    }

    reset() {
        this.components = [];
        this.topology = [];
        this.nextId = 1;
        this.voltage = 12;
        this.initializeDefaultCircuit();
    }

    getComponentById(id) {
        return this.components.find(c => c.id === id);
    }

    getAllComponents() {
        return this.components;
    }

    getTopology() {
        return this.topology;
    }

    getStats() {
        return {
            voltage: this.voltage,
            totalCurrent: this.totalCurrent,
            totalResistance: this.totalResistance,
            totalPower: this.totalPower
        };
    }

    getComponentStats(componentId) {
        const component = this.getComponentById(componentId);
        if (!component) return null;

        return {
            id: component.id,
            name: component.getDisplayName(),
            type: component.type,
            resistance: component.resistance,
            voltage: component.voltage,
            current: component.current,
            power: component.power,
            position: component.position
        };
    }

    // Helper method to get maximum power among all bulbs (for brightness normalization)
    getMaxBulbPower() {
        const bulbs = this.components.filter(c => c.isBulb());
        if (bulbs.length === 0) return 0;
        return Math.max(...bulbs.map(b => b.power));
    }
}

// Global circuit instance
let circuit = new CircuitSimulator();

