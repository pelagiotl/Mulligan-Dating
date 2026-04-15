import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../utils/api";
import PhotoUpload from "../components/PhotoUpload";
import { getPhotoUrl } from "../utils/photoUrl";
import { hasCityAndState } from "../utils/locationUtils";
import { useAuth } from "../context/AuthContext";

const PREFERRED_GENDER_LABELS: Record<string, string> = {
  Man: "Men",
  Woman: "Women",
  Everyone: "Everyone",
};
const MAX_DISTANCE_OPTIONS: (number | null)[] = [10, 25, 50, 100, 250, 500, null];

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
  } | null;
  dealbreakers: Array<{ description: string; category: string | null }>;
  partnerQualities: Array<{ quality: string; importance: number }>;
  lifestyle: {
    smoking: string | null;
    drinking: string | null;
    children: string | null;
    pets: string | null;
    religion: string | null;
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

function formatPreferredConnectionsLabel(preferredGendersJson: string | null | undefined): string {
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

const INTEREST_EDIT_OPTIONS = [
  "Travel", "Music", "Sports", "Cooking", "Reading", "Movies", "Fitness", "Art",
  "Photography", "Dancing", "Gaming", "Hiking", "Yoga", "Writing", "Technology",
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

const PARTNER_QUALITY_EDIT_OPTIONS = [
  "Kindness",
  "Sense of humor",
  "Communication",
  "Emotional maturity",
  "Shared values",
  "Ambition",
  "Loyalty",
  "Open-mindedness",
  "Adventure",
  "Family-oriented",
  "Physical attraction",
  "Intellectual curiosity",
  "Creativity",
  "Financial stability",
  "Fitness & health",
] as const;

const DEALBREAKER_SUGGESTIONS = [
  "Smoking",
  "Heavy drinking",
  "Different politics",
  "Different religion",
  "Long distance",
  "Doesn’t want kids",
  "Wants kids soon",
  "Not active / fit",
  "Nightlife often",
  "Doesn’t like pets",
  "Messy lifestyle",
  "Prefer not to say",
] as const;

const LIFESTYLE_FIELD_OPTIONS = {
  smoking: ["", "Non-smoker", "Social smoker", "Smoker", "Trying to quit", "Prefer not to say"],
  drinking: ["", "Non-drinker", "Socially", "Regularly", "Sober-curious", "Prefer not to say"],
  children: ["", "Want kids", "Don’t want kids", "Open to either", "Have kids", "Prefer not to say"],
  pets: ["", "Love pets", "Allergic", "No pets", "Open to pets", "Prefer not to say"],
  religion: ["", "Very important", "Somewhat important", "Spiritual not religious", "Not important", "Prefer not to say"],
  workLifeBalance: ["", "Career-focused", "Balanced", "Life-first", "Flexible", "Prefer not to say"],
  worksOut: ["", "Daily", "Often", "Sometimes", "Rarely", "Prefer not to say"],
} as const;

type LifestyleForm = {
  smoking: string;
  drinking: string;
  children: string;
  pets: string;
  religion: string;
  workLifeBalance: string;
  worksOut: string;
};

function lifestyleFormFromApi(l: ProfileData["lifestyle"]): LifestyleForm {
  if (!l) {
    return {
      smoking: "",
      drinking: "",
      children: "",
      pets: "",
      religion: "",
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
    workLifeBalance: l.work_life_balance || "",
    worksOut: l.works_out || "",
  };
}

export default function MyProfile() {
  const { refreshProfile } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showDistanceModal, setShowDistanceModal] = useState(false);
  const [showPreferredModal, setShowPreferredModal] = useState(false);
  const [showBioModal, setShowBioModal] = useState(false);
  const [editLocation, setEditLocation] = useState("");
  const [editMaxDistance, setEditMaxDistance] = useState<number | null>(50);
  const [editPreferredGenders, setEditPreferredGenders] = useState<string[]>(["Everyone"]);
  const [editBio, setEditBio] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [updatingField, setUpdatingField] = useState(false);
  const [updatingActiveStatus, setUpdatingActiveStatus] = useState(false);

  const [showInterestsModal, setShowInterestsModal] = useState(false);
  const [editInterests, setEditInterests] = useState<string[]>([]);
  const [showDealbreakersModal, setShowDealbreakersModal] = useState(false);
  const [editDealbreakers, setEditDealbreakers] = useState<string[]>([]);
  const [dealbreakerDraft, setDealbreakerDraft] = useState("");
  const [showQualitiesModal, setShowQualitiesModal] = useState(false);
  const [editQualities, setEditQualities] = useState<string[]>([]);
  const [showLifestyleModal, setShowLifestyleModal] = useState(false);
  const [editLifestyle, setEditLifestyle] = useState<LifestyleForm>(() => lifestyleFormFromApi(null));
  const [showLookingModal, setShowLookingModal] = useState(false);
  const [editLookingFor, setEditLookingFor] = useState("");

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
      await api.post("/profile", {
        displayName: data.profile.display_name,
        age: data.profile.age,
        gender: data.profile.gender,
        location: loc,
        bio: data.profile.bio ?? null,
        lookingFor: data.profile.looking_for ?? null,
      });
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, location: loc } } : null));
      setShowLocationModal(false);
      await refreshProfile();
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
      await api.put("/profile/preferences", {
        ...base,
        maxDistance: editMaxDistance,
      });
      setData((prev) =>
        prev?.preferences
          ? { ...prev, preferences: { ...prev.preferences, max_distance: editMaxDistance } }
          : prev
      );
      setShowDistanceModal(false);
      await refreshProfile();
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
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update preferred connections.");
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
      await api.post("/profile", {
        displayName: data.profile.display_name,
        age: data.profile.age,
        gender: data.profile.gender,
        location: data.profile.location ?? null,
        bio: val,
        lookingFor: data.profile.looking_for ?? null,
      });
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
      await api.put("/profile/dealbreakers", { dealbreakers: editDealbreakers });
      await refreshProfileData();
      setShowDealbreakersModal(false);
      setDealbreakerDraft("");
      await refreshProfile();
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
        workLifeBalance: editLifestyle.workLifeBalance || null,
        worksOut: editLifestyle.worksOut || null,
      });
      await refreshProfileData();
      setShowLifestyleModal(false);
      await refreshProfile();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update lifestyle.");
    } finally {
      setUpdatingField(false);
    }
  };

  const saveLookingFor = async () => {
    if (!data?.profile) return;
    const val = editLookingFor.trim() || null;
    setUpdatingField(true);
    setError("");
    try {
      await api.post("/profile", {
        displayName: data.profile.display_name,
        age: data.profile.age,
        gender: data.profile.gender,
        location: data.profile.location ?? null,
        bio: data.profile.bio ?? null,
        lookingFor: val,
      });
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, looking_for: val } } : null));
      setShowLookingModal(false);
      await refreshProfile();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to update looking for.");
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
    setEditDealbreakers((prev) =>
      prev.includes(text) ? prev.filter((x) => x !== text) : [...prev, text]
    );
  };

  const addCustomDealbreaker = () => {
    const t = dealbreakerDraft.trim();
    if (!t || editDealbreakers.includes(t)) return;
    setEditDealbreakers((prev) => [...prev, t]);
    setDealbreakerDraft("");
  };

  const toggleQualityEdit = (q: string) => {
    setEditQualities((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]));
  };

  const toggleEveryone = (checked: boolean) => {
    if (checked) setEditPreferredGenders(["Everyone"]);
  };

  const toggleGenderOption = (g: "Man" | "Woman", checked: boolean) => {
    setEditPreferredGenders((prev) => {
      let next = prev.filter((x) => x !== "Everyone");
      if (checked) {
        if (!next.includes(g)) next = [...next, g];
      } else {
        next = next.filter((x) => x !== g);
      }
      if (next.length === 0) return ["Everyone"];
      return next;
    });
  };

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

  return (
    <div className="my-profile native-app-screen">
      {error && (
        <div className="auth-error" style={{ maxWidth: 800, margin: "0 auto var(--space-4)" }}>
          {error}
        </div>
      )}

      <div className="my-profile-header">
        {profilePhotoUrl && (
          <div className="my-profile-avatar">
            <img
              src={profilePhotoUrl}
              alt={profile.display_name}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
        <div className="my-profile-info">
          <h1 className="my-profile-name">{profile.display_name}</h1>

          {settings && (
            <div className="my-profile-stats-row">
              <div className="my-profile-stat-card my-profile-stat-card--member">
                <span className="my-profile-stat-emoji">🎉</span>
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
          )}

          <div className="my-profile-info-grid">
            <div className="my-profile-mini-card my-profile-mini-card--age">
              <span>🎂</span>
              <span className="my-profile-mini-label">Age</span>
              <span className="my-profile-mini-value">{profile.age}</span>
            </div>
            <div className="my-profile-mini-card my-profile-mini-card--gender">
              <span>⚧️</span>
              <span className="my-profile-mini-label">Gender</span>
              <span className="my-profile-mini-value">{profile.gender}</span>
            </div>
          </div>

          <button
            type="button"
            className="my-profile-full-card my-profile-full-card--location"
            onClick={() => {
              setEditLocation(profile.location || "");
              setShowLocationModal(true);
            }}
          >
            <span className="my-profile-full-card-emoji">📍</span>
            <span className="my-profile-full-card-label">Location</span>
            <span className="my-profile-full-card-value">{profile.location || "Tap to add"}</span>
          </button>

          <button
            type="button"
            className="my-profile-full-card my-profile-full-card--distance"
            onClick={() => {
              setEditMaxDistance(data.preferences?.max_distance ?? 50);
              setShowDistanceModal(true);
            }}
          >
            <span className="my-profile-full-card-emoji">📏</span>
            <span className="my-profile-full-card-label">Max distance</span>
            <span className="my-profile-full-card-value">
              {data.preferences?.max_distance == null
                ? "Any distance"
                : `${data.preferences.max_distance} mi`}
            </span>
          </button>

          <button
            type="button"
            className="my-profile-full-card my-profile-full-card--preferred"
            onClick={() => {
              setEditPreferredGenders(parsePreferredGendersInitial(data.preferences?.preferred_genders));
              setShowPreferredModal(true);
            }}
          >
            <span className="my-profile-full-card-emoji">🔗</span>
            <span className="my-profile-full-card-label">Preferred connections</span>
            <span className="my-profile-full-card-value">
              {formatPreferredConnectionsLabel(data.preferences?.preferred_genders ?? null)}
            </span>
          </button>

          <button
            type="button"
            className="my-profile-bio-block"
            onClick={() => {
              setEditBio(profile.bio || "");
              setShowBioModal(true);
            }}
          >
            <div className="my-profile-bio-block-header">
              <span>💬</span>
              <span>About Me</span>
            </div>
            <p className={profile.bio ? "my-profile-bio-text" : "my-profile-bio-text my-profile-bio-placeholder"}>
              {profile.bio || "Tap to add"}
            </p>
          </button>

          <div className="my-profile-meta-group" style={{ marginTop: "var(--space-4)" }}>
            <div className="my-profile-meta-item my-profile-meta-item--row">
              <div>
                <span className="my-profile-meta-label">Looking for</span>
                <span className="my-profile-meta-value">{profile.looking_for || "—"}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditLookingFor(profile.looking_for || "");
                  setShowLookingModal(true);
                }}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-detail-section" id="my-photos">
        <h2 className="profile-detail-title">
          <span>📸</span> My Photos
        </h2>
        <PhotoUpload
          onPhotosUpdated={() => {
            void fetchProfile();
            void fetchPhotos();
          }}
        />
      </div>

      <div className="profile-detail-section">
        <div className="profile-detail-title-row">
          <h2 className="profile-detail-title">
            <span>🎯</span> My Interests
          </h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
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
              <span key={idx} className="interest-tag">
                {interest.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="my-profile-empty-hint">No interests yet — tap Edit to add (pick at least 3).</p>
        )}
      </div>

      <div className="profile-detail-section">
        <div className="profile-detail-title-row">
          <h2 className="profile-detail-title">
            <span>🚫</span> My Dealbreakers
          </h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setEditDealbreakers(dealbreakers.map((d) => d.description));
              setDealbreakerDraft("");
              setShowDealbreakersModal(true);
            }}
          >
            Edit
          </button>
        </div>
        {dealbreakers.length > 0 ? (
          <div className="profile-card-interests">
            {dealbreakers.map((db, idx) => (
              <span key={idx} className="interest-tag">
                {db.description}
              </span>
            ))}
          </div>
        ) : (
          <p className="my-profile-empty-hint">No dealbreakers yet — tap Edit to add.</p>
        )}
      </div>

      <div className="profile-detail-section">
        <div className="profile-detail-title-row">
          <h2 className="profile-detail-title">
            <span>💕</span> What I&apos;m Looking For
          </h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setEditQualities(partnerQualities.map((q) => q.quality));
              setShowQualitiesModal(true);
            }}
          >
            Edit
          </button>
        </div>
        {partnerQualities.length > 0 ? (
          <div className="profile-card-interests">
            {partnerQualities.map((q, idx) => (
              <span key={idx} className="interest-tag">
                {q.quality}
              </span>
            ))}
          </div>
        ) : (
          <p className="my-profile-empty-hint">No qualities listed yet — tap Edit to choose what matters to you.</p>
        )}
      </div>

      <div className="profile-detail-section">
        <div className="profile-detail-title-row">
          <h2 className="profile-detail-title">
            <span>🌱</span> Lifestyle
          </h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setEditLifestyle(lifestyleFormFromApi(lifestyle));
              setShowLifestyleModal(true);
            }}
          >
            Edit
          </button>
        </div>
        {lifestyle &&
        (lifestyle.smoking ||
          lifestyle.drinking ||
          lifestyle.children ||
          lifestyle.pets ||
          lifestyle.religion ||
          lifestyle.work_life_balance ||
          lifestyle.works_out) ? (
          <div className="profile-lifestyle">
            {lifestyle.smoking ? (
              <div className="lifestyle-item">
                <strong>Smoking:</strong> {lifestyle.smoking}
              </div>
            ) : null}
            {lifestyle.drinking ? (
              <div className="lifestyle-item">
                <strong>Drinking:</strong> {lifestyle.drinking}
              </div>
            ) : null}
            {lifestyle.children ? (
              <div className="lifestyle-item">
                <strong>Children:</strong> {lifestyle.children}
              </div>
            ) : null}
            {lifestyle.pets ? (
              <div className="lifestyle-item">
                <strong>Pets:</strong> {lifestyle.pets}
              </div>
            ) : null}
            {lifestyle.religion ? (
              <div className="lifestyle-item">
                <strong>Religion:</strong> {lifestyle.religion}
              </div>
            ) : null}
            {lifestyle.work_life_balance ? (
              <div className="lifestyle-item">
                <strong>Work-Life Balance:</strong> {lifestyle.work_life_balance}
              </div>
            ) : null}
            {lifestyle.works_out ? (
              <div className="lifestyle-item">
                <strong>Works out:</strong> {lifestyle.works_out}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="my-profile-empty-hint">Lifestyle not set — tap Edit to add preferences.</p>
        )}
      </div>

      <div className="text-center mt-8">
        <Link to="/create-profile" className="btn btn-secondary">
          Edit full profile wizard
        </Link>
      </div>

      {/* Modals */}
      {showLocationModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="loc-title">
          <div className="my-profile-modal-backdrop" onClick={() => setShowLocationModal(false)} />
          <div className="my-profile-modal-card">
            <h3 id="loc-title">Update location</h3>
            <p className="my-profile-modal-sub">City and state required (e.g. Medford, Oregon)</p>
            <input
              className="form-input"
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              placeholder="City, State"
            />
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => void detectLocation()} disabled={detectingLocation}>
                {detectingLocation ? "Detecting…" : "Use my location"}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveLocation()} disabled={updatingField}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowLocationModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showDistanceModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true">
          <div className="my-profile-modal-backdrop" onClick={() => setShowDistanceModal(false)} />
          <div className="my-profile-modal-card">
            <h3>Max distance</h3>
            <p className="my-profile-modal-sub">Used when matching with people nearby</p>
            <select
              className="form-input"
              value={editMaxDistance === null ? "any" : String(editMaxDistance)}
              onChange={(e) => {
                const v = e.target.value;
                setEditMaxDistance(v === "any" ? null : parseInt(v, 10));
              }}
            >
              {MAX_DISTANCE_OPTIONS.map((opt) => (
                <option key={opt === null ? "any" : opt} value={opt === null ? "any" : String(opt)}>
                  {opt === null ? "Any distance" : `${opt} mi`}
                </option>
              ))}
            </select>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => void saveMaxDistance()} disabled={updatingField}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowDistanceModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreferredModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true">
          <div className="my-profile-modal-backdrop" onClick={() => setShowPreferredModal(false)} />
          <div className="my-profile-modal-card">
            <h3>Preferred connections</h3>
            <p className="my-profile-modal-sub">Who you want to see in discovery</p>
            <label className="my-profile-check-row">
              <input
                type="checkbox"
                checked={editPreferredGenders.includes("Everyone")}
                onChange={(e) => toggleEveryone(e.target.checked)}
              />
              Everyone
            </label>
            <label className="my-profile-check-row">
              <input
                type="checkbox"
                checked={editPreferredGenders.includes("Man")}
                disabled={editPreferredGenders.includes("Everyone")}
                onChange={(e) => toggleGenderOption("Man", e.target.checked)}
              />
              Men
            </label>
            <label className="my-profile-check-row">
              <input
                type="checkbox"
                checked={editPreferredGenders.includes("Woman")}
                disabled={editPreferredGenders.includes("Everyone")}
                onChange={(e) => toggleGenderOption("Woman", e.target.checked)}
              />
              Women
            </label>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => void savePreferredGenders()} disabled={updatingField}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowPreferredModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showBioModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true">
          <div className="my-profile-modal-backdrop" onClick={() => setShowBioModal(false)} />
          <div className="my-profile-modal-card">
            <h3>About me</h3>
            <textarea
              className="form-input"
              rows={5}
              maxLength={500}
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
            />
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => void saveBio()} disabled={updatingField}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowBioModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showLookingModal && (
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true">
          <div className="my-profile-modal-backdrop" onClick={() => setShowLookingModal(false)} />
          <div className="my-profile-modal-card">
            <h3>Looking for</h3>
            <p className="my-profile-modal-sub">What you want others to know about what you&apos;re seeking</p>
            <textarea
              className="form-input"
              rows={4}
              maxLength={500}
              value={editLookingFor}
              onChange={(e) => setEditLookingFor(e.target.value)}
              placeholder="e.g. Something serious, new friends, activity partners…"
            />
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => void saveLookingFor()} disabled={updatingField}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowLookingModal(false)}>
                Cancel
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
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true">
          <div className="my-profile-modal-backdrop" onClick={() => setShowDealbreakersModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--scroll">
            <h3>Dealbreakers</h3>
            <p className="my-profile-modal-sub">Tap suggestions or add your own (saved as a simple list).</p>
            <div className="profile-card-interests" style={{ marginBottom: "var(--space-3)" }}>
              {editDealbreakers.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="interest-tag my-profile-tag-removable"
                  onClick={() => setEditDealbreakers((prev) => prev.filter((x) => x !== d))}
                  title="Remove"
                >
                  {d} ×
                </button>
              ))}
            </div>
            <p className="my-profile-modal-sub" style={{ marginTop: 0 }}>
              Suggestions
            </p>
            <div className="profile-card-interests" style={{ marginBottom: "var(--space-3)" }}>
              {DEALBREAKER_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`interest-tag ${editDealbreakers.includes(s) ? "my-profile-tag-on" : ""}`}
                  onClick={() => toggleDealbreakerEdit(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="my-profile-inline-add">
              <input
                className="form-input"
                value={dealbreakerDraft}
                onChange={(e) => setDealbreakerDraft(e.target.value)}
                placeholder="Custom dealbreaker"
                maxLength={500}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomDealbreaker();
                  }
                }}
              />
              <button type="button" className="btn btn-secondary" onClick={addCustomDealbreaker}>
                Add
              </button>
            </div>
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => void saveDealbreakers()} disabled={updatingField}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowDealbreakersModal(false)}>
                Cancel
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
                    <span className="create-profile-interest-emoji">✨</span>
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
        <div className="my-profile-modal-overlay" role="dialog" aria-modal="true">
          <div className="my-profile-modal-backdrop" onClick={() => setShowLifestyleModal(false)} />
          <div className="my-profile-modal-card my-profile-modal-card--scroll">
            <h3>Lifestyle</h3>
            <p className="my-profile-modal-sub">Leave blank if you prefer not to say.</p>
            {(
              [
                ["smoking", "Smoking"] as const,
                ["drinking", "Drinking"] as const,
                ["children", "Children"] as const,
                ["pets", "Pets"] as const,
                ["religion", "Religion"] as const,
                ["workLifeBalance", "Work-life balance"] as const,
                ["worksOut", "Works out"] as const,
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="my-profile-lifestyle-field">
                <span>{label}</span>
                <select
                  className="form-input"
                  value={editLifestyle[key]}
                  onChange={(e) =>
                    setEditLifestyle((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                >
                  {LIFESTYLE_FIELD_OPTIONS[key].map((opt) => (
                    <option key={opt || "unset"} value={opt}>
                      {opt || "— Not set —"}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="my-profile-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => void saveLifestyle()} disabled={updatingField}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowLifestyleModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
