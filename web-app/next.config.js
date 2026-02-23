/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    webpack: (config) => {
        config.resolve.alias['@'] = path.resolve(__dirname);
        // Suppress warnings from libraries that use dynamic requires for node compatibility
        config.ignoreWarnings = [
            { module: /@vladmandic\/face-api/ },
            { message: /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/ }
        ];
        return config;
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' }
                ],
            },
        ];
    },
};

module.exports = nextConfig;
