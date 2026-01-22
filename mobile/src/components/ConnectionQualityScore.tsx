import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Dimensions,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');

interface ConnectionQualityScoreData {
  score: number;
  matchToConversationRate: number;
  conversationDepthAvg: number;
  responseTimeConsistency: number;
  profileCompleteness: number;
  dateSuccessRate: number;
  secondDateRate: number;
  monthlyImprovement: number;
  lastCalculatedAt: string;
}

export default function ConnectionQualityScore({ compact = false, showDetails = false }: { compact?: boolean; showDetails?: boolean }) {
  const { user } = useAuth();
  const [scoreData, setScoreData] = useState<ConnectionQualityScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Array<{ score: number; recordedAt: string }>>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const scoreAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetchScore();
    fetchHistory();
  }, []);

  useEffect(() => {
    if (scoreData) {
      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Score count-up animation
      Animated.timing(scoreAnim, {
        toValue: scoreData.score,
        duration: 1500,
        useNativeDriver: false,
      }).start();
    }
  }, [scoreData]);

  const fetchScore = async () => {
    try {
      setLoading(true);
      const response = await api.get('/connection-quality');
      setScoreData(response.score);
    } catch (error) {
      console.error('Failed to fetch connection quality score:', error);
      // Set default score if API fails
      setScoreData({
        score: 50,
        matchToConversationRate: 0,
        conversationDepthAvg: 0,
        responseTimeConsistency: 50,
        profileCompleteness: 0,
        dateSuccessRate: 0,
        secondDateRate: 0,
        monthlyImprovement: 0,
        lastCalculatedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await api.get('/connection-quality/history?days=90');
      setHistory(response.history || []);
    } catch (error) {
      console.error('Failed to fetch score history:', error);
    }
  };

  const getScoreColor = (score: number): string[] => {
    if (score >= 80) return ['#10B981', '#34D399']; // Green
    if (score >= 60) return ['#3B82F6', '#60A5FA']; // Blue
    if (score >= 40) return ['#F59E0B', '#FBBF24']; // Yellow
    return ['#6B7280', '#9CA3AF']; // Gray
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Average';
    return 'Improving';
  };

  if (loading) {
    return (
      <View style={[styles.container, compact && styles.compactContainer]}>
        <ActivityIndicator size="small" color="#8B1538" />
      </View>
    );
  }

  if (!scoreData) {
    return null;
  }

  const colors = getScoreColor(scoreData.score);
  const label = getScoreLabel(scoreData.score);
  const displayScore = Math.round(scoreData.score);

  // Compact version for Settings screen
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.compactCard}
        >
          <Text style={styles.compactLabel}>Connection Quality</Text>
          <View style={styles.compactScoreRow}>
            <Animated.Text style={[styles.compactScore, { transform: [{ scale: pulseAnim }] }]}>
              {displayScore}
            </Animated.Text>
            <Text style={styles.compactLabelSmall}>{label}</Text>
          </View>
          {scoreData.monthlyImprovement !== 0 && (
            <Text style={styles.compactImprovement}>
              {scoreData.monthlyImprovement > 0 ? '⬆️' : '⬇️'} {Math.abs(scoreData.monthlyImprovement).toFixed(1)}% this month
            </Text>
          )}
        </LinearGradient>
      </View>
    );
  }

  // Full version for Profile screen (clickable)
  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setShowDetailModal(true)}
      >
        <LinearGradient
          colors={['#FFFFFF', '#F9FAFB']}
          style={styles.card}
        >
        <View style={styles.header}>
          <Text style={styles.title}>📊 Your Connection Quality</Text>
        </View>

        <View style={styles.scoreContainer}>
          <Animated.View style={[styles.scoreCircle, { transform: [{ scale: pulseAnim }] }]}>
            <LinearGradient
              colors={colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.scoreGradient}
            >
              <Text style={styles.scoreText}>
                {displayScore}
              </Text>
            </LinearGradient>
          </Animated.View>
          <Text style={styles.scoreLabel}>{label}</Text>
          {scoreData.monthlyImprovement !== 0 && (
            <Text style={styles.improvementText}>
              {scoreData.monthlyImprovement > 0 ? '⬆️' : '⬇️'} {Math.abs(scoreData.monthlyImprovement).toFixed(1)}% this month
            </Text>
          )}
        </View>

        <View style={styles.metricsContainer}>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Profile Completeness</Text>
            <Text style={styles.metricValue}>{Math.round(scoreData.profileCompleteness)}%</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Conversation Rate</Text>
            <Text style={styles.metricValue}>{Math.round(scoreData.matchToConversationRate)}%</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Response Consistency</Text>
            <Text style={styles.metricValue}>{Math.round(scoreData.responseTimeConsistency)}%</Text>
          </View>
        </View>

        {scoreData.monthlyImprovement > 0 && (
          <View style={styles.tipContainer}>
            <Text style={styles.tipText}>
              💡 Keep up the great work! Your connection quality is improving.
            </Text>
          </View>
        )}
        <View style={styles.viewDetailsContainer}>
          <Text style={styles.viewDetailsText}>Tap to view details →</Text>
        </View>
      </LinearGradient>
      </TouchableOpacity>

      {/* Detail Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📊 Connection Quality</Text>
              <TouchableOpacity
                onPress={() => setShowDetailModal(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Score Display */}
              <View style={styles.detailScoreContainer}>
                <Animated.View style={[styles.detailScoreCircle, { transform: [{ scale: pulseAnim }] }]}>
                  <LinearGradient
                    colors={colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.detailScoreGradient}
                  >
                    <Text style={styles.detailScoreText}>{displayScore}</Text>
                  </LinearGradient>
                </Animated.View>
                <Text style={styles.detailScoreLabel}>{label}</Text>
                {scoreData.monthlyImprovement !== 0 && (
                  <Text style={styles.detailImprovementText}>
                    {scoreData.monthlyImprovement > 0 ? '⬆️' : '⬇️'} {Math.abs(scoreData.monthlyImprovement).toFixed(1)}% this month
                  </Text>
                )}
              </View>

              {/* Detailed Metrics */}
              <View style={styles.detailMetricsSection}>
                <Text style={styles.detailSectionTitle}>📈 Your Metrics</Text>
                
                <View style={styles.detailMetricCard}>
                  <View style={styles.detailMetricHeader}>
                    <Text style={styles.detailMetricLabel}>Profile Completeness</Text>
                    <Text style={styles.detailMetricValue}>{Math.round(scoreData.profileCompleteness)}%</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${scoreData.profileCompleteness}%`, backgroundColor: colors[0] }]} />
                  </View>
                  <Text style={styles.detailMetricDescription}>
                    {scoreData.profileCompleteness >= 90 
                      ? 'Your profile is complete! Great job.' 
                      : scoreData.profileCompleteness >= 70
                      ? 'Almost there! Add a few more details to complete your profile.'
                      : 'Complete your profile to improve your score. Add photos, interests, and a bio.'}
                  </Text>
                </View>

                <View style={styles.detailMetricCard}>
                  <View style={styles.detailMetricHeader}>
                    <Text style={styles.detailMetricLabel}>Match-to-Conversation Rate</Text>
                    <Text style={styles.detailMetricValue}>{Math.round(scoreData.matchToConversationRate)}%</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${scoreData.matchToConversationRate}%`, backgroundColor: colors[0] }]} />
                  </View>
                  <Text style={styles.detailMetricDescription}>
                    {scoreData.matchToConversationRate >= 70
                      ? 'Excellent! Most of your matches lead to conversations.'
                      : scoreData.matchToConversationRate >= 50
                      ? 'Good! Try sending the first message to start more conversations.'
                      : 'Start conversations with your matches to improve this metric.'}
                  </Text>
                </View>

                <View style={styles.detailMetricCard}>
                  <View style={styles.detailMetricHeader}>
                    <Text style={styles.detailMetricLabel}>Conversation Depth</Text>
                    <Text style={styles.detailMetricValue}>{Math.round(scoreData.conversationDepthAvg)}%</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${scoreData.conversationDepthAvg}%`, backgroundColor: colors[0] }]} />
                  </View>
                  <Text style={styles.detailMetricDescription}>
                    {scoreData.conversationDepthAvg >= 70
                      ? 'Great! Your messages show genuine engagement.'
                      : scoreData.conversationDepthAvg >= 50
                      ? 'Good! Try asking more open-ended questions to deepen conversations.'
                      : 'Try sending longer, more thoughtful messages to improve engagement.'}
                  </Text>
                </View>

                <View style={styles.detailMetricCard}>
                  <View style={styles.detailMetricHeader}>
                    <Text style={styles.detailMetricLabel}>Response Consistency</Text>
                    <Text style={styles.detailMetricValue}>{Math.round(scoreData.responseTimeConsistency)}%</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${scoreData.responseTimeConsistency}%`, backgroundColor: colors[0] }]} />
                  </View>
                  <Text style={styles.detailMetricDescription}>
                    {scoreData.responseTimeConsistency >= 80
                      ? 'Excellent! You respond consistently and promptly.'
                      : scoreData.responseTimeConsistency >= 60
                      ? 'Good! Try to respond within 1-2 hours when possible.'
                      : 'Responding more consistently will help build better connections.'}
                  </Text>
                </View>
              </View>

              {/* Tips Section */}
              <View style={styles.tipsSection}>
                <Text style={styles.detailSectionTitle}>💡 Tips to Improve</Text>
                {scoreData.profileCompleteness < 90 && (
                  <View style={styles.tipItem}>
                    <Text style={styles.tipBullet}>•</Text>
                    <Text style={styles.tipText}>Complete your profile: Add more photos, interests, and a detailed bio</Text>
                  </View>
                )}
                {scoreData.matchToConversationRate < 70 && (
                  <View style={styles.tipItem}>
                    <Text style={styles.tipBullet}>•</Text>
                    <Text style={styles.tipText}>Start conversations: Send the first message to your matches</Text>
                  </View>
                )}
                {scoreData.conversationDepthAvg < 70 && (
                  <View style={styles.tipItem}>
                    <Text style={styles.tipBullet}>•</Text>
                    <Text style={styles.tipText}>Ask open-ended questions: Show genuine interest in getting to know people</Text>
                  </View>
                )}
                {scoreData.responseTimeConsistency < 80 && (
                  <View style={styles.tipItem}>
                    <Text style={styles.tipBullet}>•</Text>
                    <Text style={styles.tipText}>Respond consistently: Try to reply within 1-2 hours when possible</Text>
                  </View>
                )}
                {scoreData.profileCompleteness >= 90 && scoreData.matchToConversationRate >= 70 && scoreData.conversationDepthAvg >= 70 && scoreData.responseTimeConsistency >= 80 && (
                  <View style={styles.tipItem}>
                    <Text style={styles.tipBullet}>✨</Text>
                    <Text style={styles.tipText}>You're doing great! Keep being authentic and engaging.</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  compactContainer: {
    marginBottom: 15,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  compactCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
  },
  scoreContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  scoreGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scoreLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  improvementText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  metricsContainer: {
    marginTop: 20,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  metricLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  tipContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
  },
  tipText: {
    fontSize: 14,
    color: '#065F46',
    lineHeight: 20,
  },
  // Compact styles
  compactLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  compactScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  compactScore: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  compactLabelSmall: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 0.9,
  },
  compactImprovement: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: 4,
  },
  viewDetailsContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  viewDetailsText: {
    fontSize: 13,
    color: '#667eea',
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '600',
  },
  modalScroll: {
    flex: 1,
  },
  detailScoreContainer: {
    alignItems: 'center',
    padding: 24,
    paddingBottom: 32,
  },
  detailScoreCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  detailScoreGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailScoreText: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  detailScoreLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  detailImprovementText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  detailMetricsSection: {
    padding: 20,
    paddingTop: 0,
  },
  detailSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  detailMetricCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  detailMetricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailMetricLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  detailMetricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  detailMetricDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  tipsSection: {
    padding: 20,
    paddingTop: 0,
  },
  tipItem: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  tipBullet: {
    fontSize: 18,
    color: '#667eea',
    marginRight: 12,
    marginTop: 2,
  },
  tipText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    flex: 1,
  },
});

