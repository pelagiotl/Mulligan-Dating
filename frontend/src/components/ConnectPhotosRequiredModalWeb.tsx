import { useEffect, useRef, useState } from "react";
import { api } from "../utils/api";
import { MIN_PHOTOS_TO_CONNECT, minPhotosToConnectLabel } from "../utils/connectProfileEligibility";
import { uploadPhotoFiles, type UploadedPhoto } from "../utils/photoBatchUpload";

type SlotPhoto = { id: string; url: string };

export default function ConnectPhotosRequiredModalWeb({
  open,
  onClose,
  photoCount,
  onPhotoUploaded,
}: {
  open: boolean;
  onClose: () => void;
  photoCount: number;
  onPhotoUploaded?: (uploaded: UploadedPhoto[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [slotPhotos, setSlotPhotos] = useState<(SlotPhoto | null)[]>(
    Array.from({ length: MIN_PHOTOS_TO_CONNECT }, () => null)
  );

  useEffect(() => {
    if (!open) return;
    setUploadError("");
    setUploading(false);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !uploading) onClose();
    };
    window.addEventListener("keydown", onKey);

    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{ photos?: SlotPhoto[] }>(`/photos/me?_=${Date.now()}`);
        if (cancelled) return;
        const sorted = [...(data.photos ?? [])].sort(
          (a, b) =>
            ((a as { displayOrder?: number }).displayOrder ?? 0) -
            ((b as { displayOrder?: number }).displayOrder ?? 0)
        );
        const next = Array.from({ length: MIN_PHOTOS_TO_CONNECT }, () => null) as (SlotPhoto | null)[];
        sorted.slice(0, MIN_PHOTOS_TO_CONNECT).forEach((ph, i) => {
          next[i] = { id: ph.id, url: ph.url };
        });
        setSlotPhotos(next);
      } catch {
        if (!cancelled) {
          setSlotPhotos(Array.from({ length: MIN_PHOTOS_TO_CONNECT }, () => null));
        }
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, uploading]);

  if (!open) return null;

  const filledCount = slotPhotos.filter(Boolean).length;
  const displayCount = Math.max(photoCount, filledCount);
  const hasPhoto = displayCount >= MIN_PHOTOS_TO_CONNECT;
  const showReturnCta = hasPhoto && !uploading;

  const openFilePicker = () => {
    if (uploading || hasPhoto) return;
    setUploadError("");
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      const uploaded = await uploadPhotoFiles([file]);
      e.target.value = "";
      const first = uploaded[0];
      if (first) {
        setSlotPhotos((prev) => {
          const next = [...prev];
          const emptyIdx = next.findIndex((s) => s == null);
          const idx = emptyIdx >= 0 ? emptyIdx : 0;
          next[idx] = { id: first.id, url: first.url };
          return next;
        });
      }
      onPhotoUploaded?.(uploaded);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed. Try again.");
      e.target.value = "";
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="connect-photos-modal-overlay" role="presentation">
      <button
        type="button"
        className="connect-photos-modal-backdrop"
        aria-label="Close"
        onClick={() => {
          if (!uploading) onClose();
        }}
        disabled={uploading}
      />
      <div
        className="connect-photos-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-photos-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="connect-photos-modal-rim">
          <div className="connect-photos-modal-inner">
            <header className="connect-photos-modal-header">
              <span className="connect-photos-modal-spark connect-photos-modal-spark--1" aria-hidden>
                ✨
              </span>
              <span className="connect-photos-modal-spark connect-photos-modal-spark--2" aria-hidden>
                💫
              </span>
              <div className="connect-photos-modal-header-copy">
                <p className="connect-photos-modal-kicker">One quick step</p>
                <h2 id="connect-photos-modal-title" className="connect-photos-modal-title">
                  Add {minPhotosToConnectLabel()} to Connect
                </h2>
              </div>
            </header>

            <div className="connect-photos-modal-body">
              <p className="connect-photos-modal-lead">
                {showReturnCta
                  ? "Looking good — your photo is saved. Head back to Connect when you’re ready to match."
                  : (
                    <>
                      You&apos;re set up with name and location — now show people who you are. Upload{" "}
                      <strong>one clear photo</strong> and you&apos;ll be ready to match.
                    </>
                  )}
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="connect-photos-modal-file-input"
                onChange={(e) => void handleFileSelect(e)}
                tabIndex={-1}
                aria-hidden
              />

              <div
                className="connect-photos-modal-slots"
                aria-label={`${displayCount} of ${MIN_PHOTOS_TO_CONNECT} photo uploaded`}
              >
                {slotPhotos.map((slot, i) => {
                  if (slot) {
                    return (
                      <div key={slot.id} className="connect-photos-modal-slot is-filled has-preview">
                        <img
                          src={slot.url}
                          alt="Your uploaded profile photo"
                          className="connect-photos-modal-slot-img"
                        />
                        <span className="connect-photos-modal-slot-check" aria-hidden>
                          ✓
                        </span>
                      </div>
                    );
                  }
                  const isTargetSlot = i === slotPhotos.findIndex((s) => s == null);
                  const showSpinner = uploading && isTargetSlot;
                  return (
                    <button
                      key={`empty-${i}`}
                      type="button"
                      className={`connect-photos-modal-slot connect-photos-modal-slot-btn is-empty ${
                        showSpinner ? "is-uploading" : ""
                      }`}
                      onClick={openFilePicker}
                      disabled={uploading || hasPhoto}
                      aria-label={showSpinner ? "Uploading photo…" : "Upload a photo"}
                    >
                      {showSpinner ? (
                        <span className="connect-photos-modal-slot-spinner" aria-hidden />
                      ) : (
                        <span className="connect-photos-modal-slot-plus" aria-hidden>
                          +
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="connect-photos-modal-progress">
                {uploading ? (
                  <>Uploading your photo…</>
                ) : showReturnCta ? (
                  <>Photo added — tap below to return to Connect</>
                ) : (
                  <span className="connect-photos-modal-progress-need">
                    Tap + to choose a photo from your device
                  </span>
                )}
              </p>

              {uploadError ? (
                <p className="connect-photos-modal-error" role="alert">
                  {uploadError}
                </p>
              ) : null}

              {!showReturnCta ? (
                <div className="connect-photos-modal-chips">
                  <span className="connect-photos-modal-chip">😊 Face visible</span>
                  <span className="connect-photos-modal-chip">☀️ Recent pics</span>
                  <span className="connect-photos-modal-chip">✨ Show personality</span>
                </div>
              ) : null}
            </div>

            <footer className="connect-photos-modal-actions">
              {showReturnCta ? (
                <button type="button" className="connect-photos-modal-primary" onClick={onClose}>
                  Back to Connect
                </button>
              ) : (
                <button
                  type="button"
                  className="connect-photos-modal-primary"
                  onClick={openFilePicker}
                  disabled={uploading}
                >
                  {uploading ? "Uploading…" : "Choose photo"}
                </button>
              )}
              <button
                type="button"
                className="connect-photos-modal-secondary"
                onClick={onClose}
                disabled={uploading}
              >
                Not now
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
