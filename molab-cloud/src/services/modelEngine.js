/**
 * MOLAB Cloud — mathematical oncology model engine.
 * Runge–Kutta 4 integration + Nelder–Mead parameter fitting for five
 * published tumor-growth models. Runs server-side so results cannot be
 * spoofed by a client and so every hospital gets an identical, auditable
 * calculation.
 */

const MODELS = {
  gompertz: {
    name: 'Gompertz Growth', eq: 'dV/dt = rV\u00b7ln(K/V)', color: '#5EEAD4',
    use: 'Classic tumor-growth curve; widely used for solid-tumor prognosis and treatment-response tracking.',
    ref: 'Norton, 1988 — Gompertzian model of tumor growth',
    guess: (v0, vMax) => [
      { key: 'r', def: 0.05, min: 0.001, max: 0.5 },
      { key: 'K', def: Math.max(vMax * 3, v0 * 5), min: v0 * 1.2, max: vMax * 20 },
    ],
    deriv: (t, V, p) => [p.r * Math.max(V[0], 1e-5) * Math.log(p.K / Math.max(V[0], 1e-5))],
  },
  logistic: {
    name: 'Logistic Growth', eq: 'dV/dt = rV(1 \u2212 V/K)', color: '#F2C14E',
    use: 'Growth with a hard capacity ceiling; used where tumor growth saturates within tissue constraints.',
    ref: 'Verhulst logistic model applied to oncology',
    guess: (v0, vMax) => [
      { key: 'r', def: 0.06, min: 0.001, max: 0.6 },
      { key: 'K', def: Math.max(vMax * 3, v0 * 5), min: v0 * 1.2, max: vMax * 20 },
    ],
    deriv: (t, V, p) => [p.r * Math.max(V[0], 0) * (1 - V[0] / p.K)],
  },
  exponential: {
    name: 'Exponential Growth', eq: 'dV/dt = rV', color: '#E15B64',
    use: 'Unconstrained early-phase growth; best fit for small, treatment-na\u00efve, fast-doubling lesions.',
    ref: 'Simple exponential growth law',
    guess: (v0, vMax) => [{ key: 'r', def: 0.03, min: 0.001, max: 0.4 }],
    deriv: (t, V, p) => [p.r * Math.max(V[0], 0)],
  },
  vonBertalanffy: {
    name: 'von Bertalanffy', eq: 'dV/dt = aV^(2/3) \u2212 bV', color: '#7C9EF2',
    use: 'Balances surface-area-driven nutrient supply against volumetric loss; used for vascularized solid tumors.',
    ref: 'von Bertalanffy, 1957 — applied tumor growth form',
    guess: (v0, vMax) => [
      { key: 'a', def: Math.max(0.3, Math.pow(vMax, 1 / 3) * 0.1), min: 0.001, max: 5 },
      { key: 'b', def: 0.02, min: 0.0001, max: 1 },
    ],
    deriv: (t, V, p) => [p.a * Math.pow(Math.max(V[0], 1e-5), 2 / 3) - p.b * Math.max(V[0], 0)],
  },
  powerLaw: {
    name: 'Power-Law (Guiot)', eq: 'dV/dt = rV^\u03b8', color: '#B48EAD',
    use: 'General universal growth law; \u03b8<1 approximates fractal, vascularization-limited tumor growth.',
    ref: 'Guiot et al., 2003 — universal tumor growth law',
    guess: (v0, vMax) => [
      { key: 'r', def: 0.08, min: 0.0001, max: 1 },
      { key: 'theta', def: 0.75, min: 0.5, max: 1 },
    ],
    deriv: (t, V, p) => [p.r * Math.pow(Math.max(V[0], 1e-5), p.theta)],
  },
};

function rungeKutta4(deriv, y0, t0, tEnd, steps, p) {
  let dt = (tEnd - t0) / steps, trajectory = [], t = t0, y = [...y0];
  trajectory.push({ t, v: y[0] });
  for (let i = 0; i < steps; i++) {
    const k1 = deriv(t, y, p);
    const yk2 = y.map((val, idx) => val + 0.5 * dt * k1[idx]);
    const k2 = deriv(t + 0.5 * dt, yk2, p);
    const yk3 = y.map((val, idx) => val + 0.5 * dt * k2[idx]);
    const k3 = deriv(t + 0.5 * dt, yk3, p);
    const yk4 = y.map((val, idx) => val + dt * k3[idx]);
    const k4 = deriv(t + dt, yk4, p);
    y = y.map((val, idx) => val + (dt / 6) * (k1[idx] + 2 * k2[idx] + 2 * k3[idx] + k4[idx]));
    t += dt;
    trajectory.push({ t, v: y[0] });
  }
  return trajectory;
}

function interpolateTrajectoryValue(trajectory, targetT) {
  if (targetT <= trajectory[0].t) return trajectory[0].v;
  if (targetT >= trajectory[trajectory.length - 1].t) return trajectory[trajectory.length - 1].v;
  for (let i = 1; i < trajectory.length; i++) {
    if (trajectory[i].t >= targetT) {
      const p1 = trajectory[i - 1], p2 = trajectory[i];
      const ratio = (targetT - p1.t) / (p2.t - p1.t);
      return p1.v + ratio * (p2.v - p1.v);
    }
  }
  return 0;
}

function nelderMeadFit(modelKey, dataset) {
  const model = MODELS[modelKey];
  const v0 = dataset[0].v, vMax = Math.max(...dataset.map((d) => d.v));
  const paramMeta = model.guess(v0, vMax);
  const keys = paramMeta.map((p) => p.key);
  const initialGuess = paramMeta.map((p) => p.def);
  const tMaxFit = Math.max(...dataset.map((d) => d.t), 10) * 1.05;

  function objective(vector) {
    const pMapped = {};
    keys.forEach((k, idx) => { pMapped[k] = Math.max(vector[idx], 1e-6); });
    const path = rungeKutta4(model.deriv, [dataset[0].v], 0, tMaxFit, 150, pMapped);
    let sq = 0;
    dataset.forEach((pt) => { const pred = interpolateTrajectoryValue(path, pt.t); sq += Math.pow(pred - pt.v, 2); });
    return sq;
  }

  const dim = initialGuess.length;
  let simplex = [initialGuess.slice()];
  for (let i = 0; i < dim; i++) {
    const vertex = initialGuess.slice();
    vertex[i] = vertex[i] !== 0 ? vertex[i] * 1.2 : 0.05;
    simplex.push(vertex);
  }
  for (let iter = 0; iter < 150; iter++) {
    simplex.sort((a, b) => objective(a) - objective(b));
    const centroid = new Array(dim).fill(0);
    for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) centroid[j] += simplex[i][j] / dim;
    const worst = simplex[dim];
    const reflected = centroid.map((c, idx) => c + 1.0 * (c - worst[idx]));
    if (objective(reflected) < objective(simplex[0])) simplex[dim] = reflected;
    else simplex[dim] = centroid.map((c, idx) => c + 0.5 * (worst[idx] - c));
  }
  simplex.sort((a, b) => objective(a) - objective(b));
  const bestParams = {};
  keys.forEach((k, idx) => {
    const meta = paramMeta.find((p) => p.key === k);
    bestParams[k] = Math.min(Math.max(simplex[0][idx], meta.min), meta.max);
  });
  return bestParams;
}

function fitAndProject(modelKey, dataset) {
  const model = MODELS[modelKey];
  const params = nelderMeadFit(modelKey, dataset);
  const tLast = Math.max(...dataset.map((d) => d.t));
  const tMaxFit = tLast * 1.05 || 10;
  const fitTrajectory = rungeKutta4(model.deriv, [dataset[0].v], 0, tMaxFit, 150, params);

  let sse = 0, meanV = dataset.reduce((a, c) => a + c.v, 0) / dataset.length, tss = 0;
  dataset.forEach((pt) => { const pred = interpolateTrajectoryValue(fitTrajectory, pt.t); sse += Math.pow(pred - pt.v, 2); tss += Math.pow(pt.v - meanV, 2); });
  const rmse = Math.sqrt(sse / dataset.length);
  const r2 = tss > 0 ? 1 - sse / tss : 1;
  const k = Object.keys(params).length;
  const aic = dataset.length * Math.log(Math.max(sse / dataset.length, 1e-10)) + 2 * k;

  const projHorizon = tLast + 120;
  const projTrajectory = rungeKutta4(model.deriv, [dataset[0].v], 0, projHorizon, 300, params);
  const vLast = interpolateTrajectoryValue(projTrajectory, tLast);
  const day90 = interpolateTrajectoryValue(projTrajectory, tLast + 90);

  let doublingTime = null;
  for (let i = 0; i < projTrajectory.length; i++) {
    if (projTrajectory[i].t >= tLast && projTrajectory[i].v >= 2 * vLast) { doublingTime = projTrajectory[i].t - tLast; break; }
  }
  return { key: modelKey, name: model.name, eq: model.eq, color: model.color, params, rmse, r2, aic, doublingTime, day90, trajectory: projTrajectory };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function runAllModels(dataset) {
  if (!Array.isArray(dataset) || dataset.length < 2) {
    throw new Error('At least two tumor measurement points are required to fit models.');
  }
  const results = Object.keys(MODELS).map((key) => fitAndProject(key, dataset));
  results.sort((a, b) => a.aic - b.aic);
  const bestKey = results[0].key;
  const doublings = results.map((r) => r.doublingTime).filter((d) => d !== null && isFinite(d));
  const medianDT = doublings.length ? median(doublings) : null;
  const day90s = results.map((r) => r.day90);
  const consensusDay90 = median(day90s);
  const minDay90 = Math.min(...day90s), maxDay90 = Math.max(...day90s);
  let risk = 'Moderate';
  if (medianDT !== null) risk = medianDT < 30 ? 'High' : medianDT < 90 ? 'Moderate' : 'Low';
  return { results, bestKey, medianDT, consensusDay90, minDay90, maxDay90, risk, runAt: new Date().toISOString() };
}

function modelRegistryPublicInfo() {
  return Object.entries(MODELS).map(([key, m]) => ({ key, name: m.name, eq: m.eq, color: m.color, use: m.use, ref: m.ref }));
}

module.exports = { MODELS, runAllModels, modelRegistryPublicInfo };
