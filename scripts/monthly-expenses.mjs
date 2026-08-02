import {
  CYBERWARE_MAINTENANCE_FLAG,
  LIFESTYLES,
  MODULE_ID,
  MONTHLY_EXPENSES_FLAG,
  calculateCyberwareMaintenance,
  calculateMonthlyExpenses,
  formatCurrency,
  normalizeCustomExpenses,
  readMonthlyExpensesConfig,
} from "./monthly-expenses-rules.mjs";
import { renderHandlebarsTemplate } from "./foundry-compat.mjs";

Hooks.on("preUpdateItem", (item, changes, _options, userId) => {
  if (game.system.id !== "swnr" || item.type !== "cyberware") return;
  const changed = foundry.utils.getProperty(
    changes,
    `flags.${MODULE_ID}.${CYBERWARE_MAINTENANCE_FLAG}`,
  );
  if (changed === undefined) return;
  const user = game.users.get(userId);
  if (user?.isGM) return;
  if (userId === game.user.id) {
    ui.notifications?.error(localize("CWNCE.Expenses.NotAuthorized"));
  }
  return false;
});

Hooks.on("preUpdateActor", (actor, changes, _options, userId) => {
  if (game.system.id !== "swnr" || actor.type !== "character") return;
  const changed = foundry.utils.getProperty(
    changes,
    `flags.${MODULE_ID}.${MONTHLY_EXPENSES_FLAG}`,
  );
  if (changed === undefined) return;
  const user = game.users.get(userId);
  if (user?.isGM || actor.testUserPermission?.(user, "OWNER")) return;
  if (userId === game.user.id) {
    ui.notifications?.error(localize("CWNCE.Expenses.NotAuthorized"));
  }
  return false;
});

Hooks.on("renderApplicationV2", (application, element) => {
  if (game.system.id !== "swnr") return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;

  const actor = application.actor ?? (application.document?.documentName === "Actor"
    ? application.document
    : null);
  if (actor?.type === "character") enhanceCharacterSheet(actor, root);

  const item = application.item ?? (application.document?.documentName === "Item"
    ? application.document
    : null);
  if (item?.type === "cyberware") enhanceCyberwareSheet(item, root);
});

function enhanceCharacterSheet(actor, root) {
  if (root.querySelector(".cwnce-monthly-expenses-summary")) return;
  const currencyGrid = root.querySelector(
    'section[data-tab="gear"] > .grid.grid-5col, section[data-tab="inventory"] > .grid.grid-5col',
  );
  if (!currencyGrid) return;
  const calculation = calculateMonthlyExpenses(actor);
  const canManage = game.user.isGM || actor.isOwner;
  const wrapper = document.createElement("div");
  wrapper.className = "cwnce-monthly-expenses-summary";
  wrapper.innerHTML = `
    <output class="cwnce-monthly-total" aria-label="${localize("CWNCE.Expenses.Monthly")}">
      ${formatCurrency(calculation.total)}
    </output>
    <button type="button" class="cwnce-monthly-expenses-button"
      title="${localize("CWNCE.Expenses.Manage")}" ${canManage ? "" : "disabled"}>
      <i class="fa-solid fa-dollar-sign"></i>
    </button>
    <span>${localize("CWNCE.Expenses.Monthly")}</span>
    ${calculation.warnings.length
      ? `<i class="fa-solid fa-triangle-exclamation" title="${escapeHtml(calculation.warnings.join("\n"))}"></i>`
      : ""}
  `;
  wrapper.querySelector("button")?.addEventListener("click", () => {
    if (!canManage) return;
    openMonthlyExpensesDialog(actor).catch((error) => {
      console.error(`${MODULE_ID} | Monthly Expenses dialog failed`, error);
      ui.notifications?.error(localize("CWNCE.Expenses.SaveFailed"));
    });
  });
  currencyGrid.append(wrapper);
}

function enhanceCyberwareSheet(item, root) {
  if (root.querySelector(".cwnce-cyberware-maintenance")) return;
  const attributes = root.querySelector(
    'section[data-tab="attributes"], .tab[data-tab="attributes"]',
  );
  if (!attributes) return;
  const detail = calculateCyberwareMaintenance(item);
  const editable = game.user.isGM;
  const section = document.createElement("fieldset");
  section.className = "cwnce-cyberware-maintenance";
  section.innerHTML = `
    <legend>${localize("CWNCE.CyberwareMaintenance.Title")}</legend>
    <label>
      <span>${localize("CWNCE.CyberwareMaintenance.Required")}</span>
      <input type="checkbox" data-cwnce-maintenance-required
        ${detail.required ? "checked" : ""} ${editable ? "" : "disabled"}>
    </label>
    <label>
      <span>${localize("CWNCE.CyberwareMaintenance.Override")}</span>
      <input type="number" min="0" step="1" data-cwnce-maintenance-override
        value="${detail.overrideInUse ? escapeHtml(detail.baseCostOverride) : ""}"
        placeholder="${detail.nativeCost ?? ""}" ${editable ? "" : "disabled"}>
    </label>
    <label>
      <span>${localize("CWNCE.CyberwareMaintenance.Calculated")}</span>
      <output data-cwnce-maintenance-total>${detail.basis === null
        ? localize("CWNCE.CyberwareMaintenance.Unavailable")
        : formatCurrency(detail.monthlyCost)}</output>
    </label>
    <p class="hint">${localize("CWNCE.CyberwareMaintenance.DisabledHint")}</p>
    <p class="cwnce-maintenance-warning" ${detail.warnings.length ? "" : "hidden"}>
      ${escapeHtml(detail.warnings.join(" "))}
    </p>
  `;
  attributes.append(section);
  if (!editable) return;

  const required = section.querySelector("[data-cwnce-maintenance-required]");
  const override = section.querySelector("[data-cwnce-maintenance-override]");
  const save = async () => {
    const raw = override.value.trim();
    const baseCostOverride = raw === "" ? null : Number(raw);
    if (baseCostOverride !== null && (!Number.isFinite(baseCostOverride) || baseCostOverride < 0)) {
      ui.notifications?.error(localize("CWNCE.CyberwareMaintenance.InvalidOverride"));
      return;
    }
    await item.update({
      [`flags.${MODULE_ID}.${CYBERWARE_MAINTENANCE_FLAG}`]: {
        required: required.checked,
        baseCostOverride: baseCostOverride === null ? null : Math.round(baseCostOverride),
      },
    });
  };
  required.addEventListener("change", save);
  override.addEventListener("change", save);
}

export async function openMonthlyExpensesDialog(actor) {
  if (!(game.user.isGM || actor.isOwner)) {
    ui.notifications?.error(localize("CWNCE.Expenses.NotAuthorized"));
    return false;
  }
  const config = readMonthlyExpensesConfig(actor);
  const calculation = calculateMonthlyExpenses(actor, config);
  const context = dialogContext(config, calculation);
  const content = await renderHandlebarsTemplate(
    `modules/${MODULE_ID}/templates/monthly-expenses.hbs`,
    context,
  );

  return foundry.applications.api.DialogV2.wait({
    classes: ["cwnce-monthly-expenses-dialog"],
    window: {
      title: localize("CWNCE.Expenses.DialogTitle"),
      resizable: true,
    },
    position: { width: 720 },
    form: { closeOnSubmit: false },
    content,
    render: (...args) => {
      const dialog = args.find((value) => value?.element?.querySelector);
      if (dialog) installDialogHandlers(dialog, actor);
    },
    buttons: [
      {
        action: "save",
        label: localize("CWNCE.Expenses.Save"),
        icon: "fa-solid fa-floppy-disk",
        default: true,
        callback: async (_event, button, dialog) => {
          const parsed = parseDialogConfiguration(button.form);
          const normalized = normalizeCustomExpenses(parsed.customExpenses, {
            idFactory: () => foundry.utils.randomID(16),
          });
          if (normalized.errors.length) {
            ui.notifications?.error(normalized.errors.join(" "));
            return false;
          }
          await actor.update({
            [`flags.${MODULE_ID}.${MONTHLY_EXPENSES_FLAG}`]: {
              lifestyle: parsed.lifestyle,
              customExpenses: normalized.expenses,
            },
          });
          await dialog.close();
          actor.sheet?.render?.();
          return true;
        },
      },
      {
        action: "cancel",
        label: localize("CWNCE.Expenses.Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => false,
      },
    ],
  });
}

function dialogContext(config, calculation) {
  return {
    lifestyleOptions: Object.entries(LIFESTYLES).map(([key, value]) => ({
      key,
      label: value.label,
      monthlyCost: formatCurrency(value.monthlyCost),
      strain: value.strainModifier === null
        ? "—"
        : value.strainModifier > 0
          ? `+${value.strainModifier}`
          : String(value.strainModifier),
      selected: key === config.lifestyle,
    })),
    calculation,
    formatted: {
      lifestyle: formatCurrency(calculation.lifestyle.monthlyCost),
      cyberware: formatCurrency(calculation.cyberware.total),
      services: formatCurrency(calculation.services.total),
      custom: formatCurrency(calculation.customTotal),
      total: formatCurrency(calculation.total),
    },
  };
}

function installDialogHandlers(dialog, actor) {
  const root = dialog.element;
  const form = root.querySelector("form");
  const add = root.querySelector("[data-action='add-expense']");
  add?.addEventListener("click", () => {
    const container = root.querySelector("[data-custom-expenses]");
    const row = document.createElement("div");
    row.className = "cwnce-custom-expense-row";
    row.dataset.expenseRow = "";
    row.dataset.expenseId = foundry.utils.randomID(16);
    row.innerHTML = `
      <input type="text" data-expense-name maxlength="100"
        placeholder="${localize("CWNCE.Expenses.CustomName")}">
      <input type="number" min="0" step="1" data-expense-amount value=""
        placeholder="0">
      <button type="button" data-action="delete-expense"
        title="${localize("CWNCE.Expenses.Delete")}">
        <i class="fa-solid fa-trash"></i>
      </button>`;
    container.append(row);
    row.querySelector("[data-expense-name]")?.focus();
  });
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='delete-expense']");
    if (!button) return;
    button.closest("[data-expense-row]")?.remove();
    updateDialogPreview(root, actor);
  });
  form?.addEventListener("input", () => updateDialogPreview(root, actor));
  form?.addEventListener("change", () => updateDialogPreview(root, actor));
}

function parseDialogConfiguration(formOrRoot) {
  const root = formOrRoot instanceof HTMLFormElement ? formOrRoot : formOrRoot.querySelector("form");
  return {
    lifestyle: root.querySelector("[data-lifestyle]")?.value ?? "unconfigured",
    customExpenses: Array.from(root.querySelectorAll("[data-expense-row]")).map((row) => ({
      id: row.dataset.expenseId,
      name: row.querySelector("[data-expense-name]")?.value ?? "",
      amount: row.querySelector("[data-expense-amount]")?.value ?? "",
    })),
  };
}

function updateDialogPreview(root, actor) {
  const config = parseDialogConfiguration(root);
  const calculation = calculateMonthlyExpenses(actor, config);
  const values = {
    lifestyle: calculation.lifestyle.monthlyCost,
    cyberware: calculation.cyberware.total,
    services: calculation.services.total,
    custom: calculation.customTotal,
    total: calculation.total,
  };
  for (const [key, value] of Object.entries(values)) {
    const output = root.querySelector(`[data-breakdown="${key}"]`);
    if (output) output.textContent = formatCurrency(value);
  }
  const lifestyle = root.querySelector("[data-lifestyle-strain]");
  if (lifestyle) {
    const modifier = calculation.lifestyle.strainModifier;
    lifestyle.textContent = modifier === null ? "—" : modifier > 0 ? `+${modifier}` : String(modifier);
  }
}

function localize(key) {
  return game.i18n.localize(key);
}

function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}
