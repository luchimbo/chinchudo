/** @type {import('next').NextConfig} */
const nextConfig = {
  // La sección del blog vivía en /landings: se conservan los enlaces viejos.
  async redirects() {
    return [
      { source: "/landings/calendar", destination: "/blog/calendario", permanent: true },
      { source: "/landings/articles/:id", destination: "/blog/articulos/:id", permanent: true },
      { source: "/landings/editor", destination: "/blog/diseno", permanent: true },
      { source: "/landings/config", destination: "/blog/configuracion", permanent: true },
      { source: "/landings", destination: "/blog", permanent: true },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    },
    // Las secuencias de nurturing y las categorías viven en los datos del blog.
    outputFileTracingIncludes: {
      "/api/leads": ["./landing-build/data/lead_magnets.jsonl", "./landing-build/data/categorias_pcmidi.json"],
      "/api/leads/route": ["./landing-build/data/lead_magnets.jsonl", "./landing-build/data/categorias_pcmidi.json"],
      "/api/nurture": ["./landing-build/data/categorias_pcmidi.json"],
      "/api/nurture/route": ["./landing-build/data/categorias_pcmidi.json"]
    }
  }
};

export default nextConfig;

