import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  DEALBREAKER_EMOJI,
  canonicalDealbreakerLabel,
  getInterestEmoji,
  isCanonicalLookingFor,
  isCanonicalPartnerQuality,
  lifestylePickerItemLabel,
  LOOKING_FOR_META,
  LIFESTYLE_FIELD_EMOJI,
  LIFESTYLE_FIELD_LABEL,
  PARTNER_QUALITY_EMOJI,
  type LifestyleFieldKey,
} from "../constants/profileMySections";
import { getPhotoUrl } from "../utils/photoUrl";
import { formatPreferredMatchesFromGenders } from "../utils/preferredMatchesLabel";

export type MyProfilePreviewPhoto = {
  id: string;
  url: string;
  isPrimary?: boolean;
};

export type MyProfilePreviewData = {
  displayName: string;
  age: number;
  gender: string;
  location: string | null;
  bio: string | null;
  lookingFor: string | null;
  interests: string[];
  dealbreakers: string[];
  partnerQualities: Array<{ quality: string; importance: number }>;
  preferredGenders: string[] | null;
  maxDistance: number | null;
  values: string[];
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
};

type PhotoLightboxState = { urls: string[]; index: number };

type SectionAccent = {
  emoji: string;
  colors: [string, string, string];
  slug: string;
};

const SECTION_ACCENTS: Record<string, SectionAccent> = {
  "Looking for": { emoji: "💞", colors: ["#fda4af", "#fb7185", "#f472b6"], slug: "looking-for" },
  "Preferred matches": { emoji: "💕", colors: ["#a78bfa", "#c084fc", "#e879f9"], slug: "preferred" },
  About: { emoji: "💬", colors: ["#667eea", "#764ba2", "#a855f7"], slug: "about" },
  "What you're looking for": { emoji: "✨", colors: ["#f093fb", "#e879f9", "#667eea"], slug: "qualities" },
  Interests: { emoji: "🎯", colors: ["#f5576c", "#f093fb", "#667eea"], slug: "interests" },
  Values: { emoji: "💎", colors: ["#f472b6", "#ec4899", "#db2777"], slug: "values" },
  Dealbreakers: { emoji: "🚫", colors: ["#ef4444", "#f5576c", "#a78bfa"], slug: "dealbreakers" },
  Lifestyle: { emoji: "🌱", colors: ["#43e97b", "#38f9d7", "#667eea"], slug: "lifestyle" },
};

const LIFESTYLE_KEYS: Array<{ key: LifestyleFieldKey; field: keyof NonNullable<MyProfilePreviewData["lifestyle"]> }> = [
  { key: "smoking", field: "smoking" },
  { key: "drinking", field: "drinking" },
  { key: "children", field: "children" },
  { key: "pets", field: "pets" },
  { key: "religion", field: "religion" },
  { key: "political", field: "political" },
  { key: "workLifeBalance", field: "work_life_balance" },
  { key: "worksOut", field: "works_out" },
];

function hasLifestyle(lifestyle: MyProfilePreviewData["lifestyle"]): boolean {
  if (!lifestyle) return false;
  return !!(
    lifestyle.smoking ||
    lifestyle.drinking ||
    lifestyle.children ||
    lifestyle.pets ||
    lifestyle.religion ||
    lifestyle.political ||
    lifestyle.work_life_balance ||
    lifestyle.works_out
  );
}

function preferredMatchesEmoji(label: string): string {
  if (label === "Everyone") return "🌍";
  if (label === "Men") return "👨";
  if (label === "Women") return "👩";
  if (label.includes("Men") && label.includes("Women")) return "💕";
  return "💕";
}

function PreviewDetailSection({ title, children }: { title: string; children: ReactNode }) {
  const accent = SECTION_ACCENTS[title] ?? SECTION_ACCENTS.About;
  return (
    <article
      className="my-profile-preview-detail"
      data-accent={accent.slug}
      style={
        {
          "--detail-a": accent.colors[0],
          "--detail-b": accent.colors[1],
          "--detail-c": accent.colors[2],
        } as CSSProperties
      }
    >
      <div className="my-profile-preview-detail__bar" aria-hidden />
      <div className="my-profile-preview-detail__inner">
        <header className="my-profile-preview-detail__head">
          <span className="my-profile-preview-detail__emoji-wrap" aria-hidden>
            {accent.emoji}
          </span>
          <h4 className="my-profile-preview-detail__title">{title}</h4>
        </header>
        <div className="my-profile-preview-detail__body">{children}</div>
      </div>
    </article>
  );
}

export function parseProfileValues(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function parsePreferredGendersJson(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

export default function MyProfilePreviewModal({
  open,
  onClose,
  data,
  photos,
}: {
  open: boolean;
  onClose: () => void;
  data: MyProfilePreviewData;
  photos: MyProfilePreviewPhoto[];
}) {
  const [photoLightbox, setPhotoLightbox] = useState<PhotoLightboxState | null>(null);
  const lightboxTouchX = useRef<number | null>(null);

  const sortedPhotos = useMemo(
    () =>
      [...photos].sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return 0;
      }),
    [photos]
  );

  const primaryPhotoUrl = useMemo(() => {
    const primary = sortedPhotos.find((p) => p.isPrimary) || sortedPhotos[0];
    return primary ? getPhotoUrl(primary.url) : null;
  }, [sortedPhotos]);

  const distanceLabel =
    data.maxDistance == null ? "Any distance" : `Within ${data.maxDistance} mi`;

  const preferredLabel = formatPreferredMatchesFromGenders(data.preferredGenders);

  const lookingForDisplay = useMemo(() => {
    if (!data.lookingFor) return null;
    if (isCanonicalLookingFor(data.lookingFor)) {
      const meta = LOOKING_FOR_META[data.lookingFor];
      return `${meta.emoji} ${data.lookingFor}`;
    }
    return data.lookingFor;
  }, [data.lookingFor]);

  const hasDetails = !!(
    data.lookingFor ||
    data.bio ||
    data.partnerQualities.length > 0 ||
    data.interests.length > 0 ||
    data.values.length > 0 ||
    data.dealbreakers.length > 0 ||
    data.preferredGenders !== null ||
    hasLifestyle(data.lifestyle)
  );

  const closeLightbox = useCallback(() => setPhotoLightbox(null), []);

  const stepLightbox = useCallback((delta: number) => {
    setPhotoLightbox((prev) => {
      if (!prev || prev.urls.length === 0) return prev;
      const n = prev.urls.length;
      return { ...prev, index: (prev.index + delta + n) % n };
    });
  }, []);

  const openPhotoLightbox = useCallback(
    (startPhoto: MyProfilePreviewPhoto) => {
      const urls = sortedPhotos.map((p) => getPhotoUrl(p.url));
      const idx = sortedPhotos.findIndex((p) => p.id === startPhoto.id);
      setPhotoLightbox({ urls, index: idx >= 0 ? idx : 0 });
    },
    [sortedPhotos]
  );

  useEffect(() => {
    if (!open) {
      setPhotoLightbox(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (photoLightbox) closeLightbox();
        else onClose();
        return;
      }
      if (photoLightbox) {
        if (e.key === "ArrowLeft") stepLightbox(-1);
        if (e.key === "ArrowRight") stepLightbox(1);
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, photoLightbox, closeLightbox, stepLightbox]);

  if (!open) return null;

  const overlay = (
    <>
      <div className="my-profile-preview-root" role="presentation">
        <button
          type="button"
          className="my-profile-preview-backdrop"
          aria-label="Close profile preview"
          onClick={onClose}
        />
        <div
          className="my-profile-preview-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="my-profile-preview-title"
        >
          <div className="my-profile-preview-handle-wrap" aria-hidden>
            <span className="my-profile-preview-handle" />
          </div>

          <header className="my-profile-preview-header">
            <span className="my-profile-preview-header__orb my-profile-preview-header__orb--a" aria-hidden />
            <span className="my-profile-preview-header__orb my-profile-preview-header__orb--b" aria-hidden />

            <div className="my-profile-preview-header__top">
              <span className="my-profile-preview-badge">👁 Preview</span>
              <button
                type="button"
                className="my-profile-preview-close"
                onClick={onClose}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="my-profile-preview-hero">
              {primaryPhotoUrl ? (
                <button
                  type="button"
                  className="my-profile-preview-avatar-btn"
                  onClick={() => {
                    const first = sortedPhotos[0];
                    if (first) openPhotoLightbox(first);
                  }}
                  aria-label={`View photo — ${data.displayName}`}
                >
                  <span className="my-profile-preview-avatar-ring">
                    <img src={primaryPhotoUrl} alt="" className="my-profile-preview-avatar-img" draggable={false} />
                  </span>
                </button>
              ) : (
                <span className="my-profile-preview-avatar-ring my-profile-preview-avatar-ring--placeholder" aria-hidden>
                  <span className="my-profile-preview-avatar-placeholder">👤</span>
                </span>
              )}

              <h2 id="my-profile-preview-title" className="my-profile-preview-name">
                {data.displayName}
                {data.age ? <span className="my-profile-preview-age">, {data.age}</span> : null}
              </h2>

              <div className="my-profile-preview-meta">
                {data.gender ? (
                  <span className="my-profile-preview-meta-chip">⚧️ {data.gender}</span>
                ) : null}
                {data.location ? (
                  <span className="my-profile-preview-meta-chip">📍 {data.location}</span>
                ) : null}
                <span className="my-profile-preview-meta-chip">📏 {distanceLabel}</span>
              </div>

              <p className="my-profile-preview-tagline">
                This is how your profile looks to others on Mulligan
              </p>
            </div>
          </header>

          <div className="my-profile-preview-scroll">
            {sortedPhotos.length > 0 ? (
              <section className="my-profile-preview-card my-profile-preview-card--gallery">
                <div className="my-profile-preview-card__glow" aria-hidden />
                <div className="my-profile-preview-card__head">
                  <div>
                    <p className="my-profile-preview-eyebrow">Gallery</p>
                    <h3 className="my-profile-preview-card-title">Photos</h3>
                  </div>
                  <span className="my-profile-preview-photo-count">{sortedPhotos.length}</span>
                </div>
                <div className="my-profile-preview-photo-rail" role="list">
                  {sortedPhotos.map((ph, i) => (
                    <button
                      key={ph.id}
                      type="button"
                      className="my-profile-preview-photo-thumb"
                      onClick={() => openPhotoLightbox(ph)}
                      role="listitem"
                      aria-label={`View photo ${i + 1} of ${sortedPhotos.length}`}
                    >
                      <img
                        src={getPhotoUrl(ph.url)}
                        alt=""
                        draggable={false}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <span className="my-profile-preview-photo-overlay" aria-hidden>
                        <span>🔍</span>
                        <span>View</span>
                      </span>
                      {ph.isPrimary ? (
                        <span className="my-profile-preview-photo-primary">★ Main</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <p className="my-profile-preview-gallery-hint">Tap a photo to browse full screen</p>
              </section>
            ) : (
              <section className="my-profile-preview-card my-profile-preview-card--empty">
                <span className="my-profile-preview-empty-emoji" aria-hidden>
                  📸
                </span>
                <p>No photos yet — add some from your profile tab.</p>
              </section>
            )}

            {hasDetails ? (
              <section className="my-profile-preview-card my-profile-preview-card--details">
                <div className="my-profile-preview-card__head my-profile-preview-card__head--solo">
                  <div>
                    <p className="my-profile-preview-eyebrow">Your profile</p>
                    <h3 className="my-profile-preview-card-title">Details</h3>
                  </div>
                </div>

                <div className="my-profile-preview-details">
                  {data.lookingFor && lookingForDisplay ? (
                    <PreviewDetailSection title="Looking for">
                      <p className="my-profile-preview-text">{lookingForDisplay}</p>
                    </PreviewDetailSection>
                  ) : null}

                  {data.preferredGenders !== null ? (
                    <PreviewDetailSection title="Preferred matches">
                      <span className="my-profile-preview-highlight-pill">
                        {preferredMatchesEmoji(preferredLabel)} {preferredLabel}
                      </span>
                    </PreviewDetailSection>
                  ) : null}

                  {data.bio ? (
                    <PreviewDetailSection title="About">
                      <p className="my-profile-preview-text">{data.bio}</p>
                    </PreviewDetailSection>
                  ) : null}

                  {data.partnerQualities.length > 0 ? (
                    <PreviewDetailSection title="What you're looking for">
                      <ul className="my-profile-preview-quality-list">
                        {data.partnerQualities.map((q, idx) => {
                          const em = isCanonicalPartnerQuality(q.quality)
                            ? PARTNER_QUALITY_EMOJI[q.quality]
                            : "✨";
                          return (
                            <li key={idx} className="my-profile-preview-quality-pill">
                              <span>
                                {em} {q.quality}
                              </span>
                              <span className="my-profile-preview-quality-stars" aria-hidden>
                                {"⭐".repeat(Math.min(q.importance, 5))}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </PreviewDetailSection>
                  ) : null}

                  {data.interests.length > 0 ? (
                    <PreviewDetailSection title="Interests">
                      <div className="my-profile-preview-tags">
                        {data.interests.map((name) => (
                          <span key={name} className="my-profile-preview-tag my-profile-preview-tag--interest">
                            {getInterestEmoji(name)} {name}
                          </span>
                        ))}
                      </div>
                    </PreviewDetailSection>
                  ) : null}

                  {data.values.length > 0 ? (
                    <PreviewDetailSection title="Values">
                      <div className="my-profile-preview-tags">
                        {data.values.map((v) => (
                          <span key={v} className="my-profile-preview-tag my-profile-preview-tag--value">
                            💎 {v}
                          </span>
                        ))}
                      </div>
                    </PreviewDetailSection>
                  ) : null}

                  {data.dealbreakers.length > 0 ? (
                    <PreviewDetailSection title="Dealbreakers">
                      <div className="my-profile-preview-tags">
                        {data.dealbreakers.map((d, i) => {
                          const canon = canonicalDealbreakerLabel(d);
                          const em = canon ? DEALBREAKER_EMOJI[canon] : "🚫";
                          const label = canon ?? d;
                          return (
                            <span key={i} className="my-profile-preview-tag my-profile-preview-tag--dealbreaker">
                              {em} {label}
                            </span>
                          );
                        })}
                      </div>
                    </PreviewDetailSection>
                  ) : null}

                  {hasLifestyle(data.lifestyle) && data.lifestyle ? (
                    <PreviewDetailSection title="Lifestyle">
                      <div className="my-profile-preview-lifestyle-grid">
                        {LIFESTYLE_KEYS.map(({ key, field }) => {
                          const raw = data.lifestyle![field];
                          if (!raw || typeof raw !== "string") return null;
                          return (
                            <div key={key} className="my-profile-preview-lifestyle-card">
                              <span className="my-profile-preview-lifestyle-label">
                                {LIFESTYLE_FIELD_EMOJI[key]} {LIFESTYLE_FIELD_LABEL[key]}
                              </span>
                              <span className="my-profile-preview-lifestyle-value">
                                {lifestylePickerItemLabel(key, raw)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </PreviewDetailSection>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="my-profile-preview-card my-profile-preview-card--empty">
                <span className="my-profile-preview-empty-emoji" aria-hidden>
                  ✨
                </span>
                <p>Add bio, interests, and more from your profile to fill this preview out.</p>
              </section>
            )}

            <p className="my-profile-preview-footer">Only you can see this preview</p>
          </div>
        </div>
      </div>

      {photoLightbox && photoLightbox.urls.length > 0 ? (
        <div
          className="my-profile-photo-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${photoLightbox.index + 1} of ${photoLightbox.urls.length}`}
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="my-profile-photo-lightbox-close"
            aria-label="Close enlarged photo"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
          >
            ×
          </button>
          {photoLightbox.urls.length > 1 ? (
            <button
              type="button"
              className="my-profile-photo-lightbox-side-nav my-profile-photo-lightbox-side-nav--prev"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                stepLightbox(-1);
              }}
            >
              ‹
            </button>
          ) : null}
          {photoLightbox.urls.length > 1 ? (
            <button
              type="button"
              className="my-profile-photo-lightbox-side-nav my-profile-photo-lightbox-side-nav--next"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                stepLightbox(1);
              }}
            >
              ›
            </button>
          ) : null}
          <div
            className="my-profile-photo-lightbox-stage"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              lightboxTouchX.current = e.changedTouches[0].clientX;
            }}
            onTouchEnd={(e) => {
              const start = lightboxTouchX.current;
              lightboxTouchX.current = null;
              if (start == null || photoLightbox.urls.length < 2) return;
              const dx = e.changedTouches[0].clientX - start;
              if (dx > 56) stepLightbox(-1);
              else if (dx < -56) stepLightbox(1);
            }}
          >
            {photoLightbox.urls.length > 1 ? (
              <button
                type="button"
                className="my-profile-photo-lightbox-tap-zone my-profile-photo-lightbox-tap-zone--prev"
                aria-label="Previous photo"
                onClick={() => stepLightbox(-1)}
              />
            ) : null}
            <img
              src={photoLightbox.urls[photoLightbox.index]}
              alt={`${data.displayName} — photo ${photoLightbox.index + 1}`}
              className="my-profile-photo-lightbox-img"
            />
            {photoLightbox.urls.length > 1 ? (
              <button
                type="button"
                className="my-profile-photo-lightbox-tap-zone my-profile-photo-lightbox-tap-zone--next"
                aria-label="Next photo"
                onClick={() => stepLightbox(1)}
              />
            ) : null}
            {photoLightbox.urls.length > 1 ? (
              <>
                <div className="my-profile-photo-lightbox-counter">
                  {photoLightbox.index + 1} / {photoLightbox.urls.length}
                </div>
                <p className="my-profile-photo-lightbox-hint">
                  Swipe, tap the sides, or use arrow keys to browse
                </p>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );

  return typeof document !== "undefined" ? createPortal(overlay, document.body) : null;
}
