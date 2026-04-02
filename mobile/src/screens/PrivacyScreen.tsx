import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function PrivacyScreen() {
  const navigation = useNavigation();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.lastUpdated}>
        <Text style={styles.bold}>Last Updated:</Text> {new Date().toLocaleDateString()}
      </Text>

      <View style={styles.section}>
        <Text style={styles.heading}>1. Introduction</Text>
        <Text style={styles.paragraph}>
          Mulligan ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform and services.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>2. Information We Collect</Text>
        <Text style={styles.subHeading}>2.1 Information You Provide</Text>
        <Text style={styles.paragraph}>We collect information you provide directly to us, including:</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>Account Information:</Text> Email address, password (hashed), age, gender</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>Profile Information:</Text> Display name, bio, photos, location, interests, lifestyle preferences, and optional details you add about what you{"'"}re looking for</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>Connection and discovery preferences:</Text> Age range, who you want to see in Discover, and distance preferences</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>Communication:</Text> Messages sent through the Service</Text>

        <Text style={styles.subHeading}>2.2 Automatically Collected Information</Text>
        <Text style={styles.paragraph}>We automatically collect certain information when you use the Service:</Text>
        <Text style={styles.bullet}>Device information (IP address, browser type, operating system)</Text>
        <Text style={styles.bullet}>Usage data (pages visited, features used, time spent)</Text>
        <Text style={styles.bullet}>Location data (if you provide location information)</Text>
        <Text style={styles.bullet}>Last active timestamp</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>3. How We Use Your Information</Text>
        <Text style={styles.paragraph}>We use the information we collect to:</Text>
        <Text style={styles.bullet}>Create and manage your account</Text>
        <Text style={styles.bullet}>Operate Discover and connection features, and personalize what we show you</Text>
        <Text style={styles.bullet}>Facilitate communication between users (for example, chat)</Text>
        <Text style={styles.bullet}>Improve and personalize your experience</Text>
        <Text style={styles.bullet}>Analyze usage patterns and improve our services and relevance</Text>
        <Text style={styles.bullet}>Send you service-related communications</Text>
        <Text style={styles.bullet}>Detect and prevent fraud, abuse, and security issues</Text>
        <Text style={styles.bullet}>Comply with legal obligations</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>4. How We Share Your Information</Text>
        <Text style={styles.paragraph}>We do not sell your personal information. We may share your information in the following circumstances:</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>With Other Users:</Text> Your profile information (such as name, age, photos, bio, and interests) is visible to other users as part of using Discover and related features</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>Service Providers:</Text> We may share information with third-party service providers who perform services on our behalf (e.g., hosting, analytics)</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>Legal Requirements:</Text> We may disclose information if required by law or to protect our rights and safety</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>Business Transfers:</Text> In the event of a merger, acquisition, or sale, your information may be transferred</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>5. Data Security</Text>
        <Text style={styles.paragraph}>
          We implement appropriate technical and organizational measures to protect your personal information, including:
        </Text>
        <Text style={styles.bullet}>Encryption of passwords using industry-standard hashing</Text>
        <Text style={styles.bullet}>Secure database storage</Text>
        <Text style={styles.bullet}>HTTPS encryption for data transmission</Text>
        <Text style={styles.bullet}>Regular security assessments</Text>
        <Text style={styles.paragraph}>
          However, no method of transmission over the Internet is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>6. Your Rights and Choices</Text>
        <Text style={styles.paragraph}>You have the following rights regarding your personal information:</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>Access:</Text> You can access and update your profile information at any time</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>Deletion:</Text> You can delete your account and all associated data at any time</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>Data Export:</Text> You can request a copy of your data (contact us at Mulligandating@gmail.com)</Text>
        <Text style={styles.bullet}><Text style={styles.bold}>Opt-Out:</Text> You can opt out of certain communications</Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>GDPR Rights (EU Users):</Text> If you are located in the European Union, you have additional rights under GDPR, including the right to data portability, the right to object to processing, and the right to lodge a complaint with a supervisory authority.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>7. Data Retention</Text>
        <Text style={styles.paragraph}>
          We retain your personal information for as long as your account is active or as needed to provide services. When you delete your account, we will delete or anonymize your personal information, except where we are required to retain it for legal purposes.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>8. Children's Privacy</Text>
        <Text style={styles.paragraph}>
          Our Service is not intended for users under 18 years of age. We do not knowingly collect personal information from children under 18. If we become aware that we have collected information from a child under 18, we will delete that information immediately.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>9. International Data Transfers</Text>
        <Text style={styles.paragraph}>
          Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from those in your country. By using the Service, you consent to the transfer of your information to these countries.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>10. Changes to This Privacy Policy</Text>
        <Text style={styles.paragraph}>
          We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. Your continued use of the Service after changes constitutes acceptance of the new Privacy Policy.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>11. Contact Us</Text>
        <Text style={styles.paragraph}>
          If you have any questions about this Privacy Policy or our data practices, please contact us at:
        </Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>Email:</Text> Mulligandating@gmail.com
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          By using Mulligan, you acknowledge that you have read, understood, and agree to this Privacy Policy.
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
  subHeading: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 8,
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








