import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, TransformControls } from "@react-three/drei";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

export const SHAPE_TYPES = [
  { id: "box", label: "정육면체", icon: "■" },
  { id: "sphere", label: "구", icon: "●" },
  { id: "cylinder", label: "원기둥", icon: "▮" },
  { id: "cone", label: "원뿔", icon: "▲" },
  { id: "torus", label: "도넛", icon: "◎" },
  { id: "pyramid", label: "피라미드", icon: "△" },
];

const FLOOR_SIZE = 400;
const FLOOR_HALF = FLOOR_SIZE / 2 - 2;

function sizeToScale(size) {
  return 0.35 + (Number(size) / 50) * 1.4;
}

function ShapeGeometry({ type }) {
  switch (type) {
    case "sphere":
      return <sphereGeometry args={[0.5, 32, 24]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.4, 0.4, 1, 28]} />;
    case "cone":
      return <coneGeometry args={[0.5, 1, 28]} />;
    case "torus":
      return <torusGeometry args={[0.35, 0.16, 16, 40]} />;
    case "pyramid":
      return <coneGeometry args={[0.55, 1, 4]} />;
    case "box":
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}

function groundY(type, scaleY) {
  switch (type) {
    case "torus":
      return 0.16 * scaleY;
    default:
      return 0.5 * scaleY;
  }
}

function usePlaneProjector() {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  return useCallback(
    (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const ok = raycaster.ray.intersectPlane(plane, hit);
      if (!ok) return null;
      return {
        x: THREE.MathUtils.clamp(hit.x, -FLOOR_HALF, FLOOR_HALF),
        z: THREE.MathUtils.clamp(hit.z, -FLOOR_HALF, FLOOR_HALF),
      };
    },
    [camera, gl, hit, plane, pointer, raycaster]
  );
}

function CameraFly({ enabled, orbitRef, speed = 12, blockWE = false }) {
  const { camera } = useThree();
  const keys = useRef({});
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const worldUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (!enabled) {
      keys.current = {};
      return undefined;
    }

    const isTypingTarget = (target) => {
      const tag = target?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
    };

    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return;
      keys.current[event.code] = true;
    };
    const onKeyUp = (event) => {
      keys.current[event.code] = false;
    };
    const onBlur = () => {
      keys.current = {};
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      keys.current = {};
    };
  }, [enabled]);

  useFrame((_, delta) => {
    if (!enabled) return;

    const boost = keys.current.ShiftLeft || keys.current.ShiftRight;
    const moveSpeed = (boost ? speed * 2.2 : speed) * delta;
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }
    right.crossVectors(forward, worldUp).normalize();

    let moved = false;
    // 도형 선택 중에는 W/E는 기즈모 전용 → 카메라 이동에 쓰지 않음
    if (keys.current.KeyW && !blockWE) {
      camera.position.addScaledVector(forward, moveSpeed);
      moved = true;
    }
    if (keys.current.KeyS) {
      camera.position.addScaledVector(forward, -moveSpeed);
      moved = true;
    }
    if (keys.current.KeyA) {
      camera.position.addScaledVector(right, -moveSpeed);
      moved = true;
    }
    if (keys.current.KeyD) {
      camera.position.addScaledVector(right, moveSpeed);
      moved = true;
    }
    if (keys.current.KeyE && !blockWE) {
      camera.position.y += moveSpeed;
      moved = true;
    }
    if (keys.current.KeyQ) {
      camera.position.y -= moveSpeed;
      moved = true;
    }

    camera.position.y = Math.max(0.5, camera.position.y);

    if (moved && orbitRef?.current) {
      camera.getWorldDirection(forward);
      lookAt.copy(camera.position).addScaledVector(forward, 12);
      orbitRef.current.target.copy(lookAt);
      orbitRef.current.update();
    }
  });

  return null;
}

const _gizmoRaycaster = new THREE.Raycaster();
const _gizmoPointer = new THREE.Vector2();

function getTransformGizmo(controls) {
  if (!controls) return null;
  // drei/three-stdlib: TransformControls.gizmo === TransformControlsGizmo
  if (controls.gizmo?.isTransformControlsGizmo) return controls.gizmo;
  if (controls.isTransformControlsGizmo) return controls;
  const root = controls.getHelper?.() ?? controls;
  if (!root?.traverse) return null;
  let gizmo = null;
  root.traverse((child) => {
    if (child.isTransformControlsGizmo) gizmo = child;
  });
  return gizmo;
}

/** 포인터가 활성 TransformControls 손잡이 위에 있는지 검사 (도형보다 손잡이 우선) */
function pointerHitsTransformGizmo(controls, clientX, clientY, camera, gl) {
  if (!controls || !camera || !gl) return false;
  const gizmo = getTransformGizmo(controls);
  if (!gizmo) return false;

  const mode = controls.mode || "translate";
  const targets = [];
  if (gizmo.picker?.[mode]) targets.push(gizmo.picker[mode]);
  if (gizmo.gizmo?.[mode]) targets.push(gizmo.gizmo[mode]);
  if (targets.length === 0) return false;

  const rect = gl.domElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  _gizmoPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _gizmoPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _gizmoRaycaster.setFromCamera(_gizmoPointer, camera);
  _gizmoRaycaster.params.Line = { threshold: 0.2 };
  const hits = _gizmoRaycaster.intersectObjects(targets, true);
  return hits.length > 0;
}

function makeScaleHandleMesh(name, size, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);
  mesh.name = name;
  mesh.renderOrder = Infinity;
  return mesh;
}

// three-stdlib 스케일 기즈모에는 가운데 XYZ가 없고, 축 끝 반투명 XYZX/Y/Z만 있음
// → 반투명 큐브 제거 후, 균일 스케일용 노란 가운데 XYZ를 직접 추가
function enhanceGizmo(controls) {
  const gizmo = getTransformGizmo(controls);
  if (!gizmo?.gizmo?.scale || !gizmo?.picker?.scale) return;

  const strip = (mode, names) => {
    ["gizmo", "picker", "helper"].forEach((kind) => {
      const root = gizmo[kind]?.[mode];
      if (!root) return;
      [...root.children]
        .filter((child) => names.includes(child.name))
        .forEach((child) => root.remove(child));
    });
  };

  strip("translate", ["XY", "YZ", "XZ"]);
  strip("rotate", ["E", "XYZE"]);
  // 평면 핸들 + 축 끝 반투명 흰 큐브(XYZX/Y/Z) 제거
  strip("scale", ["XY", "YZ", "XZ", "XYZX", "XYZY", "XYZZ"]);

  const yellowMat =
    gizmo.userData.uniformScaleMat ??
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: false,
      opacity: 1,
    });
  const pickMat =
    gizmo.userData.uniformScalePickMat ??
    new THREE.MeshBasicMaterial({
      visible: false,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
  gizmo.userData.uniformScaleMat = yellowMat;
  gizmo.userData.uniformScalePickMat = pickMat;

  const scaleGizmo = gizmo.gizmo.scale;
  const scalePicker = gizmo.picker.scale;

  let visual = scaleGizmo.children.find((child) => child.name === "XYZ");
  if (!visual) {
    visual = makeScaleHandleMesh("XYZ", 0.28, yellowMat);
    scaleGizmo.add(visual);
  } else {
    visual.visible = true;
    if (visual.isMesh) {
      visual.material = yellowMat;
      visual.material.transparent = false;
      visual.material.opacity = 1;
    }
  }

  let picker = scalePicker.children.find((child) => child.name === "XYZ");
  if (!picker) {
    picker = makeScaleHandleMesh("XYZ", 0.45, pickMat);
    scalePicker.add(picker);
  } else {
    picker.visible = true;
  }
}

const _gizmoBox = new THREE.Box3();
const _gizmoSize = new THREE.Vector3();
const _gizmoWorldPos = new THREE.Vector3();

function ShapeObject({
  shape,
  tool,
  selected,
  transformMode,
  onSelect,
  onDelete,
  onTransformCommit,
  onDuplicate,
  onDragging,
  transformGuardRef,
  spaceHeldRef,
}) {
  const groupRef = useRef(null);
  const controlsRef = useRef(null);
  const [object, setObject] = useState(null);
  const draggingRef = useRef(false);
  const duplicatedThisDrag = useRef(false);
  const enhancedRef = useRef(false);
  const { gl, camera } = useThree();

  useEffect(() => {
    const group = groupRef.current;
    if (!group || draggingRef.current) return;
    group.position.set(shape.position[0], shape.position[1], shape.position[2]);
    group.rotation.set(shape.rotation[0], shape.rotation[1], shape.rotation[2]);
    group.scale.set(shape.scale[0], shape.scale[1], shape.scale[2]);
  }, [shape]);

  // 기즈모 크기를 도형 bounding size의 1.2배로 유지 + 모드 바뀔 때 손잡이 재적용
  useFrame(() => {
    const controls = controlsRef.current;
    const group = groupRef.current;
    if (!controls || !group || !selected) return;

    if (!enhancedRef.current || controls.mode !== enhancedRef.current) {
      enhanceGizmo(controls);
      enhancedRef.current = controls.mode;
    }

    _gizmoBox.setFromObject(group);
    _gizmoBox.getSize(_gizmoSize);
    const objectSize = Math.max(_gizmoSize.x, _gizmoSize.y, _gizmoSize.z, 0.15);

    group.getWorldPosition(_gizmoWorldPos);
    let factor;
    if (camera.isOrthographicCamera) {
      factor = (camera.top - camera.bottom) / camera.zoom;
    } else {
      factor =
        _gizmoWorldPos.distanceTo(camera.position) *
        Math.min(1.9 * Math.tan((Math.PI * camera.fov) / 360) / camera.zoom, 7);
    }

    controls.size = (objectSize * 1.2 * 4) / Math.max(factor, 0.0001);
  });

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;

    // 손잡이가 다른 도형과 겹쳐도 기즈모가 우선
    const controls = transformGuardRef?.controls;
    if (
      controls &&
      pointerHitsTransformGizmo(controls, event.clientX, event.clientY, camera, gl)
    ) {
      event.stopPropagation();
      return;
    }

    event.stopPropagation();

    if (tool === "erase") {
      onDelete(shape.id);
      return;
    }

    onSelect(shape.id);
  };

  const snapshotFromGroup = () => {
    const group = groupRef.current;
    if (!group) {
      return {
        position: [...shape.position],
        rotation: [...shape.rotation],
        scale: [...shape.scale],
      };
    }
    return {
      position: [group.position.x, group.position.y, group.position.z],
      rotation: [group.rotation.x, group.rotation.y, group.rotation.z],
      scale: [group.scale.x, group.scale.y, group.scale.z],
    };
  };

  const commitTransform = () => {
    const snap = snapshotFromGroup();
    onTransformCommit(shape.id, snap);
  };

  return (
    <>
      <group
        ref={(node) => {
          groupRef.current = node;
          setObject(node);
        }}
        onPointerDown={handlePointerDown}
        onPointerOver={() => {
          gl.domElement.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          gl.domElement.style.cursor = "";
        }}
      >
        <mesh castShadow receiveShadow>
          <ShapeGeometry type={shape.type} />
          <meshStandardMaterial
            color={shape.color}
            roughness={0.35}
            metalness={0.15}
            emissive={selected ? shape.color : "#000000"}
            emissiveIntensity={selected ? 0.2 : 0}
          />
        </mesh>
      </group>

      {selected && tool !== "erase" && object && (
        <TransformControls
          ref={(node) => {
            controlsRef.current = node;
            enhancedRef.current = false;
            if (node) {
              enhanceGizmo(node);
              if (transformGuardRef) transformGuardRef.controls = node;
            } else if (transformGuardRef && transformGuardRef.controls) {
              transformGuardRef.controls = null;
            }
          }}
          object={object}
          mode={transformMode}
          size={1}
          onMouseDown={() => {
            draggingRef.current = true;
            duplicatedThisDrag.current = false;
            if (transformGuardRef) transformGuardRef.current = Date.now();
            onDragging(true);

            if (
              transformMode === "translate" &&
              spaceHeldRef?.current &&
              !duplicatedThisDrag.current
            ) {
              duplicatedThisDrag.current = true;
              onDuplicate?.(shape.id, snapshotFromGroup());
            }
          }}
          onMouseUp={() => {
            draggingRef.current = false;
            duplicatedThisDrag.current = false;
            if (transformGuardRef) transformGuardRef.current = Date.now();
            onDragging(false);
            commitTransform();
          }}
        />
      )}
    </>
  );
}

const SceneCapture = forwardRef(function SceneCapture(_, ref) {
  const { gl, scene, camera } = useThree();

  useImperativeHandle(ref, () => ({
    capture: () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    },
  }));

  return null;
});

function SceneContent({
  tool,
  color,
  size,
  cameraSpeed,
  clearToken,
  onStrokeChange,
  captureRef,
  dropRequest,
  setDropRequest,
  transformMode,
  setTransformMode,
  selectedId,
  setSelectedId,
  transformGuardRef,
  onColorSync,
}) {
  const [shapes, setShapes] = useState([]);
  const [isTransforming, setIsTransforming] = useState(false);
  const orbitRef = useRef(null);
  const prevColorRef = useRef(color);
  const spaceHeldRef = useRef(false);
  const { camera, gl } = useThree();

  useEffect(() => {
    setShapes([]);
    setSelectedId(null);
    onStrokeChange(false);
  }, [clearToken, onStrokeChange, setSelectedId]);

  useEffect(() => {
    onStrokeChange(shapes.length > 0);
  }, [shapes, onStrokeChange]);

  const addShapeAt = useCallback(
    (type, x, z) => {
      const scale = sizeToScale(size);
      const id = crypto.randomUUID();
      const next = {
        id,
        type,
        color,
        position: [x, groundY(type, scale), z],
        rotation: [0, 0, 0],
        scale: [scale, scale, scale],
      };
      setShapes((prev) => [...prev, next]);
      setSelectedId(id);
      setTransformMode("translate");
      prevColorRef.current = color;
      onColorSync?.(color);
      return next;
    },
    [color, onColorSync, setSelectedId, setTransformMode, size]
  );

  useEffect(() => {
    if (!dropRequest) return;
    addShapeAt(dropRequest.type, dropRequest.x, dropRequest.z);
    setDropRequest(null);
  }, [addShapeAt, dropRequest, setDropRequest]);

  // 색상 피커를 바꾸면 선택된 도형에 바로 칠하기
  useEffect(() => {
    if (!selectedId) {
      prevColorRef.current = color;
      return;
    }
    if (prevColorRef.current === color) return;
    prevColorRef.current = color;
    setShapes((prev) =>
      prev.map((shape) =>
        shape.id === selectedId ? { ...shape, color } : shape
      )
    );
  }, [color, selectedId]);

  useEffect(() => {
    const isTypingTarget = (target) => {
      const tag = target?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
    };

    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return;

      if (event.code === "Space") {
        event.preventDefault();
        spaceHeldRef.current = true;
        return;
      }

      if (!selectedId) return;

      if (event.code === "KeyW") {
        setTransformMode("translate");
      } else if (event.code === "KeyE") {
        setTransformMode("rotate");
      } else if (event.code === "KeyR") {
        event.preventDefault();
        setTransformMode("scale");
      } else if (event.code === "Escape") {
        setSelectedId(null);
      } else if (event.code === "Delete" || event.code === "Backspace") {
        event.preventDefault();
        setShapes((prev) => prev.filter((shape) => shape.id !== selectedId));
        setSelectedId(null);
      }
    };

    const onKeyUp = (event) => {
      if (event.code === "Space") {
        spaceHeldRef.current = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => {
      spaceHeldRef.current = false;
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selectedId, setSelectedId, setTransformMode]);

  const handleFloorPointerDown = useCallback(
    (event) => {
      if (event.button !== 0) return;
      const controls = transformGuardRef?.controls;
      if (controls?.axis) return;
      if (
        controls &&
        pointerHitsTransformGizmo(controls, event.clientX, event.clientY, camera, gl)
      ) {
        return;
      }
      setSelectedId(null);
    },
    [camera, gl, setSelectedId, transformGuardRef]
  );

  const handleTransformCommit = useCallback((id, transform) => {
    setShapes((prev) =>
      prev.map((shape) => (shape.id === id ? { ...shape, ...transform } : shape))
    );
  }, []);

  const handleDuplicate = useCallback((id, transform) => {
    setShapes((prev) => {
      const source = prev.find((shape) => shape.id === id);
      if (!source) return prev;
      return [
        ...prev,
        {
          ...source,
          id: crypto.randomUUID(),
          position: [...(transform?.position ?? source.position)],
          rotation: [...(transform?.rotation ?? source.rotation)],
          scale: [...(transform?.scale ?? source.scale)],
        },
      ];
    });
  }, []);

  const handleDelete = useCallback(
    (id) => {
      setShapes((prev) => prev.filter((shape) => shape.id !== id));
      setSelectedId((current) => (current === id ? null : current));
    },
    [setSelectedId]
  );

  const handleSelect = useCallback(
    (id) => {
      setSelectedId(id);
      setTransformMode((mode) => mode || "translate");
      setShapes((prev) => {
        const target = prev.find((shape) => shape.id === id);
        if (target) {
          prevColorRef.current = target.color;
          onColorSync?.(target.color);
        }
        return prev;
      });
    },
    [onColorSync, setSelectedId, setTransformMode]
  );

  // 선택 중에도 WASD 카메라 이동 (기즈모 드래그 중만 중지)
  const flyEnabled = !isTransforming;

  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    controls.enabled = !isTransforming;
  }, [isTransforming]);

  return (
    <>
      <color attach="background" args={["#87b5e0"]} />
      <fog attach="fog" args={["#9ec5e8", 80, 320]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[40, 60, 20]} intensity={1.2} castShadow />
      <hemisphereLight args={["#dbeafe", "#64748b", 0.45]} />

      <Grid
        args={[FLOOR_SIZE, FLOOR_SIZE]}
        cellSize={1}
        sectionSize={10}
        cellColor="#94a3b8"
        sectionColor="#64748b"
        fadeDistance={220}
        fadeStrength={1}
        infiniteGrid={false}
        position={[0, 0.02, 0]}
        raycast={() => null}
      />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onPointerDown={handleFloorPointerDown}
      >
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial color="#e8eef7" roughness={0.92} metalness={0.02} />
      </mesh>

      {shapes.map((shape) => (
        <ShapeObject
          key={shape.id}
          shape={shape}
          tool={tool}
          selected={selectedId === shape.id}
          transformMode={transformMode}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onTransformCommit={handleTransformCommit}
          onDuplicate={handleDuplicate}
          onDragging={setIsTransforming}
          transformGuardRef={transformGuardRef}
          spaceHeldRef={spaceHeldRef}
        />
      ))}

      <CameraFly
        enabled={flyEnabled}
        orbitRef={orbitRef}
        speed={cameraSpeed}
        blockWE={Boolean(selectedId)}
      />

      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        enableRotate
        enableZoom
        enablePan
        zoomToCursor
        zoomSpeed={1.4}
        rotateSpeed={0.9}
        maxPolarAngle={Math.PI * 0.49}
        minDistance={1}
        maxDistance={250}
        target={[0, 0, 0]}
        mouseButtons={{
          LEFT: -1,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />

      <SceneCapture ref={captureRef} />
    </>
  );
}

function ShapePalette({ transformMode, hasSelection, onShapePointerDown }) {
  return (
    <aside className="shape-palette" aria-label="3D 도형 팔레트">
      <p className="shape-palette-title">도형</p>
      <p className="shape-palette-hint">도형을 누른 채 캔버스로 끌어다 놓으세요.</p>
      <div className="shape-palette-list">
        {SHAPE_TYPES.map((shape) => (
          <div
            key={shape.id}
            className="shape-chip"
            role="button"
            tabIndex={0}
            onPointerDown={(event) => onShapePointerDown(shape, event)}
            title={`${shape.label} — 캔버스로 끌어다 놓기`}
          >
            <span className="shape-chip-icon" aria-hidden="true">
              {shape.icon}
            </span>
            <span>{shape.label}</span>
          </div>
        ))}
      </div>

      <div className="shape-hotkeys">
        {hasSelection ? (
          <>
            <p className="hotkey-row">
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> 카메라 · <kbd>Q</kbd>아래
            </p>
            <p className={`hotkey-row ${transformMode === "translate" ? "active" : ""}`}>
              <kbd>W</kbd> 기즈모 이동
            </p>
            <p className={`hotkey-row ${transformMode === "rotate" ? "active" : ""}`}>
              <kbd>E</kbd> 기즈모 회전
            </p>
            <p className={`hotkey-row ${transformMode === "scale" ? "active" : ""}`}>
              <kbd>R</kbd> 크기 (가운데=비율 유지)
            </p>
            <p className="hotkey-row">
              <kbd>Space</kbd> + 이동 = 복제
            </p>
            <p className="hotkey-row muted">색상 피커로 선택 도형 칠하기</p>
          </>
        ) : (
          <>
            <p className="hotkey-row">
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> 카메라 · <kbd>E</kbd>위 <kbd>Q</kbd>아래
            </p>
            <p className="hotkey-row muted">우클릭: 시점 회전 · Shift: 빠르게</p>
          </>
        )}
      </div>
    </aside>
  );
}

export default function Board3D({
  tool,
  color,
  thickness,
  cameraSpeed = 12,
  clearToken,
  onStrokeChange,
  exportRef,
  onColorSync,
}) {
  const captureRef = useRef(null);
  const boardRef = useRef(null);
  const [dropRequest, setDropRequest] = useState(null);
  const [transformMode, setTransformMode] = useState("translate");
  const [selectedId, setSelectedId] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const projectRef = useRef(null);
  const transformGuardRef = useRef(0);

  useEffect(() => {
    exportRef.current = async () => {
      const uri = captureRef.current?.capture?.();
      if (!uri) return;
      const link = document.createElement("a");
      link.download = `whiteboard-3d-${Date.now()}.png`;
      link.href = uri;
      link.click();
    };
  }, [exportRef]);

  // 포인터 기반 드래그: 사이드바 도형을 누른 채 끌어서 캔버스에 놓으면 배치
  const handleShapePointerDown = useCallback(
    (shape, event) => {
      if (event.button !== 0) return;
      if (tool === "erase") return;
      event.preventDefault();

      setDragGhost({
        type: shape.id,
        icon: shape.icon,
        x: event.clientX,
        y: event.clientY,
      });

      const onMove = (e) => {
        setDragGhost((prev) =>
          prev ? { ...prev, x: e.clientX, y: e.clientY } : prev
        );
      };

      const onUp = (e) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setDragGhost(null);

        const board = boardRef.current;
        if (!board) return;

        const rect = board.getBoundingClientRect();
        const inBoard =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        if (!inBoard) return;

        // 팔레트 위에 놓으면 무시
        const palette = board.querySelector(".shape-palette");
        if (palette) {
          const p = palette.getBoundingClientRect();
          if (
            e.clientX >= p.left &&
            e.clientX <= p.right &&
            e.clientY >= p.top &&
            e.clientY <= p.bottom
          ) {
            return;
          }
        }

        const point = projectRef.current?.(e.clientX, e.clientY);
        setDropRequest({
          type: shape.id,
          x: point?.x ?? 0,
          z: point?.z ?? 0,
        });
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [tool]
  );

  return (
    <div
      ref={boardRef}
      className={`board-canvas board-canvas-3d ${dragGhost ? "is-dropping" : ""}`}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ShapePalette
        transformMode={transformMode}
        hasSelection={Boolean(selectedId)}
        onShapePointerDown={handleShapePointerDown}
      />
      {dragGhost && <div className="drop-overlay" aria-hidden="true" />}
      {dragGhost && (
        <div
          className="drag-ghost"
          style={{ left: dragGhost.x, top: dragGhost.y }}
          aria-hidden="true"
        >
          {dragGhost.icon}
        </div>
      )}
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [12, 10, 16], fov: 50, near: 0.1, far: 800 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        style={{
          width: "100%",
          height: "100%",
          cursor: "default",
        }}
        onPointerMissed={(event) => {
          // 기즈모 조작 중/직후 또는 기즈모 핸들 위에서는 선택 해제하지 않음
          if (transformGuardRef.controls?.axis) return;
          if (Date.now() - transformGuardRef.current < 400) return;
          if (event.button === 0) setSelectedId(null);
        }}
      >
        <ProjectorBridge projectRef={projectRef} />
        <SceneContent
          tool={tool}
          color={color}
          size={thickness}
          cameraSpeed={cameraSpeed}
          clearToken={clearToken}
          onStrokeChange={onStrokeChange}
          captureRef={captureRef}
          dropRequest={dropRequest}
          setDropRequest={setDropRequest}
          transformMode={transformMode}
          setTransformMode={setTransformMode}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          transformGuardRef={transformGuardRef}
          onColorSync={onColorSync}
        />
      </Canvas>
    </div>
  );
}

function ProjectorBridge({ projectRef }) {
  const project = usePlaneProjector();
  useEffect(() => {
    projectRef.current = project;
  }, [project, projectRef]);
  return null;
}
