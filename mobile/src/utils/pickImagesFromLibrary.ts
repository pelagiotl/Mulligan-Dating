import { InteractionManager, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerOptions, ImagePickerResult } from 'expo-image-picker';

export class MediaLibraryPermissionDenied extends Error {
  override name = 'MediaLibraryPermissionDenied';
}

/** Thrown when a second picker launch is attempted while one is already open. */
export class ImagePickerBusyError extends Error {
  override name = 'ImagePickerBusyError';
}

function isRecoverableLauncherError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /unregistered ActivityResultLauncher/i.test(msg) ||
    /IllegalStateException/i.test(msg) ||
    /Already resumed/i.test(msg)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ANDROID_ACTIVITY_READY_TIMEOUT_MS = 450;

/** Let the Android activity finish transitions before launching a native picker. */
export function waitForAndroidActivityReady(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    };

    const timeoutId = setTimeout(finish, ANDROID_ACTIVITY_READY_TIMEOUT_MS);
    InteractionManager.runAfterInteractions(() => {
      clearTimeout(timeoutId);
      finish();
    });
  });
}

let libraryPickerOpen = false;
let libraryLaunchQueue: Promise<void> = Promise.resolve();

/** Recover from a stuck mutex after a failed or abandoned picker launch (Android). */
export function resetLibraryPickerMutex(): void {
  libraryPickerOpen = false;
  libraryLaunchQueue = Promise.resolve();
}

async function runExclusiveLibraryLaunch<T>(fn: () => Promise<T>): Promise<T> {
  const waitForPrior = libraryLaunchQueue;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  libraryLaunchQueue = waitForPrior.then(() => gate, () => gate);
  await waitForPrior;

  if (libraryPickerOpen) {
    release();
    throw new ImagePickerBusyError();
  }

  libraryPickerOpen = true;
  try {
    return await fn();
  } finally {
    libraryPickerOpen = false;
    release();
  }
}

export async function ensureMediaLibraryPermission(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted || current.status === 'granted') {
    return true;
  }
  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return requested.granted || requested.status === 'granted';
}

/** Warm permission cache on the photos step; do not request here (avoids racing the picker on Android). */
export function prefetchMediaLibraryPermission(): void {
  void ImagePicker.getMediaLibraryPermissionsAsync();
}

export type PickImagesFromLibraryOptions = {
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
  /** 0–1; Android uses 1 to avoid a known expo-image-picker launcher bug. */
  quality?: number;
};

/**
 * Launch the system photo library with Android retries for ActivityResultLauncher races.
 * Only one picker may be open app-wide at a time.
 */
export async function launchImageLibrarySafe(
  options: PickImagesFromLibraryOptions = {},
): Promise<ImagePickerResult> {
  return runExclusiveLibraryLaunch(async () => {
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

    const maxAttempts = Platform.OS === 'android' ? 4 : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await waitForAndroidActivityReady();
        if (attempt > 1) await delay(180 * attempt);
        return await ImagePicker.launchImageLibraryAsync(launchOptions);
      } catch (err) {
        lastError = err;
        if (!isRecoverableLauncherError(err) || attempt >= maxAttempts) {
          throw err;
        }
        if (__DEV__) {
          console.warn(
            `[ImagePicker] Retrying library launch (${attempt}/${maxAttempts}) after launcher error`,
          );
        }
      }
    }

    throw lastError;
  });
}

export async function pickImagesFromLibrary(
  options: PickImagesFromLibraryOptions = {},
): Promise<ImagePickerResult> {
  const granted = await ensureMediaLibraryPermission();
  if (!granted) {
    throw new MediaLibraryPermissionDenied();
  }

  const maxBusyRetries = 3;
  let lastBusy: ImagePickerBusyError | undefined;
  for (let attempt = 0; attempt < maxBusyRetries; attempt++) {
    try {
      return await launchImageLibrarySafe(options);
    } catch (err) {
      if (err instanceof ImagePickerBusyError) {
        lastBusy = err;
        resetLibraryPickerMutex();
        if (attempt < maxBusyRetries - 1) {
          await delay(220 * (attempt + 1));
          continue;
        }
      }
      throw err;
    }
  }
  resetLibraryPickerMutex();
  throw lastBusy ?? new ImagePickerBusyError();
}
