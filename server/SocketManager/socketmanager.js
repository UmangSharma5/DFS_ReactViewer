let sockets = {};

const updateSocket = (usertoken, clientsocket) => {
  sockets[usertoken] = clientsocket;
};

const removeSocket = usertoken => {
  delete sockets[usertoken];
};

export { sockets, updateSocket, removeSocket };
