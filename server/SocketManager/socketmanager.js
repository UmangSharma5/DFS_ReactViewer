let sockets = {};
let socket_user_map = {};

const updateSocket = (usertoken, clientsocket, user_id) => {
  sockets[usertoken] = clientsocket;
  socket_user_map[usertoken] = user_id;
};

const removeSocket = usertoken => {
  delete sockets[usertoken];
  delete socket_user_map[usertoken];
};

export { sockets, socket_user_map, updateSocket, removeSocket };