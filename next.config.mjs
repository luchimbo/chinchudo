/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    },
    // Las secuencias de nurturing y las categorías viven en los datos del blog.
    outputFileTracingIncludes: {
      "/api/leads": ["./landing-build/data/lead_magnets.jsonl", "./landing-build/data/categorias_pcmidi.json"],
      "/api/nurture": ["./landing-build/data/categorias_pcmidi.json"]
    }
  }
};

export default nextConfig;

