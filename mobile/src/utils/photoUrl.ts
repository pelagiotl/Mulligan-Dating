/**
 * Constructs the full URL for a photo
 * Handles both local development and production scenarios
 * @param url - Photo URL from database (e.g., "/uploads/filename.jpg" or Cloudinary URL)
 * @returns Full URL to the photo
 */
export function getPhotoUrl(url: string | null | undefined): string {
  // Handle null/undefined
  if (!url) {
    return '';
  }
  
  // If already a full URL (Cloudinary or http), return as-is
  if (url.startsWith("http")) {
    return url;
  }
  
  // If it's a file:// URL (local file), return as-is (React Native Image handles these natively)
  if (url.startsWith("file://")) {
    return url;
  }
  
  // Get the backend API URL from environment or default
  const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
  
  // Remove /api suffix if present since photos are served directly from /uploads
  let baseUrl = API_URL.replace(/\/api\/?$/, '');
  
  // Ensure baseUrl doesn't end with /
  baseUrl = baseUrl.replace(/\/$/, '');
  
  // Construct the full URL
  const fullUrl = url.startsWith("/") ? `${baseUrl}${url}` : `${baseUrl}/${url}`;
  
  return fullUrl;
}

