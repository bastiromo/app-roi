import type { NextConfig } from "next";

// Cache Components desactivado a propósito: en una app financiera cada vista
// debe leer datos frescos de la base; el cacheo se agregará solo donde se mida la necesidad.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
