import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import axios from 'axios';
import GetFiles from './components/GetFiles';
import ProgressBar from './components/ProgressBar';
import { config } from './config'; 



function App(props) {
  const [currentFile,setCurrentFile] =useState({
    count: 0,
    name: ""
  });
  const [isUploaded, setIsUploaded] = useState(false)
  const [displayProgressBar, setDisplayProgressBar] = useState(false)
  const [progressValue, setProgressValue] = useState(0)
  const currentFileSelected = useRef(null)
  const [fileInfo, setFileInfo] = useState({})

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
    setDisplayProgressBar(true)
    formData.append('file',currentFile.name );
    let bucketURL = config.BASE_URL+"/objects/" + shortEmail;

    // try{
      let res = await axios.get(config.BASE_URL+"/isUploaded/"+shortEmail,{
        headers: {
          authorization:'Bearer ' +JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
        },
        params:{
          fileName:currentFile.name.name,
        }
      })

      if(res != undefined && res.data.isUploaded == 1){
        alert("Image already exists");
        setDisplayProgressBar(false);
      }
      else{
        try{
          console.log("Initiating upload")
          console.log(formData);
          let response = await axios.post(bucketURL, formData,{
              headers: {
                 authorization:
                'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
            },
            // Added On Upload Progress Config to Axios Post Request
            onUploadProgress: function (progressEvent) {
              const percentCompleted = Math.round((progressEvent.loaded / progressEvent.total) * 100)
              setProgressValue(percentCompleted)
            },
          })
          // .then((res) => {
            if (response.status === 200) {
              alert('Upload is in Progress...Please check after some time')
            } else {
              alert('Error in Uploading File')
            }
          // })
          setTimeout(function () {
            setProgressValue(0)
            setDisplayProgressBar(false)
          }, 3000)
          console.log("Upload complete");
          currentFileSelected.current.value = null
          setIsUploaded(true);
          setCurrentFile((prevValue) => ({
            ...prevValue,
            name: response.data.filename,
            format: response.data.format,
            count: prevValue.count + 1,
          }))
        }catch (error) {
          console.log(error);
        }
      }  
  }
    
  return (
    <div className="App">
      <div className='main-btn'>
        <div className="form-container">
          <form>
            <input type="file" ref={currentFileSelected} id="fileInput" onChange={handleChange} className="input-file"/>
            <button type="submit" onClick={uploadFile} className="upload-button">Upload</button>
          </form>
          {displayProgressBar? <ProgressBar progressValue={progressValue}/>:<></>}
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

