import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Animated, Easing, Modal, Platform, Vibration, Dimensions, ScrollView } from 'react-native';
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
  headerMode?: boolean;
  /** Send hangout plan as a chat message (Invite button) */
  onInviteToChat?: (message: string) => void;
}

export default function DateBlueprint({ matchId, socket, currentUserId, headerMode, onInviteToChat }: DateBlueprintProps) {
  const [plan, setPlan] = useState<DatePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const headerPulseAnim = useRef(new Animated.Value(1)).current;

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

    const handlePlanGenerated = (data: { matchId?: string; plan?: DatePlan }) => {
      if (data?.matchId === matchId && data?.plan && typeof data.plan === 'object' && 'id' in data.plan) {
        setPlan(data.plan);
      }
    };

    const handlePlanUpdated = (data: { matchId?: string; plan?: DatePlan }) => {
      if (data?.matchId === matchId && data?.plan && typeof data.plan === 'object' && 'id' in data.plan) {
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
      // 404 / "No date plan found" is expected when no plan exists yet - don't log as error
      const isNotFound = error?.status === 404 || error?.message?.includes('No date plan found');
      if (isNotFound) {
        // Normal: match has no date plan yet
      } else {
        console.error('❌ Failed to fetch date plan:', error);
      }
      // Don't set plan to null - let it stay undefined so "Generate" button shows
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    Vibration.vibrate(50); // Vibrate when button is clicked
    Alert.alert(
      'Generate Hangout Plan',
      'Create an AI-powered hangout plan based on your shared interests and location?',
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
                Alert.alert('✨ Hangout Plan Created!', 'Check out your personalized hangout plan below.');
              } else {
                console.error('❌ No plan in response:', response);
                Alert.alert('Error', 'Hangout plan was created but could not be retrieved. Please refresh.');
              }
            } catch (error: any) {
              console.error('❌ Generate hangout plan error:', error);
              const errorMessage = error?.response?.data?.error || error?.message || 'Failed to generate hangout plan';
              Alert.alert('Error', errorMessage);
            } finally {
              setGenerating(false);
            }
          },
        },
      ]
    );
  };

  const handleDateChange = async (newDate: Date) => {
    if (!plan) return;

    try {
      setUpdating(true);
      const dateStr = newDate.toISOString().split('T')[0];
      const timeStr = `${newDate.getHours().toString().padStart(2, '0')}:${newDate.getMinutes().toString().padStart(2, '0')}`;

      const response = await api.put(
        `/matches/${matchId}/date-plan/${plan.id}/date-time`,
        { suggestedDate: dateStr, suggestedTime: timeStr }
      );

      const planData = response.plan || response;
      if (planData && typeof planData === 'object' && 'id' in planData) {
        setPlan(planData);
        Alert.alert('✅ Schedule updated', 'Your meetup time has been updated.');
      }
    } catch (error: any) {
      console.error('❌ Update date error:', error);
      Alert.alert('Error', error?.message || 'Failed to update schedule');
    } finally {
      setUpdating(false);
    }
  };

  const handleAction = async (action: 'accept') => {
    if (!plan) return;
    try {
      setUpdating(true);
      const response = await api.post(
        `/matches/${matchId}/date-plan/${plan.id}/action`,
        { action }
      );
      const planData = response.plan || response;
      if (planData && typeof planData === 'object' && 'id' in planData) {
        setPlan(planData);
      }
      Alert.alert('✅ Accepted!', 'The other person will be notified.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update hangout plan');
    } finally {
      setUpdating(false);
    }
  };

  const handleRegenerate = async () => {
    try {
      setUpdating(true);
      const response = await api.post(`/matches/${matchId}/generate-date-plan`);
      const planData = response.plan || response;
      if (planData && typeof planData === 'object' && 'id' in planData) {
        setPlan(planData);
        Alert.alert('✨ New Hangout Plan Created!', `Your new hangout plan: "${planData.title}"`);
      } else {
        const latestPlan = await (async () => {
          try {
            const r = await api.get(`/matches/${matchId}/date-plan`);
            return r.plan || r;
          } catch { return null; }
        })();
        if (latestPlan && typeof latestPlan === 'object' && 'id' in latestPlan) {
          setPlan(latestPlan);
          Alert.alert('✨ New Hangout Plan Created!', `Your new hangout plan: "${latestPlan.title}"`);
        } else {
          Alert.alert('✨ New Hangout Plan Created!', 'A new plan was generated. Take a look!');
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to regenerate hangout plan');
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenModal = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(30);
    }
    setIsExpanded(true);
  };

  useEffect(() => {
    if (!headerMode) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(headerPulseAnim, {
          toValue: 1.08,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(headerPulseAnim, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => { pulse.stop(); headerPulseAnim.setValue(1); };
  }, [headerMode]);

  if (headerMode) {
    const shimmerTranslateX = shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-100, 100],
    });

    // Keep the calendar icon visible while fetching — avoids paired spinners with MulliganMoments on chat open.
    const headerButton = (
      <Animated.View style={{ transform: [{ scale: headerPulseAnim }] }}>
        <TouchableOpacity
          onPress={handleOpenModal}
          activeOpacity={0.8}
          style={styles.headerIconButton}
        >
          <Text style={styles.headerIconEmoji}>📅</Text>
        </TouchableOpacity>
      </Animated.View>
    );

    return (
      <>
        {headerButton}
        <Modal
          visible={isExpanded}
          transparent={true}
          animationType="fade"
          presentationStyle="overFullScreen"
          statusBarTranslucent={true}
          onRequestClose={() => setIsExpanded(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setIsExpanded(false)}
          >
            <View
              style={styles.modalContent}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
            >
              <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
              <View style={[styles.modalScrollContent, { maxHeight: Dimensions.get('window').height * 0.85 }]}>
                {loading ? (
                  <View style={styles.headerModalLoading}>
                    <ActivityIndicator size="large" color="#667eea" />
                    <Text style={styles.headerModalLoadingText}>Loading...</Text>
                  </View>
                ) : !plan ? (
                  <Animated.View
                    style={[
                      styles.generateButton,
                      { transform: [{ scale: pulseAnim }] },
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
                            { transform: [{ translateX: shimmerTranslateX }] },
                          ]}
                        />
                        {generating ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Text style={styles.generateButtonEmoji}>📅</Text>
                            <Text style={styles.generateButtonText}>Generate Hangout Plan</Text>
                            <Text style={styles.generateButtonSubtext}>AI-powered hangout ideas from shared interests</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                ) : (
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
                        {plan.venueAddress && <Text style={styles.venueAddress}>{plan.venueAddress}</Text>}
                      </View>
                    )}
                    {plan.suggestedDate && (
                      <TouchableOpacity
                        style={styles.dateSection}
                        onPress={() => {
                          if (plan.suggestedDate) {
                            const d = new Date(plan.suggestedDate);
                            if (plan.suggestedTime) {
                              const [h, m] = plan.suggestedTime.split(':');
                              d.setHours(parseInt(h, 10), parseInt(m, 10));
                            }
                            setSelectedDate(d);
                            setIsExpanded(false);
                            setTimeout(() => setShowDatePicker(true), 300);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.dateLabel}>📅 When to meet</Text>
                        <Text style={styles.dateText}>
                          {new Date(plan.suggestedDate).toLocaleDateString('en-US', {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                          })}
                          {plan.suggestedTime && ` at ${plan.suggestedTime}`}
                        </Text>
                      </TouchableOpacity>
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
                        {plan.conversationTopics.map((topic, i) => (
                          <Text key={i} style={styles.topicItem}>• {topic}</Text>
                        ))}
                      </View>
                    )}
                    {!(plan.user1Accepted && plan.user2Accepted) && (
                      <View style={styles.actionButtonsRow}>
                        {plan.suggestedBy !== currentUserId && (
                          <TouchableOpacity
                            onPress={() => { handleAction('accept'); setIsExpanded(false); }}
                            disabled={updating}
                            style={[styles.actionButton, styles.acceptButton]}
                          >
                            <Text style={styles.actionButtonText}>Accept</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={handleRegenerate}
                          disabled={updating}
                          style={[styles.actionButton, styles.regenerateButton]}
                        >
                          <View style={styles.actionButtonInner}>
                            <Text style={styles.regenerateButtonText} numberOfLines={1}>
                              {updating ? 'Generating...' : 'New hangout plan'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        {onInviteToChat && (
                          <TouchableOpacity
                            onPress={() => {
                              const parts = [`📅 ${plan.title}`, plan.description];
                              if (plan.venueName) parts.push(`📍 ${plan.venueName}`);
                              if (plan.venueAddress) parts.push(plan.venueAddress);
                              if (plan.suggestedDate) parts.push(`📆 ${new Date(plan.suggestedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${plan.suggestedTime ? ` at ${plan.suggestedTime}` : ''}`);
                              onInviteToChat(parts.join('\n\n'));
                              setIsExpanded(false);
                            }}
                            style={[styles.actionButton, styles.inviteButton]}
                          >
                            <Text style={styles.inviteButtonText}>Invite</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </LinearGradient>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.datePickerModal}>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>Change day & time</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.datePickerCloseButton}>
                  <Text style={styles.datePickerCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.datePickerContent}>
                <Text style={styles.datePickerSectionTitle}>📅 Select day</Text>
                <View style={styles.datePickerWheelContainer}>
                  <View style={styles.datePickerWheelOverlay} pointerEvents="none" />
                  <ScrollView
                    style={styles.datePickerWheel}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={50}
                    decelerationRate="fast"
                    contentContainerStyle={styles.datePickerWheelContent}
                    onMomentumScrollEnd={(e) => {
                      const offset = e.nativeEvent.contentOffset.y;
                      const index = Math.round(offset / 50);
                      const newDate = new Date(selectedDate);
                      newDate.setDate(newDate.getDate() + (index - 30));
                      if (newDate >= new Date()) setSelectedDate(newDate);
                    }}
                  >
                    {Array.from({ length: 61 }, (_, i) => {
                      const date = new Date(selectedDate);
                      date.setDate(date.getDate() + (i - 30));
                      const isToday = date.toDateString() === new Date().toDateString();
                      const isSelected = i === 30;
                      return (
                        <View key={i} style={[styles.datePickerWheelItem, isSelected && styles.datePickerWheelItemSelected]}>
                          <Text style={[styles.datePickerWheelText, isSelected && styles.datePickerWheelTextSelected, isToday && styles.datePickerWheelTextToday]}>
                            {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            {isToday && ' (Today)'}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
                <Text style={styles.datePickerSectionTitle}>⏰ Select Time</Text>
                <View style={styles.timePickerContainer}>
                  <View style={styles.timePickerColumn}>
                    <Text style={styles.timePickerLabel}>Hour</Text>
                    <View style={styles.timePickerWheelWrapper}>
                      <View style={styles.timePickerWheelOverlay} pointerEvents="none" />
                      <ScrollView style={styles.timePickerWheel} showsVerticalScrollIndicator={false} snapToInterval={50} decelerationRate="fast" contentContainerStyle={styles.timePickerWheelContent} onMomentumScrollEnd={(e) => {
                        const offset = e.nativeEvent.contentOffset.y;
                        const hour = Math.round(offset / 50) + 1;
                        const newDate = new Date(selectedDate);
                        const isPM = newDate.getHours() >= 12;
                        newDate.setHours(isPM ? hour + 12 : hour);
                        setSelectedDate(newDate);
                      }}>
                        {Array.from({ length: 12 }, (_, i) => {
                          const hour = i + 1;
                          const isSelected = (selectedDate.getHours() % 12 || 12) === hour;
                          return (
                            <View key={i} style={[styles.timePickerWheelItem, isSelected && styles.timePickerWheelItemSelected]}>
                              <Text style={[styles.timePickerWheelText, isSelected && styles.timePickerWheelTextSelected]}>{hour}</Text>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                  <View style={styles.timePickerColumn}>
                    <Text style={styles.timePickerLabel}>Minute</Text>
                    <View style={styles.timePickerWheelWrapper}>
                      <View style={styles.timePickerWheelOverlay} pointerEvents="none" />
                      <ScrollView style={styles.timePickerWheel} showsVerticalScrollIndicator={false} snapToInterval={50} decelerationRate="fast" contentContainerStyle={styles.timePickerWheelContent} onMomentumScrollEnd={(e) => {
                        const offset = e.nativeEvent.contentOffset.y;
                        const minute = Math.max(0, Math.min(59, Math.round(offset / 50)));
                        const newDate = new Date(selectedDate);
                        newDate.setMinutes(minute);
                        setSelectedDate(newDate);
                      }}>
                        {Array.from({ length: 60 }, (_, i) => {
                          const isSelected = selectedDate.getMinutes() === i;
                          return (
                            <View key={i} style={[styles.timePickerWheelItem, isSelected && styles.timePickerWheelItemSelected]}>
                              <Text style={[styles.timePickerWheelText, isSelected && styles.timePickerWheelTextSelected]}>{i.toString().padStart(2, '0')}</Text>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                  <View style={styles.timePickerColumn}>
                    <Text style={styles.timePickerLabel}>AM/PM</Text>
                    <View style={styles.timePickerWheelWrapper}>
                      <View style={styles.timePickerWheelOverlay} pointerEvents="none" />
                      <ScrollView style={styles.timePickerWheel} showsVerticalScrollIndicator={false} snapToInterval={50} decelerationRate="fast" contentContainerStyle={styles.timePickerWheelContent} onMomentumScrollEnd={(e) => {
                        const offset = e.nativeEvent.contentOffset.y;
                        const isPM = Math.round(offset / 50) === 1;
                        const newDate = new Date(selectedDate);
                        const h = newDate.getHours();
                        if (isPM && h < 12) newDate.setHours(h + 12);
                        else if (!isPM && h >= 12) newDate.setHours(h - 12);
                        setSelectedDate(newDate);
                      }}>
                        {['AM', 'PM'].map((period, i) => {
                          const isSelected = (selectedDate.getHours() >= 12) === (i === 1);
                          return (
                            <View key={i} style={[styles.timePickerWheelItem, isSelected && styles.timePickerWheelItemSelected]}>
                              <Text style={[styles.timePickerWheelText, isSelected && styles.timePickerWheelTextSelected]}>{period}</Text>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                </View>
              </View>
              <View style={styles.datePickerFooter}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.datePickerCancelButton}>
                  <Text style={styles.datePickerCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { handleDateChange(selectedDate); setShowDatePicker(false); }} style={styles.datePickerDoneButton}>
                  <Text style={styles.datePickerDoneText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }

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
                  <Text style={styles.generateButtonText}>Generate Hangout Plan</Text>
                  <Text style={styles.generateButtonSubtext}>AI-powered hangout ideas from shared interests</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  const isAccepted = plan?.user1Accepted && plan?.user2Accepted;
  const userAccepted = plan?.suggestedBy === currentUserId
    ? (plan?.user1Accepted || plan?.user2Accepted)
    : (plan?.suggestedBy !== currentUserId ? (plan?.user1Accepted || plan?.user2Accepted) : false);

  // Always show compact preview, modal shows full details
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => {
          console.log('📅 Date plan button clicked, setting isExpanded to true');
          if (Platform.OS === 'ios') {
            Vibration.vibrate(50);
          } else {
            Vibration.vibrate(50);
          }
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
              <Text style={styles.compactTitle} numberOfLines={1}>{plan?.title ?? 'Hangout Plan'}</Text>
              <Text style={styles.compactDescription} numberOfLines={1}>{plan?.description ?? ''}</Text>
              {plan?.venueName && (
                <Text style={styles.compactVenue} numberOfLines={1}>📍 {plan?.venueName}</Text>
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
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
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
          onPress={() => {
            console.log('📅 Modal overlay pressed');
            setIsExpanded(false);
          }}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
          >
            <TouchableOpacity
              onPress={() => {
                console.log('📅 Close button pressed');
                setIsExpanded(false);
              }}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
            <View 
              key={plan.id} // Force re-render when plan changes
              style={[styles.modalScrollContent, { maxHeight: Dimensions.get('window').height * 0.85 }]}
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
                  <TouchableOpacity
                    style={styles.dateSection}
                    onPress={() => {
                      console.log('📅 Date section pressed');
                      if (plan.suggestedDate) {
                        const currentDate = new Date(plan.suggestedDate);
                        if (plan.suggestedTime) {
                          const [hours, minutes] = plan.suggestedTime.split(':');
                          currentDate.setHours(parseInt(hours, 10), parseInt(minutes, 10));
                        }
                        console.log('📅 Setting selected date:', currentDate);
                        setSelectedDate(currentDate);
                        console.log('📅 Closing date plan modal and opening date picker');
                        setIsExpanded(false); // Close the date plan modal first
                        // Use setTimeout to ensure the first modal closes before opening the second
                        setTimeout(() => {
                          console.log('📅 Setting showDatePicker to true');
                          setShowDatePicker(true);
                        }, 300);
                      } else {
                        console.log('⚠️ No suggested date in plan');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dateLabel}>📅 When to meet</Text>
                    <View style={styles.dateRow}>
                      <Text style={styles.dateText}>
                        {new Date(plan.suggestedDate).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                        {plan.suggestedTime && ` at ${plan.suggestedTime}`}
                      </Text>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          console.log('📅 Pencil icon pressed');
                          if (plan.suggestedDate) {
                            const currentDate = new Date(plan.suggestedDate);
                            if (plan.suggestedTime) {
                              const [hours, minutes] = plan.suggestedTime.split(':');
                              currentDate.setHours(parseInt(hours, 10), parseInt(minutes, 10));
                            }
                            console.log('📅 Setting selected date:', currentDate);
                            setSelectedDate(currentDate);
                            console.log('📅 Closing date plan modal and opening date picker');
                            setIsExpanded(false); // Close the date plan modal first
                            // Use setTimeout to ensure the first modal closes before opening the second
                            setTimeout(() => {
                              console.log('📅 Setting showDatePicker to true');
                              setShowDatePicker(true);
                            }, 300);
                          }
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.editDateText}>✏️</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
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
                        if (Platform.OS === 'ios' || Platform.OS === 'android') Vibration.vibrate(50);
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
                      onPress={handleRegenerate}
                      disabled={updating}
                      style={[styles.actionButton, styles.regenerateButton]}
                    >
                      <View style={styles.actionButtonInner}>
                        <Text style={styles.regenerateButtonText} numberOfLines={1}>
                          {updating ? 'Generating...' : 'New hangout plan'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {onInviteToChat && plan && (
                      <TouchableOpacity
                        onPress={() => {
                          const parts = [`📅 ${plan.title}`, plan.description];
                          if (plan.venueName) parts.push(`📍 ${plan.venueName}`);
                          if (plan.venueAddress) parts.push(plan.venueAddress);
                          if (plan.suggestedDate) parts.push(`📆 ${new Date(plan.suggestedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${plan.suggestedTime ? ` at ${plan.suggestedTime}` : ''}`);
                          onInviteToChat(parts.join('\n\n'));
                          setIsExpanded(false);
                        }}
                        style={[styles.actionButton, styles.inviteButton]}
                      >
                        <Text style={styles.inviteButtonText}>Invite</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </LinearGradient>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Date Picker Modal - Outside date plan modal to avoid nesting issues */}
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          console.log('📅 Date picker modal onRequestClose');
          setShowDatePicker(false);
        }}
      >
        <View style={styles.datePickerModal}>
          <View style={styles.datePickerContainer}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>Change day & time</Text>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={styles.datePickerCloseButton}
              >
                <Text style={styles.datePickerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerContent}>
              <Text style={styles.datePickerSectionTitle}>📅 Select day</Text>
              <View style={styles.datePickerWheelContainer}>
                <View style={styles.datePickerWheelOverlay} pointerEvents="none" />
                <ScrollView
                  style={styles.datePickerWheel}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={50}
                  decelerationRate="fast"
                  contentContainerStyle={styles.datePickerWheelContent}
                  onMomentumScrollEnd={(e) => {
                    const offset = e.nativeEvent.contentOffset.y;
                    const index = Math.round(offset / 50);
                    const newDate = new Date(selectedDate);
                    const daysDiff = index - 30;
                    newDate.setDate(newDate.getDate() + daysDiff);
                    if (newDate >= new Date()) {
                      setSelectedDate(newDate);
                    }
                  }}
                >
                  {Array.from({ length: 61 }, (_, i) => {
                    const date = new Date(selectedDate);
                    date.setDate(date.getDate() + (i - 30));
                    const isToday = date.toDateString() === new Date().toDateString();
                    const isSelected = i === 30;
                    return (
                      <View key={i} style={[styles.datePickerWheelItem, isSelected && styles.datePickerWheelItemSelected]}>
                        <Text style={[styles.datePickerWheelText, isSelected && styles.datePickerWheelTextSelected, isToday && styles.datePickerWheelTextToday]}>
                          {date.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                          {isToday && ' (Today)'}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={styles.datePickerSectionTitle}>⏰ Select Time</Text>
              <View style={styles.timePickerContainer}>
                <View style={styles.timePickerColumn}>
                  <Text style={styles.timePickerLabel}>Hour</Text>
                  <View style={styles.timePickerWheelWrapper}>
                    <View style={styles.timePickerWheelOverlay} pointerEvents="none" />
                    <ScrollView
                      style={styles.timePickerWheel}
                      showsVerticalScrollIndicator={false}
                      snapToInterval={50}
                      decelerationRate="fast"
                      contentContainerStyle={styles.timePickerWheelContent}
                      onMomentumScrollEnd={(e) => {
                        const offset = e.nativeEvent.contentOffset.y;
                        const hour = Math.round(offset / 50) + 1;
                        const newDate = new Date(selectedDate);
                        const isPM = newDate.getHours() >= 12;
                        newDate.setHours(isPM ? hour + 12 : hour);
                        setSelectedDate(newDate);
                      }}
                    >
                      {Array.from({ length: 12 }, (_, i) => {
                        const hour = i + 1;
                        const isSelected = (selectedDate.getHours() % 12 || 12) === hour;
                        return (
                          <View key={i} style={[styles.timePickerWheelItem, isSelected && styles.timePickerWheelItemSelected]}>
                            <Text style={[styles.timePickerWheelText, isSelected && styles.timePickerWheelTextSelected]}>
                              {hour}
                            </Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
                <View style={styles.timePickerColumn}>
                  <Text style={styles.timePickerLabel}>Minute</Text>
                  <View style={styles.timePickerWheelWrapper}>
                    <View style={styles.timePickerWheelOverlay} pointerEvents="none" />
                    <ScrollView
                      style={styles.timePickerWheel}
                      showsVerticalScrollIndicator={false}
                      snapToInterval={50}
                      decelerationRate="fast"
                      contentContainerStyle={styles.timePickerWheelContent}
                      onMomentumScrollEnd={(e) => {
                        const offset = e.nativeEvent.contentOffset.y;
                        const minute = Math.max(0, Math.min(59, Math.round(offset / 50)));
                        const newDate = new Date(selectedDate);
                        newDate.setMinutes(minute);
                        setSelectedDate(newDate);
                      }}
                    >
                      {Array.from({ length: 60 }, (_, i) => {
                        const isSelected = selectedDate.getMinutes() === i;
                        return (
                          <View key={i} style={[styles.timePickerWheelItem, isSelected && styles.timePickerWheelItemSelected]}>
                            <Text style={[styles.timePickerWheelText, isSelected && styles.timePickerWheelTextSelected]}>
                              {i.toString().padStart(2, '0')}
                            </Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
                <View style={styles.timePickerColumn}>
                  <Text style={styles.timePickerLabel}>AM/PM</Text>
                  <View style={styles.timePickerWheelWrapper}>
                    <View style={styles.timePickerWheelOverlay} pointerEvents="none" />
                    <ScrollView
                      style={styles.timePickerWheel}
                      showsVerticalScrollIndicator={false}
                      snapToInterval={50}
                      decelerationRate="fast"
                      contentContainerStyle={styles.timePickerWheelContent}
                      onMomentumScrollEnd={(e) => {
                        const offset = e.nativeEvent.contentOffset.y;
                        const isPM = Math.round(offset / 50) === 1;
                        const newDate = new Date(selectedDate);
                        const currentHour = newDate.getHours();
                        if (isPM && currentHour < 12) {
                          newDate.setHours(currentHour + 12);
                        } else if (!isPM && currentHour >= 12) {
                          newDate.setHours(currentHour - 12);
                        }
                        setSelectedDate(newDate);
                      }}
                    >
                      {['AM', 'PM'].map((period, i) => {
                        const isSelected = (selectedDate.getHours() >= 12) === (i === 1);
                        return (
                          <View key={i} style={[styles.timePickerWheelItem, isSelected && styles.timePickerWheelItemSelected]}>
                            <Text style={[styles.timePickerWheelText, isSelected && styles.timePickerWheelTextSelected]}>
                              {period}
                            </Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.datePickerFooter}>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={styles.datePickerCancelButton}
              >
                <Text style={styles.datePickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  handleDateChange(selectedDate);
                  setShowDatePicker(false);
                }}
                style={styles.datePickerDoneButton}
              >
                <Text style={styles.datePickerDoneText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  headerIconButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  headerIconEmoji: {
    fontSize: 24,
  },
  headerModalLoading: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerModalLoadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#667eea',
    fontWeight: '600',
  },
  generateButton: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  generateButtonTouchable: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'transparent',
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  modalContent: {
    width: '95%',
    maxWidth: 500,
    alignSelf: 'center',
    backgroundColor: 'transparent',
    borderRadius: 20,
    overflow: 'hidden',
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
    padding: 12,
  },
  planCard: {
    padding: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  planTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  planDescription: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
    opacity: 0.95,
  },
  venueSection: {
    marginBottom: 8,
  },
  venueLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    opacity: 0.9,
  },
  venueName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  venueAddress: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.8,
  },
  dateSection: {
    marginBottom: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dateLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    opacity: 0.9,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  editDateText: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.8,
    marginLeft: 8,
  },
  budgetSection: {
    marginBottom: 8,
  },
  budgetLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    opacity: 0.9,
  },
  budgetText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  topicsSection: {
    marginBottom: 8,
  },
  topicsLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    opacity: 0.9,
  },
  topicText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 2,
    opacity: 0.9,
  },
  acceptedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  acceptedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    minWidth: 90,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  actionButtonInner: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 20,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  regenerateButton: {
    backgroundColor: '#FFC107',
  },
  regenerateButtonText: {
    color: '#000000',
    fontSize: 14,
  },
  inviteButton: {
    backgroundColor: '#667eea',
  },
  inviteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  datePickerModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingBottom: 24,
    width: '90%',
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    paddingBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fafafa',
  },
  datePickerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: 0.5,
    flex: 1,
  },
  datePickerCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerCloseText: {
    color: '#666',
    fontSize: 18,
    fontWeight: '600',
  },
  datePickerFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 18,
    paddingTop: 16,
    borderTopWidth: 1.5,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fafafa',
    gap: 12,
  },
  datePickerCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    minWidth: 100,
    alignItems: 'center',
  },
  datePickerCancelText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  datePickerDoneButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
    minWidth: 100,
    alignItems: 'center',
  },
  datePickerDoneText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  datePickerContent: {
    padding: 20,
    paddingTop: 10,
  },
  datePickerSectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  datePickerWheelContainer: {
    height: 180,
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: '#f0e6ff',
  },
  datePickerWheel: {
    flex: 1,
  },
  datePickerWheelContent: {
    paddingVertical: 65,
  },
  datePickerWheelOverlay: {
    position: 'absolute',
    top: 65,
    left: 0,
    right: 0,
    height: 50,
    borderTopWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: '#667eea',
    zIndex: 1,
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
  },
  datePickerWheelItem: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginHorizontal: 12,
    borderRadius: 12,
  },
  datePickerWheelItemSelected: {
    backgroundColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  datePickerWheelText: {
    fontSize: 15,
    color: '#999',
    fontWeight: '500',
  },
  datePickerWheelTextSelected: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: 0.3,
  },
  datePickerWheelTextToday: {
    fontWeight: '700',
    color: '#764ba2',
  },
  timePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    height: 180,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: '#f0e6ff',
  },
  timePickerColumn: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
    justifyContent: 'flex-start',
  },
  timePickerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#764ba2',
    marginTop: 12,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  timePickerWheelWrapper: {
    flex: 1,
    width: '100%',
    position: 'relative',
    height: 180,
  },
  timePickerWheel: {
    flex: 1,
    width: '100%',
  },
  timePickerWheelContent: {
    paddingTop: 65,
    paddingBottom: 65,
  },
  timePickerWheelOverlay: {
    position: 'absolute',
    top: 65,
    left: 0,
    right: 0,
    height: 50,
    borderTopWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: '#667eea',
    zIndex: 1,
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
  },
  timePickerWheelItem: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
    borderRadius: 12,
  },
  timePickerWheelItemSelected: {
    backgroundColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  timePickerWheelText: {
    fontSize: 17,
    color: '#999',
    fontWeight: '500',
  },
  timePickerWheelTextSelected: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 22,
    letterSpacing: 0.5,
  },
});

