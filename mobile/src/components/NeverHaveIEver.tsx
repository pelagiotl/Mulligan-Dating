/**
 * Never Have I Ever — tally mode. In-game chat uses the same match message thread as the main chat
 * (parity with web NeverHaveIEverWeb).
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  ScrollView,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import TruthOrDareMessageGateModal from './TruthOrDareMessageGateModal';
import GameUnlockPlayModal from './GameUnlockPlayModal';
import ChatHeaderIconGlow from './ChatHeaderIconGlow';
import {
  MATCH_CHAT_DEPTH_MIN_EACH,
  matchChatDepthCounts,
  matchChatDepthThresholdMet,
} from '../utils/matchChatDepthGate';

/** Subset of match messages for in-game bubbles (same thread as main chat). */
export type NhieGameChatMessage = {
  id: string;
  senderId: string;
  content: string;
  senderName: string;
  sentAt: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
};

const GAME_CHAT_MAX = 80;

function bubbleBody(m: NhieGameChatMessage): string {
  const t = (m.content ?? '').trim();
  if (t) return t;
  if (m.imageUrl) return '📷 Photo';
  if (m.videoUrl) return '🎥 Video';
  if (m.audioUrl) return '🎤 Voice';
  return '';
}

interface GameState {
  prompt: string;
  phase: 'lobby' | 'playing';
  yourSpiceChoice: 'pg13' | 'ratedr' | 'spicy' | null;
  theirSpiceChoice: 'pg13' | 'ratedr' | 'spicy' | null;
  spiceReady: boolean;
  spiceLevel: 'pg13' | 'ratedr' | 'spicy' | null;
  tokenUnlocked?: boolean;
  needsSpiceChoiceFromUnlocker?: boolean;
  unlockedByUserId?: string | null;
  yourPoints: number;
  theirPoints: number;
  yourAnswer: 'have' | 'havent' | null;
  theirAnswer: 'have' | 'havent' | null;
  bothAnswered: boolean;
  gameOver: boolean;
  winner: 'you' | 'them' | null;
  /** From API so we can map socket user1Strikes/user2Strikes to yourPoints/theirPoints */
  isUser1?: boolean;
  roundId?: string | null;
}

interface NeverHaveIEverProps {
  matchId: string;
  messages?: NhieGameChatMessage[];
  currentUserId: string;
  chatPartnerUserId?: string;
  socket: any;
  /** Send a text message on the match thread (same as main chat). */
  onSendToChat?: (text: string) => void | Promise<void>;
  sendingMessage?: boolean;
  partnerDisplayName?: string;
  partnerIsTyping?: boolean;
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

export default function NeverHaveIEver({
  matchId,
  messages = [],
  currentUserId,
  chatPartnerUserId = '',
  socket,
  onSendToChat,
  sendingMessage = false,
  partnerDisplayName = 'Them',
  partnerIsTyping = false,
  onRequestGame,
  onUnlockWithToken,
  onBeforeUnlockPrompt,
  openForAccept,
  onOpenedForAccept,
  gameUnlockedByToken = false,
  compact = true,
  square = false,
  headerMode = false,
}: NeverHaveIEverProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [messageGateModalVisible, setMessageGateModalVisible] = useState(false);
  const [unlockPlayModalVisible, setUnlockPlayModalVisible] = useState(false);
  const [unlockPlayLoading, setUnlockPlayLoading] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [gameChatDraft, setGameChatDraft] = useState('');
  const [gameChatSending, setGameChatSending] = useState(false);
  const [gameChatKeyboardHeight, setGameChatKeyboardHeight] = useState(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gameChatScrollRef = useRef<ScrollView>(null);
  const compactGameChat = windowWidth < 430;
  const [gameChatPanelOpen, setGameChatPanelOpen] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitingForOtherPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRoundCompletedAtRef = useRef<number>(0);
  const promptLockedUntilRef = useRef(0);
  const lastAnsweredPromptRef = useRef('');
  const roundIdRef = useRef<string | null>(null);
  const lastKnownPointsRef = useRef<{ yourPoints: number; theirPoints: number }>({ yourPoints: 0, theirPoints: 0 });
  /** Persist isUser1 so socket handler can map user1Strikes/user2Strikes to yourPoints/theirPoints even if state was overwritten */
  const isUser1Ref = useRef<boolean | null>(null);
  const modalVisibleRef = useRef(false);
  modalVisibleRef.current = modalVisible;

  const isUnlocked = gameUnlockedByToken;
  const displayPrompt = prompt || state?.prompt || '';
  const displayPromptRef = useRef('');
  displayPromptRef.current = displayPrompt;

  useEffect(() => {
    if (state?.roundId) roundIdRef.current = state.roundId;
  }, [state?.roundId]);

  const nhieEligible = useMemo(
    () =>
      Boolean(currentUserId && chatPartnerUserId) &&
      matchChatDepthThresholdMet(messages, currentUserId, chatPartnerUserId),
    [messages, currentUserId, chatPartnerUserId]
  );

  const messageGateCounts = useMemo(
    () => matchChatDepthCounts(messages, currentUserId, chatPartnerUserId),
    [messages, currentUserId, chatPartnerUserId]
  );

  const messageGateModal = (
    <TruthOrDareMessageGateModal
      visible={messageGateModalVisible}
      onClose={() => setMessageGateModalVisible(false)}
      myCount={messageGateCounts.my}
      theirCount={messageGateCounts.their}
      threshold={MATCH_CHAT_DEPTH_MIN_EACH}
      emoji="🙊"
      kicker="NEVER HAVE I EVER"
      title="Warm up the chat first"
      subtitle={`Send at least ${MATCH_CHAT_DEPTH_MIN_EACH} messages each — then Never Have I Ever unlocks for this match.`}
      hintText="Real back-and-forth keeps things fun — we'll nudge you until you've both chimed in enough."
    />
  );

  const handleUnlockPlayConfirm = async () => {
    if (!onUnlockWithToken || unlockPlayLoading) return;
    setUnlockPlayLoading(true);
    try {
      await onUnlockWithToken();
      setUnlockPlayModalVisible(false);
      handleOpen();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to open game.');
    } finally {
      setUnlockPlayLoading(false);
    }
  };

  const unlockPlayModal = (
    <GameUnlockPlayModal
      visible={unlockPlayModalVisible}
      onCancel={() => {
        if (!unlockPlayLoading) setUnlockPlayModalVisible(false);
      }}
      onPlay={() => void handleUnlockPlayConfirm()}
      playing={unlockPlayLoading}
      emoji="🙊"
      kicker="NEVER HAVE I EVER"
      title="Ready to play?"
      subtitle="Use one Mulligan token to unlock Never Have I Ever for you and your match."
      features={[
        'Strike tally — see who caves first',
        'Custom prompts or pick from the deck',
        'Keeps the vibe going in your chat',
      ]}
    />
  );

  const gameChatTypingActiveRef = useRef(false);
  const gameChatTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopGameChatTyping = useCallback(() => {
    if (gameChatTypingTimeoutRef.current) {
      clearTimeout(gameChatTypingTimeoutRef.current);
      gameChatTypingTimeoutRef.current = null;
    }
    if (gameChatTypingActiveRef.current) {
      socket?.emit?.('stop_typing', { matchId });
      gameChatTypingActiveRef.current = false;
    }
  }, [socket, matchId]);

  const pulseGameChatTypingFromValue = useCallback(
    (value: string) => {
      if (!socket || !modalVisibleRef.current) return;
      const trimmed = value.trim();
      if (!trimmed) {
        stopGameChatTyping();
        return;
      }
      if (!gameChatTypingActiveRef.current) {
        socket.emit('typing', { matchId });
        gameChatTypingActiveRef.current = true;
      }
      if (gameChatTypingTimeoutRef.current) clearTimeout(gameChatTypingTimeoutRef.current);
      gameChatTypingTimeoutRef.current = setTimeout(() => {
        socket.emit('stop_typing', { matchId });
        gameChatTypingActiveRef.current = false;
        gameChatTypingTimeoutRef.current = null;
      }, 3000);
    },
    [socket, matchId, stopGameChatTyping]
  );

  const sortedGameChat = useMemo(() => {
    const rows = messages
      .filter((m) => Boolean(bubbleBody(m)))
      .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    return rows.length > GAME_CHAT_MAX ? rows.slice(-GAME_CHAT_MAX) : rows;
  }, [messages]);

  const sendGameChatMessage = async () => {
    const text = gameChatDraft.trim();
    if (!text || !currentUserId || gameChatSending || sendingMessage || !onSendToChat) return;
    setGameChatSending(true);
    setGameChatDraft('');
    try {
      await Promise.resolve(onSendToChat(text));
    } finally {
      setGameChatSending(false);
      stopGameChatTyping();
    }
  };

  const showGameChat = Boolean(state && currentUserId && onSendToChat);
  const showEmbeddedGameChat = showGameChat && (!compactGameChat || gameChatPanelOpen);
  const showGameChatFab = showGameChat && compactGameChat && !gameChatPanelOpen;
  const gameChatKeyboardPad =
    gameChatKeyboardHeight > 0 && Platform.OS === 'android'
      ? gameChatKeyboardHeight + 28
      : gameChatKeyboardHeight;
  const gameChatScrollMaxHeight =
    gameChatKeyboardPad > 0
      ? Math.min(100, Math.max(56, windowHeight * 0.12))
      : compactGameChat && gameChatPanelOpen
        ? 120
        : 140;

  const scrollGameChatToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      gameChatScrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    if (!modalVisible) {
      setGameChatKeyboardHeight(0);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => {
      setGameChatKeyboardHeight(e.endCoordinates.height);
      setTimeout(scrollGameChatToEnd, 50);
      setTimeout(scrollGameChatToEnd, 200);
    });
    const onHide = Keyboard.addListener(hideEvent, () => setGameChatKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [modalVisible, scrollGameChatToEnd]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const emojiScale = useRef(new Animated.Value(1)).current;
  const emojiRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Monkey wiggle + bounce: tilt -8deg to 8deg, scale 1 to 1.15
    // Using Animated.timing instead of Animated.spring to avoid memory leak
    const monkeyWiggle = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(emojiScale, {
            toValue: 1.15,
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
    monkeyWiggle.start();
    return () => {
      monkeyWiggle.stop();
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
      const { addBreadcrumb, debugLog } = await import('../utils/debugLogger');
      addBreadcrumb('NHIE', 'Fetching state', { matchId });
      // Never use cache so points/prompt don't revert after both answer
      const data = await api.get<any>(`/matches/${matchId}/never-have-i-ever`, false);
      const fetchedYou = Math.max(0, Number(data.yourPoints ?? data.yourStrikes ?? 0));
      const fetchedThem = Math.max(0, Number(data.theirPoints ?? data.theirStrikes ?? 0));
      // Once both have chosen spice, stay in playing (never show lobby again); show "Getting prompt..." if prompt is briefly empty
      const hasChosen = !!(data.yourSpiceChoice || data.theirSpiceChoice);
      if (data.isUser1 !== undefined) isUser1Ref.current = !!data.isUser1;
      if (data.inactiveReset) {
        lastKnownPointsRef.current = { yourPoints: 0, theirPoints: 0 };
        Alert.alert('Never Have I Ever', 'Game restarted — someone was away for a while.');
      }
      const simple: GameState = {
        prompt: data.prompt || '',
        phase: data.spiceReady && (data.prompt || data.spiceLevel || hasChosen) ? 'playing' : 'lobby',
        yourSpiceChoice: data.yourSpiceChoice ?? null,
        theirSpiceChoice: data.theirSpiceChoice ?? null,
        spiceReady: !!data.spiceReady,
        spiceLevel: data.spiceLevel ?? null,
        tokenUnlocked: !!data.tokenUnlocked,
        needsSpiceChoiceFromUnlocker: !!data.needsSpiceChoiceFromUnlocker,
        unlockedByUserId: data.unlockedByUserId ?? null,
        yourPoints: fetchedYou,
        theirPoints: fetchedThem,
        yourAnswer: data.yourAnswer ?? null,
        theirAnswer: data.theirAnswer ?? null,
        bothAnswered: !!data.bothAnswered,
        gameOver: !!data.gameOver,
        winner: data.winner ?? null,
        isUser1: data.isUser1,
        roundId: data.roundId ?? null,
      };
      setState(prev => {
        const recentRound = Date.now() - lastRoundCompletedAtRef.current < 6000;
        const promptLocked = Date.now() < promptLockedUntilRef.current;
        const fetchedZero = simple.yourPoints === 0 && simple.theirPoints === 0;
        const refHasPoints = lastKnownPointsRef.current.yourPoints > 0 || lastKnownPointsRef.current.theirPoints > 0;
        // Don't overwrite yourAnswer with null from a stale GET — until round completes (server clears answers or sends bothAnswered).
        const serverClearedForNextRound =
          simple.yourAnswer === null &&
          (simple.prompt?.trim() ?? '') !== '' &&
          (prev?.yourAnswer != null) &&
          simple.prompt !== (prev?.prompt ?? '');
        const promptChanged =
          (prev?.prompt?.trim() ?? '') !== '' &&
          (simple.prompt?.trim() ?? '') !== '' &&
          simple.prompt.trim() !== (prev?.prompt ?? '').trim();
        const firstPromptShown =
          !(prev?.prompt?.trim()) &&
          !!(simple.prompt?.trim()) &&
          simple.phase === 'playing' &&
          !simple.bothAnswered;
        if (firstPromptShown) {
          promptLockedUntilRef.current = Date.now() + 8000;
        }
        const midRoundPromptSwap =
          !!(prev?.prompt?.trim()) &&
          !!(simple.prompt?.trim()) &&
          simple.prompt.trim() !== (prev?.prompt ?? '').trim() &&
          (simple.roundId ?? null) === (prev?.roundId ?? null) &&
          !simple.bothAnswered &&
          Date.now() < promptLockedUntilRef.current;
        if (simple.bothAnswered || serverClearedForNextRound) {
          lastRoundCompletedAtRef.current = Date.now();
        }
        // Mirror web: trust server answers unless we're waiting on our optimistic pick.
        // After a new prompt (socket/POST), ignore stale GETs that still carry old answers.
        let yourAnswer: 'have' | 'havent' | null = simple.yourAnswer ?? null;
        let theirAnswer: 'have' | 'havent' | null = simple.theirAnswer ?? null;
        if (promptLocked && prev?.yourAnswer == null && prev?.theirAnswer == null) {
          yourAnswer = null;
          theirAnswer = null;
        } else if (promptChanged || serverClearedForNextRound) {
          yourAnswer = simple.yourAnswer ?? null;
          theirAnswer = simple.theirAnswer ?? null;
          if (yourAnswer == null && theirAnswer == null && simple.prompt?.trim()) {
            lastAnsweredPromptRef.current = '';
          }
        } else if (simple.yourAnswer == null && prev?.yourAnswer != null && !simple.bothAnswered) {
          const roundAdvanced =
            (simple.roundId ?? null) !== (prev?.roundId ?? null) && !!(simple.roundId ?? null);
          yourAnswer = roundAdvanced ? null : prev.yourAnswer;
        }
        const staleRoundPrompt =
          recentRound &&
          lastAnsweredPromptRef.current.trim() !== '' &&
          simple.prompt.trim() === lastAnsweredPromptRef.current.trim();
        const keptPrompt =
          midRoundPromptSwap
            ? prev!.prompt
            : promptLocked && prev?.prompt
              ? prev.prompt
              : staleRoundPrompt
                ? prev?.prompt ?? ''
                : recentRound && (prev?.prompt?.trim() ?? '') !== '' && !simple.prompt
                  ? prev?.prompt ?? simple.prompt
                  : simple.prompt;
        const mergedRoundId = data.roundId ?? simple.roundId ?? prev?.roundId ?? null;
        if (mergedRoundId) roundIdRef.current = mergedRoundId;
        const merged = {
          ...simple,
          prompt: keptPrompt,
          yourAnswer,
          theirAnswer,
          theirPoints: simple.theirPoints,
          yourPoints: simple.yourPoints,
          roundId: mergedRoundId,
        };
        if (recentRound && fetchedZero && refHasPoints) {
          return { ...merged, yourPoints: lastKnownPointsRef.current.yourPoints, theirPoints: lastKnownPointsRef.current.theirPoints };
        }
        const refYou = Math.max(lastKnownPointsRef.current.yourPoints, simple.yourPoints);
        const refThem = Math.max(lastKnownPointsRef.current.theirPoints, simple.theirPoints);
        lastKnownPointsRef.current = { yourPoints: refYou, theirPoints: refThem };
        return { ...merged, yourPoints: refYou, theirPoints: refThem };
      });
      const recentRound = Date.now() - lastRoundCompletedAtRef.current < 6000;
      const promptLocked = Date.now() < promptLockedUntilRef.current;
      const staleRoundPrompt =
        recentRound &&
        lastAnsweredPromptRef.current.trim() !== '' &&
        simple.prompt.trim() === lastAnsweredPromptRef.current.trim();
      const displayed = displayPromptRef.current.trim();
      const incoming = (simple.prompt || '').trim();
      const sameRound = (simple.roundId ?? null) === (roundIdRef.current ?? null);
      const blockedMidRoundSwap =
        displayed !== '' &&
        incoming !== '' &&
        incoming !== displayed &&
        sameRound &&
        !simple.bothAnswered &&
        promptLocked;
      if (
        !blockedMidRoundSwap &&
        !promptLocked &&
        !staleRoundPrompt &&
        (Date.now() - lastRoundCompletedAtRef.current >= 6000 || simple.prompt)
      ) {
        setPrompt(simple.prompt || '');
      } else if (blockedMidRoundSwap && displayed) {
        setPrompt(displayed);
      }
      addBreadcrumb('NHIE', 'Fetch state received', { fetchedYou: simple.yourPoints, fetchedThem: simple.theirPoints });
      debugLog('NHIE', 'Fetch state full', { yourPoints: data.yourPoints, theirPoints: data.theirPoints, bothAnswered: !!data.bothAnswered });
      if (__DEV__) {
        console.log('[NHIE] Fetch state result', {
          yourPoints: simple.yourPoints,
          theirPoints: simple.theirPoints,
          bothAnswered: !!data.bothAnswered,
          promptLen: (simple.prompt || '').length,
          yourAnswer: simple.yourAnswer,
          theirAnswer: simple.theirAnswer,
          roundId: simple.roundId,
        });
      }
    } catch (err) {
      console.warn('Never Have I Ever fetch error:', err);
    }
  }, [matchId]);

  const scheduleRoundRefetches = useCallback(() => {
    setTimeout(() => void fetchState(), 400);
    setTimeout(() => void fetchState(), 1000);
    setTimeout(() => void fetchState(), 2000);
    setTimeout(() => void fetchState(), 3500);
  }, [fetchState]);

  useEffect(() => {
    if (openForAccept) {
      setModalVisible(true);
    setLoading(true);
    fetchState().finally(() => setLoading(false));
    pollRef.current = setInterval(() => void fetchState(), 2000);
    onOpenedForAccept?.();
    }
  }, [openForAccept]);

  const handleOpen = () => {
    if (!nhieEligible) {
      setMessageGateModalVisible(true);
      return;
    }
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(50);
    }
    setModalVisible(true);
    setLoading(true);
    fetchState().finally(() => setLoading(false));

    // Poll every 2s while modal is open so we see other player's points and new prompt quickly
    pollRef.current = setInterval(() => void fetchState(), 2000);
  };

  const handleClose = () => {
    stopGameChatTyping();
    setGameChatDraft('');
    setModalVisible(false);
    setState(null);
    setPrompt('');
    lastAnsweredPromptRef.current = '';
    promptLockedUntilRef.current = 0;
    roundIdRef.current = null;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (gameChatTypingTimeoutRef.current) {
        clearTimeout(gameChatTypingTimeoutRef.current);
        gameChatTypingTimeoutRef.current = null;
      }
      if (gameChatTypingActiveRef.current) {
        socket?.emit?.('stop_typing', { matchId });
        gameChatTypingActiveRef.current = false;
      }
    };
  }, [matchId, socket]);

  useEffect(() => {
    setGameChatDraft('');
  }, [matchId]);

  useEffect(() => {
    if (!modalVisible) return;
    setGameChatPanelOpen(!compactGameChat);
  }, [modalVisible, compactGameChat]);

  useEffect(() => {
    if (!showEmbeddedGameChat) return;
    scrollGameChatToEnd();
    const t1 = setTimeout(scrollGameChatToEnd, 60);
    const t2 = setTimeout(scrollGameChatToEnd, 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [showEmbeddedGameChat, sortedGameChat, scrollGameChatToEnd]);

  useEffect(() => {
    if (!modalVisible) return;
    const onUpdate = (payload: {
      matchId?: string;
      newPrompt?: string;
      roundComplete?: boolean;
      roundReset?: boolean;
      inactiveReset?: boolean;
      lobbyReset?: boolean;
      user1Strikes?: number;
      user2Strikes?: number;
    } = {}) => {
      if (__DEV__) {
        console.log('[NHIE] Socket never_have_i_ever_updated received', {
          matchId: payload?.matchId,
          hasNewPrompt: !!(payload?.newPrompt),
          roundComplete: payload?.roundComplete,
          user1Strikes: payload?.user1Strikes,
          user2Strikes: payload?.user2Strikes,
        });
      }
      const { addBreadcrumb } = require('../utils/debugLogger');
      addBreadcrumb('NHIE', 'Socket never_have_i_ever_updated', {
        hasNewPrompt: !!(payload?.newPrompt),
        roundComplete: payload?.roundComplete,
      });
      api.clearCache(`/matches/${matchId}/never-have-i-ever`);
      if (payload.lobbyReset) {
        setPrompt('');
        lastAnsweredPromptRef.current = '';
        promptLockedUntilRef.current = 0;
        roundIdRef.current = null;
        lastKnownPointsRef.current = { yourPoints: 0, theirPoints: 0 };
      }
      if (payload.roundComplete) {
        lastRoundCompletedAtRef.current = Date.now();
      }
      // Apply authoritative strike counts from server so "them" updates without refetch timing
      const u1 = payload.user1Strikes ?? null;
      const u2 = payload.user2Strikes ?? null;
      if (payload.inactiveReset || payload.roundReset || payload.lobbyReset) {
        lastKnownPointsRef.current = { yourPoints: 0, theirPoints: 0 };
      }
      if (u1 != null && u2 != null) {
        setState(prev => {
          if (!prev) return null;
          // Use ref first so we don't mis-map when state.isUser1 was lost (e.g. stale merge); default true only if never set
          const isUser1 = isUser1Ref.current ?? prev.isUser1 ?? true;
          const yourPts = isUser1 ? u1 : u2;
          const theirPts = isUser1 ? u2 : u1;
          const forceZero = payload.inactiveReset || payload.roundReset || payload.lobbyReset;
          lastKnownPointsRef.current = forceZero
            ? { yourPoints: yourPts, theirPoints: theirPts }
            : {
                yourPoints: Math.max(lastKnownPointsRef.current.yourPoints, yourPts),
                theirPoints: Math.max(lastKnownPointsRef.current.theirPoints, theirPts),
              };
          return {
            ...prev,
            yourPoints: lastKnownPointsRef.current.yourPoints,
            theirPoints: lastKnownPointsRef.current.theirPoints,
          };
        });
      }
      if (payload.roundComplete && payload.newPrompt?.trim()) {
        if (__DEV__) console.log('[NHIE] Applying new prompt from socket (round complete)');
        const nextRoundId = payload.roundId ?? null;
        if (nextRoundId) roundIdRef.current = nextRoundId;
        setPrompt(payload.newPrompt);
        promptLockedUntilRef.current = Date.now() + 5000;
        lastAnsweredPromptRef.current = '';
        setState(prev => prev ? {
          ...prev,
          prompt: payload.newPrompt!,
          roundId: nextRoundId,
          yourAnswer: null,
          theirAnswer: null,
          bothAnswered: false,
        } : null);
        return;
      }
      if (payload.roundComplete && !payload.newPrompt?.trim()) {
        scheduleRoundRefetches();
        return;
      }
      void fetchState();
      scheduleRoundRefetches();
    };
    socket?.on?.('never_have_i_ever_updated', onUpdate);
    return () => {
      socket?.off?.('never_have_i_ever_updated', onUpdate);
    };
  }, [modalVisible, socket, fetchState, scheduleRoundRefetches, matchId]);

  // When we've selected but the other hasn't, poll every 1.5s so we catch round-complete from GET (fallback if socket misses)
  useEffect(() => {
    if (!modalVisible || state?.bothAnswered || state?.yourAnswer == null) return;
    const id = setInterval(() => void fetchState(), 1500);
    waitingForOtherPollRef.current = id;
    const stop = setTimeout(() => {
      if (waitingForOtherPollRef.current === id) {
        clearInterval(waitingForOtherPollRef.current);
        waitingForOtherPollRef.current = null;
      }
    }, 20000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
      if (waitingForOtherPollRef.current === id) waitingForOtherPollRef.current = null;
    };
  }, [modalVisible, state?.yourAnswer, state?.bothAnswered, fetchState]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (waitingForOtherPollRef.current) clearInterval(waitingForOtherPollRef.current);
    };
  }, []);

  const handleSetSpiceChoice = async (choice: 'pg13' | 'ratedr' | 'spicy') => {
    setSubmitting(true);
    try {
      const data = await api.post<any>(`/matches/${matchId}/never-have-i-ever/spice-choice`, { choice });
      // Use agreed level only when it matches the choice we just made (so UI doesn't revert to previous level)
      const displayLevel = (data.spiceReady && data.spiceLevel != null && data.spiceLevel === choice)
        ? data.spiceLevel
        : (data.yourSpiceChoice ?? choice);
      if (data.isUser1 !== undefined) isUser1Ref.current = !!data.isUser1;
      const next: GameState = {
        prompt: data.prompt || '',
        phase: data.spiceReady && (data.prompt || data.spiceLevel || data.yourSpiceChoice || data.theirSpiceChoice) ? 'playing' : 'lobby',
        yourSpiceChoice: data.yourSpiceChoice ?? choice,
        theirSpiceChoice: data.theirSpiceChoice ?? null,
        spiceReady: !!data.spiceReady,
        spiceLevel: displayLevel,
        yourPoints: typeof data.yourPoints === 'number' ? data.yourPoints : (data.yourStrikes ?? 0),
        theirPoints: typeof data.theirPoints === 'number' ? data.theirPoints : (data.theirStrikes ?? 0),
        yourAnswer: data.yourAnswer ?? null,
        theirAnswer: data.theirAnswer ?? null,
        bothAnswered: !!data.bothAnswered,
        gameOver: !!data.gameOver,
        winner: data.winner ?? null,
        isUser1: data.isUser1 ?? state?.isUser1,
        roundId: data.roundId ?? state?.roundId ?? null,
      };
      setState(prev => ({ ...next, isUser1: next.isUser1 ?? prev?.isUser1 }));
      if (next.prompt?.trim()) {
        promptLockedUntilRef.current = Date.now() + 8000;
        setPrompt(next.prompt);
      }
      if (next.roundId) roundIdRef.current = next.roundId;
    } catch (err) {
      console.warn('Never Have I Ever spice choice error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const applyLobbyStateFromApi = (data: any) => {
    if (data.isUser1 !== undefined) isUser1Ref.current = !!data.isUser1;
    const next: GameState = {
      prompt: '',
      phase: 'lobby',
      yourSpiceChoice: data.yourSpiceChoice ?? null,
      theirSpiceChoice: data.theirSpiceChoice ?? null,
      spiceReady: false,
      spiceLevel: null,
      yourPoints: 0,
      theirPoints: 0,
      yourAnswer: null,
      theirAnswer: null,
      bothAnswered: false,
      gameOver: false,
      winner: null,
      isUser1: data.isUser1 ?? state?.isUser1,
      roundId: null,
    };
    setState(next);
    setPrompt('');
    lastAnsweredPromptRef.current = '';
    promptLockedUntilRef.current = 0;
    roundIdRef.current = null;
    lastKnownPointsRef.current = { yourPoints: 0, theirPoints: 0 };
  };

  const handleReturnToLobby = () => {
    Alert.alert(
      'Change mode?',
      'This returns both of you to the lobby to pick PG-13, Rated R, or Spicy again. Scores and the current round reset.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Return to lobby',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              const data = await api.post<any>(`/matches/${matchId}/never-have-i-ever/return-to-lobby`, {});
              applyLobbyStateFromApi(data);
              api.clearCache(`/matches/${matchId}/never-have-i-ever`);
            } catch (err: any) {
              Alert.alert('Could not return to lobby', err?.message || 'Please try again.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleQuitGame = () => {
    Alert.alert(
      'Quit Never Have I Ever?',
      'You can reopen the game anytime from the chat header. Your match can keep playing until they leave too.',
      [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'Quit', style: 'default', onPress: () => handleClose() },
      ]
    );
  };

  const handleRestart = async () => {
    setSubmitting(true);
    try {
      const data = await api.post<any>(`/matches/${matchId}/never-have-i-ever/restart`, {});
      setState(prev => prev ? {
        ...prev,
        yourPoints: 0,
        theirPoints: 0,
        yourAnswer: null,
        theirAnswer: null,
        bothAnswered: false,
        gameOver: false,
        winner: null,
        prompt: data.prompt || prev.prompt,
        roundId: data.roundId ?? null,
      } : null);
      setPrompt(data.prompt || '');
      await fetchState();
    } catch (err) {
      console.warn('Never Have I Ever restart error:', err);
      fetchState();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAnswer = async (answer: 'have' | 'havent') => {
    if (submitting || state?.yourAnswer != null) return;
    setSubmitting(true);
    lastAnsweredPromptRef.current = displayPrompt;
    try {
      const { addBreadcrumb, debugLog } = await import('../utils/debugLogger');
      addBreadcrumb('NHIE', 'Submitting answer', { matchId, answer, prevYour: state?.yourPoints, prevTheir: state?.theirPoints });

      // Optimistic update: show +1 point immediately when user taps "I have" so UI never sticks at 0
      if (answer === 'have' && state) {
        const nextYour = (state.yourPoints ?? 0) + 1;
        lastKnownPointsRef.current = {
          yourPoints: Math.max(lastKnownPointsRef.current.yourPoints, nextYour),
          theirPoints: lastKnownPointsRef.current.theirPoints,
        };
        setState(prev => prev ? { ...prev, yourPoints: nextYour, yourAnswer: 'have' } : null);
      } else if (answer === 'havent' && state) {
        setState(prev => prev ? { ...prev, yourAnswer: 'havent' } : null);
      }

      const submitRoundId = roundIdRef.current ?? state?.roundId ?? null;
      if (__DEV__) {
        console.log('[NHIE] Submitting answer', { answer, roundId: submitRoundId });
      }
      let data = await api.post<any>(`/matches/${matchId}/never-have-i-ever/answer`, {
        answer,
        roundId: submitRoundId,
      });
      if (data.isUser1 !== undefined) isUser1Ref.current = !!data.isUser1;
      let responseRoundId = data.roundId ?? null;
      if (responseRoundId) roundIdRef.current = responseRoundId;
      let roundComplete = !!data.bothAnswered || !!data.roundJustCompleted;
      if (
        !roundComplete &&
        submitRoundId &&
        responseRoundId &&
        submitRoundId !== responseRoundId
      ) {
        if (__DEV__) {
          console.warn('[NHIE] Stale roundId on answer — syncing and retrying', { submitRoundId, responseRoundId });
        }
        api.clearCache(`/matches/${matchId}/never-have-i-ever`);
        const fresh = await api.get<any>(`/matches/${matchId}/never-have-i-ever`, false);
        const activeRoundId = fresh.roundId ?? responseRoundId;
        if (activeRoundId) roundIdRef.current = activeRoundId;
        if (fresh.yourAnswer == null) {
          data = await api.post<any>(`/matches/${matchId}/never-have-i-ever/answer`, {
            answer,
            roundId: activeRoundId,
          });
          if (data.isUser1 !== undefined) isUser1Ref.current = !!data.isUser1;
          responseRoundId = data.roundId ?? activeRoundId;
          if (responseRoundId) roundIdRef.current = responseRoundId;
          roundComplete = !!data.bothAnswered || !!data.roundJustCompleted;
        } else {
          await fetchState();
          return;
        }
      }
      const fromRound = data.pointsFromRound as { newYourStrikes?: number; newTheirStrikes?: number } | undefined;
      const serverYourPts = Math.max(
        0,
        Number(fromRound?.newYourStrikes ?? data.yourPoints ?? data.yourStrikes ?? 0)
      );
      const serverTheirPts = Math.max(
        0,
        Number(fromRound?.newTheirStrikes ?? data.theirPoints ?? data.theirStrikes ?? 0)
      );
      addBreadcrumb('NHIE', 'Answer response', { serverYourPts, serverTheirPts, roundComplete, bothAnswered: !!data.bothAnswered });
      debugLog('NHIE', 'Answer response full', { yourPoints: data.yourPoints, theirPoints: data.theirPoints, pointsFromRound: data.pointsFromRound, stateYourStrikes: data.yourStrikes, stateTheirStrikes: data.theirStrikes });

      // Server is source of truth; never drop below server or our ref (handles stale GET / timing)
      lastKnownPointsRef.current = {
        yourPoints: Math.max(lastKnownPointsRef.current.yourPoints, serverYourPts),
        theirPoints: Math.max(lastKnownPointsRef.current.theirPoints, serverTheirPts),
      };

      const nextPromptValue = data.newPrompt ?? data.prompt ?? state?.prompt ?? '';
      const nextRoundId = data.roundId ?? roundIdRef.current ?? state?.roundId ?? null;
      if (nextRoundId) roundIdRef.current = nextRoundId;
      // When round completes, clear the old prompt immediately so it disappears; then show new prompt when we have it
      setState(prev => {
        if (!prev) return null;
        const yourPts = Math.max(prev.yourPoints, serverYourPts, lastKnownPointsRef.current.yourPoints);
        const theirPts = Math.max(prev.theirPoints, serverTheirPts, lastKnownPointsRef.current.theirPoints);
        const newPrompt = roundComplete ? (nextPromptValue || '') : (nextPromptValue || prev.prompt);
        return {
          ...prev,
          yourAnswer: roundComplete ? null : (data.yourAnswer ?? answer),
          theirAnswer: roundComplete ? null : (data.theirAnswer ?? prev.theirAnswer),
          bothAnswered: roundComplete ? false : !!data.bothAnswered,
          yourPoints: yourPts,
          theirPoints: theirPts,
          prompt: newPrompt,
          gameOver: !!data.gameOver,
          winner: data.winner ?? null,
          roundId: nextRoundId,
        };
      });
      if (roundComplete) {
        setPrompt(nextPromptValue || '');
        lastAnsweredPromptRef.current = '';
      } else if (nextPromptValue && roundComplete) {
        setPrompt(nextPromptValue);
      }

      if (roundComplete) {
        lastRoundCompletedAtRef.current = Date.now();
        api.clearCache(`/matches/${matchId}/never-have-i-ever`);
        if (nextPromptValue.trim()) {
          promptLockedUntilRef.current = Date.now() + 5000;
        }
        scheduleRoundRefetches();
      }
    } catch (err) {
      console.warn('Never Have I Ever answer error:', err);
      fetchState();
    } finally {
      setSubmitting(false);
    }
  };

  const monkeyRotateInterp = emojiRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-8deg', '8deg'],
  });

  const handleLockedPress = async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(30);
    }
    if (!nhieEligible) {
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
      setUnlockPlayModalVisible(true);
    } else {
      Alert.alert('🙊 Never Have I Ever', 'Never Have I Ever is not available for this match.', [{ text: 'Got it', style: 'default' }]);
    }
  };

  const handleMonkeyPress = () => {
    if (!nhieEligible) {
      setMessageGateModalVisible(true);
      return;
    }
    if (isUnlocked) {
      handleOpen();
      return;
    }
    void handleLockedPress();
  };

  const headerButton = (
    <ChatHeaderIconGlow tint="amber">
      <TouchableOpacity
        onPress={handleMonkeyPress}
        activeOpacity={0.8}
        style={[
          styles.headerIconButton,
          (!nhieEligible || !isUnlocked) && styles.headerIconButtonLocked,
        ]}
        accessibilityLabel="Never Have I Ever"
      >
        <Text style={styles.headerIconEmoji}>🙊</Text>
      </TouchableOpacity>
    </ChatHeaderIconGlow>
  );

  // Modal is shared - needed for headerMode when User B accepts (openForAccept)
  const gameModal = (
    <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 28 : 28}
          style={styles.modalKb}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalContent}>
          <LinearGradient colors={['#00b894', '#00cec9', '#00a896', '#55efc4', '#00cec9']} locations={[0, 0.2, 0.5, 0.8, 1]} style={styles.modalGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <LinearGradient colors={['rgba(255,255,255,0.25)', 'transparent', 'transparent']} locations={[0, 0.35, 1]} style={styles.modalGloss} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />
            <View style={styles.modalHeaderBar} />
            <Text style={styles.modalTitle}>🙊 Never Have I Ever</Text>
            {loading ? (
              <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#fff" /><Text style={styles.loadingText}>Loading...</Text></View>
            ) : state?.phase === 'lobby' ? (
              <View style={styles.lobbyContainer}>
                <Text style={styles.lobbyTitle}>Pick your version (no waiting—they pick theirs too)</Text>
                <Text style={styles.versionLabel}>Your choice</Text>
                <View style={styles.spiceRow}>
                  <TouchableOpacity onPress={() => handleSetSpiceChoice('pg13')} style={[styles.spicePill, state.yourSpiceChoice === 'pg13' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, state.yourSpiceChoice === 'pg13' && styles.spicePillTextActive]}>PG-13</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleSetSpiceChoice('ratedr')} style={[styles.spicePill, state.yourSpiceChoice === 'ratedr' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, state.yourSpiceChoice === 'ratedr' && styles.spicePillTextActive]}>Rated R</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleSetSpiceChoice('spicy')} style={[styles.spicePill, state.yourSpiceChoice === 'spicy' && styles.spicePillActive]} disabled={submitting} activeOpacity={0.8}><Text style={[styles.spicePillText, state.yourSpiceChoice === 'spicy' && styles.spicePillTextActive]}>Spicy</Text></TouchableOpacity>
                </View>
                <Text style={styles.lobbyHint}>
                  {state.theirSpiceChoice ? `They chose: ${state.theirSpiceChoice === 'ratedr' ? 'Rated R' : state.theirSpiceChoice === 'pg13' ? 'PG-13' : 'Spicy'}` : 'Waiting for them to choose…'}
                </Text>
              </View>
            ) : state?.phase === 'playing' && state.spiceLevel ? (
              <>
                {state.gameOver ? (
                  <View style={styles.gameOverContainer}>
                    <Text style={styles.gameOverTitle}>{state.winner === 'you' ? "You won" : "You're pretty freaky"}</Text>
                    <Text style={styles.gameOverSubtitle}>First to 10 points loses. You: {state.yourPoints} — Them: {state.theirPoints}</Text>
                    <TouchableOpacity onPress={handleRestart} style={styles.restartButton} disabled={submitting} activeOpacity={0.8}>
                      <LinearGradient colors={['#00b894', '#00cec9']} style={styles.restartGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <Text style={styles.restartButtonText}>Play again</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleReturnToLobby}
                      style={styles.gameOverSecondaryAction}
                      disabled={submitting}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.gameOverSecondaryActionText}>Change mode (lobby)</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={styles.firstToLoseHint}>First to 10 points loses</Text>
                    <View style={styles.tallyRow}>
                      <View style={styles.tallyBox}>
                        <Text style={styles.tallyLabel}>You</Text>
                        <Text style={styles.tallyValue}>{Math.max(state.yourPoints ?? 0, lastKnownPointsRef.current.yourPoints)}</Text>
                      </View>
                      <Text style={styles.tallyVs}>vs</Text>
                      <View style={styles.tallyBox}>
                        <Text style={styles.tallyLabel}>Them</Text>
                        <Text style={styles.tallyValue}>{Math.max(state.theirPoints ?? 0, lastKnownPointsRef.current.theirPoints)}</Text>
                      </View>
                    </View>
                    <Text style={styles.versionLabel}>Playing at: {state.spiceLevel === 'ratedr' ? 'R' : state.spiceLevel === 'pg13' ? 'PG-13' : 'Spicy'}</Text>
                    <View style={styles.gameMenuRow}>
                      <TouchableOpacity
                        onPress={handleReturnToLobby}
                        style={styles.gameMenuButton}
                        disabled={submitting}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Return to lobby to change PG-13, Rated R, or Spicy mode"
                      >
                        <Text style={styles.gameMenuButtonText}>Change mode</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleQuitGame}
                        style={[styles.gameMenuButton, styles.gameMenuButtonSecondary]}
                        disabled={submitting}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Quit Never Have I Ever"
                      >
                        <Text style={styles.gameMenuButtonText}>Quit</Text>
                      </TouchableOpacity>
                    </View>
                    {submitting && !displayPrompt ? (
                      <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#fff" /><Text style={styles.loadingText}>Getting prompt...</Text></View>
                    ) : (
                      <>
                        <View style={styles.promptCard}><Text style={styles.promptText}>{displayPrompt || 'Never have I ever...'}</Text></View>
                        {state.bothAnswered && state.theirAnswer != null ? (
                          <View style={styles.roundResultWrap}>
                            <Text style={styles.roundResultText}>They said: {state.theirAnswer === 'have' ? 'I have' : "I haven't"}</Text>
                          </View>
                        ) : null}
                        <View style={styles.answerRow}>
                          <TouchableOpacity
                            onPress={() => handleSubmitAnswer('have')}
                            style={[styles.answerButton, state.yourAnswer === 'have' && styles.answerButtonActive]}
                            disabled={submitting || state.yourAnswer != null}
                            activeOpacity={0.8}
                          >
                            <LinearGradient colors={['#e74c3c', '#c0392b']} style={styles.answerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}><Text style={styles.answerButtonText}>I have</Text></LinearGradient>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleSubmitAnswer('havent')}
                            style={[styles.answerButton, state.yourAnswer === 'havent' && styles.answerButtonActive]}
                            disabled={submitting || state.yourAnswer != null}
                            activeOpacity={0.8}
                          >
                            <LinearGradient colors={['#27ae60', '#2ecc71']} style={styles.answerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}><Text style={styles.answerButtonText}>I haven't</Text></LinearGradient>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </>
                )}
              </>
            ) : null}
            {showEmbeddedGameChat ? (
              <KeyboardAvoidingView
                behavior="padding"
                keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 40 : 40}
                style={[
                  styles.gameChat,
                  compactGameChat && gameChatPanelOpen ? styles.gameChatSheet : null,
                ]}
              >
                {compactGameChat && gameChatPanelOpen ? (
                  <View style={styles.gameChatToolbar}>
                    <Text style={styles.gameChatToolbarTitle}>In-game chat</Text>
                    <TouchableOpacity
                      onPress={() => setGameChatPanelOpen(false)}
                      style={styles.gameChatToolbarHide}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel="Hide in-game chat and keep playing"
                    >
                      <Text style={styles.gameChatToolbarHideText}>Hide</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {!(compactGameChat && gameChatPanelOpen) ? (
                  <Text style={styles.gameChatLabel}>In-game chat</Text>
                ) : null}
                {!(compactGameChat && gameChatPanelOpen) ? (
                  <Text style={styles.gameChatHint}>
                    Message while you play — same thread as your match chat. Each bubble shows who sent it.
                  </Text>
                ) : null}
                {partnerIsTyping ? (
                  <Text style={styles.gameChatTyping}>{partnerDisplayName} is typing…</Text>
                ) : null}
                <ScrollView
                  ref={gameChatScrollRef}
                  style={[styles.gameChatScroll, { maxHeight: gameChatScrollMaxHeight }]}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {sortedGameChat.length === 0 ? (
                    <Text style={styles.gameChatEmpty}>No messages yet — say something without leaving the game.</Text>
                  ) : (
                    sortedGameChat.map((m, idx) => {
                      const mine = m.senderId === currentUserId;
                      const body = bubbleBody(m);
                      const prev = idx > 0 ? sortedGameChat[idx - 1] : null;
                      const senderFlip = prev != null && prev.senderId !== m.senderId;
                      const senderLabel = mine ? 'You' : m.senderName || partnerDisplayName || 'Match';
                      return (
                        <View
                          key={m.id}
                          style={[
                            styles.gameChatRow,
                            mine ? styles.gameChatRowMine : styles.gameChatRowTheirs,
                            senderFlip ? styles.gameChatRowSenderGap : null,
                          ]}
                        >
                          <View style={[styles.gameChatBubble, mine ? styles.gameChatBubbleMine : styles.gameChatBubbleTheirs]}>
                            <Text style={[styles.gameChatWho, mine ? styles.gameChatWhoMine : styles.gameChatWhoTheirs]}>
                              {senderLabel}
                            </Text>
                            <Text style={[styles.gameChatBody, mine ? styles.gameChatBodyMine : styles.gameChatBodyTheirs]}>{body}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
                <View style={styles.gameChatComposer}>
                  <TextInput
                    style={styles.gameChatInput}
                    placeholder="Type a message…"
                    placeholderTextColor="rgba(15,23,42,0.45)"
                    value={gameChatDraft}
                    onChangeText={(v) => {
                      setGameChatDraft(v);
                      pulseGameChatTypingFromValue(v);
                    }}
                    onFocus={() => {
                      setTimeout(scrollGameChatToEnd, 80);
                      setTimeout(scrollGameChatToEnd, 280);
                    }}
                    multiline
                    maxLength={1000}
                    editable={!gameChatSending && !sendingMessage}
                  />
                  <TouchableOpacity
                    style={[
                      styles.gameChatSend,
                      (!gameChatDraft.trim() || gameChatSending || sendingMessage) && styles.gameChatSendDisabled,
                    ]}
                    disabled={gameChatSending || sendingMessage || !gameChatDraft.trim()}
                    onPress={() => void sendGameChatMessage()}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.gameChatSendText}>Send</Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            ) : null}
            {state?.phase === 'lobby' ? (
              <TouchableOpacity
                onPress={handleQuitGame}
                style={styles.lobbyQuitLink}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Quit Never Have I Ever"
              >
                <Text style={styles.lobbyQuitLinkText}>Quit game</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={handleClose} style={styles.closeButton} activeOpacity={0.8}><View style={styles.closeButtonInner}><Text style={styles.closeButtonText}>Close</Text></View></TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>
        </KeyboardAvoidingView>
        {showGameChatFab ? (
          <TouchableOpacity
            style={styles.nhieGameChatFab}
            activeOpacity={0.88}
            onPress={() => {
              setGameChatPanelOpen(true);
              setTimeout(scrollGameChatToEnd, 60);
              setTimeout(scrollGameChatToEnd, 200);
            }}
            accessibilityRole="button"
            accessibilityLabel="Open in-game chat to message your match while playing Never Have I Ever"
          >
            <Text style={styles.nhieGameChatFabEmoji}>💬</Text>
            <Text style={styles.nhieGameChatFabCaption}>GAME CHAT</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    </Modal>
  );

  if (headerMode) {
    return (
      <>
        {headerButton}
        {gameModal}
        {messageGateModal}
        {unlockPlayModal}
      </>
    );
  }

  if (!isUnlocked) {
    return (
      <>
        <View style={[styles.container, compact && styles.containerCompact, square && styles.containerSquare]}>
          <TouchableOpacity
            onPress={handleLockedPress}
            activeOpacity={0.7}
            style={[styles.lockedCard, square && styles.lockedCardSquare]}
          >
            <View style={styles.lockedEmojiWrap}>
              <Animated.Text style={[styles.lockedEmoji, { transform: [{ scale: emojiScale }, { rotate: monkeyRotateInterp }] }]}>🙊</Animated.Text>
            </View>
            <View style={styles.lockedTextWrap}>
              <Text style={styles.lockedText}>Never Have I Ever</Text>
              <Text style={styles.lockedSubtext}>Tap to see how to unlock</Text>
            </View>
          </TouchableOpacity>
        </View>
        {messageGateModal}
        {unlockPlayModal}
      </>
    );
  }

  return (
    <>
      <View style={[styles.container, compact && styles.containerCompact, square && styles.containerSquare]}>
        <Animated.View style={[styles.buttonWrapper, square && styles.buttonSquare, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.buttonGlowLayer} />
          <TouchableOpacity onPress={handleMonkeyPress} activeOpacity={0.9} style={[styles.button, square && styles.buttonSquare]}>
            <LinearGradient
              colors={['#00b894', '#00cec9', '#55efc4', '#81ecec', '#00cec9']}
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
                  <Animated.Text style={[styles.buttonEmoji, square && styles.buttonEmojiSquare, { transform: [{ scale: emojiScale }, { rotate: monkeyRotateInterp }] }]}>🙊</Animated.Text>
                </View>
                <Text style={[styles.buttonText, square && styles.buttonTextSquare]}>NEVER HAVE I EVER</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {gameModal}
      {messageGateModal}
      {unlockPlayModal}
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
    backgroundColor: 'rgba(0, 206, 201, 0.18)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 184, 148, 0.5)',
    minWidth: 140,
    shadowColor: '#00cec9',
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
    backgroundColor: 'rgba(0, 206, 201, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 184, 148, 0.45)',
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
    shadowColor: '#00cec9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.75,
    shadowRadius: 24,
    elevation: 14,
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'flex-start',
    shadowColor: '#00cec9',
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
    fontSize: 13,
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
  lobbyContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  lobbyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  spiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
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
    color: '#00b894',
    fontWeight: '800',
  },
  firstToLoseHint: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
  },
  tallyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    gap: 16,
  },
  tallyBox: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 72,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  tallyLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  tallyValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  tallyVs: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
  },
  roundResultWrap: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
  },
  versionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
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
  sendButton: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#00b894',
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
  answerButtonActive: {
    opacity: 1,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  lobbyHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 16,
    textAlign: 'center',
  },
  startButton: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#00c853',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  startGradient: {
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    position: 'relative',
  },
  modalKb: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'stretch',
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#00cec9',
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
    position: 'relative',
    alignItems: 'center',
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
    textAlign: 'center',
    marginBottom: 20,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
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
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  scoreBox: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 84,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  scoreLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  strikesText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  strikesWarning: {
    color: '#ff6b6b',
  },
  strikesSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
  },
  scoreVs: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
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
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  answerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  answerButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  answerGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  answerButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  waitingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  waitingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '500',
  },
  resultsContainer: {
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  resultLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  resultValue: {
    fontSize: 14,
    color: '#2ecc71',
    fontWeight: '700',
  },
  strikeText: {
    color: '#ff6b6b',
  },
  roundResultText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  nextButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 16,
  },
  nextGradient: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  gameOverContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  gameOverTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  gameOverSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 12,
  },
  scoreText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    marginBottom: 20,
  },
  restartButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  restartGradient: {
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  restartButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  gameOverSecondaryAction: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  gameOverSecondaryActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  closeButton: {
    alignSelf: 'center',
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 20,
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
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '700',
  },
  gameMenuRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  gameMenuButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
  },
  gameMenuButtonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  gameMenuButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.96)',
    letterSpacing: 0.2,
  },
  lobbyQuitLink: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  lobbyQuitLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
    textDecorationLine: 'underline',
  },
  gameChat: {
    alignSelf: 'stretch',
    marginTop: 10,
    marginBottom: 4,
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  gameChatLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
    textAlign: 'center',
  },
  gameChatHint: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  gameChatTyping: {
    fontSize: 12,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.92)',
    marginBottom: 6,
  },
  gameChatScroll: {
    maxHeight: 140,
    marginBottom: 8,
  },
  gameChatEmpty: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    paddingVertical: 10,
    lineHeight: 18,
  },
  gameChatRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 3,
  },
  gameChatRowSenderGap: {
    marginTop: 8,
  },
  gameChatRowMine: {
    justifyContent: 'flex-end',
  },
  gameChatRowTheirs: {
    justifyContent: 'flex-start',
  },
  gameChatBubble: {
    maxWidth: '88%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
  },
  gameChatBubbleMine: {
    backgroundColor: 'rgba(224,255,248,0.98)',
    borderBottomRightRadius: 4,
  },
  gameChatBubbleTheirs: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderBottomLeftRadius: 4,
  },
  gameChatWho: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  gameChatWhoMine: {
    textAlign: 'right',
    color: 'rgba(6,59,54,0.72)',
  },
  gameChatWhoTheirs: {
    textAlign: 'left',
    color: 'rgba(255,255,255,0.88)',
  },
  gameChatBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  gameChatBodyMine: {
    color: '#063b36',
  },
  gameChatBodyTheirs: {
    color: 'rgba(255,255,255,0.98)',
  },
  gameChatComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  gameChatInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  gameChatSend: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  gameChatSendDisabled: {
    opacity: 0.5,
  },
  gameChatSendText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#063b36',
  },
  gameChatSheet: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  gameChatToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  gameChatToolbarTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.98)',
    letterSpacing: 0.3,
  },
  gameChatToolbarHide: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  gameChatToolbarHideText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.95)',
  },
  nhieGameChatFab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    zIndex: 40,
    minWidth: 88,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(0,206,201,0.45)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 14,
  },
  nhieGameChatFabEmoji: {
    fontSize: 20,
    lineHeight: 22,
  },
  nhieGameChatFabCaption: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: '#063b36',
  },
});
