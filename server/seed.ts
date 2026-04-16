import { db } from "./db";
import { customers, churnEvents, mlModels, predictions, recommendations } from "@shared/schema";
import { count } from "drizzle-orm";

const regions = ["Northeast", "Southeast", "Midwest", "Southwest", "West Coast"];
const states: Record<string, string[]> = {
  "Northeast": ["NY", "PA", "CT", "MA", "NJ"],
  "Southeast": ["NC", "SC", "GA", "FL", "VA"],
  "Midwest": ["OH", "MI", "IL", "IN", "WI"],
  "Southwest": ["TX", "AZ", "NM", "OK", "CO"],
  "West Coast": ["CA", "WA", "OR", "NV", "UT"],
};
const valueTiers = ["Platinum", "Gold", "Silver", "Bronze"];
const contractStatuses = ["Active", "Month-to-Month", "Expired", "Renewal Due"];
const bundleTypes = ["Internet Only", "Internet + Phone", "Internet + TV", "Triple Play"];
const churnReasons = ["Competitor - Fiber", "Competitor - Cable", "Service Quality", "Price Sensitivity", "Relocation", "Technology Upgrade", "Billing Issues", "Poor Support"];
const destinations = ["Fiber Provider", "Cable ISP", "Wireless 5G", "Cancel All Services", "Internal Fiber Upgrade"];
const lifecycleStages = ["New", "Growing", "Mature", "At Risk", "Declining"];
const premisesTypes = ["Single Family", "Multi-Dwelling", "Commercial", "Rural"];
const paymentHistories = ["Excellent", "Good", "Fair", "Poor"];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const firstNames = ["James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda", "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Lisa", "Daniel", "Nancy", "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley", "Steven", "Dorothy", "Paul", "Kimberly", "Andrew", "Emily", "Joshua", "Donna"];
const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson"];

export async function seedDatabase() {
  const [existing] = await db.select({ count: count() }).from(customers);
  if (existing.count > 0) {
    console.log(`⚠️  Database already has ${existing.count} customers. Clearing for fresh seed...`);
    await db.delete(churnEvents);
    await db.delete(mlModels);
    await db.delete(customers);
    console.log("✓ Tables cleared");
  }

  console.log("Seeding database with copper churn data...");

  const customerRecords: any[] = [];
  const churnEventRecords: any[] = [];
  const months = ["2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"];

  for (let i = 0; i < 500; i++) {
    const region = pick(regions);
    const state = pick(states[region]);
    const tenure = rand(3, 180);
    const valueTier = tenure > 60 ? pick(["Platinum", "Gold"]) : pick(valueTiers);
    const baseRevenue = valueTier === "Platinum" ? randFloat(120, 200) : valueTier === "Gold" ? randFloat(80, 130) : valueTier === "Silver" ? randFloat(50, 90) : randFloat(25, 55);
    const fiberAvailable = Math.random() > 0.55;
    const competitorAvailable = Math.random() > 0.4;
    const outages = rand(0, fiberAvailable ? 8 : 4);
    const tickets = rand(0, outages + 3);
    const nps = fiberAvailable && competitorAvailable ? rand(-20, 60) : rand(10, 90);
    const speedRatio = randFloat(0.3, 1.0);
    const provisionedSpeed = pick([10, 15, 25, 50, 75, 100]);
    const actualSpeed = parseFloat((provisionedSpeed * speedRatio).toFixed(1));

    let riskScore = 0;
    if (fiberAvailable) riskScore += 0.15;
    if (competitorAvailable) riskScore += 0.12;
    if (outages > 4) riskScore += 0.15;
    if (nps < 30) riskScore += 0.12;
    if (speedRatio < 0.6) riskScore += 0.1;
    if (tenure < 12) riskScore += 0.08;
    riskScore += randFloat(-0.1, 0.15);
    riskScore = Math.max(0.02, Math.min(0.98, riskScore));

    const isChurned = i < 120 ? true : (riskScore > 0.7 ? Math.random() > 0.5 : (riskScore > 0.5 ? Math.random() > 0.75 : Math.random() > 0.92));
    const churnDate = isChurned ? new Date(`${pick(months)}-${String(rand(1, 28)).padStart(2, '0')}`) : null;
    const churnReason = isChurned ? pick(churnReasons) : null;
    const riskCategory = riskScore > 0.7 ? "High" : riskScore > 0.4 ? "Medium" : "Low";

    customerRecords.push({
      accountNumber: `COP-${String(100000 + i).padStart(7, '0')}`,
      name: `${pick(firstNames)} ${pick(lastNames)}`,
      region,
      state,
      serviceType: "Copper DSL",
      tenureMonths: tenure,
      monthlyRevenue: baseRevenue,
      contractStatus: pick(contractStatuses),
      valueTier,
      creditScore: rand(550, 850),
      bundleType: pick(bundleTypes),
      provisionedSpeed,
      actualSpeed,
      outageCount: outages,
      ticketCount: tickets,
      avgResolutionHours: randFloat(2, 72),
      npsScore: nps,
      fiberAvailable,
      competitorAvailable,
      churnRiskScore: riskScore,
      churnRiskCategory: riskCategory,
      isChurned,
      churnDate,
      churnReason,
      lastBillAmount: baseRevenue + randFloat(-10, 20),
      paymentHistory: pick(paymentHistories),
      autoPayEnabled: Math.random() > 0.4,
      premisesType: pick(premisesTypes),
      lifecycleStage: isChurned ? "Declined" : pick(lifecycleStages),
    });

    if (isChurned) {
      churnEventRecords.push({
        customerId: i + 1,
        churnDate: churnDate!,
        churnType: pick(["Voluntary", "Involuntary", "Migration"]),
        reason: churnReason,
        destination: pick(destinations),
        revenueImpact: baseRevenue * 12,
        winBackAttempted: Math.random() > 0.5,
        winBackSuccessful: Math.random() > 0.8,
      });
    }
  }

  const batchSize = 100;
  const insertedIds: number[] = [];
  for (let i = 0; i < customerRecords.length; i += batchSize) {
    const batch = await db.insert(customers).values(customerRecords.slice(i, i + batchSize)).returning({ id: customers.id });
    insertedIds.push(...batch.map(r => r.id));
  }

  const churnEventRecordsWithIds = churnEventRecords.map(ce => {
    const originalIdx = ce.customerId - 1;
    return { ...ce, customerId: insertedIds[originalIdx] };
  });
  if (churnEventRecordsWithIds.length > 0) {
    for (let i = 0; i < churnEventRecordsWithIds.length; i += batchSize) {
      await db.insert(churnEvents).values(churnEventRecordsWithIds.slice(i, i + batchSize));
    }
  }

  const activeCustomers = customerRecords
    .map((c, i) => ({ ...c, dbId: insertedIds[i] }))
    .filter(c => !c.isChurned && c.churnRiskScore > 0.3);
  const predRecords: any[] = [];
  const recRecords: any[] = [];

  for (const cust of activeCustomers.slice(0, 200)) {
    const drivers: any[] = [];
    if (cust.fiberAvailable) drivers.push({ driver: "Fiber Available at Address", impact: randFloat(0.1, 0.25), direction: "positive" });
    if (cust.competitorAvailable) drivers.push({ driver: "Competitor Presence", impact: randFloat(0.08, 0.2), direction: "positive" });
    if (cust.outageCount > 3) drivers.push({ driver: "High Outage Frequency", impact: randFloat(0.1, 0.2), direction: "positive" });
    if (cust.npsScore < 40) drivers.push({ driver: "Low NPS Score", impact: randFloat(0.05, 0.15), direction: "positive" });
    if (cust.actualSpeed / cust.provisionedSpeed < 0.7) drivers.push({ driver: "Speed Gap", impact: randFloat(0.05, 0.15), direction: "positive" });
    if (cust.tenureMonths < 12) drivers.push({ driver: "Short Tenure", impact: randFloat(0.05, 0.1), direction: "positive" });
    if (cust.contractStatus === "Month-to-Month") drivers.push({ driver: "No Contract Lock-in", impact: randFloat(0.05, 0.12), direction: "positive" });

    const actionType = cust.churnRiskScore > 0.7 ? "Save" : cust.churnRiskScore > 0.5 ? "Migrate" : "Remediate";
    const action = actionType === "Save"
      ? pick(["Offer loyalty discount 20%", "Priority service upgrade", "Bundle upgrade with price lock", "Dedicated account manager"])
      : actionType === "Migrate"
      ? pick(["Proactive fiber migration offer", "Hybrid fiber-copper upgrade", "Speed tier upgrade", "Technology consultation"])
      : pick(["Proactive maintenance scheduling", "Service quality review", "Billing optimization review", "Digital engagement campaign"]);

    predRecords.push({
      modelId: 1,
      customerId: cust.dbId,
      churnProbability: cust.churnRiskScore,
      riskCategory: cust.churnRiskCategory,
      topDrivers: drivers,
      recommendedAction: action,
      actionCategory: actionType,
    });

    const status = pick(["pending", "in_progress", "completed", "declined"]);
    const outcome = (status === "completed" || status === "declined") ? pick(["retained", "churned", "downgraded"]) : null;
    const createdAt = new Date(Date.now() - randInt(30, 90) * 86400000);
    const executedAt = (status === "completed") ? new Date(createdAt.getTime() + randInt(1, 14) * 86400000) : null;

    recRecords.push({
      customerId: cust.dbId,
      predictionId: predRecords.length,
      actionType,
      description: action,
      priority: cust.churnRiskScore > 0.7 ? "Critical" : cust.churnRiskScore > 0.5 ? "High" : "Medium",
      estimatedImpact: cust.monthlyRevenue * 12 * cust.churnRiskScore,
      estimatedCost: randFloat(50, 500),
      status,
      outcome,
      executedAt,
      createdAt,
    });
  }

  if (predRecords.length > 0) {
    for (let i = 0; i < predRecords.length; i += batchSize) {
      await db.insert(predictions).values(predRecords.slice(i, i + batchSize));
    }
  }
  if (recRecords.length > 0) {
    for (let i = 0; i < recRecords.length; i += batchSize) {
      await db.insert(recommendations).values(recRecords.slice(i, i + batchSize));
    }
  }

  console.log(`Seeded: ${customerRecords.length} customers, ${churnEventRecords.length} churn events, ${predRecords.length} predictions, ${recRecords.length} recommendations`);
}
