import React, { useEffect, useState } from 'react';
import './App.css';
import axios from 'axios';
import GetFiles from './components/GetFiles';

function App(props) {
  const [fileName,setFileName] = useState();
  const [submitCount, setSubmitCount] = useState(0); 
  const [isUploading,setIsUploading] = useState(false);

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
      setIsUploading(true);
      e.preventDefault();
      const formData = new FormData();
      formData.append('file', fileName);
      let bucketURL ="http://localhost:5000/objects/"+shortEmail;
      // console.log(props);
      axios.post(bucketURL,formData)
      .then((response) => {
        console.log(response);
      })
      .catch(error => {
        console.log(error);
      })
      setSubmitCount((prevCount) => prevCount + 1);
      setIsUploading(false);
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
        <GetFiles key={submitCount} email={shortEmail}/>
      </div>
    </div>
  );
}

export default App;

