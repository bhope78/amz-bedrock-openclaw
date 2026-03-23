FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY src/ ./src/

# Data directory for SQLite (mount as volume for persistence)
RUN mkdir -p /app/data
ENV FEEDBACK_DB_PATH=/app/data/feedback.db
ENV FEEDBACK_API_PORT=3456

EXPOSE 3456

CMD ["npx", "tsx", "src/index.ts"]
