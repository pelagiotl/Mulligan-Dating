import { getLoginSupportMailtoUrl } from "../constants/support";

type Props = {
  phoneNumber?: string | null;
  step?: "phone" | "verify";
};

export default function LoginSupportNote({ phoneNumber, step = "phone" }: Props) {
  const href = getLoginSupportMailtoUrl({
    phoneNumber,
    surface: "web",
    step,
  });

  return (
    <p className="auth-support-note">
      Questions?{" "}
      <a href={href} className="auth-support-note__link" aria-label="Email Mulligan support">
        Email support
      </a>
    </p>
  );
}
