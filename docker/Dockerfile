FROM node:23-alpine AS builder
ARG DOCKER_BUILD="1"
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.2.1 --activate

# Copy everything (needed for postinstall script)
COPY . .

# Install dependencies with pnpm (postinstall will run)
RUN pnpm install --frozen-lockfile

# Makes the next output standalone
# https://github.com/vercel/next.js/discussions/65511
ENV NEXT_STANDALONE_OUTPUT="true"

RUN pnpm run build

FROM node:23-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Install sudo, Python, pip, Azure CLI, and build tools (devbox for workbench)
RUN apk update && apk add --no-cache \
    python3 \
    python3-dev \
    py3-pip \
    sudo \
    curl \
    bash \
    gcc \
    g++ \
    make \
    libffi-dev \
    openssl-dev \
    cargo \
    musl-dev \
    linux-headers \
    && pip3 install --upgrade pip --break-system-packages \
    && pip3 install --upgrade azure-cli --break-system-packages

# Give 'nextjs' user passwordless sudo for future runtime installs
RUN echo "nextjs ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy migrations content
COPY --from=builder /app/src/lib/db/migrations ./src/lib/db/migrations

USER nextjs

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
CMD ["node", "server.js"]
