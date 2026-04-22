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

const CANVAS_H = 200;
const NECK_W = 68;
const NUT_Y = 70;
const NUT_H = 12;
const HS_TOP_Y = NUT_Y + NUT_H; // 82
const HS_BOT_Y = 280; // extends beyond canvas — clips at CANVAS_H
const HS_TOP_HALF = NECK_W / 2; // 34
const HS_BOT_HALF = 82;
const HS_TOTAL_H = HS_BOT_Y - HS_TOP_Y; // 198

const STR_PAD = 8;
const STR_USABLE = NECK_W - STR_PAD * 2; // 52
const STR_SPACING = STR_USABLE / 5; // 10.4

const PEG_Y = [105, 140, 175];
const PEG_SHAFT = 22;

const ALL_STRINGS: StringId[] = ["E2", "A2", "D3", "G3", "B3", "E4"];
const LEFT_STRINGS: StringId[] = ["E2", "A2", "D3"];
const RIGHT_STRINGS: StringId[] = ["G3", "B3", "E4"];

export interface GuitarHeadProps {
  width: number;
  completedStrings: StringId[];
}

export const GuitarHead = memo(function GuitarHead({
  width,
  completedStrings,
}: GuitarHeadProps) {
  const cx = width / 2;

  const strX = useMemo(
    () => ALL_STRINGS.map((_, i) => cx - NECK_W / 2 + STR_PAD + i * STR_SPACING),
    [cx]
  );

  const pegPos = useMemo(
    () =>
      PEG_Y.map((y) => {
        const t = (y - HS_TOP_Y) / HS_TOTAL_H;
        return {
          y,
          leftX: cx - HS_TOP_HALF - t * (HS_BOT_HALF - HS_TOP_HALF),
          rightX: cx + HS_TOP_HALF + t * (HS_BOT_HALF - HS_TOP_HALF),
        };
      }),
    [cx]
  );

  const headstockPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(cx - HS_TOP_HALF, HS_TOP_Y);
    p.lineTo(cx - HS_BOT_HALF, HS_BOT_Y);
    p.lineTo(cx + HS_BOT_HALF, HS_BOT_Y);
    p.lineTo(cx + HS_TOP_HALF, HS_TOP_Y);
    p.close();
    return p;
  }, [cx]);

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

  const hsStrPaths = useMemo(
    () => [
      ...LEFT_STRINGS.map((sid, i) => {
        const p = Skia.Path.Make();
        p.moveTo(strX[ALL_STRINGS.indexOf(sid)], HS_TOP_Y);
        p.lineTo(pegPos[i].leftX, pegPos[i].y);
        return { path: p, key: `L${i}` };
      }),
      ...RIGHT_STRINGS.map((sid, i) => {
        const p = Skia.Path.Make();
        p.moveTo(strX[ALL_STRINGS.indexOf(sid)], HS_TOP_Y);
        p.lineTo(pegPos[i].rightX, pegPos[i].y);
        return { path: p, key: `R${i}` };
      }),
    ],
    [strX, pegPos]
  );

  return (
    <Canvas style={{ width, height: CANVAS_H }}>
      {/* Fretboard */}
      <Rect x={cx - NECK_W / 2} y={0} width={NECK_W} height={NUT_Y} color="#212121" />
      {/* Fret bars */}
      <Rect x={cx - NECK_W / 2} y={22} width={NECK_W} height={3} color="#3A3A3A" />
      <Rect x={cx - NECK_W / 2} y={50} width={NECK_W} height={3} color="#3A3A3A" />
      {/* Neck strings */}
      {neckStrPaths.map((p, i) => (
        <Path key={i} path={p} color="#323232" strokeWidth={0.8} style="stroke" />
      ))}
      {/* Nut */}
      <Rect x={cx - NECK_W / 2} y={NUT_Y} width={NECK_W} height={NUT_H} color="#484040" />
      {/* Headstock fill */}
      <Path path={headstockPath} color="#1A1A1A" />
      {/* Headstock outline */}
      <Path path={headstockPath} color="#282828" strokeWidth={1} style="stroke" />
      {/* Headstock strings */}
      {hsStrPaths.map(({ path, key }) => (
        <Path key={key} path={path} color="#323232" strokeWidth={0.8} style="stroke" />
      ))}
      {/* Left tuning pegs */}
      {LEFT_STRINGS.map((sid, i) => {
        const done = completedStrings.includes(sid);
        const { leftX, y } = pegPos[i];
        const btnX = leftX - PEG_SHAFT;
        return (
          <Group key={`pL${i}`}>
            <RoundedRect x={btnX} y={y - 2.5} width={PEG_SHAFT} height={5} r={2} color="#232323" />
            <Circle cx={leftX} cy={y} r={4} color="#111111" />
            <Circle cx={btnX} cy={y} r={9} color={done ? "#00C951" : "#3A3A3A"} />
            <Circle cx={btnX} cy={y} r={2.5} color={done ? "#6EF59E" : "#505050"} />
          </Group>
        );
      })}
      {/* Right tuning pegs */}
      {RIGHT_STRINGS.map((sid, i) => {
        const done = completedStrings.includes(sid);
        const { rightX, y } = pegPos[i];
        const btnX = rightX + PEG_SHAFT;
        return (
          <Group key={`pR${i}`}>
            <RoundedRect x={rightX} y={y - 2.5} width={PEG_SHAFT} height={5} r={2} color="#232323" />
            <Circle cx={rightX} cy={y} r={4} color="#111111" />
            <Circle cx={btnX} cy={y} r={9} color={done ? "#00C951" : "#3A3A3A"} />
            <Circle cx={btnX} cy={y} r={2.5} color={done ? "#6EF59E" : "#505050"} />
          </Group>
        );
      })}
    </Canvas>
  );
});
