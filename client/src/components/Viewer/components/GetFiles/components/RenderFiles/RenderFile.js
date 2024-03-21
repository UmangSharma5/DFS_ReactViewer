// library imports
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FaChevronLeft, FaChevronRight, FaPlus, FaAngleDoubleRight, FaMinusCircle } from 'react-icons/fa';
import { RiDeleteBin6Fill } from 'react-icons/ri';
import { TiTick } from "react-icons/ti";
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import JSZip from "jszip";

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
  const [selectedFiles, setFilesSelected] = useState([])
  const [showDatasetModal, setShowDatasetModal] = useState(false)

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

  const handleSelect = (e, idx) => {
    console.log("selected")
    e.currentTarget.parentNode.classList.toggle('green')
    if(!e.currentTarget.parentNode.classList.contains('green')) {
      setFilesSelected(selectedFiles.filter(index => index != idx))
    }else {
      setFilesSelected([...selectedFiles, idx])
    }
  }

  const modalRemove = (i) => {
    let file = document.querySelectorAll('.thumbnail-select')[i]
    file.classList.toggle('green')
    setFilesSelected(selectedFiles.filter(index => index != i))
  }

  const handleCreateDataset = (toggle) => {
    if(toggle == 0){
      document.querySelector('.dataset-button').style.display = "none";
      document.querySelector('.proceed-button').style.display = "block";
      document.querySelector('.cancel-button').style.display = "block";
    }
    else{
      document.querySelector('.dataset-button').style.display = "block";
      document.querySelector('.proceed-button').style.display = "none";
      document.querySelector('.cancel-button').style.display = "none";
    }
    document.querySelector('.upload-button').classList.toggle('disabled');

    let delete_btns = document.querySelectorAll('.file-delete')
    for(let i = 0;i<delete_btns.length;i++) {
      let element = delete_btns[i];
      element.classList.toggle('disabled')
    };

    let selects = document.getElementsByClassName('thumbnail-select');
    for(let i = 0;i<selects.length;i++) {
      let element = selects[i];
      if(element.style.display == "none") {
        element.style.display = "flex";
      } else {
        element.style.display = "none";
      }
      element.classList.remove('green')
    };
    setFilesSelected([])
  }

  return (
    <div className="main-viewer">
    <Modal
        show={showDatasetModal}
        onHide={e => setShowDatasetModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Create New Dataset</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <label for="NameDataset" className="form-label" style={{fontStyle: 'italic'}}>
              Name of the dataset
            </label>
            <input
              className="form-control"
              type="text"
              id="NameDataset"
            />
          </div>
          <div className='mb-3'>
            <span style={{fontStyle: 'italic'}}>Files in the Dataset</span>
            <br></br>
            {selectedFiles.map((i, idx) => {
              return (
                <div>
                <div className='dataset-files' style={{fontWeight: 'bold'}}>
                <span>{idx+1}</span>
                <span style={{
                  flex: 1,
                  textAlign: 'center',
                }}>{allImageName[i].name + '.' + allImageName[i].format}</span>
                <FaMinusCircle style={{
                  flex: 0.2,
                  fontSize: '1.2rem',
                  color: 'red'
                }} onClick={e => modalRemove(i)}/>
              </div>
              <hr style={{margin: '10px'}}></hr>
              </div>
              )
            })}
          </div>
        </Modal.Body>
        <Modal.Footer style={{margin: "auto"}}>
          <Button
            className='upload-button'
            onClick={e => {
              setShowDatasetModal(false);
            }}
            disabled = {selectedFiles.length == 0}
          >
            Create
          </Button>
        </Modal.Footer>
      </Modal>
      <div
        className={`file-explorer ${
          !showThumbnails ? 'file-explorer-collapsed' : ''
        }`}
      >
        
        
        <div className='buttons'>
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
          <button className="upload-button dataset-button" style={{display: 'block'}}
            onClick={e => handleCreateDataset(0)}
          >
          <span style={{ display: 'inline-block' }}>Create Dataset</span>
          </button>
          <button className="proceed-button" style={{display: 'none'}}
            onClick={e => setShowDatasetModal(true)}
          >
          <span style={{ display: 'inline-block' }}>Proceed</span>
          </button>
          <button className="cancel-button" style={{display: 'none'}}
            onClick={e => handleCreateDataset(1)}
          >
          <span style={{ display: 'inline-block' }}>Cancel</span>
          </button>
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
        </div>
        <div className='files-selected'>
            <div className='number-files'>
              {selectedFiles.length}
            </div>
            <span style={{color: 'white', fontWeight: 'bold'}}>Files Selected</span>
            <FaAngleDoubleRight style={{color: 'white', fontSize: '1.5rem'}}
              onClick={e => setShowDatasetModal(true)}
            />
        </div>
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
                  <div className="thumbnail-select" style={{display: 'none'}}>
                    <TiTick style={{color: 'white', opacity: 1}} onClick={e => handleSelect(e, i)} />
                  </div>
                  <div 
                    className='file-delete'
                    onClick={event => handleDelete(event, file)}
                    style={{
                      marginLeft: 'auto',
                      // position: 'relative',
                      // right: '0px',
                      display: 'flex',
                      alignItems: 'flex-start',
                    }}            
                  >
                  <RiDeleteBin6Fill
                    
                  />
                  </div>
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
