/**
 * Concept 2 brand block for the invite landings (/s/:slug, /invite/:code): the rounded
 * app tile (48 px) over the white wordmark, instead of tracked-caps "DESCALL" text.
 */
import "../../styles/invite-landing.css";

export default function InviteLandingBrand() {
  const base = import.meta.env.BASE_URL;
  return (
    <div className="invite-landing-brand">
      <img className="invite-landing-tile" src={`${base}brand/descall-appicon-rounded.svg`} width={48} height={48} alt="" />
      <img className="invite-landing-wordmark" src={`${base}brand/descall-wordmark-white.svg`} height={18} alt="Descall" />
    </div>
  );
}
