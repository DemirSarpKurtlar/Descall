"use strict";

/** Shared provider contract. Frontend never sees provider ids. */

const PUBLIC_ASSISTANT_NAME = "Dima 1.1";
const PUBLIC_PRODUCT_NAME = "DimaAI";

/**
 * @typedef {object} ChatMessage
 * @property {"user"|"assistant"} role
 * @property {string} content
 */

/**
 * @typedef {object} ProviderStreamHandlers
 * @property {(chunk: string) => void} onToken
 * @property {(chunk: string) => void} [onThought]
 * @property {() => void} [onDone]
 */

/**
 * @typedef {object} AiProvider
 * @property {string} id internal only
 * @property {(args: { apiKey: string, messages: ChatMessage[], signal?: AbortSignal, onToken?: (s: string) => void, onThought?: (s: string) => void, userId?: string, locale?: string }) => Promise<{ text: string, thought?: string }>} complete
 */

module.exports = {
  PUBLIC_ASSISTANT_NAME,
  PUBLIC_PRODUCT_NAME,
};
