import React, { useEffect } from 'react';
import OpenSeadragon from 'openseadragon';
import './OpenSeadragon.css';
import { config } from 'components/Config/config';
import constants from './constants';

function OpenSeadragonViewer({
  imageName,
  imageUrl,
  info,
  format,
  outer,
  email,
}) {
  let viewer;
  useEffect(() => {
    if (constants.SIMPLE_IMAGE_FORMATS.includes(format)) {
      viewer = OpenSeadragon({
        id: 'openseadragon-viewer',
        prefixUrl: `${constants.OSD_PREFIX_URL}`,
        tileSources: {
          type: 'image',
          url: imageUrl,
          buildPyramid: false,
        },
        animationTime: 0.5,
        blendTime: 0.1,
        constrainDuringPan: true,
        maxZoomPixelRatio: 2,
        minZoomLevel: 1,
        visibilityRatio: 1,
        zoomPerScroll: 2,
        showNavigator: true,
        ajaxWithCredentials: true,
        sequenceMode: true,
        crossOriginPolicy: 'Anonymous',
      });
    } else {
      viewer = OpenSeadragon({
        id: 'openseadragon-viewer',
        prefixUrl: `${constants.OSD_PREFIX_URL}`,
        tileSources: {
          width: 29164,
          height: 8592,
          tileSize: 4096,
          tileOverlap: 0,
          getTileUrl: function (level, x, y) {
            if (info[level + '/' + x + '_' + y]) {
              const _dir = imageName.name.split('.')[0];
              const baseDir = _dir + '/temp/' + _dir + '_files/';
              const token = JSON.parse(localStorage.getItem('dfs-user'))?.token;

              return `${config.BASE_URL}/link/pyramid/${email}?baseDir=${baseDir}&level=${level}&x=${x}&y=${y}&token=${token}`;
            }
          },
        },
        animationTime: 0.5,
        blendTime: 0.1,
        constrainDuringPan: true,
        maxZoomPixelRatio: 2,
        minZoomLevel: 1,
        visibilityRatio: 1,
        zoomPerScroll: 2,
        showNavigator: true,
        ajaxWithCredentials: true,
        sequenceMode: true,
        crossOriginPolicy: 'Anonymous',
      });
    }
    return () => {
      viewer && viewer.destroy();
    };
  }, [imageUrl, outer]);

  return (
    <div>
      {/* <button onClick={takeSS} id="print-view" >Print View</button> */}
      <div id="openseadragon-viewer"></div>
    </div>
  );
}

export default OpenSeadragonViewer;
