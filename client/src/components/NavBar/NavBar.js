import React from 'react'
import './NavBar.css'
import { useNavigate } from 'react-router-dom'

function NavBar(props) {

  const navigate = useNavigate()

  function handleClick() {
    props.logout()
  }

  function handleHome() {
    navigate('/')
  }

  return (
    <div className='navbar'>
      <div id='ihub-logo'  onClick={handleHome}></div>
      <p id='heading'>HISTOPATHOLOGY VIEWER</p>
      <button id="logout-btn" onClick={handleClick}>Logout</button>
    </div>
  )
}

export default NavBar
