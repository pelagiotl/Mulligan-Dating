import { api, ApiError } from './api';
import { isLikelyInSouthernOregonByText } from './locationUtils';

export type ServiceAreaLocationCheck = {
  valid: boolean;
  message?: string;
};

const OUTSIDE_SERVICE_AREA_MESSAGE =
  'Location must be within 100 miles of Southern Oregon (e.g. Medford, OR or Ashland, Oregon).';

/** Check whether a city/state is within the Southern Oregon service area. */
export async function checkLocationInServiceArea(location: string): Promise<ServiceAreaLocationCheck> {
  const trimmed = location.trim();
  if (!trimmed) return { valid: false, message: 'Location is required.' };

  if (isLikelyInSouthernOregonByText(trimmed)) {
    return { valid: true };
  }

  try {
    await api.post<{ valid: boolean }>('/profile/validate-location', { location: trimmed });
    return { valid: true };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) {
        return { valid: false, message: OUTSIDE_SERVICE_AREA_MESSAGE };
      }
      return { valid: false, message: error.message || OUTSIDE_SERVICE_AREA_MESSAGE };
    }
    return { valid: false, message: 'Could not verify location. Please try again.' };
  }
}
