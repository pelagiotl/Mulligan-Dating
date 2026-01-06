import { useState, useRef, useEffect } from "react";
import { api } from "../utils/api";

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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profileId) {
      fetchPhotos();
    } else {
      fetchMyPhotos();
    }
  }, [profileId]);

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
      const data = await api.get<{ photos: Photo[] }>("/photos/me");
      setPhotos(data.photos);
    } catch (err) {
      // Photos might not exist yet, that's okay
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Check photo limit
    if (photos.length + files.length > maxPhotos) {
      setError(`Maximum ${maxPhotos} photos allowed. You can upload ${maxPhotos - photos.length} more.`);
      return;
    }

    // Validate file types and sizes
    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setError(`${file.name} is not an image file`);
        return;
      }
      if (file.size > 40 * 1024 * 1024) {
        setError(`${file.name} is too large. Maximum size is 40MB`);
        return;
      }
      validFiles.push(file);
    }

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      validFiles.forEach((file) => {
        formData.append("photos", file);
      });

      const token = localStorage.getItem("token");
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          // Don't set Content-Type - let browser set it with boundary for FormData
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload photos");
      }

      const data = await response.json();
      
      // Refresh photos
      if (profileId) {
        await fetchPhotos();
      } else {
        await fetchMyPhotos();
      }

      onPhotosUpdated?.();
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photos");
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

  const getPhotoUrl = (url: string) => {
    if (url.startsWith("http")) return url;
    return url.startsWith("/") ? url : `/${url}`;
  };

  if (loading) {
    return <div className="photo-upload-loading">Loading photos...</div>;
  }

  return (
    <div className="photo-upload">
      {error && <div className="auth-error">{error}</div>}

      <div className="photo-upload-grid">
        {photos.map((photo) => (
          <div key={photo.id} className="photo-item">
            <div className="photo-container">
              <img src={getPhotoUrl(photo.url)} alt={`Photo ${photo.displayOrder + 1}`} />
              {photo.isPrimary && <div className="photo-primary-badge">⭐ Primary</div>}
              {!profileId && (
                <div className="photo-actions">
                  {!photo.isPrimary && (
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleSetPrimary(photo.id)}
                      title="Set as primary"
                    >
                      ⭐
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDeletePhoto(photo.id)}
                    title="Delete photo"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {!profileId && photos.length < maxPhotos && (
          <div className="photo-upload-placeholder">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <button
              className="photo-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <span>Uploading...</span>
              ) : (
                <>
                  <span className="photo-upload-icon">➕</span>
                  <span>Add Photo</span>
                  <span className="photo-upload-hint">
                    {photos.length}/{maxPhotos}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {photos.length === 0 && !profileId && (
        <div className="photo-upload-empty">
          <p>No photos yet. Add your first photo to get started!</p>
        </div>
      )}
    </div>
  );
}

