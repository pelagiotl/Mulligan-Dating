import { InteractionManager, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerOptions, ImagePickerResult } from 'expo-image-picker';

export class MediaLibraryPermissionDenied extends Error {
  override name = 'MediaLibraryPermissionDenied';
}

function isUnregisteredLauncherError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /unregistered ActivityResultLauncher/i.test(msg) ||
    /IllegalStateException/i.test(msg)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Let the Android activity finish any transitions before launching a native picker. */
function waitForAndroidActivityReady(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
}

export async function ensureMediaLibraryPermission(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted || current.status === 'granted') {
    return true;
  }
  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return requested.granted || requested.status === 'granted';
}

/** Warm permissions while on the photos step so the picker launch is not delayed by the dialog. */
export function prefetchMediaLibraryPermission(): void {
  void ImagePicker.getMediaLibraryPermissionsAsync().then((current) => {
    if (!current.granted && current.canAskAgain) {
      void ImagePicker.requestMediaLibraryPermissionsAsync();
    }
  });
}

export type PickImagesFromLibraryOptions = {
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
  /** 0–1; Android uses 1 to avoid a known expo-image-picker launcher bug. */
  quality?: number;
};

/**
 * Launch the system photo library with Android retries for unregistered ActivityResultLauncher.
 */
export async function launchImageLibrarySafe(
  options: PickImagesFromLibraryOptions = {},
): Promise<ImagePickerResult> {
  const allowsMultipleSelection = options.allowsMultipleSelection ?? false;
  const selectionLimit = options.selectionLimit;
  const quality = options.quality ?? 0.85;
  const launchQuality = Platform.OS === 'android' ? 1 : quality;

  const launchOptions: ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: launchQuality,
    allowsMultipleSelection,
    ...(selectionLimit != null ? { selectionLimit } : {}),
  };

  const maxAttempts = Platform.OS === 'android' ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await waitForAndroidActivityReady();
      if (attempt > 1) await delay(120 * attempt);
      return await ImagePicker.launchImageLibraryAsync(launchOptions);
    } catch (err) {
      lastError = err;
      if (!isUnregisteredLauncherError(err) || attempt >= maxAttempts) {
        throw err;
      }
      if (__DEV__) {
        console.warn(
          `[ImagePicker] Retrying library launch (${attempt}/${maxAttempts}) after ActivityResultLauncher error`,
        );
      }
    }
  }

  throw lastError;
}

export async function pickImagesFromLibrary(
  options: PickImagesFromLibraryOptions = {},
): Promise<ImagePickerResult> {
  const granted = await ensureMediaLibraryPermission();
  if (!granted) {
    throw new MediaLibraryPermissionDenied();
  }
  return launchImageLibrarySafe(options);
}
