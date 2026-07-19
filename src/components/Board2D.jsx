import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Stage, Layer, Line } from "react-konva";
import { applyQuickShape as computeQuickShape } from "../utils/quickShape";

const HOLD_MS = 600;
const STILL_THRESHOLD = 4;

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
  const isDrawing = useRef(false);
  const holdTimerRef = useRef(null);
  const stillAnchorRef = useRef(null);
  const snappedRef = useRef(false);
  const linesRef = useRef(lines);
  const toolRef = useRef(tool);

  linesRef.current = lines;
  toolRef.current = tool;

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const snapCurrentStroke = useCallback(() => {
    if (toolRef.current === "erase" || snappedRef.current) return;

    const current = linesRef.current;
    if (current.length === 0) return;

    const last = current[current.length - 1];
    if (!last || last.tool === "erase" || last.snapped) return;

    const shape = computeQuickShape(last.points, {
      strokeWidth: last.strokeWidth,
    });
    if (!shape) return;

    snappedRef.current = true;
    clearHoldTimer();

    setLines((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const idx = next.length - 1;
      next[idx] = {
        ...next[idx],
        points: shape.points,
        snapped: true,
        shapeType: shape.type,
        closed: shape.closed,
        tension: shape.type === "freehand" ? 0.2 : 0,
      };
      return next;
    });
  }, [clearHoldTimer]);

  const scheduleHoldSnap = useCallback(() => {
    clearHoldTimer();
    if (toolRef.current === "erase" || snappedRef.current) return;

    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      snapCurrentStroke();
    }, HOLD_MS);
  }, [clearHoldTimer, snapCurrentStroke]);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setLines([]);
    onStrokeChange(false);
    clearHoldTimer();
    isDrawing.current = false;
    snappedRef.current = false;
    stillAnchorRef.current = null;
  }, [clearToken, onStrokeChange, clearHoldTimer]);

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

  useEffect(() => () => clearHoldTimer(), [clearHoldTimer]);

  const handlePointerDown = useCallback(
    (event) => {
      isDrawing.current = true;
      snappedRef.current = false;
      clearHoldTimer();

      const stage = event.target.getStage();
      const point = stage.getPointerPosition();
      if (!point) return;

      stillAnchorRef.current = point;

      setLines((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          tool,
          color,
          strokeWidth: tool === "erase" ? thickness * 2 : thickness,
          points: [point.x, point.y],
          snapped: false,
          closed: false,
          tension: 0.4,
        },
      ]);

      if (tool !== "erase") {
        scheduleHoldSnap();
      }
    },
    [clearHoldTimer, color, scheduleHoldSnap, thickness, tool]
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (!isDrawing.current || snappedRef.current) return;

      const stage = event.target.getStage();
      const point = stage.getPointerPosition();
      if (!point) return;

      setLines((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = { ...next[next.length - 1] };
        last.points = last.points.concat([point.x, point.y]);
        next[next.length - 1] = last;
        return next;
      });

      if (toolRef.current === "erase") return;

      const anchor = stillAnchorRef.current;
      if (
        !anchor ||
        Math.hypot(point.x - anchor.x, point.y - anchor.y) > STILL_THRESHOLD
      ) {
        stillAnchorRef.current = point;
        scheduleHoldSnap();
      }
    },
    [scheduleHoldSnap]
  );

  const handlePointerUp = useCallback(() => {
    isDrawing.current = false;
    stillAnchorRef.current = null;
    clearHoldTimer();
    snappedRef.current = false;
  }, [clearHoldTimer]);

  return (
    <div ref={containerRef} className="board-canvas">
      {size.width > 0 && size.height > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          onMouseDown={handlePointerDown}
          onMousemove={handlePointerMove}
          onMouseup={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          style={{
            cursor: tool === "erase" ? "cell" : "crosshair",
            background: "#ffffff",
          }}
        >
          <Layer>
            {lines.map((line) => (
              <Line
                key={line.id}
                points={line.points}
                stroke={line.color}
                strokeWidth={line.strokeWidth}
                tension={line.tension ?? (line.snapped ? 0 : 0.4)}
                closed={Boolean(line.closed)}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={
                  line.tool === "erase" ? "destination-out" : "source-over"
                }
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
