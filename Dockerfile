FROM node:17.6.0

ENV MONGO_DB_USER=root
ENV MONGO_DB_PASSWORD=example
ENV MONGO_DB_NAME=localhost
ENV MONGO_DB_PORT=27019

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD [ "node", "index.js" ]