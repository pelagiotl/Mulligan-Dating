import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

export const legalDocContentStyles = StyleSheet.create({
  section: {
    marginBottom: 28,
    paddingBottom: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.08)',
  },
  sectionLast: {
    marginBottom: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#5c1423',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(225, 29, 72, 0.15)',
  },
  subHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6b2d3a',
    marginTop: 14,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    color: '#334155',
    marginBottom: 10,
  },
  bullet: {
    fontSize: 15,
    lineHeight: 24,
    color: '#334155',
    marginLeft: 4,
    marginBottom: 8,
    paddingLeft: 10,
  },
  bold: {
    fontWeight: '700',
    color: '#1e293b',
  },
  contactBox: {
    marginTop: 10,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(225, 29, 72, 0.22)',
  },
});

type LegalDocumentChromeProps = {
  title: string;
  heroEmoji: string;
  footerText: string;
  children: React.ReactNode;
};

export default function LegalDocumentChrome({ title, heroEmoji, footerText, children }: LegalDocumentChromeProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, Platform.OS === 'ios' ? 8 : 12) + 8;

  return (
    <LinearGradient
      colors={['#fdf2f8', '#faf5ff', '#f8fafc', '#fffbeb']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.pageGradient}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPad, paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.85}>
          <Text style={styles.backChevron}>←</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>

        <View style={styles.heroCard}>
          <Text style={styles.heroEmoji} allowFontScaling={false}>
            {heroEmoji}
          </Text>
          <Text style={styles.heroTitle}>{title}</Text>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>
              <Text style={styles.metaBold}>Last updated</Text>
              {' · '}
              {new Date().toLocaleDateString()}
            </Text>
          </View>
        </View>

        <View style={styles.bodyCard}>{children}</View>

        <LinearGradient
          colors={['rgba(255, 241, 242, 0.98)', 'rgba(250, 245, 255, 0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.footerCard}
        >
          <Text style={styles.footerAccent} allowFontScaling={false}>
            ✓
          </Text>
          <Text style={styles.footerText}>{footerText}</Text>
        </LinearGradient>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  pageGradient: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginBottom: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#881337',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  backChevron: {
    fontSize: 17,
    color: '#881337',
    fontWeight: '700',
  },
  backLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#881337',
  },
  heroCard: {
    alignItems: 'center',
    marginBottom: 22,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: { elevation: 4 },
    }),
  },
  heroEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#5c1423',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  metaPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.12)',
  },
  metaPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  metaBold: {
    fontWeight: '800',
    color: '#5c1423',
  },
  bodyCard: {
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    marginBottom: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
      },
      android: { elevation: 3 },
    }),
  },
  footerCard: {
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.14)',
    ...Platform.select({
      ios: {
        shadowColor: '#881337',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
      },
      android: { elevation: 2 },
    }),
  },
  footerAccent: {
    fontSize: 18,
    marginBottom: 8,
    textAlign: 'center',
    color: '#be185d',
  },
  footerText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    textAlign: 'center',
    fontWeight: '500',
  },
});
