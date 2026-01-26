import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Modal, TouchableOpacity, ScrollView, Platform, Vibration } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import { Socket } from 'socket.io-client';

interface CompatibilityScore {
  score: number;
  responseTimeAvg: number;
  messageLengthAvg: number;
  engagementLevel: 'cold' | 'neutral' | 'warming' | 'hot';
  lastCalculatedAt: string;
}

interface CompatibilityPulseProps {
  matchId: string;
  socket: Socket | null;
}

export default function CompatibilityPulse({ matchId, socket }: CompatibilityPulseProps) {
  const [score, setScore] = useState<CompatibilityScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const continuousPulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.8)).current;
  const glowScaleAnim = useRef(new Animated.Value(1)).current;
  const glowOpacityAnim = useRef(new Animated.Value(0.4)).current;
  const glowOuterScaleAnim = useRef(new Animated.Value(1)).current;
  const glowOuterOpacityAnim = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    fetchScore();
  }, [matchId]);

  // Continuous pulsating animation with glow effect
  useEffect(() => {
    if (loading) return;
    
    const pulseLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(continuousPulseAnim, {
            toValue: 1.08,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(continuousPulseAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.8,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        // Glow ring animation
        Animated.sequence([
          Animated.parallel([
            Animated.timing(glowScaleAnim, {
              toValue: 1.3,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacityAnim, {
              toValue: 0.6,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOuterScaleAnim, {
              toValue: 1.4,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOuterOpacityAnim, {
              toValue: 0.3,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(glowScaleAnim, {
              toValue: 1,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacityAnim, {
              toValue: 0.4,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOuterScaleAnim, {
              toValue: 1.1,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOuterOpacityAnim, {
              toValue: 0.2,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ])
    );
    
    pulseLoop.start();
    
    return () => {
      pulseLoop.stop();
    };
  }, [loading, continuousPulseAnim, opacityAnim, glowScaleAnim, glowOpacityAnim, glowOuterScaleAnim, glowOuterOpacityAnim]);

  useEffect(() => {
    if (!socket) return;

    const handleScoreUpdate = (data: { matchId: string; score: number; engagementLevel: string }) => {
      if (data.matchId === matchId) {
        setScore((prev) => prev ? { ...prev, score: data.score, engagementLevel: data.engagementLevel } : null);
        animatePulse();
      }
    };

    socket.on('compatibility_score_updated', handleScoreUpdate);

    return () => {
      socket.off('compatibility_score_updated', handleScoreUpdate);
    };
  }, [socket, matchId]);

  const fetchScore = async () => {
    try {
      setLoading(true);
      console.log(`📊 Fetching compatibility score for match ${matchId}`);
      const response = await api.get(`/matches/${matchId}/compatibility`);
      console.log(`📊 Full API response:`, response);
      
      // The API utility returns data directly, not wrapped in .data
      // Response structure: { score: { ... } }
      const scoreData = response.score || response;
      if (scoreData && typeof scoreData === 'object' && 'score' in scoreData) {
        setScore(scoreData);
        console.log(`✅ Compatibility score loaded:`, scoreData);
      } else {
        console.warn('⚠️ No valid score in response:', response);
        // Set default score
        setScore({
          score: 50,
          responseTimeAvg: 0,
          messageLengthAvg: 0,
          engagementLevel: 'neutral',
          lastCalculatedAt: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      console.error('❌ Failed to fetch compatibility score:', error);
      console.error('❌ Error response:', error?.response?.data);
      console.error('❌ Error message:', error?.message);
      // Don't hide the component on error - show a default/neutral state
      setScore({
        score: 50,
        responseTimeAvg: 0,
        messageLengthAvg: 0,
        engagementLevel: 'neutral',
        lastCalculatedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const animatePulse = () => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  };

  // Show loading state or default score
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.pulseCircle, { backgroundColor: '#95A5A6' }]}>
          <View style={styles.innerCircle}>
            <Text style={styles.scoreText}>--</Text>
          </View>
        </View>
      </View>
    );
  }

  // Use default score if none available
  const displayScore = score || {
    score: 50,
    responseTimeAvg: 0,
    messageLengthAvg: 0,
    engagementLevel: 'neutral' as const,
    lastCalculatedAt: new Date().toISOString(),
  };

  const getColorForLevel = (level: string) => {
    switch (level) {
      case 'hot':
        return ['#FF6B6B', '#FF8E8E'];
      case 'warming':
        return ['#4ECDC4', '#6EDDD6'];
      case 'neutral':
        return ['#95A5A6', '#BDC3C7'];
      case 'cold':
        return ['#E74C3C', '#EC7063'];
      default:
        return ['#95A5A6', '#BDC3C7'];
    }
  };

  const getEmoji = (level: string) => {
    switch (level) {
      case 'hot':
        return '🔥';
      case 'warming':
        return '💚';
      case 'neutral':
        return '💛';
      case 'cold':
        return '💙';
      default:
        return '💛';
    }
  };

  const colors = getColorForLevel(displayScore.engagementLevel);

  // Heart color matching the app's primary color
  const heartColor = '#8B1538';
  const heartColorLight = '#B71C3A';
  const heartColorGlow = '#FF6B9D';

  return (
    <>
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.pulseContainer,
            {
              transform: [
                { scale: Animated.multiply(pulseAnim, continuousPulseAnim) },
              ],
            },
          ]}
        >
          {/* Glowing ring that pulses with heart color */}
          <Animated.View
            style={[
              styles.glowRing,
              {
                transform: [{ scale: glowScaleAnim }],
                opacity: glowOpacityAnim,
              },
            ]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={[heartColorGlow + '80', heartColor + '60', heartColorLight + '40', 'transparent']}
              style={styles.glowRing}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 1, y: 1 }}
            />
          </Animated.View>
          {/* Additional outer glow layer */}
          <Animated.View
            style={[
              styles.glowRingOuter,
              {
                transform: [{ scale: glowOuterScaleAnim }],
                opacity: glowOuterOpacityAnim,
              },
            ]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={[heartColorGlow + '40', 'transparent']}
              style={styles.glowRingOuter}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 1, y: 1 }}
            />
          </Animated.View>
          
          <TouchableOpacity
            onPress={() => {
              console.log('💝 Compatibility pulse pressed');
              if (Platform.OS === 'ios') {
                Vibration.vibrate(50);
              } else {
                Vibration.vibrate(50);
              }
              setShowInfoModal(true);
            }}
            activeOpacity={0.8}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <Animated.View
              style={[
                styles.pulseCircle,
                {
                  opacity: opacityAnim,
                },
              ]}
            >
              <LinearGradient
                colors={colors}
                style={styles.pulseCircle}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Animated.View
                  style={[
                    styles.innerCircle,
                    {
                      transform: [{ scale: scaleAnim }],
                    },
                  ]}
                >
                  <Text style={styles.emoji}>{getEmoji(displayScore.engagementLevel)}</Text>
                  <Text style={styles.scoreText}>{Math.round(displayScore.score)}</Text>
                </Animated.View>
              </LinearGradient>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.label}>Connection</Text>
      </View>

      {/* Info Modal */}
      <Modal
        visible={showInfoModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowInfoModal(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <TouchableOpacity
              onPress={() => setShowInfoModal(false)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
            
            <View style={styles.modalHeader}>
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.modalHeaderGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.modalTitle}>💝 Connection Score</Text>
                <Text style={styles.modalSubtitle}>What does this mean?</Text>
              </LinearGradient>
            </View>

            <ScrollView 
              style={styles.modalScrollView} 
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.modalBody}>
                <View style={styles.infoSection}>
                  <Text style={styles.infoTitle}>📊 Your Score: {Math.round(displayScore.score)}</Text>
                  <Text style={styles.infoText}>
                    This score reflects how well you and your match are connecting based on your conversation patterns, response times, and engagement level.
                  </Text>
                </View>

                <View style={styles.infoSection}>
                  <Text style={styles.infoTitle}>🔥 Engagement Levels</Text>
                  
                  <View style={styles.engagementItem}>
                    <Text style={styles.engagementEmoji}>🔥</Text>
                    <View style={styles.engagementContent}>
                      <Text style={styles.engagementTitle}>Hot</Text>
                      <Text style={styles.engagementDescription}>High engagement, fast responses, great conversation flow</Text>
                    </View>
                  </View>

                  <View style={styles.engagementItem}>
                    <Text style={styles.engagementEmoji}>💚</Text>
                    <View style={styles.engagementContent}>
                      <Text style={styles.engagementTitle}>Warming</Text>
                      <Text style={styles.engagementDescription}>Growing connection, improving engagement</Text>
                    </View>
                  </View>

                  <View style={styles.engagementItem}>
                    <Text style={styles.engagementEmoji}>💛</Text>
                    <View style={styles.engagementContent}>
                      <Text style={styles.engagementTitle}>Neutral</Text>
                      <Text style={styles.engagementDescription}>Steady communication, building rapport</Text>
                    </View>
                  </View>

                  <View style={styles.engagementItem}>
                    <Text style={styles.engagementEmoji}>💙</Text>
                    <View style={styles.engagementContent}>
                      <Text style={styles.engagementTitle}>Cold</Text>
                      <Text style={styles.engagementDescription}>Early stages, still getting to know each other</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.infoSection}>
                  <Text style={styles.infoTitle}>💬 How It's Calculated</Text>
                  <Text style={styles.infoText}>
                    Your connection score is based on:
                  </Text>
                  <View style={styles.bulletList}>
                    <Text style={styles.bulletPoint}>• Response time - How quickly you both reply</Text>
                    <Text style={styles.bulletPoint}>• Message length - Depth of your conversations</Text>
                    <Text style={styles.bulletPoint}>• Engagement level - Overall interaction quality</Text>
                    <Text style={styles.bulletPoint}>• Conversation flow - How naturally you connect</Text>
                  </View>
                </View>

                <View style={styles.infoSection}>
                  <Text style={styles.infoTitle}>✨ Keep It Growing</Text>
                  <Text style={styles.infoText}>
                    The more you chat, the more accurate your connection score becomes. Keep the conversation going to see your connection strengthen! 💕
                  </Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginLeft: 8,
  },
  pulseContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  glowRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#8B1538',
    backgroundColor: 'transparent',
    shadowColor: '#8B1538',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 5,
  },
  glowRingOuter: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8B1538',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 1,
  },
  innerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 14,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 1,
  },
  label: {
    display: 'none', // Hide label in header
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '90%',
    maxWidth: 500,
    maxHeight: '85%',
    minHeight: 500,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 25,
    overflow: 'hidden',
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  modalScrollView: {
    flex: 1,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1000,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  modalCloseText: {
    color: '#667eea',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalHeader: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  modalHeaderGradient: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  modalScrollView: {
    maxHeight: 500,
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  modalBody: {
    padding: 20,
  },
  infoSection: {
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  infoText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    marginBottom: 8,
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
  },
  engagementEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  engagementContent: {
    flex: 1,
  },
  engagementTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  engagementDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  bulletList: {
    marginTop: 8,
    paddingLeft: 8,
  },
  bulletPoint: {
    fontSize: 15,
    color: '#666',
    lineHeight: 24,
    marginBottom: 6,
  },
});

