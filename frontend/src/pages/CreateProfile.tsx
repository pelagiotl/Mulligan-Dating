import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import {
  compactCityState,
  hasCityAndState,
  handleLocationChange,
  normalizeLocationInput,
} from "../utils/locationUtils";
import { getPhotoUrl } from "../utils/photoUrl";
import { compressImageFiles, uploadCompressedFiles } from "../utils/photoBatchUpload";
import {
  formatProfileActivationGapMessage,
  getProfileActivationGaps,
  type ProfileActivationGap,
} from "../utils/connectProfileEligibility";
import {
  clearWebCreateProfileDraft,
  computeWebCreateProfileResumeStep,
  ensureWebOnboardingDraft,
  ONBOARDING_DEFAULT_MAX_AGE,
  ONBOARDING_DEFAULT_MAX_DISTANCE,
  ONBOARDING_DEFAULT_MIN_AGE,
  readWebCreateProfileDraft,
  resolveOnboardingAge,
  resolveOnboardingGender,
  resolveOnboardingPreferredGenders,
  writeWebCreateProfileDraft,
} from "../utils/createProfileProgress";
import { getCreateProfileSupportMailtoUrl } from "../constants/support";
import { markWebPushPromptAfterProfile } from "../constants/webPushPrompt";

const GENDER_OPTIONS = ["Man", "Woman", "Other"] as const;
const GENDER_OPTION_META: Record<(typeof GENDER_OPTIONS)[number], { emoji: string; label: string }> = {
  Man: { emoji: "👨", label: "Man" },
  Woman: { emoji: "👩", label: "Woman" },
  Other: { emoji: "✨", label: "Other" },
};
const PREFERRED_GENDER_OPTIONS = ["Man", "Woman", "Everyone"] as const;
const PREFERRED_GENDER_LABELS: Record<string, string> = {
  Man: "Men",
  Woman: "Women",
  Everyone: "Everyone",
};
const PREFERRED_GENDER_META: Record<(typeof PREFERRED_GENDER_OPTIONS)[number], { emoji: string }> = {
  Man: { emoji: "👨" },
  Woman: { emoji: "👩" },
  Everyone: { emoji: "🌍" },
};

function preferredGendersPayload(g: string[]): string[] | null {
  if (g.length === 0) return null;
  if (g.includes("Everyone")) return ["Everyone"];
  const only = g.filter((x) => x === "Man" || x === "Woman");
  return only.length > 0 ? only : null;
}

function parsePreferredGendersFromApi(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const genders = JSON.parse(raw) as string[];
    if (!Array.isArray(genders) || genders.length === 0) return [];
    if (genders.includes("Everyone")) return ["Everyone"];
    const legacyAllThree =
      genders.length === 3 && ["Man", "Woman", "Other"].every((g) => genders.includes(g));
    if (legacyAllThree) return [];
    return genders.filter((g) => g === "Man" || g === "Woman");
  } catch {
    return [];
  }
}

function validateMinimalOnboardingProfile(displayName: string, location: string): string | null {
  if (displayName.trim().length < 2) {
    return "Please enter at least 2 characters for your name";
  }
  const loc = normalizeLocationInput(location);
  if (!loc || !hasCityAndState(loc)) {
    return "Please enter both city and state (e.g. Medford, Oregon)";
  }
  return null;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "Too many requests. Please wait a moment and try again.";
    if (err.status === 408) return err.message;
    if (err.status === 401 || err.status === 403) return "Session expired. Please log in again.";
    if (err.message.trim()) return err.message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

async function postProfileWithRetry(body: Record<string, unknown>): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await api.post("/profile", body);
      return;
    } catch (err) {
      lastErr = err;
      const retryable =
        err instanceof ApiError && (err.status >= 500 || err.status === 409 || err.status === 0);
      if (!retryable || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

const INTEREST_OPTIONS = [
  "Travel", "Music", "Sports", "Cooking", "Reading", "Movies", "Fitness", "Art",
  "Photography", "Dancing", "Gaming", "Fortnite", "Hiking", "Yoga", "Writing", "Technology",
  "Fashion", "Animals", "Volunteering", "Coffee", "Nightlife", "Comedy",
  "Beach", "Camping", "Board Games", "Tattoos", "Meditation", "History", "Science",
  "Business", "Education",
];

const INTEREST_EMOJIS: Record<string, string> = {
  Travel: "✈️",
  Music: "🎵",
  Sports: "⚽",
  Cooking: "👨‍🍳",
  Reading: "📚",
  Movies: "🎬",
  Fitness: "💪",
  Art: "🎨",
  Photography: "📸",
  Dancing: "💃",
  Gaming: "🎮",
  Fortnite: "⛏️",
  Hiking: "🥾",
  Yoga: "🧘",
  Writing: "✍️",
  Technology: "💻",
  Fashion: "👗",
  Animals: "🐾",
  Volunteering: "🤝",
  Coffee: "☕",
  Nightlife: "🌃",
  Comedy: "😂",
  Beach: "🏖️",
  Camping: "⛺",
  "Board Games": "🎲",
  Tattoos: "🖋️",
  Meditation: "🧘‍♀️",
  History: "📜",
  Science: "🔬",
  Business: "💼",
  Education: "🎓",
};

const TOTAL_STEPS = 1;
const MAX_PHOTO_SLOTS = 6;

type SlotPhoto = { id: string; url: string };

function PhotoSlotRemoveButton({
  busy,
  onClick,
  disabled,
}: {
  busy: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className="create-profile-photo-remove-btn"
      disabled={disabled}
      onClick={onClick}
      aria-label="Remove photo"
      title="Remove photo"
    >
      {busy ? (
        <span className="create-profile-photo-remove-busy" aria-hidden>
          …
        </span>
      ) : (
        <svg
          className="create-profile-photo-remove-icon"
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2 2l8 8M10 2L2 10"
            stroke="currentColor"
            strokeWidth="1.85"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

function emptyPhotoSlots(): (SlotPhoto | null)[] {
  return Array.from({ length: MAX_PHOTO_SLOTS }, () => null);
}

function countUploadedPhotos(slots: (SlotPhoto | null)[]): number {
  return slots.filter((p): p is SlotPhoto => p != null).length;
}

function photoSlotsFromApi(
  list: Array<{ id: string; url: string; displayOrder?: number }>
): (SlotPhoto | null)[] {
  const next = emptyPhotoSlots();
  const sorted = [...list].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  sorted.forEach((ph) => {
    const byOrder =
      typeof ph.displayOrder === "number" &&
      ph.displayOrder >= 0 &&
      ph.displayOrder < MAX_PHOTO_SLOTS
        ? ph.displayOrder
        : next.findIndex((s) => !s);
    if (byOrder >= 0 && byOrder < MAX_PHOTO_SLOTS) {
      next[byOrder] = { id: ph.id, url: ph.url };
    }
  });
  return next;
}

function buildDisplayOrdersFromSlots(slots: (SlotPhoto | null)[]): Record<string, number> {
  const displayOrders: Record<string, number> = {};
  slots.forEach((p, slotIndex) => {
    if (p) displayOrders[p.id] = slotIndex;
  });
  return displayOrders;
}

function insertPhotosAtTarget(
  slots: (SlotPhoto | null)[],
  targetIndex: number,
  incoming: SlotPhoto[]
): (SlotPhoto | null)[] {
  const next = [...slots];
  let cursor = Math.max(0, Math.min(targetIndex, MAX_PHOTO_SLOTS - 1));
  for (const photo of incoming) {
    while (cursor < MAX_PHOTO_SLOTS && next[cursor] !== null) {
      cursor += 1;
    }
    if (cursor >= MAX_PHOTO_SLOTS) break;
    next[cursor] = photo;
    cursor += 1;
  }
  return next;
}

function movePhotoBetweenSlots(
  slots: (SlotPhoto | null)[],
  sourceSlot: number,
  targetSlot: number
): (SlotPhoto | null)[] {
  if (sourceSlot === targetSlot || sourceSlot < 0 || targetSlot < 0) return slots;
  const next = [...slots];
  const moving = next[sourceSlot];
  if (!moving) return slots;
  const displaced = next[targetSlot];
  next[sourceSlot] = displaced ?? null;
  next[targetSlot] = moving;
  return next;
}

export default function CreateProfile() {
  const navigate = useNavigate();
  const { refreshProfile, logout, markConnectSetupComplete } = useAuth();

  const handleChangePhoneNumber = () => {
    if (
      !window.confirm(
        "You will sign out and return to the phone number screen so you can use a different number. Continue?"
      )
    ) {
      return;
    }
    logout();
    navigate("/login", { replace: true });
  };
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profileReadyForPhotos, setProfileReadyForPhotos] = useState(false);
  const [savingProfileDraft, setSavingProfileDraft] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  /** Serializes profile saves (prevents concurrent POST /profile races on iOS). */
  const profileSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const profileSaveSnapshotRef = useRef<string | null>(null);
  const photoSlotsTouchedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoPickerTargetSlotRef = useRef<number | null>(null);
  const [uploadingSlotIndices, setUploadingSlotIndices] = useState<number[]>([]);
  const uploadingPhotos = uploadingSlotIndices.length > 0;
  const [reorderingPhotos, setReorderingPhotos] = useState(false);
  const [removingPhotoId, setRemovingPhotoId] = useState<string | null>(null);
  const [removeConfirmSlot, setRemoveConfirmSlot] = useState<number | null>(null);
  const [draggingPhotoId, setDraggingPhotoId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [showProfileReadySplash, setShowProfileReadySplash] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);

  const [interests, setInterests] = useState<string[]>([]);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(100);
  const [preferredGenders, setPreferredGenders] = useState<string[]>([]);
  const [maxDistance, setMaxDistance] = useState(50);

  const [photoSlots, setPhotoSlots] = useState<(SlotPhoto | null)[]>(() => emptyPhotoSlots());

  const photoCount = countUploadedPhotos(photoSlots);
  const filledPhotos = useMemo(
    () => photoSlots.filter((p): p is SlotPhoto => p != null),
    [photoSlots]
  );

  const nameValid = displayName.trim().length >= 2;
  const locationValid = hasCityAndState(location);

  const togglePreferredGender = (g: string) => {
    if (g === "Everyone") {
      setPreferredGenders(preferredGenders.includes("Everyone") ? [] : ["Everyone"]);
      return;
    }
    if (preferredGenders.includes("Everyone")) {
      setPreferredGenders([g]);
      return;
    }
    if (preferredGenders.includes(g)) {
      setPreferredGenders(preferredGenders.filter((x) => x !== g));
    } else {
      setPreferredGenders([...preferredGenders, g]);
    }
  };

  const toggleInterest = (interest: string) => {
    if (interests.includes(interest)) {
      setInterests(interests.filter((i) => i !== interest));
    } else {
      setInterests([...interests, interest]);
    }
  };

  const detectLocation = async () => {
    if (!navigator.geolocation) {
      return;
    }
    setDetectingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      const { latitude, longitude } = position.coords;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
        { headers: { "User-Agent": "Mulligan-Dating-App/1.0" } }
      );
      if (!response.ok) throw new Error("Geocode failed");
      const data = await response.json();
      const address = data.address || {};
      const city = address.city || address.town || address.village || address.municipality || "";
      const state = address.state || address.region || "";
      const country = address.country || "";
      if (country === "United States" || country === "Canada") {
        if (city && state) setLocation(compactCityState(`${city}, ${state}`));
        else if (city) setLocation(compactCityState(city));
      } else if (city && country) {
        setLocation(compactCityState(`${city}, ${country}`));
      } else if (city) {
        setLocation(compactCityState(city));
      }
    } catch {
      /* user can type manually */
    } finally {
      setDetectingLocation(false);
    }
  };

  const persistLocalDraft = useCallback(
    (nextStep?: number, slots?: (SlotPhoto | null)[]) => {
      const slotsToSave = slots ?? photoSlots;
      writeWebCreateProfileDraft({
        step: nextStep ?? step,
        displayName,
        age,
        gender,
        location,
        bio,
        interests,
        preferredGenders,
        minAge,
        maxAge,
        maxDistance,
        photoSlots: slotsToSave.map((p) => (p ? { id: p.id, url: p.url } : null)),
      });
    },
    [
      step,
      displayName,
      age,
      gender,
      location,
      bio,
      interests,
      preferredGenders,
      minAge,
      maxAge,
      maxDistance,
      photoSlots,
    ]
  );

  const buildProfileSaveSnapshot = useCallback(() => {
    const loc = normalizeLocationInput(location);
    return JSON.stringify({
      displayName: displayName.trim(),
      age: age.trim(),
      gender: gender.trim(),
      location: loc,
      bio: bio.trim(),
      interests: [...interests].sort(),
      preferredGenders: [...preferredGenders].sort(),
      minAge,
      maxAge,
      maxDistance,
    });
  }, [
    displayName,
    age,
    gender,
    location,
    bio,
    interests,
    preferredGenders,
    minAge,
    maxAge,
    maxDistance,
  ]);

  const syncPhotosFromServer = useCallback(
    async (options?: { force?: boolean }) => {
      try {
        const me = await api.get<{ photos: Array<{ id: string; url: string; displayOrder?: number }> }>(
          `/photos/me?_=${Date.now()}`
        );
        const serverPhotos = me.photos ?? [];
        if (options?.force || !photoSlotsTouchedRef.current) {
          setPhotoSlots(
            serverPhotos.length > 0 ? photoSlotsFromApi(serverPhotos) : emptyPhotoSlots()
          );
        }
        return serverPhotos.length;
      } catch {
        return countUploadedPhotos(photoSlots);
      }
    },
    [photoSlots]
  );

  const persistSlotLayout = useCallback(
    async (slots: (SlotPhoto | null)[]) => {
      const displayOrders = buildDisplayOrdersFromSlots(slots);
      const ids = Object.keys(displayOrders);
      if (ids.length === 0) return;

      setReorderingPhotos(true);
      setError("");
      try {
        await api.put("/photos/reorder", { displayOrders });
        photoSlotsTouchedRef.current = true;
        persistLocalDraft(step, slots);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reorder photos");
        await syncPhotosFromServer({ force: true });
      } finally {
        setReorderingPhotos(false);
      }
    },
    [step, syncPhotosFromServer, persistLocalDraft]
  );

  const saveProfileProgress = useCallback(
    async (options: { requireLocation: boolean; includePreferences?: boolean }) => {
      if (displayName.trim().length < 2) {
        throw new Error("Please enter at least 2 characters for your name");
      }
      const normalizedLocation = normalizeLocationInput(location);
      if (options.requireLocation && !hasCityAndState(normalizedLocation)) {
        throw new Error("Please enter both city and state (e.g. Medford, Oregon)");
      }

      const ageNum = resolveOnboardingAge(age);
      const genderVal = resolveOnboardingGender(gender);
      const prefGenders = resolveOnboardingPreferredGenders(preferredGenders);

      const profileBody = {
        displayName: displayName.trim(),
        age: ageNum,
        gender: genderVal,
        location: hasCityAndState(normalizedLocation) ? normalizedLocation : null,
        bio: bio?.trim() || null,
        lookingFor: null,
      };

      const includePreferences = options.includePreferences !== false;
      const maxDist =
        maxDistance != null && !Number.isNaN(Number(maxDistance))
          ? Number(maxDistance)
          : ONBOARDING_DEFAULT_MAX_DISTANCE;

      const executeSave = async () => {
        try {
          await postProfileWithRetry(profileBody);
        } catch (err) {
          throw new Error(apiErrorMessage(err, "Failed to save profile"));
        }
        if (interests.length > 0) {
          try {
            await api.put("/profile/interests", {
              interests: interests.map((name) => ({ name })),
            });
          } catch (err) {
            throw new Error(apiErrorMessage(err, "Failed to save interests"));
          }
        }
        if (includePreferences) {
          const minAgeVal = minAge >= 18 ? minAge : ONBOARDING_DEFAULT_MIN_AGE;
          const maxAgeVal =
            maxAge >= minAgeVal && maxAge <= 120 ? maxAge : ONBOARDING_DEFAULT_MAX_AGE;
          try {
            await api.put("/profile/preferences", {
              minAge: minAgeVal,
              maxAge: maxAgeVal,
              preferredGenders: preferredGendersPayload(prefGenders),
              maxDistance: maxDist >= 1 ? maxDist : ONBOARDING_DEFAULT_MAX_DISTANCE,
              relationshipType: null,
            });
          } catch (err) {
            throw new Error(apiErrorMessage(err, "Failed to save match preferences"));
          }
        }
        profileSaveSnapshotRef.current = buildProfileSaveSnapshot();
      };

      const chained = profileSaveChainRef.current.then(executeSave, executeSave);
      profileSaveChainRef.current = chained.catch(() => {});
      await chained;
    },
    [
      displayName,
      age,
      gender,
      location,
      bio,
      interests,
      minAge,
      maxAge,
      preferredGenders,
      maxDistance,
      buildProfileSaveSnapshot,
    ]
  );

  const saveProfileBeforePhotos = useCallback(async () => {
    await saveProfileProgress({ requireLocation: true });
  }, [saveProfileProgress]);

  /** Activation: name + city/state only (photos required later on Connect). */
  const readActivationReadyOnServer = useCallback(async (): Promise<{
    ready: boolean;
    gaps: ProfileActivationGap[];
  }> => {
    try {
      const profileRes = await api.get<{ profile: unknown }>("/profile");
      const gaps = getProfileActivationGaps(profileRes.profile);
      return { ready: gaps.length === 0, gaps };
    } catch {
      return { ready: false, gaps: ["name", "location"] };
    }
  }, []);

  /** Complete Profile: POST must succeed; interests/prefs are best-effort. */
  const saveProfileForComplete = useCallback(async () => {
    const validationError = validateMinimalOnboardingProfile(displayName, location);
    if (validationError) {
      throw new Error(validationError);
    }

    const normalizedLocation = normalizeLocationInput(location);
    const ageNum = resolveOnboardingAge(age);
    const genderVal = resolveOnboardingGender(gender);
    const prefGenders = resolveOnboardingPreferredGenders(preferredGenders);

    const profileBody = {
      displayName: displayName.trim(),
      age: ageNum,
      gender: genderVal,
      location: normalizedLocation,
      bio: bio?.trim() || null,
      lookingFor: null,
    };

    const maxDist =
      maxDistance != null && !Number.isNaN(Number(maxDistance))
        ? Number(maxDistance)
        : ONBOARDING_DEFAULT_MAX_DISTANCE;

    const executeSave = async () => {
      try {
        await postProfileWithRetry(profileBody);
      } catch (err) {
        throw new Error(apiErrorMessage(err, "Failed to save profile"));
      }
      if (interests.length > 0) {
        try {
          await api.put("/profile/interests", {
            interests: interests.map((name) => ({ name })),
          });
        } catch (err) {
          if (__DEV__) {
            console.warn("CreateProfile: interests save on complete (non-fatal):", err);
          }
        }
      }
      const minAgeVal = minAge >= 18 ? minAge : ONBOARDING_DEFAULT_MIN_AGE;
      const maxAgeVal =
        maxAge >= minAgeVal && maxAge <= 120 ? maxAge : ONBOARDING_DEFAULT_MAX_AGE;
      try {
        await api.put("/profile/preferences", {
          minAge: minAgeVal,
          maxAge: maxAgeVal,
          preferredGenders: preferredGendersPayload(prefGenders),
          maxDistance: maxDist >= 1 ? maxDist : ONBOARDING_DEFAULT_MAX_DISTANCE,
          relationshipType: null,
        });
      } catch (err) {
        if (__DEV__) {
          console.warn("CreateProfile: preferences save on complete (non-fatal):", err);
        }
      }
      profileSaveSnapshotRef.current = buildProfileSaveSnapshot();
    };

    const chained = profileSaveChainRef.current.then(executeSave, executeSave);
    profileSaveChainRef.current = chained.catch(() => {});
    await chained;
  }, [
    displayName,
    age,
    gender,
    location,
    bio,
    interests,
    minAge,
    maxAge,
    preferredGenders,
    maxDistance,
    buildProfileSaveSnapshot,
  ]);

  const ensureProfileReadyForPhotos = useCallback(async () => {
    if (profileReadyForPhotos) return;
    await saveProfileBeforePhotos();
    setProfileReadyForPhotos(true);
  }, [profileReadyForPhotos, saveProfileBeforePhotos]);

  useEffect(() => {
    if (step < TOTAL_STEPS) {
      setProfileReadyForPhotos(false);
    }
  }, [step]);

  useEffect(() => {
    if (step !== TOTAL_STEPS || profileReadyForPhotos) return;
    if (!nameValid || !locationValid) return;
    setError("");
    let cancelled = false;
    (async () => {
      try {
        await saveProfileBeforePhotos();
        if (cancelled) return;
        setProfileReadyForPhotos(true);
        if (!cancelled) {
          await syncPhotosFromServer({ force: true });
        }
      } catch (err) {
        if (cancelled) return;
        if (__DEV__) {
          console.warn("CreateProfile background save on photos step:", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, profileReadyForPhotos, saveProfileBeforePhotos, syncPhotosFromServer, nameValid, locationValid]);

  useEffect(() => {
    const load = async () => {
      ensureWebOnboardingDraft();
      const draft = readWebCreateProfileDraft();
      let dn = draft?.displayName ?? "";
      let ageStr = draft?.age ?? "";
      let genderVal = draft?.gender ?? "";
      let loc = draft?.location ?? "";
      let bioVal = draft?.bio ?? "";
      let interestList: string[] = draft?.interests ?? [];
      let prefGenders: string[] =
        draft?.preferredGenders && draft.preferredGenders.length > 0 ? draft.preferredGenders : [];
      let minAgeVal = draft?.minAge ?? 18;
      let maxAgeVal = draft?.maxAge ?? 100;
      let maxDist = draft?.maxDistance ?? 50;
      let photoCount = 0;

      try {
        const data = await api.get<{
          profile: {
            display_name: string;
            age: number;
            gender: string;
            location: string | null;
            bio: string | null;
          };
          interests: Array<{ name: string }>;
          preferences: {
            min_age: number;
            max_age: number | null;
            preferred_genders: string | null;
            max_distance: number;
          } | null;
        }>("/profile");

        if (data.profile) {
          const stubName = !(data.profile.display_name ?? "").trim();
          if (!stubName) dn = data.profile.display_name;
          if (data.profile.age) ageStr = String(data.profile.age);
          if (data.profile.gender && data.profile.gender !== "Other") genderVal = data.profile.gender;
          else if (data.profile.gender && !genderVal) genderVal = data.profile.gender;
          if (data.profile.location) loc = data.profile.location;
          if (data.profile.bio) bioVal = data.profile.bio;
          const isStubLike =
            dn.trim().length >= 2 &&
            data.profile.gender === "Other" &&
            !data.profile.location &&
            (data.interests?.length ?? 0) === 0;
          if (isStubLike && !draft?.age) ageStr = "";
        }
        if (data.interests?.length) {
          interestList = data.interests.map((i) => i.name);
        }
        if (data.preferences) {
          minAgeVal = data.preferences.min_age;
          if (data.preferences.max_age != null) {
            maxAgeVal = data.preferences.max_age;
          }
          maxDist = data.preferences.max_distance ?? 50;
          if (!(draft?.preferredGenders && draft.preferredGenders.length > 0)) {
            prefGenders = parsePreferredGendersFromApi(data.preferences.preferred_genders);
          }
        }

      } catch {
        /* profile fetch failed — still try photos + draft below */
      }

      try {
        const me = await api.get<{ photos: Array<{ id: string; url: string; displayOrder?: number }> }>(
          `/photos/me?_=${Date.now()}`
        );
        if (me.photos?.length) {
          setPhotoSlots(photoSlotsFromApi(me.photos));
          photoCount = me.photos.length;
        }
      } catch {
        /* no photos on server yet */
      }

      // Do not restore photo slots from localStorage when the server has none — avoids
      // showing deleted-account photos after re-signup on the same iPhone browser.
      if (photoCount === 0 && draft?.photoSlots?.some(Boolean)) {
        const { photoSlots: _stale, ...draftWithoutPhotos } = draft;
        writeWebCreateProfileDraft({ ...draftWithoutPhotos, photoSlots: emptyPhotoSlots().map(() => null) });
      }

      setDisplayName(dn);
      setAge(ageStr);
      setGender(genderVal);
      setLocation(loc ? compactCityState(loc) : "");
      setBio(bioVal);
      setInterests(interestList);
      setPreferredGenders(prefGenders.length > 0 ? prefGenders : []);
      setMinAge(minAgeVal);
      setMaxAge(maxAgeVal);
      setMaxDistance(maxDist);

      const resumeStep = computeWebCreateProfileResumeStep({
        displayName: dn,
        location: loc,
      });
      setStep(resumeStep);
    };
    void load();
  }, []);

  const openPhotoPicker = (slotIndex: number) => {
    if (photoCount >= MAX_PHOTO_SLOTS) return;
    photoPickerTargetSlotRef.current = slotIndex;
    fileInputRef.current?.click();
  };

  const onPhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const remaining = MAX_PHOTO_SLOTS - photoCount;
    if (files.length > remaining) {
      setError(`You can only add ${remaining} more photo${remaining === 1 ? "" : "s"}.`);
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError("Please choose image files only");
        return;
      }
    }

    const targetSlot =
      photoPickerTargetSlotRef.current ?? photoSlots.findIndex((p) => p == null);
    if (targetSlot < 0) {
      setError("All photo slots are full.");
      return;
    }

    const slotsToFill: number[] = [];
    let cursor = targetSlot;
    for (let i = 0; i < files.length && slotsToFill.length < files.length; i++) {
      while (cursor < MAX_PHOTO_SLOTS && photoSlots[cursor] !== null) {
        cursor += 1;
      }
      if (cursor >= MAX_PHOTO_SLOTS) break;
      slotsToFill.push(cursor);
      cursor += 1;
    }

    setError("");
    setUploadingSlotIndices(slotsToFill);
    try {
      const [compressed] = await Promise.all([
        compressImageFiles(files),
        ensureProfileReadyForPhotos(),
      ]);
      const uploaded = await uploadCompressedFiles(compressed);
      photoSlotsTouchedRef.current = true;
      const incoming = uploaded.map((p) => ({ id: p.id, url: p.url }));
      const nextSlots = insertPhotosAtTarget(photoSlots, targetSlot, incoming);
      setPhotoSlots(nextSlots);
      await persistSlotLayout(nextSlots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      await syncPhotosFromServer({ force: true });
    } finally {
      setUploadingSlotIndices([]);
      photoPickerTargetSlotRef.current = null;
    }
  };

  const confirmRemovePhoto = async () => {
    if (removeConfirmSlot == null) return;
    const slotIndex = removeConfirmSlot;
    const ph = photoSlots[slotIndex];
    if (!ph || removingPhotoId) return;

    setRemoveConfirmSlot(null);
    setRemovingPhotoId(ph.id);
    setError("");
    try {
      await api.delete(`/photos/${ph.id}`);
      photoSlotsTouchedRef.current = true;
      const nextSlots = [...photoSlots];
      nextSlots[slotIndex] = null;
      setPhotoSlots(nextSlots);
      await persistSlotLayout(nextSlots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo");
      await syncPhotosFromServer({ force: true });
    } finally {
      setRemovingPhotoId(null);
    }
  };

  const handlePhotoDragStart = (e: React.DragEvent, photoId: string) => {
    if (reorderingPhotos || uploadingPhotos || filledPhotos.length <= 1) return;
    setDraggingPhotoId(photoId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", photoId);
  };

  const handlePhotoDragEnd = () => {
    setDraggingPhotoId(null);
    setDragOverSlot(null);
  };

  const handlePhotoSlotDragOver = (e: React.DragEvent, slotIndex: number) => {
    if (!draggingPhotoId || reorderingPhotos || uploadingPhotos) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSlot(slotIndex);
  };

  const handlePhotoSlotDrop = (e: React.DragEvent, targetSlot: number) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain") || draggingPhotoId;
    setDraggingPhotoId(null);
    setDragOverSlot(null);
    if (!sourceId) return;

    const sourceSlot = photoSlots.findIndex((p) => p?.id === sourceId);
    if (sourceSlot < 0 || sourceSlot === targetSlot) return;

    const nextSlots = movePhotoBetweenSlots(photoSlots, sourceSlot, targetSlot);
    setPhotoSlots(nextSlots);
    void persistSlotLayout(nextSlots);
  };

  const handleCompleteProfile = async () => {
    setError("");

    const validationError = validateMinimalOnboardingProfile(displayName, location);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      setSavingProfileDraft(true);

      let { ready: serverReady, gaps } = await readActivationReadyOnServer();
      if (!serverReady) {
        try {
          await saveProfileForComplete();
        } catch (saveErr) {
          const retry = await readActivationReadyOnServer();
          if (!retry.ready) throw saveErr;
          serverReady = true;
          gaps = [];
        }
        if (!serverReady) {
          const afterSave = await readActivationReadyOnServer();
          serverReady = afterSave.ready;
          gaps = afterSave.gaps;
        }
      }

      if (!serverReady) {
        throw new Error(formatProfileActivationGapMessage(gaps));
      }

      await api.post('/profile/activate');

      setProfileReadyForPhotos(true);
      profileSaveSnapshotRef.current = buildProfileSaveSnapshot();

      clearWebCreateProfileDraft();
      markConnectSetupComplete();
      markWebPushPromptAfterProfile();
      await refreshProfile({ silent: true });
      setShowProfileReadySplash(true);
    } catch (err) {
      const msg = apiErrorMessage(err, "Failed to create profile");
      const low = msg.toLowerCase();
      if (low.includes("authentication") || low.includes("401") || low.includes("403")) {
        setError("Session expired. Please log in again and finish your profile.");
      } else if (low.includes("too many requests") || low.includes("429")) {
        setError("Too many attempts. Wait a moment, then tap Complete Profile again.");
      } else if (low.includes("interests")) {
        setError(`${msg} Your profile may be partially saved — tap Complete Profile again.`);
      } else if (low.includes("preferences") || low.includes("match preferences")) {
        setError(`${msg} Tap Complete Profile again to retry.`);
      } else if (low.includes("still missing on the server")) {
        setError(msg);
      } else if (low.includes("failed to save profile")) {
        const hasDetail = msg.length > 40 && !msg.toLowerCase().startsWith("failed to save profile");
        setError(
          hasDetail
            ? msg
            : "Your profile is filled out, but we couldn't save it on the server. Check your connection and tap Complete Profile again."
        );
      } else {
        setError(msg);
      }
    } finally {
      setSavingProfileDraft(false);
      setLoading(false);
    }
  };

  const completeProfileDisabled =
    loading ||
    savingProfileDraft ||
    savingProgress ||
    !nameValid ||
    !locationValid ||
    detectingLocation;

  const minAgeOptions = Array.from({ length: 103 }, (_, i) => 18 + i);
  const maxAgeOptions = Array.from({ length: 121 - minAge }, (_, i) => minAge + i);

  const focusCard = (
    gradientClass: string,
    emoji: string,
    title: string,
    subtitle: string,
    children: ReactNode,
    hint?: ReactNode
  ) => (
    <div className={`create-profile-focus create-profile-focus--${gradientClass}`}>
      <div className="create-profile-focus-inner">
        <span className="create-profile-focus-emoji" aria-hidden>
          {emoji}
        </span>
        <h2 className="create-profile-focus-title">{title}</h2>
        <p className="create-profile-focus-sub">{subtitle}</p>
        {children}
        {hint ? <div className="create-profile-focus-hint">{hint}</div> : null}
      </div>
    </div>
  );

  return (
    <div className="create-profile-wizard native-app-screen">
      <header className="create-profile-hero">
        <div className="create-profile-hero-top">
          <a
            href={getCreateProfileSupportMailtoUrl()}
            className="create-profile-email-support"
          >
            Email support
          </a>
          <button
            type="button"
            className="create-profile-change-phone"
            onClick={handleChangePhoneNumber}
          >
            Wrong number?
          </button>
        </div>
        <h1 className="create-profile-hero-title">Set up your profile</h1>
        <p className="create-profile-hero-hint">
          Add photos on your Profile before you Connect. Age, interests, and match preferences are in Settings.
        </p>
      </header>

      {error ? <div className="auth-error create-profile-error">{error}</div> : null}

      <div className="create-profile-body">
        {step === 1 &&
          focusCard(
            "violet",
            "👋",
            "Welcome to Mulligan!",
            "Let's start with your first name",
            <>
              <input
                type="text"
                className="create-profile-focus-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your first name"
                autoComplete="given-name"
                maxLength={50}
              />
              <div className="create-profile-focus-location-block">
                <p className="create-profile-focus-location-label">Where do you live?</p>
                <p className="create-profile-focus-location-sub">
                  Southern Oregon for now — use city and state (e.g. Medford, OR).
                </p>
                <input
                  type="text"
                  className="create-profile-focus-input create-profile-focus-input--location"
                  value={location}
                  onChange={(e) => handleLocationChange(e.target.value, setLocation)}
                  onBlur={(e) => setLocation(compactCityState(e.target.value))}
                  placeholder="City, State"
                  disabled={detectingLocation}
                  autoComplete="address-level2"
                />
                <button
                  type="button"
                  className="create-profile-loc-btn"
                  onClick={() => void detectLocation()}
                  disabled={detectingLocation}
                >
                  {detectingLocation ? "Detecting…" : "📍 Use My Location"}
                </button>
              </div>
            </>,
            nameValid && locationValid ? (
              <span>✓ Ready — tap Complete Profile</span>
            ) : nameValid ? (
              <span>✓ Add your city and state to finish</span>
            ) : null
          )}
      </div>

      <div className="create-profile-actions">
        <span />
        <button
          type="button"
          className="create-profile-btn create-profile-btn--next"
          disabled={completeProfileDisabled}
          title={
            !nameValid
              ? "Enter at least 2 characters for your name"
              : !locationValid
                ? "Enter city and state (e.g. Medford, Oregon) or use your location"
                : undefined
          }
          onClick={() => void handleCompleteProfile()}
        >
          {loading || savingProfileDraft ? "Saving…" : "Complete Profile →"}
        </button>
      </div>

      {removeConfirmSlot != null && photoSlots[removeConfirmSlot] ? (
        <div
          className="create-profile-photo-remove-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-profile-remove-photo-title"
          onClick={() => setRemoveConfirmSlot(null)}
        >
          <div
            className="create-profile-photo-remove-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="create-profile-photo-remove-card-icon" aria-hidden>
              🗑️
            </div>
            <h3 id="create-profile-remove-photo-title" className="create-profile-photo-remove-card-title">
              Remove this photo?
            </h3>
            <p className="create-profile-photo-remove-card-body">
              It will be deleted from your profile. You can upload a new one in this slot anytime.
            </p>
            <div className="create-profile-photo-remove-card-preview">
              <img
                src={getPhotoUrl(photoSlots[removeConfirmSlot]!.url)}
                alt=""
                className="create-profile-photo-remove-card-img"
              />
            </div>
            <div className="create-profile-photo-remove-card-actions">
              <button
                type="button"
                className="create-profile-photo-remove-card-cancel"
                onClick={() => setRemoveConfirmSlot(null)}
                disabled={Boolean(removingPhotoId)}
              >
                Keep photo
              </button>
              <button
                type="button"
                className="create-profile-photo-remove-card-confirm"
                onClick={() => void confirmRemovePhoto()}
                disabled={Boolean(removingPhotoId)}
              >
                {removingPhotoId ? "Removing…" : "Remove photo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProfileReadySplash ? (
        <div
          className="create-profile-ready-splash"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-ready-title"
        >
          <div className="create-profile-ready-orbs" aria-hidden>
            <span className="create-profile-ready-orb create-profile-ready-orb--1" />
            <span className="create-profile-ready-orb create-profile-ready-orb--2" />
            <span className="create-profile-ready-orb create-profile-ready-orb--3" />
          </div>
          <div className="create-profile-ready-confetti" aria-hidden>
            {["✨", "💫", "⭐", "🔥", "💖", "✨", "💫", "⭐", "🔥", "✨", "💫", "⭐"].map((emoji, i) => (
              <span
                key={i}
                className="create-profile-ready-confetti-piece"
                style={{ ["--confetti-i" as string]: i }}
              >
                {emoji}
              </span>
            ))}
          </div>
          <div className="create-profile-ready-card">
            <span className="create-profile-ready-emoji" aria-hidden>
              🎉
            </span>
            <h2 id="profile-ready-title" className="create-profile-ready-title">
              Nice — you&apos;re in.
            </h2>
            <p className="create-profile-ready-sub">
              Your profile&apos;s live. Time to meet people you might actually click with — low stakes, your pace.
            </p>
            <button
              type="button"
              className="create-profile-ready-cta"
              onClick={() => navigate("/browse", { replace: true })}
            >
              <span className="create-profile-ready-cta-label">Let&apos;s go →</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
