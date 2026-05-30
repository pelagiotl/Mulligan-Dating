import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "../utils/api";
import { getPhotoUrl } from "../utils/photoUrl";
import { useBodyScrollLock } from "../utils/bodyScrollLock";
import { usePhotoDragReorder } from "../hooks/usePhotoDragReorder";
import { uploadPhotoFiles } from "../utils/photoBatchUpload";

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
  createdAt: string;
}

export type PhotoUploadUpdateKind = "reorder" | "mutate";

interface PhotoUploadProps {
  profileId?: string;
  /** reorder = photos only; mutate = also refresh profile header / preview data */
  onPhotosUpdated?: (kind?: PhotoUploadUpdateKind) => void;
  maxPhotos?: number;
}

export default function PhotoUpload({ profileId, onPhotosUpdated, maxPhotos = 6 }: PhotoUploadProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  /** Grid slot indices (0..maxPhotos-1) currently receiving an upload. */
  const [uploadingSlotIndices, setUploadingSlotIndices] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profileId) {
      fetchPhotos();
    } else {
      fetchMyPhotos();
    }
  }, [profileId]);

  useBodyScrollLock(lightboxIndex !== null);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxIndex(null);
        return;
      }
      const n = photos.length;
      if (n === 0) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setLightboxIndex((i) => (i === null ? null : (i + n - 1) % n));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setLightboxIndex((i) => (i === null ? null : (i + 1) % n));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, photos.length]);

  useEffect(() => {
    setLightboxIndex((i) => {
      if (i === null) return null;
      const n = photos.length;
      if (n === 0) return null;
      return i >= n ? n - 1 : i;
    });
  }, [photos]);

  const fetchPhotos = async (options?: { silent?: boolean }) => {
    if (!profileId) return;
    const silent = options?.silent ?? false;
    try {
      if (!silent) setLoading(true);
      const data = await api.get<{ photos: Photo[] }>(`/photos/profile/${profileId}`);
      setPhotos(data.photos);
    } catch (err) {
      console.error("Failed to fetch photos:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchMyPhotos = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      if (!silent) setLoading(true);
      const data = await api.get<{ photos: Photo[] }>(`/photos/me?_=${Date.now()}`);
      setPhotos(data.photos || []);
    } catch (err) {
      console.error("Failed to fetch photos:", err);
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to load photos");
        setPhotos([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const refreshPhotos = useCallback(async () => {
    try {
      if (profileId) {
        const data = await api.get<{ photos: Photo[] }>(`/photos/profile/${profileId}`);
        setPhotos(data.photos);
        return;
      }
      const data = await api.get<{ photos: Photo[] }>(`/photos/me?_=${Date.now()}`, false);
      setPhotos(data.photos || []);
    } catch (err) {
      console.error("Failed to refresh photos:", err);
    }
  }, [profileId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Check photo limit
    const remainingSlots = maxPhotos - photos.length;
    if (files.length > remainingSlots) {
      setError(`You can only upload ${remainingSlots} more photo(s). Maximum ${maxPhotos} photos allowed.`);
      return;
    }

    // Validate file types
    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setError(`${file.name} is not an image file`);
        return;
      }
      validFiles.push(file);
    }

    const targetSlots = Array.from({ length: validFiles.length }, (_, i) => photos.length + i).filter(
      (idx) => idx < maxPhotos
    );

    setUploading(true);
    setUploadProgress(0);
    setUploadingSlotIndices(targetSlots);
    setError("");

    try {
      setUploadProgress(5);
      await uploadPhotoFiles(validFiles, {
        onCompressProgress: (i, total) => {
          setUploadingIndex(i);
          setUploadProgress(5 + ((i + 1) / total) * 35);
        },
        onUploadProgress: (percent) => {
          setUploadProgress(40 + percent * 0.5);
        },
      });
      setUploadingIndex(null);
      setUploadProgress(100);
      
      await refreshPhotos();
      onPhotosUpdated?.("mutate");
      
      // Reset file input and progress
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setUploadProgress(0);
      setUploadingIndex(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photos");
      setUploadProgress(0);
      setUploadingIndex(null);
    } finally {
      setUploading(false);
      setUploadingSlotIndices([]);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("Are you sure you want to delete this photo?")) {
      return;
    }

    try {
      await api.delete(`/photos/${photoId}`);
      
      await refreshPhotos();
      onPhotosUpdated?.("mutate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete photo");
    }
  };

  const handleSetPrimary = async (photoId: string) => {
    try {
      await api.put(`/photos/${photoId}/primary`, {});
      
      await refreshPhotos();
      onPhotosUpdated?.("mutate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set primary photo");
    }
  };

  const applyPhotoReorder = useCallback(
    async (photoIds: string[]) => {
      if (profileId) return;
      const order = [...photos].sort((a, b) => a.displayOrder - b.displayOrder);
      const byId = new Map(order.map((p) => [p.id, p]));
      const optimistic = photoIds
        .map((id, i) => {
          const p = byId.get(id);
          return p ? { ...p, displayOrder: i, isPrimary: i === 0 } : null;
        })
        .filter((p): p is Photo => p != null);

      const previous = photos;
      setError("");
      setPhotos(optimistic);
      try {
        await api.put("/photos/reorder", { photoIds });
        await refreshPhotos();
        onPhotosUpdated?.("reorder");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reorder photos");
        setPhotos(previous);
        await refreshPhotos();
      }
    },
    [profileId, photos, onPhotosUpdated, refreshPhotos]
  );

  const sortedForDrag = [...photos].sort((a, b) => a.displayOrder - b.displayOrder);
  const dragReorder = usePhotoDragReorder({
    items: sortedForDrag,
    onReorder: applyPhotoReorder,
    disabled: !!profileId,
  });

  if (loading && photos.length === 0) {
    return <div className="photo-upload-loading">Loading photos...</div>;
  }

  // Sort photos by displayOrder to ensure correct order
  const sortedPhotos = [...photos].sort((a, b) => a.displayOrder - b.displayOrder);

  const safeLightboxIndex =
    lightboxIndex !== null && sortedPhotos.length > 0
      ? Math.min(lightboxIndex, sortedPhotos.length - 1)
      : null;

  const openLightboxAt = (photoId: string) => {
    const idx = sortedPhotos.findIndex((p) => p.id === photoId);
    if (idx >= 0) setLightboxIndex(idx);
  };

  const closeLightbox = () => setLightboxIndex(null);

  const goLightbox = (delta: number) => {
    const n = sortedPhotos.length;
    if (n === 0) return;
    setLightboxIndex((i) => {
      if (i === null) return null;
      return (i + delta + n) % n;
    });
  };
  
  // Create array of slots: first show all photos, then fill remaining with empty slots
  const slots: Array<{ index: number; photo: Photo | null }> = [];
  
  // Add filled slots for existing photos
  sortedPhotos.forEach((photo, idx) => {
    slots.push({ index: idx, photo });
  });
  
  // Add empty slots for remaining capacity
  for (let i = sortedPhotos.length; i < maxPhotos; i++) {
    slots.push({ index: i, photo: null });
  }
  
  return (
    <div className="photo-upload">
      {error && <div className="auth-error">{error}</div>}

      {!profileId && sortedPhotos.length > 1 ? (
        <p className="photo-upload-reorder-hint">
          Drag photos to reorder. The first photo is your profile thumbnail. You can also select multiple photos at once when adding.
        </p>
      ) : null}
      {!profileId && sortedPhotos.length <= 1 && sortedPhotos.length < maxPhotos ? (
        <p className="photo-upload-reorder-hint">
          Select multiple photos at once when adding — up to {maxPhotos} total.
        </p>
      ) : null}

      {uploading && (
        <div className="photo-upload-progress">
          <div className="photo-upload-progress-bar">
            <div 
              className="photo-upload-progress-fill" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <div className="photo-upload-progress-text">
            {uploadingIndex !== null 
              ? `Compressing photo ${uploadingIndex + 1}...` 
              : `Uploading... ${Math.round(uploadProgress)}%`}
          </div>
        </div>
      )}

      <div className="photo-upload-grid">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        
        {slots.map((slot) => {
          if (slot.photo) {
            // Filled slot - show photo
            const canDrag = !profileId && sortedPhotos.length > 1;
            return (
              <div
                key={slot.photo.id}
                className={dragReorder.getDragItemClassName(slot.photo.id, "photo-item")}
                draggable={canDrag}
                onDragStart={(e) => dragReorder.handleDragStart(e, slot.photo!.id)}
                onDragEnd={dragReorder.handleDragEnd}
                onDragOver={(e) => dragReorder.handleDragOver(e, slot.photo!.id)}
                onDragLeave={dragReorder.handleDragLeave}
                onDrop={(e) => void dragReorder.handleDrop(e, slot.photo!.id)}
              >
                <div className="photo-container">
                  {canDrag ? (
                    <span className="photo-drag-handle" aria-hidden>
                      ⋮⋮
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="photo-upload-thumb"
                    onClick={() => openLightboxAt(slot.photo!.id)}
                    aria-label={`View photo ${slot.index + 1} larger`}
                  >
                    <img
                      src={getPhotoUrl(slot.photo.url) || "#"}
                      alt={`Photo ${slot.index + 1}`}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                      }}
                      draggable={false}
                    />
                    <span className="photo-upload-view-overlay" aria-hidden>
                      <span className="photo-upload-view-icon">🧤</span>
                      <span className="photo-upload-view-label">View</span>
                    </span>
                  </button>
                  {slot.photo.isPrimary && <div className="photo-primary-badge">⭐ Primary</div>}
                  {!profileId && (
                    <div className="photo-actions">
                      {!slot.photo.isPrimary && (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSetPrimary(slot.photo!.id);
                          }}
                          title="Set as primary"
                        >
                          ⭐
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeletePhoto(slot.photo!.id);
                        }}
                        title="Delete photo"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          } else {
            const slotUploading = uploadingSlotIndices.includes(slot.index);
            return (
              <div key={`empty-${slot.index}`} className="photo-item photo-upload-placeholder">
                {!profileId && (
                  <button
                    className="photo-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    aria-busy={slotUploading}
                  >
                    {slotUploading ? (
                      <span className="photo-slot-spinner" aria-hidden />
                    ) : (
                      <>
                        <span className="photo-upload-icon">➕</span>
                        <span>Add Photos</span>
                        <span className="photo-upload-slot-number">{slot.index + 1}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          }
        })}
      </div>

      {safeLightboxIndex !== null && sortedPhotos.length > 0
        ? createPortal(
            <div
              className="photo-lightbox-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Enlarged photos"
            >
              <div className="photo-lightbox-backdrop" onClick={closeLightbox} aria-hidden />
              <button type="button" className="photo-lightbox-close" onClick={closeLightbox} aria-label="Close">
                ×
              </button>
              {sortedPhotos.length > 1 && (
                <button
                  type="button"
                  className="photo-lightbox-nav photo-lightbox-nav--prev"
                  onClick={() => goLightbox(-1)}
                  aria-label="Previous photo"
                >
                  ‹
                </button>
              )}
              <div className="photo-lightbox-content" onClick={(e) => e.stopPropagation()}>
                <img
                  src={getPhotoUrl(sortedPhotos[safeLightboxIndex].url) || "#"}
                  alt={`Photo ${safeLightboxIndex + 1} of ${sortedPhotos.length}`}
                  className="photo-lightbox-img"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                  draggable={false}
                />
                <div className="photo-lightbox-caption">
                  {safeLightboxIndex + 1} / {sortedPhotos.length}
                  {sortedPhotos[safeLightboxIndex].isPrimary ? <span className="photo-lightbox-primary-tag"> · Primary</span> : null}
                </div>
              </div>
              {sortedPhotos.length > 1 && (
                <button
                  type="button"
                  className="photo-lightbox-nav photo-lightbox-nav--next"
                  onClick={() => goLightbox(1)}
                  aria-label="Next photo"
                >
                  ›
                </button>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

