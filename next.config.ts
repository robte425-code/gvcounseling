import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  serverExternalPackages: ["pdf-parse", "pdf-to-img", "pdfjs-dist"],
};

export default nextConfig;
