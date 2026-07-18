import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Stage, Layer, Line } from "react-konva";

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
  }, [clearToken, onStrokeChange]);

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

  const handlePointerDown = useCallback(
    (event) => {
      isDrawing.current = true;
      const stage = event.target.getStage();
      const point = stage.getPointerPosition();
      if (!point) return;

      setLines((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          tool,
          color,
          strokeWidth: tool === "erase" ? thickness * 2 : thickness,
          points: [point.x, point.y],
        },
      ]);
    },
    [color, thickness, tool]
  );

  const handlePointerMove = useCallback((event) => {
    if (!isDrawing.current) return;
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
  }, []);

  const handlePointerUp = useCallback(() => {
    isDrawing.current = false;
  }, []);

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
                tension={0.4}
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
