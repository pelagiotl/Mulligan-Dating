import { useState, useRef, useEffect } from "react";
import { api } from "../utils/api";
import { getPhotoUrl } from "../utils/photoUrl";

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
  createdAt: string;
}

interface PhotoUploadProps {
  profileId?: string;
  onPhotosUpdated?: () => void;
  maxPhotos?: number;
}

export default function PhotoUpload({ profileId, onPhotosUpdated, maxPhotos = 6 }: PhotoUploadProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profileId) {
      fetchPhotos();
    } else {
      fetchMyPhotos();
    }
  }, [profileId]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxIndex]);

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

  const fetchPhotos = async () => {
    if (!profileId) return;
    try {
      setLoading(true);
      const data = await api.get<{ photos: Photo[] }>(`/photos/profile/${profileId}`);
      setPhotos(data.photos);
    } catch (err) {
      console.error("Failed to fetch photos:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyPhotos = async () => {
    try {
      setLoading(true);
      console.log('🔄 PhotoUpload: Fetching photos...');
      const data = await api.get<{ photos: Photo[] }>("/photos/me");
      console.log('✅ PhotoUpload: Photos fetched:', data.photos);
      setPhotos(data.photos || []);
      if (!data.photos || data.photos.length === 0) {
        console.log('⚠️ PhotoUpload: No photos found');
      }
    } catch (err) {
      console.error('❌ PhotoUpload: Failed to fetch photos:', err);
      setError(err instanceof Error ? err.message : 'Failed to load photos');
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  // Compress and resize image before upload
  const compressImage = (file: File, maxWidth = 1920, maxHeight = 1920, quality = 0.85): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Compression failed'));
                return;
              }
              // Create a new File with the compressed blob
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

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

    setUploading(true);
    setUploadProgress(0);
    setError("");

    try {
      // Compress images before upload
      console.log('🔄 Starting compression for', validFiles.length, 'file(s)');
      setUploadProgress(5);
      const compressedFiles: File[] = [];
      for (let i = 0; i < validFiles.length; i++) {
        setUploadingIndex(i);
        const progress = 5 + (i / validFiles.length) * 35;
        setUploadProgress(progress);
        console.log(`Compressing file ${i + 1}/${validFiles.length}...`);
        try {
          const originalSize = validFiles[i].size;
          const compressed = await compressImage(validFiles[i]);
          const newSize = compressed.size;
          const reduction = ((1 - newSize / originalSize) * 100).toFixed(1);
          console.log(`✅ Compressed ${validFiles[i].name}: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(newSize / 1024 / 1024).toFixed(2)}MB (${reduction}% reduction)`);
          compressedFiles.push(compressed);
        } catch (compressionError) {
          console.warn('⚠️ Compression failed, using original:', compressionError);
          compressedFiles.push(validFiles[i]);
        }
      }
      setUploadingIndex(null);
      setUploadProgress(40);
      console.log('✅ Compression complete, starting upload...');

      const formData = new FormData();
      compressedFiles.forEach((file) => {
        formData.append("photos", file);
      });

      // Use the same API URL logic as the api utility
      const API_URL: string = (import.meta.env as any).VITE_API_URL || (import.meta.env as any).VITE_NGROK_URL || '';
      const BASE_URL = API_URL ? `${API_URL}/api` : '/api';
      
      const token = localStorage.getItem("token");
      
      // Use XMLHttpRequest for progress tracking
      const result = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress (40% to 90% of total progress)
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = 40 + (e.loaded / e.total) * 50;
            const progress = Math.min(percentComplete, 90);
            setUploadProgress(progress);
            console.log(`📤 Upload progress: ${Math.round(progress)}% (${(e.loaded / 1024 / 1024).toFixed(2)}MB / ${(e.total / 1024 / 1024).toFixed(2)}MB)`);
          }
        });

        xhr.addEventListener('load', () => {
          setUploadProgress(95);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const contentType = xhr.getResponseHeader('content-type');
              if (contentType && contentType.includes('application/json')) {
                const data = JSON.parse(xhr.responseText);
                resolve(data);
              } else {
                resolve({ message: 'Photo uploaded successfully' });
              }
            } catch (parseError) {
              console.error('Error parsing response:', parseError);
              resolve({ message: 'Photo uploaded successfully' });
            }
          } else {
            let errorMessage = `Failed to upload photos (${xhr.status})`;
            try {
              const errorData = JSON.parse(xhr.responseText);
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {
              errorMessage = xhr.responseText || errorMessage;
            }
            reject(new Error(errorMessage));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload cancelled'));
        });

        xhr.open('POST', `${BASE_URL}/photos`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        // Don't set Content-Type - let browser set it with boundary for FormData
        xhr.send(formData);
      });
      
      setUploadProgress(100);
      console.log('Photo upload success:', result);
      
      // Refresh photos
      if (profileId) {
        await fetchPhotos();
      } else {
        await fetchMyPhotos();
      }

      onPhotosUpdated?.();
      
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
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("Are you sure you want to delete this photo?")) {
      return;
    }

    try {
      await api.delete(`/photos/${photoId}`);
      
      // Refresh photos
      if (profileId) {
        await fetchPhotos();
      } else {
        await fetchMyPhotos();
      }

      onPhotosUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete photo");
    }
  };

  const handleSetPrimary = async (photoId: string) => {
    try {
      await api.put(`/photos/${photoId}/primary`, {});
      
      // Refresh photos
      if (profileId) {
        await fetchPhotos();
      } else {
        await fetchMyPhotos();
      }

      onPhotosUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set primary photo");
    }
  };

  const movePhotoInOrder = async (photoId: string, delta: number) => {
    if (profileId || reordering || delta === 0) return;
    const order = [...photos].sort((a, b) => a.displayOrder - b.displayOrder);
    const idx = order.findIndex((p) => p.id === photoId);
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= order.length) return;

    const next = [...order];
    const [removed] = next.splice(idx, 1);
    next.splice(newIdx, 0, removed);
    const photoIds = next.map((p) => p.id);
    const optimistic = next.map((p, i) => ({
      ...p,
      displayOrder: i,
      isPrimary: i === 0,
    }));

    setReordering(true);
    setError("");
    setPhotos(optimistic);
    try {
      await api.put("/photos/reorder", { photoIds });
      if (profileId) {
        await fetchPhotos();
      } else {
        await fetchMyPhotos();
      }
      onPhotosUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder photos");
      if (profileId) {
        await fetchPhotos();
      } else {
        await fetchMyPhotos();
      }
    } finally {
      setReordering(false);
    }
  };

  if (loading) {
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
          Tip: use <strong>Earlier</strong> / <strong>Later</strong> on each photo to change order. The first photo is your profile thumbnail.
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
            return (
              <div key={slot.photo.id} className="photo-item">
                <div className="photo-container">
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
                  </button>
                  {slot.photo.isPrimary && <div className="photo-primary-badge">⭐ Primary</div>}
                  {!profileId && sortedPhotos.length > 1 ? (
                    <div className="photo-reorder" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="photo-reorder-btn"
                        disabled={reordering || slot.index === 0}
                        title="Move earlier in gallery"
                        aria-label={`Move photo ${slot.index + 1} earlier in gallery order`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void movePhotoInOrder(slot.photo!.id, -1);
                        }}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="photo-reorder-btn"
                        disabled={reordering || slot.index === sortedPhotos.length - 1}
                        title="Move later in gallery"
                        aria-label={`Move photo ${slot.index + 1} later in gallery order`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void movePhotoInOrder(slot.photo!.id, 1);
                        }}
                      >
                        ›
                      </button>
                    </div>
                  ) : null}
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
            // Empty slot - show upload button
            return (
              <div key={`empty-${slot.index}`} className="photo-item photo-upload-placeholder">
                {!profileId && (
                  <button
                    className="photo-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <span className="photo-upload-icon">➕</span>
                    <span>Add Photo</span>
                    <span className="photo-upload-slot-number">{slot.index + 1}</span>
                  </button>
                )}
              </div>
            );
          }
        })}
      </div>

      {safeLightboxIndex !== null && sortedPhotos.length > 0 && (
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
        </div>
      )}
    </div>
  );
}

