#!/usr/bin/env node
import express from 'express';
import expressWs from 'express-ws';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
expressWs(app);

const endpointToConnectedUsersMap = new Map();
let secretKey;

// Handle WebSocket connections for dynamic endpoints like /message1, /message2, etc.
app.ws('/:endpoint', (ws, req) => {
    const username = req.query.username;
    const endpoint = req.params.endpoint;

    if (!username) {
        sendErrorMessage(ws, 'Authentication failed. Missing username.');
        return;
    }

    // Create a Map for the endpoint if it doesn't exist
    if (!endpointToConnectedUsersMap.has(endpoint)) {
        endpointToConnectedUsersMap.set(endpoint, new Map());
    }

    ws.on('message', (message) => {
        const decryptedMessage = decryptMessage(message);
        if (decryptedMessage) {
            const timestamp = getCurrentTime();
            console.log(`${timestamp} ${username} sent: ${decryptedMessage.content}`);
            broadcastMessage({ sender: username, content: decryptedMessage.content, timestamp }, endpoint);
        }
    });

    endpointToConnectedUsersMap.get(endpoint).set(ws, { username, socket: ws });
    sendWelcomeMessage(ws, username);
});

// Reject any other WebSocket connections
app.ws('*', (ws, req) => {
    ws.close(4000, 'Invalid WebSocket endpoint');
});

function sendErrorMessage(ws, errorMessage) {
    ws.send(JSON.stringify({ error: errorMessage }));
    ws.close();
}

function sendWelcomeMessage(ws, username) {
    ws.send(JSON.stringify({ status: `Welcome, ${username}! You are now connected to the chat.` }));
}

function broadcastMessage(message, endpoint) {
    const connectedUsers = endpointToConnectedUsersMap.get(endpoint);
    connectedUsers.forEach((user) => {
        user.socket.send(encryptMessage(message));
    });
}

function encryptMessage(message) {
    try {
        const algorithm = 'aes-256-cbc';
        const key = Buffer.from(secretKey, 'hex');
        const iv = Buffer.alloc(16, 0); // Initialization vector, you may need to change this based on how you generate it

        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encryptedMessage = cipher.update(JSON.stringify(message), 'utf-8', 'base64');
        encryptedMessage += cipher.final('base64');
        return encryptedMessage;
    } catch (error) {
        console.error('Error encrypting message:', error);
        return null;
    }
}

function decryptMessage(encryptedMessage) {
    try {
        const algorithm = 'aes-256-cbc';
        const key = Buffer.from(secretKey, 'hex');
        const iv = Buffer.alloc(16, 0); // Initialization vector, you may need to change this based on how you generate it

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decryptedMessage = decipher.update(encryptedMessage, 'base64', 'utf-8');
        decryptedMessage += decipher.final('utf-8');
        return JSON.parse(decryptedMessage);
    } catch (error) {
        console.error('Error decrypting message:', error);
        return null;
    }
}

function getCurrentTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

const port = 6000;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    secretKey = process.env.ENCRYPTION_KEY;
});


// wscat -n -c "wss://localhost:8443/message2?username=alice"
