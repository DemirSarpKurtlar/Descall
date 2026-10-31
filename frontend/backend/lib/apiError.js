"use strict";

/**
 * API and socket messages: the server speaks ENGLISH, the client translates.
 *
 * A message without values is a static English sentence: `{ error: "Server not found." }`.
 * The app's phrase catalog (src/i18n/locales/api.<locale>.js, keyed by that English)
 * translates it.
 *
 * A message with values must not be concatenated. Use these helpers:
 *
 *   res.status(400).json(apiError("Server name must be {min}–{max} characters.", { min: 2, max: 100 }))
 *   -> { error: "Server name must be 2–100 characters.",
 *        errorKey: "Server name must be {min}–{max} characters.",
 *        errorVars: { min: 2, max: 100 } }
 *
 * Old clients keep showing `error`; new clients translate `errorKey` (an English
 * template that is itself a phrase-catalog key) with `errorVars`. The same shape
 * exists for other fields: apiText("message", ...) -> { message, messageKey, messageVars }.
 * Existing `code` fields are unchanged; pass them in `extra`.
 *
 * Templates use {name} placeholders and ICU plurals ({count, plural, one {...} other {...}}),
 * rendered with lib/messageFormat.js in English.
 */

const { formatMessage } = require("./messageFormat");

function cleanVars(vars) {
  const out = {};
  for (const [k, v] of Object.entries(vars || {})) {
    if (v === undefined) continue;
    out[k] = v === null ? "" : v;
  }
  return out;
}

/** English text of a template with its values filled in. */
function fillTemplate(template, vars) {
  return formatMessage(String(template), cleanVars(vars), "en-GB");
}

/** { [field], [field]Key, [field]Vars } (just { [field] } when there are no values). */
function apiText(field, template, vars, extra = {}) {
  const v = cleanVars(vars);
  if (!Object.keys(v).length) return { [field]: String(template), ...extra };
  return { [field]: fillTemplate(template, v), [`${field}Key`]: String(template), [`${field}Vars`]: v, ...extra };
}

/** { error, errorKey, errorVars, ...extra } for a JSON response or socket ack. */
function apiError(template, vars, extra) {
  return apiText("error", template, vars, extra);
}

/**
 * Error object for code that throws and lets a route send `err.message`: the
 * message is the filled English text; err.i18n = { errorKey, errorVars }.
 * Routes spread errorFields(err) next to `error` to pass the template on.
 */
function templatedError(template, vars, { status, code } = {}) {
  const err = new Error(fillTemplate(template, vars));
  err.i18n = { errorKey: String(template), errorVars: cleanVars(vars) };
  if (status) err.status = status;
  if (code) err.code = code;
  return err;
}

/**
 * { errorKey, errorVars } of an error made by templatedError(), else {}. Pass another
 * field name for socket payloads that use `message`: errorFields(err, "message").
 */
function errorFields(err, field = "error") {
  if (!err || !err.i18n || !err.i18n.errorKey) return {};
  return { [`${field}Key`]: err.i18n.errorKey, [`${field}Vars`]: err.i18n.errorVars };
}

module.exports = { apiError, apiText, fillTemplate, templatedError, errorFields };
