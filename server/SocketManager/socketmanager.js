import { Server } from 'socket.io';
import {
  add_user_socket,
  get_userid,
  check_user_socket,
  update_user_socket,
} from '../Database_queries/queries.js';
import { v4 as uuidv4 } from 'uuid';

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
    // here update/add to the table the socket status filename
    let user = socket.handshake.query.user;
    let userid = get_userid(user);
    let filename = socket.handshake.query.filename;
    let time = socket.handshake.query.time;
    let hash_filename = uuidv4(filename + time);

    check_user_socket(userid, hash_filename)
      .then(result => {
        if (result.length === 0) {
          add_user_socket(userid, hash_filename, socket.id, 'connected');
        } else {
          update_user_socket(userid, hash_filename, socket.id, 'connected');
        }
      })
      .catch(error => {
        console.error(error); // Handle errors here
      });

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
