import React from 'react'
import './PageNotFound.css'
import {useNavigate } from 'react-router-dom'

function PageNotFound() {

  const navigate = useNavigate()

  function handleClick() {
    navigate('/')
  }

  return (
    <div class='section'>
      <h1 class='error'>404</h1>
      <p class='page'>The page you are looking for is not found</p>
      <button id='home-btn' onClick={handleClick}>  Back to Home </button>
    </div>
  )
}

export default PageNotFound
