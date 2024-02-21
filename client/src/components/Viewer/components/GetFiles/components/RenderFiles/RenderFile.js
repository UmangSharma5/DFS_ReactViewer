import React, { useEffect, useState } from 'react';
import axios from 'axios';
import OpenSeadragonViewer from './components/OpenSeaDragon/OpenSeadragonViewer';
import './RenderFile.css';
import { config } from '../../../../../Config/config';
import { toast } from 'react-toastify';
import { FaRegImages } from 'react-icons/fa';
import { AiFillCloseCircle } from 'react-icons/ai';
import { io } from 'socket.io-client';
import ProgressBar from 'components/Viewer/components/ProgressBar/ProgressBar';
import DeleteIcon from '@mui/icons-material/Delete';
// import StatusInfo from '../../../../../statusInfo'

function RenderFile(props) {
  const [viewerImage, setViewerImage] = useState();
  const [imageName, setImageName] = useState();
  const [allImagesLinks, setAllImagesLinks] = useState({});
  const [allImageName, setAllImageName] = useState([]);
  const [previousImageNames, setPreviousImageNames] = useState(null);
  const [format, setFormat] = useState();
  const [pyramid, setPyramid] = useState({});
  const isFirstRender = React.useRef(true);
  const [outer, setOuter] = useState();
  // const [isLoding, setLoading] = useState(false)
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [currentFile, setCurrentFile] = useState({
    count: 0,
    name: '',
  });

  // useEffect(() => {
  //   const refreshInterval = setInterval(() => {
  //     props.getFiles();
  //   }, config.REFRESH_TIME);
  //   return () => clearInterval(refreshInterval);
  // }, []);
  // console.warn(props.isFileUploaded);
  useEffect(() => {
    props.getFiles();
  }, [props.isFileUploaded]);

  useEffect(() => {
    if (
      props.info.length > 0 &&
      !isFirstRender.current &&
      previousImageNames !== null
    ) {
      const newImageNames = props.info.filter(newImage => {
        return !previousImageNames.some(oldImage => {
          let oldImageId = oldImage.fileId;
          let newImageId = newImage.fileId;
          return oldImageId === newImageId;
        });
      });

      const removedImageNames = previousImageNames.filter(oldImage => {
        return !props.info.some(newImage => {
          let oldImageId = oldImage.fileId;
          let newImageId = newImage.fileId;
          return oldImageId === newImageId;
        });
      });

      if (removedImageNames.length > 0) {
        const updatedImageLinks = { ...allImagesLinks };
        removedImageNames.forEach(removedImageName => {
          const indexToRemove = allImageName.findIndex(imageName => {
            let imageId = imageName.fileId;
            let removedImageId = removedImageName.fileId;
            return imageId === removedImageId;
          });

          const { name, fileId } = removedImageName;

          if (
            indexToRemove !== -1 &&
            Object.hasOwnProperty.call(updatedImageLinks, name + fileId)
          ) {
            allImageName.splice(indexToRemove, 1);
            delete updatedImageLinks[name + fileId];
          }
        });
        setAllImagesLinks(updatedImageLinks);
      }

      if (newImageNames.length > 0) {
        const reversedImageNames = [...newImageNames].reverse();
        reversedImageNames.forEach(newImage => {
          getImageLink(newImage);
        });
      }
    } else {
      setAllImageName(props.info);
    }

    setPreviousImageNames(props.info);
    if (isFirstRender.current) {
      getAllImageLinks();
      if (props.info.length > 0) {
        isFirstRender.current = false;
      }
      return;
    }
  }, [props.info]);

  async function getAllImageLinks() {
    try {
      const responses = await Promise.all(
        props.info.map(image => {
          const imageObj = {
            imageName: image.name,
            imageFormat: image.format,
            imageId: image.fileId,
          };
          return axios.get(config.BASE_URL + '/getURL/' + props.email, {
            params: imageObj,
            headers: {
              Authorization:
                'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.token,
            },
          });
        }),
      );

      const imageLinks = {};
      responses.forEach(response => {
        let name = response.data.imageName.split('.')[0];
        let fileId = response.data.fileId;
        let link = response.data.imageUrl;
        imageLinks[name + fileId] = link;
      });
      setAllImagesLinks(imageLinks);
    } catch (error) {
      console.error(error);
    }
  }

  async function getImageLink(image) {
    try {
      const imageObj = {
        imageName: image.name,
        imageFormat: image.format,
        imageId: image.fileId,
      };
      await axios
        .get(config.BASE_URL + '/getURL/' + props.email, {
          params: imageObj,
          headers: {
            authorization:
              'Bearer ' +
              JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
          },
        })
        .then(response => {
          let name = response.data.imageName.split('.')[0];
          let link = response.data.imageUrl;
          let fileId = response.data.fileId;
          allImagesLinks[name + fileId] = link;
          allImageName.unshift(image);
        })
        .catch(error => {
          console.error(error);
        });
    } catch (error) {
      console.error(error);
    }
  }

  async function handleClick(e) {
    // setLoading(true)
    let num = e.target.id;
    const imagetype = allImageName[num].format;
    const dir_ = allImageName[num].name.split('.')[0];
    let imageId = allImageName[num].fileId;
    if (imagetype !== 'png' && imagetype !== 'jpeg') {
      let imageObj = { baseDir: dir_ + imageId + '/temp/' + dir_ + '_files/' };
      await axios
        .get(config.BASE_URL + '/getURL/imagePyramid/' + props.email, {
          params: imageObj,
          headers: {
            authorization:
              'Bearer ' +
              JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
          },
        })
        .then(response => {
          setOuter(response.data.outer);
          return response.data.image;
        })
        .then(image => {
          setPyramid(image);
        })
        .catch(error => {
          console.error(error);
          return null;
        });
    }
    setFormat(imagetype);

    setViewerImage(
      allImagesLinks[allImageName[num].name + allImageName[num].fileId],
    );
    setImageName(allImageName[num]);
    // setLoading(false)
  }

  function handleDelete(event, file) {
    props.onDelete(event, file);
    toast.info('Image Deleted Successfully!');
    setViewerImage();
  }

  return (
    <div className="render-file-container">
      {showThumbnails ? (
        <div className="button-container">
          <div className="main-btn">
            <div className="form-container">
              <button
                onClick={e => props.setShow(true)}
                className="upload-button"
              >
                Upload Files
              </button>
              {props.displayProgressBar ? (
                <ProgressBar progressValue={props.progressValue} />
              ) : (
                <></>
              )}
            </div>
          </div>
          {allImageName.map((file, i) => {
            const buttonStyles = {
              margin: '10px',
              backgroundImage: allImagesLinks[file.name + file.fileId]
                ? `url(${allImagesLinks[file.name + file.fileId]})`
                : 'none',
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'cover',
              color: '#333',
              objectFit: 'cover',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              height: '100px',
              width: '100px',
            };
            return (
              <div className="thumbnail-container">
                <img
                  className="thumnails"
                  onClick={handleClick}
                  style={buttonStyles}
                  key={i}
                  id={i}
                />
                <div className="name-del">
                  <p className="image-name">{file.name + '.' + file.format}</p>
                  <DeleteIcon
                    onClick={event => handleDelete(event, file)}
                    style={{ color: 'red' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <></>
      )}
      {showThumbnails ? (
        <AiFillCloseCircle
          title="Hide Thumbnails"
          onClick={() => {
            setShowThumbnails(!showThumbnails);
          }}
          style={{ height: '30px', width: '30px', marginRight: '10px' }}
        />
      ) : (
        <FaRegImages
          title="Show Thumbnails"
          onClick={() => {
            setShowThumbnails(!showThumbnails);
          }}
          style={{
            height: '30px',
            width: '30px',
            marginRight: '10px',
            marginLeft: '10px',
          }}
        />
      )}
      <div className="viewer-container">
        <p id="viewer-image-name">
          {viewerImage ? imageName.name + '.' + imageName.format : ' '}
        </p>
        {viewerImage ? (
          <OpenSeadragonViewer
            imageUrl={viewerImage}
            imageName={imageName}
            info={pyramid}
            format={format}
            outer={outer}
            /*
              Email is used to generate the Proxy links of the files and used in the backend
              to retrieve the bucket name in MINIO server
            */
            email={props.email}
          />
        ) : (
          <p>Select an image to view</p>
        )}
      </div>
    </div>
  );
}

export default RenderFile;
