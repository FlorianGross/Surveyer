const express = require('express');
const app = express()
const WebSocket = require('ws');
const cors = require('cors');
app.use(cors);

const mongoose = require("mongoose");
const internal = require('stream');
const  { Schema } = mongoose;

const sessionSchema = new Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    participants: Array,
});
const userSchema = new Schema({
    userName: String,
})
const surveySchema = new Schema({
    surveySession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Sessions"
    },
    surveyOpened: Boolean,
    surveyName: String,
    surveyApprove: Number,
    surveyDeny: Number,
    surveyNotParicipate: Number,
    surveyOptions: Array,
    surveyOptionResults: Array,
});


mongoose.connect('mongodb://root:example@localhost:27018', {useNewUrlParser: true, useUnifiedTopology: true, dbName: "android"}).then(()=>{
    console.log("Successfully connected to MongoDB")}).catch(err=>console.log("Error connecting to DB: " + err));
var Session = mongoose.model('Sessions', sessionSchema);
var Surveys = mongoose.model('Surveys', surveySchema);
var User = mongoose.model('User', userSchema);

const server = require('http').createServer(app);

const wss = new WebSocket.Server({server:server});
wss.on('connection', async (ws) => {
    console.log("New Client Connected");
    var user = await User.create({
        userName: Math.random.toString
    });
    console.log("User registered: " + user._id);
    ws.send(JSON.stringify({ "Type": "InitAnswer", "uid": user._id}));
    
    ws.on('message', async (message) => {
        console.log('received: %s', message);
        var obj = JSON.parse(message);
        switch(obj.Type){
            case "startSession":{
                try{
                var usertmp = await User.findById(obj.uid)
                var sessionTemp = await Session.create({
                    owner: usertmp,
                    participants: [usertmp],
                });
                var answer = {
                    "Type": "Answer",
                    "sessionId": sessionTemp._id
                }
                ws.send(JSON.stringify(answer));
            }catch(e){
                ws.send(JSON.stringify({"Type":"Error", "Message": e}));
                console.log("Error in startSession" + e);
            }
                break;
            }
            case "stopSession": {
                var answer = {
                    "Type": "Answer",
                    "Result": "Successful"
                }
                break;
            }
            default: break;
        }
    }); 
    ws.on('close', ()=>{
        console.log("Client disconnected")
    })
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`Server started on port ${server.address().port}`);
});