import React, { useEffect, useState } from 'react';
import './App.css';
import axios from 'axios';
import GetFiles from './components/GetFiles';


function App(props) {
  const [fileName,setFileName] = useState();
  const [countSubmit,setCountSubmit] =useState(0);
  // {curr_count:0,objInfo:objInfo}

  
  const email = localStorage.getItem("email").toLowerCase();
  let shortEmail ='';
  for (let i = 0; i < email.length; i++) {
    const charCode = email.charCodeAt(i);   
    if ((charCode >= 48 && charCode <= 57) || (charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122)) {
      shortEmail += email.charAt(i);
    }
  }
  
  console.log(shortEmail);

  function handleClick(){
    props.logout();
  }

  function handleChange(e){
    setFileName(e.target.files[0]);
  };

  
  async function uploadFile(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('file', fileName);
    let bucketURL = "http://localhost:5000/objects/" + shortEmail;
    
    try {
      console.log("Initiating upload")
      const response = await axios.post(bucketURL, formData);
      // check what all we get here. (objInfo.name)
      // const objInfo = response.data.data
      console.log("Upload complete");
      setCountSubmit((preValue) => preValue+1);
      
      // window.location.reload();
    } catch (error) {
      console.log(error);
    }

  }
   
  
  return (
    <div className="App">
      <div className='main-btn'>
        <div className="form-container">
          <form>
            <input type="file" id="fileInput" onChange={handleChange} className="input-file"/>
            <button type="submit" onClick={uploadFile} className="upload-button">Upload</button>
          </form>
        </div>
        <button id="logout-btn" onClick={handleClick}>Logout</button>
      </div>
      <div className='get-files'>
        <GetFiles id={countSubmit} email={shortEmail}/>
      </div>
    </div>
  );
}

export default App;

