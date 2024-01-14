import { useState } from 'react';
import { FaRegImages } from 'react-icons/fa';
import { AiFillCloseCircle } from 'react-icons/ai';
import './statusInfo.css';
import BootstrapProgressBar from './bootstrapProgressBar';

const StatusInfo = props => {
  const [showThumbnails, setShowThumbnails] = useState(false);
  console.log(props.uploadPercentage);

  return (
    <div>
      {showThumbnails ? (
        <div className="thumbnail-box">
          {Object.keys(props.uploadPercentage).map(key => {
            if (props.uploadPercentage[key].dzsave === -1) {
              return null;
            }
            return props.uploadPercentage[key].dzsave !== 100 ? (
              <div key={`dzsave-progress-${key}`}>
                <p>DZSave in progress... {key}</p>
                <BootstrapProgressBar
                  key={`dzsave-progress-${key}`}
                  percentage={props.uploadPercentage[key].dzsave}
                />
              </div>
            ) : props.uploadPercentage[key].minio !== 100 ? (
              <div key={`minio-progress-${key}`}>
                <p>DZsave complete</p>
                <p>Minio upload in progess... {key}</p>
                {console.warn(props.uploadPercentage[key])}
                <BootstrapProgressBar
                  key={`minio-progress-${key}`}
                  percentage={props.uploadPercentage[key].minio}
                />
              </div>
            ) : (
              <div key={`uploaded-${key}`}>Uploaded {key}</div>
            );
          })}
        </div>
      ) : (
        <p></p>
      )}
      {showThumbnails ? (
        <AiFillCloseCircle
          onClick={() => {
            setShowThumbnails(!showThumbnails);
          }}
          style={{ height: '30px', width: '30px', marginRight: '10px' }}
        />
      ) : (
        <FaRegImages
          onClick={() => {
            setShowThumbnails(!showThumbnails);
          }}
          style={{
            height: '30px',
            width: '30px',
            marginRight: '10px',
            marginLeft: '10px',
          }}
        />
      )}
    </div>
  );
};

export default StatusInfo;
