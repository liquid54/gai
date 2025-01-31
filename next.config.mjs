/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        return [
            {
                source: '/api/heygen/talk',
                destination: 'https://api.heygen.com/v2/streaming/talk'  // Нова URL
            },
            {
                source: '/api/heygen/start',
                destination: 'https://api.heygen.com/v1/streaming.start'
            },
            {
                source: '/api/heygen/stop',
                destination: 'https://api.heygen.com/v1/streaming.stop'
            }
        ]
    }
};

export default nextConfig;