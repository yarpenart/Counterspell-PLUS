import { t } from "./utils.js";

/** Mark each editable GM-review field by the participant it belongs to. */
export function labelReviewSides(dialog, workflow) {
  const root = dialog?.element;
  if (!root) return;
  const initiator = {
    counterspell: /^(counter|knowsTargetSpell$|specialSpellcaster$)/,
    dispel: /^(dispeller|bonusFormula$|specialSpellcaster$|disadvantage$|known\d+$|effectBonus\d+$)/,
    "remove-curse": /^(remover|bonusFormula$|specialSpellcaster$|disadvantage$|known\d+$|effectBonus\d+$)/,
    restoration: /^(abilityMod|proficiency|bonusFormula|abjurer|specialSpellcaster|disadvantage|known)$/,
    identify: /^risk$/
  }[workflow];
  for (const control of root.querySelectorAll("input[name], select[name], textarea[name], [data-csp-identify-world-select]")) {
    if (control.type === "hidden") continue;
    const label = control.closest("label") ?? control.closest(".form-group")?.querySelector("label");
    if (!label || label.querySelector("[data-csp-review-side]")) continue;
    const side = initiator?.test(control.name ?? "") ? "Initiator" : "Target";
    const marker = document.createElement("strong");
    marker.dataset.cspReviewSide = side;
    marker.textContent = `${t(`Review.${side}`)} — `;
    label.prepend(marker);
  }
}
