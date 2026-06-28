FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .
RUN mkdir -p /app/data/uploads

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD node -e "const http = require('http'); const port = process.env.BACKEND_PORT || 3001; const req = http.get({ hostname: '127.0.0.1', port, path: '/api/health', timeout: 3000 }, (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('timeout', () => { req.destroy(); process.exit(1); }); req.on('error', () => process.exit(1));"

CMD ["node", "app.js"]
