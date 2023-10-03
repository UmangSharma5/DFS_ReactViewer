import React, {useState} from "react";
import './Login.css';
import {ToastContainer,Slide, toast } from 'react-toastify';


function Login(props) {
  
  const [input,setInput] = useState({
    username : "",
    password : ""
  });

  function handleChange(e){
    const {name , value } = e.target;
    setInput((prevValue) =>{
      return {
        ...prevValue,
        [name] : value
      }
    })
  };

async function handleClick (e) {
    e.preventDefault();
    const email = input.username;
    const password = input.password;
    const isValid = await props.checkUser(email,password);
    console.log(isValid);
    if(isValid === false)
      toast.error("Incorrect Username or Password!");
  };

  return (
    <div className="Login">
      <div id="bg"></div>
      <h1>Login</h1>
      <form>  
          <div class="form-field">
            <input 
              name="username"
              type="text"
              placeholder="Enter Username"
              onChange={handleChange}
              value = {input.username}
            />
          </div>
          <div class="form-field">
            <input 
              name="password"
              type="password"
              placeholder="Enter Password"
              onChange={handleChange}
              value = {input.password}
            />
          </div>
          <div class="form-field">
            <button className="btn" onClick={handleClick}>Submit</button>
        </div>
      </form>
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
    </div>
  )
}

export default Login;