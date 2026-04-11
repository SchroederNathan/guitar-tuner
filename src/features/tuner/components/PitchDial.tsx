import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Mask,
  Path,
  Rect,
  RoundedRect,
  Skia,
  processTransform3d,
  vec,
} from "@shopify/react-native-skia";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Easing,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { SignalState } from "@/features/tuner/types";

const MAX_CENTS = 100;
const HEAD_SIZE = 12;
const TICK_COUNT = 41;
const START_ANGLE = (160 * Math.PI) / 180;
const END_ANGLE = (20 * Math.PI) / 180;
const SWEEP_ORANGE = "#FF6900";

const TRAIL_WINDOW_MS = 2000;
const TRAIL_ROWS = 6;
const TRAIL_CAP = 220;
const TRAIL_DOT_R = 2;
const TRAIL_BASE_Y_OFFSET = 16;
const TRAIL_ROW_GAP = 11;
const TRAIL_HEAT_SIGMA = 0.072;
const TRAIL_HEAT_GAIN = 0.72;
const TRAIL_DOT_COUNT = TRAIL_ROWS * TICK_COUNT;

function colorFromHeat(t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const r0 = 0x1d;
  const g0 = 0x18;
  const b0 = 0x16;
  const r = Math.round(r0 + (255 - r0) * k);
  const g = Math.round(g0 + (105 - g0) * k);
  const b = Math.round(b0 + (0 - b0) * k);
  const a = 1 + (0.78 - 1) * k;
  return `rgba(${r},${g},${b},${a})`;
}

/** JS rAF loop + plain Skia colors: per-dot Reanimated mappers + frame worklets were not updating reliably. */
function useTrailHeatFrame(active: boolean, headCents: SharedValue<number>) {
  const heat = useRef(new Float32Array(TRAIL_DOT_COUNT));
  const tBuf = useRef(new Float64Array(TRAIL_CAP));
  const pBuf = useRef(new Float32Array(TRAIL_CAP));
  const startRef = useRef(0);
  const lenRef = useRef(0);
  const [, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      lenRef.current = 0;
      startRef.current = 0;
      heat.current.fill(0);
      setFrame((f) => f + 1);
      return;
    }

    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const cents = headCents.value;
      const p =
        (Math.max(-MAX_CENTS, Math.min(MAX_CENTS, cents)) + MAX_CENTS) /
        (MAX_CENTS * 2);

      let start = startRef.current;
      let len = lenRef.current;
      const tt = tBuf.current;
      const pp = pBuf.current;

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

      startRef.current = start;
      lenRef.current = len;

      const cols = TICK_COUNT;
      const rows = TRAIL_ROWS;
      const heatArr = heat.current;
      const sigma = TRAIL_HEAT_SIGMA;
      const twoSigmaSq = 2 * sigma * sigma;
      const gain = TRAIL_HEAT_GAIN;
      const rowMs = TRAIL_WINDOW_MS / rows;

      for (let i = 0; i < cols * rows; i += 1) {
        const col = i % cols;
        const row = (i / cols) | 0;
        const colProg = col / (cols - 1);
        const ageMin = row * rowMs;
        const ageMax = (row + 1) * rowMs;
        let h = 0;

        for (let k = 0; k < len; k += 1) {
          const idx = (start + k) % TRAIL_CAP;
          const age = now - tt[idx];
          if (age < ageMin || age >= ageMax) {
            continue;
          }
          const dp = pp[idx] - colProg;
          h += Math.exp(-(dp * dp) / twoSigmaSq);
        }
        heatArr[i] = Math.min(1, h * gain);
      }

      setFrame((f) => f + 1);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [active, headCents]);

  return heat;
}

export interface PitchDialProps {
  width: number;
  height: number;
  displayCents: number | null;
  signalState: SignalState;
  isInTune: boolean;
  isStableInTune: boolean;
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
        color: isMajor ? "#5B4F4B" : "#2B2523",
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

  const trailRecordingActive =
    displayCents !== null &&
    (signalState === "live" || signalState === "holding");

  const trailHeatBuf = useTrailHeatFrame(trailRecordingActive, headCents);

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

  const edgeMask = useMemo(
    () => (
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(width, 0)}
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
    ),
    [height, width]
  );

  return (
    <View style={[styles.container, { width, height }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Mask mode="alpha" mask={edgeMask}>
          <Path
            path={dialPath}
            style="stroke"
            strokeWidth={3}
            strokeCap="round"
            color="#1D1816"
          />
        </Mask>
      </Canvas>

      <Canvas style={StyleSheet.absoluteFill}>
        <Mask mode="alpha" mask={edgeMask}>
          <Group>
            {trailDotLayout.map((dot, index) => (
              <Circle
                key={`trail-${index}`}
                cx={dot.cx}
                cy={dot.cy}
                r={TRAIL_DOT_R}
                color={colorFromHeat(trailHeatBuf.current[index])}
              />
            ))}
          </Group>
        </Mask>
      </Canvas>

      <Canvas style={StyleSheet.absoluteFill}>
        <Mask mode="alpha" mask={edgeMask}>
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
      </Canvas>

      <Canvas style={StyleSheet.absoluteFill}>
        <Mask mode="alpha" mask={edgeMask}>
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
        <Mask mode="alpha" mask={edgeMask}>
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
