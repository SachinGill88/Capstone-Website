// GET    /api/entries          list all entries (public)
// POST   /api/entries          create (passcode)
// PUT    /api/entries/:id      update, keeps history (passcode)
// DELETE /api/entries/:id      delete entry + its images (passcode)
// POST   /api/auth             check passcode
import { entries, images, json, error, authorized, newId, cleanEntry } from "./_lib.mjs";

export const config = { path: ["/api/entries", "/api/entries/:id", "/api/auth"] };

const MAX_HISTORY = 25;

export default async (req, context) => {
  const url = new URL(req.url);
  const id = context.params?.id;

  if (url.pathname === "/api/auth") {
    if (req.method !== "POST") return error("Method not allowed", 405);
    return authorized(req) ? json({ ok: true }) : error("Wrong passcode", 401);
  }

  const store = entries();

  if (req.method === "GET" && id) {
    const one = await store.get(id, { type: "json" });
    return one ? json(one) : error("Entry not found", 404);
  }

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    const list = all
      .filter(Boolean)
      .map(({ history, ...rest }) => ({ ...rest, edits: history ? history.length : 0 }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
    return json(list);
  }

  if (!authorized(req)) return error("Passcode required", 401);

  if (req.method === "POST" && !id) {
    let input;
    try { input = await req.json(); } catch { return error("Body must be JSON", 400); }
    const c = cleanEntry(input);
    if (!c.ok) return error(c.error, 400);
    const now = Date.now();
    const entry = { id: newId(), ...c.value, createdAt: now, updatedAt: now, history: [] };
    await store.setJSON(entry.id, entry);
    return json(entry, 201);
  }

  if (!id) return error("Not found", 404);
  const existing = await store.get(id, { type: "json" });
  if (!existing) return error("Entry not found", 404);

  if (req.method === "PUT") {
    let input;
    try { input = await req.json(); } catch { return error("Body must be JSON", 400); }
    const c = cleanEntry(input);
    if (!c.ok) return error(c.error, 400);
    const snapshot = {
      at: existing.updatedAt, name: existing.name, members: existing.members, date: existing.date, title: existing.title,
      body: existing.body, tags: existing.tags, images: existing.images,
    };
    const history = [...(existing.history || []), snapshot].slice(-MAX_HISTORY);
    // images dropped from the entry are deleted from storage
    const removed = (existing.images || []).filter((k) => !c.value.images.includes(k));
    await Promise.all(removed.map((k) => images().delete(k).catch(() => {})));
    const updated = { ...existing, ...c.value, updatedAt: Date.now(), history };
    await store.setJSON(id, updated);
    return json(updated);
  }

  if (req.method === "DELETE") {
    await Promise.all((existing.images || []).map((k) => images().delete(k).catch(() => {})));
    await store.delete(id);
    return json({ ok: true });
  }

  return error("Method not allowed", 405);
};
