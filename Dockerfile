FROM node:22-alpine
RUN apk add --no-cache tzdata
ENV NODE_ENV=production TZ=Africa/Algiers DATA_DIR=/data PORT=3000
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "--no-warnings", "src/server.js"]
