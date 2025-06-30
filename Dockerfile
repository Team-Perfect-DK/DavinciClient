# --- Build stage ---
FROM node:20 AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NEXT_PUBLIC_API_URL=https://davinci-code.net/api
ENV NEXT_PUBLIC_WS_URL=https://davinci-code.net/ws
ENV NEXT_DISABLE_LINTING=true

RUN npm run build

# --- Production stage ---
FROM node:20

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/package*.json ./

ENV NODE_ENV=production

EXPOSE 3000
CMD ["npm", "start"]