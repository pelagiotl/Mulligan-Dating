import React from 'react';
import { View, Text } from 'react-native';
import LegalDocumentChrome, { legalDocContentStyles as s } from '../components/LegalDocumentChrome';

export default function PrivacyScreen() {
  return (
    <LegalDocumentChrome
      title="Privacy Policy"
      heroEmoji="🔒"
      footerText="By using Mulligan, you acknowledge that you have read, understood, and agree to this Privacy Policy."
    >
      <View style={s.section}>
        <Text style={s.heading}>1. Introduction</Text>
        <Text style={s.paragraph}>
          Mulligan (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This
          Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our
          platform and services.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>2. Information We Collect</Text>
        <Text style={s.subHeading}>2.1 Information You Provide</Text>
        <Text style={s.paragraph}>We collect information you provide directly to us, including:</Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>Account Information:</Text> Email address, password (hashed), age, gender
        </Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>Profile Information:</Text> Display name, bio, photos, location, interests, lifestyle
          preferences, and optional details you add about what you{"'"}re looking for
        </Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>Connection and discovery preferences:</Text> Age range, who you want to see in Discover,
          and distance preferences
        </Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>Communication:</Text> Messages sent through the Service
        </Text>

        <Text style={s.subHeading}>2.2 Automatically Collected Information</Text>
        <Text style={s.paragraph}>We automatically collect certain information when you use the Service:</Text>
        <Text style={s.bullet}>• Device information (IP address, browser type, operating system)</Text>
        <Text style={s.bullet}>• Usage data (pages visited, features used, time spent)</Text>
        <Text style={s.bullet}>• Location data (if you provide location information)</Text>
        <Text style={s.bullet}>• Last active timestamp</Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>3. How We Use Your Information</Text>
        <Text style={s.paragraph}>We use the information we collect to:</Text>
        <Text style={s.bullet}>• Create and manage your account</Text>
        <Text style={s.bullet}>• Operate Discover and connection features, and personalize what we show you</Text>
        <Text style={s.bullet}>• Facilitate communication between users (for example, chat)</Text>
        <Text style={s.bullet}>• Improve and personalize your experience</Text>
        <Text style={s.bullet}>• Analyze usage patterns and improve our services and relevance</Text>
        <Text style={s.bullet}>• Send you service-related communications</Text>
        <Text style={s.bullet}>• Detect and prevent fraud, abuse, and security issues</Text>
        <Text style={s.bullet}>• Comply with legal obligations</Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>4. How We Share Your Information</Text>
        <Text style={s.paragraph}>
          We do not sell your personal information. We may share your information in the following circumstances:
        </Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>With Other Users:</Text> Your profile information (such as name, age, photos, bio, and
          interests) is visible to other users as part of using Discover and related features
        </Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>Service Providers:</Text> We may share information with third-party service providers who
          perform services on our behalf (e.g., hosting, analytics)
        </Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>Legal Requirements:</Text> We may disclose information if required by law or to protect
          our rights and safety
        </Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>Business Transfers:</Text> In the event of a merger, acquisition, or sale, your
          information may be transferred
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>5. Data Security</Text>
        <Text style={s.paragraph}>
          We implement appropriate technical and organizational measures to protect your personal information,
          including:
        </Text>
        <Text style={s.bullet}>• Encryption of passwords using industry-standard hashing</Text>
        <Text style={s.bullet}>• Secure database storage</Text>
        <Text style={s.bullet}>• HTTPS encryption for data transmission</Text>
        <Text style={s.bullet}>• Regular security assessments</Text>
        <Text style={s.paragraph}>
          However, no method of transmission over the Internet is 100% secure. While we strive to protect your
          information, we cannot guarantee absolute security.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>6. Your Rights and Choices</Text>
        <Text style={s.paragraph}>You have the following rights regarding your personal information:</Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>Access:</Text> You can access and update your profile information at any time
        </Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>Deletion:</Text> You can delete your account and all associated data at any time
        </Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>Data Export:</Text> You can request a copy of your data (contact us at
          Mulligandating@gmail.com)
        </Text>
        <Text style={s.bullet}>
          <Text style={s.bold}>Opt-Out:</Text> You can opt out of certain communications
        </Text>
        <Text style={s.paragraph}>
          <Text style={s.bold}>GDPR Rights (EU Users):</Text> If you are located in the European Union, you have
          additional rights under GDPR, including the right to data portability, the right to object to processing,
          and the right to lodge a complaint with a supervisory authority.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>7. Data Retention</Text>
        <Text style={s.paragraph}>
          We retain your personal information for as long as your account is active or as needed to provide services.
          When you delete your account, we will delete or anonymize your personal information, except where we are
          required to retain it for legal purposes.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>8. Children&apos;s Privacy</Text>
        <Text style={s.paragraph}>
          Our Service is not intended for users under 18 years of age. We do not knowingly collect personal information
          from children under 18. If we become aware that we have collected information from a child under 18, we will
          delete that information immediately.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>9. International Data Transfers</Text>
        <Text style={s.paragraph}>
          Your information may be transferred to and processed in countries other than your country of residence. These
          countries may have data protection laws that differ from those in your country. By using the Service, you
          consent to the transfer of your information to these countries.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>10. Changes to This Privacy Policy</Text>
        <Text style={s.paragraph}>
          We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the
          new Privacy Policy on this page and updating the &quot;Last Updated&quot; date. Your continued use of the
          Service after changes constitutes acceptance of the new Privacy Policy.
        </Text>
      </View>

      <View style={[s.section, s.sectionLast]}>
        <Text style={s.heading}>11. Contact Us</Text>
        <Text style={s.paragraph}>If you have any questions about this Privacy Policy or our data practices, please contact us at:</Text>
        <View style={s.contactBox}>
          <Text style={s.paragraph}>
            <Text style={s.bold}>Email:</Text> Mulligandating@gmail.com
          </Text>
        </View>
      </View>
    </LegalDocumentChrome>
  );
}
