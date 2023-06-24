import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import Login from './Login';
import axios from 'axios';

const LOGIN_URL = "https://datafoundation.iiit.ac.in/api/login";
var tokenId = localStorage.getItem("token");


function logoutUser () {
  localStorage.clear();
  ReactDOM.render(<Login checkUser = {checkUser} />, document.getElementById("root")); 
}


function checkAuth(email) {
  const GET_URL = "https://datafoundation.iiit.ac.in/api/detokn?token="+tokenId;
  axios.get(GET_URL)
  .then((response) => {
    ReactDOM.render(<App logout={logoutUser} />, document.getElementById("root"));
  })
  .catch(error => {
    console.log("Incorrect token!!!");
    ReactDOM.render(<Login checkUser = {checkUser} />, document.getElementById("root")); 
  })
}


function checkUser(email,password) {
  axios.post(LOGIN_URL,{email,password})
    .then ((response) => {
      localStorage.setItem("token",response.data.data.token);
      tokenId = localStorage.getItem("token");
      checkAuth(email);
    })
    .catch(error => {
      console.log("Incorrect Username or password!!!");
    })
    return false; // For the toast in Login
}

checkAuth();

