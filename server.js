const express = require("express");
const cors = require("cors");
const ytdl = require("ytdl-core");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const port = process.env.PORT || 3001;

const corsOptions = {
  origin: "*", // Allow requests from any origin
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

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
  },
});

const clients = new Map(); // Use a Map instead of a Set to associate client IDs with socket instances

function sendAudioDetails(clientSocket, info) {
  clientSocket.emit("audioDetails", {
    title: info.videoDetails.title,
    author: info.videoDetails.author.name,
  });
}

function sendProgress(clientSocket, progress) {
  clientSocket.emit("progress", progress);
}

function sendLoaded(clientSocket, loaded) {
  console.log("Loaded:", loaded);
  clientSocket.emit("loaded", loaded);
}

function sendDownloadCompleted(clientSocket, downloaded) {
  console.log("Download completed...");
  clientSocket.emit("downloadCompletedClient", downloaded);
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

async function getAudio(url, res, clientId){
  try {
    const videoInfo = await ytdl.getInfo(url);
    sendAudioDetails(clients.get(clientId), videoInfo);
    var stream = ytdl(url, {
      filter: "audioonly",
      quality: "highestaudio",
    })
      .on("progress", (chunkLength, downloaded, total) => {
        const progress = (downloaded / total) * 100;
        const loaded = downloaded;
        const clientSocket = clients.get(clientId);
        if (clientSocket) {
          sendProgress(clientSocket, progress);
          sendLoaded(clientSocket, loaded);
          if(progress === 100){
            sendDownloadCompleted(clientSocket, downloaded);
          }
        }
      })
      .pipe(res);

    res.setHeader("Content-Disposition", `attachment; filename="${videoInfo.videoDetails.title}.mp3"`);
    res.setHeader("Content-Type", "audio/mpeg");
   
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("An error occurred while processing the request.");
  }
}

app.post("/", async (req, res) => {
  const clientId = req.body.clientId; // Assuming client sends its unique ID with the request
  const url = req.body.url;

  console.log("Getting audio for url:", url);

  getAudio(url, res, clientId);
  
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
