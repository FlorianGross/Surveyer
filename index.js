const express = require('express');
const app = express()
const WebSocket = require('ws');
const cors = require('cors');
app.use(cors);

const mongoose = require("mongoose");

mongoose.connect('mongodb://root:example@localhost:27018/', {useNewUrlParser: true, useUnifiedTopology: true}).then(()=>{
    console.log("Successfully connected to MongoDB")}).catch(err=>console.log("Error connecting to DB: " + err));

const server = require('http').createServer(app);

const wss = new WebSocket.Server({server:server});

wss.on('connection', (ws) => {
    console.log("New Client Connected");
    ws.on('message', (message) => {
        console.log('received: %s', message);
        var obj = JSON.parse(message);
        switch(obj.Type){
            case "startSession":{
                var answer = {
                    "Type": "Answer",
                }
                ws.send(JSON.stringify(answer))
                break;
            }
            case "stopSession": {
                activeSessions.pop(1)
                var answer = {
                    "Type": "Answer",
                    "Result": "Successful"
                }
                break;
            }
            default: break;
        }
    }); 
    ws.send('Successfully Connected to WS');

    ws.on('close', ()=>{
        console.log("Client disconnected")
    })
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`Server started on port ${server.address().port}`);
});