import {
  BlurMask,
  Canvas,
  LinearGradient,
  Mask,
  Path,
  Rect,
  RoundedRect,
  Skia,
  vec
} from "@shopify/react-native-skia";
import { memo, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { SignalState } from "@/features/tuner/types";

const MAX_CENTS = 100;
const HEAD_SIZE = 18;
const TICK_COUNT = 41;
const START_ANGLE = (160 * Math.PI) / 180;
const END_ANGLE = (20 * Math.PI) / 180;
const SWEEP_ORANGE = "#FF9B2E";
const SWEEP_TRAIL_COLOR = "rgba(255, 155, 46, 0.26)";
const SWEEP_TRAIL_STROKE_WIDTH = 9;
const SWEEP_TRAIL_BLUR = 10;

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
  curveDepth: number,
  edgeLift: number
) {
  "worklet";
  const clampedProgress = clamp(progress, 0, 1);
  const centerX = width / 2;
  const middleY = arcTop + curveDepth;
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
  curveDepth: number,
  edgeLift: number
) {
  "worklet";
  return getDialPointAtProgress(
    toDialProgress(cents),
    width,
    arcPadding,
    arcTop,
    curveDepth,
    edgeLift
  );
}

function createDialPath(
  width: number,
  arcPadding: number,
  arcTop: number,
  curveDepth: number,
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
      curveDepth,
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
  const curveDepth = 0;
  const edgeLift = Math.max(12, height * 0.1);
  const centerX = width / 2;
  const centerArcPoint = getDialPointAtProgress(
    0.5,
    width,
    arcPadding,
    arcTop,
    curveDepth,
    edgeLift
  );
  const tickBottomY = centerArcPoint.y - 8;

  const palette = isStableInTune || isInTune
    ? {
      head: "#72F2A4",
      glow: "rgba(114, 242, 164, 0.12)",
    }
    : {
      head: "#FF9B2E",
      glow: "rgba(255, 155, 46, 0.14)",
    };

  const headCents = useSharedValue(displayCents ?? 0);
  const headOpacity = useSharedValue(signalState === "idle" ? 0.18 : 1);
  const headScale = useSharedValue(isStableInTune ? 0.94 : 1);
  const sweepVisibility = useSharedValue(displayCents === null ? 0 : 1);

  useEffect(() => {
    headCents.set(withTiming(displayCents ?? 0, {
      duration: signalState === "live" ? 48 : 120,
      easing: Easing.out(Easing.cubic),
    }));
  }, [displayCents, headCents, signalState]);

  useEffect(() => {
    sweepVisibility.set(withTiming(displayCents === null ? 0 : 1, {
      duration: signalState === "live" ? 70 : 120,
      easing: Easing.out(Easing.cubic),
    }));
  }, [displayCents, signalState, sweepVisibility]);

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

  const animatedHeadStyle = useAnimatedStyle(() => {
    const point = getDialPoint(
      headCents.value,
      width,
      arcPadding,
      arcTop,
      curveDepth,
      edgeLift
    );

    return {
      opacity: headOpacity.value,
      transform: [
        { translateX: point.x - HEAD_SIZE / 2 },
        { translateY: point.y - HEAD_SIZE / 2 },
        { scale: headScale.value },
      ],
    };
  });

  const dialPath = useMemo(
    () => createDialPath(width, arcPadding, arcTop, curveDepth, edgeLift),
    [arcPadding, arcTop, curveDepth, edgeLift, width]
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
        curveDepth,
        edgeLift
      );
      const isMajor = index % 5 === 0;
      const bottom = point.y - 8;
      const height = isMajor ? 14 : 8;
      const tickWidth = isMajor ? 2 : 1.5;

      return {
        key: `${index}-${progress}`,
        cx: point.x,
        y: bottom - height,
        width: tickWidth,
        height,
        radius: tickWidth / 2,
        opacity: isMajor ? 0.7 : 0.4,
      };
    });
  }, [arcPadding, arcTop, curveDepth, edgeLift, width]);

  const sweepStart = useDerivedValue(() => {
    const progress = toDialProgress(headCents.value);
    return Math.max(0, progress);
  });

  const sweepEnd = useDerivedValue(() => {
    const progress = toDialProgress(headCents.value);
    return Math.min(1, progress);
  });

  const edgeMask = useMemo(
    () => (
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(width, 0)}
          colors={[
            "rgba(255,255,255,0)",
            "rgba(255,255,255,0.34)",
            "rgba(255,255,255,1)",
            "rgba(255,255,255,1)",
            "rgba(255,255,255,0.34)",
            "rgba(255,255,255,0)",
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
            color="rgba(255,255,255,0.18)"
          />
        </Mask>
      </Canvas>

      <Canvas style={StyleSheet.absoluteFill}>
        <Mask mode="alpha" mask={edgeMask}>
          <Path
            path={dialPath}
            style="stroke"
            strokeWidth={SWEEP_TRAIL_STROKE_WIDTH}
            strokeCap="round"
            start={sweepStart}
            end={sweepEnd}
            color={SWEEP_TRAIL_COLOR}
          >
            <BlurMask blur={SWEEP_TRAIL_BLUR} />
          </Path>

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
          {ticks.map((tick) => (
            <RoundedRect
              key={tick.key}
              x={tick.cx - tick.width / 2}
              y={tick.y}
              width={tick.width}
              height={tick.height}
              r={Math.min(tick.radius, tick.height / 2)}
              color={`rgba(255,255,255,${tick.opacity})`}
            />
          ))}
        </Mask>

        <Path path={centerMarkerPath} color={SWEEP_ORANGE} strokeCap="round" />
      </Canvas>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.headGlow,
          {
            width: HEAD_SIZE,
            height: HEAD_SIZE,
            borderRadius: HEAD_SIZE / 2,
            backgroundColor: palette.glow,
          },
          animatedHeadStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.headCore,
          {
            width: HEAD_SIZE,
            height: HEAD_SIZE,
            borderRadius: HEAD_SIZE / 2,
            backgroundColor: palette.head,
          },
          animatedHeadStyle,
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  headGlow: {
    position: "absolute",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 4,
  },
  headCore: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.34)",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 2,
  },
});
