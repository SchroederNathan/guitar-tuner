import {
  Atlas,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Mask,
  Path,
  processTransform3d,
  Rect,
  RoundedRect,
  Skia,
  useRSXformBuffer,
  useTexture,
  vec,
} from "@shopify/react-native-skia";
import { memo, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { SignalState } from "@/features/tuner/types";

const MAX_CENTS = 100;
const HEAD_SIZE = 12;
const TICK_COUNT = 41;
const SWEEP_ORANGE = "#FF6900";
const CYLINDER_THETA_MAX = 1.12;
const CYLINDER_EDGE_SCALE = 0.58;
const TRACK_SIDE_PADDING = 18;
const RAIL_SEGMENT_COUNT = 72;
const TRAIL_ROWS = 10;
const TRAIL_DOT_R = 2;
const TRAIL_DOT_TEX = 24;
const TRAIL_DOT_TEX_R = 9;
const TRAIL_DOT_COUNT = TRAIL_ROWS * TICK_COUNT;
const TRAIL_HEAT_COLD = { r: 0x40, g: 0x40, b: 0x40 };
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

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, value));
}

function mix(start: number, end: number, progress: number) {
  "worklet";
  return start + (end - start) * progress;
}

function alpha(color: typeof TRAIL_HEAT_COLD, opacity: number) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
}

function toDialProgress(cents: number) {
  "worklet";
  return (clamp(cents, -MAX_CENTS, MAX_CENTS) + MAX_CENTS) / (MAX_CENTS * 2);
}

function getCylinderProjection(
  progress: number,
  width: number,
  sidePadding: number
) {
  "worklet";
  const centerX = width / 2;
  const clampedProgress = clamp(progress, 0, 1);
  const theta = mix(-CYLINDER_THETA_MAX, CYLINDER_THETA_MAX, clampedProgress);
  const radius = (centerX - sidePadding) / Math.sin(CYLINDER_THETA_MAX);
  const depth = Math.cos(theta);
  const minDepth = Math.cos(CYLINDER_THETA_MAX);
  const normalizedDepth = clamp((depth - minDepth) / (1 - minDepth), 0, 1);
  const scale = mix(CYLINDER_EDGE_SCALE, 1, normalizedDepth);
  return {
    x: centerX + radius * Math.sin(theta),
    depth,
    normalizedDepth,
    scale,
  };
}

function getDialHeadPoint(
  cents: number,
  width: number,
  sidePadding: number,
  bandY: number
) {
  "worklet";
  const projection = getCylinderProjection(
    toDialProgress(cents),
    width,
    sidePadding
  );
  return {
    x: projection.x,
    y: bandY,
  };
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
  const centerX = width / 2;
  const centerColumnProgress = (TICK_COUNT / 2) / (TICK_COUNT - 1);
  const nextCenterColumnProgress = (TICK_COUNT / 2 + 1) / (TICK_COUNT - 1);
  const trailRowGap = Math.max(
    TRAIL_DOT_R * 2 + 1,
    getCylinderProjection(
      nextCenterColumnProgress,
      width,
      TRACK_SIDE_PADDING
    ).x -
    getCylinderProjection(
      centerColumnProgress,
      width,
      TRACK_SIDE_PADDING
    ).x
  );
  const trailBaseYOffset = trailRowGap;
  const bottomHeatExtent =
    trailBaseYOffset + (TRAIL_ROWS - 1) * trailRowGap + TRAIL_DOT_R + 4;
  const topMarkerExtent = 38;
  const bandY = clamp(
    height * 0.4,
    topMarkerExtent,
    Math.max(topMarkerExtent, height - bottomHeatExtent)
  );

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
    const point = getDialHeadPoint(
      headCents.value,
      width,
      TRACK_SIDE_PADDING,
      bandY
    );
    const s = headScale.value;
    return [
      {
        matrix: processTransform3d([
          { translateX: point.x },
          { translateY: point.y },
          { scale: s },
        ]),
      },
    ];
  });

  const dialHeadOpacity = useDerivedValue(() => headOpacity.value);

  const centerMarkerPath = useMemo(
    () => createRoundedTrianglePath(centerX, bandY - 22, 12, 2),
    [bandY, centerX]
  );

  const ticks = useMemo(() => {
    return Array.from({ length: TICK_COUNT }, (_, index) => {
      const progress = index / (TICK_COUNT - 1);
      const projection = getCylinderProjection(progress, width, TRACK_SIDE_PADDING);
      const isMajor = index % 5 === 0;
      const tickHeight = (isMajor ? 14 : 8) * projection.scale;
      const tickWidth = Math.max(1.1, (isMajor ? 2.2 : 1.4) * projection.scale);
      const tickOpacity = mix(0.28, isMajor ? 0.9 : 0.62, projection.normalizedDepth);

      return {
        key: String(index),
        cx: projection.x,
        y: bandY - 8 - tickHeight,
        width: tickWidth,
        height: tickHeight,
        radius: tickWidth / 2,
        color: alpha(
          isMajor ? TRAIL_HEAT_COLD : { r: 0x26, g: 0x26, b: 0x26 },
          tickOpacity
        ),
      };
    });
  }, [bandY, width]);

  const railSegments = useMemo(() => {
    return Array.from({ length: RAIL_SEGMENT_COUNT }, (_, index) => {
      const progress = index / (RAIL_SEGMENT_COUNT - 1);
      const prevProgress = Math.max(0, (index - 0.5) / (RAIL_SEGMENT_COUNT - 1));
      const nextProgress = Math.min(1, (index + 0.5) / (RAIL_SEGMENT_COUNT - 1));
      const projection = getCylinderProjection(progress, width, TRACK_SIDE_PADDING);
      const prev = getCylinderProjection(prevProgress, width, TRACK_SIDE_PADDING);
      const next = getCylinderProjection(nextProgress, width, TRACK_SIDE_PADDING);
      const segmentWidth = Math.max(1.8, next.x - prev.x - 0.5);
      const segmentHeight = mix(1.8, 3.4, projection.normalizedDepth);
      const segmentOpacity = mix(0.2, 0.62, projection.normalizedDepth);

      return {
        key: String(index),
        x: projection.x - segmentWidth / 2,
        y: bandY - segmentHeight / 2,
        width: segmentWidth,
        height: segmentHeight,
        radius: segmentHeight / 2,
        opacity: segmentOpacity,
      };
    });
  }, [bandY, width]);

  const heatDots = useMemo(() => {
    return Array.from({ length: TRAIL_DOT_COUNT }, (_, index) => {
      const row = (index / TICK_COUNT) | 0;
      const col = index % TICK_COUNT;
      const progress = col / (TICK_COUNT - 1);
      const projection = getCylinderProjection(progress, width, TRACK_SIDE_PADDING);

      return {
        index,
        cx: projection.x,
        cy: bandY + trailBaseYOffset + row * trailRowGap,
        scale: TRAIL_ATLAS_SCALE * projection.scale,
      };
    });
  }, [bandY, trailBaseYOffset, trailRowGap, width]);

  const trailAtlasSprite = useMemo(
    () => Skia.XYWHRect(0, 0, TRAIL_DOT_TEX, TRAIL_DOT_TEX),
    []
  );

  const trailAtlasSprites = useMemo(
    () => Array.from({ length: TRAIL_DOT_COUNT }, () => trailAtlasSprite),
    [trailAtlasSprite]
  );

  const trailMeshTexture = useTexture(
    <Circle
      cx={TRAIL_DOT_TEX / 2}
      cy={TRAIL_DOT_TEX / 2}
      r={TRAIL_DOT_TEX_R}
      color="rgb(64, 64, 64)"
    />,
    { width: TRAIL_DOT_TEX, height: TRAIL_DOT_TEX }
  );

  const meshTransforms = useRSXformBuffer(TRAIL_DOT_COUNT, (transform, index) => {
    "worklet";
    const dot = heatDots[index];
    transform.set(
      dot.scale,
      0,
      dot.cx - (TRAIL_DOT_TEX / 2) * dot.scale,
      dot.cy - (TRAIL_DOT_TEX / 2) * dot.scale
    );
  });

  const sweepLeft = useDerivedValue(() => {
    "worklet";
    const x = getCylinderProjection(
      toDialProgress(headCents.value),
      width,
      TRACK_SIDE_PADDING
    ).x;
    return Math.min(centerX, x);
  });

  const sweepWidth = useDerivedValue(() => {
    "worklet";
    const x = getCylinderProjection(
      toDialProgress(headCents.value),
      width,
      TRACK_SIDE_PADDING
    ).x;
    return Math.abs(x - centerX);
  });

  return (
    <View style={[styles.container, { width, height }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Mask
          mode="alpha"
          mask={<EdgeFadeMaskRect width={width} height={height} />}
        >
          <Group>
            {railSegments.map((segment) => (
              <RoundedRect
                key={segment.key}
                x={segment.x}
                y={segment.y}
                width={segment.width}
                height={segment.height}
                r={segment.radius}
                color={alpha(TRAIL_HEAT_COLD, segment.opacity)}
              />
            ))}
            <RoundedRect
              x={sweepLeft}
              y={bandY - 1.75}
              width={sweepWidth}
              height={3.5}
              r={1.75}
              color={SWEEP_ORANGE}
            />
            <Atlas
              image={trailMeshTexture}
              sprites={trailAtlasSprites}
              transforms={meshTransforms}
            />
          </Group>
        </Mask>
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
