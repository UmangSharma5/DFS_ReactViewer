import React, { useEffect, useState } from "react";
import axios, { all } from 'axios';
import OpenSeadragonViewer from "./OpenSeadragonViewer";
import './RenderFile.css'
import BarLoader from "react-spinners/BarLoader";
import { config } from "../config";



function RenderFile(props) {
    const [viewerImage,setViewerImage] =useState();
    const [imageName,setImageName] =useState();
    const [allImages,setAllImages] = useState([]);
    const [allImageName,setAllImageName] = useState([]);
    const [previousImageNames, setPreviousImageNames] = useState(null)
    const [format,setFormat] = useState();
    const [pyramid,setPyramid] = useState({});
    const isFirstRender = React.useRef(true);
    const [outer,setOuter] = useState();

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

              removedImageNames.forEach((removedImageName) => {
                const indexToRemove = allImageName.findIndex((imageName) =>
                    imageName.name === removedImageName.name && imageName.format === removedImageName.format)

                if (indexToRemove !== -1) {
                  setAllImages((prevImages) =>
                    prevImages.filter((_, index) => index !== indexToRemove)
                  )

                  setAllImageName((prevImageNames) =>
                    prevImageNames.filter((_, index) => index !== indexToRemove)
                  )
                }
              })
            }

            if (newImageNames.length > 0) {
              console.log('New Images found:', newImageNames)
              newImageNames.forEach((newImage) => {
                getImageLink(newImage)
              })
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
        if(props.currFile != null){
            if(isFirstRender.current){
                console.log("Getting image links");
                getAllImageLinks();
                if (props.info.length > 0) {
                    isFirstRender.current = false;
                }
                return;
            }else{
                let imageObj = { imageName: props.currFile };
                axios.get(config.BASE_URL+"/getURL/"+props.email,
                {
                    params: imageObj ,
                    headers: {
                        'authorization': 'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
                    }
                })
                .then((response) => {
                    setAllImages((prevValue) => [...prevValue, response.data.image]);
                })
                .catch((error) => {
                    console.log(error);
                    return null;
                });
            }
        }else{
            setAllImages((prevFilesLink) => {
                return prevFilesLink.filter((link, index) => {
                  return index !== allImageName.indexOf(props.deletedFileName);
                });
            });
        }
    },[props.info]);

    async function getAllImageLinks() {
        try {
            const response = await Promise.all(
                props.info.map((image) => {
                    let imageObj = { imageName: image.name,imageFormat:image.format};
                    return axios.get(config.BASE_URL+"/getURL/"+props.email,
                        { 
                            params: imageObj,
                            headers: {
                                'authorization': 'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
                            }
                        })
                        .then((response) => response.data.image)
                        .catch((error) => {
                            console.log(error);
                            return null;
                        });
                })
            );
            setAllImages(response);
        } catch (error) {
            console.log(error);
        }
    }

    async function getImageLink(image) {
      try {
        let imageObj = { imageName: image.name, imageFormat: image.format }
        const response = await axios
          .get(config.BASE_URL + '/getURL/' + props.email, {
            params: imageObj,
            headers: {
              authorization:
                'Bearer ' +
                JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
            },
          })
          .then((response) => response.data.image)
          .catch((error) => {
            console.log(error)
          })
        const imageLink = response
        if (imageLink) {
          setAllImages((prevImages) => [...prevImages, imageLink])
          setAllImageName((prevImageNames) => [...prevImageNames, image])
        }
      } catch (error) {
        console.log(error)
      }
    }

    function handleClick(e){
        let num = e.target.id;
        const imagetype = props.info[num].format;
        const dir_ = props.info[num].name.split('.')[0]
        if(imagetype != 'png' && imagetype != 'jpeg'){
            let imageObj = { baseDir: dir_+"/temp/"+dir_+"_files/"};
            axios.get(config.BASE_URL+"/getURL/imagePyramid/"+props.email,
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
        console.log(allImages[num]);
        setViewerImage(allImages[num]);
        setImageName(props.info[num]);
    }

    function handleDelete(event,file){
        props.onDelete(event,file);
        setViewerImage();
    }

    return(
       <div className="render-file-container">
         <div className="button-container">
                {allImageName.map((file, i) => {
                    const buttonStyles = {
                        margin: '10px',
                        backgroundImage:allImages[i] ? `url(${allImages[i]})` : 'none',
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
                        <div>
                            <img onClick={handleClick} style={buttonStyles} key={i} id={i} />
                            <div className="name-del">
                                <p id="image-name">{file.name.split('.')[0]+'.'+ file.format}</p> 
                                <button className="del-btn"  value={file} onClick={event => handleDelete(event,file)}> <i className="bi bi-archive"></i></button>
                            </div>
                        </div> 
                    );
                })}
            </div>
            <div className="viewer-container">
                {viewerImage ? <OpenSeadragonViewer imageUrl={viewerImage} imageName={imageName} info={pyramid} format={format} outer={outer}/> : <p>Select an image to view</p>}
            </div> 
        </div>
    )
}

export default RenderFile;


    
