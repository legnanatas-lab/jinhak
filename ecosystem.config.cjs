module.exports = {
  apps: [
    {
      name: "gijang-center",
      script: "server.mjs",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3000
      }
    }
  ]
};
