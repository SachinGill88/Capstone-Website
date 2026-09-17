// Shared helpers for the design-log functions.
import { getStore } from "@netlify/blobs";

export const entries = () => getStore({ name: "entries", consistency: "strong" });
export const images = () => getStore({ name: "images", consistency: "strong" });

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

export const error = (message, status) => json({ error: message }, status);

// Passcode check. Set LOG_PASSCODE in the Netlify dashboard (Site configuration → Environment variables).
export function authorized(req) {
  const expected = process.env.LOG_PASSCODE || "";
  const given = req.headers.get("x-passcode") || "";
  if (!expected) return false; // refuse all writes until a passcode is configured
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export const newId = () =>
  Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

const MAX_BODY = 20000;
const MAX_TITLE = 200;
const MAX_MEMBERS = 12;
const MAX_NAME = 60;

// Validate and normalise a posted entry. Returns {ok, value|error}.
export function cleanEntry(input) {
  if (!input || typeof input !== "object") return { ok: false, error: "Body must be JSON" };
  // `members` lists everyone who worked on the entry; `name` (the first member) is kept for older clients/entries.
  const members = Array.isArray(input.members)
    ? [...new Set(input.members.map((m) => String(m).trim().slice(0, MAX_NAME)).filter(Boolean))].slice(0, MAX_MEMBERS)
    : [];
  const legacyName = String(input.name || "").trim().slice(0, MAX_NAME);
  if (!members.length && legacyName) members.push(legacyName);
  const name = members[0] || "";
  const date = String(input.date || "").trim();
  const title = String(input.title || "").trim().slice(0, MAX_TITLE);
  const body = String(input.body || "").replace(/\r\n/g, "\n").trim();
  // Keep the tag's casing as sent (it comes from config.json), but dedupe case-insensitively.
  const seenTags = new Set();
  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t).trim()).filter((t) => t && !seenTags.has(t.toLowerCase()) && seenTags.add(t.toLowerCase())).slice(0, 8)
    : [];
  const imagesList = Array.isArray(input.images)
    ? input.images.filter((s) => typeof s === "string" && /^[a-z0-9-]+$/.test(s)).slice(0, 12)
    : [];
  if (!name) return { ok: false, error: "Pick at least one member" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Date must be YYYY-MM-DD" };
  if (!body && !title) return { ok: false, error: "Write something in the entry" };
  if (body.length > MAX_BODY) return { ok: false, error: `Entry is too long (max ${MAX_BODY} characters)` };
  return { ok: true, value: { name, members, date, title, body, tags, images: imagesList } };
}
