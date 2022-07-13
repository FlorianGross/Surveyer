const express = require("express");
const app = express();
const WebSocket = require("ws");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
dotenv.config();
app.use(cors);

const mongoose = require("mongoose");
const { Console } = require("console");
const { Schema } = mongoose;
var CLIENTS = [];
var anonym = "";

class SocketServer {
  constructor(server) {
    var id = 0;
    this.listen = () => {
      SocketServer.websocket.on("connection", async (socket) => {
        CLIENTS.push(socket);
        console.log("New Client Connected " + id++);
        socket.isAlive = true;
        handleMessage(
          socket,
          new EventModel().createFromEvent(EventType.IN_EVENT_ONLINE, {})
        );
        this.listenForSocketEvents(socket);
      });
    };
    this.listenForSocketEvents = (socket) => {
      socket.on("message", async (data) => {
        handleMessage(socket, new EventModel().createFromAny(data));
      });
      socket.on("pong", (data) => {
        socket.isAlive = true;
      });
      socket.on("close", async () => {
        CLIENTS.pop(socket);
        console.log("Client disconnected");
        id--;
        await handleMessage(
          socket,
          new EventModel().createFromEvent(EventType.IN_EVENT_OFFLINE, {})
        );
      });
    };
    this.beginPing = () => {
      setInterval(function ping() {
        SocketServer.websocket.clients.forEach(function each(socket) {
          if (socket.isAlive === false) return socket.terminate();
          socket.isAlive = false;
          socket.ping(function noop() { });
        });
      }, 30000);
    };
    SocketServer.websocket = initWs(server);
    this.listen();
    this.beginPing();
  }
  static getWebsocketServer() {
    return this.websocket;
  }
}

function initWs(server) {
  return new WebSocket.Server({
    server: server,
    clientTracking: true,
  });
}

handleMessage = (socket, eventModel) => {
  console.log("Handle Message:" + eventModel);
  switch (eventModel.eventType) {
    case EventType.IN_EVENT_ONLINE:
      sendEvent(socket, createWelcomeEventModel());
      break;
    case EventType.IN_EVENT_MESSAGE:
      console.log("Message from: "+eventModel.location);
      useJSON(eventModel.payload, socket, eventModel.location);
      break;
  }
};

createWelcomeEventModel = () => {
  return new EventModel().createFromEvent(
    EventType.OUT_EVENT_ONLINE,
    `Welcome`,
    null,
  );
};

sendEvent = (socket, eventModel) => {
  console.log("Send Event:" + JSON.stringify({ event: eventModel.eventType , location: eventModel.location})+"\n");
  socket.send(
    JSON.stringify({ event: eventModel.eventType, payload: eventModel.payload, location: eventModel.location})
  );
};

closeConnection = async (message) => {
  console.log("Closing connection");
};

class EventModel {
  constructor() {
    this.createFromEvent = (eventType, payload, location) => {
      this.eventType = eventType;
      this.payload = payload;
      this.location = location;
      return this;
    };
    this.createFromAny = (data) => {
      try {
        const object = JSON.parse(data);
        if (!object.hasOwnProperty("event")) return;
        this.eventType = object.event;
        this.payload = object.payload;
        this.location = object.location;
      } catch (e) {
        console.error("Json parse error: ", e);
      }
      return this;
    };
  }
}
var EventType;
(function (EventType) {
  // In Events
  EventType["IN_EVENT_ONLINE"] = "online";
  EventType["IN_EVENT_MESSAGE"] = "message";
  EventType["IN_EVENT_REQUEST_QUE"] = "request_que";
  EventType["IN_EVENT_OFFLINE"] = "offline";
  EventType["IN_EVENT_REFRESH"] = "refresh";
  // Out Events
  EventType["OUT_EVENT_ONLINE"] = "online";
  EventType["OUT_EVENT_MESSAGE"] = "message";
})((EventType = EventType || (EventType = {})));

const sessionSchema = new Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  surveys: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Surveys", },
  ],
  name: {
    type: String,
    required: true,
  },
  description: String,
  isActive: Boolean,
});

const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
  },
  shownName: {
    type: String,
    required: true,
  },
  anonymous: Boolean,
  password: String,
});

const surveySchema = new Schema({
  surveySession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sessions",
    required: true,
  },
  creator: { 
    type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, 
  },
  surveyDescription: String,
  surveyOpened: Boolean,
  surveyName: {
    type: String,
    required: true,
  },
  surveyApprove: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  surveyDeny: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  surveyNotParicipate: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  anonymous: Boolean,
  allowEnthaltung: Boolean,
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

async function connectToDB() {
  mongoose
    .connect(
      process.env.MONGO_DB_CONNECTION_STRING ||
      "mongodb://" +
      process.env.MONGO_DB_USER +
      ":" +
      process.env.MONGO_DB_PASSWORD +
      "@" +
      process.env.MONGO_DB_NAME +
      ":" +
      process.env.MONGO_DB_PORT,
      { useNewUrlParser: true, useUnifiedTopology: true, dbName: "android" }
    )
    .then(() => {
      console.log("Successfully connected to MongoDB");
    })
    .catch((err) => {
      console.log("Error connecting to DB: " + err);
      connectToDB();
    });
}

connectToDB();
var Session = mongoose.model("Sessions", sessionSchema);
var Surveys = mongoose.model("Surveys", surveySchema);
var User = mongoose.model("User", userSchema);

const server = require("http").createServer(app);

var wss = new SocketServer(server);

server.listen(process.env.PORT || 3000, () => {
  console.log(`Server started on port ${server.address().port}`);
  getAnonymousID();
});

async function useJSON(payload, ws, location) {
  console.log("Use JSON:" + JSON.stringify(payload));
  switch (payload.type) {
    case "loginUser": {
      loginUser(payload, ws, location);
      break;
    }
    case "registerUser": {
      registerUser(payload, ws, location);
      break;
    }
    case "createSession": {
      startSession(payload, ws, location);
      break;
    }
    case "getAllSurveysFromSession": {
      getAllSurveysFromSession(payload, ws, location);
      break;
    }
    case "getAllSessionsNames":{
      getAllSessionsNames(payload, ws, location);
      break;
    }
    case "getAllSurveys": {
      getAllSurveys(payload, ws, location);
      break;
    }
    case "getAllSessions": {
      getAllSessions(payload, ws, location);
      break;
    }
    case "getAllSessionsAndSurveys": {
      getAllSessionsAndSurveys(payload, ws, location);
      break;
    }
    case "joinSession": {
      joinSession(payload, ws, location);
      break;
    }
    case "getSessionFromID": {
      getSessionFromID(payload, ws, location);
      break;
    }
    case "voteForSurvey": {
      voteForSurvey(payload, ws, location);
      break;
    }
    case "updateSession": {
      updateSession(payload, ws, location);
      break;
    }
    case "createSurvey": {
      createSurvey(payload, ws, location);
      break;
    }
    case "getSurveyFromID": {
      getSurveyFromID(payload, ws, location);
      break;
    }
    case "leaveSession":{
      leaveSession(payload, ws, location);
      break;
    }
    default:
      missingType(payload, ws, location);
      break;
  }
}

async function getAllSurveys(payload, ws, location) {
  console.log("Get all surveys");
  var answer;
  Session.find({
    participants: { $in: [payload.result.uid] },
  }).then((sessions) => {
  Surveys.find({
    surveySession: { $in: sessions.map((session) => session._id) },
  }).then((result) => {
    answer = {
      type: "Result",
      result: "Surveys",
      surveys: result,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  });
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  });
}

async function getAllSurveysFromSession(payload, ws, location) {
  console.log("Get all surveys from session");
  var answer;
  Surveys.find({
    surveySession: payload.result.sessionId,
  }).then((result) => {
    answer = {
      type: "Result",
      result: "Surveys",
      surveys: result,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  });
}

async function leaveSession(payload, ws, location){
  console.log("Leave session");
  var answer;
  Session.findById(payload.result.sessionId).then((session) => {
    session.participants.splice(session.participants.indexOf(payload.result.uid), 1);
    session.save();
    answer = {
      type: "Answer",
      result: "Leave successful",
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  });
}

async function getAllSessionsAndSurveys(payload, ws, location) {
  console.log("Get all sessions and surveys");
  var answer;
  Session.find({
    participants: { $in: [payload.result.uid] }
  }).populate({
    path: "surveys",
  }).populate({
    path: "participants",
    select: "name shownName",
  }).then((result) => {
      answer = {
        type: "Result",
        result: "Sessions",
        sessions: result,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  });
}

async function getAllSessions(payload, ws, location) {
  console.log("Get all sessions");
  var answer;
  Session.find({
    participants: { $in: [payload.result.uid] },
  }).then((result) => {
    answer = {
      type: "Result",
      result: "Sessions",
      sessions: result,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  });
}

async function getAllSessionsNames(payload, ws, location) {
  console.log("Get all sessions names");
  var answer;
  Session.find({
    participants: { $in: [payload.result.uid] },
  }).select("name").then((result) => {
    answer = {
      type: "Result",
      result: "Sessions",
      sessions: result,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  });
}

async function joinSession(payload, ws, location) {
  console.log("Join session");
  var answer;
  Session.findOneAndUpdate({
    _id: payload.result.sessionId,
  }, {
    $addToSet: { participants: payload.result.uid },
  }).then((result) => {
    answer = {
      type: "Result",
      result: "Session",
      session: result,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
    callRefresh();
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  });
}

async function loginUser(obj, ws, location) {
  console.log("Login User");
  var answer;
  try {
    await User.findOne({ username: obj.result.userName }).then
      ((user) => {
        if (bcrypt.compareSync(obj.result.password, user.password)) {
          answer = {
            type: "Result",
            result: "Success",
            uid: user._id,
          };
        } else {
          answer = {
            type: "Result",
            result: "Unsuccessful",
          };
        }
      })
  } catch (e) {
    console.error("Error login" + e);
    answer = {
      type: "Result",
      result: "Unsuccessful",
    };
  }
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
}

async function missingType(obj, ws, location) {
  console.log("Missing type");
  var answer = {
    type: "Result",
    result: "Error",
    error: obj,
  };
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
}

async function registerUser(obj, ws, location) {
  console.log("Registering user");
  var answer;
  try {
    if(obj.result.anonymous == true){
      obj.result.userName = Math.random().toString(36).substring(2, 15);
      obj.result.password = Math.random().toString(36).substring(2, 15);
      obj.result.email = Math.random().toString(36).substring(2, 15)+"@mail.de";
    }
    var user = await User.create({
      username: obj.result.userName,
      email: obj.result.email,
      password: bcrypt.hashSync(obj.result.password, 10),
      shownName: obj.result.shownName,
      anonymous: obj.result.anonymous,
    });
    answer = {
      type: "Result",
      result: "Success",
      uid: user._id
    };
  } catch (e) {
    console.log(e);
    answer = {
      type: "Result",
      result: "Error",
      error: e,
    };
  }
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
}

async function startSession(obj, ws, location) {
  console.log("Start session");
  var answer;
  Session.create({
    owner: obj.result.uid,
    participants: [obj.result.uid],
    surveys: [],
    name: obj.result.name,
    description: obj.result.description,
    isActive: true,
  }).then((session) => {
    answer = {
      type: "Answer",
      result: session._id,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
    callRefresh();
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Result",
      result: "Error",
      error: err,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  });
}

async function stopSession(obj, ws, location) {
  try {
    currentSession = await Session.findById(obj.sessionId);
    currentSession.isActive = false;
    await currentSession.save();
    var answer = {
      type: "Answer",
      result: "Session stopped Successful",
    };
  } catch (e) {
    console.log("Error in stop Session" + e);
    var answer = {
      type: "Result",
      result: "Error",
      error: e,
    };
  }
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
}

async function createSurvey(obj, ws, location) {
  console.log("Create survey");
  var answer;
  var surveyVals = {
    surveyName: obj.result.surveyName,
    creator: obj.result.creator,
    surveyDescription: obj.result.surveyDescription,
    surveyOpened: obj.result.surveyOpened,
    surveyName: obj.result.surveyName,
    surveyApprove: [],
    anonymous: obj.result.anonymous,
    allowEnthaltung: obj.result.allowEnthaltung,
    surveyDeny: [],
    surveyNotParicipate: [],
    participants: [],
    surveySession: obj.result.surveySession,
  };
  Surveys.create(surveyVals).then((survey) => {
    answer = {
      type: "Answer",
      result: survey._id,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
    Session.findById(obj.result.surveySession).then((session) => {
      session.surveys.push(survey._id);
      session.save();
    }
    ).catch((err) => {
      console.log(err);
    }
    );
    callRefresh();
  }
  ).catch((err) => {
    console.log(err);
    answer = {
      type: "Result",
      result: "Error",
      error: err,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  }
  );
}

async function updateSession(obj, ws, location) {
  console.log("Update session");
  var answer;
  try {
    var session = await Session.findById(obj.result.id);
    if (session) {
      session.name = obj.result.name;
      session.description = obj.result.description;
      await session.save();
      answer = {
        type: "Answer",
        result: "Session updated Successful",
      };
    } else {
      answer = {
        type: "Result",
        result: "Error",
        error: "Session not found",
      };
    }
  } catch (e) {
    console.log(e);
    answer = {
      type: "Result",
      result: "Error",
      error: e,
    };
  }
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
}

async function voteForSurvey(obj, ws, location) {
  console.log("Vote for survey");
  var answer;
  try {
    User.findById(obj.result.uid).then((user) => {
      Surveys.findById(obj.result.surveyID).then((survey) => {
        if(!survey.surveyOpened){
          answer = {
            type: "Result",
            result: "Error",
            error: "Survey not opened",
          };
        }else if (survey.participants.includes(obj.result.uid)) {
          answer = {
            type: "Result",
            result: "Already voted",
          };
        } else {
          if (survey.anonymous) {
              console.log("ID of Anonymous" + anonym);
              if (obj.result.sendID == 0) {
                survey.surveyApprove.push(anonym);
              } else if (obj.result.sendID == 1) {
                survey.surveyDeny.push(anonym);
              } else if (obj.result.sendID == 2) {
                survey.surveyNotParicipate.push(anonym);
              } else {
                answer = {
                  type: "Result",
                  result: "Error",
                  error: "Invalid sendID",
                };
              }
          } else {
            if (obj.result.sendID == 0) {
              survey.surveyApprove.push(user._id);
            } else if (obj.result.sendID == 1) {
              survey.surveyDeny.push(user._id);
            } else if (obj.result.sendID == 2) {
              survey.surveyNotParicipate.push(user._id);
            } else {
              answer = {
                type: "Result",
                result: "Error",
                error: "Invalid sendID",
              };
            }
          }
          if (answer == null) {
            survey.participants.push(user._id);
            survey.save();
            Session.findById(survey.surveySession).then((session) => {
              console.log("survey participants lenght " + survey.participants.length);
              console.log("session participants lenght " + session.participants.length);
            if(survey.participants.length == session.participants.lenght){
              console.log("Survey closed");
            }
            answer = {
              type: "Answer",
              result: "Voted Successful",
              event: survey,
            };
            sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
            callRefresh();
          });
          }
        }
      });
    });
  } catch (e) {
    console.log(e);
    answer = {
      type: "Result",
      result: "Error",
      error: e,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
  }
}

async function getSessionFromID(obj, ws, location) {
  console.log("Get session from ID");
  var answer;
  try {
    var session = await Session.findById(obj.result.sessionID).populate({
      path: "participants",
      select: "username shownName",
    });
    answer = {
      type: "Answer",
      result: "Session",
      session: session,
    };
  } catch (e) {
    console.log(e);
    answer = {
      type: "Result",
      result: "Error",
      error: e,
    };
  }
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
}

async function getSurveyFromID(obj, ws, location) {
  console.log("Get survey from ID " + obj.result.surveyId);
  var answer;
  try {
    await Surveys.findById(obj.result.surveyId).populate({
      path: "participants",
      select: "username shownName",
    }).populate({
      path: "surveyApprove",
      select: "username shownName",
    }).populate({
      path: "surveyDeny",
      select: "username shownName",
    }).populate({
      path: "surveyNotParicipate",
      select: "username shownName",
    }).then((survey) => {
      if (survey) {
        answer = {
          type: "Answer",
          result: "Survey",
          survey: survey,
        };
      } else {
        answer = {
          type: "Result",
          result: "Error",
          error: "Survey not found",
        };
      }
    })
  } catch (e) {
    console.log(e);
    answer = {
      type: "Result",
      result: "Error",
      error: e,
    };
  }
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, location));
}

async function callRefresh() {
  console.log("Call refresh");
  var answer = {
    type: "Refresh",
  }
  for (var i = 0; i < CLIENTS.length; i++) {
    var ws = CLIENTS[i];
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer, null));
  }
}

async function getAnonymousID() {
  await User.findOne({
    username: "Anonymous"
  }).then((user) => {
    if (user) {
      anonym = user._id;
    }
    else {
      return createAnonymousUser();
    }
  });
}

async function createAnonymousUser() {
  console.log("Create anonymous user");
  await User.create({
    username: "Anonymous",
    password: "Anonymous",
    email: "anonymous@email.de",
    shownName: "Anonymous",
    anonymous: true,
  }).then((user) => {
    anonym = user._id;
  }).catch((err) => {
    console.log(err);
  });
}