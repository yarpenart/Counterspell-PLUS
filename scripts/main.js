import { MODULE_ID, registerSettings } from "./config.js";
import { initializeWorkflow } from "./workflow.js";

Hooks.once("init", () => {
  registerSettings();
  console.log(`${MODULE_ID} | Initialized`);
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") return;
  initializeWorkflow();
});
