import {
  Atlas,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Mask,
  Path,
  Rect,
  RoundedRect,
  Skia,
  useColorBuffer,
  useTexture,
  processTransform3d,
  vec,
} from "@shopify/react-native-skia";
import { memo, useCallback, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  Easing,
  runOnUI,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type FrameInfo,
} from "react-native-reanimated";

import { SignalState } from "@/features/tuner/types";

const MAX_CENTS = 100;
const HEAD_SIZE = 12;
const TICK_COUNT = 41;
const START_ANGLE = (160 * Math.PI) / 180;
const END_ANGLE = (20 * Math.PI) / 180;
const SWEEP_ORANGE = "#FF6900";
const TRAIL_WINDOW_MS = 4000;
const TRAIL_ROWS = 10;
const TRAIL_CAP = 360;
const TRAIL_DOT_R = 2;
const TRAIL_BASE_Y_OFFSET = 14;
const TRAIL_ROW_GAP = 8;
const TRAIL_HEAT_SIGMA = 0.072;
const TRAIL_HEAT_GAIN = 0.76;
const TRAIL_DOT_COUNT = TRAIL_ROWS * TICK_COUNT;
const TRAIL_HEAT_COLD = { r: 0x40, g: 0x40, b: 0x40 };
const TRAIL_HEAT_HOT = { r: 0xff, g: 0x69, b: 0x00 };
const TRAIL_DOT_TEX = 48;
const TRAIL_DOT_TEX_R = 17;
const TRAIL_ATLAS_SCALE = TRAIL_DOT_R / TRAIL_DOT_TEX_R;

export interface PitchDialProps {
  width: number;
  height: number;
  displayCents: number | null;
  signalState: SignalState;
  isInTune: boolean;
  isStableInTune: boolean;
}

/** Same horizontal alpha ramp as Mask `mode="alpha"` (must be a fresh element per mount site for React). */
function EdgeFadeMaskRect({
  width: w,
  height: h,
}: {
  width: number;
  height: number;
}) {
  return (
    <Rect x={0} y={0} width={w} height={h}>
      <LinearGradient
        start={vec(0, 0)}
        end={vec(w, 0)}
        colors={[
          "rgba(0,0,0,0)",
          "rgba(0,0,0,0.34)",
          "rgba(0,0,0,1)",
          "rgba(0,0,0,1)",
          "rgba(0,0,0,0.34)",
          "rgba(0,0,0,0)",
        ]}
        positions={[0, 0.1, 0.22, 0.78, 0.9, 1]}
      />
    </Rect>
  );
}

function writeHeatToSkiaColor(
  color: Float32Array,
  t: number,
  cold: typeof TRAIL_HEAT_COLD,
  hot: typeof TRAIL_HEAT_HOT
) {
  "worklet";
  const k = Math.max(0, Math.min(1, t));
  color[0] = (cold.r + (hot.r - cold.r) * k) / 255;
  color[1] = (cold.g + (hot.g - cold.g) * k) / 255;
  color[2] = (cold.b + (hot.b - cold.b) * k) / 255;
  color[3] = 1;
}

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, value));
}

function mix(start: number, end: number, progress: number) {
  "worklet";
  return start + (end - start) * progress;
}

function toDialProgress(cents: number) {
  "worklet";
  return (clamp(cents, -MAX_CENTS, MAX_CENTS) + MAX_CENTS) / (MAX_CENTS * 2);
}

function getDialPointAtProgress(
  progress: number,
  width: number,
  arcPadding: number,
  arcTop: number,
  edgeLift: number
) {
  "worklet";
  const clampedProgress = clamp(progress, 0, 1);
  const centerX = width / 2;
  const middleY = arcTop;
  const edgeY = arcTop - edgeLift;
  const edgeSine = Math.sin(END_ANGLE);
  const radiusY = (middleY - edgeY) / (1 - edgeSine);
  const centerY = middleY - radiusY;
  const radiusX = (centerX - arcPadding) / Math.abs(Math.cos(START_ANGLE));
  const angle = mix(START_ANGLE, END_ANGLE, clampedProgress);

  return {
    x: centerX + radiusX * Math.cos(angle),
    y: centerY + radiusY * Math.sin(angle),
  };
}

function getDialPoint(
  cents: number,
  width: number,
  arcPadding: number,
  arcTop: number,
  edgeLift: number
) {
  "worklet";
  return getDialPointAtProgress(
    toDialProgress(cents),
    width,
    arcPadding,
    arcTop,
    edgeLift
  );
}

/** Radians: direction along the dial arc (increasing cents / progress), tangent to the ellipse. */
function getDialTangentAngle(
  cents: number,
  width: number,
  arcPadding: number,
  arcTop: number,
  edgeLift: number
) {
  "worklet";
  const progress = toDialProgress(cents);
  const clampedProgress = clamp(progress, 0, 1);
  const centerX = width / 2;
  const middleY = arcTop;
  const edgeY = arcTop - edgeLift;
  const edgeSine = Math.sin(END_ANGLE);
  const radiusY = (middleY - edgeY) / (1 - edgeSine);
  const radiusX = (centerX - arcPadding) / Math.abs(Math.cos(START_ANGLE));
  const angleSpan = END_ANGLE - START_ANGLE;
  const theta = mix(START_ANGLE, END_ANGLE, clampedProgress);
  const dxDp = -radiusX * Math.sin(theta) * angleSpan;
  const dyDp = radiusY * Math.cos(theta) * angleSpan;
  return Math.atan2(dyDp, dxDp);
}

function createDialPath(
  width: number,
  arcPadding: number,
  arcTop: number,
  edgeLift: number,
  sampleCount: number = 96
) {
  const path = Skia.Path.Make();

  for (let index = 0; index <= sampleCount; index += 1) {
    const progress = index / sampleCount;
    const point = getDialPointAtProgress(
      progress,
      width,
      arcPadding,
      arcTop,
      edgeLift
    );

    if (index === 0) {
      path.moveTo(point.x, point.y);
    } else {
      path.lineTo(point.x, point.y);
    }
  }

  return path;
}

function createRoundedTrianglePath(
  centerX: number,
  tipY: number,
  size: number,
  cornerRadius: number
) {
  const halfBase = size * 0.7;
  const tip = { x: centerX, y: tipY };
  const left = { x: centerX - halfBase, y: tipY - size };
  const right = { x: centerX + halfBase, y: tipY - size };
  const verts = [tip, left, right];
  const path = Skia.Path.Make();
  const n = verts.length;

  for (let i = 0; i < n; i += 1) {
    const prev = verts[(i - 1 + n) % n];
    const curr = verts[i];
    const next = verts[(i + 1) % n];

    const vInX = prev.x - curr.x;
    const vInY = prev.y - curr.y;
    const vOutX = next.x - curr.x;
    const vOutY = next.y - curr.y;
    const lenIn = Math.hypot(vInX, vInY);
    const lenOut = Math.hypot(vOutX, vOutY);
    const uInX = vInX / lenIn;
    const uInY = vInY / lenIn;

    const dot = (vInX * vOutX + vInY * vOutY) / (lenIn * lenOut);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    const tanHalf = Math.tan(angle / 2);
    const inset = Math.min(
      cornerRadius / tanHalf,
      lenIn * 0.45,
      lenOut * 0.45
    );
    const r = inset * tanHalf;

    const startX = curr.x + uInX * inset;
    const startY = curr.y + uInY * inset;

    if (i === 0) {
      path.moveTo(startX, startY);
    } else {
      path.lineTo(startX, startY);
    }
    path.arcToTangent(curr.x, curr.y, next.x, next.y, r);
  }

  path.close();
  return path;
}

export const PitchDial = memo(function PitchDial({
  width,
  height,
  displayCents,
  signalState,
  isInTune,
  isStableInTune,
}: PitchDialProps) {
  const arcPadding = 18;
  const arcTop = Math.max(48, height * 0.24);
  const edgeLift = Math.max(12, height * 0.1);
  const centerX = width / 2;
  const centerArcPoint = getDialPointAtProgress(
    0.5,
    width,
    arcPadding,
    arcTop,
    edgeLift
  );
  const tickBottomY = centerArcPoint.y - 8;

  const palette = isStableInTune || isInTune
    ? {
      head: "#FF6900",
    }
    : {
      head: "#FF9B2E",
    };

  const headCents = useSharedValue(displayCents ?? 0);
  const headOpacity = useSharedValue(signalState === "idle" ? 0.18 : 1);
  const headScale = useSharedValue(isStableInTune ? 0.94 : 1);

  const recordTrail =
    (signalState === "live" || signalState === "holding") &&
    displayCents !== null;

  const recordTrailSv = useSharedValue(recordTrail);
  useEffect(() => {
    recordTrailSv.value = recordTrail;
  }, [recordTrail, recordTrailSv]);

  const trailT = useSharedValue(new Float64Array(TRAIL_CAP));
  const trailP = useSharedValue(new Float32Array(TRAIL_CAP));
  const trailStart = useSharedValue(0);
  const trailLen = useSharedValue(0);
  const trailHeat = useSharedValue(new Float32Array(TRAIL_DOT_COUNT));
  const trailHeatEpoch = useSharedValue(0);

  const trailDotTexture = useTexture(
    <Circle
      cx={TRAIL_DOT_TEX / 2}
      cy={TRAIL_DOT_TEX / 2}
      r={TRAIL_DOT_TEX_R}
      color="#FFFFFF"
      antiAlias
    />,
    { width: TRAIL_DOT_TEX, height: TRAIL_DOT_TEX }
  );

  useEffect(() => {
    if (!recordTrail) {
      trailLen.value = 0;
      trailStart.value = 0;
      runOnUI(() => {
        "worklet";
        trailHeat.value.fill(0);
        trailHeatEpoch.value += 1;
      })();
    }
  }, [recordTrail, trailHeat, trailHeatEpoch, trailLen, trailStart]);

  const onTrailFrame = useCallback(
    (frameInfo: FrameInfo) => {
      "worklet";
      if (!recordTrailSv.value) {
        return;
      }

      const now = frameInfo.timestamp;
      const cents = headCents.value;
      const p = toDialProgress(cents);

      let start = trailStart.value;
      let len = trailLen.value;
      const tt = trailT.value;
      const pp = trailP.value;

      while (len > 0 && now - tt[start] > TRAIL_WINDOW_MS) {
        start = (start + 1) % TRAIL_CAP;
        len -= 1;
      }

      if (len < TRAIL_CAP) {
        const w = (start + len) % TRAIL_CAP;
        tt[w] = now;
        pp[w] = p;
        len += 1;
      } else {
        tt[start] = now;
        pp[start] = p;
        start = (start + 1) % TRAIL_CAP;
      }

      trailStart.value = start;
      trailLen.value = len;

      const cols = TICK_COUNT;
      const rows = TRAIL_ROWS;
      const heatArr = trailHeat.value;
      const sigma = TRAIL_HEAT_SIGMA;
      const twoSigmaSq = 2 * sigma * sigma;
      const gain = TRAIL_HEAT_GAIN;
      const rowMs = TRAIL_WINDOW_MS / rows;
      const colDenom = cols - 1;

      heatArr.fill(0);

      for (let k = 0; k < len; k += 1) {
        const idx = (start + k) % TRAIL_CAP;
        const age = now - tt[idx];
        const row = (age / rowMs) | 0;
        if (row < 0 || row >= rows) {
          continue;
        }
        const pk = pp[idx];
        const base = row * cols;
        for (let c = 0; c < cols; c += 1) {
          const colProg = c / colDenom;
          const dp = pk - colProg;
          heatArr[base + c] += Math.exp(-(dp * dp) / twoSigmaSq);
        }
      }

      for (let i = 0; i < heatArr.length; i += 1) {
        heatArr[i] = Math.min(1, heatArr[i] * gain);
      }

      trailHeatEpoch.value += 1;
    },
    // Worklet only reads stable SharedValue refs (layout is fixed for this instance).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    []
  );

  const trailFrame = useFrameCallback(onTrailFrame, false);
  useEffect(() => {
    trailFrame.setActive(recordTrail);
  }, [recordTrail, trailFrame]);

  useEffect(() => {
    headCents.set(withTiming(displayCents ?? 0, {
      duration: signalState === "live" ? 48 : 120,
      easing: Easing.out(Easing.cubic),
    }));
  }, [displayCents, headCents, signalState]);

  useEffect(() => {
    headOpacity.set(withTiming(
      signalState === "idle" ? 0.18 : signalState === "holding" ? 0.72 : 1,
      {
        duration: signalState === "live" ? 70 : 120,
        easing: Easing.out(Easing.cubic),
      }
    ));
    headScale.set(withTiming(isStableInTune ? 0.94 : 1, {
      duration: 120,
      easing: Easing.out(Easing.cubic),
    }));
  }, [headOpacity, headScale, isStableInTune, signalState]);

  // Single `{ matrix }` step: some runtimes don’t apply a raw Reanimated transform array on `Group`.
  const dialHeadTransform = useDerivedValue(() => {
    "worklet";
    const point = getDialPoint(
      headCents.value,
      width,
      arcPadding,
      arcTop,
      edgeLift
    );
    const angle = getDialTangentAngle(
      headCents.value,
      width,
      arcPadding,
      arcTop,
      edgeLift
    );
    const s = headScale.value;
    return [
      {
        matrix: processTransform3d([
          { translateX: point.x },
          { translateY: point.y },
          { rotate: angle },
          { scale: s },
        ]),
      },
    ];
  });

  const dialHeadOpacity = useDerivedValue(() => headOpacity.value);

  const dialPath = useMemo(
    () => createDialPath(width, arcPadding, arcTop, edgeLift),
    [arcPadding, arcTop, edgeLift, width]
  );

  const centerMarkerPath = useMemo(
    () => createRoundedTrianglePath(centerX, tickBottomY - 24, 12, 2),
    [centerX, tickBottomY]
  );

  const ticks = useMemo(() => {
    return Array.from({ length: TICK_COUNT }, (_, index) => {
      const progress = index / (TICK_COUNT - 1);
      const point = getDialPointAtProgress(
        progress,
        width,
        arcPadding,
        arcTop,
        edgeLift
      );
      const isMajor = index % 5 === 0;
      const bottom = point.y - 8;
      const height = isMajor ? 14 : 8;
      const tickWidth = isMajor ? 2 : 1.5;

      return {
        key: String(index),
        cx: point.x,
        y: bottom - height,
        width: tickWidth,
        height,
        radius: tickWidth / 2,
        color: isMajor ? "#404040" : "#262626",
      };
    });
  }, [arcPadding, arcTop, edgeLift, width]);

  const trailDotLayout = useMemo(() => {
    const out: { cx: number; cy: number }[] = [];
    const cols = TICK_COUNT;

    for (let row = 0; row < TRAIL_ROWS; row += 1) {
      const yExtra = TRAIL_BASE_Y_OFFSET + row * TRAIL_ROW_GAP;

      for (let col = 0; col < cols; col += 1) {
        const progress = col / (cols - 1);
        const point = getDialPointAtProgress(
          progress,
          width,
          arcPadding,
          arcTop,
          edgeLift
        );
        out.push({ cx: point.x, cy: point.y + yExtra });
      }
    }

    return out;
  }, [arcPadding, arcTop, edgeLift, width]);

  const trailAtlasSprites = useMemo(
    () =>
      Array.from({ length: TRAIL_DOT_COUNT }, () =>
        Skia.XYWHRect(0, 0, TRAIL_DOT_TEX, TRAIL_DOT_TEX)
      ),
    []
  );

  const trailAtlasTransforms = useMemo(
    () =>
      trailDotLayout.map((dot) =>
        Skia.RSXformFromRadians(
          TRAIL_ATLAS_SCALE,
          0,
          dot.cx,
          dot.cy,
          TRAIL_DOT_TEX / 2,
          TRAIL_DOT_TEX / 2
        )
      ),
    [trailDotLayout]
  );

  const trailAtlasColors = useColorBuffer(TRAIL_DOT_COUNT, (color, index) => {
    "worklet";
    void trailHeatEpoch.value;
    const h = trailHeat.value;
    const v = h != null && index < h.length ? h[index] : 0;
    writeHeatToSkiaColor(color, v, TRAIL_HEAT_COLD, TRAIL_HEAT_HOT);
  });

  // Trim along the path: `start` and `end` must differ or the stroke length is zero.
  // Span from dial center (0 cents → 0.5) to the needle so the glow trail reads as “how far off” the note is.
  const sweepStart = useDerivedValue(() => {
    const progress = toDialProgress(headCents.value);
    return Math.min(0.5, progress);
  });

  const sweepEnd = useDerivedValue(() => {
    const progress = toDialProgress(headCents.value);
    return Math.max(0.5, progress);
  });

  return (
    <View style={[styles.container, { width, height }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Mask
          mode="alpha"
          mask={<EdgeFadeMaskRect width={width} height={height} />}
        >
          <Path
            path={dialPath}
            style="stroke"
            strokeWidth={3}
            strokeCap="round"
            color="#404040"
          />
          <Path
            path={dialPath}
            style="stroke"
            strokeWidth={3}
            strokeCap="round"
            start={sweepStart}
            end={sweepEnd}
            color={SWEEP_ORANGE}
          />
        </Mask>
        <Group layer>
          <Atlas
            image={trailDotTexture}
            sprites={trailAtlasSprites}
            transforms={trailAtlasTransforms}
            colors={trailAtlasColors}
          />
          <Group blendMode="dstIn">
            <EdgeFadeMaskRect width={width} height={height} />
          </Group>
        </Group>
      </Canvas>

      <Canvas style={StyleSheet.absoluteFill}>
        <Mask
          mode="alpha"
          mask={<EdgeFadeMaskRect width={width} height={height} />}
        >
          <Group>
            {ticks.map((tick) => (
              <RoundedRect
                key={tick.key}
                x={tick.cx - tick.width / 2}
                y={tick.y}
                width={tick.width}
                height={tick.height}
                r={Math.min(tick.radius, tick.height / 2)}
                color={tick.color}
              />
            ))}
            <Path path={centerMarkerPath} color={SWEEP_ORANGE} />
          </Group>
        </Mask>
      </Canvas>

      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Mask
          mode="alpha"
          mask={<EdgeFadeMaskRect width={width} height={height} />}
        >
          <Group
            transform={dialHeadTransform}
            opacity={dialHeadOpacity}
          >
            <Circle
              cx={0}
              cy={0}
              r={HEAD_SIZE / 2}
              color="#FF6900"
            />
            <Circle
              cx={0}
              cy={0}
              r={HEAD_SIZE / 2 - 1}
              color={palette.head}
            />
            <Circle
              cx={0}
              cy={-(HEAD_SIZE / 2 - 2)}
              r={2}
              color="#FF6900"
            />
          </Group>
        </Mask>
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
});
