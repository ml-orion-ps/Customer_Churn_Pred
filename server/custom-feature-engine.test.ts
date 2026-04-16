import assert from "node:assert/strict";

import { applyCustomFeatures, buildCustomFeatureFormula, validateCustomFeatureDefinition } from "./custom-feature-engine";
import type { CustomFeatureDefinition } from "@shared/schema";

const rows = [
  { account_number: "A1", snapshot_month: "2024-01", revenue: 100, outages: 1, tickets: 2, actual_speed: 80, provisioned_speed: 100 },
  { account_number: "A1", snapshot_month: "2024-02", revenue: 120, outages: 3, tickets: 4, actual_speed: 70, provisioned_speed: 100 },
  { account_number: "A2", snapshot_month: "2024-01", revenue: 90, outages: 0, tickets: 1, actual_speed: 95, provisioned_speed: 100 },
];

const features: CustomFeatureDefinition[] = [
  {
    id: "lag-1",
    name: "revenue_lag_1",
    type: "lag",
    entityKey: "account_number",
    timeColumn: "snapshot_month",
    sourceColumn: "revenue",
    periods: 1,
    sortDirection: "asc",
  },
  {
    id: "roll-1",
    name: "revenue_rollmean_2",
    type: "rolling",
    entityKey: "account_number",
    timeColumn: "snapshot_month",
    sourceColumn: "revenue",
    window: 2,
    aggregation: "mean",
    sortDirection: "asc",
  },
  {
    id: "ratio-1",
    name: "speed_delivery_ratio",
    type: "ratio",
    numeratorColumn: "actual_speed",
    denominatorColumn: "provisioned_speed",
  },
  {
    id: "flag-1",
    name: "high_outage_flag",
    type: "flag",
    sourceColumn: "outages",
    comparator: "gt",
    compareValue: 2,
  },
];

const validation = validateCustomFeatureDefinition(
  features[0],
  ["account_number", "snapshot_month", "revenue"],
  rows,
);
assert.equal(validation.valid, true);
assert.equal(buildCustomFeatureFormula(features[2]), "actual_speed / provisioned_speed");

const transformed = applyCustomFeatures(rows, features);

assert.equal(transformed[0].revenue_lag_1, null);
assert.equal(transformed[1].revenue_lag_1, 100);
assert.equal(transformed[1].revenue_rollmean_2, 110);
assert.equal(transformed[0].speed_delivery_ratio, 0.8);
assert.equal(transformed[1].high_outage_flag, 1);
assert.equal(transformed[2].high_outage_flag, 0);

console.log("custom-feature-engine tests passed");