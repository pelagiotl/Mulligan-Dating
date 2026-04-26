/**
 * Constructs the full URL for a photo
 * Handles both local development and production (Render) scenarios
 * @param url - Photo URL from database (e.g., "/uploads/filename.jpg")
 * @returns Full URL to the photo (e.g., "https://backend-url/uploads/filename.jpg" or "/uploads/filename.jpg" for local)
 */
export function getPhotoUrl(url: string | null | undefined): string {
  // Handle null/undefined
  if (!url) {
    return '';
  }
  
  // If already a full URL, return as-is
  if (url.startsWith("http")) {
    return url;
  }

  // Protocol-relative CDN URLs
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  
  // Get the backend API URL from environment variables (same logic as api.ts)
  const API_URL: string = (import.meta.env as any).VITE_API_URL || (import.meta.env as any).VITE_NGROK_URL || '';
  
  // If we have an API URL (production), construct the full backend URL for the upload
  // Photo URLs are stored as /uploads/filename.jpg and served from backend
  if (API_URL) {
    // Remove /api suffix if present since photos are served directly from /uploads
    // Also handle case where API_URL might be just the domain without /api
    let baseUrl = API_URL.replace(/\/api\/?$/, '');
    
    // Ensure baseUrl doesn't end with /
    baseUrl = baseUrl.replace(/\/$/, '');
    
    // Construct the full URL
    const fullUrl = url.startsWith("/") ? `${baseUrl}${url}` : `${baseUrl}/${url}`;
    
    return fullUrl;
  }
  
  // For local development, photos are served from backend at /uploads
  // Vite proxy handles this in development
  return url.startsWith("/") ? url : `/${url}`;
}

