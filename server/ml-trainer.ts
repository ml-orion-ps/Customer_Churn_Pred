import { RandomForestClassifier } from "ml-random-forest";

// ── Types ─────────────────────────────────────────────────────────────
export interface TrainResult {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc: number;
  confusionMatrix: { tp: number; fp: number; tn: number; fn: number };
  featureImportance: Array<{ name: string; importance: number }>;
  modelWeights: any; // serialized weights for later scoring
}

export interface ModelWeights {
  algorithm: string;
  featureNames: string[];
  normMean?: number[];
  normStd?: number[];
  // LR / SVM
  w?: number[];
  bias?: number;
  // GB / XGBoost stumps
  trees?: any[];
  initPred?: number;
  lr?: number;
  // Random Forest serialized JSON
  rfModel?: any;
  // Neural Network layers
  W1?: number[][];
  b1?: number[];
  W2?: number[][];
  b2?: number[];
  W3?: number[][];
  b3?: number[];
}

// ── Feature extraction ────────────────────────────────────────────────
const CONTRACTS = ["month-to-month", "one-year", "two-year"];
const TIERS = ["bronze", "silver", "gold", "platinum"];
const REGIONS = ["Northeast", "Southeast", "Midwest", "Southwest", "West", "Northwest", "Central", "South", "West Coast", "Pacific"];

function buildFeatureRow(c: any): number[] {
  return [
    c.tenureMonths ?? 0,
    c.monthlyRevenue ?? 0,
    c.outageCount ?? 0,
    c.npsScore ?? 5,
    c.ticketCount ?? 0,
    c.avgResolutionHours ?? 0,
    c.creditScore ?? 650,
    c.provisionedSpeed ?? 0,
    c.actualSpeed ?? 0,
    c.fiberAvailable ? 1 : 0,
    c.competitorAvailable ? 1 : 0,
    ...CONTRACTS.map(ct => (c.contractStatus === ct ? 1 : 0)),
    ...TIERS.map(t => ((c.valueTier || "").toLowerCase() === t ? 1 : 0)),
    ...REGIONS.map(r => (c.region === r ? 1 : 0)),
  ];
}

const FEATURE_NAMES = [
  "tenure_months", "monthly_revenue", "outage_count", "nps_score",
  "ticket_count", "avg_resolution_hours", "credit_score", "provisioned_speed",
  "actual_speed", "fiber_available", "competitor_available",
  ...CONTRACTS.map(c => `contract_${c.replace(/-/g, "_")}`),
  ...TIERS.map(t => `tier_${t}`),
  ...REGIONS.map(r => `region_${r.toLowerCase().replace(/\s/g, "_")}`),
];

export function buildFeatureMatrix(customers: any[]): { X: number[][]; y: number[] } {
  const X = customers.map(buildFeatureRow);
  const y = customers.map(c => (c.isChurned ? 1 : 0));
  return { X, y };
}

// ── Normalization ─────────────────────────────────────────────────────
function computeNorm(X: number[][]): { mean: number[]; std: number[] } {
  const n = X.length, m = X[0].length;
  const mean = new Array(m).fill(0);
  const std = new Array(m).fill(1);
  for (let j = 0; j < m; j++) {
    mean[j] = X.reduce((s, r) => s + r[j], 0) / n;
    const v = X.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / n;
    std[j] = Math.sqrt(v) || 1;
  }
  return { mean, std };
}

function applyNorm(X: number[][], mean: number[], std: number[]): number[][] {
  return X.map(r => r.map((v, j) => (v - mean[j]) / std[j]));
}

// ── Helpers ───────────────────────────────────────────────────────────
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function splitData(X: number[][], y: number[], testFrac = 0.2) {
  const idx = shuffle(Array.from({length: X.length}, (_, i) => i));
  const cut = Math.floor(X.length * (1 - testFrac));
  const tr = idx.slice(0, cut), te = idx.slice(cut);
  return {
    Xtr: tr.map(i => X[i]), ytr: tr.map(i => y[i]),
    Xte: te.map(i => X[i]), yte: te.map(i => y[i]),
  };
}

function computeAUC(yTrue: number[], scores: number[]): number {
  const pairs = yTrue.map((y, i) => ({ y, s: scores[i] })).sort((a, b) => b.s - a.s);
  const P = yTrue.reduce((s, v) => s + v, 0);
  const N = yTrue.length - P;
  if (!P || !N) return 0.5;
  let tp = 0, fp = 0, ptp = 0, pfp = 0, auc = 0;
  for (const { y } of pairs) {
    y ? tp++ : fp++;
    auc += (tp + ptp) / 2 * (fp - pfp) / N;
    ptp = tp; pfp = fp;
  }
  return auc / P;
}

function metrics(yt: number[], scores: number[], thresh = 0.5) {
  const yp = scores.map(s => s >= thresh ? 1 : 0);
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < yt.length; i++) {
    if (yt[i] === 1 && yp[i] === 1) tp++;
    else if (yt[i] === 0 && yp[i] === 1) fp++;
    else if (yt[i] === 0 && yp[i] === 0) tn++;
    else fn++;
  }
  const acc = (tp + tn) / yt.length;
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const rec = tp + fn ? tp / (tp + fn) : 0;
  const f1 = prec + rec ? 2 * prec * rec / (prec + rec) : 0;
  const auc = computeAUC(yt, scores);
  return { accuracy: acc, precision: prec, recall: rec, f1Score: f1, auc, confusionMatrix: { tp, fp, tn, fn } };
}

function normImportances(vals: number[]): Array<{ name: string; importance: number }> {
  const sum = vals.reduce((s, v) => s + Math.abs(v), 0) || 1;
  return FEATURE_NAMES.map((name, i) => ({ name, importance: parseFloat((Math.abs(vals[i] || 0) / sum).toFixed(4)) }))
    .sort((a, b) => b.importance - a.importance);
}

// ── Decision Stump (used by GB/XGBoost) ──────────────────────────────
interface Stump { fi: number; thr: number; lv: number; rv: number }

function fitStump(X: number[][], r: number[]): Stump {
  const n = X.length, m = X[0].length;
  let best: Stump = { fi: 0, thr: 0, lv: 0, rv: 0 };
  let bestGain = -Infinity;

  for (let f = 0; f < m; f++) {
    const sorted = Array.from({length: n}, (_, i) => i).sort((a, b) => X[a][f] - X[b][f]);
    let lSum = 0, lCnt = 0;
    const rSum = r.reduce((s, v) => s + v, 0);
    let rCnt = n;

    for (let k = 0; k < n - 1; k++) {
      lSum += r[sorted[k]]; lCnt++;
      const rSumK = rSum - lSum; rCnt--;
      if (X[sorted[k]][f] === X[sorted[k + 1]][f]) continue;
      const gain = (lCnt > 0 ? lSum * lSum / lCnt : 0) + (rCnt > 0 ? rSumK * rSumK / rCnt : 0);
      if (gain > bestGain) {
        bestGain = gain;
        best = {
          fi: f,
          thr: (X[sorted[k]][f] + X[sorted[k + 1]][f]) / 2,
          lv: lCnt > 0 ? lSum / lCnt : 0,
          rv: rCnt > 0 ? rSumK / rCnt : 0,
        };
      }
    }
  }
  return best;
}

function predictStump(s: Stump, X: number[][]): number[] {
  return X.map(r => r[s.fi] <= s.thr ? s.lv : s.rv);
}

// ── Algorithm: Logistic Regression (SGD) ────────────────────────────
function trainLogisticRegression(Xtr: number[][], ytr: number[], Xte: number[][], yte: number[], hp: any) {
  const m = Xtr[0].length, n = Xtr.length;
  const lr = hp.learning_rate ?? 0.01;
  const epochs = hp.epochs ?? 150;
  const lambda = hp.C ? 1 / hp.C : 0.01;
  let w = new Array(m).fill(0);
  let bias = 0;

  const indices = Array.from({length: n}, (_, i) => i);
  for (let ep = 0; ep < epochs; ep++) {
    const shuf = shuffle(indices);
    for (const i of shuf) {
      const z = Xtr[i].reduce((s, v, j) => s + v * w[j], bias);
      const pred = sigmoid(z);
      const err = pred - ytr[i];
      for (let j = 0; j < m; j++) w[j] = w[j] * (1 - lr * lambda) - lr * err * Xtr[i][j];
      bias -= lr * err;
    }
  }

  const scores = Xte.map(r => sigmoid(r.reduce((s, v, j) => s + v * w[j], bias)));
  const fi = normImportances(w);
  return { ...metrics(yte, scores), featureImportance: fi, modelWeights: { algorithm: "Logistic Regression", w, bias, featureNames: FEATURE_NAMES } };
}

// ── Algorithm: SVM (Pegasos linear) ──────────────────────────────────
function trainSVM(Xtr: number[][], ytr: number[], Xte: number[][], yte: number[], hp: any) {
  const m = Xtr[0].length, n = Xtr.length;
  const lambda = 1 / ((hp.C ?? 1.0) * n);
  const epochs = hp.epochs ?? 100;
  let w = new Array(m).fill(0);
  let bias = 0;

  const ySvm = ytr.map(v => v === 1 ? 1 : -1);
  let t = 1;
  for (let ep = 0; ep < epochs; ep++) {
    const shuf = shuffle(Array.from({length: n}, (_, i) => i));
    for (const i of shuf) {
      const eta = 1 / (lambda * t++);
      const z = Xtr[i].reduce((s, v, j) => s + v * w[j], bias);
      const margin = ySvm[i] * z;
      if (margin < 1) {
        for (let j = 0; j < m; j++) w[j] = (1 - eta * lambda) * w[j] + eta * ySvm[i] * Xtr[i][j];
        bias += eta * ySvm[i];
      } else {
        for (let j = 0; j < m; j++) w[j] *= (1 - eta * lambda);
      }
    }
  }

  // Convert to probability via sigmoid on decision margin
  const scores = Xte.map(r => sigmoid(r.reduce((s, v, j) => s + v * w[j], bias)));
  const fi = normImportances(w);
  return { ...metrics(yte, scores), featureImportance: fi, modelWeights: { algorithm: "SVM", w, bias, featureNames: FEATURE_NAMES } };
}

// ── Algorithm: Gradient Boosting ─────────────────────────────────────
function trainGradientBoosting(Xtr: number[][], ytr: number[], Xte: number[][], yte: number[], hp: any) {
  const n = Xtr.length, m = FEATURE_NAMES.length;
  const nEst = hp.n_estimators ?? 100;
  const lr = hp.learning_rate ?? 0.1;
  const p0 = ytr.reduce((s, v) => s + v, 0) / n;
  let F = new Array(n).fill(Math.log(p0 / (1 - p0 + 1e-10)));
  const trees: Stump[] = [];
  const featureGain = new Array(m).fill(0);

  for (let t = 0; t < nEst; t++) {
    const r = F.map((f, i) => ytr[i] - sigmoid(f)); // negative gradient of log-loss
    const stump = fitStump(Xtr, r);
    trees.push(stump);
    featureGain[stump.fi] += Math.abs(stump.lv) + Math.abs(stump.rv);
    const preds = predictStump(stump, Xtr);
    for (let i = 0; i < n; i++) F[i] += lr * preds[i];
  }

  const Fte = new Array(Xte.length).fill(Math.log(p0 / (1 - p0 + 1e-10)));
  for (const s of trees) {
    const p = predictStump(s, Xte);
    for (let i = 0; i < Xte.length; i++) Fte[i] += lr * p[i];
  }
  const scores = Fte.map(f => sigmoid(f));
  const fi = normImportances(featureGain);
  const initPred = Math.log(p0 / (1 - p0 + 1e-10));
  return { ...metrics(yte, scores), featureImportance: fi, modelWeights: { algorithm: "Gradient Boosting", trees, initPred, lr, featureNames: FEATURE_NAMES } };
}

// ── Algorithm: XGBoost (GB + regularization) ─────────────────────────
function trainXGBoost(Xtr: number[][], ytr: number[], Xte: number[][], yte: number[], hp: any) {
  const n = Xtr.length, m = FEATURE_NAMES.length;
  const nEst = hp.n_estimators ?? 100;
  const lr = hp.learning_rate ?? 0.05;
  const lambda = 1.0; // L2 on leaf weights
  const p0 = ytr.reduce((s, v) => s + v, 0) / n;
  let F = new Array(n).fill(Math.log(p0 / (1 - p0 + 1e-10)));
  const trees: Stump[] = [];
  const featureGain = new Array(m).fill(0);

  for (let t = 0; t < nEst; t++) {
    const probs = F.map(f => sigmoid(f));
    // XGBoost: use g and h for Newton step approximation
    const g = probs.map((p, i) => p - ytr[i]);
    const h = probs.map(p => p * (1 - p));
    // Weighted residuals: -g/h for the optimal leaf values
    const r = g.map((gi, i) => -(gi / (h[i] + lambda)));
    const stump = fitStump(Xtr, r);
    // Regularize leaf values
    stump.lv = stump.lv / (1 + lambda);
    stump.rv = stump.rv / (1 + lambda);
    trees.push(stump);
    featureGain[stump.fi] += Math.abs(stump.lv) + Math.abs(stump.rv);
    const preds = predictStump(stump, Xtr);
    for (let i = 0; i < n; i++) F[i] += lr * preds[i];
  }

  const Fte = new Array(Xte.length).fill(Math.log(p0 / (1 - p0 + 1e-10)));
  for (const s of trees) {
    const p = predictStump(s, Xte);
    for (let i = 0; i < Xte.length; i++) Fte[i] += lr * p[i];
  }
  const scores = Fte.map(f => sigmoid(f));
  const fi = normImportances(featureGain);
  const initPred = Math.log(p0 / (1 - p0 + 1e-10));
  return { ...metrics(yte, scores), featureImportance: fi, modelWeights: { algorithm: "XGBoost", trees, initPred, lr, featureNames: FEATURE_NAMES } };
}

// ── Algorithm: Random Forest ─────────────────────────────────────────
function trainRandomForest(Xtr: number[][], ytr: number[], Xte: number[][], yte: number[], hp: any) {
  const rf = new RandomForestClassifier({
    nEstimators: hp.n_estimators ?? 100,
    maxFeatures: hp.max_features ?? 0.6,
    replacement: true,
    useSampleBagging: true,
  });
  rf.train(Xtr, ytr);

  // Probability from fraction of trees voting class 1
  const scores = Xte.map(row => {
    const votes = (rf as any).estimators.map((tree: any) => tree.predict([row])[0]);
    return votes.filter((v: number) => v === 1).length / votes.length;
  });

  // Feature importance: mean decrease impurity from all trees (approximated via correlation with votes)
  const rfFi = new Array(FEATURE_NAMES.length).fill(0);
  const trainScores = Xtr.map(row => {
    const votes = (rf as any).estimators.map((tree: any) => tree.predict([row])[0]);
    return votes.filter((v: number) => v === 1).length / votes.length;
  });
  for (let f = 0; f < FEATURE_NAMES.length; f++) {
    const col = Xtr.map(r => r[f]);
    const mn = col.reduce((s, v) => s + v, 0) / col.length;
    const corr = col.reduce((s, v, i) => s + (v - mn) * (trainScores[i] - 0.5), 0);
    rfFi[f] = Math.abs(corr);
  }

  const rfJson = rf.toJSON();
  const fi = normImportances(rfFi);
  return { ...metrics(yte, scores), featureImportance: fi, modelWeights: { algorithm: "Random Forest", rfModel: rfJson, featureNames: FEATURE_NAMES } };
}

// ── Algorithm: Neural Network (2-layer MLP backprop) ─────────────────
function trainNeuralNetwork(Xtr: number[][], ytr: number[], Xte: number[][], yte: number[], hp: any) {
  const nin = Xtr[0].length;
  const nh1 = 16, nh2 = 8;
  const lr = 0.01;
  const epochs = hp.epochs ?? 80;

  // He initialization
  const rnd = () => (Math.random() - 0.5) * 2;
  const W1 = Array.from({ length: nh1 }, () => Array.from({ length: nin }, () => rnd() * Math.sqrt(2 / nin)));
  const b1 = new Array(nh1).fill(0);
  const W2 = Array.from({ length: nh2 }, () => Array.from({ length: nh1 }, () => rnd() * Math.sqrt(2 / nh1)));
  const b2 = new Array(nh2).fill(0);
  const W3 = Array.from({ length: 1 }, () => Array.from({ length: nh2 }, () => rnd() * Math.sqrt(2 / nh2)));
  const b3 = [0];

  const relu = (x: number) => Math.max(0, x);
  const drelu = (x: number) => x > 0 ? 1 : 0;
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

  function forward(x: number[]) {
    const h1 = W1.map((row, i) => relu(dot(row, x) + b1[i]));
    const h2 = W2.map((row, i) => relu(dot(row, h1) + b2[i]));
    const out = sigmoid(dot(W3[0], h2) + b3[0]);
    return { h1, h2, out };
  }

  const indices = Array.from({length: Xtr.length}, (_, i) => i);
  for (let ep = 0; ep < epochs; ep++) {
    const shuf = shuffle(indices);
    for (const i of shuf) {
      const x = Xtr[i]; const y = ytr[i];
      const { h1, h2, out } = forward(x);
      const dOut = out - y;

      // Backprop through W3
      const dW3 = W3[0].map((_, j) => dOut * h2[j]);
      const db3 = dOut;
      const dh2 = W3[0].map((w, j) => dOut * w * drelu(dot(W2[j], h1) + b2[j]));

      // Backprop through W2
      const dW2 = W2.map((row, i2) => row.map((_, j2) => dh2[i2] * h1[j2]));
      const db2 = dh2.slice();
      const dh1 = h1.map((_, j) => W2.reduce((s, row, i2) => s + dh2[i2] * row[j], 0) * drelu(dot(W1[j], x) + b1[j]));

      // Backprop through W1
      const dW1 = W1.map((row, i1) => row.map((_, j1) => dh1[i1] * x[j1]));

      // Update
      W3[0].forEach((_, j) => { W3[0][j] -= lr * dW3[j]; });
      b3[0] -= lr * db3;
      W2.forEach((row, i2) => row.forEach((_, j2) => { W2[i2][j2] -= lr * dW2[i2][j2]; }));
      b2.forEach((_, i2) => { b2[i2] -= lr * db2[i2]; });
      W1.forEach((row, i1) => row.forEach((_, j1) => { W1[i1][j1] -= lr * dW1[i1][j1]; }));
      dh1.forEach((d, i1) => { b1[i1] -= lr * d; });
    }
  }

  const scores = Xte.map(x => forward(x).out);

  // Feature importance: average absolute input weight to first hidden layer
  const fi = normImportances(W1[0].map((_, j) => W1.reduce((s, row) => s + Math.abs(row[j]), 0) / nh1));
  return {
    ...metrics(yte, scores),
    featureImportance: fi,
    modelWeights: { algorithm: "Neural Network", W1, b1, W2, b2, W3, b3, featureNames: FEATURE_NAMES },
  };
}

// ── Scoring function (use stored weights to score a customer) ─────────
export function scoreCustomer(weights: ModelWeights, customer: any): number {
  const x = buildFeatureRow(customer);
  const { algorithm } = weights;

  if (algorithm === "Logistic Regression" || algorithm === "SVM") {
    const { w, bias, normMean, normStd } = weights;
    const xn = normMean ? x.map((v, j) => (v - normMean[j]) / (normStd![j] || 1)) : x;
    return sigmoid(xn.reduce((s, v, j) => s + v * w![j], bias!));
  }

  if (algorithm === "Gradient Boosting" || algorithm === "XGBoost") {
    const { trees, initPred, lr } = weights;
    let F = initPred!;
    for (const s of trees!) F += lr! * (x[s.fi] <= s.thr ? s.lv : s.rv);
    return sigmoid(F);
  }

  if (algorithm === "Random Forest") {
    const rf = RandomForestClassifier.load(weights.rfModel);
    const votes = (rf as any).estimators.map((tree: any) => tree.predict([x])[0]);
    return votes.filter((v: number) => v === 1).length / votes.length;
  }

  if (algorithm === "Neural Network") {
    const { W1, b1, W2, b2, W3, b3, normMean, normStd } = weights;
    const xn = normMean ? x.map((v, j) => (v - normMean[j]) / (normStd![j] || 1)) : x;
    const relu = (v: number) => Math.max(0, v);
    const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
    const h1 = W1!.map((row: number[], i: number) => relu(dot(row, xn) + b1![i]));
    const h2 = W2!.map((row: number[], i: number) => relu(dot(row, h1) + b2![i]));
    return sigmoid(dot(W3![0], h2) + b3![0]);
  }

  return 0.5; // fallback
}

// ── Main entry point ──────────────────────────────────────────────────
export async function trainAlgorithm(algorithm: string, customers: any[], hyperparams: any): Promise<TrainResult> {
  const { X, y } = buildFeatureMatrix(customers);
  const { Xtr, ytr, Xte, yte } = splitData(X, y, 0.2);

  // Normalize for linear models and NN; not needed for trees
  const norm = computeNorm(Xtr);
  const XtrN = applyNorm(Xtr, norm.mean, norm.std);
  const XteN = applyNorm(Xte, norm.mean, norm.std);

  let result: any;

  switch (algorithm) {
    case "Logistic Regression": {
      result = trainLogisticRegression(XtrN, ytr, XteN, yte, hyperparams);
      result.modelWeights.normMean = norm.mean;
      result.modelWeights.normStd = norm.std;
      break;
    }
    case "SVM": {
      result = trainSVM(XtrN, ytr, XteN, yte, hyperparams);
      result.modelWeights.normMean = norm.mean;
      result.modelWeights.normStd = norm.std;
      break;
    }
    case "Gradient Boosting":
      result = trainGradientBoosting(Xtr, ytr, Xte, yte, hyperparams);
      break;
    case "XGBoost":
      result = trainXGBoost(Xtr, ytr, Xte, yte, hyperparams);
      break;
    case "Random Forest":
      result = trainRandomForest(Xtr, ytr, Xte, yte, hyperparams);
      break;
    case "Neural Network": {
      result = trainNeuralNetwork(XtrN, ytr, XteN, yte, hyperparams);
      result.modelWeights.normMean = norm.mean;
      result.modelWeights.normStd = norm.std;
      break;
    }
    default:
      result = trainLogisticRegression(XtrN, ytr, XteN, yte, hyperparams);
      result.modelWeights.normMean = norm.mean;
      result.modelWeights.normStd = norm.std;
  }

  return result as TrainResult;
}
