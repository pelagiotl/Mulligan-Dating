/**
 * Truth or Dare - Unlocked with a Mulligan token
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// Slightly spicy but tasteful — flirty, playful, PG-13
const TRUTH_PROMPTS = [
  "What's the first thing you notice about someone you're attracted to?",
  "What's your love language and how do you show it?",
  "What's something that would make you swipe right immediately?",
  "What's your idea of a perfect first date?",
  "What's the best compliment you've ever received from a crush?",
  "Have you ever had a crush on someone you just met?",
  "What's your go-to move to break the ice on a first date?",
  "What's the most attractive quality in someone's profile?",
  "What's something you'd want a date to do to impress you?",
  "What's your guilty pleasure when it comes to romance?",
  "What's the most romantic thing someone's ever done for you?",
  "What emoji would you use to describe your dating energy?",
  "What's your biggest green flag in a conversation?",
  "What's something you're secretly picky about in dating?",
  "What would make you want to extend a first date into a second?",
];

const DARE_PROMPTS = [
  "Send a voice note saying something you'd only say when you're really into someone",
  "Describe your type in exactly 3 words",
  "Send a selfie with the look you give when you're attracted to someone",
  "Voice note: say one thing that would make me want to meet you in person",
  "Describe your ideal first date in 3 emojis",
  "Send a pic of what you're doing right now with a one-line vibe check",
  "Reply with the line you'd use to ask someone out in person",
  "Send a selfie — your choice of flirty or silly",
  "Describe what you find attractive in someone using only emojis",
  "Send a voice note: 10 seconds on why you're a good date",
  "Reply with 3 words that describe your vibe on a good date",
  "Send a pic of your pet (or plant) with a caption that says something about you",
  "Pick one emoji that sums up your dating energy and explain in one sentence",
  "Reply with a question you've always wanted to ask a match",
  "Send a selfie with your best smile",
];

// Rated R — spicier, more suggestive (still app-store safe)
const TRUTH_PROMPTS_R = [
  "What's your biggest turn-on in a conversation?",
  "What's the most attractive physical feature on someone?",
  "Have you ever made the first move? How did it go?",
  "What's something you find irresistible in a date?",
  "What's your idea of the perfect kiss?",
  "What's the boldest thing you've done to get someone's attention?",
  "What's a dealbreaker for you when it comes to chemistry?",
  "What's your love language when it comes to physical affection?",
  "What's something that instantly attracts you to someone?",
  "What's the most romantic thing you've ever done for a crush?",
  "What's your take on making the first move?",
  "What's something you'd never do on a first date?",
  "What's your biggest green flag when it comes to chemistry?",
  "What's the most memorable compliment you've gotten about your looks?",
  "What would make you want to kiss someone on a first date?",
];

const DARE_PROMPTS_R = [
  "Send a voice note saying something you'd whisper to someone you're into",
  "Send a selfie with your best 'come here' look",
  "Describe what turns you on physically in 3 words",
  "Voice note: tell them one thing you find attractive about them",
  "Describe your ideal first kiss in 3 emojis",
  "Send a pic with a caption that flirts without being explicit",
  "Reply with the boldest thing you'd say to break the tension on a date",
  "Send a selfie from an angle you know works",
  "Describe your type using only emojis",
  "Voice note: say what you'd do if you were on a date with them right now",
  "Reply with 3 words that describe your romantic energy",
  "Send a selfie that shows your confidence",
  "Pick an emoji that represents your flirty side and explain in one line",
  "Reply with a question that would make someone blush",
  "Send a selfie that shows off your favorite feature",
];

// Spicy — boldest level, most provocative
const TRUTH_PROMPTS_SPICY = [
  "What's your biggest fantasy when it comes to a first date?",
  "What's the boldest thing you've ever done to get someone's attention?",
  "What would make you want to skip straight to the good part on a date?",
  "What's something you'd never admit in person but might say here?",
  "What's the most attractive thing someone could whisper to you?",
  "What's your secret turn-on that you've never told anyone?",
  "What would you do if we had the place to ourselves right now?",
  "What's the most impulsive romantic thing you've ever done?",
  "What's your idea of the perfect night alone with someone you're into?",
  "What would make you lose your cool on a date?",
  "What's the most memorable way someone's ever flirted with you?",
  "What's something you find irresistible that most people overlook?",
  "What's your boldest move when you know there's chemistry?",
  "What would you want me to say to make your heart race?",
  "What's the hottest non-physical thing someone can do on a date?",
];

const DARE_PROMPTS_SPICY = [
  "Send a voice note saying something you'd say when the tension is high",
  "Send a selfie from an angle that makes an impression",
  "Describe what you find attractive about them in 3 bold words",
  "Voice note: say what you want to do with them on a second date",
  "Reply with the boldest thing you'd do if we were alone right now",
  "Send a pic with a caption that's flirty but tasteful",
  "Voice note: say one thing that would make them blush",
  "Send a selfie that shows off your most confident side",
  "Reply with a question that would make someone's heart skip",
  "Describe your ideal night with them using only emojis",
  "Voice note: describe the vibe you want between you two",
  "Reply with 3 words that describe the energy you want between us",
  "Send a selfie with your best 'come here' look",
  "Voice note: tell them why you're into them in one sentence",
  "Send a pic with a caption that flirts without saying it outright",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface Message {
  id: string;
  senderId: string;
  isOwn?: boolean;
  content: string;
}

interface GameState {
  yourSpiceChoice: 'pg13' | 'ratedr' | 'spicy' | null;
  theirSpiceChoice: 'pg13' | 'ratedr' | 'spicy' | null;
  spiceReady: boolean;
  spiceLevel: 'pg13' | 'ratedr' | 'spicy' | null;
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
  currentUserId,
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
  const [step, setStep] = useState<'lobby' | 'choose' | 'prompt'>('lobby');
  const [prompt, setPrompt] = useState<string>('');
  const [promptType, setPromptType] = useState<'truth' | 'dare'>('truth');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [headerTimerSecs, setHeaderTimerSecs] = useState<number | null>(null);
  const lastUnlockedUntilRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAnotherOneAtRef = useRef<number>(0);
  const lastSpiceChoiceAtRef = useRef<number>(0);
  const lastSpiceChoiceRef = useRef<'pg13' | 'ratedr' | 'spicy' | null>(null);

  const isUnlocked = gameUnlockedByToken;

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
      const recentlySetSpice = Date.now() - lastSpiceChoiceAtRef.current < 5000;
      const intendedSpice = lastSpiceChoiceRef.current;
      setGameState((prev) => {
        if (recentlySetSpice && (intendedSpice ?? prev?.spiceLevel)) {
          return { ...data, spiceLevel: intendedSpice ?? prev?.spiceLevel ?? data.spiceLevel, spiceReady: true };
        }
        if (data.yourSpiceChoice && !data.spiceReady) {
          return { ...data, spiceLevel: data.yourSpiceChoice, spiceReady: true };
        }
        return data;
      });
      const recentlyRequestedAnother = Date.now() - lastAnotherOneAtRef.current < 5000;
      const alreadyShowingPrompt = stepRef.current === 'prompt';
      if (recentlyRequestedAnother && alreadyShowingPrompt) {
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
      if (data.spiceReady && data.spiceLevel) {
        setStep('choose');
      } else if (data.yourSpiceChoice) {
        setStep('choose');
      } else {
        setStep('lobby');
      }
    } catch (err) {
      console.warn('Truth or Dare fetch state error:', err);
    }
  }, [matchId]);

  useEffect(() => {
    if (openForAccept) {
      setStep('lobby');
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
    setStep('lobby');
    setPrompt('');
    setModalVisible(true);
    setLoading(true);
    fetchState().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchState, 3000);
  };

  const handleClose = () => {
    lastSpiceChoiceRef.current = null;
    setModalVisible(false);
    setStep('lobby');
    setPrompt('');
    setGameState(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleSetSpiceChoice = async (choice: 'pg13' | 'ratedr' | 'spicy') => {
    lastSpiceChoiceAtRef.current = Date.now();
    lastSpiceChoiceRef.current = choice;
    setSubmitting(true);
    setGameState((prev) => (prev ? { ...prev, spiceLevel: choice, spiceReady: true } : prev));
    try {
      const data = await api.post<GameState>(`/matches/${matchId}/truth-or-dare/spice-choice`, { choice });
      // Use agreed level only when it matches the choice we just made (so UI doesn't revert to previous level)
      const displayLevel = (data.spiceReady && data.spiceLevel != null && data.spiceLevel === choice)
        ? data.spiceLevel
        : (data.yourSpiceChoice ?? choice);
      setGameState((prev) => (prev ? { ...prev, ...data, spiceLevel: displayLevel, spiceReady: true } : { ...data, spiceLevel: displayLevel, spiceReady: true }));
      setStep('choose');
      // Clear ref after delay so any socket/poll fetchState in the next 5s still sees intendedSpice and doesn't overwrite with stale GET
      setTimeout(() => {
        lastSpiceChoiceRef.current = null;
      }, 5000);
    } catch (err) {
      console.warn('Truth or Dare spice choice error:', err);
      lastSpiceChoiceRef.current = null;
    } finally {
      setSubmitting(false);
    }
  };

  const handleChoose = async (type: 'truth' | 'dare', anotherOne = false) => {
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

    const spiceLevel = gameState?.spiceLevel || 'pg13';

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
    } catch (err) {
      const list = type === 'truth'
        ? (spiceLevel === 'spicy' ? TRUTH_PROMPTS_SPICY : spiceLevel === 'ratedr' ? TRUTH_PROMPTS_R : TRUTH_PROMPTS)
        : (spiceLevel === 'spicy' ? DARE_PROMPTS_SPICY : spiceLevel === 'ratedr' ? DARE_PROMPTS_R : DARE_PROMPTS);
      finalPrompt = pickRandom(list);
      setPrompt(finalPrompt);
      lastAnotherOneAtRef.current = Date.now();
    } finally {
      setLoading(false);
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
        'Use 1 Mulligan token to play Truth or Dare? (Session lasts 7 minutes for both of you.)',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Use Token',
            style: 'default',
            onPress: async () => {
              try {
                await onUnlockWithToken();
                handleOpen();
              } catch (e: any) {
                Alert.alert('Error', e?.message || 'Failed to unlock. You may need more tokens.');
              }
            },
          },
        ]
      );
    } else {
      Alert.alert('🎲 Truth or Dare', 'Use a Mulligan token to unlock Truth or Dare for this match.', [{ text: 'Got it', style: 'default' }]);
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
                <Text style={styles.modalTitle}>{step === 'lobby' ? '🎲 Truth or Dare' : step === 'choose' ? 'Pick One' : promptType === 'truth' ? '✨ Truth' : '🔥 Dare'}</Text>
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
                ) : step === 'lobby' ? (
                  <View style={styles.lobbyContainer}>
                    {!gameState?.yourSpiceChoice ? (
                      <>
                        <Text style={styles.lobbyTitle}>Pick a version</Text>
                        <View style={styles.spicePills}>
                          <TouchableOpacity onPress={() => handleSetSpiceChoice('pg13')} style={[styles.spicePill, gameState?.yourSpiceChoice === 'pg13' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.yourSpiceChoice === 'pg13' && styles.spicePillTextActive]}>PG-13</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => handleSetSpiceChoice('ratedr')} style={[styles.spicePill, gameState?.yourSpiceChoice === 'ratedr' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.yourSpiceChoice === 'ratedr' && styles.spicePillTextActive]}>Rated R</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => handleSetSpiceChoice('spicy')} style={[styles.spicePill, gameState?.yourSpiceChoice === 'spicy' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.yourSpiceChoice === 'spicy' && styles.spicePillTextActive]}>Spicy</Text></TouchableOpacity>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.lobbyHint}>Waiting for them to pick a version...</Text>
                    )}
                  </View>
                ) : step === 'choose' ? (
                  <View style={styles.chooseContainer}>
                    {gameState?.spiceLevel ? (
                      <>
                        <Text style={styles.versionLabel}>Version</Text>
                        <View style={styles.spicePills}>
                          <TouchableOpacity onPress={() => handleSetSpiceChoice('pg13')} style={[styles.spicePill, gameState?.spiceLevel === 'pg13' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.spiceLevel === 'pg13' && styles.spicePillTextActive]}>PG-13</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => handleSetSpiceChoice('ratedr')} style={[styles.spicePill, gameState?.spiceLevel === 'ratedr' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.spiceLevel === 'ratedr' && styles.spicePillTextActive]}>Rated R</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => handleSetSpiceChoice('spicy')} style={[styles.spicePill, gameState?.spiceLevel === 'spicy' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.spiceLevel === 'spicy' && styles.spicePillTextActive]}>Spicy</Text></TouchableOpacity>
                        </View>
                      </>
                    ) : null}
                    <Text style={styles.chooseSubtitle}>Pick Truth or Dare</Text>
                    <View style={styles.chooseRow}>
                      <TouchableOpacity onPress={() => handleChoose('truth')} style={styles.choiceButton} activeOpacity={0.8}><LinearGradient colors={['#7c4dff', '#b388ff', '#651fff']} style={styles.choiceGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}><Text style={styles.choiceEmoji}>✨</Text><Text style={styles.choiceText}>Truth</Text></LinearGradient></TouchableOpacity>
                      <TouchableOpacity onPress={() => handleChoose('dare')} style={styles.choiceButton} activeOpacity={0.8}><LinearGradient colors={['#ff1744', '#ff4081', '#f50057']} style={styles.choiceGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}><Text style={styles.choiceEmoji}>🔥</Text><Text style={styles.choiceText}>Dare</Text></LinearGradient></TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    {loading ? <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#fff" /><Text style={styles.loadingText}>Generating your prompt...</Text></View> : (
                      <>
                        <View style={styles.spiceRow}>
                          <Text style={styles.versionLabel}>Version</Text>
                          <View style={styles.spicePills}>
                            <TouchableOpacity onPress={() => handleSetSpiceChoice('pg13')} style={[styles.spicePillSmall, gameState?.spiceLevel === 'pg13' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillTextSmall, gameState?.spiceLevel === 'pg13' && styles.spicePillTextActive]}>PG-13</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => handleSetSpiceChoice('ratedr')} style={[styles.spicePillSmall, gameState?.spiceLevel === 'ratedr' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillTextSmall, gameState?.spiceLevel === 'ratedr' && styles.spicePillTextActive]}>R</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => handleSetSpiceChoice('spicy')} style={[styles.spicePillSmall, gameState?.spiceLevel === 'spicy' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillTextSmall, gameState?.spiceLevel === 'spicy' && styles.spicePillTextActive]}>Spicy</Text></TouchableOpacity>
                          </View>
                        </View>
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
      </>
    );
  }

  if (!isUnlocked) {
    return (
      <View style={[styles.container, compact && styles.containerCompact, square && styles.containerSquare]}>
        <TouchableOpacity 
          onPress={handleLockedPress} 
          activeOpacity={0.7}
          style={[styles.lockedCard, square && styles.lockedCardSquare]}
        >
          <View style={styles.lockedEmojiWrap}>
            <Animated.Text style={[styles.lockedEmoji, { transform: [{ scale: emojiScale }, { rotate: diceRotateInterp }] }]}>🎲</Animated.Text>
          </View>
          <View style={styles.lockedTextWrap}>
            <Text style={styles.lockedText}>Truth or Dare</Text>
            <Text style={styles.lockedSubtext}>Tap to see how to unlock</Text>
          </View>
        </TouchableOpacity>
      </View>
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
                {step === 'lobby' ? '🎲 Truth or Dare' : step === 'choose' ? 'Pick One' : promptType === 'truth' ? '✨ Truth' : '🔥 Dare'}
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
              ) : step === 'lobby' ? (
                <View style={styles.lobbyContainer}>
                  {!gameState?.yourSpiceChoice ? (
                    <>
                      <Text style={styles.lobbyTitle}>Pick a version</Text>
                      <View style={styles.spicePills}>
                        <TouchableOpacity onPress={() => handleSetSpiceChoice('pg13')} style={[styles.spicePill, gameState?.yourSpiceChoice === 'pg13' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.yourSpiceChoice === 'pg13' && styles.spicePillTextActive]}>PG-13</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleSetSpiceChoice('ratedr')} style={[styles.spicePill, gameState?.yourSpiceChoice === 'ratedr' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.yourSpiceChoice === 'ratedr' && styles.spicePillTextActive]}>Rated R</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleSetSpiceChoice('spicy')} style={[styles.spicePill, gameState?.yourSpiceChoice === 'spicy' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.yourSpiceChoice === 'spicy' && styles.spicePillTextActive]}>Spicy</Text></TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.lobbyHint}>Waiting for them to pick a version...</Text>
                  )}
                </View>
              ) : step === 'choose' ? (
                <View style={styles.chooseContainer}>
                  {gameState?.spiceLevel ? (
                    <>
                      <Text style={styles.versionLabel}>Version</Text>
                      <View style={styles.spicePills}>
                        <TouchableOpacity onPress={() => handleSetSpiceChoice('pg13')} style={[styles.spicePill, gameState?.spiceLevel === 'pg13' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.spiceLevel === 'pg13' && styles.spicePillTextActive]}>PG-13</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleSetSpiceChoice('ratedr')} style={[styles.spicePill, gameState?.spiceLevel === 'ratedr' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.spiceLevel === 'ratedr' && styles.spicePillTextActive]}>Rated R</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleSetSpiceChoice('spicy')} style={[styles.spicePill, gameState?.spiceLevel === 'spicy' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, gameState?.spiceLevel === 'spicy' && styles.spicePillTextActive]}>Spicy</Text></TouchableOpacity>
                      </View>
                    </>
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
                      <View style={styles.spiceRow}>
                        <Text style={styles.versionLabel}>Version</Text>
                        <View style={styles.spicePills}>
                          <TouchableOpacity onPress={() => handleSetSpiceChoice('pg13')} style={[styles.spicePillSmall, gameState?.spiceLevel === 'pg13' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillTextSmall, gameState?.spiceLevel === 'pg13' && styles.spicePillTextActive]}>PG-13</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => handleSetSpiceChoice('ratedr')} style={[styles.spicePillSmall, gameState?.spiceLevel === 'ratedr' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillTextSmall, gameState?.spiceLevel === 'ratedr' && styles.spicePillTextActive]}>R</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => handleSetSpiceChoice('spicy')} style={[styles.spicePillSmall, gameState?.spiceLevel === 'spicy' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillTextSmall, gameState?.spiceLevel === 'spicy' && styles.spicePillTextActive]}>Spicy</Text></TouchableOpacity>
                        </View>
                      </View>
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
  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 128, 0.15)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 0, 128, 0.45)',
    minWidth: 140,
    shadowColor: '#ff0080',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  lockedCardSquare: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  lockedEmojiWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 0, 128, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 128, 0.4)',
  },
  lockedEmoji: {
    fontSize: 20,
  },
  lockedTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  lockedText: {
    fontSize: 15,
    color: '#2d2d2d',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  lockedSubtext: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.55)',
    fontWeight: '600',
    marginTop: 3,
    letterSpacing: 0.3,
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
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 12,
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
