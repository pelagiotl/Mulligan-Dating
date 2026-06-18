import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import SoberCircleScreen from '../screens/SoberCircleScreen';
import MatchesScreen from '../screens/MatchesScreen';

export type SoberCircleStackParamList = {
  SoberCircleHome: undefined;
  SoberCircleChat: {
    matchId?: string;
    showMatchCelebration?: boolean;
    matchName?: string;
    soberCircleMode?: boolean;
  };
};

const Stack = createStackNavigator<SoberCircleStackParamList>();

export default function SoberCircleNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SoberCircleHome" component={SoberCircleScreen} />
      <Stack.Screen
        name="SoberCircleChat"
        component={MatchesScreen}
        initialParams={{ soberCircleMode: true }}
      />
    </Stack.Navigator>
  );
}
