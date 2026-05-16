import React from 'react';
import { View, Text } from 'react-native';
import LegalDocumentChrome, { legalDocContentStyles as s } from '../components/LegalDocumentChrome';

export default function TermsScreen() {
  return (
    <LegalDocumentChrome
      title="Terms of Service"
      heroEmoji="📜"
      footerText="By using Mulligan Dating, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service."
    >
      <View style={s.section}>
        <Text style={s.heading}>1. Acceptance of Terms</Text>
        <Text style={s.paragraph}>
          By accessing and using Mulligan Dating (&quot;the Service&quot;), you accept and agree to be bound by the
          terms and provision of this agreement. If you do not agree to abide by the above, please do not use this
          service.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>2. Eligibility</Text>
        <Text style={s.paragraph}>
          You must be at least 18 years old to use this Service. By using the Service, you represent and warrant that you
          are at least 18 years of age and have the legal capacity to enter into this agreement.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>3. User Accounts</Text>
        <Text style={s.paragraph}>
          You are responsible for maintaining the confidentiality of your account credentials and for all activities that
          occur under your account. You agree to:
        </Text>
        <Text style={s.bullet}>• Provide accurate, current, and complete information during registration</Text>
        <Text style={s.bullet}>• Maintain and update your information to keep it accurate</Text>
        <Text style={s.bullet}>• Notify us immediately of any unauthorized use of your account</Text>
        <Text style={s.bullet}>• Accept responsibility for all activities under your account</Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>4. User Conduct</Text>
        <Text style={s.paragraph}>You agree not to:</Text>
        <Text style={s.bullet}>• Use the Service for any illegal purpose or in violation of any laws</Text>
        <Text style={s.bullet}>• Harass, abuse, or harm other users</Text>
        <Text style={s.bullet}>• Post false, misleading, or fraudulent information</Text>
        <Text style={s.bullet}>• Impersonate any person or entity</Text>
        <Text style={s.bullet}>• Upload content that is offensive, defamatory, or violates others&apos; rights</Text>
        <Text style={s.bullet}>• Spam, solicit, or advertise without permission</Text>
        <Text style={s.bullet}>• Attempt to gain unauthorized access to the Service</Text>
        <Text style={s.bullet}>• Interfere with or disrupt the Service</Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>5. Content and Intellectual Property</Text>
        <Text style={s.paragraph}>
          You retain ownership of content you post on the Service. By posting content, you grant us a non-exclusive,
          worldwide, royalty-free license to use, display, and distribute your content on the Service. You are solely
          responsible for the content you post.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>6. Privacy</Text>
        <Text style={s.paragraph}>
          Your use of the Service is also governed by our Privacy Policy. Please review our Privacy Policy to understand
          our practices.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>7. Prohibited Activities</Text>
        <Text style={s.paragraph}>The following activities are strictly prohibited:</Text>
        <Text style={s.bullet}>• Creating fake profiles or impersonating others</Text>
        <Text style={s.bullet}>• Sharing personal contact information before establishing trust</Text>
        <Text style={s.bullet}>• Requesting money or financial assistance from other users</Text>
        <Text style={s.bullet}>• Engaging in any form of harassment, stalking, or abuse</Text>
        <Text style={s.bullet}>• Using automated systems to access the Service</Text>
        <Text style={s.bullet}>• Reverse engineering or attempting to extract source code</Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>8. Account Termination</Text>
        <Text style={s.paragraph}>
          We reserve the right to suspend or terminate your account at any time, with or without notice, for any
          violation of these Terms or for any other reason we deem necessary to protect the safety and integrity of the
          Service.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>9. Disclaimers</Text>
        <Text style={s.paragraph}>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND. We do
          not guarantee that the Service will be uninterrupted, secure, or error-free. We are not responsible for the
          conduct of any user of the Service.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>10. Limitation of Liability</Text>
        <Text style={s.paragraph}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.heading}>11. Changes to Terms</Text>
        <Text style={s.paragraph}>
          We reserve the right to modify these Terms at any time. We will notify users of material changes. Your
          continued use of the Service after changes constitutes acceptance of the new Terms.
        </Text>
      </View>

      <View style={[s.section, s.sectionLast]}>
        <Text style={s.heading}>12. Contact Information</Text>
        <Text style={s.paragraph}>If you have any questions about these Terms, please contact us at:</Text>
        <View style={s.contactBox}>
          <Text style={s.paragraph}>
            <Text style={s.bold}>Email:</Text> Mulligandating@gmail.com
          </Text>
        </View>
      </View>
    </LegalDocumentChrome>
  );
}
