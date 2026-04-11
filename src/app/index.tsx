import { StatusBar } from "expo-status-bar";
import { memo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { PitchDial } from "@/features/tuner/components/PitchDial";
import { STANDARD_TUNING } from "@/features/tuner/constants";
import { StringId } from "@/features/tuner/types";
import { useTuner } from "@/features/tuner/useTuner";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
    <View style={[styles.screen]}>
      <StatusBar style="light" />

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
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.selectorRow, { paddingBottom: insets.bottom + 16 }]}>
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
      <View style={styles.stringIndicator} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "space-between",
  },
  stack: {
    flex: 1,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    boxShadow: " 0px -4px 2px -1px rgba(155, 155, 155, 0.07) inset, 0px 0px 4px 4px rgba( 0, 0, 0,0.1) ",
    experimental_backgroundImage: "linear-gradient(180deg, #171717, #0A0A0A, #0A0A0A)",
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
    experimental_backgroundImage: "linear-gradient(180deg, #171717, #0A0A0A)",
    gap: 8,
    paddingTop: 48,
    marginTop: -32,
    zIndex: -1,
    paddingHorizontal: 32,
  },
  stringButton: {
    flex: 1,
    flexDirection: "column",
    gap: 6,
    padding: 12,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 0px 0px 1.5px rgba(7, 7, 7, 1), 0px 2.5px 4px -2.5px rgba(155, 155, 155, 0.3) inset, 0px -2.5px 4px -2.5px rgba(7, 7, 7, 1) inset",
    backgroundColor: "#171717"
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
    color: "#525252",
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },

  stringIndicator: {
    height: 4,
    width: 4,
    backgroundColor: "#00C951",
    borderRadius: 2,
  },
  stringButtonTextSelected: {
    color: "#FFF1E0",
  },
});
