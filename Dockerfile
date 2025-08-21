# ARGUMENTS
ARG NODE_VERSION=20
ARG PORT=5054

# ---- Base ----
# Base image for installing dependencies
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /usr/src/app

# ---- Dependencies ----
# Install production dependencies
FROM base AS deps
COPY package.json yarn.lock* package-lock.json* ./
RUN npm ci --only=production

# ---- Build ----
# Build the application (if any build step is needed)
FROM base AS build
COPY --from=deps /usr/src/app/node_modules /usr/src/app/node_modules
COPY . .
# If you have a build step, add it here. E.g., RUN npm run build

# ---- Production ----
# Final, minimal production image
FROM node:${NODE_VERSION}-alpine AS production

ENV NODE_ENV=production
ENV PORT=${PORT}

WORKDIR /home/node/app

# Create a non-root user for security
RUN addgroup -S node && adduser -S node -G node

# Copy dependencies and source code
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/ .

# Set correct permissions
RUN chown -R node:node .

# Switch to the non-root user
USER node

# Expose the port the app runs on
EXPOSE ${PORT}

# Healthcheck to ensure the service is running
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O- http://localhost:${PORT} || exit 1

# Graceful shutdown signal
STOPSIGNAL SIGINT

# The command to start the app
CMD [ "node", "src/index.js" ]
