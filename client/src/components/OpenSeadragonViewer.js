import React, {useState,useEffect} from "react";
import OpenSeadragon from "openseadragon";
import './OpenSeadragon.css';
import GeoTIFF from "geotiff";
import GeoTIFFTileSource from './GeoTIFFTileSource'

// GeoTIFFTileSource(OpenSeadragon);

function OpenSeadragonViewer({image,imageUrl}) {
  
      useEffect(() => {
        let viewer =OpenSeadragon({
          id: 'openseadragon-viewer',
          prefixUrl:'openseadragon-images/' ,
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
          crossOriginPolicy: "Anonymous",
          tileSources: {
              type: 'image',
              url:  imageUrl,
              buildPyramid: false
          }
        });
        // let tiffTileSources = OpenSeadragon.GeoTIFFTileSource.getAllTileSources(imageUrl);
        // tiffTileSources.then(ts=>viewer.open(ts));  
        return () => {
          viewer && viewer.destroy();
        };
        
      }, [imageUrl]);

    
      
      function takeSS(){
        var current_view = document.getElementsByTagName("canvas");
        if (current_view){
          console.log(current_view.length);
          var my_view = current_view[0];
          var img = my_view.toDataURL("image/png");
          const link = document.createElement('a')
          link.href = img
          link.download = image
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



// useEffect(() => {
//   let viewer;
  
//   const loadGeoTIFF = async (tiffUrl) => {
//     // const response = await fetch(tiffUrl);
//     // const arrayBuffer = await response.arrayBuffer();
//     // const tiff = await fromUrl(tiffUrl);
//     const tiff = await fromUrl(props.imageUrl, { byteOrder: 1 });
//     const image = await tiff.getImage();
//     const width = image.getWidth();
//     const height = image.getHeight();
//     const tileSource = new OpenSeadragon.GeoTIFFTileSource(image, width, height);
//     return tileSource;
//   };

//   const initializeViewer = async () => {
//     const tileSource = await loadGeoTIFF(props.imageUrl);

//     viewer = OpenSeadragon({
//       id: "openseadragon-viewer",
//       prefixUrl: "openseadragon-images/",
//       tileSources: [tileSource],
//       animationTime: 0.5,
//       blendTime: 0.1,
//       constrainDuringPan: true,
//       maxZoomPixelRatio: 2,
//       minZoomLevel: 1,
//       visibilityRatio: 1,
//       zoomPerScroll: 2,
//       showNavigator: true,
//       crossOriginPolicy: "Anonymous",
//     });
//   };

//   initializeViewer();

//   return () => {
//     viewer && viewer.destroy();
//   };
// }, [props.imageUrl]);

