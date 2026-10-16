export type BlogPublicationJob = {
  id: string;
  title: string;
  status: string;
  error: string;
  url: string | null;
  updatedAt: string;
};

export const BLOG_PUBLICATION_STARTED = "blog-publication-started";
export type PublicationStarted = { id: string; client: string; title: string };

export function notifyPublicationStarted(job: PublicationStarted) {
  window.dispatchEvent(new CustomEvent<PublicationStarted>(BLOG_PUBLICATION_STARTED, { detail: job }));
}

export function publicationJob(row: {
  id: string; status: string; lastError: string; needsDeploy: boolean; updatedAt: Date;
  landing: { titulo: string; slug: string; contentCluster: { slug: string } | null } | null;
}, blogBaseUrl: string): BlogPublicationJob {
  const status = row.status === "PUBLISHED" && row.lastError ? "FAILED" : row.status === "PUBLISHED" && row.needsDeploy ? "PUBLISHING" : row.status;
  let url: string | null = null;
  if (status === "PUBLISHED" && row.landing?.contentCluster && blogBaseUrl) {
    try {
      const base = new URL(blogBaseUrl);
      if (["https:", "http:"].includes(base.protocol)) url = new URL(`/guias/${encodeURIComponent(row.landing.contentCluster.slug)}/${encodeURIComponent(row.landing.slug)}/`, base).href;
    } catch { /* No link until a valid public destination exists. */ }
  }
  return { id: row.id, title: row.landing?.titulo || "Artículo del blog", status, error: row.lastError, url, updatedAt: row.updatedAt.toISOString() };
}
