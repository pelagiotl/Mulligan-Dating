import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MIN_PHOTOS_TO_CONNECT, minPhotosToConnectLabel } from "../utils/connectProfileEligibility";
import { uploadPhotoFiles, type UploadedPhoto } from "../utils/photoBatchUpload";

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
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [optimisticCount, setOptimisticCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setUploadError("");
    setOptimisticCount(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !uploading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, uploading]);

  if (!open) return null;

  const displayCount = Math.max(photoCount, optimisticCount);
  const hasPhoto = displayCount >= MIN_PHOTOS_TO_CONNECT;

  const goToPhotos = () => {
    if (uploading) return;
    onClose();
    navigate("/profile#my-photos");
  };

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
      const newCount = photoCount + uploaded.length;
      setOptimisticCount(newCount);
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
                You&apos;re set up with name and location — now show people who you are. Upload{" "}
                <strong>one clear photo</strong> and you&apos;ll be ready to match.
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
                {Array.from({ length: MIN_PHOTOS_TO_CONNECT }, (_, i) => {
                  const filled = i < displayCount;
                  if (filled) {
                    return (
                      <div key={i} className="connect-photos-modal-slot is-filled">
                        <span className="connect-photos-modal-slot-emoji" aria-hidden>
                          📷
                        </span>
                        <span className="connect-photos-modal-slot-check" aria-hidden>
                          ✓
                        </span>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`connect-photos-modal-slot connect-photos-modal-slot-btn is-empty ${
                        uploading ? "is-uploading" : ""
                      }`}
                      onClick={openFilePicker}
                      disabled={uploading}
                      aria-label={uploading ? "Uploading photo…" : "Upload a photo"}
                    >
                      {uploading ? (
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
                ) : hasPhoto ? (
                  <>Photo added — you&apos;re ready</>
                ) : (
                  <span className="connect-photos-modal-progress-need">
                    Tap + to upload, or use the button below
                  </span>
                )}
              </p>

              {uploadError ? (
                <p className="connect-photos-modal-error" role="alert">
                  {uploadError}
                </p>
              ) : null}

              <div className="connect-photos-modal-chips">
                <span className="connect-photos-modal-chip">😊 Face visible</span>
                <span className="connect-photos-modal-chip">☀️ Recent pics</span>
                <span className="connect-photos-modal-chip">✨ Show personality</span>
              </div>
            </div>

            <footer className="connect-photos-modal-actions">
              <button
                type="button"
                className="connect-photos-modal-primary"
                onClick={goToPhotos}
                disabled={uploading}
              >
                {hasPhoto ? "View on Profile →" : "Add my photo →"}
              </button>
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
