import React, { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const INK = '#1a1a2e';
const BURGUNDY = '#8B1538';

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: INK,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
      }
    : { elevation: 3 };

type ConnectLandingValuePropsVariant = 'full' | 'featuresOnly' | 'midnightFeatures';

interface ConnectLandingValuePropsProps {
  /** When hero title/subtitle are rendered above (Browse landing), show only the three feature tiles. */
  variant?: ConnectLandingValuePropsVariant;
}

/** Dark feature row — matches web `.connect-landing__features` on midnight shell. */
function MidnightFeaturesRow() {
  return (
    <View style={midnightStyles.featuresRow} accessibilityRole="summary">
      <View style={midnightStyles.feature}>
        <Text style={midnightStyles.featureEmoji} allowFontScaling={false}>
          ✨
        </Text>
        <Text style={midnightStyles.featureText}>
          Quality{'\n'}Matches
        </Text>
      </View>
      <View style={midnightStyles.feature}>
        <Text style={midnightStyles.featureEmoji} allowFontScaling={false}>
          🎯
        </Text>
        <Text style={midnightStyles.featureText}>
          Shared{'\n'}Interests
        </Text>
      </View>
      <View style={midnightStyles.feature}>
        <Text style={midnightStyles.featureEmoji} allowFontScaling={false}>
          💝
        </Text>
        <Text style={midnightStyles.featureText}>
          Meaningful{'\n'}Connections
        </Text>
      </View>
    </View>
  );
}

/** Connect tab landing: same value prop as web Browse (no “limited supply”). */
const ConnectLandingValueProps = memo(function ConnectLandingValueProps({
  variant = 'full',
}: ConnectLandingValuePropsProps) {
  if (variant === 'midnightFeatures') {
    return <MidnightFeaturesRow />;
  }

  const featuresOnly = variant === 'featuresOnly';

  return (
    <View style={[styles.outer, cardShadow]} accessibilityRole="summary">
      <LinearGradient
        colors={['#ffffff', '#fff9fa', '#f8f7fc']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.shell, featuresOnly && styles.shellFeaturesOnly]}
      >
        <LinearGradient
          colors={['#d9467a', BURGUNDY, '#6b0d2e']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.accentBar}
        />
        {!featuresOnly ? (
          <>
            <Text style={styles.title}>Discover People</Text>
            <Text style={styles.subtitle}>
              Find someone who shares your interests and values
            </Text>
          </>
        ) : null}
        <View style={[styles.row, featuresOnly && styles.rowFeaturesOnly]}>
          <View style={styles.feature}>
            <Text style={styles.emoji} accessibilityLabel="Sparkle">
              ✨
            </Text>
            <Text style={styles.featureText}>
              Quality{'\n'}Matches
            </Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.emoji} accessibilityLabel="Target">
              🎯
            </Text>
            <Text style={styles.featureText}>
              Shared{'\n'}Interests
            </Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.emoji} accessibilityLabel="Heart gift">
              💝
            </Text>
            <Text style={styles.featureText}>
              Meaningful{'\n'}Connections
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    marginBottom: 18,
    borderRadius: 22,
  },
  shell: {
    width: '100%',
    borderRadius: 22,
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139, 21, 56, 0.1)',
  },
  shellFeaturesOnly: {
    paddingTop: 14,
    paddingBottom: 16,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: INK,
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: 'rgba(26, 26, 46, 0.55)',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowFeaturesOnly: {
    marginTop: 2,
  },
  feature: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 26, 46, 0.06)',
  },
  emoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  featureText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(26, 26, 46, 0.72)',
    textAlign: 'center',
    lineHeight: 14,
  },
});

export default ConnectLandingValueProps;

const midnightStyles = StyleSheet.create({
  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 28,
    width: '100%',
    paddingHorizontal: 4,
  },
  feature: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  featureEmoji: {
    fontSize: 28,
    lineHeight: 32,
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  featureText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 15,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
