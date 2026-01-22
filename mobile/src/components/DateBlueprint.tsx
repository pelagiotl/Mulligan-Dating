import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
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

  useEffect(() => {
    fetchPlan();
  }, [matchId]);

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
      setPlan(response.data.plan);
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        console.error('Failed to fetch date plan:', error);
      }
      // 404 is expected if no plan exists yet
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
              console.log('📅 Date plan response:', response.data);
              if (response.data?.plan) {
                setPlan(response.data.plan);
                Alert.alert('✨ Date Plan Created!', 'Check out your personalized date plan below.');
              } else {
                console.error('❌ No plan in response:', response.data);
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
              setPlan(response.data.plan);
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
        setPlan(response.data.plan);
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
    return (
      <View style={styles.container}>
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={generating}
          style={styles.generateButton}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.generateButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
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
      </View>
    );
  }

  const isAccepted = plan.user1Accepted && plan.user2Accepted;
  const userAccepted = plan.suggestedBy === currentUserId
    ? (plan.user1Accepted || plan.user2Accepted)
    : (plan.suggestedBy !== currentUserId ? (plan.user1Accepted || plan.user2Accepted) : false);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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
              onPress={() => handleAction('accept')}
              disabled={updating || userAccepted}
              style={[styles.actionButton, styles.acceptButton, userAccepted && styles.disabledButton]}
            >
              <Text style={styles.actionButtonText}>
                {userAccepted ? '✓ Accepted' : 'Accept'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAction('modify')}
              disabled={updating}
              style={[styles.actionButton, styles.modifyButton]}
            >
              <Text style={styles.actionButtonText}>Modify</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAction('decline')}
              disabled={updating}
              style={[styles.actionButton, styles.declineButton]}
            >
              <Text style={styles.actionButtonText}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    paddingHorizontal: 20,
  },
  generateButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  generateButtonGradient: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButtonEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  generateButtonSubtext: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
  },
  planCard: {
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  planTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  planDescription: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
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

