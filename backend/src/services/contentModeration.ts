import fs from 'fs';
import path from 'path';
import type { Express } from 'express';

/** Shown to users when content is blocked. */
export const CONTENT_MODERATION_REJECTED_MESSAGE =
  "This file doesn't meet our community guidelines. Please choose a different photo or video.";

export class ContentModerationError extends Error {
  constructor(message = CONTENT_MODERATION_REJECTED_MESSAGE) {
    super(message);
    this.name = 'ContentModerationError';
  }
}

type NudityScores = {
  sexual_activity?: number;
  sexual_display?: number;
  erotica?: number;
  very_suggestive?: number;
  suggestive?: number;
};

type SightengineImageResponse = {
  status: string;
  nudity?: NudityScores;
  offensive?: { prob?: number };
  error?: { message?: string };
};

type SightengineVideoFrame = {
  nudity?: NudityScores;
  offensive?: { prob?: number };
};

type SightengineVideoResponse = {
  status: string;
  data?: { frames?: SightengineVideoFrame[] };
  error?: { message?: string };
};

function credentials(): { user: string; secret: string } | null {
  const user = process.env.SIGHTENGINE_API_USER?.trim();
  const secret = process.env.SIGHTENGINE_API_SECRET?.trim();
  if (!user || !secret) return null;
  return { user, secret };
}

export function isContentModerationEnabled(): boolean {
  if (process.env.CONTENT_MODERATION_ENABLED === 'false') return false;
  return credentials() != null;
}

function isNudityRejected(nudity?: NudityScores): boolean {
  if (!nudity) return false;
  return (
    (nudity.sexual_activity ?? 0) >= 0.45 ||
    (nudity.sexual_display ?? 0) >= 0.45 ||
    (nudity.erotica ?? 0) >= 0.6 ||
    (nudity.very_suggestive ?? 0) >= 0.82
  );
}

function isOffensiveRejected(offensive?: { prob?: number }): boolean {
  return (offensive?.prob ?? 0) >= 0.7;
}

function evaluateImageResult(data: SightengineImageResponse): boolean {
  if (data.status !== 'success') {
    throw new Error(data.error?.message || 'Content moderation check failed');
  }
  return isNudityRejected(data.nudity) || isOffensiveRejected(data.offensive);
}

function evaluateVideoResult(data: SightengineVideoResponse): boolean {
  if (data.status !== 'success') {
    throw new Error(data.error?.message || 'Content moderation check failed');
  }
  const frames = data.data?.frames ?? [];
  return frames.some(
    (frame) => isNudityRejected(frame.nudity) || isOffensiveRejected(frame.offensive),
  );
}

function filenameForMime(mimeType: string, fallbackExt: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v',
  };
  const ext = map[mimeType.toLowerCase()] || fallbackExt;
  return `upload.${ext}`;
}

async function postSightengine(
  endpoint: string,
  buffer: Buffer,
  mimeType: string,
  models: string,
  timeoutMs = 45_000,
): Promise<unknown> {
  const creds = credentials();
  if (!creds) {
    throw new Error('Sightengine credentials not configured');
  }

  const form = new FormData();
  form.append(
    'media',
    new Blob([new Uint8Array(buffer)], { type: mimeType || 'application/octet-stream' }),
    filenameForMime(mimeType, endpoint.includes('video') ? 'mp4' : 'jpg'),
  );
  form.append('models', models);
  form.append('api_user', creds.user);
  form.append('api_secret', creds.secret);

  const url = `https://api.sightengine.com/1.0/${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', body: form, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Sightengine timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const message =
      typeof data.error === 'object' &&
      data.error != null &&
      'message' in data.error &&
      typeof (data.error as { message?: unknown }).message === 'string'
        ? (data.error as { message: string }).message
        : `Sightengine HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function runCheck(
  kind: 'image' | 'video',
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  if (!isContentModerationEnabled()) return;

  try {
    if (kind === 'image') {
      const result = (await postSightengine(
        'check.json',
        buffer,
        mimeType,
        'nudity-2.1,offensive',
      )) as SightengineImageResponse;
      if (evaluateImageResult(result)) {
        throw new ContentModerationError();
      }
      return;
    }

    const result = (await postSightengine(
      'video/check-sync.json',
      buffer,
      mimeType,
      'nudity-2.1,offensive',
    )) as SightengineVideoResponse;
    if (evaluateVideoResult(result)) {
      throw new ContentModerationError();
    }
  } catch (error) {
    if (error instanceof ContentModerationError) throw error;
    console.error('Content moderation API error (upload allowed):', error);
    if (process.env.CONTENT_MODERATION_STRICT === 'true') {
      throw new Error('Content moderation is temporarily unavailable. Please try again shortly.');
    }
  }
}

export async function moderateImageUpload(buffer: Buffer, mimeType: string): Promise<void> {
  if (!buffer?.length) return;
  await runCheck('image', buffer, mimeType);
}

export async function moderateVideoUpload(buffer: Buffer, mimeType: string): Promise<void> {
  if (!buffer?.length) return;
  await runCheck('video', buffer, mimeType);
}

/** Resolve multer file bytes for disk or memory storage. */
export async function readUploadBuffer(file: Express.Multer.File): Promise<Buffer> {
  if (file.buffer?.length) return file.buffer;
  if (file.path && fs.existsSync(file.path)) {
    return fs.readFileSync(file.path);
  }
  const localPath = path.join(process.cwd(), 'uploads', file.filename);
  if (file.filename && fs.existsSync(localPath)) {
    return fs.readFileSync(localPath);
  }
  throw new Error('Upload buffer not available for moderation');
}

export function handleModerationRouteError(
  error: unknown,
  res: { status: (code: number) => { json: (body: unknown) => void } },
): boolean {
  if (error instanceof ContentModerationError) {
    res.status(400).json({ error: error.message });
    return true;
  }
  return false;
}
