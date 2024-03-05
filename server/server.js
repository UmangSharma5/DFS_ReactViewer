import express from 'express';
const app = express();
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import require_auth from './middleware/Auth.js';
import require_auth_proxylinks from './middleware/proxyLinksAuth.js';
import {
  socket_user_map,
  updateSocket,
} from './SocketManager/socketmanager.js';
import { Server } from 'socket.io';
import { logger, log } from './logger.js';
const server = http.createServer(app);
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'build')));

import objectsRoute from './routes/objects.js';
import getURL from './routes/getURL.js';
import deleteBucket from './routes/deleteBucket.js';
import deleteObject from './routes/deleteObject.js';
import isUploaded from './routes/isUploaded.js';
import proxyLinks from './routes/proxyLinks.js';

app.use('/hv/objects', require_auth, objectsRoute);
app.use('/hv/getURL', require_auth, getURL);
app.use('/hv/deleteBucket', require_auth, deleteBucket);
app.use('/hv/deleteObject', require_auth, deleteObject);
app.use('/hv/isUploaded', require_auth, isUploaded);
app.use('/hv/link', require_auth_proxylinks, proxyLinks);
// app.use('/hv/objects',objectsRoute);
// app.use('/hv/getURL',getURL);
// app.use('/hv/deleteBucket',deleteBucket);
// app.use('/hv/deleteObject',deleteObject);

app.get('/*', function (req, res) {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const io = new Server(server, {
  path: '/hv/socket',
  cors: {
    origin: '*',
  },
});

// Add this
// Listen for when the client connects via socket.io-client
io.on('connection', socket => {
  socket.on('addUser', user => {
    let usertoken = user.socket_id;
    updateSocket(usertoken, socket, user.user_id);
    log.info(`User connected ${user.user_id}`);
    socket.emit('AddedUser', {
      user_added: true,
    });
  });

  socket.on('disconnect', () => {
    log.info(`User disconnected ${socket_user_map[socket.id]}`);
  });
});

app.get('/*', function (req, res) {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

server.listen(port, function () {
  log.info(`Server started on port ${port}`);
});
