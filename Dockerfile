FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN npm ci

# Next.js inlines public variables while building the browser bundle. Railway
# exposes service variables to Docker builds only when the ARG is declared.
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_DOMAIN_PACKS
ARG API_INTERNAL_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_DOMAIN_PACKS=$NEXT_PUBLIC_DOMAIN_PACKS
ENV API_INTERNAL_URL=$API_INTERNAL_URL

RUN npm --workspace @previley-transformer/web run build

ENV NODE_ENV=production

EXPOSE 3000 4000

CMD ["npm", "run", "start:backend"]
