import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateConnectionGeometry,
  svgPixelViewBox,
  viewportRectToSvgRect,
} from "../scripts/network-console/network-geometry.mjs";

function rect(left, top, width, height) {
  return { left, top, width, height };
}

test("viewport coordinates convert into a scaled and offset SVG viewBox", () => {
  const converted = viewportRectToSvgRect(
    rect(300, 250, 180, 110),
    rect(100, 50, 1000, 500),
    { x: 10, y: 20, width: 2000, height: 1000 },
  );

  assert.deepEqual(converted, {
    left: 410,
    top: 420,
    width: 360,
    height: 220,
    right: 770,
    bottom: 640,
    centerX: 590,
    centerY: 530,
  });
});

test("connection endpoints attach to the rendered card edges", () => {
  const geometry = calculateConnectionGeometry(
    rect(100, 100, 180, 110),
    rect(500, 100, 180, 110),
    rect(0, 0, 920, 500),
    { x: 0, y: 0, width: 920, height: 500 },
  );

  assert.deepEqual(geometry, {
    x1: 280,
    y1: 155,
    x2: 500,
    y2: 155,
    barrierX: 390,
    barrierY: 155,
  });
});

test("scrolling or moving the application does not change graph-local geometry", () => {
  const before = calculateConnectionGeometry(
    rect(145, 180, 180, 110),
    rect(615, 390, 180, 110),
    rect(100, 80, 920, 500),
    { x: 0, y: 0, width: 920, height: 500 },
  );
  const after = calculateConnectionGeometry(
    rect(-55, 30, 180, 110),
    rect(415, 240, 180, 110),
    rect(-100, -70, 920, 500),
    { x: 0, y: 0, width: 920, height: 500 },
  );

  assert.deepEqual(after, before);
});

test("expanding the SVG canvas does not move connections when nodes stay fixed", () => {
  const source = rect(145, 180, 180, 110);
  const target = rect(615, 390, 180, 110);
  const standardSvg = rect(100, 80, 920, 500);
  const expandedSvg = rect(100, 80, 1380, 750);

  const standard = calculateConnectionGeometry(
    source,
    target,
    standardSvg,
    svgPixelViewBox(standardSvg),
  );
  const expanded = calculateConnectionGeometry(
    source,
    target,
    expandedSvg,
    svgPixelViewBox(expandedSvg),
  );

  assert.deepEqual(expanded, standard);
});

test("six-node branched graph keeps all five connections on their own cards", () => {
  const svgRect = rect(40, 70, 1380, 750);
  const viewBox = { x: 0, y: 0, width: 920, height: 500 };
  const nodes = new Map([
    ["camera", rect(85, 160, 180, 110)],
    ["door", rect(390, 110, 180, 110)],
    ["vending", rect(695, 85, 180, 110)],
    ["room-door", rect(390, 385, 180, 110)],
    ["room-camera", rect(695, 335, 180, 110)],
    ["turret", rect(1000, 285, 180, 110)],
  ]);
  const connections = [
    ["camera", "door"],
    ["door", "vending"],
    ["room-door", "turret"],
    ["camera", "room-camera"],
    ["room-camera", "turret"],
  ];

  for (const [sourceId, targetId] of connections) {
    const geometry = calculateConnectionGeometry(
      nodes.get(sourceId),
      nodes.get(targetId),
      svgRect,
      viewBox,
    );
    assert.ok(geometry);
    assert.notEqual(geometry.x1, geometry.x2);
    assert.ok(Number.isFinite(geometry.barrierX));
    assert.ok(Number.isFinite(geometry.barrierY));
  }
});

test("zero-sized SVG viewports defer geometry until layout is available", () => {
  assert.equal(
    calculateConnectionGeometry(
      rect(0, 0, 180, 110),
      rect(300, 0, 180, 110),
      rect(0, 0, 0, 0),
      null,
    ),
    null,
  );
});
