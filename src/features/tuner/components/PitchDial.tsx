import { memo, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Line,
  LinearGradient,
  Path,
  RoundedRect,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { PitchHistoryPoint, SignalState } from "@/features/tuner/types";

const MAX_CENTS = 50;
const HEAD_SIZE = 18;
const ARC_TRAIL_WINDOW_MS = 700;

type Point = {
  x: number;
  y: number;
};

export interface PitchDialProps {
  width: number;
  height: number;
  displayCents: number | null;
  pitchHistory: PitchHistoryPoint[];
  signalState: SignalState;
  isInTune: boolean;
  isStableInTune: boolean;
  confidence: number;
}

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, value));
}

function toDialProgress(cents: number) {
  "worklet";
  return (clamp(cents, -MAX_CENTS, MAX_CENTS) + MAX_CENTS) / (MAX_CENTS * 2);
}

function getArcPoint(
  cents: number,
  width: number,
  arcPadding: number,
  arcTop: number,
  curveDepth: number
) {
  "worklet";
  const progress = toDialProgress(cents);
  const startX = arcPadding;
  const startY = arcTop;
  const endX = width - arcPadding;
  const endY = arcTop;
  const controlX = width / 2;
  const controlY = arcTop + curveDepth;
  const oneMinus = 1 - progress;
  const x =
    oneMinus * oneMinus * startX +
    2 * oneMinus * progress * controlX +
    progress * progress * endX;
  const y =
    oneMinus * oneMinus * startY +
    2 * oneMinus * progress * controlY +
    progress * progress * endY;

  return { x, y };
}

function createSmoothPath(points: Point[]) {
  const path = Skia.Path.Make();

  if (points.length === 0) {
    return path;
  }

  path.moveTo(points[0]?.x ?? 0, points[0]?.y ?? 0);

  if (points.length === 1) {
    return path;
  }

  if (points.length === 2) {
    path.lineTo(points[1]?.x ?? 0, points[1]?.y ?? 0);
    return path;
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (!current || !next) {
      continue;
    }

    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path.quadTo(current.x, current.y, midX, midY);
  }

  const last = points[points.length - 1];
  if (last) {
    path.lineTo(last.x, last.y);
  }

  return path;
}

function createTrianglePath(centerX: number, topY: number, size: number) {
  const path = Skia.Path.Make();
  path.moveTo(centerX, topY);
  path.lineTo(centerX - size * 0.7, topY - size);
  path.lineTo(centerX + size * 0.7, topY - size);
  path.close();
  return path;
}

export const PitchDial = memo(function PitchDial({
  width,
  height,
  displayCents,
  pitchHistory,
  signalState,
  isInTune,
  isStableInTune,
  confidence,
}: PitchDialProps) {
  const arcPadding = 28;
  const arcTop = 54;
  const curveDepth = 28;
  const lowerChartTop = height * 0.46;
  const lowerChartHeight = height * 0.23;
  const lowerChartBottom = lowerChartTop + lowerChartHeight;
  const centerX = width / 2;

  const palette = isStableInTune || isInTune
    ? {
        head: "#72F2A4",
        glow: "rgba(114, 242, 164, 0.38)",
        start: "#A4F6C7",
        end: "#33CC79",
      }
    : {
        head: "#FF9B2E",
        glow: "rgba(255, 155, 46, 0.40)",
        start: "#FFB54A",
        end: "#FF5A1F",
      };

  const headCents = useSharedValue(displayCents ?? 0);
  const overlayOpacity = useSharedValue(signalState === "idle" ? 0 : 1);
  const headScale = useSharedValue(isStableInTune ? 0.92 : 1);

  useEffect(() => {
    headCents.value = withTiming(displayCents ?? 0, {
      duration: signalState === "live" ? 120 : 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [displayCents, headCents, signalState]);

  useEffect(() => {
    overlayOpacity.value = withTiming(
      signalState === "idle" ? 0 : signalState === "holding" ? 0.74 : 1,
      {
        duration: signalState === "idle" ? 450 : 180,
        easing: Easing.out(Easing.cubic),
      }
    );
    headScale.value = withTiming(isStableInTune ? 0.92 : 1, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [headScale, isStableInTune, overlayOpacity, signalState]);

  const animatedCanvasStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const animatedHeadStyle = useAnimatedStyle(() => {
    const point = getArcPoint(
      headCents.value,
      width,
      arcPadding,
      arcTop,
      curveDepth
    );

    return {
      opacity: overlayOpacity.value,
      transform: [
        { translateX: point.x - HEAD_SIZE / 2 },
        { translateY: point.y - HEAD_SIZE / 2 },
        { scale: headScale.value },
      ],
    };
  });

  const baseArcPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.moveTo(arcPadding, arcTop);
    path.quadTo(centerX, arcTop + curveDepth, width - arcPadding, arcTop);
    return path;
  }, [arcPadding, arcTop, centerX, curveDepth, width]);

  const centerMarkerPath = useMemo(
    () => createTrianglePath(centerX, arcTop - 10, 8),
    [arcTop, centerX]
  );

  const ticks = useMemo(() => {
    return Array.from({ length: 41 }, (_, index) => {
      const cents = -50 + index * 2.5;
      const point = getArcPoint(cents, width, arcPadding, arcTop, curveDepth);
      const isMajor = index % 4 === 0;
      const tickHeight = isMajor ? 18 : 10;
      return {
        key: `${index}-${cents}`,
        x: point.x,
        y1: point.y - tickHeight,
        y2: point.y - (isMajor ? 2 : 4),
        opacity: isMajor ? 0.48 : 0.24,
      };
    });
  }, [arcPadding, arcTop, curveDepth, width]);

  const dotGrid = useMemo(() => {
    const rows = 7;
    const columns = 28;

    return Array.from({ length: rows * columns }, (_, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = arcPadding + (column / (columns - 1)) * (width - arcPadding * 2);
      const wave = Math.sin((column / (columns - 1)) * Math.PI);
      const y =
        lowerChartTop +
        row * 15 +
        wave * 10 +
        (row % 2 === 0 ? 0 : 3);

      return {
        key: `${row}-${column}`,
        x,
        y,
        opacity: 0.1 + row * 0.03,
      };
    });
  }, [arcPadding, lowerChartTop, width]);

  const latestHistoryAt = pitchHistory[pitchHistory.length - 1]?.at ?? Date.now();
  const arcTrailPoints = useMemo(() => {
    const recentHistory = pitchHistory.filter(
      (point) => latestHistoryAt - point.at <= ARC_TRAIL_WINDOW_MS
    );

    return recentHistory.map((point) =>
      getArcPoint(point.cents, width, arcPadding, arcTop, curveDepth)
    );
  }, [arcPadding, arcTop, curveDepth, latestHistoryAt, pitchHistory, width]);

  const lowerHistoryPoints = useMemo(() => {
    return pitchHistory.map((point) => {
      const age = latestHistoryAt - point.at;
      const progress = 1 - clamp(age / 2000, 0, 1);
      const x = arcPadding + progress * (width - arcPadding * 2);
      const y =
        lowerChartTop +
        lowerChartHeight / 2 +
        (clamp(point.cents, -MAX_CENTS, MAX_CENTS) / MAX_CENTS) *
          (lowerChartHeight * 0.42);

      return { x, y };
    });
  }, [
    arcPadding,
    latestHistoryAt,
    lowerChartHeight,
    lowerChartTop,
    pitchHistory,
    width,
  ]);

  const arcTrailPath = useMemo(
    () => createSmoothPath(arcTrailPoints),
    [arcTrailPoints]
  );
  const lowerHistoryPath = useMemo(
    () => createSmoothPath(lowerHistoryPoints),
    [lowerHistoryPoints]
  );

  return (
    <View style={[styles.container, { width, height }]}>
      <Animated.View style={[StyleSheet.absoluteFillObject, animatedCanvasStyle]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <RoundedRect
            x={0}
            y={0}
            width={width}
            height={height}
            r={28}
            color="rgba(10, 11, 14, 0.92)"
          />

          <Path
            path={baseArcPath}
            style="stroke"
            strokeWidth={4}
            strokeCap="round"
            color="rgba(255,255,255,0.12)"
          />

          {ticks.map((tick) => (
            <Line
              key={tick.key}
              p1={vec(tick.x, tick.y1)}
              p2={vec(tick.x, tick.y2)}
              color={`rgba(255,255,255,${tick.opacity})`}
              strokeWidth={tick.opacity > 0.3 ? 2 : 1.2}
              strokeCap="round"
            />
          ))}

          <Line
            p1={vec(centerX, arcTop - 24)}
            p2={vec(centerX, arcTop + curveDepth + 8)}
            color="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />

          <Path path={centerMarkerPath} color={palette.head} />

          <RoundedRect
            x={centerX - 30}
            y={arcTop + curveDepth - 4}
            width={60}
            height={7}
            r={999}
            color="rgba(255,255,255,0.05)"
          />

          <Group opacity={Math.max(0.2, confidence)}>
            <Path
              path={arcTrailPath}
              style="stroke"
              strokeWidth={6}
              strokeCap="round"
              color={palette.end}
            >
              <LinearGradient
                start={vec(arcPadding, arcTop)}
                end={vec(width - arcPadding, arcTop + curveDepth)}
                colors={["rgba(255,181,74,0.18)", palette.start, palette.end]}
              />
              <BlurMask blur={3.5} style="solid" />
            </Path>

            <Path
              path={lowerHistoryPath}
              style="stroke"
              strokeWidth={4}
              strokeCap="round"
              color={palette.end}
            >
              <LinearGradient
                start={vec(arcPadding, lowerChartTop)}
                end={vec(width - arcPadding, lowerChartBottom)}
                colors={["rgba(255,255,255,0.04)", palette.start, palette.end]}
              />
            </Path>
          </Group>

          <Line
            p1={vec(arcPadding, lowerChartTop + lowerChartHeight / 2)}
            p2={vec(width - arcPadding, lowerChartTop + lowerChartHeight / 2)}
            color="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />

          {dotGrid.map((dot) => (
            <Circle
              key={dot.key}
              cx={dot.x}
              cy={dot.y}
              r={1.65}
              color={`rgba(255,255,255,${dot.opacity})`}
            />
          ))}
        </Canvas>
      </Animated.View>

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
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
  headCore: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 4,
  },
});
