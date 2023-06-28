import React, { useEffect, useState } from "react";
import axios, { all } from 'axios';
import OpenSeadragonViewer from "./OpenSeadragonViewer";
import './RenderFile.css'
import BarLoader from "react-spinners/BarLoader";

function RenderFile(props) {
    const [viewerImage,setViewerImage] =useState();
    const [imageName,setImageName] =useState();
    const [allImages,setAllImages] = useState([]);
    const [loading,setLoading] = useState(false);
    const isFirstRender = React.useRef(true);

    useEffect(()=>{
        console.log("Getting image links")
        console.log(props);
        console.log(isFirstRender.current);
        if(isFirstRender.current){
            getAllImageLinks();
            console.log(allImages);
            if (props.info.length > 0) {
                isFirstRender.current = false;
            }
            return;
        }else{
            let imageObj = { imageName: props.currFile };
            axios.get("http://localhost:5000/getURL/"+props.email, { params: imageObj })
            .then((response) => response.data.image)
            .then((image) => {
                setAllImages((prevValue) => [...prevValue, image]);
            })
            .catch((error) => {
                console.log(error);
                return null;
            });
            console.log(allImages);
        }
    },[props.info]);

    async function getAllImageLinks() {
        try {
            const response = await Promise.all(
                props.info.map((image) => {
                    let imageObj = { imageName: image };
                    return axios.get("http://localhost:5000/getURL/"+props.email, { params: imageObj })
                        .then((response) => response.data.image)
                        .catch((error) => {
                            console.log(error);
                            return null;
                        });
                })
            );
            setAllImages(response);
            console.log(allImages)
        } catch (error) {
            console.log(error);
        }
    }

    function handleClick(e){
        console.log(allImages);
        let num = e.target.id;
        setViewerImage(allImages[num]);
        setImageName(props.info[num]);
    }
   
    return(
       <div className="render-file-container">
         <div className="button-container">
                {props.info.map((file, i) => {
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
                        <p id="image-name">{file}</p>
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


