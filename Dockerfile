FROM node:20 AS build

WORKDIR /app

COPY package*.json /app/
RUN npm install

COPY . .
ENV NEXT_PUBLIC_API_URL=https://davinci-code.net/api
ENV NEXT_PUBLIC_WS_URL=https://davinci-code.net/ws
ENV NEXT_DISABLE_LINTING=true

RUN npm run build

FROM node:20

WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

RUN npm install --omit=dev

CMD ["npm", "start"]
EXPOSE 3000