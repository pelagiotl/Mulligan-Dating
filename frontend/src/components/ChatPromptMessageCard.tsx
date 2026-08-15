export type ChatPromptKind = "golf_hole" | "tod_truth" | "tod_dare" | "tod_unlock";

export type ChatPromptSnapshot = {
  kind: ChatPromptKind;
  text: string;
  hole?: number;
  title?: string;
  answer?: string;
};

export function chatPromptFallbackFromContent(content: string): ChatPromptSnapshot | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;

  const holeMatch = trimmed.match(/^⛳\s*Hole\s+(\d+):\s*([\s\S]+)$/i);
  if (holeMatch) {
    const body = holeMatch[2].trim();
    const answerMatch = body.match(/^(.*?)\n💬\s*Answer:\s*([\s\S]+)$/i);
    const text = (answerMatch?.[1] || body).trim();
    const answer = answerMatch?.[2]?.trim();
    return {
      kind: "golf_hole",
      hole: Number(holeMatch[1]),
      text,
      ...(answer ? { answer } : {}),
    };
  }

  const truthMatch = trimmed.match(/^Truth:\s*(.+)$/i);
  if (truthMatch) {
    return { kind: "tod_truth", text: truthMatch[1].trim() };
  }

  const dareMatch = trimmed.match(/^Dare:\s*(.+)$/i);
  if (dareMatch) {
    return { kind: "tod_dare", text: dareMatch[1].trim() };
  }

  if (/^🎲\s*Truth or Dare is ready!/i.test(trimmed)) {
    return {
      kind: "tod_unlock",
      text: trimmed,
      title: "Truth or Dare unlocked",
    };
  }

  return undefined;
}

export function resolveChatPrompt(
  prompt: ChatPromptSnapshot | undefined,
  content: string,
): ChatPromptSnapshot | undefined {
  const fromContent = chatPromptFallbackFromContent(content);
  if (!prompt) return fromContent;
  if (prompt.answer?.trim()) return prompt;
  if (fromContent?.answer?.trim()) {
    return { ...prompt, answer: fromContent.answer };
  }
  return prompt;
}

const KIND_META: Record<
  ChatPromptKind,
  { emoji: string; eyebrow: string; badge: string; className: string; footer?: string }
> = {
  golf_hole: {
    emoji: "⛳",
    eyebrow: "HOLE PROMPT",
    badge: "On the course",
    className: "chat-prompt-card--golf",
  },
  tod_truth: {
    emoji: "✨",
    eyebrow: "TRUTH",
    badge: "Keep it real",
    className: "chat-prompt-card--truth",
  },
  tod_dare: {
    emoji: "🔥",
    eyebrow: "DARE",
    badge: "Game on",
    className: "chat-prompt-card--dare",
  },
  tod_unlock: {
    emoji: "🎲",
    eyebrow: "UNLOCKED",
    badge: "Ready to play",
    className: "chat-prompt-card--unlock",
    footer: "Pick Truth or Dare anytime",
  },
};

export default function ChatPromptMessageCard({
  prompt,
  senderName,
}: {
  prompt: ChatPromptSnapshot;
  senderName: string;
}) {
  const meta = KIND_META[prompt.kind];
  const holeLabel =
    prompt.kind === "golf_hole" && prompt.hole != null ? `HOLE ${prompt.hole}` : meta.eyebrow;
  const title =
    prompt.kind === "tod_unlock"
      ? prompt.title || "Truth or Dare unlocked"
      : prompt.kind === "golf_hole"
        ? `Hole ${prompt.hole ?? "?"}`
        : prompt.kind === "tod_truth"
          ? "Truth"
          : "Dare";
  const sub =
    prompt.kind === "tod_unlock"
      ? `${senderName} unlocked the game`
      : `${senderName} shared this`;

  return (
    <article className={`chat-prompt-card ${meta.className}`}>
      <div className="chat-prompt-card-hero">
        <p className="chat-prompt-card-eyebrow">
          {meta.emoji} {holeLabel}
        </p>
        <h4 className="chat-prompt-card-title">{title}</h4>
        <p className="chat-prompt-card-sub">{sub}</p>
      </div>
      <div className="chat-prompt-card-body">
        <span className="chat-prompt-card-badge">{meta.badge}</span>
        <p className="chat-prompt-card-text">
          {prompt.kind === "tod_unlock"
            ? "Both of you can pick Truth or Dare anytime from the chat header."
            : prompt.text}
        </p>
        {prompt.kind === "golf_hole" && prompt.answer ? (
          <div className="chat-prompt-card-answer">
            <p className="chat-prompt-card-answer-label">
              {(senderName.trim().split(/\s+/)[0] || "Their")} answer
            </p>
            <p className="chat-prompt-card-answer-body">{prompt.answer}</p>
          </div>
        ) : null}
        {meta.footer ? <p className="chat-prompt-card-footer">{meta.footer}</p> : null}
      </div>
    </article>
  );
}
