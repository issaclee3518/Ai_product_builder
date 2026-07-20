import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Stage, Layer, Line } from "react-konva";
import { applyQuickShape } from "../utils/quickShape";

const HOLD_MS = 600;
const STILL_THRESHOLD = 6;
const MIN_ADJUST_SCALE = 0.08;
const MIN_SHAPE_SIZE = 8;
const MIN_SNAP_SIZE = 24;
const START_DRAG_THRESHOLD = 2;
const EDGE_SELECT_THRESHOLD = 18;

function dist2(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function bboxFromFlat(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }

  return { minX, minY, maxX, maxY };
}

function scaleFlatPoints(points, anchor, scale) {
  const scaled = [];
  for (let i = 0; i < points.length; i += 2) {
    scaled.push(
      anchor.x + (points[i] - anchor.x) * scale,
      anchor.y + (points[i + 1] - anchor.y) * scale
    );
  }
  return scaled;
}

function clampAdjustScale(rawScale, baseShapeRadius) {
  const minBySize = MIN_SHAPE_SIZE / Math.max(baseShapeRadius * 2, 1);
  const minScale = Math.max(MIN_ADJUST_SCALE, minBySize);
  if (!Number.isFinite(rawScale) || rawScale <= 0) return minScale;
  return Math.max(minScale, rawScale);
}

function strokeBBoxDiagonal(points) {
  const box = bboxFromFlat(points);
  return Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
}

function getShapeCenter(basePoints) {
  const box = bboxFromFlat(basePoints);
  return {
    x: (box.minX + box.maxX) / 2,
    y: (box.minY + box.maxY) / 2,
  };
}

function maxRadiusFromAnchor(basePoints, anchor) {
  let maxRadius = 0;
  for (let i = 0; i < basePoints.length; i += 2) {
    maxRadius = Math.max(
      maxRadius,
      Math.hypot(basePoints[i] - anchor.x, basePoints[i + 1] - anchor.y)
    );
  }
  return Math.max(maxRadius, MIN_SHAPE_SIZE / 2);
}

function clampLineEndpoint(anchor, pointer) {
  const dx = pointer.x - anchor.x;
  const dy = pointer.y - anchor.y;
  const length = Math.hypot(dx, dy);

  if (length >= MIN_SHAPE_SIZE) {
    return { x: pointer.x, y: pointer.y };
  }

  if (length < 0.001) {
    return { x: anchor.x + MIN_SHAPE_SIZE, y: anchor.y };
  }

  const scale = MIN_SHAPE_SIZE / length;
  return { x: anchor.x + dx * scale, y: anchor.y + dy * scale };
}

function normalizeLinePoints(points, drawingStart) {
  if (points.length < 4 || !drawingStart) return points.slice();

  const start = { x: points[0], y: points[1] };
  const end = { x: points[2], y: points[3] };
  if (dist2(end, drawingStart) < dist2(start, drawingStart)) {
    return [end.x, end.y, start.x, start.y];
  }
  return points.slice();
}

function createSnapAdjustSession(shape, drawingStart, pointer) {
  if (!shape || shape.type === "freehand") return null;

  const drawingStartPt = drawingStart ?? { x: shape.points[0], y: shape.points[1] };
  const pointerPt = pointer ?? drawingStartPt;
  let basePoints = shape.points.slice();

  if (shape.type === "line") {
    basePoints = normalizeLinePoints(basePoints, drawingStartPt);

    return {
      shapeType: "line",
      mode: "line-endpoint",
      anchor: { x: basePoints[0], y: basePoints[1] },
      basePoints,
    };
  }

  const center = getShapeCenter(basePoints);
  const shapeRadius = maxRadiusFromAnchor(basePoints, center);
  const pointerRadius = dist2(pointerPt, center);
  const basePointerRadius =
    pointerRadius > MIN_SHAPE_SIZE / 2 ? pointerRadius : shapeRadius;

  return {
    shapeType: shape.type,
    mode: "center-scale",
    anchor: center,
    basePoints,
    baseShapeRadius: shapeRadius,
    basePointerRadius,
  };
}

function buildAdjustedQuickShape(session, pointer) {
  if (!session || !pointer) return null;

  const { anchor, mode } = session;

  if (mode === "line-endpoint") {
    const end = clampLineEndpoint(anchor, pointer);

    return {
      points: [anchor.x, anchor.y, end.x, end.y],
      closed: false,
      tension: 0,
    };
  }

  if (mode === "center-scale") {
    const nextRadius = Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y);
    if (nextRadius < MIN_SHAPE_SIZE / 2) return null;

    const scale = clampAdjustScale(
      nextRadius / session.basePointerRadius,
      session.baseShapeRadius
    );

    return {
      points: scaleFlatPoints(session.basePoints, anchor, scale),
      closed: true,
      tension: 0,
    };
  }

  return null;
}

function distToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 0.001) return dist2(point, a);

  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return dist2(point, { x: a.x + t * dx, y: a.y + t * dy });
}

function distanceToStrokeEdge(line, worldPoint) {
  const ox = line.offsetX ?? 0;
  const oy = line.offsetY ?? 0;
  const pts = line.points;
  let minDist = Infinity;

  for (let i = 0; i + 3 < pts.length; i += 2) {
    const a = { x: pts[i] + ox, y: pts[i + 1] + oy };
    const b = { x: pts[i + 2] + ox, y: pts[i + 3] + oy };
    minDist = Math.min(minDist, distToSegment(worldPoint, a, b));
  }

  if (line.closed && pts.length >= 4) {
    const a = { x: pts[pts.length - 2] + ox, y: pts[pts.length - 1] + oy };
    const b = { x: pts[0] + ox, y: pts[1] + oy };
    minDist = Math.min(minDist, distToSegment(worldPoint, a, b));
  }

  return minDist;
}

function findEdgeLineAtPoint(lines, point, threshold = EDGE_SELECT_THRESHOLD) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.tool === "erase") continue;

    const hitWidth = Math.max(threshold, line.strokeWidth * 2);
    if (distanceToStrokeEdge(line, point) <= hitWidth) {
      return line;
    }
  }

  return null;
}

function bringLineToFront(lines, id) {
  const index = lines.findIndex((line) => line.id === id);
  if (index < 0 || index === lines.length - 1) return lines;

  const next = [...lines];
  next.push(next.splice(index, 1)[0]);
  return next;
}

function getPointsCenter(points) {
  if (!points || points.length < 2) return { x: 0, y: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
}

export default function Board2D({
  tool,
  color,
  thickness,
  clearToken,
  onStrokeChange,
  exportRef,
}) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [lines, setLines] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const isDrawing = useRef(false);
  const lastSignificantMoveRef = useRef(0);
  const holdSnapAttemptedRef = useRef(false);
  const snappedRef = useRef(false);
  const drawingStartRef = useRef(null);
  const snapAdjustRef = useRef(null);
  const linesRef = useRef(lines);
  const toolRef = useRef(tool);
  const selectedIdRef = useRef(selectedId);
  const clipboardRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const lastDrawStartRef = useRef(0);
  const pendingStartRef = useRef(null);
  const beginDrawingRef = useRef(null);
  const snapCurrentStrokeRef = useRef(null);

  linesRef.current = lines;
  toolRef.current = tool;
  selectedIdRef.current = selectedId;

  const updateLines = useCallback((updater) => {
    setLines((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      linesRef.current = next;
      return next;
    });
  }, []);

  const applySelection = useCallback(
    (id) => {
      selectedIdRef.current = id;
      setSelectedId(id);
      if (!id) return;

      updateLines((prev) => bringLineToFront(prev, id));
    },
    [updateLines]
  );

  const clearSelection = useCallback(() => {
    selectedIdRef.current = null;
    setSelectedId(null);
  }, []);

  const updateSnappedShape = useCallback(
    (point) => {
      const session = snapAdjustRef.current;
      if (!session) return;

      const adjusted = buildAdjustedQuickShape(session, point);
      if (!adjusted) return;

      updateLines((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const idx = next.length - 1;
        next[idx] = {
          ...next[idx],
          points: adjusted.points,
          snapped: true,
          shapeType: session.shapeType,
          closed: adjusted.closed,
          tension: adjusted.tension,
        };
        return next;
      });
    },
    [updateLines]
  );

  const snapCurrentStroke = useCallback(() => {
    if (toolRef.current === "erase" || snappedRef.current) return false;

    const current = linesRef.current;
    if (current.length === 0) return false;

    const last = current[current.length - 1];
    if (!last || last.tool === "erase" || last.snapped) return false;
    if (last.points.length < 4) return false;
    if (strokeBBoxDiagonal(last.points) < MIN_SNAP_SIZE) return false;

    const shape = applyQuickShape(last.points, {
      strokeWidth: last.strokeWidth,
    });
    if (!shape) return false;

    if (shape.type === "line") {
      shape.points = normalizeLinePoints(shape.points, drawingStartRef.current);
      shape.closed = false;
    }

    snappedRef.current = true;
    snapAdjustRef.current = createSnapAdjustSession(
      shape,
      drawingStartRef.current,
      pointerRef.current
    );

    const lineTension = shape.type === "freehand" ? 0.4 : 0;

    updateLines((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const idx = next.length - 1;
      next[idx] = {
        ...next[idx],
        points: shape.points,
        snapped: true,
        shapeType: shape.type,
        closed: Boolean(shape.closed),
        tension: lineTension,
      };
      return next;
    });

    return true;
  }, [updateLines]);

  snapCurrentStrokeRef.current = snapCurrentStroke;

  const finishDrawing = useCallback(() => {
    if (!isDrawing.current) return;

    isDrawing.current = false;
    setIsDrawingActive(false);
    drawingStartRef.current = null;
    snapAdjustRef.current = null;
    snappedRef.current = false;
  }, []);

  const handleDrawingPointerMove = useCallback(
    (event) => {
      if (!isDrawing.current) return;

      const stage = stageRef.current;
      if (!stage) return;

      stage.setPointersPositions(event);
      const point = stage.getPointerPosition();
      if (!point) return;
      pointerRef.current = point;

      if (snappedRef.current) {
        updateSnappedShape(point);
        return;
      }

      updateLines((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = { ...next[next.length - 1] };
        last.points = last.points.concat([point.x, point.y]);
        next[next.length - 1] = last;
        return next;
      });

      if (toolRef.current === "erase") return;

      const stroke = linesRef.current[linesRef.current.length - 1];
      const pts = stroke?.points ?? [];
      if (pts.length >= 4) {
        const prevX = pts[pts.length - 4];
        const prevY = pts[pts.length - 3];
        if (Math.hypot(point.x - prevX, point.y - prevY) > STILL_THRESHOLD) {
          lastSignificantMoveRef.current = Date.now();
          holdSnapAttemptedRef.current = false;
        }
      } else {
        lastSignificantMoveRef.current = Date.now();
      }
    },
    [updateLines, updateSnappedShape]
  );

  useEffect(() => {
    if (!isDrawingActive) return undefined;

    let rafId = 0;
    const checkHoldSnap = () => {
      if (
        isDrawing.current &&
        !snappedRef.current &&
        !holdSnapAttemptedRef.current &&
        toolRef.current !== "erase" &&
        Date.now() - lastSignificantMoveRef.current >= HOLD_MS
      ) {
        holdSnapAttemptedRef.current = true;
        snapCurrentStrokeRef.current?.();
      }
      rafId = requestAnimationFrame(checkHoldSnap);
    };

    rafId = requestAnimationFrame(checkHoldSnap);
    return () => cancelAnimationFrame(rafId);
  }, [isDrawingActive]);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setSize((prev) => ({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      }));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    updateLines([]);
    clearSelection();
    setIsDrawingActive(false);
    onStrokeChange(false);
    isDrawing.current = false;
    snappedRef.current = false;
    drawingStartRef.current = null;
    snapAdjustRef.current = null;
    pendingStartRef.current = null;
    lastSignificantMoveRef.current = 0;
    holdSnapAttemptedRef.current = false;
  }, [clearToken, clearSelection, onStrokeChange, updateLines]);

  useEffect(() => {
    onStrokeChange(lines.length > 0);
  }, [lines, onStrokeChange]);

  useEffect(() => {
    exportRef.current = async () => {
      const stage = stageRef.current;
      if (!stage) return;
      const uri = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
      const link = document.createElement("a");
      link.download = `whiteboard-2d-${Date.now()}.png`;
      link.href = uri;
      link.click();
    };
  }, [exportRef]);

  useEffect(() => {
    const isTypingTarget = (target) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    };

    const trackPointerForPaste = (event) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return;
      }

      pointerRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      const stage = stageRef.current;
      if (stage) stage.setPointersPositions(event);
    };

    const deleteSelected = () => {
      const id = selectedIdRef.current;
      if (!id) return false;
      updateLines((prev) => prev.filter((line) => line.id !== id));
      clearSelection();
      return true;
    };

    const copySelected = () => {
      const id = selectedIdRef.current;
      if (!id) return false;
      const line = linesRef.current.find((item) => item.id === id);
      if (!line || line.tool === "erase") return false;
      clipboardRef.current = structuredClone(line);
      return true;
    };

    const pasteClipboard = () => {
      const source = clipboardRef.current;
      if (!source) return false;

      const stage = stageRef.current;
      const pos = stage?.getPointerPosition();
      let pasteAt = pos ?? pointerRef.current;

      const sourceOffsetX = source.offsetX ?? 0;
      const sourceOffsetY = source.offsetY ?? 0;
      const localCenter = getPointsCenter(source.points);
      const sourceWorldCenter = {
        x: localCenter.x + sourceOffsetX,
        y: localCenter.y + sourceOffsetY,
      };

      if (
        Math.hypot(pasteAt.x - sourceWorldCenter.x, pasteAt.y - sourceWorldCenter.y) <
        16
      ) {
        pasteAt = { x: sourceWorldCenter.x + 24, y: sourceWorldCenter.y + 24 };
      }

      const nextId = crypto.randomUUID();
      const pasted = {
        ...structuredClone(source),
        id: nextId,
        offsetX: pasteAt.x - localCenter.x,
        offsetY: pasteAt.y - localCenter.y,
      };

      flushSync(() => {
        updateLines((prev) => [...prev, pasted]);
        applySelection(nextId);
      });

      return true;
    };

    const handleKeyDown = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      const isClipboardShortcut =
        mod &&
        (event.code === "KeyC" || event.code === "KeyV" || event.code === "KeyX");

      if (isTypingTarget(event.target) && !isClipboardShortcut) return;

      if (event.key === "Escape") {
        clearSelection();
        return;
      }

      if (mod && event.code === "KeyC") {
        if (copySelected()) event.preventDefault();
        return;
      }

      if (mod && event.code === "KeyX") {
        if (copySelected() && deleteSelected()) event.preventDefault();
        return;
      }

      if (mod && event.code === "KeyV") {
        if (pasteClipboard()) event.preventDefault();
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        if (deleteSelected()) event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointermove", trackPointerForPaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointermove", trackPointerForPaste);
    };
  }, [applySelection, clearSelection, updateLines]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const stage = stageRef.current;
      if (!stage) return;

      stage.setPointersPositions(event);
      const point = stage.getPointerPosition();
      if (point) pointerRef.current = point;

      if (isDrawing.current) {
        handleDrawingPointerMove(event);
        return;
      }

      const start = pendingStartRef.current;
      if (!start || !point) return;

      if (
        Math.hypot(point.x - start.x, point.y - start.y) < START_DRAG_THRESHOLD
      ) {
        return;
      }

      pendingStartRef.current = null;
      if (beginDrawingRef.current) {
        beginDrawingRef.current(start);
        handleDrawingPointerMove(event);
      }
    };
    const handlePointerUp = () => {
      pendingStartRef.current = null;
      if (!isDrawing.current) return;
      finishDrawing();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [finishDrawing, handleDrawingPointerMove]);

  const handlePointerMoveTrack = useCallback((event) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setPointersPositions(event);
    const point = stage.getPointerPosition();
    if (point) pointerRef.current = point;
  }, []);

  const beginDrawingAt = useCallback(
    (startPoint) => {
      if (!startPoint) return false;

      isDrawing.current = true;
      setIsDrawingActive(true);
      snappedRef.current = false;
      lastDrawStartRef.current = Date.now();
      lastSignificantMoveRef.current = Date.now();
      holdSnapAttemptedRef.current = false;
      drawingStartRef.current = startPoint;
      snapAdjustRef.current = null;

      updateLines((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          tool,
          color,
          strokeWidth: tool === "erase" ? thickness * 2 : thickness,
          points: [startPoint.x, startPoint.y],
          offsetX: 0,
          offsetY: 0,
          snapped: false,
          closed: false,
          tension: 0.4,
        },
      ]);

      return true;
    },
    [color, thickness, tool, updateLines]
  );

  beginDrawingRef.current = beginDrawingAt;

  const handleLineDoubleClick = useCallback(
    (lineId, event) => {
      event.cancelBubble = true;
      pendingStartRef.current = null;
      if (isDrawing.current) return;
      applySelection(lineId);
    },
    [applySelection]
  );

  const handleStageDoubleClick = useCallback(
    (event) => {
      pendingStartRef.current = null;
      if (isDrawing.current) return;

      const stage = event.target.getStage();
      if (!stage) return;

      stage.setPointersPositions(event);
      const point = stage.getPointerPosition();
      if (!point) return;

      const hit = findEdgeLineAtPoint(linesRef.current, point);
      if (!hit) return;

      event.cancelBubble = true;
      applySelection(hit.id);
    },
    [applySelection]
  );

  const handleLinePointerDown = useCallback((event) => {
    if (isDrawing.current) return;
    event.cancelBubble = true;
    pendingStartRef.current = null;
  }, []);

  const handleLineDragEnd = useCallback(
    (lineId, event) => {
      const node = event.target;
      updateLines((prev) =>
        prev.map((line) =>
          line.id === lineId
            ? {
                ...line,
                offsetX: node.x(),
                offsetY: node.y(),
              }
            : line
        )
      );
    },
    [updateLines]
  );

  const handlePointerDown = useCallback(
    (event) => {
      const stage = event.target.getStage();
      if (!stage) return;

      if (event.evt?.detail >= 2) return;

      stage.setPointersPositions(event);
      const point = stage.getPointerPosition();
      if (!point) return;

      pointerRef.current = point;

      if (selectedIdRef.current) {
        clearSelection();
      }

      pendingStartRef.current = point;
    },
    [clearSelection]
  );

  const stageCursor =
    tool === "erase" ? "cell" : selectedId ? "default" : "crosshair";

  return (
    <div ref={containerRef} className="board-canvas">
      {size.width > 0 && size.height > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          onMouseMove={handlePointerMoveTrack}
          onTouchMove={handlePointerMoveTrack}
          onDblClick={handleStageDoubleClick}
          onDblTap={handleStageDoubleClick}
          style={{
            cursor: stageCursor,
            background: "#ffffff",
          }}
        >
          <Layer>
            {lines.map((line) => {
              const isSelected = selectedId === line.id;
              const canMove = line.tool !== "erase";
              const canListen = canMove && !isDrawingActive;
              const canDrag = isSelected && canListen;

              return (
                <Line
                  key={line.id}
                  name={line.id}
                  x={line.offsetX ?? 0}
                  y={line.offsetY ?? 0}
                  points={line.points}
                  stroke={line.color}
                  strokeWidth={line.strokeWidth}
                  tension={line.tension ?? (line.snapped ? 0 : 0.4)}
                  closed={Boolean(line.closed)}
                  fillEnabled={false}
                  lineCap="round"
                  lineJoin="round"
                  listening={canListen}
                  draggable={canDrag}
                  hitStrokeWidth={Math.max(24, line.strokeWidth * 3)}
                  perfectDrawEnabled={false}
                  shadowColor={isSelected ? "#2563eb" : undefined}
                  shadowBlur={isSelected ? 8 : 0}
                  shadowOpacity={isSelected ? 0.55 : 0}
                  onMouseDown={canListen ? handleLinePointerDown : undefined}
                  onTouchStart={canListen ? handleLinePointerDown : undefined}
                  onDblClick={(event) => handleLineDoubleClick(line.id, event)}
                  onDblTap={(event) => handleLineDoubleClick(line.id, event)}
                  onDragEnd={(event) => handleLineDragEnd(line.id, event)}
                  onMouseEnter={(event) => {
                    if (isSelected) {
                      const stage = event.target.getStage();
                      if (stage) stage.container().style.cursor = "grab";
                    }
                  }}
                  onMouseLeave={(event) => {
                    const stage = event.target.getStage();
                    if (stage) stage.container().style.cursor = stageCursor;
                  }}
                  onDragStart={(event) => {
                    const stage = event.target.getStage();
                    if (stage) stage.container().style.cursor = "grabbing";
                  }}
                  globalCompositeOperation={
                    line.tool === "erase" ? "destination-out" : "source-over"
                  }
                />
              );
            })}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
