import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le viseur guidé a besoin de la caméra : on l'autorise explicitement.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self)" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
