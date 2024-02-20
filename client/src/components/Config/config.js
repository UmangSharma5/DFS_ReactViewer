const PORT = 5000;
const config = {
  BASE_URL: 'http://localhost:' + String(PORT) + '/hv',
  SOCKET_URL: 'http://localhost:' + String(PORT),
  LOGIN_URL: 'https://datafoundation.iiit.ac.in/api/login',
  LOGIN_URL_DEV: 'http://10.4.25.20:3001/api/login',
  GET_URL: 'https://datafoundation.iiit.ac.in/api/detokn?token=',
  GET_URL_DEV: 'http://10.4.25.20:3001/api/detokn?token=',
  // BASE_URL : "http://datafoundation-dev.iiit.ac.in/hv",
  // SOCKET_URL:  "http://datafoundation-dev.iiit.ac.in",
  REFRESH_TIME: 20000,
};

export { config };
