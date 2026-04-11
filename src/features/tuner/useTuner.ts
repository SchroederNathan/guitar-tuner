import { useEffect, useSyncExternalStore } from "react";

import { tunerEngine } from "@/features/tuner/TunerEngine";

export function useTuner() {
  const snapshot = useSyncExternalStore(
    tunerEngine.subscribe,
    tunerEngine.getSnapshot,
    tunerEngine.getSnapshot
  );

  useEffect(() => {
    return () => {
      void tunerEngine.cleanup();
    };
  }, []);

  return {
    snapshot,
    selectString: tunerEngine.selectString,
  };
}
