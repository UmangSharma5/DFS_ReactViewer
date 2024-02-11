import { Server } from 'socket.io';

let sockets = {};

const updateSocket = (usertoken, clientsocket) => {
  sockets[usertoken] = clientsocket;
};

const removeSocket = usertoken => {
  delete sockets[usertoken];
};

const emitMessage = (socket, message, data) => {
  if (socket) {
    socket.emit(message, data);
  }
};

export default function initializeSocket(server) {
  const io = new Server(server, {
    path: '/hv/socket',
    cors: {
      origin: '*',
    },
  });

  // Listen for when the client connects via socket.io-client
  io.on('connection', socket => {
    console.warn(`User connected ${socket.id}`);

    socket.on('addUser', user => {
      let usertoken = user.socket_id;
      updateSocket(usertoken, socket);
      socket.emit('AddedUser', {
        user_added: true,
      });
    });

    // When disconnect from client
    socket.on('disconnect', () => {
      // console.log("a user disconnected!");
    });
  });
}

export { sockets, updateSocket, removeSocket, emitMessage };
