import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="legal-doc-page">
      <div className="legal-doc-inner">
        <Link to="/" className="legal-doc-back">
          ← Back to Home
        </Link>

        <header className="legal-doc-hero">
          <div className="legal-doc-hero-icon" aria-hidden>
            🔒
          </div>
          <h1 className="legal-doc-hero-title">Privacy Policy</h1>
          <p className="legal-doc-meta">
            <strong>Last updated</strong> · {new Date().toLocaleDateString()}
          </p>
        </header>

        <article className="legal-doc-body">
          <section className="legal-doc-section">
            <h2>1. Introduction</h2>
            <p>
              Mulligan (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This
              Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our
              platform and services.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>2. Information We Collect</h2>
            <h3>2.1 Information You Provide</h3>
            <p>We collect information you provide directly to us, including:</p>
            <ul>
              <li>
                <strong>Account Information:</strong> Email address, password (hashed), age, gender
              </li>
              <li>
                <strong>Profile Information:</strong> Display name, bio, photos, location, interests, lifestyle
                preferences, and optional details you add about what you&apos;re looking for
              </li>
              <li>
                <strong>Connection and discovery preferences:</strong> Age range, who you want to see in Discover, and
                distance preferences
              </li>
              <li>
                <strong>Communication:</strong> Messages sent through the Service
              </li>
            </ul>

            <h3>2.2 Automatically Collected Information</h3>
            <p>We automatically collect certain information when you use the Service:</p>
            <ul>
              <li>Device information (IP address, browser type, operating system)</li>
              <li>Usage data (pages visited, features used, time spent)</li>
              <li>Location data (if you provide location information)</li>
              <li>Last active timestamp</li>
            </ul>
          </section>

          <section className="legal-doc-section">
            <h2>3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Create and manage your account</li>
              <li>Operate Discover and connection features, and personalize what we show you</li>
              <li>Facilitate communication between users (for example, chat)</li>
              <li>Improve and personalize your experience</li>
              <li>Analyze usage patterns and improve our services and relevance</li>
              <li>Send you service-related communications</li>
              <li>Detect and prevent fraud, abuse, and security issues</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="legal-doc-section">
            <h2>4. How We Share Your Information</h2>
            <p>
              We do not sell your personal information. We may share your information in the following circumstances:
            </p>
            <ul>
              <li>
                <strong>With Other Users:</strong> Your profile information (such as name, age, photos, bio, and
                interests) is visible to other users as part of using Discover and related features
              </li>
              <li>
                <strong>Service Providers:</strong> We may share information with third-party service providers who
                perform services on our behalf (e.g., hosting, analytics)
              </li>
              <li>
                <strong>Legal Requirements:</strong> We may disclose information if required by law or to protect our
                rights and safety
              </li>
              <li>
                <strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale, your information
                may be transferred
              </li>
            </ul>
          </section>

          <section className="legal-doc-section">
            <h2>5. Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your personal information,
              including:
            </p>
            <ul>
              <li>Encryption of passwords using industry-standard hashing</li>
              <li>Secure database storage</li>
              <li>HTTPS encryption for data transmission</li>
              <li>Regular security assessments</li>
            </ul>
            <p>
              However, no method of transmission over the Internet is 100% secure. While we strive to protect your
              information, we cannot guarantee absolute security.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>6. Your Rights and Choices</h2>
            <p>You have the following rights regarding your personal information:</p>
            <ul>
              <li>
                <strong>Access:</strong> You can access and update your profile information at any time
              </li>
              <li>
                <strong>Deletion:</strong> You can delete your account and all associated data at any time
              </li>
              <li>
                <strong>Data Export:</strong> You can request a copy of your data (contact us at Mulligandating@gmail.com)
              </li>
              <li>
                <strong>Opt-Out:</strong> You can opt out of certain communications
              </li>
            </ul>
            <p>
              <strong>GDPR Rights (EU Users):</strong> If you are located in the European Union, you have additional
              rights under GDPR, including the right to data portability, the right to object to processing, and the
              right to lodge a complaint with a supervisory authority.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>7. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to provide
              services. When you delete your account, we will delete or anonymize your personal information, except
              where we are required to retain it for legal purposes.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>8. Children&apos;s Privacy</h2>
            <p>
              Our Service is not intended for users under 18 years of age. We do not knowingly collect personal
              information from children under 18. If we become aware that we have collected information from a child
              under 18, we will delete that information immediately.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>9. International Data Transfers</h2>
            <p>
              Your information may be transferred to and processed in countries other than your country of residence.
              These countries may have data protection laws that differ from those in your country. By using the
              Service, you consent to the transfer of your information to these countries.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>10. Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any material changes by
              posting the new Privacy Policy on this page and updating the &quot;Last Updated&quot; date. Your continued
              use of the Service after changes constitutes acceptance of the new Privacy Policy.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>11. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy or our data practices, please contact us at:</p>
            <div className="legal-doc-contact">
              <p>
                <strong>Email:</strong> Mulligandating@gmail.com
              </p>
            </div>
          </section>
        </article>

        <footer className="legal-doc-footer">
          <p>
            By using Mulligan, you acknowledge that you have read, understood, and agree to this Privacy Policy.
          </p>
        </footer>
      </div>
    </div>
  );
}
