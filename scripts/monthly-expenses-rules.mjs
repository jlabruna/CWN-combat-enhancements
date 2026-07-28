export const MODULE_ID = "cwn-combat-enhancements";
export const CONTENT_PACK_ID = "cwn-content-pack";
export const MONTHLY_EXPENSES_FLAG = "monthlyExpenses";
export const CYBERWARE_MAINTENANCE_FLAG = "cyberwareMaintenance";

export const LIFESTYLES = Object.freeze({
  unconfigured: Object.freeze({ label: "Unconfigured", monthlyCost: 0, strainModifier: null }),
  squatter: Object.freeze({ label: "Squatter", monthlyCost: 0, strainModifier: -2 }),
  slum: Object.freeze({ label: "Slum", monthlyCost: 300, strainModifier: -1 }),
  "middle-class": Object.freeze({ label: "Middle-class", monthlyCost: 1000, strainModifier: 0 }),
  fine: Object.freeze({ label: "Fine", monthlyCost: 5000, strainModifier: 1 }),
  luxury: Object.freeze({ label: "Luxury", monthlyCost: 20000, strainModifier: 2 }),
});

const SERVICE_DEFINITIONS = Object.freeze({
  "smartphone-service-plan": Object.freeze({
    label: "Smartphone Service Plan",
    monthlyCost: 10,
  }),
  "monthly-bus-pass": Object.freeze({
    label: "Monthly Bus Pass",
    monthlyCost: 50,
  }),
});

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);
const itemFlags = (item, namespace, key) => item?.flags?.[namespace]?.[key];
const finiteNonNegative = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export function formatCurrency(value) {
  return `$${Math.round(Number(value) || 0).toLocaleString("en-US")}`;
}

export function normalizeLifestyle(value) {
  return hasOwn(LIFESTYLES, value) ? value : "unconfigured";
}

export function lifestyleDetail(value) {
  const key = normalizeLifestyle(value);
  return { key, ...LIFESTYLES[key], warning: key === "unconfigured" };
}

/**
 * Resolve the independent-module maintenance contract. Actor-owned cyberware
 * defaults to maintenance-required; an explicit Combat Enhancements override
 * takes precedence over inert Content Pack metadata.
 */
export function calculateCyberwareMaintenance(item) {
  const own = itemFlags(item, MODULE_ID, CYBERWARE_MAINTENANCE_FLAG) ?? {};
  const content = itemFlags(item, CONTENT_PACK_ID, CYBERWARE_MAINTENANCE_FLAG) ?? {};
  const required = typeof own.required === "boolean"
    ? own.required
    : typeof content.required === "boolean"
      ? content.required
      : true;
  const overridePresent = hasOwn(own, "baseCostOverride")
    ? own.baseCostOverride !== null && own.baseCostOverride !== ""
    : content.baseCostOverride !== null
      && content.baseCostOverride !== undefined
      && content.baseCostOverride !== "";
  const rawOverride = hasOwn(own, "baseCostOverride")
    ? own.baseCostOverride
    : content.baseCostOverride;
  const validOverride = finiteNonNegative(rawOverride);
  const nativeCost = finiteNonNegative(item?.system?.cost);
  const warnings = [];

  if (overridePresent && validOverride === null) {
    warnings.push("Maintenance Base Cost Override must be a non-negative number.");
  }
  const basis = overridePresent && validOverride !== null ? validOverride : nativeCost;
  if (basis === null) warnings.push("Cyberware has no valid native cost or maintenance override.");

  return {
    id: item?.id ?? item?._id ?? "",
    name: String(item?.name ?? "Unnamed Cyberware"),
    nativeCost,
    required,
    overrideInUse: overridePresent && validOverride !== null,
    baseCostOverride: overridePresent ? rawOverride : null,
    basis,
    basisAvailable: basis !== null,
    // Whole-dollar policy: round the final five-percent calculation to nearest.
    monthlyCost: required && basis !== null ? Math.round(basis * 0.05) : 0,
    disabled: item?.system?.disabled === true,
    warnings,
  };
}

export function calculateCyberwareBreakdown(items = []) {
  const entries = Array.from(items)
    .filter((item) => item?.type === "cyberware")
    .map(calculateCyberwareMaintenance);
  return {
    entries,
    total: entries.reduce((sum, entry) => sum + entry.monthlyCost, 0),
    warnings: entries.flatMap((entry) =>
      entry.warnings.map((warning) => `${entry.name}: ${warning}`)),
  };
}

function normalizeServiceName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function detectRecurringService(item) {
  const flags = item?.flags?.[CONTENT_PACK_ID] ?? {};
  const metadata = flags.recurringExpense;
  let key = null;
  let unitCost = null;
  let detection = null;
  if (
    metadata?.type === "service"
    && hasOwn(SERVICE_DEFINITIONS, metadata.key)
    && finiteNonNegative(metadata.monthlyCost) !== null
  ) {
    key = metadata.key;
    unitCost = finiteNonNegative(metadata.monthlyCost);
    detection = "metadata";
  } else if (flags.catalogueKey === "smartphone-service-plan-one-month") {
    key = "smartphone-service-plan";
    detection = "catalogue-key";
  } else if (flags.catalogueKey === "monthly-bus-pass") {
    key = "monthly-bus-pass";
    detection = "catalogue-key";
  } else {
    const name = normalizeServiceName(item?.name);
    if (name === "smartphone service plan" || name === "smartphone service plan one month") {
      key = "smartphone-service-plan";
      detection = "legacy-name";
    } else if (name === "monthly bus pass") {
      key = "monthly-bus-pass";
      detection = "legacy-name";
    }
  }
  if (!key) return null;

  const quantity = Math.max(0, Math.floor(Number(item?.system?.quantity ?? item?.quantity ?? 1) || 0));
  const definition = SERVICE_DEFINITIONS[key];
  unitCost ??= definition.monthlyCost;
  return {
    id: item?.id ?? item?._id ?? "",
    key,
    name: definition.label,
    quantity,
    unitCost: Math.round(unitCost),
    subtotal: quantity * Math.round(unitCost),
    detection,
  };
}

export function calculateServiceBreakdown(items = []) {
  const entries = Array.from(items).map(detectRecurringService).filter(Boolean);
  const byKey = Object.fromEntries(
    Object.keys(SERVICE_DEFINITIONS).map((key) => [
      key,
      entries.filter((entry) => entry.key === key).reduce((sum, entry) => sum + entry.subtotal, 0),
    ]),
  );
  return {
    entries,
    byKey,
    total: entries.reduce((sum, entry) => sum + entry.subtotal, 0),
  };
}

export function normalizeCustomExpenses(rows = [], { idFactory = () => crypto.randomUUID() } = {}) {
  const expenses = [];
  const errors = [];
  const ids = new Set();
  for (const [index, row] of Array.from(rows).entries()) {
    const name = String(row?.name ?? "").trim();
    const rawAmount = row?.amount;
    if (!name && (rawAmount === "" || rawAmount === null || rawAmount === undefined)) continue;
    if (!name) {
      errors.push(`Custom expense ${index + 1} requires a name.`);
      continue;
    }
    const amount = finiteNonNegative(rawAmount);
    if (amount === null) {
      errors.push(`${name} requires a non-negative whole-dollar amount.`);
      continue;
    }
    let id = String(row?.id ?? "").trim();
    if (!id || ids.has(id)) id = idFactory();
    ids.add(id);
    expenses.push({ id, name, amount: Math.round(amount) });
  }
  return { expenses, errors };
}

export function readMonthlyExpensesConfig(actor) {
  const config = actor?.flags?.[MODULE_ID]?.[MONTHLY_EXPENSES_FLAG] ?? {};
  const normalized = normalizeCustomExpenses(config.customExpenses ?? [], {
    idFactory: () => "",
  });
  return {
    lifestyle: normalizeLifestyle(config.lifestyle),
    customExpenses: normalized.expenses,
  };
}

export function calculateMonthlyExpenses(actor, config = readMonthlyExpensesConfig(actor)) {
  const lifestyle = lifestyleDetail(config.lifestyle);
  const cyberware = calculateCyberwareBreakdown(actor?.items ?? []);
  const services = calculateServiceBreakdown(actor?.items ?? []);
  const custom = normalizeCustomExpenses(config.customExpenses ?? [], {
    idFactory: () => "",
  });
  const customTotal = custom.expenses.reduce((sum, entry) => sum + entry.amount, 0);
  const total = lifestyle.monthlyCost + cyberware.total + services.total + customTotal;
  return {
    lifestyle,
    cyberware,
    services,
    customExpenses: custom.expenses,
    customTotal,
    total,
    warnings: [
      ...(lifestyle.warning ? ["Lifestyle is not configured."] : []),
      ...cyberware.warnings,
      ...custom.errors,
    ],
  };
}
