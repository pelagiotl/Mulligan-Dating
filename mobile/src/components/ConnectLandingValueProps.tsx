import React, { memo } from 'react';
import { View, Text, StyleSheet, Platform, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ConnectLandingTagline from './ConnectLandingTagline';
import SmoothPulsingEmoji from './SmoothPulsingEmoji';

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

/** Two-line feature labels — each line stays on one row (avoids orphan letters on narrow Android). */
export function ConnectFeatureLabel({
  lines,
  style,
}: {
  lines: readonly [string, string];
  style: TextStyle;
}) {
  return (
    <View style={featureLabelStyles.stack}>
      {lines.map((line) => (
        <Text
          key={line}
          style={style}
          numberOfLines={1}
          {...(Platform.OS === 'android' ? { textBreakStrategy: 'simple' as const } : {})}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

const featureLabelStyles = StyleSheet.create({
  stack: {
    alignItems: 'center',
  },
});

const LANDING_FEATURE_TILES = ['⛳', '💬', '💚'] as const;

const LANDING_FEATURE_LABELS: readonly [readonly [string, string], readonly [string, string], readonly [string, string]] = [
  ['Golf', 'Dates'],
  ['Hole', 'Prompts'],
  ['Real', 'Chemistry'],
];

const landingFeatureEmojiWrap = {
  marginBottom: 6,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

const LANDING_FEATURE_PULSE_DELAYS: Record<(typeof LANDING_FEATURE_TILES)[number], number> = {
  '⛳': 0,
  '💬': 220,
  '💚': 440,
};

/** Gentle pulsing emoji for Connect landing feature row (BrowseScreen + value props card). */
export function ConnectLandingFeatureEmoji({
  emoji,
  fontSize = 28,
}: {
  emoji: string;
  fontSize?: number;
}) {
  const delay =
    emoji in LANDING_FEATURE_PULSE_DELAYS
      ? LANDING_FEATURE_PULSE_DELAYS[emoji as (typeof LANDING_FEATURE_TILES)[number]]
      : 0;

  return (
    <SmoothPulsingEmoji
      emoji={emoji}
      fontSize={fontSize}
      delay={delay}
      variant="emoji"
      containerStyle={landingFeatureEmojiWrap}
    />
  );
}

interface ConnectLandingValuePropsProps {
  /** When hero title/subtitle are rendered above (Browse landing), show only the three feature tiles. */
  variant?: ConnectLandingValuePropsVariant;
}

/** Dark feature row — matches web `.connect-landing__features` on midnight shell. */
function MidnightFeaturesRow() {
  return (
    <View style={midnightStyles.featuresRow} accessibilityRole="summary">
      {LANDING_FEATURE_TILES.map((emoji, index) => (
        <View key={emoji} style={midnightStyles.feature}>
          <ConnectLandingFeatureEmoji emoji={emoji} fontSize={26} />
          <ConnectFeatureLabel lines={LANDING_FEATURE_LABELS[index]} style={midnightStyles.featureText} />
        </View>
      ))}
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
            <ConnectLandingTagline style={styles.subtitle} />
          </>
        ) : null}
        <View style={[styles.row, featuresOnly && styles.rowFeaturesOnly]}>
          {LANDING_FEATURE_TILES.map((emoji, index) => (
            <View key={emoji} style={styles.feature}>
              <ConnectLandingFeatureEmoji emoji={emoji} />
              <ConnectFeatureLabel lines={LANDING_FEATURE_LABELS[index]} style={styles.featureText} />
            </View>
          ))}
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
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
});
