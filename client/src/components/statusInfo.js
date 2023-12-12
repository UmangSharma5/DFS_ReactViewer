import React, { useState } from 'react';
import { FaRegImages } from 'react-icons/fa';
import { AiFillCloseCircle } from 'react-icons/ai';
import './statusInfo.css';
import BootstrapProgressBar from './bootstrapProgressBar';
// import ProgressBar from 'react-bootstrap/ProgressBar';

const StatusInfo = props => {
  const [showThumbnails, setShowThumbnails] = useState(false);

  return (
    <div>
      {console.log('statusinfo files props --->', props.uploadPercentage)}
      {showThumbnails ? (
        <div className="thumbnail-box">
          {Object.keys(props.uploadPercentage).map(key => {
            return props.uploadPercentage[key] !== 100 ? (
              <div key={`progress-${key}`}>
                <p>Connected {key}</p>
                <BootstrapProgressBar
                  key={key}
                  percentage={props.uploadPercentage[key]}
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
