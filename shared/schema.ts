import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp, jsonb, serial, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  accountNumber: varchar("account_number", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  region: varchar("region", { length: 100 }).notNull(),
  state: varchar("state", { length: 50 }).notNull(),
  serviceType: varchar("service_type", { length: 50 }).notNull().default("Copper DSL"),
  tenureMonths: integer("tenure_months").notNull(),
  monthlyRevenue: real("monthly_revenue").notNull(),
  contractStatus: varchar("contract_status", { length: 50 }).notNull(),
  valueTier: varchar("value_tier", { length: 30 }).notNull(),
  creditScore: integer("credit_score"),
  bundleType: varchar("bundle_type", { length: 100 }),
  provisionedSpeed: real("provisioned_speed"),
  actualSpeed: real("actual_speed"),
  outageCount: integer("outage_count").default(0),
  ticketCount: integer("ticket_count").default(0),
  avgResolutionHours: real("avg_resolution_hours"),
  npsScore: integer("nps_score"),
  fiberAvailable: boolean("fiber_available").default(false),
  competitorAvailable: boolean("competitor_available").default(false),
  churnRiskScore: real("churn_risk_score"),
  churnRiskCategory: varchar("churn_risk_category", { length: 20 }),
  isChurned: boolean("is_churned").default(false),
  churnDate: timestamp("churn_date"),
  churnReason: varchar("churn_reason", { length: 100 }),
  lastBillAmount: real("last_bill_amount"),
  paymentHistory: varchar("payment_history", { length: 30 }),
  autoPayEnabled: boolean("auto_pay_enabled").default(false),
  premisesType: varchar("premises_type", { length: 50 }),
  lifecycleStage: varchar("lifecycle_stage", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const churnEvents = pgTable("churn_events", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  churnDate: timestamp("churn_date").notNull(),
  churnType: varchar("churn_type", { length: 50 }).notNull(),
  reason: varchar("reason", { length: 200 }),
  destination: varchar("destination", { length: 100 }),
  revenueImpact: real("revenue_impact"),
  winBackAttempted: boolean("win_back_attempted").default(false),
  winBackSuccessful: boolean("win_back_successful").default(false),
});

export const datasets = pgTable("datasets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").notNull(),
  columnCount: integer("column_count").notNull(),
  columns: jsonb("columns").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  status: varchar("status", { length: 30 }).notNull().default("uploaded"),
  qualityReport: jsonb("quality_report"),
  edaReport: jsonb("eda_report"),
  featureReport: jsonb("feature_report"),
  dataPreview: jsonb("data_preview"),
});

export const customFeatureTypes = [
  "rolling",
  "lag",
  "trend",
  "ratio",
  "flag",
  "segment_tag",
  "interaction",
] as const;

export const customFeatureComparators = [
  "gt",
  "gte",
  "lt",
  "lte",
  "eq",
  "ne",
  "contains",
  "not_contains",
] as const;

export const rollingAggregations = ["mean", "sum", "min", "max", "std"] as const;
export const interactionOperators = ["multiply", "divide", "add", "subtract"] as const;
export const sortDirections = ["asc", "desc"] as const;

export const customFeatureDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Feature name must be alphanumeric/underscore and start with a letter or underscore"),
  type: z.enum(customFeatureTypes),
  formula: z.string().optional(),
  status: z.enum(["draft", "ready", "invalid"]).optional(),
  entityKey: z.string().optional(),
  timeColumn: z.string().optional(),
  sortDirection: z.enum(sortDirections).optional(),
  sourceColumn: z.string().optional(),
  periods: z.number().int().positive().optional(),
  window: z.number().int().positive().optional(),
  aggregation: z.enum(rollingAggregations).optional(),
  numeratorColumn: z.string().optional(),
  denominatorColumn: z.string().optional(),
  comparator: z.enum(customFeatureComparators).optional(),
  compareValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  leftColumn: z.string().optional(),
  rightColumn: z.string().optional(),
  interactionOperator: z.enum(interactionOperators).optional(),
});
export const mlModels = pgTable("ml_models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  datasetId: integer("dataset_id").notNull(),
  algorithm: varchar("algorithm", { length: 100 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("training"),
  accuracy: real("accuracy"),
  precision: real("precision"),
  recall: real("recall"),
  f1Score: real("f1_score"),
  auc: real("auc"),
  hyperparameters: jsonb("hyperparameters"),
  featureImportance: jsonb("feature_importance"),
  confusionMatrix: jsonb("confusion_matrix"),
  modelWeights: jsonb("model_weights"),
  trainedAt: timestamp("trained_at").defaultNow(),
  isDeployed: boolean("is_deployed").default(false),
  deployedAt: timestamp("deployed_at"),
  approvalStatus: varchar("approval_status", { length: 30 }).default("pending"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  approvalNotes: text("approval_notes"),
});

export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull(),
  customerId: integer("customer_id").notNull(),
  churnProbability: real("churn_probability").notNull(),
  riskCategory: varchar("risk_category", { length: 20 }).notNull(),
  topDrivers: jsonb("top_drivers"),
  recommendedAction: text("recommended_action"),
  actionCategory: varchar("action_category", { length: 50 }),
  predictedAt: timestamp("predicted_at").defaultNow(),
});

export const recommendations = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  predictionId: integer("prediction_id"),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  description: text("description").notNull(),
  priority: varchar("priority", { length: 20 }).notNull(),
  estimatedImpact: real("estimated_impact"),
  estimatedCost: real("estimated_cost"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  executedAt: timestamp("executed_at"),
  outcome: varchar("outcome", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  action: varchar("action", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 30 }).notNull(),
  entityId: integer("entity_id"),
  entityName: text("entity_name"),
  detail: text("detail"),
  user: varchar("user", { length: 100 }).notNull().default("system"),
  team: varchar("team", { length: 100 }).notNull().default("ML Ops"),
  status: varchar("status", { length: 20 }).notNull().default("success"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export const insertChurnEventSchema = createInsertSchema(churnEvents).omit({ id: true });
export const insertDatasetSchema = createInsertSchema(datasets).omit({ id: true, uploadedAt: true });
export const insertMlModelSchema = createInsertSchema(mlModels).omit({ id: true, trainedAt: true });
export const insertPredictionSchema = createInsertSchema(predictions).omit({ id: true, predictedAt: true });
export const insertRecommendationSchema = createInsertSchema(recommendations).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLog).omit({ id: true, createdAt: true });

export const modelEvaluationRuns = pgTable("model_evaluation_runs", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull(),
  datasetId: integer("dataset_id").notNull(),
  evaluationMonth: varchar("evaluation_month", { length: 20 }).notNull(), // "2026-01"
  evaluatedAt: timestamp("evaluated_at").defaultNow(),
  // Label-dependent — null when prod dataset has no churn labels
  auc: real("auc"),
  accuracy: real("accuracy"),
  recall: real("recall"),
  precision: real("precision"),
  f1Score: real("f1_score"),
  ks: real("ks"),
  positiveCount: integer("positive_count"),
  negativeCount: integer("negative_count"),
  // Always-available metrics
  rowCount: integer("row_count").notNull(),
  psi: real("psi"),
  highRiskPct: real("high_risk_pct"),
  medRiskPct: real("med_risk_pct"),
  lowRiskPct: real("low_risk_pct"),
  scoreHistogram: jsonb("score_histogram"),           // [{bucket:"0-10%", count:5}, ...]
  topFeatureShapSummary: jsonb("top_feature_shap_summary"), // [{feature, avgShap, freq}, ...]
  hasLabels: boolean("has_labels").notNull().default(false),
}, (t) => [
  unique("uq_model_eval_month").on(t.modelId, t.evaluationMonth),
]);

export const insertModelEvaluationRunSchema = createInsertSchema(modelEvaluationRuns).omit({ id: true, evaluatedAt: true });

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertChurnEvent = z.infer<typeof insertChurnEventSchema>;
export type ChurnEvent = typeof churnEvents.$inferSelect;
export type InsertDataset = z.infer<typeof insertDatasetSchema>;
export type Dataset = typeof datasets.$inferSelect;
export type CustomFeatureDefinition = z.infer<typeof customFeatureDefinitionSchema>;
export type InsertMlModel = z.infer<typeof insertMlModelSchema>;
export type MlModel = typeof mlModels.$inferSelect;
export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type Prediction = typeof predictions.$inferSelect;
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
export type Recommendation = typeof recommendations.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertModelEvaluationRun = z.infer<typeof insertModelEvaluationRunSchema>;
export type ModelEvaluationRun = typeof modelEvaluationRuns.$inferSelect;
