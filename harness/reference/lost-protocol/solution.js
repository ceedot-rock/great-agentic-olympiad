"use strict";

function respond(status, body) {
  return { status, body };
}

function handle(request, state) {
  if (!request || typeof request !== "object") return respond(400, { error: "bad_request" });
  if (!state || !Array.isArray(state.items)) state = { items: [], next: 1 };
  const method = String(request.method || "").toUpperCase();
  const rawPath = String(request.path || "");
  const parts = rawPath.split("/").filter(Boolean);
  const body = request.body && typeof request.body === "object" ? request.body : {};

  if (parts[0] !== "items") return respond(404, { error: "no_route" });

  if (parts.length === 1) {
    if (method === "GET") return respond(200, { items: state.items.map((item) => ({ ...item })) });
    if (method === "POST") {
      if (typeof body.name !== "string" || body.name.trim() === "") return respond(400, { error: "name_required" });
      const item = { id: `item-${state.next}`, name: body.name };
      state.next += 1;
      state.items.push(item);
      return respond(201, { ...item });
    }
    return respond(405, { error: "method_not_allowed" });
  }

  if (parts.length === 2) {
    const id = parts[1];
    const idx = state.items.findIndex((item) => item.id === id);
    if (method === "GET") {
      if (idx < 0) return respond(404, { error: "not_found" });
      return respond(200, { ...state.items[idx] });
    }
    if (method === "PATCH") {
      if (idx < 0) return respond(404, { error: "not_found" });
      if (typeof body.name !== "string" || body.name.trim() === "") return respond(400, { error: "name_required" });
      state.items[idx] = { ...state.items[idx], name: body.name };
      return respond(200, { ...state.items[idx] });
    }
    if (method === "DELETE") {
      if (idx < 0) return respond(404, { error: "not_found" });
      state.items.splice(idx, 1);
      return respond(204, null);
    }
    return respond(405, { error: "method_not_allowed" });
  }

  return respond(404, { error: "no_route" });
}

module.exports = { handle };
