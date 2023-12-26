import React, { useRef, useState } from 'react';
import './Viewer.css';
import axios from 'axios';
import GetFiles from './components/GetFiles/GetFiles';
import ProgressBar from './components/ProgressBar/ProgressBar';
import { config } from '../Config/config';
import { toast } from 'react-toastify';
import { io } from 'socket.io-client';
import StatusInfo from '../statusInfo';

function Viewer() {
  const [currentFile, setCurrentFile] = useState({
    count: 0,
    name: '',
  })
  const [isUploaded, setIsUploaded] = useState(false)
  const [displayProgressBar, setDisplayProgressBar] = useState(false)
  const [progressValue, setProgressValue] = useState(0)
  const currentFileSelected = useRef(null)
  const [uploadPercentage,setUploadPercentage] = useState({});
  const [isConnected,setIsConnected] = useState(false);
  const inProgressUpload = useRef(0)

  const email = JSON.parse(
    localStorage.getItem('dfs-user'),
  ).user.user_email.toLowerCase();
  let shortEmail = '';
  for (let i = 0; i < email.length; i++) {
    const charCode = email.charCodeAt(i);
    if (
      (charCode >= 48 && charCode <= 57) ||
      (charCode >= 65 && charCode <= 90) ||
      (charCode >= 97 && charCode <= 122)
    ) {
      shortEmail += email.charAt(i);
    }
  }

  function handleChange(e) {
    const file = e.target.files[0];
    setCurrentFile(prevValue => ({
      ...prevValue,
      name: file,
    }));
  }

  async function uploadFile(e) {
    e.preventDefault()
    const socket = io(config.SOCKET_URL, {path: "/hv/socket"});
    socket.on('connect', () => {
      // console.error('Connected:', socket.connected); // Should be true
      setIsConnected(true);
      inProgressUpload.current += 1
      socket.emit('addUser',{
        token: JSON.parse(localStorage.getItem("dfs-user"))?.["token"], 
        inProgress: inProgressUpload.current
      })
    });

    socket.on('progress', progress_data => {
      if (
        progress_data.Data.Uploaded_Files !== undefined &&
        progress_data.Data.Total_Files !== undefined
      ) {
        let num = progress_data.Data.Uploaded_Files;
        let den = progress_data.Data.Total_Files;
        let per = (num / den) * 100;
        const fileName = currentFile.name.name;
        setUploadPercentage(prevValue => ({
          ...prevValue,
          [fileName]: per,
        }));
      }
    });

    socket.on('error', error => {
      console.error('Socket.IO error:', error);
    });

    socket.on('AddedUser',async (user_added) => {
      const formData = new FormData()
      setDisplayProgressBar(true)
      formData.append('file', currentFile.name)
      let bucketURL = config.BASE_URL + '/objects/' + shortEmail

      let res = await axios.get(config.BASE_URL + '/isUploaded/' + shortEmail, {
        headers: {
          authorization:
            'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
        },
        params: {
          fileName: currentFile.name.name,
        },
      })

      if (res !== undefined && res.data.isUploaded === 1) {
        toast.warn('Image Already Exists')
        setDisplayProgressBar(false)
      } else {
        try {
          let response = await axios.post(bucketURL, formData, {
            headers: {
              authorization:
                'Bearer ' +
                JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
            },
            params: {
              inProgress: inProgressUpload.current
            },
            // Added On Upload Progress Config to Axios Post Request
            onUploadProgress: function (progressEvent) {
              const percentCompleted = Math.round(
                (progressEvent.loaded / progressEvent.total) * 100
              )
              setProgressValue(percentCompleted)
            },
          })
          if (response.status === 200) {
            toast.info('Upload is in Progress....Please check after some time')
          } else {
            toast.error('Error in Uploading File')
          }
          setTimeout(function () {
            setProgressValue(0)
            setDisplayProgressBar(false)
          }, 3000)
          currentFileSelected.current.value = null
          setIsUploaded(true)
          setCurrentFile((prevValue) => ({
            ...prevValue,
            name: response.data.filename,
            format: response.data.format,
            count: prevValue.count + 1,
          }))
        } catch (error) {
          console.log(error)
        }
      }
      inProgressUpload.current -= 1
    })
  }

  return (
    <div className="Viewer">
      <div className="main-btn">
        <div className="form-container">
          <form>
            <input
              type="file"
              ref={currentFileSelected}
              id="fileInput"
              onChange={handleChange}
              className="input-file"
            />
            <button
              type="submit"
              onClick={uploadFile}
              className="upload-button"
            >
              Upload
            </button>
          </form>
          {displayProgressBar ? (
            <ProgressBar progressValue={progressValue} />
          ) : (
            <></>
          )}
        </div>
      </div>
      <div className="get-files">
        <GetFiles
          fileObj={currentFile}
          uploadStatus={isUploaded}
          email={shortEmail}
          uploadPercentage={uploadPercentage}
        />
      </div>
      <div className="status">
        <StatusInfo
          uploadPercentage={uploadPercentage}
          isConnected={isConnected}
        />
      </div>
    </div>
  );
}

export default Viewer;
