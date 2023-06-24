import React, {useState,useEffect} from "react";
import OpenSeadragon from "openseadragon";
import './OpenSeadragon.css'

function OpenSeadragonViewer(props) {
  
      useEffect(() => {
        const viewer = OpenSeadragon({
          id: 'openseadragon-viewer',
          prefixUrl:'openseadragon-images/' ,
          tileSources: [{
            type: 'image',
            url: props.imageUrl
          }],
          animationTime: 0.5,
          blendTime: 0.1,
          constrainDuringPan: true,
          maxZoomPixelRatio: 2,
          minZoomLevel: 1,
          visibilityRatio: 1,
          zoomPerScroll: 2,
          showNavigator:  true,
          crossOriginPolicy: "Anonymous"
        });
    
        return () => {
          viewer && viewer.destroy();
        };
      }, [props.imageUrl]);   

      
      
      function takeSS(){
        var current_view = document.getElementsByTagName("canvas");
        if (current_view){
          console.log(current_view.length);
          var my_view = current_view[0];
          var img = my_view.toDataURL("image/png");
          const link = document.createElement('a')
          link.href = img
          link.download = props.imageName
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        }
      }

    return ( 
      <div>
        <div id="openseadragon-viewer" style={{ height:'500px'}} ></div>
        <button onClick={takeSS} id="print-view" >Print View</button>
      </div>
    )
}

export default OpenSeadragonViewer;

