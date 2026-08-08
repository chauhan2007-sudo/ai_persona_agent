// topicSources.js
// Two live, no-API-key-required sources for topic discovery:
//   1. Hacker News (via the Algolia HN Search API)
//   2. arXiv (via its public Atom feed API)
// Both are real, live, external information sources — satisfying the
// "discover topics from live information sources" requirement without
// needing any credentials.

const DEFAULT_KEYWORDS = ["AI", "machine learning", "LLM"];

function domainToKeywords(domain) {
  if (!domain) return DEFAULT_KEYWORDS;
  // Split "AI Security" -> ["AI Security", "AI", "Security"], dedupe.
  const parts = domain.split(/\s+/).filter(Boolean);
  const set = new Set([domain, ...parts, ...DEFAULT_KEYWORDS]);
  return Array.from(set);
}

async function fetchHackerNews(domain) {
  const query = encodeURIComponent(domain || "AI");
  const url = `https://hn.algolia.com/api/v1/search?query=${query}&tags=story&numericFilters=points>10`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits || [])
      .filter((h) => h.title && (h.url || h.story_url))
      .slice(0, 8)
      .map((h) => ({
        title: h.title,
        summary: `Hacker News discussion, ${h.points ?? 0} points, ${h.num_comments ?? 0} comments.`,
        url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        source: "Hacker News",
        publishedAt: h.created_at,
      }));
  } catch (err) {
    console.error("[topicSources] Hacker News fetch failed:", err.message);
    return [];
  }
}

function stripXml(str) {
  return (str || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function fetchArxiv(domain) {
  const query = encodeURIComponent(`all:${domain || "artificial intelligence"}`);
  const url = `http://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=8`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = xml.split("<entry>").slice(1);
    return entries
      .map((raw) => {
        const titleMatch = raw.match(/<title>([\s\S]*?)<\/title>/);
        const summaryMatch = raw.match(/<summary>([\s\S]*?)<\/summary>/);
        const idMatch = raw.match(/<id>([\s\S]*?)<\/id>/);
        const publishedMatch = raw.match(/<published>([\s\S]*?)<\/published>/);
        if (!titleMatch || !idMatch) return null;
        return {
          title: stripXml(titleMatch[1]),
          summary: stripXml(summaryMatch ? summaryMatch[1] : "").slice(0, 400),
          url: stripXml(idMatch[1]),
          source: "arXiv",
          publishedAt: publishedMatch ? publishedMatch[1] : null,
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.error("[topicSources] arXiv fetch failed:", err.message);
    return [];
  }
}

async function discoverTopics(domain) {
  const [hn, arxiv] = await Promise.all([fetchHackerNews(domain), fetchArxiv(domain)]);
  return [...hn, ...arxiv];
}

function topicKey(topic) {
  return (topic.url || topic.title || "").toLowerCase().trim();
}

module.exports = { discoverTopics, topicKey, domainToKeywords };
