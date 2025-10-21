# Use the base sandbox image
FROM docker.io/cloudflare/sandbox:0.3.3

# Install Playwright dependencies required for the Tester pathway
RUN apt-get update && \
    apt-get install -y \
      libnss3 \
      libnspr4 \
      libdbus-1-3 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libatspi2.0-0 \
      libxkbcommon0 \
      libdrm2 \
      libgbm1 \
      libasound2 && \
    rm -rf /var/lib/apt/lists/*

# Install Playwright via npm
RUN npm install -g playwright
