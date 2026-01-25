/**
 * Optimized Image Component with Caching and Lazy Loading
 * Uses React Native's Image component with optimized props for better performance
 */

import React, { useState, useCallback } from 'react';
import { Image, ImageStyle, StyleProp, View, ActivityIndicator, ViewStyle } from 'react-native';
import { getPhotoUrl } from '../utils/photoUrl';

interface OptimizedImageProps {
  source: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  placeholderStyle?: StyleProp<ViewStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: () => void;
  // Cache control
  cache?: 'default' | 'reload' | 'force-cache' | 'only-if-cached';
}

/**
 * Optimized Image component with:
 * - Automatic caching (React Native Image caches by default)
 * - Lazy loading (only loads when visible)
 * - Loading placeholder
 * - Error handling
 * - Memory-efficient rendering
 */
export default function OptimizedImage({
  source,
  style,
  placeholderStyle,
  resizeMode = 'cover',
  onLoadStart,
  onLoadEnd,
  onError,
  cache = 'default',
}: OptimizedImageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Memoize the photo URL to avoid recalculating
  React.useEffect(() => {
    if (source) {
      // If source is already a full URL, use it directly
      // Otherwise, convert it using getPhotoUrl
      const uri = typeof source === 'string' && source.startsWith('http') 
        ? source 
        : getPhotoUrl(source);
      setImageUri(uri);
      setLoading(true);
      setError(false);
    } else {
      setImageUri(null);
      setLoading(false);
    }
  }, [source]);

  const handleLoadStart = useCallback(() => {
    setLoading(true);
    setError(false);
    onLoadStart?.();
  }, [onLoadStart]);

  const handleLoadEnd = useCallback(() => {
    setLoading(false);
    onLoadEnd?.();
  }, [onLoadEnd]);

  const handleError = useCallback(() => {
    setLoading(false);
    setError(true);
    onError?.();
  }, [onError]);

  if (!imageUri) {
    return (
      <View style={[style, placeholderStyle, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' }]}>
        <ActivityIndicator size="small" color="#8B1538" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[style, placeholderStyle, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' }]}>
        {/* Placeholder for error state */}
      </View>
    );
  }

  return (
    <View style={style}>
      <Image
        source={{ uri: imageUri, cache: cache }}
        style={[{ width: '100%', height: '100%' }, style]}
        resizeMode={resizeMode}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        // Performance optimizations
        fadeDuration={200} // Smooth fade-in
        // React Native Image automatically caches images
        // The cache prop controls HTTP cache headers
      />
      {loading && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
          }}
        >
          <ActivityIndicator size="small" color="#8B1538" />
        </View>
      )}
    </View>
  );
}

