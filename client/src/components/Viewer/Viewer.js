import { useRef, useState } from 'react';
import './Viewer.css';
import axios from 'axios';
import GetFiles from './components/GetFiles/GetFiles';
import ProgressBar from './components/ProgressBar/ProgressBar';
import { config } from '../Config/config';
import { toast } from 'react-toastify';
import { io } from 'socket.io-client';
import StatusInfo from '../statusInfo';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';

function Viewer() {
  const [currentFile, setCurrentFile] = useState({
    count: 0,
    files: '',
  });

  const [isUploaded, setIsUploaded] = useState(false);
  const [displayProgressBar, setDisplayProgressBar] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const currentFileSelected = useRef(null);
  const [uploadPercentage, setUploadPercentage] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

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
    const files = e.target.files;
    setCurrentFile(prevValue => ({
      ...prevValue,
      files: files,
    }));
  }

  async function uploadFile(e) {
    e.preventDefault();
    Array.from(currentFile.files).forEach(async file => {
      let res = await axios.get(config.BASE_URL + '/isUploaded/' + shortEmail, {
        headers: {
          authorization:
            'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
        },
        params: {
          fileName: file.name,
        },
      });

      if (res !== undefined && res.data.isUploaded === 1) {
        toast.warn('Image Already Exists');
        setDisplayProgressBar(false);
        return;
      }

      const socket = io(config.SOCKET_URL, { path: '/hv/socket' });
      socket.on('connect', () => {
        setIsConnected(true);
        socket.emit('addUser', {
          token: JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
          user_id: JSON.parse(localStorage.getItem('dfs-user'))?.['user'][
            'user_email'
          ],
          socket_id: socket.id,
        });
        const fileName = file.name;
        setUploadPercentage(prevValue => ({
          ...prevValue,
          [fileName]: {
            minio: -1,
            dzsave: -1,
          },
        }));
      });

      socket.on('progress', progress_data => {
        if (
          progress_data.Data.Uploaded_Files !== undefined &&
          progress_data.Data.Total_Files !== undefined
        ) {
          let num = progress_data.Data.Uploaded_Files;
          let den = progress_data.Data.Total_Files;
          let per = (num / den) * 100;
          const fileName = file.name;
          console.warn('per--', per);
          setUploadPercentage(prevValue => ({
            ...prevValue,
            [fileName]: {
              ...prevValue[fileName],
              minio: per,
            },
          }));
        }
      });

      socket.on('error', error => {
        console.error('Socket.IO error:', error);
      });

      socket.on('dzsave-progress', progress_data => {
        let per = progress_data.progress;
        const fileName = file.name;
        setUploadPercentage(prevValue => ({
          ...prevValue,
          [fileName]: {
            ...prevValue[fileName],
            dzsave: Number(per),
          },
        }));
      });

      socket.on('AddedUser', async () => {
        const formData = new FormData();
        setDisplayProgressBar(true);
        formData.append('file', file);
        let bucketURL = config.BASE_URL + '/objects/' + shortEmail;

        try {
          let response = await axios.post(bucketURL, formData, {
            headers: {
              authorization:
                'Bearer ' +
                JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
            },
            params: {
              socket_id: socket.id,
            },
            // Added On Upload Progress Config to Axios Post Request
            onUploadProgress: function (progressEvent) {
              const percentCompleted = Math.round(
                (progressEvent.loaded / progressEvent.total) * 100,
              );
              setProgressValue(percentCompleted);
            },
          });
          if (response.status !== 200) {
            toast.error('Error in Uploading File');
          }
          setTimeout(function () {
            setProgressValue(0);
            setDisplayProgressBar(false);
          }, 3000);
          currentFileSelected.current.value = null;
          setIsUploaded(true);
          setCurrentFile(prevValue => ({
            ...prevValue,
            name: response.data.filename,
            format: response.data.format,
            count: prevValue.count + 1,
          }));
        } catch (error) {
          console.error(error);
        }
      });
    });
  }

  return (
    <div className="Viewer">
      <Modal
        show={showUploadModal}
        onHide={e => setShowUploadModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Select Files to Upload</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div class="mb-3">
            <label for="fileInput" className="form-label">
              Choose Files
            </label>
            <input
              className="form-control"
              type="file"
              multiple
              onChange={handleChange}
              ref={currentFileSelected}
              id="fileInput"
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="success"
            onClick={e => {
              uploadFile(e);
              setShowUploadModal(false);
            }}
          >
            Upload
          </Button>
        </Modal.Footer>
      </Modal>
      <div className="get-files">
        <GetFiles
          fileObj={currentFile}
          uploadStatus={isUploaded}
          email={shortEmail}
          setShow={setShowUploadModal}
          displayProgressBar={displayProgressBar}
          progressValue={progressValue}
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
