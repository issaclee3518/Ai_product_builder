import { useCallback, useRef, useState } from "react";
import Toolbar from "./components/Toolbar.jsx";
import Board2D from "./components/Board2D.jsx";
import Board3D from "./components/Board3D.jsx";
import "./App.css";

export default function App() {
  const [dimension, setDimension] = useState("2d");
  const [tool, setTool] = useState("draw");
  const [color, setColor] = useState("#1f2933");
  const [thickness, setThickness] = useState(6);
  const [cameraSpeed, setCameraSpeed] = useState(12);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [clearToken, setClearToken] = useState(0);
  const exportRef = useRef(null);

  const handleDimensionChange = useCallback((next) => {
    setDimension(next);
    setHasStrokes(false);
    setTool(next === "3d" ? "place" : "draw");
  }, []);

  const handleClear = useCallback(() => {
    setClearToken((value) => value + 1);
    setHasStrokes(false);
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      if (!exportRef.current) return;
      await exportRef.current();
    } catch (error) {
      console.error(error);
      alert("Something went wrong while saving the image. Please try again.");
    }
  }, []);

  return (
    <div className="app">
      <Toolbar
        dimension={dimension}
        onDimensionChange={handleDimensionChange}
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        thickness={thickness}
        onThicknessChange={setThickness}
        cameraSpeed={cameraSpeed}
        onCameraSpeedChange={setCameraSpeed}
        onClear={handleClear}
        onDownload={handleDownload}
      />

      <main
        className={`board-shell ${dimension === "3d" ? "is-3d" : ""}`}
        aria-label={dimension === "2d" ? "2D whiteboard" : "3D whiteboard"}
      >
        {!hasStrokes && (
          <div className="board-hint">
            {dimension === "2d"
              ? "Drag to draw. Double-click a shape edge to select and move, or draw inside shapes."
              : "Drag shapes to place · Select and fill with the color picker · WASD camera · W/E/R gizmo"}
          </div>
        )}

        {dimension === "2d" ? (
          <Board2D
            tool={tool}
            color={color}
            thickness={thickness}
            clearToken={clearToken}
            onStrokeChange={setHasStrokes}
            exportRef={exportRef}
          />
        ) : (
          <Board3D
            tool={tool}
            color={color}
            thickness={thickness}
            cameraSpeed={cameraSpeed}
            clearToken={clearToken}
            onStrokeChange={setHasStrokes}
            exportRef={exportRef}
            onColorSync={setColor}
          />
        )}
      </main>

      <footer className="site-footer">
        <a href="/">Home</a>
        <a href="/about.html">About</a>
        <a href="/guide.html">Guide</a>
        <a href="/faq.html">FAQ</a>
        <a href="/privacy.html">Privacy</a>
        <a href="mailto:issaclee6320@gmail.com">Contact</a>
      </footer>
    </div>
  );
}
