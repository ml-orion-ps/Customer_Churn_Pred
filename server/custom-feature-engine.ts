import type { CustomFeatureDefinition } from "@shared/schema";

export type CustomFeatureValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  formula: string;
};

type RowRecord = Record<string, any>;

const TIME_AWARE_TYPES = new Set<CustomFeatureDefinition["type"]>(["lag", "rolling", "trend"]);

function normalizeFeatureName(value: string) {
  return value.trim();
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toComparableDate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function safeDivide(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function compareValues(left: unknown, comparator: CustomFeatureDefinition["comparator"], right: unknown) {
  if (!comparator) return false;

  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);

  switch (comparator) {
    case "gt":
      return leftNumber !== null && rightNumber !== null && leftNumber > rightNumber;
    case "gte":
      return leftNumber !== null && rightNumber !== null && leftNumber >= rightNumber;
    case "lt":
      return leftNumber !== null && rightNumber !== null && leftNumber < rightNumber;
    case "lte":
      return leftNumber !== null && rightNumber !== null && leftNumber <= rightNumber;
    case "eq":
      return String(left ?? "") === String(right ?? "");
    case "ne":
      return String(left ?? "") !== String(right ?? "");
    case "contains":
      return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
    case "not_contains":
      return !String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
    default:
      return false;
  }
}

function formatValue(value: unknown) {
  if (typeof value === "string") return `'${value}'`;
  return String(value);
}

export function buildCustomFeatureFormula(feature: CustomFeatureDefinition) {
  switch (feature.type) {
    case "lag":
      return `lag(${feature.sourceColumn}, periods=${feature.periods ?? 1})`;
    case "rolling":
      return `${feature.aggregation ?? "mean"}(${feature.sourceColumn}, window=${feature.window ?? 3})`;
    case "trend":
      return `trend_slope(${feature.sourceColumn}, window=${feature.window ?? 3})`;
    case "ratio":
      return `${feature.numeratorColumn} / ${feature.denominatorColumn}`;
    case "flag":
      return `${feature.sourceColumn} ${feature.comparator} ${formatValue(feature.compareValue)}`;
    case "segment_tag":
      return `segment(${feature.sourceColumn} ${feature.comparator} ${formatValue(feature.compareValue)})`;
    case "interaction":
      return `${feature.leftColumn} ${feature.interactionOperator} ${feature.rightColumn}`;
    default:
      return feature.formula || "custom_feature()";
  }
}

export function validateCustomFeatureDefinition(
  feature: CustomFeatureDefinition,
  availableColumns: string[],
  sampleRows: RowRecord[] = [],
): CustomFeatureValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const available = new Set(availableColumns);

  const name = normalizeFeatureName(feature.name || "");
  if (!name) {
    errors.push("Feature name is required.");
  } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    errors.push("Feature name must use letters, numbers, and underscores only, and cannot start with a number.");
  }

  if (available.has(name)) {
    errors.push("Feature name already exists in the dataset.");
  }

  if (TIME_AWARE_TYPES.has(feature.type)) {
    if (!feature.entityKey) errors.push("Entity key is required for lag, rolling, and trend features.");
    if (!feature.timeColumn) errors.push("Time column is required for lag, rolling, and trend features.");
    if (feature.entityKey && !available.has(feature.entityKey)) errors.push(`Entity key column '${feature.entityKey}' does not exist.`);
    if (feature.timeColumn && !available.has(feature.timeColumn)) errors.push(`Time column '${feature.timeColumn}' does not exist.`);
    if ((feature.type === "lag" || feature.type === "rolling" || feature.type === "trend") && !feature.sourceColumn) {
      errors.push("Source column is required.");
    }
    if (feature.sourceColumn && !available.has(feature.sourceColumn)) errors.push(`Source column '${feature.sourceColumn}' does not exist.`);
    if (feature.type === "lag" && (!feature.periods || feature.periods < 1)) errors.push("Periods must be at least 1 for lag features.");
    if ((feature.type === "rolling" || feature.type === "trend") && (!feature.window || feature.window < 2)) {
      errors.push("Window must be at least 2 for rolling/trend features.");
    }
    if (feature.timeColumn && sampleRows.length > 0) {
      const hasParsableTime = sampleRows.some((row) => toComparableDate(row[feature.timeColumn!]) !== null);
      if (!hasParsableTime) warnings.push("The selected time column does not look like a parseable date/time field in the sampled rows.");
    }
  }

  if (feature.type === "ratio") {
    if (!feature.numeratorColumn || !available.has(feature.numeratorColumn)) errors.push("Numerator column is required.");
    if (!feature.denominatorColumn || !available.has(feature.denominatorColumn)) errors.push("Denominator column is required.");
  }

  if (feature.type === "flag" || feature.type === "segment_tag") {
    if (!feature.sourceColumn || !available.has(feature.sourceColumn)) errors.push("Source column is required.");
    if (!feature.comparator) errors.push("Comparator is required.");
    if (feature.compareValue === undefined) errors.push("Comparison value is required.");
  }

  if (feature.type === "interaction") {
    if (!feature.leftColumn || !available.has(feature.leftColumn)) errors.push("Left column is required.");
    if (!feature.rightColumn || !available.has(feature.rightColumn)) errors.push("Right column is required.");
    if (!feature.interactionOperator) errors.push("Interaction operator is required.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    formula: buildCustomFeatureFormula(feature),
  };
}

function rollingAggregate(values: Array<number | null>, aggregation: NonNullable<CustomFeatureDefinition["aggregation"]>) {
  const numericValues = values.filter((value): value is number => value !== null);
  if (numericValues.length === 0) return null;

  switch (aggregation) {
    case "sum":
      return numericValues.reduce((sum, value) => sum + value, 0);
    case "min":
      return Math.min(...numericValues);
    case "max":
      return Math.max(...numericValues);
    case "std": {
      if (numericValues.length < 2) return 0;
      const mean = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
      const variance = numericValues.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / numericValues.length;
      return Math.sqrt(variance);
    }
    case "mean":
    default:
      return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  }
}

function trendSlope(values: Array<number | null>) {
  const numericValues = values.filter((value): value is number => value !== null);
  if (numericValues.length < 2) return 0;

  const xValues = numericValues.map((_, index) => index);
  const xMean = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const yMean = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;

  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < numericValues.length; index += 1) {
    numerator += (xValues[index] - xMean) * (numericValues[index] - yMean);
    denominator += (xValues[index] - xMean) ** 2;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

function sortRows(rows: Array<{ row: RowRecord; originalIndex: number }>, timeColumn: string, sortDirection: CustomFeatureDefinition["sortDirection"] | undefined) {
  const multiplier = sortDirection === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = toComparableDate(a.row[timeColumn]);
    const right = toComparableDate(b.row[timeColumn]);
    if (left === null && right === null) return a.originalIndex - b.originalIndex;
    if (left === null) return 1;
    if (right === null) return -1;
    if (left === right) return a.originalIndex - b.originalIndex;
    return (left - right) * multiplier;
  });
}

function applyTimeAwareFeature(rows: RowRecord[], feature: CustomFeatureDefinition) {
  const nextRows = rows.map((row) => ({ ...row }));
  const grouped = new Map<string, Array<{ row: RowRecord; originalIndex: number }>>();

  for (let index = 0; index < nextRows.length; index += 1) {
    const row = nextRows[index];
    const key = String(row[feature.entityKey!] ?? "__missing__");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ row, originalIndex: index });
  }

  for (const groupRows of grouped.values()) {
    const orderedRows = sortRows(groupRows, feature.timeColumn!, feature.sortDirection);
    const sourceValues = orderedRows.map(({ row }) => toNumber(row[feature.sourceColumn!]));

    orderedRows.forEach(({ originalIndex }, orderedIndex) => {
      const window = feature.window ?? 3;
      if (feature.type === "lag") {
        const lagIndex = orderedIndex - (feature.periods ?? 1);
        nextRows[originalIndex][feature.name] = lagIndex >= 0 ? sourceValues[lagIndex] : null;
        return;
      }

      const start = Math.max(0, orderedIndex - window + 1);
      const slice = sourceValues.slice(start, orderedIndex + 1);

      if (feature.type === "rolling") {
        nextRows[originalIndex][feature.name] = rollingAggregate(slice, feature.aggregation ?? "mean");
        return;
      }

      nextRows[originalIndex][feature.name] = trendSlope(slice);
    });
  }

  return nextRows;
}

function applySimpleFeature(rows: RowRecord[], feature: CustomFeatureDefinition) {
  return rows.map((row) => {
    const nextRow = { ...row };

    if (feature.type === "ratio") {
      nextRow[feature.name] = safeDivide(toNumber(row[feature.numeratorColumn!]), toNumber(row[feature.denominatorColumn!]));
      return nextRow;
    }

    if (feature.type === "flag" || feature.type === "segment_tag") {
      nextRow[feature.name] = compareValues(row[feature.sourceColumn!], feature.comparator, feature.compareValue) ? 1 : 0;
      return nextRow;
    }

    if (feature.type === "interaction") {
      const left = toNumber(row[feature.leftColumn!]);
      const right = toNumber(row[feature.rightColumn!]);

      if (left === null || right === null) {
        nextRow[feature.name] = null;
        return nextRow;
      }

      switch (feature.interactionOperator) {
        case "add":
          nextRow[feature.name] = left + right;
          break;
        case "subtract":
          nextRow[feature.name] = left - right;
          break;
        case "divide":
          nextRow[feature.name] = safeDivide(left, right);
          break;
        case "multiply":
        default:
          nextRow[feature.name] = left * right;
          break;
      }
      return nextRow;
    }

    return nextRow;
  });
}

export function applyCustomFeatures(rows: RowRecord[], features: CustomFeatureDefinition[]) {
  let nextRows = rows.map((row) => ({ ...row }));

  for (const feature of features) {
    if (TIME_AWARE_TYPES.has(feature.type)) {
      nextRows = applyTimeAwareFeature(nextRows, feature);
    } else {
      nextRows = applySimpleFeature(nextRows, feature);
    }
  }

  return nextRows;
}

export function buildPreviewRows(rows: RowRecord[], feature: CustomFeatureDefinition) {
  const previewColumns = unique([
    feature.entityKey,
    feature.timeColumn,
    feature.sourceColumn,
    feature.numeratorColumn,
    feature.denominatorColumn,
    feature.leftColumn,
    feature.rightColumn,
    feature.name,
  ].filter(Boolean) as string[]);

  return rows.slice(0, 12).map((row) => {
    const out: RowRecord = {};
    for (const column of previewColumns) out[column] = row[column];
    return out;
  });
}
