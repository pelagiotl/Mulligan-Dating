import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { hasCityAndState, handleLocationChange } from "../utils/locationUtils";
import { getPhotoUrl } from "../utils/photoUrl";
import {
  clearWebCreateProfileDraft,
  computeWebCreateProfileResumeStep,
  readWebCreateProfileDraft,
  writeWebCreateProfileDraft,
} from "../utils/createProfileProgress";

const GENDER_OPTIONS = ["Man", "Woman", "Other"] as const;
const PREFERRED_GENDER_OPTIONS = ["Man", "Woman", "Everyone"] as const;
const PREFERRED_GENDER_LABELS: Record<string, string> = {
  Man: "Men",
  Woman: "Women",
  Everyone: "Everyone",
};

function preferredGendersPayload(g: string[]): string[] | null {
  if (g.includes("Everyone") || g.length === 0) return null;
  const only = g.filter((x) => x === "Man" || x === "Woman");
  return only.length > 0 ? only : null;
}

function validateProfileWizardFields(
  displayName: string,
  age: string,
  gender: string,
  location: string
): string | null {
  if (displayName.trim().length < 2) {
    return "Please enter at least 2 characters for your name";
  }
  const ageNum = parseInt(age, 10);
  if (!age?.trim() || Number.isNaN(ageNum) || ageNum < 18 || ageNum > 120) {
    return "Please enter a valid age (18–120)";
  }
  if (!gender?.trim()) {
    return "Please select your gender";
  }
  if (!location?.trim() || !hasCityAndState(location)) {
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
  try {
    await api.post("/profile", body);
  } catch (err) {
    const retryable =
      err instanceof ApiError && (err.status >= 500 || err.status === 409 || err.status === 0);
    if (!retryable) throw err;
    await new Promise((r) => setTimeout(r, 450));
    await api.post("/profile", body);
  }
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

const TOTAL_STEPS = 11;
const MIN_PHOTOS_REQUIRED = 3;
const MAX_PHOTO_SLOTS = 6;

type SlotPhoto = { id: string; url: string };

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
  sorted.forEach((ph, i) => {
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

function getApiBase(): string {
  const API_URL = (import.meta.env as { VITE_API_URL?: string; VITE_NGROK_URL?: string }).VITE_API_URL
    || (import.meta.env as { VITE_NGROK_URL?: string }).VITE_NGROK_URL
    || "";
  return API_URL ? `${API_URL}/api` : "/api";
}

async function compressImage(file: File, maxWidth = 1920, maxHeight = 1920, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Compression failed"));
              return;
            }
            resolve(new File([blob], file.name, { type: "image/jpeg", lastModified: Date.now() }));
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function uploadOnePhoto(file: File): Promise<SlotPhoto> {
  let toSend = file;
  try {
    toSend = await compressImage(file);
  } catch {
    // use original
  }
  const formData = new FormData();
  formData.append("photos", toSend);
  const token = localStorage.getItem("token");
  const res = await fetch(`${getApiBase()}/photos`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const text = await res.text();
  let data: { photos?: Array<{ id: string; url: string }>; error?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  const p = data.photos?.[0];
  if (!p?.id || !p?.url) {
    throw new Error("Invalid response from server");
  }
  return { id: p.id, url: p.url };
}

export default function CreateProfile() {
  const navigate = useNavigate();
  const { refreshProfile, logout } = useAuth();

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
  const profileSaveInFlightRef = useRef<Promise<void> | null>(null);
  const photoSlotsTouchedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingSlotIndex, setPendingSlotIndex] = useState<number | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
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
        if (city && state) setLocation(`${city}, ${state}`);
        else if (city) setLocation(city);
      } else if (city && country) {
        setLocation(`${city}, ${country}`);
      } else if (city) {
        setLocation(city);
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

  const syncPhotosFromServer = useCallback(
    async (options?: { force?: boolean }) => {
      try {
        const me = await api.get<{ photos: Array<{ id: string; url: string; displayOrder?: number }> }>(
          `/photos/me?_=${Date.now()}`
        );
        if (!me.photos?.length) return 0;
        if (options?.force || !photoSlotsTouchedRef.current) {
          setPhotoSlots(photoSlotsFromApi(me.photos));
        }
        return me.photos.length;
      } catch {
        return countUploadedPhotos(photoSlots);
      }
    },
    []
  );

  const saveProfileProgress = useCallback(
    async (options: { requireLocation: boolean; includePreferences?: boolean }) => {
      if (displayName.trim().length < 2) {
        throw new Error("Please enter at least 2 characters for your name");
      }
      const ageNum = parseInt(age, 10);
      if (!age?.trim() || Number.isNaN(ageNum) || ageNum < 18 || ageNum > 120) {
        throw new Error("Please enter a valid age (18–120)");
      }
      if (!gender?.trim()) {
        throw new Error("Please select your gender");
      }
      if (options.requireLocation && !hasCityAndState(location)) {
        throw new Error("Please enter both city and state (e.g. Medford, Oregon)");
      }

      const profileBody = {
        displayName: displayName.trim(),
        age: ageNum,
        gender: gender.trim(),
        location: hasCityAndState(location) ? location.trim() : null,
        bio: bio?.trim() || null,
        lookingFor: null,
      };

      const includePreferences = options.includePreferences !== false;

      const prior = profileSaveInFlightRef.current;
      if (prior) {
        try {
          await prior;
        } catch {
          /* prior attempt failed — run a fresh save with latest form state */
        }
      }

      const run = (async () => {
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
          try {
            await api.put("/profile/preferences", {
              minAge,
              maxAge: maxAge >= minAge && maxAge <= 120 ? maxAge : null,
              preferredGenders: preferredGendersPayload(preferredGenders),
              maxDistance: maxDistance != null ? Number(maxDistance) : null,
              relationshipType: null,
            });
          } catch (err) {
            throw new Error(apiErrorMessage(err, "Failed to save match preferences"));
          }
        }
      })();

      profileSaveInFlightRef.current = run;
      try {
        await run;
      } finally {
        if (profileSaveInFlightRef.current === run) {
          profileSaveInFlightRef.current = null;
        }
      }
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
    ]
  );

  const saveProfileBeforePhotos = useCallback(async () => {
    await saveProfileProgress({ requireLocation: true });
  }, [saveProfileProgress]);

  const ensureProfileReadyForPhotos = useCallback(async () => {
    if (profileReadyForPhotos) return;
    await saveProfileBeforePhotos();
    setProfileReadyForPhotos(true);
  }, [profileReadyForPhotos, saveProfileBeforePhotos]);

  useEffect(() => {
    if (step < 11) {
      setProfileReadyForPhotos(false);
    }
  }, [step]);

  useEffect(() => {
    if (step !== 11 || profileReadyForPhotos) return;
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
        /* Don't block the wizard — Complete Profile will retry with a visible error if needed */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, profileReadyForPhotos, saveProfileBeforePhotos, syncPhotosFromServer]);

  useEffect(() => {
    const load = async () => {
      const draft = readWebCreateProfileDraft();
      let dn = draft?.displayName ?? "";
      let ageStr = draft?.age ?? "";
      let genderVal = draft?.gender ?? "";
      let loc = draft?.location ?? "";
      let bioVal = draft?.bio ?? "";
      let interestList: string[] = draft?.interests ?? [];
      let prefGenders: string[] = draft?.preferredGenders ?? [];
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
          if (data.preferences.preferred_genders) {
            try {
              const genders = JSON.parse(data.preferences.preferred_genders) as string[];
              const withoutOther = genders.filter((g) => g !== "Other");
              const legacyAllThree =
                genders.length === 3 && ["Man", "Woman", "Other"].every((g) => genders.includes(g));
              const isEveryone =
                genders.includes("Everyone") ||
                genders.length === 0 ||
                legacyAllThree ||
                (withoutOther.length === 0 && genders.length > 0);
              prefGenders = isEveryone ? ["Everyone"] : withoutOther;
            } catch {
              prefGenders = ["Everyone"];
            }
          } else {
            prefGenders = ["Everyone"];
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

      if (photoCount === 0 && draft?.photoSlots?.length) {
        const fromDraft = emptyPhotoSlots();
        draft.photoSlots.forEach((p, i) => {
          if (p && i < MAX_PHOTO_SLOTS) fromDraft[i] = { id: p.id, url: p.url };
        });
        if (countUploadedPhotos(fromDraft) > 0) {
          setPhotoSlots(fromDraft);
          photoCount = countUploadedPhotos(fromDraft);
        }
      }

      setDisplayName(dn);
      setAge(ageStr);
      setGender(genderVal);
      setLocation(loc);
      setBio(bioVal);
      setInterests(interestList);
      setPreferredGenders(prefGenders.length > 0 ? prefGenders : []);
      setMinAge(minAgeVal);
      setMaxAge(maxAgeVal);
      setMaxDistance(maxDist);

      const resumeStep = computeWebCreateProfileResumeStep({
        displayName: dn,
        age: ageStr,
        gender: genderVal,
        location: loc,
        interests: interestList,
        preferredGenders: prefGenders.length > 0 ? prefGenders : [],
        minAge: minAgeVal,
        maxAge: maxAgeVal,
        maxDistance: maxDist,
        photoCount,
        minPhotosRequired: MIN_PHOTOS_REQUIRED,
      });
      setStep(resumeStep);
    };
    void load();
  }, []);

  const handleNext = async () => {
    if (step === 1) {
      if (!nameValid) {
        setError("Please enter at least 2 characters for your name");
        return;
      }
    }
    if (step === 2) {
      const ageNum = parseInt(age, 10);
      if (!age?.trim() || Number.isNaN(ageNum) || ageNum < 18 || ageNum > 120) {
        setError("Please enter a valid age (18–120)");
        return;
      }
    }
    if (step === 3) {
      if (!gender?.trim()) {
        setError("Please select your gender");
        return;
      }
    }
    if (step === 4) {
      if (preferredGenders.length < 1) {
        setError("Please choose who you’d like to connect with (select Everyone if you’re open to anyone)");
        return;
      }
    }
    if (step === 5) {
      if (!location?.trim()) {
        setError("Please enter your location");
        return;
      }
      if (!locationValid) {
        setError("Please enter both city and state (e.g. Medford, Oregon)");
        return;
      }
    }
    if (step === 7) {
      if (interests.length < 3) {
        setError("Please select at least 3 interests");
        return;
      }
    }
    if (step === 8) {
      if (minAge < 18) {
        setError("Minimum age must be 18 or older");
        return;
      }
    }
    if (step === 9) {
      if (maxAge < minAge) {
        setError(`Maximum age must be at least ${minAge}`);
        return;
      }
    }
    if (step === 10) {
      if (maxDistance < 1) {
        setError("Please enter a maximum distance (at least 1 mile)");
        return;
      }
    }

    const nextStep = Math.min(step + 1, TOTAL_STEPS);
    setSavingProgress(true);
    setError("");
    try {
      if (step === 1) {
        try {
          await api.put("/profile/basics", { displayName: displayName.trim() });
        } catch (err) {
          throw new Error(apiErrorMessage(err, "Failed to save your name"));
        }
      } else if (step >= 3) {
        await saveProfileProgress({
          requireLocation: step >= 5,
          includePreferences: step >= 4,
        });
      }
      persistLocalDraft(nextStep);
      setStep(nextStep);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save progress");
    } finally {
      setSavingProgress(false);
    }
  };

  const handleBack = () => {
    setError("");
    setStep((s) => Math.max(1, s - 1));
  };

  const openPhotoPicker = (slotIndex: number) => {
    const filled = photoSlots.filter(Boolean).length;
    if (!photoSlots[slotIndex] && filled >= MAX_PHOTO_SLOTS) return;
    setPendingSlotIndex(slotIndex);
    fileInputRef.current?.click();
  };

  const onPhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slot = pendingSlotIndex;
    e.target.value = "";
    setPendingSlotIndex(null);
    if (!file || slot === null) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file");
      return;
    }
    setError("");
    setUploadingSlot(slot);
    try {
      await ensureProfileReadyForPhotos();
      const uploaded = await uploadOnePhoto(file);
      photoSlotsTouchedRef.current = true;
      const next = [...photoSlots];
      next[slot] = uploaded;
      setPhotoSlots(next);
      await syncPhotosFromServer({ force: true });
      persistLocalDraft(step, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingSlot(null);
    }
  };

  const removePhotoAt = async (slotIndex: number) => {
    const ph = photoSlots[slotIndex];
    if (!ph) return;
    if (!window.confirm("Remove this photo?")) return;
    try {
      await api.delete(`/photos/${ph.id}`);
      photoSlotsTouchedRef.current = true;
      const next = [...photoSlots];
      next[slotIndex] = null;
      setPhotoSlots(next);
      persistLocalDraft(step, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo");
    }
  };

  const handleCompleteProfile = async () => {
    setError("");
    if (uploadingSlot !== null) {
      setError("Please wait for your photo upload to finish");
      return;
    }

    const validationError = validateProfileWizardFields(displayName, age, gender, location);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      setSavingProfileDraft(true);
      await saveProfileBeforePhotos();
      setProfileReadyForPhotos(true);

      let readyCount = countUploadedPhotos(photoSlots);
      if (readyCount < MIN_PHOTOS_REQUIRED) {
        const syncedCount = await syncPhotosFromServer({ force: true });
        if (syncedCount > 0) {
          readyCount = syncedCount;
        }
      }

      if (readyCount < MIN_PHOTOS_REQUIRED) {
        setError(
          `Please upload at least ${MIN_PHOTOS_REQUIRED} photos to complete your profile`
        );
        return;
      }

      clearWebCreateProfileDraft();
      await refreshProfile();
      setShowProfileReadySplash(true);
    } catch (err) {
      const msg = apiErrorMessage(err, "Failed to create profile");
      const low = msg.toLowerCase();
      if (low.includes("authentication") || low.includes("401") || low.includes("403")) {
        setError("Session expired. Please log in again and finish your profile.");
      } else if (low.includes("too many requests") || low.includes("429")) {
        setError("Too many attempts. Wait a moment, then tap Complete Profile again.");
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
    uploadingSlot !== null ||
    photoCount < MIN_PHOTOS_REQUIRED;

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
          <span aria-hidden />
          <button
            type="button"
            className="create-profile-change-phone"
            onClick={handleChangePhoneNumber}
          >
            Wrong number?
          </button>
        </div>
        <h1 className="create-profile-hero-title">Set up your profile</h1>
        <p className="create-profile-hero-step">
          Step {step} of {TOTAL_STEPS}
        </p>
      </header>

      <div className="create-profile-dots" aria-hidden>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className={`create-profile-dot ${step >= i + 1 ? "is-active" : ""} ${step > i + 1 ? "is-done" : ""}`}
          />
        ))}
      </div>

      {error ? <div className="auth-error create-profile-error">{error}</div> : null}

      <div className="create-profile-body">
        {step === 1 &&
          focusCard(
            "violet",
            "👋",
            "Welcome to Mulligan!",
            "Let's start with your first name",
            <input
              type="text"
              className="create-profile-focus-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your first name"
              autoComplete="given-name"
              maxLength={50}
            />,
            nameValid ? <span>✓ Great! Tap Continue</span> : null
          )}

        {step === 2 &&
          focusCard(
            "sunset",
            "🎂",
            "How old are you?",
            "We need to know your age",
            <input
              type="text"
              inputMode="numeric"
              className="create-profile-focus-input create-profile-focus-input--center"
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="Your age"
              autoComplete="bday-year"
            />,
            age.trim().length > 0 && parseInt(age, 10) >= 18 ? <span>✓ Perfect! Tap Continue</span> : null
          )}

        {step === 3 &&
          focusCard(
            "plum",
            "⚧️",
            "What's your gender?",
            "This is how you show up on your profile",
            <select
              className="create-profile-focus-select"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              aria-label="Gender"
            >
              <option value="">Select gender</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>,
            gender ? <span>✓ Selected: {gender}</span> : null
          )}

        {step === 4 &&
          focusCard(
            "ocean",
            "💕",
            "Preferred matches",
            "Who would you like to connect with?",
            <>
              <p className="create-profile-pref-label">Who to show</p>
              <div className="create-profile-gender-grid">
                {PREFERRED_GENDER_OPTIONS.map((pref) => {
                  const selected = preferredGenders.includes(pref);
                  return (
                    <button
                      key={pref}
                      type="button"
                      className={`create-profile-gender-chip ${selected ? "is-selected" : ""}`}
                      onClick={() => togglePreferredGender(pref)}
                    >
                      {PREFERRED_GENDER_LABELS[pref]}
                      {selected ? <span className="create-profile-gender-check">✓</span> : null}
                    </button>
                  );
                })}
              </div>
              <p className="create-profile-pref-foot">
                Men, women, or everyone—your Discover feed follows this
              </p>
            </>,
            preferredGenders.length > 0 ? (
              <span>
                ✓ {preferredGenders.includes("Everyone") ? "Everyone" : `${preferredGenders.length} selected`}
              </span>
            ) : null
          )}

        {step === 5 &&
          focusCard(
            "coral",
            "📍",
            "Where are you located?",
            "We use this to show you people nearby",
            <>
              <input
                type="text"
                className="create-profile-focus-input"
                value={location}
                onChange={(e) => handleLocationChange(e.target.value, setLocation)}
                placeholder="City, State"
                disabled={detectingLocation}
                autoComplete="address-level2"
              />
              <button type="button" className="create-profile-loc-btn" onClick={() => void detectLocation()} disabled={detectingLocation}>
                {detectingLocation ? "Detecting…" : "📍 Use My Location"}
              </button>
            </>,
            locationValid ? <span>✓ Location set! Tap Continue</span> : null
          )}

        {step === 6 &&
          focusCard(
            "aurora",
            "✨",
            "Tell us about yourself",
            "Share what makes you unique",
            <textarea
              className="create-profile-focus-textarea"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Write a bit about yourself..."
              maxLength={500}
              rows={6}
            />,
            bio.trim().length >= 20 ? <span>✓ Great bio!</span> : <span className="create-profile-char-count">{bio.length}/500</span>
          )}

        {step === 7 && (
          <div className="create-profile-interests-wrap">
            <div className="create-profile-interests-header">
              <span className="create-profile-interests-emoji">🎯</span>
              <h2 className="create-profile-interests-title">Your Interests</h2>
              <p className="create-profile-interests-sub">Select at least 3 interests that define you</p>
              <div className="create-profile-interests-counter">
                {interests.length} selected {interests.length >= 3 ? "✓" : `(${3 - interests.length} more needed)`}
              </div>
            </div>
            <div className="create-profile-interests-grid">
              {INTEREST_OPTIONS.map((interest) => {
                const selected = interests.includes(interest);
                const em = INTEREST_EMOJIS[interest] || "✨";
                return (
                  <button
                    key={interest}
                    type="button"
                    className={`create-profile-interest-tile ${selected ? "is-selected" : ""}`}
                    onClick={() => toggleInterest(interest)}
                  >
                    <span className="create-profile-interest-emoji">{em}</span>
                    <span className="create-profile-interest-label">{interest}</span>
                    {selected ? <span className="create-profile-interest-check">✓</span> : null}
                  </button>
                );
              })}
            </div>
            <p className="create-profile-interests-scroll-hint">👆 Scroll to see all {INTEREST_OPTIONS.length} interests</p>
          </div>
        )}

        {step === 8 &&
          focusCard(
            "violet",
            "🎂",
            "Minimum age",
            "Must be 18 or older",
            <select
              className="create-profile-focus-select"
              value={minAge}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10) || 18;
                setMinAge(n);
                if (maxAge < n) setMaxAge(n);
              }}
              aria-label="Minimum age"
            >
              {minAgeOptions.map((a) => (
                <option key={a} value={a}>
                  {a} years old
                </option>
              ))}
            </select>,
            minAge >= 18 ? <span>✓ Tap Continue</span> : null
          )}

        {step === 9 &&
          focusCard(
            "rose",
            "🎂",
            "Maximum age",
            `Must be ${minAge} or older`,
            <select
              className="create-profile-focus-select"
              value={maxAge}
              onChange={(e) => setMaxAge(parseInt(e.target.value, 10) || minAge)}
              aria-label="Maximum age"
            >
              {maxAgeOptions.map((a) => (
                <option key={a} value={a}>
                  {a} years old
                </option>
              ))}
            </select>,
            maxAge >= minAge ? <span>✓ Tap Continue</span> : null
          )}

        {step === 10 &&
          focusCard(
            "ocean",
            "📍",
            "Maximum distance",
            "How far to search for connections",
            <div className="create-profile-distance-row">
              <input
                type="number"
                className="create-profile-focus-input create-profile-focus-input--narrow"
                min={1}
                max={500}
                value={maxDistance}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v >= 1) setMaxDistance(v);
                  else if (e.target.value === "") setMaxDistance(1);
                }}
              />
              <span className="create-profile-distance-unit">miles</span>
            </div>,
            maxDistance >= 1 ? <span>✓ {maxDistance} miles</span> : null
          )}

        {step === 11 && (
          <div className="create-profile-photos-wrap">
            <div className="create-profile-photos-header">
              <span className="create-profile-interests-emoji">📸</span>
              <h2 className="create-profile-interests-title">Add Your Photos</h2>
              <p className="create-profile-interests-sub">
                Upload at least {MIN_PHOTOS_REQUIRED} photos (up to {MAX_PHOTO_SLOTS} total)
              </p>
              <p className="create-profile-photos-count">
                {photoCount} / {MIN_PHOTOS_REQUIRED} minimum ({photoCount >= MIN_PHOTOS_REQUIRED ? "✓ Ready" : "Need more"})
              </p>
              {!profileReadyForPhotos && !savingProfileDraft ? (
                <p className="create-profile-photos-saving">Saving your profile…</p>
              ) : null}
              {savingProfileDraft ? (
                <p className="create-profile-photos-saving">Preparing to finish…</p>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="create-profile-file-input"
              onChange={(ev) => void onPhotoFileChange(ev)}
            />
            <div className="create-profile-photos-grid">
              {photoSlots.map((ph, slotIndex) => {
                const isRequired = slotIndex < MIN_PHOTOS_REQUIRED;
                return (
                  <div key={slotIndex} className="create-profile-photo-slot">
                    {ph ? (
                      <div className="create-profile-photo-filled">
                        <img src={getPhotoUrl(ph.url)} alt="" className="create-profile-photo-img" />
                        <button
                          type="button"
                          className="create-profile-photo-remove"
                          onClick={() => void removePhotoAt(slotIndex)}
                          aria-label="Remove photo"
                        >
                          ×
                        </button>
                        {slotIndex === 0 ? <span className="create-profile-photo-primary">Primary</span> : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`create-profile-photo-add ${isRequired && photoCount < MIN_PHOTOS_REQUIRED ? "is-required" : ""}`}
                        onClick={() => openPhotoPicker(slotIndex)}
                        disabled={uploadingSlot !== null || photoCount >= MAX_PHOTO_SLOTS}
                      >
                        {uploadingSlot === slotIndex ? (
                          <span className="create-profile-photo-uploading">…</span>
                        ) : (
                          <>
                            <span className="create-profile-photo-add-icon">📷</span>
                            <span>{isRequired ? "Required" : "Optional"}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="create-profile-photo-tips">
              <strong>💡 Photo Tips</strong>
              <ul>
                <li>Use clear, recent photos</li>
                <li>Include a mix of close-ups and full-body shots</li>
                <li>Show your personality and interests</li>
                <li>Make sure your face is clearly visible in at least one photo</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="create-profile-actions">
        {step > 1 ? (
          <button type="button" className="create-profile-btn create-profile-btn--back" onClick={handleBack}>
            ← Back
          </button>
        ) : (
          <span />
        )}
        {step < TOTAL_STEPS ? (
          <button
            type="button"
            className="create-profile-btn create-profile-btn--next"
            disabled={
              savingProgress ||
              (step === 1 && !nameValid) ||
              (step === 5 && (!locationValid || detectingLocation))
            }
            title={
              step === 1 && !nameValid
                ? "Enter at least 2 characters for your name"
                : step === 5 && !locationValid
                  ? "Enter city and state (e.g. Medford, Oregon) or use your location"
                  : undefined
            }
            onClick={() => void handleNext()}
          >
            {savingProgress ? "Saving…" : "Continue →"}
          </button>
        ) : (
          <button
            type="button"
            className="create-profile-btn create-profile-btn--next"
            disabled={completeProfileDisabled}
            onClick={() => void handleCompleteProfile()}
          >
            {loading || savingProfileDraft ? "Saving…" : "Complete Profile →"}
          </button>
        )}
      </div>

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
