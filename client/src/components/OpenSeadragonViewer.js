import React, {useState,useEffect} from "react";
import OpenSeadragon from "openseadragon";
import './OpenSeadragon.css';

function OpenSeadragonViewer({imageName,imageUrl}) {
        const imageType = imageName.split('.').pop();



        console.log(imageUrl);
        useEffect(() => {
          let viewer =OpenSeadragon({
            id: 'openseadragon-viewer',
            prefixUrl:' https://cdn.jsdelivr.net/npm/openseadragon@2.4/build/openseadragon/images/',
            tileSources: function() {
              if(imageType === 'png' || imageType === 'jpeg'){
                return{
                  type: 'image',
                  url:  imageUrl,
                  buildPyramid: false
                };
              } else{
                return {
                  width: 28480,
                  height: 28760,
                  tileSize: 512,
                  tileOverlap: 0,
                  // getTileUrl: function(level, x, y) {
                  //   if(props.info[level+"/"+x+"_"+y] != undefined){
                  //     let signature = props.info[level+"/"+x+"_"+y][0];
                  //     let date = props.info[level+"/"+x+"_"+y][1];

                      // console.log("https://play.min.io:9000/umangsstudentsiiitacin/test/tmp/bigimage1_files/"+level+"/"+x+"_"+y+".jpeg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=Q3AM3UQ867SPQQA43P2F%2F20230729%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date="+date+"&X-Amz-Expires=180000&X-Amz-SignedHeaders=host&X-Amz-Signature="+signature)
       
                  //     return ["https://play.min.io:9000/umangsstudentsiiitacin/test/tmp/bigimage1_files/"+level+"/"+x+"_"+y+".jpeg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=Q3AM3UQ867SPQQA43P2F%2F20230729%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date="+date+"&X-Amz-Expires=180000&X-Amz-SignedHeaders=host&X-Amz-Signature="+signature].join('');
                  //   }
                  // }
                }
              }
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
        if(extension === 'tif') extension ='png';
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

