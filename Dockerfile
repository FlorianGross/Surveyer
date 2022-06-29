FROM node:17.6.0

ENV MONGO_DB_USER=
ENV MONGO_DB_PASSWORD=
ENV MONGO_DB_NAME=
ENV MONGO_DB_PORT=
ENV MONGO_DB_CONNECTION_STRING=mongodb+srv://webdev:MeinCoolesPassword@cluster0.2snr7nl.mongodb.net/?retryWrites=true&w=majority

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD [ "node", "app.js" ]