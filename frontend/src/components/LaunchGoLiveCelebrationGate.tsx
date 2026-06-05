import { useEffect, useMemo, useState } from "react";
import { computeLaunchRemaining } from "../constants/launchSchedule";
import {
  isLaunchGoLiveCelebrationSeen,
  markLaunchGoLiveCelebrationSeen,
} from "../utils/launchGoLiveCelebration";
import LaunchGoLiveCelebration from "./LaunchGoLiveCelebration";

type Props = {
  /** When false, the gate does not evaluate or show the celebration. */
  enabled?: boolean;
};

export default function LaunchGoLiveCelebrationGate({ enabled = true }: Props) {
  const [tick, setTick] = useState(0);
  const [visible, setVisible] = useState(false);
  const [evaluated, setEvaluated] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const launch = useMemo(() => computeLaunchRemaining(), [tick]);

  useEffect(() => {
    if (!enabled) return;
    if (!launch.live) {
      setEvaluated(false);
      return;
    }
    if (evaluated) return;
    setEvaluated(true);
    if (!isLaunchGoLiveCelebrationSeen()) {
      setVisible(true);
    }
  }, [enabled, launch.live, evaluated]);

  const onClose = () => {
    markLaunchGoLiveCelebrationSeen();
    setVisible(false);
  };

  if (!visible) return null;
  return <LaunchGoLiveCelebration onClose={onClose} />;
}
