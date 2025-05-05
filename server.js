const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Map to store active sessions
const activeSessions = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Create a new session
  socket.on('create-session', (sessionId) => {
    console.log('Session created:', sessionId);
    activeSessions.set(sessionId, { host: socket.id, participants: new Set([socket.id]) });
    socket.join(sessionId);
  });
  
  // Join an existing session
  socket.on('join-session', (sessionId) => {
    console.log('User joined session:', socket.id, sessionId);
    
    if (activeSessions.has(sessionId)) {
      socket.join(sessionId);
      
      const session = activeSessions.get(sessionId);
      session.participants.add(socket.id);
      
      // Notify others that a new participant joined
      socket.to(sessionId).emit('participant-joined', socket.id);
      
      // Send the new participant the list of existing participants
      socket.emit('participants-list', Array.from(session.participants).filter(id => id !== socket.id));
    } else {
      // Session doesn't exist, create one
      activeSessions.set(sessionId, { host: socket.id, participants: new Set([socket.id]) });
      socket.join(sessionId);
    }
  });
  
  // Handle audio chunks sent by clients
  socket.on('audio-chunk', (audioChunk, sessionId) => {
    if (sessionId && activeSessions.has(sessionId)) {
      // Broadcast audio chunk to all other participants in the session
      socket.to(sessionId).emit('audio-chunk', audioChunk);
    }
  });
  
  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove user from all sessions they were part of
    activeSessions.forEach((session, sessionId) => {
      if (session.participants.has(socket.id)) {
        session.participants.delete(socket.id);
        
        // Notify others in the session that this user left
        io.to(sessionId).emit('participant-left', socket.id);
        
        // If session is empty, clean it up
        if (session.participants.size === 0) {
          activeSessions.delete(sessionId);
          console.log('Session removed:', sessionId);
        }
        // If the host left, assign a new host if there are other participants
        else if (session.host === socket.id && session.participants.size > 0) {
          const newHost = Array.from(session.participants)[0];
          session.host = newHost;
          console.log('New host assigned for session:', sessionId, newHost);
        }
      }
    });
  });
});

// Simple API endpoint to check server status
app.get('/', (req, res) => {
  res.send('Audio Live Server is running');
});

// Get a list of active sessions
app.get('/sessions', (req, res) => {
  const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
    id,
    participants: session.participants.size
  }));
  
  res.json(sessions);
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});