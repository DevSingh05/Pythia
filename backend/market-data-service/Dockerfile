FROM oven/bun:1.1-slim

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
