/**
 * Rich chat cards for hole prompts, Truth/Dare shares, and ToD unlock notices.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export type ChatPromptKind = 'golf_hole' | 'tod_truth' | 'tod_dare' | 'tod_unlock';

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
      kind: 'golf_hole',
      hole: Number(holeMatch[1]),
      text,
      ...(answer ? { answer } : {}),
    };
  }

  const truthMatch = trimmed.match(/^Truth:\s*(.+)$/i);
  if (truthMatch) {
    return { kind: 'tod_truth', text: truthMatch[1].trim() };
  }

  const dareMatch = trimmed.match(/^Dare:\s*(.+)$/i);
  if (dareMatch) {
    return { kind: 'tod_dare', text: dareMatch[1].trim() };
  }

  if (/^🎲\s*Truth or Dare is ready!/i.test(trimmed)) {
    return {
      kind: 'tod_unlock',
      text: trimmed,
      title: 'Truth or Dare unlocked',
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

const KIND_VISUAL: Record<
  ChatPromptKind,
  {
    colors: [string, string, ...string[]];
    emoji: string;
    eyebrow: string;
    badge: string;
    border: string;
    shadow: string;
    footer?: string;
  }
> = {
  golf_hole: {
    colors: ['#0f766e', '#0d9488', '#134e4a'],
    emoji: '⛳',
    eyebrow: 'HOLE PROMPT',
    badge: 'On the course',
    border: 'rgba(15, 118, 110, 0.28)',
    shadow: '#0f766e',
  },
  tod_truth: {
    colors: ['#4338ca', '#6366f1', '#312e81'],
    emoji: '✨',
    eyebrow: 'TRUTH',
    badge: 'Keep it real',
    border: 'rgba(99, 102, 241, 0.32)',
    shadow: '#4338ca',
  },
  tod_dare: {
    colors: ['#be185d', '#ec4899', '#9d174d'],
    emoji: '🔥',
    eyebrow: 'DARE',
    badge: 'Game on',
    border: 'rgba(236, 72, 153, 0.32)',
    shadow: '#be185d',
  },
  tod_unlock: {
    colors: ['#7c3aed', '#a855f7', '#db2777'],
    emoji: '🎲',
    eyebrow: 'UNLOCKED',
    badge: 'Ready to play',
    border: 'rgba(168, 85, 247, 0.32)',
    shadow: '#7c3aed',
    footer: 'Pick Truth or Dare anytime',
  },
};

export default function ChatPromptMessageCard({
  prompt,
  senderName,
}: {
  prompt: ChatPromptSnapshot;
  senderName: string;
}) {
  const visual = KIND_VISUAL[prompt.kind];
  const holeLabel =
    prompt.kind === 'golf_hole' && prompt.hole != null ? `HOLE ${prompt.hole}` : visual.eyebrow;
  const title =
    prompt.kind === 'tod_unlock'
      ? prompt.title || 'Truth or Dare unlocked'
      : prompt.kind === 'golf_hole'
        ? `Hole ${prompt.hole ?? '?'}`
        : prompt.kind === 'tod_truth'
          ? 'Truth'
          : 'Dare';
  const sub =
    prompt.kind === 'tod_unlock'
      ? `${senderName} unlocked the game`
      : `${senderName} shared this`;

  return (
    <View style={[styles.card, { borderColor: visual.border, shadowColor: visual.shadow }]}>
      <LinearGradient
        colors={visual.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroGlow} />
        <Text style={styles.heroEyebrow}>
          {visual.emoji} {holeLabel}
        </Text>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSub}>{sub}</Text>
      </LinearGradient>
      <View style={styles.body}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{visual.badge}</Text>
        </View>
        <Text style={styles.promptText}>
          {prompt.kind === 'tod_unlock'
            ? 'Both of you can pick Truth or Dare anytime from the chat header.'
            : prompt.text}
        </Text>
        {prompt.kind === 'golf_hole' && prompt.answer ? (
          <View style={styles.answerBlock}>
            <Text style={styles.answerLabel}>{senderName.split(/\s+/)[0] || 'Their'} answer</Text>
            <Text style={styles.answerBody}>{prompt.answer}</Text>
          </View>
        ) : null}
        {visual.footer ? <Text style={styles.footer}>{visual.footer}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 5,
    maxWidth: 320,
    width: '100%',
  },
  hero: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    minHeight: 100,
    justifyContent: 'flex-end',
  },
  heroGlow: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  body: {
    padding: 14,
    paddingTop: 12,
    gap: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  promptText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: 22,
  },
  answerBlock: {
    marginTop: 2,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 110, 0.18)',
    gap: 4,
  },
  answerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f766e',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  answerBody: {
    fontSize: 14,
    fontWeight: '700',
    color: '#134e4a',
    lineHeight: 20,
  },
  footer: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
});
