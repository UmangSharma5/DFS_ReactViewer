import React, {useState,useEffect} from "react";
import OpenSeadragon from "openseadragon";
import './OpenSeadragon.css';

function OpenSeadragonViewer({imageName,imageUrl}) {
  
        useEffect(() => {
          let viewer =OpenSeadragon({
            id: 'openseadragon-viewer',
            prefixUrl:' https://cdn.jsdelivr.net/npm/openseadragon@2.4/build/openseadragon/images/',
            tileSources: {
                type: 'image',
                url:  imageUrl,
                buildPyramid: false
            },
            animationTime: 0.5,
            blendTime: 0.1,
            constrainDuringPan: true,
            maxZoomPixelRatio: 2,
            minZoomLevel: 1,
            visibilityRatio: 1,
            zoomPerScroll: 2,
            showNavigator:  true,
            ajaxWithCredentials: true,
            sequenceMode:true,
            crossOriginPolicy: "Anonymous"
          });
          return () => {
            viewer && viewer.destroy();
          };
          
        }, [imageUrl]);

      function takeSS(){
        let extension = imageName.split('.').pop();
        var current_view = document.getElementsByTagName("canvas");
        if (current_view){
          console.log(current_view.length);
          var my_view = current_view[0];
          var img = my_view.toDataURL("image/"+extension);
          const link = document.createElement('a')
          link.href = img
          link.download = imageName
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        }
      }

    return ( 
      <div>
        <button onClick={takeSS} id="print-view" >Print View</button>
        <div id="openseadragon-viewer" ></div>
      </div>
    )
}

export default OpenSeadragonViewer;

