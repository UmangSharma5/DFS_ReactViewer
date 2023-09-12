import React from 'react'
import './ProgressBar.css'

function ProgressBar(props) {

  return (
    <div className='progress-container'>
        <progress id="uploadProgressBar" value="0" max="100" style={{ display: (props.display ? "inline" : "none") }}></progress>
        <label id='uploadProgressBarLabel' style={{ display: (props.display ? "inline" : "none") }}>{props.progressValue === 100 ? 'Upload Completed' : `${props.progressValue}%`}</label>
    </div>
  )
}

export default ProgressBar
