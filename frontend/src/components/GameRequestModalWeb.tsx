import { useState } from "react";
import { api } from "../utils/api";

export type PendingGameRequestWeb = {
  requestId: string;
  matchId: string;
  fromUserId: string;
  fromUserName: string;
  gameType: "truth_or_dare" | "never_have_i_ever";
};

type Props = {
  request: PendingGameRequestWeb | null;
  onClose: () => void;
  onAccepted: (matchId: string, gameType: "truth_or_dare" | "never_have_i_ever") => void;
};

export default function GameRequestModalWeb({ request, onClose, onAccepted }: Props) {
  const [submitting, setSubmitting] = useState(false);
  if (!request) return null;

  const gameLabel = request.gameType === "truth_or_dare" ? "Truth or Dare" : "Never Have I Ever";
  const emoji = request.gameType === "truth_or_dare" ? "🎲" : "🙊";

  const handleRespond = async (accept: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/matches/${request.matchId}/game-request/${request.requestId}/respond`, {
        accept,
      });
      if (accept) {
        onAccepted(request.matchId, request.gameType);
      }
      onClose();
    } catch (e) {
      console.warn("Game request respond error:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="game-request-modal-web-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`game-request-modal-web-card game-request-modal-web-card--${request.gameType}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-req-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="game-request-modal-web-inner">
          <span className="game-request-modal-web-emoji" aria-hidden>
            {emoji}
          </span>
          <h2 id="game-req-title" className="game-request-modal-web-title">
            Game invite
          </h2>
          <p className="game-request-modal-web-body">
            {request.fromUserName} wants to play {gameLabel} with you!
          </p>
          {submitting ? (
            <p className="game-request-modal-web-loading">One moment…</p>
          ) : (
            <div className="game-request-modal-web-actions">
              <button type="button" className="game-request-modal-web-accept" onClick={() => void handleRespond(true)}>
                Accept
              </button>
              <button type="button" className="game-request-modal-web-decline" onClick={() => void handleRespond(false)}>
                Decline
              </button>
            </div>
          )}
          <button type="button" className="game-request-modal-web-later" onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
