import React, { useEffect, useMemo, useState } from 'react';
import { computeLaunchRemaining } from '../constants/launchSchedule';
import {
  isLaunchGoLiveCelebrationSeen,
  markLaunchGoLiveCelebrationSeen,
} from '../utils/launchGoLiveCelebration';
import LaunchGoLiveCelebration from './LaunchGoLiveCelebration';

type Props = {
  enabled?: boolean;
};

export default function LaunchGoLiveCelebrationGate({ enabled = true }: Props) {
  const [tick, setTick] = useState(0);
  const [visible, setVisible] = useState(false);
  const [evaluated, setEvaluated] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
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
    let cancelled = false;
    void isLaunchGoLiveCelebrationSeen().then((seen) => {
      if (!cancelled && !seen) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, launch.live, evaluated]);

  const onClose = () => {
    void markLaunchGoLiveCelebrationSeen();
    setVisible(false);
  };

  return <LaunchGoLiveCelebration visible={visible} onClose={onClose} />;
};
