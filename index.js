const express = require('express');
const app = express()
const WebSocket = require('ws');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config()
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
    surveyDescription: String,
    surveyOpened: Boolean,
    surveyName: String,
    surveyApprove: Number,
    surveyDeny: Number,
    surveyNotParicipate: Number,
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
});

async function connectToDB(){
mongoose.connect(process.env.MONGO_DB_CONNECTION_STRING || 'mongodb://' + process.env.MONGO_DB_USER + ':' + process.env.MONGO_DB_PASSWORD + '@' + process.env.MONGO_DB_NAME + ':' + process.env.MONGO_DB_PORT, { useNewUrlParser: true, useUnifiedTopology: true, dbName: "android" }).then(() => {
    console.log("Successfully connected to MongoDB")
}).catch(err => {console.log("Error connecting to DB: " + err); connectToDB();});
}

connectToDB();
var Session = mongoose.model('Sessions', sessionSchema);
var Surveys = mongoose.model('Surveys', surveySchema);
var User = mongoose.model('User', userSchema);

const server = require('http').createServer(app);

const wss = new WebSocket.Server({ server: server });

var CLIENTS = []
var id = 0;
wss.on('connection', async (ws) => {
    CLIENTS.push(ws)
    console.log(CLIENTS.length)
    console.log("New Client Connected " + id++);
    ws.on('message', async (message) => {
        console.log('received: %s', message);
        var obj = JSON.parse(message);
        useJSON(obj, ws);
    });
    ws.on('close', () => {
        CLIENTS.pop(ws)
        console.log(CLIENTS.length)
        console.log("Client disconnected")
    })
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`Server started on port ${server.address().port}`);
});

async function useJSON(obj, ws) {
    switch (obj.Type) {
        case "registerClient": {
            registerClient(obj, ws);
            break;
        }
        case "registerUser": {
            registerUser(obj, ws);
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
        case "callRefresh":{
            callRefresh(this.CLIENTS);
            break;
        }
        case "refreshAll": {
            refreshAll(obj, ws);
            break;
        }
        case "refreshSurveyByID": {
            refreshSurveyByID(obj, ws);
            break;
        }
        case "refreshSurveyByUID": {
            refreshSurveyByUID(obj, ws);
            break;
        }
        case "refreshSession": {
            refreshSession(obj, ws);
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
    try {
        var user = await User.findById(obj.uid);
        var surveyTemp = await Surveys.create({
            surveySession: await Session.findById(obj.sessionId),
            creator: obj.uid,
            surveyOpened: true,
            surveyName: obj.surveyName,
            surveyApprove: 0,
            surveyDeny: 0,
            surveyNotParicipate: 0,
            participants: [user]
        });
        var answer = {
            "Type": "Answer",
            "surveyID": surveyTemp._id
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

async function stopSurvey(obj) {

}

async function registerClient(ws) {
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

async function missingType(obj, ws) {
    ws.send(JSON.stringify({ "Type": "Error", "Result": obj }));
}

async function registerUser(obj, ws){
    try {
        var user = await User.create({
            userName: obj.name,
            email: obj.email,
            password: obj.password
        });
        var answer = {
            "Type": "Answer",
            "Result": "Status",
            "Status": 101,
        };
    } catch (e) {
        console.log(e)
        var answer = {
            "Type": "Answer",
            "Result": "Status",
            "Status": -1,
        }
    }
    ws.send(JSON.stringify(answer));
}

async function sendMessageToAll(obj) {
    for (i = 0; i < CLIENTS.length; i++) {
        CLIENTS[i].send(obj);
    }
}

async function callRefresh(){
    try{
        var answer = {
            "Type":"Answer",
            "Result":"callRefresh"
        }
        sendMessageToAll(JSON.stringify(answer));

    }catch(e){
        console.log(e);

    }
}

async function refreshAll(obj, ws) {
    refreshAllSurvey(obj, ws);
    refreshAllSessions(obj, ws);
}

async function refreshSurveyByUID(obj, ws) {
    try {
        var user = await User.findById(obj.uid);
        var surveys = await Surveys.find({ participants: user });
        var answer = {
            "Type": "Answer",
            "Refresh": "SurveyByUID",
            "Result": surveys
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

async function refreshSurveyByID(obj, ws) {
    try {
        var survey = await Surveys.findById(obj.surveyID);
        var answer = {
            "Type": "Answer",
            "Refresh": "SurveyByID",
            "Result": survey
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

async function refreshSession(obj, ws) {
    try {
        var sessionm = Session.find({ _id: obj.sessionID })
        var answer = {
            "Type": "Refresh",
            "Refresh": "Session",
            "Result": sessionm
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

async function refreshAllSessions(obj, ws) {
    try {
        var sessions = await Session.find({});
        var answer = {
            "Type": "Refresh",
            "Refresh": "AllSessions",
            "Result": sessions
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

async function refreshAllSurvey(obj, ws) {
    try {
        var surveys = await Surveys.find({});
        var answer = {
            "Type": "Refresh",
            "Refresh": "AllSurvey",
            "Result": surveys
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

async function waitForMongoDBStart(uri, timeoutMs) {

    return new Promise( async (resolve, reject) => {

        let endTime = Date.now() + timeoutMs;


        while (true) {

            let connectionError;

            function errorHandler(err) {
                connectionError = err;
            }
            mongoose.connection.once("error", errorHandler);

            await mongoose.connect(uri, {
                connectTimeoutMS: 5000, // This timeout applies only after connected & connection lost
                useNewUrlParser: true,
                useFindAndModify: false
            });

            // Time for error event propagation
            //await sleep(0);

            if ( ! connectionError) {
                mongoose.connection.removeListener("error", errorHandler);
                return resolve(); // All OK, connected
            }

            if (connectionError.name !== "MongoNetworkError") {
                return reject(`Unable to connect mongoDB. Details: ${connectionError}`);
            }

            if (Date.now() > endTime) {
                return reject(`Unable to connect mongoBD in ${timeoutMs} ms. Details: ${connectionError}`);
            }

        }

    });
}
