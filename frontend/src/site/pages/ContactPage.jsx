import { useState } from "react";
import { API_BASE_URL } from "../../config/api";
import { useT } from "../../context/localeContextInstance";
import { SITE_OPERATOR } from "../siteIdentity";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactPage() {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const nextEmail = String(email || "").trim().toLowerCase();
    const nextMessage = String(message || "").trim();
    if (!EMAIL_RE.test(nextEmail)) {
      setStatus("error");
      setInvalidField("email");
      setError(t("Enter a valid email"));
      return;
    }
    if (nextMessage.length < 5) {
      setStatus("error");
      setInvalidField("message");
      setError(t("Write at least 5 characters."));
      return;
    }
    setStatus("loading");
    setError("");
    setInvalidField("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/marketing/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(name || "").trim(),
          email: nextEmail,
          message: nextMessage,
          path: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setStatus("ok");
    } catch {
      setStatus("error");
      setError(t("Could not send that message. Email us instead."));
    }
  };

  if (status === "ok") {
    return (
      <section className="mkt-section mkt-contact">
        <div className="mkt-success" role="status">
          <p className="mkt-success-kicker">Descall</p>
          <h1>{t("Message received")}</h1>
          <p>{t("We got your note. We’ll reply at the email you gave.")}</p>
          <p>
            <a href={`mailto:${SITE_OPERATOR.supportEmail}`}>{SITE_OPERATOR.supportEmail}</a>
          </p>
          <p className="mkt-contact-owner">{SITE_OPERATOR.operatorName}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mkt-section mkt-prose mkt-contact">
      <h1>{t("Contact")}</h1>
      <p className="lead">{t("Get in touch with the Descall team, support, feedback, and press.")}</p>
      <h2>{t("Owner")}</h2>
      <p className="mkt-contact-owner">
        {SITE_OPERATOR.operatorName}
        {" · "}
        {t("Descall is owned by Demir Sarp Kurtlar.")}
      </p>
      <h2>{t("Support email")}</h2>
      <p>
        <a href={`mailto:${SITE_OPERATOR.supportEmail}`}>{SITE_OPERATOR.supportEmail}</a>
      </p>
      <form className="mkt-contact-form" onSubmit={submit} noValidate>
        <label htmlFor="contact-name">{t("Your name (optional)")}</label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={status === "loading"}
        />
        <label htmlFor="contact-email">{t("Email")}</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={status === "loading"}
          aria-invalid={invalidField === "email" ? "true" : undefined}
          aria-describedby={error ? "contact-error" : undefined}
        />
        <label htmlFor="contact-message">{t("Message")}</label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={status === "loading"}
          aria-invalid={invalidField === "message" ? "true" : undefined}
          aria-describedby={error ? "contact-error" : undefined}
        />
        {error ? (
          <p id="contact-error" className="mkt-field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="mkt-btn mkt-btn-primary" disabled={status === "loading"} aria-busy={status === "loading"}>
          {status === "loading" ? t("Sending…") : t("Send message")}
        </button>
      </form>
      <h2>{t("Security")}</h2>
      <p>
        {t("For security reports, contact us by email and include enough detail for us to investigate safely.")}
      </p>
    </section>
  );
}
