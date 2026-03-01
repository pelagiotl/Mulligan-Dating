/**
 * Never Have I Ever - Tally mode: no chat. Both answer each prompt; points = "I have" count.
 * Prompt only changes after BOTH users have selected "I have" or "I haven't"; then points are added (only for "I have") and a new prompt is auto-generated. No "Another one" button.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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

interface Message {
  id: string;
  senderId: string;
  content: string;
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
}

interface NeverHaveIEverProps {
  matchId: string;
  messages?: Message[];
  currentUserId: string;
  socket: any;
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
  currentUserId,
  socket,
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
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prompt, setPrompt] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRoundCompletedAtRef = useRef<number>(0);
  const lastKnownPointsRef = useRef<{ yourPoints: number; theirPoints: number }>({ yourPoints: 0, theirPoints: 0 });
  const modalVisibleRef = useRef(false);
  modalVisibleRef.current = modalVisible;

  const isUnlocked = gameUnlockedByToken;
  const displayPrompt = prompt || state?.prompt || '';

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const emojiScale = useRef(new Animated.Value(1)).current;
  const emojiRotate = useRef(new Animated.Value(0)).current;
  const headerPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!headerMode) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(headerPulseAnim, {
          toValue: 1.08,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(headerPulseAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => { pulse.stop(); headerPulseAnim.setValue(1); };
  }, [headerMode]);

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

  const fetchState = useCallback(async (skipIfRecentRound = false) => {
    if (skipIfRecentRound && Date.now() - lastRoundCompletedAtRef.current < 6000) {
      return;
    }
    try {
      const { addBreadcrumb, debugLog } = await import('../utils/debugLogger');
      addBreadcrumb('NHIE', 'Fetching state', { matchId, skipIfRecentRound });
      // Never use cache so points/prompt don't revert after both answer
      const data = await api.get<any>(`/matches/${matchId}/never-have-i-ever`, false);
      const fetchedYou = Math.max(0, Number(data.yourPoints ?? data.yourStrikes ?? 0));
      const fetchedThem = Math.max(0, Number(data.theirPoints ?? data.theirStrikes ?? 0));
      const simple: GameState = {
        prompt: data.prompt || '',
        phase: data.spiceReady && (data.prompt || data.spiceLevel) ? 'playing' : 'lobby',
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
      };
      setState(prev => {
        const recentRound = Date.now() - lastRoundCompletedAtRef.current < 6000;
        const fetchedZero = simple.yourPoints === 0 && simple.theirPoints === 0;
        const refHasPoints = lastKnownPointsRef.current.yourPoints > 0 || lastKnownPointsRef.current.theirPoints > 0;
        // Don't overwrite yourAnswer with null from a stale GET — once user has answered this prompt, keep it until round completes (bothAnswered = server cleared for next round)
        const keptYourAnswer = simple.bothAnswered ? (simple.yourAnswer ?? null) : (simple.yourAnswer ?? prev?.yourAnswer ?? null);
        const merged = { ...simple, yourAnswer: keptYourAnswer, theirPoints: simple.theirPoints, yourPoints: simple.yourPoints };
        if (recentRound && fetchedZero && refHasPoints) {
          return { ...merged, yourPoints: lastKnownPointsRef.current.yourPoints, theirPoints: lastKnownPointsRef.current.theirPoints };
        }
        // Never decrease points ref (stale GET can return 0 right after round complete)
        const refYou = Math.max(lastKnownPointsRef.current.yourPoints, simple.yourPoints);
        const refThem = Math.max(lastKnownPointsRef.current.theirPoints, simple.theirPoints);
        lastKnownPointsRef.current = { yourPoints: refYou, theirPoints: refThem };
        return { ...merged, yourPoints: refYou, theirPoints: refThem };
      });
      setPrompt(simple.prompt || '');
      addBreadcrumb('NHIE', 'Fetch state received', { fetchedYou: simple.yourPoints, fetchedThem: simple.theirPoints });
      debugLog('NHIE', 'Fetch state full', { yourPoints: data.yourPoints, theirPoints: data.theirPoints, bothAnswered: !!data.bothAnswered });
      if (__DEV__) {
        console.log('[NHIE] Fetch state result', {
          yourPoints: simple.yourPoints,
          theirPoints: simple.theirPoints,
          bothAnswered: !!data.bothAnswered,
          promptLen: (simple.prompt || '').length,
        });
      }
    } catch (err) {
      console.warn('Never Have I Ever fetch error:', err);
    }
  }, [matchId]);

  useEffect(() => {
    if (openForAccept) {
      setModalVisible(true);
    setLoading(true);
    fetchState().finally(() => setLoading(false));
    pollRef.current = setInterval(() => fetchState(true), 2000);
    onOpenedForAccept?.();
    }
  }, [openForAccept]);

  const handleOpen = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(50);
    }
    setModalVisible(true);
    setLoading(true);
    fetchState().finally(() => setLoading(false));

    // Poll every 2s while modal is open so we see other player's points and new prompt quickly
    pollRef.current = setInterval(() => fetchState(true), 2000);
  };

  const handleClose = () => {
    setModalVisible(false);
    setState(null);
    setPrompt('');
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    if (!modalVisible) return;
    const onUpdate = (payload: { matchId?: string; newPrompt?: string; roundComplete?: boolean } = {}) => {
      if (__DEV__) {
        console.log('[NHIE] Socket never_have_i_ever_updated received', {
          matchId: payload?.matchId,
          hasNewPrompt: !!(payload?.newPrompt),
          roundComplete: payload?.roundComplete,
        });
      }
      const { addBreadcrumb } = require('../utils/debugLogger');
      addBreadcrumb('NHIE', 'Socket never_have_i_ever_updated', {
        hasNewPrompt: !!(payload?.newPrompt),
        roundComplete: payload?.roundComplete,
      });
      api.clearCache(`/matches/${matchId}/never-have-i-ever`);
      if (payload.roundComplete) {
        lastRoundCompletedAtRef.current = Date.now();
        // So the 2s poll skips for 6s and doesn't overwrite new prompt with a stale GET
      }
      // If round just completed, other user sent us the new prompt — show it immediately so next round appears
      if (payload.newPrompt && payload.roundComplete) {
        if (__DEV__) console.log('[NHIE] Applying new prompt from socket (round complete)');
        setPrompt(payload.newPrompt);
        setState(prev => prev ? {
          ...prev,
          prompt: payload.newPrompt!,
          yourAnswer: null,
          theirAnswer: null,
          bothAnswered: false,
        } : null);
      }
      // Immediate refetch so "Them" points update right away when the other user submits
      fetchState(false);
      // Staggered refetches so we get new prompt from server if socket payload lacked it, and updated points
      setTimeout(() => fetchState(false), 400);
      setTimeout(() => fetchState(false), 1000);
      setTimeout(() => fetchState(false), 2000);
    };
    socket?.on?.('never_have_i_ever_updated', onUpdate);
    return () => {
      socket?.off?.('never_have_i_ever_updated', onUpdate);
    };
  }, [modalVisible, socket, fetchState]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
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
      const next: GameState = {
        prompt: data.prompt || '',
        phase: data.spiceReady && (data.prompt || data.spiceLevel) ? 'playing' : 'lobby',
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
      };
      setState(next);
      if (next.prompt) setPrompt(next.prompt);
    } catch (err) {
      console.warn('Never Have I Ever spice choice error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestart = async () => {
    setSubmitting(true);
    try {
      const data = await api.post<any>(`/matches/${matchId}/never-have-i-ever/restart`);
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

      const data = await api.post<any>(`/matches/${matchId}/never-have-i-ever/answer`, { answer });
      const fromRound = data.pointsFromRound as { newYourStrikes?: number; newTheirStrikes?: number } | undefined;
      const serverYourPts = Math.max(
        0,
        Number(fromRound?.newYourStrikes ?? data.yourPoints ?? data.yourStrikes ?? 0)
      );
      const serverTheirPts = Math.max(
        0,
        Number(fromRound?.newTheirStrikes ?? data.theirPoints ?? data.theirStrikes ?? 0)
      );
      const roundComplete = !!data.bothAnswered || !!data.roundJustCompleted;

      addBreadcrumb('NHIE', 'Answer response', { serverYourPts, serverTheirPts, roundComplete, bothAnswered: !!data.bothAnswered });
      debugLog('NHIE', 'Answer response full', { yourPoints: data.yourPoints, theirPoints: data.theirPoints, pointsFromRound: data.pointsFromRound, stateYourStrikes: data.yourStrikes, stateTheirStrikes: data.theirStrikes });

      // Server is source of truth; never drop below server or our ref (handles stale GET / timing)
      lastKnownPointsRef.current = {
        yourPoints: Math.max(lastKnownPointsRef.current.yourPoints, serverYourPts),
        theirPoints: Math.max(lastKnownPointsRef.current.theirPoints, serverTheirPts),
      };

      const nextPromptValue = data.newPrompt ?? data.prompt ?? state?.prompt ?? '';
      setState(prev => {
        if (!prev) return null;
        const yourPts = Math.max(prev.yourPoints, serverYourPts, lastKnownPointsRef.current.yourPoints);
        const theirPts = Math.max(prev.theirPoints, serverTheirPts, lastKnownPointsRef.current.theirPoints);
        return {
          ...prev,
          yourAnswer: roundComplete ? null : (data.yourAnswer ?? answer),
          theirAnswer: roundComplete ? null : (data.theirAnswer ?? prev.theirAnswer),
          bothAnswered: roundComplete ? false : !!data.bothAnswered,
          yourPoints: yourPts,
          theirPoints: theirPts,
          prompt: nextPromptValue || prev.prompt,
          gameOver: !!data.gameOver,
          winner: data.winner ?? null,
        };
      });
      // When round completes, server sends the new prompt; always apply so next round shows correctly
      if (roundComplete && nextPromptValue) setPrompt(nextPromptValue);
      else if (nextPromptValue) setPrompt(nextPromptValue);

      if (roundComplete) {
        lastRoundCompletedAtRef.current = Date.now();
        api.clearCache(`/matches/${matchId}/never-have-i-ever`);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setTimeout(() => {
          if (modalVisibleRef.current && !pollRef.current) {
            pollRef.current = setInterval(() => fetchState(true), 2000);
          }
        }, 6000);
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
    if (onBeforeUnlockPrompt) {
      const alreadyUnlocked = await onBeforeUnlockPrompt();
      if (alreadyUnlocked) {
        handleOpen();
        return;
      }
    }
    if (onUnlockWithToken) {
      Alert.alert(
        '🙊 Never Have I Ever',
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
      Alert.alert('🙊 Never Have I Ever', 'Never Have I Ever is not available for this match.', [{ text: 'Got it', style: 'default' }]);
    }
  };

  const headerButton = (
    <Animated.View style={{ transform: [{ scale: headerPulseAnim }] }}>
      <TouchableOpacity
        onPress={isUnlocked ? handleOpen : handleLockedPress}
        activeOpacity={0.8}
        style={[styles.headerIconButton, !isUnlocked && styles.headerIconButtonLocked]}
      >
        <Text style={styles.headerIconEmoji}>🙊</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  // Modal is shared - needed for headerMode when User B accepts (openForAccept)
  const gameModal = (
    <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleClose}>
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
                <View style={styles.spicePills}>
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
            <TouchableOpacity onPress={handleClose} style={styles.closeButton} activeOpacity={0.8}><View style={styles.closeButtonInner}><Text style={styles.closeButtonText}>Close</Text></View></TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  if (headerMode) {
    return <>{headerButton}{gameModal}</>;
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
            <Animated.Text style={[styles.lockedEmoji, { transform: [{ scale: emojiScale }, { rotate: monkeyRotateInterp }] }]}>🙊</Animated.Text>
          </View>
          <View style={styles.lockedTextWrap}>
            <Text style={styles.lockedText}>Never Have I Ever</Text>
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
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#00c853',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    borderRadius: 12,
    overflow: 'hidden',
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
});
