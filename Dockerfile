FROM node:24-alpine

WORKDIR /app

COPY apps ./apps
COPY packages ./packages
COPY tests ./tests
COPY docs ./docs
COPY package.json package-lock.json* ./

RUN npm install

ENV NODE_ENV=development

CMD ["npm", "run", "dev:api"]
