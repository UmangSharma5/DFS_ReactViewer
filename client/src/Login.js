import React, {useState} from "react";
import './Login.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


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

  function handleClick (e) {
    e.preventDefault();
    const email = input.username;
    const password = input.password;
    localStorage.setItem("email",email);
    const isValid =  props.checkUser(email,password);
    if(isValid === false)
      toast("Username or Password was Incorrect !!!!");
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
      <ToastContainer />
    </div>
  );
}

export default Login;