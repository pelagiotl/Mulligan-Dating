import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function TermsScreen() {
  const navigation = useNavigation();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Terms of Service</Text>
      <Text style={styles.lastUpdated}>
        <Text style={styles.bold}>Last Updated:</Text> {new Date().toLocaleDateString()}
      </Text>

      <View style={styles.section}>
        <Text style={styles.heading}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>
          By accessing and using Mulligan Dating ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>2. Eligibility</Text>
        <Text style={styles.paragraph}>
          You must be at least 18 years old to use this Service. By using the Service, you represent and warrant that you are at least 18 years of age and have the legal capacity to enter into this agreement.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>3. User Accounts</Text>
        <Text style={styles.paragraph}>
          You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to:
        </Text>
        <Text style={styles.bullet}>• Provide accurate, current, and complete information during registration</Text>
        <Text style={styles.bullet}>• Maintain and update your information to keep it accurate</Text>
        <Text style={styles.bullet}>• Notify us immediately of any unauthorized use of your account</Text>
        <Text style={styles.bullet}>• Accept responsibility for all activities under your account</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>4. User Conduct</Text>
        <Text style={styles.paragraph}>You agree not to:</Text>
        <Text style={styles.bullet}>• Use the Service for any illegal purpose or in violation of any laws</Text>
        <Text style={styles.bullet}>• Harass, abuse, or harm other users</Text>
        <Text style={styles.bullet}>• Post false, misleading, or fraudulent information</Text>
        <Text style={styles.bullet}>• Impersonate any person or entity</Text>
        <Text style={styles.bullet}>• Upload content that is offensive, defamatory, or violates others' rights</Text>
        <Text style={styles.bullet}>• Spam, solicit, or advertise without permission</Text>
        <Text style={styles.bullet}>• Attempt to gain unauthorized access to the Service</Text>
        <Text style={styles.bullet}>• Interfere with or disrupt the Service</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>5. Content and Intellectual Property</Text>
        <Text style={styles.paragraph}>
          You retain ownership of content you post on the Service. By posting content, you grant us a non-exclusive, worldwide, royalty-free license to use, display, and distribute your content on the Service. You are solely responsible for the content you post.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>6. Privacy</Text>
        <Text style={styles.paragraph}>
          Your use of the Service is also governed by our Privacy Policy. Please review our Privacy Policy to understand our practices.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>7. Prohibited Activities</Text>
        <Text style={styles.paragraph}>The following activities are strictly prohibited:</Text>
        <Text style={styles.bullet}>• Creating fake profiles or impersonating others</Text>
        <Text style={styles.bullet}>• Sharing personal contact information before establishing trust</Text>
        <Text style={styles.bullet}>• Requesting money or financial assistance from other users</Text>
        <Text style={styles.bullet}>• Engaging in any form of harassment, stalking, or abuse</Text>
        <Text style={styles.bullet}>• Using automated systems to access the Service</Text>
        <Text style={styles.bullet}>• Reverse engineering or attempting to extract source code</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>8. Account Termination</Text>
        <Text style={styles.paragraph}>
          We reserve the right to suspend or terminate your account at any time, with or without notice, for any violation of these Terms or for any other reason we deem necessary to protect the safety and integrity of the Service.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>9. Disclaimers</Text>
        <Text style={styles.paragraph}>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND. We do not guarantee that the Service will be uninterrupted, secure, or error-free. We are not responsible for the conduct of any user of the Service.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>10. Limitation of Liability</Text>
        <Text style={styles.paragraph}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>11. Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We reserve the right to modify these Terms at any time. We will notify users of material changes. Your continued use of the Service after changes constitutes acceptance of the new Terms.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>12. Contact Information</Text>
        <Text style={styles.paragraph}>
          If you have any questions about these Terms, please contact us at:
        </Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>Email:</Text> Mulligandating@gmail.com
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          By using Mulligan Dating, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
  },
  backButton: {
    marginBottom: 20,
  },
  backButtonText: {
    fontSize: 16,
    color: '#8B1538',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#8B1538',
    marginBottom: 10,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#666',
    marginBottom: 30,
  },
  section: {
    marginBottom: 30,
  },
  heading: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    marginTop: 8,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    color: '#333',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 15,
    lineHeight: 24,
    color: '#333',
    marginLeft: 10,
    marginBottom: 6,
  },
  bold: {
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 30,
    padding: 16,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  footerText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
  },
});








