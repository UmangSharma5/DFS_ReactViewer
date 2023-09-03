import React, { useEffect, useState } from 'react';
import './App.css';
import axios from 'axios';
import GetFiles from './components/GetFiles';
import { config } from './config'; 


function App(props) {
  const [currentFile,setCurrentFile] =useState({
    count: 0,
    name: ""
  });
  const [isUploaded,setIsUploaded] = useState(false);
  const [fileInfo,setFileInfo] = useState({});

  const email = JSON.parse(localStorage.getItem("dfs-user")).user.user_email.toLowerCase();
  let shortEmail ='';
  for (let i = 0; i < email.length; i++) {
    const charCode = email.charCodeAt(i);   
    if ((charCode >= 48 && charCode <= 57) || (charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122)) {
      shortEmail += email.charAt(i);
    }
  }
  
  function handleClick(){
    props.logout();
  }

  function handleChange(e){
    const file =  e.target.files[0];
    setCurrentFile((prevValue)=>({
      ...prevValue,
      name : file
    }))
  };
  
  async function uploadFile(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('file', currentFile.name);
    let bucketURL = config.BASE_URL+"/objects/" + shortEmail;
    try {
      console.log("Initiating upload")
      const response = await axios.post(bucketURL, formData,
      {
          headers: {
              'authorization': 'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
          }
      });
      console.log("Upload complete");
      setIsUploaded(true);
      console.log("resp-",response);
      setCurrentFile((prevValue) => ({
        ...prevValue,
        name:response.data.filename,
        format: response.data.format,
        count: prevValue.count+1,
      }))     
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
        <GetFiles fileObj={currentFile} uploadStatus={isUploaded} email={shortEmail} />
      </div>
    </div>
  );
}

export default App;

