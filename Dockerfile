# Custom Dockerfile for Node.js Express + Vite React app
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the Vite frontend
RUN npm run build

# Expose port (Railway sets PORT env var)
EXPOSE 3000

# Start the Express server
CMD ["npm", "start"]
