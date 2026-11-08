"use strict";

function search(docs, query) {
  const terms = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const scored = (Array.isArray(docs) ? docs : []).map((doc) => {
    const title = String(doc.title || "").toLowerCase();
    const text = String(doc.text || "").toLowerCase();
    const tags = Array.isArray(doc.tags) ? doc.tags.map((t) => String(t).toLowerCase()) : [];
    let grade = 0;
    for (const term of terms) {
      if (title.includes(term)) grade += 3;
      else if (tags.some((t) => t.includes(term))) grade += 2;
      else if (text.includes(term)) grade += 1;
    }
    grade += Math.max(0, (30 - Number(doc.updated || 30)) / 30);
    return { id: doc.id, grade, updated: Number(doc.updated || 30) };
  });
  scored.sort((a, b) => b.grade - a.grade || a.updated - b.updated);
  return scored.map((x) => x.id);
}

module.exports = { search };
