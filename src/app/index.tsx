import { memo } from "react";
import { StatusBar } from "expo-status-bar";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { STANDARD_TUNING } from "@/features/tuner/constants";
import { PitchDial } from "@/features/tuner/components/PitchDial";
import { useTuner } from "@/features/tuner/useTuner";
import { StringId } from "@/features/tuner/types";

function formatSignedCents(value: number | null, hasTarget: boolean) {
  if (!hasTarget || value === null) {
    return "--";
  }

  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

export default function Index() {
  const { snapshot, selectString } = useTuner();
  const { width } = useWindowDimensions();
  const dialWidth = Math.min(width - 32, 440);
  const dialHeight = Math.min(250, dialWidth * 0.58);
  const centsValue = formatSignedCents(
    snapshot.displayCents,
    Boolean(snapshot.selectedString)
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.screen}>
        <View style={styles.stack}>
          <Text style={styles.centsReadout}>{centsValue}</Text>
          <Text style={styles.centsSuffix}>cents</Text>
          <Text style={styles.selectedString}>
            {snapshot.selectedString ?? "Select a string"}
          </Text>

          <View style={styles.dialWrap}>
            <PitchDial
              width={dialWidth}
              height={dialHeight}
              displayCents={
                snapshot.selectedString ? snapshot.displayCents : null
              }
              signalState={snapshot.signalState}
              isInTune={snapshot.isInTune}
              isStableInTune={snapshot.isStableInTune}
            />
          </View>
        </View>

        <CompactStringSelector
          completedStrings={snapshot.completedStrings}
          selectedString={snapshot.selectedString}
          onSelect={selectString}
        />
      </View>
    </SafeAreaView>
  );
}

const CompactStringSelector = memo(function CompactStringSelector({
  selectedString,
  completedStrings,
  onSelect,
}: {
  selectedString: StringId | null;
  completedStrings: StringId[];
  onSelect: (stringId: StringId) => Promise<void>;
}) {
  return (
    <View style={styles.selectorRow}>
      {STANDARD_TUNING.map((item) => (
        <StringButton
          key={item.id}
          id={item.id}
          isSelected={selectedString === item.id}
          isCompleted={completedStrings.includes(item.id)}
          onPress={onSelect}
        />
      ))}
    </View>
  );
});

const StringButton = memo(function StringButton({
  id,
  isSelected,
  isCompleted,
  onPress,
}: {
  id: StringId;
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
        !isSelected && isCompleted && styles.stringButtonCompleted,
        pressed && styles.stringButtonPressed,
      ]}
    >
      <Text
        style={[
          styles.stringButtonText,
          isSelected && styles.stringButtonTextSelected,
        ]}
      >
        {id}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0A0E10",
  },
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    justifyContent: "space-between",
    backgroundColor: "#0A0E10",
  },
  stack: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  centsReadout: {
    color: "#F7F8FA",
    fontSize: 92,
    lineHeight: 96,
    fontWeight: "700",
    letterSpacing: -4,
    fontVariant: ["tabular-nums"],
  },
  centsSuffix: {
    color: "rgba(247, 248, 250, 0.42)",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: -6,
  },
  selectedString: {
    marginTop: 14,
    color: "rgba(247, 248, 250, 0.9)",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  dialWrap: {
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 8,
  },
  stringButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  stringButtonSelected: {
    backgroundColor: "rgba(255, 155, 46, 0.18)",
  },
  stringButtonCompleted: {
    backgroundColor: "rgba(107, 234, 154, 0.1)",
  },
  stringButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  stringButtonText: {
    color: "rgba(247, 248, 250, 0.72)",
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  stringButtonTextSelected: {
    color: "#FFF1E0",
  },
});
