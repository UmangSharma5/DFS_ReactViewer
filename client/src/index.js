import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import Login from './Login';
import axios from 'axios';
import {BrowserRouter} from 'react-router-dom';
import { ToastContainer,Slide} from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

const LOGIN_URL = "https://datafoundation.iiit.ac.in/api/login";
const LOGIN_URL_DEV = "http://10.4.25.20:3001/api/login";
var tokenId;

if(JSON.parse(localStorage.getItem("dfs-user")) !=null){
  tokenId = JSON.parse(localStorage.getItem("dfs-user")).token
}


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
  const GET_URL_DEV = "http://10.4.25.20:3001/api/detokn?token="+tokenId;
  try {
    const response = await axios.get(GET_URL_DEV);
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(
      <BrowserRouter basename='/hv'>
        <App logout={logoutUser} />
        <ToastContainer
          position='top-center'
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          transition={Slide}
          theme='colored'
        />
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
    const response = await axios.post(LOGIN_URL_DEV, { email, password });

    let dfs_user={
      user:  response.data.data.user,
      token: response.data.data.token
    }

    var jsonString = JSON.stringify(dfs_user);

    localStorage.setItem("dfs-user", jsonString);
    tokenId = JSON.parse(localStorage.getItem("dfs-user")).token;
    await checkAuth(email);
    return true;
  } catch (error) {
    console.log("Incorrect Username or password!!!");
    return false;
  }
}

checkAuth();

