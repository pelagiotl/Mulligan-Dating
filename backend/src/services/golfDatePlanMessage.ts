import type { MedfordGolfCourse } from '../data/medfordGolfCourses.js';
import { getMedfordGolfCourse } from '../data/medfordGolfCourses.js';

export type GolfDatePlanBringingNotes = {
  balls?: boolean;
  tees?: boolean;
  snacks?: boolean;
  other?: string;
};

/** Hydrated snapshot attached to chat messages (mobile + web cards). */
export type GolfDatePlanMessageSnapshot = {
  id: string;
  courseId: string;
  courseName: string;
  courseCity: string;
  bookingUrl: string;
  holes?: MedfordGolfCourse['holes'];
  difficulty?: MedfordGolfCourse['difficulty'];
  bestForFirstDate?: boolean;
  proposedAt?: string | null;
  notes: GolfDatePlanBringingNotes;
  status?: string;
  createdBy?: string;
};

export function formatGolfBringing(notes: GolfDatePlanBringingNotes): string {
  const parts: string[] = [];
  if (notes.balls) parts.push('balls');
  if (notes.tees) parts.push('tees');
  if (notes.snacks) parts.push('snacks');
  if (notes.other?.trim()) parts.push(notes.other.trim());
  return parts.length ? parts.join(', ') : 'TBD';
}

export function formatGolfWhenLabel(iso?: string | null): string {
  if (!iso) return 'time TBD';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'time TBD';
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function serializeGolfDatePlanForMessage(params: {
  id: string;
  courseId: string;
  course?: MedfordGolfCourse | null;
  proposedAt?: string | null;
  notes: GolfDatePlanBringingNotes;
  status?: string;
  createdBy?: string;
}): GolfDatePlanMessageSnapshot | undefined {
  const course = params.course || getMedfordGolfCourse(params.courseId);
  if (!course) return undefined;
  return {
    id: params.id,
    courseId: params.courseId,
    courseName: course.name,
    courseCity: course.city,
    bookingUrl: course.bookingUrl,
    holes: course.holes,
    difficulty: course.difficulty,
    bestForFirstDate: course.bestForFirstDate,
    proposedAt: params.proposedAt ?? null,
    notes: params.notes || {},
    status: params.status,
    createdBy: params.createdBy,
  };
}

/** Build from messages JOIN columns (`gdp_*` + `golf_date_plan_id`). */
export function golfDatePlanSnapshotFromJoin(
  m: Record<string, unknown>,
): GolfDatePlanMessageSnapshot | undefined {
  if (!m.golf_date_plan_id) return undefined;
  const courseId = m.gdp_course_id ? String(m.gdp_course_id) : '';
  if (!courseId) return undefined;
  let notes: GolfDatePlanBringingNotes = {};
  if (typeof m.gdp_notes_json === 'string' && m.gdp_notes_json) {
    try {
      notes = JSON.parse(m.gdp_notes_json) as GolfDatePlanBringingNotes;
    } catch {
      notes = {};
    }
  }
  return serializeGolfDatePlanForMessage({
    id: String(m.golf_date_plan_id),
    courseId,
    proposedAt: m.gdp_proposed_at ? String(m.gdp_proposed_at) : null,
    notes,
    status: m.gdp_status ? String(m.gdp_status) : undefined,
    createdBy: m.gdp_created_by ? String(m.gdp_created_by) : undefined,
  });
}

export function golfDatePlanFallbackContent(
  snapshot: GolfDatePlanMessageSnapshot,
  whenLabel: string,
): string {
  return (
    `⛳ You're invited to a Golf Date!\n` +
    `🏌️ ${snapshot.courseName}\n` +
    `📍 ${snapshot.courseCity}\n` +
    `📅 ${whenLabel}\n` +
    `🎒 Bringing: ${formatGolfBringing(snapshot.notes)}\n` +
    `🔗 Book tee time: ${snapshot.bookingUrl}`
  );
}
