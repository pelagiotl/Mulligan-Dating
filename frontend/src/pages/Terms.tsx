import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="legal-doc-page">
      <div className="legal-doc-inner">
        <Link to="/" className="legal-doc-back">
          ← Back to Home
        </Link>

        <header className="legal-doc-hero">
          <div className="legal-doc-hero-icon" aria-hidden>
            📜
          </div>
          <h1 className="legal-doc-hero-title">Terms of Service</h1>
          <p className="legal-doc-meta">
            <strong>Last updated</strong> · {new Date().toLocaleDateString()}
          </p>
        </header>

        <article className="legal-doc-body">
          <section className="legal-doc-section">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing and using Mulligan (&quot;the Service&quot;), you accept and agree to be bound by the terms
              and provision of this agreement. If you do not agree to abide by the above, please do not use this
              service.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>2. Eligibility</h2>
            <p>
              You must be at least 18 years old to use this Service. By using the Service, you represent and warrant that
              you are at least 18 years of age and have the legal capacity to enter into this agreement.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>3. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all
              activities that occur under your account. You agree to:
            </p>
            <ul>
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain and update your information to keep it accurate</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
              <li>Accept responsibility for all activities under your account</li>
            </ul>
          </section>

          <section className="legal-doc-section">
            <h2>4. User Conduct</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the Service for any illegal purpose or in violation of any laws</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Post false, misleading, or fraudulent information</li>
              <li>Impersonate any person or entity</li>
              <li>Upload content that is offensive, defamatory, or violates others&apos; rights</li>
              <li>Spam, solicit, or advertise without permission</li>
              <li>Attempt to gain unauthorized access to the Service</li>
              <li>Interfere with or disrupt the Service</li>
            </ul>
          </section>

          <section className="legal-doc-section">
            <h2>5. Content and Intellectual Property</h2>
            <p>
              You retain ownership of content you post on the Service. By posting content, you grant us a non-exclusive,
              worldwide, royalty-free license to use, display, and distribute your content on the Service. You are
              solely responsible for the content you post.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>6. Privacy</h2>
            <p>
              Your use of the Service is also governed by our Privacy Policy. Please review our Privacy Policy to
              understand our practices.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>7. Prohibited Activities</h2>
            <p>The following activities are strictly prohibited:</p>
            <ul>
              <li>Creating fake profiles or impersonating others</li>
              <li>Sharing personal contact information before establishing trust</li>
              <li>Requesting money or financial assistance from other users</li>
              <li>Engaging in any form of harassment, stalking, or abuse</li>
              <li>Using automated systems to access the Service</li>
              <li>Reverse engineering or attempting to extract source code</li>
            </ul>
          </section>

          <section className="legal-doc-section">
            <h2>8. Account Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at any time, with or without notice, for any
              violation of these Terms or for any other reason we deem necessary to protect the safety and integrity of
              the Service.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>9. Disclaimers</h2>
            <p>
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND. We
              do not guarantee that the Service will be uninterrupted, secure, or error-free. We are not responsible
              for the conduct of any user of the Service.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>10. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR
              INDIRECTLY.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>11. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will notify users of material changes. Your
              continued use of the Service after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section className="legal-doc-section">
            <h2>12. Contact Information</h2>
            <p>If you have any questions about these Terms, please contact us at:</p>
            <div className="legal-doc-contact">
              <p>
                <strong>Email:</strong> Mulligandating@gmail.com
              </p>
            </div>
          </section>
        </article>

        <footer className="legal-doc-footer">
          <p>
            By using Mulligan, you acknowledge that you have read, understood, and agree to be bound by these Terms of
            Service.
          </p>
        </footer>
      </div>
    </div>
  );
}
