// library imports
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { RiDeleteBin6Fill } from 'react-icons/ri';

// components
import OpenSeadragonViewer from './components/OpenSeaDragon/OpenSeadragonViewer';
import ProgressBar from 'components/Viewer/components/ProgressBar/ProgressBar';

// config/helpers
import { config } from 'components/Config/config';

// css file
import './RenderFile.css';

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
  const [showThumbnails, setShowThumbnails] = useState(true);

  useEffect(() => {
    props.getFiles(props.isFileUploaded);
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
          setAllImageName(prevAllImageName => [image, ...prevAllImageName]);
        })
        .catch(error => {
          console.error(error);
        });
    } catch (error) {
      console.error(error);
    }
  }

  async function handleClick(e) {
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
          if (response.data.status === 401) {
            throw new Error('Invalid Token');
          }
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
  }

  function handleDelete(event, file) {
    props.onDelete(event, file);
    toast.info('Image Deleted Successfully!');
    setViewerImage();
  }

  return (
    <div className="main-viewer">
      <div
        className={`file-explorer ${
          !showThumbnails ? 'file-explorer-collapsed' : ''
        }`}
      >
        <div
          className={`toggle-explorer ${
            !showThumbnails ? 'toggle-explorer_open' : ''
          }`}
          onClick={() => setShowThumbnails(prev => !prev)}
        >
          {showThumbnails ? (
            <FaChevronLeft
              style={{ height: '30px', width: '30px', marginRight: '10px' }}
            />
          ) : (
            <FaChevronRight
              style={{ height: '30px', width: '30px', marginRight: '10px' }}
            />
          )}
        </div>

        <button onClick={() => props.setShow(true)} className="upload-button">
          <svg
            fill="#000"
            width="20px"
            height="20px"
            viewBox="0  0  24  24"
            id="plus"
            data-name="Flat Line"
            xmlns="http://www.w3.org/2000/svg"
            class="icon flat-line"
          >
            <path
              id="primary"
              d="M5,12H19M12,5V19"
              style={{
                fill: 'none',
                stroke: 'white',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                strokeWidth: 2,
              }}
            />
          </svg>
          <span style={{ display: 'inline-block' }}>New</span>
        </button>
        {props.displayProgressBar ? (
          <ProgressBar progressValue={props.progressValue} />
        ) : null}
        <div className="file-container">
          {allImageName.map((file, i) => {
            return (
              <div className="thumbnail-container">
                <img
                  className="thumbnail"
                  onClick={handleClick}
                  style={{
                    backgroundImage: allImagesLinks[file.name + file.fileId]
                      ? `url(${allImagesLinks[file.name + file.fileId]})`
                      : 'none',
                  }}
                  key={i}
                  id={i}
                />
                <div className="file-actions">
                  <p className="thumbnail-filename">
                    {file.name + '.' + file.format}
                  </p>
                  <RiDeleteBin6Fill
                    onClick={event => handleDelete(event, file)}
                    style={{
                      marginLeft: 'auto',
                      position: 'relative',
                      right: '0px',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="viewer-container"
        style={{ marginLeft: showThumbnails ? undefined : '20px' }}
      >
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
