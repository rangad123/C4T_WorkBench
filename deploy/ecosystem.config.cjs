// pm2 alternative to practice-store.service. Start by hand: `pm2 start deploy/ecosystem.config.cjs`.
// One instance only: all data lives in memory in one process.
module.exports = {
    apps: [
        {
            name: "practice-store",
            script: "server/index.mjs",
            cwd: "/opt/practice-store",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            max_memory_restart: "512M",
            env: {
                PORT: "8080",
                HOST: "127.0.0.1",
                TRUST_PROXY: "1",
                SESSION_SECRET: "CHANGE-ME", // `openssl rand -hex 32`
                RESET_TOKEN: "CHANGE-ME", // replace with `openssl rand -hex 24`
                // BUGS: "all",           // only for a defect-hunting copy
            },
        },
    ],
};
