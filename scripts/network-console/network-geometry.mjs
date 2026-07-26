function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRect(rect) {
  const left = finiteNumber(rect?.left ?? rect?.x);
  const top = finiteNumber(rect?.top ?? rect?.y);
  const width = Math.max(0, finiteNumber(rect?.width));
  const height = Math.max(0, finiteNumber(rect?.height));
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function normalizeViewBox(viewBox, svgRect) {
  return {
    x: finiteNumber(viewBox?.x),
    y: finiteNumber(viewBox?.y),
    width: Math.max(0, finiteNumber(viewBox?.width, svgRect.width)),
    height: Math.max(0, finiteNumber(viewBox?.height, svgRect.height)),
  };
}

/**
 * Convert a viewport-relative DOM rectangle into SVG user coordinates.
 *
 * Both the node and SVG rectangles come from getBoundingClientRect(), so scroll,
 * window chrome, application headers, borders, and graph offsets cancel out.
 */
export function viewportRectToSvgRect(rect, svgViewportRect, viewBox = null) {
  const svgRect = normalizeRect(svgViewportRect);
  const svgViewBox = normalizeViewBox(viewBox, svgRect);
  if (
    svgRect.width <= 0 ||
    svgRect.height <= 0 ||
    svgViewBox.width <= 0 ||
    svgViewBox.height <= 0
  ) {
    return null;
  }

  const nodeRect = normalizeRect(rect);
  const scaleX = svgViewBox.width / svgRect.width;
  const scaleY = svgViewBox.height / svgRect.height;
  const left = svgViewBox.x + (nodeRect.left - svgRect.left) * scaleX;
  const top = svgViewBox.y + (nodeRect.top - svgRect.top) * scaleY;
  const width = nodeRect.width * scaleX;
  const height = nodeRect.height * scaleY;

  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

function edgePoint(rect, towardX, towardY) {
  const dx = towardX - rect.centerX;
  const dy = towardY - rect.centerY;
  if (Math.abs(dx) < Number.EPSILON && Math.abs(dy) < Number.EPSILON) {
    return { x: rect.centerX, y: rect.centerY };
  }

  const halfWidth = Math.max(rect.width / 2, Number.EPSILON);
  const halfHeight = Math.max(rect.height / 2, Number.EPSILON);
  const scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight);
  return {
    x: rect.centerX + dx * scale,
    y: rect.centerY + dy * scale,
  };
}

/**
 * Measure a connection between the actual rendered edges of two node cards.
 */
export function calculateConnectionGeometry(
  sourceViewportRect,
  targetViewportRect,
  svgViewportRect,
  viewBox = null,
) {
  const sourceRect = viewportRectToSvgRect(
    sourceViewportRect,
    svgViewportRect,
    viewBox,
  );
  const targetRect = viewportRectToSvgRect(
    targetViewportRect,
    svgViewportRect,
    viewBox,
  );
  if (!sourceRect || !targetRect) return null;

  const source = edgePoint(sourceRect, targetRect.centerX, targetRect.centerY);
  const target = edgePoint(targetRect, sourceRect.centerX, sourceRect.centerY);
  return {
    x1: source.x,
    y1: source.y,
    x2: target.x,
    y2: target.y,
    barrierX: (source.x + target.x) / 2,
    barrierY: (source.y + target.y) / 2,
  };
}
