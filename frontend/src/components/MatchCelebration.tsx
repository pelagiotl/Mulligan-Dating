import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getPhotoUrl } from "../utils/photoUrl";

interface MatchCelebrationProps {
  profileName: string;
  photoUrl?: string;
  onClose: () => void;
}

/**
 * Generate a firework sound effect using Web Audio API
 */
function playFireworkSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create multiple firework bursts
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        // Main firework burst
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Firework sound: quick ascending frequency then crackle
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(200 + i * 50, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800 + i * 100, audioContext.currentTime + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);
        
        // Volume envelope: quick attack, fade out
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
        
        // Add crackling sounds (multiple pops)
        for (let j = 0; j < 5; j++) {
          setTimeout(() => {
            const popOsc = audioContext.createOscillator();
            const popGain = audioContext.createGain();
            
            popOsc.connect(popGain);
            popGain.connect(audioContext.destination);
            
            popOsc.type = 'square';
            popOsc.frequency.setValueAtTime(300 + Math.random() * 200, audioContext.currentTime);
            
            popGain.gain.setValueAtTime(0, audioContext.currentTime);
            popGain.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.01);
            popGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            
            popOsc.start(audioContext.currentTime);
            popOsc.stop(audioContext.currentTime + 0.1);
          }, j * 50);
        }
      }, i * 150);
    }
  } catch (error) {
    // Silently fail if audio context is not available
    console.warn('Could not play firework sound:', error);
  }
}

export default function MatchCelebration({ profileName, photoUrl, onClose }: MatchCelebrationProps) {
  const [showContent, setShowContent] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const soundPlayedRef = useRef(false);
  const navigate = useNavigate();

  const handleContinue = () => {
    onClose();
    // Navigate to matches page
    navigate('/matches');
  };

  useEffect(() => {
    // Trigger animations in sequence
    const timer1 = setTimeout(() => setShowContent(true), 100);
    const timer2 = setTimeout(() => setShowConfetti(true), 300);
    const timer3 = setTimeout(() => setShowButton(true), 2000); // Show button after 2 seconds

    // Play firework sound when confetti appears
    if (!soundPlayedRef.current) {
      const soundTimer = setTimeout(() => {
        playFireworkSound();
        soundPlayedRef.current = true;
      }, 300);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        clearTimeout(soundTimer);
      };
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  return (
    <div className="match-celebration-overlay">
      <div className="match-celebration-backdrop" />
      
      {/* Confetti particles */}
      {showConfetti && (
        <div className="confetti-container">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="confetti-particle"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                backgroundColor: [
                  '#f43f5e',
                  '#fb7185',
                  '#fbbf24',
                  '#f59e0b',
                  '#a7f3d0',
                  '#d1fae5',
                ][Math.floor(Math.random() * 6)],
              }}
            />
          ))}
        </div>
      )}

      {/* Main celebration content */}
      <div className={`match-celebration-content ${showContent ? 'show' : ''}`}>
        <div className="match-celebration-photo-container">
          <div className="match-celebration-photo-ring ring-1" />
          <div className="match-celebration-photo-ring ring-2" />
          <div className="match-celebration-photo-ring ring-3" />
          <div className="match-celebration-photo">
            {photoUrl ? (
              <img src={getPhotoUrl(photoUrl)} alt={profileName} onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }} />
            ) : (
              <div className="match-celebration-placeholder">
                {profileName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="match-celebration-text">
          <h1 className="match-celebration-title">
            <span className="match-celebration-word word-1">You're</span>
            <span className="match-celebration-word word-2">&nbsp;</span>
            <span className="match-celebration-word word-3">connected! ✨</span>
          </h1>
          <p className="match-celebration-subtitle">
            Start vibing with <strong>{profileName}</strong>
          </p>
          <p className="match-celebration-message">
            Say hi in chat 💬
          </p>

          {showButton && (
            <button
              className="match-celebration-button"
              onClick={handleContinue}
            >
              Send a Message 💌
            </button>
          )}
        </div>

        <div className="match-celebration-sparkles">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="sparkle"
              style={{
                '--angle': `${(i * 360) / 12}deg`,
                '--delay': `${i * 0.1}s`,
              } as React.CSSProperties}
            >
              ✨
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

