/**
 * "Takma ad ver" (profile ⋯ menu, mockup #29): a private nickname you give
 * someone. Only you see it and it stays on this device (localStorage); the
 * person is never told. resolveDisplayName() prefers it, so the nickname
 * shows wherever the app prints their name.
 */
import { useSyncExternalStore } from "react";

const KEY = "descall:nicknames:v1";
export const NICKNAME_MAX = 32;
const listeners = new Set();
let cache = null;

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function read() {
  if (cache) return cache;
  let parsed = {};
  try {
    const raw = storage()?.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    if (obj && typeof obj === "object" && !Array.isArray(obj)) parsed = obj;
  } catch {
    parsed = {};
  }
  cache = parsed;
  return cache;
}

/** Trim, collapse whitespace, cap the length. Empty means "remove". */
export function cleanNickname(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, NICKNAME_MAX);
}

export function getNickname(userId) {
  if (userId == null || userId === "") return "";
  const v = read()[String(userId)];
  return typeof v === "string" ? v : "";
}

export function setNickname(userId, value) {
  if (userId == null || userId === "") return "";
  const next = { ...read() };
  const clean = cleanNickname(value);
  if (clean) next[String(userId)] = clean;
  else delete next[String(userId)];
  cache = next;
  try {
    storage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: keep it for this session */
  }
  for (const fn of listeners) fn();
  return clean;
}

export function subscribeNicknames(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useNickname(userId) {
  return useSyncExternalStore(subscribeNicknames, () => getNickname(userId), () => "");
}

export function __resetNicknamesForTest() {
  cache = null;
}
