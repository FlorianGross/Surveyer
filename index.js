const express = require('express')
const app = express()
const server = require('http').createServer(app);
const WebSocket = require('ws');

const wss = new WebSocket.Server({server:server});


wss.on('connection', function connection(ws){
    console.log("New Client connected")
    ws.send('Welcome new Client')
    
    ws.on('message', function incoming(message){
        console.log('recieved: %s', message)
        ws.send('Got your message')
    });
})

app.get('/', (req, res) => res.send("Hello World"))

server.listen(3000, ()=> console.log('Listening on Port :3000'))