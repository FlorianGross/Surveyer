const express = require("express");
const app = express();
const WebSocket = require("ws");
const cors = require("cors");
const dotenv = require("dotenv");
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
      useJSON(eventModel.payload, socket);
      break;
  }
};

createWelcomeEventModel = () => {
  return new EventModel().createFromEvent(
    EventType.OUT_EVENT_ONLINE,
    `Welcome`
  );
};

sendEvent = (socket, eventModel) => {
  console.log("Send Event:" + JSON.stringify({ event: eventModel.eventType, payload: eventModel.payload }));
  socket.send(
    JSON.stringify({ event: eventModel.eventType, payload: eventModel.payload })
  );
};

closeConnection = async (message) => {
  console.log("Closing connection");
};

class EventModel {
  constructor() {
    this.createFromEvent = (eventType, payload) => {
      this.eventType = eventType;
      this.payload = payload;
      return this;
    };
    this.createFromAny = (data) => {
      try {
        const object = JSON.parse(data);
        if (!object.hasOwnProperty("event")) return;
        this.eventType = object.event;
        this.payload = object.payload;
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
    unique: true,
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

async function useJSON(payload, ws) {
  console.log("Use JSON:" + JSON.stringify(payload));
  switch (payload.type) {
    case "loginUser": {
      loginUser(payload, ws);
      break;
    }
    case "registerUser": {
      registerUser(payload, ws);
      break;
    }
    case "createSession": {
      startSession(payload, ws);
      break;
    }
    case "getAllSurveysFromSession": {
      getAllSurveysFromSession(payload, ws);
      break;
    }
    case "getAllSessionsNames":{
      getAllSessionsNames(payload, ws);
      break;
    }
    case "getAllSurveys": {
      getAllSurveys(payload, ws);
      break;
    }
    case "getAllSessions": {
      getAllSessions(payload, ws);
      break;
    }
    case "getAllSessionsAndSurveys": {
      getAllSessionsAndSurveys(payload, ws);
      break;
    }
    case "joinSession": {
      joinSession(payload, ws);
      break;
    }
    case "getSessionFromID": {
      getSessionFromID(payload, ws);
      break;
    }
    case "voteForSurvey": {
      voteForSurvey(payload, ws);
      break;
    }
    case "updateSession": {
      updateSession(payload, ws);
      break;
    }
    case "createSurvey": {
      createSurvey(payload, ws);
      break;
    }
    case "getSurveyFromID": {
      getSurveyFromID(payload, ws);
      break;
    }
    default:
      missingType(payload, ws);
      break;
  }
}

async function getAllSurveys(payload, ws) {
  console.log("Get all surveys");
  var answer;
  Session.find({
    participants: { $in: [payload.result.uid] },
  }).then((sessions) => {
  Surveys.find({
    surveySession: { $in: sessions.map((session) => session._id) },
  }).select(
    "surveySession surveyDescription surveyOpened surveyName participants"
  ).then((result) => {
    answer = {
      type: "Result",
      result: "Surveys",
      surveys: result,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  });
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  });
}

async function getAllSurveysFromSession(payload, ws) {
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
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  });
}

async function getAllSessionsAndSurveys(payload, ws) {
  console.log("Get all sessions and surveys");
  var answer;
  Session.find({
    participants: { $in: [payload.result.uid] }
  }).populate({
    path: "surveys",
  }).then((result) => {
      answer = {
        type: "Result",
        result: "Sessions",
        sessions: result,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  });
}

async function getAllSessions(payload, ws) {
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
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  });
}

async function getAllSessionsNames(payload, ws) {
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
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  });
}

async function joinSession(payload, ws) {
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
      events: result,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
    callRefresh();
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Error",
      result: "Error",
      error: err,
    }
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  });
}

async function loginUser(obj, ws) {
  console.log("Login User");
  var answer;
  try {
    await User.findOne({ username: obj.result.userName }).then
      ((user) => {
        if (user.password === obj.result.password) {
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
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
}

async function missingType(obj, ws) {
  console.log("Missing type");
  var answer = {
    type: "Result",
    result: "Error",
    error: obj,
  };
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
}

async function registerUser(obj, ws) {
  console.log("Registering user");
  var answer;
  try {
    var user = await User.create({
      username: obj.result.userName,
      email: obj.result.email,
      password: obj.result.password,
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
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
}

async function startSession(obj, ws) {
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
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
    callRefresh();
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Result",
      result: "Error",
      error: err,
    };
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  });
}

async function stopSession(obj, ws) {
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
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
}

async function createSurvey(obj, ws) {
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
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
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
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  }
  );
}

async function updateSession(obj, ws) {
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
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
}

async function voteForSurvey(obj, ws) {
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
            sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
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
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
  }
}

async function getSessionFromID(obj, ws) {
  console.log("Get session from ID");
  var answer;
  try {
    var session = await Session.findById(obj.result.sessionID).populate({
      path: "participants",
      select: "username",
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
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
}

async function getSurveyFromID(obj, ws) {
  console.log("Get survey from ID " + obj.result.surveyId);
  var answer;
  try {
    await Surveys.findById(obj.result.surveyId).populate({
      path: "participants",
      select: "username",
    }).populate({
      path: "surveyApprove",
      select: "username",
    }).populate({
      path: "surveyDeny",
      select: "username",
    }).populate({
      path: "surveyNotParicipate",
      select: "username",
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
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
}

async function callRefresh() {
  console.log("Call refresh");
  var answer = {
    type: "Refresh",
  }
  for (var i = 0; i < CLIENTS.length; i++) {
    var ws = CLIENTS[i];
    sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
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
    email: "anonymous@email",
  }).then((user) => {
    anonym = user._id;
  }).catch((err) => {
    console.log(err);
  });
}