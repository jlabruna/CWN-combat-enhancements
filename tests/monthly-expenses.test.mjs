import assert from "node:assert/strict";
import test from "node:test";
import {
  LIFESTYLES,
  calculateCyberwareBreakdown,
  calculateCyberwareMaintenance,
  calculateMonthlyExpenses,
  calculateServiceBreakdown,
  detectRecurringService,
  lifestyleDetail,
  normalizeCustomExpenses,
  readMonthlyExpensesConfig,
} from "../scripts/monthly-expenses-rules.mjs";

const cyberware = ({
  id = "cyber-1",
  name = "Test Cyberware",
  cost = 1000,
  disabled = false,
  own,
  content,
} = {}) => ({
  id,
  name,
  type: "cyberware",
  system: { cost, strain: 1, disabled },
  flags: {
    ...(own ? { "cwn-combat-enhancements": { cyberwareMaintenance: own } } : {}),
    ...(content ? { "cwn-content-pack": { cyberwareMaintenance: content } } : {}),
  },
});

const service = ({
  id = "service-1",
  name = "Unrelated",
  quantity = 1,
  recurringExpense,
  catalogueKey,
  location = "stowed",
} = {}) => ({
  id,
  name,
  type: "item",
  system: { quantity, location },
  flags: {
    "cwn-content-pack": {
      ...(recurringExpense ? { recurringExpense } : {}),
      ...(catalogueKey ? { catalogueKey } : {}),
    },
  },
});

test("native cyberware cost produces rounded five-percent upkeep", () => {
  assert.equal(calculateCyberwareMaintenance(cyberware({ cost: 999 })).monthlyCost, 50);
});

test("valid Combat Enhancements override takes precedence over Content Pack and native cost", () => {
  const result = calculateCyberwareMaintenance(cyberware({
    cost: 1000,
    own: { required: true, baseCostOverride: 2000 },
    content: { required: true, baseCostOverride: null },
  }));
  assert.equal(result.basis, 2000);
  assert.equal(result.monthlyCost, 100);
  assert.equal(result.overrideInUse, true);
});

test("missing native cost produces a visible warning rather than silent free upkeep", () => {
  const result = calculateCyberwareMaintenance(cyberware({ cost: null }));
  assert.equal(result.basis, null);
  assert.equal(result.monthlyCost, 0);
  assert.match(result.warnings[0], /no valid native cost/i);
});

test("negative override is rejected with warning and falls back to native cost", () => {
  const result = calculateCyberwareMaintenance(cyberware({
    cost: 1000,
    own: { required: true, baseCostOverride: -1 },
  }));
  assert.equal(result.basis, 1000);
  assert.equal(result.monthlyCost, 50);
  assert.match(result.warnings[0], /non-negative/i);
});

test("upkeep-disabled cyberware contributes zero", () => {
  const result = calculateCyberwareMaintenance(cyberware({
    own: { required: false, baseCostOverride: null },
  }));
  assert.equal(result.required, false);
  assert.equal(result.monthlyCost, 0);
});

test("custom native cyberware defaults to required without Content Pack metadata", () => {
  assert.equal(calculateCyberwareMaintenance(cyberware()).required, true);
});

test("disabled cyberware still incurs upkeep and its native strain is not changed", () => {
  const item = cyberware({ disabled: true });
  const before = structuredClone(item.system);
  const result = calculateCyberwareMaintenance(item);
  assert.equal(result.monthlyCost, 50);
  assert.deepEqual(item.system, before);
});

test("multiple cyberware sum and removal updates derived total", () => {
  const first = cyberware({ id: "one", cost: 1000 });
  const second = cyberware({ id: "two", cost: 2000 });
  assert.equal(calculateCyberwareBreakdown([first, second]).total, 150);
  assert.equal(calculateCyberwareBreakdown([first]).total, 50);
});

test("all lifestyle values map to the approved costs and strain modifiers", () => {
  const expected = {
    unconfigured: [0, null],
    squatter: [0, -2],
    slum: [300, -1],
    "middle-class": [1000, 0],
    fine: [5000, 1],
    luxury: [20000, 2],
  };
  assert.deepEqual(
    Object.fromEntries(Object.keys(LIFESTYLES).map((key) => {
      const result = lifestyleDetail(key);
      return [key, [result.monthlyCost, result.strainModifier]];
    })),
    expected,
  );
});

test("invalid and unmigrated lifestyle keys remain visibly unconfigured", () => {
  assert.deepEqual(
    lifestyleDetail("not-a-lifestyle"),
    { key: "unconfigured", ...LIFESTYLES.unconfigured, warning: true },
  );
});

test("smartphone service metadata costs ten dollars per quantity", () => {
  const result = detectRecurringService(service({
    quantity: 3,
    recurringExpense: {
      key: "smartphone-service-plan",
      type: "service",
      monthlyCost: 10,
    },
  }));
  assert.equal(result.subtotal, 30);
  assert.equal(result.detection, "metadata");
});

test("bus-pass metadata costs fifty dollars per quantity regardless of location", () => {
  const readied = service({
    quantity: 2,
    location: "readied",
    recurringExpense: { key: "monthly-bus-pass", type: "service", monthlyCost: 50 },
  });
  const stowed = structuredClone(readied);
  stowed.system.location = "stowed";
  assert.equal(detectRecurringService(readied).subtotal, 100);
  assert.equal(detectRecurringService(stowed).subtotal, 100);
});

test("catalogue key and conservative punctuation/case name fallbacks work", () => {
  assert.equal(detectRecurringService(service({
    catalogueKey: "smartphone-service-plan-one-month",
  })).key, "smartphone-service-plan");
  assert.equal(detectRecurringService(service({
    name: "SMARTPHONE SERVICE PLAN — ONE MONTH",
  })).key, "smartphone-service-plan");
  assert.equal(detectRecurringService(service({ name: "Monthly Bus Pass" })).key, "monthly-bus-pass");
});

test("similar unrelated names do not match and metadata does not double count", () => {
  assert.equal(detectRecurringService(service({ name: "Deluxe Monthly Bus Pass Holder" })), null);
  const item = service({
    name: "Monthly Bus Pass",
    quantity: 2,
    recurringExpense: { key: "monthly-bus-pass", type: "service", monthlyCost: 50 },
  });
  const result = calculateServiceBreakdown([item]);
  assert.equal(result.entries.length, 1);
  assert.equal(result.total, 100);
});

test("custom expenses add, edit, delete, round, and preserve stable IDs", () => {
  const added = normalizeCustomExpenses([
    { name: "Safehouse", amount: "200.4" },
  ], { idFactory: () => "stable-id" });
  assert.deepEqual(added.expenses, [{ id: "stable-id", name: "Safehouse", amount: 200 }]);
  const edited = normalizeCustomExpenses([
    { ...added.expenses[0], amount: 250 },
  ], { idFactory: () => "other-id" });
  assert.deepEqual(edited.expenses, [{ id: "stable-id", name: "Safehouse", amount: 250 }]);
  assert.deepEqual(normalizeCustomExpenses([]).expenses, []);
});

test("blank names and negative or nonnumeric amounts are rejected; empty rows do not contribute", () => {
  const result = normalizeCustomExpenses([
    { name: "", amount: "" },
    { name: "", amount: 10 },
    { name: "Negative", amount: -1 },
    { name: "Text", amount: "oops" },
  ], { idFactory: () => "id" });
  assert.equal(result.expenses.length, 0);
  assert.equal(result.errors.length, 3);
});

test("duplicate custom IDs are repaired deterministically by the provided factory", () => {
  let next = 0;
  const result = normalizeCustomExpenses([
    { id: "same", name: "One", amount: 1 },
    { id: "same", name: "Two", amount: 2 },
  ], { idFactory: () => `new-${++next}` });
  assert.deepEqual(result.expenses.map((entry) => entry.id), ["same", "new-1"]);
});

test("monthly total combines lifestyle, cyberware, services, and custom expenses", () => {
  const actor = {
    items: [
      cyberware({ cost: 10000 }),
      service({
        quantity: 2,
        recurringExpense: { key: "monthly-bus-pass", type: "service", monthlyCost: 50 },
      }),
    ],
  };
  const result = calculateMonthlyExpenses(actor, {
    lifestyle: "middle-class",
    customExpenses: [{ id: "custom", name: "Safehouse", amount: 200 }],
  });
  assert.equal(result.lifestyle.monthlyCost, 1000);
  assert.equal(result.cyberware.total, 500);
  assert.equal(result.services.total, 100);
  assert.equal(result.customTotal, 200);
  assert.equal(result.total, 1800);
});

test("only user configuration is read from actor flags; derived totals are never stored", () => {
  const actor = {
    flags: {
      "cwn-combat-enhancements": {
        monthlyExpenses: {
          lifestyle: "fine",
          customExpenses: [{ id: "a", name: "Rent", amount: 100 }],
          total: 999999,
        },
      },
    },
    items: [],
  };
  const config = readMonthlyExpensesConfig(actor);
  assert.deepEqual(config, {
    lifestyle: "fine",
    customExpenses: [{ id: "a", name: "Rent", amount: 100 }],
  });
  assert.equal(calculateMonthlyExpenses(actor, config).total, 5100);
});
