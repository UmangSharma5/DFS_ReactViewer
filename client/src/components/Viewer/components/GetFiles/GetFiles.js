import React, { useState, useEffect } from 'react';
import sortFileNames from './helper/sortFileNames';
import RenderFile from './components/RenderFiles/RenderFile';
import './GetFiles.css';
import { config } from '../../../Config/config';
import axios from 'axios';

function GetFiles(props) {
  const [backendData, setBackendData] = useState(null);
  const isFirstRender = React.useRef(true);
  const [deletedFileName, setDeletedFileName] = useState();
  const [currFileName, setCurrFileName] = useState();

  useEffect(() => {
    if (isFirstRender.current) {
      getFiles();
      isFirstRender.current = false;
      return;
    }
  }, [props.fileObj.count]);

  async function getFiles() {
    try {
      const response = await axios.get(
        `${config.BASE_URL}/objects/${props.email}`,
        {
          headers: {
            authorization:
              'Bearer ' +
              JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
          },
        },
      );
      const sortedData = response.data.temp.sort(sortFileNames);
      setBackendData(sortedData);
    } catch (error) {
      console.error('here', error);
    }
  }

  function handleDelete(event, file) {
    let delFileName = file.name + '.' + file.format;
    setDeletedFileName(delFileName);
    try {
      axios
        .post(
          config.BASE_URL + '/deleteObject/' + props.email,
          { fileName: delFileName },
          {
            headers: {
              authorization:
                'Bearer ' +
                JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
            },
          },
        )
        .then(() => {
          const updatedData = Object.values(backendData).filter(
            currFile =>
              currFile.name !== file.name || currFile.format !== file.format,
          );
          setBackendData(updatedData);
          setCurrFileName(null);
        })
        .catch(error => {
          console.error(error);
        });
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="get-files-container">
      {backendData ? (
        <RenderFile
          getFiles={getFiles}
          refreshStatus={props.refreshStatus}
          currFile={currFileName}
          info={backendData}
          uploadStatus={props.uploadStatus}
          email={props.email}
          onDelete={handleDelete}
          deletedFileName={deletedFileName}
          uploadPercentage={props.uploadPercentage}
        />
      ) : null}
    </div>
  );
}

export default GetFiles;
