const express = require("express");
const app = express();
const WebSocket = require("ws");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
app.use(cors);

const mongoose = require("mongoose");
const { Schema } = mongoose;

class SocketServer {
  constructor(server) {
    var CLIENTS = [];
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
    { type: mongoose.Schema.Types.ObjectId, ref: "Survey", },
  ],
  name: String,
  description: String,
  isActive: Boolean,
});

const userSchema = new Schema({
  username: String,
  email: String,
  password: String,
});

const surveySchema = new Schema({
  surveySession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sessions",
  },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  surveyDescription: String,
  surveyOpened: Boolean,
  surveyName: String,
  surveyApprove: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  surveyDeny: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  surveyNotParicipate: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  anonymous: Boolean,
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
    case "getAllSurveys": {
      getAllSurveys(payload, ws);
      break;
    }
    case "getAllSessions": {
      getAllSessions(payload, ws);
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
  Surveys.find({
  }).then((result) => {
    answer = {
      type: "Result",
      result: "Surveys",
      events: result,
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

async function getAllSurveysFromSession(payload, ws) {
  console.log("Get all surveys from session");
  var answer;
  Surveys.find({
    surveySession: payload.result.sessionId,
  }).then((result) => {
    answer = {
      type: "Result",
      result: "Surveys",
      events: result,
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

async function getAllSessions(payload, ws) {
  console.log("Get all sessions");
  var answer;
  Session.find({
    participants: { $in: [payload.result.uid] },
  }).then((result) => {
    answer = {
      type: "Result",
      result: "Sessions",
      events: result,
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
  sendEvent(
    ws,
    new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer)
  );
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
    isActive: true,
  }).then((session) => {
    answer = {
      type: "Answer",
      result: session._id,
    };
  }).catch((err) => {
    console.log(err);
    answer = {
      type: "Result",
      result: "Error",
      error: err,
    };
  });
  console.log(answer);
  sendEvent(ws, new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer));
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
  try {
    User.findById(obj.result.creator).then((user) => {
      if (user) {
        var surveyVals = {
          surveyName: obj.result.surveyName,
          creator: user._id,
          surveyDescription: obj.result.surveyDescription,
          surveyOpened: obj.result.surveyOpened,
          surveyName: obj.result.surveyName,
          surveyApprove: [],
          anonymous: obj.result.anonymous,
          surveyDeny: [],
          surveyNotParicipate: [],
          anonymous: obj.result.anonymous,
          participants: [],
          surveySession: obj.result.surveySession,
        };
        Surveys.create(surveyVals).then((survey) => {
          answer = {
            type: "Answer",
            result: survey._id,
          };
        });
      } else {
        answer = {
          type: "Result",
          result: "Error",
          error: "User not found",
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

async function voteForSurvey(obj, ws) {
  console.log("Vote for survey");
  var answer;
  try {
    User.findById(obj.result.uid).then((user) => {
      if (user) {
        Surveys.findById(obj.result.surveyID).then((survey) => {
          if (survey) {
            if (survey.participants.includes(obj.result.uid)) {
              answer = {
                type: "Result",
                result: "Already voted",
              };
            } else {
              if (survey.anonymous) {
                if (obj.result.sendID == 0) {
                  survey.surveyApprove.push(-1);
                } else if (obj.result.sendID == 1) {
                  survey.surveyDeny.push(-1);
                } else if (obj.result.sendID == 2) {
                  survey.surveyNotParicipate.push(-1);
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
                answer = {
                  type: "Answer",
                  result: "Voted Successful",
                  event: survey,
                };
              }
            }
          }
        });
      }
    });
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
    await Surveys.findById(obj.result.surveyId).then((survey) => {
      if (survey) {
        answer = {
          type: "Answer",
          result: "Survey",
          event: survey,
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

