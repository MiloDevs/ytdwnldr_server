const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const ytdl = require("ytdl-core");
const app = express();

const corsOptions = {
  origin: "*", // Allow requests from http://localhost:3000
  methods: "GET,POST", // Allow GET and POST methods
  allowedHeaders: [
    "Access-Control-Allow-Origin",
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Methods",
    "Content-Type",
    "Authorization",
    "X-Requested-With",
  ], // Define allowed headers
};

app.use(cors(corsOptions)); // Use the defined cors options
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
  },
});
const port = process.env.PORT || 3001;

const clients = new Map(); // Use a Map instead of a Set to associate client IDs with socket instances

function getAudio(url, res, clientId) {
  console.log("Getting audio for url:", url);

  res.setHeader("Content-Disposition", 'attachment; filename="audio.mp3"');
  res.setHeader("Content-Type", "audio/mpeg");

  const stream = ytdl(url, {
    quality: "highestaudio",
    filter: "audioonly",
  })
    .on("info", (info) => {
      console.log(info.videoDetails);
      if (clientId && clients.has(clientId)) {
        const clientSocket = clients.get(clientId);
        clientSocket.emit("audioDetails", {
          title: info.videoDetails.title,
          author: info.videoDetails.author.name,
        });
      }
    })
    .on("progress", (chunkLength, downloaded, total) => {
      const progress = (downloaded / total) * 100;
      if (clientId && clients.has(clientId)) {
        const clientSocket = clients.get(clientId);
        clientSocket.emit("progress", progress);

        if (downloaded === total) {
          console.log("Download completed...");
          clientSocket.emit("downloadCompletedClient", downloaded); // Emit completion only to the specific client
        }
      }
    })
    .pipe(res);
}

io.on("connection", (client) => {
  console.log("Client connected...");
    
    // Generate a unique ID for the client
    const clientId = Math.random().toString(36).substring(7);
    
    clients.set(clientId, client); // Associate client ID with socket instance
    
    // Send the client ID back to the client
    client.emit("clientId", clientId);

  client.on("disconnect", () => {
    console.log("Client disconnected...");
    clients.delete(clientId); // Remove client from the Map upon disconnection
  });
});

app.post("/", (req, res) => {
  const clientId = req.body.clientId; // Assuming client sends its unique ID with the request
  getAudio(req.body.url, res, clientId);
});

http.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
