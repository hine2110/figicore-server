# Stage 1: Build the application
FROM node:20-bookworm-slim AS build

# Set the working directory
WORKDIR /usr/src/app

ENV DEBIAN_FRONTEND=noninteractive

# Native build dependencies for modules like `canvas`.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    openssl \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the package.json and package-lock.json
COPY package*.json ./

# Copy Prisma schema early so Prisma Client generation (postinstall) has it.
COPY prisma/schema.prisma ./prisma/schema.prisma
# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Ensure Prisma Client is generated from the current schema inside the image.
RUN npx prisma generate

# Build the application
RUN npm run build

# Stage 2: Run the application
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    tzdata \
    openssl \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /usr/src/app

# Copy only the necessary files from the build stage
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/package.json ./package.json
COPY --from=build --chown=node:node  /usr/src/app/node_modules ./node_modules
RUN npm i typeorm


# Command to run the application
CMD ["node", "dist/main"]