FROM node:20-slim

# better-sqlite3 needs a build toolchain to compile its native binding.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

RUN mkdir -p data
EXPOSE 4000
CMD ["node", "src/server.js"]
