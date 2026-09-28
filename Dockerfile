FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
COPY tests ./tests
COPY docs ./docs

ENV NODE_ENV=development

CMD ["npm", "run", "dev:api"]
