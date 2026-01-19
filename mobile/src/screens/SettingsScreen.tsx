import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import LegalFooter from '../components/LegalFooter';

interface SettingsData {
  email: string;
  createdAt: string;
  lastActiveAt: string | null;
}

export default function SettingsScreen() {
  const { logout, refreshProfile } = useAuth();
  const navigation = useNavigation();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Email management
  const [newEmail, setNewEmail] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState(false);

  // Delete account
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Token purchase
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [packages, setPackages] = useState<Array<{
    id: number;
    tokens: number;
    price: number;
    priceFormatted: string;
    pricePerToken: string;
  }>>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await api.get<SettingsData>('/settings');
      setSettings(data);
      setNewEmail(data.email || '');
    } catch (err: any) {
      setError(err?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEmail = async () => {
    setError('');
    setSuccess('');

    if (!newEmail.trim()) {
      setError('Please enter an email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setUpdatingEmail(true);
    try {
      // Update email - password is optional for phone auth users
      await api.put('/settings/email', {
        email: newEmail.trim().toLowerCase(),
      });
      setSuccess('Email updated successfully!');
      setEditingEmail(false);
      await fetchSettings();
    } catch (err: any) {
      setError(err?.message || 'Failed to update email');
    } finally {
      setUpdatingEmail(false);
    }
  };


  const fetchPackages = async () => {
    try {
      setLoadingPackages(true);
      setError('');
      console.log('🔄 Fetching token packages...');
      const response = await api.get<{ packages: Array<{
        id: number;
        tokens: number;
        price: number;
        priceFormatted: string;
        pricePerToken: string;
      }> }>('/payments/packages');
      console.log('✅ Packages fetched:', response);
      setPackages(response.packages || []);
    } catch (err: any) {
      console.error('❌ Failed to fetch packages:', err);
      console.error('Error details:', {
        message: err?.message,
        status: err?.status,
        name: err?.name,
        stack: err?.stack
      });
      const errorMessage = err?.message || 'Failed to load token packages. Please try again.';
      setError(errorMessage);
      Alert.alert('Error', `Failed to load token packages: ${errorMessage}`);
      setShowPurchaseModal(false);
    } finally {
      setLoadingPackages(false);
    }
  };

  const handlePurchase = async (packageId: number) => {
    try {
      setPurchasing(true);
      setError('');

      console.log('🛒 Purchase initiated for package ID:', packageId);
      
      // Create payment intent
      const paymentIntent = await api.post<{
        clientSecret: string;
        paymentIntentId: string;
        amount: number;
        tokensToGrant: number;
      }>('/payments/create-intent', { packageId });

      console.log('✅ Payment intent created:', {
        packageId,
        tokensToGrant: paymentIntent.tokensToGrant,
        amount: paymentIntent.amount,
        paymentIntentId: paymentIntent.paymentIntentId
      });

      // TODO: For Expo Go, Stripe PaymentSheet requires a development build
      // For now, show a message that payment processing will be available in production
      // When ready for production, you'll need to:
      // 1. Create a development build with: npx expo prebuild && npx expo run:ios
      // 2. Re-enable StripeProvider in App.tsx
      // 3. Uncomment PaymentSheet code below
      
      Alert.alert(
        'Payment Integration',
        `Payment intent created for ${paymentIntent.tokensToGrant} token${paymentIntent.tokensToGrant !== 1 ? 's' : ''}. \n\nNote: Full payment processing requires a development build (not Expo Go). This will work in production builds.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setShowPurchaseModal(false);
              setPurchasing(false);
            }
          }
        ]
      );
    } catch (err: any) {
      console.error('Purchase error:', err);
      const errorMessage = err?.message || 'Failed to process purchase. Please try again.';
      setError(errorMessage);
      Alert.alert('Purchase Failed', errorMessage);
    } finally {
      setPurchasing(false);
    }
  };

  const handleDeleteAccount = async () => {
    setError('');

    Alert.alert(
      'Delete Account',
      'Are you absolutely sure? This will permanently delete your account, profile, matches, and messages. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.post('/settings/delete-account', {});
              logout();
              navigation.reset({
                index: 0,
                routes: [{ name: 'PhoneLogin' as never }],
              });
            } catch (err: any) {
              setError(err?.message || 'Failed to delete account');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <LinearGradient
              colors={['#fff', '#f8f9ff']}
              style={styles.headerIconContainer}
            >
              <Text style={styles.headerIcon}>⚙️</Text>
            </LinearGradient>
            <Text style={styles.headerTitle}>Settings</Text>
            <Text style={styles.headerSubtitle}>Manage your account preferences</Text>
          </View>
        </LinearGradient>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      ) : null}

      {success ? (
        <View style={styles.successContainer}>
          <Text style={styles.successText}>✅ {success}</Text>
        </View>
      ) : null}

      {/* Account Info */}
      <View style={styles.section}>
        <View style={styles.sectionTitleContainer}>
          <Text style={styles.sectionEmoji}>👤</Text>
          <Text style={styles.sectionTitle}>Account Information</Text>
        </View>
        <View style={styles.infoCard}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>📧 Email</Text>
            {!editingEmail ? (
              <View style={styles.infoValueContainer}>
                <Text style={styles.infoValue}>{settings?.email || 'Not set'}</Text>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => {
                    setEditingEmail(true);
                    setNewEmail(settings?.email || '');
                    setError('');
                    setSuccess('');
                  }}
                >
                  <Text style={styles.editButtonText}>{settings?.email ? 'Edit' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.emailEditContainer}>
                <TextInput
                  style={styles.emailInput}
                  placeholder="Enter your email"
                  placeholderTextColor="#999"
                  value={newEmail}
                  onChangeText={setNewEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.emailEditActions}>
                  <TouchableOpacity
                    style={[styles.emailActionButton, styles.cancelButton]}
                    onPress={() => {
                      setEditingEmail(false);
                      setNewEmail(settings?.email || '');
                      setError('');
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.emailActionButton, updatingEmail && styles.buttonDisabled]}
                    onPress={handleUpdateEmail}
                    disabled={updatingEmail}
                  >
                    <LinearGradient
                      colors={updatingEmail ? ['#a0aec0', '#718096'] : ['#667eea', '#764ba2', '#f093fb']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.saveButton}
                    >
                      {updatingEmail ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.saveButtonText}>Save</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          <View style={styles.divider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>🎉 Member Since</Text>
            <Text style={styles.infoValue}>
              {settings?.createdAt
                ? new Date(settings.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'N/A'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>🟢 Last Active</Text>
            <Text style={styles.infoValue}>
              {settings?.lastActiveAt
                ? new Date(settings.lastActiveAt).toLocaleString()
                : 'Just now'}
            </Text>
          </View>
        </View>
      </View>

      {/* Buy Tokens */}
      <View style={styles.section}>
        <View style={styles.sectionTitleContainer}>
          <Text style={styles.sectionEmoji}>💳</Text>
          <Text style={styles.sectionTitle}>Buy Tokens</Text>
        </View>
        <Text style={styles.sectionDescription}>
          Need more tokens to connect with people? Purchase Mulligan tokens to get more matches.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            setShowPurchaseModal(true);
            fetchPackages();
          }}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2', '#f093fb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryButton}
          >
            <Text style={[styles.buttonText, styles.primaryButtonText]}>💳 Buy Tokens</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Test: Delete Profile (Temporary) */}
      <View style={[styles.section, styles.testSection]}>
        <View style={styles.sectionTitleContainer}>
          <Text style={styles.sectionEmoji}>🧪</Text>
          <Text style={styles.sectionTitle}>Test: Delete Profile</Text>
        </View>
        <Text style={styles.testText}>
          This will delete your profile (but keep your account). You'll be redirected to create a new profile. Use this to test the profile creation flow.
        </Text>
        <TouchableOpacity
          style={[styles.button, styles.testButton]}
          onPress={async () => {
            Alert.alert(
              'Delete Profile (Test)',
              'This will delete your profile data. Your account will remain, but you\'ll need to recreate your profile. This is for testing purposes only.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Profile',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setLoading(true);
                      await api.delete('/profile');
                      // Refresh auth to clear profile
                      await refreshProfile();
                      // Navigate to create profile - need to navigate to root stack
                      try {
                        const rootNavigation = (navigation as any).getParent?.() || navigation;
                        if (rootNavigation && rootNavigation.navigate) {
                          rootNavigation.navigate('CreateProfile');
                        } else {
                          // Fallback: use reset if navigate doesn't work
                          (navigation as any).reset({
                            index: 0,
                            routes: [{ name: 'CreateProfile' }],
                          });
                        }
                      } catch (navErr: any) {
                        console.error('Navigation error:', navErr);
                        // If navigation fails, the profile check in AppNavigator should handle redirect
                      }
                    } catch (err: any) {
                      Alert.alert('Error', err?.message || 'Failed to delete profile');
                      setLoading(false);
                    }
                  },
                },
              ]
            );
          }}
        >
          <Text style={[styles.buttonText, styles.testButtonText]}>🧪 Delete My Profile (Test)</Text>
        </TouchableOpacity>
      </View>

      {/* Delete Account */}
      <View style={[styles.section, styles.dangerSection]}>
        <View style={styles.sectionTitleContainer}>
          <Text style={styles.sectionEmoji}>⚠️</Text>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
        </View>
        {!showDeleteConfirm ? (
          <View>
            <Text style={styles.dangerText}>
              Deleting your account will permanently remove all your data, matches, and messages. This cannot be undone.
            </Text>
            <TouchableOpacity
              style={[styles.button, styles.dangerButton]}
              onPress={() => setShowDeleteConfirm(true)}
            >
              <Text style={[styles.buttonText, styles.dangerButtonText]}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.dangerText}>
              This action cannot be undone. All your data will be permanently deleted.
            </Text>
            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                }}
              >
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.dangerButton, deleting && styles.buttonDisabled]}
                onPress={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.buttonText, styles.dangerButtonText]}>Yes, Delete My Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.button, styles.logoutButton]}
          onPress={() => {
            Alert.alert('Logout', 'Are you sure you want to logout?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Logout',
                style: 'destructive',
                onPress: () => {
                  logout();
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'PhoneLogin' as never }],
                  });
                },
              },
            ]);
          }}
        >
          <Text style={[styles.buttonText, styles.logoutButtonText]}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Legal Footer */}
      <LegalFooter />
      </ScrollView>

      {/* Purchase Modal */}
      <Modal
        visible={showPurchaseModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPurchaseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Buy Mulligan Tokens</Text>
              <TouchableOpacity onPress={() => setShowPurchaseModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingPackages ? (
              <ActivityIndicator size="large" color="#8B1538" style={styles.modalLoading} />
            ) : (
              <ScrollView style={styles.packagesList}>
                {packages.map((pkg) => (
                  <TouchableOpacity
                    key={pkg.id}
                    style={[
                      styles.packageItem,
                      (pkg.id === 3 || pkg.id === 10) && styles.packageItemBestValue
                    ]}
                    onPress={() => handlePurchase(pkg.id)}
                    disabled={purchasing}
                  >
                    <View style={styles.packageHeader}>
                      <Text style={styles.packageTokens}>{pkg.tokens} Token{pkg.tokens > 1 ? 's' : ''}</Text>
                      {(pkg.id === 3 || pkg.id === 10) && (
                        <Text style={styles.bestValueBadge}>Best Value</Text>
                      )}
                    </View>
                    <Text style={styles.packagePrice}>{pkg.priceFormatted}</Text>
                    <Text style={styles.packagePricePerToken}>
                      ${pkg.pricePerToken} per token
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {purchasing && (
              <View style={styles.purchasingOverlay}>
                <ActivityIndicator size="large" color="#8B1538" />
                <Text style={styles.purchasingText}>Processing payment...</Text>
              </View>
            )}
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
    padding: 24,
    paddingTop: 0,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 36,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    marginBottom: 28,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 14,
    borderWidth: 3,
    borderColor: '#fff',
    marginHorizontal: 16,
  },
  header: {
    alignItems: 'center',
  },
  headerIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 5,
    borderColor: '#fff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  headerIcon: {
    fontSize: 48,
  },
  headerTitle: {
    fontSize: 42,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 12,
    letterSpacing: -1,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  headerSubtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.98)',
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  successContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  successText: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '600',
  },
  section: {
    marginBottom: 28,
    marginHorizontal: 16,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionEmoji: {
    fontSize: 28,
    marginRight: 14,
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 32,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 14,
    borderWidth: 3,
    borderColor: '#fff',
  },
  infoItem: {
    paddingVertical: 18,
  },
  infoLabel: {
    fontSize: 13,
    color: '#667eea',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  infoValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  infoValueContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: 1.5,
    backgroundColor: '#f0f0f0',
    marginVertical: 6,
    borderRadius: 1,
  },
  editButton: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#f8f9ff',
    borderWidth: 2.5,
    borderColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#667eea',
    letterSpacing: 0.6,
  },
  emailEditContainer: {
    marginTop: 8,
  },
  emailInput: {
    backgroundColor: '#f8f9ff',
    borderWidth: 3,
    borderColor: '#667eea',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 18,
    color: '#1a1a1a',
    marginBottom: 18,
    fontWeight: '600',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  emailEditActions: {
    flexDirection: 'row',
    gap: 12,
  },
  emailActionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  cancelButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#666',
    letterSpacing: 0.4,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.4,
  },
  formContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    borderRadius: 28,
    marginTop: 12,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  primaryButton: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: '#667eea',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  dangerButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  logoutButton: {
    backgroundColor: '#666',
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#666',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  secondaryButtonText: {
    color: '#667eea',
  },
  dangerButtonText: {
    color: '#fff',
  },
  logoutButtonText: {
    color: '#fff',
  },
  dangerSection: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 32,
    padding: 32,
    borderWidth: 3,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  dangerText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    lineHeight: 24,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 24,
    marginBottom: 20,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  primaryButton: {
    backgroundColor: '#8B1538',
  },
  primaryButtonText: {
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '80%',
    paddingBottom: 24,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 3,
    borderColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 2,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  modalClose: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  modalLoading: {
    padding: 40,
  },
  packagesList: {
    padding: 20,
  },
  packageItem: {
    borderWidth: 2.5,
    borderColor: '#e5e7eb',
    borderRadius: 24,
    padding: 24,
    marginBottom: 18,
    backgroundColor: '#fff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  packageItemBestValue: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
    borderWidth: 3.5,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  packageTokens: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  bestValueBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  packagePrice: {
    fontSize: 28,
    fontWeight: '800',
    color: '#8B1538',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  packagePricePerToken: {
    fontSize: 14,
    color: '#666',
  },
  purchasingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  purchasingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  testSection: {
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: 32,
    padding: 32,
    borderWidth: 3,
    borderColor: 'rgba(255, 193, 7, 0.3)',
    borderStyle: 'dashed',
    marginBottom: 28,
  },
  testText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    lineHeight: 24,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  testButton: {
    backgroundColor: '#ffc107',
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ffc107',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  testButtonText: {
    color: '#1a1a1a',
    fontWeight: '900',
  },
});
