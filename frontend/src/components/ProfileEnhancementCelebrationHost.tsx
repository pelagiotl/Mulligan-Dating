import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PROFILE_ENHANCEMENT_REFRESH_EVENT } from "../constants/profileEnhancementEvents";
import { useAuth } from "../context/AuthContext";
import {
  clearProfileEnhancementCelebrationShown,
  isProfileEnhancementCelebrationShown,
  markProfileEnhancementCelebrationShown,
  profileEnhancementIsComplete,
} from "../utils/profileEnhancementChecklist";
import { fetchProfileEnhancementSnapshot } from "../utils/fetchProfileEnhancementSnapshot";
import BetterMatchesCompleteCelebration from "./BetterMatchesCompleteCelebration";

/**
 * Shows Better matches "You're all set" when checklist completes — on Profile or Connect,
 * not only after opening the Connect tab.
 */
export default function ProfileEnhancementCelebrationHost() {
  const navigate = useNavigate();
  const { user, photoCount, connectSetupComplete, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);

  const evaluateCelebration = useCallback(async () => {
    if (!user || !connectSetupComplete || authLoading) return;

    const snapshot = await fetchProfileEnhancementSnapshot(photoCount ?? 0);
    if (!profileEnhancementIsComplete(snapshot)) {
      clearProfileEnhancementCelebrationShown();
      setOpen(false);
      return;
    }
    if (!isProfileEnhancementCelebrationShown()) {
      setOpen(true);
    }
  }, [user, connectSetupComplete, authLoading, photoCount]);

  useEffect(() => {
    void evaluateCelebration();
  }, [evaluateCelebration]);

  useEffect(() => {
    const onRefresh = () => void evaluateCelebration();
    window.addEventListener(PROFILE_ENHANCEMENT_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(PROFILE_ENHANCEMENT_REFRESH_EVENT, onRefresh);
  }, [evaluateCelebration]);

  const handleClose = useCallback(() => {
    markProfileEnhancementCelebrationShown();
    setOpen(false);
    navigate("/browse");
  }, [navigate]);

  if (!user || !connectSetupComplete) return null;

  return <BetterMatchesCompleteCelebration open={open} onClose={handleClose} />;
}
