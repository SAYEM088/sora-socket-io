// this is sora a video calling functionality server, developed by sayem :: No Middle Man (P2P connection)

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
  pingTimeout: 20000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB
});

const emailToSocketIdMap = new Map();
const socketIdToEmailMap = new Map();

app.use((err, req, res, next) => {
  console.error(`Server error: ${err.message}`);
  res.status(500).json({ error: "Internal server error" });
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("room:join", (data) => {
    try {
      const { email, room } = data;
      if (!email || !room) {
        socket.emit("error", { message: "Invalid room join data" });
        return;
      }
      const existingSocketId = emailToSocketIdMap.get(email);
      if (existingSocketId && existingSocketId !== socket.id) {
        socketIdToEmailMap.delete(existingSocketId);
        io.sockets.sockets.get(existingSocketId)?.disconnect(true);
        console.log(`Disconnected previous socket for ${email}`);
      }

      emailToSocketIdMap.set(email, socket.id);
      socketIdToEmailMap.set(socket.id, email);

      const roomInfo = io.sockets.adapter.rooms.get(room);
      const existingSocketIds = roomInfo ? Array.from(roomInfo) : [];

      socket.join(room);
      io.to(room).emit("user:joined", { email, id: socket.id });

      for (const existingId of existingSocketIds) {
        if (existingId !== socket.id) {
          const existingEmail = socketIdToEmailMap.get(existingId);
          socket.emit("user:joined", { email: existingEmail, id: existingId });
        }
      }

      socket.emit("room:join", data);
    } catch (err) {
      console.error(`Room join error: ${err.message}`);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  socket.on("user:call", ({ to, offer }) => {
    try {
      if (!to || !offer) throw new Error("Invalid call data");
      io.to(to).emit("incoming:call", { from: socket.id, offer });
    } catch (err) {
      console.error(`Call error: ${err.message}`);
      socket.emit("error", { message: "Invalid call attempt" });
    }
  });

  socket.on("call:accepted", ({ to, ans }) => {
    try {
      if (!to || !ans) throw new Error("Invalid call acceptance data");
      io.to(to).emit("call:accepted", { from: socket.id, ans });
    } catch (err) {
      console.error(`Call acceptance error: ${err.message}`);
      socket.emit("error", { message: "Invalid call acceptance" });
    }
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    try {
      if (!to || !offer) throw new Error("Invalid negotiation data");
      console.log(`Negotiation needed for ${socket.id} to ${to}`);
      io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
    } catch (err) {
      console.error(`Negotiation error: ${err.message}`);
      socket.emit("error", { message: "Invalid negotiation attempt" });
    }
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    try {
      if (!to || !ans) throw new Error("Invalid negotiation completion data");
      console.log(`Negotiation completed for ${socket.id} to ${to}`);
      io.to(to).emit("peer:nego:final", { from: socket.id, ans });
    } catch (err) {
      console.error(`Negotiation completion error: ${err.message}`);
      socket.emit("error", { message: "Invalid negotiation completion" });
    }
  });

  socket.on("disconnect", () => {
    try {
      const email = socketIdToEmailMap.get(socket.id);
      if (email) {
        emailToSocketIdMap.delete(email);
        socketIdToEmailMap.delete(socket.id);
        console.log(`Socket disconnected: ${socket.id} (${email})`);
      }
    } catch (err) {
      console.error(`Disconnect error: ${err.message}`);
    }
  });

  socket.on("error", (err) => {
    console.error(`Socket error: ${err.message}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server running on http://localhost:${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("Shutting down server...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});