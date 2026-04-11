import { StatusBar } from "expo-status-bar";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  STANDARD_TUNING,
  TARGET_LABELS,
} from "@/features/tuner/constants";
import { PitchDial } from "@/features/tuner/components/PitchDial";
import { useTuner } from "@/features/tuner/useTuner";
import { StringId } from "@/features/tuner/types";

function getStatusText(status: ReturnType<typeof useTuner>["snapshot"]["status"]) {
  switch (status) {
    case "requesting-permission":
      return "Requesting microphone access";
    case "listening":
      return "Listening";
    case "permission-denied":
      return "Microphone blocked";
    case "error":
      return "Tuner unavailable";
    default:
      return "Ready";
  }
}

function getGuidanceText(snapshot: ReturnType<typeof useTuner>["snapshot"]) {
  if (snapshot.errorMessage) {
    return snapshot.errorMessage;
  }

  if (!snapshot.selectedString) {
    return "Choose a string to start tuning.";
  }

  if (!snapshot.detectedFrequency || snapshot.centsToTarget === null) {
    return `Play the ${TARGET_LABELS[snapshot.selectedString]} string.`;
  }

  if (snapshot.isStableInTune) {
    return `${TARGET_LABELS[snapshot.selectedString]} is locked in. Choose the next string when you're ready.`;
  }

  if (snapshot.isInTune) {
    return "In tune. Hold it steady.";
  }

  if (snapshot.detectedNote && snapshot.detectedNote !== snapshot.selectedString) {
    return `Detected ${snapshot.detectedNote}, target ${snapshot.selectedString}.`;
  }

  const cents = Math.round(Math.abs(snapshot.centsToTarget));
  if (snapshot.centsToTarget < 0) {
    return `Too flat by ${cents} cents.`;
  }

  return `Too sharp by ${cents} cents.`;
}

function formatSignedCents(value: number | null, hasTarget: boolean) {
  if (!hasTarget) {
    return "--";
  }

  if (value === null) {
    return "0";
  }

  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function formatFrequency(value: number | null) {
  return value === null ? "--.--" : value.toFixed(2);
}

export default function Index() {
  const { snapshot, selectString } = useTuner();
  const { width } = useWindowDimensions();
  const dialWidth = Math.min(width - 32, 460);
  const dialHeight = Math.min(360, dialWidth * 0.76);
  const targetLabel = snapshot.selectedString
    ? TARGET_LABELS[snapshot.selectedString]
    : "Standard tuning";
  const centsValue = formatSignedCents(
    snapshot.displayCents,
    Boolean(snapshot.selectedString)
  );
  const liveLabel = snapshot.selectedString
    ? snapshot.selectedString
    : "Select a string";
  const nearestNote =
    snapshot.nearestNote && snapshot.nearestNote !== snapshot.selectedString
      ? snapshot.nearestNote
      : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.screen}>
        <View style={styles.backgroundOrbTop} />
        <View style={styles.backgroundOrbBottom} />

        <View style={styles.header}>
          <Text style={styles.eyebrow}>GUITAR TUNER</Text>
          <Text style={styles.title}>Dial into pitch in real time.</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusChip}>{getStatusText(snapshot.status)}</Text>
            <Text style={styles.statusHint}>
              {snapshot.completedStrings.length}/6 completed
            </Text>
          </View>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.centsReadout}>{centsValue}</Text>
          <Text style={styles.centsSuffix}>cents</Text>
          <Text style={styles.liveLabel}>{liveLabel}</Text>
          <Text style={styles.liveMeta}>
            {nearestNote
              ? `Hearing ${nearestNote} against ${snapshot.selectedString}`
              : targetLabel}
          </Text>

          <View style={styles.dialWrap}>
            {PitchDial ? (
              <PitchDial
                width={dialWidth}
                height={dialHeight}
                displayCents={snapshot.displayCents}
                pitchHistory={snapshot.pitchHistory}
                signalState={snapshot.signalState}
                isInTune={snapshot.isInTune}
                isStableInTune={snapshot.isStableInTune}
                confidence={snapshot.confidence}
              />
            ) : (
              <View style={[styles.dialFallback, { width: dialWidth, height: dialHeight }]}>
                <Text style={styles.dialFallbackText}>
                  Native Skia dial is available in iOS and Android dev builds.
                </Text>
              </View>
            )}
          </View>

          <Text
            style={[
              styles.guidance,
              snapshot.isStableInTune && styles.guidanceSuccess,
            ]}
          >
            {getGuidanceText(snapshot)}
          </Text>

          <View style={styles.secondaryRow}>
            <View style={styles.secondaryItem}>
              <Text style={styles.secondaryLabel}>Target</Text>
              <Text style={styles.secondaryValue}>
                {snapshot.targetFrequency?.toFixed(2) ?? "--.--"} Hz
              </Text>
            </View>
            <View style={styles.secondaryItem}>
              <Text style={styles.secondaryLabel}>Live</Text>
              <Text style={styles.secondaryValue}>
                {formatFrequency(snapshot.detectedFrequency)} Hz
              </Text>
            </View>
            <View style={styles.secondaryItem}>
              <Text style={styles.secondaryLabel}>Confidence</Text>
              <Text style={styles.secondaryValue}>
                {Math.round(snapshot.confidence * 100)}%
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.selectorBlock}>
          <View style={styles.selectorHeader}>
            <Text style={styles.selectorTitle}>Strings</Text>
            <Text style={styles.selectorSubtitle}>Tap to tune</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectorScrollContent}
          >
          {STANDARD_TUNING.map((item) => {
            const isSelected = snapshot.selectedString === item.id;
            const isCompleted = snapshot.completedStrings.includes(item.id);

            return (
              <StringButton
                key={item.id}
                id={item.id}
                label={item.label}
                frequency={item.frequency}
                isSelected={isSelected}
                isCompleted={isCompleted}
                onPress={selectString}
              />
            );
          })}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

function StringButton({
  id,
  label,
  frequency,
  isSelected,
  isCompleted,
  onPress,
}: {
  id: StringId;
  label: string;
  frequency: number;
  isSelected: boolean;
  isCompleted: boolean;
  onPress: (stringId: StringId) => Promise<void>;
}) {
  return (
    <Pressable
      onPress={() => {
        void onPress(id);
      }}
      style={({ pressed }) => [
        styles.stringButton,
        isSelected && styles.stringButtonSelected,
        isCompleted && styles.stringButtonCompleted,
        pressed && styles.stringButtonPressed,
      ]}
    >
      <Text style={styles.stringButtonId}>{id}</Text>
      <Text style={styles.stringButtonLabel}>{label}</Text>
      <Text style={styles.stringButtonFrequency}>{frequency.toFixed(2)} Hz</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#171411",
  },
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    justifyContent: "space-between",
    backgroundColor: "#08090C",
  },
  backgroundOrbTop: {
    position: "absolute",
    top: -80,
    right: -40,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255, 113, 25, 0.13)",
  },
  backgroundOrbBottom: {
    position: "absolute",
    bottom: -60,
    left: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(35, 165, 117, 0.12)",
  },
  header: {
    paddingTop: 12,
    gap: 8,
  },
  eyebrow: {
    color: "#9C9EA9",
    fontSize: 12,
    letterSpacing: 2.4,
    fontWeight: "700",
  },
  title: {
    color: "#F7F7F9",
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "700",
    maxWidth: 320,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statusChip: {
    color: "#F4F4F7",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 13,
    fontWeight: "600",
  },
  statusHint: {
    color: "#B0B4C0",
    fontSize: 14,
  },
  heroBlock: {
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
  },
  centsReadout: {
    color: "#F7F7FA",
    fontSize: 72,
    lineHeight: 76,
    fontWeight: "700",
    letterSpacing: -3,
    fontVariant: ["tabular-nums"],
  },
  centsSuffix: {
    marginTop: -10,
    color: "#8B8F9B",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 2.2,
  },
  liveLabel: {
    color: "#F4F4F7",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  liveMeta: {
    color: "#9EA5B4",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  dialWrap: {
    marginTop: 8,
  },
  dialFallback: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  dialFallbackText: {
    maxWidth: 220,
    textAlign: "center",
    color: "#9EA5B4",
    lineHeight: 22,
  },
  guidance: {
    color: "#E8EAF0",
    fontSize: 16,
    lineHeight: 22,
    minHeight: 44,
    textAlign: "center",
    maxWidth: 340,
  },
  guidanceSuccess: {
    color: "#7BF0A6",
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryItem: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  secondaryLabel: {
    color: "#8F97A6",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  secondaryValue: {
    color: "#F5F6F8",
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  selectorBlock: {
    gap: 12,
    paddingTop: 8,
  },
  selectorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorTitle: {
    color: "#F5F6F8",
    fontSize: 16,
    fontWeight: "700",
  },
  selectorSubtitle: {
    color: "#8E96A4",
    fontSize: 13,
  },
  selectorScrollContent: {
    gap: 10,
    paddingRight: 16,
  },
  stringButton: {
    width: 92,
    minHeight: 88,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "space-between",
  },
  stringButtonSelected: {
    backgroundColor: "rgba(255, 144, 41, 0.14)",
    borderColor: "#FF9B2E",
  },
  stringButtonCompleted: {
    backgroundColor: "rgba(61, 191, 121, 0.18)",
    borderColor: "#6BEA9A",
  },
  stringButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.96 }],
  },
  stringButtonId: {
    color: "#FAFBFC",
    fontSize: 22,
    fontWeight: "700",
  },
  stringButtonLabel: {
    color: "#CFD4DE",
    fontSize: 13,
  },
  stringButtonFrequency: {
    color: "#8F98A8",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
});
