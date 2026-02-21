FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install dependencies based on the preferred package manager
COPY package.json bun.lock* ./
RUN \
  if [ -f bun.lock ]; then bun install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application with environment variables
ARG NODE_ENV=production
ARG CONVEX_SELF_HOSTED_URL
ARG CONVEX_SELF_HOSTED_ADMIN_KEY
ARG VITE_CONVEX_URL
ARG VITE_LOGTO_ENDPOINT
ARG VITE_LOGTO_APP_ID
ARG VITE_LOGTO_SCOPES
ARG VITE_LOGTO_RESOURCES
ARG VITE_LOGTO_API_RESOURCE
ARG VITE_SITE_URL
ARG LOGTO_WEBHOOK_SIGNING_KEY
ARG LOGTO_API_RESOURCE

ENV NODE_ENV=${NODE_ENV}
ENV CONVEX_SELF_HOSTED_URL=${CONVEX_SELF_HOSTED_URL}
ENV CONVEX_SELF_HOSTED_ADMIN_KEY=${CONVEX_SELF_HOSTED_ADMIN_KEY}
ENV VITE_CONVEX_URL=${VITE_CONVEX_URL}
ENV VITE_LOGTO_ENDPOINT=${VITE_LOGTO_ENDPOINT}
ENV VITE_LOGTO_APP_ID=${VITE_LOGTO_APP_ID}
ENV VITE_LOGTO_SCOPES=${VITE_LOGTO_SCOPES}
ENV VITE_LOGTO_RESOURCES=${VITE_LOGTO_RESOURCES}
ENV VITE_LOGTO_API_RESOURCE=${VITE_LOGTO_API_RESOURCE}
ENV VITE_SITE_URL=${VITE_SITE_URL}
ENV LOGTO_WEBHOOK_SIGNING_KEY=${LOGTO_WEBHOOK_SIGNING_KEY}
ENV LOGTO_API_RESOURCE=${LOGTO_API_RESOURCE}

RUN bun run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

# Install bun for runtime
RUN apk add --no-cache libc6-compat curl
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Build-time arguments that become runtime environment variables
ARG NODE_ENV=production
ARG CONVEX_SELF_HOSTED_URL
ARG CONVEX_SELF_HOSTED_ADMIN_KEY
ARG VITE_CONVEX_URL
ARG VITE_LOGTO_ENDPOINT
ARG VITE_LOGTO_APP_ID
ARG VITE_LOGTO_SCOPES
ARG VITE_LOGTO_RESOURCES
ARG VITE_LOGTO_API_RESOURCE
ARG VITE_SITE_URL
ARG LOGTO_WEBHOOK_SIGNING_KEY
ARG LOGTO_API_RESOURCE

# Set environment variables for runtime
ENV NODE_ENV=${NODE_ENV}
ENV CONVEX_SELF_HOSTED_URL=${CONVEX_SELF_HOSTED_URL}
ENV CONVEX_SELF_HOSTED_ADMIN_KEY=${CONVEX_SELF_HOSTED_ADMIN_KEY}
ENV VITE_CONVEX_URL=${VITE_CONVEX_URL}
ENV VITE_LOGTO_ENDPOINT=${VITE_LOGTO_ENDPOINT}
ENV VITE_LOGTO_APP_ID=${VITE_LOGTO_APP_ID}
ENV VITE_LOGTO_SCOPES=${VITE_LOGTO_SCOPES}
ENV VITE_LOGTO_RESOURCES=${VITE_LOGTO_RESOURCES}
ENV VITE_LOGTO_API_RESOURCE=${VITE_LOGTO_API_RESOURCE}
ENV VITE_SITE_URL=${VITE_SITE_URL}
ENV LOGTO_WEBHOOK_SIGNING_KEY=${LOGTO_WEBHOOK_SIGNING_KEY}
ENV LOGTO_API_RESOURCE=${LOGTO_API_RESOURCE}

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the built application
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Set the correct permissions
USER nextjs

# Expose port
EXPOSE 3000

# Set environment variables
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Start the application
CMD ["bun", "run", "preview"]
