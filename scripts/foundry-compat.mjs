/**
 * Foundry V13/V14 compatibility helpers.
 *
 * Foundry V14 replaced the core rollMode setting and applyRollMode helper with
 * messageMode and applyMode. Keep the compatibility decision in one place so
 * feature modules cannot accidentally publish messages with the wrong
 * visibility after a Foundry upgrade.
 */
export function getChatMessageMode() {
  return usesMessageMode()
    ? game.settings.get("core", "messageMode")
    : game.settings.get("core", "rollMode");
}

export function applyChatMessageMode(chatData, mode = undefined) {
  const ChatMessageClass = getDocumentClass("ChatMessage");
  const resolvedMode = mode ?? getChatMessageMode();
  return usesMessageMode()
    ? ChatMessageClass.applyMode(chatData, resolvedMode)
    : ChatMessageClass.applyRollMode(chatData, resolvedMode);
}

export function renderHandlebarsTemplate(path, context) {
  const renderer = globalThis.foundry?.applications?.handlebars?.renderTemplate
    ?? globalThis.renderTemplate;
  if (typeof renderer !== "function") {
    throw new Error("Foundry Handlebars template renderer is unavailable.");
  }
  return renderer(path, context);
}

function usesMessageMode() {
  return Boolean(game.settings.settings?.has?.("core.messageMode"));
}
