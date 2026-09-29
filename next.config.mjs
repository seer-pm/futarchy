/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === 'development' ? undefined : 'export',
  images: {
    unoptimized: true, // Required for static export
    domains: [
      'kleros.io',
      'encrypted-tbn0.gstatic.com'
    ],
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  reactStrictMode: true,
  rewrites: process.env.NODE_ENV === 'development' ? async () => {
    return [
      {
        source: '/:path*/manifest.json',
        destination: '/manifest.json',
      },
    ];
  } : undefined,
};

export default nextConfig;
