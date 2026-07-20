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
    <header className="toolbar" aria-label="Whiteboard toolbar">
      <div className="toolbar-left">
        <span className="brand-mark" aria-hidden="true">
          ✎
        </span>
        Memo Whiteboard
      </div>

      <div className="controls">
        <div className="toggle-group" role="group" aria-label="Dimension">
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

        <div className="toggle-group" role="group" aria-label="Tool">
          {dimension === "2d" ? (
            <>
              <button
                type="button"
                className={tool === "draw" ? "active" : ""}
                onClick={() => onToolChange("draw")}
              >
                Draw
              </button>
              <button
                type="button"
                className={tool === "erase" ? "active" : ""}
                onClick={() => onToolChange("erase")}
              >
                Eraser
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={tool === "place" ? "active" : ""}
                onClick={() => onToolChange("place")}
              >
                Edit
              </button>
              <button
                type="button"
                className={tool === "erase" ? "active" : ""}
                onClick={() => onToolChange("erase")}
              >
                Eraser
              </button>
            </>
          )}
        </div>

        <label>
          Color
          <input
            type="color"
            value={color}
            onChange={(event) => onColorChange(event.target.value)}
            aria-label="Pick color"
          />
        </label>

        <label>
          {dimension === "3d" ? "Place size" : "Width"}
          <input
            type="range"
            min="1"
            max="50"
            value={thickness}
            onChange={(event) => onThicknessChange(Number(event.target.value))}
            aria-label={dimension === "3d" ? "New shape size" : "Stroke width"}
          />
          <span className="range-value" aria-hidden="true">
            {thickness}
          </span>
        </label>

        {dimension === "3d" && (
          <label>
            Camera speed
            <input
              type="range"
              min="2"
              max="40"
              value={cameraSpeed}
              onChange={(event) => onCameraSpeedChange(Number(event.target.value))}
              aria-label="Camera move speed"
            />
            <span className="range-value" aria-hidden="true">
              {cameraSpeed}
            </span>
          </label>
        )}

        <button type="button" className="pill-button danger" onClick={onClear}>
          Clear all
        </button>
        <button type="button" className="pill-button" onClick={onDownload}>
          Save image
        </button>
      </div>
    </header>
  );
}
