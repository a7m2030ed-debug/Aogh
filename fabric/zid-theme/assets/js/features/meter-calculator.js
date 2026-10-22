/**
 * Meter Calculator Module (Malbousak)
 *
 * "How many meters do I need?" — multiplies the meters for the chosen
 * height by the number of thobes.
 *
 * Data attributes:
 *   - data-mlb-calc       : Wrapper
 *   - data-meters="<n>"   : Height option button (aria-pressed marks the choice)
 *   - data-step="-1|1"    : Thobe count stepper buttons
 *   - data-count          : Thobe count output
 *   - data-total          : Total meters output
 */

const MAX_THOBES = 20;

// Track initialized calculators to avoid double-init
const initialized = new WeakSet();

function parseMeters(value) {
  // Accept "3.5", "3,5" and Arabic-Indic digits from the merchant's table
  const western = String(value)
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0)
    .replace(/[,٫]/g, ".");
  const n = parseFloat(western);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function format(n) {
  return String(Math.round(n * 100) / 100);
}

function update(calc) {
  const selected = calc.querySelector('[data-meters][aria-pressed="true"]');
  const count = parseInt(calc.querySelector("[data-count]")?.textContent, 10) || 1;
  const total = calc.querySelector("[data-total]");
  if (!selected || !total) return;
  total.textContent = format(parseMeters(selected.dataset.meters) * count);
}

function initCalc(calc) {
  if (initialized.has(calc)) return;
  initialized.add(calc);

  calc.addEventListener("click", (e) => {
    const option = e.target.closest("[data-meters]");
    if (option && calc.contains(option)) {
      calc.querySelectorAll("[data-meters]").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn === option ? "true" : "false");
      });
      update(calc);
      return;
    }

    const step = e.target.closest("[data-step]");
    if (step && calc.contains(step)) {
      const out = calc.querySelector("[data-count]");
      const current = parseInt(out.textContent, 10) || 1;
      const next = Math.min(MAX_THOBES, Math.max(1, current + parseInt(step.dataset.step, 10)));
      out.textContent = String(next);
      update(calc);
    }
  });

  update(calc);
}

function initAll() {
  document.querySelectorAll("[data-mlb-calc]").forEach(initCalc);
}

export function init() {
  initAll();
  window.addEventListener("content:loaded", initAll);
}

// Self-initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
