import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

interface Reflection {
  id: string;
  userId: string;
  matchId: string | null;
  reflectionType: 'unmatch' | 'date' | 'general';
  title: string | null;
  content: string;
  tags: string[];
  dateType: string | null;
  secondDatePlanned: boolean;
  insights: string | null;
  createdAt: string;
}

interface Insights {
  connectionPatterns: string[];
  dateSuccessFactors: string[];
  personalGrowth: string[];
  recommendations: string[];
}

export default function JourneyScreen() {
  const { user } = useAuth();
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [showReflectionModal, setShowReflectionModal] = useState(false);
  const [reflectionContent, setReflectionContent] = useState('');
  const [reflectionTags, setReflectionTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchReflections();
    fetchInsights();
  }, []);

  const fetchReflections = async () => {
    try {
      setLoading(true);
      const response = await api.get('/memory-bank/reflections');
      setReflections(response.reflections || []);
    } catch (error) {
      console.error('Failed to fetch reflections:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInsights = async () => {
    try {
      setLoadingInsights(true);
      const response = await api.get('/memory-bank/insights');
      setInsights(response.insights);
    } catch (error) {
      console.error('Failed to fetch insights:', error);
    } finally {
      setLoadingInsights(false);
    }
  };

  const handleSaveReflection = async () => {
    if (!reflectionContent.trim()) {
      Alert.alert('Error', 'Please enter some reflection content');
      return;
    }

    try {
      setSaving(true);
      await api.post('/memory-bank/reflections', {
        reflectionType: 'general',
        content: reflectionContent,
        tags: reflectionTags,
      });
      setShowReflectionModal(false);
      setReflectionContent('');
      setReflectionTags([]);
      fetchReflections();
      fetchInsights(); // Refresh insights after new reflection
      Alert.alert('Success', 'Reflection saved!');
    } catch (error) {
      console.error('Failed to save reflection:', error);
      Alert.alert('Error', 'Failed to save reflection');
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (tag: string) => {
    if (reflectionTags.includes(tag)) {
      setReflectionTags(reflectionTags.filter((t) => t !== tag));
    } else {
      setReflectionTags([...reflectionTags, tag]);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const groupReflectionsByMonth = (refs: Reflection[]) => {
    const grouped: { [key: string]: Reflection[] } = {};
    refs.forEach((ref) => {
      const date = new Date(ref.createdAt);
      const monthKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(ref);
    });
    return grouped;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B1538" />
        <Text style={styles.loadingText}>Loading your journey...</Text>
      </View>
    );
  }

  const groupedReflections = groupReflectionsByMonth(reflections);

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>🌱</Text>
            <Text style={styles.headerTitle}>Your Dating Journey</Text>
            <Text style={styles.headerSubtitle}>Reflect, learn, and grow</Text>
          </View>
        </LinearGradient>

        {/* Add Reflection Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowReflectionModal(true)}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addButtonGradient}
          >
            <Text style={styles.addButtonText}>+ Add Reflection</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Insights Section */}
        {insights && (
          <View style={styles.insightsSection}>
            <Text style={styles.insightsTitle}>🧠 Your Dating Patterns</Text>
            <Text style={styles.insightsSubtitle}>Based on your journey, here's what we've learned:</Text>

            {insights.connectionPatterns.length > 0 && (
              <View style={styles.insightCard}>
                <Text style={styles.insightCardTitle}>💡 Connection Patterns</Text>
                {insights.connectionPatterns.map((pattern, idx) => (
                  <Text key={idx} style={styles.insightText}>• {pattern}</Text>
                ))}
              </View>
            )}

            {insights.dateSuccessFactors.length > 0 && (
              <View style={styles.insightCard}>
                <Text style={styles.insightCardTitle}>📅 Date Success Factors</Text>
                {insights.dateSuccessFactors.map((factor, idx) => (
                  <Text key={idx} style={styles.insightText}>• {factor}</Text>
                ))}
              </View>
            )}

            {insights.personalGrowth.length > 0 && (
              <View style={styles.insightCard}>
                <Text style={styles.insightCardTitle}>🌱 Personal Growth</Text>
                {insights.personalGrowth.map((growth, idx) => (
                  <Text key={idx} style={styles.insightText}>• {growth}</Text>
                ))}
              </View>
            )}

            {insights.recommendations.length > 0 && (
              <View style={styles.insightCard}>
                <Text style={styles.insightCardTitle}>💡 Recommendations</Text>
                {insights.recommendations.map((rec, idx) => (
                  <Text key={idx} style={styles.insightText}>• {rec}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Reflections Timeline */}
        <View style={styles.timelineSection}>
          <Text style={styles.timelineTitle}>📖 Your Reflections</Text>
          {Object.keys(groupedReflections).length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No reflections yet</Text>
              <Text style={styles.emptyStateSubtext}>Start adding reflections to track your journey</Text>
            </View>
          ) : (
            Object.keys(groupedReflections).map((month) => (
              <View key={month} style={styles.monthGroup}>
                <Text style={styles.monthTitle}>{month}</Text>
                {groupedReflections[month].map((reflection) => (
                  <View key={reflection.id} style={styles.reflectionCard}>
                    <LinearGradient
                      colors={['#FFFFFF', '#F9FAFB']}
                      style={styles.reflectionGradient}
                    >
                      <View style={styles.reflectionHeader}>
                        <Text style={styles.reflectionType}>
                          {reflection.reflectionType === 'date' ? '📅' : reflection.reflectionType === 'unmatch' ? '👋' : '💭'}
                        </Text>
                        <Text style={styles.reflectionDate}>{formatDate(reflection.createdAt)}</Text>
                      </View>
                      {reflection.title && (
                        <Text style={styles.reflectionTitle}>{reflection.title}</Text>
                      )}
                      <Text style={styles.reflectionContent}>{reflection.content}</Text>
                      {reflection.tags.length > 0 && (
                        <View style={styles.tagsContainer}>
                          {reflection.tags.map((tag, idx) => (
                            <View key={idx} style={styles.tag}>
                              <Text style={styles.tagText}>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {reflection.dateType && (
                        <Text style={styles.dateType}>Date type: {reflection.dateType}</Text>
                      )}
                      {reflection.secondDatePlanned && (
                        <Text style={styles.secondDate}>✅ Second date planned</Text>
                      )}
                    </LinearGradient>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Add Reflection Modal */}
      <Modal
        visible={showReflectionModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReflectionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Reflection</Text>
            <TextInput
              style={styles.textInput}
              placeholder="What did you learn from this experience?"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={6}
              value={reflectionContent}
              onChangeText={setReflectionContent}
            />
            <Text style={styles.tagsLabel}>Quick tags (optional):</Text>
            <View style={styles.tagsRow}>
              {['Not enough in common', 'Different life goals', 'Timing wasn\'t right', 'Learned about myself'].map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[
                    styles.tagButton,
                    reflectionTags.includes(tag) && styles.tagButtonActive,
                  ]}
                  onPress={() => toggleTag(tag)}
                >
                  <Text style={[
                    styles.tagButtonText,
                    reflectionTags.includes(tag) && styles.tagButtonTextActive,
                  ]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowReflectionModal(false);
                  setReflectionContent('');
                  setReflectionTags([]);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveReflection}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  headerGradient: {
    padding: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  header: {
    alignItems: 'center',
  },
  headerEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  addButton: {
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  addButtonGradient: {
    padding: 16,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  insightsSection: {
    margin: 20,
    marginTop: 0,
  },
  insightsTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  insightsSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 16,
  },
  insightCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  insightCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  insightText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 8,
  },
  timelineSection: {
    margin: 20,
    marginTop: 0,
  },
  timelineTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  monthGroup: {
    marginBottom: 24,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
  },
  reflectionCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  reflectionGradient: {
    padding: 16,
  },
  reflectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reflectionType: {
    fontSize: 20,
  },
  reflectionDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  reflectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  reflectionContent: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  tag: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    color: '#374151',
  },
  dateType: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  secondDate: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  tagsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  tagButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tagButtonActive: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  tagButtonText: {
    fontSize: 14,
    color: '#374151',
  },
  tagButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    backgroundColor: '#667eea',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

