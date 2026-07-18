export default function Toolbar({
  dimension,
  onDimensionChange,
  tool,
  onToolChange,
  color,
  onColorChange,
  thickness,
  onThicknessChange,
  cameraSpeed,
  onCameraSpeedChange,
  onClear,
  onDownload,
}) {
  return (
    <header className="toolbar" aria-label="화이트보드 도구 막대">
      <div className="toolbar-left">
        <span className="brand-mark" aria-hidden="true">
          ✎
        </span>
        메모 화이트보드
      </div>

      <div className="controls">
        <div className="toggle-group" role="group" aria-label="차원 선택">
          <button
            type="button"
            className={dimension === "2d" ? "active" : ""}
            onClick={() => onDimensionChange("2d")}
          >
            2D
          </button>
          <button
            type="button"
            className={dimension === "3d" ? "active" : ""}
            onClick={() => onDimensionChange("3d")}
          >
            3D
          </button>
        </div>

        <div className="toggle-group" role="group" aria-label="도구 선택">
          {dimension === "2d" ? (
            <>
              <button
                type="button"
                className={tool === "draw" ? "active" : ""}
                onClick={() => onToolChange("draw")}
              >
                그리기
              </button>
              <button
                type="button"
                className={tool === "erase" ? "active" : ""}
                onClick={() => onToolChange("erase")}
              >
                지우개
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={tool === "place" ? "active" : ""}
                onClick={() => onToolChange("place")}
              >
                편집
              </button>
              <button
                type="button"
                className={tool === "erase" ? "active" : ""}
                onClick={() => onToolChange("erase")}
              >
                지우개
              </button>
            </>
          )}
        </div>

        <label>
          색상
          <input
            type="color"
            value={color}
            onChange={(event) => onColorChange(event.target.value)}
            aria-label="색상 선택"
          />
        </label>

        <label>
          {dimension === "3d" ? "배치 크기" : "두께"}
          <input
            type="range"
            min="1"
            max="50"
            value={thickness}
            onChange={(event) => onThicknessChange(Number(event.target.value))}
            aria-label={dimension === "3d" ? "새 도형 크기" : "선 두께 조절"}
          />
          <span className="range-value" aria-hidden="true">
            {thickness}
          </span>
        </label>

        {dimension === "3d" && (
          <label>
            카메라 속도
            <input
              type="range"
              min="2"
              max="40"
              value={cameraSpeed}
              onChange={(event) => onCameraSpeedChange(Number(event.target.value))}
              aria-label="카메라 이동 속도"
            />
            <span className="range-value" aria-hidden="true">
              {cameraSpeed}
            </span>
          </label>
        )}

        <button type="button" className="pill-button danger" onClick={onClear}>
          전체 지우기
        </button>
        <button type="button" className="pill-button" onClick={onDownload}>
          이미지 저장
        </button>
      </div>
    </header>
  );
}
