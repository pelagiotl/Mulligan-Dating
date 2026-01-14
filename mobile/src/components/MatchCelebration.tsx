import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getPhotoUrl } from '../utils/photoUrl';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MatchCelebrationProps {
  profileName: string;
  photoUrl?: string;
  onClose: () => void;
}

interface ConfettiParticle {
  id: number;
  left: number;
  delay: number;
  color: string;
}

// Separate component for animated confetti particle
function ConfettiParticleComponent({ particle }: { particle: ConfettiParticle }) {
  const translateY = useRef(new Animated.Value(-10)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT + 20,
        duration: 3000 + Math.random() * 2000,
        delay: particle.delay * 1000,
        useNativeDriver: true,
      }),
      Animated.timing(rotate, {
        toValue: 1,
        duration: 3000 + Math.random() * 2000,
        delay: particle.delay * 1000,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        delay: 2500 + Math.random() * 1000,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const rotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.confettiParticle,
        {
          left: `${particle.left}%`,
          backgroundColor: particle.color,
          transform: [{ translateY }, { rotate: rotation }],
          opacity,
        },
      ]}
    />
  );
}

export default function MatchCelebration({
  profileName,
  photoUrl,
  onClose,
}: MatchCelebrationProps) {
  const navigation = useNavigation();
  const [showContent, setShowContent] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [confettiParticles] = useState<ConfettiParticle[]>(() => {
    const colors = ['#f43f5e', '#fb7185', '#fbbf24', '#f59e0b', '#a7f3d0', '#d1fae5'];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  });

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const word1Anim = useRef(new Animated.Value(0)).current;
  const word2Anim = useRef(new Animated.Value(0)).current;
  const word3Anim = useRef(new Animated.Value(0)).current;
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;
  const ring3Anim = useRef(new Animated.Value(0)).current;
  const photoScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Trigger animations in sequence
    const timer1 = setTimeout(() => setShowContent(true), 100);
    const timer2 = setTimeout(() => setShowConfetti(true), 300);
    const timer3 = setTimeout(() => setShowButton(true), 2000);

    // Animate photo scale
    Animated.spring(photoScaleAnim, {
      toValue: 1,
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();

    // Animate rings
    Animated.parallel([
      Animated.timing(ring1Anim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
      Animated.timing(ring2Anim, {
        toValue: 1,
        duration: 2000,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(ring3Anim, {
        toValue: 1,
        duration: 2000,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Animate container scale
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();

    // Animate opacity
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // Animate words with stagger
    Animated.sequence([
      Animated.timing(word1Anim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(word2Anim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(word3Anim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  const handleContinue = () => {
    onClose();
    navigation.navigate('Matches' as never);
  };

  const ring1Scale = ring1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.5],
  });

  const ring1Opacity = ring1Anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.8, 0.4, 0],
  });

  const ring2Scale = ring2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.7],
  });

  const ring2Opacity = ring2Anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 0.3, 0],
  });

  const ring3Scale = ring3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.9],
  });

  const ring3Opacity = ring3Anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 0.2, 0],
  });

  const word1TranslateY = word1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });

  const word1Opacity = word1Anim;

  const word2TranslateY = word2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });

  const word2Opacity = word2Anim;

  const word3TranslateY = word3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });

  const word3Opacity = word3Anim;

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Confetti particles */}
        {showConfetti && (
          <View style={styles.confettiContainer} pointerEvents="none">
            {confettiParticles.map((particle) => (
              <ConfettiParticleComponent key={particle.id} particle={particle} />
            ))}
          </View>
        )}

        {/* Main celebration content */}
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Photo with animated rings */}
          <View style={styles.photoContainer}>
            <Animated.View
              style={[
                styles.photoRing,
                styles.ring1,
                {
                  transform: [{ scale: ring1Scale }],
                  opacity: ring1Opacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.photoRing,
                styles.ring2,
                {
                  transform: [{ scale: ring2Scale }],
                  opacity: ring2Opacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.photoRing,
                styles.ring3,
                {
                  transform: [{ scale: ring3Scale }],
                  opacity: ring3Opacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.photoWrapper,
                {
                  transform: [{ scale: photoScaleAnim }],
                },
              ]}
            >
              {photoUrl ? (
                <Image
                  source={{ uri: getPhotoUrl(photoUrl) }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderText}>
                    {profileName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </Animated.View>
          </View>

          {/* Text content with staggered animations */}
          <View style={styles.textContainer}>
            <View style={styles.titleContainer}>
              <Animated.Text
                style={[
                  styles.titleWord,
                  {
                    transform: [{ translateY: word1TranslateY }],
                    opacity: word1Opacity,
                  },
                ]}
              >
                It's
              </Animated.Text>
              <Animated.Text
                style={[
                  styles.titleWord,
                  {
                    transform: [{ translateY: word2TranslateY }],
                    opacity: word2Opacity,
                  },
                ]}
              >
                {' '}a{' '}
              </Animated.Text>
              <Animated.Text
                style={[
                  styles.titleWord,
                  styles.titleWordMatch,
                  {
                    transform: [{ translateY: word3TranslateY }],
                    opacity: word3Opacity,
                  },
                ]}
              >
                Match!
              </Animated.Text>
            </View>

            <Text style={styles.subtitle}>
              You and <Text style={styles.bold}>{profileName}</Text> liked each other
            </Text>
            <Text style={styles.message}>Start chatting now! 💬</Text>

            {showButton && (
              <TouchableOpacity
                style={styles.button}
                onPress={handleContinue}
              >
                <Text style={styles.buttonText}>Send a Message 💌</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Sparkles */}
          <SparklesComponent />
        </Animated.View>
      </View>
    </Modal>
  );
}

// Separate component for animated sparkles
function SparklesComponent() {
  const sparkles = Array.from({ length: 12 }).map((_, i) => {
    const angle = (i * 360) / 12;
    const radius = 100;
    const x = Math.cos((angle * Math.PI) / 180) * radius;
    const y = Math.sin((angle * Math.PI) / 180) * radius;
    const opacity = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 300,
            delay: i * 100,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            friction: 4,
            tension: 40,
            delay: i * 100,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            delay: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0,
            duration: 300,
            delay: 1000,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }, []);

    return { x, y, opacity, scale, key: i };
  });

  return (
    <View style={styles.sparklesContainer} pointerEvents="none">
      {sparkles.map((sparkle) => (
        <Animated.View
          key={sparkle.key}
          style={[
            styles.sparkle,
            {
              transform: [
                { translateX: sparkle.x },
                { translateY: sparkle.y },
                { scale: sparkle.scale },
              ],
              opacity: sparkle.opacity,
            },
          ]}
        >
          <Text style={styles.sparkleText}>✨</Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  confettiParticle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    top: -10,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 40,
    alignItems: 'center',
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  photoContainer: {
    position: 'relative',
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRing: {
    position: 'absolute',
    borderRadius: 100,
    borderWidth: 3,
    borderColor: '#8B1538',
  },
  ring1: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  ring2: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  ring3: {
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  photoWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#8B1538',
    zIndex: 10,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#8B1538',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: {
    fontSize: 48,
    color: '#fff',
    fontWeight: 'bold',
  },
  textContainer: {
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  titleWord: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
  },
  titleWordMatch: {
    color: '#8B1538',
    fontSize: 42,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  bold: {
    fontWeight: 'bold',
    color: '#8B1538',
  },
  message: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#8B1538',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 8,
    shadowColor: '#8B1538',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  sparklesContainer: {
    position: 'absolute',
    width: 200,
    height: 200,
    top: 20,
    left: '50%',
    marginLeft: -100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: {
    position: 'absolute',
  },
  sparkleText: {
    fontSize: 24,
  },
});
