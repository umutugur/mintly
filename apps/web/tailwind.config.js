export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                panel: {
                    950: '#07111c',
                    900: '#0d1724',
                    800: '#132235',
                    700: '#20334c',
                    200: '#d5e4f5',
                    100: '#edf5ff',
                },
                accent: {
                    500: '#ff8a3d',
                    400: '#ff9f61',
                    300: '#ffc38f',
                },
                success: '#23c483',
                danger: '#f25f5c',
                warning: '#f7b538',
            },
            boxShadow: {
                panel: '0 25px 60px -24px rgba(7, 17, 28, 0.65)',
            },
            fontFamily: {
                display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
                body: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
            },
            backgroundImage: {
                grid: 'linear-gradient(rgba(213, 228, 245, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(213, 228, 245, 0.05) 1px, transparent 1px)',
            },
        },
    },
    plugins: [],
};
