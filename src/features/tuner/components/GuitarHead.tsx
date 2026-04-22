import {
  Canvas,
  Circle,
  Group,
  Path,
  Rect,
  RoundedRect,
  Skia,
} from "@shopify/react-native-skia";
import { memo, useMemo } from "react";

import { StringId } from "@/features/tuner/types";

// ─── Layout constants ──────────────────────────────────────────────────────────
const CANVAS_H = 210;

// Neck / fretboard
const NECK_W = 72;
const NECK_HALF = NECK_W / 2; // 36
const NUT_Y = 72;
const NUT_H = 14;
const HS_TOP_Y = NUT_Y + NUT_H; // 86 — where headstock begins

// Headstock body (straight parallel sides, like the reference image)
const HS_HALF = 62; // half-width of body = 124 px total

// Shoulder zone: neck (72 px) widens to body (124 px) over SHOULDER_H pixels
const SHOULDER_H = 18;
const SHOULDER_END_Y = HS_TOP_Y + SHOULDER_H; // 104

// Peg positions — three per side, below the shoulder, above the crown
const PEG_Y = [116, 150, 184];
const PEG_SHAFT = 20; // shaft length from body edge to button center
const PEG_BTN_W = 14; // button rounded-rect width  (horizontal axis)
const PEG_BTN_H = 22; // button rounded-rect height (vertical axis)
const PEG_BTN_R = 7;  // corner radius

// String layout inside the neck
const STR_PAD = 9; // inset from neck edge to outermost string
const STR_USABLE = NECK_W - STR_PAD * 2; // 54
const STR_SPACING = STR_USABLE / 5;      // 10.8

// String order on the fretboard (low → high, left → right)
const ALL_STRINGS: StringId[] = ["E2", "A2", "D3", "G3", "B3", "E4"];

// Per-side string↔peg mapping (flipped orientation: nut at top, crown at bottom)
// Left side (top→bottom): E2 closest to nut, D3 furthest
const LEFT_STRINGS: StringId[] = ["E2", "A2", "D3"];
// Right side (top→bottom): E4 closest to nut, G3 furthest
const RIGHT_STRINGS: StringId[] = ["E4", "B3", "G3"];

// ─── Component ────────────────────────────────────────────────────────────────
export interface GuitarHeadProps {
  width: number;
  completedStrings: StringId[];
}

export const GuitarHead = memo(function GuitarHead({
  width,
  completedStrings,
}: GuitarHeadProps) {
  const cx = width / 2;

  // x position of each of the 6 strings on the neck
  const strX = useMemo(
    () => ALL_STRINGS.map((_, i) => cx - NECK_HALF + STR_PAD + i * STR_SPACING),
    [cx]
  );

  // Fixed left / right body edges (parallel sides → same x for all pegs)
  const leftEdgeX = cx - HS_HALF;
  const rightEdgeX = cx + HS_HALF;

  // ── Headstock silhouette path ──────────────────────────────────────────────
  //
  // Orientation: nut at top (y = HS_TOP_Y), crown at bottom (clips off canvas).
  // Shape mirrors a Gibson-style acoustic headstock:
  //   • Smooth shoulder curves where the neck meets the wider body
  //   • Straight parallel sides
  //   • Rounded crown that partially peeks at the canvas bottom
  //
  const headstockPath = useMemo(() => {
    const p = Skia.Path.Make();

    // ── top-left (nut corner) ──
    p.moveTo(cx - NECK_HALF, HS_TOP_Y);

    // Left shoulder: curves outward from neck width to body width
    p.cubicTo(
      cx - NECK_HALF, HS_TOP_Y + SHOULDER_H * 0.55,   // ctrl 1 — stay narrow a bit
      cx - HS_HALF,   HS_TOP_Y + SHOULDER_H * 0.45,   // ctrl 2 — arrive wide early
      cx - HS_HALF,   SHOULDER_END_Y                    // end — body left edge
    );

    // Left body side, going down toward crown
    p.lineTo(cx - HS_HALF, CANVAS_H + 15);

    // Crown: gentle rounded arch, partially visible at bottom of canvas.
    // Uses two cubic segments that arch inward and back out.
    p.cubicTo(
      cx - HS_HALF, CANVAS_H + 55,
      cx - 22,      CANVAS_H + 75,
      cx,           CANVAS_H + 80
    );
    p.cubicTo(
      cx + 22,      CANVAS_H + 75,
      cx + HS_HALF, CANVAS_H + 55,
      cx + HS_HALF, CANVAS_H + 15
    );

    // Right body side, going up toward shoulder
    p.lineTo(cx + HS_HALF, SHOULDER_END_Y);

    // Right shoulder: mirror of left
    p.cubicTo(
      cx + HS_HALF,   HS_TOP_Y + SHOULDER_H * 0.45,
      cx + NECK_HALF, HS_TOP_Y + SHOULDER_H * 0.55,
      cx + NECK_HALF, HS_TOP_Y
    );

    p.close();
    return p;
  }, [cx]);

  // ── String paths on the neck ──────────────────────────────────────────────
  const neckStrPaths = useMemo(
    () =>
      strX.map((sx) => {
        const p = Skia.Path.Make();
        p.moveTo(sx, 0);
        p.lineTo(sx, NUT_Y);
        return p;
      }),
    [strX]
  );

  // ── String paths across the headstock face (nut → capstan post) ───────────
  const hsStrPaths = useMemo(
    () => [
      ...LEFT_STRINGS.map((sid, i) => {
        const p = Skia.Path.Make();
        p.moveTo(strX[ALL_STRINGS.indexOf(sid)], HS_TOP_Y);
        p.lineTo(leftEdgeX, PEG_Y[i]);
        return { path: p, key: `L${i}` };
      }),
      ...RIGHT_STRINGS.map((sid, i) => {
        const p = Skia.Path.Make();
        p.moveTo(strX[ALL_STRINGS.indexOf(sid)], HS_TOP_Y);
        p.lineTo(rightEdgeX, PEG_Y[i]);
        return { path: p, key: `R${i}` };
      }),
    ],
    [strX, leftEdgeX, rightEdgeX]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Canvas style={{ width, height: CANVAS_H }}>

      {/* Fretboard */}
      <Rect x={cx - NECK_HALF} y={0} width={NECK_W} height={NUT_Y} color="#1E1E1E" />

      {/* Fret bars (2 frets visible above the nut) */}
      <Rect x={cx - NECK_HALF} y={20} width={NECK_W} height={2.5} color="#363636" />
      <Rect x={cx - NECK_HALF} y={48} width={NECK_W} height={2.5} color="#363636" />

      {/* Neck strings */}
      {neckStrPaths.map((p, i) => (
        <Path key={i} path={p} color="#2E2E2E" strokeWidth={1} style="stroke" />
      ))}

      {/* Nut */}
      <Rect x={cx - NECK_HALF} y={NUT_Y} width={NECK_W} height={NUT_H} color="#454040" />

      {/* Headstock fill */}
      <Path path={headstockPath} color="#191919" />

      {/* Headstock edge highlight */}
      <Path path={headstockPath} color="#2C2C2C" strokeWidth={1.5} style="stroke" />

      {/* Headstock strings (fan from nut to capstan posts) */}
      {hsStrPaths.map(({ path, key }) => (
        <Path key={key} path={path} color="#2C2C2C" strokeWidth={1} style="stroke" />
      ))}

      {/* ── Left tuning pegs ── */}
      {LEFT_STRINGS.map((sid, i) => {
        const done = completedStrings.includes(sid);
        const pegX = leftEdgeX;
        const pegY = PEG_Y[i];
        // Button center is to the LEFT of the body edge
        const btnCX = pegX - PEG_SHAFT;
        const knobColor = done ? "#00C951" : "#383838";
        const dotColor  = done ? "#6EF59E" : "#4A4A4A";

        return (
          <Group key={`pL${i}`}>
            {/* Shaft connecting body edge to button */}
            <Rect
              x={btnCX + PEG_BTN_W / 2}
              y={pegY - 1.5}
              width={pegX - (btnCX + PEG_BTN_W / 2)}
              height={3}
              color="#202020"
            />
            {/* Capstan post (visible on headstock face) */}
            <Circle cx={pegX} cy={pegY} r={5} color="#111111" />
            <Circle cx={pegX} cy={pegY} r={2.5} color="#252525" />
            {/* Tuning button (barrel shape, viewed from front) */}
            <RoundedRect
              x={btnCX - PEG_BTN_W / 2}
              y={pegY - PEG_BTN_H / 2}
              width={PEG_BTN_W}
              height={PEG_BTN_H}
              r={PEG_BTN_R}
              color={knobColor}
            />
            {/* Button center detail */}
            <Circle cx={btnCX} cy={pegY} r={3} color={dotColor} />
          </Group>
        );
      })}

      {/* ── Right tuning pegs ── */}
      {RIGHT_STRINGS.map((sid, i) => {
        const done = completedStrings.includes(sid);
        const pegX = rightEdgeX;
        const pegY = PEG_Y[i];
        // Button center is to the RIGHT of the body edge
        const btnCX = pegX + PEG_SHAFT;
        const knobColor = done ? "#00C951" : "#383838";
        const dotColor  = done ? "#6EF59E" : "#4A4A4A";

        return (
          <Group key={`pR${i}`}>
            {/* Shaft */}
            <Rect
              x={pegX}
              y={pegY - 1.5}
              width={btnCX - PEG_BTN_W / 2 - pegX}
              height={3}
              color="#202020"
            />
            {/* Capstan post */}
            <Circle cx={pegX} cy={pegY} r={5} color="#111111" />
            <Circle cx={pegX} cy={pegY} r={2.5} color="#252525" />
            {/* Tuning button */}
            <RoundedRect
              x={btnCX - PEG_BTN_W / 2}
              y={pegY - PEG_BTN_H / 2}
              width={PEG_BTN_W}
              height={PEG_BTN_H}
              r={PEG_BTN_R}
              color={knobColor}
            />
            {/* Button center detail */}
            <Circle cx={btnCX} cy={pegY} r={3} color={dotColor} />
          </Group>
        );
      })}
    </Canvas>
  );
});
