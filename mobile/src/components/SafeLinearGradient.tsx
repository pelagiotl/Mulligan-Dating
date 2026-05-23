import React from 'react';
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient';
import { Platform, type ViewStyle } from 'react-native';

type Props = Omit<LinearGradientProps, 'start' | 'end'> & {
  style?: ViewStyle;
  /** Applied on iOS only; omitted on Android to avoid new-arch startPoint/endPoint native errors. */
  start?: LinearGradientProps['start'];
  end?: LinearGradientProps['end'];
};

/**
 * expo-linear-gradient wrapper. On Android, omits start/end until the dev client is rebuilt for SDK 53.
 * Rebuild native app: `npm run android:rebuild` from mobile/
 */
export default function SafeLinearGradient({ start, end, ...rest }: Props) {
  if (Platform.OS === 'android') {
    return <LinearGradient {...rest} />;
  }
  return <LinearGradient {...rest} start={start} end={end} />;
}
