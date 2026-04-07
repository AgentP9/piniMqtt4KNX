FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY src/ ./src/
COPY public/ ./public/

# Default config – seeded into the named volume on first deployment
COPY config/ ./config/

EXPOSE 3000

CMD ["node", "src/index.js"]
