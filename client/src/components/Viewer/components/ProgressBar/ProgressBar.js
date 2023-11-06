import React from 'react'
import './ProgressBar.css'

function ProgressBar(props) {

  return (
    <div className='progress-container'>
        <progress className="uploadProgressBar" value={props.progressValue} max="100" ></progress>
        <label className='uploadProgressBarLabel' >{props.progressValue === 100 ? 'Upload Completed!' : `${props.progressValue}%`}</label>
    </div>
  )
}

export default ProgressBar
