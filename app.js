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
          socket.ping(function noop() {});
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
  console.log(eventModel);
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
  console.log("Send Event:" + eventModel.payload);
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
    {type: mongoose.Schema.Types.ObjectId, ref: "Survey",},
  ],
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
  surveyApprove: Number,
  surveyDeny: Number,
  surveyNotParicipate: Number,
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
  console.log(payload.type);
  switch (payload.type) {
    case "loginUser": {
      loginUser(payload, ws);
      break;
    }
    case "registerUser": {
      registerUser(payload, ws);
      break;
    }
    default:
      missingType(payload, ws);
      break;
  }
}

async function loginUser(obj, ws) {
  try {
    const user = await User.findOne({ userName: obj.result.userName });
    if (user.password === obj.result.Password) {
      var answer = {
        type: "Result",
        result: "Success",
      };
    } else {
      var answer = {
        type: "Result",
        result: "Unsuccessful",
      };
    }
  } catch (e) {
    console.error("Error login" + e);
    var answer = {
      type: "Result",
      result: "Unsuccessful",
    };
  }
  sendEvent(
    ws,
    new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer)
  );
}

async function missingType(obj, ws) {
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
  sendEvent(
    ws,
    new EventModel().createFromEvent(EventType.OUT_EVENT_MESSAGE, answer)
  );
}

async function startSession(obj, ws) {
  try {
    var usertmp = await User.findById(obj.uid);
    var sessionTemp = await Session.create({
      owner: usertmp,
      participants: [usertmp],
      isActive: true,
    });
    var answer = {
      type: "Answer",
      result: sessionTemp._id,
    };
  } catch (e) {
    var answer = {
      type: "Error",
      result: e,
    };
    console.log("Error in startSession" + e);
  }
  console.log(answer);
  sendEvent(
    ws,
    new EventModel(EventType.OUT_EVENT_MESSAGE, JSON.stringify(answer))
  );
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
  sendEvent(
    ws,
    new EventModel(EventType.OUT_EVENT_MESSAGE, JSON.stringify(answer))
  );
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
      participants: [user],
    });
    var answer = {
      type: "Answer",
      surveyID: surveyTemp._id,
    };
  } catch (e) {
    console.log(e);
    var answer = {
      type: "Result",
      result: "Error",
      error: e,
    };
  }
  sendEvent(
    ws,
    new EventModel(EventType.OUT_EVENT_MESSAGE, JSON.stringify(answer))
  );
}

async function stopSurvey(obj) {}

async function registerClient(ws) {
  try {
    var user = await User.create({});
    var answer = {
      type: "Answer",
      result: "Client registered Successful",
      uid: user._id,
    };
  } catch (e) {
    console.log(e);
    var answer = {
      type: "Result",
      result: "Error",
      error: e,
    };
  }
  console.log(answer);
  sendEvent(
    ws,
    new EventModel(EventType.OUT_EVENT_MESSAGE, JSON.stringify(answer))
  );
}

async function sendMessageToAll(obj) {
  for (i = 0; i < CLIENTS.length; i++) {
    sendEvent(
      CLIENTS[i],
      new EventModel().createFromEvent(
        EventType.OUT_EVENT_MESSAGE,
        JSON.stringify(obj)
      )
    );
  }
}

async function callRefresh() {
  try {
    var answer = {
      type: "Answer",
      result: "callRefresh",
    };
    sendEvent(
      ws,
      new EventModel(EventType.OUT_EVENT_MESSAGE, JSON.stringify(answer))
    );
  } catch (e) {
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
      type: "Answer",
      refresh: "SurveyByUID",
      tesult: surveys,
    };
  } catch (e) {
    console.log(e);
    var answer = {
      type: "Result",
      result: "Error",
      error: e,
    };
  }
  sendEvent(
    ws,
    new EventModel(EventType.OUT_EVENT_MESSAGE, JSON.stringify(answer))
  );
}

async function refreshSurveyByID(obj, ws) {
  try {
    var survey = await Surveys.findById(obj.surveyID);
    var answer = {
      type: "Answer",
      refresh: "SurveyByID",
      result: survey,
    };
  } catch (e) {
    console.log(e);
    var answer = {
      type: "Result",
      result: "Error",
      error: e,
    };
  }
  sendEvent(
    ws,
    new EventModel(EventType.OUT_EVENT_MESSAGE, JSON.stringify(answer))
  );
}

async function refreshSession(obj, ws) {
  try {
    var sessionm = Session.find({ _id: obj.sessionID });
    var answer = {
      type: "Refresh",
      refresh: "Session",
      result: sessionm,
    };
  } catch (e) {
    console.log(e);
    var answer = {
      type: "Result",
      result: "Error",
      error: e,
    };
  }
  sendEvent(
    ws,
    new EventModel(EventType.OUT_EVENT_MESSAGE, JSON.stringify(answer))
  );
}

async function refreshAllSessions(ws) {
  try {
    var sessions = await Session.find({});
    var answer = {
      Type: "Refresh",
      Refresh: "AllSessions",
      Result: sessions,
    };
  } catch (e) {
    console.log(e);
    var answer = {
      Type: "Result",
      Result: "Error",
      Error: e,
    };
  }
  sendEvent(
    ws,
    new EventModel().createFromEvent(
      EventType.OUT_EVENT_MESSAGE,
      JSON.stringify(answer)
    )
  );
}

async function refreshAllSurvey(ws) {
  try {
    var surveys = await Surveys.find({});
    var answer = {
      Type: "Refresh",
      Refresh: "AllSurvey",
      Result: surveys,
    };
  } catch (e) {
    console.log(e);
    var answer = {
      Type: "Result",
      Result: "Error",
      Error: e,
    };
  }
  sendEvent(
    ws,
    new EventModel(EventType.OUT_EVENT_MESSAGE, JSON.stringify(answer))
  );
}
