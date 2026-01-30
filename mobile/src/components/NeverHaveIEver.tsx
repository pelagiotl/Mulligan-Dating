/**
 * Never Have I Ever - First to 10 strikes loses
 * Both users answer "I have" or "I haven't" — "I have" = strike
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
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';

const MIN_MESSAGES_EACH = 5;
const STRIKES_TO_LOSE = 10;

interface Message {
  id: string;
  senderId: string;
  content: string;
}

interface GameState {
  prompt: string;
  yourStrikes: number;
  theirStrikes: number;
  yourAnswer: 'have' | 'havent' | null;
  theirAnswer: 'have' | 'havent' | null;
  bothAnswered: boolean;
  gameOver: boolean;
  winner: 'you' | 'them' | null;
  roundResult?: { youStrike: boolean; themStrike: boolean };
  phase: 'lobby' | 'playing';
  yourSpiceChoice: 'pg13' | 'ratedr' | 'spicy' | null;
  theirSpiceChoice: 'pg13' | 'ratedr' | 'spicy' | null;
  spiceReady: boolean;
  spiceLevel: 'pg13' | 'ratedr' | 'spicy' | null;
}

interface NeverHaveIEverProps {
  matchId: string;
  messages: Message[];
  currentUserId: string;
  socket: any;
  onRequestGame?: () => void;
  openForAccept?: boolean;
  onOpenedForAccept?: () => void;
  compact?: boolean;
  square?: boolean;
}

export default function NeverHaveIEver({
  matchId,
  messages,
  currentUserId,
  socket,
  onRequestGame,
  openForAccept,
  onOpenedForAccept,
  compact = true,
  square = false,
}: NeverHaveIEverProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ownCount = messages.filter((m) => m.senderId === currentUserId).length;
  const otherCount = messages.filter((m) => m.senderId !== currentUserId).length;
  const isUnlocked = ownCount >= MIN_MESSAGES_EACH && otherCount >= MIN_MESSAGES_EACH;

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
      const data = await api.get<GameState>(`/matches/${matchId}/never-have-i-ever`);
      setState(data);
    } catch (err) {
      console.warn('Never Have I Ever fetch error:', err);
    }
  }, [matchId]);

  useEffect(() => {
    if (openForAccept) {
      setModalVisible(true);
      setLoading(true);
      fetchState().finally(() => setLoading(false));
      pollRef.current = setInterval(fetchState, 3000);
      onOpenedForAccept?.();
    }
  }, [openForAccept]);

  const handleOpen = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(50);
    }
    if (onRequestGame) {
      onRequestGame();
      return;
    }
    setModalVisible(true);
    setLoading(true);
    fetchState().finally(() => setLoading(false));

    // Poll every 3s while modal is open (to catch when other player answers)
    pollRef.current = setInterval(fetchState, 3000);
  };

  const handleClose = () => {
    setModalVisible(false);
    setState(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    if (!modalVisible) return;
    const onUpdate = () => fetchState();
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

  const handleAnswer = async (answer: 'have' | 'havent') => {
    if (submitting || !state || state.yourAnswer !== null) return;
    setSubmitting(true);
    try {
      const data = await api.post<GameState & { roundResult?: { youStrike: boolean; themStrike: boolean } }>(
        `/matches/${matchId}/never-have-i-ever/answer`,
        { answer }
      );
      setState({ ...data, roundResult: data.roundResult });
    } catch (err) {
      console.warn('Never Have I Ever answer error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextRound = async () => {
    if (!state?.bothAnswered) return;
    setSubmitting(true);
    try {
      const data = await api.post<GameState>(`/matches/${matchId}/never-have-i-ever/next`, {});
      setState(data);
    } catch (err) {
      console.warn('Never Have I Ever next error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetSpiceChoice = async (choice: 'pg13' | 'ratedr' | 'spicy') => {
    setSubmitting(true);
    try {
      const data = await api.post<GameState>(`/matches/${matchId}/never-have-i-ever/spice-choice`, { choice });
      setState(data);
    } catch (err) {
      console.warn('Never Have I Ever spice choice error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartGame = async () => {
    if (!state?.spiceReady) return;
    setSubmitting(true);
    try {
      const data = await api.post<GameState>(`/matches/${matchId}/never-have-i-ever/start`, {});
      setState(data);
    } catch (err) {
      console.warn('Never Have I Ever start error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const monkeyRotateInterp = emojiRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-8deg', '8deg'],
  });

  const handleRestart = async () => {
    setSubmitting(true);
    try {
      const data = await api.post<GameState>(`/matches/${matchId}/never-have-i-ever/restart`, {});
      setState(data);
    } catch (err) {
      console.warn('Never Have I Ever restart error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLockedPress = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(30);
    }
    const yourRemaining = Math.max(0, MIN_MESSAGES_EACH - ownCount);
    const theirRemaining = Math.max(0, MIN_MESSAGES_EACH - otherCount);
    
    let message = '';
    if (yourRemaining > 0 && theirRemaining > 0) {
      message = `You need to send ${yourRemaining} more message${yourRemaining !== 1 ? 's' : ''} and they need to send ${theirRemaining} more message${theirRemaining !== 1 ? 's' : ''} to unlock this game.`;
    } else if (yourRemaining > 0) {
      message = `You need to send ${yourRemaining} more message${yourRemaining !== 1 ? 's' : ''} to unlock this game.`;
    } else if (theirRemaining > 0) {
      message = `Waiting for them to send ${theirRemaining} more message${theirRemaining !== 1 ? 's' : ''} to unlock this game.`;
    }
    
    Alert.alert(
      '🙊 Never Have I Ever',
      `${message}\n\nBoth of you need to exchange ${MIN_MESSAGES_EACH} messages each before you can play!`,
      [{ text: 'Got it', style: 'default' }]
    );
  };

  if (!isUnlocked) {
    return (
      <View style={[styles.container, compact && styles.containerCompact, square && styles.containerSquare]}>
        <TouchableOpacity 
          onPress={handleLockedPress} 
          activeOpacity={0.7}
          style={[styles.lockedCard, square && styles.lockedCardSquare]}
        >
          <Animated.Text style={[styles.lockedEmoji, { transform: [{ scale: emojiScale }, { rotate: monkeyRotateInterp }] }]}>🙊</Animated.Text>
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
        <Animated.View style={[styles.buttonGlow, square && styles.buttonSquare, { transform: [{ scale: pulseAnim }] }]}>
          <TouchableOpacity onPress={handleOpen} activeOpacity={0.85} style={[styles.button, square && styles.buttonSquare]}>
            <LinearGradient
              colors={['#00e676', '#00e5ff', '#00b8d4', '#26c6da', '#00e676']}
              locations={[0, 0.3, 0.5, 0.75, 1]}
              style={[styles.buttonGradient, square && styles.buttonGradientSquare]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.15)', 'transparent']}
                locations={[0, 0.35, 0.7]}
                style={styles.buttonGloss}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
              <View style={[styles.buttonContent, square && styles.buttonContentSquare]}>
                <View style={[styles.emojiBadge, square && styles.emojiBadgeSquare]}>
                  <Animated.Text style={[styles.buttonEmoji, square && styles.buttonEmojiSquare, { transform: [{ scale: emojiScale }, { rotate: monkeyRotateInterp }] }]}>🙊</Animated.Text>
                </View>
                <Text style={[styles.buttonText, square && styles.buttonTextSquare]}>Never Have I Ever</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
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
              colors={['#11998e', '#38ef7d', '#667eea']}
              style={styles.modalGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.modalTitle}>🙊 Never Have I Ever</Text>

              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.loadingText}>Loading game...</Text>
                </View>
              ) : state?.phase === 'lobby' ? (
                <View style={styles.lobbyContainer}>
                  <Text style={styles.lobbyTitle}>Both pick the same to play</Text>
                  <View style={styles.spiceRow}>
                    <TouchableOpacity
                      onPress={() => handleSetSpiceChoice('pg13')}
                      style={[styles.spicePill, state.yourSpiceChoice === 'pg13' && styles.spicePillActive]}
                      disabled={submitting}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.spicePillText, state.yourSpiceChoice === 'pg13' && styles.spicePillTextActive]}>
                        PG-13
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleSetSpiceChoice('ratedr')}
                      style={[styles.spicePill, state.yourSpiceChoice === 'ratedr' && styles.spicePillActive]}
                      disabled={submitting}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.spicePillText, state.yourSpiceChoice === 'ratedr' && styles.spicePillTextActive]}>
                        Rated R
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleSetSpiceChoice('spicy')}
                      style={[styles.spicePill, state.yourSpiceChoice === 'spicy' && styles.spicePillActive]}
                      disabled={submitting}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.spicePillText, state.yourSpiceChoice === 'spicy' && styles.spicePillTextActive]}>
                        Spicy
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {state.theirSpiceChoice ? (
                    <Text style={styles.lobbyHint}>
                      They picked {state.theirSpiceChoice === 'pg13' ? 'PG-13' : state.theirSpiceChoice === 'ratedr' ? 'Rated R' : 'Spicy'}
                      {state.spiceReady ? ' — Match! Ready to play' : ' — pick the same to play'}
                    </Text>
                  ) : (
                    <Text style={styles.lobbyHint}>Waiting for them to pick...</Text>
                  )}
                  {state.spiceReady && (
                    <TouchableOpacity
                      onPress={handleStartGame}
                      style={styles.startButton}
                      disabled={submitting}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['#667eea', '#764ba2']}
                        style={styles.startGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        <Text style={styles.startButtonText}>Start Game</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>
              ) : state?.gameOver ? (
                <View style={styles.gameOverContainer}>
                  <Text style={styles.gameOverTitle}>
                    {state.winner === 'you' ? '🎉 You win!' : '😅 You lose!'}
                  </Text>
                  <Text style={styles.gameOverSubtitle}>
                    {state.winner === 'you'
                      ? "They hit 10 strikes first!"
                      : "You hit 10 strikes first!"}
                  </Text>
                  <Text style={styles.scoreText}>
                    Final: You {state.yourStrikes} • Them {state.theirStrikes}
                  </Text>
                  <TouchableOpacity
                    onPress={handleRestart}
                    style={styles.restartButton}
                    disabled={submitting}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#667eea', '#764ba2']}
                      style={styles.restartGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.restartButtonText}>Play Again</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : state ? (
                <>
                  {state.spiceLevel && (
                    <View style={styles.promptSpiceBadge}>
                      <Text style={styles.promptSpiceText}>
                        {state.spiceLevel === 'spicy' ? 'Spicy' : state.spiceLevel === 'ratedr' ? 'Rated R' : 'PG-13'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.scoreRow}>
                    <View style={styles.scoreBox}>
                      <Text style={styles.scoreLabel}>You</Text>
                      <Text style={[styles.strikesText, state.yourStrikes >= 8 && styles.strikesWarning]}>
                        {state.yourStrikes}/{STRIKES_TO_LOSE}
                      </Text>
                      <Text style={styles.strikesSub}>strikes</Text>
                    </View>
                    <Text style={styles.scoreVs}>vs</Text>
                    <View style={styles.scoreBox}>
                      <Text style={styles.scoreLabel}>Them</Text>
                      <Text style={[styles.strikesText, state.theirStrikes >= 8 && styles.strikesWarning]}>
                        {state.theirStrikes}/{STRIKES_TO_LOSE}
                      </Text>
                      <Text style={styles.strikesSub}>strikes</Text>
                    </View>
                  </View>

                  <Text style={styles.promptText}>{state.prompt}</Text>

                  {state.bothAnswered ? (
                    <View style={styles.resultsContainer}>
                      <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>You:</Text>
                        <Text style={[styles.resultValue, state.yourAnswer === 'have' && styles.strikeText]}>
                          {state.yourAnswer === 'have' ? "I have ✗" : "I haven't ✓"}
                        </Text>
                      </View>
                      <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>Them:</Text>
                        <Text style={[styles.resultValue, state.theirAnswer === 'have' && styles.strikeText]}>
                          {state.theirAnswer === 'have' ? "I have ✗" : "I haven't ✓"}
                        </Text>
                      </View>
                      {(state.roundResult?.youStrike || state.roundResult?.themStrike) && (
                        <Text style={styles.roundResultText}>
                          {state.roundResult.youStrike && state.roundResult.themStrike
                            ? "Both get a strike!"
                            : state.roundResult.youStrike
                            ? "You get a strike!"
                            : "They get a strike!"}
                        </Text>
                      )}
                      <TouchableOpacity
                        onPress={handleNextRound}
                        style={styles.nextButton}
                        disabled={submitting}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={['#667eea', '#764ba2']}
                          style={styles.nextGradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <Text style={styles.nextButtonText}>Next Round</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  ) : state.yourAnswer !== null ? (
                    <View style={styles.waitingContainer}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.waitingText}>Waiting for them to answer...</Text>
                    </View>
                  ) : (
                    <View style={styles.answerRow}>
                      <TouchableOpacity
                        onPress={() => handleAnswer('have')}
                        disabled={submitting}
                        style={styles.answerButton}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={['#e74c3c', '#c0392b']}
                          style={styles.answerGradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <Text style={styles.answerButtonText}>I have</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleAnswer('havent')}
                        disabled={submitting}
                        style={styles.answerButton}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={['#27ae60', '#2ecc71']}
                          style={styles.answerGradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <Text style={styles.answerButtonText}>I haven't</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              ) : null}

              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </LinearGradient>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: '#80cbc4',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: '#00b8d4',
    minWidth: 140,
    shadowColor: '#00b8d4',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  lockedCardSquare: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  lockedEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  lockedTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  lockedText: {
    fontSize: 13,
    color: '#000000',
    fontWeight: '700',
  },
  lockedSubtext: {
    fontSize: 10,
    color: 'rgba(0,0,0,0.6)',
    fontWeight: '500',
    marginTop: 2,
  },
  buttonGlow: {
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    elevation: 14,
  },
  button: {
    borderRadius: 18,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    shadowColor: '#00b8d4',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  buttonSquare: {
    flex: 1,
    alignSelf: 'stretch',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    position: 'relative',
  },
  buttonGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
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
    fontSize: 18,
    marginRight: 0,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  buttonEmojiSquare: {
    marginRight: 0,
    marginBottom: 0,
    fontSize: 22,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  buttonTextSquare: {
    fontSize: 11,
    textAlign: 'center',
    color: '#ffffff',
    fontWeight: '800',
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
  spiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
    justifyContent: 'center',
  },
  spicePill: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  spicePillActive: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(255,255,255,0.95)',
  },
  spicePillText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  spicePillTextActive: {
    color: '#11998e',
  },
  lobbyHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 16,
    textAlign: 'center',
  },
  startButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  startGradient: {
    paddingVertical: 12,
    paddingHorizontal: 28,
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalGradient: {
    padding: 24,
    borderRadius: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
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
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    minWidth: 80,
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
  promptText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  answerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  answerButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
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
    marginBottom: 12,
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
    paddingVertical: 20,
  },
  gameOverTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
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
    marginTop: 16,
    paddingVertical: 8,
  },
  closeButtonText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
});
