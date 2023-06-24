import React, { useEffect, useState } from "react";
import axios, { all } from 'axios';
import OpenSeadragonViewer from "./OpenSeadragonViewer";
import './RenderFile.css'

function RenderFile(props) {
    const [viewerImage,setViewerImage] =useState();
    const [imageName,setImageName] =useState();
    const [allImages,setAllImages] = useState([]);
    
    useEffect(()=>{
        getAllImageLinks();
    },[]);

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
                        <img onClick={handleClick} style={buttonStyles} key={i} id={i} />
                    );
                })}
            </div>
            <div className="viewer-container">
                {viewerImage && <OpenSeadragonViewer imageUrl={viewerImage} imageName={imageName}/>}
            </div>
        </div>
    )
}

export default RenderFile;


