import https from 'https';
import fs from 'fs';
import { server as WebSocketServer } from 'websocket';
import dotenv from 'dotenv';

dotenv.config();

// Function to get the current time in the format HH:mm:ss
function getCurrentTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// Read the SSL certificate files
const privateKey = fs.readFileSync('certificate/private-key.pem', 'utf8');
const certificate = fs.readFileSync('certificate/certificate.pem', 'utf8');

const credentials = { key: privateKey, cert: certificate };
const httpsServer = https.createServer(credentials);

httpsServer.listen(8443, () => {
    console.log(`${new Date()} Server is listening on port 8443 (HTTPS)`);
});

const wsServer = new WebSocketServer({
    httpServer: httpsServer,
    autoAcceptConnections: false,
});

const endpointToConnectedUsersMap = new Map();

wsServer.on('request', (request) => {
    try {
        const connection = request.accept(null, request.origin);
        console.log(`${new Date()} Connection accepted.`);

        const username = request.resourceURL.query.username;
        const endpoint = request.resourceURL.pathname.slice(1);

        if (!endpointToConnectedUsersMap.has(endpoint)) {
            endpointToConnectedUsersMap.set(endpoint, new Map());
        }

        const connectedUsers = endpointToConnectedUsersMap.get(endpoint);

        // Send the message history to the new connection
        connectedUsers.forEach((client) => {
            if (client.socket !== connection && client.socket.connected) {
                connection.sendUTF(client.messageHistory);
            }
        });

        // Add the new connection to the connected users
        connectedUsers.set(connection, { username, socket: connection, messageHistory: [] });

        connection.on('message', (message) => {
            if (message.type === 'utf8') {
                const receivedMessage = message.utf8Data;
                const timestamp = getCurrentTime();
                const formattedMessage = JSON.stringify({ username, timestamp, content: receivedMessage });

                // Broadcast the received message to all connected clients for the specific endpoint
                connectedUsers.forEach((client) => {
                    if (client.socket && client.socket !== connection && client.socket.connected) {
                        client.socket.sendUTF(formattedMessage);
                    }
                });

                // Add the formatted message to the history for the sending user
                connectedUsers.get(connection).messageHistory.push(formattedMessage);
            }
        });

        connection.on('close', () => {
            console.log(`${new Date()} Peer ${connection.remoteAddress} disconnected.`);
            connectedUsers.delete(connection);
        });
    } catch (error) {
        console.error('Error accepting WebSocket connection:', error);
    }
});
