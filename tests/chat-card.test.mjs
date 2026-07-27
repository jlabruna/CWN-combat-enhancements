import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDemonDamageMessageData,
  CWN_CE_CHAT_CARD_CLASSES,
  renderCwnCeChatCard,
  renderDemonActionChatCard,
  renderReloadChatCard,
} from "../scripts/chat-card.mjs";

test("reload card publishes shared and reload classes with semantic values", () => {
  const html = renderReloadChatCard({
    actorName: "Operator",
    weaponName: "Combat Rifle",
    magazineName: "Combat Rifle Magazine",
    roundsTransferred: 8,
    weaponAfter: 30,
    weaponMaximum: 30,
    magazineAfter: 22,
    magazineMaximum: 30,
    automaticallySelected: true,
  });
  assert.match(
    html,
    /class="chat-card item-card cwn-ce-chat-card cwn-ce-chat-card--reload"/u,
  );
  for (const expected of [
    "Reloaded 8 rounds",
    "Operator",
    "Combat Rifle",
    "30/30",
    "Combat Rifle Magazine",
    "22/30",
    "Automatically selected compatible magazine",
  ]) {
    assert.match(html, new RegExp(expected, "u"));
  }
});

test("Network Demon card publishes both modifiers and semantic rows", () => {
  const html = renderDemonActionChatCard({
    demonName: "Mastiff",
    actionName: "Stun Avatar",
    networkName: "City Grid",
    nodeName: "Camera",
    targetName: "Hacker",
    checkTotal: 9,
    checkFormula: "2d6 + 2",
    damageTotal: 12,
    damageFormula: "2d10",
    guidance: "Compare opposed checks.",
  });
  assert.match(html, /class="chat-card item-card /u);
  assert.match(html, /cwn-ce-chat-card--network/u);
  assert.match(html, /cwn-ce-chat-card--demon/u);
  for (const className of [
    CWN_CE_CHAT_CARD_CLASSES.header,
    CWN_CE_CHAT_CARD_CLASSES.title,
    CWN_CE_CHAT_CARD_CLASSES.body,
    CWN_CE_CHAT_CARD_CLASSES.row,
    CWN_CE_CHAT_CARD_CLASSES.guidance,
    CWN_CE_CHAT_CARD_CLASSES.actions,
    CWN_CE_CHAT_CARD_CLASSES.roll,
    CWN_CE_CHAT_CARD_CLASSES.rollLabel,
  ]) {
    assert.match(html, new RegExp(className, "u"));
  }
  assert.match(html, /class="dice-formula">2d6 \+ 2</u);
  assert.match(html, /class="dice-total">9</u);
  assert.match(html, /class="dice-formula">2d10</u);
  assert.match(html, /class="dice-total">12</u);
});

test("Network Demon card retains trusted expandable Foundry Roll markup", () => {
  const rollHtml = `
    <div class="dice-roll">
      <div class="dice-result">
        <div class="dice-formula">2d6 + 1</div>
        <div class="dice-tooltip">modifier details</div>
        <h4 class="dice-total">8</h4>
      </div>
    </div>`;
  const html = renderDemonActionChatCard({
    checkTotal: 8,
    checkFormula: "2d6 + 1",
    checkRollHtml: rollHtml,
  });
  assert.match(html, /class="dice-tooltip">modifier details</u);
  assert.match(html, /class="dice-total">8</u);
});

test("Demon damage card retains trusted structured flags and damage modifier", () => {
  const data = buildDemonDamageMessageData({
    moduleId: "cwn-combat-enhancements",
    damage: 7,
    networkId: "network",
    nodeId: "node",
    demonId: "demon",
  });
  assert.match(data.content, /class="chat-card item-card /u);
  assert.match(data.content, /cwn-ce-chat-card--damage/u);
  assert.deepEqual(data.flags["cwn-combat-enhancements"].demonDamage, {
    kind: "demon-damage",
    producer: "cwn-combat-enhancements",
    damage: 7,
    networkId: "network",
    nodeId: "node",
    demonId: "demon",
  });
});

test("hidden Demon content exposes no supplied private identity or GM data", () => {
  const html = renderDemonActionChatCard({
    demonName: "Hidden Demon",
    actionName: "Send Message",
    guidance: "GM adjudication required.",
  });
  assert.match(html, /Hidden Demon/u);
  assert.doesNotMatch(html, /Secret Mastiff|private note/u);
});

test("user-entered card text is escaped and cannot inject markup", () => {
  const html = renderCwnCeChatCard({
    variants: "network",
    title: '<img src=x onerror="bad()">',
    rows: [{ label: "Node", value: "<script>bad()</script>" }],
    guidance: "<b>not markup</b>",
  });
  assert.doesNotMatch(html, /<img|<script|<b>/u);
  assert.match(html, /&lt;img/u);
  assert.match(html, /&lt;script&gt;/u);
});

test("emitted chat markup contains no inline colour or style attributes", () => {
  const cards = [
    renderReloadChatCard({ weaponName: "Rifle" }),
    renderDemonActionChatCard({ demonName: "Hidden Demon" }),
    buildDemonDamageMessageData({
      moduleId: "cwn-combat-enhancements",
      damage: 1,
    }).content,
  ];
  for (const html of cards) {
    assert.doesNotMatch(html, /\sstyle\s*=/iu);
    assert.doesNotMatch(html, /\s(?:bgcolor|color)\s*=/iu);
  }
});

test("trusted action markup retains data attributes inside the stable actions slot", () => {
  const html = renderCwnCeChatCard({
    variants: "damage",
    title: "Damage",
    actionsMarkup: '<button type="button" data-cwnce-apply-demon-damage="message">Apply</button>',
  });
  assert.match(
    html,
    /class="cwn-ce-chat-card__actions"><button type="button" data-cwnce-apply-demon-damage="message">/u,
  );
});
