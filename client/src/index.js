import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import Login from './Login';
import axios from 'axios';
import {BrowserRouter} from 'react-router-dom';

const LOGIN_URL = "https://datafoundation.iiit.ac.in/api/login";
var tokenId = localStorage.getItem("token");


function logoutUser () {
  localStorage.clear();
  const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render( 
          <BrowserRouter basename='/hv'>
            <Login checkUser={checkUser} />
          </BrowserRouter>
    );
}


async function checkAuth(email) {
  const GET_URL = "https://datafoundation.iiit.ac.in/api/detokn?token="+tokenId;
  try {
    const response = await axios.get(GET_URL);
    // ReactDOM.render(<App logout={logoutUser} />, document.getElementById("root"));
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render( 
          <BrowserRouter basename='/hv'>
            <App logout={logoutUser}/>
          </BrowserRouter>
    );

  } catch (error) {
    console.log("Incorrect token!!!");
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render( 
          <BrowserRouter basename='/hv' >
            <Login checkUser={checkUser} />
          </BrowserRouter>
    );
  }
}


async function checkUser(email, password) {
  try {
    const response = await axios.post(LOGIN_URL, { email, password });
    localStorage.setItem("token", response.data.data.token);
    tokenId = localStorage.getItem("token");
    await checkAuth(email);
    return true;
  } catch (error) {
    console.log("Incorrect Username or password!!!");
    return false;
  }
}

checkAuth();

