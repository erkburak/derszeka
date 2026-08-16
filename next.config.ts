import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ana dizinde bir package-lock.json bulunduğunda Turbopack'in kökü
  // yanlış çıkarmasını engeller.
  turbopack: { root: path.resolve(".") },

  serverExternalPackages: ["unpdf", "mammoth"],

  experimental: {
    serverActions: {
      // Dekont ve materyal yüklemeleri için yeterli gövde boyutu.
      bodySizeLimit: "10mb",
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
