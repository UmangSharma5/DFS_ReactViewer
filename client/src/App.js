import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  redirect,
} from 'react-router-dom';
import CustomToastContainer from './components/CustomToastContainer/CustomToastContainer';
import Viewer from './components/Viewer/Viewer';
import './App.css';
import NavBar from './components/Viewer/components/NavBar/NavBar';
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

  async function checkAuth() {
    try {
      await axios.get(config.GET_URL_DEV + tokenId);
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
          Component={() => {
            if (isLoggedIn) {
              return <Navigate replace to="/" />;
            } else {
              // window.location.href = config.LOGIN_URL
              return <p>Redirecting ...</p>;
            }
          }}
        />
      </Routes>
      <CustomToastContainer />
    </>
  );
}

export default App;
