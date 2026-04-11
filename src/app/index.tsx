import { StatusBar } from "expo-status-bar";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  STANDARD_TUNING,
  TARGET_LABELS,
} from "@/features/tuner/constants";
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

function getMeterColor(snapshot: ReturnType<typeof useTuner>["snapshot"]) {
  if (snapshot.isStableInTune || snapshot.isInTune) {
    return "#6BEA9A";
  }

  if (snapshot.centsToTarget === null) {
    return "#F2EEE7";
  }

  return snapshot.centsToTarget < 0 ? "#F2BB63" : "#F07D67";
}

function formatFrequency(value: number | null) {
  return value === null ? "--.--" : value.toFixed(2);
}

export default function Index() {
  const { snapshot, selectString } = useTuner();
  const meterOffset = snapshot.centsToTarget ?? 0;
  const meterPosition = `${50 + meterOffset}%` as const;
  const targetLabel = snapshot.selectedString
    ? TARGET_LABELS[snapshot.selectedString]
    : "Standard tuning";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.screen}>
        <View style={styles.backgroundOrbTop} />
        <View style={styles.backgroundOrbBottom} />

        <View style={styles.header}>
          <Text style={styles.eyebrow}>GUITAR TUNER</Text>
          <Text style={styles.title}>Tune one string at a time.</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusChip}>{getStatusText(snapshot.status)}</Text>
            <Text style={styles.statusHint}>
              {snapshot.completedStrings.length}/6 completed
            </Text>
          </View>
        </View>

        <View style={styles.readoutCard}>
          <Text style={styles.targetLabel}>{targetLabel}</Text>
          <Text style={styles.noteLabel}>
            {snapshot.detectedNote ?? snapshot.selectedString ?? "--"}
          </Text>
          <Text style={styles.frequencyLabel}>
            {formatFrequency(snapshot.detectedFrequency)} Hz
          </Text>

          <View style={styles.meterWrap}>
            <View style={styles.meterLabels}>
              <Text style={styles.meterLabel}>-50</Text>
              <Text style={styles.meterCenterLabel}>0</Text>
              <Text style={styles.meterLabel}>+50</Text>
            </View>
            <View style={styles.meterTrack}>
              <View style={styles.meterCenterLine} />
              <View style={styles.inTuneZone} />
              <View
                style={[
                  styles.needle,
                  {
                    backgroundColor: getMeterColor(snapshot),
                    left: meterPosition,
                  },
                ]}
              />
            </View>
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
              <Text style={styles.secondaryLabel}>Offset</Text>
              <Text style={styles.secondaryValue}>
                {snapshot.centsToTarget === null
                  ? "--"
                  : `${Math.round(snapshot.centsToTarget)} cents`}
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

        <View style={styles.buttonsBlock}>
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
    paddingHorizontal: 20,
    paddingBottom: 20,
    justifyContent: "space-between",
    backgroundColor: "#171411",
  },
  backgroundOrbTop: {
    position: "absolute",
    top: -120,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(112, 67, 34, 0.24)",
  },
  backgroundOrbBottom: {
    position: "absolute",
    bottom: -90,
    left: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(26, 109, 84, 0.18)",
  },
  header: {
    paddingTop: 12,
    gap: 10,
  },
  eyebrow: {
    color: "#B6AA9B",
    fontSize: 12,
    letterSpacing: 2.4,
    fontWeight: "700",
  },
  title: {
    color: "#F4EFE6",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
    maxWidth: 300,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statusChip: {
    color: "#F4EFE6",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 13,
    fontWeight: "600",
  },
  statusHint: {
    color: "#D2C7BA",
    fontSize: 14,
  },
  readoutCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 14,
  },
  targetLabel: {
    color: "#C7B9A9",
    fontSize: 14,
    letterSpacing: 0.4,
  },
  noteLabel: {
    color: "#F7F3EB",
    fontSize: 82,
    lineHeight: 88,
    fontWeight: "700",
    letterSpacing: -2,
  },
  frequencyLabel: {
    color: "#E1D7CB",
    fontSize: 18,
    fontVariant: ["tabular-nums"],
  },
  meterWrap: {
    gap: 10,
    paddingTop: 6,
  },
  meterLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  meterLabel: {
    color: "#A89988",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  meterCenterLabel: {
    color: "#E8E0D4",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  meterTrack: {
    position: "relative",
    height: 18,
    borderRadius: 999,
    backgroundColor: "#241F1A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  inTuneZone: {
    position: "absolute",
    left: "45%",
    width: "10%",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(107, 234, 154, 0.22)",
  },
  meterCenterLine: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  needle: {
    position: "absolute",
    top: 1,
    bottom: 1,
    width: 4,
    marginLeft: -2,
    borderRadius: 999,
  },
  guidance: {
    color: "#F4EFE6",
    fontSize: 16,
    lineHeight: 22,
    minHeight: 44,
  },
  guidanceSuccess: {
    color: "#7BF0A6",
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryItem: {
    flex: 1,
    backgroundColor: "#1C1815",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  secondaryLabel: {
    color: "#9E9386",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  secondaryValue: {
    color: "#F4EFE6",
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  buttonsBlock: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  stringButton: {
    width: "48%",
    minHeight: 92,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#1B1814",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "space-between",
  },
  stringButtonSelected: {
    backgroundColor: "#262018",
    borderColor: "#F2BB63",
  },
  stringButtonCompleted: {
    backgroundColor: "#183126",
    borderColor: "#6BEA9A",
  },
  stringButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  stringButtonId: {
    color: "#F8F2E9",
    fontSize: 24,
    fontWeight: "700",
  },
  stringButtonLabel: {
    color: "#D7CCBF",
    fontSize: 14,
  },
  stringButtonFrequency: {
    color: "#A99E91",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
});
