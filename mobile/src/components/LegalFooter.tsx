import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MatchesSupportNote from './MatchesSupportNote';
import type { MatchesSupportContext } from '../constants/support';

type SupportProps = Pick<
  MatchesSupportContext,
  'userId' | 'displayName' | 'phoneNumber' | 'availableTokens' | 'activeMatches' | 'slotLimit'
> & {
  hintColor?: string;
};

type Props = {
  /** When set, shows “Questions? Email support” above Terms / Privacy. */
  support?: SupportProps | null;
};

export default function LegalFooter({ support }: Props) {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      {support ? (
        <MatchesSupportNote
          userId={support.userId}
          displayName={support.displayName}
          phoneNumber={support.phoneNumber}
          availableTokens={support.availableTokens}
          activeMatches={support.activeMatches}
          slotLimit={support.slotLimit}
          hintColor={support.hintColor}
          embeddedInFooter
        />
      ) : null}
      <View style={styles.links}>
        <TouchableOpacity onPress={() => navigation.navigate('Terms' as never)}>
          <Text style={styles.link}>Terms of Service</Text>
        </TouchableOpacity>
        <Text style={styles.separator}>•</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Privacy' as never)}>
          <Text style={styles.link}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.copyright}>© {new Date().getFullYear()} Mulligan Dating</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 32,
    marginBottom: 40,
    alignItems: 'center',
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 8,
  },
  link: {
    fontSize: 14,
    color: '#8B1538',
    textDecorationLine: 'underline',
  },
  separator: {
    fontSize: 14,
    color: '#999',
    marginHorizontal: 4,
  },
  copyright: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
