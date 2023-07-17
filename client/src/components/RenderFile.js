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
    const isFirstRender = React.useRef(true);

    useEffect(()=>{
        setAllImageName(props.info);
        console.log(props);
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
                axios.get(config.BASE_URL+"/getURL/"+props.email, { params: imageObj })
                .then((response) => response.data.image)
                .then((image) => {
                    setAllImages((prevValue) => [...prevValue, image]);
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
                    let imageObj = { imageName: image };
                    return axios.get(config.BASE_URL+"/getURL/"+props.email, { params: imageObj })
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

    function handleClick(e){
        let num = e.target.id;
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
                                <p id="image-name">{file}</p>
                                <button className="del-btn"  value={file} onClick={event => handleDelete(event,file)}> <i className="bi bi-archive"></i></button>
                            </div>
                        </div> 
                    );
                })}
            </div>
            <div className="viewer-container">
                {viewerImage ? <OpenSeadragonViewer imageUrl={viewerImage} imageName={imageName} /> : <p>Select an image to view</p>}
            </div> 
        </div>
    )
}

export default RenderFile;


    