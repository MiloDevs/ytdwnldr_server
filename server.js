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

app.post("/", async (req, res) => {
  const clientId = req.body.clientId; // Assuming client sends its unique ID with the request
  const url = req.body.url;

  console.log("Getting audio for url:", url);

  try {
    const videoInfo = await ytdl.getInfo(url);
    const audioFormat = ytdl.chooseFormat(videoInfo.formats, {
      quality: "highestaudio",
    });

    // Set response headers for file download
    res.setHeader("Content-Disposition", 'attachment; filename="audio.mp3"');
    res.setHeader("Content-Type", "audio/mpeg");

    const stream = ytdl.downloadFromInfo(videoInfo, { format: audioFormat });

    stream.on("info", (info) => {
      if (clientId && clients.has(clientId)) {
        sendAudioDetails(clients.get(clientId), info);
      }
    });

    stream.on("progress", (chunkLength, downloaded, total) => {
      const progress = (downloaded / total) * 100;
      if (clientId && clients.has(clientId)) {
        sendProgress(clients.get(clientId), progress);
        if (downloaded === total) {
          sendDownloadCompleted(clients.get(clientId), downloaded);
        }
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("An error occurred while processing the request.");
  }
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
