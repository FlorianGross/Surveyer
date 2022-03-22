const express = require('express');
const app = express()
const WebSocket = require('ws');
const cors = require('cors');
app.use(cors);

const mongoose = require("mongoose");
const { Schema } = mongoose;

const sessionSchema = new Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    isActive: Boolean,
});

const userSchema = new Schema({
    userName: String,
    email: String,
    password: String,
})

const surveySchema = new Schema({
    surveySession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Sessions"
    },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    surveyOpened: Boolean,
    surveyName: String,
    surveyApprove: Number,
    surveyDeny: Number,
    surveyNotParicipate: Number,
    surveyOptions: [String],
    surveyOptionResults: [{ Number, Number, Number }],
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
});

mongoose.connect('mongodb://root:example@localhost:27018', { useNewUrlParser: true, useUnifiedTopology: true, dbName: "android" }).then(() => {
    console.log("Successfully connected to MongoDB")
}).catch(err => console.log("Error connecting to DB: " + err));
var Session = mongoose.model('Sessions', sessionSchema);
var Surveys = mongoose.model('Surveys', surveySchema);
var User = mongoose.model('User', userSchema);

const server = require('http').createServer(app);

const wss = new WebSocket.Server({ server: server });
wss.on('connection', async (ws) => {
    console.log("New Client Connected");
    ws.on('message', async (message) => {
        console.log('received: %s', message);
        var obj = JSON.parse(message);
        useJSON(obj, ws);
    });
    ws.on('close', () => {
        console.log("Client disconnected")
    })
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`Server started on port ${server.address().port}`);
});

async function useJSON(obj, ws){
    switch (obj.Type) {
        case "registerClient": {
            registerClient(obj, ws);
            break;
        }
        case "startSession": {
            startSession(obj, ws);
            break;
        }
        case "stopSession": {
            stopSession(obj, ws);
            break;
        }
        case "startSurvey": {
            startSurvey(obj, ws);
            break;
        }
        case "stopSurvey": {
            stopSurvey(obj, ws);
            break;
        }
        default: 
        missingType(obj, ws);
        break;
    }
}

async function startSession(obj, ws) {
    try {
        var usertmp = await User.findById(obj.uid)
        var sessionTemp = await Session.create({
            owner: usertmp,
            participants: [usertmp],
            isActive: true
        });
        var answer = {
            "Type": "Answer",
            "sessionId": sessionTemp._id
        }
        ws.send(JSON.stringify(answer));
    } catch (e) {
        ws.send(JSON.stringify({ "Type": "Error", "Message": e }));
        console.log("Error in startSession" + e);
    }
}

async function stopSession(obj, ws) {
    try {
        currentSession = await Session.findById(obj.sessionId);
        currentSession.isActive = false;
        await currentSession.save();
        var answer = {
            "Type": "Answer",
            "Result": "Session stopped Successful"
        }
    } catch (e) {
        console.log(e)
        var answer = {
            "Type": "Error",
            "Result": e
        }
    }
    ws.send(JSON.stringify(answer));
}

async function startSurvey(obj, ws) {

}

async function stopSurvey(obj) {

}

async function registerClient(obj, ws) {
    try {
        var user = await User.create({});
        var answer = {
            "Type": "Answer",
            "Result": "Client registered Successful",
            "uid": user._id
        };
    } catch (e) {
        console.log(e)
        var answer = {
            "Type": "Error",
            "Result": e
        }
    }
    ws.send(JSON.stringify(answer));
}

async function missingType(obj, ws){
    ws.send(JSON.stringify({"Type": "Error", "Result": obj}));
}