import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { api } from '../utils/api';

interface TokenData {
  availableTokens: number;
  canClaimWeeklyToken: boolean;
}

export default function TokenDisplay() {
  const [data, setData] = useState<TokenData | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      setError('');
      const tokenData = await api.get<TokenData>('/tokens');
      setData(tokenData);
    } catch (err: any) {
      console.error('Failed to fetch tokens:', err);
      setError(err?.message || 'Failed to load tokens');
    }
  };

  const handleClaim = async () => {
    if (claiming || !data?.canClaimWeeklyToken) {
      if (!data?.canClaimWeeklyToken) {
        setError('You cannot claim weekly tokens right now.');
        setTimeout(() => setError(''), 5000);
      }
      return;
    }

    setClaiming(true);
    setError('');
    setSuccess('');

    try {
      const result = await api.post<{ message: string; tokensGranted: number }>('/tokens/claim', {});
      setSuccess(result.message || `${result.tokensGranted} token(s) claimed successfully!`);
      setTimeout(() => setSuccess(''), 3000);
      await fetchTokens();
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to claim tokens. Please try again.';
      setError(errorMessage);
      setTimeout(() => setError(''), 8000);
    } finally {
      setClaiming(false);
    }
  };

  if (!data) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading tokens...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tokenCount}>
        <Text style={styles.tokenIcon}>🎟️</Text>
        <Text style={styles.tokenNumber}>{data.availableTokens}</Text>
        <Text style={styles.tokenLabel}>
          Mulligan Token{data.availableTokens !== 1 ? 's' : ''}
        </Text>
      </View>

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

      {data.canClaimWeeklyToken ? (
        <TouchableOpacity
          style={[styles.claimButton, claiming && styles.claimButtonDisabled]}
          onPress={handleClaim}
          disabled={claiming}
        >
          {claiming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.claimButtonText}>✨ Claim Weekly Tokens</Text>
          )}
        </TouchableOpacity>
      ) : (
        <Text style={styles.cannotClaimText}>
          {data.availableTokens >= 3
            ? 'You already have 3 tokens. Use them to connect!'
            : 'You can claim 3 tokens next week!'}
        </Text>
      )}

      <Text style={styles.infoText}>
        Use tokens to connect with people. Get 3 new tokens each week!
      </Text>

      {/* Test token grant button (for development) */}
      {__DEV__ && (
        <TouchableOpacity
          style={[styles.claimButton, { marginTop: 12, backgroundColor: '#666' }]}
          onPress={async () => {
            try {
              const result = await api.post('/admin/grant-tokens-by-phone', {
                phoneNumber: '+15413163939',
                tokenCount: 10,
              });
              Alert.alert('Success', `Granted ${result.tokensGranted} tokens! You now have ${result.totalAvailableTokens} tokens.`);
              await fetchTokens();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to grant tokens');
            }
          }}
        >
          <Text style={styles.claimButtonText}>🧪 Grant 10 Test Tokens</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  tokenCount: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tokenIcon: {
    fontSize: 32,
    marginRight: 8,
  },
  tokenNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#8B1538',
    marginRight: 8,
  },
  tokenLabel: {
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    width: '100%',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  successContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    width: '100%',
  },
  successText: {
    color: '#10b981',
    fontSize: 14,
    textAlign: 'center',
  },
  claimButton: {
    backgroundColor: '#8B1538',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cannotClaimText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});

