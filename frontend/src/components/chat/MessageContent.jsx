/**
 * Lightweight rich-text renderer: **bold**, autolinks, `inline code`, ```code blocks```, @mentions.
 * Keeps the wire format as plain strings.
 */
import { splitHighlightRanges } from "../../lib/textHighlight";
import { splitBlocks, tokenizeInline } from "../../lib/messageMarkdown";
import { displayText } from "../../lib/profanity";
import { isDescallInviteUrl, parseDescallInviteUrl, isVanityServerInvite, vanitySlugFromInviteCode } from "../../lib/inviteLinks";

const URL_RE =
  /((?:https?:\/\/|(?:www\.)?descall\.(?:com|vercel\.app)\/|des-call\.onrender\.com\/)[^\s<]+[^\s<.,;:!?'")\]])/g;
const MENTION_RE = /@([a-zA-Z0-9_]{2,32})/g;

function inviteLinkLabel(href) {
  const parsed = parseDescallInviteUrl(href);
  if (!parsed) return href;
  if (parsed.kind === "server") {
    if (isVanityServerInvite(parsed)) {
      return `descall.com/s/${vanitySlugFromInviteCode(parsed.code)}`;
    }
    return `descall.com/servers/join/${parsed.code}`;
  }
  if (parsed.kind === "group") return `descall.com/invite/${parsed.code}`;
  if (parsed.kind === "friend") return `descall.com/register?ref=${parsed.username || parsed.code}`;
  return href;
}

/** Wrap case-insensitive matches of `needle` inside plain text with <mark>. */
function highlightPlain(value, needle, keyPrefix) {
  if (!needle) return value;
  const segments = splitHighlightRanges(value, needle);
  if (segments.length <= 1 && !segments[0]?.isMatch) return value;
  return segments.map((segment, idx) =>
    segment.isMatch ? (
      <mark key={`${keyPrefix}-hl-${idx}`} className="msg-search-hit">{segment.text}</mark>
    ) : (
      <span key={`${keyPrefix}-hl-${idx}`}>{segment.text}</span>
    )
  );
}

function renderTokens(tokens, keyPrefix, highlight) {
  return tokens.map((token, i) => {
    const key = `${keyPrefix}-${i}`;
    if (token.type === "bold") {
      return (
        <strong key={key} className="msg-bold">
          {renderTokens(token.children, key, highlight)}
        </strong>
      );
    }
    if (token.type === "code") {
      return (
        <code key={key} className="msg-inline-code">
          {displayText(token.value)}
        </code>
      );
    }
    if (token.type === "mention") {
      return (
        <span key={key} className="msg-mention">
          {displayText(token.value)}
        </span>
      );
    }
    if (token.type === "url") {
      const href = /^https?:\/\//i.test(token.value) ? token.value : `https://${token.value.replace(/^\/\//, "")}`;
      const isInvite = isDescallInviteUrl(token.value);
      return (
        <a
          key={key}
          className={isInvite ? "msg-link msg-link-invite" : "msg-link"}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {isInvite ? inviteLinkLabel(token.value) : displayText(token.value)}
        </a>
      );
    }
    return <span key={key}>{highlightPlain(displayText(token.value), highlight, key)}</span>;
  });
}

function renderInline(text, keyPrefix = "t", highlight = "") {
  if (!text) return null;
  return renderTokens(tokenizeInline(text), keyPrefix, highlight);
}

/**
 * `**bold**`, `inline code`, ```code blocks```, @mentions, links, `\*` escapes
 * (lib/messageMarkdown.js). Newlines are kept (`.message-text` is pre-wrap).
 */
export default function MessageContent({ text, highlight = "" }) {
  // Native iOS app: bad words are masked with *** (display only). Masking runs
  // per token after parsing, so a "***" mask can never open or close **bold**.
  if (!text || !displayText(text)) return null;

  return (
    <div className="message-text">
      {splitBlocks(text).map((block, idx) => {
        if (block.type === "codeblock") {
          return (
            <pre key={`code-${idx}`} className="msg-code-block">
              <code>{displayText(block.value)}</code>
            </pre>
          );
        }
        return (
          <span key={`p-${idx}`} className="msg-text-chunk">
            {renderInline(block.value, `i${idx}`, highlight)}
          </span>
        );
      })}
    </div>
  );
}

// silence unused lint for exported helpers used by tests / future
export { URL_RE, MENTION_RE };
