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
// Natural viewing orientation: rounded crown at top, nut + fretboard at bottom.
const CANVAS_H = 300;

// Neck / fretboard
const NECK_W = 72;
const NECK_HALF = NECK_W / 2; // 36
const NUT_H = 12;

// Headstock body (straight parallel sides, like the reference image)
const HS_HALF = 62; // half-width of body = 124 px total

// Crown + body vertical layout (top → bottom)
const CROWN_PAD = 10;                    // padding above crown apex
const CROWN_END_Y = 20;                  // where rounded crown meets body
const BODY_END_Y = 196;                  // where straight body starts narrowing
const SHOULDER_H = 40;
const SHOULDER_END_Y = BODY_END_Y + SHOULDER_H; // 214 — top of nut
const NUT_Y = SHOULDER_END_Y;            // 214
const FRET_TOP_Y = NUT_Y + NUT_H;        // 228 — top of fretboard

// Peg positions — three per side, inside the body span (86 → 196)
const PEG_Y = [50, 110, 170];
const PEG_SHAFT = 20; // shaft length from body edge to button center
const PEG_BTN_W = 18; // button rounded-rect width  (horizontal axis)
const PEG_BTN_H = 26; // button rounded-rect height (vertical axis)
const PEG_BTN_R = 7;  // corner radius

// String layout inside the neck
const STR_PAD = 9; // inset from neck edge to outermost string
const STR_USABLE = NECK_W - STR_PAD * 2; // 54
const STR_SPACING = STR_USABLE / 5;      // 10.8

// String order on the fretboard (high → low, left → right — horizontally mirrored)
const ALL_STRINGS: StringId[] = ["E4", "B3", "G3", "D3", "A2", "E2"];

// Per-side string↔peg mapping (crown at top, nut at bottom).
// PEG_Y index 0 = crown-proximal (top) peg, index 2 = nut-proximal (bottom) peg.
// Both sides follow the same rule so fans mirror across the center:
//   • innermost string of each side → crown-proximal peg (long fan)
//   • outermost string of each side → nut-proximal peg (short fan)
const LEFT_STRINGS: StringId[] = ["G3", "B3", "E4"];   // G3 innermost, E4 outermost
const RIGHT_STRINGS: StringId[] = ["D3", "A2", "E2"];  // D3 innermost, E2 outermost

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
  // Orientation: rounded crown at top (y ≈ CROWN_PAD), nut at bottom (y = NUT_Y).
  // Shape mirrors a Gibson-style acoustic headstock:
  //   • Full rounded crown at top with breathing room above the apex
  //   • Straight parallel body sides
  //   • Smooth shoulder curves where the body narrows into the neck
  //
  const headstockPath = useMemo(() => {
    const p = Skia.Path.Make();

    // Start at top-left of body (where crown meets body), walk clockwise.
    p.moveTo(cx - HS_HALF, CROWN_END_Y);

    // Left body side, going down toward nut
    p.lineTo(cx - HS_HALF, BODY_END_Y);

    // Left shoulder: narrows from body width to neck width
    p.cubicTo(
      cx - HS_HALF, BODY_END_Y + SHOULDER_H * 0.45,
      cx - NECK_HALF, BODY_END_Y + SHOULDER_H * 0.55,
      cx - NECK_HALF, SHOULDER_END_Y
    );

    // Across the top of the nut
    p.lineTo(cx + NECK_HALF, SHOULDER_END_Y);

    // Right shoulder: widens back out to body width (mirror of left)
    p.cubicTo(
      cx + NECK_HALF, BODY_END_Y + SHOULDER_H * 0.55,
      cx + HS_HALF, BODY_END_Y + SHOULDER_H * 0.45,
      cx + HS_HALF, BODY_END_Y
    );

    // Right body side, going up toward crown
    p.lineTo(cx + HS_HALF, CROWN_END_Y);

    // Right half of crown — broad rounded dome rising to just right of center
    p.cubicTo(
      cx + HS_HALF, CROWN_END_Y - 42,
      cx + HS_HALF * 0.55, CROWN_PAD,
      cx + 5, CROWN_PAD
    );

    // Small decorative horn at the center top
    p.cubicTo(
      cx + 5, CROWN_PAD - 2,
      cx + 3, CROWN_PAD - 6,
      cx, CROWN_PAD - 6
    );
    p.cubicTo(
      cx - 3, CROWN_PAD - 6,
      cx - 5, CROWN_PAD - 2,
      cx - 5, CROWN_PAD
    );

    // Left half of crown — mirror back down to start
    p.cubicTo(
      cx - HS_HALF * 0.55, CROWN_PAD,
      cx - HS_HALF, CROWN_END_Y - 42,
      cx - HS_HALF, CROWN_END_Y
    );

    p.close();
    return p;
  }, [cx]);

  // ── String paths on the neck ──────────────────────────────────────────────
  // Fretboard is at the bottom of the canvas; strings run from canvas bottom
  // up to the fretboard-facing edge of the nut.
  const neckStrPaths = useMemo(
    () =>
      strX.map((sx) => {
        const p = Skia.Path.Make();
        p.moveTo(sx, CANVAS_H);
        p.lineTo(sx, FRET_TOP_Y);
        return p;
      }),
    [strX]
  );

  // ── String paths across the headstock face (nut → capstan post) ───────────
  // Strings emerge from the crown-facing edge of the nut and fan out to pegs.
  const hsStrPaths = useMemo(
    () => [
      ...LEFT_STRINGS.map((sid, i) => {
        const p = Skia.Path.Make();
        p.moveTo(strX[ALL_STRINGS.indexOf(sid)], NUT_Y);
        p.lineTo(leftEdgeX, PEG_Y[i]);
        return { path: p, key: `L${i}` };
      }),
      ...RIGHT_STRINGS.map((sid, i) => {
        const p = Skia.Path.Make();
        p.moveTo(strX[ALL_STRINGS.indexOf(sid)], NUT_Y);
        p.lineTo(rightEdgeX, PEG_Y[i]);
        return { path: p, key: `R${i}` };
      }),
    ],
    [strX, leftEdgeX, rightEdgeX]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Canvas style={{ width, height: CANVAS_H }}>

      {/* Headstock fill (drawn first so nut/fretboard sit on top) */}
      <Path path={headstockPath} color="#191919" />

      {/* Fretboard (below the nut, running to canvas bottom) */}
      <Rect
        x={cx - NECK_HALF}
        y={FRET_TOP_Y}
        width={NECK_W}
        height={CANVAS_H - FRET_TOP_Y}
        color="#1E1E1E"
      />

      {/* Fret bars (2 frets visible below the nut) */}
      <Rect x={cx - NECK_HALF} y={FRET_TOP_Y + 20} width={NECK_W} height={2.5} color="#363636" />
      <Rect x={cx - NECK_HALF} y={FRET_TOP_Y + 48} width={NECK_W} height={2.5} color="#363636" />

      {/* Neck strings */}
      {neckStrPaths.map((p, i) => (
        <Path key={i} path={p} color="#2E2E2E" strokeWidth={1} style="stroke" />
      ))}

      {/* Nut */}
      <Rect x={cx - NECK_HALF} y={NUT_Y} width={NECK_W} height={NUT_H} color="#454040" />

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
        const dotColor = done ? "#6EF59E" : "#4A4A4A";

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
        const dotColor = done ? "#6EF59E" : "#4A4A4A";

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
