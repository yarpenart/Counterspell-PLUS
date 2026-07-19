import { MODULE_ID, registerSettings } from "./config.js";
import { initializeWorkflow } from "./workflow.js";
import { initializeDispelWorkflow } from "./dispel-workflow.js";
import { initializeRemoveCurseWorkflow } from "./remove-curse-workflow.js";

Hooks.once("init", () => {
  registerSettings();
  console.log(`${MODULE_ID} | Initialized`);
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") return;
  initializeWorkflow();
  initializeDispelWorkflow();
  initializeRemoveCurseWorkflow();
});
