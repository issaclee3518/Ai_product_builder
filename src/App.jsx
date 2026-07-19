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
      alert("이미지를 저장하는 데 문제가 발생했습니다. 다시 시도해 주세요.");
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
        aria-label={dimension === "2d" ? "2D 화이트보드" : "3D 화이트보드"}
      >
        {!hasStrokes && (
          <div className="board-hint">
            {dimension === "2d"
              ? "평면 화이트보드에 드래그해 그림을 그려 보세요."
              : "도형 드래그 배치 · 선택 후 색상 피커로 칠하기 · WASD 카메라 · W/E/R 기즈모"}
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
        <a href="/about.html">소개</a>
        <a href="/guide.html">사용법</a>
        <a href="/faq.html">FAQ</a>
        <a href="/privacy.html">개인정보처리방침</a>
        <a href="mailto:issaclee6320@gmail.com">문의</a>
      </footer>
    </div>
  );
}
