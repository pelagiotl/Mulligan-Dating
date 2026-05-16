import {
  MATCH_CHAT_DEPTH_MIN_EACH,
  matchChatDepthCounts,
  type MatchChatDepthFeature,
} from "../utils/matchChatDepthGate";

type Props = {
  open: boolean;
  onClose: () => void;
  feature: MatchChatDepthFeature;
  messages: Array<{ senderId: string }>;
  currentUserId?: string;
  chatPartnerUserId?: string;
};

const BRANDING: Record<
  MatchChatDepthFeature,
  { emoji: string; kicker: string; title: string; lead: string; hint: string }
> = {
  truth_or_dare: {
    emoji: "🎲",
    kicker: "TRUTH OR DARE",
    title: "Warm up the chat first",
    lead: `Send at least ${MATCH_CHAT_DEPTH_MIN_EACH} messages each — then Truth or Dare unlocks for this match.`,
    hint: "Real back-and-forth keeps prompts fun — we'll nudge you until you've both chimed in enough.",
  },
  never_have_i_ever: {
    emoji: "🙊",
    kicker: "NEVER HAVE I EVER",
    title: "Warm up the chat first",
    lead: `Send at least ${MATCH_CHAT_DEPTH_MIN_EACH} messages each — then Never Have I Ever unlocks for this match.`,
    hint: "Real back-and-forth keeps things fun — we'll nudge you until you've both chimed in enough.",
  },
  date_plan: {
    emoji: "📅",
    kicker: "HANGOUT PLAN",
    title: "Warm up the chat first",
    lead: `Send at least ${MATCH_CHAT_DEPTH_MIN_EACH} messages each — then you can generate a hangout plan for this match.`,
    hint: "A little conversation first helps the plan feel personal — we'll nudge you until you've both chimed in enough.",
  },
};

export default function MatchChatDepthGateOverlay({
  open,
  onClose,
  feature,
  messages,
  currentUserId,
  chatPartnerUserId,
}: Props) {
  if (!open) return null;

  const brand = BRANDING[feature];
  const counts =
    currentUserId && chatPartnerUserId
      ? matchChatDepthCounts(messages, currentUserId, chatPartnerUserId)
      : { my: 0, their: 0 };
  const myPct = Math.min(100, (counts.my / MATCH_CHAT_DEPTH_MIN_EACH) * 100);
  const theirPct = Math.min(100, (counts.their / MATCH_CHAT_DEPTH_MIN_EACH) * 100);

  return (
    <div className="tod-web-msg-gate-overlay" role="presentation" onClick={onClose}>
      <div
        className="tod-web-msg-gate-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-chat-depth-gate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tod-web-msg-gate-shine" aria-hidden />
        <div className="tod-web-msg-gate-handle" aria-hidden />
        <div className="tod-web-msg-gate-emoji-ring" aria-hidden>
          <span className="tod-web-msg-gate-emoji">{brand.emoji}</span>
        </div>
        <p className="tod-web-msg-gate-kicker">{brand.kicker}</p>
        <h2 id="match-chat-depth-gate-title" className="tod-web-msg-gate-title">
          {brand.title}
        </h2>
        <p className="tod-web-msg-gate-lead">{brand.lead}</p>
        <div className="tod-web-msg-gate-progress">
          <div className="tod-web-msg-gate-row">
            <div className="tod-web-msg-gate-row-head">
              <span>You</span>
              <span
                className={
                  counts.my >= MATCH_CHAT_DEPTH_MIN_EACH
                    ? "tod-web-msg-gate-count tod-web-msg-gate-count--done"
                    : "tod-web-msg-gate-count"
                }
              >
                {Math.min(counts.my, MATCH_CHAT_DEPTH_MIN_EACH)}/{MATCH_CHAT_DEPTH_MIN_EACH}
              </span>
            </div>
            <div className="tod-web-msg-gate-track">
              <div
                className={
                  counts.my >= MATCH_CHAT_DEPTH_MIN_EACH
                    ? "tod-web-msg-gate-fill tod-web-msg-gate-fill--done"
                    : "tod-web-msg-gate-fill"
                }
                style={{ width: `${myPct}%` }}
              />
            </div>
          </div>
          <div className="tod-web-msg-gate-row">
            <div className="tod-web-msg-gate-row-head">
              <span>Your match</span>
              <span
                className={
                  counts.their >= MATCH_CHAT_DEPTH_MIN_EACH
                    ? "tod-web-msg-gate-count tod-web-msg-gate-count--done"
                    : "tod-web-msg-gate-count"
                }
              >
                {Math.min(counts.their, MATCH_CHAT_DEPTH_MIN_EACH)}/{MATCH_CHAT_DEPTH_MIN_EACH}
              </span>
            </div>
            <div className="tod-web-msg-gate-track">
              <div
                className={
                  counts.their >= MATCH_CHAT_DEPTH_MIN_EACH
                    ? "tod-web-msg-gate-fill tod-web-msg-gate-fill--done"
                    : "tod-web-msg-gate-fill"
                }
                style={{ width: `${theirPct}%` }}
              />
            </div>
          </div>
        </div>
        <div className="tod-web-msg-gate-hint">
          <span aria-hidden>💬</span>
          <p>{brand.hint}</p>
        </div>
        <button type="button" className="tod-web-msg-gate-btn" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
