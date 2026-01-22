import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Animated, Modal, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import { Socket } from 'socket.io-client';

interface DatePlan {
  id: string;
  matchId: string;
  suggestedBy: string;
  planType: 'first_date' | 'follow_up';
  title: string;
  description: string;
  venueName?: string;
  venueAddress?: string;
  venueLat?: number;
  venueLng?: number;
  suggestedDate?: string;
  suggestedTime?: string;
  budgetRange?: 'low' | 'medium' | 'high';
  conversationTopics: string[];
  status: 'pending' | 'accepted' | 'modified' | 'declined';
  user1Accepted: boolean;
  user2Accepted: boolean;
  user1Modifications?: string;
  user2Modifications?: string;
  createdAt: string;
  updatedAt: string;
}

interface DateBlueprintProps {
  matchId: string;
  socket: Socket | null;
  currentUserId: string;
}

export default function DateBlueprint({ matchId, socket, currentUserId }: DateBlueprintProps) {
  const [plan, setPlan] = useState<DatePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetchPlan();
  }, [matchId]);

  // Debug: Log when isExpanded changes
  useEffect(() => {
    console.log('📅 DateBlueprint isExpanded state changed:', isExpanded, 'plan exists:', !!plan);
  }, [isExpanded, plan]);

  // Pulse animation for the button
  useEffect(() => {
    if (!plan) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();

      // Shimmer effect
      const shimmer = Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      );
      shimmer.start();

      return () => {
        pulse.stop();
        shimmer.stop();
      };
    }
  }, [plan, pulseAnim, shimmerAnim]);

  useEffect(() => {
    if (!socket) return;

    const handlePlanGenerated = (data: { matchId: string; plan: DatePlan }) => {
      if (data.matchId === matchId) {
        setPlan(data.plan);
      }
    };

    const handlePlanUpdated = (data: { matchId: string; plan: DatePlan }) => {
      if (data.matchId === matchId) {
        setPlan(data.plan);
      }
    };

    socket.on('date_plan_generated', handlePlanGenerated);
    socket.on('date_plan_updated', handlePlanUpdated);

    return () => {
      socket.off('date_plan_generated', handlePlanGenerated);
      socket.off('date_plan_updated', handlePlanUpdated);
    };
  }, [socket, matchId]);

  const fetchPlan = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/matches/${matchId}/date-plan`);
      // API utility returns data directly, not wrapped in .data
      const planData = response.plan || response;
      if (planData && typeof planData === 'object' && 'id' in planData) {
        setPlan(planData);
      }
    } catch (error: any) {
      // 404 is expected if no plan exists yet - don't log as error
      if (error?.response?.status === 404) {
        console.log('ℹ️ No date plan found for this match (this is normal)');
      } else {
        console.error('❌ Failed to fetch date plan:', error);
      }
      // Don't set plan to null - let it stay undefined so "Generate" button shows
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    Alert.alert(
      'Generate Date Plan',
      'Create an AI-powered date plan based on your shared interests and location?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            try {
              setGenerating(true);
              const response = await api.post(`/matches/${matchId}/generate-date-plan`);
              console.log('📅 Date plan response:', response);
              // API utility returns data directly, not wrapped in .data
              const planData = response.plan || response;
              if (planData && typeof planData === 'object' && 'id' in planData) {
                setPlan(planData);
                Alert.alert('✨ Date Plan Created!', 'Check out your personalized date plan below.');
              } else {
                console.error('❌ No plan in response:', response);
                Alert.alert('Error', 'Date plan was created but could not be retrieved. Please refresh.');
              }
            } catch (error: any) {
              console.error('❌ Generate date plan error:', error);
              const errorMessage = error?.response?.data?.error || error?.message || 'Failed to generate date plan';
              Alert.alert('Error', errorMessage);
            } finally {
              setGenerating(false);
            }
          },
        },
      ]
    );
  };

  const handleAction = async (action: 'accept' | 'decline' | 'modify') => {
    if (!plan) return;

    if (action === 'modify') {
      Alert.prompt(
        'Modify Date Plan',
        'Enter your suggested modifications:',
        async (modifications) => {
          if (modifications) {
            try {
              setUpdating(true);
              const response = await api.post(
                `/matches/${matchId}/date-plan/${plan.id}/action`,
                { action: 'modify', modifications }
              );
              // API utility returns data directly
              const planData = response.plan || response;
              if (planData && typeof planData === 'object' && 'id' in planData) {
                setPlan(planData);
              }
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to update date plan');
            } finally {
              setUpdating(false);
            }
          }
        }
      );
    } else {
      try {
        setUpdating(true);
        const response = await api.post(
          `/matches/${matchId}/date-plan/${plan.id}/action`,
          { action }
        );
        // API utility returns data directly
        const planData = response.plan || response;
        if (planData && typeof planData === 'object' && 'id' in planData) {
          setPlan(planData);
        }
        if (action === 'accept') {
          Alert.alert('✅ Accepted!', 'The other person will be notified.');
        } else {
          Alert.alert('Date Plan Declined', 'You can generate a new plan anytime.');
        }
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'Failed to update date plan');
      } finally {
        setUpdating(false);
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#667eea" />
      </View>
    );
  }

  if (!plan) {
    const shimmerTranslateX = shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-100, 100],
    });

    return (
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.generateButton,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <TouchableOpacity
            onPress={handleGenerate}
            disabled={generating}
            activeOpacity={0.8}
            style={styles.generateButtonTouchable}
          >
            <LinearGradient
              colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
              style={styles.generateButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Animated.View
                style={[
                  styles.shimmerOverlay,
                  {
                    transform: [{ translateX: shimmerTranslateX }],
                  },
                ]}
              />
              {generating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.generateButtonEmoji}>📅</Text>
                  <Text style={styles.generateButtonText}>Generate Date Plan</Text>
                  <Text style={styles.generateButtonSubtext}>AI-powered first date suggestions</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  const isAccepted = plan.user1Accepted && plan.user2Accepted;
  const userAccepted = plan.suggestedBy === currentUserId
    ? (plan.user1Accepted || plan.user2Accepted)
    : (plan.suggestedBy !== currentUserId ? (plan.user1Accepted || plan.user2Accepted) : false);

  // Always show compact preview, modal shows full details
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => {
          console.log('📅 Date plan button clicked, setting isExpanded to true');
          setIsExpanded(true);
        }}
        activeOpacity={0.8}
        style={styles.compactCard}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.compactCardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.compactContent}>
            <Text style={styles.compactEmoji}>📅</Text>
            <View style={styles.compactTextContainer}>
              <Text style={styles.compactTitle} numberOfLines={1}>{plan.title}</Text>
              <Text style={styles.compactDescription} numberOfLines={1}>{plan.description}</Text>
              {plan.venueName && (
                <Text style={styles.compactVenue} numberOfLines={1}>📍 {plan.venueName}</Text>
              )}
            </View>
            <Text style={styles.expandIcon}>▶</Text>
          </View>
          {isAccepted && (
            <View style={styles.compactAcceptedBadge}>
              <Text style={styles.compactAcceptedText}>✅</Text>
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>

      {/* Modal with full date plan details */}
      <Modal
        visible={isExpanded}
        transparent={true}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => {
          console.log('📅 Modal onRequestClose called');
          setIsExpanded(false);
        }}
        onShow={() => {
          console.log('📅 Modal onShow called - modal is visible');
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsExpanded(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.modalContent}
          >
            <TouchableOpacity
              onPress={() => setIsExpanded(false)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
            <ScrollView 
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.modalScrollContent}
            >
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.planCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.planTitle}>{plan.title}</Text>
                <Text style={styles.planDescription}>{plan.description}</Text>

                {plan.venueName && (
                  <View style={styles.venueSection}>
                    <Text style={styles.venueLabel}>📍 Venue</Text>
                    <Text style={styles.venueName}>{plan.venueName}</Text>
                    {plan.venueAddress && (
                      <Text style={styles.venueAddress}>{plan.venueAddress}</Text>
                    )}
                  </View>
                )}

                {plan.suggestedDate && (
                  <View style={styles.dateSection}>
                    <Text style={styles.dateLabel}>📅 Suggested Date</Text>
                    <Text style={styles.dateText}>
                      {new Date(plan.suggestedDate).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                      {plan.suggestedTime && ` at ${plan.suggestedTime}`}
                    </Text>
                  </View>
                )}

                {plan.budgetRange && (
                  <View style={styles.budgetSection}>
                    <Text style={styles.budgetLabel}>💰 Budget</Text>
                    <Text style={styles.budgetText}>
                      {plan.budgetRange === 'low' ? '$' : plan.budgetRange === 'medium' ? '$$' : '$$$'}
                    </Text>
                  </View>
                )}

                {plan.conversationTopics.length > 0 && (
                  <View style={styles.topicsSection}>
                    <Text style={styles.topicsLabel}>💬 Conversation Topics</Text>
                    {plan.conversationTopics.map((topic, index) => (
                      <Text key={index} style={styles.topicText}>
                        • {topic}
                      </Text>
                    ))}
                  </View>
                )}

                {isAccepted && (
                  <View style={styles.acceptedBadge}>
                    <Text style={styles.acceptedText}>✅ Both accepted!</Text>
                  </View>
                )}

                {!isAccepted && (
                  <View style={styles.actionsContainer}>
                    <TouchableOpacity
                      onPress={() => {
                        handleAction('accept');
                        setIsExpanded(false);
                      }}
                      disabled={updating || userAccepted}
                      style={[styles.actionButton, styles.acceptButton, userAccepted && styles.disabledButton]}
                    >
                      <Text style={styles.actionButtonText}>
                        {userAccepted ? '✓ Accepted' : 'Accept'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        handleAction('modify');
                        setIsExpanded(false);
                      }}
                      disabled={updating}
                      style={[styles.actionButton, styles.modifyButton]}
                    >
                      <Text style={styles.actionButtonText}>Modify</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        handleAction('decline');
                        setIsExpanded(false);
                      }}
                      disabled={updating}
                      style={[styles.actionButton, styles.declineButton]}
                    >
                      <Text style={styles.actionButtonText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </LinearGradient>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 0,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  generateButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  generateButtonTouchable: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  generateButtonGradient: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    opacity: 0.5,
  },
  generateButtonEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 1,
  },
  generateButtonSubtext: {
    color: '#fff',
    fontSize: 9,
    opacity: 0.9,
  },
  compactCard: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  compactCardGradient: {
    padding: 10,
    paddingVertical: 12,
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  compactTextContainer: {
    flex: 1,
  },
  compactTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  compactDescription: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
    marginBottom: 2,
  },
  compactVenue: {
    color: '#fff',
    fontSize: 11,
    opacity: 0.85,
  },
  expandIcon: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.8,
    marginLeft: 8,
  },
  compactAcceptedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  compactAcceptedText: {
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1000,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 20,
  },
  planCard: {
    padding: 16,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  planTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  planDescription: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
    opacity: 0.95,
  },
  venueSection: {
    marginBottom: 16,
  },
  venueLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    opacity: 0.9,
  },
  venueName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  venueAddress: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.8,
  },
  dateSection: {
    marginBottom: 16,
  },
  dateLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    opacity: 0.9,
  },
  dateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  budgetSection: {
    marginBottom: 16,
  },
  budgetLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    opacity: 0.9,
  },
  budgetText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  topicsSection: {
    marginBottom: 20,
  },
  topicsLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.9,
  },
  topicText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
    opacity: 0.9,
  },
  acceptedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptedText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  acceptButton: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
  },
  modifyButton: {
    backgroundColor: 'rgba(255, 193, 7, 0.3)',
  },
  declineButton: {
    backgroundColor: 'rgba(244, 67, 54, 0.3)',
  },
  disabledButton: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

