/** Structured chat prompt cards (golf holes, Truth/Dare, unlock notices). */

export type ChatPromptKind = 'golf_hole' | 'tod_truth' | 'tod_dare' | 'tod_unlock';

export type ChatPromptSnapshot = {
  kind: ChatPromptKind;
  text: string;
  hole?: number;
  title?: string;
  /** Sharer's answer (golf hole cards). */
  answer?: string;
};

export type ChatPromptMeta = {
  text?: string;
  hole?: number;
  promptId?: string;
  title?: string;
  answer?: string;
};

const TOD_UNLOCK_CONTENT = '🎲 Truth or Dare is ready! Pick Truth or Dare anytime.';

export function isChatPromptKind(value: unknown): value is ChatPromptKind {
  return (
    value === 'golf_hole' ||
    value === 'tod_truth' ||
    value === 'tod_dare' ||
    value === 'tod_unlock'
  );
}

export function serializeChatPrompt(params: {
  kind: ChatPromptKind;
  text: string;
  hole?: number;
  title?: string;
  answer?: string;
}): ChatPromptSnapshot {
  return {
    kind: params.kind,
    text: params.text,
    ...(params.hole != null ? { hole: params.hole } : {}),
    ...(params.title ? { title: params.title } : {}),
    ...(params.answer ? { answer: params.answer } : {}),
  };
}

export function chatPromptMetaJson(meta: ChatPromptMeta): string {
  return JSON.stringify(meta);
}

export function parseChatPromptMeta(raw: unknown): ChatPromptMeta {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as ChatPromptMeta;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Build snapshot from DB columns; falls back to parsing plain content for legacy rows. */
export function chatPromptFromMessageRow(m: {
  prompt_kind?: unknown;
  prompt_meta_json?: unknown;
  content?: unknown;
}): ChatPromptSnapshot | undefined {
  const kindRaw = m.prompt_kind != null ? String(m.prompt_kind) : '';
  if (isChatPromptKind(kindRaw)) {
    const meta = parseChatPromptMeta(m.prompt_meta_json);
    const text =
      (typeof meta.text === 'string' && meta.text.trim()) ||
      (typeof m.content === 'string' ? stripPromptPrefix(kindRaw, m.content) : '') ||
      '';
    return serializeChatPrompt({
      kind: kindRaw,
      text,
      hole: typeof meta.hole === 'number' ? meta.hole : undefined,
      title: typeof meta.title === 'string' ? meta.title : undefined,
      answer: typeof meta.answer === 'string' && meta.answer.trim() ? meta.answer.trim() : undefined,
    });
  }
  if (typeof m.content === 'string') {
    return chatPromptFallbackFromContent(m.content);
  }
  return undefined;
}

function stripPromptPrefix(kind: ChatPromptKind, content: string): string {
  if (kind === 'tod_truth') return content.replace(/^Truth:\s*/i, '').trim();
  if (kind === 'tod_dare') return content.replace(/^Dare:\s*/i, '').trim();
  if (kind === 'golf_hole') {
    const withoutAnswer = content.replace(/\n💬\s*Answer:\s*[\s\S]*$/i, '').trim();
    const m = withoutAnswer.match(/^⛳\s*Hole\s+\d+:\s*(.*)$/i);
    return (m?.[1] || withoutAnswer).trim();
  }
  if (kind === 'tod_unlock') return content.trim();
  return content.trim();
}

/** Upgrade old plain-text prompt bubbles into cards without DB metadata. */
export function chatPromptFallbackFromContent(content: string): ChatPromptSnapshot | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;

  const holeMatch = trimmed.match(/^⛳\s*Hole\s+(\d+):\s*([\s\S]+)$/i);
  if (holeMatch) {
    const body = holeMatch[2].trim();
    const answerMatch = body.match(/^(.*?)\n💬\s*Answer:\s*([\s\S]+)$/i);
    const text = (answerMatch?.[1] || body).trim();
    const answer = answerMatch?.[2]?.trim();
    return serializeChatPrompt({
      kind: 'golf_hole',
      hole: Number(holeMatch[1]),
      text,
      ...(answer ? { answer } : {}),
    });
  }

  const truthMatch = trimmed.match(/^Truth:\s*(.+)$/i);
  if (truthMatch) {
    return serializeChatPrompt({ kind: 'tod_truth', text: truthMatch[1].trim() });
  }

  const dareMatch = trimmed.match(/^Dare:\s*(.+)$/i);
  if (dareMatch) {
    return serializeChatPrompt({ kind: 'tod_dare', text: dareMatch[1].trim() });
  }

  if (
    trimmed === TOD_UNLOCK_CONTENT ||
    /^🎲\s*Truth or Dare is ready!/i.test(trimmed)
  ) {
    return serializeChatPrompt({
      kind: 'tod_unlock',
      text: trimmed,
      title: 'Truth or Dare unlocked',
    });
  }

  return undefined;
}

export function golfHolePromptContent(hole: number, text: string, answer?: string): string {
  const base = `⛳ Hole ${hole}: ${text}`;
  if (answer?.trim()) return `${base}\n💬 Answer: ${answer.trim()}`;
  return base;
}

export function formatGolfHoleAnswerLabel(answer: {
  choiceLabel?: string | null;
  writeIn?: string | null;
}): string {
  const choice = answer.choiceLabel?.trim() || '';
  const writeIn = answer.writeIn?.trim() || '';
  if (choice && writeIn) return `${choice} · ${writeIn}`;
  return choice || writeIn || '';
}

export function todPromptContent(promptType: 'truth' | 'dare', text: string): string {
  const prefix = promptType === 'truth' ? 'Truth' : 'Dare';
  return `${prefix}: ${text}`;
}

export function todUnlockContent(): string {
  return TOD_UNLOCK_CONTENT;
}

export function todKindFromPromptType(promptType: 'truth' | 'dare'): ChatPromptKind {
  return promptType === 'truth' ? 'tod_truth' : 'tod_dare';
}
