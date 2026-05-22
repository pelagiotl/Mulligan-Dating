import { CONNECT_LANDING_TAGLINE } from "../constants/connectLanding";

type ConnectLandingTaglineProps = {
  className?: string;
};

/** Keeps "Dating App" on one line; scales down slightly on narrow viewports. */
export default function ConnectLandingTagline({
  className = "connect-landing__subtitle",
}: ConnectLandingTaglineProps) {
  return <p className={className}>{CONNECT_LANDING_TAGLINE}</p>;
}
