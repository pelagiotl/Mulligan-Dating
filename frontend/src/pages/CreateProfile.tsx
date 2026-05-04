import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { hasCityAndState, handleLocationChange } from "../utils/locationUtils";
import { getPhotoUrl } from "../utils/photoUrl";

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

const INTEREST_OPTIONS = [
  "Travel", "Music", "Sports", "Cooking", "Reading", "Movies", "Fitness", "Art",
  "Photography", "Dancing", "Gaming", "Hiking", "Yoga", "Writing", "Technology",
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
  const profileSavedRef = useRef(false);
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

  const photoCount = photoSlots.filter(Boolean).length;

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

  const saveProfileBeforePhotos = useCallback(async () => {
    await api.post("/profile", {
      displayName,
      age: parseInt(age, 10),
      gender,
      location,
      bio,
      lookingFor: null,
    });
    await new Promise((r) => setTimeout(r, 200));
    if (interests.length > 0) {
      await api.put("/profile/interests", {
        interests: interests.map((name) => ({ name })),
      });
    }
    await api.put("/profile/preferences", {
      minAge,
      maxAge: maxAge >= minAge && maxAge <= 120 ? maxAge : null,
      preferredGenders: preferredGendersPayload(preferredGenders),
      maxDistance,
      relationshipType: null,
    });
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
  ]);

  useEffect(() => {
    if (step < 11) {
      profileSavedRef.current = false;
      setProfileReadyForPhotos(false);
    }
  }, [step]);

  useEffect(() => {
    if (step !== 11 || profileSavedRef.current) return;
    profileSavedRef.current = true;
    setProfileReadyForPhotos(false);
    setError("");
    let cancelled = false;
    (async () => {
      try {
        await saveProfileBeforePhotos();
        if (cancelled) return;
        setProfileReadyForPhotos(true);
        try {
          const me = await api.get<{ photos: Array<{ id: string; url: string; displayOrder: number }> }>("/photos/me");
          const sorted = [...(me.photos || [])].sort((a, b) => a.displayOrder - b.displayOrder);
          if (sorted.length > 0 && !cancelled) {
            setPhotoSlots((prev) => {
              if (prev.some(Boolean)) return prev;
              const next = emptyPhotoSlots();
              sorted.forEach((ph, i) => {
                if (i < MAX_PHOTO_SLOTS) next[i] = { id: ph.id, url: ph.url };
              });
              return next;
            });
          }
        } catch {
          /* no photos yet */
        }
      } catch (err) {
        if (cancelled) return;
        profileSavedRef.current = false;
        const msg = err instanceof Error ? err.message : "Failed to save profile";
        const low = msg.toLowerCase();
        if (low.includes("authentication") || low.includes("401")) {
          setError("Session issue while saving. Please try Continue again or log in.");
        } else {
          setError(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, saveProfileBeforePhotos]);

  useEffect(() => {
    const load = async () => {
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
          setDisplayName(data.profile.display_name);
          setAge(String(data.profile.age));
          setGender(data.profile.gender);
          setLocation(data.profile.location || "");
          setBio(data.profile.bio || "");
        }
        if (data.interests?.length) {
          setInterests(data.interests.map((i) => i.name));
        }
        if (data.preferences) {
          setMinAge(data.preferences.min_age);
          if (data.preferences.max_age != null) {
            setMaxAge(data.preferences.max_age);
          }
          setMaxDistance(data.preferences.max_distance ?? 50);
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
              setPreferredGenders(isEveryone ? ["Everyone"] : withoutOther);
            } catch {
              setPreferredGenders(["Everyone"]);
            }
          } else {
            setPreferredGenders(["Everyone"]);
          }
        }

        try {
          const me = await api.get<{ photos: Array<{ id: string; url: string; displayOrder: number }> }>("/photos/me");
          const sorted = [...(me.photos || [])].sort((a, b) => a.displayOrder - b.displayOrder);
          if (sorted.length > 0) {
            setPhotoSlots(() => {
              const next = emptyPhotoSlots();
              sorted.forEach((ph, i) => {
                if (i < MAX_PHOTO_SLOTS) next[i] = { id: ph.id, url: ph.url };
              });
              return next;
            });
          }
        } catch {
          /* ignore */
        }
      } catch {
        /* new user */
      }
    };
    void load();
  }, []);

  const handleNext = () => {
    if (step === 1) {
      if (!displayName?.trim() || displayName.trim().length < 2) {
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
      if (!hasCityAndState(location)) {
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

    setError("");
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
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
      const uploaded = await uploadOnePhoto(file);
      setPhotoSlots((prev) => {
        const next = [...prev];
        next[slot] = uploaded;
        return next;
      });
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
      setPhotoSlots((prev) => {
        const next = [...prev];
        next[slotIndex] = null;
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo");
    }
  };

  const handleCompleteProfile = async () => {
    setError("");
    if (!profileReadyForPhotos) {
      setError("Still saving your profile—please wait a moment.");
      return;
    }
    if (photoCount < MIN_PHOTOS_REQUIRED) {
      setError(`Please upload at least ${MIN_PHOTOS_REQUIRED} photos to complete your profile`);
      return;
    }
    setLoading(true);
    try {
      await api.post("/profile", {
        displayName,
        age: parseInt(age, 10),
        gender,
        location,
        bio,
        lookingFor: null,
      });
      if (interests.length > 0) {
        await api.put("/profile/interests", {
          interests: interests.map((name) => ({ name })),
        });
      }
      await api.put("/profile/preferences", {
        minAge,
        maxAge: maxAge >= minAge && maxAge <= 120 ? maxAge : null,
        preferredGenders: preferredGendersPayload(preferredGenders),
        maxDistance,
        relationshipType: null,
      });
      await refreshProfile();
      setShowProfileReadySplash(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setLoading(false);
    }
  };

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
            displayName.trim().length >= 2 ? <span>✓ Great! Tap Continue</span> : null
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
            "🔗",
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
            hasCityAndState(location) ? <span>✓ Location set! Tap Continue</span> : null
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
              {!profileReadyForPhotos ? (
                <p className="create-profile-photos-saving">Saving your profile…</p>
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
            disabled={step === 5 && (!hasCityAndState(location) || detectingLocation)}
            title={
              step === 5 && !hasCityAndState(location)
                ? "Enter city and state (e.g. Medford, Oregon) or use your location"
                : undefined
            }
            onClick={handleNext}
          >
            Continue →
          </button>
        ) : (
          <button
            type="button"
            className="create-profile-btn create-profile-btn--next"
            disabled={loading || !profileReadyForPhotos || photoCount < MIN_PHOTOS_REQUIRED}
            onClick={() => void handleCompleteProfile()}
          >
            {loading ? "Saving…" : "Complete Profile →"}
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
          <div className="create-profile-ready-card">
            <h2 id="profile-ready-title">Nice — you&apos;re in.</h2>
            <p className="create-profile-ready-sub">
              Your profile&apos;s live. When you&apos;re ready, we&apos;ll show you people you might actually click with —
              low stakes, your pace.
            </p>
            <button
              type="button"
              className="create-profile-btn create-profile-btn--next create-profile-ready-cta"
              onClick={() => navigate("/browse", { replace: true })}
            >
              Let&apos;s go →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
