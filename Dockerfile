FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY src/ ./src/
COPY public/ ./public/

# Config directory – intended as a bind-mount volume at runtime
RUN mkdir -p /app/config

EXPOSE 3000

CMD ["node", "src/index.js"]
