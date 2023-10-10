import React, { useEffect, useState } from "react";
import axios, { all } from 'axios';
import OpenSeadragonViewer from "./OpenSeadragonViewer";
import './RenderFile.css'
import { config } from "../config";
import { toast } from 'react-toastify'
import { FaRegImages } from 'react-icons/fa'
import { AiFillCloseCircle } from 'react-icons/ai'


function RenderFile(props) {
    const [viewerImage,setViewerImage] =useState();
    const [imageName,setImageName] =useState();
    const [allImagesLinks,setAllImagesLinks] = useState({});
    const [allImageName,setAllImageName] = useState([]);
    const [previousImageNames, setPreviousImageNames] = useState(null)
    const [format,setFormat] = useState();
    const [pyramid,setPyramid] = useState({});
    const isFirstRender = React.useRef(true);
    const [outer,setOuter] = useState();
    const [isLoding, setLoading] = useState(false)
    const [showThumbnails,setShowThumbnails] = useState(true)

    useEffect(() => {
        const refreshInterval = setInterval(() => {
        props.getFiles()
      }, config.REFRESH_TIME)
    return () => clearInterval(refreshInterval)
    }, [])

    useEffect(()=>{    
        if (props.info.length > 0 && !isFirstRender.current && previousImageNames != null) {
            const newImageNames = props.info.filter(newImage => {
                return !previousImageNames.some(oldImage => 
                    oldImage.name === newImage.name && oldImage.format === newImage.format
                );
            });

            const removedImageNames = previousImageNames.filter((oldImage) => {
              return !props.info.some(
                (newImage) =>
                  oldImage.name === newImage.name &&
                  oldImage.format === newImage.format
              )
            })

            if (removedImageNames.length > 0) {
              console.log('Removed Images found:', removedImageNames)

              const updatedImageLinks = { ...allImagesLinks }

              removedImageNames.forEach((removedImageName) => {
                const indexToRemove = allImageName.findIndex((imageName) =>
                    imageName.name === removedImageName.name && imageName.format === removedImageName.format)

                const { name, format } = removedImageName

                if (indexToRemove !== -1 && updatedImageLinks.hasOwnProperty(name)) {
                  
                  allImageName.splice(indexToRemove, 1)
                  delete updatedImageLinks[name]
                }
              })
              setAllImagesLinks(updatedImageLinks)
            }

            if (newImageNames.length > 0) {
              console.log('New Images found:', newImageNames)
              
              const reversedImageNames = [...newImageNames].reverse()

              reversedImageNames.forEach((newImage) => {
                getImageLink(newImage)
              })
              toast.success('Upload Completed!')
            }
        }
        else
        {
            setAllImageName(props.info)
        }

        setPreviousImageNames(props.info)
        if(isFirstRender.current){
            console.log("Getting image links");
            getAllImageLinks();
            if (props.info.length > 0) {
                isFirstRender.current = false;
            }
            return;
        }
    },[props.info]);

    async function getAllImageLinks() {
        try {
          const responses = await Promise.all(
            props.info.map((image) => {
              const imageObj = { imageName: image.name, imageFormat: image.format };
              return axios.get(config.BASE_URL + "/getURL/" + props.email, {
                params: imageObj,
                headers: {
                  Authorization: 'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.token,
                },
              });
            })
          );

          const imageLinks = {};
          responses.forEach((response) => {
            let name = response.data.imageName.split('.')[0];
            let link = response.data.imageUrl;
            imageLinks[name] = link;
          });
      
          setAllImagesLinks(imageLinks);
        } catch (error) {
          console.log(error);
        }
    }

    async function getImageLink(image) {
      try {
        const imageObj = { imageName: image.name, imageFormat: image.format }
        const response = await axios.get(config.BASE_URL + '/getURL/' + props.email, {
            params: imageObj,
            headers: {
              authorization:'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
            },
          })
          .then((response) => {
              let name = response.data.imageName.split('.')[0]
              let link = response.data.imageUrl

              allImagesLinks[name] = link;
              allImageName.unshift(image)
          })
          .catch((error) => {
            console.log(error)
          })
      } catch (error) {
        console.log(error)
      }
    }

    async function handleClick(e){
        setLoading(true)
        let num = e.target.id;
        const imagetype = allImageName[num].format;
        const dir_ = allImageName[num].name.split('.')[0]
        if(imagetype != 'png' && imagetype != 'jpeg'){
            let imageObj = { baseDir: dir_+"/temp/"+dir_+"_files/"};
            await axios.get(config.BASE_URL+"/getURL/imagePyramid/"+props.email,
                {
                    params: imageObj,
                    headers: {
                        'authorization': 'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
                    }
                })
                .then((response) => {
                    setOuter(response.data.outer);
                    return response.data.image;
                })
                .then((image) => {
                    setPyramid(image);
                })
                .catch((error) => {
                    console.log(error);
                    return null;
                });
        }
        setFormat(imagetype);
        setViewerImage(allImagesLinks[allImageName[num].name.split('.')[0]])
        setImageName(allImageName[num])
        setLoading(false);
    }

    function handleDelete(event,file){
        props.onDelete(event,file);
        toast.info("Image Deleted Successfully!")
        setViewerImage();
    }

    return(
       <div className="render-file-container">
         {showThumbnails ? <div className="button-container">
                {allImageName.map((file, i) => {
                    const buttonStyles = {
                        margin: '10px',
                        backgroundImage:allImagesLinks[file.name] ? `url(${allImagesLinks[file.name]})` : 'none',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: 'cover',
                        color: '#333',
                        objectFit: 'cover',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        height: '150px',
                        width: '150px', 
                    };
                    return (
                        <div className='thumbnail-container'>
                            <img onClick={handleClick} style={buttonStyles} key={i} id={i} />
                            <div className="name-del">
                                <p className="image-name">{file.name + '.' + file.format}</p> 
                                <button className="del-btn"  value={file} onClick={event => handleDelete(event,file)}> <i className="bi bi-archive"></i></button>
                            </div>
                        </div> 
                    );
                })}
            </div> : <></>}
            {showThumbnails ?  <AiFillCloseCircle title="Hide Thumbnails" onClick={() => {setShowThumbnails(!showThumbnails)}} style={{height: '30px',width: '30px',marginRight: '10px'}}/> : <FaRegImages title="Show Thumbnails" onClick={() => {setShowThumbnails(!showThumbnails)}} style={{height: '30px',width: '30px',marginRight: '10px',marginLeft:'10px'}}/>}
            <div className="viewer-container">
                <p id="viewer-image-name">{viewerImage ? imageName.name+"."+imageName.format : ' '}</p>
                {viewerImage ? <OpenSeadragonViewer imageUrl={viewerImage} imageName={imageName} info={pyramid} format={format} outer={outer}/> : <p>Select an image to view</p>}
            </div> 
        </div>
    )
}

export default RenderFile;


    
