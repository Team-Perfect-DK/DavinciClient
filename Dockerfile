FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json /app/
RUN npm install

COPY . . 

RUN npm run build

FROM node:20-alpine

COPY --from=build /app/package*.json ./
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

RUN npm install --production

CMD ["npm", "start"]

EXPOSE 3000
