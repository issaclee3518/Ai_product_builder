import { getStrokePoints } from "perfect-freehand";

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function toPairs(flat) {
  const pts = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    pts.push({ x: flat[i], y: flat[i + 1] });
  }
  return pts;
}

function flatToInput(flat) {
  const pts = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    pts.push([flat[i], flat[i + 1]]);
  }
  return pts;
}

function strokePointsToFlat(strokePoints) {
  const pts = [];
  for (const sp of strokePoints) {
    pts.push(sp.point[0], sp.point[1]);
  }
  return pts;
}

function pathLength(pts) {
  let length = 0;
  for (let i = 1; i < pts.length; i += 1) {
    length += dist(pts[i - 1], pts[i]);
  }
  return length;
}

function bbox(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function perpendicularDistance(point, start, end) {
  return pointToSegmentDistance(point, start, end);
}

function douglasPeucker(points, epsilon) {
  if (points.length < 3) return points.slice();

  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i += 1) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [points[0], points[end]];
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values) {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function circlePoints(cx, cy, radius, segments = 64) {
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  return points;
}

function ellipsePoints(cx, cy, rx, ry, segments = 64) {
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry);
  }
  return points;
}

function rectPoints(box) {
  const { minX, minY, maxX, maxY } = box;
  return [minX, minY, maxX, minY, maxX, maxY, minX, maxY, minX, minY];
}

function polygonPoints(corners) {
  const points = [];
  for (const corner of corners) {
    points.push(corner.x, corner.y);
  }
  const first = corners[0];
  points.push(first.x, first.y);
  return points;
}

function isNearlyClosed(pts) {
  if (pts.length < 2) return false;
  const box = bbox(pts);
  const diag = Math.hypot(box.w, box.h) || 1;
  const length = pathLength(pts);
  const gap = dist(pts[0], pts[pts.length - 1]);
  return gap < Math.max(16, diag * 0.22) || gap < Math.max(22, length * 0.28);
}

/**
 * tldraw draw-tool style streamline via perfect-freehand getStrokePoints.
 */
export function streamlineStroke(flatPoints, options = {}) {
  const input = flatToInput(flatPoints);
  if (input.length < 2) return flatPoints.slice();

  // Drop consecutive duplicate / near-duplicate samples. perfect-freehand
  // divides by segment length internally, so zero-length segments (e.g. the
  // pointer sitting still while holding) produce NaN coordinates.
  const deduped = [];
  for (const p of input) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.01) {
      deduped.push(p);
    }
  }

  if (deduped.length < 2) return flatPoints.slice();

  const strokePoints = getStrokePoints(deduped, {
    size: options.size ?? Math.max(8, options.strokeWidth ?? 8),
    thinning: 0.5,
    smoothing: 0.62,
    streamline: 0.65,
    simulatePressure: true,
    last: true,
  });

  const flat = strokePointsToFlat(strokePoints);

  // Guard against any NaN slipping through: fall back to the raw stroke.
  for (let i = 0; i < flat.length; i += 1) {
    if (!Number.isFinite(flat[i])) return flatPoints.slice();
  }

  return flat.length >= 4 ? flat : flatPoints.slice();
}

/**
 * Recognize a clean geometric shape from a freehand stroke.
 * Returns flat Konva points, or null when confidence is low.
 */
export function recognizeQuickShape(flatPoints) {
  const pts = toPairs(flatPoints);
  if (pts.length < 8) return null;

  const length = pathLength(pts);
  if (length < 36) return null;

  const box = bbox(pts);
  const diag = Math.hypot(box.w, box.h) || 1;
  if (diag < 28) return null;

  const start = pts[0];
  const end = pts[pts.length - 1];
  const closedGap = dist(start, end);
  const isClosed = closedGap < Math.max(16, diag * 0.22);

  let lineError = 0;
  for (const p of pts) {
    lineError += pointToSegmentDistance(p, start, end);
  }
  lineError /= pts.length;
  const span = dist(start, end) || 1;

  if (
    !isClosed &&
    lineError < Math.max(5, diag * 0.055) &&
    length / span < 1.38
  ) {
    return {
      type: "line",
      points: [start.x, start.y, end.x, end.y],
      closed: false,
    };
  }

  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const radii = pts.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const avgR = mean(radii);
  const radiusVar = avgR > 0 ? stddev(radii) / avgR : 1;
  const aspect = box.w / (box.h || 1);
  const nearClosed = closedGap < Math.max(22, length * 0.28);

  if ((isClosed || nearClosed) && radiusVar < 0.17 && avgR > 12) {
    if (aspect > 0.78 && aspect < 1.28) {
      return {
        type: "circle",
        points: circlePoints(cx, cy, avgR),
        closed: true,
      };
    }
    return {
      type: "ellipse",
      points: ellipsePoints(cx, cy, box.w / 2, box.h / 2),
      closed: true,
    };
  }

  if (!isClosed && !nearClosed) return null;

  const simplified = douglasPeucker(pts, Math.max(7, diag * 0.045));
  let corners = simplified;
  if (
    corners.length > 2 &&
    dist(corners[0], corners[corners.length - 1]) < Math.max(14, diag * 0.12)
  ) {
    corners = corners.slice(0, -1);
  }

  if (corners.length === 3) {
    return {
      type: "triangle",
      points: polygonPoints(corners),
      closed: true,
    };
  }

  if (corners.length === 4 || corners.length === 5) {
    return {
      type: "rect",
      points: rectPoints(box),
      closed: true,
    };
  }

  if (radiusVar < 0.22 && avgR > 14 && nearClosed) {
    if (aspect > 0.78 && aspect < 1.28) {
      return {
        type: "circle",
        points: circlePoints(cx, cy, avgR),
        closed: true,
      };
    }
    return {
      type: "ellipse",
      points: ellipsePoints(cx, cy, box.w / 2, box.h / 2),
      closed: true,
    };
  }

  return null;
}

/**
 * Hold-to-snap: try geometric QuickShape, else beautify with perfect-freehand.
 */
function pointsAreFinite(points) {
  if (!points || points.length < 4) return false;
  for (let i = 0; i < points.length; i += 1) {
    if (!Number.isFinite(points[i])) return false;
  }
  return true;
}

export function applyQuickShape(flatPoints, options = {}) {
  if (!flatPoints || flatPoints.length < 4) return null;

  const smoothed = streamlineStroke(flatPoints, options);

  const recognized =
    recognizeQuickShape(smoothed) || recognizeQuickShape(flatPoints);

  if (recognized && pointsAreFinite(recognized.points)) return recognized;

  const safe = pointsAreFinite(smoothed) ? smoothed : flatPoints.slice();
  return {
    type: "freehand",
    points: safe,
    closed: isNearlyClosed(toPairs(safe)),
  };
}
