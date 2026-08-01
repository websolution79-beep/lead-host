import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/marketing/revenue-estimates/[estimateId]/pdf": [
      "./node_modules/pdfkit/js/data/**/*",
    ],
  },
};

export default nextConfig;
