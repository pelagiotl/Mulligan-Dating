import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { api } from "../utils/api";
import PhotoUpload from "../components/PhotoUpload";
import ProfilePerimeterBorder from "../components/ProfilePerimeterBorder";
import MyProfilePreviewModal, {
  parsePreferredGendersJson,
  parseProfileValues,
  type MyProfilePreviewData,
} from "../components/MyProfilePreviewModal";
import { getPhotoUrl } from "../utils/photoUrl";
import { hasCityAndState } from "../utils/locationUtils";
import { dispatchProfileEnhancementRefresh } from "../constants/profileEnhancementEvents";
import { LIFESTYLE_FIELD_LABEL, getInterestEmoji } from "../constants/profileMySections";
import { displayProfileGender } from "../utils/createProfileProgress";
import { useAuth } from "../context/AuthContext";
import {
  clampMaxDistanceMiles,
  formatMaxDistanceLabel,
  MAX_DISTANCE_SELECT_OPTIONS,
} from "../constants/matchingDistance";

const PREFERRED_GENDER_LABELS: Record<string, string> = {
  Man: "Men",
  Woman: "Women",
  Everyone: "Everyone",
};

const GENDER_OPTIONS = ["Man", "Woman", "Other"] as const;
const GENDER_OPTION_META: Record<(typeof GENDER_OPTIONS)[number], { emoji: string; sub: string }> = {
  Man: { emoji: "👨", sub: "I am a man" },
  Woman: { emoji: "👩", sub: "I am a woman" },
  Other: { emoji: "✨", sub: "Another identity" },
};

const AGE_QUICK_PICKS = [18, 21, 24, 25, 28, 30, 32, 35, 38, 40, 45, 50, 55, 60] as const;

/** Short labels under each mileage chip (max distance modal). */
const MAX_DISTANCE_META: Record<string, { tag: string }> = {
  "10": { tag: "Around town" },
  "25": { tag: "City & nearby" },
  "50": { tag: "Metro area" },
  "100": { tag: "Regional max" },
};

/** Canonical values stored in `looking_for` (profile API). */
const LOOKING_FOR_OPTIONS = [
  "Relationship",
  "Something casual",
  "Friendship",
  "Not sure yet",
] as const;

const LOOKING_FOR_META: Record<(typeof LOOKING_FOR_OPTIONS)[number], { emoji: string; sub: string }> = {
  Relationship: { emoji: "💘", sub: "Long-term and meaningful" },
  "Something casual": { emoji: "🥂", sub: "Low-pressure and fun" },
  Friendship: { emoji: "🫶", sub: "New friends and connections" },
  "Not sure yet": { emoji: "✨", sub: "Open to seeing where it goes" },
};

function isCanonicalLookingFor(v: string | null | undefined): v is (typeof LOOKING_FOR_OPTIONS)[number] {
  return !!v && (LOOKING_FOR_OPTIONS as readonly string[]).includes(v);
}

interface ProfileData {
  profile: {
    id: string;
    display_name: string;
    age: number;
    gender: string;
    location: string | null;
    bio: string | null;
    photo_url: string | null;
    looking_for: string | null;
  };
  interests: Array<{ name: string; category: string | null }>;
  preferences: {
    min_age: number;
    max_age: number | null;
    preferred_genders: string | null;
    max_distance: number | null;
    relationship_type: string | null;
    values?: string | null;
  } | null;
  dealbreakers: Array<{ description: string; category: string | null }>;
  partnerQualities: Array<{ quality: string; importance: number }>;
  lifestyle: {
    smoking: string | null;
    drinking: string | null;
    children: string | null;
    pets: string | null;
    religion: string | null;
    political: string | null;
    work_life_balance: string | null;
    works_out: string | null;
  } | null;
}

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface SettingsRow {
  createdAt: string;
  lastActiveAt: string | null;
  showActiveStatus?: boolean;
}

function formatPreferredMatchesLabel(preferredGendersJson: string | null | undefined): string {
  if (!preferredGendersJson) return "Everyone";
  try {
    const arr = (JSON.parse(preferredGendersJson) as string[]).filter(
      (g) => g === "Man" || g === "Woman" || g === "Everyone"
    );
    if (!arr.length || arr.includes("Everyone")) return "Everyone";
    return arr.map((g) => PREFERRED_GENDER_LABELS[g] ?? g).join(", ");
  } catch {
    return "Everyone";
  }
}

function parsePreferredGendersInitial(raw: string | null | undefined): string[] {
  if (!raw) return ["Everyone"];
  try {
    const rawArr = JSON.parse(raw) as string[];
    let initial = rawArr.filter((g) => g === "Man" || g === "Woman" || g === "Everyone");
    const hadLegacyOther = rawArr.includes("Other");
    const hadLegacyAllThree =
      rawArr.length === 3 && ["Man", "Woman", "Other"].every((g) => rawArr.includes(g));
    if (hadLegacyAllThree || (hadLegacyOther && initial.length === 0)) initial = ["Everyone"];
    if (initial.length === 0) initial = ["Everyone"];
    return initial;
  } catch {
    return ["Everyone"];
  }
}

/** Web profile modal uses everyone | men-only | women-only selection. */
type PreferredMatchesChoice = "everyone" | "men" | "women";

function preferredChoiceFromSelection(genders: string[]): PreferredMatchesChoice {
  const everyone = genders.includes("Everyone");
  const hasMan = genders.includes("Man");
  const hasWoman = genders.includes("Woman");
  if (everyone || (hasMan && hasWoman)) return "everyone";
  if (hasMan) return "men";
  if (hasWoman) return "women";
  return "everyone";
}

function preferredGendersForChoice(choice: PreferredMatchesChoice): string[] {
  if (choice === "everyone") return ["Everyone"];
  if (choice === "men") return ["Man"];
  return ["Woman"];
}

const INTEREST_EDIT_OPTIONS = [
  "Travel", "Music", "Sports", "Cooking", "Reading", "Movies", "Fitness", "Art",
  "Photography", "Dancing", "Gaming", "Fortnite", "Hiking", "Yoga", "Writing", "Technology",
  "Fashion", "Animals", "Volunteering", "Coffee", "Nightlife", "Comedy",
  "Beach", "Camping", "Board Games", "Tattoos", "Meditation", "History", "Science",
  "Business", "Education",
] as const;

const INTEREST_EDIT_EMOJIS: Record<string, string> = {
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

/** Same labels as interests so browse + compatibility can align "what I want" with their interests. */
const PARTNER_QUALITY_EDIT_OPTIONS = INTEREST_EDIT_OPTIONS;

function isCanonicalPartnerQuality(v: string): v is (typeof INTEREST_EDIT_OPTIONS)[number] {
  return (INTEREST_EDIT_OPTIONS as readonly string[]).includes(v);
}

const DEALBREAKER_SUGGESTIONS = [
  "Smokes cigarettes",
  "Frequent drinking",
  "Doesn't want children",
  "Wants children",
  "Doesn't workout",
  "Doesn't like pets",
  "Religious",
  "Political",
  "Doesn't play Fortnite",
] as const;

/** Only these preset dealbreakers are editable in the web profile UI. */
const DEALBREAKER_CANONICAL_SET = new Set<string>(DEALBREAKER_SUGGESTIONS);

const DEALBREAKER_EMOJI: Record<(typeof DEALBREAKER_SUGGESTIONS)[number], string> = {
  "Smokes cigarettes": "🚬",
  "Frequent drinking": "🍷",
  "Doesn't want children": "👶❌",
  "Wants children": "👪",
  "Doesn't workout": "🛋️",
  "Doesn't like pets": "🐕❌",
  Religious: "⛪",
  Political: "🗳️",
  "Doesn't play Fortnite": "⛏️",
};

function canonicalDealbreakerLabel(raw: string | null | undefined): (typeof DEALBREAKER_SUGGESTIONS)[number] | null {
  if (!raw?.trim()) return null;
  const t = raw.trim().toLowerCase();
  const found = DEALBREAKER_SUGGESTIONS.find((s) => s.toLowerCase() === t);
  return found ?? null;
}

const LIFESTYLE_FIELD_OPTIONS = {
  smoking: ["", "Non-smoker", "Social smoker", "Smoker", "Trying to quit", "Prefer not to say"],
  drinking: ["", "Non-drinker", "Socially", "Regularly", "Sober-curious", "Prefer not to say"],
  children: ["", "Want kids", "Don’t want kids", "Open to either", "Have kids", "Prefer not to say"],
  pets: ["", "Love pets", "Allergic", "No pets", "Open to pets", "Prefer not to say"],
  religion: ["", "Very important", "Somewhat important", "Spiritual not religious", "Not important", "Prefer not to say"],
  political: ["", "Very important", "Somewhat important", "Prefer not political", "Not important", "Prefer not to say"],
  workLifeBalance: ["", "Career-focused", "Balanced", "Life-first", "Flexible", "Prefer not to say"],
  worksOut: ["", "Daily", "Often", "Sometimes", "Rarely", "Prefer not to say"],
} as const;

type LifestyleFieldKey = keyof typeof LIFESTYLE_FIELD_OPTIONS;

const LIFESTYLE_SECTION_EMOJI: Record<LifestyleFieldKey, string> = {
  smoking: "🚭",
  drinking: "🥂",
  children: "👶",
  pets: "🐾",
  religion: "✨",
  political: "🗳️",
  workLifeBalance: "⚖️",
  worksOut: "💪",
};

/** Emoji shown next to each select option (empty = not set). */
const LIFESTYLE_OPTION_EMOJI: Record<LifestyleFieldKey, Record<string, string>> = {
  smoking: {
    "": "◻️",
    "Non-smoker": "🚭",
    "Social smoker": "🌬️",
    "Smoker": "🚬",
    "Trying to quit": "🌱",
    "Prefer not to say": "🤫",
  },
  drinking: {
    "": "◻️",
    "Non-drinker": "🧊",
    "Socially": "🥂",
    "Regularly": "🍺",
    "Sober-curious": "🫧",
    "Prefer not to say": "🤫",
  },
  children: {
    "": "◻️",
    "Want kids": "👶",
    "Don’t want kids": "✋",
    "Open to either": "🤝",
    "Have kids": "👨‍👧",
    "Prefer not to say": "🤫",
  },
  pets: {
    "": "◻️",
    "Love pets": "😻",
    "Allergic": "🤧",
    "No pets": "🏠",
    "Open to pets": "🐕",
    "Prefer not to say": "🤫",
  },
  religion: {
    "": "◻️",
    "Very important": "⛪",
    "Somewhat important": "🙏",
    "Spiritual not religious": "🌙",
    "Not important": "➖",
    "Prefer not to say": "🤫",
  },
  political: {
    "": "◻️",
    "Very important": "📣",
    "Somewhat important": "📰",
    "Prefer not political": "🤝",
    "Not important": "➖",
    "Prefer not to say": "🤫",
  },
  workLifeBalance: {
    "": "◻️",
    "Career-focused": "💼",
    "Balanced": "⚖️",
    "Life-first": "🌴",
    "Flexible": "🔄",
    "Prefer not to say": "🤫",
  },
  worksOut: {
    "": "◻️",
    "Daily": "🔥",
    "Often": "💪",
    "Sometimes": "🚶",
    "Rarely": "🛋️",
    "Prefer not to say": "🤫",
  },
};

function lifestyleSelectOptionLabel(field: LifestyleFieldKey, value: string): string {
  if (value === "") {
    const e = LIFESTYLE_OPTION_EMOJI[field][""] ?? "◻️";
    return `${e} Not set — skip/keep private`;
  }
  const emoji = LIFESTYLE_OPTION_EMOJI[field][value] ?? "•";
  return `${emoji} ${value}`;
}

type LifestyleForm = {
  smoking: string;
  drinking: string;
  children: string;
  pets: string;
  religion: string;
  political: string;
  workLifeBalance: string;
  worksOut: string;
};

const LIFESTYLE_SUMMARY_FIELDS: Array<{
  key: LifestyleFieldKey;
  apiField: keyof NonNullable<ProfileData["lifestyle"]>;
}> = [
  { key: "smoking", apiField: "smoking" },
  { key: "drinking", apiField: "drinking" },
  { key: "children", apiField: "children" },
  { key: "pets", apiField: "pets" },
  { key: "religion", apiField: "religion" },
  { key: "political", apiField: "political" },
  { key: "workLifeBalance", apiField: "work_life_balance" },
  { key: "worksOut", apiField: "works_out" },
];

function lifestyleValueEmoji(field: LifestyleFieldKey, value: string): string {
  return LIFESTYLE_OPTION_EMOJI[field][value] ?? LIFESTYLE_SECTION_EMOJI[field];
}

function lifestyleFormFromApi(l: ProfileData["lifestyle"]): LifestyleForm {
  if (!l) {
    return {
      smoking: "",
      drinking: "",
      children: "",
      pets: "",
      religion: "",
      political: "",
      workLifeBalance: "",
      worksOut: "",
    };
  }
  return {
    smoking: l.smoking || "",
    drinking: l.drinking || "",
    children: l.children || "",
    pets: l.pets || "",
    religion: l.religion || "",
    political: l.political || "",
    workLifeBalance: l.work_life_balance || "",
    worksOut: l.works_out || "",
  };
}

export default function MyProfile() {
  const location = useLocation();
  const { refreshProfile } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showDistanceModal, setShowDistanceModal] = useState(false);
  const [showPreferredModal, setShowPreferredModal] = useState(false);
  const [showLookingForModal, setShowLookingForModal] = useState(false);
  const [showBioModal, setShowBioModal] = useState(false);
  const [editAge, setEditAge] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editMaxDistance, setEditMaxDistance] = useState<number | null>(50);
  const [editPreferredGenders, setEditPreferredGenders] = useState<string[]>(["Everyone"]);
  const [editLookingFor, setEditLookingFor] = useState("");
  const [editBio, setEditBio] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [updatingField, setUpdatingField] = useState(false);
  const [updatingActiveStatus, setUpdatingActiveStatus] = useState(false);

  const [showInterestsModal, setShowInterestsModal] = useState(false);
  const [editInterests, setEditInterests] = useState<string[]>([]);
  const [showDealbreakersModal, setShowDealbreakersModal] = useState(false);
  const [editDealbreakers, setEditDealbreakers] = useState<string[]>([]);
  const [showQualitiesModal, setShowQualitiesModal] = useState(false);
  const [editQualities, setEditQualities] = useState<string[]>([]);
  const [showLifestyleModal, setShowLifestyleModal] = useState(false);
  const [editLifestyle, setEditLifestyle] = useState<LifestyleForm>(() => lifestyleFormFromApi(null));
  const [showAvatarLightbox, setShowAvatarLightbox] = useState(false);
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  /** Restore scroll by re-aligning a profile section to its pre-edit viewport offset. */
  const pendingRestoreScrollRef = useRef<{ anchorId: string; offsetTop: number } | null>(null);

  const captureProfileScrollAnchor = (anchorId: string) => {
    const el = document.getElementById(anchorId);
    pendingRestoreScrollRef.current = {
      anchorId,
      offsetTop: el ? el.getBoundingClientRect().top : 0,
    };
  };

  const restoreCapturedScrollPosition = () => {
    const snapshot = pendingRestoreScrollRef.current;
    if (!snapshot) return;
    const { anchorId, offsetTop } = snapshot;
    pendingRestoreScrollRef.current = null;

    const applyRestore = () => {
      const el = document.getElementById(anchorId);
      if (!el) return;
      const delta = el.getBoundingClientRect().top - offsetTop;
      if (Math.abs(delta) < 2) return;

      window.scrollBy({ top: delta, left: 0, behavior: "auto" });

      const mainContent = document.querySelector<HTMLElement>(
        ".app-layout--native-mobile-shell .main-content"
      );
      if (mainContent && mainContent.scrollHeight > mainContent.clientHeight + 1) {
        mainContent.scrollTop += delta;
      }
    };

    // Re-apply after modal close + async profile refresh reflow.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyRestore();
        [50, 150, 320].forEach((ms) => setTimeout(applyRestore, ms));
      });
    });
  };

  useEffect(() => {
    if (!showAvatarLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAvatarLightbox(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAvatarLightbox]);

  useEffect(() => {
    if (loading || !data) return;
    const hash = location.hash.replace(/^#/, "").trim();
    if (!hash) return;
    const scrollToHash = () => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const t = window.setTimeout(scrollToHash, 180);
    return () => window.clearTimeout(t);
  }, [loading, data, location.hash]);

  const fetchPhotos = async () => {
    try {
      const res = await api.get<{ photos: Photo[] }>("/photos/me");
      setPhotos(res.photos || []);
    } catch {
      setPhotos([]);
    }
  };

  const fetchSettings = async () => {
    try {
      const s = await api.get<SettingsRow>("/settings");
      setSettings(s);
    } catch {
      setSettings(null);
    }
  };

  useEffect(() => {
    setError("");
    setLoading(true);
    fetchProfile();
    fetchPhotos();
    fetchSettings();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const fetchProfile = async () => {
    try {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
      const profileData = await api.get<ProfileData>("/profile");
      if (abortControllerRef.current?.signal.aborted) return;
      setData(profileData);
      setError("");
    } catch (err: unknown) {
      if (
        (err as { name?: string })?.name === "AbortError" ||
        abortControllerRef.current?.signal.aborted
      ) {
        return;
      }
      const e = err as { status?: number; message?: string };
      if (e?.status === 404) {
        setError("");
        setData(null);
      } else {
        setError(e?.message || "Failed to load profile");
      }
    } finally {
      if (!abortControllerRef.current?.signal.aborted) setLoading(false);
    }
  };

  const mergePrefsForPut = () => {
    const prefs = data?.preferences;
    let preferredGenders: string[] | null = null;
    if (prefs?.preferred_genders) {
      try {
        preferredGenders = JSON.parse(prefs.preferred_genders) as string[];
      } catch {
        preferredGenders = null;
      }
    }
    return {
      minAge: prefs?.min_age ?? null,
      maxAge: prefs?.max_age ?? null,
      preferredGenders: preferredGenders ?? null,
      maxDistance: prefs?.max_distance ?? null,
    };
  };

  const toggleActiveStatus = async () => {
    if (!settings || updatingActiveStatus) return;
    const next = !(settings.showActiveStatus !== false);
    setUpdatingActiveStatus(true);
    try {
      await api.put("/settings/active-status", { showActiveStatus: next });
      setSettings((prev) => (prev ? { ...prev, showActiveStatus: next } : null));
      await refreshProfile();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update active status visibility.");
    } finally {
      setUpdatingActiveStatus(false);
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setError("Location is not supported in this browser.");
      return;
    }
    setDetectingLocation(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
            { headers: { "User-Agent": "Mulligan-Dating-Web/1.0" } }
          );
          if (!response.ok) throw new Error("Failed to reverse geocode");
          const geo = await response.json();
          const address = geo.address || {};
          const city =
            address.city ||
            address.town ||
            address.village ||
            address.municipality ||
            address.county ||
            "";
          const state =
            address.state ||
            address.region ||
            address.province ||
            address["ISO3166-2-lvl4"] ||
            "";
          if (city && state) setEditLocation(`${city}, ${state}`);
          else if (city) setEditLocation(city);
          else setEditLocation(geo.display_name || "");
        } catch (e: unknown) {
          setError((e as Error)?.message || "Could not detect location.");
        } finally {
          setDetectingLocation(false);
        }
      },
      () => {
        setDetectingLocation(false);
        setError("Location permission denied or unavailable.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const postProfileFields = async (fields: {
    age?: number;
    gender?: string;
    location?: string | null;
    bio?: string | null;
    lookingFor?: string | null;
  }) => {
    if (!data?.profile) return;
    await api.post("/profile", {
      displayName: data.profile.display_name,
      age: fields.age ?? data.profile.age,
      gender: fields.gender ?? data.profile.gender,
      location: fields.location !== undefined ? fields.location : data.profile.location ?? null,
      bio: fields.bio !== undefined ? fields.bio : data.profile.bio ?? null,
      lookingFor:
        fields.lookingFor !== undefined ? fields.lookingFor : data.profile.looking_for ?? null,
    });
  };

  const saveDisplayName = async () => {
    if (!data?.profile) return;
    const name = editDisplayName.trim();
    if (name.length < 2) {
      setError("Please enter at least 2 characters.");
      return;
    }
    if (name.length > 50) {
      setError("Please keep your name under 50 characters.");
      return;
    }
    setUpdatingField(true);
    setError("");
    try {
      await api.put("/profile/basics", { displayName: name });
      setData((prev) =>
        prev ? { ...prev, profile: { ...prev.profile, display_name: name } } : null
      );
      setShowNameModal(false);
      await refreshProfile();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update name.");
    } finally {
      setUpdatingField(false);
    }
  };

  const saveAge = async () => {
    if (!data?.profile) return;
    const ageNum = parseInt(editAge.trim(), 10);
    if (Number.isNaN(ageNum) || ageNum < 18 || ageNum > 120) {
      setError("Enter an age between 18 and 120.");
      return;
    }
    setUpdatingField(true);
    setError("");
    try {
      await postProfileFields({ age: ageNum });
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, age: ageNum } } : null));
      setShowAgeModal(false);
      await refreshProfile();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update age.");
    } finally {
      setUpdatingField(false);
    }
  };

  const saveGender = async () => {
    if (!data?.profile) return;
    const gender = editGender.trim();
    if (!GENDER_OPTIONS.includes(gender as (typeof GENDER_OPTIONS)[number])) {
      setError("Please choose Man, Woman, or Other.");
      return;
    }
    setUpdatingField(true);
    setError("");
    try {
      await postProfileFields({ gender });
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, gender } } : null));
      setShowGenderModal(false);
      await refreshProfile();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update gender.");
    } finally {
      setUpdatingField(false);
    }
  };

  const saveLocation = async () => {
    if (!data?.profile) return;
    const loc = editLocation.trim() || null;
    if (loc && !hasCityAndState(loc)) {
      setError("Please enter city and state (e.g. Medford, Oregon).");
      return;
    }
    setUpdatingField(true);
    setError("");
    try {
      await postProfileFields({ location: loc });
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, location: loc } } : null));
      setShowLocationModal(false);
      await refreshProfile();
      restoreCapturedScrollPosition();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update location.");
    } finally {
      setUpdatingField(false);
    }
  };

  const saveMaxDistance = async () => {
    if (!data?.profile) return;
    setUpdatingField(true);
    setError("");
    try {
      const base = mergePrefsForPut();
      const savedDistance = clampMaxDistanceMiles(editMaxDistance);
      await api.put("/profile/preferences", {
        ...base,
        maxDistance: savedDistance,
      });
      setData((prev) =>
        prev?.preferences
          ? { ...prev, preferences: { ...prev.preferences, max_distance: savedDistance } }
          : prev
      );
      setShowDistanceModal(false);
      await refreshProfile();
      restoreCapturedScrollPosition();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update max distance.");
    } finally {
      setUpdatingField(false);
    }
  };

  const savePreferredGenders = async () => {
    if (!data?.profile) return;
    setUpdatingField(true);
    setError("");
    try {
      const prefs = data.preferences;
      const cleaned = editPreferredGenders.filter((g) => g === "Man" || g === "Woman");
      const payload =
        editPreferredGenders.includes("Everyone") || editPreferredGenders.length === 0 || cleaned.length === 0
          ? null
          : cleaned;
      await api.put("/profile/preferences", {
        minAge: prefs?.min_age ?? null,
        maxAge: prefs?.max_age ?? null,
        preferredGenders: payload,
        maxDistance: prefs?.max_distance ?? null,
      });
      setData((prev) =>
        prev?.preferences
          ? {
              ...prev,
              preferences: {
                ...prev.preferences,
                preferred_genders: payload ? JSON.stringify(payload) : null,
              },
            }
          : prev
      );
      setShowPreferredModal(false);
      await refreshProfile();
      restoreCapturedScrollPosition();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update preferred matches.");
    } finally {
      setUpdatingField(false);
    }
  };

  const saveLookingFor = async () => {
    if (!data?.profile) return;
    const raw = editLookingFor.trim();
    const lookingFor = raw === "" ? null : raw;
    if (lookingFor !== null && !isCanonicalLookingFor(lookingFor)) {
      setError("Please choose one of the listed options.");
      return;
    }
    setUpdatingField(true);
    setError("");
    try {
      await postProfileFields({ lookingFor });
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, looking_for: lookingFor } } : null));
      setShowLookingForModal(false);
      await refreshProfile();
      dispatchProfileEnhancementRefresh();
      restoreCapturedScrollPosition();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update looking for.");
    } finally {
      setUpdatingField(false);
    }
  };

  const saveBio = async () => {
    if (!data?.profile) return;
    const val = editBio.trim() || null;
    setUpdatingField(true);
    setError("");
    try {
      await postProfileFields({ bio: val });
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, bio: val } } : null));
      setShowBioModal(false);
      await refreshProfile();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update bio.");
    } finally {
      setUpdatingField(false);
    }
  };

  const refreshProfileData = async () => {
    const next = await api.get<ProfileData>("/profile");
    setData(next);
    dispatchProfileEnhancementRefresh();
  };

  const saveInterests = async () => {
    if (editInterests.length < 3) {
      setError("Please pick at least 3 interests.");
      return;
    }
    setUpdatingField(true);
    setError("");
    try {
      await api.put("/profile/interests", {
        interests: editInterests.map((name) => ({ name })),
      });
      await refreshProfileData();
      setShowInterestsModal(false);
      await refreshProfile();
      restoreCapturedScrollPosition();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update interests.");
    } finally {
      setUpdatingField(false);
    }
  };

  const saveDealbreakers = async () => {
    setUpdatingField(true);
    setError("");
    try {
      await api.put("/profile/dealbreakers", {
        dealbreakers: editDealbreakers.filter((d) => DEALBREAKER_CANONICAL_SET.has(d)),
      });
      await refreshProfileData();
      setShowDealbreakersModal(false);
      await refreshProfile();
      restoreCapturedScrollPosition();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update dealbreakers.");
    } finally {
      setUpdatingField(false);
    }
  };

  const saveQualities = async () => {
    setUpdatingField(true);
    setError("");
    try {
      await api.put("/profile/partner-qualities", {
        qualities: editQualities.map((quality) => ({ quality, importance: 5 })),
      });
      await refreshProfileData();
      setShowQualitiesModal(false);
      await refreshProfile();
      restoreCapturedScrollPosition();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update what you're looking for.");
    } finally {
      setUpdatingField(false);
    }
  };

  const saveLifestyle = async () => {
    setUpdatingField(true);
    setError("");
    try {
      await api.put("/profile/lifestyle", {
        smoking: editLifestyle.smoking || null,
        drinking: editLifestyle.drinking || null,
        children: editLifestyle.children || null,
        pets: editLifestyle.pets || null,
        religion: editLifestyle.religion || null,
        political: editLifestyle.political || null,
        workLifeBalance: editLifestyle.workLifeBalance || null,
        worksOut: editLifestyle.worksOut || null,
      });
      await refreshProfileData();
      setShowLifestyleModal(false);
      await refreshProfile();
      restoreCapturedScrollPosition();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update lifestyle.");
    } finally {
      setUpdatingField(false);
    }
  };

  const toggleInterestEdit = (name: string) => {
    setEditInterests((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  };

  const toggleDealbreakerEdit = (text: string) => {
    if (!DEALBREAKER_CANONICAL_SET.has(text)) return;
    setEditDealbreakers((prev) =>
      prev.includes(text) ? prev.filter((x) => x !== text) : [...prev, text]
    );
  };
  const toggleQualityEdit = (q: string) => {
    setEditQualities((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]));
  };

  const profilePreviewData = useMemo((): MyProfilePreviewData | null => {
    if (!data?.profile) return null;
    const { profile, interests, dealbreakers, partnerQualities, lifestyle } = data;
    const prefs = data.preferences;
    return {
      displayName: profile.display_name,
      age: profile.age,
      gender: profile.gender,
      location: profile.location,
      bio: profile.bio,
      lookingFor: profile.looking_for,
      interests: interests.map((i) => i.name),
      dealbreakers: dealbreakers.map((d) => d.description),
      partnerQualities: partnerQualities.map((q) => ({
        quality: q.quality,
        importance: q.importance,
      })),
      preferredGenders: parsePreferredGendersJson(prefs?.preferred_genders),
      maxDistance: prefs?.max_distance ?? null,
      values: parseProfileValues(prefs?.values),
      lifestyle,
    };
  }, [data]);

  if (loading) {
    return <div className="loading-screen">Loading your profile...</div>;
  }

  if (!loading && !data) {
    return (
      <div className="no-profiles" style={{ padding: "2rem", textAlign: "center" }}>
        <div className="no-profiles-icon" style={{ fontSize: "4rem", marginBottom: "1rem" }}>
          😕
        </div>
        <p style={{ marginBottom: "1.5rem", fontSize: "1.2rem" }}>
          {error || "You haven't created your profile yet"}
        </p>
        <Link to="/create-profile" className="btn btn-primary mt-4" style={{ display: "inline-block" }}>
          Create Your Profile
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const { profile, interests, dealbreakers, partnerQualities, lifestyle } = data;
  const primaryPhoto = photos.find((p) => p.isPrimary) || photos[0];
  const profilePhotoUrl = primaryPhoto
    ? getPhotoUrl(primaryPhoto.url)
    : profile.photo_url
      ? getPhotoUrl(profile.photo_url)
      : null;

  const preferredMatchesChoice = preferredChoiceFromSelection(editPreferredGenders);

  return (
    <div className="my-profile native-app-screen">
      {error && (
        <div className="auth-error" style={{ maxWidth: 800, margin: "0 auto var(--space-4)" }}>
          {error}
        </div>
      )}

      <div className="my-profile-header">
        {profilePhotoUrl && (
          <button
            type="button"
            className="my-profile-avatar"
            aria-label={`View larger photo — ${profile.display_name}`}
            onClick={() => setShowAvatarLightbox(true)}
          >
            <img
              src={profilePhotoUrl}
              alt=""
              draggable={false}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </button>
        )}
        <div className="my-profile-info my-profile-identity">
          <button
            type="button"
            className="my-profile-name-edit"
            onClick={() => {
              captureProfileScrollAnchor("my-profile-display-name");
              setEditDisplayName(profile.display_name || "");
              setShowNameModal(true);
            }}
          >
            <h1 className="my-profile-name">{profile.display_name}</h1>
            <span className="my-profile-name-edit-hint">Tap to edit name</span>
          </button>

          {settings ? (
            <div className="my-profile-hero-row">
              <div className="my-profile-stats-row">
                <div className="my-profile-stat-card my-profile-stat-card--member">
                  <span className="my-profile-stat-emoji my-profile-stat-emoji--member" aria-hidden>
                    ✨
                  </span>
                  <span className="my-profile-stat-label">Member Since</span>
                  <span className="my-profile-stat-value">
                    {settings.createdAt
                      ? new Date(settings.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
                <button
                  type="button"
                  className="my-profile-stat-card my-profile-stat-card--active"
                  onClick={() => void toggleActiveStatus()}
                  disabled={updatingActiveStatus}
                >
                  <span className="my-profile-stat-emoji">🟢</span>
                  <span className="my-profile-stat-label">Last Active</span>
                  <span className="my-profile-stat-value">
                    {settings.lastActiveAt
                      ? new Date(settings.lastActiveAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "Just now"}
                  </span>
                  <span className="my-profile-stat-sub">
                    {settings.showActiveStatus !== false ? "Visible: On" : "Visible: Off"}
                  </span>
                  <span className="my-profile-stat-hint">Tap to toggle</span>
                </button>
              </div>
              <button
                type="button"
                className="my-profile-preview-btn"
                onClick={() => setShowProfilePreview(true)}
                aria-label="View how your profile appears to others"
              >
                <span className="my-profile-preview-btn__icon" aria-hidden>
                  👁
                </span>
                <span className="my-profile-preview-btn__copy">
                  <span className="my-profile-preview-btn__title">View my profile</span>
                  <span className="my-profile-preview-btn__sub">Preview as matches see you</span>
                </span>
                <span className="my-profile-preview-btn__chevron" aria-hidden>
                  ›
                </span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="my-profile-preview-btn my-profile-preview-btn--solo"
              onClick={() => setShowProfilePreview(true)}
              aria-label="View how your profile appears to others"
            >
              <span className="my-profile-preview-btn__icon" aria-hidden>
                👁
              </span>
              <span className="my-profile-preview-btn__copy">
                <span className="my-profile-preview-btn__title">View my profile</span>
                <span className="my-profile-preview-btn__sub">Preview as matches see you</span>
              </span>
              <span className="my-profile-preview-btn__chevron" aria-hidden>
                ›
              </span>
            </button>
          )}

          <section className="my-profile-identity-section" aria-labelledby="my-profile-basics-heading">
            <h2 id="my-profile-basics-heading" className="my-profile-identity-section-title">
              <span className="my-profile-identity-section-title-icon" aria-hidden>
                ✦
              </span>
              Basics
            </h2>
            <div className="my-profile-info-grid">
              <button
                type="button"
                id="my-profile-age"
                className="my-profile-mini-card my-profile-mini-card--age"
                onClick={() => {
                  captureProfileScrollAnchor("my-profile-age");
                  setEditAge(String(profile.age));
                  setShowAgeModal(true);
                }}
              >
                <span className="my-profile-mini-emoji my-profile-mini-emoji--age" aria-hidden>
                  🎂
                </span>
                <span className="my-profile-mini-label">Age</span>
                <span className="my-profile-mini-value">{profile.age}</span>
                <span className="my-profile-mini-hint">Tap to update</span>
              </button>
              <button
                type="button"
                id="my-profile-gender"
                className="my-profile-mini-card my-profile-mini-card--gender"
                onClick={() => {
                  captureProfileScrollAnchor("my-profile-gender");
                  setEditGender(profile.gender || "");
                  setShowGenderModal(true);
                }}
              >
                <span className="my-profile-mini-emoji my-profile-mini-emoji--gender" aria-hidden>
                  ⚧️
                </span>
                <span className="my-profile-mini-label">Gender</span>
                <span className="my-profile-mini-value">{displayProfileGender(profile.gender)}</span>
                <span className="my-profile-mini-hint">Tap to update</span>
              </button>
            </div>
          </section>

          <section
            className="my-profile-identity-section my-profile-identity-section--matching"
            aria-labelledby="my-profile-matching-heading"
          >
            <h2 id="my-profile-matching-heading" className="my-profile-identity-section-title">
              <span className="my-profile-identity-section-title-icon" aria-hidden>
                💫
              </span>
              Matching preferences
            </h2>
            <p className="my-profile-identity-section-lead">
              Who you want to meet and where — tap any row to update.
            </p>
            <div className="my-profile-prefs-panel">
              <div className="my-profile-prefs-grid">
              <button
                type="button"
                id="my-profile-location"
                className="my-profile-pref-field my-profile-pref-field--location"
                onClick={() => {
                  captureProfileScrollAnchor("my-profile-location");
                  setEditLocation(profile.location || "");
                  setShowLocationModal(true);
                }}
              >
                <span
                  className="my-profile-pref-field-emoji my-profile-pref-field-emoji--location"
                  aria-hidden
                >
                  📍
                </span>
                <span className="my-profile-pref-field-body">
                  <span className="my-profile-pref-field-label">Location</span>
                  <span className="my-profile-pref-field-value">
                    {profile.location || "Not set yet"}
                  </span>
                </span>
                <span className="my-profile-pref-field-chevron" aria-hidden>
                  ›
                </span>
              </button>
              <button
                type="button"
                id="my-profile-max-distance"
                className="my-profile-pref-field my-profile-pref-field--distance"
                onClick={() => {
                  captureProfileScrollAnchor("my-profile-max-distance");
                  setEditMaxDistance(clampMaxDistanceMiles(data.preferences?.max_distance ?? 50));
                  setShowDistanceModal(true);
                }}
              >
                <span
                  className="my-profile-pref-field-emoji my-profile-pref-field-emoji--distance"
                  aria-hidden
                >
                  📏
                </span>
                <span className="my-profile-pref-field-body">
                  <span className="my-profile-pref-field-label">Max distance</span>
                  <span className="my-profile-pref-field-value">
                    {formatMaxDistanceLabel(data.preferences?.max_distance)}
                  </span>
                </span>
                <span className="my-profile-pref-field-chevron" aria-hidden>
                  ›
                </span>
              </button>
              <button
                type="button"
                id="my-profile-preferred-matches"
                className="my-profile-pref-field my-profile-pref-field--preferred"
                onClick={() => {
                  captureProfileScrollAnchor("my-profile-preferred-matches");
                  setEditPreferredGenders(parsePreferredGendersInitial(data.preferences?.preferred_genders));
                  setShowPreferredModal(true);
                }}
              >
                <span
                  className="my-profile-pref-field-emoji my-profile-pref-field-emoji--preferred"
                  aria-hidden
                >
                  💕
                </span>
                <span className="my-profile-pref-field-body">
                  <span className="my-profile-pref-field-label">Preferred matches</span>
                  <span className="my-profile-pref-field-value">
                    {formatPreferredMatchesLabel(data.preferences?.preferred_genders ?? null)}
                  </span>
                </span>
                <span className="my-profile-pref-field-chevron" aria-hidden>
                  ›
                </span>
              </button>
              <button
                type="button"
                id="my-profile-looking-for"
                className="my-profile-pref-field my-profile-pref-field--looking"
                onClick={() => {
                  captureProfileScrollAnchor("my-profile-looking-for");
                  const cur = profile.looking_for ?? "";
                  setEditLookingFor(isCanonicalLookingFor(cur) ? cur : "");
                  setShowLookingForModal(true);
                }}
              >
                <span
                  className="my-profile-pref-field-emoji my-profile-pref-field-emoji--looking"
                  aria-hidden
                >
                  ❤️
                </span>
                <span className="my-profile-pref-field-body">
                  <span className="my-profile-pref-field-label">Looking for</span>
                  <span className="my-profile-pref-field-value">
                    {profile.looking_for?.trim() ? profile.looking_for : "Tap to choose"}
                  </span>
                </span>
                <span className="my-profile-pref-field-chevron" aria-hidden>
                  ›
                </span>
              </button>
              </div>
            </div>
          </section>

          <section
            className="my-profile-identity-section my-profile-identity-section--about"
            aria-labelledby="my-profile-about-heading"
          >
            <h2 id="my-profile-about-heading" className="my-profile-identity-section-title">
              <span className="my-profile-identity-section-title-icon" aria-hidden>
                ✍️
              </span>
              About me
            </h2>
            <button
              type="button"
              className="my-profile-bio-block my-profile-bio-block--identity"
              onClick={() => {
                setEditBio(profile.bio || "");
                setShowBioModal(true);
              }}
            >
              <span className="my-profile-bio-block-accent" aria-hidden />
              <div className="my-profile-bio-block-inner">
                <span
                  className="my-profile-bio-block-icon-tile my-profile-bio-block-icon-tile--animated"
                  aria-hidden
                >
                  💬
                </span>
                <div className="my-profile-bio-block-main">
                  <span className="my-profile-bio-block-kicker">Your story</span>
                  <div className="my-profile-bio-body">
                    <p
                      className={
                        profile.bio
                          ? "my-profile-bio-text"
                          : "my-profile-bio-text my-profile-bio-placeholder"
                      }
                    >
                      {profile.bio ||
                        "Share what makes you you — interests, humor, what you are looking for."}
                    </p>
                  </div>
                  <span className="my-profile-bio-block-hint">Tap to edit</span>
                </div>
                <span className="my-profile-bio-block-chevron" aria-hidden>
                  ›
                </span>
              </div>
            </button>
          </section>
        </div>
      </div>

      <ProfilePerimeterBorder delay={700} variant="photos">
      <div className="profile-detail-section" id="my-photos">
        <h2 className="profile-detail-title">
          <span>📸</span> My Photos
        </h2>
        <PhotoUpload
          onPhotosUpdated={(kind) => {
            void fetchPhotos();
            if (kind !== "reorder") {
              void fetchProfile();
              dispatchProfileEnhancementRefresh();
            }
          }}
        />
      </div>
      </ProfilePerimeterBorder>

      <ProfilePerimeterBorder delay={900} variant="interests">
      <div className="profile-detail-section" id="my-interests">
        <div className="profile-detail-title-row">
          <h2 className="profile-detail-title">
            <span>🎯</span> My Interests
          </h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              captureProfileScrollAnchor("my-interests");
              setEditInterests(interests.map((i) => i.name));
              setShowInterestsModal(true);
            }}
          >
            Edit
          </button>
        </div>
        {interests.length > 0 ? (
          <div className="profile-card-interests">
            {interests.map((interest, idx) => (
              <span key={idx} className="interest-tag interest-tag--profile">
                <span className="interest-tag__emoji" aria-hidden>
                  {getInterestEmoji(interest.name)}
                </span>
                {interest.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="my-profile-empty-hint">No interests yet — tap Edit to add (pick at least 3).</p>
        )}
      </div>
      </ProfilePerimeterBorder>

      <ProfilePerimeterBorder delay={1100} variant="dealbreakers">
      <div className="profile-detail-section" id="my-dealbreakers">
        <div className="profile-detail-title-row">
          <h2 className="profile-detail-title">
            <span>🚫</span> My Dealbreakers
          </h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              captureProfileScrollAnchor("my-dealbreakers");
              const next = Array.from(
                new Set(
                  dealbreakers
                    .map((d) => canonicalDealbreakerLabel(d.description))
                    .filter((x): x is NonNullable<typeof x> => x != null),
                ),
              );
              setEditDealbreakers(next);
              setShowDealbreakersModal(true);
            }}
          >
            Edit
          </button>
        </div>
        {dealbreakers.length > 0 ? (
          <div className="profile-card-interests">
            {dealbreakers.map((db, idx) => {
              const canon = canonicalDealbreakerLabel(db.description);
              const em = canon ? DEALBREAKER_EMOJI[canon] : "🚫";
              const label = canon ?? db.description;
              return (
                <span key={idx} className="interest-tag">
                  <span aria-hidden>{em}</span> {label}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="my-profile-empty-hint">No dealbreakers yet — tap Edit to add.</p>
        )}
      </div>
      </ProfilePerimeterBorder>

      <ProfilePerimeterBorder delay={1300} variant="qualities">
      <div className="profile-detail-section" id="my-partner-qualities">
        <div className="profile-detail-title-row">
          <h2 className="profile-detail-title">
            <span>💕</span> What I&apos;m Looking For
          </h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              captureProfileScrollAnchor("my-partner-qualities");
              setEditQualities(partnerQualities.map((q) => q.quality));
              setShowQualitiesModal(true);
            }}
          >
            Edit
          </button>
        </div>
            {partnerQualities.length > 0 ? (
          <div className="profile-card-interests">
            {partnerQualities.map((q, idx) => {
              const em =
                isCanonicalPartnerQuality(q.quality) ? INTEREST_EDIT_EMOJIS[q.quality] : "✨";
              return (
                <span key={idx} className="interest-tag">
                  {em} {q.quality}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="my-profile-empty-hint">No qualities listed yet — tap Edit to choose what matters to you.</p>
        )}
      </div>
      </ProfilePerimeterBorder>

      <ProfilePerimeterBorder delay={1500} variant="lifestyle">
      <div className="profile-detail-section" id="my-lifestyle">
        <div className="profile-detail-title-row">
          <h2 className="profile-detail-title">
            <span>🌱</span> Lifestyle
          </h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              captureProfileScrollAnchor("my-lifestyle");
              setEditLifestyle(lifestyleFormFromApi(lifestyle));
              setShowLifestyleModal(true);
            }}
          >
            Edit
          </button>
        </div>
        {lifestyle &&
        LIFESTYLE_SUMMARY_FIELDS.some(({ apiField }) => {
          const raw = lifestyle[apiField];
          return typeof raw === "string" && raw.length > 0;
        }) ? (
          <div className="my-profile-lifestyle-grid">
            {LIFESTYLE_SUMMARY_FIELDS.map(({ key, apiField }) => {
              const raw = lifestyle[apiField];
              if (!raw || typeof raw !== "string") return null;
              return (
                <div
                  key={key}
                  className="my-profile-lifestyle-summary-card"
                  data-lifestyle-field={key}
                >
                  <span className="my-profile-lifestyle-summary-card__kicker">
                    <span className="my-profile-lifestyle-summary-card__kicker-emoji" aria-hidden>
                      {LIFESTYLE_SECTION_EMOJI[key]}
                    </span>
                    {LIFESTYLE_FIELD_LABEL[key]}
                  </span>
                  <span className="my-profile-lifestyle-summary-card__value">
                    <span className="my-profile-lifestyle-summary-card__value-emoji" aria-hidden>
                      {lifestyleValueEmoji(key, raw)}
                    </span>
                    {raw}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="my-profile-empty-hint">Lifestyle not set — tap Edit to add preferences.</p>
        )}
      </div>
      </ProfilePerimeterBorder>

      {/* Modals */}
      {showNameModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="name-title">
          <div
            className="my-profile-modal-backdrop"
            onClick={() => {
              setShowNameModal(false);
              setEditDisplayName(profile.display_name || "");
            }}
          />
          <div className="my-profile-modal-card my-profile-modal-card--name" role="document">
            <span className="my-profile-name-modal-aurora my-profile-name-modal-aurora--primary" aria-hidden />
            <span className="my-profile-name-modal-aurora my-profile-name-modal-aurora--secondary" aria-hidden />
            <button
              type="button"
              className="my-profile-modal-close"
              aria-label="Close"
              onClick={() => {
                setShowNameModal(false);
                setEditDisplayName(profile.display_name || "");
              }}
            >
              ×
            </button>
            <div className="my-profile-name-modal-hero">
              <span className="my-profile-name-modal-hero-icon-wrap" aria-hidden>
                <span className="my-profile-name-modal-hero-glow" />
                <span className="my-profile-name-modal-hero-icon">✨</span>
              </span>
              <div className="my-profile-name-modal-hero-text">
                <p className="my-profile-name-modal-kicker">Your profile</p>
                <h3 id="name-title">Update display name</h3>
                <p className="my-profile-modal-sub my-profile-name-modal-tagline">
                  Shown to people you connect with — first name or nickname works great.
                </p>
              </div>
            </div>
            <div className="my-profile-modal-body my-profile-modal-body--name">
              <label className="my-profile-modal-field-label" htmlFor="my-profile-name-input">
                Display name
              </label>
              <div className="my-profile-name-input-ring">
                <input
                  id="my-profile-name-input"
                  type="text"
                  className="my-profile-name-input"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  autoCapitalize="words"
                  maxLength={50}
                  disabled={updatingField}
                  autoFocus
                />
              </div>
              <p className="my-profile-name-char-count">{editDisplayName.trim().length}/50</p>
              {editDisplayName.trim().length >= 2 ? (
                <div className="my-profile-name-preview">
                  <span className="my-profile-name-preview-label">Matches will see</span>
                  <span className="my-profile-name-preview-value">👋 {editDisplayName.trim()}</span>
                </div>
              ) : (
                <p className="my-profile-name-hint">At least 2 characters</p>
              )}
            </div>
            <div className="my-profile-modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowNameModal(false);
                  setEditDisplayName(profile.display_name || "");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary my-profile-name-save-btn"
                onClick={() => void saveDisplayName()}
                disabled={updatingField || editDisplayName.trim().length < 2}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showAgeModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="age-title">
          <div className="my-profile-modal-backdrop" onClick={() => setShowAgeModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--age" role="document">
            <button
              type="button"
              className="my-profile-modal-close"
              aria-label="Close"
              onClick={() => setShowAgeModal(false)}
            >
              ×
            </button>
            <div className="my-profile-age-modal-hero">
              <span className="my-profile-age-modal-hero-icon" aria-hidden>
                🎂
              </span>
              <div className="my-profile-age-modal-hero-text">
                <h3 id="age-title">Update age</h3>
                <p className="my-profile-modal-sub my-profile-age-modal-tagline">
                  Must be 18 or older. Matches use this on your profile card.
                </p>
              </div>
            </div>
            <div className="my-profile-modal-body my-profile-modal-body--age">
              <label className="my-profile-modal-field-label" htmlFor="my-profile-age-input">
                Your age
              </label>
              <div className="my-profile-age-input-row">
                <button
                  type="button"
                  className="my-profile-age-step-btn"
                  aria-label="Decrease age"
                  onClick={() => {
                    const n = parseInt(editAge, 10);
                    const next = Number.isNaN(n) ? 18 : Math.max(18, n - 1);
                    setEditAge(String(next));
                  }}
                >
                  −
                </button>
                <input
                  id="my-profile-age-input"
                  type="number"
                  inputMode="numeric"
                  min={18}
                  max={120}
                  className="my-profile-age-input"
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                />
                <button
                  type="button"
                  className="my-profile-age-step-btn"
                  aria-label="Increase age"
                  onClick={() => {
                    const n = parseInt(editAge, 10);
                    const next = Number.isNaN(n) ? 18 : Math.min(120, n + 1);
                    setEditAge(String(next));
                  }}
                >
                  +
                </button>
              </div>
              <p className="my-profile-age-quick-label">Quick pick</p>
              <div className="my-profile-age-quick-grid" role="list">
                {AGE_QUICK_PICKS.map((age) => (
                  <button
                    key={age}
                    type="button"
                    role="listitem"
                    className={`my-profile-age-quick-chip ${editAge === String(age) ? "is-selected" : ""}`}
                    onClick={() => setEditAge(String(age))}
                  >
                    {age}
                  </button>
                ))}
              </div>
            </div>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAgeModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveAge()} disabled={updatingField}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showGenderModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gender-title">
          <div className="my-profile-modal-backdrop" onClick={() => setShowGenderModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--gender" role="document">
            <span className="my-profile-gender-modal-aurora" aria-hidden />
            <span className="my-profile-gender-modal-aurora my-profile-gender-modal-aurora--secondary" aria-hidden />
            <button
              type="button"
              className="my-profile-modal-close"
              aria-label="Close"
              onClick={() => setShowGenderModal(false)}
            >
              ×
            </button>
            <div className="my-profile-gender-modal-hero">
              <span className="my-profile-gender-modal-hero-icon-wrap" aria-hidden>
                <span className="my-profile-gender-modal-hero-glow" />
                <span className="my-profile-gender-modal-hero-icon">⚧️</span>
              </span>
              <div className="my-profile-gender-modal-hero-text">
                <p className="my-profile-gender-modal-kicker">Your profile</p>
                <h3 id="gender-title">Update gender</h3>
                <p className="my-profile-modal-sub my-profile-gender-modal-tagline">
                  Shown on your profile when you connect with someone new.
                </p>
              </div>
            </div>
            <div className="my-profile-modal-body my-profile-modal-body--gender">
              <label className="my-profile-modal-field-label my-profile-gender-field-label" id="gender-group-label">
                Choose one
              </label>
              <div
                className="my-profile-gender-grid"
                role="radiogroup"
                aria-labelledby="gender-group-label"
              >
                {GENDER_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={editGender === opt}
                    className={`my-profile-gender-option my-profile-gender-option--${opt.toLowerCase()} ${editGender === opt ? "is-selected" : ""}`}
                    onClick={() => setEditGender(opt)}
                  >
                    <span className="my-profile-gender-option-ring" aria-hidden />
                    <span className="my-profile-gender-option-emoji" aria-hidden>
                      {GENDER_OPTION_META[opt].emoji}
                    </span>
                    <span className="my-profile-gender-option-label">{opt}</span>
                    <span className="my-profile-gender-option-sub">{GENDER_OPTION_META[opt].sub}</span>
                    {editGender === opt ? (
                      <span className="my-profile-gender-option-check" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowGenderModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary my-profile-gender-save-btn"
                onClick={() => void saveGender()}
                disabled={updatingField}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showLocationModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="loc-title">
          <div className="my-profile-modal-backdrop" onClick={() => setShowLocationModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--location" role="document">
            <button
              type="button"
              className="my-profile-modal-close"
              aria-label="Close"
              onClick={() => setShowLocationModal(false)}
            >
              ×
            </button>
            <div className="my-profile-location-modal-hero">
              <span className="my-profile-location-modal-hero-icon" aria-hidden>
                📍
              </span>
              <div className="my-profile-location-modal-hero-text">
                <h3 id="loc-title">Update location</h3>
                <p className="my-profile-modal-sub my-profile-location-modal-tagline">
                  We use this for distance when you browse — city and state (e.g. Medford, Oregon).
                </p>
              </div>
            </div>
            <div className="my-profile-modal-body my-profile-modal-body--location">
              <div className="my-profile-location-field">
                <label className="my-profile-modal-field-label" htmlFor="my-profile-loc-input">
                  Your area
                </label>
                <input
                  id="my-profile-loc-input"
                  className="form-input my-profile-location-input"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="City, State"
                  autoComplete="address-level2"
                />
              </div>
              <button
                type="button"
                className="my-profile-location-detect"
                onClick={() => void detectLocation()}
                disabled={detectingLocation}
              >
                <span className="my-profile-location-detect-emoji" aria-hidden>
                  {detectingLocation ? "⏳" : "🛰️"}
                </span>
                <span className="my-profile-location-detect-label">
                  {detectingLocation ? "Detecting your area…" : "Use my current location"}
                </span>
              </button>
            </div>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowLocationModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveLocation()} disabled={updatingField}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showDistanceModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dist-title">
          <div className="my-profile-modal-backdrop" onClick={() => setShowDistanceModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--distance" role="document">
            <button
              type="button"
              className="my-profile-modal-close"
              aria-label="Close"
              onClick={() => setShowDistanceModal(false)}
            >
              ×
            </button>
            <div className="my-profile-distance-modal-hero">
              <span className="my-profile-distance-modal-hero-icon" aria-hidden>
                📏
              </span>
              <div className="my-profile-distance-modal-hero-text">
                <h3 id="dist-title">Max distance</h3>
                <p className="my-profile-modal-sub my-profile-distance-modal-tagline">
                  People outside this radius won&apos;t show when you browse. Maximum is 100 miles in
                  Southern Oregon.
                </p>
              </div>
            </div>
            <div className="my-profile-modal-body my-profile-modal-body--distance">
              <div className="my-profile-distance-grid" role="radiogroup" aria-labelledby="dist-title">
                {MAX_DISTANCE_SELECT_OPTIONS.map((opt) => {
                  const key = String(opt);
                  const meta = MAX_DISTANCE_META[key];
                  const selected = clampMaxDistanceMiles(editMaxDistance) === opt;
                  const primary = (
                    <>
                      <span className="my-profile-distance-option-num">{opt}</span>
                      <span className="my-profile-distance-option-mi">mi</span>
                    </>
                  );
                  const ariaLabel = `${opt} miles, ${meta?.tag ?? "miles"}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={ariaLabel}
                      className={`my-profile-distance-option ${selected ? "is-selected" : ""}`}
                      onClick={() => setEditMaxDistance(opt)}
                    >
                      <span className="my-profile-distance-option-ring" aria-hidden />
                      <span className="my-profile-distance-option-primary">{primary}</span>
                      <span className="my-profile-distance-option-tag">{meta?.tag ?? ""}</span>
                      {selected ? <span className="my-profile-distance-option-check">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowDistanceModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveMaxDistance()} disabled={updatingField}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showLookingForModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="looking-title">
          <div className="my-profile-modal-backdrop" onClick={() => setShowLookingForModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--looking" role="document">
            <button
              type="button"
              className="my-profile-modal-close"
              aria-label="Close"
              onClick={() => setShowLookingForModal(false)}
            >
              ×
            </button>
            <div className="my-profile-modal-head">
              <span className="my-profile-modal-icon" aria-hidden>
                ❤️
              </span>
              <div>
                <h3 id="looking-title">Looking for</h3>
                <p className="my-profile-modal-sub">What you&apos;re hoping to find on Mulligan</p>
              </div>
            </div>
            {profile.looking_for && !isCanonicalLookingFor(profile.looking_for) ? (
              <p className="my-profile-modal-legacy-hint">
                Your profile currently says &ldquo;{profile.looking_for}&rdquo;. Pick an option below to update it.
              </p>
            ) : null}
            <div className="my-profile-modal-body">
              <label className="my-profile-modal-field-label" id="looking-for-group-label">
                Choose one
              </label>
              <div
                className="my-profile-looking-grid"
                role="radiogroup"
                aria-labelledby="looking-for-group-label"
              >
                {LOOKING_FOR_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={editLookingFor === opt}
                    className={`my-profile-looking-chip ${editLookingFor === opt ? "is-selected" : ""}`}
                    onClick={() => setEditLookingFor(opt)}
                  >
                    <span className="my-profile-looking-chip-emoji" aria-hidden>
                      {LOOKING_FOR_META[opt].emoji}
                    </span>
                    <span className="my-profile-looking-chip-copy">
                      <span className="my-profile-looking-chip-title">{opt}</span>
                      <span className="my-profile-looking-chip-sub">{LOOKING_FOR_META[opt].sub}</span>
                    </span>
                    {editLookingFor === opt ? <span className="my-profile-looking-chip-check">✓</span> : null}
                  </button>
                ))}
              </div>
            </div>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowLookingForModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveLookingFor()} disabled={updatingField}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {profilePreviewData ? (
        <MyProfilePreviewModal
          open={showProfilePreview}
          onClose={() => setShowProfilePreview(false)}
          data={profilePreviewData}
          photos={photos}
        />
      ) : null}

      {showAvatarLightbox && profilePhotoUrl ? (
        <div
          className="my-profile-photo-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Profile photo"
        >
          <button
            type="button"
            className="my-profile-photo-lightbox-backdrop"
            aria-label="Close enlarged photo"
            onClick={() => setShowAvatarLightbox(false)}
          />
          <div className="my-profile-photo-lightbox-content">
            <img src={profilePhotoUrl} alt={profile.display_name} className="my-profile-photo-lightbox-img" />
          </div>
          <button
            type="button"
            className="my-profile-photo-lightbox-close"
            aria-label="Close enlarged photo"
            onClick={() => setShowAvatarLightbox(false)}
          >
            ×
          </button>
        </div>
      ) : null}

      {showPreferredModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pref-title">
          <div className="my-profile-modal-backdrop" onClick={() => setShowPreferredModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--preferred" role="document">
            <button
              type="button"
              className="my-profile-modal-close"
              aria-label="Close"
              onClick={() => setShowPreferredModal(false)}
            >
              ×
            </button>
            <div className="my-profile-modal-head">
              <span className="my-profile-modal-icon" aria-hidden>
                💕
              </span>
              <div>
                <h3 id="pref-title">Preferred matches</h3>
                <p className="my-profile-modal-sub">Who you want to see when browsing for matches</p>
              </div>
            </div>
            <div className="my-profile-modal-body">
              <div className="my-profile-pref-grid" role="radiogroup" aria-label="Preferred matches">
                <button
                  type="button"
                  role="radio"
                  aria-checked={preferredMatchesChoice === "everyone"}
                  className={`my-profile-pref-chip ${preferredMatchesChoice === "everyone" ? "is-selected" : ""}`}
                  onClick={() => setEditPreferredGenders(preferredGendersForChoice("everyone"))}
                >
                  <span className="my-profile-pref-chip-emoji" aria-hidden>
                    🌍
                  </span>
                  Everyone
                  {preferredMatchesChoice === "everyone" ? (
                    <span className="my-profile-pref-chip-check">✓</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={preferredMatchesChoice === "men"}
                  className={`my-profile-pref-chip ${preferredMatchesChoice === "men" ? "is-selected" : ""}`}
                  onClick={() => setEditPreferredGenders(preferredGendersForChoice("men"))}
                >
                  <span className="my-profile-pref-chip-emoji" aria-hidden>
                    👨
                  </span>
                  Men only
                  {preferredMatchesChoice === "men" ? <span className="my-profile-pref-chip-check">✓</span> : null}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={preferredMatchesChoice === "women"}
                  className={`my-profile-pref-chip ${preferredMatchesChoice === "women" ? "is-selected" : ""}`}
                  onClick={() => setEditPreferredGenders(preferredGendersForChoice("women"))}
                >
                  <span className="my-profile-pref-chip-emoji" aria-hidden>
                    👩
                  </span>
                  Women only
                  {preferredMatchesChoice === "women" ? <span className="my-profile-pref-chip-check">✓</span> : null}
                </button>
              </div>
            </div>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowPreferredModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void savePreferredGenders()} disabled={updatingField}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showBioModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bio-modal-title">
          <div className="my-profile-modal-backdrop" onClick={() => setShowBioModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--bio" role="document">
            <span className="my-profile-bio-modal-aurora my-profile-bio-modal-aurora--primary" aria-hidden />
            <span className="my-profile-bio-modal-aurora my-profile-bio-modal-aurora--secondary" aria-hidden />
            <button type="button" className="my-profile-modal-close" aria-label="Close" onClick={() => setShowBioModal(false)}>
              ×
            </button>
            <div className="my-profile-bio-modal-hero">
              <span className="my-profile-bio-modal-hero-icon-wrap" aria-hidden>
                <span className="my-profile-bio-modal-hero-glow" />
                <span className="my-profile-bio-modal-hero-icon">💬</span>
              </span>
              <div className="my-profile-bio-modal-hero-text">
                <p className="my-profile-bio-modal-kicker">Your story</p>
                <h3 id="bio-modal-title">About me</h3>
                <p className="my-profile-modal-sub my-profile-bio-modal-tagline">
                  Share what makes you you — a few honest lines go a long way. Up to 500 characters.
                </p>
              </div>
            </div>
            <div className="my-profile-modal-body my-profile-modal-body--bio">
              <label className="my-profile-modal-field-label" htmlFor="bio-modal-textarea">
                Bio
              </label>
              <div className="my-profile-bio-input-ring">
                <textarea
                  id="bio-modal-textarea"
                  className="my-profile-bio-input"
                  rows={5}
                  maxLength={500}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  disabled={updatingField}
                  autoFocus
                  placeholder="What you're into, your vibe, or what you're open to…"
                />
              </div>
              <p className="my-profile-bio-char-count">{editBio.length}/500</p>
              {editBio.trim().length > 0 ? (
                <div className="my-profile-bio-preview">
                  <span className="my-profile-bio-preview-label">Preview</span>
                  <p className="my-profile-bio-preview-text">{editBio.trim()}</p>
                </div>
              ) : (
                <p className="my-profile-bio-hint">Tip: authenticity beats perfection — a line or two is plenty.</p>
              )}
            </div>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowBioModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary my-profile-bio-save-btn"
                onClick={() => void saveBio()}
                disabled={updatingField}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showInterestsModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true">
          <div className="my-profile-modal-backdrop" onClick={() => setShowInterestsModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--scroll">
            <h3>My interests</h3>
            <p className="my-profile-modal-sub">Select at least 3 ({editInterests.length} selected)</p>
            <div className="create-profile-interests-grid my-profile-edit-grid">
              {INTEREST_EDIT_OPTIONS.map((interest) => {
                const selected = editInterests.includes(interest);
                const em = INTEREST_EDIT_EMOJIS[interest] || "✨";
                return (
                  <button
                    key={interest}
                    type="button"
                    className={`create-profile-interest-tile ${selected ? "is-selected" : ""}`}
                    onClick={() => toggleInterestEdit(interest)}
                  >
                    <span className="create-profile-interest-emoji">{em}</span>
                    <span className="create-profile-interest-label">{interest}</span>
                    {selected ? <span className="create-profile-interest-check">✓</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => void saveInterests()} disabled={updatingField}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowInterestsModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showDealbreakersModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dealbreakers-modal-title">
          <div className="my-profile-modal-backdrop" onClick={() => setShowDealbreakersModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--scroll my-profile-modal-card--dealbreakers" role="document">
            <button
              type="button"
              className="my-profile-modal-close"
              aria-label="Close"
              onClick={() => setShowDealbreakersModal(false)}
            >
              ×
            </button>
            <div className="my-profile-modal-head">
              <span className="my-profile-modal-icon" aria-hidden>
                🚫
              </span>
              <div>
                <h3 id="dealbreakers-modal-title">Dealbreakers</h3>
                <p className="my-profile-modal-sub">Hard passes — tap to toggle ({editDealbreakers.length} on)</p>
              </div>
            </div>
            <div className="create-profile-interests-grid my-profile-edit-grid my-profile-dealbreaker-grid">
              {DEALBREAKER_SUGGESTIONS.map((s) => {
                const selected = editDealbreakers.includes(s);
                const em = DEALBREAKER_EMOJI[s];
                return (
                  <button
                    key={s}
                    type="button"
                    className={`create-profile-interest-tile my-profile-dealbreaker-tile ${selected ? "is-selected" : ""}`}
                    onClick={() => toggleDealbreakerEdit(s)}
                  >
                    <span className="create-profile-interest-emoji" aria-hidden>
                      {em}
                    </span>
                    <span className="create-profile-interest-label">{s}</span>
                    {selected ? <span className="create-profile-interest-check">✓</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowDealbreakersModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveDealbreakers()} disabled={updatingField}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showQualitiesModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true">
          <div className="my-profile-modal-backdrop" onClick={() => setShowQualitiesModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--scroll">
            <h3>What I&apos;m looking for</h3>
            <p className="my-profile-modal-sub">Qualities that matter to you in a match ({editQualities.length} selected)</p>
            <div className="create-profile-interests-grid my-profile-edit-grid">
              {PARTNER_QUALITY_EDIT_OPTIONS.map((q) => {
                const selected = editQualities.includes(q);
                return (
                  <button
                    key={q}
                    type="button"
                    className={`create-profile-interest-tile ${selected ? "is-selected" : ""}`}
                    onClick={() => toggleQualityEdit(q)}
                  >
                    <span className="create-profile-interest-emoji" aria-hidden>
                      {INTEREST_EDIT_EMOJIS[q]}
                    </span>
                    <span className="create-profile-interest-label">{q}</span>
                    {selected ? <span className="create-profile-interest-check">✓</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => void saveQualities()} disabled={updatingField}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowQualitiesModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showLifestyleModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="lifestyle-modal-title">
          <div className="my-profile-modal-backdrop" onClick={() => setShowLifestyleModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--scroll my-profile-modal-card--lifestyle" role="document">
            <span className="my-profile-lifestyle-modal-aurora my-profile-lifestyle-modal-aurora--primary" aria-hidden />
            <span className="my-profile-lifestyle-modal-aurora my-profile-lifestyle-modal-aurora--secondary" aria-hidden />
            <button
              type="button"
              className="my-profile-modal-close"
              aria-label="Close"
              onClick={() => setShowLifestyleModal(false)}
            >
              ×
            </button>
            <div className="my-profile-lifestyle-modal-hero">
              <span className="my-profile-lifestyle-modal-hero-icon-wrap" aria-hidden>
                <span className="my-profile-lifestyle-modal-hero-glow" />
                <span className="my-profile-lifestyle-modal-hero-icon">🌱</span>
              </span>
              <div className="my-profile-lifestyle-modal-hero-text">
                <p className="my-profile-lifestyle-modal-kicker">Day to day</p>
                <h3 id="lifestyle-modal-title">Lifestyle</h3>
                <p className="my-profile-modal-sub my-profile-lifestyle-modal-tagline">
                  Quick snapshot of your day-to-day — leave anything blank if you&apos;d rather not say.
                </p>
                <p className="my-profile-lifestyle-progress" aria-live="polite">
                  {Object.values(editLifestyle).filter((v) => v.trim().length > 0).length} of 8 filled
                </p>
              </div>
            </div>

            <div className="my-profile-lifestyle-stack">
              {(
                [
                  ["smoking", "Smoking"] as const,
                  ["drinking", "Drinking"] as const,
                  ["children", "Children"] as const,
                  ["pets", "Pets"] as const,
                  ["religion", "Religion"] as const,
                  ["political", "Politics"] as const,
                  ["workLifeBalance", "Work-life balance"] as const,
                  ["worksOut", "Works out"] as const,
                ] as const
              ).map(([key, label]) => {
                const fieldKey = key as LifestyleFieldKey;
                const sectionEmoji = LIFESTYLE_SECTION_EMOJI[fieldKey];
                const current = editLifestyle[key];
                const currentEmoji =
                  current === ""
                    ? LIFESTYLE_OPTION_EMOJI[fieldKey][""] ?? "◻️"
                    : LIFESTYLE_OPTION_EMOJI[fieldKey][current] ?? "✓";
                const isFilled = current.trim().length > 0;
                return (
                  <div
                    key={key}
                    className="my-profile-lifestyle-card"
                    data-lifestyle-field={key}
                    data-filled={isFilled ? "true" : undefined}
                  >
                    <div className="my-profile-lifestyle-card-top">
                      <span className="my-profile-lifestyle-section-emoji-tile" aria-hidden>
                        {sectionEmoji}
                      </span>
                      <label className="my-profile-lifestyle-card-label" htmlFor={`lifestyle-select-${key}`}>
                        {label}
                      </label>
                    </div>
                    <div className="my-profile-lifestyle-select-ring">
                      <div className="my-profile-lifestyle-select-wrap">
                        <span className="my-profile-lifestyle-value-emoji" aria-hidden>
                          {currentEmoji}
                        </span>
                        <select
                          id={`lifestyle-select-${key}`}
                          className="my-profile-lifestyle-select"
                          value={editLifestyle[key]}
                          onChange={(e) =>
                            setEditLifestyle((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                        >
                          {LIFESTYLE_FIELD_OPTIONS[fieldKey].map((opt) => (
                            <option key={opt || "unset"} value={opt}>
                              {lifestyleSelectOptionLabel(fieldKey, opt)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="my-profile-modal-actions my-profile-lifestyle-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowLifestyleModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary my-profile-lifestyle-save-btn"
                onClick={() => void saveLifestyle()}
                disabled={updatingField}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
