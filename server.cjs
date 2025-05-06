// server.js - CJS version for Node.js
// This file uses CommonJS modules syntax

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
  },
  maxHttpBufferSize: 10e6, // Increase buffer size to 10MB for audio chunks
});

// Map to store active sessions
const activeSessions = new Map();

// Debug middleware to log all events
io.use((socket, next) => {
  const originalEmit = socket.emit;
  socket.emit = function(...args) {
    console.log(`[${socket.id}] EMIT: ${args[0]}`, args.length > 1 ? args.slice(1) : '');
    return originalEmit.apply(this, args);
  };
  next();
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Log all incoming events
  socket.onAny((event, ...args) => {
    console.log(`[${socket.id}] EVENT: ${event}`, args);
  });
  
  // Create a new session
  socket.on('create-session', (sessionId) => {
    console.log('Session created:', sessionId, 'by host', socket.id);
    
    // Store session data
    activeSessions.set(sessionId, { 
      host: socket.id, 
      participants: new Set([socket.id]),
      active: true,
      createdAt: new Date()
    });
    
    // Join the room for this session
    socket.join(sessionId);
    
    // Acknowledge creation
    socket.emit('connection-successful', { 
      sessionId, 
      role: 'host',
      status: 'created'
    });
    
    console.log(`Session ${sessionId} created successfully by ${socket.id}`);
  });
  
  // Check if a session exists
  socket.on('check-session', (sessionId, callback) => {
    console.log(`Checking if session ${sessionId} exists`);
    
    if (activeSessions.has(sessionId) && activeSessions.get(sessionId).active) {
      callback({ exists: true });
    } else {
      callback({ exists: false });
    }
  });
  
  // Join an existing session
  socket.on('join-session', (sessionId) => {
    console.log('User attempting to join session:', socket.id, sessionId);
    
    if (activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      
      // Check if session is active
      if (!session.active) {
        socket.emit('session-error', { 
          code: 'SESSION_CLOSED',
          message: 'This session has been closed by the host.'
        });
        return;
      }
      
      // Join the session
      socket.join(sessionId);
      session.participants.add(socket.id);
      
      // Let the user know they are connected
      socket.emit('connection-successful', { 
        sessionId, 
        role: 'participant',
        hostId: session.host
      });
      
      // Notify others that a new participant joined
      socket.to(sessionId).emit('participant-joined', socket.id);
      
      // Send the new participant the list of existing participants
      socket.emit('participants-list', Array.from(session.participants).filter(id => id !== socket.id));
      
      console.log(`User ${socket.id} successfully joined session ${sessionId}`);
    } else {
      // If we're coming from the recording page with a sessionId, we might need to create it
      console.log(`Session ${sessionId} does not exist. Creating it for ${socket.id}`);
      
      // Create the session
      activeSessions.set(sessionId, { 
        host: socket.id, 
        participants: new Set([socket.id]),
        active: true,
        createdAt: new Date()
      });
      
      // Join the room
      socket.join(sessionId);
      
      // Let the user know the session was created and they're the host
      socket.emit('connection-successful', { 
        sessionId, 
        role: 'host',
        status: 'created-on-join'
      });
      
      console.log(`Session ${sessionId} created on join by ${socket.id}`);
    }
  });
  
  // Leave a session
  socket.on('leave-session', (sessionId) => {
    if (sessionId && activeSessions.has(sessionId)) {
      handleParticipantLeaving(socket.id, sessionId);
    }
  });
  
  // Close a session completely (host only)
  socket.on('close-session', (sessionId) => {
    if (sessionId && activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      
      if (session.host === socket.id) {
        console.log(`Host ${socket.id} is closing session ${sessionId}`);
        
        // Mark session as inactive
        session.active = false;
        
        // Notify all participants that the session is closed
        io.to(sessionId).emit('session-closed', sessionId);
        
        // After a short delay, clean up the session
        setTimeout(() => {
          if (activeSessions.has(sessionId)) {
            activeSessions.delete(sessionId);
            console.log(`Session ${sessionId} removed after being closed by host`);
          }
        }, 5000);
      } else {
        console.log(`Non-host ${socket.id} attempted to close session ${sessionId}`);
        
        socket.emit('session-error', {
          code: 'NOT_SESSION_HOST',
          message: 'Only the session host can close a session.'
        });
      }
    }
  });
  
  // Handle audio chunks sent by clients
  socket.on('audio-chunk', (audioChunk, sessionId) => {
    if (!sessionId || !activeSessions.has(sessionId) || !activeSessions.get(sessionId).active) {
      return;
    }
    
    try {
      // Don't log the full audio chunk as it's too large
      console.log(`User ${socket.id} sent audio chunk of size ${audioChunk.length || 'unknown'} for session ${sessionId}`);
      
      // Broadcast audio chunk to all other participants in the session
      socket.to(sessionId).emit('audio-chunk', audioChunk);
    } catch (error) {
      console.error('Error broadcasting audio chunk:', error);
    }
  });
  
  // Handle recording started
  socket.on('recording-started', (sessionId) => {
    if (sessionId && activeSessions.has(sessionId)) {
      console.log(`User ${socket.id} started recording in session ${sessionId}`);
      socket.to(sessionId).emit('participant-recording', socket.id);
    }
  });
  
  // Handle stop recording signal - broadcast to all in the session
  socket.on('stop-recording', (sessionId) => {
    if (sessionId && activeSessions.has(sessionId)) {
      console.log(`User ${socket.id} stopped recording in session ${sessionId}`);
      
      // Broadcast to all users in the session
      io.to(sessionId).emit('stop-recording');
    }
  });
  
  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find all sessions this user was part of
    activeSessions.forEach((session, sessionId) => {
      if (session.participants.has(socket.id)) {
        handleParticipantLeaving(socket.id, sessionId);
      }
    });
  });
  
  // Helper function to handle a participant leaving
  function handleParticipantLeaving(socketId, sessionId) {
    if (!activeSessions.has(sessionId)) return;
    
    const session = activeSessions.get(sessionId);
    session.participants.delete(socketId);
    
    console.log(`User ${socketId} left session ${sessionId}`);
    
    // Notify others in the session that this user left
    io.to(sessionId).emit('participant-left', socketId);
    
    // If session is empty, clean it up
    if (session.participants.size === 0) {
      activeSessions.delete(sessionId);
      console.log('Session removed (empty):', sessionId);
    }
    // If the host left, assign a new host if there are other participants
    else if (session.host === socketId && session.participants.size > 0) {
      const newHost = Array.from(session.participants)[0];
      session.host = newHost;
      io.to(sessionId).emit('new-host', newHost);
      console.log('New host assigned for session:', sessionId, newHost);
    }
  }
});

// Simple API endpoint to check server status
app.get('/', (req, res) => {
  res.send('Audio Live Server is running');
});

// Get a list of active sessions
app.get('/sessions', (req, res) => {
  const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
    id,
    participants: session.participants.size,
    host: session.host,
    active: session.active,
    createdAt: session.createdAt
  }));
  
  res.json(sessions);
});

// Check if a specific session exists
app.get('/sessions/:id', (req, res) => {
  const sessionId = req.params.id;
  
  if (activeSessions.has(sessionId) && activeSessions.get(sessionId).active) {
    res.json({
      exists: true,
      session: {
        id: sessionId,
        participants: activeSessions.get(sessionId).participants.size,
        active: true
      }
    });
  } else {
    res.json({
      exists: false
    });
  }
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Web client should connect to: http://localhost:${PORT}`);
});