/**
 * Truth or Dare - Unlocked with a Mulligan token
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  Vibration,
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import TruthOrDareMessageGateModal from './TruthOrDareMessageGateModal';

// PG-13 — grown-up flirting (matches server fallbacks)
const TRUTH_PROMPTS = [
  "What's the one thing that would make you actually stop scrolling?",
  "What's your non-negotiable when you're really into someone?",
  "What's the boldest thing you've ever said to someone you wanted?",
  "What would make you break your own rules for someone?",
  "What's the first thing you notice when you're attracted — and you can't say eyes?",
  "What's your idea of a perfect first date when you're both fully present?",
  "What's something you'd only admit to someone you're actually into?",
  "What's the best compliment you've gotten that actually made you feel something?",
  "What's your dealbreaker that nobody talks about?",
  "What would make you cancel other plans just to see them?",
  "What's the most underrated green flag in someone?",
  "What's something you find attractive that most people don't mention?",
  "What would make you want a second date before the first one's even over?",
  "What's your love language when it comes to showing you're into someone?",
  "What's the line you'd use to ask someone out in person — no filter?",
  "How do you tell the difference between chemistry and just liking the idea of someone?",
  "When do you know you're catching feelings versus keeping it casual?",
  "What's something people consistently misread about you from your profile or photos?",
  "What's your tell that you're nervous on a date — even when you're playing it cool?",
  "What would make you trust someone faster than you usually do?",
];

const DARE_PROMPTS = [
  "Send a voice note: one thing that would make me want to meet you",
  "Describe your type in 3 words — no clichés allowed",
  "Send a selfie with the look you give when you're actually interested",
  "Send a 5–10 sec video saying hi and one thing you're looking forward to",
  "Reply with the line you'd use to shoot your shot in person",
  "Send a pic of what you're doing rn with a one-line that says something real about you",
  "Send a selfie — flirty or unapologetically you",
  "Reply with 3 words that describe your vibe when you're into someone",
  "Voice note: one thing you find attractive about them — be specific",
  "Send a selfie that shows your actual smile, not the camera smile",
  "Reply with a question you've always wanted to ask a match but never have",
  "Send a selfie from an angle you like with a one-word caption",
  "Voice note: the boldest thing you'd say to break the tension on a date",
  "Reply with one green flag you've already noticed about them",
  "Voice note: one standard you hold people to on dates that isn't in your bio",
  "Send a selfie that matches how you feel after a conversation that actually went somewhere",
  "Reply with the honest reason you're still on the apps — one sentence",
  "Send a 5-second video: nod once if you'd rather skip small talk and go straight to real talk",
];

const TRUTH_PROMPTS_R = [
  "What's the wildest thing you've done on a first date?",
  "Have you ever hooked up with someone you barely knew?",
  "What's a fantasy you've never told anyone out loud?",
  "When did you last send a text you regretted the next morning?",
  "What's your biggest turn-on that isn't physical?",
  "Have you ever caught feelings during something you swore was casual?",
  "What's your honest line between flirting and leading someone on?",
];

const TRUTH_PROMPTS_SPICY = [
  "What kind of text from a match actually makes you weak?",
  "What's a kink or dynamic you've only admitted after a few drinks?",
  "What's the most shameless thing you've done to keep someone's attention?",
  "Describe the last time chemistry hit you like a truck — no names, just the feeling.",
  "What's a fantasy that's stayed in your head because you've never found the right person?",
  "What would make you break your 'I don't do that on apps' rule?",
];

const DARE_PROMPTS_R = [
  "Send a selfie that shows your 'after midnight' energy",
  "Voice note: one thing you find physically irresistible about them",
  "Text three words you'd whisper if you were sitting way too close right now",
  "Voice note: one thing that would make you veto a second date — no names, just the standard",
  "Voice note: admit whether you're a slow-burn or a fast-flame person — one sentence",
];

const DARE_PROMPTS_SPICY = [
  "Voice note: describe what you'd do with your hands if they were here — one sentence, no graphic detail",
  "Send a selfie in low light that feels like a 'you up?' text in photo form",
  "Voice note: one boundary you'd bend if the chemistry was undeniable",
  "Send a 5-sec video: slow blink + half-smile, like you're deciding whether to make a move",
  "Type the first move you'd make if they were on your couch right now — PG-13 wording only",
  "Send a 5-sec video: lip bite or lip press (subtle) then look at the camera like you're not sorry",
];

type SpiceId = "pg13" | "ratedr" | "spicy";

function fallbackPromptList(type: "truth" | "dare", spiceLevel: SpiceId | null): string[] {
  const level = spiceLevel ?? "pg13";
  if (type === "truth") {
    if (level === "spicy") return [...TRUTH_PROMPTS, ...TRUTH_PROMPTS_R, ...TRUTH_PROMPTS_SPICY];
    if (level === "ratedr") return [...TRUTH_PROMPTS, ...TRUTH_PROMPTS_R];
    return TRUTH_PROMPTS;
  }
  if (level === "spicy") return [...DARE_PROMPTS, ...DARE_PROMPTS_R, ...DARE_PROMPTS_SPICY];
  if (level === "ratedr") return [...DARE_PROMPTS, ...DARE_PROMPTS_R];
  return DARE_PROMPTS;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const TRUTH_OR_DARE_MIN_EACH = 7;

export function truthOrDareMessageCounts(
  rows: Array<{ senderId: string }>,
  currentUserId: string,
  partnerUserId: string
): { my: number; their: number } {
  let my = 0;
  let their = 0;
  for (const m of rows) {
    if (m.senderId === currentUserId) my++;
    else if (m.senderId === partnerUserId) their++;
  }
  return { my, their };
}

export function truthOrDareMessageThresholdMet(
  rows: Array<{ senderId: string }>,
  currentUserId: string,
  partnerUserId: string
): boolean {
  const { my, their } = truthOrDareMessageCounts(rows, currentUserId, partnerUserId);
  return my >= TRUTH_OR_DARE_MIN_EACH && their >= TRUTH_OR_DARE_MIN_EACH;
}

export const TRUTH_OR_DARE_LOCKED_HINT = `Truth or Dare unlocks after you and your match have each sent at least ${TRUTH_OR_DARE_MIN_EACH} messages in this chat.`;

interface Message {
  id: string;
  senderId: string;
  isOwn?: boolean;
  content: string;
}

interface GameState {
  yourSpiceChoice: SpiceId | null;
  theirSpiceChoice: SpiceId | null;
  spiceReady: boolean;
  spiceLevel: SpiceId | null;
  tokenUnlocked?: boolean;
  needsSpiceChoiceFromUnlocker?: boolean;
  currentPrompt?: string | null;
  currentPromptType?: 'truth' | 'dare' | null;
  unlockedUntil?: string | null;
}

interface TruthOrDareProps {
  matchId: string;
  messages?: Message[];
  currentUserId: string;
  /** Peer user id for message-count gate (7 each) */
  chatPartnerUserId: string;
  socket: any;
  onSendToChat?: (text: string) => void;
  onRequestGame?: () => void;
  onUnlockWithToken?: () => Promise<void>;
  /** If provided, called when user taps locked game. Return true if game is already unlocked (other user unlocked); then we open without prompting for token. */
  onBeforeUnlockPrompt?: () => Promise<boolean>;
  openForAccept?: boolean;
  onOpenedForAccept?: () => void;
  gameUnlockedByToken?: boolean;
  compact?: boolean;
  square?: boolean;
  /** When true, renders as a small icon-only button for header placement */
  headerMode?: boolean;
}

export default function TruthOrDare({
  matchId,
  messages = [],
  currentUserId,
  chatPartnerUserId,
  socket,
  onSendToChat,
  onRequestGame,
  onUnlockWithToken,
  onBeforeUnlockPrompt,
  openForAccept,
  onOpenedForAccept,
  gameUnlockedByToken = false,
  compact = true,
  square = false,
  headerMode = false,
}: TruthOrDareProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [step, setStep] = useState<'spice' | 'choose' | 'prompt'>('spice');
  const [prompt, setPrompt] = useState<string>('');
  const [promptType, setPromptType] = useState<'truth' | 'dare'>('truth');
  const [loading, setLoading] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [headerTimerSecs, setHeaderTimerSecs] = useState<number | null>(null);
  const [messageGateModalVisible, setMessageGateModalVisible] = useState(false);
  const lastUnlockedUntilRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAnotherOneAtRef = useRef<number>(0);
  /** When we just chose Truth or Dare, avoid letting fetchState overwrite with stale server currentPromptType */
  const lastChooseAtRef = useRef<number>(0);
  const intendedPromptTypeRef = useRef<'truth' | 'dare' | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  gameStateRef.current = gameState;

  const isUnlocked = gameUnlockedByToken;

  const truthOrDareEligible = useMemo(
    () =>
      Boolean(currentUserId && chatPartnerUserId) &&
      truthOrDareMessageThresholdMet(messages, currentUserId, chatPartnerUserId),
    [messages, currentUserId, chatPartnerUserId]
  );

  const messageGateCounts = useMemo(
    () => truthOrDareMessageCounts(messages, currentUserId, chatPartnerUserId),
    [messages, currentUserId, chatPartnerUserId]
  );

  const messageGateModal = (
    <TruthOrDareMessageGateModal
      visible={messageGateModalVisible}
      onClose={() => setMessageGateModalVisible(false)}
      myCount={messageGateCounts.my}
      theirCount={messageGateCounts.their}
      threshold={TRUTH_OR_DARE_MIN_EACH}
    />
  );

  const formatTimeRemaining = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const emojiScale = useRef(new Animated.Value(1)).current;
  const emojiRotate = useRef(new Animated.Value(0)).current;
  const headerPulseAnim = useRef(new Animated.Value(1)).current;
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    // Dice wobble + bounce: rotation -12deg to 12deg, scale 1 to 1.18
    // Using Animated.timing instead of Animated.spring to avoid memory leak
    const diceRoll = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(emojiScale, {
            toValue: 1.18,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(emojiRotate, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(emojiScale, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(emojiRotate, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    diceRoll.start();
    return () => {
      diceRoll.stop();
      emojiScale.setValue(1);
      emojiRotate.setValue(0);
    };
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.03,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isUnlocked, pulseAnim]);

  const fetchState = useCallback(async () => {
    try {
      const data = await api.get<GameState>(`/matches/${matchId}/truth-or-dare/state`);
      setGameState((prev) => ({ ...prev, ...data }));
      const recentlyRequestedAnother = Date.now() - lastAnotherOneAtRef.current < 5000;
      const recentlyChose = Date.now() - lastChooseAtRef.current < 8000;
      const alreadyShowingPrompt = stepRef.current === 'prompt';
      if (recentlyRequestedAnother && alreadyShowingPrompt) {
        setLoading(false);
        return;
      }
      // Don't overwrite promptType with stale server data when we just chose Truth/Dare (avoids revert flicker)
      if (recentlyChose && intendedPromptTypeRef.current != null) {
        setStep('prompt');
        setLoading(false);
        return;
      }
      if (recentlyRequestedAnother && data.currentPrompt && data.currentPromptType) {
        setPromptType(data.currentPromptType);
        setStep('prompt');
        setLoading(false);
        return;
      }
      if (alreadyShowingPrompt) return;
      if (!data.spiceReady) {
        setStep('spice');
      } else {
        setStep('choose');
      }
    } catch (err) {
      console.warn('Truth or Dare fetch state error:', err);
    }
  }, [matchId]);

  useEffect(() => {
    if (!modalVisible || !gameState?.spiceReady) return;
    setStep((s) => (s === 'spice' ? 'choose' : s));
  }, [modalVisible, gameState?.spiceReady]);

  useEffect(() => {
    if (openForAccept) {
      setStep('spice');
      setPrompt('');
      setModalVisible(true);
      setLoading(true);
      fetchState().finally(() => setLoading(false));
      pollRef.current = setInterval(fetchState, 3000);
      onOpenedForAccept?.();
    }
  }, [openForAccept, fetchState]);

  useEffect(() => {
    if (!modalVisible) return;
    const onUpdate = () => {
      // Right after "Another one", socket (and any refetch) can return stale data and overwrite the new prompt. Skip refetch for 6s so the prompt from the API response stays.
      if (Date.now() - lastAnotherOneAtRef.current < 6000) return;
      fetchState();
    };
    socket?.on?.('truth_or_dare_updated', onUpdate);
    return () => {
      socket?.off?.('truth_or_dare_updated', onUpdate);
    };
  }, [modalVisible, socket, fetchState]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    const untilStr = gameState?.unlockedUntil ?? lastUnlockedUntilRef.current;
    if (gameState?.unlockedUntil) lastUnlockedUntilRef.current = gameState.unlockedUntil;

    if (!modalVisible && !untilStr) {
      setSecondsRemaining(null);
      return;
    }
    if (!modalVisible) {
      setSecondsRemaining(null);
    }
    const tick = () => {
      if (!untilStr) return;
      const until = new Date(untilStr);
      const now = new Date();
      const secs = Math.max(0, Math.floor((until.getTime() - now.getTime()) / 1000));
      if (modalVisible) setSecondsRemaining(secs);
      if (isUnlocked && headerMode) setHeaderTimerSecs(secs);
      if (secs <= 0 && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        lastUnlockedUntilRef.current = null;
        setHeaderTimerSecs(0);
        fetchState();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [modalVisible, gameState?.unlockedUntil, isUnlocked, headerMode, fetchState]);

  const handleOpen = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(50);
    }
    setStep('spice');
    setPrompt('');
    setModalVisible(true);
    setLoading(true);
    fetchState().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchState, 3000);
  };

  const handleClose = () => {
    setModalVisible(false);
    setStep('spice');
    setPrompt('');
    setGameState(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const submitSpiceChoice = async (choice: SpiceId) => {
    setLoading(true);
    try {
      await api.post(`/matches/${matchId}/truth-or-dare/spice-choice`, { choice });
      await fetchState();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save your mode.');
    } finally {
      setLoading(false);
    }
  };

  const handleChoose = async (type: 'truth' | 'dare', anotherOne = false) => {
    if (!gameStateRef.current?.spiceReady) {
      setStep('spice');
      Alert.alert('Pick a heat level', 'Choose PG-13, Rated R, or Spicy first — both players must pick.');
      return;
    }
    lastChooseAtRef.current = Date.now();
    intendedPromptTypeRef.current = type;
    if (anotherOne) {
      lastAnotherOneAtRef.current = Date.now();
      setPromptType(type);
      setStep('prompt');
      setLoading(true);
      setPrompt('');
      // Let React commit the clear/loading state so the UI shows "Generating..." instead of the old prompt
      await new Promise((r) => setTimeout(r, 0));
    } else {
      setPromptType(type);
      setStep('prompt');
      setLoading(true);
      setPrompt('');
    }

    let finalPrompt = '';
    try {
      const data = await api.post<{ prompt: string; fromAI: boolean; spiceLevel?: string }>(
        `/matches/${matchId}/truth-or-dare`,
        { type, anotherOne }
      );
      if (data?.prompt) {
        finalPrompt = data.prompt;
        setPrompt(finalPrompt);
        lastAnotherOneAtRef.current = Date.now();
      } else {
        throw new Error('No prompt returned');
      }
    } catch (err: any) {
      if (err?.code === 'SPICE_REQUIRED') {
        setStep('spice');
        await fetchState();
        setLoading(false);
        setTimeout(() => {
          intendedPromptTypeRef.current = null;
        }, 8000);
        return;
      }
      const list = fallbackPromptList(type, gameStateRef.current?.spiceLevel ?? null);
      finalPrompt = pickRandom(list);
      setPrompt(finalPrompt);
      lastAnotherOneAtRef.current = Date.now();
    } finally {
      setLoading(false);
      // Clear after a short delay so future fetchState can apply server state; 8s window still prevents mid-request overwrite
      setTimeout(() => { intendedPromptTypeRef.current = null; }, 8000);
      // Only send to chat when user explicitly clicks "Send to Chat", never on "Another one"
    }
  };

  const handleSendToChat = async () => {
    if (prompt && onSendToChat) {
      const prefix = promptType === 'truth' ? 'Truth: ' : 'Dare: ';
      onSendToChat(`${prefix}${prompt}`);
      try {
        await api.post(`/matches/${matchId}/truth-or-dare/send-to-chat`);
      } catch (e) {
        console.warn('Truth or Dare send-to-chat turn switch failed:', e);
      }
    }
    handleClose();
  };

  const diceRotateInterp = emojiRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-12deg', '12deg'],
  });

  const handleLockedPress = async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(30);
    }
    if (!truthOrDareEligible) {
      setMessageGateModalVisible(true);
      return;
    }
    if (onBeforeUnlockPrompt) {
      const alreadyUnlocked = await onBeforeUnlockPrompt();
      if (alreadyUnlocked) {
        handleOpen();
        return;
      }
    }
    if (onUnlockWithToken) {
      Alert.alert(
        '🎲 Truth or Dare',
        '',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Play',
            style: 'default',
            onPress: async () => {
              try {
                await onUnlockWithToken();
                handleOpen();
              } catch (e: any) {
                Alert.alert('Error', e?.message || 'Failed to open game.');
              }
            },
          },
        ]
      );
    } else {
      Alert.alert('🎲 Truth or Dare', 'Truth or Dare is not available for this match.', [{ text: 'Got it', style: 'default' }]);
    }
  };

  useEffect(() => {
    if (headerMode && isUnlocked && !lastUnlockedUntilRef.current) {
      fetchState();
    }
  }, [headerMode, isUnlocked, fetchState]);

  useEffect(() => {
    if (!headerMode) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(headerPulseAnim, {
          toValue: 1.08,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(headerPulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => { pulse.stop(); headerPulseAnim.setValue(1); };
  }, [headerMode]);

  const headerButton = (
    <View style={styles.headerButtonWithTimer}>
      <Animated.View style={{ transform: [{ scale: headerPulseAnim }] }}>
        <TouchableOpacity
          onPress={isUnlocked ? handleOpen : handleLockedPress}
          activeOpacity={0.8}
          style={[styles.headerIconButton, !isUnlocked && styles.headerIconButtonLocked]}
        >
          <Text style={styles.headerIconEmoji}>🎲</Text>
        </TouchableOpacity>
      </Animated.View>
      {isUnlocked && headerTimerSecs !== null && headerTimerSecs > 0 && (
        <View style={styles.headerTimerBadge}>
          <Text style={styles.headerTimerText}>⏱ {formatTimeRemaining(headerTimerSecs)}</Text>
        </View>
      )}
    </View>
  );

  if (headerMode) {
    return (
      <>
        {headerButton}
        <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={handleClose}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleClose}>
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalContent}>
              <LinearGradient colors={['#ff0080', '#ff3399', '#cc0066', '#ff66b2', '#ff0080']} locations={[0, 0.2, 0.5, 0.8, 1]} style={styles.modalGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <View style={styles.modalHeaderBar} />
                <Text style={styles.modalTitle}>
                  {step === 'spice' || (gameState && !gameState.spiceReady)
                    ? 'Choose your heat'
                    : step === 'choose'
                      ? 'Pick One'
                      : promptType === 'truth'
                        ? '✨ Truth'
                        : '🔥 Dare'}
                </Text>
                {gameState?.unlockedUntil && secondsRemaining !== null && secondsRemaining > 0 && (
                  <View style={styles.timerBadge}><Text style={styles.timerLabel}>Session time left</Text><Text style={styles.timerText}>⏱ {formatTimeRemaining(secondsRemaining)}</Text></View>
                )}
                {gameState?.tokenUnlocked && secondsRemaining !== null && secondsRemaining <= 0 ? (
                  <View style={styles.sessionExpiredContainer}>
                    <Text style={styles.sessionExpiredTitle}>Session expired</Text>
                    <Text style={styles.sessionExpiredText}>Use another Mulligan token to play another 7-minute round.</Text>
                  </View>
                ) : loading ? (
                  <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#fff" /><Text style={styles.loadingText}>Loading...</Text></View>
                ) : step === 'spice' || (gameState && !gameState.spiceReady) ? (
                  <View style={styles.chooseContainer}>
                    <Text style={styles.chooseSubtitle}>Each picks a max heat; prompts use the more conservative choice.</Text>
                    <View style={styles.spicePills}>
                      {(['pg13', 'ratedr', 'spicy'] as const).map((sid) => {
                        const active = gameState?.yourSpiceChoice === sid;
                        return (
                          <TouchableOpacity
                            key={sid}
                            onPress={() => void submitSpiceChoice(sid)}
                            style={[styles.spicePill, active && styles.spicePillActive]}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.spicePillText, active && styles.spicePillTextActive]}>
                              {sid === 'pg13' ? 'PG-13' : sid === 'ratedr' ? 'Rated R' : 'Spicy'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.changeSpiceHint}>
                      {gameState?.yourSpiceChoice
                        ? !gameState.spiceReady
                          ? 'Waiting for your match to pick…'
                          : `Ready — round heat: ${gameState.spiceLevel || ''}`
                        : 'Tap to lock yours in.'}
                    </Text>
                  </View>
                ) : step === 'choose' ? (
                  <View style={styles.chooseContainer}>
                    {gameState?.spiceLevel ? (
                      <Text style={styles.changeSpiceHint}>This round: {String(gameState.spiceLevel).toUpperCase()}</Text>
                    ) : null}
                    <Text style={styles.chooseSubtitle}>Pick Truth or Dare</Text>
                    <View style={styles.chooseRow}>
                      <TouchableOpacity onPress={() => handleChoose('truth')} style={styles.choiceButton} activeOpacity={0.8}><LinearGradient colors={['#7c4dff', '#b388ff', '#651fff']} style={styles.choiceGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}><Text style={styles.choiceEmoji}>✨</Text><Text style={styles.choiceText}>Truth</Text></LinearGradient></TouchableOpacity>
                      <TouchableOpacity onPress={() => handleChoose('dare')} style={styles.choiceButton} activeOpacity={0.8}><LinearGradient colors={['#ff1744', '#ff4081', '#f50057']} style={styles.choiceGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}><Text style={styles.choiceEmoji}>🔥</Text><Text style={styles.choiceText}>Dare</Text></LinearGradient></TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => setStep('spice')} activeOpacity={0.7}>
                      <Text style={styles.changeSpiceHint}>Change my heat level</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {loading ? <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#fff" /><Text style={styles.loadingText}>Generating your prompt...</Text></View> : (
                      <>
                        <View style={styles.promptCard}><Text style={styles.promptText}>{prompt}</Text></View>
                      </>
                    )}
                    <View style={styles.promptActions}>
                      {onSendToChat && !loading && <TouchableOpacity onPress={handleSendToChat} style={styles.sendButton} activeOpacity={0.8}><LinearGradient colors={['#7c4dff', '#651fff']} style={styles.sendButtonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}><Text style={styles.sendButtonText}>Send to Chat 💬</Text></LinearGradient></TouchableOpacity>}
                      {!loading && <TouchableOpacity onPress={() => handleChoose(promptType, true)} style={styles.anotherButton} activeOpacity={0.8}><Text style={styles.anotherButtonText}>Another one ↻</Text></TouchableOpacity>}
                    </View>
                  </>
                )}
                <TouchableOpacity onPress={handleClose} style={styles.closeButton} activeOpacity={0.8}><View style={styles.closeButtonInner}><Text style={styles.closeButtonText}>Close</Text></View></TouchableOpacity>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        {messageGateModal}
      </>
    );
  }

  if (!isUnlocked) {
    return (
      <>
      <View style={[styles.container, compact && styles.containerCompact, square && styles.containerSquare]}>
        <TouchableOpacity 
          onPress={handleLockedPress} 
          activeOpacity={0.85}
          style={[styles.lockedCardOuter, square && styles.lockedCardSquare]}
        >
          <LinearGradient
            colors={['#2a1338', '#3d1852', '#5c1f5c', '#4a1452']}
            locations={[0, 0.35, 0.75, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.lockedCardGradient, square && styles.lockedCardGradientSquare]}
          >
            <LinearGradient
              colors={['rgba(255,0,128,0.45)', 'transparent', 'rgba(124,77,255,0.25)']}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.lockedCardSheen}
            />
            <View style={styles.lockedEmojiWrap}>
              <LinearGradient
                colors={['#ff66b2', '#ff0080', '#9c27b0']}
                style={styles.lockedEmojiRing}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.lockedEmojiInner}>
                  <Animated.Text style={[styles.lockedEmoji, { transform: [{ scale: emojiScale }, { rotate: diceRotateInterp }] }]}>🎲</Animated.Text>
                </View>
              </LinearGradient>
            </View>
            <View style={styles.lockedTextWrap}>
              <Text style={styles.lockedKicker}>LOCKED</Text>
              <Text style={styles.lockedText}>Truth or Dare</Text>
              <Text style={styles.lockedSubtext}>Tap for unlock progress</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
      {messageGateModal}
    </>
    );
  }

  return (
    <>
      <View style={[styles.container, compact && styles.containerCompact, square && styles.containerSquare]}>
        <Animated.View style={[styles.buttonWrapper, square && styles.buttonSquare, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.buttonGlowLayer} />
          <TouchableOpacity onPress={handleOpen} activeOpacity={0.9} style={[styles.button, square && styles.buttonSquare]}>
            <LinearGradient
              colors={['#ff0080', '#ff3399', '#ff66b2', '#cc0066', '#ff0080']}
              locations={[0, 0.25, 0.5, 0.75, 1]}
              style={[styles.buttonGradient, square && styles.buttonGradientSquare]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.15)', 'transparent']}
                locations={[0, 0.35, 0.8]}
                style={styles.buttonGloss}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
              <View style={styles.buttonInnerBorder} />
              <View style={[styles.buttonContent, square && styles.buttonContentSquare]}>
                <View style={[styles.emojiBadge, square && styles.emojiBadgeSquare]}>
                  <View style={styles.emojiGlow} />
                  <Animated.Text style={[styles.buttonEmoji, square && styles.buttonEmojiSquare, { transform: [{ scale: emojiScale }, { rotate: diceRotateInterp }] }]}>🎲</Animated.Text>
                </View>
                <Text style={[styles.buttonText, square && styles.buttonTextSquare]}>TRUTH OR DARE</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleClose}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.modalContent}
          >
            <LinearGradient
              colors={['#ff0080', '#ff3399', '#cc0066', '#ff66b2', '#ff0080']}
              locations={[0, 0.2, 0.5, 0.8, 1]}
              style={styles.modalGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.2)', 'transparent', 'transparent']}
                locations={[0, 0.3, 1]}
                style={styles.modalGloss}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
              <View style={styles.modalHeaderBar} />
              <Text style={styles.modalTitle}>
                {step === 'spice' || (gameState && !gameState.spiceReady)
                  ? 'Choose your heat'
                  : step === 'choose'
                    ? 'Pick One'
                    : promptType === 'truth'
                      ? '✨ Truth'
                      : '🔥 Dare'}
              </Text>
              {gameState?.unlockedUntil && secondsRemaining !== null && secondsRemaining > 0 && (
                <View style={styles.timerBadge}><Text style={styles.timerLabel}>Session time left</Text><Text style={styles.timerText}>⏱ {formatTimeRemaining(secondsRemaining)}</Text></View>
              )}
              {gameState?.tokenUnlocked && secondsRemaining !== null && secondsRemaining <= 0 ? (
                <View style={styles.sessionExpiredContainer}>
                  <Text style={styles.sessionExpiredTitle}>Session expired</Text>
                  <Text style={styles.sessionExpiredText}>Use another Mulligan token to play another 7-minute round.</Text>
                </View>
              ) : loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.loadingText}>Loading...</Text>
                </View>
              ) : step === 'spice' || (gameState && !gameState.spiceReady) ? (
                <View style={styles.chooseContainer}>
                  <Text style={styles.chooseSubtitle}>Each picks a max heat; prompts use the more conservative choice.</Text>
                  <View style={styles.spicePills}>
                    {(['pg13', 'ratedr', 'spicy'] as const).map((sid) => {
                      const active = gameState?.yourSpiceChoice === sid;
                      return (
                        <TouchableOpacity
                          key={sid}
                          onPress={() => void submitSpiceChoice(sid)}
                          style={[styles.spicePill, active && styles.spicePillActive]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.spicePillText, active && styles.spicePillTextActive]}>
                            {sid === 'pg13' ? 'PG-13' : sid === 'ratedr' ? 'Rated R' : 'Spicy'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.changeSpiceHint}>
                    {gameState?.yourSpiceChoice
                      ? !gameState.spiceReady
                        ? 'Waiting for your match to pick…'
                        : `Ready — round heat: ${gameState.spiceLevel || ''}`
                      : 'Tap to lock yours in.'}
                  </Text>
                </View>
              ) : step === 'choose' ? (
                <View style={styles.chooseContainer}>
                  {gameState?.spiceLevel ? (
                    <Text style={styles.changeSpiceHint}>This round: {String(gameState.spiceLevel).toUpperCase()}</Text>
                  ) : null}
                  <Text style={styles.chooseSubtitle}>Pick Truth or Dare</Text>
                  <View style={styles.chooseRow}>
                    <TouchableOpacity onPress={() => handleChoose('truth')} style={styles.choiceButton} activeOpacity={0.8}>
                      <LinearGradient colors={['#7c4dff', '#b388ff', '#651fff']} style={styles.choiceGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <Text style={styles.choiceEmoji}>✨</Text>
                        <Text style={styles.choiceText}>Truth</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleChoose('dare')} style={styles.choiceButton} activeOpacity={0.8}>
                      <LinearGradient colors={['#ff1744', '#ff4081', '#f50057']} style={styles.choiceGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <Text style={styles.choiceEmoji}>🔥</Text>
                        <Text style={styles.choiceText}>Dare</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => setStep('spice')} activeOpacity={0.7}>
                    <Text style={styles.changeSpiceHint}>Change my heat level</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#fff" />
                      <Text style={styles.loadingText}>Generating your prompt...</Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.promptCard}>
                        <Text style={styles.promptText}>{prompt}</Text>
                      </View>
                    </>
                  )}
                  <View style={styles.promptActions}>
                    {onSendToChat && !loading && (
                      <TouchableOpacity
                        onPress={handleSendToChat}
                        style={styles.sendButton}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={['#7c4dff', '#651fff']}
                          style={styles.sendButtonGradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <Text style={styles.sendButtonText}>Send to Chat 💬</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                    {!loading && (
                      <TouchableOpacity
                        onPress={() => handleChoose(promptType, true)}
                        style={styles.anotherButton}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.anotherButtonText}>Another one ↻</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}

              <TouchableOpacity onPress={handleClose} style={styles.closeButton} activeOpacity={0.8}>
                <View style={styles.closeButtonInner}>
                  <Text style={styles.closeButtonText}>Close</Text>
                </View>
              </TouchableOpacity>
            </LinearGradient>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {messageGateModal}
    </>
  );
}

const styles = StyleSheet.create({
  headerIconButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  headerIconButtonLocked: {
    opacity: 0.85,
  },
  headerIconEmoji: {
    fontSize: 24,
  },
  container: {
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  containerCompact: {
    marginVertical: 2,
    paddingHorizontal: 8,
  },
  containerSquare: {
    flex: 1,
    marginVertical: 0,
    paddingHorizontal: 0,
  },
  lockedCardOuter: {
    borderRadius: 18,
    overflow: 'hidden',
    minWidth: 140,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#ff0080',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 10,
  },
  lockedCardSquare: {
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 0,
  },
  lockedCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    position: 'relative',
  },
  lockedCardGradientSquare: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  lockedCardSheen: {
    ...StyleSheet.absoluteFillObject,
  },
  lockedEmojiWrap: {
    marginRight: 14,
    zIndex: 1,
  },
  lockedEmojiRing: {
    width: 46,
    height: 46,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedEmojiInner: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(12, 6, 18, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedEmoji: {
    fontSize: 22,
  },
  lockedTextWrap: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
  },
  lockedKicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: 'rgba(255, 182, 220, 0.95)',
    marginBottom: 4,
  },
  lockedText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  lockedSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  buttonWrapper: {
    position: 'relative',
  },
  buttonGlowLayer: {
    position: 'absolute',
    top: 4,
    left: 8,
    right: 8,
    bottom: -4,
    borderRadius: 18,
    backgroundColor: 'transparent',
    shadowColor: '#ff0080',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.75,
    shadowRadius: 24,
    elevation: 14,
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#ff0080',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.65,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  buttonSquare: {
    flex: 1,
    alignSelf: 'stretch',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    position: 'relative',
  },
  buttonGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  buttonInnerBorder: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContentSquare: {
    flexDirection: 'column',
  },
  emojiBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    position: 'relative',
  },
  emojiGlow: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    top: 3,
    left: 3,
  },
  emojiBadgeSquare: {
    marginRight: 0,
    marginBottom: 6,
  },
  buttonGradientSquare: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  buttonEmoji: {
    fontSize: 22,
    marginRight: 0,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  buttonEmojiSquare: {
    marginRight: 0,
    marginBottom: 0,
    fontSize: 24,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  buttonTextSquare: {
    fontSize: 10,
    textAlign: 'center',
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#ff0080',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  modalGradient: {
    padding: 28,
    borderRadius: 28,
    alignItems: 'center',
    position: 'relative',
  },
  modalGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  modalHeaderBar: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 2,
    marginTop: 12,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 22,
    letterSpacing: 0.6,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  headerButtonWithTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTimerBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 12,
  },
  headerTimerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  timerBadge: {
    alignSelf: 'center',
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 20,
    alignItems: 'center',
  },
  timerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  timerText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  sessionExpiredContainer: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  sessionExpiredTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  sessionExpiredText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    lineHeight: 20,
  },
  chooseRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  choiceButton: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  choiceGradient: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  choiceEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  choiceText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  chooseContainer: {
    alignItems: 'center',
  },
  versionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  chooseSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
    marginBottom: 12,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 12,
    fontWeight: '500',
  },
  lobbyContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  lobbyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 14,
  },
  lobbyHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 12,
    textAlign: 'center',
  },
  changeSpiceHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 14,
    marginBottom: 6,
    textAlign: 'center',
  },
  spiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  spiceLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  spicePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  spicePill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  spicePillActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  spicePillText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  spicePillTextActive: {
    color: '#ff0080',
    fontWeight: '800',
  },
  spicePillSmall: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  spicePillTextSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  promptSpiceBadge: {
    alignSelf: 'center',
    marginBottom: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  promptSpiceText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  promptCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  promptText: {
    fontSize: 19,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  promptActions: {
    width: '100%',
    gap: 14,
    marginBottom: 18,
  },
  sendButton: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#651fff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  sendButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  sendButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
  },
  anotherButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  anotherButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  closeButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  closeButtonInner: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
});
