import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import CustomToastContainer from './components/CustomToastContainer/CustomToastContainer';
import Viewer from './components/Viewer/Viewer';
import Login from './components/Login/Login';
import './App.css';
import NavBar from './components/Viewer/components/NavBar/NavBar';
// import '../src/components/Config/config'
import { config } from 'components/Config/config';

function App() {
  let tokenId = null;

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate = useNavigate();

  if (JSON.parse(localStorage.getItem('dfs-user')) !== null) {
    tokenId = JSON.parse(localStorage.getItem('dfs-user')).token;
  }

  useEffect(() => {
    checkAuth();
  }, [isLoggedIn]);

  function logoutUser() {
    localStorage.clear();
    setIsLoggedIn(false);
    navigate('/login');
  }

  async function checkUser(email, password) {
    const LOGIN_URL = config.LOGIN_URL;

    try {
      const response = await axios.post(LOGIN_URL, { email, password });

      let dfs_user = {
        user: response.data.data.user,
        token: response.data.data.token,
      };

      var jsonString = JSON.stringify(dfs_user);

      localStorage.setItem('dfs-user', jsonString);
      tokenId = JSON.parse(localStorage.getItem('dfs-user')).token;

      await checkAuth(email);
    } catch (error) {
      console.error('Incorrect Username or password!!!');
      return false;
    }
  }

  async function checkAuth() {
    const GET_URL = config.GET_URL + tokenId;
    try {
      await axios.get(GET_URL);
      setIsLoggedIn(true);
      navigate('/');
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <>
      <NavBar logout={logoutUser} />
      <Routes>
        <Route
          exact
          path="/"
          element={
            isLoggedIn ? (
              <Viewer logout={logoutUser} />
            ) : (
              <Navigate replace to="/login" />
            )
          }
        />
        <Route
          exact
          path="/login"
          element={
            isLoggedIn ? (
              <Navigate replace to="/" />
            ) : (
              <Login checkUser={checkUser} />
            )
          }
        />
      </Routes>
      <CustomToastContainer />
    </>
  );
}

export default App;
