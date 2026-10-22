FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
USER node
ENV HOST=0.0.0.0 PORT=3000 APP_MODE=public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
