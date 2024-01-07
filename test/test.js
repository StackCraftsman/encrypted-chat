const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();
const { createServer } = require('http');

async function connectToDatabase() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MongoDB connection string is not defined in the environment variables.');
    }

    await mongoose.connect(process.env.MONGO_URI, { });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
}


async function main() {
  await connectToDatabase();

  const Message = mongoose.model('Message', {
    content: String,
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  });

  const app = express();
  app.set('view engine', 'ejs');
  const server = createServer(app);
  const io = new Server(server);

  app.get('/', (req, res) => {
    res.render('index');
  });

  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join a group room based on the user or group ID
    socket.on('join group', (groupId, userId) => {
      socket.join(groupId);
      console.log(`User ${userId} joined group ${groupId}`);
    });

    // Listen for incoming chat messages
    socket.on('chat message', async (msg, callback) => {
      try {
        const groupId = socket.rooms.values().next().value; // Get the first room (group) the user joined
        const userId = socket.data?.userId; // Use a proper user ID
    
        // Check if callback is a function before calling it
        if (typeof callback === 'function') {
          const result = await Message.create({ content: msg, group: groupId, sender: userId });
          io.to(groupId).emit('chat message', msg, result._id, userId);
          callback();
        } else {
          console.error('Callback is not a function');
        }
      } catch (error) {
        // Handle other errors
        console.error('Error creating message:', error.message);
    
        // Check if callback is a function before calling it
        if (typeof callback === 'function') {
          callback(error.message);
        } else {
          console.error('Callback is not a function');
        }
      }
    });

    // Retrieve chat messages for the user's group
    socket.on('get messages', async (callback) => {
      try {
        const groupId = socket.rooms.values().next().value; // Get the first room (group) the user joined
        const messages = await Message.find({ group: groupId });
        callback(messages);
      } catch (error) {
        console.error('Error fetching messages:', error.message);
        callback(error.message);
      }
    });
  });

  // API Endpoints
  app.post('/api/groups/messages/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { msg } = req.body;

      const userId = 'example_user_id'; // Replace with the actual user ID
      const result = await Message.create({ content: msg, group: groupId, sender: userId });
      io.to(groupId).emit('chat message', msg, result._id, userId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ success: false, error: 'Failed to create message' });
    }
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

main();
