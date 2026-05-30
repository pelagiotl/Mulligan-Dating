import { api } from './api';
import {
  DEFAULT_MATCH_SLOT_LIMIT,
  effectiveConnectionSlotLimit,
} from '../constants/matchSlots';

export type MatchSlotStatus = {
  count: number;
  slotLimit: number;
  slotsOpen: number;
  isAtCapacity: boolean;
};

export async function fetchMatchSlotStatus(): Promise<MatchSlotStatus> {
  try {
    api.clearCache('/matches/count');
    const data = await api.get<{ count: number; slotLimit: number }>('/matches/count', false);
    const count = Math.max(0, Math.floor(Number(data.count ?? 0)));
    const slotLimit = effectiveConnectionSlotLimit(data.slotLimit);
    const slotsOpen = Math.max(0, slotLimit - count);
    return {
      count,
      slotLimit,
      slotsOpen,
      isAtCapacity: count >= slotLimit,
    };
  } catch {
    return {
      count: 0,
      slotLimit: DEFAULT_MATCH_SLOT_LIMIT,
      slotsOpen: DEFAULT_MATCH_SLOT_LIMIT,
      isAtCapacity: false,
    };
  }
}
