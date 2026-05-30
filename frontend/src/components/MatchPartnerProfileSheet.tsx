import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  DEALBREAKER_EMOJI,
  canonicalDealbreakerLabel,
  getInterestEmoji,
  isCanonicalLookingFor,
  isCanonicalPartnerQuality,
  LOOKING_FOR_META,
  PARTNER_QUALITY_EMOJI,
} from "../constants/profileMySections";
import { getPhotoUrl } from "../utils/photoUrl";
import { formatPreferredMatchesFromGenders } from "../utils/preferredMatchesLabel";
import { PreviewDetailSection } from "./MyProfilePreviewModal";

export type MatchPartnerPhoto = {
  id: string;
  url: string;
  displayOrder?: number;
  isPrimary?: boolean;
};

export type MatchPartnerProfileUser = {
  displayName: string;
  age?: number;
  gender?: string;
  location?: string | null;
  lastActiveLabel?: string | null;
  bio?: string | null;
  lookingFor?: string | null;
  interests?: string[];
  values?: string[];
  partnerQualities?: Array<{ quality: string; importance: number }>;
  dealbreakers?: string[];
  preferredGenders?: string[] | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  stage: "stage1" | "stage2";
  photos: MatchPartnerPhoto[];
  otherUser: MatchPartnerProfileUser;
  commonInterests: string[];
  onPhotoSelect: (photos: MatchPartnerPhoto[], photo: MatchPartnerPhoto) => void;
  onReport: () => void;
};

function hasProfileDetailsBeyondBio(ou: MatchPartnerProfileUser): boolean {
  return !!(
    ou.lookingFor ||
    (ou.partnerQualities?.length ?? 0) > 0 ||
    (ou.interests?.length ?? 0) > 0 ||
    (ou.values?.length ?? 0) > 0 ||
    (ou.dealbreakers?.length ?? 0) > 0 ||
    ou.preferredGenders !== undefined
  );
}

function preferredMatchesEmoji(label: string): string {
  if (label === "Everyone") return "🌍";
  if (label === "Men") return "👨";
  if (label === "Women") return "👩";
  if (label.includes("Men") && label.includes("Women")) return "💕";
  return "💕";
}

function PartnerProfileDetails({ otherUser }: { otherUser: MatchPartnerProfileUser }) {
  const lookingForDisplay =
    otherUser.lookingFor &&
    (isCanonicalLookingFor(otherUser.lookingFor)
      ? `${LOOKING_FOR_META[otherUser.lookingFor].emoji} ${otherUser.lookingFor}`
      : otherUser.lookingFor);

  const preferredLabel =
    otherUser.preferredGenders !== undefined
      ? formatPreferredMatchesFromGenders(otherUser.preferredGenders)
      : null;

  return (
    <div className="my-profile-preview-details">
      {otherUser.lookingFor && lookingForDisplay ? (
        <PreviewDetailSection title="Looking for">
          <p className="my-profile-preview-text">{lookingForDisplay}</p>
        </PreviewDetailSection>
      ) : null}

      {preferredLabel ? (
        <PreviewDetailSection title="Preferred matches">
          <span className="my-profile-preview-highlight-pill">
            {preferredMatchesEmoji(preferredLabel)} {preferredLabel}
          </span>
        </PreviewDetailSection>
      ) : null}

      {(otherUser.partnerQualities?.length ?? 0) > 0 ? (
        <PreviewDetailSection title="What you're looking for">
          <ul className="my-profile-preview-quality-list">
            {otherUser.partnerQualities!.map((q, idx) => {
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

      {(otherUser.interests?.length ?? 0) > 0 ? (
        <PreviewDetailSection title="Interests">
          <div className="my-profile-preview-tags">
            {otherUser.interests!.map((name) => (
              <span key={name} className="my-profile-preview-tag my-profile-preview-tag--interest">
                {getInterestEmoji(name)} {name}
              </span>
            ))}
          </div>
        </PreviewDetailSection>
      ) : null}

      {(otherUser.values?.length ?? 0) > 0 ? (
        <PreviewDetailSection title="Values">
          <div className="my-profile-preview-tags">
            {otherUser.values!.map((v) => (
              <span key={v} className="my-profile-preview-tag my-profile-preview-tag--value">
                💎 {v}
              </span>
            ))}
          </div>
        </PreviewDetailSection>
      ) : null}

      {(otherUser.dealbreakers?.length ?? 0) > 0 ? (
        <PreviewDetailSection title="Dealbreakers">
          <div className="my-profile-preview-tags">
            {otherUser.dealbreakers!.map((d, i) => {
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
    </div>
  );
}

export default function MatchPartnerProfileSheet({
  open,
  onClose,
  stage,
  photos,
  otherUser,
  commonInterests,
  onPhotoSelect,
  onReport,
}: Props) {
  const sortedPhotos = [...photos].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  });

  const primaryPhoto = sortedPhotos.find((p) => p.isPrimary) || sortedPhotos[0];
  const primaryPhotoUrl = primaryPhoto ? getPhotoUrl(primaryPhoto.url) : null;
  const hasDetailsBeyondBio = hasProfileDetailsBeyondBio(otherUser);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const emptyPhotosMessage =
    stage === "stage2"
      ? "No gallery photos listed yet."
      : "Additional photos unlock as you each send enough messages in chat.";

  const overlay = (
    <div className="my-profile-preview-root match-partner-preview-root" role="presentation">
      <button
        type="button"
        className="my-profile-preview-backdrop"
        aria-label="Close profile"
        onClick={onClose}
      />
      <div
        className="my-profile-preview-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-partner-preview-title"
      >
        <div className="my-profile-preview-handle-wrap" aria-hidden>
          <span className="my-profile-preview-handle" />
        </div>

        <header className="my-profile-preview-header">
          <span className="my-profile-preview-header__orb my-profile-preview-header__orb--a" aria-hidden />
          <span className="my-profile-preview-header__orb my-profile-preview-header__orb--b" aria-hidden />

          <div className="my-profile-preview-header__top">
            <span className="my-profile-preview-badge">💬 Quick view</span>
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
                  if (primaryPhoto) onPhotoSelect(sortedPhotos, primaryPhoto);
                }}
                aria-label={`View photos — ${otherUser.displayName}`}
              >
                <span className="my-profile-preview-avatar-ring">
                  <img
                    src={primaryPhotoUrl}
                    alt=""
                    className="my-profile-preview-avatar-img"
                    draggable={false}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </span>
              </button>
            ) : (
              <span
                className="my-profile-preview-avatar-ring my-profile-preview-avatar-ring--placeholder"
                aria-hidden
              >
                <span className="my-profile-preview-avatar-placeholder">
                  {otherUser.displayName.trim().charAt(0).toUpperCase() || "?"}
                </span>
              </span>
            )}

            <h2 id="match-partner-preview-title" className="my-profile-preview-name">
              {otherUser.displayName}
              {typeof otherUser.age === "number" && !Number.isNaN(otherUser.age) ? (
                <span className="my-profile-preview-age">, {otherUser.age}</span>
              ) : null}
            </h2>

            <div className="my-profile-preview-meta">
              {otherUser.gender ? (
                <span className="my-profile-preview-meta-chip">⚧️ {otherUser.gender}</span>
              ) : null}
              {otherUser.location ? (
                <span className="my-profile-preview-meta-chip">📍 {otherUser.location}</span>
              ) : null}
              {otherUser.lastActiveLabel ? (
                <span className="my-profile-preview-meta-chip">🟢 {otherUser.lastActiveLabel}</span>
              ) : null}
            </div>

            {otherUser.bio ? (
              <div className="match-partner-preview-hero-about">
                <p className="match-partner-preview-hero-about-label">About</p>
                <p className="match-partner-preview-hero-about-text">{otherUser.bio}</p>
              </div>
            ) : null}

            <p className="my-profile-preview-tagline">
              Tap their photo or gallery to view full size
            </p>

            <button
              type="button"
              className="match-partner-preview-report btn btn-secondary btn-sm"
              onClick={onReport}
            >
              Report user
            </button>
          </div>
        </header>

        <div className="my-profile-preview-scroll">
          {commonInterests.length > 0 ? (
            <section className="my-profile-preview-card my-profile-preview-card--common" aria-label="Shared interests">
              <div className="my-profile-preview-card__glow" aria-hidden />
              <div className="my-profile-preview-common">
                <span className="my-profile-preview-common-mark" aria-hidden>
                  ✦
                </span>
                <div className="my-profile-preview-common-copy">
                  <p className="my-profile-preview-eyebrow">In common</p>
                  <p className="my-profile-preview-common-title">You both like</p>
                  <p className="my-profile-preview-common-sub">
                    {commonInterests.length}{" "}
                    {commonInterests.length === 1 ? "interest" : "interests"} overlap
                  </p>
                </div>
                <div className="my-profile-preview-common-tags">
                  {commonInterests.slice(0, 8).map((interest) => (
                    <span key={interest} className="my-profile-preview-common-chip">
                      {getInterestEmoji(interest)} {interest}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

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
                    onClick={() => onPhotoSelect(sortedPhotos, ph)}
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
              <p className="my-profile-preview-gallery-hint">
                Tap a photo to browse full screen
              </p>
            </section>
          ) : (
            <section className="my-profile-preview-card my-profile-preview-card--empty">
              <span className="my-profile-preview-empty-emoji" aria-hidden>
                📸
              </span>
              <p>{emptyPhotosMessage}</p>
            </section>
          )}

          {hasDetailsBeyondBio ? (
            <section className="my-profile-preview-card my-profile-preview-card--details">
              <div className="my-profile-preview-card__head my-profile-preview-card__head--solo">
                <div>
                  <p className="my-profile-preview-eyebrow">Their profile</p>
                  <h3 className="my-profile-preview-card-title">Details</h3>
                </div>
              </div>
              <PartnerProfileDetails otherUser={otherUser} />
            </section>
          ) : (
            <section className="my-profile-preview-card my-profile-preview-card--empty">
              <span className="my-profile-preview-empty-emoji" aria-hidden>
                ✨
              </span>
              <p>They haven&apos;t added written profile sections yet.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(overlay, document.body) : null;
}
