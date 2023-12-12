let sockets = [];

const updateSocket = (usertoken, clientsocket) => {
  const entry = sockets.findIndex(usersock => usersock.token == usertoken);
  // console.log(entry)
  if (entry != -1) sockets[entry].sock = clientsocket;
  else sockets.push({ token: usertoken, sock: clientsocket });
};

const removeSocket = index => {
  sockets.splice(index, 1);
};

export { sockets, updateSocket, removeSocket };
