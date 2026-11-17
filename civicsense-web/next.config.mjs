/** @type {import('next').NextConfig} */
const nextConfig = {
  // @xenova/transformers ships native-ish bits that must not be bundled by
  // webpack; leaving it external lets Node require it at runtime instead.
  experimental: {
    serverComponentsExternalPackages: ['@xenova/transformers'],
  },
};

export default nextConfig;
