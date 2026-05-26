import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

function hasProfileDetails(data: MyProfilePreviewData): boolean {
  return !!(
    data.bio ||
    data.lookingFor ||
    data.interests.length > 0 ||
    data.dealbreakers.length > 0 ||
    data.partnerQualities.length > 0 ||
    data.values.length > 0 ||
    data.preferredGenders !== null ||
    hasLifestyle(data.lifestyle)
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

  const distanceLabel =
    data.maxDistance == null ? "Any distance" : `Within ${data.maxDistance} mi`;

  const overlay = (
    <>
      <div className="chat-partner-drawer-root chat-partner-drawer-root--my-preview" role="presentation">
        <button
          type="button"
          className="chat-partner-drawer-backdrop"
          aria-label="Close profile preview"
          onClick={onClose}
        />
        <aside
          className="chat-partner-drawer-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="my-profile-preview-title"
        >
          <div className="chat-partner-drawer-header">
            <div className="chat-partner-drawer-hero">
              {primaryPhotoUrl ? (
                <button
                  type="button"
                  className="chat-partner-drawer-avatar-btn"
                  onClick={() => {
                    const first = sortedPhotos[0];
                    if (first) openPhotoLightbox(first);
                  }}
                  aria-label={`View photo — ${data.displayName}`}
                >
                  <span className="chat-partner-drawer-avatar-ring">
                    <img
                      src={primaryPhotoUrl}
                      alt=""
                      className="chat-partner-drawer-avatar-img"
                      draggable={false}
                    />
                  </span>
                </button>
              ) : (
                <span
                  className="chat-partner-drawer-avatar-ring chat-partner-drawer-avatar-ring--placeholder"
                  aria-hidden
                >
                  <span className="chat-partner-drawer-avatar-initial">👤</span>
                </span>
              )}
              <div className="chat-partner-drawer-headline">
                <h2 id="my-profile-preview-title" className="chat-partner-drawer-name">
                  {data.displayName}
                  {data.age ? <span className="chat-partner-drawer-age">, {data.age}</span> : null}
                </h2>
                <div className="chat-partner-drawer-meta">
                  {data.gender ? (
                    <span className="chat-partner-drawer-meta-chip">{data.gender}</span>
                  ) : null}
                  {data.location ? (
                    <span className="chat-partner-drawer-meta-chip chat-partner-drawer-meta-chip--location">
                      <span className="chat-partner-drawer-meta-chip-icon" aria-hidden>
                        📍
                      </span>
                      {data.location}
                    </span>
                  ) : null}
                  <span className="chat-partner-drawer-meta-chip">{distanceLabel}</span>
                </div>
                <p className="chat-partner-drawer-tagline">
                  This is how your profile looks to others on Mulligan — photos and what you wrote.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="chat-partner-drawer-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="chat-partner-drawer-inner">
            {sortedPhotos.length > 0 ? (
              <div className="chat-partner-drawer-surface chat-partner-drawer-surface--photos">
                <div className="chat-partner-drawer-gallery-block">
                  <h3 className="chat-partner-drawer-section-heading">
                    <span className="chat-partner-drawer-section-eyebrow">Gallery</span>
                    <span className="chat-partner-drawer-section-title">Photos</span>
                  </h3>
                  <div className="chat-partner-drawer-photo-rail" role="list">
                    {sortedPhotos.map((ph, i) => (
                      <button
                        key={ph.id}
                        type="button"
                        className="chat-partner-drawer-photo-thumb"
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
                        <span className="chat-partner-drawer-photo-view-overlay" aria-hidden>
                          <span className="chat-partner-drawer-photo-view-icon">🧤</span>
                          <span className="chat-partner-drawer-photo-view-label">View</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="chat-partner-drawer-hint">
                    Tap a photo to open · swipe or use ‹ › to browse all photos
                  </p>
                </div>
              </div>
            ) : (
              <div className="chat-partner-drawer-surface chat-partner-drawer-surface--empty">
                <p className="chat-partner-drawer-empty subtle">No photos yet — add some from your profile tab.</p>
              </div>
            )}

            <div className="chat-partner-drawer-surface chat-partner-drawer-surface--profile">
              <h3 className="chat-partner-drawer-section-heading">
                <span className="chat-partner-drawer-section-eyebrow">Your profile</span>
                <span className="chat-partner-drawer-section-title">Details</span>
              </h3>
              <div className="chat-partner-drawer-profile chat-partner-drawer-profile--styled">
                {hasProfileDetails(data) ? (
                  <div className="stage2-profile-sections-inner">
                    {data.lookingFor ? (
                      <div className="stage2-profile-block">
                        <h4>Looking for</h4>
                        <p className="stage2-profile-text">{data.lookingFor}</p>
                      </div>
                    ) : null}
                    {data.preferredGenders !== null ? (
                      <div className="stage2-profile-block">
                        <h4>Wants to connect with</h4>
                        <p className="stage2-profile-text">
                          {formatPreferredMatchesFromGenders(data.preferredGenders)}
                        </p>
                      </div>
                    ) : null}
                    {data.bio ? (
                      <div className="stage2-profile-block">
                        <h4>About</h4>
                        <p className="stage2-profile-text">{data.bio}</p>
                      </div>
                    ) : null}
                    {data.partnerQualities.length > 0 ? (
                      <div className="stage2-profile-block">
                        <h4>What you&apos;re looking for</h4>
                        <div className="qualities-list">
                          {data.partnerQualities.map((q, idx) => (
                            <div key={idx} className="quality-item">
                              <span className="quality-name">{q.quality}</span>
                              <span className="quality-importance">{"⭐".repeat(q.importance)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {data.interests.length > 0 ? (
                      <div className="stage2-profile-block">
                        <h4>Interests</h4>
                        <div className="profile-card-interests">
                          {data.interests.map((interest) => (
                            <span key={interest} className="interest-tag">
                              {interest}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {data.values.length > 0 ? (
                      <div className="stage2-profile-block">
                        <h4>Values</h4>
                        <div className="profile-card-interests">
                          {data.values.map((value) => (
                            <span key={value} className="value-tag">
                              {value}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {data.dealbreakers.length > 0 ? (
                      <div className="stage2-profile-block">
                        <h4>Dealbreakers</h4>
                        <ul className="stage2-dealbreakers-list">
                          {data.dealbreakers.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {hasLifestyle(data.lifestyle) && data.lifestyle ? (
                      <div className="stage2-profile-block">
                        <h4>Lifestyle</h4>
                        <div className="profile-lifestyle">
                          {data.lifestyle.smoking ? (
                            <div className="lifestyle-item">
                              <strong>Smoking:</strong> {data.lifestyle.smoking}
                            </div>
                          ) : null}
                          {data.lifestyle.drinking ? (
                            <div className="lifestyle-item">
                              <strong>Drinking:</strong> {data.lifestyle.drinking}
                            </div>
                          ) : null}
                          {data.lifestyle.children ? (
                            <div className="lifestyle-item">
                              <strong>Children:</strong> {data.lifestyle.children}
                            </div>
                          ) : null}
                          {data.lifestyle.pets ? (
                            <div className="lifestyle-item">
                              <strong>Pets:</strong> {data.lifestyle.pets}
                            </div>
                          ) : null}
                          {data.lifestyle.religion ? (
                            <div className="lifestyle-item">
                              <strong>Religion:</strong> {data.lifestyle.religion}
                            </div>
                          ) : null}
                          {data.lifestyle.political ? (
                            <div className="lifestyle-item">
                              <strong>Politics:</strong> {data.lifestyle.political}
                            </div>
                          ) : null}
                          {data.lifestyle.work_life_balance ? (
                            <div className="lifestyle-item">
                              <strong>Work-Life Balance:</strong> {data.lifestyle.work_life_balance}
                            </div>
                          ) : null}
                          {data.lifestyle.works_out ? (
                            <div className="lifestyle-item">
                              <strong>Works out:</strong> {data.lifestyle.works_out}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="chat-partner-drawer-empty">
                    You haven&apos;t added written profile sections yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </aside>
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
