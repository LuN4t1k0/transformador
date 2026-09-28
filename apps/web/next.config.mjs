/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Turbopack (default dev bundler) handles the CommonJS workspace packages without extra configuration.
  turbopack: {},
  webpack(config) {
    // Workspace packages (@previley-transformer/*) are CommonJS symlinks. Keeping their node_modules path stops
    // the dev server from treating them as app code and injecting React Refresh (ESM `import.meta`) into them.
    config.resolve.symlinks = false;
    return config;
  }
};

export default nextConfig;
