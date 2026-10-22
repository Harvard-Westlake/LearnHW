/* Intermolecular Forces (IMFs): Interactive Particle Simulation + Molecule Close-ups
   - Scenarios: Honey (H-bond network with sugars + water), DMSO (dipole–dipole), Hexane (London dispersion)
   - Canvas-based 2D particle sim with LJ + directional terms
   - High-fidelity SVG molecule renderer lives in molecules.js
*/

import { renderMolecule, molecules } from "./molecules.js";

// ---------------- Utilities ----------------
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

// Gaussian(0,1) via Box–Muller
function randNorm() {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// 2D vector helpers
function vAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}
function vSub(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}
function vMul(a, k) {
  return [a[0] * k, a[1] * k];
}
function vLen(a) {
  return Math.hypot(a[0], a[1]);
}
function vNorm(a) {
  const L = vLen(a);
  return L > 1e-12 ? [a[0] / L, a[1] / L] : [0, 0];
}

// ---------------- Simulation Core ----------------
class NeighborGrid {
  constructor(width, height, cellSize) {
    this.width = width;
    this.height = height;
    this.cellSize = Math.max(8, cellSize);
    this.cols = Math.max(1, Math.floor(width / this.cellSize));
    this.rows = Math.max(1, Math.floor(height / this.cellSize));
    this.cells = new Array(this.cols * this.rows);
  }
  clear() {
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = undefined;
  }
  cellIndex(x, y) {
    // Clamp to valid grid bounds (no wrapping)
    const cx = Math.max(
      0,
      Math.min(this.cols - 1, Math.floor(x / this.cellSize))
    );
    const cy = Math.max(
      0,
      Math.min(this.rows - 1, Math.floor(y / this.cellSize))
    );
    return cy * this.cols + cx;
  }
  insert(particle) {
    const idx = this.cellIndex(particle.pos[0], particle.pos[1]);
    if (!this.cells[idx]) this.cells[idx] = [];
    this.cells[idx].push(particle);
  }
  forNeighbors(x, y, radius, fn) {
    const r = radius;
    const minCx = Math.floor((x - r) / this.cellSize);
    const maxCx = Math.floor((x + r) / this.cellSize);
    const minCy = Math.floor((y - r) / this.cellSize);
    const maxCy = Math.floor((y + r) / this.cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) continue;
        const ix = cx;
        const iy = cy;
        const idx = iy * this.cols + ix;
        const cell = this.cells[idx];
        if (!cell) continue;
        for (let j = 0; j < cell.length; j++) fn(cell[j]);
      }
    }
  }
}

function makeParticle(x, y, kind) {
  return {
    kind, // "honey", "dmso", "hexane"
    pos: [x, y],
    vel: [randRange(-20, 20), randRange(-20, 20)],
    angle: Math.random() * Math.PI * 2,
    angVel: randRange(-2, 2),
    mass: 1,
    radius: 4.5, // 1.5x bigger than previous (was 3)
    state: "liquid",
    gasUntil: 0,
    localNeighbors: 0,
    thermalEnergy: 0, // 0-1, accumulates when heated
    lastStateChange: 0, // timestamp of last state change
  };
}

function scenarioDefaults(kind) {
  if (kind === "honey") {
    return {
      label: "Honey (H-bond)",
      epsilon: 0.7,
      sigma: 10,
      viscosity: 10, // Increased from 5 to make it much harder to evaporate
      hbStrength: 2.5, // Increased from 1.8 to make hydrogen bonds stronger
      dipole: 0.0,
      N: 200,
      color: "#5ac8fa",
    };
  }
  if (kind === "dmso") {
    return {
      label: "DMSO (dipole–dipole)",
      epsilon: 0.6,
      sigma: 10,
      viscosity: 0.1,
      hbStrength: 0.0,
      dipole: 0.6,
      N: 200,
      color: "#ffd60a",
    };
  }
  // hexane
  return {
    label: "Hexane (dispersion)",
    epsilon: 0.05, // Extremely weak - minimal London dispersion forces
    sigma: 10,
    viscosity: 0.05, // Extremely low viscosity - particles barely stick together
    hbStrength: 0.0,
    dipole: 0.0,
    N: 200,
    color: "#8ab6ff",
  };
}

class IMFSim {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = canvas.clientWidth || 225; // Half-width default
    this.height = canvas.clientHeight || 420;
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.setSize();
    this.running = false;
    this.params = { ...scenarioDefaults("honey"), kT: 1.0 };
    this.particles = [];
    this.grid = new NeighborGrid(this.width, this.height, 12); // Grid cell size optimized for particles (radius 4.5)
    this.lastMs = 0;
    this.frameId = 0;
    this.gravityOn = true;
    this.contourOn = false;
    this.shadeContour = true;
    this.moleculesVisible = true;
    this.lastThermoMs = 0;
    this.heatingOn = false;
    this.heatIntensity = 5.0; // Heat intensity multiplier (0-5)
    this.heatAccel = 80; // px/s^2 along velocity direction when heating
    // Gas and escape tracking
    this.gasCount = 0; // Current gas particle count
    this.escapedCount = 0; // Total escaped particles for current scenario
    this.escapedParticles = []; // Store escaped particles to display after 30s
    this.gasHistory = []; // {t, gasCount, escapedCount, scenario}
    this.currentScenario = null; // Track current scenario for history
    this.gasStart = performance.now(); // Start time for current scenario
    this.trialEnded = false; // Track if current trial has ended at 30s
    this.completedTrials = new Set(); // Track which scenarios have completed trials
    this.spawnParticles();
    this.onVisibility = () => {
      if (document.hidden) this.stop();
    };
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  setSize() {
    const cssW = this.canvas.clientWidth || 225; // Half-width default
    const cssH = this.canvas.clientHeight || 420;
    this.width = cssW;
    this.height = cssH;
    this.canvas.width = Math.floor(cssW * this.dpr);
    this.canvas.height = Math.floor(cssH * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  spawnParticles() {
    this.particles.length = 0;
    // Spawn particles in middle 90% of container (avoiding walls and floor)
    const marginX = this.width * 0.05; // 5% margin on each side
    const marginY = this.height * 0.05; // 5% margin on top and bottom
    const spawnXMin = marginX;
    const spawnXMax = this.width - marginX;
    const spawnYMin = marginY;
    const spawnYMax = this.height - marginY;
    for (let i = 0; i < this.params.N; i++) {
      this.particles.push(
        makeParticle(
          spawnXMin + Math.random() * (spawnXMax - spawnXMin),
          spawnYMin + Math.random() * (spawnYMax - spawnYMin),
          "mol"
        )
      );
    }
  }

  adjustParticleCount(targetN) {
    const n = Math.max(1, Math.min(500, Math.floor(targetN))); // Limit to 500
    this.params.N = n;
    // Remove extras
    while (this.particles.length > n) this.particles.pop();
    // Add new ones
    while (this.particles.length < n) {
      // Spawn particles in middle 90% of container (avoiding walls and floor)
      const marginX = this.width * 0.05; // 5% margin on each side
      const marginY = this.height * 0.05; // 5% margin on top and bottom
      const spawnXMin = marginX;
      const spawnXMax = this.width - marginX;
      const spawnYMin = marginY;
      const spawnYMax = this.height - marginY;
      const p = makeParticle(
        spawnXMin + Math.random() * (spawnXMax - spawnXMin),
        spawnYMin + Math.random() * (spawnYMax - spawnYMin),
        "mol"
      );
      // Slightly lower initial speeds for stability when adding
      p.vel[0] *= 0.5;
      p.vel[1] *= 0.5;
      this.particles.push(p);
    }
  }

  changeScenario(kind) {
    const def = scenarioDefaults(kind);
    this.params = { ...def, kT: this.params.kT };
    // Cap particle count at 500
    if (this.params.N > 500) this.params.N = 500;
    const previousScenario = this.currentScenario;
    this.currentScenario = kind; // Track scenario for history
    // If switching scenarios while heating, start a new trial at t=0 for the new scenario
    if (this.heatingOn && previousScenario !== kind) {
      this.gasStart = performance.now();
      this.escapedCount = 0;
      this.escapedParticles = []; // Clear escaped particles for new trial
      this.trialEnded = false;
    }
    this.spawnParticles();
  }

  // Periodic wrap
  wrap(p) {
    // disabled; using wall collisions instead
  }

  // Calculate overall IMF strength (0-1 scale) based on all IMF parameters
  // Returns 0 for hexane-like (weak IMFs) and 1 for honey-like (strong IMFs)
  // Used to interpolate behavior between hexane and honey
  getIMFStrength() {
    const v = this.params.viscosity || 0;
    const eps = this.params.epsilon || 0;
    const hb = this.params.hbStrength || 0;
    const dp = this.params.dipole || 0;

    // Normalize each component to 0-1 scale
    // Viscosity: 0.05-10 -> 0-1 (hexane ~0.05, honey ~10)
    const vNorm = Math.min(1, Math.max(0, (v - 0.05) / (10 - 0.05)));
    // Epsilon: 0.05-0.7 -> 0-1 (hexane ~0.05, honey ~0.7)
    const epsNorm = Math.min(1, Math.max(0, (eps - 0.05) / (0.7 - 0.05)));
    // H-bond: 0-3 -> 0-1 (hexane 0, honey ~2.5)
    const hbNorm = Math.min(1, Math.max(0, hb / 3));
    // Dipole: 0-2 -> 0-1 (hexane 0, DMSO ~0.6, honey 0)
    const dpNorm = Math.min(1, Math.max(0, dp / 2));

    // Weighted combination with emphasis on viscosity and H-bonds
    // Viscosity and H-bonds are most important for honey-like behavior
    const imfStrength =
      vNorm * 0.45 + hbNorm * 0.35 + dpNorm * 0.12 + epsNorm * 0.08;

    return Math.min(1, Math.max(0, imfStrength));
  }

  // Get interpolation factor: 0 = hexane behavior, 1 = honey behavior
  // Uses IMF strength to interpolate between hexane and honey characteristics
  getBehaviorInterpolation() {
    return this.getIMFStrength();
  }

  // Lennard–Jones force (soft-capped)
  ljForce(rVec) {
    const r = vLen(rVec) + 1e-9;
    const { sigma, epsilon } = this.params;
    // Use material-specific epsilon directly (from scenarioDefaults)
    // This ensures hexane gets very weak LDF (epsilon=0.05) while honey/DMSO get proper values
    const sr = sigma / r;
    const sr2 = sr * sr;
    const sr6 = sr2 * sr2 * sr2;
    const sr12 = sr6 * sr6;
    // F = 24*epsilon*(2*(sigma/r)^12 - (sigma/r)^6) * (1/r) * rhat
    let mag = 24 * epsilon * (2 * sr12 - sr6) * (1 / r);
    // Cutoff & smoothing - shorter range for weak LDFs (hexane)
    // For hexane (epsilon < 0.1), use shorter range to prevent excessive clustering
    const baseRCut = 2.5 * sigma;
    const rCut = epsilon < 0.1 ? 2.0 * sigma : baseRCut; // Shorter range for hexane
    if (r > rCut) mag = 0;
    // Soft clip
    mag = clamp(mag, -60, 60);
    return vMul(vNorm(rVec), -mag);
  }

  // Directional hydrogen-bond-like attraction: favor alignment (proxy)
  hbForce(rVec) {
    const r = vLen(rVec) + 1e-9;
    const E = this.params.hbStrength;
    if (E <= 0) return [0, 0];
    // Increase range for H-bonds - they should have longer reach than LJ
    // Use 2.8 * sigma for H-bonds (longer than LJ's 2.5 * sigma)
    const rCut = 2.8 * this.params.sigma;
    if (r > rCut) return [0, 0];
    const align = 1; // simple scalar; could read particle angles for more fidelity
    // Use gentler falloff: (1 - r/rCut)^0.7 instead of linear
    const falloff = Math.pow(Math.max(0, 1 - r / rCut), 0.7);
    // Force magnitude should be positive for attraction (pulling particles together)
    const f = E * align * falloff;
    return vMul(vNorm(rVec), f);
  }

  // Dipole–dipole proxy: short-range directional term (anti-parallel alignment)
  dipoleForce(rVec) {
    const r = vLen(rVec) + 1e-9;
    const D = this.params.dipole;
    if (D <= 0) return [0, 0];
    const rCut = 2.2 * this.params.sigma;
    if (r > rCut) return [0, 0];
    // Force magnitude should be positive for attraction (pulling particles together)
    const f = D * (1 / (r * r)) * Math.max(0.1, 1 - r / rCut);
    return vMul(vNorm(rVec), f);
  }

  computeForces(dt) {
    // Neighbor build
    this.grid.clear();
    for (let i = 0; i < this.particles.length; i++)
      this.grid.insert(this.particles[i]);
    const rMax = 28;
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].acc = [0, 0];
      this.particles[i].localNeighbors = 0;
    }
    for (let i = 0; i < this.particles.length; i++) {
      const a = this.particles[i];
      const ax = a.pos[0];
      const ay = a.pos[1];
      const densityCut = 2.4 * this.params.sigma;
      this.grid.forNeighbors(ax, ay, rMax, (b) => {
        if (a === b) return;
        let dx = b.pos[0] - ax;
        let dy = b.pos[1] - ay;
        const distSq = dx * dx + dy * dy; // Squared distance for comparison
        const densityCutSq = (2.4 * this.params.sigma) ** 2; // Squared for comparison
        if (distSq < densityCutSq) a.localNeighbors++;

        // Only compute actual distance when needed for force calculations
        const rVec = [dx, dy];

        // Strengthen liquid-liquid interactions, weaken gas interactions
        const bothLiquid = a.state === "liquid" && b.state === "liquid";
        const gasScale = a.state === "gas" || b.state === "gas" ? 0.2 : 1.0;
        const liquidCohesionBoost = bothLiquid ? 1.3 : 1.0; // 30% stronger for liquid-liquid

        // Early exit: skip force calculations if all coefficients are zero
        const cohLJ = (this.params.cohLJ || 1) * liquidCohesionBoost;
        const cohHB = (this.params.cohHB || 1) * liquidCohesionBoost;
        const cohDP = this.params.cohDP || 1;

        if (cohLJ === 0 && cohHB === 0 && cohDP === 0) return; // Skip this neighbor

        const fLJ = vMul(this.ljForce(rVec), cohLJ);
        const fHB = cohHB !== 0 ? vMul(this.hbForce(rVec), cohHB) : [0, 0];
        const fDP = cohDP !== 0 ? vMul(this.dipoleForce(rVec), cohDP) : [0, 0];
        const f = vAdd(
          vAdd(vMul(fLJ, gasScale), vMul(fHB, gasScale)),
          vMul(fDP, gasScale)
        );
        a.acc = vAdd(a.acc, f);
      });
    }
    // Drag + thermostat
    const gamma = 0.3; // fixed moderate drag for stability
    const kT = Math.max(0, this.params.kT || 0);
    const kickSigma = Math.sqrt(2 * gamma * kT);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.acc[0] += -gamma * p.vel[0] + randNorm() * kickSigma;
      p.acc[1] += -gamma * p.vel[1] + randNorm() * kickSigma;
    }
    // Gentle velocity rescale toward target KE every ~0.5s
    // Skip dense liquid particles to preserve blob structure
    const nowT = performance.now();
    if (!this.lastThermoMs) this.lastThermoMs = nowT;
    if (nowT - this.lastThermoMs > 500) {
      let keSum = 0;
      let count = 0;
      const rhoMin = 3; // Same threshold as state transitions

      // Only consider non-dense particles for thermostat
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        // Skip particles in dense liquid blob (they maintain their own dynamics)
        if (p.localNeighbors < rhoMin || p.state === "gas") {
          keSum +=
            0.5 * (p.mass || 1) * (p.vel[0] * p.vel[0] + p.vel[1] * p.vel[1]);
          count++;
        }
      }

      if (count > 0) {
        const keAvg = keSum / count;
        const keTarget = 40 * (kT + 0.05);
        const s = Math.max(
          0.9,
          Math.min(
            1.1,
            Math.sqrt(Math.max(1e-6, keTarget / Math.max(1e-6, keAvg)))
          )
        );
        if (Math.abs(s - 1) > 0.02) {
          // Only rescale non-dense particles
          for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (p.localNeighbors < rhoMin || p.state === "gas") {
              p.vel[0] *= s;
              p.vel[1] *= s;
            }
          }
        }
      }
      this.lastThermoMs = nowT;
    }
  }

  step(dt) {
    let substeps = 1;
    if (this.gravityOn) {
      let maxSpeedSq = 0;
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const spSq = p.vel[0] * p.vel[0] + p.vel[1] * p.vel[1];
        if (spSq > maxSpeedSq) maxSpeedSq = spSq;
      }
      const maxSpeed = Math.sqrt(maxSpeedSq);
      const minR = 0.5 * (this.particles[0]?.radius || 4.5);
      const safeDisp = Math.max(2, minR); // pixels
      substeps = Math.min(
        12,
        Math.max(2, Math.ceil((maxSpeed * dt) / safeDisp))
      );
    }
    const dtStep = dt / substeps;
    for (let s = 0; s < substeps; s++) {
      // Forces
      this.computeForces(dtStep);
      // Gravity
      if (this.gravityOn) {
        const g = 900;
        for (let i = 0; i < this.particles.length; i++)
          this.particles[i].acc[1] += g;
      }
      // Heating (bottom 5% of container with gradient - stovetop simulation)
      if (this.heatingOn) {
        const aH = this.heatAccel;
        const heatingZoneHeight = this.height * 0.05; // bottom 5% of container
        const heatingZoneTop = this.height - heatingZoneHeight;
        const minHeatIntensity = 0.2; // 20% heat at the 5% mark (top of heating zone)
        // Thermal gain rate: hexane heats faster (3x), honey heats slower (1x)
        // Interpolate based on IMF strength for playground mode
        const baseThermalGainRate = 0.03; // Base rate per second
        let thermalGainMultiplier = 1.0;
        if (this.currentScenario === "playground") {
          // Interpolate between hexane (3.0x) and honey (1.0x) based on IMF strength
          const t = this.getBehaviorInterpolation(); // 0 = hexane, 1 = honey
          thermalGainMultiplier = 3.0 - (3.0 - 1.0) * t; // 3.0 at t=0, 1.0 at t=1
        } else {
          // Use material-specific behavior
          const isHexane = (this.params.viscosity || 0) < 0.1;
          thermalGainMultiplier = isHexane ? 3.0 : 1.0;
        }
        const thermalGainRate =
          baseThermalGainRate * thermalGainMultiplier * this.heatIntensity; // Scale by heat intensity
        const thermalDissipationRate = 0.015; // Rate per second for dissipation

        // Create non-uniform heating pattern along X-axis (hotspots like real stovetop)
        // Use multiple hotspots with varying intensities
        const hotspotCount = 3; // Number of hotspots
        const hotspotSpacing = this.width / (hotspotCount + 1);

        for (let i = 0; i < this.particles.length; i++) {
          const p = this.particles[i];
          // Ensure thermalEnergy is initialized
          if (p.thermalEnergy === undefined) p.thermalEnergy = 0;

          const r = p.radius || 4.5;
          const particleBottom = p.pos[1] + r; // bottom edge of particle
          const particleX = p.pos[0]; // X position for hotspot calculation

          // Only heat particles in the bottom 5% of container
          if (particleBottom >= heatingZoneTop) {
            // Calculate normalized position in heating zone (0 = very bottom, 1 = 5% mark)
            const distFromBottom = this.height - particleBottom;
            const normalizedDist = Math.max(
              0,
              Math.min(1, distFromBottom / heatingZoneHeight)
            );

            // Vertical gradient: 100% heat at bottom, minHeatIntensity at 5% mark
            const verticalIntensity =
              1.0 - normalizedDist * (1.0 - minHeatIntensity);

            // Calculate horizontal hotspot intensity (non-uniform along X-axis)
            // Use smooth falloff to reduce visual artifacts
            let horizontalIntensity = 0.3; // Base intensity (minimum)
            let totalHotspotContribution = 0;
            let weightedStrength = 0;

            // Check distance to each hotspot and accumulate contributions smoothly
            for (let h = 0; h < hotspotCount; h++) {
              const hotspotX = hotspotSpacing * (h + 1);
              const distToHotspot = Math.abs(particleX - hotspotX);
              const hotspotRadius = this.width * 0.15; // Hotspot influence radius

              // Smooth exponential falloff (squared for smoother transition)
              const normalizedDist = distToHotspot / hotspotRadius;
              const hotspotIntensity = Math.max(
                0,
                Math.pow(1.0 - Math.min(1.0, normalizedDist), 2)
              );

              if (hotspotIntensity > 0) {
                const hotspotStrengths = [1.0, 0.85, 0.7];
                const hotspotStrength = hotspotStrengths[h] || 1.0;
                totalHotspotContribution += hotspotIntensity;
                weightedStrength += hotspotIntensity * hotspotStrength;
              }
            }

            // Blend hotspot contributions smoothly
            const avgHotspotStrength =
              totalHotspotContribution > 0
                ? weightedStrength / totalHotspotContribution
                : 0.7; // Default if no hotspots

            // Combine horizontal and vertical intensity with smooth blending
            horizontalIntensity =
              0.3 + totalHotspotContribution * 0.7 * avgHotspotStrength;
            const heatIntensity = verticalIntensity * horizontalIntensity;

            // Accumulate thermal energy based on heat intensity
            // Scale by dtStep to make it frame-rate independent (rate per second)
            const thermalGain = thermalGainRate * heatIntensity * dtStep;
            p.thermalEnergy = Math.min(
              1.0,
              (p.thermalEnergy || 0) + thermalGain
            );

            // Add upward acceleration for heated particles (buoyancy effect)
            // Heated particles naturally want to rise - use acceleration to overcome gravity
            // Thermal energy provides upward force that opposes gravity
            // Scale upward velocity based on IMF strength - stronger IMFs reduce upward velocity
            const imfStrength = this.getIMFStrength();
            const upwardAccelBase = -2000; // Base upward acceleration
            // Stronger IMFs reduce upward acceleration (0.3 to 1.0 multiplier)
            const upwardAccelMultiplier = 0.3 + (1.0 - imfStrength) * 0.7;
            const upwardAccel =
              p.thermalEnergy * upwardAccelBase * upwardAccelMultiplier;
            p.acc[1] += upwardAccel;

            // Also add some direct upward velocity boost for immediate effect
            if (p.thermalEnergy > 0.2) {
              const upwardVelocityBoostBase = -40; // Base upward velocity boost
              const upwardVelocityBoost =
                p.thermalEnergy *
                upwardVelocityBoostBase *
                upwardAccelMultiplier;
              p.vel[1] += upwardVelocityBoost * dtStep;
            }

            // Add vibration: particles with high thermal energy vibrate more
            // This helps them break free from cohesive forces
            // Increased strength for visibility - vibration scales with thermal energy
            const vibrationStrength = p.thermalEnergy * 120; // Increased from 30 for visibility
            const vibrationX = (Math.random() - 0.5) * vibrationStrength;
            const vibrationY = (Math.random() - 0.5) * vibrationStrength;
            p.acc[0] += vibrationX;
            p.acc[1] += vibrationY;

            // Apply heating scaled by intensity
            const scaledAccel = aH * heatIntensity;
            const vx = p.vel[0],
              vy = p.vel[1];
            const sp = Math.hypot(vx, vy);
            if (sp > 1e-3) {
              p.acc[0] += (vx / sp) * scaledAccel;
              p.acc[1] += (vy / sp) * scaledAccel;
            } else {
              const ang = Math.random() * Math.PI * 2;
              p.acc[0] += Math.cos(ang) * scaledAccel;
              p.acc[1] += Math.sin(ang) * scaledAccel;
            }
          } else {
            // Dissipate thermal energy when not in heating zone
            // Scale by dtStep to make it frame-rate independent
            p.thermalEnergy = Math.max(
              0,
              (p.thermalEnergy || 0) - thermalDissipationRate * dtStep
            );
            // Particles with thermal energy still vibrate (they carry heat with them)
            if (p.thermalEnergy > 0.1) {
              // Add upward acceleration for particles carrying thermal energy
              // Scale upward velocity based on IMF strength - stronger IMFs reduce upward velocity
              const imfStrength = this.getIMFStrength();
              const upwardAccelBase = -1800; // Base upward acceleration (slightly less than in heating zone)
              const upwardAccelMultiplier = 0.3 + (1.0 - imfStrength) * 0.7;
              const upwardAccel =
                p.thermalEnergy * upwardAccelBase * upwardAccelMultiplier;
              p.acc[1] += upwardAccel;

              // Also add upward velocity boost for immediate effect
              if (p.thermalEnergy > 0.2) {
                const upwardVelocityBoostBase = -35;
                const upwardVelocityBoost =
                  p.thermalEnergy *
                  upwardVelocityBoostBase *
                  upwardAccelMultiplier;
                p.vel[1] += upwardVelocityBoost * dtStep;
              }

              const vibrationStrength = p.thermalEnergy * 80; // Increased from 20 for visibility
              const vibrationX = (Math.random() - 0.5) * vibrationStrength;
              const vibrationY = (Math.random() - 0.5) * vibrationStrength;
              p.acc[0] += vibrationX;
              p.acc[1] += vibrationY;
            }
          }
        }
      } else {
        // When heating is off, gradually dissipate thermal energy
        // Skip if no particles have thermal energy
        const thermalDissipationRate = 0.02; // Rate per second (matches heating dissipation)
        for (let i = 0; i < this.particles.length; i++) {
          const p = this.particles[i];
          const thermalEnergy = p.thermalEnergy || 0;
          // Early exit: skip particles with no thermal energy
          if (thermalEnergy <= 0) continue;
          p.thermalEnergy = Math.max(
            0,
            thermalEnergy - thermalDissipationRate * dtStep
          );
        }
      }
      // Buoyancy (reduced for more realistic behavior)
      if (this.gravityOn) {
        for (let i = 0; i < this.particles.length; i++) {
          const p = this.particles[i];
          if (p.state === "gas") p.acc[1] -= 300; // Reduced from 600
        }
        // Add floor attraction for liquid particles to resist evaporation
        // Stronger attraction for higher viscosity materials
        const v = this.params.viscosity || 0;
        const floorAttractionStrength = v > 5 ? 200 : v > 1 ? 100 : 20; // Honey: 200, DMSO: 100, Hexane: 20
        const floorY = this.height;
        for (let i = 0; i < this.particles.length; i++) {
          const p = this.particles[i];
          if (p.state === "liquid") {
            const distFromFloor = floorY - (p.pos[1] + (p.radius || 4.5));
            if (distFromFloor > 0 && distFromFloor < 50) {
              // Attraction decreases with distance, strongest near floor
              const attractionFactor = 1.0 - distFromFloor / 50;
              p.acc[1] += floorAttractionStrength * attractionFactor;
            }
          }
        }
      }
      // Integrate (iterate backwards to safely remove particles)
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.vel[0] += (p.acc[0] / p.mass) * dtStep;
        p.vel[1] += (p.acc[1] / p.mass) * dtStep;
        p.pos[0] += p.vel[0] * dtStep;
        p.pos[1] += p.vel[1] * dtStep;

        // Add direct velocity vibration for heated particles (more visible)
        // This creates the jittery vibration effect
        const thermalEnergy = p.thermalEnergy || 0;
        if (thermalEnergy > 0.1) {
          // Frame-independent vibration - scales with thermal energy
          const vibVelStrength = thermalEnergy * 8; // Velocity units per frame
          p.vel[0] += (Math.random() - 0.5) * vibVelStrength;
          p.vel[1] += (Math.random() - 0.5) * vibVelStrength;
        }

        this.handleWalls(p);
      }
      // Collisions iterations (reduced to 1 with aggressive resolution and grid reuse)
      // Build grid once and reuse across iterations (if multiple iterations needed)
      let particleIndexMap = null;
      for (let it = 0; it < 1; it++) {
        particleIndexMap = this.resolveCollisions(it > 0, particleIndexMap);
        // Re-clamp particles to walls after collision resolution
        // (collision resolution can push particles outside bounds)
        // Iterate backwards to safely remove particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
          this.handleWalls(this.particles[i]);
        }
      }
      // State update - boiling behavior with thermal energy and hysteresis
      const epsBase = 0.15 + 0.25 * (this.params.viscosity || 0);
      const c1 = 120,
        c2 = 10;
      const rhoMin = 3;
      const nowS = performance.now();
      const minStateDuration = 300; // Minimum time in state before transitioning (ms)

      // Higher energy threshold for escaping dense liquid (boiling)
      // Viscosity makes it harder to evaporate - scale threshold with viscosity
      // Stronger intermolecular forces (via cohesion coefficients) naturally reduce evaporation
      let escapeMultiplier, thermalBoilingThreshold;

      if (this.currentScenario === "playground") {
        // Interpolate between hexane and honey behavior based on IMF strength
        const t = this.getBehaviorInterpolation(); // 0 = hexane, 1 = honey
        // Escape multiplier: hexane (1.505) -> honey (4.0)
        escapeMultiplier = 1.505 + (4.0 - 1.505) * t;
        // Thermal threshold: hexane (0.26) -> honey (0.85)
        thermalBoilingThreshold = 0.26 + (0.85 - 0.26) * t;
      } else {
        // Use material-specific behavior
        const v = this.params.viscosity || 0;
        // Better separation: DMSO should be significantly harder to evaporate than hexane
        escapeMultiplier =
          v > 5
            ? 1.5 + (v - 5) * 0.5 // Honey: 4.0
            : v > 1
            ? 1.5 + (v - 0.05) * 0.9 // DMSO: 1.5 + 1.15*0.9 = 2.535 (increased from 1.62)
            : 1.5 + v * 0.1; // Hexane: 1.505
        // Map viscosity to thermal threshold [0,1]: honey (10) -> 0.85, DMSO (1.2) -> 0.6, hexane (0.05) -> 0.26
        // Piecewise: low v uses linear, high v uses slower scaling
        thermalBoilingThreshold =
          v <= 2
            ? Math.min(0.95, 0.25 + v * 0.29) // DMSO: 0.25 + 1.2*0.29 = 0.598, Hexane: 0.25 + 0.05*0.29 = 0.2645
            : Math.min(0.95, 0.5 + (v - 2) * 0.04375); // Honey: 0.5 + 8*0.04375 = 0.85
      }

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const v2 = p.vel[0] * p.vel[0] + p.vel[1] * p.vel[1];
        const vGas2 = c1 * (this.params.kT || 0) + c2 * epsBase;
        const thermalEnergy = p.thermalEnergy || 0;
        const timeSinceStateChange = nowS - (p.lastStateChange || 0);

        if (p.state === "liquid") {
          // Require minimum time in liquid state before transitioning
          // But allow very hot particles to transition faster
          const hotParticle = thermalEnergy > 0.7;
          const effectiveMinDuration = hotParticle
            ? minStateDuration * 0.5
            : minStateDuration;
          if (timeSinceStateChange < effectiveMinDuration) continue;

          // Boiling: Need both high thermal energy AND high kinetic energy
          // Surface particles can evaporate more easily
          if (p.localNeighbors < rhoMin) {
            // Surface/edge particles: material-dependent evaporation threshold
            let surfaceMultiplier, surfaceThermalThreshold;

            if (this.currentScenario === "playground") {
              // Interpolate between hexane and honey behavior based on IMF strength
              const t = this.getBehaviorInterpolation(); // 0 = hexane, 1 = honey
              // Surface multiplier: hexane (0.7) -> honey (1.8)
              surfaceMultiplier = 0.7 + (1.8 - 0.7) * t;
              // Surface thermal threshold: hexane (0.1275) -> honey (0.8)
              surfaceThermalThreshold = 0.1275 + (0.8 - 0.1275) * t;
            } else {
              // Use material-specific behavior
              const v = this.params.viscosity || 0;
              // Honey needs highest threshold, DMSO needs moderate-high, hexane needs lowest
              surfaceMultiplier =
                v > 5
                  ? 1.8 // Honey: 1.8
                  : v > 1
                  ? 1.5 // DMSO: 1.5 (increased from 1.2)
                  : 0.7; // Hexane: 0.7 (reduced from 0.8 for faster evaporation)
              // Surface thermal threshold: DMSO needs significantly more thermal energy than hexane
              surfaceThermalThreshold =
                v > 5
                  ? 0.4 + (v - 2) * 0.05 // Honey: 0.8
                  : v > 1
                  ? 0.2 + v * 0.3 // DMSO: 0.2 + 1.2*0.3 = 0.56 (increased from 0.39)
                  : 0.12 + v * 0.15; // Hexane: 0.12 + 0.05*0.15 = 0.1275 (reduced from 0.16)
            }
            const surfaceThreshold = vGas2 * surfaceMultiplier;
            if (
              v2 > surfaceThreshold &&
              thermalEnergy > surfaceThermalThreshold
            ) {
              p.state = "gas";
              p.gasUntil = nowS + 1500;
              p.lastStateChange = nowS;
              // Give upward boost to help escape - scale by IMF strength
              const imfStrength = this.getIMFStrength();
              const upwardBoostBase = -60; // Base upward boost
              // Stronger IMFs reduce upward boost (0.3 to 1.0 multiplier)
              const upwardBoostMultiplier = 0.3 + (1.0 - imfStrength) * 0.7;
              const upwardBoost = upwardBoostBase * upwardBoostMultiplier;
              if (p.vel[1] < 50) {
                p.vel[1] += upwardBoost;
              }
            }
          } else {
            // Dense liquid particles: need thermal energy + high kinetic energy to boil
            // Make kinetic energy threshold scale with thermal energy - hotter particles boil easier
            const baseEscapeThreshold = vGas2 * escapeMultiplier;
            // When thermal energy is high, reduce kinetic energy requirement
            const thermalBonus = thermalEnergy * 0.5; // Increased from 0.4 - up to 50% reduction
            const escapeThreshold = baseEscapeThreshold * (1.0 - thermalBonus);

            // Very hot particles can boil with lower kinetic energy
            const veryHotBonus = thermalEnergy > 0.7 ? 0.2 : 0; // Extra 20% reduction for very hot
            const finalThreshold = escapeThreshold * (1.0 - veryHotBonus);

            // Boiling requires accumulated thermal energy from heating
            if (
              v2 > finalThreshold &&
              thermalEnergy > thermalBoilingThreshold
            ) {
              p.state = "gas";
              p.gasUntil = nowS + 2000;
              p.lastStateChange = nowS;
              // Give upward boost to help escape the liquid blob - scale by IMF strength
              const imfStrength = this.getIMFStrength();
              const upwardBoostBase = -80; // Base upward boost for boiling
              // Stronger IMFs reduce upward boost (0.3 to 1.0 multiplier)
              const upwardBoostMultiplier = 0.3 + (1.0 - imfStrength) * 0.7;
              const upwardBoost = upwardBoostBase * upwardBoostMultiplier;
              if (p.vel[1] < 50) {
                p.vel[1] += upwardBoost;
              }
            }
          }
        } else {
          // Gas particles: condense when they cool down
          // Require minimum time in gas state before transitioning back
          if (timeSinceStateChange < minStateDuration) continue;

          const isRising = p.vel[1] < -10; // Moving upward significantly
          const isNearTop = p.pos[1] < this.height * 0.2; // Top 20% of container

          // Condensation thresholds (hysteresis - harder to condense than evaporate)
          const condenseThreshold = isRising ? 0.3 * vGas2 : 0.5 * vGas2;
          const thermalCondenseThreshold = 0.2; // Cool down before condensing

          // Condense if: low energy, low thermal energy, high density (not rising), or reached top
          if (
            (v2 < condenseThreshold &&
              thermalEnergy < thermalCondenseThreshold &&
              !isRising) ||
            (isNearTop &&
              thermalEnergy < thermalCondenseThreshold &&
              v2 < 0.8 * vGas2) ||
            (p.localNeighbors >= rhoMin &&
              !isRising &&
              thermalEnergy < thermalCondenseThreshold)
          ) {
            p.state = "liquid";
            p.lastStateChange = nowS;
            // Reset thermal energy when condensing (unless still in heating zone)
            if (p.pos[1] + p.radius < this.height * 0.9) {
              p.thermalEnergy = Math.max(0, thermalEnergy * 0.5); // Reduce but don't fully reset
            }
          }
        }
      }
      // Update gas count after state transitions
      this.gasCount = 0;
      for (let i = 0; i < this.particles.length; i++) {
        if (this.particles[i].state === "gas") {
          this.gasCount++;
        }
      }
    }
  }

  handleWalls(p) {
    const w = this.width;
    const h = this.height;
    const r = p.radius || 4.5;
    const e = 0.2; // restitution
    const fx = 0.98; // floor friction
    if (p.pos[0] < r) {
      p.pos[0] = r;
      p.vel[0] = -p.vel[0] * e;
    }
    if (p.pos[0] > w - r) {
      p.pos[0] = w - r;
      p.vel[0] = -p.vel[0] * e;
    }
    // Remove particles that hit the top of the container
    if (p.pos[1] < r) {
      const index = this.particles.indexOf(p);
      if (index !== -1) {
        // Store escaped particle info before removing
        this.escapedParticles.push({
          pos: [p.pos[0], p.pos[1]],
          radius: p.radius || 4.5,
          state: p.state,
          thermalEnergy: p.thermalEnergy || 0,
          scenario: this.currentScenario,
        });
        this.particles.splice(index, 1);
        this.escapedCount++; // Increment escaped count
      }
      return; // Particle removed, don't process further
    }
    if (p.pos[1] > h - r) {
      p.pos[1] = h - r;
      p.vel[1] = -p.vel[1] * e;
      p.vel[0] *= fx;
    }
  }

  resolveCollisions(reuseGrid = false, particleIndexMap = null) {
    const rMax = 18; // Optimized for particles (radius 4.5) - ~4x radius for collision detection
    // Only rebuild grid if not reusing
    if (!reuseGrid) {
      this.grid.clear();
      // Cache particle indices for O(1) lookup
      particleIndexMap = new Map();
      for (let i = 0; i < this.particles.length; i++) {
        this.grid.insert(this.particles[i]);
        particleIndexMap.set(this.particles[i], i);
      }
    }
    const e = 0.2; // restitution
    const mu = 0.3; // friction coefficient
    const processed = new Set(); // Track processed pairs to avoid double-counting
    for (let i = 0; i < this.particles.length; i++) {
      const a = this.particles[i];
      const ax = a.pos[0];
      const ay = a.pos[1];
      this.grid.forNeighbors(ax, ay, rMax, (b) => {
        if (a === b) return;
        // O(1) lookup instead of O(n) search
        const j = particleIndexMap.get(b);
        if (j === undefined || j < 0) return; // Safety check
        // Avoid processing same pair twice (always use smaller index first)
        const pairKey = i < j ? `${i},${j}` : `${j},${i}`;
        if (processed.has(pairKey)) return;
        processed.add(pairKey);
        let dx = b.pos[0] - ax;
        let dy = b.pos[1] - ay;
        const distSq = dx * dx + dy * dy; // Squared distance for comparison
        const minDist = (a.radius || 4.5) + (b.radius || 4.5);
        const minDistSq = minDist * minDist;
        if (distSq < minDistSq) {
          const dist = Math.sqrt(distSq) || 1e-9;
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;
          // Aggressive resolution: add small overshoot (1.05x) to ensure separation
          const resolvedOverlap = overlap * 1.05;
          // position correction (split, but fully resolve per iteration)
          const invMa = 1 / (a.mass || 1);
          const invMb = 1 / (b.mass || 1);
          const invSum = invMa + invMb;
          let moveA = resolvedOverlap * (invMa / Math.max(1e-9, invSum));
          let moveB = resolvedOverlap * (invMb / Math.max(1e-9, invSum));
          // Shock propagation against floor: favor moving the non-grounded body
          const rA = a.radius || 4.5;
          const rB = b.radius || 4.5;
          const groundedA = a.pos[1] >= this.height - rA - 0.6;
          const groundedB = b.pos[1] >= this.height - rB - 0.6;
          // If pushing B further into floor (ny>0), don't move B; move A fully
          if (!groundedA && groundedB && ny > 0) {
            moveA = resolvedOverlap;
            moveB = 0;
          }
          // If pushing A into floor (ny<0), don't move A; move B fully
          if (groundedA && !groundedB && ny < 0) {
            moveB = resolvedOverlap;
            moveA = 0;
          }
          a.pos[0] -= nx * moveA;
          a.pos[1] -= ny * moveA;
          b.pos[0] += nx * moveB;
          b.pos[1] += ny * moveB;
          // Safety check: ensure minimum separation is maintained (handle floating point errors)
          const dx2 = b.pos[0] - a.pos[0];
          const dy2 = b.pos[1] - a.pos[1];
          const dist2Sq = dx2 * dx2 + dy2 * dy2;
          const minDistSqCheck = minDistSq * 0.99 * 0.99; // Squared for comparison
          if (dist2Sq < minDistSqCheck) {
            // Still overlapping, apply additional correction
            const dist2 = Math.sqrt(dist2Sq) || 1e-9;
            const overlap2 = minDist - dist2;
            const nx2 = dx2 / dist2;
            const ny2 = dy2 / dist2;
            a.pos[0] -= nx2 * overlap2 * 0.5;
            a.pos[1] -= ny2 * overlap2 * 0.5;
            b.pos[0] += nx2 * overlap2 * 0.5;
            b.pos[1] += ny2 * overlap2 * 0.5;
          }
          // velocity impulse along normal
          const rvx = b.vel[0] - a.vel[0];
          const rvy = b.vel[1] - a.vel[1];
          const vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            const j = (-(1 + e) * vn) / (1 / (a.mass || 1) + 1 / (b.mass || 1));
            const jx = j * nx;
            const jy = j * ny;
            a.vel[0] -= jx / (a.mass || 1);
            a.vel[1] -= jy / (a.mass || 1);
            b.vel[0] += jx / (b.mass || 1);
            b.vel[1] += jy / (b.mass || 1);
            // friction impulse along tangent
            const rvx2 = b.vel[0] - a.vel[0];
            const rvy2 = b.vel[1] - a.vel[1];
            // tangent = rv - (rv·n) n
            let tx = rvx2 - (rvx2 * nx + rvy2 * ny) * nx;
            let ty = rvy2 - (rvx2 * nx + rvy2 * ny) * ny;
            const tlSq = tx * tx + ty * ty; // Squared tangent length
            if (tlSq > 1e-12) {
              // Compare squared value
              const tl = Math.sqrt(tlSq);
              tx /= tl;
              ty /= tl;
              const jt = -mu * Math.abs(j);
              const jtx = jt * tx;
              const jty = jt * ty;
              a.vel[0] -= jtx / (a.mass || 1);
              a.vel[1] -= jty / (a.mass || 1);
              b.vel[0] += jtx / (b.mass || 1);
              b.vel[1] += jty / (b.mass || 1);
            }
            // Thermal conduction: transfer kinetic energy between particles
            // After collision, transfer a fraction of energy difference to simulate heat flow
            const ma = a.mass || 1;
            const mb = b.mass || 1;
            const keA = 0.5 * ma * (a.vel[0] * a.vel[0] + a.vel[1] * a.vel[1]);
            const keB = 0.5 * mb * (b.vel[0] * b.vel[0] + b.vel[1] * b.vel[1]);
            const keTotal = keA + keB;

            // Transfer coefficient: fraction of energy difference transferred per collision
            const transferCoeff = 0.15;
            const keDiff = keA - keB;
            const dE = transferCoeff * keDiff;

            // Only transfer if there's a meaningful energy difference and total KE is positive
            if (Math.abs(dE) > 0.1 && keTotal > 0.5) {
              const newKeA = Math.max(0.5, keA - dE);
              const newKeB = Math.max(0.5, keB + dE);

              // Calculate velocity magnitudes using squared values
              const vMagASq = a.vel[0] * a.vel[0] + a.vel[1] * a.vel[1];
              const vMagBSq = b.vel[0] * b.vel[0] + b.vel[1] * b.vel[1];

              if (vMagASq > 1e-12 && vMagBSq > 1e-12) {
                // Scale velocities to achieve target kinetic energies
                // This preserves direction while transferring energy
                const vMagA = Math.sqrt(vMagASq);
                const vMagB = Math.sqrt(vMagBSq);
                const scaleA = Math.sqrt((2 * newKeA) / (ma * vMagASq));
                const scaleB = Math.sqrt((2 * newKeB) / (mb * vMagBSq));

                // Apply scaling (small adjustments preserve momentum approximately)
                a.vel[0] *= scaleA;
                a.vel[1] *= scaleA;
                b.vel[0] *= scaleB;
                b.vel[1] *= scaleB;
              }
            }
          }
        }
      });
    }
    return particleIndexMap;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);
    // Background
    // Prefer canvas-computed background (works inside Shadow DOM), fallback to var or dark
    const bgFromCanvas = getComputedStyle(this.canvas).backgroundColor;
    ctx.fillStyle =
      (bgFromCanvas && bgFromCanvas !== "rgba(0, 0, 0, 0)" && bgFromCanvas) ||
      getComputedStyle(document.body).getPropertyValue("--panel") ||
      "#0c121d";
    ctx.fillRect(0, 0, w, h);

    // Bottom heat source visual indicator (stovetop - bottom 10% with hotspots)
    if (this.heatingOn) {
      const gradientHeight = this.height * 0.1; // bottom 10% of container
      const hotspotCount = 3;
      const hotspotSpacing = w / (hotspotCount + 1);
      const hotspotStrengths = [1.0, 0.85, 0.7];

      // Draw hotspot pattern
      for (let hotspotIdx = 0; hotspotIdx < hotspotCount; hotspotIdx++) {
        const hotspotX = hotspotSpacing * (hotspotIdx + 1);
        const hotspotRadius = w * 0.15;
        const hotspotStrength = hotspotStrengths[hotspotIdx];

        // Create radial gradient for each hotspot
        const hotspotGradient = ctx.createRadialGradient(
          hotspotX,
          h,
          0, // center
          hotspotX,
          h,
          hotspotRadius // outer radius
        );

        // Base intensity scaled by hotspot strength
        const maxIntensity = 0.5 * hotspotStrength;
        hotspotGradient.addColorStop(0, `rgba(255, 100, 0, ${maxIntensity})`);
        hotspotGradient.addColorStop(
          0.5,
          `rgba(255, 100, 0, ${maxIntensity * 0.6})`
        );
        hotspotGradient.addColorStop(1, "rgba(255, 100, 0, 0)");

        // Draw vertical gradient overlay for each hotspot
        const verticalGradient = ctx.createLinearGradient(
          0,
          h - gradientHeight,
          0,
          h
        );
        verticalGradient.addColorStop(0, "rgba(255, 100, 0, 0)");
        verticalGradient.addColorStop(
          0.5,
          `rgba(255, 100, 0, ${maxIntensity * 0.3})`
        );
        verticalGradient.addColorStop(1, `rgba(255, 100, 0, ${maxIntensity})`);

        // Draw hotspot area
        ctx.fillStyle = hotspotGradient;
        ctx.beginPath();
        ctx.arc(hotspotX, h, hotspotRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw vertical gradient overlay
        ctx.fillStyle = verticalGradient;
        ctx.fillRect(
          hotspotX - hotspotRadius,
          h - gradientHeight,
          hotspotRadius * 2,
          gradientHeight
        );
      }

      // Add subtle base heating across entire bottom
      const baseGradient = ctx.createLinearGradient(
        0,
        h - gradientHeight,
        0,
        h
      );
      baseGradient.addColorStop(0, "rgba(255, 100, 0, 0)");
      baseGradient.addColorStop(0.7, "rgba(255, 100, 0, 0.1)");
      baseGradient.addColorStop(1, "rgba(255, 100, 0, 0.2)");
      ctx.fillStyle = baseGradient;
      ctx.fillRect(0, h - gradientHeight, w, gradientHeight);
    }

    // Particles (solid spheres) with temperature-based coloring
    const base = this.params.color || "#5ac8fa";
    // Warm colors for gas particles and heated particles (red/orange)
    const warmColor = "#ff6b35";
    // Cool colors for liquid particles (use base color)
    const coolColor = base;

    // Helper function to interpolate between two hex colors
    function lerpColor(color1, color2, t) {
      const c1 = parseInt(color1.slice(1), 16);
      const c2 = parseInt(color2.slice(1), 16);
      const r1 = (c1 >> 16) & 255;
      const g1 = (c1 >> 8) & 255;
      const b1 = c1 & 255;
      const r2 = (c2 >> 16) & 255;
      const g2 = (c2 >> 8) & 255;
      const b2 = c2 & 255;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r}, ${g}, ${b})`;
    }

    // Draw particles - after 30s, only show escaped particles
    if (this.moleculesVisible) {
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 1;

      const particlesToDraw = this.trialEnded
        ? this.escapedParticles.filter(
            (ep) => ep.scenario === this.currentScenario
          )
        : this.particles;

      for (let i = 0; i < particlesToDraw.length; i++) {
        const p = particlesToDraw[i];
        const r = p.radius || 4.5;
        const thermalEnergy = p.thermalEnergy || 0;
        const pos = p.pos; // Both regular and escaped particles have pos array

        // Color based on particle state and thermal energy
        if (p.state === "gas") {
          ctx.fillStyle = warmColor;
        } else {
          // Interpolate between cool and warm based on thermal energy
          // Liquid particles become orange as they heat up
          const colorT = Math.min(1.0, thermalEnergy * 1.5); // Scale thermal energy for color
          ctx.fillStyle = lerpColor(coolColor, warmColor, colorT);
        }

        ctx.beginPath();
        ctx.arc(pos[0], pos[1], r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Show splash text and restart button after trial ends
      if (this.trialEnded) {
        const totalParticles = this.params.N || 200;
        const escapePercentage = (
          (this.escapedCount / totalParticles) *
          100
        ).toFixed(1);

        // Semi-transparent overlay
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "#111827";
        ctx.font = "bold 20px system-ui, -apple-system, Segoe UI, Roboto";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const splashText1 = "Trial Complete (30s)";
        const splashText2 = `${this.escapedCount} of ${totalParticles} particles escaped`;
        const splashText3 = `${escapePercentage}% became gaseous`;
        const splashText4 = "Simulation stopped";

        ctx.fillText(splashText1, w / 2, h / 2 - 60);
        ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto";
        ctx.fillText(splashText2, w / 2, h / 2 - 30);
        ctx.fillText(splashText3, w / 2, h / 2 - 10);
        ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
        ctx.fillStyle = "#6b7280";
        ctx.fillText(splashText4, w / 2, h / 2 + 15);

        // Draw restart button (only in normal mode, not playground)
        // In playground mode, celebration/sadness is shown via checkPlaygroundGoal
        if (this.currentScenario !== "playground") {
          // Check if all 3 trials have been completed
          const allTrialsCompleted = this.completedTrials.size >= 3;
          const buttonText = allTrialsCompleted
            ? "Restart Trials"
            : "Go to Next Trial";
          // Adjust button width for longer text
          const btnW = allTrialsCompleted ? 140 : 120;
          const btnH = 35;
          const btnX = w / 2 - btnW / 2;
          const btnY = h / 2 + 40;

          ctx.fillStyle = "#dc2626";
          ctx.fillRect(btnX, btnY, btnW, btnH);
          ctx.strokeStyle = "#b91c1c";
          ctx.lineWidth = 2;
          ctx.strokeRect(btnX, btnY, btnW, btnH);

          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 14px system-ui, -apple-system, Segoe UI, Roboto";
          ctx.fillText(buttonText, w / 2, btnY + btnH / 2 + 4);

          // Store button bounds for click detection
          this.restartButtonBounds = {
            x: btnX,
            y: btnY,
            w: btnW,
            h: btnH,
            allTrialsCompleted,
          };
        } else {
          // In playground mode, don't show button
          this.restartButtonBounds = null;
        }

        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      } else {
        this.restartButtonBounds = null;
      }
    }

    // Optional liquid contour overlay
    if (this.contourOn) {
      this.drawContourOverlay(ctx, base);
    }

    // Overlay (choose legible text color against current background)
    try {
      const m = (bgFromCanvas || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      let textColor = "#0e1116";
      if (m) {
        const r = Math.min(255, Math.max(0, parseInt(m[1], 10)));
        const g = Math.min(255, Math.max(0, parseInt(m[2], 10)));
        const b = Math.min(255, Math.max(0, parseInt(m[3], 10)));
        const sr = r / 255;
        const sg = g / 255;
        const sb = b / 255;
        const lin = (c) =>
          c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        const L = 0.2126 * lin(sr) + 0.7152 * lin(sg) + 0.0722 * lin(sb);
        textColor = L > 0.6 ? "#0e1116" : "#e9eef5";
      }
      ctx.fillStyle = textColor;
    } catch (_) {
      ctx.fillStyle = "#0e1116";
    }
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
    if (this.currentScenario !== "playground" && this.params.label) {
      ctx.fillText(this.params.label, 10, 18);
    }
    // Right-side overlay: KE only
    try {
      let keSum = 0;
      const n = Math.max(1, this.particles.length);
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        keSum +=
          0.5 * (p.mass || 1) * (p.vel[0] * p.vel[0] + p.vel[1] * p.vel[1]);
      }
      const keAvg = keSum / n;
      const label = `KE ${keAvg.toFixed(1)}`;
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, w - 10 - tw, 18);
    } catch (_) {}
  }

  drawContourOverlay(ctx, baseColor) {
    const cellSize = 12; // Smaller cells for better resolution
    const w = this.width;
    const h = this.height;
    const nx = Math.max(2, Math.ceil(w / cellSize));
    const ny = Math.max(2, Math.ceil(h / cellSize));
    const grid = new Float32Array(nx * ny);

    // Build density grid with larger sigma to ensure all particles are engulfed
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const r = p.radius || 4.5;
      const sigma = r * 2.2; // Increased from 1.6 to ensure particles are fully covered
      const sigma2 = sigma * sigma;
      const minX = Math.max(0, Math.floor((p.pos[0] - 4 * sigma) / cellSize));
      const maxX = Math.min(
        nx - 1,
        Math.floor((p.pos[0] + 4 * sigma) / cellSize)
      );
      const minY = Math.max(0, Math.floor((p.pos[1] - 4 * sigma) / cellSize));
      const maxY = Math.min(
        ny - 1,
        Math.floor((p.pos[1] + 4 * sigma) / cellSize)
      );
      for (let gy = minY; gy <= maxY; gy++) {
        const cy = (gy + 0.5) * cellSize; // Use cell center
        for (let gx = minX; gx <= maxX; gx++) {
          const cx = (gx + 0.5) * cellSize; // Use cell center
          const dx = cx - p.pos[0];
          const dy = cy - p.pos[1];
          const d2 = dx * dx + dy * dy;
          const val = Math.exp(-d2 / (2 * sigma2));
          grid[gy * nx + gx] += val;
        }
      }
    }

    // Threshold: balanced threshold for clean liquid visualization
    let maxVal = 0;
    for (let k = 0; k < grid.length; k++)
      if (grid[k] > maxVal) maxVal = grid[k];
    if (maxVal <= 0.0001) return;
    const threshold = maxVal * 0.22; // Balanced threshold for cleaner liquid body

    // Marching squares - collect closed loops with proper case 5 handling
    const segments = [];
    function interp(ax, ay, av, bx, by, bv) {
      const t = (threshold - av) / (bv - av || 1e-6);
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const x = i * cellSize;
        const y = j * cellSize;
        const v0 = grid[j * nx + i];
        const v1 = grid[j * nx + i + 1];
        const v2 = grid[(j + 1) * nx + i + 1];
        const v3 = grid[(j + 1) * nx + i];
        let idx = 0;
        if (v0 > threshold) idx |= 1;
        if (v1 > threshold) idx |= 2;
        if (v2 > threshold) idx |= 4;
        if (v3 > threshold) idx |= 8;
        if (idx === 0 || idx === 15) continue;
        const e = [];

        // Handle case 5 (saddle point) ambiguity properly to avoid weird shapes
        if (idx === 5) {
          // Use average of diagonal pairs to resolve ambiguity
          const avg1 = (v0 + v2) / 2;
          const avg2 = (v1 + v3) / 2;
          if (avg1 > avg2) {
            // Connect opposite corners (top-left to bottom-right)
            e.push(interp(x, y, v0, x + cellSize, y + cellSize, v2));
            e.push(interp(x + cellSize, y, v1, x, y + cellSize, v3));
          } else {
            // Connect adjacent corners (top-right to bottom-left)
            e.push(interp(x, y, v0, x, y + cellSize, v3));
            e.push(interp(x + cellSize, y, v1, x + cellSize, y + cellSize, v2));
          }
        } else {
          // Standard marching squares cases
          switch (idx) {
            case 1:
            case 14:
              e.push(interp(x, y, v0, x + cellSize, y, v1));
              e.push(interp(x, y, v0, x, y + cellSize, v3));
              break;
            case 2:
            case 13:
              e.push(
                interp(x + cellSize, y, v1, x + cellSize, y + cellSize, v2)
              );
              e.push(interp(x, y, v0, x + cellSize, y, v1));
              break;
            case 3:
            case 12:
              e.push(
                interp(x + cellSize, y, v1, x + cellSize, y + cellSize, v2)
              );
              e.push(interp(x, y, v0, x, y + cellSize, v3));
              break;
            case 4:
            case 11:
              e.push(
                interp(x + cellSize, y, v1, x + cellSize, y + cellSize, v2)
              );
              e.push(
                interp(x, y + cellSize, v3, x + cellSize, y + cellSize, v2)
              );
              break;
            case 6:
            case 9:
              e.push(interp(x, y, v0, x + cellSize, y, v1));
              e.push(
                interp(x, y + cellSize, v3, x + cellSize, y + cellSize, v2)
              );
              break;
            case 7:
            case 8:
              e.push(
                interp(x, y + cellSize, v3, x + cellSize, y + cellSize, v2)
              );
              e.push(interp(x, y, v0, x, y + cellSize, v3));
              break;
            case 10:
              e.push(interp(x, y, v0, x + cellSize, y, v1));
              e.push(
                interp(x, y + cellSize, v3, x + cellSize, y + cellSize, v2)
              );
              break;
          }
        }
        if (e.length === 2) segments.push(e);
      }
    }

    // Connect segments into closed paths
    const paths = [];
    const used = new Array(segments.length).fill(false);
    const connectionTolerance = cellSize * 0.8; // Stricter tolerance for actual connections
    const bucketSize = cellSize * 1.5; // Larger buckets for initial search, but we'll check distance precisely

    function key(pt) {
      return (
        Math.floor(pt[0] / bucketSize) + "," + Math.floor(pt[1] / bucketSize)
      );
    }

    function distanceSq(pt1, pt2) {
      const dx = pt1[0] - pt2[0];
      const dy = pt1[1] - pt2[1];
      return dx * dx + dy * dy;
    }

    function findNearestPoint(pt, otherPt, threshold) {
      return distanceSq(pt, otherPt) < threshold * threshold;
    }

    // Build endpoint map with all endpoints for efficient lookup
    const endpointMap = new Map();
    for (let si = 0; si < segments.length; si++) {
      const [a, b] = segments[si];
      const ka = key(a);
      const kb = key(b);
      if (!endpointMap.has(ka)) endpointMap.set(ka, []);
      if (!endpointMap.has(kb)) endpointMap.set(kb, []);
      endpointMap
        .get(ka)
        .push({ segmentIdx: si, endpoint: a, otherEndpoint: b });
      endpointMap
        .get(kb)
        .push({ segmentIdx: si, endpoint: b, otherEndpoint: a });
    }

    for (let i = 0; i < segments.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      let [a, b] = segments[i];
      const path = [a, b];
      let start = a;
      let end = b;

      // Grow forward from end - find closest endpoint
      while (true) {
        const k = key(end);
        const candidates = [];

        // Check current bucket and adjacent buckets
        for (let dk = -1; dk <= 1; dk++) {
          for (let dl = -1; dl <= 1; dl++) {
            const checkKey = `${Math.floor(end[0] / bucketSize) + dk},${
              Math.floor(end[1] / bucketSize) + dl
            }`;
            const list = endpointMap.get(checkKey) || [];
            for (const entry of list) {
              if (used[entry.segmentIdx]) continue;
              const distSq = distanceSq(end, entry.endpoint);
              if (distSq < connectionTolerance * connectionTolerance) {
                candidates.push({ ...entry, distSq });
              }
            }
          }
        }

        if (candidates.length === 0) break;

        // Find the closest candidate
        candidates.sort((a, b) => a.distSq - b.distSq);
        const best = candidates[0];
        path.push(best.otherEndpoint);
        end = best.otherEndpoint;
        used[best.segmentIdx] = true;
      }

      // Grow backward from start - find closest endpoint
      while (true) {
        const k = key(start);
        const candidates = [];

        // Check current bucket and adjacent buckets
        for (let dk = -1; dk <= 1; dk++) {
          for (let dl = -1; dl <= 1; dl++) {
            const checkKey = `${Math.floor(start[0] / bucketSize) + dk},${
              Math.floor(start[1] / bucketSize) + dl
            }`;
            const list = endpointMap.get(checkKey) || [];
            for (const entry of list) {
              if (used[entry.segmentIdx]) continue;
              const distSq = distanceSq(start, entry.endpoint);
              if (distSq < connectionTolerance * connectionTolerance) {
                candidates.push({ ...entry, distSq });
              }
            }
          }
        }

        if (candidates.length === 0) break;

        // Find the closest candidate
        candidates.sort((a, b) => a.distSq - b.distSq);
        const best = candidates[0];
        path.unshift(best.otherEndpoint);
        start = best.otherEndpoint;
        used[best.segmentIdx] = true;
      }

      // Only add paths that are closed or have enough points
      if (path.length >= 3) {
        // Check if path is closed (start and end are close)
        const isClosed = findNearestPoint(start, end, connectionTolerance);
        if (isClosed) {
          path.push(path[0]); // Ensure it's explicitly closed
        }
        paths.push(path);
      }
    }

    // Filter paths to keep only the main liquid body (largest area)
    // This prevents weird disconnected shapes from appearing
    if (paths.length > 1) {
      const pathAreas = paths.map((path) => {
        if (path.length < 3) return { path, area: 0 };
        // Calculate signed area using shoelace formula
        let area = 0;
        for (let i = 0; i < path.length - 1; i++) {
          area += path[i][0] * path[i + 1][1] - path[i + 1][0] * path[i][1];
        }
        return { path, area: Math.abs(area) };
      });

      // Sort by area and keep only paths that are at least 15% of the largest
      pathAreas.sort((a, b) => b.area - a.area);
      const maxArea = pathAreas[0].area;
      const filteredPaths = pathAreas
        .filter((p) => p.area > maxArea * 0.15)
        .map((p) => p.path);
      paths.length = 0;
      paths.push(...filteredPaths);
    }

    // Detect open contours closed by walls and apply appropriate shading
    const bottomThreshold = h - cellSize * 5; // More generous threshold for ground proximity
    const leftThreshold = cellSize * 5; // More generous threshold for left wall proximity
    const rightThreshold = w - cellSize * 5; // More generous threshold for right wall proximity
    const containerBottom = h; // Bottom of container
    const containerLeft = 0; // Left wall
    const containerRight = w; // Right wall

    // Classify paths: closed vs open, and check if near walls (prefer walls even if closed)
    const pathInfo = paths.map((path) => {
      if (path.length < 3)
        return {
          path,
          isClosed: false,
          nearGround: false,
          nearLeftWall: false,
          nearRightWall: false,
        };

      const firstPt = path[0];
      const lastPt = path[path.length - 1];
      const isClosed = findNearestPoint(firstPt, lastPt, connectionTolerance);

      // Check individual points for wall proximity (more accurate than bounds)
      let nearGround = false;
      let nearLeftWall = false;
      let nearRightWall = false;

      for (let i = 0; i < path.length; i++) {
        const pt = path[i];
        if (pt[1] >= bottomThreshold) nearGround = true;
        if (pt[0] <= leftThreshold) nearLeftWall = true;
        if (pt[0] >= rightThreshold) nearRightWall = true;
      }

      // Find boundary points for ground
      let leftmostX = null;
      let rightmostX = null;
      let leftmostPt = null;
      let rightmostPt = null;
      let leftmostIdx = -1;
      let rightmostIdx = -1;
      if (nearGround) {
        for (let i = 0; i < path.length; i++) {
          const pt = path[i];
          if (pt[1] >= bottomThreshold) {
            if (leftmostX === null || pt[0] < leftmostX) {
              leftmostX = pt[0];
              leftmostPt = pt;
              leftmostIdx = i;
            }
            if (rightmostX === null || pt[0] > rightmostX) {
              rightmostX = pt[0];
              rightmostPt = pt;
              rightmostIdx = i;
            }
          }
        }
      }

      // Find boundary points for left wall
      let topmostY = null;
      let bottommostY = null;
      let topmostPt = null;
      let bottommostPt = null;
      let topmostIdx = -1;
      let bottommostIdx = -1;
      if (nearLeftWall) {
        for (let i = 0; i < path.length; i++) {
          const pt = path[i];
          if (pt[0] <= leftThreshold) {
            if (topmostY === null || pt[1] < topmostY) {
              topmostY = pt[1];
              topmostPt = pt;
              topmostIdx = i;
            }
            if (bottommostY === null || pt[1] > bottommostY) {
              bottommostY = pt[1];
              bottommostPt = pt;
              bottommostIdx = i;
            }
          }
        }
      }

      // Find boundary points for right wall
      let rightTopmostY = null;
      let rightBottommostY = null;
      let rightTopmostPt = null;
      let rightBottommostPt = null;
      let rightTopmostIdx = -1;
      let rightBottommostIdx = -1;
      if (nearRightWall) {
        for (let i = 0; i < path.length; i++) {
          const pt = path[i];
          if (pt[0] >= rightThreshold) {
            if (rightTopmostY === null || pt[1] < rightTopmostY) {
              rightTopmostY = pt[1];
              rightTopmostPt = pt;
              rightTopmostIdx = i;
            }
            if (rightBottommostY === null || pt[1] > rightBottommostY) {
              rightBottommostY = pt[1];
              rightBottommostPt = pt;
              rightBottommostIdx = i;
            }
          }
        }
      }

      return {
        path,
        isClosed,
        nearGround,
        nearLeftWall,
        nearRightWall,
        leftmostX,
        rightmostX,
        leftmostPt,
        rightmostPt,
        leftmostIdx,
        rightmostIdx,
        topmostY,
        bottommostY,
        topmostPt,
        bottommostPt,
        topmostIdx,
        bottommostIdx,
        rightTopmostY,
        rightBottommostY,
        rightTopmostPt,
        rightBottommostPt,
        rightTopmostIdx,
        rightBottommostIdx,
      };
    });

    // Draw with wall-closed shading for open contours
    ctx.save();
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2;
    const fillColor = baseColor + "66";

    for (const info of pathInfo) {
      const {
        path,
        isClosed,
        nearGround,
        nearLeftWall,
        nearRightWall,
        leftmostX,
        rightmostX,
        leftmostPt,
        rightmostPt,
        leftmostIdx,
        rightmostIdx,
        topmostY,
        bottommostY,
        topmostPt,
        bottommostPt,
        topmostIdx,
        bottommostIdx,
        rightTopmostY,
        rightBottommostY,
        rightTopmostPt,
        rightBottommostPt,
        rightTopmostIdx,
        rightBottommostIdx,
      } = info;
      if (path.length < 3) continue;

      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i][0], path[i][1]);
      }

      // Wall closing logic that prevents diagonal connections
      // The key is to connect from the path's actual endpoints to the nearest wall points
      if (!isClosed && (nearGround || nearLeftWall || nearRightWall)) {
        const firstPt = path[0];
        const lastPt = path[path.length - 1];

        // Find the actual points where the path touches each wall
        // We'll use these to connect along walls without creating diagonals

        // Collect all points that are on or near walls
        const bottomPoints = [];
        const leftPoints = [];
        const rightPoints = [];

        for (const pt of path) {
          if (nearGround && pt[1] >= bottomThreshold) {
            bottomPoints.push({ x: pt[0], y: containerBottom });
          }
          if (nearLeftWall && pt[0] <= leftThreshold) {
            leftPoints.push({ x: containerLeft, y: pt[1] });
          }
          if (nearRightWall && pt[0] >= rightThreshold) {
            rightPoints.push({ x: containerRight, y: pt[1] });
          }
        }

        // Find the connection points: where path ends meet walls
        // Connect from lastPt to the nearest wall point, then along the wall

        if (nearGround && bottomPoints.length > 0) {
          // Find the leftmost and rightmost bottom points from actual path points
          let leftmostX = Infinity;
          let rightmostX = -Infinity;
          for (const bp of bottomPoints) {
            if (bp.x < leftmostX) leftmostX = bp.x;
            if (bp.x > rightmostX) rightmostX = bp.x;
          }

          // Find the nearest bottom point to lastPt to avoid diagonal connections
          let nearestBottomX = lastPt[0];
          let minDist = Infinity;
          for (const bp of bottomPoints) {
            const dist = Math.abs(bp.x - lastPt[0]);
            if (dist < minDist) {
              minDist = dist;
              nearestBottomX = bp.x;
            }
          }

          // Connect from last point to nearest bottom point
          ctx.lineTo(nearestBottomX, containerBottom);

          // Then connect along bottom wall from nearest to the other extreme
          if (
            nearestBottomX === rightmostX ||
            nearestBottomX > (leftmostX + rightmostX) / 2
          ) {
            // Nearest is on the right side, connect leftward along wall
            ctx.lineTo(leftmostX, containerBottom);
          } else {
            // Nearest is on the left side, connect rightward along wall
            ctx.lineTo(rightmostX, containerBottom);
          }
        } else if (nearLeftWall && leftPoints.length > 0) {
          // Find topmost and bottommost left points
          let topmostY = Infinity;
          let bottommostY = -Infinity;
          for (const lp of leftPoints) {
            if (lp.y < topmostY) topmostY = lp.y;
            if (lp.y > bottommostY) bottommostY = lp.y;
          }

          // Find the nearest left point to lastPt
          let nearestLeftY = lastPt[1];
          let minDist = Infinity;
          for (const lp of leftPoints) {
            const dist = Math.abs(lp.y - lastPt[1]);
            if (dist < minDist) {
              minDist = dist;
              nearestLeftY = lp.y;
            }
          }

          // Connect from last point to nearest left point
          ctx.lineTo(containerLeft, nearestLeftY);

          // Then connect along left wall
          if (
            nearestLeftY === bottommostY ||
            nearestLeftY > (topmostY + bottommostY) / 2
          ) {
            ctx.lineTo(containerLeft, topmostY);
          } else {
            ctx.lineTo(containerLeft, bottommostY);
          }
        } else if (nearRightWall && rightPoints.length > 0) {
          // Find topmost and bottommost right points
          let topmostY = Infinity;
          let bottommostY = -Infinity;
          for (const rp of rightPoints) {
            if (rp.y < topmostY) topmostY = rp.y;
            if (rp.y > bottommostY) bottommostY = rp.y;
          }

          // Find the nearest right point to lastPt
          let nearestRightY = lastPt[1];
          let minDist = Infinity;
          for (const rp of rightPoints) {
            const dist = Math.abs(rp.y - lastPt[1]);
            if (dist < minDist) {
              minDist = dist;
              nearestRightY = rp.y;
            }
          }

          // Connect from last point to nearest right point
          ctx.lineTo(containerRight, nearestRightY);

          // Then connect along right wall
          if (
            nearestRightY === bottommostY ||
            nearestRightY > (topmostY + bottommostY) / 2
          ) {
            ctx.lineTo(containerRight, topmostY);
          } else {
            ctx.lineTo(containerRight, bottommostY);
          }
        }

        // Close back to start point
        ctx.lineTo(firstPt[0], firstPt[1]);
        ctx.closePath();
      } else {
        // Explicitly close the path before filling (for closed contours)
        ctx.closePath();
      }

      if (this.shadeContour) {
        try {
          ctx.fillStyle = fillColor;
          ctx.fill(); // Fill inside the path (walls act as closing edges for open contours)
        } catch (_) {}
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  loop = (now) => {
    if (!this.running) return;

    // Check if trial should end at 30s
    if (this.heatingOn && !this.trialEnded) {
      const t = (performance.now() - this.gasStart) / 1000;
      if (t >= 30) {
        this.trialEnded = true;
        this.stop(); // Stop simulation at 30s
        // Mark current scenario as completed
        if (this.currentScenario) {
          this.completedTrials.add(this.currentScenario);
        }
        // Check playground goal if in playground mode
        if (typeof window.checkPlaygroundGoal === "function") {
          try {
            const total =
              this.particles.length + (this.escapedParticles?.length || 0);
            const escapedPct =
              total > 0 ? Math.round((this.escapedCount / total) * 100) : 0;
            window.checkPlaygroundGoal(escapedPct);
          } catch (_) {}
        }
      }
    }

    const dt = clamp((now - this.lastMs) / 1000, 0, 0.033);
    this.lastMs = now;

    // Only step simulation if trial hasn't ended
    if (!this.trialEnded) {
      this.step(dt);
    }

    this.draw();
    // Record gas/escape data for graph (only when heating is on and trial hasn't ended)
    try {
      if (this.gasCtx && this.gasCanvas && this.currentScenario) {
        if (this.heatingOn && !this.trialEnded) {
          const t = (performance.now() - this.gasStart) / 1000;
          // Only record up to 30s
          if (t <= 30) {
            this.gasHistory.push({
              t,
              gasCount: this.gasCount,
              escapedCount: this.escapedCount,
              scenario: this.currentScenario,
            });
            // Keep reasonable history (last 10000 points)
            if (this.gasHistory.length > 10000) this.gasHistory.shift();
          }
        }
        // Always draw graph to show historical data
        this.drawGasGraph();
      }
    } catch (_) {}

    // Update playground goal progress
    if (typeof window.updatePlaygroundGoalProgress === "function") {
      try {
        window.updatePlaygroundGoalProgress();
      } catch (_) {}
    }

    // Update narrator (throttled, not a separate timer)
    if (
      typeof window.renderNarration === "function" &&
      typeof window.updateNarratorThrottled === "function"
    ) {
      try {
        window.updateNarratorThrottled();
      } catch (_) {}
    }

    this.frameId = requestAnimationFrame(this.loop);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.lastMs = performance.now();
    this.frameId = requestAnimationFrame(this.loop);
  }
  stop() {
    this.running = false;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  getParticleDebugData(particle) {
    if (!particle) return null;

    const v2 =
      particle.vel[0] * particle.vel[0] + particle.vel[1] * particle.vel[1];
    const ke = 0.5 * (particle.mass || 1) * v2;
    const speed = Math.sqrt(v2); // Use sqrt instead of Math.hypot
    const thermalEnergy = particle.thermalEnergy || 0;

    // Calculate forces from nearby particles
    let totalLJForce = 0;
    let totalHBForce = 0;
    let totalDipoleForce = 0;
    let nearestNeighborDistSq = Infinity;
    let nearestNeighbor = null;
    const rMax = 28;
    const ax = particle.pos[0];
    const ay = particle.pos[1];

    this.grid.forNeighbors(ax, ay, rMax, (b) => {
      if (particle === b) return;
      const dx = b.pos[0] - ax;
      const dy = b.pos[1] - ay;
      const rVec = [dx, dy];
      const distSq = dx * dx + dy * dy; // Squared distance

      if (distSq < nearestNeighborDistSq) {
        nearestNeighborDistSq = distSq;
        nearestNeighbor = b;
      }

      const fLJ = this.ljForce(rVec);
      const fHB = this.hbForce(rVec);
      const fDP = this.dipoleForce(rVec);

      // Use squared magnitudes for comparison, sqrt only when needed
      totalLJForce += Math.sqrt(fLJ[0] * fLJ[0] + fLJ[1] * fLJ[1]);
      totalHBForce += Math.sqrt(fHB[0] * fHB[0] + fHB[1] * fHB[1]);
      totalDipoleForce += Math.sqrt(fDP[0] * fDP[0] + fDP[1] * fDP[1]);
    });

    const nearestNeighborDist = Math.sqrt(nearestNeighborDistSq);

    // Check if in heating zone
    const r = particle.radius || 4.5;
    const particleBottom = particle.pos[1] + r;
    const heatingZoneHeight = this.height * 0.05;
    const heatingZoneTop = this.height - heatingZoneHeight;
    const inHeatingZone = particleBottom >= heatingZoneTop;

    // Calculate distance from bottom
    const distFromBottom = this.height - particleBottom;

    // Cache particle index to avoid O(n) lookup
    const particleIndex = this.particles.indexOf(particle);

    return {
      index: particleIndex,
      position: {
        x: particle.pos[0].toFixed(2),
        y: particle.pos[1].toFixed(2),
      },
      velocity: {
        x: particle.vel[0].toFixed(2),
        y: particle.vel[1].toFixed(2),
        speed: speed.toFixed(2),
      },
      kineticEnergy: ke.toFixed(2),
      thermalEnergy: thermalEnergy.toFixed(3),
      state: particle.state,
      mass: particle.mass || 1,
      radius: r,
      localNeighbors: particle.localNeighbors || 0,
      forces: {
        lj: totalLJForce.toFixed(2),
        hb: totalHBForce.toFixed(2),
        dipole: totalDipoleForce.toFixed(2),
        total: (totalLJForce + totalHBForce + totalDipoleForce).toFixed(2),
      },
      nearestNeighbor: {
        distance: nearestNeighborDist.toFixed(2),
        state: nearestNeighbor?.state || "none",
      },
      heating: {
        inZone: inHeatingZone,
        distFromBottom: distFromBottom.toFixed(2),
        heatingZoneTop: heatingZoneTop.toFixed(2),
      },
      gasUntil: particle.gasUntil
        ? (particle.gasUntil - performance.now()).toFixed(0)
        : "N/A",
      lastStateChange: particle.lastStateChange
        ? (performance.now() - particle.lastStateChange).toFixed(0)
        : "N/A",
    };
  }

  destroy() {
    this.stop();
    document.removeEventListener("visibilitychange", this.onVisibility);
  }
}

// Extend IMFSim with Gas/Escape graph
IMFSim.prototype.setGasCanvas = function (canvas) {
  this.gasCanvas = canvas;
  this.gasCtx = canvas.getContext("2d");
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const cssW = canvas.clientWidth || 450;
  const cssH = canvas.clientHeight || 420;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  this.gasDPR = dpr;

  this.drawGasGraph = () => {
    const ctx = this.gasCtx;
    if (!ctx) return;
    const w = this.gasCanvas.width;
    const h = this.gasCanvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Group history by scenario - only track escaped particles
    const scenarios = ["honey", "dmso", "hexane", "playground"];
    const scenarioData = {};
    scenarios.forEach((sc) => {
      scenarioData[sc] = {
        escaped: [],
      };
    });

    for (let i = 0; i < this.gasHistory.length; i++) {
      const point = this.gasHistory[i];
      if (scenarioData[point.scenario]) {
        scenarioData[point.scenario].escaped.push({
          t: point.t,
          value: point.escapedCount,
        });
      }
    }

    // Compute ranges - only use escaped count
    let tMax = 0;
    let maxEscaped = 0;

    scenarios.forEach((sc) => {
      const data = scenarioData[sc];
      data.escaped.forEach((p) => {
        if (p.t > tMax) tMax = p.t;
        if (p.value > maxEscaped) maxEscaped = p.value;
      });
    });

    // Add current values
    if (this.currentScenario) {
      const t = (performance.now() - this.gasStart) / 1000;
      if (t > tMax) tMax = t;
      if (this.escapedCount > maxEscaped) maxEscaped = this.escapedCount;
    }

    if (!isFinite(tMax) || tMax <= 0) tMax = 1;
    if (!isFinite(maxEscaped) || maxEscaped === 0) maxEscaped = 1;

    // Show all data (no panning window)
    const tMin = 0;
    const visibleTimeRange = tMax - tMin;

    // Padding
    const pL = 50,
      pR = 50,
      pT = 30,
      pB = 50;
    const plotW = Math.max(10, w - pL - pR);
    const plotH = Math.max(10, h - pT - pB);
    const xOf = pL,
      yOf = pT;

    // Background
    const bgFromCanvas = getComputedStyle(this.gasCanvas).backgroundColor;
    ctx.fillStyle =
      (bgFromCanvas && bgFromCanvas !== "rgba(0, 0, 0, 0)" && bgFromCanvas) ||
      getComputedStyle(document.body).getPropertyValue("--panel") ||
      "#ffffff";
    ctx.fillRect(0, 0, w, h);

    // Axes
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xOf, yOf + plotH);
    ctx.lineTo(xOf + plotW, yOf + plotH);
    ctx.moveTo(xOf, yOf);
    ctx.lineTo(xOf, yOf + plotH);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("time (s)", xOf + plotW - 60, yOf + plotH + 18);
    ctx.save();
    ctx.translate(12, yOf + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Count", 0, 0);
    ctx.restore();

    // Title
    ctx.fillStyle = "#111827";
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Escaped Particles (Gaseousness)", xOf + 10, yOf - 10);

    // X-axis ticks
    ctx.fillStyle = "#9ca3af";
    for (let i = 0; i <= 4; i++) {
      const t = tMin + (i / 4) * visibleTimeRange;
      const x = xOf + ((t - tMin) / visibleTimeRange) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, yOf + plotH);
      ctx.lineTo(x, yOf + plotH + 4);
      ctx.strokeStyle = "#e5e7eb";
      ctx.stroke();
      const label = t.toFixed(0);
      const lw = ctx.measureText(label).width;
      ctx.fillText(label, x - lw / 2, yOf + plotH + 16);
    }

    // Y-axis ticks (escaped count only)
    const maxY = maxEscaped > 0 ? maxEscaped : 1;
    for (let i = 0; i <= 4; i++) {
      const v = (i / 4) * maxY;
      const y = yOf + plotH - (v / maxY) * plotH;
      ctx.beginPath();
      ctx.moveTo(xOf - 4, y);
      ctx.lineTo(xOf, y);
      ctx.strokeStyle = "#e5e7eb";
      ctx.stroke();
      const label = Math.round(v).toString();
      const lw = ctx.measureText(label).width;
      ctx.fillText(label, xOf - 6 - lw, y + 4);
    }

    // Scenario colors - only escaped particles
    const scenarioColors = {
      honey: "#3a9bc8",
      dmso: "#ccaa08",
      hexane: "#6a8acc",
      playground: "#8b5cf6", // Purple for playground
    };

    // Draw escaped count lines (solid) - show all scenarios overlaid
    scenarios.forEach((sc) => {
      const data = scenarioData[sc].escaped;
      // Draw all scenarios that have data, not just the current one
      if (data.length === 0 && (this.currentScenario !== sc || !this.heatingOn))
        return;

      ctx.strokeStyle = scenarioColors[sc];
      ctx.lineWidth = 2;
      // Use solid lines for escaped particles
      ctx.beginPath();
      let firstPoint = true;
      for (let i = 0; i < data.length; i++) {
        const p = data[i];
        if (p.t >= tMin) {
          const x = xOf + ((p.t - tMin) / visibleTimeRange) * plotW;
          const y = yOf + plotH - (p.value / maxY) * plotH;
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      // Add current point if this is the active scenario and heating is on
      if (this.currentScenario === sc && this.heatingOn) {
        const t = (performance.now() - this.gasStart) / 1000;
        if (t >= tMin) {
          const x = xOf + ((t - tMin) / visibleTimeRange) * plotW;
          const y = yOf + plotH - (this.escapedCount / maxY) * plotH;
          if (firstPoint) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      if (!firstPoint) ctx.stroke();
    });

    // Legend - only show escaped particles
    ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto";
    let legendY = yOf + 20;
    scenarios.forEach((sc) => {
      const label = sc.charAt(0).toUpperCase() + sc.slice(1);
      // Escaped line (solid)
      ctx.strokeStyle = scenarioColors[sc];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xOf + plotW - 100, legendY);
      ctx.lineTo(xOf + plotW - 80, legendY);
      ctx.stroke();
      ctx.fillStyle = "#111827";
      ctx.fillText(`${label} Escaped`, xOf + plotW - 75, legendY + 4);

      legendY += 18;
    });

    // Overlay message when heating is off, simulation is paused, or no data exists yet
    const hasCurrentTrialData =
      this.currentScenario &&
      this.gasHistory.some((p) => p.scenario === this.currentScenario);
    // Show overlay if: heating is off OR simulation is paused OR (no data and trial hasn't ended)
    // Hide overlay when: heating is on AND running AND (has data OR trial ended with data)
    const shouldShowOverlay =
      !this.heatingOn ||
      !this.running ||
      (!hasCurrentTrialData && !this.trialEnded);
    if (shouldShowOverlay) {
      // Semi-transparent grey overlay
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, w, h);

      // Message text - bigger font
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const messageLines = [
        "Graph starts when heating begins",
        "and ends after 30 seconds.",
        "You can then switch and compare trials.",
      ];

      const lineHeight = 30;
      const startY = h / 2 - ((messageLines.length - 1) * lineHeight) / 2;

      messageLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, startY + i * lineHeight);
      });

      // Reset text alignment
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  };
};

// ---------------- Light DOM UI (Style-guide aligned) ----------------

function getCSSVar(name, fallback) {
  const cs = getComputedStyle(document.body);
  const v = cs.getPropertyValue(name);
  return v && v.trim().length ? v.trim() : fallback;
}

function scenarioColor(kind) {
  if (kind === "honey") return getCSSVar("--accent", "#5ac8fa");
  if (kind === "dmso") return getCSSVar("--yellow", "#ffd60a");
  if (kind === "playground") return "#8b5cf6"; // Purple for playground
  return getCSSVar("--green", "#34c759"); // hexane
}

function applyIMFCoeffsFor(sim, kind) {
  const v = Math.max(0, Number(sim.params.viscosity || 0));
  if (kind === "playground") {
    // SIMPLIFIED: Direct interpolation between hexane and honey based on IMF strength
    // IMF strength (0-1) directly controls behavior: 0 = hexane, 1 = honey
    const t = sim.getIMFStrength(); // 0 = hexane-like, 1 = honey-like

    // Get user's slider values
    const userEpsilon = sim.params.epsilon || 0;
    const userHb = sim.params.hbStrength || 0;
    const userDp = sim.params.dipole || 0;

    // Hexane characteristics (weak IMFs, easy evaporation)
    const hexaneEpsilon = 0.05;
    const hexaneCohLJ = 0.011;
    const hexaneCohHB = 0.0;
    const hexaneCohDP = 0.0;

    // Honey characteristics (strong IMFs, hard evaporation)
    const honeyEpsilon = 0.7;
    const honeyCohLJ = 9.5;
    const honeyCohHB = 18.0;
    const honeyCohDP = 1.0;

    // Use user's epsilon directly - it's already in the right range
    // The cohesion coefficients will scale based on IMF strength

    // Interpolate cohesion coefficients - these directly control how particles stick together
    // Make the range very wide: hexane (0.011) to honey (9.5) = ~860x difference
    sim.params.cohLJ = hexaneCohLJ + (honeyCohLJ - hexaneCohLJ) * t;

    // Scale H-bond cohesion if user enabled it
    if (userHb > 0) {
      // Scale based on IMF strength - honey has very strong H-bonds
      sim.params.cohHB = hexaneCohHB + (honeyCohHB - hexaneCohHB) * t;
      // Also scale hbStrength itself based on IMF strength for stronger effect
      sim.params.hbStrength = userHb * (0.5 + 0.5 * t); // Scale user value by 0.5x to 1.0x based on IMF
    } else {
      sim.params.cohHB = 0;
      sim.params.hbStrength = 0;
    }

    // Scale dipole cohesion if user enabled it
    if (userDp > 0) {
      const dmsoCohDP = 1.8; // DMSO-like dipole strength
      sim.params.cohDP = hexaneCohDP + (dmsoCohDP - hexaneCohDP) * t;
      // Scale dipole strength itself
      sim.params.dipole = userDp * (0.5 + 0.5 * t);
    } else {
      sim.params.cohDP = 0;
      sim.params.dipole = 0;
    }

    // User's epsilon is used directly in force calculations
    // The cohesion coefficients control how strongly those forces act

    return;
  }
  if (kind === "honey") {
    // Hydrogen bonds: strongest IMF
    sim.params.hbStrength = 3.0 * v; // Increased to make H-bonds clearly strongest
    sim.params.dipole = 0.0;
    sim.params.cohLJ = 1.5 + 0.8 * v; // Moderate LJ contribution
    sim.params.cohHB = 3.0 + 1.5 * v; // Significantly increased to make H-bonds dominant (was 2.0 + 1.2*v)
    sim.params.cohDP = 1.0;
  } else if (kind === "dmso") {
    // Dipole-dipole: moderate strength, stronger than LDFs but weaker than H-bonds
    sim.params.hbStrength = 0.0;
    sim.params.dipole = 1.5 * v;
    sim.params.cohLJ = 0.8 + 0.5 * v; // Moderate LJ contribution
    sim.params.cohHB = 1.0;
    sim.params.cohDP = 1.2 + 0.8 * v; // Moderate dipole-dipole strength
  } else {
    // Hexane - extremely weak attractions (only very weak London dispersion)
    // LDFs should be weakest: reduce cohLJ significantly
    sim.params.hbStrength = 0.0;
    sim.params.dipole = 0.0;
    sim.params.cohLJ = 0.01 + 0.02 * v; // Much weaker: was 0.05 + 0.1*v, now ~0.01-0.02 range
    sim.params.cohHB = 0.0; // No hydrogen bonding
    sim.params.cohDP = 0.0; // No dipole-dipole
  }
}

export function mountIMFs(root) {
  // Build Shadow DOM host to isolate Harvard‑Westlake stylesheet
  const host = document.createElement("div");
  host.id = "imfs-host";
  root.innerHTML = "";
  root.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  // External stylesheet removed - using only local styles defined below
  // This prevents 404 errors from unavailable external resources

  // IMFs local shim styles for sizing and rounding
  const shim = document.createElement("style");
  shim.textContent = `
    .imfs-shell { padding: 12px 0; max-width: 100%; width: 100%; overflow-x: hidden; }
    .container.container--wide { max-width: 100%; width: 100%; padding-left: 4px; padding-right: 4px; box-sizing: border-box; overflow-x: hidden; }
    /* Title section styling - better spacing and typography */
    .imfs-shell > section.panel:first-child { padding: 24px 32px; margin-bottom: 0; }
    .imfs-shell > section.panel:first-child h2 { 
      font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      font-weight: 700;
      font-size: 24px;
      line-height: 1.3;
      margin: 0 0 12px 0;
      color: #111827;
      letter-spacing: -0.02em;
    }
    .imfs-shell > section.panel:first-child p { 
      font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      margin: 0;
      color: #6b7280;
    }
    .imfs-wrap { display: grid; grid-template-columns: 1fr; gap: 16px; }
    /* Compact controls styling */
    .imfs-controls-row { grid-column: 1; display: block; }
    .imfs-controls-row .panel { max-width: 100%; padding: 12px; box-sizing: border-box; }
    .controls-compact { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: flex-start; width: 100%; box-sizing: border-box; }
    .controls-compact .control-group { display: flex; flex-direction: column; gap: 4px; flex: 0 1 auto; min-width: 0; align-items: flex-start; }
    .controls-compact .control-group:first-child { flex: 0 0 auto; min-width: 160px; }
    .controls-compact .control-group.compact-dropdown { flex: 1 1 140px; min-width: 120px; max-width: 200px; }
    .controls-compact .control-group.compact-dropdown .label { font-size: 12px; margin-bottom: 2px; }
    .controls-compact .control-group.compact-dropdown .select,
    .controls-compact .control-group.compact-dropdown .range { font-size: 13px; padding: 4px 8px; width: 100%; box-sizing: border-box; }
    .controls-compact .control-group.compact-dropdown .range { height: 32px !important; min-height: 32px; }
    .controls-compact .control-group.compact-dropdown .muted { font-size: 11px; }
    .controls-compact .normal-controls { display: flex; flex-direction: row; gap: 10px; flex: 1 1 auto; min-width: 0; flex-wrap: wrap; align-items: center; }
    .controls-compact .settings-dropdown { flex: 0 0 auto; min-width: 120px; }
    .controls-compact .settings-toggle { padding: 6px 10px; font-size: 13px; width: 100%; box-sizing: border-box; }
    .controls-compact .playground-controls { display: flex; flex-direction: row; gap: 10px; align-items: center; flex: 1 1 auto; min-width: 0; }
    .controls-compact .playground-goal { flex: 1 1 auto; margin: 0; min-width: 0; }
    .controls-compact .playground-params-dropdown { flex: 0 0 auto; min-width: 120px; }
    .controls-compact .playground-params-toggle { padding: 6px 10px; font-size: 13px; width: 100%; box-sizing: border-box; }
    .controls-compact .control-buttons { display: flex; gap: 6px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
    .controls-compact .control-buttons .btn { padding: 10px 18px; font-size: 13px; min-width: 60px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; height: 42px; }
    /* Toggle buttons group */
    .toggle-buttons-group { display: flex; gap: 6px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
    .toggle-buttons-group .btn { padding: 10px 18px; font-size: 13px; min-width: 60px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; height: 42px; }
    /* Heat button - separated and emphasized */
    .heat-button-wrapper { display: flex; align-items: center; flex-shrink: 0; margin-left: 8px; padding-left: 8px; border-left: 1px solid #e5e7eb; }
    .heat-button-wrapper .btn { padding: 10px 20px; font-size: 13px; font-weight: 600; min-width: 70px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; height: 42px; }
    /* Active state for toggle buttons */
    .imfs-shell .btn.btn--outline.is-active { background: #fee2e2; color: #dc2626; border-color: #dc2626; font-weight: 600; box-shadow: 0 0 0 2px #fee2e2 inset; }
    .imfs-shell .btn.btn--outline.is-active:hover { background: #fecaca; border-color: #b91c1c; }
    /* Heat button active state - more prominent */
    .imfs-shell #t-heat.is-active { background: #dc2626; color: #ffffff; border-color: #dc2626; font-weight: 600; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.3); }
    .imfs-shell #t-heat.is-active:hover { background: #b91c1c; border-color: #b91c1c; }
    @media (max-width: 768px) {
      .imfs-controls-row .panel { padding: 10px 6px; margin: 0 2px; }
      .controls-compact { flex-direction: column; gap: 10px; align-items: stretch; }
      .controls-compact .control-group { width: 100%; min-width: 0; max-width: 100%; }
      .controls-compact .control-group:first-child { min-width: 0; }
      .controls-compact .control-group.compact-dropdown { max-width: 100%; }
      .controls-compact .normal-controls { flex-direction: column; width: 100%; gap: 8px; }
      .controls-compact .control-buttons { width: 100%; justify-content: center; }
      .controls-compact .control-buttons .btn { flex: 1 1 0; min-width: 0; }
      .controls-compact .toggle-buttons-group { width: 100%; justify-content: center; flex-wrap: wrap; }
      .controls-compact .toggle-buttons-group .btn { flex: 1 1 0; min-width: 0; }
      .controls-compact .heat-button-wrapper { width: 100%; margin-left: 0; padding-left: 0; border-left: none; border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 8px; justify-content: center; }
      .controls-compact .heat-button-wrapper .btn { width: 100%; }
      .controls-compact .playground-controls { flex-direction: column; width: 100%; gap: 8px; }
      .controls-compact .playground-goal { width: 100%; }
      .controls-compact .playground-params-dropdown { width: 100%; }
      .controls-compact .settings-dropdown { width: 100%; }
      .controls-compact .imf-checkbox-group { flex-direction: row !important; justify-content: flex-start; gap: 16px !important; }
    }
    .imfs-main-row { display: grid; grid-template-columns: 1fr 225px 1fr; gap: 16px; align-items: start; }
    .imfs-3d-row { grid-column: 1 / -1; display: block; margin-top: 8px; }
    .imfs-educational-row { grid-column: 1 / -1; display: block; margin-top: 8px; }
    @media (max-width: 1100px) { 
      .imfs-wrap { grid-template-columns: 1fr; }
      .imfs-main-row { display: grid; grid-template-columns: 1fr; gap: 16px; }
      .imfs-sim { width: 100% !important; max-width: 100%; margin: 0 auto; }
      .imfs-gas { width: 100% !important; max-width: 100%; }
      .ai-narrator-panel { height: auto; max-height: 400px; }
    }
    @media (max-width: 768px) {
      .imfs-shell { padding: 4px 0; }
      .imfs-shell > section.panel:first-child { padding: 20px 20px; }
      .imfs-shell > section.panel:first-child h2 { font-size: 20px; }
      .imfs-shell > section.panel:first-child p { font-size: 14px; }
      .imfs-controls-row .panel { padding: 10px 6px; margin: 0 2px; }
      .imfs-main-row { display: flex; flex-direction: column; gap: 12px; }
      .imfs-sim { height: 300px !important; width: calc(100% - 4px) !important; max-width: calc(100% - 4px); margin: 0 auto; }
      .imfs-gas { height: 300px !important; width: calc(100% - 4px) !important; max-width: calc(100% - 4px); }
      .ai-narrator-panel { height: auto !important; max-height: 300px; margin: 0 2px; padding: 10px 8px; }
      .imfs-3d { height: 200px; margin: 0 2px; }
      .imfs-educational { padding: 12px; margin: 0 2px; }
      .imfs-educational > div[style*="grid"] { grid-template-columns: 1fr !important; }
      .container.container--wide { padding-left: 2px; padding-right: 2px; }
    }
    .imfs-sim-container { display: contents; }
    .imfs-sim { width: 225px !important; height: 420px; display: block; margin: 0 auto; border-radius: 12px; background: #ffffff; border: 3px solid #dc2626; overflow: hidden; box-sizing: border-box; box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.1), 0 8px 24px rgba(220, 38, 38, 0.3), 0 0 40px rgba(220, 38, 38, 0.2); position: relative; transition: border-color 0.6s ease, box-shadow 0.6s ease; }
    .imfs-sim.is-heating { border-color: #f97316; box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1), 0 8px 24px rgba(249, 115, 22, 0.3), 0 0 40px rgba(249, 115, 22, 0.2); }
    .imfs-sim::before { content: ''; position: absolute; top: -6px; left: -6px; right: -6px; bottom: -6px; border: 2px solid rgba(220, 38, 38, 0.3); border-radius: 14px; pointer-events: none; z-index: -1; animation: pulse-glow 2s ease-in-out infinite; transition: border-color 0.6s ease; }
    .imfs-sim.is-heating::before { border-color: rgba(249, 115, 22, 0.3); }
    @keyframes pulse-glow {
      0%, 100% { opacity: 0.5; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.02); }
    }
    .imfs-gas { width: 100% !important; max-width: 100% !important; height: 420px; background: #ffffff; border: 1px solid #d1d5db; border-radius: 12px; display: block; box-sizing: border-box; }
    .imfs-3d { width: 100%; height: 280px; min-height: 200px; border-radius: 12px; background: #ffffff; overflow: hidden; position: relative; }
    .imfs-educational { width: 100%; background: #ffffff; border: 1px solid #d1d5db; border-radius: 12px; padding: 20px; box-sizing: border-box; }
    /* removed thermostat box */
    /* Ensure molecule strokes and labels are visible on light background */
    #imfs-mol line { stroke: #0e1116; stroke-width: 3px; }
    #imfs-mol text { fill: #0e1116; }
    /* AI Narrator */
    .ai-narrator-panel { height: 420px; min-height: 420px; max-height: 420px; overflow-y: auto; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; box-sizing: border-box; }
    .ai-narrator-panel .narrator-content { overflow-y: auto; height: 100%; }
    .ai-narrator-panel .narrator-section { margin: 12px 0; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
    .ai-narrator-panel .narrator-section:last-child { border-bottom: none; }
    .ai-narrator-panel .title { font-weight: 600; margin: 0 0 8px 0; color: #111827; font-size: 14px; }
    .ai-narrator-panel .line { color: #374151; margin: 6px 0; line-height: 1.5; }
    .ai-narrator-panel .line:first-child { margin-top: 0; }
    .ai-narrator-panel .narrator-highlight { font-weight: 600; color: #dc2626; }
    .ai-narrator-panel .narrator-emphasis { font-weight: 600; color: #059669; font-style: italic; }
    .ai-narrator-panel .narrator-tip { color: #7c3aed; font-style: italic; }
    /* Scenario buttons with yellow hover + glow */
    .scenario { background: #ffffff; color: #111827; border: 1px solid #d1d5db; }
    .scenario:hover { border-color: #ffd60a; background: #fff7cc; box-shadow: 0 0 0 2px #ffd60a inset, 0 0 12px rgba(255,214,10,0.55); }
    .scenario.is-active { border-color: #ffd60a; background: #fff7cc; box-shadow: 0 0 0 2px #ffd60a inset, 0 0 16px rgba(255,214,10,0.66); }
    /* Molecule/3D panels glow with scenario accent */
    .imfs-shell[data-kind] .imfs-mol { box-shadow: 0 0 0 2px var(--imfs-accent, #ffd60a) inset, 0 0 16px color-mix(in srgb, var(--imfs-accent, #ffd60a) 55%, transparent); }
    .imfs-shell[data-kind] .imfs-3d { box-shadow: none; }
    .imfs-shell[data-kind] .imfs-3d canvas { pointer-events: none; }
    /* High-contrast overrides inside Shadow DOM (HW red CTAs) */
    .imfs-shell .panel { background: #ffffff; color: #0e1116; border: 1px solid #d1d5db; }
    .imfs-shell .muted { color: #4b5563; }
    .imfs-shell .label { color: #111827; font-weight: 600; }
    .imfs-shell .btn { background: #dc2626; color: #ffffff; border: 1px solid #dc2626; }
    .imfs-shell .btn:hover { background: #b91c1c; border-color: #b91c1c; }
    .imfs-shell .btn.btn--outline { background: transparent; color: #b91c1c; border: 1px solid #dc2626; }
    .imfs-shell .btn.btn--outline:hover { background: #fee2e2; }
    .imfs-shell .btn.btn--ghost { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .imfs-shell .btn:focus-visible { outline: 3px solid #ef4444; outline-offset: 2px; }
    .imfs-shell .range { accent-color: #dc2626; }
    .stack-sm { display: grid; gap: 8px; }
    .row { display: grid; gap: 8px; }
    .row.controls { display: flex; flex-wrap: wrap; gap: 8px; }
    .row.controls[style*="justify-content"] { justify-content: center !important; }
    /* Settings dropdown */
    .settings-dropdown { position: relative; margin-bottom: 8px; }
    .settings-toggle { width: 100%; padding: 8px 12px; background: #ffffff; color: #111827; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; text-align: left; display: flex; justify-content: space-between; align-items: center; }
    .settings-toggle:hover { background: #fee2e2; border-color: #dc2626; }
    .settings-toggle::after { content: "▼"; font-size: 10px; transition: transform 0.2s; }
    .settings-dropdown.open .settings-toggle::after { transform: rotate(180deg); }
    .settings-menu { display: none; position: absolute; top: 100%; left: 0; right: 0; background: #ffffff; border: 1px solid #d1d5db; border-radius: 4px; margin-top: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 100; overflow: hidden; }
    .settings-dropdown.open .settings-menu { display: block; }
    .settings-menu .btn { width: 100%; border-radius: 0; border-left: none; border-right: none; border-top: none; margin: 0; }
    .settings-menu .btn:first-child { border-top: none; }
    .settings-menu .btn:last-child { border-bottom: none; }
    /* Playground parameters dropdown */
    .playground-params-dropdown { position: relative; margin-bottom: 8px; }
    .playground-params-toggle { width: 100%; padding: 8px 12px; background: #ffffff; color: #111827; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; text-align: left; display: flex; justify-content: space-between; align-items: center; }
    .playground-params-toggle:hover { background: #fee2e2; border-color: #dc2626; }
    .playground-params-toggle::after { content: "▼"; font-size: 10px; transition: transform 0.2s; }
    .playground-params-dropdown.open .playground-params-toggle::after { transform: rotate(180deg); }
    .playground-params-menu { display: none; position: absolute; top: 100%; left: 0; right: 0; background: #ffffff; border: 1px solid #d1d5db; border-radius: 4px; margin-top: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 100; overflow-y: auto; max-height: 400px; padding: 12px; }
    .playground-params-dropdown.open .playground-params-menu { display: block; }
    .playground-params-menu .field { margin-bottom: 12px; }
    .playground-params-menu .field:last-child { margin-bottom: 0; }
    .playground-params-menu .field .range { height: 32px !important; min-height: 32px; width: 100%; }
    /* Celebration and sadness animations */
    .celebration-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.3s; }
    .celebration-content { background: #ffffff; border-radius: 16px; padding: 40px; text-align: center; max-width: 500px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
    .celebration-content.success { border: 4px solid #059669; }
    .celebration-content.failure { border: 4px solid #dc2626; }
    .celebration-content h2 { margin: 0 0 16px 0; font-size: 32px; font-weight: 800; }
    .celebration-content.success h2 { color: #059669; }
    .celebration-content.failure h2 { color: #dc2626; }
    .celebration-content p { margin: 0; font-size: 18px; color: #374151; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes pulse { 
      0%, 100% { box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4); }
      50% { box-shadow: 0 6px 20px rgba(220, 38, 38, 0.6); }
    }
    /* Tutorial overlay styles */
    .tutorial-overlay { 
      position: fixed; 
      top: 0; 
      left: 0; 
      right: 0; 
      bottom: 0; 
      background: rgba(0, 0, 0, 0.75); 
      z-index: 10000; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      animation: fadeIn 0.3s;
      pointer-events: all;
      overflow-y: auto;
      padding: 20px;
      box-sizing: border-box;
    }
    .tutorial-overlay.hidden { display: none; }
    .tutorial-content { 
      background: #ffffff; 
      border-radius: 24px; 
      padding: 12px 20px; 
      width: auto;
      max-width: 500px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 0 2px rgba(255, 255, 255, 0.3); 
      animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      position: fixed !important;
      bottom: 20px !important;
      left: 50% !important;
      right: auto !important;
      top: auto !important;
      transform: translateX(-50%) !important;
      z-index: 10001;
      box-sizing: border-box;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 12px;
      border: 2px solid rgba(255, 255, 255, 0.5);
      filter: brightness(1.1);
      white-space: nowrap;
      margin: 0 !important;
    }
    /* Centered floating modal for intro/outro steps */
    .tutorial-intro-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10004;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .tutorial-intro-content {
      background: #ffffff;
      border-radius: 24px;
      padding: 32px 40px;
      max-width: 600px;
      width: calc(100vw - 40px);
      box-shadow: 0 12px 48px rgba(0,0,0,0.5), 0 0 0 2px rgba(255, 255, 255, 0.3);
      animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      text-align: center;
      pointer-events: all;
    }
    .tutorial-intro-content h3 {
      margin: 0 0 16px 0;
      font-size: 24px;
      font-weight: 700;
      color: #111827;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .tutorial-intro-content p {
      margin: 0 0 24px 0;
      font-size: 16px;
      line-height: 1.7;
      color: #374151;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .tutorial-intro-buttons {
      display: flex;
      gap: 12px;
      justify-content: center;
      align-items: center;
    }
    @media (max-width: 768px) {
      .tutorial-intro-content {
        padding: 24px 28px;
        max-width: calc(100vw - 20px);
      }
      .tutorial-intro-content h3 {
        font-size: 20px;
      }
      .tutorial-intro-content p {
        font-size: 15px;
      }
    }
    .tutorial-content .tutorial-text-content {
      margin: 0;
      text-align: center;
      font-size: 15px;
      line-height: 1.6;
      color: #374151;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .tutorial-content .tutorial-text-content h3 {
      margin: 0 0 12px 0;
      font-size: 20px;
      font-weight: 700;
      color: #111827;
    }
    .tutorial-content .tutorial-text-content p {
      margin: 0;
    }
    @media (max-width: 768px) {
      .tutorial-content {
        padding: 10px 16px;
        bottom: 10px;
        gap: 8px;
        max-width: calc(100vw - 20px);
      }
      .tutorial-content.has-text {
        padding: 16px 20px;
        max-width: calc(100vw - 20px);
      }
      .tutorial-content .tutorial-step-indicator {
        font-size: 12px;
      }
      .tutorial-content .tutorial-text-content {
        font-size: 14px;
      }
      .tutorial-content .tutorial-text-content h3 {
        font-size: 18px;
      }
      .tutorial-content .tutorial-buttons {
        gap: 6px;
      }
      .tutorial-content .btn-tutorial {
        padding: 6px 12px;
        font-size: 13px;
        min-width: 70px;
        height: 32px;
      }
      .tutorial-tooltip {
        max-width: calc(100vw - 30px) !important;
        width: calc(100vw - 30px) !important;
        padding: 12px 14px;
        font-size: 13px;
      }
    }
    .tutorial-content h3 { 
      margin: 0 0 16px 0; 
      font-size: 24px; 
      font-weight: 700; 
      color: #111827;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .tutorial-content p { 
      margin: 0 0 24px 0; 
      font-size: 16px; 
      line-height: 1.6; 
      color: #374151;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .tutorial-content .tutorial-step-indicator {
      margin: 0;
      font-size: 14px;
      color: #6b7280;
      font-weight: 600;
      white-space: nowrap;
      min-width: 40px;
      text-align: center;
    }
    .tutorial-content .tutorial-buttons { 
      display: flex; 
      gap: 8px; 
      justify-content: center; 
      margin: 0;
    }
    .tutorial-content .btn-tutorial { 
      padding: 8px 12px; 
      border-radius: 12px; 
      font-size: 18px; 
      font-weight: 600; 
      cursor: pointer; 
      border: none;
      font-family: 'Inter', system-ui, sans-serif;
      transition: all 0.2s;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      min-width: 40px;
      width: 40px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tutorial-content .btn-tutorial-skip {
      min-width: auto;
      width: auto;
      padding: 8px 14px;
      font-size: 14px;
    }
    .tutorial-content .btn-tutorial-primary { 
      background: #dc2626; 
      color: #ffffff; 
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
      animation: pulse 2s ease-in-out infinite;
    }
    .tutorial-content .btn-tutorial-primary:hover { 
      background: #b91c1c; 
      box-shadow: 0 6px 16px rgba(220, 38, 38, 0.5);
      transform: translateY(-1px);
    }
    .tutorial-content .btn-tutorial-secondary { 
      background: #f3f4f6; 
      color: #374151; 
    }
    .tutorial-content .btn-tutorial-secondary:hover { 
      background: #e5e7eb; 
    }
    .tutorial-content .btn-tutorial-secondary:disabled {
      background: #f9fafb;
      color: #9ca3af;
      cursor: not-allowed;
      opacity: 0.6;
    }
    .tutorial-content .btn-tutorial-secondary:disabled:hover {
      background: #f9fafb;
    }
    .tutorial-content .btn-tutorial-skip { 
      background: transparent; 
      color: #6b7280; 
      text-decoration: underline;
    }
    .tutorial-content .btn-tutorial-skip:hover { 
      color: #374151; 
    }
    .tutorial-highlight { 
      position: fixed; 
      border: 4px solid #dc2626; 
      border-radius: 8px; 
      box-shadow: 
        0 0 0 9999px rgba(0, 0, 0, 0.5),
        0 0 0 4px rgba(220, 38, 38, 0.3), 
        0 0 30px rgba(220, 38, 38, 0.6),
        inset 0 0 60px rgba(255, 255, 255, 0.4),
        inset 0 0 120px rgba(255, 255, 255, 0.2);
      pointer-events: none;
      z-index: 10002;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      padding: 4px;
      margin: -4px;
      backdrop-filter: brightness(1.5) contrast(1.05);
      background: rgba(255, 255, 255, 0.1);
    }
    .tutorial-tooltip { 
      position: fixed; 
      background: #ffffff; 
      padding: 14px 18px; 
      border-radius: 8px; 
      box-shadow: 0 4px 16px rgba(0,0,0,0.25), 0 0 0 2px rgba(220, 38, 38, 0.2);
      font-size: 14px;
      color: #111827;
      max-width: 320px;
      z-index: 10003;
      pointer-events: none;
      line-height: 1.6;
    }
    .tutorial-tooltip strong {
      display: block;
      font-size: 15px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 6px;
    }
    .tutorial-tooltip::after {
      content: '';
      position: absolute;
      width: 0;
      height: 0;
      border: 8px solid transparent;
    }
    .tutorial-tooltip.top::after {
      bottom: -16px;
      left: 50%;
      transform: translateX(-50%);
      border-top-color: #ffffff;
    }
    .tutorial-tooltip.bottom::after {
      top: -16px;
      left: 50%;
      transform: translateX(-50%);
      border-bottom-color: #ffffff;
    }
    .tutorial-tooltip.left::after {
      right: -16px;
      top: 50%;
      transform: translateY(-50%);
      border-left-color: #ffffff;
    }
    .tutorial-tooltip.right::after {
      left: -16px;
      top: 50%;
      transform: translateY(-50%);
      border-right-color: #ffffff;
    }
    /* Replay tutorial button */
    .replay-tutorial-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      background: #ffffff;
      border: 2px solid #dc2626;
      border-radius: 12px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 14px;
      font-weight: 600;
      color: #dc2626;
      transition: all 0.2s;
    }
    .replay-tutorial-btn:hover {
      background: #fef2f2;
      box-shadow: 0 6px 16px rgba(220, 38, 38, 0.25);
      transform: translateY(-2px);
    }
    .replay-tutorial-btn span:first-child {
      font-size: 18px;
    }
    .replay-tutorial-text {
      display: inline-block;
    }
    @media (max-width: 768px) {
      .replay-tutorial-text {
        display: none;
      }
      .replay-tutorial-btn {
        padding: 10px;
        border-radius: 50%;
        width: 48px;
        height: 48px;
        justify-content: center;
      }
    }
    /* Playground mode styles */
    .playground-mode .normal-controls { display: none; }
    .playground-mode .playground-controls { display: flex; flex-direction: row; gap: 10px; align-items: center; }
    .playground-mode .control-buttons #b-play,
    .playground-mode .control-buttons #b-pause,
    .playground-mode .control-buttons #b-reset { display: none; }
    .playground-mode .control-buttons #pg-reset { display: inline-block !important; }
    .normal-mode .playground-controls { display: none; }
    .normal-mode .control-buttons #pg-reset { display: none !important; }
    .normal-mode .normal-controls { display: flex; flex-direction: row; gap: 10px; align-items: center; }
    .playground-goal { background: #fef2f2; border: 2px solid #dc2626; border-radius: 6px; padding: 8px; margin-bottom: 0; }
    .playground-goal h4 { margin: 0 0 4px 0; color: #dc2626; font-size: 12px; font-weight: 600; }
    .playground-goal .goal-text { color: #111827; font-weight: 600; margin-bottom: 4px; font-size: 12px; }
    .playground-goal .goal-progress { color: #374151; font-size: 11px; }
    .playground-goal.success { background: #f0fdf4; border-color: #059669; }
    .playground-goal.success h4 { color: #059669; }
    .playground-goal.failure { background: #fef2f2; border-color: #dc2626; }
    .playground-goal.attention { animation: goalPulse 1.8s ease-in-out infinite; }
    @keyframes goalPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.2); }
      50% { box-shadow: 0 0 0 6px rgba(220, 38, 38, 0.2); }
    }
    /* Toasts (lightweight notifications) */
    .toast-container { position: fixed; top: 20px; right: 20px; z-index: 10005; display: grid; gap: 8px; pointer-events: none; }
    .toast { pointer-events: auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 8px 24px rgba(0,0,0,0.15); padding: 10px 12px; font-size: 14px; color: #111827; display: flex; align-items: center; gap: 8px; transform: translateY(-12px); opacity: 0; animation: toastIn 120ms ease-out forwards; }
    .toast-success { border-left: 4px solid #059669; }
    .toast-failure { border-left: 4px solid #dc2626; }
    .toast .toast-close { background: transparent; border: none; color: #6b7280; font-size: 16px; line-height: 1; cursor: pointer; padding: 2px; margin-left: auto; }
    @keyframes toastIn { to { transform: translateY(0); opacity: 1; } }
    .parameter-explanation { font-size: 11px; color: #6b7280; margin-top: 4px; font-style: italic; }
    .imf-checkbox-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
    .imf-checkbox { display: flex; align-items: center; gap: 8px; }
    .imf-checkbox input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
    .imf-checkbox label { cursor: pointer; font-weight: 500; }
    /* Warning emoji styling */
    .warning-emoji { display: inline-block; margin-left: 4px; cursor: help; font-size: 14px; }
    /* Show IMF checkboxes in playground mode, hide in normal mode */
    .playground-mode .imf-checkbox-group { display: flex !important; flex-direction: row !important; gap: 16px !important; margin-bottom: 0 !important; flex-shrink: 0; }
    .normal-mode .imf-checkbox-group { display: none !important; }
    /* Debug panel styles */
    .debug-panel { 
      position: fixed; 
      top: 20px; 
      right: 20px; 
      width: 320px; 
      max-height: 80vh; 
      overflow-y: auto; 
      background: #ffffff; 
      border: 2px solid #dc2626; 
      border-radius: 8px; 
      padding: 12px; 
      font-family: 'IBM Plex Mono', monospace; 
      font-size: 11px; 
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: none;
    }
    .debug-panel.active { display: block; }
    .debug-panel h4 { 
      margin: 0 0 8px 0; 
      color: #dc2626; 
      font-size: 13px; 
      font-weight: 600; 
      cursor: move;
      user-select: none;
      padding: 4px;
      margin: -4px -4px 8px -4px;
      border-radius: 4px;
    }
    .debug-panel h4:hover {
      background: #fef2f2;
    }
    .debug-panel .debug-section { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
    .debug-panel .debug-section:last-child { border-bottom: none; }
    .debug-panel .debug-row { display: flex; justify-content: space-between; margin: 4px 0; }
    .debug-panel .debug-label { color: #6b7280; font-weight: 600; }
    .debug-panel .debug-value { color: #111827; }
    .debug-panel .debug-note { color: #9ca3af; font-size: 10px; margin-top: 4px; font-style: italic; }
  `;
  shadow.appendChild(shim);

  // Build HW-styled markup while preserving element IDs for logic
  const shell = document.createElement("div");
  shell.className = "container container--wide imfs-shell";
  shell.innerHTML = `
    <section class="panel">
      <h2 class="h5 eyebrow">IMFs: Intermolecular Forces Playground</h2>
      <p class="muted">Explore hydrogen bonding, dipole–dipole, and dispersion using a particle-level sandbox with molecule close-ups for context.</p>
    </section>
    <section class="panel">
      <div class="imfs-wrap">
        <div class="imfs-controls-row">
          <div class="panel">
            <div class="controls-compact">
              <div class="control-group">
                <button id="mode-toggle" class="btn" style="padding: 6px 12px; font-size: 13px; white-space: nowrap; width: 100%;">Switch to Playground</button>
              </div>
              <div class="normal-controls">
                <div class="control-group compact-dropdown">
                  <label class="label">Material</label>
                  <select id="s-material" class="select" style="width:100%; padding:4px 8px; border:1px solid #d1d5db; border-radius:4px; background:#ffffff; color:#111827; font-size:13px;">
                    <option value="honey">Honey</option>
                    <option value="dmso">DMSO</option>
                    <option value="hexane">Hexane</option>
                  </select>
                </div>
                <div class="control-group compact-dropdown">
                  <label class="label">Particles <span class="warning-emoji" title="Performance degrades over 250 particles">⚠️</span></label>
                  <input id="s-n" class="range" type="range" min="40" max="500" step="10" value="200">
                  <span class="muted" id="v-n" style="font-size:11px;"></span>
                </div>
                <div class="control-group compact-dropdown">
                  <label class="label">Heat Intensity</label>
                  <input id="s-heat" class="range" type="range" min="0" max="5" step="0.1" value="5.0">
                  <span class="muted" id="v-heat" style="font-size:11px;"></span>
                </div>
              </div>
              <div class="toggle-buttons-group">
                <button id="t-gravity" class="btn btn--outline">Gravity</button>
                <button id="t-contour" class="btn btn--outline">Contour</button>
                <button id="t-molecules" class="btn btn--outline">Molecules</button>
              </div>
              <div class="heat-button-wrapper">
                <button id="t-heat" class="btn btn--outline">Heat</button>
              </div>
              <div class="playground-controls">
                <div class="playground-params-dropdown">
                  <button id="playground-params-toggle" class="playground-params-toggle" style="padding: 6px 10px; font-size: 13px;">Parameters</button>
                  <div class="playground-params-menu">
                    <div class="field">
                      <label class="label">Viscosity</label>
                      <input id="pg-viscosity" class="range" type="range" min="0.05" max="10" step="0.05" value="1.0">
                      <span class="muted" id="v-viscosity">1.0</span>
                      <div class="parameter-explanation">Controls how strongly particles stick together. Higher = stronger IMFs, harder to evaporate</div>
                    </div>
                    <div class="field">
                      <label class="label">Epsilon (LDF Strength)</label>
                      <input id="pg-epsilon" class="range" type="range" min="0.05" max="0.7" step="0.01" value="0.3">
                      <span class="muted" id="v-epsilon">0.3</span>
                      <div class="parameter-explanation">London Dispersion Force strength. Higher = stronger attraction between nonpolar molecules</div>
                    </div>
                    <div class="field">
                      <label class="label">Sigma (Particle Size)</label>
                      <input id="pg-sigma" class="range" type="range" min="8" max="12" step="0.5" value="10">
                      <span class="muted" id="v-sigma">10</span>
                      <div class="parameter-explanation">Particle size/radius. Affects collision frequency and packing</div>
                    </div>
                    <div class="field">
                      <label class="label">Hydrogen Bond Strength</label>
                      <input id="pg-hbStrength" class="range" type="range" min="0" max="3" step="0.1" value="1.5">
                      <span class="muted" id="v-hbStrength">1.5</span>
                      <div class="parameter-explanation">Strength of H-bonds (only active if H-bond checkbox enabled). Higher = much stronger attraction</div>
                    </div>
                    <div class="field">
                      <label class="label">Dipole Strength</label>
                      <input id="pg-dipole" class="range" type="range" min="0" max="2" step="0.1" value="0.5">
                      <span class="muted" id="v-dipole">0.5</span>
                      <div class="parameter-explanation">Dipole-dipole interaction strength (only active if Dipole checkbox enabled)</div>
                    </div>
                    <div class="field">
                      <label class="label">Particles (N) <span class="warning-emoji" title="Performance degrades over 250 particles">⚠️</span></label>
                      <input id="pg-n" class="range" type="range" min="40" max="500" step="10" value="200">
                      <span class="muted" id="v-pg-n">200</span>
                      <div class="parameter-explanation">Number of particles in simulation</div>
                    </div>
                    <div class="field">
                      <label class="label">Heat Intensity</label>
                      <input id="pg-heat" class="range" type="range" min="0" max="5" step="0.1" value="5.0">
                      <span class="muted" id="v-pg-heat">5.0</span>
                      <div class="parameter-explanation">How much thermal energy is added per second</div>
                    </div>
                  </div>
                </div>
                <div class="playground-goal" id="playground-goal" style="padding: 8px; margin-bottom: 0;">
                  <h4>🎯 Goal</h4>
                  <div class="goal-text" id="goal-text" style="font-size: 12px; margin-bottom: 4px;">Loading...</div>
                  <div class="goal-progress" id="goal-progress" style="font-size: 11px;">Ready</div>
                </div>
                <div class="imf-checkbox-group">
                  <div class="imf-checkbox">
                    <input type="checkbox" id="cb-hbond" checked>
                    <label for="cb-hbond" style="font-size: 12px;">H-bond</label>
                  </div>
                  <div class="imf-checkbox">
                    <input type="checkbox" id="cb-dipole" checked>
                    <label for="cb-dipole" style="font-size: 12px;">Dipole</label>
                  </div>
                </div>
              </div>
              <div class="control-buttons">
                <button id="b-play" class="btn" style="padding: 6px 12px; font-size: 13px; min-width: 60px;">Play</button>
                <button id="b-pause" class="btn btn--outline" style="padding: 6px 12px; font-size: 13px; min-width: 60px;">Pause</button>
                <button id="b-reset" class="btn btn--ghost" style="padding: 6px 12px; font-size: 13px; min-width: 60px;">Reset</button>
                <button id="pg-reset" class="btn btn--ghost" style="padding: 6px 12px; font-size: 13px; min-width: 60px; display: none;">Reset Playground</button>
              </div>
            </div>
          </div>
        </div>
        <div class="imfs-main-row">
          <div id="ai-narrator" class="ai-narrator-panel">
            <div class="narrator-content">
              <p class="line muted">Live narration will explain what you see and how it relates to IMFs (hydrogen bonding, dipole–dipole, and London dispersion).</p>
            </div>
          </div>
          <canvas id="imfs-sim" class="imfs-sim" width="225" height="420" aria-label="Intermolecular forces simulation" role="img"></canvas>
          <canvas id="imfs-gas" class="imfs-gas" width="450" height="420" aria-label="Gas and escaped particles chart" role="img"></canvas>
        </div>
        <div class="imfs-3d-row">
          <div id="imfs-3d" class="imfs-3d" aria-label="3D molecule" role="img"></div>
        </div>
        <div class="imfs-educational-row">
          <div id="imfs-educational" class="imfs-educational">
            <h3 class="h5" style="margin-top:0; margin-bottom:16px;">Understanding Intermolecular Forces</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
              <div>
                <h4 style="margin-top:0; margin-bottom:12px; color: #111827; font-size: 16px; font-weight: 600;">What Are IMFs?</h4>
                <p style="margin: 0 0 12px 0; color: #374151; line-height: 1.6;">
                  Intermolecular forces (IMFs) are attractive forces between molecules that determine many physical properties, including boiling point, melting point, viscosity, and solubility. Unlike chemical bonds (which hold atoms together within molecules), IMFs are weaker forces that act between separate molecules.
                </p>
                <p style="margin: 0; color: #374151; line-height: 1.6;">
                  The strength of IMFs directly affects how easily molecules can escape from the liquid phase into the gas phase—a process called evaporation. Stronger IMFs mean higher boiling points and slower evaporation rates.
                </p>
              </div>
              <div>
                <h4 style="margin-top:0; margin-bottom:12px; color: #111827; font-size: 16px; font-weight: 600;">Types of IMFs</h4>
                <p style="margin: 0 0 8px 0; color: #374151; line-height: 1.6;">
                  <strong style="color: #dc2626;">Hydrogen Bonding:</strong> The strongest IMF, occurring when H is bonded to N, O, or F. Hydrogen bonds are directional and can be 10-40 kJ/mol. Examples: water, honey, DNA base pairs.
                </p>
                <p style="margin: 0 0 8px 0; color: #374151; line-height: 1.6;">
                  <strong style="color: #dc2626;">Dipole–Dipole:</strong> Attractions between polar molecules with permanent dipoles. Strength: 5-25 kJ/mol. Examples: DMSO, acetone, chloroform.
                </p>
                <p style="margin: 0; color: #374151; line-height: 1.6;">
                  <strong style="color: #dc2626;">London Dispersion Forces (LDFs):</strong> Weakest IMF, caused by temporary electron distribution fluctuations. Present in all molecules, but dominant in nonpolar substances. Strength: 0.1-10 kJ/mol. Examples: hexane, noble gases, alkanes.
                </p>
              </div>
              <div>
                <h4 style="margin-top:0; margin-bottom:12px; color: #111827; font-size: 16px; font-weight: 600;">Real-World Impacts</h4>
                <p style="margin: 0 0 8px 0; color: #374151; line-height: 1.6;">
                  <strong>Boiling Points:</strong> Water (H-bonding) boils at 100°C, while hexane (LDFs only) boils at 69°C. Stronger IMFs require more energy to separate molecules.
                </p>
                <p style="margin: 0 0 8px 0; color: #374151; line-height: 1.6;">
                  <strong>Viscosity:</strong> Honey's high viscosity comes from extensive H-bonding networks. Motor oils use long-chain molecules to increase LDFs and viscosity.
                </p>
                <p style="margin: 0 0 8px 0; color: #374151; line-height: 1.6;">
                  <strong>Solubility:</strong> "Like dissolves like"—polar solvents (water) dissolve polar solutes; nonpolar solvents (hexane) dissolve nonpolar solutes.
                </p>
                <p style="margin: 0; color: #374151; line-height: 1.6;">
                  <strong>Surface Tension:</strong> Water's high surface tension (due to H-bonding) allows insects to walk on it and creates the meniscus in glass tubes.
                </p>
              </div>
            </div>
            <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <h4 style="margin-top:0; margin-bottom:12px; color: #111827; font-size: 16px; font-weight: 600;">Sources & Further Reading</h4>
              <ul style="margin: 0; padding-left: 20px; color: #374151; line-height: 1.8;">
                <li>Brown, T. L., et al. <em>Chemistry: The Central Science</em>. Pearson Education.</li>
                <li>Atkins, P., & de Paula, J. <em>Physical Chemistry</em>. Oxford University Press.</li>
                <li>Zumdahl, S. S., & Zumdahl, S. A. <em>Chemistry</em>. Cengage Learning.</li>
                <li>Khan Academy: <a href="https://www.khanacademy.org/science/ap-chemistry-beta" style="color: #dc2626; text-decoration: none;">Intermolecular Forces</a></li>
                <li>LibreTexts Chemistry: <a href="https://chem.libretexts.org/Bookshelves/Physical_and_Theoretical_Chemistry_Textbook_Maps" style="color: #dc2626; text-decoration: none;">Intermolecular Forces and Liquids</a></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
    <div id="debug-panel" class="debug-panel">
      <h4>🔍 Particle Debug Info</h4>
      <div id="debug-content"></div>
    </div>
    <div id="tutorial-overlay" class="tutorial-overlay hidden">
      <div class="tutorial-content">
        <div class="tutorial-step-indicator" id="tutorial-step-indicator">1/8</div>
        <div class="tutorial-text-content" id="tutorial-text-content" style="display: none;"></div>
        <div class="tutorial-buttons">
          <button class="btn-tutorial btn-tutorial-skip" id="tutorial-skip">Skip</button>
          <button class="btn-tutorial btn-tutorial-secondary" id="tutorial-prev" style="display: none;">&lt;</button>
          <button class="btn-tutorial btn-tutorial-primary" id="tutorial-next">&gt;</button>
        </div>
      </div>
      <div class="tutorial-intro-modal" id="tutorial-intro-modal" style="display: none;">
        <div class="tutorial-intro-content">
          <h3 id="tutorial-intro-title"></h3>
          <p id="tutorial-intro-text"></p>
        </div>
      </div>
      <div class="tutorial-highlight" id="tutorial-highlight"></div>
      <div class="tutorial-tooltip" id="tutorial-tooltip"></div>
    </div>
    <button id="replay-tutorial-btn" class="replay-tutorial-btn" title="Replay Tutorial">
      <span>📚</span>
      <span class="replay-tutorial-text">Replay Tutorial</span>
    </button>
  `;
  shadow.appendChild(shell);

  const refs = {
    sim: shadow.querySelector("#imfs-sim"),
    gas: shadow.querySelector("#imfs-gas"),
    mol: shadow.querySelector("#imfs-mol"),
    mol3d: shadow.querySelector("#imfs-3d"),
    narrator: shadow.querySelector("#ai-narrator"),
    sMaterial: shadow.querySelector("#s-material"),
    sN: shadow.querySelector("#s-n"),
    sHeat: shadow.querySelector("#s-heat"),
    vN: shadow.querySelector("#v-n"),
    vHeat: shadow.querySelector("#v-heat"),
    settingsToggle: shadow.querySelector("#settings-toggle"),
    settingsDropdown: shadow.querySelector(".settings-dropdown"),
    modeToggle: shadow.querySelector("#mode-toggle"),
    playgroundGoal: shadow.querySelector("#playground-goal"),
    goalText: shadow.querySelector("#goal-text"),
    goalProgress: shadow.querySelector("#goal-progress"),
    cbHbond: shadow.querySelector("#cb-hbond"),
    cbDipole: shadow.querySelector("#cb-dipole"),
    cbLdf: shadow.querySelector("#cb-ldf"),
    pgViscosity: shadow.querySelector("#pg-viscosity"),
    pgEpsilon: shadow.querySelector("#pg-epsilon"),
    pgSigma: shadow.querySelector("#pg-sigma"),
    pgHbStrength: shadow.querySelector("#pg-hbStrength"),
    pgDipole: shadow.querySelector("#pg-dipole"),
    pgN: shadow.querySelector("#pg-n"),
    pgHeat: shadow.querySelector("#pg-heat"),
    vViscosity: shadow.querySelector("#v-viscosity"),
    vEpsilon: shadow.querySelector("#v-epsilon"),
    vSigma: shadow.querySelector("#v-sigma"),
    vHbStrength: shadow.querySelector("#v-hbStrength"),
    vDipole: shadow.querySelector("#v-dipole"),
    vPgN: shadow.querySelector("#v-pg-n"),
    vPgHeat: shadow.querySelector("#v-pg-heat"),
    pgReset: shadow.querySelector("#pg-reset"),
    playgroundParamsToggle: shadow.querySelector("#playground-params-toggle"),
    playgroundParamsDropdown: shadow.querySelector(
      ".playground-params-dropdown"
    ),
    tGravity: shadow.querySelector("#t-gravity"),
    tContour: shadow.querySelector("#t-contour"),
    tMolecules: shadow.querySelector("#t-molecules"),
    tHeat: shadow.querySelector("#t-heat"),
    debugPanel: shadow.querySelector("#debug-panel"),
    debugContent: shadow.querySelector("#debug-content"),
    tutorialOverlay: shadow.querySelector("#tutorial-overlay"),
    tutorialStepIndicator: shadow.querySelector("#tutorial-step-indicator"),
    tutorialNext: shadow.querySelector("#tutorial-next"),
    tutorialPrev: shadow.querySelector("#tutorial-prev"),
    tutorialSkip: shadow.querySelector("#tutorial-skip"),
    tutorialHighlight: shadow.querySelector("#tutorial-highlight"),
    tutorialTooltip: shadow.querySelector("#tutorial-tooltip"),
    tutorialTextContent: shadow.querySelector("#tutorial-text-content"),
    tutorialIntroModal: shadow.querySelector("#tutorial-intro-modal"),
    tutorialIntroTitle: shadow.querySelector("#tutorial-intro-title"),
    tutorialIntroText: shadow.querySelector("#tutorial-intro-text"),
    replayTutorialBtn: shadow.querySelector("#replay-tutorial-btn"),
    // no thermostat box; KE is graphed below
  };

  const sim = new IMFSim(refs.sim);
  // 3Dmol viewer setup
  let viewer = null;
  let themeObserver = null;
  async function ensureViewer() {
    if (viewer || !refs.mol3d) return viewer;
    if (!window.$3Dmol) return null;
    const bg = getComputedStyle(refs.mol3d).backgroundColor || "#ffffff";
    viewer = $3Dmol.createViewer(refs.mol3d, { backgroundColor: bg.trim() });
    // Disable zoom interactions after viewer is created
    if (refs.mol3d) {
      // Find canvas inside viewer and disable pointer events
      // This allows page scrolling to work normally over the 3D model
      setTimeout(() => {
        const canvas = refs.mol3d.querySelector("canvas");
        if (canvas) {
          canvas.style.pointerEvents = "none";
        }
      }, 100);
    }
    themeObserver = new MutationObserver(() => {
      const newBg = getComputedStyle(refs.mol3d).backgroundColor || "#ffffff";
      try {
        viewer.setBackgroundColor(newBg.trim());
        viewer.render();
      } catch (_) {}
    });
    themeObserver.observe(refs.mol3d, { attributes: true });
    return viewer;
  }
  async function fetchSDFByCID(cid) {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=3d`;
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      if (!text || text.length < 10) throw new Error("Empty SDF");
      return text;
    } catch (_) {
      return null;
    }
  }
  const SDF_FALLBACK = {
    679: `
  DMSO
  3Dmol

  8  7  0  0  0  0            999 V2000
    0.0000   0.0000   0.0000 S   0  0  0  0  0  0
    1.4300   0.0000   0.0000 O   0  0  0  0  0  0
   -0.5400   1.2000   0.8000 C   0  0  0  0  0  0
   -0.5400  -1.2000  -0.8000 C   0  0  0  0  0  0
   -1.5400   1.9000   0.4000 H   0  0  0  0  0  0
    0.1600   1.8000   1.6000 H   0  0  0  0  0  0
   -0.0400   1.4000  -0.1000 H   0  0  0  0  0  0
   -1.5400  -1.9000  -0.4000 H   0  0  0  0  0  0
  1  2  2  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  3  5  1  0  0  0  0
  3  6  1  0  0  0  0
  3  7  1  0  0  0  0
  4  8  1  0  0  0  0
M  END
`,
    8058: `
  HEXANE
  3Dmol

  20 19  0  0  0  0            999 V2000
   -2.0000   0.0000   0.0000 C   0  0  0  0  0  0
   -1.0000   0.8000   0.8000 C   0  0  0  0  0  0
    0.0000   0.0000   0.0000 C   0  0  0  0  0  0
    1.0000   0.8000   0.8000 C   0  0  0  0  0  0
    2.0000   0.0000   0.0000 C   0  0  0  0  0  0
    3.0000   0.8000   0.8000 C   0  0  0  0  0  0
   -2.6000  -0.9000   0.4000 H   0  0  0  0  0  0
   -2.6000   0.9000  -0.4000 H   0  0  0  0  0  0
   -1.4000   1.7000   0.2000 H   0  0  0  0  0  0
   -1.4000   0.3000   1.7000 H   0  0  0  0  0  0
    0.4000   0.9000  -0.8000 H   0  0  0  0  0  0
   -0.4000  -0.9000  -0.8000 H   0  0  0  0  0  0
    0.6000   1.7000   1.6000 H   0  0  0  0  0  0
    1.4000   0.3000   1.7000 H   0  0  0  0  0  0
    2.4000   0.9000  -0.8000 H   0  0  0  0  0  0
    1.6000  -0.9000  -0.8000 H   0  0  0  0  0  0
    3.6000   1.7000   0.2000 H   0  0  0  0  0  0
    3.6000   0.3000   1.7000 H   0  0  0  0  0  0
    3.4000   0.0000   0.0000 H   0  0  0  0  0  0
    2.6000  -0.9000  -0.8000 H   0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
  3  4  1  0  0  0  0
  4  5  1  0  0  0  0
  5  6  1  0  0  0  0
  1  7  1  0  0  0  0
  1  8  1  0  0  0  0
  2  9  1  0  0  0  0
  2 10  1  0  0  0  0
  3 11  1  0  0  0  0
  3 12  1  0  0  0  0
  4 13  1  0  0  0  0
  4 14  1  0  0  0  0
  5 15  1  0  0  0  0
  5 16  1  0  0  0  0
  6 17  1  0  0  0  0
  6 18  1  0  0  0  0
  6 19  1  0  0  0  0
M  END
`,
  };
  async function load3DByCID(cid) {
    const v = await ensureViewer();
    if (!v) return;
    try {
      v.clear();
    } catch (_) {}
    let sdf = await fetchSDFByCID(cid);
    if (!sdf && SDF_FALLBACK[cid]) sdf = SDF_FALLBACK[cid];
    if (sdf) {
      v.addModel(sdf, "sdf");
      v.setStyle(
        {},
        { stick: { colorscheme: "Jmol" }, sphere: { scale: 0.25 } }
      );
      v.zoomTo();
      v.render();
      // Ensure zoom is disabled after loading
      if (refs.mol3d) {
        const canvas = refs.mol3d.querySelector("canvas");
        if (canvas) {
          canvas.style.pointerEvents = "none";
        }
      }
    }
  }
  function choosePreviewCID(kind) {
    if (kind === "dmso") return 679;
    if (kind === "hexane") return 8058;
    const ids = [5793, 5984, 962];
    const key = "imfs_honey3d_idx";
    let idx = 0;
    try {
      idx = (parseInt(localStorage.getItem(key) || "0", 10) || 0) + 1;
    } catch (_) {}
    idx = idx % ids.length;
    try {
      localStorage.setItem(key, String(idx));
    } catch (_) {}
    return ids[idx];
  }

  function updateReadouts() {
    refs.vN.textContent = String(sim.params.N);
    refs.vHeat.textContent = String(sim.heatIntensity.toFixed(1));
    // Update playground readouts if in playground mode
    if (playgroundMode && refs.vViscosity) {
      refs.vViscosity.textContent = Number(refs.pgViscosity.value).toFixed(2);
      refs.vEpsilon.textContent = Number(refs.pgEpsilon.value).toFixed(2);
      refs.vSigma.textContent = Number(refs.pgSigma.value).toFixed(1);
      refs.vHbStrength.textContent = Number(refs.pgHbStrength.value).toFixed(1);
      refs.vDipole.textContent = Number(refs.pgDipole.value).toFixed(1);
      refs.vPgN.textContent = String(refs.pgN.value);
      refs.vPgHeat.textContent = Number(refs.pgHeat.value).toFixed(1);
    }
    // KE readout is updated via animation loop
  }

  let currentKind = "honey";
  // Playground mode state
  let playgroundMode = false;
  let currentGoal = null;

  // Goal definitions - varied and interesting goals with ranges
  const possibleGoals = [
    {
      type: "range",
      min: 20,
      max: 35,
      text: "Achieve moderate evaporation: 20-35% evaporated",
    },
    {
      type: "range",
      min: 45,
      max: 60,
      text: "Reach substantial evaporation: 45-60% evaporated",
    },
    {
      type: "range",
      min: 70,
      max: 85,
      text: "Achieve high evaporation: 70-85% evaporated",
    },
    {
      type: "range",
      min: 10,
      max: 25,
      text: "Keep evaporation low: 10-25% evaporated (strong IMFs)",
    },
    {
      type: "range",
      min: 55,
      max: 75,
      text: "Reach significant evaporation: 55-75% evaporated",
    },
    {
      type: "range",
      min: 30,
      max: 50,
      text: "Achieve balanced evaporation: 30-50% evaporated",
    },
    {
      type: "range",
      min: 5,
      max: 20,
      text: "Minimize evaporation: 5-20% evaporated (very strong IMFs)",
    },
    {
      type: "range",
      min: 65,
      max: 80,
      text: "Achieve high evaporation: 65-80% evaporated",
    },
    {
      type: "range",
      min: 25,
      max: 45,
      text: "Reach moderate-to-high evaporation: 25-45% evaporated",
    },
    {
      type: "range",
      min: 80,
      max: 95,
      text: "Achieve very high evaporation: 80-95% evaporated (weak IMFs)",
    },
  ];

  function generateRandomGoal() {
    const goal =
      possibleGoals[Math.floor(Math.random() * possibleGoals.length)];
    currentGoal = { ...goal };
    if (refs.goalText) {
      refs.goalText.textContent = goal.text;
    }
    return goal;
  }

  function checkGoal(escapedPct) {
    if (!currentGoal) return null;
    let success = false;
    if (currentGoal.type === "exact") {
      success = Math.abs(escapedPct - currentGoal.target) < 2; // Within 2%
    } else if (currentGoal.type === "range") {
      success = escapedPct >= currentGoal.min && escapedPct <= currentGoal.max;
    }
    return success;
  }

  function getParameterLimits() {
    const hbond = refs.cbHbond?.checked || false;
    const dipole = refs.cbDipole?.checked || false;
    const ldf = true; // Always active

    let viscosityMin = 0.05,
      viscosityMax = 10;
    let epsilonMin = 0.05,
      epsilonMax = 0.7;

    if (hbond && dipole) {
      // Union: both checked - use the broader range that encompasses both
      viscosityMin = Math.min(5, 0.5); // 0.5 (min of both mins)
      viscosityMax = Math.max(10, 2); // 10 (max of both maxes)
      epsilonMin = Math.min(0.5, 0.4); // 0.4 (min of both mins)
      epsilonMax = Math.max(0.7, 0.6); // 0.7 (max of both maxes)
    } else if (hbond) {
      viscosityMin = 5;
      viscosityMax = 10;
      epsilonMin = 0.5;
      epsilonMax = 0.7;
    } else if (dipole) {
      viscosityMin = 0.5;
      viscosityMax = 2;
      epsilonMin = 0.4;
      epsilonMax = 0.6;
    } else {
      // Only LDF
      viscosityMin = 0.05;
      viscosityMax = 1;
      epsilonMin = 0.05;
      epsilonMax = 0.3;
    }

    return { viscosityMin, viscosityMax, epsilonMin, epsilonMax };
  }

  function updateParameterLimits() {
    const limits = getParameterLimits();
    if (refs.pgViscosity) {
      refs.pgViscosity.min = String(limits.viscosityMin);
      refs.pgViscosity.max = String(limits.viscosityMax);
      let val = Number(refs.pgViscosity.value);
      if (val < limits.viscosityMin) val = limits.viscosityMin;
      if (val > limits.viscosityMax) val = limits.viscosityMax;
      refs.pgViscosity.value = String(val);
    }
    if (refs.pgEpsilon) {
      refs.pgEpsilon.min = String(limits.epsilonMin);
      refs.pgEpsilon.max = String(limits.epsilonMax);
      let val = Number(refs.pgEpsilon.value);
      if (val < limits.epsilonMin) val = limits.epsilonMin;
      if (val > limits.epsilonMax) val = limits.epsilonMax;
      refs.pgEpsilon.value = String(val);
    }
    // Enable/disable H-bond and Dipole sliders based on checkboxes
    if (refs.pgHbStrength) {
      refs.pgHbStrength.disabled = !refs.cbHbond?.checked;
    }
    if (refs.pgDipole) {
      refs.pgDipole.disabled = !refs.cbDipole?.checked;
    }
    updateReadouts();
  }

  function applyPlaygroundParams() {
    if (!playgroundMode) return;
    sim.params.viscosity = Number(refs.pgViscosity.value);
    sim.params.epsilon = Number(refs.pgEpsilon.value);
    sim.params.sigma = Number(refs.pgSigma.value);
    sim.params.hbStrength = refs.cbHbond?.checked
      ? Number(refs.pgHbStrength.value)
      : 0;
    sim.params.dipole = refs.cbDipole?.checked
      ? Number(refs.pgDipole.value)
      : 0;
    sim.params.N = Math.round(Number(refs.pgN.value));
    sim.heatIntensity = Number(refs.pgHeat.value);
    sim.adjustParticleCount(sim.params.N);
    applyIMFCoeffsFor(sim, "playground");
    sim.currentScenario = "playground"; // Set scenario for tracking
    sim.spawnParticles();
    sim.draw();
  }

  function resetPlayground() {
    const limits = getParameterLimits();
    // Reset to middle of allowed ranges
    const viscosityDefault = (limits.viscosityMin + limits.viscosityMax) / 2;
    const epsilonDefault = (limits.epsilonMin + limits.epsilonMax) / 2;

    if (refs.pgViscosity) refs.pgViscosity.value = String(viscosityDefault);
    if (refs.pgEpsilon) refs.pgEpsilon.value = String(epsilonDefault);
    if (refs.pgSigma) refs.pgSigma.value = "10";
    if (refs.pgHbStrength) refs.pgHbStrength.value = "1.5";
    if (refs.pgDipole) refs.pgDipole.value = "0.5";
    if (refs.pgN) refs.pgN.value = "200";
    if (refs.pgHeat) refs.pgHeat.value = "5.0";

    updateParameterLimits();
    applyPlaygroundParams();

    // Generate a new goal
    generateRandomGoal();
    if (refs.playgroundGoal) {
      refs.playgroundGoal.classList.remove("success", "failure");
    }
    if (refs.goalProgress) {
      refs.goalProgress.textContent = "Ready to start";
    }

    // Reset graph - clear playground data to show grey overlay
    sim.gasHistory = sim.gasHistory.filter((p) => p.scenario !== "playground");
    sim.gasStart = performance.now();
    sim.escapedCount = 0;
    sim.escapedParticles = [];
    sim.trialEnded = false;

    // Reset and pause simulation
    sim.heatingOn = false;
    if (refs.tHeat) {
      refs.tHeat.classList.remove("is-active");
    }
    if (refs.sim) refs.sim.classList.remove("is-heating");
    sim.stop(); // Stop/pause simulation
    sim.spawnParticles(); // Restart particles
    sim.draw();
  }

  function togglePlaygroundMode() {
    // Fully reset everything when switching modes
    sim.stop();
    sim.heatingOn = false;
    if (refs.tHeat) {
      refs.tHeat.classList.remove("is-active");
    }
    if (refs.sim) refs.sim.classList.remove("is-heating");

    // Reset graph - clear all data to show grey overlay
    sim.gasHistory = [];
    sim.gasCount = 0;
    sim.escapedCount = 0;
    sim.escapedParticles = [];
    sim.trialEnded = false;
    sim.completedTrials.clear();
    sim.gasStart = performance.now();

    // Redraw graph to show reset state (grey overlay)
    sim.drawGasGraph();

    playgroundMode = !playgroundMode;
    const shellElement = shadow.querySelector(".imfs-shell");
    if (shellElement) {
      shellElement.classList.remove("normal-mode", "playground-mode");
      shellElement.classList.add(
        playgroundMode ? "playground-mode" : "normal-mode"
      );
    }
    if (refs.modeToggle) {
      refs.modeToggle.textContent = playgroundMode
        ? "Education Edition"
        : "Playground";
    }
    if (playgroundMode) {
      // Reset to playground mode
      sim.currentScenario = "playground";
      updateParameterLimits();
      generateRandomGoal();
      if (refs.playgroundGoal) {
        refs.playgroundGoal.classList.add("attention");
      }
      applyPlaygroundParams();
      sim.spawnParticles();
      sim.draw();
      try {
        renderNarration(true);
      } catch (_) {}
    } else {
      // Reset to education edition mode - fully reset
      setScenario("honey");
      sim.spawnParticles();
      sim.draw();
    }
  }

  function setScenario(kind, autoStart = false) {
    // Preserve user settings before changing scenario
    const preservedSettings = {
      contourOn: sim.contourOn,
      moleculesVisible: sim.moleculesVisible,
      gravityOn: sim.gravityOn,
      shadeContour: sim.shadeContour,
      heatingOn: sim.heatingOn,
    };

    sim.changeScenario(kind);
    const accent = scenarioColor(kind);
    sim.params.color = accent;
    applyIMFCoeffsFor(sim, kind);

    // Restore user settings
    sim.contourOn = preservedSettings.contourOn;
    sim.moleculesVisible = preservedSettings.moleculesVisible;
    sim.gravityOn = preservedSettings.gravityOn;
    sim.shadeContour = preservedSettings.shadeContour;

    // Update UI to reflect preserved settings
    if (refs.tContour) {
      refs.tContour.classList.toggle("is-active", sim.contourOn);
    }
    if (refs.tMolecules) {
      refs.tMolecules.classList.toggle("is-active", sim.moleculesVisible);
    }
    if (refs.tGravity) {
      refs.tGravity.classList.toggle("is-active", sim.gravityOn);
    }

    // Always pause and respawn particles when switching materials (unless autoStart)
    if (!autoStart) {
      sim.stop();
      sim.heatingOn = false;
      if (refs.tHeat) {
        refs.tHeat.classList.remove("is-active");
      }
      if (refs.sim) {
        refs.sim.classList.remove("is-heating");
      }
      sim.spawnParticles();
      sim.draw();
    }

    // Update AI narrator immediately on scenario change
    if (typeof renderNarration === "function") {
      try {
        renderNarration(true);
      } catch (_) {}
    }
    // Update shell dataset and CSS var for accent glow
    try {
      const rootShell = shadow.querySelector(".imfs-shell");
      if (rootShell) {
        rootShell.dataset.kind = kind;
        rootShell.style.setProperty("--imfs-accent", accent);
      }
    } catch (_) {}
    // Update dropdown selection
    try {
      if (refs.sMaterial) {
        refs.sMaterial.value = kind;
      }
    } catch (_) {}
    if (kind === "honey") {
      if (refs.mol)
        renderMolecule(refs.mol, molecules.honeyDuo(), {
          scale: 1.0,
          stroke: accent,
          labelColor: accent,
        });
      // No 3D viewer
    } else if (kind === "dmso") {
      if (refs.mol)
        renderMolecule(refs.mol, molecules.dmso(), {
          scale: 1.0,
          stroke: accent,
          labelColor: accent,
        });
      // No 3D viewer
    } else {
      if (refs.mol)
        renderMolecule(refs.mol, molecules.hexane(), {
          scale: 1.0,
          stroke: accent,
          labelColor: accent,
        });
      // No 3D viewer
    }
    // Sync particle count slider with actual value
    try {
      if (refs.sN) {
        refs.sN.value = String(sim.params.N);
      }
    } catch (_) {}
    updateReadouts();
    currentKind = kind;
    // Update ball-and-stick 3D preview (3Dmol)
    try {
      const cid = choosePreviewCID(kind);
      load3DByCID(cid);
    } catch (_) {}
  }

  // Events
  if (refs.sMaterial) {
    refs.sMaterial.addEventListener("change", (e) => {
      if (!playgroundMode) {
        setScenario(e.target.value);
      }
    });
  }
  if (refs.sN) {
    refs.sN.addEventListener("input", (e) => {
      if (!playgroundMode) {
        sim.params.N = Math.round(Number(e.target.value));
        sim.adjustParticleCount(sim.params.N);
        updateReadouts();
      }
    });
  }
  if (refs.sHeat) {
    refs.sHeat.addEventListener("input", (e) => {
      if (!playgroundMode) {
        sim.heatIntensity = Number(e.target.value);
        updateReadouts();
      }
    });
  }
  shadow.querySelector("#b-play").addEventListener("click", () => sim.start());
  shadow.querySelector("#b-pause").addEventListener("click", () => sim.stop());
  shadow.querySelector("#b-reset").addEventListener("click", () => {
    // Reset only the current trial's data from gasHistory
    if (sim.currentScenario) {
      sim.gasHistory = sim.gasHistory.filter(
        (p) => p.scenario !== sim.currentScenario
      );
    }
    // Reset trial state
    sim.gasStart = performance.now();
    sim.escapedCount = 0;
    sim.escapedParticles = [];
    sim.trialEnded = false;
    sim.spawnParticles();
    sim.draw();
  });

  // Playground mode toggle
  if (refs.modeToggle) {
    refs.modeToggle.addEventListener("click", togglePlaygroundMode);
  }

  // Reset playground button
  if (refs.pgReset) {
    refs.pgReset.addEventListener("click", resetPlayground);
  }

  // Playground parameter controls
  if (refs.pgViscosity) {
    refs.pgViscosity.addEventListener("input", (e) => {
      updateReadouts();
      applyPlaygroundParams();
    });
  }
  if (refs.pgEpsilon) {
    refs.pgEpsilon.addEventListener("input", (e) => {
      updateReadouts();
      applyPlaygroundParams();
    });
  }
  if (refs.pgSigma) {
    refs.pgSigma.addEventListener("input", (e) => {
      updateReadouts();
      applyPlaygroundParams();
    });
  }
  if (refs.pgHbStrength) {
    refs.pgHbStrength.addEventListener("input", (e) => {
      updateReadouts();
      applyPlaygroundParams();
    });
  }
  if (refs.pgDipole) {
    refs.pgDipole.addEventListener("input", (e) => {
      updateReadouts();
      applyPlaygroundParams();
    });
  }
  if (refs.pgN) {
    refs.pgN.addEventListener("input", (e) => {
      updateReadouts();
      applyPlaygroundParams();
    });
  }
  if (refs.pgHeat) {
    refs.pgHeat.addEventListener("input", (e) => {
      updateReadouts();
      sim.heatIntensity = Number(e.target.value);
    });
  }

  // IMF checkbox handlers
  if (refs.cbHbond) {
    refs.cbHbond.addEventListener("change", () => {
      updateParameterLimits();
      applyPlaygroundParams();
    });
  }
  if (refs.cbDipole) {
    refs.cbDipole.addEventListener("change", () => {
      updateParameterLimits();
      applyPlaygroundParams();
    });
  }

  function updatePlaygroundGoalProgress() {
    if (!playgroundMode || !refs.goalProgress || !currentGoal) return;
    if (!sim.heatingOn) {
      if (refs.goalProgress) {
        refs.goalProgress.textContent = "Turn on Heat to start the trial";
      }
      return;
    }
    const total = sim.particles.length + (sim.escapedParticles?.length || 0);
    const escapedPct =
      total > 0 ? Math.round((sim.escapedCount / total) * 100) : 0;
    const t = (performance.now() - sim.gasStart) / 1000;
    const timeRemaining = Math.max(0, 30 - t);
    refs.goalProgress.textContent = `Current: ${escapedPct}% evaporated | Time remaining: ${timeRemaining.toFixed(
      1
    )}s`;
  }

  function checkPlaygroundGoal(escapedPct) {
    if (!playgroundMode || !currentGoal || !refs.playgroundGoal) return;
    const success = checkGoal(escapedPct);
    refs.playgroundGoal.classList.remove("success", "failure");
    if (success) {
      refs.playgroundGoal.classList.add("success");
      if (refs.goalProgress) {
        refs.goalProgress.textContent = `✅ Success! Reached ${escapedPct}% evaporated`;
      }
      // Show celebration
      showCelebration(true, escapedPct, currentGoal);
    } else {
      refs.playgroundGoal.classList.add("failure");
      if (refs.goalProgress) {
        refs.goalProgress.textContent = `❌ Failed. Reached ${escapedPct}% evaporated (target: ${currentGoal.min}-${currentGoal.max}%)`;
      }
      // Show sadness
      showCelebration(false, escapedPct, currentGoal);
    }
  }

  function showCelebration(success, escapedPct, goal = null) {
    // Create or reuse toast container within the component
    const host = shadow || document;
    let container = host.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      host.appendChild(container);
    }
    const targetText = goal ? ` (target: ${goal.min}-${goal.max}%)` : "";
    const toast = document.createElement("div");
    toast.className = `toast ${success ? "toast-success" : "toast-failure"}`;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.innerHTML = `
      <span>${success ? "✅ Success!" : "❌ Try again."}</span>
      <span style="opacity:.9;">${
        success
          ? `Reached ${escapedPct}% evaporated.`
          : `Reached ${escapedPct}%${targetText}.`
      }</span>
      <button class="toast-close" aria-label="Close">×</button>
    `;
    container.appendChild(toast);
    const close = () => {
      if (toast.parentNode) toast.remove();
    };
    const btn = toast.querySelector(".toast-close");
    if (btn) btn.addEventListener("click", close);
    setTimeout(close, 5000);
  }

  // Make functions accessible to simulation loop
  window.updatePlaygroundGoalProgress = updatePlaygroundGoalProgress;
  window.checkPlaygroundGoal = checkPlaygroundGoal;

  // Initialize shell with normal-mode class
  const shellElement = shadow.querySelector(".imfs-shell");
  if (shellElement) {
    shellElement.classList.add("normal-mode");
  }

  // Settings dropdown toggle
  if (refs.settingsToggle && refs.settingsDropdown) {
    refs.settingsToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      refs.settingsDropdown.classList.toggle("open");
    });
    // Close dropdown when clicking outside or on a button inside
    const closeDropdown = (e) => {
      if (!refs.settingsDropdown.contains(e.target)) {
        refs.settingsDropdown.classList.remove("open");
      } else if (e.target.classList.contains("btn")) {
        // Close after a short delay to allow button click to register
        setTimeout(() => {
          refs.settingsDropdown.classList.remove("open");
        }, 100);
      }
    };
    document.addEventListener("click", closeDropdown);
  }

  // Playground params dropdown toggle
  if (refs.playgroundParamsToggle && refs.playgroundParamsDropdown) {
    refs.playgroundParamsToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      refs.playgroundParamsDropdown.classList.toggle("open");
    });
    // Prevent clicks inside dropdown from closing it
    refs.playgroundParamsDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    // Close dropdown when clicking outside
    const closeDropdown = (e) => {
      if (!refs.playgroundParamsDropdown.contains(e.target)) {
        refs.playgroundParamsDropdown.classList.remove("open");
      }
    };
    document.addEventListener("click", closeDropdown);
  }

  // New toggles: Gravity, Contour, Molecules
  if (refs.tGravity)
    refs.tGravity.addEventListener("click", () => {
      sim.gravityOn = !sim.gravityOn;
      refs.tGravity.classList.toggle("is-active", sim.gravityOn);
    });
  if (refs.tContour)
    refs.tContour.addEventListener("click", () => {
      sim.contourOn = !sim.contourOn;
      refs.tContour.classList.toggle("is-active", sim.contourOn);
      // Update visualization immediately, even when paused
      sim.draw();
    });
  if (refs.tMolecules)
    refs.tMolecules.addEventListener("click", () => {
      sim.moleculesVisible = !sim.moleculesVisible;
      refs.tMolecules.classList.toggle("is-active", sim.moleculesVisible);
      // Update visualization immediately, even when paused
      sim.draw();
    });
  if (refs.tHeat)
    refs.tHeat.addEventListener("click", () => {
      const wasHeating = sim.heatingOn;
      sim.heatingOn = !sim.heatingOn;
      refs.tHeat.classList.toggle("is-active", sim.heatingOn);
      if (refs.sim) refs.sim.classList.toggle("is-heating", sim.heatingOn);
      if (!wasHeating && sim.heatingOn && refs.playgroundGoal) {
        refs.playgroundGoal.classList.remove("attention");
      }
      // When turning heat on, reset timer and escaped count for new trial
      if (!wasHeating && sim.heatingOn) {
        sim.gasStart = performance.now();
        sim.escapedCount = 0;
        sim.escapedParticles = [];
        sim.trialEnded = false;
        // Restart simulation if it was stopped
        if (!sim.running) {
          sim.start();
        }
      }
    });

  // --- AI Narrator ---
  let lastNarratorUpdate = 0;
  const NARRATOR_UPDATE_INTERVAL = 1000; // Update every 1 second
  let narratorUserScrollTime = 0; // Track when user last scrolled manually
  let savedScrollPosition = 0; // Saved scroll position
  let isRestoringScroll = false; // Flag to prevent scroll event from interfering

  // Track user scrolling in narrator (only manual scrolling, not programmatic)
  if (refs.narrator) {
    refs.narrator.addEventListener("scroll", () => {
      // Only update if we're not programmatically restoring scroll
      if (!isRestoringScroll) {
        narratorUserScrollTime = performance.now();
        savedScrollPosition = refs.narrator.scrollTop;
      }
    });
  }

  function updateNarratorThrottled() {
    const now = performance.now();
    if (now - lastNarratorUpdate >= NARRATOR_UPDATE_INTERVAL) {
      renderNarration(false);
      lastNarratorUpdate = now;
    }
  }

  function imfTypeFor(kind) {
    if (kind === "honey") return "Hydrogen bonding (strongest)";
    if (kind === "dmso") return "Dipole–dipole (medium)";
    return "London dispersion (weakest)";
  }
  function renderNarration(force = false) {
    if (!refs.narrator) return;

    const total = sim.particles.length + (sim.escapedParticles?.length || 0);
    const gas = sim.gasCount || 0;
    const escaped = sim.escapedCount || 0;
    const scenario = sim.currentScenario || "honey";
    const gasPct = total > 0 ? Math.round((gas / total) * 100) : 0;
    const escapedPct = total > 0 ? Math.round((escaped / total) * 100) : 0;
    const heating = sim.heatingOn ? "on" : "off";
    const gravity = sim.gravityOn ? "on" : "off";

    let scenarioName = scenario.charAt(0).toUpperCase() + scenario.slice(1);
    let imfType =
      scenario === "honey"
        ? "Hydrogen bonding"
        : scenario === "dmso"
        ? "Dipole–dipole"
        : "London dispersion";
    let imfStrength =
      scenario === "honey"
        ? "strongest"
        : scenario === "dmso"
        ? "medium"
        : "weakest";

    let explanation =
      scenario === "honey"
        ? 'Strong <span class="narrator-emphasis">hydrogen bonds</span> keep particles tightly clustered together. This makes evaporation very difficult—particles need significant thermal energy to break free.'
        : scenario === "dmso"
        ? '<span class="narrator-emphasis">Dipole–dipole</span> interactions align molecules anti-parallel, creating moderate cohesion. Evaporation requires moderate thermal energy—more than hexane but less than honey.'
        : 'Weak <span class="narrator-emphasis">London dispersion forces</span> provide minimal attraction between particles. With little holding them together, particles evaporate easily even at low temperatures.';

    const isPlayground = playgroundMode || scenario === "playground";
    if (isPlayground) {
      scenarioName = "Playground";
      imfType = "Custom IMFs";
      imfStrength = "custom";
      explanation =
        'You are exploring a custom mix of intermolecular forces. Increasing viscosity, H‑bond, dipole, or ε strengthens cohesion and reduces evaporation; decreasing them does the opposite.';
    }

    // Check if narrator content already exists - if so, update only the changing parts
    const existingContent = refs.narrator.querySelector(".narrator-content");
    const currentScenario = refs.narrator
      .querySelector(".title")
      ?.textContent?.includes(scenarioName);

    if (existingContent && !force && currentScenario) {
      // Update only the changing numbers and status - this preserves scroll position
      const gasLine = existingContent.querySelector(
        ".narrator-section:nth-child(2) .line:nth-child(2)"
      );
      const escapedLine = existingContent.querySelector(
        ".narrator-section:nth-child(2) .line:nth-child(3)"
      );
      const statusLine = existingContent.querySelector(
        ".narrator-section:nth-child(1) .line:nth-child(3)"
      );
      let boilingDiv = existingContent.querySelector(
        ".narrator-section .narrator-highlight[style*='background']"
      );

      // Update gas particles count and percentage
      if (gasLine) {
        const highlights = gasLine.querySelectorAll(".narrator-highlight");
        if (highlights[0]) highlights[0].textContent = String(gas);
        if (highlights[1]) highlights[1].textContent = `${gasPct}%`;
      }

      // Update escaped count and percentage
      if (escapedLine) {
        const highlights = escapedLine.querySelectorAll(".narrator-highlight");
        if (highlights[0]) highlights[0].textContent = String(escaped);
        if (highlights[1]) highlights[1].textContent = `${escapedPct}%`;
      }

      // Update heating and gravity status
      if (statusLine) {
        const highlights = statusLine.querySelectorAll(".narrator-highlight");
        if (highlights[0]) highlights[0].textContent = heating;
        if (highlights[1]) highlights[1].textContent = gravity;
      }

      // Handle boiling behavior div (appears/disappears based on heating)
      if (heating === "on" && !boilingDiv) {
        // Need to add the boiling div
        let whatHappeningSection = existingContent.querySelector(
          isPlayground
            ? "[data-section=\"happening\"]"
            : ".narrator-section:nth-child(3)"
        );
        // In playground, create a dedicated section after Current State if missing
        if (isPlayground && !whatHappeningSection) {
          const newSection = document.createElement("div");
          newSection.className = "narrator-section";
          newSection.setAttribute("data-section", "happening");
          const currentState = existingContent.querySelector(
            ".narrator-section:nth-child(2)"
          );
          if (currentState && currentState.parentNode) {
            currentState.parentNode.insertBefore(newSection, currentState.nextSibling);
          } else {
            existingContent.appendChild(newSection);
          }
          whatHappeningSection = newSection;
        }
        if (whatHappeningSection) {
          const boilingDiv = document.createElement("div");
          boilingDiv.className = "line narrator-highlight";
          boilingDiv.style.cssText =
            "margin-top: 8px; padding: 8px; background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 4px;";
          boilingDiv.innerHTML =
            "<strong>🔥 Real Boiling Behavior:</strong> Notice how molecules at the bottom heat up first and push unheated molecules upward! This creates convection currents—just like real boiling water on a stovetop. The heated particles gain thermal energy and kinetic energy, rising while cooler particles sink to replace them.";
          whatHappeningSection.appendChild(boilingDiv);
        }
      } else if (heating === "off" && boilingDiv) {
        // Remove the boiling div
        boilingDiv.remove();
        if (isPlayground) {
          const happeningSection = existingContent.querySelector("[data-section=\"happening\"]");
          if (happeningSection && !happeningSection.querySelector(".line")) {
            happeningSection.remove();
          }
        }
      }

      // Scroll position is automatically preserved since we're not replacing innerHTML
      return;
    }

    // Initial render or scenario changed - replace entire content
    const html = `
      <div class="narrator-content">
        <div class="narrator-section">
          <div class="title">${scenarioName} — <span class="narrator-emphasis">${imfType}</span></div>
          <div class="line">IMF Strength: <span class="narrator-highlight">${imfStrength}</span></div>
          <div class="line">Heating: <span class="narrator-highlight">${heating}</span> | Gravity: <span class="narrator-highlight">${gravity}</span></div>
        </div>
        <div class="narrator-section">
          <div class="line"><strong>Current State:</strong></div>
          <div class="line">Gas particles: <span class="narrator-highlight">${gas}</span> (<span class="narrator-highlight">${gasPct}%</span>)</div>
          <div class="line">Escaped total: <span class="narrator-highlight">${escaped}</span> (<span class="narrator-highlight">${escapedPct}%</span>)</div>
        </div>
        ${
          isPlayground
            ? (heating === "on"
                ? `<div class="narrator-section" data-section="happening"><div class="line narrator-highlight" style="margin-top: 8px; padding: 8px; background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 4px;"><strong>🔥 Real Boiling Behavior:</strong> Notice how molecules at the bottom heat up first and push unheated molecules upward! This creates convection currents—just like real boiling water on a stovetop. The heated particles gain thermal energy and kinetic energy, rising while cooler particles sink to replace them.</div></div>`
                : ``)
            : `<div class="narrator-section">
                <div class="line"><strong>What's Happening:</strong></div>
                <div class="line">${explanation}</div>
                ${
                  heating === "on"
                    ? '<div class="line narrator-highlight" style="margin-top: 8px; padding: 8px; background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 4px;"><strong>🔥 Real Boiling Behavior:</strong> Notice how molecules at the bottom heat up first and push unheated molecules upward! This creates convection currents—just like real boiling water on a stovetop. The heated particles gain thermal energy and kinetic energy, rising while cooler particles sink to replace them.</div>'
                    : ""
                }
              </div>`
        }
        <div class="narrator-section">
          <div class="line"><strong>IMF Hierarchy:</strong></div>
          <div class="line"><span class="narrator-emphasis">Hydrogen bonds</span> > <span class="narrator-emphasis">Dipole–dipole</span> > <span class="narrator-emphasis">London dispersion</span></div>
          ${isPlayground ? "" : '<div class="line">Evaporation order: Honey (hardest) < DMSO (medium) < Hexane (easiest)</div>'}
        </div>
        <div class="narrator-section">
          <div class="line narrator-tip"><strong>💡 Tip:</strong> Turn heat on to add thermal energy. Surface particles evaporate first because they have fewer neighbors holding them back!</div>
        </div>
      </div>
    `;
    refs.narrator.innerHTML = html;
  }

  // Initial render
  try {
    renderNarration(true);
  } catch (_) {}

  // Expose functions for throttled updates from draw loop
  window.renderNarration = renderNarration;
  window.updateNarratorThrottled = updateNarratorThrottled;

  // Debug panel functionality
  let selectedParticle = null;
  let debugUpdateInterval = null;

  // Make debug panel draggable
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panelStartX = 0;
  let panelStartY = 0;

  if (refs.debugPanel) {
    const debugHeader = refs.debugPanel.querySelector("h4");
    if (debugHeader) {
      debugHeader.addEventListener("mousedown", (e) => {
        if (!refs.debugPanel.classList.contains("active")) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = refs.debugPanel.getBoundingClientRect();
        panelStartX = rect.left;
        panelStartY = rect.top;
        e.preventDefault();
      });
    }

    document.addEventListener("mousemove", (e) => {
      if (!isDragging || !refs.debugPanel.classList.contains("active")) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const newX = panelStartX + dx;
      const newY = panelStartY + dy;
      // Keep panel within viewport bounds
      const maxX = window.innerWidth - refs.debugPanel.offsetWidth;
      const maxY = window.innerHeight - refs.debugPanel.offsetHeight;
      refs.debugPanel.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
      refs.debugPanel.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
      refs.debugPanel.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  function updateDebugPanel() {
    if (!refs.debugPanel || !refs.debugContent) return;

    if (!selectedParticle) {
      refs.debugPanel.classList.remove("active");
      if (debugUpdateInterval) {
        clearInterval(debugUpdateInterval);
        debugUpdateInterval = null;
      }
      return;
    }

    // Rebuild grid for force calculations
    sim.grid.clear();
    for (let i = 0; i < sim.particles.length; i++) {
      sim.grid.insert(sim.particles[i]);
    }

    const data = sim.getParticleDebugData(selectedParticle);
    if (!data) return;

    refs.debugPanel.classList.add("active");

    refs.debugContent.innerHTML = `
      <div class="debug-section">
        <div class="debug-row"><span class="debug-label">Index:</span><span class="debug-value">${
          data.index
        }</span></div>
        <div class="debug-row"><span class="debug-label">State:</span><span class="debug-value">${
          data.state
        }</span></div>
        <div class="debug-row"><span class="debug-label">Mass:</span><span class="debug-value">${
          data.mass
        }</span></div>
        <div class="debug-row"><span class="debug-label">Radius:</span><span class="debug-value">${
          data.radius
        }</span></div>
      </div>
      
      <div class="debug-section">
        <h4>Position</h4>
        <div class="debug-row"><span class="debug-label">X:</span><span class="debug-value">${
          data.position.x
        }</span></div>
        <div class="debug-row"><span class="debug-label">Y:</span><span class="debug-value">${
          data.position.y
        }</span></div>
        <div class="debug-row"><span class="debug-label">Dist from bottom:</span><span class="debug-value">${
          data.heating.distFromBottom
        }</span></div>
      </div>
      
      <div class="debug-section">
        <h4>Velocity</h4>
        <div class="debug-row"><span class="debug-label">Vx:</span><span class="debug-value">${
          data.velocity.x
        }</span></div>
        <div class="debug-row"><span class="debug-label">Vy:</span><span class="debug-value">${
          data.velocity.y
        }</span></div>
        <div class="debug-row"><span class="debug-label">Speed:</span><span class="debug-value">${
          data.velocity.speed
        }</span></div>
      </div>
      
      <div class="debug-section">
        <h4>Energy</h4>
        <div class="debug-row"><span class="debug-label">Kinetic Energy:</span><span class="debug-value">${
          data.kineticEnergy
        }</span></div>
        <div class="debug-row"><span class="debug-label">Thermal Energy:</span><span class="debug-value">${
          data.thermalEnergy
        }</span></div>
      </div>
      
      <div class="debug-section">
        <h4>Forces (Total Magnitude)</h4>
        <div class="debug-row"><span class="debug-label">LJ Force:</span><span class="debug-value">${
          data.forces.lj
        }</span></div>
        <div class="debug-row"><span class="debug-label">HB Force:</span><span class="debug-value">${
          data.forces.hb
        }</span></div>
        <div class="debug-row"><span class="debug-label">Dipole Force:</span><span class="debug-value">${
          data.forces.dipole
        }</span></div>
        <div class="debug-row"><span class="debug-label">Total Force:</span><span class="debug-value">${
          data.forces.total
        }</span></div>
      </div>
      
      <div class="debug-section">
        <h4>Neighbors</h4>
        <div class="debug-row"><span class="debug-label">Local Neighbors:</span><span class="debug-value">${
          data.localNeighbors
        }</span></div>
        <div class="debug-row"><span class="debug-label">Nearest Dist:</span><span class="debug-value">${
          data.nearestNeighbor.distance
        }</span></div>
        <div class="debug-row"><span class="debug-label">Nearest State:</span><span class="debug-value">${
          data.nearestNeighbor.state
        }</span></div>
      </div>
      
      <div class="debug-section">
        <h4>Heating</h4>
        <div class="debug-row"><span class="debug-label">In Heating Zone:</span><span class="debug-value">${
          data.heating.inZone ? "Yes" : "No"
        }</span></div>
        <div class="debug-row"><span class="debug-label">Zone Top:</span><span class="debug-value">${
          data.heating.heatingZoneTop
        }</span></div>
      </div>
      
      <div class="debug-section">
        <h4>State Timing</h4>
        <div class="debug-row"><span class="debug-label">Gas Until (ms):</span><span class="debug-value">${
          data.gasUntil
        }</span></div>
        <div class="debug-row"><span class="debug-label">Last State Change (ms):</span><span class="debug-value">${
          data.lastStateChange
        }</span></div>
      </div>
      
      <div class="debug-note">Click another particle to inspect it</div>
    `;
  }

  // Click detection on canvas
  refs.sim.addEventListener("click", (e) => {
    const rect = refs.sim.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if "Go to Next Trial" or "Restart Trials" button was clicked
    if (sim.trialEnded && sim.restartButtonBounds) {
      const btn = sim.restartButtonBounds;
      if (
        x >= btn.x &&
        x <= btn.x + btn.w &&
        y >= btn.y &&
        y <= btn.y + btn.h
      ) {
        // If all trials completed, restart from beginning
        if (btn.allTrialsCompleted) {
          // Reset everything
          sim.completedTrials.clear();
          sim.gasHistory = [];
          sim.trialEnded = false;
          sim.escapedCount = 0;
          sim.escapedParticles = [];
          sim.currentScenario = null;
          // Start with honey (autoStart=true since restarting trials)
          setScenario("honey", true);
          sim.gasStart = performance.now();
          sim.heatingOn = true;
          sim.spawnParticles();
          sim.start();
          sim.draw();
          if (refs.tHeat) refs.tHeat.classList.add("is-active");
          if (refs.sim) refs.sim.classList.add("is-heating");
          return;
        }

        // Cycle to next material and start trial with heat automatically on
        const materials = ["honey", "dmso", "hexane"];
        const currentIndex = materials.indexOf(sim.currentScenario || "honey");
        const nextIndex = (currentIndex + 1) % materials.length;
        const nextMaterial = materials[nextIndex];

        // Switch to next material with autoStart=true (don't pause)
        setScenario(nextMaterial, true);

        // Start trial with heat automatically on
        sim.trialEnded = false;
        sim.escapedCount = 0;
        sim.escapedParticles = [];
        sim.gasStart = performance.now();
        sim.heatingOn = true; // Automatically turn heat on
        sim.spawnParticles();
        sim.start();
        sim.draw();
        // Update heat button UI state
        if (refs.tHeat) refs.tHeat.classList.add("is-active");
        if (refs.sim) refs.sim.classList.add("is-heating");
        return;
      }
    }

    // Find closest particle
    let closestParticle = null;
    let closestDist = Infinity;

    for (let i = 0; i < sim.particles.length; i++) {
      const p = sim.particles[i];
      const dx = p.pos[0] - x;
      const dy = p.pos[1] - y;
      const dist = Math.hypot(dx, dy);
      const r = p.radius || 4.5;

      if (dist < r + 5 && dist < closestDist) {
        // 5px click tolerance
        closestDist = dist;
        closestParticle = p;
      }
    }

    // Clear existing interval
    if (debugUpdateInterval) {
      clearInterval(debugUpdateInterval);
      debugUpdateInterval = null;
    }

    selectedParticle = closestParticle;
    updateDebugPanel();

    // Update debug panel continuously when particle is selected
    if (selectedParticle && sim.running) {
      debugUpdateInterval = setInterval(() => {
        if (selectedParticle && sim.particles.includes(selectedParticle)) {
          updateDebugPanel();
        } else {
          clearInterval(debugUpdateInterval);
          debugUpdateInterval = null;
          selectedParticle = null;
          updateDebugPanel();
        }
      }, 100); // Update every 100ms
    }
  });

  // (Removed 2D/3D toggle handlers)

  // Init
  setScenario("honey");
  sim.currentScenario = "honey"; // Ensure initial scenario is set
  sim.params.color = scenarioColor("honey");
  sim.draw();
  // Don't auto-start - wait for user to click Play
  // sim.start();
  // Set gravity button to active state (gravity is on by default)
  if (refs.tGravity && sim.gravityOn) {
    refs.tGravity.classList.add("is-active");
  }
  // Set molecules button to active state (molecules are visible by default)
  if (refs.tMolecules && sim.moleculesVisible) {
    refs.tMolecules.classList.add("is-active");
  }
  // Attach gas graph canvas to sim
  try {
    const gasCanvas = shadow.querySelector("#imfs-gas");
    if (gasCanvas && typeof sim.setGasCanvas === "function") {
      sim.setGasCanvas(gasCanvas);
    }
  } catch (_) {}
  // Ensure simulation canvas size is correct after layout
  try {
    // Force a resize to ensure canvas matches its container
    setTimeout(() => {
      sim.setSize();
      sim.draw();
    }, 100);
  } catch (_) {}
  // Initialize 3D viewer with current scenario
  try {
    const cid = choosePreviewCID("honey");
    load3DByCID(cid);
  } catch (_) {}

  // --- Tutorial System ---
  const TUTORIAL_STORAGE_KEY = "imfs_tutorial_completed";
  let currentTutorialStep = 0;
  let tutorialDemoTimeout = null;
  let tutorialDemoInterval = null;
  let tutorialScrollTimeout = null;

  const tutorialSteps = [
    {
      title: "Welcome to the IMFs Playground!",
      text: "This interactive simulation lets you explore intermolecular forces (IMFs) through particle-level physics. You'll see how different forces affect evaporation and particle behavior.",
      introText:
        "Welcome! This tutorial will guide you through the IMFs Playground—an interactive tool for exploring how intermolecular forces affect particle behavior. You'll learn to control the simulation, compare different materials, and understand the physics behind evaporation and boiling.",
      target: null,
      position: "center",
    },
    {
      title: "Education Edition vs Playground",
      text: "Use the mode toggle to switch between Education Edition (pre-set materials like honey, DMSO, hexane) and Playground (customize all parameters yourself).",
      target: "#mode-toggle",
      position: "bottom",
    },
    {
      title: "Material Selection",
      text: "In Education Edition, choose different materials to compare. Honey has strong hydrogen bonds, DMSO has dipole-dipole forces, and hexane has only weak London dispersion forces.",
      target: "#s-material",
      position: "bottom",
    },
    {
      title: "Control Buttons",
      text: "Use Play/Pause to control the simulation. The Heat button adds thermal energy to particles at the bottom, simulating a stovetop. Toggle Gravity, Contour, and Molecules visibility as needed.",
      target: ".control-buttons",
      position: "bottom",
    },
    {
      title: "The Simulation View",
      text: "Watch particles interact in real-time. Particles change color as they heat up. Stronger IMFs make particles stick together more, making evaporation harder.",
      target: "#imfs-sim",
      position: "right",
    },
    {
      title: "The Graph",
      text: "The graph tracks escaped particles over time. It starts when you turn on heat and runs for 30 seconds. Compare different materials by switching between them after trials complete.",
      target: "#imfs-gas",
      position: "left",
    },
    {
      title: "AI Narrator",
      text: "The AI narrator explains what's happening in real-time. Scroll down to see detailed explanations of IMFs and particle behavior. Numbers update automatically without disrupting your reading.",
      target: "#ai-narrator",
      position: "left",
    },
    {
      title: "You're Ready!",
      text: "Start exploring! Try switching between materials, turning on heat, and watching how different IMFs affect evaporation. In Playground mode, you can customize everything!",
      introText:
        "You're all set! Remember: stronger IMFs (like hydrogen bonds in honey) make evaporation harder, while weaker IMFs (like London dispersion in hexane) allow easy evaporation. Use Education Edition to compare preset materials, or switch to Playground mode to experiment with custom parameters. Have fun exploring!",
      target: null,
      position: "center",
    },
  ];

  function getElementBounds(selector) {
    if (!selector) return null;
    const element = shadow.querySelector(selector);
    if (!element) return null;
    // Get bounds relative to viewport (not shadow root)
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  }

  function showTutorialStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= tutorialSteps.length) {
      closeTutorial();
      return;
    }

    const step = tutorialSteps[stepIndex];
    currentTutorialStep = stepIndex;

    // Auto-scroll to center the highlighted element FIRST
    if (step.target) {
      const element = shadow.querySelector(step.target);
      if (element) {
        const rect = element.getBoundingClientRect();
        const elementCenterY = rect.top + rect.height / 2;
        const viewportCenterY = window.innerHeight / 2;
        const scrollOffset = elementCenterY - viewportCenterY;

        // Smooth scroll to center the element
        // Temporarily re-enable scrolling for programmatic scroll
        document.body.style.overflow = "auto";
        document.documentElement.style.overflow = "auto";
        window.scrollTo({
          top: window.scrollY + scrollOffset,
          behavior: "smooth",
        });
        // Re-disable scrolling after scroll completes
        tutorialScrollTimeout = setTimeout(() => {
          // Only re-disable if tutorial is still active
          if (
            refs.tutorialOverlay &&
            !refs.tutorialOverlay.classList.contains("hidden")
          ) {
            document.body.style.overflow = "hidden";
            document.documentElement.style.overflow = "hidden";
          }
        }, 1000);
      }
    } else {
      // For center steps, scroll to top
      // Temporarily re-enable scrolling for programmatic scroll
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
      // Re-disable scrolling after scroll completes
      tutorialScrollTimeout = setTimeout(() => {
        // Only re-disable if tutorial is still active
        if (
          refs.tutorialOverlay &&
          !refs.tutorialOverlay.classList.contains("hidden")
        ) {
          document.body.style.overflow = "hidden";
          document.documentElement.style.overflow = "hidden";
        }
      }, 1000);
    }

    // Update content
    if (refs.tutorialStepIndicator) {
      refs.tutorialStepIndicator.textContent = `${stepIndex + 1}/${
        tutorialSteps.length
      }`;
    }

    // Show/hide buttons
    if (refs.tutorialPrev) {
      // Always show Previous button, but disable it on step 1
      refs.tutorialPrev.style.display = "inline-block";
      refs.tutorialPrev.innerHTML = "&lt;";
      refs.tutorialPrev.disabled = stepIndex === 0;
    }
    if (refs.tutorialNext) {
      refs.tutorialNext.innerHTML =
        stepIndex === tutorialSteps.length - 1 ? "✓" : "&gt;";
    }

    // For steps 1 and 8 (first and last), show centered text box only
    const tutorialContent =
      refs.tutorialOverlay?.querySelector(".tutorial-content");
    const isIntroOrOutro =
      stepIndex === 0 || stepIndex === tutorialSteps.length - 1;

    // Always keep tutorial modal fixed at bottom center
    if (tutorialContent) {
      tutorialContent.style.position = "fixed";
      tutorialContent.style.left = "50%";
      tutorialContent.style.bottom = "20px";
      tutorialContent.style.top = "auto";
      tutorialContent.style.right = "auto";
      tutorialContent.style.transform = "translateX(-50%)";
      tutorialContent.style.margin = "0";
      tutorialContent.style.display = "flex";
      tutorialContent.style.visibility = "visible";
      tutorialContent.style.opacity = "1";
    }

    // Clear any existing demo timers
    if (tutorialDemoTimeout) {
      clearTimeout(tutorialDemoTimeout);
      tutorialDemoTimeout = null;
    }
    if (tutorialDemoInterval) {
      clearInterval(tutorialDemoInterval);
      tutorialDemoInterval = null;
    }

    if (isIntroOrOutro) {
      // Show centered floating modal AND keep bottom bar visible
      if (refs.tutorialHighlight) refs.tutorialHighlight.style.display = "none";
      if (refs.tutorialTooltip) refs.tutorialTooltip.style.display = "none";

      // Show centered floating modal
      if (refs.tutorialIntroModal) {
        refs.tutorialIntroModal.style.display = "flex";
        if (refs.tutorialIntroTitle && refs.tutorialIntroText) {
          if (step.introText) {
            refs.tutorialIntroTitle.textContent = step.title;
            refs.tutorialIntroText.textContent = step.introText;
          } else {
            refs.tutorialIntroTitle.textContent = step.title;
            refs.tutorialIntroText.textContent = step.text;
          }
        }
      }
      // Keep bottom bar visible
      if (tutorialContent) {
        tutorialContent.style.display = "flex";
      }
    } else {
      // Hide intro modal for regular steps
      if (refs.tutorialIntroModal) {
        refs.tutorialIntroModal.style.display = "none";
      }
      if (tutorialContent) {
        tutorialContent.style.display = "flex";
      }

      // Start interactive demo only for specific steps
      if (stepIndex === 4) {
        // Step 5 (index 4): Start sim
        startTutorialSimDemo();
      } else if (stepIndex === 5) {
        // Step 6 (index 5): Record mock graph data
        startTutorialGraphDemo();
      }
      // For other steps, hide text content and show highlight/tooltip
      if (refs.tutorialTextContent) {
        refs.tutorialTextContent.style.display = "none";
      }
      if (tutorialContent) {
        tutorialContent.classList.remove("has-text");
      }

      // Position highlight and tooltip (only for non-intro/outro steps)
      if (step.target) {
        const element = shadow.querySelector(step.target);
        if (element && refs.tutorialHighlight) {
          const viewportRect = element.getBoundingClientRect();
          // Add padding around the element for better visual coverage
          const padding = 6;
          refs.tutorialHighlight.style.display = "block";
          refs.tutorialHighlight.style.left = `${
            viewportRect.left - padding
          }px`;
          refs.tutorialHighlight.style.top = `${viewportRect.top - padding}px`;
          refs.tutorialHighlight.style.width = `${
            viewportRect.width + padding * 2
          }px`;
          refs.tutorialHighlight.style.height = `${
            viewportRect.height + padding * 2
          }px`;

          // Position tooltip (relative to viewport)
          if (refs.tutorialTooltip) {
            refs.tutorialTooltip.innerHTML = `<strong>${step.title}</strong><br>${step.text}`;
            refs.tutorialTooltip.className = `tutorial-tooltip ${step.position}`;

            // Use the same viewportRect from above

            // Calculate tooltip position with viewport bounds checking
            const tooltipPadding = 20;
            const edgePadding = 20; // Increased minimum distance from window edges for mobile
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // On mobile, use smaller tooltip with more aggressive bounds checking
            const isMobile = viewportWidth <= 768;
            const mobileTooltipWidth = Math.min(
              280,
              viewportWidth - edgePadding * 2 - 10 // Extra padding for mobile
            );
            const desktopTooltipWidth = Math.min(
              320,
              viewportWidth - edgePadding * 2
            );
            const actualTooltipWidth = isMobile
              ? mobileTooltipWidth
              : desktopTooltipWidth;

            // On mobile, prefer positioning tooltip below or inside element to avoid overflow
            const mobilePrefersBelow =
              isMobile &&
              (step.position === "top" ||
                step.position === "left" ||
                step.position === "right");

            // Set tooltip width first to get accurate height measurement
            refs.tutorialTooltip.style.maxWidth = `${actualTooltipWidth}px`;
            refs.tutorialTooltip.style.width = `${actualTooltipWidth}px`;
            const tooltipHeight = refs.tutorialTooltip.offsetHeight || 150;

            let tooltipX, tooltipY;

            // On mobile, prefer bottom positioning to avoid overflow
            if (isMobile && mobilePrefersBelow) {
              // Force bottom positioning on mobile for left/right/top positions
              tooltipX = viewportRect.left + viewportRect.width / 2;
              tooltipY = viewportRect.bottom + tooltipPadding;
              refs.tutorialTooltip.className = `tutorial-tooltip bottom`;
              refs.tutorialTooltip.style.transform = "translateX(-50%)";

              // Ensure tooltip stays in viewport horizontally
              const minX = actualTooltipWidth / 2 + edgePadding;
              const maxX = viewportWidth - actualTooltipWidth / 2 - edgePadding;
              tooltipX = Math.max(minX, Math.min(tooltipX, maxX));

              // If it would go off bottom, position it above
              if (tooltipY + tooltipHeight > viewportHeight - edgePadding) {
                tooltipY = viewportRect.top - tooltipPadding - tooltipHeight;
                refs.tutorialTooltip.className = `tutorial-tooltip top`;
                refs.tutorialTooltip.style.transform =
                  "translateX(-50%) translateY(-100%)";
                if (tooltipY < edgePadding) {
                  // If still off screen, center it vertically within the element
                  tooltipY =
                    viewportRect.top +
                    viewportRect.height / 2 -
                    tooltipHeight / 2;
                  refs.tutorialTooltip.className = `tutorial-tooltip bottom`;
                  refs.tutorialTooltip.style.transform =
                    "translateX(-50%) translateY(-50%)";
                }
              }

              // Final bounds check
              tooltipX = Math.max(
                edgePadding + actualTooltipWidth / 2,
                Math.min(
                  tooltipX,
                  viewportWidth - edgePadding - actualTooltipWidth / 2
                )
              );
              tooltipY = Math.max(
                edgePadding,
                Math.min(tooltipY, viewportHeight - tooltipHeight - edgePadding)
              );
            } else if (step.position === "bottom") {
              tooltipX = viewportRect.left + viewportRect.width / 2;
              tooltipY = viewportRect.bottom + tooltipPadding;
              // Ensure tooltip stays in viewport with edge padding - more aggressive on mobile
              const minX = actualTooltipWidth / 2 + edgePadding;
              const maxX = viewportWidth - actualTooltipWidth / 2 - edgePadding;
              tooltipX = Math.max(minX, Math.min(tooltipX, maxX));

              // Check if tooltip would go off bottom
              if (tooltipY + tooltipHeight > viewportHeight - edgePadding) {
                // Position it above instead
                tooltipY = viewportRect.top - tooltipPadding - tooltipHeight;
                refs.tutorialTooltip.className = `tutorial-tooltip top`;
                refs.tutorialTooltip.style.transform =
                  "translateX(-50%) translateY(-100%)";
                // Ensure it doesn't go off top
                if (tooltipY < edgePadding) {
                  tooltipY = edgePadding;
                }
              } else {
                refs.tutorialTooltip.className = `tutorial-tooltip bottom`;
                refs.tutorialTooltip.style.transform = "translateX(-50%)";
                // Ensure it doesn't go off bottom
                if (tooltipY + tooltipHeight > viewportHeight - edgePadding) {
                  tooltipY = viewportHeight - edgePadding - tooltipHeight;
                }
              }
              // Final bounds check for Y
              tooltipY = Math.max(
                edgePadding,
                Math.min(tooltipY, viewportHeight - tooltipHeight - edgePadding)
              );
            } else if (step.position === "top") {
              tooltipX = viewportRect.left + viewportRect.width / 2;
              tooltipY = viewportRect.top - tooltipPadding - tooltipHeight;
              const minX = actualTooltipWidth / 2 + edgePadding;
              const maxX = viewportWidth - actualTooltipWidth / 2 - edgePadding;
              tooltipX = Math.max(minX, Math.min(tooltipX, maxX));

              if (tooltipY < edgePadding) {
                // If tooltip would go off top, position it below instead
                tooltipY = viewportRect.bottom + tooltipPadding;
                refs.tutorialTooltip.className = `tutorial-tooltip bottom`;
                refs.tutorialTooltip.style.transform = "translateX(-50%)";
                // Ensure it doesn't go off bottom
                if (tooltipY + tooltipHeight > viewportHeight - edgePadding) {
                  tooltipY = viewportHeight - edgePadding - tooltipHeight;
                }
              } else {
                refs.tutorialTooltip.className = `tutorial-tooltip top`;
                refs.tutorialTooltip.style.transform =
                  "translateX(-50%) translateY(-100%)";
              }
              // Final bounds check for Y
              tooltipY = Math.max(
                edgePadding,
                Math.min(tooltipY, viewportHeight - tooltipHeight - edgePadding)
              );
            } else if (step.position === "left") {
              // On mobile, prefer bottom positioning
              if (isMobile) {
                tooltipX = viewportRect.left + viewportRect.width / 2;
                tooltipY = viewportRect.bottom + tooltipPadding;
                refs.tutorialTooltip.className = `tutorial-tooltip bottom`;
                refs.tutorialTooltip.style.transform = "translateX(-50%)";

                const minX = actualTooltipWidth / 2 + edgePadding;
                const maxX =
                  viewportWidth - actualTooltipWidth / 2 - edgePadding;
                tooltipX = Math.max(minX, Math.min(tooltipX, maxX));

                if (tooltipY + tooltipHeight > viewportHeight - edgePadding) {
                  tooltipY = viewportRect.top - tooltipPadding - tooltipHeight;
                  refs.tutorialTooltip.className = `tutorial-tooltip top`;
                  refs.tutorialTooltip.style.transform =
                    "translateX(-50%) translateY(-100%)";
                }

                tooltipY = Math.max(
                  edgePadding,
                  Math.min(
                    tooltipY,
                    viewportHeight - tooltipHeight - edgePadding
                  )
                );
              } else {
                tooltipX =
                  viewportRect.left - tooltipPadding - actualTooltipWidth;
                tooltipY = viewportRect.top + viewportRect.height / 2;
                if (tooltipX < edgePadding) {
                  // If tooltip would go off left, position it to the right instead
                  tooltipX = viewportRect.right + tooltipPadding;
                  refs.tutorialTooltip.className = `tutorial-tooltip right`;
                  refs.tutorialTooltip.style.transform = "translateY(-50%)";
                  // Ensure it doesn't go off right
                  if (
                    tooltipX + actualTooltipWidth >
                    viewportWidth - edgePadding
                  ) {
                    tooltipX = viewportWidth - edgePadding - actualTooltipWidth;
                  }
                } else {
                  refs.tutorialTooltip.className = `tutorial-tooltip left`;
                  refs.tutorialTooltip.style.transform =
                    "translateX(-100%) translateY(-50%)";
                }
                // Ensure tooltip doesn't go off left edge
                tooltipX = Math.max(edgePadding, tooltipX);
                // Ensure tooltip doesn't go off top/bottom
                tooltipY = Math.max(
                  edgePadding + tooltipHeight / 2,
                  Math.min(
                    tooltipY,
                    viewportHeight - edgePadding - tooltipHeight / 2
                  )
                );
              }
            } else if (step.position === "right") {
              // On mobile, prefer bottom positioning
              if (isMobile) {
                tooltipX = viewportRect.left + viewportRect.width / 2;
                tooltipY = viewportRect.bottom + tooltipPadding;
                refs.tutorialTooltip.className = `tutorial-tooltip bottom`;
                refs.tutorialTooltip.style.transform = "translateX(-50%)";

                const minX = actualTooltipWidth / 2 + edgePadding;
                const maxX =
                  viewportWidth - actualTooltipWidth / 2 - edgePadding;
                tooltipX = Math.max(minX, Math.min(tooltipX, maxX));

                if (tooltipY + tooltipHeight > viewportHeight - edgePadding) {
                  tooltipY = viewportRect.top - tooltipPadding - tooltipHeight;
                  refs.tutorialTooltip.className = `tutorial-tooltip top`;
                  refs.tutorialTooltip.style.transform =
                    "translateX(-50%) translateY(-100%)";
                }

                tooltipY = Math.max(
                  edgePadding,
                  Math.min(
                    tooltipY,
                    viewportHeight - tooltipHeight - edgePadding
                  )
                );
              } else {
                tooltipX = viewportRect.right + tooltipPadding;
                tooltipY = viewportRect.top + viewportRect.height / 2;
                if (
                  tooltipX + actualTooltipWidth >
                  viewportWidth - edgePadding
                ) {
                  // If tooltip would go off right, position it to the left instead
                  tooltipX =
                    viewportRect.left - tooltipPadding - actualTooltipWidth;
                  refs.tutorialTooltip.className = `tutorial-tooltip left`;
                  refs.tutorialTooltip.style.transform =
                    "translateX(-100%) translateY(-50%)";
                  // Ensure it doesn't go off left
                  if (tooltipX < edgePadding) {
                    tooltipX = edgePadding;
                  }
                } else {
                  refs.tutorialTooltip.className = `tutorial-tooltip right`;
                  refs.tutorialTooltip.style.transform = "translateY(-50%)";
                }
                // Ensure tooltip doesn't go off right edge
                tooltipX = Math.min(
                  viewportWidth - edgePadding - actualTooltipWidth,
                  tooltipX
                );
                // Ensure tooltip doesn't go off top/bottom
                tooltipY = Math.max(
                  edgePadding + tooltipHeight / 2,
                  Math.min(
                    tooltipY,
                    viewportHeight - edgePadding - tooltipHeight / 2
                  )
                );
              }
            }
            refs.tutorialTooltip.style.left = `${tooltipX}px`;
            refs.tutorialTooltip.style.top = `${tooltipY}px`;
            refs.tutorialTooltip.style.display = "block";
          }
        } else {
          // Element not found
          if (refs.tutorialHighlight)
            refs.tutorialHighlight.style.display = "none";
          if (refs.tutorialTooltip) refs.tutorialTooltip.style.display = "none";
        }
      }
    }
  }

  function startTutorialSimDemo() {
    // Stop any existing demo
    if (tutorialDemoTimeout) {
      clearTimeout(tutorialDemoTimeout);
    }
    if (tutorialDemoInterval) {
      clearInterval(tutorialDemoInterval);
    }

    // Start sim and heating for demo - let it run for real!
    if (sim && !sim.running) {
      sim.start();
    }
    if (sim && !sim.heatingOn) {
      sim.heatingOn = true;
      sim.gasStart = performance.now();
      sim.trialEnded = false; // Reset trial ended flag
      if (refs.tHeat) {
        refs.tHeat.classList.add("is-active");
      }
      if (refs.sim) refs.sim.classList.add("is-heating");
    }

    // Auto-stop after 3 seconds
    const maxDemoTime = 3000; // 3 seconds in milliseconds
    tutorialDemoTimeout = setTimeout(() => {
      if (sim) {
        sim.stop();
        sim.heatingOn = false;
        if (refs.tHeat) {
          refs.tHeat.classList.remove("is-active");
        }
        if (refs.sim) refs.sim.classList.remove("is-heating");
      }
    }, maxDemoTime);
  }

  function startTutorialGraphDemo() {
    // Stop any existing demo
    if (tutorialDemoTimeout) {
      clearTimeout(tutorialDemoTimeout);
    }
    if (tutorialDemoInterval) {
      clearInterval(tutorialDemoInterval);
    }

    // Record mock data for graph
    let demoTime = 0;
    const maxDemoTime = 3; // 3 seconds of demo
    const demoScenario = sim.currentScenario || "honey";

    // Clear any existing data for this scenario
    if (sim && sim.gasHistory) {
      sim.gasHistory = sim.gasHistory.filter(
        (p) => p.scenario !== demoScenario
      );
    }

    tutorialDemoInterval = setInterval(() => {
      if (demoTime >= maxDemoTime) {
        clearInterval(tutorialDemoInterval);
        tutorialDemoInterval = null;
        return;
      }

      // Record mock data point
      if (sim && sim.gasHistory) {
        const mockGasCount = Math.min(50, Math.floor(demoTime * 15));
        const mockEscapedCount = Math.min(30, Math.floor(demoTime * 10));
        sim.gasHistory.push({
          t: demoTime,
          gasCount: mockGasCount,
          escapedCount: mockEscapedCount,
          scenario: demoScenario,
        });
        // Keep reasonable history
        if (sim.gasHistory.length > 10000) sim.gasHistory.shift();
      }

      demoTime += 0.1;
    }, 100);

    // Auto-stop after maxDemoTime
    tutorialDemoTimeout = setTimeout(() => {
      if (tutorialDemoInterval) {
        clearInterval(tutorialDemoInterval);
        tutorialDemoInterval = null;
      }
    }, maxDemoTime * 1000);
  }

  function closeTutorial() {
    // Stop any running demo
    if (tutorialDemoTimeout) {
      clearTimeout(tutorialDemoTimeout);
      tutorialDemoTimeout = null;
    }
    if (tutorialDemoInterval) {
      clearInterval(tutorialDemoInterval);
      tutorialDemoInterval = null;
    }
    // Clear any pending scroll timeout
    if (tutorialScrollTimeout) {
      clearTimeout(tutorialScrollTimeout);
      tutorialScrollTimeout = null;
    }

    // Reset entire scene - remove all traces of tutorial
    if (sim) {
      sim.stop();
      sim.heatingOn = false;
      sim.trialEnded = false;
      // Clear all gas history
      sim.gasHistory = [];
      sim.gasCount = 0;
      sim.escapedCount = 0;
      sim.escapedParticles = [];
      sim.completedTrials.clear();
      // Reset gas start time
      sim.gasStart = performance.now();
      // Redraw to clear graph immediately
      sim.draw();
      // Explicitly redraw the gas graph to ensure it's cleared
      if (typeof sim.drawGasGraph === "function") {
        sim.drawGasGraph();
      }
    }

    // Reset UI buttons
    if (refs.tHeat) {
      refs.tHeat.classList.remove("is-active");
    }
    if (refs.sim) refs.sim.classList.remove("is-heating");

    // Hide tutorial overlay
    if (refs.tutorialOverlay) {
      refs.tutorialOverlay.classList.add("hidden");
    }

    // CRITICAL: Remove scroll prevention event listeners
    window.removeEventListener("wheel", preventScrollDuringTutorial);
    window.removeEventListener("touchmove", preventScrollDuringTutorial);

    // Re-enable scrolling
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";

    // Save completion to localStorage
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
    } catch (_) {}
  }

  function startTutorial() {
    if (refs.tutorialOverlay) {
      refs.tutorialOverlay.classList.remove("hidden");
      // Disable scrolling while tutorial is active
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";

      // Add scroll prevention event listeners
      window.addEventListener("wheel", preventScrollDuringTutorial, {
        passive: false,
      });
      window.addEventListener("touchmove", preventScrollDuringTutorial, {
        passive: false,
      });

      // Scroll to top to ensure tutorial modal is visible
      window.scrollTo({ top: 0, behavior: "smooth" });
      // Immediately set correct positioning to prevent visual glitch
      const tutorialContent =
        refs.tutorialOverlay.querySelector(".tutorial-content");
      if (tutorialContent) {
        tutorialContent.style.position = "fixed";
        tutorialContent.style.left = "50%";
        tutorialContent.style.bottom = "20px";
        tutorialContent.style.top = "auto";
        tutorialContent.style.right = "auto";
        tutorialContent.style.transform = "translateX(-50%)";
        tutorialContent.style.display = "flex";
        tutorialContent.style.visibility = "visible";
        tutorialContent.style.opacity = "1";
        tutorialContent.style.margin = "0";
      }
      setTimeout(() => {
        showTutorialStep(0);
      }, 50);
    }
  }

  // Check if tutorial should be shown
  try {
    const tutorialCompleted =
      localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";
    if (!tutorialCompleted) {
      // Show tutorial after a short delay to let page load
      setTimeout(() => {
        startTutorial();
      }, 500);
    }
  } catch (_) {
    // If localStorage fails, show tutorial anyway
    setTimeout(() => {
      startTutorial();
    }, 500);
  }

  // Tutorial button handlers
  if (refs.tutorialNext) {
    refs.tutorialNext.addEventListener("click", () => {
      // Stop any running demo
      if (tutorialDemoTimeout) {
        clearTimeout(tutorialDemoTimeout);
        tutorialDemoTimeout = null;
      }
      if (tutorialDemoInterval) {
        clearInterval(tutorialDemoInterval);
        tutorialDemoInterval = null;
      }
      if (sim) {
        sim.stop();
        sim.heatingOn = false;
        if (refs.tHeat) {
          refs.tHeat.classList.remove("is-active");
        }
        if (refs.sim) refs.sim.classList.remove("is-heating");
      }

      if (currentTutorialStep < tutorialSteps.length - 1) {
        showTutorialStep(currentTutorialStep + 1);
      } else {
        closeTutorial();
      }
    });
  }

  if (refs.tutorialPrev) {
    refs.tutorialPrev.addEventListener("click", () => {
      // Don't do anything if button is disabled (step 1)
      if (refs.tutorialPrev.disabled) {
        return;
      }

      // Stop any running demo
      if (tutorialDemoTimeout) {
        clearTimeout(tutorialDemoTimeout);
        tutorialDemoTimeout = null;
      }
      if (tutorialDemoInterval) {
        clearInterval(tutorialDemoInterval);
        tutorialDemoInterval = null;
      }
      if (sim) {
        sim.stop();
        sim.heatingOn = false;
        if (refs.tHeat) {
          refs.tHeat.classList.remove("is-active");
        }
        if (refs.sim) refs.sim.classList.remove("is-heating");
      }

      if (currentTutorialStep > 0) {
        showTutorialStep(currentTutorialStep - 1);
      }
    });
  }

  if (refs.tutorialSkip) {
    refs.tutorialSkip.addEventListener("click", () => {
      // Stop any running demo
      if (tutorialDemoTimeout) {
        clearTimeout(tutorialDemoTimeout);
        tutorialDemoTimeout = null;
      }
      if (tutorialDemoInterval) {
        clearInterval(tutorialDemoInterval);
        tutorialDemoInterval = null;
      }
      if (sim) {
        sim.stop();
        sim.heatingOn = false;
        if (refs.tHeat) {
          refs.tHeat.classList.remove("is-active");
        }
        if (refs.sim) refs.sim.classList.remove("is-heating");
      }
      closeTutorial();
    });
  }

  // Replay tutorial button
  if (refs.replayTutorialBtn) {
    refs.replayTutorialBtn.addEventListener("click", () => {
      // Clear the tutorial completion flag
      try {
        localStorage.removeItem(TUTORIAL_STORAGE_KEY);
      } catch (_) {}
      // Start tutorial
      startTutorial();
    });
  }

  // Prevent user scrolling while tutorial is active
  function preventScrollDuringTutorial(e) {
    if (
      refs.tutorialOverlay &&
      !refs.tutorialOverlay.classList.contains("hidden")
    ) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }

  // Update tutorial highlight position on resize
  let tutorialUpdateTimeout = null;
  function updateTutorialPosition() {
    if (
      refs.tutorialOverlay &&
      !refs.tutorialOverlay.classList.contains("hidden")
    ) {
      showTutorialStep(currentTutorialStep);
    }
  }
  window.addEventListener(
    "scroll",
    () => {
      clearTimeout(tutorialUpdateTimeout);
      tutorialUpdateTimeout = setTimeout(updateTutorialPosition, 100);
    },
    true
  );
  window.addEventListener("resize", () => {
    clearTimeout(tutorialUpdateTimeout);
    tutorialUpdateTimeout = setTimeout(updateTutorialPosition, 100);
  });

  return () => {
    sim.destroy();
    try {
      if (themeObserver) themeObserver.disconnect();
    } catch (_) {}
    try {
      if (viewer) {
        viewer.clear();
        viewer = null;
      }
    } catch (_) {}
    try {
      const h = root.querySelector("#imfs-host");
      if (h && h.parentNode) h.parentNode.removeChild(h);
    } catch (_) {}
  };
}
