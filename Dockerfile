FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json /app/
RUN npm install

COPY . .
ENV NEXT_PUBLIC_API_URL=https://davinci-code.net/api
RUN npm run build --ignore-lint

FROM node:20-alpine

COPY --from=build /app/package*.json ./
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

RUN npm install --production

CMD ["npm", "start"]

EXPOSE 3000
